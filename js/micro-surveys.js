// js/micro-surveys.js — P13-04/05/06/09 Inline micro-survey components
// Lightweight survey prompts that appear inline in the dashboard.
// All responses stored in feedback table via Supabase REST API.
//
// v4.12 — S3-1: Priority-weighted micro-survey selection
//   Instead of first-trigger-wins, eligible surveys queue up and the
//   highest-priority one is shown. Paywall friction (willingness-to-pay
//   signal) gets highest priority since it feeds monetization decisions.
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

  var MICRO_SURVEY_KEY = 'bj_micro_survey_shown';

  // ─── Priority Queue ───
  // SDV-S4: Priority now reads from survey_campaigns table via BJ_SURVEY_QUESTIONS cache.
  // Fallback to hardcoded PRIORITY if campaigns not loaded.
  // Higher number = higher priority. Paywall is king (monetization signal).
  var PRIORITY = {
    micro_paywall_v1: 100,
    micro_search_v1: 60,
    micro_apply_v1: 50,
    micro_data_v1: 30
  };

  // Pending surveys that haven't been shown yet, waiting for the flush window
  var _pendingQueue = [];
  var _flushTimer = null;
  var FLUSH_DELAY_MS = 2000; // SDV-S4: 2s debounce window to collect competing triggers before picking winner

  // ─── Rate Limiter ───
  function canShowMicroSurvey() {
    try {
      return !sessionStorage.getItem(MICRO_SURVEY_KEY);
    } catch (e) { console.warn('[micro-survey] sessionStorage read failed:', e); return true; }
  }

  function markMicroSurveyShown() {
    try {
      sessionStorage.setItem(MICRO_SURVEY_KEY, Date.now().toString());
    } catch (e) { console.warn('[micro-survey] sessionStorage write failed:', e); }
  }

  // ─── Queue + Flush Logic ───
  // When a trigger fires, it enqueues a survey config. After FLUSH_DELAY_MS,
  // the highest-priority pending survey is displayed and the rest are discarded.
  function enqueueMicroSurvey(config) {
    if (!canShowMicroSurvey()) return;
    _pendingQueue.push(config);

    // Reset the flush timer — give other triggers a chance to fire
    if (_flushTimer) clearTimeout(_flushTimer);
    _flushTimer = setTimeout(flushQueue, FLUSH_DELAY_MS);
  }

  function flushQueue() {
    _flushTimer = null;
    if (!canShowMicroSurvey() || _pendingQueue.length === 0) return;

    // Sort by priority descending, pick winner
    _pendingQueue.sort(function(a, b) {
      return (PRIORITY[b.version] || 0) - (PRIORITY[a.version] || 0);
    });

    var winner = _pendingQueue[0];
    var suppressed = _pendingQueue.slice(1);

    // Log what was suppressed for analytics
    if (suppressed.length > 0) {
      console.info('[micro-survey] Showing', winner.version,
        '(priority ' + (PRIORITY[winner.version] || 0) + '),',
        'suppressed:', suppressed.map(function(s) { return s.version; }).join(', '));
    }

    // Clear queue
    _pendingQueue = [];

    // Display the winner
    displayMicroSurvey(winner);
  }

  function displayMicroSurvey(config) {
    var card = createMicroCard(config);

    if (config.displayMode === 'toast') {
      card.classList.add('micro-survey-toast');
      document.body.appendChild(card);
    } else {
      var target = config.target
        || document.getElementById('main-content')
        || document.querySelector('.content-area')
        || document.querySelector('main')
        || document.body;
      target.insertBefore(card, target.firstChild);
    }
  }

  // ─── Submit to Supabase ───
  async function submitMicroSurvey(version, responses, context) {
    var SUPABASE_URL = window._bjSupabaseUrl || 'https://qojhagupdnbtomfoxnsf.supabase.co';
    var SUPABASE_ANON_KEY = window._bjAnonKey || '';

    var userId = null;
    var authHeader = 'Bearer ' + SUPABASE_ANON_KEY;
    try {
      var stored = localStorage.getItem('sb-qojhagupdnbtomfoxnsf-auth-token');
      if (stored) {
        var session = JSON.parse(stored);
        if (session?.access_token && session?.user?.id) {
          userId = session.user.id;
          authHeader = 'Bearer ' + session.access_token;
        }
      }
    } catch (e) { console.warn('[micro-survey] session parse failed, submitting anon:', e); }

    var payload = {
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
      reportError('micro_surveys', e);
      console.warn('[micro-survey] Submit failed:', e);
    }
  }

  // ─── Generic Micro-Survey Card ───
  function createMicroCard(config) {
    var card = document.createElement('div');
    card.className = 'micro-survey-card';
    card.setAttribute('role', 'complementary');
    card.setAttribute('aria-label', 'Quick survey');

    var inner = '<div class="micro-survey-inner">';
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
      for (var r = 1; r <= 5; r++) {
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
  // PRIORITY: 100 (highest — monetization signal)
  window.showPaywallFriction = function(featureName) {
    enqueueMicroSurvey({
      question: 'Would you pay to unlock this feature?',
      type: 'choice',
      options: ['Definitely', 'Maybe', 'No'],
      followUp: {
        question: 'What\'s holding you back?',
        type: 'chips',
        options: ['Too expensive', 'Not enough value yet', 'Just browsing', 'Already paying elsewhere']
      },
      version: 'micro_paywall_v1',
      featureContext: featureName,
      displayMode: 'inline',
      target: document.getElementById('main-content') || document.querySelector('.content-area') || document.querySelector('main') || document.body
    });
  };

  // ─── P13-04: Post-Search Relevance Survey ───
  // PRIORITY: 60
  window.showSearchRelevance = function(filterName, resultCount) {
    enqueueMicroSurvey({
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
      featureContext: JSON.stringify({ filter: filterName, result_count: resultCount }),
      displayMode: 'inline',
      // QA-FIX: Target the feed section specifically so survey doesn't appear between feed and tuning
      target: document.getElementById('job-table') || document.getElementById('page-jobs') || document.body
    });
  };

  // ─── P13-05: Post-Application Confidence Survey ───
  // PRIORITY: 50
  window.showApplyConfidence = function(jobId, companyName) {
    enqueueMicroSurvey({
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
      featureContext: JSON.stringify({ job_id: jobId, company: companyName }),
      displayMode: 'toast'
    });
  };

  // ─── P13-06: Data Value Assessment ───
  // PRIORITY: 30 (lowest — passive viewing, least commercial signal)
  window.showDataValue = function(featureContext) {
    enqueueMicroSurvey({
      question: 'Did this data help your decision?',
      type: 'choice',
      options: ['Yes, very helpful', 'Somewhat', 'Not really'],
      version: 'micro_data_v1',
      featureContext: featureContext,
      displayMode: 'toast'
    });
  };

  // ─── Search/Session Tracking (P13-04) ───
  var _searchCount = 0;
  var _sessionStart = Date.now();

  window.trackSearchForSurvey = function(filterName, resultCount) {
    _searchCount++;
    var sessionMinutes = (Date.now() - _sessionStart) / 60000;
    // QA-FIX: Only show relevancy survey when Jobs Feed tab is active
    var jobsPage = document.getElementById('page-jobs');
    if (!jobsPage || !jobsPage.classList.contains('active')) return;
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

// CS-P1-004 FE-005: Register micro-surveys exports with BJ namespace
(function() {
  ['cancelDataViewTimer','showApplyConfidence','showDataValue','showPaywallFriction','showSearchRelevance','startDataViewTimer','trackSearchForSurvey'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'micro-surveys', registered: Date.now() };
    }
  });
})();
