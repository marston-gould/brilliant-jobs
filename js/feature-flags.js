(function() {
  "use strict";
  var _flagCache = {};
  var _cacheExpiry = {};
  var CACHE_TTL_MS = 5 * 60 * 1e3;
  var _posthogReady = false;
  var _posthogFlagsLoaded = false;
  function _waitForPostHog(timeoutMs) {
    timeoutMs = timeoutMs || 3e3;
    return new Promise(function(resolve) {
      if (typeof posthog !== "undefined" && posthog.__loaded) {
        _posthogReady = true;
        resolve(true);
        return;
      }
      var elapsed = 0;
      var interval = setInterval(function() {
        elapsed += 100;
        if (typeof posthog !== "undefined" && posthog.__loaded) {
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
  function _checkPostHog(flagKey) {
    if (!_posthogReady || typeof posthog === "undefined") return null;
    try {
      var result = posthog.isFeatureEnabled(flagKey);
      if (typeof result === "boolean") return result;
      if (typeof result === "string") return result;
      return null;
    } catch (e) {
      if (typeof reportError === "function") reportError("feature-flags:posthog", e);
      return null;
    }
  }
  function _getPostHogVariant(flagKey) {
    if (!_posthogReady || typeof posthog === "undefined") return null;
    try {
      var payload = posthog.getFeatureFlag(flagKey);
      return payload !== void 0 ? payload : null;
    } catch (e) {
      if (typeof reportError === "function") reportError("feature-flags:posthog-variant", e);
      return null;
    }
  }
  function _checkDB(flagKey) {
    if (typeof loadSupabase !== "function") return Promise.resolve(null);
    var sb = loadSupabase();
    if (!sb) return Promise.resolve(null);
    return sb.from("feature_flags").select("enabled, rollout_pct, plan_gate, user_targets, metadata").eq("id", flagKey).maybeSingle().then(function(res) {
      if (res.error || !res.data) return null;
      var row = res.data;
      if (!row.rollout_pct && !row.plan_gate && !row.user_targets) {
        return row.enabled;
      }
      if (row.user_targets && typeof currentUser !== "undefined" && currentUser) {
        var targets = Array.isArray(row.user_targets) ? row.user_targets : [];
        if (targets.indexOf(currentUser.id) !== -1) return row.enabled;
      }
      if (row.plan_gate && typeof currentUser !== "undefined" && currentUser) {
        var userPlan = (currentUser.user_metadata || {}).plan || "free";
        var allowedPlans = Array.isArray(row.plan_gate) ? row.plan_gate : [];
        if (allowedPlans.indexOf(userPlan) === -1) return false;
      }
      if (row.rollout_pct != null && row.rollout_pct < 100) {
        var userId = typeof currentUser !== "undefined" && currentUser ? currentUser.id : "anonymous";
        var hash = _simpleHash(flagKey + ":" + userId);
        var bucket = hash % 100;
        return bucket < row.rollout_pct ? row.enabled : false;
      }
      return row.enabled;
    }).catch(function(e) {
      if (typeof reportError === "function") reportError("feature-flags:db", e);
      return null;
    });
  }
  function _simpleHash(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i);
      hash = (hash << 5) - hash + ch;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
  async function isFeatureEnabled(flagKey, defaultValue) {
    if (typeof defaultValue === "undefined") defaultValue = false;
    if (!flagKey) return defaultValue;
    if (_flagCache.hasOwnProperty(flagKey) && _cacheExpiry[flagKey] > Date.now()) {
      return !!_flagCache[flagKey];
    }
    await _waitForPostHog(2e3);
    var phResult = _checkPostHog(flagKey);
    if (phResult !== null) {
      _flagCache[flagKey] = phResult;
      _cacheExpiry[flagKey] = Date.now() + CACHE_TTL_MS;
      return !!phResult;
    }
    var dbResult = await _checkDB(flagKey);
    if (dbResult !== null) {
      _flagCache[flagKey] = dbResult;
      _cacheExpiry[flagKey] = Date.now() + CACHE_TTL_MS;
      return !!dbResult;
    }
    return defaultValue;
  }
  async function getFeatureVariant(flagKey, defaultValue) {
    if (typeof defaultValue === "undefined") defaultValue = null;
    if (!flagKey) return defaultValue;
    if (_flagCache.hasOwnProperty(flagKey) && _cacheExpiry[flagKey] > Date.now()) {
      return _flagCache[flagKey];
    }
    await _waitForPostHog(2e3);
    var phVariant = _getPostHogVariant(flagKey);
    if (phVariant !== null) {
      _flagCache[flagKey] = phVariant;
      _cacheExpiry[flagKey] = Date.now() + CACHE_TTL_MS;
      return phVariant;
    }
    if (typeof loadSupabase === "function") {
      var sb = loadSupabase();
      if (sb) {
        try {
          var res = await sb.from("feature_flags").select("enabled, metadata").eq("id", flagKey).maybeSingle();
          if (res.data && res.data.metadata && res.data.metadata.variant) {
            _flagCache[flagKey] = res.data.metadata.variant;
            _cacheExpiry[flagKey] = Date.now() + CACHE_TTL_MS;
            return res.data.metadata.variant;
          }
        } catch (e) {
          if (typeof reportError === "function") reportError("feature-flags:variant-db", e);
        }
      }
    }
    return defaultValue;
  }
  function invalidateFlags() {
    _flagCache = {};
    _cacheExpiry = {};
    if (_posthogReady && typeof posthog !== "undefined" && posthog.reloadFeatureFlags) {
      posthog.reloadFeatureFlags();
    }
  }
  function _bootstrap() {
    _waitForPostHog(5e3).then(function(ready) {
      if (ready && typeof posthog !== "undefined" && posthog.onFeatureFlags) {
        posthog.onFeatureFlags(function() {
          _posthogFlagsLoaded = true;
        });
      }
    });
  }
  if (typeof window.BJ !== "undefined" && window.BJ.export) {
    window.BJ.export("isFeatureEnabled", isFeatureEnabled);
    window.BJ.export("getFeatureVariant", getFeatureVariant);
    window.BJ.export("invalidateFlags", invalidateFlags);
  }
  window.isFeatureEnabled = isFeatureEnabled;
  window.getFeatureVariant = getFeatureVariant;
  window.invalidateFlags = invalidateFlags;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _bootstrap);
  } else {
    _bootstrap();
  }
})();
