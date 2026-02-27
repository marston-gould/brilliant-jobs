/**
 * Brilliant Jobs — Apply Workflow
 * Score Gate Modal, Pending Applications, and Apply State Machine
 * 
 * Phase 4: Real Apply Pathway (Pod 2)
 * - Score Gate Modal: intercepts Apply when score is low/unscored
 * - Pending Applications: Supabase-backed with real ATS submission
 * - Apply Settings: per-filter configuration
 * - Rewrite Review Modal: shows AI rewrite diff
 * - scoreAndRecheck: calls score-resume EF (1 credit)
 * - triggerRewrite: opens existing rewrite panel (3 credits)
 * - proceedToApply: creates pending_applications row + dual-path submission
 * - approvePendingApp: calls submit-application on approval
 * - DUAL PATH: API (Recruitee/Greenhouse) via submit-application EF
 *              Browser fill (Lever/Ashby/Workable/others) via Chrome extension
 * - Extension detection: dashboard:ping checks if extension is installed
 * - Extension dispatch: dashboard:apply opens ATS URL and fills via extension
 * - Channel map: resolveChannel() translates hardcoded names to fingerprinted versions
 * - Resume sync: pushes resume text to extension for jdMatcher scoring
 * - Auto-status: listens for extension status updates → pending_applications
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

// ── Extension state ──
var _extensionState = {
  installed: false,
  version: null,
  capabilities: [],
  extensionId: null,
  lastChecked: 0,
};

// ═══════════════════════════════════════════════════════════
// EXTENSION DETECTION
// Uses chrome.runtime.sendMessage to the extension via
// externally_connectable (manifest.json)
// ═══════════════════════════════════════════════════════════

/**
 * Detect if the Brilliant Jobs Chrome extension is installed.
 * Sends a dashboard:ping message; extension responds with version + capabilities.
 * Caches result for 5 minutes.
 */
async function detectExtension() {
  // Return cached result if fresh (< 5 min)
  if (_extensionState.lastChecked && (Date.now() - _extensionState.lastChecked < 300000)) {
    return _extensionState.installed;
  }

  // Try known extension IDs (Chrome Web Store + dev)
  // The extension ID will be set after first successful ping
  var extensionIds = _extensionState.extensionId
    ? [_extensionState.extensionId]
    : _getKnownExtensionIds();

  for (var i = 0; i < extensionIds.length; i++) {
    try {
      var response = await _pingExtension(extensionIds[i]);
      if (response && response.success && response.installed) {
        _extensionState.installed = true;
        _extensionState.version = response.version || null;
        _extensionState.capabilities = response.capabilities || [];
        _extensionState.extensionId = extensionIds[i];
        _extensionState.tier = response.tier || 'free';
        _extensionState.tierStatus = response.tierStatus || null;
        _extensionState.lastChecked = Date.now();
        console.log('[apply-workflow] Extension detected: v' + response.version +
          ' — capabilities: ' + (response.capabilities || []).join(', ') +
          ' — tier: ' + (response.tier || 'free'));
        // Push current user tier to extension so it stays in sync
        _syncTierToExtension(extensionIds[i]);
        return true;
      }
    } catch (e) {
      // Extension not found at this ID, try next
    }
  }

  _extensionState.installed = false;
  _extensionState.version = null;
  _extensionState.capabilities = [];
  _extensionState.lastChecked = Date.now();
  return false;
}

function _getKnownExtensionIds() {
  // Try reading from localStorage (set during extension installation)
  try {
    var stored = localStorage.getItem('bj_extension_id');
    if (stored) return [stored];
  } catch (e) {}
  // Fallback: user can set via settings page or extension popup sets it
  return [];
}

function _pingExtension(extensionId) {
  return new Promise(function(resolve, reject) {
    if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
      reject(new Error('Chrome runtime not available'));
      return;
    }
    try {
      chrome.runtime.sendMessage(extensionId, { type: (window._bjExtensionDownload ? window._bjExtensionDownload.resolveChannel('dashboard:ping') : 'dashboard:ping') }, function(response) {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    } catch (e) {
      reject(e);
    }
    // Timeout after 3 seconds
    setTimeout(function() { reject(new Error('ping timeout')); }, 3000);
  });
}

/**
 * Sync the user's current subscription tier from dashboard to extension.
 * Called on extension detect and after plan changes.
 */
function _syncTierToExtension(extensionId) {
  var tier = window._bjUserPlan || 'free';
  try {
    chrome.runtime.sendMessage(extensionId || _extensionState.extensionId, {
      type: (window._bjExtensionDownload ? window._bjExtensionDownload.resolveChannel('dashboard:setTier') : 'dashboard:setTier'),
      tier: tier
    }, function(response) {
      if (chrome.runtime.lastError) return; // silently ignore
      if (response && response.success) {
        console.log('[apply-workflow] Tier synced to extension: ' + tier);
      }
    });
  } catch (e) {
    // Silent — tier sync is best-effort
  }
}

/**
 * Check if the extension supports browser fill for a given ATS source.
 */
function extensionSupportsAts(atsSource) {
  if (!_extensionState.installed) return false;
  // Map ATS source to capability name
  var capMap = {
    'lever': 'lever',
    'greenhouse': 'greenhouse-legacy',
    'ashby': 'ashby',
    'workable': 'workable',
    'recruitee': 'recruitee',
  };
  var cap = capMap[atsSource] || atsSource;
  return _extensionState.capabilities.indexOf(cap) >= 0;
}

/**
 * Determine submission path for a job URL:
 * - 'api': Server-side submission (Recruitee zero-auth, Greenhouse with token)
 * - 'browser_fill': Extension fills form in user's browser
 * - 'manual': No automation available, open URL for user
 */
function getSubmissionPath(jobUrl) {
  var ats = _guessAtsSource(jobUrl);

  // Recruitee always uses API (zero-auth server-side)
  if (ats === 'recruitee') return 'api';

  // Greenhouse: try API first (if token exists), fallback to browser fill
  // API path is attempted by submit-application EF — it returns 'no_api_support' if no token
  if (ats === 'greenhouse') return 'api_then_browser';

  // All others: browser fill if extension installed, else manual
  if (_extensionState.installed && extensionSupportsAts(ats)) return 'browser_fill';

  return 'manual';
}

/**
 * Dispatch a browser-fill request to the extension.
 * Opens the job URL in a new tab, extension fills the form.
 * Returns: { success, filledFields, totalFields, needsIntervention, error }
 */
async function dispatchBrowserFill(jobUrl, pendingAppId) {
  if (!_extensionState.installed || !_extensionState.extensionId) {
    return { success: false, error: 'extension_not_installed' };
  }

  // ── P7 Tier Gate: Check auto_apply entitlement before dispatching ──
  if (typeof checkEntitlement === 'function') {
    try {
      var ent = await checkEntitlement('auto_apply', 0);
      if (!ent.allowed) {
        if (typeof showUpgradePrompt === 'function') showUpgradePrompt('Auto-Apply', ent);
        return { success: false, error: 'tier_blocked', reason: ent.behavior === 'off' ? 'free_tier' : 'limit_reached', message: 'Upgrade to Pro to use autofill.' };
      }
    } catch (e) {
      console.warn('[apply-workflow] Entitlement check failed, allowing:', e.message);
    }
  }

  // Build profile from user data
  var profile = _buildProfileForFill();
  if (!profile) {
    return { success: false, error: 'no_profile_data' };
  }

  // Get resume data URL if available
  var resume = _getActiveResume();

  return new Promise(function(resolve) {
    try {
      chrome.runtime.sendMessage(_extensionState.extensionId, {
        type: (window._bjExtensionDownload ? window._bjExtensionDownload.resolveChannel('dashboard:apply') : 'dashboard:apply'),
        jobUrl: jobUrl,
        profile: profile,
        resume: resume ? { filename: resume.filename, id: resume.id } : null,
        preferences: {},
        pendingAppId: pendingAppId || null,
      }, function(response) {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message || 'extension_error' });
        } else {
          // Handle tier_blocked from extension side
          if (response && response.error === 'tier_blocked') {
            if (typeof showUpgradePrompt === 'function') {
              showUpgradePrompt('Auto-Apply', { behavior: response.reason === 'free_tier' ? 'off' : 'fixed', effective_limit: response.dailyLimit });
            }
          }
          resolve(response || { success: false, error: 'no_response' });
        }
      });
    } catch (e) {
      resolve({ success: false, error: e.message || 'dispatch_error' });
    }
    // 60 second timeout for the fill operation
    setTimeout(function() {
      resolve({ success: false, error: 'fill_timeout', needsIntervention: true,
        interventionReason: 'Form fill timed out. Please check the tab and complete manually.' });
    }, 60000);
  });
}

/**
 * Build the profile object the extension expects for form filling.
 */
function _buildProfileForFill() {
  if (!currentUser) return null;
  var meta = currentUser.user_metadata || {};
  var profile = typeof window.getUserProfile === 'function' ? window.getUserProfile() : null;

  return {
    firstName: meta.first_name || meta.full_name?.split(' ')[0] || '',
    lastName: meta.last_name || meta.full_name?.split(' ').slice(1).join(' ') || '',
    fullName: meta.full_name || ((meta.first_name || '') + ' ' + (meta.last_name || '')).trim(),
    email: currentUser.email || '',
    phone: meta.phone || profile?.phone || '',
    linkedin: meta.linkedin_url || profile?.linkedin || '',
    github: meta.github_url || profile?.github || '',
    portfolio: meta.portfolio_url || profile?.portfolio || '',
    currentCompany: meta.current_company || profile?.currentCompany || '',
    currentTitle: meta.current_title || profile?.currentTitle || '',
    location: meta.location || profile?.location || '',
    visaSponsorship: profile?.visaSponsorship || 'no',
    legallyAuthorized: profile?.legallyAuthorized || 'yes',
    willingToRelocate: profile?.willingToRelocate || 'yes',
  };
}

function loadApplySettings() {
  try {
    var raw = localStorage.getItem('bj_apply_settings');
    if (raw) userApplySettings = Object.assign({}, DEFAULT_APPLY_SETTINGS, JSON.parse(raw));
  } catch (e) {}
}

function saveApplySettings() {
  try { localStorage.setItem('bj_apply_settings', JSON.stringify(userApplySettings)); } catch (e) {}
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
      .in('status', ['pending', 'approved', 'failed'])
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[apply-workflow] Load pending apps error:', error.message);
      pendingApplications = [];
    } else {
      pendingApplications = data || [];
    }
  } catch (e) {
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
// Routes: Recruitee (real API), Greenhouse (API if token), others (mock fallback)
// For non-API platforms, dashboard uses browser fill via extension instead
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
    console.error('[apply-workflow] submit-application error:', e);
    return { ok: false, error: 'network_error' };
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
  if (url.indexOf('linkedin.com') >= 0) return 'linkedin-easy-apply';
  if (url.indexOf('indeed.com') >= 0) return 'indeed';
  if (url.indexOf('myworkdayjobs.com') >= 0) return 'workday';
  return 'greenhouse';
}

// ═══════════════════════════════════════════════════════════
// HELPER: Get active resume for current user
// ═══════════════════════════════════════════════════════════

function _getActiveResume() {
  // Check resumes module for selected resume
  if (typeof window._activeResumeId !== 'undefined' && window._activeResumeId) {
    return { id: window._activeResumeId, filename: window._activeResumeFilename || 'resume.pdf' };
  }
  // Fallback: check localStorage
  try {
    var raw = localStorage.getItem('bj_resumes'); if (raw && raw.startsWith('enc:')) raw = null;
    if (raw) {
      var resumes = JSON.parse(raw);
      if (resumes.length > 0) return { id: resumes[0].id || crypto.randomUUID(), filename: resumes[0].name || 'resume.pdf' };
    }
  } catch (e) {}
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
  } catch (e) {
    console.error('[apply-workflow] Notification send error:', e);
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
    breakdownHtml = '<div class="sg-breakdown">';
    if (scoreResult.analysis_summary) {
      breakdownHtml += '<div class="sg-summary">' + escapeHtml(scoreResult.analysis_summary) + '</div>';
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
  } catch (e) {}

  if (!resumeText) {
    // Fallback: check localStorage
    try {
      var raw = localStorage.getItem('bj_resumes'); if (raw && raw.startsWith('enc:')) raw = null;
      if (raw) {
        var resumes = JSON.parse(raw);
        if (resumes.length > 0) resumeText = resumes[0].text || '';
      }
    } catch (e) {}
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
  closeScoreGateModal();

  if (_applySubmitting) return;
  _applySubmitting = true;

  var mode = getApplyModeForJob(jobId);

  // ── Mode 1: Manual — just open URL, update pipeline ──
  if (mode === APPLY_MODES.MANUAL) {
    if (jobUrl) window.open(jobUrl, '_blank');
    _updatePipelineApplied(jobId);
    if (typeof showToast === 'function') showToast('Opened application page for ' + (companyName || 'this job'));
    _applySubmitting = false;
    return;
  }

  // ── Modes 2-6: Create pending_application + submit via dual path ──
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
  };

  var savedApp = await savePendingApplication(pendingRow);
  if (!savedApp) {
    if (typeof showToast === 'function') showToast('Failed to create application record.', { type: 'error' });
    _applySubmitting = false;
    return;
  }

  // ── DUAL PATH: Determine submission route ──
  var submissionPath = getSubmissionPath(jobUrl);
  var result;

  if (submissionPath === 'api') {
    // Path A: Server-side API submission (Recruitee zero-auth, Greenhouse with token)
    console.log('[apply-workflow] Using API path for ' + _guessAtsSource(jobUrl));
    result = await callSubmitApplication(savedApp, resume.id, resume.filename);

  } else if (submissionPath === 'api_then_browser') {
    // Path B: Try API first (Greenhouse), fall back to browser fill
    console.log('[apply-workflow] Trying API path first for Greenhouse...');
    result = await callSubmitApplication(savedApp, resume.id, resume.filename);

    // If API returned no_api_support/no_api_token, try browser fill
    if (!result.ok && result.data && result.data.detail === 'no_api_token') {
      console.log('[apply-workflow] No API token — falling back to browser fill');
      var hasExtension = await detectExtension();
      if (hasExtension && extensionSupportsAts('greenhouse')) {
        if (typeof showToast === 'function') showToast('Opening form for auto-fill...', { duration: 5000 });
        var browserResult = await dispatchBrowserFill(jobUrl, savedApp.id);
        result = {
          ok: browserResult.success,
          data: browserResult,
          error: browserResult.error,
          method: 'browser_fill',
        };
      }
      // If no extension, result stays as the API failure — user gets toast about it
    }

  } else if (submissionPath === 'browser_fill') {
    // Path C: Browser-based form fill via extension
    console.log('[apply-workflow] Using browser fill path for ' + _guessAtsSource(jobUrl));
    if (typeof showToast === 'function') showToast('Opening form for auto-fill...', { duration: 5000 });
    var browserResult = await dispatchBrowserFill(jobUrl, savedApp.id);
    result = {
      ok: browserResult.success,
      data: browserResult,
      error: browserResult.error,
      method: 'browser_fill',
    };

  } else {
    // Path D: Manual — open URL, let user fill manually
    console.log('[apply-workflow] Manual path — opening URL for user');
    if (jobUrl) window.open(jobUrl, '_blank');
    result = { ok: true, method: 'manual' };
  }

  // ── Handle result ──
  if (result.ok) {
    _updatePipelineApplied(jobId);
    var method = result.method || 'api';
    var successMsg = method === 'browser_fill'
      ? 'Form filled for ' + (companyName || 'this job') + '! Please review and submit.'
      : method === 'manual'
        ? 'Opened application page for ' + (companyName || 'this job')
        : 'Applied to ' + (companyName || 'this job') + '!';
    if (typeof showToast === 'function') showToast(successMsg, { type: 'success' });

    // Check if extension reported needs-intervention
    if (result.data && result.data.needsIntervention) {
      if (typeof showToast === 'function') showToast(
        result.data.interventionReason || 'Some fields may need manual attention.',
        { type: 'warning', duration: 8000 }
      );
    }

    // Fire notification
    _fireApplyNotification('apply_auto_submitted', {
      subject: 'Applied: ' + (jobTitle || 'Job') + ' at ' + (companyName || 'Company'),
      html: '<p>Your resume was submitted for <strong>' + escapeHtml(jobTitle || '') + '</strong> at <strong>' + escapeHtml(companyName || '') + '</strong>.</p>',
      job_id: jobId,
      job_title: jobTitle,
      company_name: companyName,
    });
  } else if (result.error === 'rejected' || (result.data && result.data.status === 'rejected')) {
    var detail = (result.data && result.data.detail) || result.detail || 'Unknown reason';
    if (typeof showToast === 'function') showToast('Application rejected: ' + detail + '. You can retry.', { type: 'error', duration: 6000 });
  } else if (result.error === 'extension_not_installed') {
    // Extension not available — fallback to opening URL
    if (jobUrl) window.open(jobUrl, '_blank');
    if (typeof showToast === 'function') showToast(
      'Install the Brilliant Jobs extension for auto-fill! Opened the form for manual application.',
      { type: 'warning', duration: 8000 }
    );
  } else if (result.error === 'timeout' || result.error === 'fill_timeout') {
    if (typeof showToast === 'function') showToast('ATS timed out. Your application was saved — you can retry.', { type: 'error', duration: 6000 });
  } else {
    if (typeof showToast === 'function') showToast('Submission failed: ' + (result.error || 'Unknown error') + '. Retry from Pending Applications.', { type: 'error', duration: 6000 });
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

  // Modes 2+: Check score
  var scoreResult = getScoreForJob(jobId);
  var hasScore = scoreResult && typeof scoreResult.match_score === 'number';
  var score = hasScore ? scoreResult.match_score : null;
  var threshold = userApplySettings.default_score_threshold;

  if (mode === APPLY_MODES.SCORE_GATED) {
    // Mode 2: Show gate if low/unscored
    if (!hasScore || score < threshold) {
      showScoreGateModal(jobId, jobTitle, companyName, jobUrl, scoreResult);
    } else {
      proceedToApply(jobId, jobTitle, companyName, jobUrl);
    }
    return;
  }

  // Modes 3-6: Auto modes (handled by auto-apply engine, not manual click)
  // For manual clicks in auto mode, just apply directly
  proceedToApply(jobId, jobTitle, companyName, jobUrl);
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
// PENDING APPLICATIONS PANEL
// ═══════════════════════════════════════════════════════════

function renderPendingApplications() {
  var container = document.getElementById('pending-apps-panel');
  if (!container) return;

  var pending = pendingApplications.filter(function(a) {
    return a.status === APPLY_STATUS.PENDING || a.status === APPLY_STATUS.FAILED;
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
      statusBadge = '<span class="pa-badge pa-badge-failed">Failed — Retry?</span>';
    }

    var actionsHtml = '';
    if (app.status === APPLY_STATUS.FAILED) {
      // Failed: show retry
      actionsHtml =
        '<button class="pa-btn pa-btn-primary" onclick="retryPendingApp(\'' + app.id + '\')">Retry Submit</button>' +
        '<button class="pa-btn pa-btn-ghost" onclick="skipPendingApp(\'' + app.id + '\')">Skip</button>';
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

    var rewriteBadge = app.rewritten_score ? '<span class="pa-badge pa-badge-rewrite">Rewritten</span>' : '';

    return '<div class="pa-card" data-app-id="' + (app.id || i) + '">' +
      '<div class="pa-card-left">' +
        '<div class="pa-job-title">' + escapeHtml(app.job_title || 'Unknown Job') + '</div>' +
        '<div class="pa-job-company">' + escapeHtml(app.company_name || '') + '</div>' +
      '</div>' +
      '<div class="pa-card-center">' +
        scoreHtml + rewriteBadge + statusBadge +
        (app.rewrite_summary ? '<div class="pa-rewrite-summary">' + escapeHtml(app.rewrite_summary) + '</div>' : '') +
      '</div>' +
      '<div class="pa-card-actions">' + actionsHtml + '</div>' +
    '</div>';
  }).join('');
}

// ═══════════════════════════════════════════════════════════
// D4: Pending Application Actions — Supabase-backed
// ═══════════════════════════════════════════════════════════

async function approvePendingApp(appId) {
  var app = pendingApplications.find(function(a) { return a.id === appId; });
  if (!app) return;

  if (_applySubmitting) return;
  _applySubmitting = true;

  // Update status to approved
  await updatePendingApplication(appId, {
    status: APPLY_STATUS.APPROVED,
    responded_at: new Date().toISOString(),
  });

  if (typeof showToast === 'function') showToast('Submitting to ' + (app.company_name || 'ATS') + '...', { duration: 10000 });

  // Submit to mock ATS
  var resume = _getActiveResume();
  var result = await callSubmitApplication(app, resume.id, resume.filename);

  if (result.ok) {
    _updatePipelineApplied(app.job_id);
    if (typeof showToast === 'function') showToast('Applied to ' + (app.company_name || 'job') + '!', { type: 'success' });
    // D6: Fire notification
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

  if (typeof showToast === 'function') showToast('Submitting rewritten resume...', { duration: 10000 });

  var result = await callSubmitApplication(app, resumeId, 'resume-rewritten.pdf');

  if (result.ok) {
    _updatePipelineApplied(app.job_id);
    if (typeof showToast === 'function') showToast('Submitted rewritten resume to ' + (app.company_name || 'job') + '!', { type: 'success' });
    // D6: Rewrite submitted notification
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

  if (typeof showToast === 'function') showToast('Submitting original resume...', { duration: 10000 });

  var resume = _getActiveResume();
  var result = await callSubmitApplication(app, resume.id, resume.filename);

  if (result.ok) {
    _updatePipelineApplied(app.job_id);
    if (typeof showToast === 'function') showToast('Submitted original resume to ' + (app.company_name || 'job') + '!', { type: 'success' });
  } else {
    if (typeof showToast === 'function') showToast('Submission failed: ' + (result.error || 'Unknown') + '. You can retry.', { type: 'error' });
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
// RESUME TEXT SYNC: DASHBOARD → EXTENSION
// Sends current resume text to extension for jdMatcher scoring
// ═══════════════════════════════════════════════════════════

async function syncResumeToExtension() {
  if (!_extensionState.installed || !_extensionState.extensionId) return;

  var resume = _getActiveResume();
  if (!resume) return;

  var resumeText = '';
  try {
    var sb = window._bjSupabase;
    if (sb) {
      var { data: archiveData } = await sb
        .from('resume_archive')
        .select('parsed_text')
        .eq('id', resume.id)
        .single();
      resumeText = archiveData?.parsed_text || '';
    }
  } catch (e) {}

  if (!resumeText) {
    try {
      var raw = localStorage.getItem('bj_resumes');
      if (raw && !raw.startsWith('enc:')) {
        var resumes = JSON.parse(raw);
        if (resumes.length > 0) resumeText = resumes[0].text || '';
      }
    } catch (e) {}
  }

  if (!resumeText) {
    console.warn('[apply-workflow] No resume text available for extension sync');
    return;
  }

  var channelName = window._bjExtensionDownload
    ? window._bjExtensionDownload.resolveChannel('dashboard:fillCurrent')
    : 'dashboard:fillCurrent';

  try {
    chrome.runtime.sendMessage(_extensionState.extensionId, {
      type: channelName,
      action: 'resumeSync',
      resumeText: resumeText,
      resumeId: resume.id,
      resumeName: resume.filename || resume.name || 'resume',
    }, function(response) {
      if (chrome.runtime.lastError) return;
      if (response && response.success) {
        console.log('[apply-workflow] Resume text synced to extension (' + resumeText.length + ' chars)');
      }
    });
  } catch (e) {
    console.warn('[apply-workflow] Resume sync to extension failed:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════
// AUTO-STATUS UPDATE: EXTENSION → DASHBOARD
// Listens for application status updates from extension and
// updates pending_applications accordingly
// ═══════════════════════════════════════════════════════════

function initExtensionStatusListener() {
  // Listen for messages from the extension via window.postMessage
  // The extension sends status updates after form submission
  window.addEventListener('message', async function(event) {
    if (event.origin !== window.location.origin) return;
    if (!event.data || event.data.source !== 'bj-extension') return;

    var msg = event.data;

    if (msg.type === 'applicationStatus') {
      console.log('[apply-workflow] Extension status update:', msg.status, 'for', msg.pendingAppId);

      if (!msg.pendingAppId) return;

      var sb = window._bjSupabase;
      if (!sb) return;

      try {
        var updateData = {
          status: msg.status || 'submitted',
          updated_at: new Date().toISOString(),
        };

        if (msg.status === 'submitted') {
          updateData.submitted_at = new Date().toISOString();
          updateData.submission_method = 'browser_fill';
        }

        if (msg.confirmationDetected) {
          updateData.confirmation_detected = true;
          updateData.confirmation_url = msg.confirmationUrl || null;
        }

        if (msg.error) {
          updateData.status = 'failed';
          updateData.error_detail = msg.error;
        }

        await sb
          .from('pending_applications')
          .update(updateData)
          .eq('id', msg.pendingAppId);

        console.log('[apply-workflow] Updated pending_application', msg.pendingAppId, 'to', updateData.status);

        // Refresh local state
        await loadPendingApplications();
        renderPendingApplications();

        // Show toast
        if (typeof showToast === 'function') {
          if (updateData.status === 'submitted') {
            showToast('Application submitted via extension!', { type: 'success', duration: 4000 });
          } else if (updateData.status === 'failed') {
            showToast('Application failed: ' + (msg.error || 'Unknown error'), { type: 'error', duration: 6000 });
          }
        }
      } catch (e) {
        console.error('[apply-workflow] Failed to update pending_application:', e);
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════

loadApplySettings();

// Initialize extension status listener for auto-status updates
initExtensionStatusListener();

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

    // Detect extension, then sync resume text
    var extDetected = await detectExtension();
    if (extDetected) {
      syncResumeToExtension();
    }
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
