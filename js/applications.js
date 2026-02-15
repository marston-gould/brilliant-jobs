// ============================================================
// APPLICATIONS — Flow Management
// ============================================================
let appQueue = JSON.parse(localStorage.getItem('bj_app_queue') || '[]');
let appHistory = JSON.parse(localStorage.getItem('bj_app_history') || '[]');
let appMode = localStorage.getItem('bj_app_mode') || 'manual';

// Tab switching
$$('.app-flow-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.app-flow-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    $$('.app-flow-panel').forEach(p => p.classList.remove('active'));
    $(`#panel-${tab.dataset.panel}`).classList.add('active');
  });
});

// Mode selection
$$('.app-mode-select').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.app-mode-select').forEach(b => {
      b.classList.remove('active');
      b.className = b.className.replace(/btn-primary/g, 'btn-secondary');
      b.style.border = '';
    });
    btn.classList.add('active');
    btn.className = btn.className.replace(/btn-secondary/g, 'btn-primary');
    btn.style.border = '2px solid var(--accent)';
    appMode = btn.dataset.mode;
    localStorage.setItem('bj_app_mode', appMode);
  });
});

// Set active mode on load
$$('.app-mode-select').forEach(btn => {
  if (btn.dataset.mode === appMode) {
    btn.classList.add('active');
    btn.className = btn.className.replace(/btn-secondary/g, 'btn-primary');
    btn.style.border = '2px solid var(--accent)';
  } else {
    btn.classList.remove('active');
    btn.className = btn.className.replace(/btn-primary/g, 'btn-secondary');
    btn.style.border = '';
  }
});

function modeBadge(mode) {
  const map = { manual: 'mode-manual', auto: 'mode-auto', notify: 'mode-notify' };
  const labels = { manual: 'Manual', auto: 'Auto', notify: 'Notify' };
  return `<span class="app-mode-badge ${map[mode] || 'mode-manual'}">${labels[mode] || mode}</span>`;
}

function statusBadge(status) {
  const map = { queued: 'status-queued', pending: 'status-pending', sent: 'status-sent', submitted: 'status-submitted', failed: 'status-failed' };
  const labels = { queued: 'Queued', pending: 'Pending Approval', sent: 'Notification Sent', submitted: 'Submitted', failed: 'Failed' };
  return `<span class="app-status-badge ${map[status] || 'status-queued'}">${labels[status] || status}</span>`;
}

function renderAppQueue() {
  const tbody = $('#app-queue-body');
  const navBadge = $('#nav-app-count');

  // Update stat cards
  const queued = appQueue.filter(a => a.status === 'queued').length;
  const pending = appQueue.filter(a => a.status === 'pending' || a.status === 'sent').length;
  const submitted = [...appQueue, ...appHistory].filter(a => a.status === 'submitted').length;
  const failed = [...appQueue, ...appHistory].filter(a => a.status === 'failed').length;
  $('#a-queued').textContent = queued;
  $('#a-pending').textContent = pending;
  $('#a-submitted').textContent = submitted;
  $('#a-failed').textContent = failed;

  if (navBadge && appQueue.length > 0) {
    navBadge.style.display = '';
    navBadge.textContent = appQueue.length;
  }

  // Enable process button if items exist
  const processBtn = $('#a-process-queue');
  processBtn.disabled = appQueue.filter(a => a.status === 'queued').length === 0;

  if (appQueue.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--text-faint);padding:48px 12px;">
      <div style="margin-bottom:12px;color:var(--text-faint);"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.25;"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></div>
      <div style="font-size:14px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">No applications queued</div>
      <div style="font-size:12px;max-width:360px;margin:0 auto;line-height:1.5;">
        Add jobs manually, or save jobs from Discovery to auto-queue them based on your rules.
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = appQueue.map((app, i) => `
    <tr>
      <td><input type="checkbox" class="a-row-check" data-idx="${i}"></td>
      <td style="font-weight:600;color:var(--text);">${app.jobTitle}</td>
      <td>${app.company}</td>
      <td style="font-size:12px;">${app.resumeName || '—'}</td>
      <td>${modeBadge(app.mode)}</td>
      <td>${statusBadge(app.status)}</td>
      <td style="font-size:12px;color:var(--text-faint);">${app.addedAt}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="removeFromQueue(${i})" style="padding:4px 8px;font-size:11px;color:var(--red);">✕</button>
      </td>
    </tr>
  `).join('');
}

function renderAppHistory() {
  const tbody = $('#app-history-body');
  if (appHistory.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-faint);padding:48px 12px;">
      <div style="font-size:14px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">No application history yet</div>
      <div style="font-size:12px;">Completed applications will appear here with full audit trail.</div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = appHistory.map(app => `
    <tr>
      <td style="font-weight:600;color:var(--text);">${app.jobTitle}</td>
      <td>${app.company}</td>
      <td style="font-size:12px;">${app.resumeName || '—'}</td>
      <td>${modeBadge(app.mode)}</td>
      <td>${statusBadge(app.status)}</td>
      <td style="font-size:12px;color:var(--text-faint);">${app.submittedAt || '—'}</td>
      <td style="font-size:12px;">${app.source || '—'}</td>
    </tr>
  `).join('');
}

// Manual add to queue
$('#a-add-manual').addEventListener('click', () => {
  const title = prompt('Job title:');
  if (!title) return;
  const company = prompt('Company:');
  if (!company) return;
  const url = prompt('Application URL (optional):') || '';

  const firstResume = resumes.find(r => !r.archived && !r.needsUpload);
  appQueue.push({
    id: 'app_' + Date.now(),
    jobTitle: title,
    company: company,
    url: url,
    resumeName: firstResume ? firstResume.name : '',
    resumeId: firstResume ? firstResume.id : '',
    mode: appMode,
    status: appMode === 'auto' ? 'queued' : (appMode === 'notify' ? 'pending' : 'queued'),
    addedAt: new Date().toLocaleDateString(),
    source: 'manual'
  });
  localStorage.setItem('bj_app_queue', JSON.stringify(appQueue));
  renderAppQueue();
});

// Process queue — simulate sending notifications or submitting
$('#a-process-queue').addEventListener('click', () => {
  let processed = 0;
  appQueue.forEach(app => {
    if (app.status !== 'queued') return;
    if (app.mode === 'auto') {
      app.status = 'submitted';
      app.submittedAt = new Date().toLocaleDateString();
      processed++;
    } else if (app.mode === 'notify') {
      app.status = 'sent';
      processed++;
    } else {
      // Manual — mark as pending user action
      app.status = 'pending';
      processed++;
    }
  });

  // Move submitted ones to history
  const submitted = appQueue.filter(a => a.status === 'submitted');
  appHistory.push(...submitted);
  appQueue = appQueue.filter(a => a.status !== 'submitted');

  localStorage.setItem('bj_app_queue', JSON.stringify(appQueue));
  localStorage.setItem('bj_app_history', JSON.stringify(appHistory));
  renderAppQueue();
  renderAppHistory();

  if (processed > 0) {
    alert(`Processed ${processed} application(s).\n\n` +
      (submitted.length > 0 ? `${submitted.length} auto-submitted.\n` : '') +
      (appQueue.filter(a => a.status === 'sent').length > 0 ? `Notifications sent — awaiting your approval.\n` : '') +
      (appQueue.filter(a => a.status === 'pending').length > 0 ? `Manual applications ready for you to review.` : '')
    );
  }
});

// Remove from queue
window.removeFromQueue = function(idx) {
  appQueue.splice(idx, 1);
  localStorage.setItem('bj_app_queue', JSON.stringify(appQueue));
  renderAppQueue();
};

// Select all checkbox
$('#a-select-all')?.addEventListener('change', e => {
  $$('.a-row-check').forEach(cb => cb.checked = e.target.checked);
});

// Set notification email from user
if (currentUser?.email) {
  const emailInput = $('#notify-email-addr');
  if (emailInput && !emailInput.value) emailInput.value = currentUser.email;
}

renderAppQueue();
renderAppHistory();

// Gmail
$('#gmail-connect-btn').addEventListener('click', () => {
  alert('Gmail integration coming soon.\n\nThis will use Gmail OAuth to auto-detect responses from companies you\'ve applied to.');
});

