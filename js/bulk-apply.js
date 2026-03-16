// js/bulk-apply.js — AIS-F9-S1: Bulk Apply Multi-Select UI
// ============================================================
// Manages checkbox selection on the Jobs Feed, bulk action bar,
// selection count badge, and estimated credit cost display.
// Bulk apply action queues selected jobs via the bulk-apply-queue EF (AIS-F9-S2).

(function () {
  'use strict';

  var _selectedJobIds = new Set();

  var CREDITS_PER_APPLICATION = 3; // same as resume tailoring baseline

  // ── Update action bar ────────────────────────────────────────────────────
  function _updateBar() {
    var bar = document.getElementById('bulk-action-bar');
    var badge = document.getElementById('bulk-count-badge');
    var cost = document.getElementById('bulk-credit-cost');
    if (!bar) return;

    var count = _selectedJobIds.size;
    if (count === 0) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';
    if (badge) badge.textContent = count + ' selected';
    if (cost) cost.textContent = '~' + (count * CREDITS_PER_APPLICATION) + ' credits estimated';

    // Sync select-all checkbox state
    var selectAll = document.getElementById('bulk-select-all');
    if (selectAll) {
      var all = document.querySelectorAll('.bulk-job-cb');
      selectAll.indeterminate = count > 0 && count < all.length;
      selectAll.checked = count > 0 && count === all.length;
    }
  }

  // ── Toggle individual job ────────────────────────────────────────────────
  window._bulkToggleJob = function (jobId, checked) {
    if (checked) {
      _selectedJobIds.add(jobId);
    } else {
      _selectedJobIds.delete(jobId);
    }
    _updateBar();
  };

  // ── Select / deselect all visible ────────────────────────────────────────
  window._bulkSelectAll = function (checked) {
    var cbs = document.querySelectorAll('.bulk-job-cb');
    cbs.forEach(function (cb) {
      cb.checked = checked;
      var jid = cb.dataset.jobid;
      if (jid) {
        if (checked) _selectedJobIds.add(jid);
        else _selectedJobIds.delete(jid);
      }
    });
    _updateBar();
  };

  // ── Clear selection ──────────────────────────────────────────────────────
  window._bulkClearSelection = function () {
    _selectedJobIds.clear();
    document.querySelectorAll('.bulk-job-cb').forEach(function (cb) { cb.checked = false; });
    var selectAll = document.getElementById('bulk-select-all');
    if (selectAll) { selectAll.checked = false; selectAll.indeterminate = false; }
    _updateBar();
  };

  // ── Get selected IDs (used by F9-S2 queue EF) ───────────────────────────
  window._bulkGetSelected = function () {
    return Array.from(_selectedJobIds);
  };

  // ── Bulk Apply: queue all selected jobs ──────────────────────────────────
  window._bulkApplySelected = async function () {
    var ids = Array.from(_selectedJobIds);
    if (!ids.length) return;

    var tierOk = typeof checkAutoApplyTierGate === 'function' ? checkAutoApplyTierGate() : true;
    if (!tierOk) return;

    if (!confirm('Apply to ' + ids.length + ' job' + (ids.length > 1 ? 's' : '') + ' automatically? (~' + (ids.length * CREDITS_PER_APPLICATION) + ' credits)')) return;

    if (typeof capturePostHog === 'function') capturePostHog('bulk_apply_initiated', { job_count: ids.length });

    // AIS-F9-S2 queue EF call — trigger if available
    if (typeof window._bulkApplyQueue === 'function') {
      await window._bulkApplyQueue(ids);
    } else {
      // Graceful fallback: apply individually via existing flow
      for (var i = 0; i < Math.min(ids.length, 3); i++) {
        if (typeof proceedToApply === 'function') {
          var row = document.querySelector('tr.job-data-row[data-jobid="' + ids[i] + '"]');
          var title = row ? (row.querySelector('.job-title-link') || {}).textContent : '';
          await proceedToApply(ids[i], title, '', window.location.href, null, null, 'bulk');
        }
      }
      if (ids.length > 3 && typeof showToast === 'function') {
        showToast('Queued first 3 jobs. Install the extension for full bulk apply.', { type: 'info' });
      }
    }
    window._bulkClearSelection();
  };

  // ── Bulk Save: pipeline-save all selected ────────────────────────────────
  window._bulkSaveSelected = async function () {
    var ids = Array.from(_selectedJobIds);
    if (!ids.length) return;
    var saved = 0;
    for (var i = 0; i < ids.length; i++) {
      if (typeof saveJobToPipeline === 'function') {
        try { await saveJobToPipeline(ids[i]); saved++; } catch (_e) {}
      }
    }
    if (typeof showToast === 'function') showToast(saved + ' job' + (saved > 1 ? 's' : '') + ' saved to pipeline.');
    if (typeof capturePostHog === 'function') capturePostHog('bulk_save', { job_count: saved });
    window._bulkClearSelection();
  };

  // ── Reset checkboxes on feed re-render ───────────────────────────────────
  // Called by job-feed.js after rendering new page
  window._bulkResetOnRender = function () {
    _selectedJobIds.clear();
    _updateBar();
  };

  // AIS-F9-S3: Bulk Apply Progress Dashboard
  var _bulkProgressTimer = null;

  window._bulkProgressClose = function () {
    var panel = document.getElementById('bulk-progress-panel');
    if (panel) panel.style.display = 'none';
    if (_bulkProgressTimer) { clearInterval(_bulkProgressTimer); _bulkProgressTimer = null; }
  };

  window._bulkPollProgress = function (queueIds) {
    var panel = document.getElementById('bulk-progress-panel');
    if (panel) panel.style.display = 'block';

    var pollCount = 0;
    var MAX_POLLS = 120; // ~10 min at 5s intervals

    async function poll() {
      if (pollCount++ > MAX_POLLS) { clearInterval(_bulkProgressTimer); return; }
      try {
        var { data: rows } = await sb.from('bulk_apply_jobs').select('job_id,job_title,company_name,status').in('id', queueIds);
        if (!rows || !rows.length) return;

        var total = rows.length;
        var done = rows.filter(function(r) { return r.status === 'submitted' || r.status === 'failed' || r.status === 'skipped'; }).length;
        var pct = Math.round((done / total) * 100);

        var bar = document.getElementById('bulk-progress-bar');
        var txt = document.getElementById('bulk-progress-text');
        var list = document.getElementById('bulk-job-status-list');
        if (bar) bar.style.width = pct + '%';
        if (txt) txt.textContent = done + ' / ' + total + ' jobs processed';
        if (list) {
          list.innerHTML = rows.map(function(r) {
            var icon = r.status === 'submitted' ? '✅' : r.status === 'failed' ? '❌' : r.status === 'skipped' ? '⏭' : r.status === 'processing' ? '⏳' : '⏸';
            return '<div style="display:flex;align-items:center;gap:6px;padding:3px 0;">' + icon + ' <span style="color:var(--text);">' + escapeHtml(r.job_title || r.job_id) + '</span><span style="color:var(--text-muted);margin-left:auto;">' + (r.company_name || '') + '</span></div>';
          }).join('');
        }

        if (done === total) {
          clearInterval(_bulkProgressTimer);
          if (txt) txt.textContent = 'All done! ' + rows.filter(function(r){return r.status==='submitted';}).length + ' submitted.';
          if (typeof capturePostHog === 'function') capturePostHog('bulk_apply_complete', { submitted: rows.filter(function(r){return r.status==='submitted';}).length, failed: rows.filter(function(r){return r.status==='failed';}).length });
        }
      } catch (e) { /* non-fatal */ }
    }

    poll();
    _bulkProgressTimer = setInterval(poll, 5000);
  };

  // AIS-F9-S3: Safety daily limit check
  window._bulkCheckDailyLimit = async function (requestedCount) {
    try {
      var today = new Date().toISOString().split('T')[0];
      var { data } = await sb.from('bulk_apply_jobs').select('id', { count: 'exact', head: true }).eq('user_id', currentUser.id).gte('created_at', today + 'T00:00:00Z').in('status', ['submitted', 'processing', 'queued']);
      var usedToday = data ? data.length : 0;
      return (usedToday + requestedCount) <= 25;
    } catch (_e) { return true; }
  };

  window.initBulkApply = function () { /* no-op — auto-inits on load */ };

  // AIS-F9-S2: Queue bulk apply via EF
  window._bulkApplyQueue = async function (ids) {
    try {
      var token = typeof _getAuthToken === 'function' ? await _getAuthToken() : (window._bjSupabaseSession && window._bjSupabaseSession.access_token);
      if (!token) { if (typeof showToast === 'function') showToast('Please log in to use bulk apply.', { type: 'error' }); return; }

      var resume = typeof _getActiveResume === 'function' ? _getActiveResume() : null;
      var resp = await fetch('https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/bulk-apply-queue', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_ids: ids, resume_id: resume ? resume.id : null }),
      });
      var data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Queue failed');
      if (typeof showToast === 'function') showToast('Queued ' + data.queued + ' jobs for bulk apply!', { type: 'success' });
      if (typeof capturePostHog === 'function') capturePostHog('bulk_apply_queued', { job_count: data.queued });
    } catch (e) {
      reportError('bulk-apply:_bulkApplyQueue', e);
      if (typeof showToast === 'function') showToast('Bulk apply failed. Please try again.', { type: 'error' });
    }
  };
})();

// ── AIS-F9-S3: Progress Dashboard + Safety ──────────────────────────────

var _bulkUndoTimer = null;
var _bulkSessionStarted = null;
var BULK_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
var BULK_UNDO_WINDOW_MS = 10 * 1000;   // 10 seconds

// Real-time progress polling
var _bulkProgressInterval = null;

window.loadBulkProgress = async function () {
  if (!currentUser) return;
  var panel = document.getElementById('bulk-progress-panel');
  if (!panel) return;

  try {
    var { data, error } = await sb.from('bulk_apply_jobs')
      .select('id, job_id, status, error_message, created_at, completed_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(25);

    if (error) { reportError('loadBulkProgress', error); return; }
    if (!data || !data.length) { panel.style.display = 'none'; return; }

    // Only show panel if there's an active session (queued or in_progress)
    var hasActive = data.some(function(r) { return r.status === 'queued' || r.status === 'in_progress'; });
    panel.style.display = '';

    var total = data.length;
    var done = data.filter(function(r) { return r.status === 'submitted' || r.status === 'failed'; }).length;
    var pct = total > 0 ? Math.round((done / total) * 100) : 0;

    var barEl = document.getElementById('bulk-progress-bar');
    if (barEl) barEl.style.width = pct + '%';

    var statsEl = document.getElementById('bulk-progress-stats');
    var submitted = data.filter(function(r){ return r.status === 'submitted'; }).length;
    var failed = data.filter(function(r){ return r.status === 'failed'; }).length;
    var queued = data.filter(function(r){ return r.status === 'queued' || r.status === 'in_progress'; }).length;
    if (statsEl) {
      statsEl.innerHTML = '<span style="color:var(--green);">✓ ' + submitted + ' submitted</span>' +
        (queued ? ' &nbsp;· <span style="color:var(--accent);">⏳ ' + queued + ' queued</span>' : '') +
        (failed ? ' &nbsp;· <span style="color:var(--warm);">✗ ' + failed + ' failed</span>' : '');
    }

    // Per-job status list
    var listEl = document.getElementById('bulk-progress-list');
    if (listEl) {
      var esc = typeof escapeHtml === 'function' ? escapeHtml : function(s){return String(s||'');};
      listEl.innerHTML = data.slice(0, 10).map(function(row) {
        var icon = row.status === 'submitted' ? '✅' : row.status === 'failed' ? '❌' : row.status === 'in_progress' ? '🔄' : '⏳';
        return '<div style="display:flex;align-items:center;gap:8px;font-size:11px;padding:3px 0;border-bottom:1px solid var(--border);">' +
          '<span>' + icon + '</span>' +
          '<span style="flex:1;color:var(--text);">' + esc(row.job_id || row.id) + '</span>' +
          (row.error_message ? '<span style="color:var(--warm);font-size:10px;">' + esc(row.error_message.slice(0,40)) + '</span>' : '') +
        '</div>';
      }).join('');
    }

    // Start polling if active
    if (hasActive && !_bulkProgressInterval) {
      _bulkProgressInterval = setInterval(window.loadBulkProgress, 5000);
    } else if (!hasActive && _bulkProgressInterval) {
      clearInterval(_bulkProgressInterval);
      _bulkProgressInterval = null;
      if (typeof capturePostHog === 'function') {
        capturePostHog('bulk_apply_completed', {
          jobs_submitted: submitted,
          jobs_failed: failed,
          jobs_skipped: 0,
        });
      }
    }
  } catch (e) {
    reportError('loadBulkProgress', e);
  }
};

// 10-second undo window after bulk apply starts
window._bulkStartUndoWindow = function () {
  var undoEl = document.getElementById('bulk-undo-bar');
  if (!undoEl) return;
  undoEl.style.display = 'flex';
  var countdown = BULK_UNDO_WINDOW_MS / 1000;
  var countEl = document.getElementById('bulk-undo-countdown');
  _bulkUndoTimer = setInterval(function () {
    countdown--;
    if (countEl) countEl.textContent = countdown;
    if (countdown <= 0) {
      clearInterval(_bulkUndoTimer);
      undoEl.style.display = 'none';
    }
  }, 1000);
};

window._bulkCancelRemaining = async function () {
  clearInterval(_bulkUndoTimer);
  var undoEl = document.getElementById('bulk-undo-bar');
  if (undoEl) undoEl.style.display = 'none';
  try {
    await sb.from('bulk_apply_jobs')
      .update({ status: 'cancelled' })
      .eq('user_id', currentUser.id)
      .eq('status', 'queued');
    if (typeof showToast === 'function') showToast('Remaining applications cancelled.', { type: 'info' });
    if (_bulkProgressInterval) { clearInterval(_bulkProgressInterval); _bulkProgressInterval = null; }
    window.loadBulkProgress();
  } catch (e) { reportError('_bulkCancelRemaining', e); }
};

window.loadBulkProgress = window.loadBulkProgress;
