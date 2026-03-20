// ============================================================
// exit-survey.js — Non-user exit intent survey (Survey A)
// FB-03: Part A of POD2_HANDOFF_FeedbackSystem
// Triggers on exit intent for non-logged-in visitors after 10s
// ============================================================
(function () {
  'use strict';

  var STORAGE_DONE    = 'bj_exit_survey_done';
  var STORAGE_SHOWN   = 'bj_exit_survey_shown';
  var MIN_TIME_MS     = 10000; // 10 seconds on page
  var _startTime      = Date.now();
  var _shown          = false;
  var _platform       = null;
  var _satisfaction   = null;

  // Gates: don't show if already completed or shown this session
  function shouldShow() {
    if (localStorage.getItem(STORAGE_DONE))      return false;
    if (sessionStorage.getItem(STORAGE_SHOWN))   return false;
    if (Date.now() - _startTime < MIN_TIME_MS)   return false;
    return true;
  }

  // Show the survey modal
  function showSurvey() {
    if (_shown) return;
    var modal = document.getElementById('exit-survey-modal');
    if (!modal) return;
    _shown = true;
    sessionStorage.setItem(STORAGE_SHOWN, '1');
    modal.removeAttribute('hidden');
    modal.setAttribute('aria-hidden', 'false');
    if (window.posthog) posthog.capture('exit_survey_shown');
  }

  // Desktop: mouseleave from viewport top
  function onMouseLeave(e) {
    if (e.clientY <= 0 && shouldShow()) {
      showSurvey();
    }
  }

  // Mobile: tab hidden
  function onVisibilityChange() {
    if (document.visibilityState === 'hidden' && shouldShow()) {
      showSurvey();
    }
  }

  function init() {
    document.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('visibilitychange', onVisibilityChange);

    var modal    = document.getElementById('exit-survey-modal');
    var overlay  = document.getElementById('exit-survey-overlay');
    var dismiss  = document.getElementById('exit-survey-dismiss');
    var sendBtn  = document.getElementById('exit-survey-send');
    var otherWrap= document.getElementById('exit-survey-other-wrap');

    if (!modal) return;

    // Platform pill selection
    document.querySelectorAll('.exit-survey-pill').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.exit-survey-pill').forEach(function(b) {
          b.setAttribute('aria-pressed', 'false');
          b.classList.remove('exit-survey-pill--active');
        });
        btn.setAttribute('aria-pressed', 'true');
        btn.classList.add('exit-survey-pill--active');
        _platform = btn.getAttribute('data-value');
        if (_platform === 'Other') {
          otherWrap.style.display = 'block';
        } else {
          otherWrap.style.display = 'none';
        }
      });
    });

    // Satisfaction circles
    document.querySelectorAll('.exit-survey-score').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.exit-survey-score').forEach(function(b) {
          b.setAttribute('aria-pressed', 'false');
          b.classList.remove('exit-survey-score--active');
        });
        btn.setAttribute('aria-pressed', 'true');
        btn.classList.add('exit-survey-score--active');
        _satisfaction = parseInt(btn.getAttribute('data-value'), 10);
      });
    });

    // Dismiss
    function closeSurvey() {
      modal.setAttribute('hidden', '');
      modal.setAttribute('aria-hidden', 'true');
    }

    if (dismiss) {
      dismiss.addEventListener('click', function() {
        if (window.posthog) posthog.capture('exit_survey_dismissed');
        closeSurvey();
      });
    }

    if (overlay) {
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
          if (window.posthog) posthog.capture('exit_survey_dismissed');
          closeSurvey();
        }
      });
    }

    // Send
    if (sendBtn) {
      sendBtn.addEventListener('click', async function() {
        if (!_platform || !_satisfaction) {
          // highlight missing fields
          if (!_platform) document.querySelector('.exit-survey-pills-wrap').style.outline = '1px solid var(--red, #ef4444)';
          if (!_satisfaction) document.querySelector('.exit-survey-scores-wrap').style.outline = '1px solid var(--red, #ef4444)';
          return;
        }

        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending…';

        var platformOther = _platform === 'Other'
          ? (document.getElementById('exit-survey-other-input') || {}).value || null
          : null;

        var payload = {
          survey_type:     'exit_nonuser',
          platform:        _platform,
          platform_other:  platformOther,
          satisfaction:    _satisfaction,
          page_url:        window.location.pathname,
          visit_count:     parseInt(localStorage.getItem('bj_visits') || '0', 10),
          segment:         typeof window._bjSegment === 'string' ? window._bjSegment : null,
        };

        try {
          var SUPABASE_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
          var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';
          await fetch(SUPABASE_URL + '/rest/v1/exit_surveys', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_KEY,
              'Authorization': 'Bearer ' + SUPABASE_KEY,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify(payload)
          });
        } catch (e) {
          console.warn('[BJ:ExitSurvey] Submit failed:', e.message);
        }

        localStorage.setItem(STORAGE_DONE, '1');
        if (window.posthog) posthog.capture('exit_survey_completed', {
          platform: _platform,
          satisfaction: _satisfaction
        });

        // Show thank you
        document.getElementById('exit-survey-form').style.display = 'none';
        document.getElementById('exit-survey-thanks').style.display = 'block';
        setTimeout(closeSurvey, 1800);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
