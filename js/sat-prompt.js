// ============================================================
// sat-prompt.js — In-session satisfaction prompt (Part C)
// FB-08/09: POD2_HANDOFF_FeedbackSystem
// Floating card from bottom-right. Configurable via app_settings.
// ============================================================
(function () {
  'use strict';

  var STORAGE_SESSIONS = 'bj_dashboard_sessions';
  var SESSION_SHOWN    = 'bj_sat_shown';

  // Defaults per spec
  var DEFAULT_DELAY_MINUTES  = 5;
  var DEFAULT_SESSION_CADENCE = 10;

  var _score     = null;
  var _timer     = null;

  // Read cohort config from app_settings (cached in bj_app_settings localStorage)
  function getConfig() {
    var delay    = DEFAULT_DELAY_MINUTES;
    var cadence  = DEFAULT_SESSION_CADENCE;
    try {
      var cached = localStorage.getItem('bj_app_settings');
      if (cached) {
        var settings = JSON.parse(cached);
        if (settings.sat_popup_delay_minutes)  delay   = parseInt(settings.sat_popup_delay_minutes, 10);
        if (settings.sat_session_cadence)      cadence = parseInt(settings.sat_session_cadence, 10);
      }
    } catch (e) { /* use defaults */ }
    return { delay: delay, cadence: cadence };
  }

  // Fetch and cache app_settings for cohort config reading
  async function prefetchSettings() {
    try {
      var SUPABASE_URL = window.SUPABASE_URL || 'https://qojhagupdnbtomfoxnsf.supabase.co';
      var SUPABASE_KEY = window.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';
      var res = await fetch(SUPABASE_URL + "/rest/v1/app_settings?key=in.(sat_popup_delay_minutes,sat_session_cadence,bug_reward_standard,bug_reward_critical)&select=key,value", {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
      });
      var rows = await res.json();
      if (Array.isArray(rows)) {
        var map = {};
        rows.forEach(function(r) { map[r.key] = r.value; });
        localStorage.setItem('bj_app_settings', JSON.stringify(map));
      }
    } catch (e) { /* use cached/defaults */ }
  }

  function isModalOpen() {
    // Don't stack on top of other modals
    var modals = document.querySelectorAll('[role="dialog"]:not([hidden]), .modal-overlay.active, [data-modal-open="true"]');
    return modals.length > 0;
  }

  function showPrompt(sessionNumber, delayMinutes) {
    var card = document.getElementById('sat-prompt-card');
    if (!card) return;
    if (document.visibilityState !== 'visible') return;
    if (isModalOpen()) return;

    sessionStorage.setItem(SESSION_SHOWN, '1');
    card.style.display = 'flex';
    card.classList.add('sat-prompt--visible');

    if (window.posthog) posthog.capture('sat_prompt_shown', {
      session_number: sessionNumber,
      delay_minutes: delayMinutes
    });
  }

  function hidePrompt() {
    var card = document.getElementById('sat-prompt-card');
    if (card) { card.classList.remove('sat-prompt--visible'); card.style.display = 'none'; }
  }

  async function submitScore(score, followUp) {
    try {
      var SUPABASE_URL = window.SUPABASE_URL || 'https://qojhagupdnbtomfoxnsf.supabase.co';
      var SUPABASE_KEY = window.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';
      // For authenticated users, need auth token — use sb if available
      var authHeader = SUPABASE_KEY;
      if (typeof sb !== 'undefined') {
        var session = await sb.auth.getSession();
        if (session.data && session.data.session) {
          authHeader = session.data.session.access_token;
        }
      }
      var sessionCount = parseInt(localStorage.getItem(STORAGE_SESSIONS) || '0', 10);
      await fetch(SUPABASE_URL + '/rest/v1/exit_surveys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + authHeader,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          survey_type:    'satisfaction_prompted',
          satisfaction:   score,
          follow_up:      followUp || null,
          page_url:       window.location.pathname,
          session_number: sessionCount
        })
      });
    } catch (e) {
      console.warn('[BJ:SatPrompt] Submit failed:', e.message);
    }
  }

  function init() {
    // Increment session count
    var sessions = parseInt(localStorage.getItem(STORAGE_SESSIONS) || '0', 10) + 1;
    localStorage.setItem(STORAGE_SESSIONS, String(sessions));

    // Gate: already shown this session?
    if (sessionStorage.getItem(SESSION_SHOWN)) return;

    // Prefetch settings in background
    prefetchSettings();

    var config = getConfig();

    // Gate: session cadence
    if (sessions % config.cadence !== 0) return;

    // Schedule the prompt
    _timer = setTimeout(function() {
      showPrompt(sessions, config.delay);
    }, config.delay * 60 * 1000);

    // Wire up UI
    var card       = document.getElementById('sat-prompt-card');
    var dismissBtn = document.getElementById('sat-prompt-dismiss');
    var followWrap = document.getElementById('sat-prompt-follow-wrap');
    var sendBtn    = document.getElementById('sat-prompt-send');
    var skipBtn    = document.getElementById('sat-prompt-skip');
    var thanksEl   = document.getElementById('sat-prompt-thanks');
    var mainEl     = document.getElementById('sat-prompt-main');

    if (!card) return;

    if (dismissBtn) {
      dismissBtn.addEventListener('click', function() {
        if (window.posthog) posthog.capture('sat_prompt_dismissed');
        hidePrompt();
      });
    }

    document.querySelectorAll('.sat-score-btn').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        document.querySelectorAll('.sat-score-btn').forEach(function(b) {
          b.classList.remove('sat-score-btn--active');
        });
        btn.classList.add('sat-score-btn--active');
        _score = parseInt(btn.getAttribute('data-score'), 10);

        if (window.posthog) posthog.capture('sat_prompt_score', { score: _score });

        if (_score >= 4) {
          // Auto-close with thanks
          await submitScore(_score, null);
          if (window.posthog) posthog.capture('sat_prompt_feedback', { score: _score, has_text: false });
          mainEl.style.display = 'none';
          thanksEl.style.display = 'block';
          setTimeout(hidePrompt, 1500);
        } else {
          // Expand with follow-up
          if (followWrap) followWrap.style.display = 'block';
        }
      });
    });

    if (sendBtn) {
      sendBtn.addEventListener('click', async function() {
        var textarea = document.getElementById('sat-prompt-text');
        var text = textarea ? textarea.value.trim() : '';
        sendBtn.disabled = true;
        await submitScore(_score, text || null);
        if (window.posthog) posthog.capture('sat_prompt_feedback', { score: _score, has_text: text.length > 0 });
        mainEl.style.display = 'none';
        thanksEl.style.display = 'block';
        setTimeout(hidePrompt, 1500);
      });
    }

    if (skipBtn) {
      skipBtn.addEventListener('click', async function() {
        await submitScore(_score, null);
        if (window.posthog) posthog.capture('sat_prompt_feedback', { score: _score, has_text: false });
        hidePrompt();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
