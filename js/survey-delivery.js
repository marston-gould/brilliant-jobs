// js/survey-delivery.js — SDV-S3: Survey overlay delivery + priority engine
// Centralized orchestration: decides which survey to show, when, to whom.
// Fires on page navigation events (sidebar tab switches).
//
// Hook: Priority resolution is numeric (survey_campaigns.priority) — new survey
//       types slot into the queue with zero engine changes.
// Hook: Eligibility engine accepts pluggable audience matchers via target_audience JSONB.
// Scar: Delivery channel abstraction — this module resolves WHAT to show, not HOW.
//       Future channels (push, banner) plug into the same resolution engine.

(function() {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────────
  var SESSION_KEY = 'bj_survey_overlay_shown';
  var COOLDOWN_DAYS = 7;
  var OVERLAY_ID = 'survey-delivery-overlay';
  var _overlayActive = false;
  var _campaignsCache = null;
  var _campaignsCacheTime = 0;
  var CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  // ─── Session Rate Limiter ───────────────────────────────────────────────────
  function hasShownThisSession() {
    try { return !!sessionStorage.getItem(SESSION_KEY); }
    catch (e) { return false; }
  }

  function markShownThisSession() {
    try { sessionStorage.setItem(SESSION_KEY, Date.now().toString()); }
    catch (e) { console.warn('[survey-delivery] sessionStorage write failed:', e); }
  }

  // ─── Cooldown Check ─────────────────────────────────────────────────────────
  // Reads profiles.user_data.last_survey_prompt_at — returns true if within cooldown
  function isInCooldown() {
    try {
      var ud = JSON.parse(localStorage.getItem('bj_user_data') || '{}');
      var lastPrompt = ud.last_survey_prompt_at;
      if (!lastPrompt) return false;
      var daysSince = (Date.now() - new Date(lastPrompt).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince < COOLDOWN_DAYS;
    } catch (e) { return false; }
  }

  // ─── Write cooldown timestamp ───────────────────────────────────────────────
  async function writeCooldownTimestamp() {
    try {
      // Update localStorage cache
      var ud = JSON.parse(localStorage.getItem('bj_user_data') || '{}');
      ud.last_survey_prompt_at = new Date().toISOString();
      localStorage.setItem('bj_user_data', JSON.stringify(ud));

      // Persist to Supabase profiles.user_data
      var sb = window.supabase || window._supabase;
      if (!sb || !window.currentUser) return;
      await sb.from('profiles')
        .update({ user_data: ud })
        .eq('id', window.currentUser.id);
    } catch (e) {
      console.warn('[survey-delivery] cooldown write failed:', e);
    }
  }

  // ─── Fetch Active Campaigns (cached) ────────────────────────────────────────
  async function getActiveCampaigns() {
    if (_campaignsCache && (Date.now() - _campaignsCacheTime) < CACHE_TTL_MS) {
      return _campaignsCache;
    }
    try {
      var sb = window.supabase || window._supabase;
      if (!sb) return [];
      var res = await sb.from('survey_campaigns')
        .select('survey_version,survey_type,title,description,estimated_minutes,credit_reward,priority,channels,target_audience,frequency_days')
        .eq('is_active', true)
        .order('priority', { ascending: true });
      if (res.error) throw res.error;
      _campaignsCache = res.data || [];
      _campaignsCacheTime = Date.now();
      return _campaignsCache;
    } catch (e) {
      if (typeof reportError === 'function') reportError('survey_delivery', e, { action: 'fetch_campaigns' });
      return [];
    }
  }

  // ─── Check Completed Versions ───────────────────────────────────────────────
  async function getCompletedVersions() {
    try {
      var sb = window.supabase || window._supabase;
      if (!sb || !window.currentUser) return new Set();
      var res = await sb.from('feedback')
        .select('survey_version')
        .eq('user_id', window.currentUser.id);
      var set = new Set();
      if (res.data) res.data.forEach(function(r) { if (r.survey_version) set.add(r.survey_version); });
      return set;
    } catch (e) { return new Set(); }
  }

  // ─── Audience Targeting ─────────────────────────────────────────────────────
  // Hook: target_audience is JSONB — new dimensions added without code changes.
  // Current dimensions: plan, min_sessions
  function matchesAudience(campaign) {
    var audience = campaign.target_audience;
    if (!audience || Object.keys(audience).length === 0) return true; // no targeting = all users

    try {
      // Plan tier check
      if (audience.plan) {
        var userTier = 'free';
        try { userTier = (typeof getUserTier === 'function') ? getUserTier() : 'free'; }
        catch (e) { /* default free */ }
        if (userTier !== audience.plan) return false;
      }

      // Session count check
      if (audience.min_sessions) {
        var sessionCount = 0;
        try {
          var ud = JSON.parse(localStorage.getItem('bj_user_data') || '{}');
          sessionCount = ud.session_count || 0;
        } catch (e) { /* default 0 */ }
        if (sessionCount < audience.min_sessions) return false;
      }

      return true;
    } catch (e) { return true; } // fail-open on audience check errors
  }

  // ─── Priority Resolution ────────────────────────────────────────────────────
  // Given eligible campaigns, returns the highest priority (lowest number) one.
  function resolveHighestPriority(campaigns) {
    if (!campaigns || campaigns.length === 0) return null;
    // Already sorted by priority ASC from the query, but be explicit
    var sorted = campaigns.slice().sort(function(a, b) { return (a.priority || 99) - (b.priority || 99); });
    return sorted[0];
  }

  // ─── Overlay UI ─────────────────────────────────────────────────────────────
  function showOverlay(campaign) {
    if (_overlayActive) return;
    _overlayActive = true;

    // Remove any existing overlay
    var existing = document.getElementById(OVERLAY_ID);
    if (existing) existing.remove();

    var esc = function(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };
    var creditHtml = campaign.credit_reward > 0
      ? '<span style="display:inline-block;background:#22c55e;color:#fff;font-size:11px;font-weight:600;padding:2px 10px;border-radius:10px;margin-right:8px;">Earn ' + campaign.credit_reward + ' credits</span>'
      : '';
    var estTime = '~' + (campaign.estimated_minutes || 2) + ' min';

    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9998;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.3s;';

    var card = document.createElement('div');
    card.style.cssText = 'background:var(--bg-card,#181a20);border-radius:12px;padding:28px 32px;max-width:480px;width:90%;position:relative;box-shadow:0 8px 32px rgba(0,0,0,0.4);';

    // Close X button
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '\u00D7';
    closeBtn.style.cssText = 'position:absolute;top:12px;right:16px;background:none;border:none;color:var(--text-dim,#aaa);font-size:22px;cursor:pointer;padding:4px 8px;line-height:1;';
    closeBtn.onclick = function() { dismissOverlay('x_button'); };
    card.appendChild(closeBtn);

    // Content
    card.innerHTML += '<div style="font-size:16px;font-weight:600;color:var(--text,#f0f2f8);margin-bottom:6px;">' + esc(campaign.title) + '</div>'
      + (campaign.description ? '<div style="font-size:12px;color:var(--text-dim,#aaa);margin-bottom:12px;">' + esc(campaign.description) + '</div>' : '')
      + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:20px;">'
      + creditHtml
      + '<span style="font-size:11px;color:var(--text-faint,#888);">' + estTime + '</span>'
      + '</div>'
      + '<div style="display:flex;gap:10px;">'
      + '<button id="sdv-take-survey" style="flex:1;padding:10px 16px;background:var(--accent,#6da3ff);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">Take Survey</button>'
      + '<button id="sdv-not-now" style="padding:10px 16px;background:none;color:var(--text-dim,#aaa);border:none;font-size:13px;cursor:pointer;">Not Now</button>'
      + '</div>';

    // Re-attach close button (innerHTML clobbered it)
    var closeBtn2 = document.createElement('button');
    closeBtn2.textContent = '\u00D7';
    closeBtn2.style.cssText = 'position:absolute;top:12px;right:16px;background:none;border:none;color:var(--text-dim,#aaa);font-size:22px;cursor:pointer;padding:4px 8px;line-height:1;';
    closeBtn2.onclick = function() { dismissOverlay('x_button'); };
    card.appendChild(closeBtn2);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Fade in
    requestAnimationFrame(function() { overlay.style.opacity = '1'; });

    // Wire buttons
    var takeBtn = document.getElementById('sdv-take-survey');
    var notNowBtn = document.getElementById('sdv-not-now');

    if (takeBtn) {
      takeBtn.onclick = function() {
        var surveyContext = campaign.survey_type === 'nps' ? 'nps' : campaign.survey_type === 'exit' ? 'churn' : 'periodic';
        var url = '/survey?context=' + surveyContext + '&v=' + encodeURIComponent(campaign.survey_version) + '&src=overlay';
        window.location.href = url;

        // PostHog: survey_overlay_accepted
        _captureEvent('survey_overlay_accepted', { survey_version: campaign.survey_version });
      };
    }

    if (notNowBtn) {
      notNowBtn.onclick = function() { dismissOverlay('not_now'); };
    }

    // Backdrop click dismisses
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) dismissOverlay('backdrop');
    });

    // PostHog: survey_overlay_shown
    _captureEvent('survey_overlay_shown', {
      survey_version: campaign.survey_version,
      credit_amount: campaign.credit_reward || 0
    });

    // Mark shown + write cooldown
    markShownThisSession();
    writeCooldownTimestamp();
  }

  function dismissOverlay(method) {
    var overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.style.opacity = '0';
      setTimeout(function() { overlay.remove(); }, 300);
    }
    _overlayActive = false;

    // PostHog: survey_overlay_dismissed
    _captureEvent('survey_overlay_dismissed', {
      dismiss_method: method || 'unknown'
    });
  }

  // ─── PostHog Helper ─────────────────────────────────────────────────────────
  function _captureEvent(name, props) {
    try {
      if (typeof captureEvent === 'function') captureEvent(name, props);
      else if (typeof posthog !== 'undefined') posthog.capture(name, props);
    } catch (_ph) { /* fire-and-forget */ }
  }

  // ─── Main Evaluation ───────────────────────────────────────────────────────
  // Called on each page navigation. Evaluates all eligibility criteria and
  // shows the highest-priority eligible survey overlay if appropriate.
  async function evaluateSurveyOverlay() {
    // Gate 1: Must be logged in
    if (!window.currentUser) return;

    // Gate 2: Session rate limit — only one overlay per session
    if (hasShownThisSession()) return;

    // Gate 3: Cooldown — not within COOLDOWN_DAYS of last prompt
    if (isInCooldown()) return;

    // Gate 4: Overlay not already active
    if (_overlayActive) return;

    try {
      // Fetch active campaigns + completed versions in parallel
      var results = await Promise.all([
        getActiveCampaigns(),
        getCompletedVersions()
      ]);
      var campaigns = results[0];
      var completed = results[1];

      // Filter to overlay-enabled, non-completed, audience-matched campaigns
      var eligible = campaigns.filter(function(c) {
        // Must support overlay channel
        if (!c.channels || c.channels.indexOf('overlay') === -1) return false;
        // Must not be completed by this user
        if (completed.has(c.survey_version)) return false;
        // Must not be exit survey (those are triggered by churn, not overlay)
        if (c.survey_type === 'exit') return false;
        // Must match audience targeting
        if (!matchesAudience(c)) return false;
        return true;
      });

      if (eligible.length === 0) return;

      // Resolve highest priority
      var winner = resolveHighestPriority(eligible);
      if (!winner) return;

      // Show the overlay
      showOverlay(winner);

    } catch (e) {
      if (typeof reportError === 'function') reportError('survey_delivery', e, { action: 'evaluate' });
    }
  }

  // ─── Page Navigation Hook ──────────────────────────────────────────────────
  // We hook into the nav-item click handler. Instead of modifying app.js,
  // we use a MutationObserver on the .page.active class change,
  // which fires after every page switch.
  var _lastActivePage = null;
  var _pageObserver = null;

  function initPageNavigationHook() {
    // Observe the pages container for class changes
    var pages = document.querySelectorAll('.page');
    if (pages.length === 0) return;

    _pageObserver = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === 'attributes' && m.attributeName === 'class') {
          var el = m.target;
          if (el.classList.contains('page') && el.classList.contains('active')) {
            var pageId = el.id ? el.id.replace('page-', '') : '';
            if (pageId && pageId !== _lastActivePage) {
              _lastActivePage = pageId;
              // Debounce: don't evaluate on the very first page load (user just arrived)
              if (_navCount > 0) {
                evaluateSurveyOverlay();
              }
              _navCount++;
            }
          }
        }
      }
    });

    pages.forEach(function(page) {
      _pageObserver.observe(page, { attributes: true, attributeFilter: ['class'] });
    });
  }

  var _navCount = 0;

  // ─── Init ───────────────────────────────────────────────────────────────────
  function initSurveyDelivery() {
    // Only init if we have a logged-in user
    if (!window.currentUser) return;
    initPageNavigationHook();
  }

  // Auto-init after a short delay (let the page settle)
  if (document.readyState === 'complete') {
    setTimeout(initSurveyDelivery, 2000);
  } else {
    window.addEventListener('load', function() {
      setTimeout(initSurveyDelivery, 2000);
    });
  }

  // ─── Exports ────────────────────────────────────────────────────────────────
  window.evaluateSurveyOverlay = evaluateSurveyOverlay;
  window.initSurveyDelivery = initSurveyDelivery;
  window._sdvDismissOverlay = dismissOverlay;

  // BJ namespace
  if (window.BJ) {
    window.BJ.evaluateSurveyOverlay = evaluateSurveyOverlay;
    window.BJ.initSurveyDelivery = initSurveyDelivery;
  }
})();
