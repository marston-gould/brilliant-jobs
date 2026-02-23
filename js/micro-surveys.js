// js/micro-surveys.js — P13-04/05/06/09 Inline micro-survey components
// Lightweight survey prompts that appear inline in the dashboard.
// All responses stored in feedback table via Supabase REST API.
//
// Usage:
//   showPaywallFriction('resume_grading')  — after feature limit hit
//   showSearchRelevance(filterName, count)  — after 10th search or 5min session
//   showApplyConfidence(jobId, company)     — after pipeline apply action
//   showDataValue(featureContext)            — after 10s viewing stats/data
//
// Rate limiting: max 1 micro-survey per session, stored in sessionStorage.

(function() {
  'use strict';

  const MICRO_SURVEY_KEY = 'bj_micro_survey_shown';

  // ─── Rate Limiter ───
  function canShowMicroSurvey() {
    try {
      return !sessionStorage.getItem(MICRO_SURVEY_KEY);
    } catch { return true; }
  }

  function markMicroSurveyShown() {
    try {
      sessionStorage.setItem(MICRO_SURVEY_KEY, Date.now().toString());
    } catch { /* ignore */ }
  }

  // ─── Submit to Supabase ───
  async function submitMicroSurvey(version, responses, context) {
    const SUPABASE_URL = window._bjSupabaseUrl || 'https://qojhagupdnbtomfoxnsf.supabase.co';
    const SUPABASE_ANON_KEY = window._bjAnonKey || '';

    let userId = null;
    let authHeader = 'Bearer ' + SUPABASE_ANON_KEY;
    try {
      const stored = localStorage.getItem('sb-qojhagupdnbtomfoxnsf-auth-token');
      if (stored) {
        const session = JSON.parse(stored);
        if (session?.access_token && session?.user?.id) {
          userId = session.user.id;
          authHeader = 'Bearer ' + session.access_token;
        }
      }
    } catch { /* anon fallback */ }

    const payload = {
      type: 'micro_survey',
      user_id: userId,
      survey_version: version,
      answers: responses,
      feature_context: context || null,
      created_at: new Date().toISOString()
    };

    try {
      await fetch(SUPABASE_URL + '/rest/v1/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': authHeader,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.warn('[micro-survey] Submit failed:', e);
    }
  }

  // ─── Generic Micro-Survey Card ───
  function createMicroCard(config) {
    const card = document.createElement('div');
    card.className = 'micro-survey-card';
    card.setAttribute('role', 'complementary');
    card.setAttribute('aria-label', 'Quick survey');

    let inner = '<div class="micro-survey-inner">';
    inner += '<button class="micro-survey-close" aria-label="Dismiss survey">&times;</button>';
    inner += '<div class="micro-survey-q">' + config.question + '</div>';

    if (config.type === 'choice') {
      inner += '<div class="micro-survey-opts">';
      config.options.forEach(function(opt, i) {
        inner += '<button class="micro-survey-opt" data-val="' + i + '">' + opt + '</button>';
      });
      inner += '</div>';
    } else if (config.type === 'rating') {
      inner += '<div class="micro-survey-rating">';
      for (let r = 1; r <= 5; r++) {
        inner += '<button class="micro-survey-star" data-val="' + r + '">' + r + '</button>';
      }
      inner += '</div>';
      if (config.minLabel || config.maxLabel) {
        inner += '<div class="micro-survey-labels"><span>' + (config.minLabel || '') + '</span><span>' + (config.maxLabel || '') + '</span></div>';
      }
    }

    if (config.followUp) {
      inner += '<div class="micro-survey-followup hidden">';
      inner += '<div class="micro-survey-q micro-survey-q2">' + config.followUp.question + '</div>';
      if (config.followUp.type === 'chips') {
        inner += '<div class="micro-survey-chips">';
        config.followUp.options.forEach(function(opt, i) {
          inner += '<button class="micro-survey-chip" data-val="' + i + '">' + opt + '</button>';
        });
        inner += '</div>';
      }
      inner += '</div>';
    }

    inner += '<div class="micro-survey-thanks hidden">Thanks for the feedback!</div>';
    inner += '</div>';
    card.innerHTML = inner;

    // ─── Wire Events ───
    var answers = {};
    var closed = false;

    card.querySelector('.micro-survey-close').addEventListener('click', function() {
      card.classList.add('micro-survey-out');
      closed = true;
      setTimeout(function() { card.remove(); }, 300);
    });

    // Primary answer (choice or rating)
    card.querySelectorAll('.micro-survey-opt, .micro-survey-star').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (closed) return;
        btn.parentElement.querySelectorAll('button').forEach(function(b) { b.classList.remove('selected'); });
        btn.classList.add('selected');

        var val = parseInt(btn.dataset.val);
        if (config.type === 'choice') {
          answers.primary = { index: val, text: config.options[val] };
        } else {
          answers.primary = { rating: val };
        }

        // Show follow-up if configured
        var followup = card.querySelector('.micro-survey-followup');
        if (followup && config.followUp) {
          followup.classList.remove('hidden');
        } else {
          finishMicro();
        }
      });
    });

    // Follow-up chips (multi-select)
    card.querySelectorAll('.micro-survey-chip').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (closed) return;
        btn.classList.toggle('selected');
        var selected = [];
        card.querySelectorAll('.micro-survey-chip.selected').forEach(function(s) {
          selected.push(config.followUp.options[parseInt(s.dataset.val)]);
        });
        answers.followup = selected;

        // Auto-submit 1s after last chip click
        clearTimeout(card._chipTimer);
        card._chipTimer = setTimeout(function() { finishMicro(); }, 1000);
      });
    });

    function finishMicro() {
      submitMicroSurvey(config.version, answers, config.featureContext);
      card.querySelectorAll('.micro-survey-opts, .micro-survey-rating, .micro-survey-followup, .micro-survey-q, .micro-survey-q2, .micro-survey-labels').forEach(function(el) {
        el.classList.add('hidden');
      });
      card.querySelector('.micro-survey-thanks').classList.remove('hidden');
      setTimeout(function() {
        card.classList.add('micro-survey-out');
        setTimeout(function() { card.remove(); }, 300);
      }, 1500);
    }

    markMicroSurveyShown();
    return card;
  }

  // ─── P13-09: Paywall Friction Survey ───
  // Shows when a free user hits a feature limit
  window.showPaywallFriction = function(featureName) {
    if (!canShowMicroSurvey()) return;

    var card = createMicroCard({
      question: 'Would you pay to unlock this feature?',
      type: 'choice',
      options: ['Definitely', 'Maybe', 'No'],
      followUp: {
        question: 'What\'s holding you back?',
        type: 'chips',
        options: ['Too expensive', 'Not enough value yet', 'Just browsing', 'Already paying elsewhere']
      },
      version: 'micro_paywall_v1',
      featureContext: featureName
    });

    // Insert near the top of the main content area
    var target = document.getElementById('main-content') || document.querySelector('.content-area') || document.querySelector('main') || document.body;
    target.insertBefore(card, target.firstChild);
  };

  // ─── P13-04: Post-Search Relevance Survey ───
  window.showSearchRelevance = function(filterName, resultCount) {
    if (!canShowMicroSurvey()) return;

    var card = createMicroCard({
      question: 'How relevant were these results?',
      type: 'rating',
      minLabel: 'Not at all',
      maxLabel: 'Very relevant',
      followUp: {
        question: 'What was missing?',
        type: 'chips',
        options: ['More salary data', 'Wrong seniority level', 'Too many ghost jobs', 'Not my industry', 'Other']
      },
      version: 'micro_search_v1',
      featureContext: JSON.stringify({ filter: filterName, result_count: resultCount })
    });

    var target = document.getElementById('job-feed-container') || document.getElementById('main-content') || document.body;
    target.insertBefore(card, target.firstChild);
  };

  // ─── P13-05: Post-Application Confidence Survey ───
  window.showApplyConfidence = function(jobId, companyName) {
    if (!canShowMicroSurvey()) return;

    var card = createMicroCard({
      question: 'How confident are you this job is real?',
      type: 'rating',
      minLabel: 'Likely ghost',
      maxLabel: 'Definitely real',
      followUp: {
        question: 'Was the application process clear?',
        type: 'chips',
        options: ['Yes, very clear', 'Somewhat', 'No, confusing']
      },
      version: 'micro_apply_v1',
      featureContext: JSON.stringify({ job_id: jobId, company: companyName })
    });

    // Show as toast-like at bottom right
    card.classList.add('micro-survey-toast');
    document.body.appendChild(card);
  };

  // ─── P13-06: Data Value Assessment ───
  window.showDataValue = function(featureContext) {
    if (!canShowMicroSurvey()) return;

    var card = createMicroCard({
      question: 'Did this data help your decision?',
      type: 'choice',
      options: ['Yes, very helpful', 'Somewhat', 'Not really'],
      version: 'micro_data_v1',
      featureContext: featureContext
    });

    // Floating bottom-right widget
    card.classList.add('micro-survey-toast');
    document.body.appendChild(card);
  };

  // ─── Search/Session Tracking (P13-04) ───
  var _searchCount = 0;
  var _sessionStart = Date.now();

  window.trackSearchForSurvey = function(filterName, resultCount) {
    _searchCount++;
    var sessionMinutes = (Date.now() - _sessionStart) / 60000;
    if (_searchCount >= 10 || sessionMinutes >= 5) {
      showSearchRelevance(filterName, resultCount);
    }
  };

  // ─── Data Page Timer (P13-06) ───
  var _dataViewTimers = {};
  window.startDataViewTimer = function(featureContext) {
    if (_dataViewTimers[featureContext]) return;
    _dataViewTimers[featureContext] = setTimeout(function() {
      showDataValue(featureContext);
    }, 10000); // 10 seconds
  };
  window.cancelDataViewTimer = function(featureContext) {
    if (_dataViewTimers[featureContext]) {
      clearTimeout(_dataViewTimers[featureContext]);
      delete _dataViewTimers[featureContext];
    }
  };

})();
