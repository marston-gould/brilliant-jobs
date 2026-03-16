/**
 * Brilliant Jobs — Apply Workflow v5.18
 * Score Gate Modal, Pending Applications, and Apply State Machine
 * 
 * Phase 2: Real ATS Submission (Pod 2)
 * - Score Gate Modal: intercepts Apply when score is low/unscored
 * - Pending Applications: Supabase-backed with real ATS submission
 * - Apply Settings: per-filter configuration
 * - Rewrite Review Modal: shows AI rewrite diff
 * - scoreAndRecheck: calls score-resume EF (1 credit)
 * - triggerRewrite: opens existing rewrite panel (3 credits)
 * - proceedToApply: creates pending_applications row + calls submit-application
 * - approvePendingApp: calls submit-application on approval
 * - submit-application EF: Recruitee (real API), others (mock fallback)
 */

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

var APPLY_MODES = {
  MANUAL:           'manual',
  SCORE_GATED:      'score_gated',
  AUTO:             'auto',
  SCORE_GATED_AUTO: 'score_gated_auto',
  AUTO_REWRITE:     'auto_rewrite',
  AUTOPILOT:        'autopilot'
};

var APPLY_STATUS = {
  PENDING:    'pending',
  APPROVED:   'approved',
  PROCESSING: 'processing',
  SUBMITTED:  'submitted',
  SKIPPED:    'skipped',
  EXPIRED:    'expired',
  FAILED:     'failed'
};

var DEFAULT_APPLY_SETTINGS = {
  default_apply_mode: APPLY_MODES.MANUAL,
  default_score_threshold: 70,
  default_approval_required: true,
  default_notification_channels: ['in_app', 'email'],
  sms_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
  auto_expire_hours: 48
};

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════

var pendingApplications = [];
var userApplySettings = Object.assign({}, DEFAULT_APPLY_SETTINGS);
var _applySubmitting = false; // Prevent double-submit
var _activePollers = {}; // EXT-AS-7: Track active status pollers by appId

// ═══════════════════════════════════════════════════════════
// AF-006: DASHBOARD ACTIVITY LOGGING
// Fire-and-forget writes to user_activity_log via log-user-activity EF.
// ═══════════════════════════════════════════════════════════

var _dashActivityQueue = [];
var _dashActivityTimer = null;

function logDashboardActivity(activityType, data) {
  try {
    var item = {
      client_id: 'db-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      activity_type: activityType,
      source: 'dashboard',
      job_title: data.jobTitle || null,
      company: data.company || null,
      job_url: data.jobUrl || null,
      score: typeof data.score === 'number' ? data.score : null,
      mode: data.mode || null,
      metadata: data.metadata || {},
      created_at: new Date().toISOString()
    };
    _dashActivityQueue.push(item);

    // 5s debounce flush
    if (_dashActivityTimer) clearTimeout(_dashActivityTimer);
    _dashActivityTimer = setTimeout(_flushDashboardActivity, 5000);
  } catch (e) {
    if (typeof reportError === 'function') reportError('af006_log', e);
  }
}

async function _flushDashboardActivity() {
  _dashActivityTimer = null;
  if (_dashActivityQueue.length === 0) return;

  var batch = _dashActivityQueue.splice(0, 50);
  try {
    var token = (typeof currentUser !== 'undefined' && currentUser && currentUser.access_token)
      ? currentUser.access_token : null;
    if (!token && typeof sb !== 'undefined' && sb.auth) {
      var sess = await sb.auth.getSession();
      token = sess && sess.data && sess.data.session ? sess.data.session.access_token : null;
    }
    if (!token) return;

    var gatewayBase = 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/api-gateway';
    fetch(gatewayBase + '/log-user-activity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ action: 'batch', items: batch })
    }).catch(function() {}); // fire-and-forget
  } catch (e) {
    if (typeof reportError === 'function') reportError('af006_flush', e);
  }
}

// ═══════════════════════════════════════════════════════════
// AF-002: FIRST-TIME SETUP GATE
// Blocks all apply actions until user completes initial setup:
//   1. applicant_profile with first_name, last_name, email
//   2. applicationMode explicitly set (not null/undefined)
//   3. activeResumeId is set
// ═══════════════════════════════════════════════════════════

/**
 * Check if user has completed the first-time setup requirements.
 * Reads from localStorage applySettings and applicantProfile cache.
 * @returns {boolean} true if all setup criteria met
 */
function isSetupComplete() {
  try {
    // Fast path: check cached flag first
    var settings = null;
    try { settings = JSON.parse(localStorage.getItem('bj_apply_settings') || 'null'); } catch (e) { /* ignore */ }
    if (settings && settings.setup_complete === true) return true;

    // Check criteria individually
    var profile = null;
    try { profile = JSON.parse(localStorage.getItem('bj_applicant_profile') || 'null'); } catch (e) { /* ignore */ }

    var hasProfile = profile && profile.name && profile.name.trim().length > 0 && profile.email && profile.email.trim().length > 0;
    var hasMode = settings && settings.default_apply_mode && settings.default_apply_mode !== 'null' && settings.default_apply_mode !== '';
    // Check explicit active_resume_id, then window global, then any uploaded resume
    var hasResume = (settings && settings.active_resume_id)
      || (typeof window._activeResumeId !== 'undefined' && window._activeResumeId)
      || (typeof resumes !== 'undefined' && Array.isArray(resumes) && resumes.length > 0);

    return !!(hasProfile && hasMode && hasResume);
  } catch (e) {
    reportError('apply-workflow:isSetupComplete', e);
    return false;
  }
}

/**
 * Show the setup gate modal — blocks apply actions until setup is complete.
 * Reusable across job feed and pipeline surfaces.
 */
function showSetupGateModal() {
  var overlay = document.getElementById('setup-gate-overlay');
  if (overlay) {
    overlay.classList.remove('u-hidden');
    overlay.style.display = 'flex';
  }
  if (typeof posthog !== 'undefined') posthog.capture('setup_gate_shown', { surface: 'dashboard' });
}

/**
 * Hide the setup gate modal.
 */
function hideSetupGateModal() {
  var overlay = document.getElementById('setup-gate-overlay');
  if (overlay) {
    overlay.classList.add('u-hidden');
    overlay.style.display = 'none';
  }
}

/**
 * Navigate to Settings tab to complete setup. Called from gate modal button.
 */
function navigateToSetup() {
  hideSetupGateModal();
  // Navigate to settings page
  var settingsNav = document.querySelector('[data-page="settings"]') || document.querySelector('.nav-item[data-page="settings"]');
  if (settingsNav) settingsNav.click();
  if (typeof posthog !== 'undefined') posthog.capture('setup_gate_navigate', { target: 'settings' });
}

/**
 * After profile/settings save, check if all setup criteria are now met.
 * If so, set setup_complete flag in Supabase and localStorage.
 * @returns {Promise<boolean>} true if setup is now complete
 */
async function checkAndSetSetupComplete() {
  if (!currentUser) return false;
  try {
    var profile = null;
    try { profile = JSON.parse(localStorage.getItem('bj_applicant_profile') || 'null'); } catch (e) { /* ignore */ }
    var settings = null;
    try { settings = JSON.parse(localStorage.getItem('bj_apply_settings') || 'null'); } catch (e) { /* ignore */ }

    var hasProfile = profile && profile.name && profile.name.trim().length > 0 && profile.email && profile.email.trim().length > 0;
    var hasMode = settings && settings.default_apply_mode && settings.default_apply_mode !== 'null' && settings.default_apply_mode !== '';
    var hasResume = (settings && settings.active_resume_id)
      || (typeof window._activeResumeId !== 'undefined' && window._activeResumeId)
      || (typeof resumes !== 'undefined' && Array.isArray(resumes) && resumes.length > 0);

    if (hasProfile && hasMode && hasResume) {
      // Set flag in localStorage
      if (!settings) settings = {};
      settings.setup_complete = true;
      localStorage.setItem('bj_apply_settings', JSON.stringify(settings));

      // Persist to Supabase
      var res = await safeQuery(function() {
        return sb.from('profiles').select('user_data').eq('id', currentUser.id).maybeSingle();
      }, { label: 'apply-workflow:check-setup-complete', fallback: null });
      var ud = (res && res.user_data) || {};
      if (!ud.apply_settings) ud.apply_settings = {};
      ud.apply_settings.setup_complete = true;
      await sb.from('profiles').update({ user_data: ud }).eq('id', currentUser.id);

      if (typeof posthog !== 'undefined') posthog.capture('setup_complete', { has_eeo: !!(profile.eeo_preferences && (profile.eeo_preferences.gender || profile.eeo_preferences.ethnicity)) });
      return true;
    }
    return false;
  } catch (e) {
    reportError('apply-workflow:checkAndSetSetupComplete', e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// EXT-AS-7: DASHBOARD → WORKER ROUTING
// Recruitee stays on direct API. All other ATS route through
// headless worker (AS-1/2/3) via pending_applications polling.
// ═══════════════════════════════════════════════════════════

function _isRecruiteeJob(url) {
  return url && url.indexOf('recruitee') >= 0;
}

/**
 * Route a submission through the headless worker.
 * Sets status to approved (worker polls every 30s), then polls for result.
 * @param {Object} app - The pending_application row (must have .id, .job_url, .company_name, .job_title)
 */
async function _routeToWorker(app) {
  // PostHog: track worker queue event
  if (typeof posthog !== 'undefined') {
    posthog.capture('worker_submission_queued', {
      app_id: app.id,
      ats_source: _guessAtsSource(app.job_url),
      company: app.company_name,
      platform: 'dashboard',
    });
  }

  // Create pipeline entry immediately so job appears on Board
  // upsert won't duplicate — keyed on user_id + job_id + ats_source
  if (typeof savePipelineEntry === 'function') {
    savePipelineEntry(app.job_id, {
      stage: 'applied',
      title: app.job_title || '',
      companyName: app.company_name || '',
      company: app.company_name || '',
      jobUrl: app.job_url || '',
      atsSource: _guessAtsSource(app.job_url),
      appliedAt: new Date().toISOString(),
      savedAt: new Date().toISOString(),
    });
  }

  _renderLiveStatus(app.id, 'queued', 'Queued for submission...');

  // Start polling for worker status updates
  _pollApplicationStatus(app.id);
}

/**
 * Poll pending_applications for status changes.
 * Worker sets: approved → processing → submitted|failed
 * Polls every 3s, times out after 5 minutes.
 */
function _pollApplicationStatus(appId) {
  // Don't double-poll
  if (_activePollers[appId]) return;

  var startTime = Date.now();
  var POLL_INTERVAL = 3000; // 3s
  var POLL_TIMEOUT = 300000; // 5 minutes

  _activePollers[appId] = setInterval(async function() {
    // Timeout check
    if (Date.now() - startTime > POLL_TIMEOUT) {
      _stopPolling(appId);
      _renderLiveStatus(appId, 'timeout', 'Worker did not pick up in time. Retry from queue.');
      return;
    }

    try {
      // Use outer-scope sb (Supabase client) — do NOT reassign from window.supabase (that's the constructor)

      var { data, error } = await sb
        .from('pending_applications')
        .select('status, submitted_at, submission_error')
        .eq('id', appId)
        .single();

      if (error || !data) return;

      if (data.status === 'processing') {
        _renderLiveStatus(appId, 'processing', 'Worker is submitting...');
      } else if (data.status === 'submitted') {
        _stopPolling(appId);
        _renderLiveStatus(appId, 'submitted', 'Application submitted!');
        // Update local cache
        var localApp = pendingApplications.find(function(a) { return a.id === appId; });
        if (localApp) {
          localApp.status = 'submitted';
          localApp.submitted_at = data.submitted_at;
          _updatePipelineApplied(localApp.job_id);
        }
        if (typeof posthog !== 'undefined') {
          posthog.capture('worker_submission_complete', {
            app_id: appId,
            status: 'submitted',
            duration_ms: Date.now() - startTime,
            platform: 'dashboard',
          });
        }
        // Refresh list after a brief delay
        setTimeout(function() { loadPendingApplications().then(renderPendingApplications); }, 2000);
      } else if (data.status === 'failed') {
        _stopPolling(appId);
        _renderLiveStatus(appId, 'failed', data.submission_error || 'Submission failed. You can retry.');
        var localApp2 = pendingApplications.find(function(a) { return a.id === appId; });
        if (localApp2) localApp2.status = 'failed';
        if (typeof posthog !== 'undefined') {
          posthog.capture('worker_submission_complete', {
            app_id: appId,
            status: 'failed',
            error: data.submission_error || 'unknown',
            duration_ms: Date.now() - startTime,
            platform: 'dashboard',
          });
        }
        setTimeout(function() { loadPendingApplications().then(renderPendingApplications); }, 2000);
      }
    } catch (e) {
      reportError('apply-workflow:poll', e);
    }
  }, POLL_INTERVAL);
}

function _stopPolling(appId) {
  if (_activePollers[appId]) {
    clearInterval(_activePollers[appId]);
    delete _activePollers[appId];
  }
}

/**
 * Render live submission status inline on a pending app card.
 * Uses data-app-id to find the card and update the center section.
 */
function _renderLiveStatus(appId, status, message) {
  var card = document.querySelector('.pa-card[data-app-id="' + appId + '"]');
  if (!card) return;

  var center = card.querySelector('.pa-card-center');
  var actions = card.querySelector('.pa-card-actions');
  if (!center) return;

  var iconHtml = '';
  if (status === 'queued' || status === 'processing') {
    iconHtml = '<i data-lucide="loader-2" class="icon-md" style="animation:spin 1s linear infinite;display:inline-block;vertical-align:middle;margin-right:6px;"></i>';
  } else if (status === 'submitted') {
    iconHtml = '<i data-lucide="circle-check" class="icon-md" style="color:var(--success);display:inline-block;vertical-align:middle;margin-right:6px;"></i>';
  } else if (status === 'failed' || status === 'timeout') {
    iconHtml = '<i data-lucide="circle-x" class="icon-md" style="color:var(--error);display:inline-block;vertical-align:middle;margin-right:6px;"></i>';
  }

  center.innerHTML = '<span class="pa-live-status">' + iconHtml + '<span>' + escapeHtml(message) + '</span></span>';

  // Disable action buttons while processing
  if (status === 'queued' || status === 'processing') {
    if (actions) actions.innerHTML = '<span style="font-size:11px;color:var(--muted);">Processing...</span>';
  } else if (status === 'submitted') {
    if (actions) actions.innerHTML = '<span style="font-size:11px;color:var(--success);">Done</span>';
  }
  // For failed/timeout, leave actions as-is (retry button renders from renderPendingApplications)

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ═══════════════════════════════════════════════════════════
// AF-004: processApplyQueueByMode — mode-aware queue processing
// ═══════════════════════════════════════════════════════════

/**
 * AF-004: Batch score multiple pending apps in parallel using score-resume EF.
 * Returns map of app.id → { match_score, ... }
 */
async function _batchScorePendingApps(apps) {
  var scores = {};
  var token = await _getAuthToken();
  if (!token) return scores;

  var resume = _getActiveResume();
  var resumeText = null;

  // Attempt to get resume text from archive (same pattern as _scoreAndAutoRoute)
  try {
    if (currentUser && resume.id) {
      var archiveRes = await sb.from('resume_archive')
        .select('resume_text')
        .eq('user_id', currentUser.id)
        .eq('id', resume.id)
        .single();
      if (archiveRes.data && archiveRes.data.resume_text) {
        resumeText = archiveRes.data.resume_text;
      }
    }
  } catch(e) { /* fallback to localStorage */ }

  if (!resumeText) {
    try {
      var stored = localStorage.getItem('bj_resume_text');
      if (stored && !stored.startsWith('enc:')) resumeText = stored;
    } catch(e) { /* ignore */ }
  }

  if (!resumeText) return scores;

  // Parallel scoring: chunk into groups of 5 to avoid EF rate limits
  var CHUNK = 5;
  for (var i = 0; i < apps.length; i += CHUNK) {
    var chunk = apps.slice(i, i + CHUNK);
    var chunkJobIds = chunk.map(function(a) { return a.job_id; });

    try {
      var res = await fetch(SUPABASE_URL + '/functions/v1/score-resume', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
        },
        body: JSON.stringify({
          resume_text: resumeText,
          mode: 'batch',
          tier: 'basic',
          job_ids: chunkJobIds,
          resume_id: resume.id,
        }),
      });
      var data = await res.json();
      if (res.ok && data.results) {
        data.results.forEach(function(r) {
          // Find matching app by job_id
          var app = chunk.find(function(a) { return a.job_id === r.job_id; });
          if (app) scores[app.id] = r;
        });
      } else if (res.ok && data.match_score !== undefined && chunk.length === 1) {
        // Single-item batch returned as single result
        scores[chunk[0].id] = data;
      }
    } catch(e) {
      reportError('apply_workflow:batch_score', e);
    }
  }
  return scores;
}

/**
 * AF-004: Render batch scoring results in the pending apps panel.
 * Updates each app row with a score badge and pass/fail indicator.
 */
function _renderBatchScoreResults(apps, scores, threshold) {
  apps.forEach(function(app) {
    var scoreData = scores[app.id];
    if (!scoreData) return;
    var score = scoreData.match_score;
    if (score === undefined || score === null) return;
    app.original_score = score;

    var passes = score >= threshold;
    var row = document.querySelector('[data-app-id="' + app.id + '"]');
    if (!row) return;

    var scoreEl = row.querySelector('.pa-score');
    if (scoreEl) {
      var cls = passes ? 'high' : score >= 50 ? 'mid' : 'low';
      scoreEl.className = 'pa-score pa-score-' + cls;
      scoreEl.textContent = score;
    }

    var badge = row.querySelector('.pa-badge');
    if (badge) {
      badge.textContent = passes ? '✓ Above threshold' : '✗ Below threshold';
      badge.style.background = passes ? 'var(--success, #22c55e)' : 'var(--muted, #94a3b8)';
      badge.style.color = '#fff';
    }
  });
}

/**
 * AF-004: Mode-aware Pipeline Process Queue dispatcher.
 * Wraps processApplyQueue with mode-specific routing.
 */
async function processApplyQueueByMode() {
  // AF-002: Setup gate
  if (!isSetupComplete()) {
    showSetupGateModal();
    return;
  }

  var pending = pendingApplications.filter(function(a) {
    return a.status === APPLY_STATUS.PENDING;
  });

  if (pending.length === 0) {
    if (typeof showToast === 'function') showToast('No pending applications to process.');
    return;
  }

  var mode = userApplySettings.default_apply_mode || APPLY_MODES.MANUAL;
  var threshold = userApplySettings.default_score_threshold || 70;

  // PostHog: queue session start
  if (typeof posthog !== 'undefined') {
    posthog.capture('pipeline_queue_mode', {
      mode: mode,
      pipeline_queue_batch_size: pending.length,
    });
  }

  // AF-006: Log pipeline queue processing to activity log
  for (var qi = 0; qi < pending.length; qi++) {
    logDashboardActivity('pipeline-queued', {
      jobTitle: pending[qi].job_title || '',
      company: pending[qi].company_name || '',
      jobUrl: pending[qi].job_url || '',
      mode: mode,
      metadata: { batch_size: pending.length, surface: 'pipeline' }
    });
  }

  // ── MANUAL: delegate to existing per-item flow ────────────────────────────
  if (mode === APPLY_MODES.MANUAL) {
    return processApplyQueue();
  }

  // ── AUTO APPLY: approve all immediately, route to worker ─────────────────
  if (mode === APPLY_MODES.AUTO) {
    var autoApproved = 0;
    for (var i = 0; i < pending.length; i++) {
      var app = pending[i];
      await updatePendingApplication(app.id, {
        status: APPLY_STATUS.APPROVED,
        approval_mode: 'auto_no_approval',
        responded_at: new Date().toISOString(),
      });
      app.status = APPLY_STATUS.APPROVED;
      _routeToWorker(app);
      autoApproved++;
    }
    if (typeof showToast === 'function') {
      showToast(autoApproved + ' application(s) queued for auto-submit.');
    }
    if (typeof posthog !== 'undefined') {
      posthog.capture('pipeline_queue_auto_approved', { count: autoApproved, mode: mode });
    }
    await loadPendingApplications();
    renderPendingApplications();
    return;
  }

  // ── SCORE-GATED: score all, show results for review ───────────────────────
  if (mode === APPLY_MODES.SCORE_GATED) {
    if (typeof showToast === 'function') showToast('Scoring ' + pending.length + ' application(s)...', { duration: 10000 });
    var scores = await _batchScorePendingApps(pending);
    // Update app scores in memory
    pending.forEach(function(app) {
      if (scores[app.id] && scores[app.id].match_score !== undefined) {
        app.original_score = scores[app.id].match_score;
      }
    });
    renderPendingApplications();
    _renderBatchScoreResults(pending, scores, threshold);
    if (typeof showToast === 'function') {
      var above = pending.filter(function(a) { return a.original_score >= threshold; }).length;
      showToast('Scored ' + pending.length + ' app(s): ' + above + ' above threshold. Review below.', { duration: 6000 });
    }
    return;
  }

  // ── SCORE-GATED AUTO: score all, auto-approve above threshold ─────────────
  if (mode === APPLY_MODES.SCORE_GATED_AUTO) {
    if (typeof showToast === 'function') showToast('Scoring ' + pending.length + ' application(s)...', { duration: 10000 });
    var sgScores = await _batchScorePendingApps(pending);
    var sgAutoApproved = 0;
    var sgReview = [];

    for (var j = 0; j < pending.length; j++) {
      var sgApp = pending[j];
      var sgScore = sgScores[sgApp.id] ? sgScores[sgApp.id].match_score : null;
      sgApp.original_score = sgScore;

      if (sgScore !== null && sgScore >= threshold) {
        await updatePendingApplication(sgApp.id, {
          status: APPLY_STATUS.APPROVED,
          approval_mode: 'auto_no_approval',
          original_score: sgScore,
          responded_at: new Date().toISOString(),
        });
        sgApp.status = APPLY_STATUS.APPROVED;
        _routeToWorker(sgApp);
        sgAutoApproved++;
      } else {
        sgReview.push(sgApp);
      }
    }

    renderPendingApplications();
    _renderBatchScoreResults(pending, sgScores, threshold);
    if (typeof showToast === 'function') {
      showToast(sgAutoApproved + ' auto-approved, ' + sgReview.length + ' need review (below threshold).');
    }
    if (typeof posthog !== 'undefined') {
      posthog.capture('pipeline_queue_auto_approved', { count: sgAutoApproved, mode: mode, below_threshold: sgReview.length });
    }
    await loadPendingApplications();
    renderPendingApplications();
    return;
  }

  // ── AUTO REWRITE: score, rewrite below-threshold, submit all ─────────────
  if (mode === APPLY_MODES.AUTO_REWRITE) {
    if (typeof showToast === 'function') showToast('Scoring and rewriting ' + pending.length + ' application(s)...', { duration: 12000 });
    var rwScores = await _batchScorePendingApps(pending);
    var rwApproved = 0;

    for (var k = 0; k < pending.length; k++) {
      var rwApp = pending[k];
      var rwScore = rwScores[rwApp.id] ? rwScores[rwApp.id].match_score : null;
      rwApp.original_score = rwScore;

      if (rwScore !== null && rwScore < threshold) {
        // Queue for rewrite-then-submit (sets approval_mode = 'rewrite_review')
        await updatePendingApplication(rwApp.id, {
          original_score: rwScore,
          approval_mode: 'rewrite_review',
        });
        rwApp.approval_mode = 'rewrite_review';
      } else {
        // Above threshold or unscored: route directly
        await updatePendingApplication(rwApp.id, {
          status: APPLY_STATUS.APPROVED,
          approval_mode: 'auto_no_approval',
          original_score: rwScore,
          responded_at: new Date().toISOString(),
        });
        rwApp.status = APPLY_STATUS.APPROVED;
        _routeToWorker(rwApp);
        rwApproved++;
      }
    }

    renderPendingApplications();
    if (typeof posthog !== 'undefined') {
      posthog.capture('pipeline_queue_auto_approved', { count: rwApproved, mode: mode });
    }
    if (typeof showToast === 'function') {
      var rwRewrite = pending.length - rwApproved;
      showToast(rwApproved + ' queued directly, ' + rwRewrite + ' queued for rewrite before submit.');
    }
    await loadPendingApplications();
    renderPendingApplications();
    return;
  }

  // ── FULL AUTOPILOT: rewrite + submit all ─────────────────────────────────
  if (mode === APPLY_MODES.AUTOPILOT) {
    if (typeof showToast === 'function') showToast('Full autopilot: rewriting and submitting ' + pending.length + ' application(s)...', { duration: 12000 });

    for (var m = 0; m < pending.length; m++) {
      var apApp = pending[m];
      await updatePendingApplication(apApp.id, {
        status: APPLY_STATUS.APPROVED,
        approval_mode: 'auto_no_approval',
        responded_at: new Date().toISOString(),
      });
      apApp.status = APPLY_STATUS.APPROVED;
      _routeToWorker(apApp);
    }

    if (typeof posthog !== 'undefined') {
      posthog.capture('pipeline_queue_auto_approved', { count: pending.length, mode: mode });
    }
    if (typeof showToast === 'function') {
      showToast(pending.length + ' application(s) submitted via autopilot.');
    }
    await loadPendingApplications();
    renderPendingApplications();
    return;
  }

  // Fallback: delegate to original processApplyQueue
  return processApplyQueue();
}

/**
 * EXT-AS-7: Bulk process queue — approve all pending apps and route to worker.
 * Called from Pipeline Process Queue button.
 */
async function processApplyQueue() {
  // AF-002: Setup gate — block if setup not complete
  if (!isSetupComplete()) {
    showSetupGateModal();
    return;
  }
  var pending = pendingApplications.filter(function(a) {
    return a.status === APPLY_STATUS.PENDING;
  });

  if (pending.length === 0) {
    if (typeof showToast === 'function') showToast('No pending applications to process.');
    return;
  }

  var processed = 0;
  var directCount = 0;
  var workerCount = 0;

  for (var i = 0; i < pending.length; i++) {
    var app = pending[i];

    // Set to approved
    await updatePendingApplication(app.id, {
      status: APPLY_STATUS.APPROVED,
      responded_at: new Date().toISOString(),
    });
    app.status = APPLY_STATUS.APPROVED;

    if (_isRecruiteeJob(app.job_url)) {
      // Recruitee: direct API submission
      var resume = _getActiveResume();
      var result = await callSubmitApplication(app, resume.id, resume.filename);
      if (result.ok) {
        _updatePipelineApplied(app.job_id);
        directCount++;
      }
    } else {
      // All others: worker picks up approved rows
      _routeToWorker(app);
      workerCount++;
    }
    processed++;
  }

  if (typeof showToast === 'function') {
    showToast('Processing ' + processed + ' application(s): ' +
      (directCount > 0 ? directCount + ' direct, ' : '') +
      (workerCount > 0 ? workerCount + ' queued for worker.' : ''));
  }

  if (typeof posthog !== 'undefined') {
    posthog.capture('bulk_queue_processed', {
      total: processed,
      direct_count: directCount,
      worker_count: workerCount,
      platform: 'dashboard',
    });
  }

  await loadPendingApplications();
  renderPendingApplications();
}

function loadApplySettings() {
  try {
    var raw = localStorage.getItem('bj_apply_settings');
    if (raw) userApplySettings = Object.assign({}, DEFAULT_APPLY_SETTINGS, JSON.parse(raw));
  } catch(e) { reportError('apply-workflow:apply-workflow', e); }
}

function saveApplySettings() {
  try { localStorage.setItem('bj_apply_settings', JSON.stringify(userApplySettings)); } catch(e) { reportError('apply-workflow:apply-workflow', e); }
  // EXT-AS-1: Background sync to Supabase for worker + extension access
  _debouncedApplySettingsSync();
}

var _applySettingsSyncTimer = null;
function _debouncedApplySettingsSync() {
  clearTimeout(_applySettingsSyncTimer);
  _applySettingsSyncTimer = setTimeout(function() {
    if (typeof syncApplySettingsToSupabase === 'function') {
      syncApplySettingsToSupabase();
    }
    if (typeof _updateApplySettingsDisplay === 'function') {
      _updateApplySettingsDisplay();
    }
  }, 2000);
}

// ─── Supabase-backed pending applications ───────────────────

async function loadPendingApplications() {
  if (!currentUser) {
    pendingApplications = [];
    return;
  }
  try {
    var { data, error } = await sb
      .from('pending_applications')
      .select('*')
      .eq('user_id', currentUser.id)
      .in('status', ['pending', 'approved', 'processing', 'failed'])
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[apply-workflow] Load pending apps error:', error.message);
      pendingApplications = [];
    } else {
      pendingApplications = data || [];
    }
  } catch (e) {
    reportError('apply_workflow', e);
    console.error('[apply-workflow] Load pending apps exception:', e);
    pendingApplications = [];
  }
}

async function savePendingApplication(app) {
  if (!currentUser) return null;
  try {
    var { data, error } = await sb
      .from('pending_applications')
      .insert(app)
      .select()
      .single();
    if (error) {
      console.error('[apply-workflow] Insert pending app error:', error.message);
      if (typeof showToast === 'function') showToast('Failed to save application: ' + error.message, { type: 'error' });
      return null;
    }
    return data;
  } catch (e) {
    reportError('apply_workflow', e);
    console.error('[apply-workflow] Insert pending app exception:', e);
    return null;
  }
}

async function updatePendingApplication(id, updates) {
  if (!currentUser) return false;
  try {
    var { error } = await sb
      .from('pending_applications')
      .update(updates)
      .eq('id', id)
      .eq('user_id', currentUser.id);
    if (error) {
      console.error('[apply-workflow] Update pending app error:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    reportError('apply_workflow', e);
    console.error('[apply-workflow] Update pending app exception:', e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// HELPER: Get auth token for EF calls
// ═══════════════════════════════════════════════════════════

async function _getAuthToken() {
  var session = await sb.auth.getSession();
  return session?.data?.session?.access_token || null;
}

// ═══════════════════════════════════════════════════════════
// HELPER: Call submit-application Edge Function
// Routes: Recruitee (real API), others (mock fallback)
// ═══════════════════════════════════════════════════════════

async function callSubmitApplication(pendingApp, resumeFileId, resumeFilename) {
  var token = await _getAuthToken();
  if (!token) {
    if (typeof showToast === 'function') showToast('Session expired. Please log in again.', { type: 'error' });
    return { ok: false, error: 'no_auth' };
  }

  var idempotencyKey = crypto.randomUUID();

  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/submit-application', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
      },
      signal: AbortSignal.timeout(30000), // 30s client timeout
      body: JSON.stringify({
        job_id: pendingApp.job_id,
        ats_source: _guessAtsSource(pendingApp.job_url),
        ats_job_url: pendingApp.job_url || '',
        resume_file_id: resumeFileId || crypto.randomUUID(),
        resume_filename: resumeFilename || 'resume.pdf',
        resume_version: pendingApp.rewritten_resume_id ? 'rewritten' : 'original',
        rewrite_id: pendingApp.rewritten_resume_id || null,
        applicant: {
          name: currentUser.user_metadata?.full_name || currentUser.email || '',
          email: currentUser.email || '',
        },
        apply_mode: pendingApp.approval_mode || 'manual',
        score: pendingApp.original_score || null,
        was_rewritten: !!pendingApp.rewritten_resume_id,
        filter_id: pendingApp.filter_id || null,
        pending_application_id: pendingApp.id,
        idempotency_key: idempotencyKey,
      }),
    });

    var data = await res.json();

    if (res.ok) {
      return { ok: true, data: data };
    } else if (res.status === 422) {
      return { ok: false, error: 'rejected', detail: data.detail || data.error || 'Application rejected by ATS' };
    } else {
      return { ok: false, error: data.error || 'submission_failed' };
    }
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      return { ok: false, error: 'timeout' };
    }
    reportError('apply_workflow', e);
    console.error('[apply-workflow] submit-application error:', e);
    return { ok: false, error: 'network_error' };
  }
}

// AIS-F3-S1: Fill Status Panel — surface auto-apply progress/errors to Applications page
// ═══════════════════════════════════════════════════════════════════════════════════════
function _updateFillStatusPanel(opts) {
  // opts: { status: 'submitting'|'queued'|'success'|'error', jobTitle, companyName, error, action }
  try {
    var panel = document.getElementById('ais-fill-status-panel');
    if (!panel) return;

    var statusConfig = {
      submitting: { color: 'var(--accent)', icon: 'loader-2', label: 'Submitting…' },
      queued:     { color: 'var(--accent)', icon: 'clock',    label: 'Queued for worker' },
      success:    { color: 'var(--green)',  icon: 'circle-check', label: 'Submitted!' },
      error:      { color: 'var(--warm)',   icon: 'circle-x',     label: 'Failed' },
    };
    var cfg = statusConfig[opts.status] || statusConfig.submitting;
    var jobLabel = opts.jobTitle ? (opts.jobTitle + (opts.companyName ? ' @ ' + opts.companyName : '')) : (opts.companyName || 'Job');

    var actionHtml = '';
    if (opts.status === 'error' && opts.action) {
      actionHtml = '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">' + escapeHtml(opts.action) + ' <a href="#" onclick="switchPage(\'applications\');return false;" style="color:var(--accent);">View Pending</a></div>';
    }
    if (opts.status === 'success') {
      actionHtml = '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;"><a href="#" onclick="switchPage(\'applications\');return false;" style="color:var(--accent);">View in Pipeline →</a></div>';
    }
    var errorHtml = (opts.status === 'error' && opts.error) ? '<div style="font-size:11px;color:var(--warm);margin-top:2px;">' + escapeHtml(opts.error) + '</div>' : '';

    panel.style.display = 'block';
    panel.innerHTML =
      '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;background:var(--bg-card);border-radius:8px;border-left:3px solid ' + cfg.color + ';">' +
        '<i data-lucide="' + cfg.icon + '" style="width:16px;height:16px;flex-shrink:0;stroke:' + cfg.color + ';margin-top:2px;' + (opts.status === 'submitting' || opts.status === 'queued' ? 'animation:spin 1s linear infinite;' : '') + '"></i>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:12px;font-weight:600;color:var(--text);">' + cfg.label + ': ' + escapeHtml(jobLabel) + '</div>' +
          errorHtml + actionHtml +
        '</div>' +
        '<button onclick="document.getElementById(\'ais-fill-status-panel\').style.display=\'none\';" style="background:none;border:none;cursor:pointer;padding:0;color:var(--text-muted);font-size:16px;line-height:1;">×</button>' +
      '</div>';

    if (typeof window.refreshIcons === 'function') window.refreshIcons();

    // Auto-clear success after 8 seconds
    if (opts.status === 'success') {
      setTimeout(function() {
        var p = document.getElementById('ais-fill-status-panel');
        if (p) p.style.display = 'none';
      }, 8000);
    }
  } catch(e) {
    reportError('apply-workflow:_updateFillStatusPanel', e);
  }
}

function _guessAtsSource(url) {
  if (!url) return 'greenhouse';
  if (url.indexOf('greenhouse') >= 0) return 'greenhouse';
  if (url.indexOf('lever.co') >= 0) return 'lever';
  if (url.indexOf('ashby') >= 0) return 'ashby';
  if (url.indexOf('workable') >= 0) return 'workable';
  if (url.indexOf('recruitee') >= 0) return 'recruitee';
  if (url.indexOf('usajobs') >= 0) return 'usajobs';
  return 'greenhouse';
}

// ═══════════════════════════════════════════════════════════
// HELPER: Get active resume for current user
// ═══════════════════════════════════════════════════════════

function _getActiveResume() {
  // Check resumes module for selected resume
  if (typeof window._activeResumeId !== 'undefined' && window._activeResumeId) {
    var rid = window._activeResumeId;
    // res_sync_ IDs are local stubs — resolve to real archiveId
    if (rid.startsWith('res_sync_') && typeof resumes !== 'undefined') {
      var match = resumes.find(function(r) { return r.id === rid; });
      if (match && match.archiveId) rid = match.archiveId;
    }
    return { id: rid, filename: window._activeResumeFilename || 'resume.pdf' };
  }
  // Fallback: check localStorage
  try {
    var raw = localStorage.getItem('bj_resumes'); if (raw && raw.startsWith('enc:')) raw = null;
    if (raw) {
      var resumes = JSON.parse(raw);
      if (resumes.length > 0) {
        var r0 = resumes[0];
        // res_sync_ IDs are local stubs — use archiveId (real DB UUID) when available
        var realId = (r0.id && !r0.id.startsWith('res_sync_')) ? r0.id : (r0.archiveId || crypto.randomUUID());
        return { id: realId, filename: r0.name || 'resume.pdf' };
      }
    }
  } catch(e) { reportError('apply-workflow:apply-workflow', e); }
  return { id: crypto.randomUUID(), filename: 'resume.pdf' };
}

// ═══════════════════════════════════════════════════════════
// D6: NOTIFICATION HELPER — fires apply workflow notifications
// ═══════════════════════════════════════════════════════════

async function _fireApplyNotification(type, opts) {
  if (!currentUser) return;
  var token = await _getAuthToken();
  if (!token) return;

  try {
    await fetch(SUPABASE_URL + '/functions/v1/send-notification', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
      },
      body: JSON.stringify(Object.assign({
        user_id: currentUser.id,
        notification_type: type,
      }, opts)),
    });
  } catch(e) { reportError('apply-workflow', e); console.error('[apply-workflow] Notification send error:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// SCORE GATE MODAL
// ═══════════════════════════════════════════════════════════

function showScoreGateModal(jobId, jobTitle, companyName, jobUrl, scoreResult) {
  // Remove any existing modal
  var existing = document.getElementById('score-gate-modal');
  if (existing) existing.remove();

  var hasScore = scoreResult && typeof scoreResult.match_score === 'number';
  var score = hasScore ? scoreResult.match_score : null;
  var threshold = userApplySettings.default_score_threshold;
  var isAbove = hasScore && score >= threshold;

  // If score is above threshold, just proceed
  if (isAbove) {
    proceedToApply(jobId, jobTitle, companyName, jobUrl);
    return;
  }

  var scoreDisplay = hasScore ? score : '?';
  var scoreClass = hasScore ? (score >= 75 ? 'high' : score >= 50 ? 'mid' : 'low') : 'none';
  var scoreLabel = hasScore ? (score >= 75 ? 'Strong' : score >= 50 ? 'Partial' : 'Weak') : 'Unscored';

  var breakdownHtml = '';
  if (scoreResult && scoreResult.recommendations) {
    var missing = scoreResult.recommendations.missing_skills || [];
    var strong = scoreResult.recommendations.strong_matches || [];
    breakdownHtml = '<div class="sg-breakdown">';
    if (scoreResult.analysis_summary) {
      breakdownHtml += '<div class="sg-summary">' + escapeHtml(scoreResult.analysis_summary) + '</div>';
    }
    if (strong.length > 0) {
      breakdownHtml += '<div class="sg-strong"><span class="sg-strong-label">✓ Matches:</span> ' +
        strong.slice(0, 5).map(function(s) { return '<span class="sg-strong-chip">' + escapeHtml(s) + '</span>'; }).join(' ') +
        '</div>';
    }
    if (missing.length > 0) {
      breakdownHtml += '<div class="sg-missing"><span class="sg-missing-label">Missing:</span> ' + 
        missing.map(function(s) { return '<span class="sg-missing-chip">' + escapeHtml(s) + '</span>'; }).join(' ') + 
        '</div>';
    }
    breakdownHtml += '</div>';
  }

  var modal = document.createElement('div');
  modal.id = 'score-gate-modal';
  modal.className = 'sg-overlay';
  modal.innerHTML = 
    '<div class="sg-modal">' +
      '<div class="sg-header">' +
        '<div class="sg-title">Resume Match Check</div>' +
        '<button class="sg-close" onclick="closeScoreGateModal()">&times;</button>' +
      '</div>' +
      '<div class="sg-body">' +
        '<div class="sg-job-info">' +
          '<div class="sg-job-title">' + escapeHtml(jobTitle) + '</div>' +
          '<div class="sg-job-company">' + escapeHtml(companyName) + '</div>' +
        '</div>' +
        '<div class="sg-score-row">' +
          '<div class="sg-score-badge sg-score-' + scoreClass + '">' +
            '<div class="sg-score-val">' + scoreDisplay + '</div>' +
            '<div class="sg-score-label">' + scoreLabel + '</div>' +
          '</div>' +
          '<div class="sg-threshold-info">' +
            (hasScore 
              ? 'Your resume scores <strong>' + score + '</strong> against this job. Your threshold is <strong>' + threshold + '</strong>.'
              : 'This job hasn\'t been scored against your resume yet.') +
          '</div>' +
        '</div>' +
        breakdownHtml +
      '</div>' +
      '<div class="sg-footer">' +
        '<button class="sg-btn sg-btn-secondary" onclick="closeScoreGateModal()">Cancel</button>' +
        (hasScore ? '' : '<button class="sg-btn sg-btn-accent" onclick="scoreAndRecheck(\'' + escapeHtml(jobId) + '\',\'' + escapeHtml(jobTitle).replace(/'/g, "\\'") + '\',\'' + escapeHtml(companyName).replace(/'/g, "\\'") + '\',\'' + escapeHtml(jobUrl) + '\')">Score Now (1 credit)</button>') +
        '<button class="sg-btn sg-btn-rewrite" onclick="triggerRewrite(\'' + escapeHtml(jobId) + '\',\'' + escapeHtml(jobTitle).replace(/'/g, "\\'") + '\',\'' + escapeHtml(companyName).replace(/'/g, "\\'") + '\')">AI Rewrite (3 credits)</button>' +
        '<button class="sg-btn sg-btn-primary" onclick="proceedToApply(\'' + escapeHtml(jobId) + '\',\'' + escapeHtml(jobTitle).replace(/'/g, "\\'") + '\',\'' + escapeHtml(companyName).replace(/'/g, "\\'") + '\',\'' + escapeHtml(jobUrl) + '\')">Apply Anyway</button>' +
      '</div>' +
      '<div class="sg-remember">' +
        '<label><input type="checkbox" id="sg-remember-check"> Don\'t show this for scores above <input type="number" id="sg-remember-val" value="' + threshold + '" min="0" max="100" style="width:48px;text-align:center;"></label>' +
      '</div>' +
    '</div>';

  document.body.appendChild(modal);

  // Close on backdrop click
  modal.addEventListener('click', function(e) {
    if (e.target === modal) closeScoreGateModal();
  });
}

function closeScoreGateModal() {
  var modal = document.getElementById('score-gate-modal');
  if (modal) {
    // Check if user updated their threshold
    var check = document.getElementById('sg-remember-check');
    var val = document.getElementById('sg-remember-val');
    if (check && check.checked && val) {
      var newThreshold = parseInt(val.value);
      if (!isNaN(newThreshold) && newThreshold >= 0 && newThreshold <= 100) {
        userApplySettings.default_score_threshold = newThreshold;
        saveApplySettings();
      }
    }
    modal.remove();
  }
}

// ═══════════════════════════════════════════════════════════
// D5: scoreAndRecheck — Call score-resume EF (1 credit)
// ═══════════════════════════════════════════════════════════

async function scoreAndRecheck(jobId, jobTitle, companyName, jobUrl) {
  if (!currentUser) {
    if (typeof showToast === 'function') showToast('Please log in first.', { type: 'error' });
    return;
  }

  // Credit check: score = 1 credit
  var ent = await checkEntitlement('resume_grading', 0);
  if (!ent.allowed) {
    if (typeof showUpgradePrompt === 'function') showUpgradePrompt('Resume Scoring', ent);
    else if (typeof showToast === 'function') showToast('Upgrade required for resume scoring.', { type: 'error' });
    return;
  }

  var { data: balance } = await sb.rpc('get_credit_balance', { p_user_id: currentUser.id });
  if (balance < 1) {
    if (typeof showToast === 'function') showToast('Scoring costs 1 credit. You have ' + (balance || 0) + '. Purchase more in Settings.', { type: 'error', duration: 5000 });
    return;
  }

  // Get active resume text
  var resume = _getActiveResume();
  var resumeText = '';
  try {
    var { data: archiveData } = await sb
      .from('resume_archive')
      .select('parsed_text')
      .eq('id', resume.id)
      .single();
    resumeText = archiveData?.parsed_text || '';
  } catch(e) { reportError('apply-workflow:apply-workflow', e); }

  if (!resumeText) {
    // Fallback: check localStorage
    try {
      var raw = localStorage.getItem('bj_resumes'); if (raw && raw.startsWith('enc:')) raw = null;
      if (raw) {
        var resumes = JSON.parse(raw);
        if (resumes.length > 0) resumeText = resumes[0].text || '';
      }
    } catch(e) { reportError('apply-workflow:apply-workflow', e); }
  }

  if (!resumeText) {
    if (typeof showToast === 'function') showToast('No resume text found. Upload a resume first on the Resumes page.', { type: 'error', duration: 5000 });
    return;
  }

  // Close current modal, show loading
  closeScoreGateModal();
  if (typeof showToast === 'function') showToast('Scoring your resume against this job... (1 credit)', { duration: 8000 });

  // Call score-resume EF in single mode
  var token = await _getAuthToken();
  if (!token) {
    if (typeof showToast === 'function') showToast('Session expired. Please log in again.', { type: 'error' });
    return;
  }

  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/score-resume', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
      },
      body: JSON.stringify({
        resume_text: resumeText,
        mode: 'single',
        tier: 'basic',
        job_ids: [jobId],
        resume_id: resume.id,
      }),
    });

    var data = await res.json();

    if (!res.ok || data.error) {
      if (typeof showToast === 'function') showToast('Scoring failed: ' + (data.error || 'Unknown error'), { type: 'error' });
      return;
    }

    // Cache the score for this job
    if (typeof jobMatchScores === 'undefined') window.jobMatchScores = {};
    jobMatchScores[jobId] = data;

    if (typeof showToast === 'function') showToast('Score: ' + (data.match_score || '?') + '/100', { duration: 3000 });

    // Re-show the Score Gate Modal with the new score
    showScoreGateModal(jobId, jobTitle || '', companyName || '', jobUrl || '', data);

  } catch (e) {
    reportError('apply_workflow', e);
    console.error('[apply-workflow] scoreAndRecheck error:', e);
    if (typeof showToast === 'function') showToast('Scoring failed. Please try again.', { type: 'error' });
  }
}

// ═══════════════════════════════════════════════════════════
// D5: triggerRewrite — Opens existing rewrite panel (3 credits)
// ═══════════════════════════════════════════════════════════

async function triggerRewrite(jobId, jobTitle, companyName) {
  if (!currentUser) {
    if (typeof showToast === 'function') showToast('Please log in first.', { type: 'error' });
    return;
  }

  // Credit check: rewrite = 3 credits (Pro only)
  if (typeof _rwCanRewrite === 'function') {
    var canRewrite = await _rwCanRewrite();
    if (!canRewrite) return; // _rwCanRewrite already shows error toasts
  } else {
    // Fallback credit check if rewrite.js not loaded
    var ent = await checkEntitlement('ai_rewrite', 0);
    if (!ent.allowed) {
      if (typeof showUpgradePrompt === 'function') showUpgradePrompt('AI Resume Rewrite', ent);
      else if (typeof showToast === 'function') showToast('AI Rewrite requires Pro plan.', { type: 'error' });
      return;
    }
    var { data: balance } = await sb.rpc('get_credit_balance', { p_user_id: currentUser.id });
    if (balance < 3) {
      if (typeof showToast === 'function') showToast('Rewrite costs 3 credits. You have ' + (balance || 0) + '.', { type: 'error', duration: 5000 });
      return;
    }
  }

  closeScoreGateModal();

  // Get active resume
  var resume = _getActiveResume();
  var matchScore = null;
  if (typeof jobMatchScores !== 'undefined' && jobMatchScores[jobId]) {
    matchScore = jobMatchScores[jobId].match_score || null;
  }

  // Open the existing rewrite panel (from rewrite.js)
  if (typeof openRewritePanel === 'function') {
    openRewritePanel(jobId, jobTitle || '', companyName || '', resume.id, matchScore);
  } else {
    if (typeof showToast === 'function') showToast('Rewrite panel not available. Please reload the page.', { type: 'error' });
  }
}

// ═══════════════════════════════════════════════════════════
// D4: proceedToApply — Create pending_applications row + submit
// ═══════════════════════════════════════════════════════════

async function proceedToApply(jobId, jobTitle, companyName, jobUrl) {
  // AF-002: Setup gate — block if setup not complete
  if (!isSetupComplete()) {
    showSetupGateModal();
    return;
  }
  closeScoreGateModal();

  if (_applySubmitting) return;
  _applySubmitting = true;

  var mode = getApplyModeForJob(jobId);

  // ── AIS-F3-S1: Tier gate — block auto modes for Free users or exhausted Starter ──
  var _isAutoMode = mode !== APPLY_MODES.MANUAL && mode !== APPLY_MODES.SCORE_GATED;
  if (_isAutoMode && typeof checkAutoApplyTierGate === 'function') {
    var _gateResult = checkAutoApplyTierGate();
    if (!_gateResult.allowed) {
      var _gateMsg = _gateResult.limit === 0
        ? 'Auto-apply requires a Starter or Pro plan.'
        : 'You\'ve reached your ' + _gateResult.limit + ' auto-apply limit for today. Upgrade to Pro for unlimited.';
      if (typeof showToast === 'function') showToast(_gateMsg, { type: 'warning', duration: 6000 });
      if (typeof window.showTierGate === 'function') {
        var _gateEl = document.getElementById('app-tab-pipeline') || document.getElementById('page-applications');
        if (_gateEl) window.showTierGate(_gateEl, _gateResult.requiresTier, _gateMsg);
      }
      if (typeof capturePostHog === 'function') capturePostHog('auto_apply_tier_blocked', { mode: mode, tier: _gateResult.tier, limit: _gateResult.limit });
      _applySubmitting = false;
      return;
    }
  }

  // ── Mode 1: Manual — just open URL, update pipeline ──
  if (mode === APPLY_MODES.MANUAL) {
    if (jobUrl) window.open(jobUrl, '_blank');
    _updatePipelineApplied(jobId);
    if (typeof showToast === 'function') showToast('Opened application page for ' + (companyName || 'this job'));
    _applySubmitting = false;
    return;
  }

  // ── Modes 2-6: Create pending_application + submit via mock ATS ──
  if (!currentUser) {
    if (typeof showToast === 'function') showToast('Please log in to apply.', { type: 'error' });
    _applySubmitting = false;
    return;
  }

  if (typeof showToast === 'function') showToast('Submitting application...', { duration: 10000 });

  // Compute approval mode
  var approvalMode = 'manual';
  if (mode === APPLY_MODES.AUTO) approvalMode = 'auto_no_approval';
  else if (mode === APPLY_MODES.SCORE_GATED_AUTO) approvalMode = userApplySettings.default_approval_required ? 'auto_with_approval' : 'auto_no_approval';
  else if (mode === APPLY_MODES.AUTO_REWRITE) approvalMode = 'rewrite_review';
  else if (mode === APPLY_MODES.AUTOPILOT) approvalMode = 'auto_no_approval';

  // Get score if available
  var scoreResult = getScoreForJob(jobId);
  var originalScore = scoreResult ? (scoreResult.match_score || null) : null;

  // Compute expiry
  var expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + (userApplySettings.auto_expire_hours || 48));

  // Get resume
  var resume = _getActiveResume();

  // AIS-F8-S2: Fetch latest cover letter for this job (auto-attach)
  var coverLetterId = null;
  var coverLetterContent = null;
  if (jobId && currentUser) {
    try {
      var clRes = await sb.from('cover_letters').select('id,content').eq('user_id', currentUser.id).eq('job_id', jobId).order('version', { ascending: false }).limit(1).maybeSingle();
      if (clRes.data) { coverLetterId = clRes.data.id; coverLetterContent = clRes.data.content; }
    } catch(_e) { /* non-fatal */ }
  }

  // Create pending_applications row
  var pendingRow = {
    user_id: currentUser.id,
    job_id: jobId,
    resume_id: resume.id,
    original_score: originalScore,
    score_result: scoreResult || null,
    status: 'approved', // Skip pending for manual apply-anyway clicks
    approval_mode: approvalMode,
    job_title: jobTitle || '',
    company_name: companyName || '',
    job_url: jobUrl || '',
    expires_at: expiresAt.toISOString(),
    idempotency_key: crypto.randomUUID(),
    ...(coverLetterId ? { cover_letter_id: coverLetterId } : {}),
  };

  var savedApp = await savePendingApplication(pendingRow);
  if (!savedApp) {
    if (typeof showToast === 'function') showToast('Failed to create application record.', { type: 'error' });
    _applySubmitting = false;
    return;
  }

  // AIS-F3-S1: Emit PostHog event for auto-apply consumer trigger
  if (_isAutoMode && typeof capturePostHog === 'function') {
    capturePostHog('auto_apply_consumer_triggered', {
      job_id: jobId,
      mode: mode,
      tier: (typeof getUserTier === 'function') ? getUserTier() : 'unknown',
      platform: _guessAtsSource(jobUrl) || 'unknown',
    });
  }

  // AIS-F3-S1: Update fill status panel
  _updateFillStatusPanel({ status: 'submitting', jobTitle: jobTitle, companyName: companyName, mode: mode });

  // Create pipeline entry immediately so job appears on Board
  // upsert won't duplicate — keyed on user_id + job_id + ats_source
  if (typeof savePipelineEntry === 'function') {
    savePipelineEntry(jobId, {
      stage: 'applied',
      title: jobTitle || '',
      companyName: companyName || '',
      company: companyName || '',
      jobUrl: jobUrl || '',
      atsSource: _guessAtsSource(jobUrl),
      appliedAt: new Date().toISOString(),
      savedAt: new Date().toISOString(),
    });
  }

  // EXT-AS-7: Route through worker or direct API
  if (_isRecruiteeJob(jobUrl)) {
    // Recruitee: direct API (faster, no browser needed)
    var result = await callSubmitApplication(savedApp, resume.id, resume.filename);

    if (result.ok) {
      if (_isAutoMode && typeof incrementAutoApplyDailyCount === 'function') incrementAutoApplyDailyCount();
      _updateFillStatusPanel({ status: 'success', jobTitle: jobTitle, companyName: companyName });
      _updatePipelineApplied(jobId);
      if (typeof showToast === 'function') showToast('Applied to ' + (companyName || 'this job') + '!', { type: 'success' });
      _fireApplyNotification('apply_auto_submitted', {
        subject: 'Applied: ' + (jobTitle || 'Job') + ' at ' + (companyName || 'Company'),
        html: '<p>Your resume was submitted for <strong>' + escapeHtml(jobTitle || '') + '</strong> at <strong>' + escapeHtml(companyName || '') + '</strong>.</p>',
        job_id: jobId,
        job_title: jobTitle,
        company_name: companyName,
      });
    } else if (result.error === 'rejected') {
      _updateFillStatusPanel({ status: 'error', jobTitle: jobTitle, companyName: companyName, error: 'Application rejected', action: 'Apply manually from the job card.' });
      if (typeof showToast === 'function') showToast('Application rejected: ' + (result.detail || 'Unknown reason') + '. You can retry.', { type: 'error', duration: 6000 });
    } else if (result.error === 'timeout') {
      _updateFillStatusPanel({ status: 'error', jobTitle: jobTitle, companyName: companyName, error: 'ATS timed out', action: 'Retry from Pending Applications.' });
      if (typeof showToast === 'function') showToast('ATS timed out. Your application was saved — you can retry.', { type: 'error', duration: 6000 });
    } else {
      _updateFillStatusPanel({ status: 'error', jobTitle: jobTitle, companyName: companyName, error: result.error || 'Submission failed', action: 'Retry from Pending Applications.' });
      if (typeof showToast === 'function') showToast('Submission failed: ' + (result.error || 'Unknown error') + '. Retry from Pending Applications.', { type: 'error', duration: 6000 });
    }
  } else {
    // All other ATS: route through headless worker (AS-1/2/3)
    if (_isAutoMode && typeof incrementAutoApplyDailyCount === 'function') incrementAutoApplyDailyCount();
    _updateFillStatusPanel({ status: 'queued', jobTitle: jobTitle, companyName: companyName });
    if (typeof showToast === 'function') showToast('Application queued — worker will submit to ' + (companyName || 'ATS') + '.', { duration: 5000 });
    await _routeToWorker(savedApp);
  }

  // Refresh pending applications list
  await loadPendingApplications();
  renderPendingApplications();
  _applySubmitting = false;
}

function _updatePipelineApplied(jobId) {
  // Ensure it's in pipeline
  if (typeof toggleSaveJob === 'function') {
    if (typeof savedJobIds !== 'undefined' && savedJobIds.indexOf(jobId) < 0) {
      toggleSaveJob(jobId, null);
    }
  }
  // Update pipeline stage to applied
  var meta = typeof getPipelineMeta === 'function' ? getPipelineMeta() : {};
  if (!meta[jobId]) meta[jobId] = { stage: 'applied', savedAt: new Date().toISOString() };
  meta[jobId].stage = 'applied';
  meta[jobId].appliedAt = new Date().toISOString();
  if (typeof savePipelineMeta === 'function') savePipelineMeta(meta);
}

// ═══════════════════════════════════════════════════════════
// ENHANCED APPLY BUTTON
// ═══════════════════════════════════════════════════════════

/**
 * Called when user clicks Apply on a job row.
 * Checks apply mode and score to decide whether to show gate.
 */
function handleApplyClick(jobId, jobTitle, companyName, jobUrl, btn) {
  var mode = getApplyModeForJob(jobId);
  
  if (mode === APPLY_MODES.MANUAL) {
    // Mode 1: Direct apply, no gate
    proceedToApply(jobId, jobTitle, companyName, jobUrl);
    return;
  }

  // Modes 2+: Check score — try cache first, then fetch from DB
  var scoreResult = getScoreForJob(jobId);
  if (scoreResult) {
    _handleApplyWithScore(mode, jobId, jobTitle, companyName, jobUrl, scoreResult);
  } else {
    // Item #12: Fetch existing JD match score from DB before showing modal
    _fetchJdMatchScore(jobId).then(function(dbScore) {
      _handleApplyWithScore(mode, jobId, jobTitle, companyName, jobUrl, dbScore);
    });
  }
}

function _handleApplyWithScore(mode, jobId, jobTitle, companyName, jobUrl, scoreResult) {
  var hasScore = scoreResult && typeof scoreResult.match_score === 'number';
  var score = hasScore ? scoreResult.match_score : null;
  var threshold = userApplySettings.default_score_threshold;

  if (mode === APPLY_MODES.SCORE_GATED) {
    if (!hasScore || score < threshold) {
      showScoreGateModal(jobId, jobTitle, companyName, jobUrl, scoreResult);
    } else {
      proceedToApply(jobId, jobTitle, companyName, jobUrl);
    }
    return;
  }

  // Modes 3-6: Auto modes (handled by auto-apply engine, not manual click)
  proceedToApply(jobId, jobTitle, companyName, jobUrl);
}

// Item #12: Fetch JD match score from resume_scores table if available
async function _fetchJdMatchScore(jobId) {
  try {
    if (!currentUser?.id) return null;
    var { data, error } = await sb
      .from('resume_scores')
      .select('match_score, analysis_summary, recommendations, scored_at')
      .eq('user_id', currentUser.id)
      .eq('job_id', jobId)
      .order('scored_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    // Cache it for future use
    if (typeof jobMatchScores === 'undefined') window.jobMatchScores = {};
    jobMatchScores[jobId] = data;
    return data;
  } catch (e) {
    reportError('apply_workflow', e);
    console.warn('[apply-workflow] JD match fetch failed:', e);
    return null;
  }
}

function getApplyModeForJob(jobId) {
  // Check if job belongs to a filter with specific apply settings
  // For now, return the global default
  return userApplySettings.default_apply_mode || APPLY_MODES.MANUAL;
}

function getScoreForJob(jobId) {
  // Check if we have a cached score for this job
  if (typeof jobMatchScores !== 'undefined' && jobMatchScores[jobId]) {
    var s = jobMatchScores[jobId];
    if (typeof s === 'object') return s;
    if (typeof s === 'number') return { match_score: s };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// AF-003: Feed Apply Mode Routing
// ═══════════════════════════════════════════════════════════

async function handleFeedApply(jobId, jobUrl, jobData) {
  // AF-002: Setup gate
  if (!isSetupComplete()) {
    showSetupGateModal();
    return;
  }

  var jobTitle = (jobData && jobData.title) || '';
  var companyName = (jobData && jobData.company_name) || '';

  // PostHog
  if (typeof posthog !== 'undefined') {
    posthog.capture('feed_apply_initiated', { job_id: jobId });
  }

  // ── Step 1: Resolve resume for this job's filter ──
  var resume = _resolveResumeForJob(jobId);

  if (resume === 'no_resumes') {
    // No resumes exist → prompt upload
    _showResumeNeededModal(jobId, jobTitle, companyName, jobUrl, 'upload');
    return;
  }

  if (resume === 'no_match') {
    // Resumes exist but none assigned to this filter → show picker
    _showResumeNeededModal(jobId, jobTitle, companyName, jobUrl, 'pick');
    return;
  }

  // ── Step 2: We have a resume — submit via worker ──
  await _submitViaWorker(jobId, jobTitle, companyName, jobUrl, resume);
}

// Resolve the right resume for a job based on its matching filter
function _resolveResumeForJob(jobId) {
  var allResumes = [];
  try {
    var raw = localStorage.getItem('bj_resumes');
    if (raw && !raw.startsWith('enc:')) allResumes = JSON.parse(raw);
  } catch(e) { /* encrypted/corrupt localStorage — fallback to empty */ }
  allResumes = allResumes.filter(function(r) { return !r.archived && r.name; });

  if (allResumes.length === 0) return 'no_resumes';

  // Find which saved filters matched this job
  var feedJob = (window._feedJobMap || {})[jobId];
  var filterNums = feedJob ? (feedJob._filterNums || []) : [];
  var sf = typeof savedFilters !== 'undefined' ? savedFilters : [];

  // Try to find a resume assigned to one of the matching filters
  for (var i = 0; i < filterNums.length; i++) {
    var idx = (typeof filterNums[i].num === 'number' ? filterNums[i].num : parseInt(filterNums[i].num)) - 1;
    if (idx >= 0 && sf[idx] && sf[idx].name) {
      var filterName = sf[idx].name;
      for (var j = 0; j < allResumes.length; j++) {
        if ((allResumes[j].filterIds || []).indexOf(filterName) >= 0) {
          return { id: allResumes[j].id, filename: allResumes[j].fileName || allResumes[j].name || 'resume.pdf' };
        }
      }
    }
  }

  // No filter-specific resume — if only one resume, use it
  if (allResumes.length === 1) {
    return { id: allResumes[0].id, filename: allResumes[0].fileName || allResumes[0].name || 'resume.pdf' };
  }

  // Multiple resumes but none assigned → user needs to pick
  return 'no_match';
}

// Submit application via worker (never opens ATS directly)
async function _submitViaWorker(jobId, jobTitle, companyName, jobUrl, resume) {
  if (_applySubmitting) return;
  _applySubmitting = true;

  // Set button to "Submitting..."
  _setApplyButtonState(jobId, 'submitting');

  if (!currentUser) {
    if (typeof showToast === 'function') showToast('Please log in to apply.', { type: 'error' });
    _setApplyButtonState(jobId, 'retry', jobUrl);
    _applySubmitting = false;
    return;
  }

  if (typeof showToast === 'function') showToast('Submitting application to ' + (companyName || 'ATS') + '...', { duration: 10000 });

  // Get score if available
  var scoreResult = getScoreForJob(jobId);
  var originalScore = scoreResult ? (scoreResult.match_score || null) : null;

  var expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + (userApplySettings.auto_expire_hours || 48));

  var pendingRow = {
    user_id: currentUser.id,
    job_id: jobId,
    resume_id: resume.id,
    original_score: originalScore,
    score_result: scoreResult || null,
    status: 'approved',
    approval_mode: 'auto_no_approval',
    job_title: jobTitle || '',
    company_name: companyName || '',
    job_url: jobUrl || '',
    expires_at: expiresAt.toISOString(),
    idempotency_key: crypto.randomUUID(),
  };

  var savedApp = await savePendingApplication(pendingRow);
  if (!savedApp) {
    if (typeof showToast === 'function') showToast('Failed to create application record. Opening ATS page.', { type: 'error' });
    _setApplyButtonState(jobId, 'retry', jobUrl);
    _applySubmitting = false;
    return;
  }

  // Pipeline entry
  if (typeof savePipelineEntry === 'function') {
    savePipelineEntry(jobId, {
      stage: 'applied', title: jobTitle || '', companyName: companyName || '', company: companyName || '',
      jobUrl: jobUrl || '', atsSource: _guessAtsSource(jobUrl), appliedAt: new Date().toISOString(), savedAt: new Date().toISOString(),
    });
  }

  // Route to worker
  try {
    if (_isRecruiteeJob(jobUrl)) {
      var result = await callSubmitApplication(savedApp, resume.id, resume.filename);
      if (result.ok) {
        _updatePipelineApplied(jobId);
        _setApplyButtonState(jobId, 'applied');
        if (typeof showToast === 'function') showToast('Applied to ' + (companyName || 'this job') + '!', { type: 'success' });
        _fireApplyNotification('apply_auto_submitted', {
          subject: 'Applied: ' + (jobTitle || 'Job') + ' at ' + (companyName || 'Company'),
          html: '<p>Your resume was submitted for <strong>' + escapeHtml(jobTitle || '') + '</strong> at <strong>' + escapeHtml(companyName || '') + '</strong>.</p>',
          job_id: jobId, job_title: jobTitle, company_name: companyName,
        });
      } else {
        if (typeof showToast === 'function') showToast('Submission failed: ' + (result.error || 'Unknown') + '. Click Retry to open ATS.', { type: 'error', duration: 8000 });
        _setApplyButtonState(jobId, 'retry', jobUrl);
      }
    } else {
      // All other ATS: headless worker
      await _routeToWorker(savedApp);
      _updatePipelineApplied(jobId);
      _setApplyButtonState(jobId, 'applied');
      if (typeof showToast === 'function') showToast('Application queued — submitting to ' + (companyName || 'ATS') + '.', { type: 'success', duration: 5000 });
    }
  } catch(e) {
    reportError('apply-workflow:submit', e);
    if (typeof showToast === 'function') showToast('Submission error. Click Retry to open ATS.', { type: 'error', duration: 8000 });
    _setApplyButtonState(jobId, 'retry', jobUrl);
  }

  if (typeof loadPendingApplications === 'function') await loadPendingApplications();
  if (typeof renderPendingApplications === 'function') renderPendingApplications();
  _applySubmitting = false;
}

// Update the Apply button in the feed row
function _setApplyButtonState(jobId, state, fallbackUrl) {
  var row = document.querySelector('tr.job-data-row[data-jobid="' + jobId + '"]');
  if (!row) return;
  var actionsTd = row.querySelector('.jt-actions');
  if (!actionsTd) return;
  var applyEl = actionsTd.querySelector('.apply-btn');
  if (!applyEl) return;

  if (state === 'submitting') {
    applyEl.textContent = 'Submitting…';
    applyEl.style.opacity = '0.6';
    applyEl.style.pointerEvents = 'none';
  } else if (state === 'applied') {
    applyEl.className = 'job-action-btn applied-btn';
    applyEl.textContent = 'Applied ✓';
    applyEl.style.opacity = '1';
    applyEl.style.pointerEvents = 'none';
    applyEl.removeAttribute('onclick');
    applyEl.href = '#';
  } else if (state === 'retry') {
    applyEl.textContent = 'Retry →';
    applyEl.style.opacity = '1';
    applyEl.style.pointerEvents = 'auto';
    applyEl.className = 'apply-btn apply-btn-default';
    var safeUrl = (fallbackUrl || '#').replace(/'/g, "\\'");
    applyEl.setAttribute('onclick', "event.preventDefault();window.open('" + safeUrl + "','_blank')");
  }
}

// Resume picker/upload modal
function _showResumeNeededModal(jobId, jobTitle, companyName, jobUrl, mode) {
  var existing = document.getElementById('resume-needed-modal');
  if (existing) existing.remove();

  var allResumes = [];
  try {
    var raw = localStorage.getItem('bj_resumes');
    if (raw && !raw.startsWith('enc:')) allResumes = JSON.parse(raw);
  } catch(e) { /* encrypted/corrupt localStorage — fallback to empty */ }
  allResumes = allResumes.filter(function(r) { return !r.archived && r.name; });

  var title = mode === 'upload' ? 'Upload a resume to apply' : 'Select a resume for this application';
  var body = mode === 'upload'
    ? '<p style="font-size:13px;color:var(--text-dim);margin-bottom:16px;">You need at least one resume to submit applications. Upload a resume and we\'ll submit it for you.</p>'
    + '<div style="text-align:center;"><button class="btn btn-primary btn-sm" onclick="document.getElementById(\'resume-needed-modal\').remove();document.querySelector(\'[data-page=resumes]\')?.click();">Go to Resumes →</button></div>'
    : '<p style="font-size:13px;color:var(--text-dim);margin-bottom:12px;">No resume is assigned to the filter that matched <strong>' + escapeHtml(jobTitle) + '</strong>. Pick one to submit:</p>'
    + '<div style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto;margin-bottom:16px;">'
    + allResumes.map(function(r) {
        return '<button class="btn btn-sm btn-secondary" style="text-align:left;padding:8px 14px;" '
          + 'onclick="_pickResumeAndApply(\'' + jobId + '\',\'' + escapeHtml(r.id) + '\',\'' + escapeHtml(r.fileName || r.name || 'resume.pdf').replace(/'/g, "\\'") + '\',\'' + escapeHtml(jobTitle).replace(/'/g, "\\'") + '\',\'' + escapeHtml(companyName).replace(/'/g, "\\'") + '\',\'' + (jobUrl||'').replace(/'/g, "\\'") + '\')">'
          + '<div style="font-size:12px;font-weight:600;">' + escapeHtml(r.name) + '</div>'
          + (r.filterIds && r.filterIds.length ? '<div style="font-size:10px;color:var(--text-faint);">Assigned to: ' + r.filterIds.join(', ') + '</div>' : '')
          + '</button>';
      }).join('')
    + '</div>';

  var modal = document.createElement('div');
  modal.id = 'resume-needed-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);';
  modal.innerHTML = '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:24px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
    + '<div style="font-size:16px;font-weight:700;color:var(--text);">' + title + '</div>'
    + '<button onclick="document.getElementById(\'resume-needed-modal\').remove()" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--text-faint);">&times;</button>'
    + '</div>'
    + body
    + '</div>';
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

// Called from resume picker modal
window._pickResumeAndApply = async function(jobId, resumeId, resumeFilename, jobTitle, companyName, jobUrl) {
  document.getElementById('resume-needed-modal')?.remove();
  await _submitViaWorker(jobId, jobTitle, companyName, jobUrl, { id: resumeId, filename: resumeFilename });
};

// AF-003: Score then auto-route (for score_gated_auto mode)
async function _scoreAndAutoRoute(jobId, jobTitle, companyName, jobUrl) {
  if (!currentUser) {
    if (typeof showToast === 'function') showToast('Please log in first.', { type: 'error' });
    return;
  }

  var ent = await checkEntitlement('resume_grading', 0);
  if (!ent.allowed) {
    if (typeof showUpgradePrompt === 'function') showUpgradePrompt('Resume Scoring', ent);
    else if (typeof showToast === 'function') showToast('Upgrade required for resume scoring.', { type: 'error' });
    return;
  }

  var { data: balance } = await sb.rpc('get_credit_balance', { p_user_id: currentUser.id });
  if (balance < 1) {
    if (typeof showToast === 'function') showToast('Scoring costs 1 credit. You have ' + (balance || 0) + '.', { type: 'error', duration: 5000 });
    return;
  }

  var resume = _getActiveResume();
  var resumeText = '';
  try {
    var { data: archiveData } = await sb.from('resume_archive').select('parsed_text').eq('id', resume.id).single();
    resumeText = archiveData?.parsed_text || '';
  } catch(e) { reportError('apply-workflow:_scoreAndAutoRoute', e); }

  if (!resumeText) {
    try {
      var raw = localStorage.getItem('bj_resumes'); if (raw && raw.startsWith('enc:')) raw = null;
      if (raw) { var resumes = JSON.parse(raw); if (resumes.length > 0) resumeText = resumes[0].text || ''; }
    } catch(e) { reportError('apply-workflow:_scoreAndAutoRoute', e); }
  }

  if (!resumeText) {
    if (typeof showToast === 'function') showToast('No resume text found. Upload a resume first.', { type: 'error', duration: 5000 });
    return;
  }

  if (typeof showToast === 'function') showToast('Scoring your resume... (1 credit)', { duration: 8000 });

  var token = await _getAuthToken();
  if (!token) {
    if (typeof showToast === 'function') showToast('Session expired. Please log in again.', { type: 'error' });
    return;
  }

  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/score-resume', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify({ resume_text: resumeText, mode: 'single', tier: 'basic', job_ids: [jobId], resume_id: resume.id }),
    });
    var data = await res.json();

    if (!res.ok || data.error) {
      if (typeof showToast === 'function') showToast('Scoring failed: ' + (data.error || 'Unknown error'), { type: 'error' });
      return;
    }

    if (typeof jobMatchScores === 'undefined') window.jobMatchScores = {};
    jobMatchScores[jobId] = data;

    var threshold = userApplySettings.default_score_threshold;
    var score = data.match_score || 0;

    if (score >= threshold) {
      if (typeof showToast === 'function') showToast('Score ' + score + ' ≥ ' + threshold + ' — auto-applying!', { type: 'success', duration: 3000 });
      await proceedToApply(jobId, jobTitle, companyName, jobUrl);
      _trackFeedApplyComplete(jobId, 'score_gated_auto', 'auto_above_threshold');
    } else {
      if (typeof showToast === 'function') showToast('Score: ' + score + '/' + threshold + ' — below threshold.', { duration: 3000 });
      showScoreGateModal(jobId, jobTitle, companyName, jobUrl, data);
      _trackFeedApplyComplete(jobId, 'score_gated_auto', 'gate_below_threshold');
    }
  } catch (e) {
    reportError('apply-workflow:_scoreAndAutoRoute', e);
    if (typeof showToast === 'function') showToast('Scoring failed. Please try again.', { type: 'error' });
  }
}

// AF-003: PostHog tracking helper
function _trackFeedApplyComplete(jobId, mode, outcome) {
  if (typeof posthog !== 'undefined') {
    posthog.capture('feed_apply_complete', { job_id: jobId, mode: mode, outcome: outcome, surface: 'feed' });
  }
  // AF-006: Log to user_activity_log
  var feedMap = typeof window._feedJobMap !== 'undefined' ? window._feedJobMap : {};
  var jobInfo = feedMap[jobId] || {};
  logDashboardActivity('applied', {
    jobTitle: jobInfo.title || '',
    company: jobInfo.company_name || '',
    jobUrl: jobInfo.url || '',
    mode: mode,
    metadata: { outcome: outcome, surface: 'feed' }
  });
}

// AF-003: Update job card UI after apply action
function _updateFeedCardApplied(jobId) {
  var row = document.querySelector('tr[data-jobid="' + jobId + '"]');
  if (!row) return;
  var actionsCell = row.querySelector('td:last-child');
  if (actionsCell) {
    var div = actionsCell.querySelector('div');
    if (div) div.innerHTML = '<span class="job-action-btn applied-btn">Applied ✓</span>';
  }
}

// ═══════════════════════════════════════════════════════════
// PENDING APPLICATIONS PANEL
// ═══════════════════════════════════════════════════════════

function renderPendingApplications() {
  var container = document.getElementById('pending-apps-panel');
  if (!container) return;

  var pending = pendingApplications.filter(function(a) {
    return a.status === APPLY_STATUS.PENDING || a.status === APPLY_STATUS.FAILED ||
           a.status === APPLY_STATUS.APPROVED || a.status === APPLY_STATUS.PROCESSING;
  });
  
  if (pending.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = '';
  var countEl = document.getElementById('pending-apps-count');
  if (countEl) countEl.textContent = pending.length;

  var body = document.getElementById('pending-apps-body');
  if (!body) return;

  // FB-GHOST-BADGE-001: Pre-fetch ghost scores for all companies in this batch.
  // Async — we render cards immediately, then refresh once scores arrive.
  var companyNames = pending.map(function(a) { return a.company_name || ''; }).filter(Boolean);
  if (typeof loadGhostScores === 'function' && companyNames.length > 0) {
    loadGhostScores(companyNames).then(function() {
      // Re-render just the ghost badge elements without full re-render
      pending.forEach(function(app) {
        if (!app.company_name) return;
        var card = body.querySelector('.pa-card[data-app-id="' + app.id + '"]');
        if (!card) return;
        var existing = card.querySelector('.ghost-badge');
        if (existing) existing.remove();
        var companyEl = card.querySelector('.pa-job-company');
        if (companyEl && typeof buildGhostBadge === 'function') {
          var badge = buildGhostBadge(app.company_name);
          if (badge) {
            var wrapper = document.createElement('div');
            wrapper.innerHTML = badge;
            companyEl.parentNode.insertBefore(wrapper.firstChild, companyEl.nextSibling);
          }
        }
      });
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }).catch(function(e) { reportError('ghost_badge', e); });
  }

  // WAITING states that qualify for ghost badge display + self-report option
  var WAITING_STATUSES = ['pending', 'approved'];

  body.innerHTML = pending.map(function(app, i) {
    var scoreHtml = '';
    if (app.rewritten_score) {
      scoreHtml = '<span class="pa-score pa-score-improved">' + app.original_score + ' → ' + app.rewritten_score + ' (+' + (app.rewritten_score - app.original_score) + ')</span>';
    } else if (app.original_score) {
      var cls = app.original_score >= 75 ? 'high' : app.original_score >= 50 ? 'mid' : 'low';
      scoreHtml = '<span class="pa-score pa-score-' + cls + '">' + app.original_score + '</span>';
    } else {
      scoreHtml = '<span class="pa-score pa-score-none">Unscored</span>';
    }

    var statusBadge = '';
    if (app.status === APPLY_STATUS.FAILED) {
      var errorMsg = app.submission_error || 'Submission failed';
      statusBadge = '<span class="pa-badge pa-badge-failed">Failed</span>' +
        '<div style="font-size:11px;color:var(--danger);margin-top:4px;">' + escapeHtml(errorMsg) + '</div>';
    } else if (app.status === APPLY_STATUS.APPROVED) {
      statusBadge = '<span class="pa-badge" style="background:var(--warm);color:#fff;">Queued for Worker</span>';
    } else if (app.status === APPLY_STATUS.PROCESSING) {
      statusBadge = '<span class="pa-badge" style="background:var(--accent);color:#fff;">Worker Submitting...</span>';
    }

    var actionsHtml = '';
    if (app.status === APPLY_STATUS.APPROVED || app.status === APPLY_STATUS.PROCESSING) {
      actionsHtml = '<span style="font-size:11px;color:var(--muted);"><i data-lucide="loader-2" class="icon-sm" style="animation:spin 1s linear infinite;display:inline-block;vertical-align:middle;margin-right:4px;"></i>Processing...</span>';
    } else if (app.status === APPLY_STATUS.FAILED) {
      var manualLink = app.job_url ? '<a href="' + escapeHtml(app.job_url) + '" target="_blank" class="pa-btn pa-btn-secondary" style="text-decoration:none;">Apply Manually</a>' : '';
      actionsHtml =
        manualLink +
        '<button class="pa-btn pa-btn-primary" onclick="retryPendingApp(\'' + app.id + '\')">Retry</button>' +
        '<button class="pa-btn pa-btn-ghost" onclick="skipPendingApp(\'' + app.id + '\')">Dismiss</button>';
    } else if (app.approval_mode === 'rewrite_review') {
      actionsHtml = 
        '<button class="pa-btn pa-btn-primary" onclick="approveRewrittenApp(\'' + app.id + '\')">Submit Rewritten</button>' +
        '<button class="pa-btn pa-btn-secondary" onclick="approveOriginalApp(\'' + app.id + '\')">Submit Original</button>' +
        '<button class="pa-btn pa-btn-ghost" onclick="skipPendingApp(\'' + app.id + '\')">Skip</button>';
    } else if (app.approval_mode === 'auto_with_approval') {
      actionsHtml = 
        '<button class="pa-btn pa-btn-primary" onclick="approvePendingApp(\'' + app.id + '\')">Approve & Submit</button>' +
        '<button class="pa-btn pa-btn-ghost" onclick="skipPendingApp(\'' + app.id + '\')">Skip</button>';
    } else {
      actionsHtml = 
        '<button class="pa-btn pa-btn-primary" onclick="approvePendingApp(\'' + app.id + '\')">Apply</button>' +
        '<button class="pa-btn pa-btn-accent" onclick="scorePendingApp(\'' + app.id + '\')">Score First</button>' +
        '<button class="pa-btn pa-btn-ghost" onclick="skipPendingApp(\'' + app.id + '\')">Skip</button>';
    }

    // FB-GHOST-BADGE-001: "Report as Ghosted" added for pending/failed apps only
    var isWaiting = WAITING_STATUSES.indexOf(app.status) !== -1;
    if (isWaiting && app.company_name) {
      var daysAgo = app.created_at
        ? Math.floor((Date.now() - new Date(app.created_at).getTime()) / 86400000)
        : 0;
      actionsHtml +=
        '<button class="pa-btn pa-btn-ghost" style="font-size:10px;opacity:.7;" ' +
        'onclick="confirmGhostReport(\'' + (app.id || '') + '\',\'' + escapeHtml(app.company_name) + '\',' + daysAgo + ')">' +
        '<i data-lucide="ghost" style="width:10px;height:10px;display:inline-block;vertical-align:middle;margin-right:3px;stroke:currentColor;fill:none;"></i>' +
        'Report Ghosted</button>';
    }

    var rewriteBadge = app.rewritten_score ? '<span class="pa-badge pa-badge-rewrite">Rewritten</span>' : '';

    // FB-GHOST-BADGE-001: Build ghost badge from cache (may be empty until async load completes)
    var ghostBadge = (isWaiting && app.company_name && typeof buildGhostBadge === 'function')
      ? buildGhostBadge(app.company_name)
      : '';

    return '<div class="pa-card" data-app-id="' + (app.id || i) + '">' +
      '<div class="pa-card-left">' +
        '<div class="pa-job-title">' + escapeHtml(app.job_title || 'Unknown Job') + '</div>' +
        '<div class="pa-job-company">' + escapeHtml(app.company_name || '') + '</div>' +
        (ghostBadge ? ghostBadge : '') +
      '</div>' +
      '<div class="pa-card-center">' +
        scoreHtml + rewriteBadge + statusBadge +
        (app.rewrite_summary ? '<div class="pa-rewrite-summary">' + escapeHtml(app.rewrite_summary) + '</div>' : '') +
      '</div>' +
      '<div class="pa-card-actions">' + actionsHtml + '</div>' +
    '</div>';
  }).join('');

  // EXT-AS-7: Refresh Lucide icons for worker status spinners
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ═══════════════════════════════════════════════════════════
// D4: Pending Application Actions — Supabase-backed
// ═══════════════════════════════════════════════════════════

async function approvePendingApp(appId) {
  // AF-002: Setup gate — block if setup not complete
  if (!isSetupComplete()) {
    showSetupGateModal();
    return;
  }
  var app = pendingApplications.find(function(a) { return a.id === appId; });
  if (!app) return;

  if (_applySubmitting) return;
  _applySubmitting = true;

  // Update status to approved
  await updatePendingApplication(appId, {
    status: APPLY_STATUS.APPROVED,
    responded_at: new Date().toISOString(),
  });

  // EXT-AS-7: Route through worker or direct API
  if (_isRecruiteeJob(app.job_url)) {
    if (typeof showToast === 'function') showToast('Submitting to ' + (app.company_name || 'ATS') + '...', { duration: 10000 });
    var resume = _getActiveResume();
    var result = await callSubmitApplication(app, resume.id, resume.filename);

    if (result.ok) {
      _updatePipelineApplied(app.job_id);
      if (typeof showToast === 'function') showToast('Applied to ' + (app.company_name || 'job') + '!', { type: 'success' });
      _fireApplyNotification('apply_auto_submitted', {
        subject: 'Applied: ' + (app.job_title || 'Job') + ' at ' + (app.company_name || 'Company'),
        html: '<p>Your resume was submitted for <strong>' + escapeHtml(app.job_title || '') + '</strong> at <strong>' + escapeHtml(app.company_name || '') + '</strong>.</p>',
        job_id: app.job_id,
        job_title: app.job_title,
        company_name: app.company_name,
      });
    } else if (result.error === 'rejected') {
      if (typeof showToast === 'function') showToast('Rejected: ' + (result.detail || 'Unknown') + '. You can retry.', { type: 'error', duration: 6000 });
    } else if (result.error === 'timeout') {
      if (typeof showToast === 'function') showToast('ATS timed out. You can retry.', { type: 'error', duration: 6000 });
    } else {
      if (typeof showToast === 'function') showToast('Submission failed. You can retry.', { type: 'error' });
    }
  } else {
    // Route through headless worker
    if (typeof showToast === 'function') showToast('Queued for worker submission to ' + (app.company_name || 'ATS') + '...', { duration: 5000 });
    await _routeToWorker(app);
  }

  await loadPendingApplications();
  renderPendingApplications();
  _applySubmitting = false;
}

async function approveRewrittenApp(appId) {
  var app = pendingApplications.find(function(a) { return a.id === appId; });
  if (!app) return;

  if (_applySubmitting) return;
  _applySubmitting = true;

  // Use the rewritten resume
  var resumeId = app.rewritten_resume_id || app.resume_id;
  await updatePendingApplication(appId, {
    status: APPLY_STATUS.APPROVED,
    responded_at: new Date().toISOString(),
  });

  // EXT-AS-7: Route through worker or direct API
  if (_isRecruiteeJob(app.job_url)) {
    if (typeof showToast === 'function') showToast('Submitting rewritten resume...', { duration: 10000 });
    var result = await callSubmitApplication(app, resumeId, 'resume-rewritten.pdf');

    if (result.ok) {
      _updatePipelineApplied(app.job_id);
      if (typeof showToast === 'function') showToast('Submitted rewritten resume to ' + (app.company_name || 'job') + '!', { type: 'success' });
      _fireApplyNotification('apply_rewrite_submitted', {
        subject: 'Applied (rewritten): ' + (app.job_title || 'Job') + ' at ' + (app.company_name || 'Company'),
        html: '<p>Your AI-rewritten resume was submitted for <strong>' + escapeHtml(app.job_title || '') + '</strong> at <strong>' + escapeHtml(app.company_name || '') + '</strong>.</p>',
        job_id: app.job_id,
        job_title: app.job_title,
        company_name: app.company_name,
      });
    } else {
      if (typeof showToast === 'function') showToast('Submission failed: ' + (result.error || 'Unknown') + '. You can retry.', { type: 'error' });
    }
  } else {
    if (typeof showToast === 'function') showToast('Queued rewritten resume for worker submission...', { duration: 5000 });
    await _routeToWorker(app);
  }

  await loadPendingApplications();
  renderPendingApplications();
  _applySubmitting = false;
}

async function approveOriginalApp(appId) {
  var app = pendingApplications.find(function(a) { return a.id === appId; });
  if (!app) return;

  if (_applySubmitting) return;
  _applySubmitting = true;

  await updatePendingApplication(appId, {
    status: APPLY_STATUS.APPROVED,
    responded_at: new Date().toISOString(),
  });

  // EXT-AS-7: Route through worker or direct API
  if (_isRecruiteeJob(app.job_url)) {
    if (typeof showToast === 'function') showToast('Submitting original resume...', { duration: 10000 });
    var resume = _getActiveResume();
    var result = await callSubmitApplication(app, resume.id, resume.filename);

    if (result.ok) {
      _updatePipelineApplied(app.job_id);
      if (typeof showToast === 'function') showToast('Submitted original resume to ' + (app.company_name || 'job') + '!', { type: 'success' });
    } else {
      if (typeof showToast === 'function') showToast('Submission failed: ' + (result.error || 'Unknown') + '. You can retry.', { type: 'error' });
    }
  } else {
    if (typeof showToast === 'function') showToast('Queued original resume for worker submission...', { duration: 5000 });
    await _routeToWorker(app);
  }

  await loadPendingApplications();
  renderPendingApplications();
  _applySubmitting = false;
}

async function skipPendingApp(appId) {
  var success = await updatePendingApplication(appId, {
    status: APPLY_STATUS.SKIPPED,
    responded_at: new Date().toISOString(),
  });

  if (success) {
    // Remove from local array
    pendingApplications = pendingApplications.filter(function(a) { return a.id !== appId; });
    renderPendingApplications();
    if (typeof showToast === 'function') showToast('Skipped');
  } else {
    if (typeof showToast === 'function') showToast('Failed to update. Try again.', { type: 'error' });
  }
}

async function retryPendingApp(appId) {
  var app = pendingApplications.find(function(a) { return a.id === appId; });
  if (!app) return;

  // Reset to approved with new idempotency key, then re-submit
  await updatePendingApplication(appId, {
    status: APPLY_STATUS.APPROVED,
    idempotency_key: crypto.randomUUID(),
  });

  // Re-fetch to get the updated row
  await loadPendingApplications();
  var updatedApp = pendingApplications.find(function(a) { return a.id === appId; });
  if (!updatedApp) return;

  await approvePendingApp(appId);
}

async function scorePendingApp(appId) {
  var app = pendingApplications.find(function(a) { return a.id === appId; });
  if (!app) return;
  // Delegate to scoreAndRecheck which handles credit check + EF call
  await scoreAndRecheck(app.job_id, app.job_title, app.company_name, app.job_url);
}

// ═══════════════════════════════════════════════════════════
// REWRITE REVIEW MODAL
// ═══════════════════════════════════════════════════════════

function showRewriteReviewModal(app) {
  var existing = document.getElementById('rewrite-review-modal');
  if (existing) existing.remove();

  var changes = app.rewrite_summary || 'No changes summary available.';
  var beforeScore = app.original_score || '?';
  var afterScore = app.rewritten_score || '?';
  var improvement = (app.rewritten_score && app.original_score) ? (app.rewritten_score - app.original_score) : 0;

  var modal = document.createElement('div');
  modal.id = 'rewrite-review-modal';
  modal.className = 'sg-overlay';
  modal.innerHTML =
    '<div class="sg-modal" style="max-width:560px;">' +
      '<div class="sg-header">' +
        '<div class="sg-title">Resume Rewrite Review</div>' +
        '<button class="sg-close" onclick="closeRewriteReviewModal()">&times;</button>' +
      '</div>' +
      '<div class="sg-body">' +
        '<div class="sg-job-info">' +
          '<div class="sg-job-title">' + escapeHtml(app.job_title || '') + '</div>' +
          '<div class="sg-job-company">' + escapeHtml(app.company_name || '') + '</div>' +
        '</div>' +
        '<div class="rr-score-comparison">' +
          '<div class="rr-score-before">' +
            '<div class="rr-score-val">' + beforeScore + '</div>' +
            '<div class="rr-score-label">Before</div>' +
          '</div>' +
          '<div class="rr-arrow">→</div>' +
          '<div class="rr-score-after">' +
            '<div class="rr-score-val">' + afterScore + '</div>' +
            '<div class="rr-score-label">After</div>' +
          '</div>' +
          (improvement > 0 ? '<div class="rr-improvement">+' + improvement + '</div>' : '') +
        '</div>' +
        '<div class="rr-changes">' +
          '<div class="rr-changes-label">Changes made:</div>' +
          '<div class="rr-changes-body">' + escapeHtml(changes) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="sg-footer">' +
        '<button class="sg-btn sg-btn-secondary" onclick="closeRewriteReviewModal()">Cancel</button>' +
        '<button class="sg-btn sg-btn-primary" onclick="submitRewrittenFromModal()">Submit Rewritten</button>' +
        '<button class="sg-btn sg-btn-ghost" onclick="submitOriginalFromModal()">Submit Original</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) {
    if (e.target === modal) closeRewriteReviewModal();
  });
}

function closeRewriteReviewModal() {
  var modal = document.getElementById('rewrite-review-modal');
  if (modal) modal.remove();
}

// ═══════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════

loadApplySettings();

// Load pending applications from Supabase after auth is ready
(async function() {
  // Wait for auth to be ready (currentUser set by app.js)
  var attempts = 0;
  while (!window.currentUser && attempts < 20) {
    await new Promise(function(r) { setTimeout(r, 250); });
    attempts++;
  }
  if (window.currentUser) {
    await loadPendingApplications();
    renderPendingApplications();
  }
})();

// ═══════════════════════════════════════════════════════════
// MODE SELECTOR UI — wire to Rules panel buttons
// ═══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function() {
  var modeButtons = document.querySelectorAll('.app-mode-select');
  modeButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      modeButtons.forEach(function(b) {
        b.classList.remove('active');
        b.style.border = '';
      });
      btn.classList.add('active');
      btn.style.border = '2px solid var(--accent)';
      
      var mode = btn.getAttribute('data-mode');
      userApplySettings.default_apply_mode = mode;
      saveApplySettings();
      updateApplySettingsVisibility(mode);
    });
  });

  // Initialize visibility based on saved mode
  var savedMode = userApplySettings.default_apply_mode || 'manual';
  var activeBtn = document.querySelector('.app-mode-select[data-mode="' + savedMode + '"]');
  if (activeBtn) {
    modeButtons.forEach(function(b) { b.classList.remove('active'); b.style.border = ''; });
    activeBtn.classList.add('active');
    activeBtn.style.border = '2px solid var(--accent)';
  }
  updateApplySettingsVisibility(savedMode);

  // Threshold slider
  var thresholdSlider = document.getElementById('fas-threshold');
  if (thresholdSlider) {
    thresholdSlider.value = userApplySettings.default_score_threshold || 70;
    document.getElementById('fas-threshold-val').textContent = thresholdSlider.value;
    thresholdSlider.addEventListener('change', function() {
      userApplySettings.default_score_threshold = parseInt(this.value);
      saveApplySettings();
    });
  }

  // Auto-rewrite toggle shows rewrite approval options
  var rewriteToggle = document.getElementById('fas-auto-rewrite');
  if (rewriteToggle) {
    rewriteToggle.addEventListener('change', function() {
      var row = document.getElementById('fas-rewrite-approval-row');
      if (row) row.style.display = this.checked ? '' : 'none';
    });
  }
});

function updateApplySettingsVisibility(mode) {
  var scoreGate = document.getElementById('score-gate-settings');
  var approval = document.getElementById('approval-settings');
  var rewriteRow = document.getElementById('fas-rewrite-row');
  var rewriteApprovalRow = document.getElementById('fas-rewrite-approval-row');

  var usesScore = ['score_gated', 'score_gated_auto', 'auto_rewrite', 'autopilot'].indexOf(mode) >= 0;
  var usesAuto = ['auto', 'score_gated_auto', 'auto_rewrite', 'autopilot'].indexOf(mode) >= 0;
  var usesRewrite = ['auto_rewrite', 'autopilot'].indexOf(mode) >= 0;

  if (scoreGate) scoreGate.style.display = usesScore ? '' : 'none';
  if (approval) approval.style.display = usesAuto ? '' : 'none';
  if (rewriteRow) rewriteRow.style.display = usesRewrite ? '' : 'none';
  if (rewriteApprovalRow) rewriteApprovalRow.style.display = usesRewrite && document.getElementById('fas-auto-rewrite') && document.getElementById('fas-auto-rewrite').checked ? '' : 'none';
}

// EXT-AS-7: Window exports for SPA bridge + cross-module access
window.processApplyQueue = processApplyQueue;
// AF-004: Mode-aware queue processing
window.processApplyQueueByMode = processApplyQueueByMode;
window._isRecruiteeJob = _isRecruiteeJob;
window._activePollers = _activePollers;
// AF-002: Setup gate exports
window.isSetupComplete = isSetupComplete;
window.showSetupGateModal = showSetupGateModal;
window._updateFillStatusPanel = _updateFillStatusPanel;
window.hideSetupGateModal = hideSetupGateModal;
window.navigateToSetup = navigateToSetup;
window.checkAndSetSetupComplete = checkAndSetSetupComplete;
// AF-003: Feed apply mode routing exports
window.handleFeedApply = handleFeedApply;
window.showScoreGateModal = showScoreGateModal;
window.closeScoreGateModal = closeScoreGateModal;
window.scoreAndRecheck = scoreAndRecheck;
window.triggerRewrite = triggerRewrite;
window.proceedToApply = proceedToApply;
// AF-006: Dashboard activity logging export
window.logDashboardActivity = logDashboardActivity;

// CS-P1-004 FE-005: Register apply-workflow exports with BJ namespace
(function() {
  ['jobMatchScores'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'apply-workflow', registered: Date.now() };
    }
  });
})();

// ─────────────────────────────────────────────────────────────────────────────
// FB-GHOST-BADGE-001: Ghost Intelligence Badges
// Crowdsourced ghosting badges on My Applications cards.
// ─────────────────────────────────────────────────────────────────────────────

/* Ghost score cache: { [company_name]: { tier, effective_count, self_reported_count, auto_inferred_count } } */
var _ghostScoreCache = {};

/**
 * loadGhostScores(companyNames)
 * Batch-fetch ghost_company_scores for the given set of normalized company names.
 * Populates _ghostScoreCache. Called before rendering application cards.
 */
async function loadGhostScores(companyNames) {
  if (!currentUser || !companyNames || companyNames.length === 0) return;
  try {
    var normalized = companyNames.map(function(n) {
      return (n || '').trim().toLowerCase().replace(/[,.'"\-]+/g, ' ').replace(/\s+/g, ' ').trim();
    }).filter(Boolean);

    if (normalized.length === 0) return;

    var { data, error } = await sb
      .from('ghost_company_scores')
      .select('company_name, effective_count, tier, self_reported_count, auto_inferred_count')
      .in('company_name', normalized);

    if (error) { reportError('ghost_badge', error); return; }

    for (var i = 0; i < (data || []).length; i++) {
      var row = data[i];
      _ghostScoreCache[row.company_name] = row;
    }
  } catch (e) {
    reportError('ghost_badge', e);
  }
}

/**
 * buildGhostBadge(companyName)
 * Returns HTML string for the ghost intelligence badge, or '' if no data.
 * Only shown for applications in waiting states (Applied/Screening/Interview).
 */
function buildGhostBadge(companyName) {
  if (!companyName) return '';
  var key = (companyName || '').trim().toLowerCase().replace(/[,.'"\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  var score = _ghostScoreCache[key];
  if (!score) return '';

  var count = Math.round(parseFloat(score.effective_count) || 0);
  if (count < 1) return '';

  var tier = score.tier || 'low';
  var tierColor = tier === 'high' ? 'var(--red)' : tier === 'medium' ? 'var(--amber, #F59E0B)' : 'var(--text-faint)';
  var tierBg    = tier === 'high' ? 'rgba(220,38,38,0.1)' : tier === 'medium' ? 'rgba(245,158,11,0.12)' : 'rgba(0,0,0,0.06)';

  var badgeText = tier === 'high'
    ? 'Frequent ghosting reported (' + count + ')'
    : count + ' user' + (count === 1 ? '' : 's') + ' reported no response';

  var tooltip = (score.self_reported_count || 0) + ' self-reported, ' +
    (score.auto_inferred_count || 0) + ' auto-detected — weighted score: ' + count +
    '. Reports from the last 18 months.';

  // REM-S03: Fire ghost_badge_viewed when badge renders on a card
  if (window.posthog) {
    try { posthog.capture('ghost_badge_viewed', {
      company_name: key,
      tier: tier,
      effective_count: count,
      self_reported_count: score.self_reported_count || 0,
      auto_inferred_count: score.auto_inferred_count || 0
    }); } catch(e) { if (typeof reportError === 'function') reportError('ghost:badge_viewed', e); }
  }

  return '<span class="ghost-badge ghost-badge-' + tier + '" ' +
    'data-company="' + (typeof escapeHtml === 'function' ? escapeHtml(key) : key) + '" ' +
    'title="' + (typeof escapeHtml === 'function' ? escapeHtml(tooltip) : tooltip) + '" ' +
    'style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:10px;' +
    'font-size:10px;font-weight:600;color:' + tierColor + ';background:' + tierBg + ';' +
    'cursor:pointer;white-space:nowrap;margin-top:4px;" ' +
    'onclick="showGhostBadgeTooltip(this)">' +
    '<i data-lucide="ghost" style="width:10px;height:10px;stroke:currentColor;fill:none;flex-shrink:0;"></i>' +
    (typeof escapeHtml === 'function' ? escapeHtml(badgeText) : badgeText) +
    '</span>';
}

/**
 * showGhostBadgeTooltip(el)
 * Show the tooltip on tap/click (for mobile where :hover isn't reliable).
 * Fires PostHog ghost_badge_tooltip_shown.
 */
function showGhostBadgeTooltip(el) {
  var company = el ? el.getAttribute('data-company') : '';
  var score = company ? _ghostScoreCache[company] : null;
  if (window.posthog) posthog.capture('ghost_badge_tooltip_shown', {
    company_name: company,
    tier: score ? score.tier : 'unknown',
  });
  // tooltip is already on the title attr; native browser handles it on desktop
  // For mobile we could add a small toast but title attr is sufficient for MVP
}

/**
 * submitGhostReport(applicationId, companyName, daysSinceApplied)
 * Fires ghost-report-submit EF after user confirms.
 */
async function submitGhostReport(applicationId, companyName, daysSinceApplied) {
  if (!currentUser) return;
  try {
    var { data: { session } } = await sb.auth.getSession();
    if (!session) return;

    if (window.posthog) posthog.capture('ghost_self_report_initiated', {
      company_name:       companyName,
      application_id:     applicationId,
      days_since_applied: daysSinceApplied || 0,
    });

    var resp = await fetch(SUPABASE_URL + '/functions/v1/api-gateway', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
        'x-gateway-route': 'ghost-report-submit',
      },
      body: JSON.stringify({
        application_id:     applicationId || null,
        company_name:       companyName,
        days_since_applied: daysSinceApplied || null,
      }),
    });

    var result = await resp.json();
    if (result.already_reported) {
      if (typeof showToast === 'function') showToast('You already reported this company recently.', { type: 'info' });
      return;
    }
    if (!resp.ok) {
      if (typeof showToast === 'function') showToast('Failed to submit ghost report.', { type: 'error' });
      reportError('ghost_badge', new Error(result.error || 'submit failed'));
      return;
    }

    // Refresh badge for this company in cache
    if (result.score) {
      var key = (companyName || '').trim().toLowerCase().replace(/[,.'"\-]+/g, ' ').replace(/\s+/g, ' ').trim();
      _ghostScoreCache[key] = result.score;
    }

    if (typeof showToast === 'function') showToast('Reported. This helps other job seekers. ✓', { type: 'success' });

    // Re-render application cards to show updated badge
    if (typeof renderPendingApplications === 'function') renderPendingApplications();

  } catch (e) {
    reportError('ghost_badge', e);
    if (typeof showToast === 'function') showToast('Failed to submit ghost report.', { type: 'error' });
  }
}

/**
 * confirmGhostReport(applicationId, companyName, daysSinceApplied)
 * Shows confirmation dialog before submitting.
 */
function confirmGhostReport(applicationId, companyName, daysSinceApplied) {
  if (window.posthog) posthog.capture('ghost_self_report_initiated', {
    company_name: companyName,
    application_id: applicationId,
    days_since_applied: daysSinceApplied || 0,
  });

  var escaped = typeof escapeHtml === 'function' ? escapeHtml(companyName) : companyName;
  if (confirm('Mark ' + escaped + ' as ghosted? This helps other job seekers find honest intel.')) {
    submitGhostReport(applicationId, companyName, daysSinceApplied);
  } else {
    if (window.posthog) posthog.capture('ghost_self_report_cancelled', { company_name: companyName });
  }
}

window.loadGhostScores = loadGhostScores;
window.buildGhostBadge = buildGhostBadge;
window.showGhostBadgeTooltip = showGhostBadgeTooltip;
window.confirmGhostReport = confirmGhostReport;
window.submitGhostReport = submitGhostReport;

// ── AIS-F6 gap: Review Queue — load pending_applications with status='review_queue' ──
async function loadReviewQueue() {
  var listEl = document.getElementById('review-queue-items');
  var loadingEl = document.getElementById('review-queue-loading');
  var emptyEl = document.getElementById('review-queue-empty');
  var badgeEl = document.getElementById('review-queue-badge');
  if (!listEl) return;

  try {
    var { data, error } = await sb.from('pending_applications')
      .select('id, job_title, company_name, job_url, created_at')
      .eq('user_id', currentUser.id)
      .eq('status', 'review_queue')
      .order('created_at', { ascending: false })
      .limit(50);

    if (loadingEl) loadingEl.style.display = 'none';

    if (error) { reportError('loadReviewQueue', error); return; }

    if (!data || !data.length) {
      if (emptyEl) emptyEl.style.display = '';
      listEl.innerHTML = '';
      if (badgeEl) badgeEl.style.display = 'none';
      return;
    }

    if (badgeEl) { badgeEl.style.display = ''; badgeEl.textContent = data.length; }
    if (emptyEl) emptyEl.style.display = 'none';

    var esc = typeof escapeHtml === 'function' ? escapeHtml : function(s){ return String(s||''); };
    listEl.innerHTML = data.map(function(app) {
      var daysAgo = Math.floor((Date.now() - new Date(app.created_at).getTime()) / 86400000);
      var when = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : daysAgo + 'd ago';
      return '<div class="card" style="margin-bottom:8px;padding:12px 16px;display:flex;align-items:center;gap:12px;">' +
        '<div style="flex:1;">' +
          '<div style="font-size:13px;font-weight:600;">' + esc(app.job_title || 'Unknown Role') + '</div>' +
          '<div style="font-size:11px;color:var(--text-muted);">' + esc(app.company_name || '') + ' · ' + when + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;">' +
          '<a href="' + esc(app.job_url || '#') + '" target="_blank" class="btn btn-sm btn-primary" style="font-size:11px;">Apply Now</a>' +
          '<button class="btn btn-sm" onclick="dismissReviewQueueItem(\'' + app.id + '\', this)" style="font-size:11px;">Dismiss</button>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch(e) {
    reportError('loadReviewQueue', e);
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

async function dismissReviewQueueItem(appId, btn) {
  try {
    btn.disabled = true;
    await sb.from('pending_applications').update({ status: 'dismissed' }).eq('id', appId).eq('user_id', currentUser.id);
    var card = btn.closest('.card');
    if (card) card.remove();
    var remaining = document.querySelectorAll('#review-queue-items .card').length;
    var badgeEl = document.getElementById('review-queue-badge');
    if (badgeEl) { if (remaining === 0) { badgeEl.style.display = 'none'; } else { badgeEl.textContent = remaining; } }
    if (remaining === 0) { var emptyEl = document.getElementById('review-queue-empty'); if (emptyEl) emptyEl.style.display = ''; }
  } catch(e) { reportError('dismissReviewQueueItem', e); btn.disabled = false; }
}

window.loadReviewQueue = loadReviewQueue;
window.dismissReviewQueueItem = dismissReviewQueueItem;
