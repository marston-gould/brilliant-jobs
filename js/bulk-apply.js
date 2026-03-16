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
