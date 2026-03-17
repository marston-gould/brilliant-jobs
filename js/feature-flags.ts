// @ts-nocheck
/* ───────────────────────────────────────────────────────────
   feature-flags.js — Unified Feature Flag System (DO-003)
   CS-P1-005: PostHog-native flags with DB fallback.
   
   Usage:
     var enabled = await BJ.isFeatureEnabled('new_chat_ui');
     var variant = await BJ.getFeatureVariant('pricing_experiment');
   
   Priority chain:
     1. PostHog remote flags (if SDK loaded + flags fetched)
     2. DB feature_flags table (Supabase fallback)
     3. Default value (false)
   
   Supports: boolean flags, percentage rollout, plan gating,
   per-user targeting via PostHog or DB config.
   ─────────────────────────────────────────────────────────── */

(function() {
  'use strict';

  // ── Cache ──
  var _flagCache = {};
  var _cacheExpiry = {};
  var CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  var _posthogReady = false;
  var _posthogFlagsLoaded = false;

  // ── PostHog readiness detection ──
  function _waitForPostHog(timeoutMs) {
    timeoutMs = timeoutMs || 3000;
    return new Promise(function(resolve) {
      if (typeof posthog !== 'undefined' && posthog.__loaded) {
        _posthogReady = true;
        resolve(true);
        return;
      }
      var elapsed = 0;
      var interval = setInterval(function() {
        elapsed += 100;
        if (typeof posthog !== 'undefined' && posthog.__loaded) {
          clearInterval(interval);
          _posthogReady = true;
          resolve(true);
        } else if (elapsed >= timeoutMs) {
          clearInterval(interval);
          resolve(false);
        }
      }, 100);
    });
  }

  // ── PostHog feature flag check ──
  function _checkPostHog(flagKey) {
    if (!_posthogReady || typeof posthog === 'undefined') return null;
    try {
      var result = posthog.isFeatureEnabled(flagKey);
      if (typeof result === 'boolean') return result;
      if (typeof result === 'string') return result; // multivariate
      return null; // undefined = not loaded yet
    } catch (e) {
      if (typeof reportError === 'function') reportError('feature-flags:posthog', e);
      return null;
    }
  }

  // ── PostHog multivariate variant ──
  function _getPostHogVariant(flagKey) {
    if (!_posthogReady || typeof posthog === 'undefined') return null;
    try {
      var payload = posthog.getFeatureFlag(flagKey);
      return payload !== undefined ? payload : null;
    } catch (e) {
      if (typeof reportError === 'function') reportError('feature-flags:posthog-variant', e);
      return null;
    }
  }

  // ── DB fallback check ──
  function _checkDB(flagKey) {
    if (typeof loadSupabase !== 'function') return Promise.resolve(null);
    var sb = loadSupabase();
    if (!sb) return Promise.resolve(null);

    return sb
      .from('feature_flags')
      .select('enabled, rollout_pct, plan_gate, user_targets, metadata')
      .eq('id', flagKey)
      .maybeSingle()
      .then(function(res) {
        if (res.error || !res.data) return null;
        var row = res.data;

        // Simple boolean
        if (!row.rollout_pct && !row.plan_gate && !row.user_targets) {
          return row.enabled;
        }

        // Per-user targeting
        if (row.user_targets && typeof currentUser !== 'undefined' && currentUser) {
          var targets = Array.isArray(row.user_targets) ? row.user_targets : [];
          if (targets.indexOf(currentUser.id) !== -1) return row.enabled;
        }

        // Plan gating
        if (row.plan_gate && typeof currentUser !== 'undefined' && currentUser) {
          var userPlan = (currentUser.user_metadata || {}).plan || 'free';
          var allowedPlans = Array.isArray(row.plan_gate) ? row.plan_gate : [];
          if (allowedPlans.indexOf(userPlan) === -1) return false;
        }

        // Percentage rollout (deterministic hash)
        if (row.rollout_pct != null && row.rollout_pct < 100) {
          var userId = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : 'anonymous';
          var hash = _simpleHash(flagKey + ':' + userId);
          var bucket = hash % 100;
          return bucket < row.rollout_pct ? row.enabled : false;
        }

        return row.enabled;
      })
      .catch(function(e) {
        if (typeof reportError === 'function') reportError('feature-flags:db', e);
        return null;
      });
  }

  // ── Deterministic hash for rollout bucketing ──
  function _simpleHash(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + ch;
      hash = hash & hash; // Convert to 32-bit int
    }
    return Math.abs(hash);
  }

  // ── Main API: isFeatureEnabled ──
  async function isFeatureEnabled(flagKey, defaultValue) {
    if (typeof defaultValue === 'undefined') defaultValue = false;
    if (!flagKey) return defaultValue;

    // Check cache
    if (_flagCache.hasOwnProperty(flagKey) && _cacheExpiry[flagKey] > Date.now()) {
      return !!_flagCache[flagKey];
    }

    // 1. Try PostHog
    await _waitForPostHog(2000);
    var phResult = _checkPostHog(flagKey);
    if (phResult !== null) {
      _flagCache[flagKey] = phResult;
      _cacheExpiry[flagKey] = Date.now() + CACHE_TTL_MS;
      return !!phResult;
    }

    // 2. Try DB fallback
    var dbResult = await _checkDB(flagKey);
    if (dbResult !== null) {
      _flagCache[flagKey] = dbResult;
      _cacheExpiry[flagKey] = Date.now() + CACHE_TTL_MS;
      return !!dbResult;
    }

    // 3. Default
    return defaultValue;
  }

  // ── Main API: getFeatureVariant (multivariate) ──
  async function getFeatureVariant(flagKey, defaultValue) {
    if (typeof defaultValue === 'undefined') defaultValue = null;
    if (!flagKey) return defaultValue;

    // Check cache
    if (_flagCache.hasOwnProperty(flagKey) && _cacheExpiry[flagKey] > Date.now()) {
      return _flagCache[flagKey];
    }

    // 1. PostHog multivariate
    await _waitForPostHog(2000);
    var phVariant = _getPostHogVariant(flagKey);
    if (phVariant !== null) {
      _flagCache[flagKey] = phVariant;
      _cacheExpiry[flagKey] = Date.now() + CACHE_TTL_MS;
      return phVariant;
    }

    // 2. DB metadata.variant field
    if (typeof loadSupabase === 'function') {
      var sb = loadSupabase();
      if (sb) {
        try {
          var res = await sb
            .from('feature_flags')
            .select('enabled, metadata')
            .eq('id', flagKey)
            .maybeSingle();
          if (res.data && res.data.metadata && res.data.metadata.variant) {
            _flagCache[flagKey] = res.data.metadata.variant;
            _cacheExpiry[flagKey] = Date.now() + CACHE_TTL_MS;
            return res.data.metadata.variant;
          }
        } catch (e) {
          if (typeof reportError === 'function') reportError('feature-flags:variant-db', e);
        }
      }
    }

    return defaultValue;
  }

  // ── Invalidate cache (call after flag changes in admin) ──
  function invalidateFlags() {
    _flagCache = {};
    _cacheExpiry = {};
    if (_posthogReady && typeof posthog !== 'undefined' && posthog.reloadFeatureFlags) {
      posthog.reloadFeatureFlags();
    }
  }

  // ── Bootstrap: preload PostHog flags on page load ──
  function _bootstrap() {
    _waitForPostHog(5000).then(function(ready) {
      if (ready && typeof posthog !== 'undefined' && posthog.onFeatureFlags) {
        posthog.onFeatureFlags(function() {
          _posthogFlagsLoaded = true;
        });
      }
    });
  }

  // ── Export via BJ namespace ──
  if (typeof window.BJ !== 'undefined' && window.BJ.export) {
    window.BJ.export('isFeatureEnabled', isFeatureEnabled);
    window.BJ.export('getFeatureVariant', getFeatureVariant);
    window.BJ.export('invalidateFlags', invalidateFlags);
  }
  // Always expose on window for backward compat
  window.isFeatureEnabled = isFeatureEnabled;
  window.getFeatureVariant = getFeatureVariant;
  window.invalidateFlags = invalidateFlags;

  // Auto-bootstrap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bootstrap);
  } else {
    _bootstrap();
  }
})();
