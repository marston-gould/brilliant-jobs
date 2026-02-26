/**
 * Brilliant Jobs — Apply Workflow v4.83
 * Score Gate Modal, Pending Applications, and Apply State Machine
 * 
 * Phase 1: UI Shell (no ATS endpoints)
 * - Score Gate Modal: intercepts Apply when score is low/unscored
 * - Pending Applications: queued items awaiting action
 * - Apply Settings: per-filter configuration
 * - Rewrite Review Modal: shows AI rewrite diff
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

function loadApplySettings() {
  try {
    var raw = localStorage.getItem('bj_apply_settings');
    if (raw) userApplySettings = Object.assign({}, DEFAULT_APPLY_SETTINGS, JSON.parse(raw));
  } catch (e) {}
}

function saveApplySettings() {
  try { localStorage.setItem('bj_apply_settings', JSON.stringify(userApplySettings)); } catch (e) {}
}

function loadPendingApplications() {
  try {
    var raw = localStorage.getItem('bj_pending_applications');
    if (raw) pendingApplications = JSON.parse(raw);
  } catch (e) { pendingApplications = []; }
}

function savePendingApplications() {
  try { localStorage.setItem('bj_pending_applications', JSON.stringify(pendingApplications)); } catch (e) {}
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
        (hasScore ? '' : '<button class="sg-btn sg-btn-accent" onclick="scoreAndRecheck(\'' + escapeHtml(jobId) + '\')">Score Now (1 credit)</button>') +
        '<button class="sg-btn sg-btn-rewrite" onclick="triggerRewrite(\'' + escapeHtml(jobId) + '\')">AI Rewrite (3 credits)</button>' +
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

function proceedToApply(jobId, jobTitle, companyName, jobUrl) {
  closeScoreGateModal();
  // Open ATS page
  if (jobUrl) window.open(jobUrl, '_blank');
  // Mark as applied in pipeline
  if (typeof toggleSaveJob === 'function') {
    // Ensure it's in pipeline first
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
  if (typeof showToast === 'function') showToast('Opened application page for ' + (companyName || 'this job'));
}

// Placeholder: will call score-resume EF when wired
function scoreAndRecheck(jobId) {
  if (typeof showToast === 'function') showToast('Scoring your resume against this job...', { duration: 3000 });
  // TODO: Call score-resume Edge Function, then re-show modal with score
  closeScoreGateModal();
}

// Placeholder: will call rewrite flow when wired
function triggerRewrite(jobId) {
  if (typeof showToast === 'function') showToast('AI resume rewrite queued (3 credits)', { duration: 3000 });
  // TODO: Call rewrite flow, show Rewrite Review Modal
  closeScoreGateModal();
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

  var pending = pendingApplications.filter(function(a) { return a.status === APPLY_STATUS.PENDING; });
  
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

    var actionsHtml = '';
    if (app.approval_mode === 'rewrite_review') {
      actionsHtml = 
        '<button class="pa-btn pa-btn-primary" onclick="approveRewrittenApp(' + i + ')">Submit Rewritten</button>' +
        '<button class="pa-btn pa-btn-secondary" onclick="approveOriginalApp(' + i + ')">Submit Original</button>' +
        '<button class="pa-btn pa-btn-ghost" onclick="skipPendingApp(' + i + ')">Skip</button>';
    } else if (app.approval_mode === 'auto_with_approval') {
      actionsHtml = 
        '<button class="pa-btn pa-btn-primary" onclick="approvePendingApp(' + i + ')">Approve & Submit</button>' +
        '<button class="pa-btn pa-btn-ghost" onclick="skipPendingApp(' + i + ')">Skip</button>';
    } else {
      actionsHtml = 
        '<button class="pa-btn pa-btn-primary" onclick="approvePendingApp(' + i + ')">Apply</button>' +
        '<button class="pa-btn pa-btn-accent" onclick="scorePendingApp(' + i + ')">Score First</button>' +
        '<button class="pa-btn pa-btn-ghost" onclick="skipPendingApp(' + i + ')">Skip</button>';
    }

    var rewriteBadge = app.rewritten_score ? '<span class="pa-badge pa-badge-rewrite">Rewritten</span>' : '';

    return '<div class="pa-card" data-app-id="' + (app.id || i) + '">' +
      '<div class="pa-card-left">' +
        '<div class="pa-job-title">' + escapeHtml(app.job_title || 'Unknown Job') + '</div>' +
        '<div class="pa-job-company">' + escapeHtml(app.company_name || '') + '</div>' +
      '</div>' +
      '<div class="pa-card-center">' +
        scoreHtml + rewriteBadge +
        (app.rewrite_summary ? '<div class="pa-rewrite-summary">' + escapeHtml(app.rewrite_summary) + '</div>' : '') +
      '</div>' +
      '<div class="pa-card-actions">' + actionsHtml + '</div>' +
    '</div>';
  }).join('');
}

function approvePendingApp(idx) {
  if (!pendingApplications[idx]) return;
  var app = pendingApplications[idx];
  app.status = APPLY_STATUS.APPROVED;
  app.responded_at = new Date().toISOString();
  savePendingApplications();
  
  // Open ATS page (or submit via API when available)
  if (app.job_url) window.open(app.job_url, '_blank');
  
  // Move to submitted
  app.status = APPLY_STATUS.SUBMITTED;
  app.submitted_at = new Date().toISOString();
  savePendingApplications();
  renderPendingApplications();
  
  if (typeof showToast === 'function') showToast('Applied to ' + (app.company_name || 'job'));
}

function approveRewrittenApp(idx) {
  if (!pendingApplications[idx]) return;
  var app = pendingApplications[idx];
  app.status = APPLY_STATUS.SUBMITTED;
  app.submitted_at = new Date().toISOString();
  app.used_rewrite = true;
  savePendingApplications();
  renderPendingApplications();
  if (typeof showToast === 'function') showToast('Submitted rewritten resume to ' + (app.company_name || 'job'));
}

function approveOriginalApp(idx) {
  if (!pendingApplications[idx]) return;
  var app = pendingApplications[idx];
  app.status = APPLY_STATUS.SUBMITTED;
  app.submitted_at = new Date().toISOString();
  app.used_rewrite = false;
  savePendingApplications();
  renderPendingApplications();
  if (typeof showToast === 'function') showToast('Submitted original resume to ' + (app.company_name || 'job'));
}

function skipPendingApp(idx) {
  if (!pendingApplications[idx]) return;
  pendingApplications[idx].status = APPLY_STATUS.SKIPPED;
  pendingApplications[idx].responded_at = new Date().toISOString();
  savePendingApplications();
  renderPendingApplications();
  if (typeof showToast === 'function') showToast('Skipped');
}

function scorePendingApp(idx) {
  if (typeof showToast === 'function') showToast('Scoring resume... (1 credit)', { duration: 3000 });
  // TODO: Call score-resume EF
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
loadPendingApplications();

// Render pending apps on page load if panel exists
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(renderPendingApplications, 500);
});

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
