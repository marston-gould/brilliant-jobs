// ============================================================
// APPLICATIONS — Flow Management
// ============================================================
let appQueue = safeReadLS('bj_app_queue', []);
let appHistory = safeReadLS('bj_app_history', []);
let appMode = localStorage.getItem('bj_app_mode') || 'manual';

// ============================================================
// SETTINGS PANEL — Rules & Notifications
// ============================================================

window.toggleAppSettings = function() {
  var panel = document.getElementById('app-settings-panel');
  var btn = document.getElementById('app-settings-toggle');
  if (!panel) return;
  var isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (btn) btn.classList.toggle('active', !isOpen);
  if (!isOpen) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window.switchSettingsTab = function(tab) {
  document.querySelectorAll('.app-settings-tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.settings === tab);
  });
  var rulesEl = document.getElementById('settings-content-rules');
  var notifEl = document.getElementById('settings-content-notifications');
  if (rulesEl) rulesEl.style.display = tab === 'rules' ? 'block' : 'none';
  if (notifEl) notifEl.style.display = tab === 'notifications' ? 'block' : 'none';
};

// Mode selection
$$('.app-mode-select').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.app-mode-select').forEach(b => {
      b.classList.remove('active');
      b.className = b.className.replace(/btn-primary/g, 'btn-secondary');
      b.style.border = '';
      const sub = b.querySelector('div:last-child');
      if (sub) sub.style.color = 'var(--text-dim)';
    });
    btn.classList.add('active');
    btn.className = btn.className.replace(/btn-secondary/g, 'btn-primary');
    btn.style.border = '2px solid var(--accent)';
    const activeSub = btn.querySelector('div:last-child');
    if (activeSub) activeSub.style.color = 'rgba(255,255,255,0.85)';
    appMode = btn.dataset.mode;
    localStorage.setItem('bj_app_mode', appMode);
  });
});

// Set active mode on load
$$('.app-mode-select').forEach(btn => {
  const sub = btn.querySelector('div:last-child');
  if (btn.dataset.mode === appMode) {
    btn.classList.add('active');
    btn.className = btn.className.replace(/btn-secondary/g, 'btn-primary');
    btn.style.border = '2px solid var(--accent)';
    if (sub) sub.style.color = 'rgba(255,255,255,0.85)';
  } else {
    btn.classList.remove('active');
    btn.className = btn.className.replace(/btn-primary/g, 'btn-secondary');
    btn.style.border = '';
    if (sub) sub.style.color = 'var(--text-dim)';
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
  const _el = id => document.getElementById(id);
  if (_el('a-queued')) _el('a-queued').textContent = queued;
  if (_el('a-submitted')) _el('a-submitted').textContent = submitted;
  // FB-APPS-001: Update queue section visibility in Pipeline tab
  if (typeof updateQueueSectionVisibility === 'function') updateQueueSectionVisibility();

  // Hero lifecycle stats
  const allApps = (typeof appHistory !== 'undefined' && Array.isArray(appHistory)) ? [...appQueue, ...appHistory] : [...appQueue];
  const totalSent = allApps.filter(a => a.status === 'submitted').length;
  const responded = allApps.filter(a =>
    a.ghostStatus === 'responded' || a.pipelineStage === 'responded' ||
    a.pipelineStage === 'interview' || a.pipelineStage === 'offer'
  ).length;
  if (_el('a-response-rate')) {
    _el('a-response-rate').textContent = totalSent > 0
      ? Math.round((responded / totalSent) * 100) + '%'
      : '—';
  }
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = allApps.filter(a =>
    a.status === 'submitted' && new Date(a.submittedAt || a.addedAt).getTime() > weekAgo
  ).length;
  if (_el('a-this-week')) _el('a-this-week').textContent = thisWeek;

  // Cross-tab ghost intel
  const ghostStale = allApps.filter(a => {
    if (a.status !== 'submitted') return false;
    const days = (Date.now() - new Date(a.submittedAt || a.addedAt).getTime()) / 86400000;
    return days > 7;
  });
  const intelSlot = document.getElementById('app-intel-slot');
  const intelTitle = document.getElementById('app-intel-title');
  const intelSub = document.getElementById('app-intel-sub');
  if (intelSlot && intelTitle && ghostStale.length > 0 && thisWeek > 0) {
    intelTitle.textContent = 'You sent ' + thisWeek + ' application' + (thisWeek !== 1 ? 's' : '') + ' this week — ' + ghostStale.length + ' ' + (ghostStale.length === 1 ? 'is' : 'are') + ' past the 7-day mark with no response.';
    intelSub.textContent = 'Review stale applications and take action before they go cold.';
    intelSlot.style.display = '';
  }

  if (navBadge && appQueue.length > 0) {
    navBadge.style.display = '';
    navBadge.textContent = appQueue.length;
  }

  // Enable process button if items exist
  const processBtn = $('#a-process-queue');
  processBtn.disabled = appQueue.filter(a => a.status === 'queued').length === 0;

  if (appQueue.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--text-faint);padding:48px 12px;">
      <div style="margin-bottom:12px;color:var(--text-faint);"><i data-lucide="mail" class="icon-xl icon-stroke-lg" style="opacity:0.25;"></i></div>
      <div style="font-size:14px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">No applications queued</div>
      <div style="font-size:12px;max-width:360px;margin:0 auto;line-height:1.5;">
        Add jobs manually, or save jobs from Discovery to auto-queue them based on your rules.
      </div>
    </td></tr>`;
    if (typeof window.refreshIcons === 'function') window.refreshIcons();
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
  if (!tbody) return; // APR-001: history tab removed, element no longer in DOM

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
  saveUserData('bj_app_queue', JSON.stringify(appQueue));
  renderAppQueue();
});

// Process queue — EXT-AS-7: Route through headless worker
$('#a-process-queue').addEventListener('click', () => {
  // AF-002: Setup gate — block if setup not complete
  if (typeof isSetupComplete === 'function' && !isSetupComplete()) {
    if (typeof showSetupGateModal === 'function') showSetupGateModal();
    else if (typeof showToast === 'function') showToast('Complete your application profile before submitting.', { type: 'warning' });
    return;
  }
  // Use Supabase-backed processApplyQueueByMode from apply-workflow.js (AF-004)
  if (typeof processApplyQueueByMode === 'function') {
    processApplyQueueByMode();
    return;
  }
  // Fallback: legacy processApplyQueue (EXT-AS-7)
  if (typeof processApplyQueue === 'function') {
    processApplyQueue();
    return;
  }
  // Fallback: legacy localStorage queue
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

  saveUserData('bj_app_queue', JSON.stringify(appQueue));
  saveUserData('bj_app_history', JSON.stringify(appHistory));
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
  saveUserData('bj_app_queue', JSON.stringify(appQueue));
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
loadPipelineIntelligenceSettings();

// Gmail
// APR-001/FB-GHOST-BADGE-001: gmail-connect-btn was on Ghost Monitor page (removed)
const _gcBtn = $('#gmail-connect-btn');
if (_gcBtn) _gcBtn.addEventListener('click', () => {
  alert('Gmail integration coming soon.\n\nThis will use Gmail OAuth to auto-detect responses from companies you\'ve applied to.');
});

// ============================================================
// NOTIFICATION SYSTEM — Preferences, Phone, Escalation, Overrides, Log
// ============================================================

// ---- Notification type catalog (matches NOTIFICATION_SPEC.md) ----
const NOTIF_TYPES = [
  { id: 'auto_apply_confirm', label: 'Auto-apply confirmations', tier: 'realtime', defaultFreq: 'realtime', smsDefault: false },
  { id: 'apply_alert', label: 'Apply-on-notification alerts', tier: 'realtime', defaultFreq: 'realtime', smsDefault: true },
  { id: 'pipeline_response', label: 'Pipeline changes', tier: 'realtime', defaultFreq: 'realtime', smsDefault: false },
  { id: 'pipeline_interview', label: 'Interview / Offer alerts', tier: 'realtime', defaultFreq: 'realtime', smsDefault: true },
  { id: 'listing_closed', label: 'Listing closed', tier: 'realtime', defaultFreq: 'realtime', smsDefault: false },
  { id: 'pipeline_stale', label: 'Stale application reminders', tier: 'daily', defaultFreq: 'daily', smsDefault: false },
  { id: 'new_jobs_daily', label: 'New job matches', tier: 'daily', defaultFreq: 'daily', smsDefault: false },
  { id: 'company_hiring_surge', label: 'Company hiring surge', tier: 'daily', defaultFreq: 'daily', smsDefault: false },
  { id: 'ghost_alert', label: 'Ghost alerts', tier: 'daily', defaultFreq: 'daily', smsDefault: false },
  { id: 'salary_change', label: 'Salary range changes', tier: 'daily', defaultFreq: 'daily', smsDefault: false },
  { id: 'connections_at_company', label: 'Network match alerts', tier: 'network', defaultFreq: 'realtime', smsDefault: true },
  { id: 'weekly_summary', label: 'Weekly summary', tier: 'weekly', defaultFreq: 'weekly', smsDefault: false },
  { id: 'market_stats', label: 'Market stats digest', tier: 'weekly', defaultFreq: 'weekly', smsDefault: false },
  { id: 'ghost_report', label: 'Ghost report', tier: 'weekly', defaultFreq: 'weekly', smsDefault: false },
  // v2: Job intelligence
  { id: 'company_new_roles', label: 'Company posted more roles', tier: 'event', defaultFreq: 'daily', smsDefault: false },
  { id: 'resume_decay', label: 'Resume readiness drop', tier: 'event', defaultFreq: 'daily', smsDefault: false },
  { id: 'resume_improve', label: 'Resume readiness improved', tier: 'event', defaultFreq: 'daily', smsDefault: false },
  { id: 'exclusion_override', label: 'Excluded company match', tier: 'event', defaultFreq: 'daily', smsDefault: false },
  // v2: Credit / Billing
  { id: 'credit_low', label: 'Credit balance low', tier: 'credit', defaultFreq: 'realtime', smsDefault: false },
  { id: 'autorefill_success', label: 'Auto-refill confirmations', tier: 'credit', defaultFreq: 'realtime', smsDefault: false },
  { id: 'autorefill_failed', label: 'Auto-refill failed', tier: 'credit', defaultFreq: 'realtime', smsDefault: false },
  { id: 'credit_exhausted', label: 'Credits exhausted mid-month', tier: 'credit', defaultFreq: 'realtime', smsDefault: false },
  // v2: Pipeline signals
  { id: 'signal_calendar', label: 'Calendar interview detected', tier: 'realtime', defaultFreq: 'realtime', smsDefault: true },
  { id: 'signal_email', label: 'Email signal detected', tier: 'realtime', defaultFreq: 'realtime', smsDefault: false },
  { id: 'pipeline_prompt', label: 'Pipeline check-in prompts', tier: 'daily', defaultFreq: 'daily', smsDefault: false },
];

let notifPrefs = null;   // notification_preferences row
let notifChannels = {};  // notification_channels keyed by notification_type
let phoneVerified = false;

// ---- Load notification preferences from Supabase ----
async function loadNotifPrefs() {
  if (!currentUser) return;
  try {
    // Global prefs — upsert defaults if row doesn't exist yet
    var { error: upsErr } = await sb.from('notification_preferences').upsert({
      user_id: currentUser.id
    }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (upsErr) reportError('applications:notif-pref-upsert', upsErr);
    const { data: prefs, error: prefErr } = await sb.from('notification_preferences')
      .select('*').eq('user_id', currentUser.id).single();
    if (prefErr && prefErr.code !== 'PGRST116') reportError('applications:notif-pref-load', prefErr);
    notifPrefs = prefs;

    // Per-type channels
    const { data: channels, error: chanErr } = await sb.from('notification_channels')
      .select('*').eq('user_id', currentUser.id);
    if (chanErr) reportError('applications:notif-channels', chanErr);
    notifChannels = {};
    (channels || []).forEach(c => { notifChannels[c.notification_type] = c; });

    // Apply to UI
    phoneVerified = prefs?.phone_verified || false;
    applyPrefsToUI();
    applyPhoneUI();
    applyEscalationUI();
  } catch(e) { reportError('applications', e); console.warn('[Notif] Failed to load preferences:', e);
  }
}

function applyPrefsToUI() {
  // Update matrix toggles from loaded channel data
  $$('#notif-pref-matrix tr[data-notif]').forEach(row => {
    const type = row.dataset.notif;
    const ch = notifChannels[type];
    const emailToggle = row.querySelector('.nch-email');
    const smsToggle = row.querySelector('.nch-sms');
    const freqSelect = row.querySelector('.nch-freq');

    if (emailToggle && ch) emailToggle.checked = ch.email !== false;
    if (smsToggle) {
      const smsSwitch = smsToggle.closest('.toggle-switch');
      if (phoneVerified) {
        smsSwitch.classList.remove('disabled');
        smsSwitch.title = '';
        smsToggle.disabled = false;
        if (ch) smsToggle.checked = ch.sms === true;
      } else {
        smsSwitch.classList.add('disabled');
        smsSwitch.title = 'Verify phone to enable SMS';
        smsToggle.disabled = true;
        smsToggle.checked = false;
      }
    }
    if (freqSelect && ch?.frequency) freqSelect.value = ch.frequency;
  });
}

function applyPhoneUI() {
  if (phoneVerified && notifPrefs?.phone_number) {
    $('#phone-setup-unverified').style.display = 'none';
    $('#phone-setup-verified').style.display = '';
    $('#verified-phone-display').textContent = notifPrefs.phone_number;
  } else {
    $('#phone-setup-unverified').style.display = '';
    $('#phone-setup-verified').style.display = 'none';
  }
}

function applyEscalationUI() {
  if (!notifPrefs) return;
  const slider = $('#esc-timeout-slider');
  if (slider && notifPrefs.escalation_timeout_hours) {
    slider.value = notifPrefs.escalation_timeout_hours;
    $('#esc-timeout-val').textContent = notifPrefs.escalation_timeout_hours + ' hours';
    $('#esc-hours-label').textContent = notifPrefs.escalation_timeout_hours;
  }
  if (notifPrefs.quiet_start) $('#quiet-start').value = notifPrefs.quiet_start.slice(0, 5);
  if (notifPrefs.quiet_end) $('#quiet-end').value = notifPrefs.quiet_end.slice(0, 5);
  if (notifPrefs.timezone) $('#notif-timezone').value = notifPrefs.timezone;
}

// ---- Save notification preferences ----
$('#notif-save-prefs')?.addEventListener('click', async () => {
  if (!currentUser) return;
  const btn = $('#notif-save-prefs');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    // Upsert global prefs
    var { error: gpErr } = await sb.from('notification_preferences').upsert({
      user_id: currentUser.id,
      email_enabled: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    if (gpErr) { reportError('applications:save-global-prefs', gpErr); throw gpErr; }

    // Upsert per-type channels
    const rows = [];
    $$('#notif-pref-matrix tr[data-notif]').forEach(row => {
      const type = row.dataset.notif;
      const emailOn = row.querySelector('.nch-email')?.checked ?? true;
      const smsOn = row.querySelector('.nch-sms')?.checked ?? false;
      const freqEl = row.querySelector('.nch-freq');
      const freq = freqEl ? freqEl.value : NOTIF_TYPES.find(n => n.id === type)?.defaultFreq || 'realtime';
      rows.push({
        user_id: currentUser.id,
        notification_type: type,
        email: emailOn,
        sms: smsOn,
        frequency: freq
      });
    });
    if (rows.length > 0) {
      var { error: chErr } = await sb.from('notification_channels').upsert(rows, { onConflict: 'user_id,notification_type' });
      if (chErr) { reportError('applications:save-channels', chErr); throw chErr; }
    }

    btn.textContent = 'Saved';
    setTimeout(() => { btn.textContent = 'Save Preferences'; btn.disabled = false; }, 1500);
  } catch (e) {
    reportError('applications:save-prefs', e);
    btn.textContent = 'Error — retry';
    btn.disabled = false;
  }
});

// ---- Phone Verification ----
let pendingPhone = '';

$('#phone-send-otp')?.addEventListener('click', async () => {
  const country = $('#phone-country').value;
  const number = $('#phone-number').value.replace(/\D/g, '');
  if (!number || number.length < 7) {
    alert('Please enter a valid phone number.');
    return;
  }
  pendingPhone = country + number;
  const btn = $('#phone-send-otp');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const { error } = await sb.auth.signInWithOtp({ phone: pendingPhone });
    if (error) throw error;
    $('#otp-row').style.display = '';
    $('#otp-status').textContent = 'Code sent. Check your phone.';
    $('#otp-status').style.color = 'var(--green)';
    btn.textContent = 'Resend Code';
    btn.disabled = false;
  } catch (e) {
    reportError('applications', e);
    console.error('[Phone] OTP send failed:', e);
    $('#otp-status').textContent = 'Failed to send code: ' + (e.message || e);
    $('#otp-status').style.color = 'var(--red)';
    btn.textContent = 'Send Verification Code';
    btn.disabled = false;
  }
});

$('#phone-verify-otp')?.addEventListener('click', async () => {
  const code = $('#otp-code').value.trim();
  if (!code || code.length !== 6) {
    $('#otp-status').textContent = 'Enter the 6-digit code.';
    $('#otp-status').style.color = 'var(--warm)';
    return;
  }
  const btn = $('#phone-verify-otp');
  btn.disabled = true;
  btn.textContent = 'Verifying...';

  try {
    const { data, error } = await sb.auth.verifyOtp({
      phone: pendingPhone,
      token: code,
      type: 'sms'
    });
    if (error) throw error;

    // Update notification_preferences with verified phone
    await sb.from('notification_preferences').upsert({
      user_id: currentUser.id,
      phone_number: pendingPhone,
      phone_verified: true,
      sms_enabled: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    phoneVerified = true;
    if (notifPrefs) {
      notifPrefs.phone_number = pendingPhone;
      notifPrefs.phone_verified = true;
    }
    applyPhoneUI();
    applyPrefsToUI(); // unlock SMS toggles

    btn.textContent = 'Verify';
    btn.disabled = false;
  } catch (e) {
    reportError('applications', e);
    console.error('[Phone] Verify failed:', e);
    $('#otp-status').textContent = 'Invalid code. Try again.';
    $('#otp-status').style.color = 'var(--red)';
    btn.textContent = 'Verify';
    btn.disabled = false;
  }
});

$('#phone-change')?.addEventListener('click', () => {
  phoneVerified = false;
  applyPhoneUI();
  $('#phone-number').value = '';
  $('#otp-row').style.display = 'none';
  $('#otp-code').value = '';
  $('#otp-status').textContent = '';
});

// ---- Escalation Rules ----
$('#esc-timeout-slider')?.addEventListener('input', e => {
  const val = e.target.value;
  $('#esc-timeout-val').textContent = val + ' hour' + (val === '1' ? '' : 's');
  $('#esc-hours-label').textContent = val;
});

$('#notif-save-escalation')?.addEventListener('click', async () => {
  if (!currentUser) return;
  const btn = $('#notif-save-escalation');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    await sb.from('notification_preferences').upsert({
      user_id: currentUser.id,
      escalation_timeout_hours: parseInt($('#esc-timeout-slider').value),
      quiet_start: $('#quiet-start').value + ':00',
      quiet_end: $('#quiet-end').value + ':00',
      timezone: $('#notif-timezone').value,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    btn.textContent = 'Saved';
    setTimeout(() => { btn.textContent = 'Save Escalation Rules'; btn.disabled = false; }, 1500);
  } catch (e) {
    reportError('applications', e);
    console.error('[Notif] Escalation save failed:', e);
    btn.textContent = 'Error — retry';
    btn.disabled = false;
  }
});

// Populate timezone dropdown
(function populateTimezones() {
  const sel = $('#notif-timezone');
  if (!sel) return;
  const zones = [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Anchorage', 'Pacific/Honolulu', 'America/Phoenix',
    'America/Toronto', 'America/Vancouver',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin',
    'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata',
    'Australia/Sydney', 'Australia/Melbourne',
    'Pacific/Auckland'
  ];
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (detected && !zones.includes(detected)) zones.unshift(detected);

  sel.innerHTML = zones.map(tz =>
    `<option value="${tz}" ${tz === detected ? 'selected' : ''}>${tz.replace(/_/g, ' ')}</option>`
  ).join('');
})();

// ---- Filter-Specific Overrides ----
function populateOverrideFilterSelect() {
  const sel = $('#override-filter-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">Select a saved filter or prompt...</option>';
  // Saved filters
  savedFilters.forEach(f => {
    sel.innerHTML += `<option value="${escapeHtml(f.name)}">${escapeHtml(f.name)}</option>`;
  });
  // Session 5: Saved prompts with derived_filters
  if (typeof _savedPrompts !== 'undefined' && _savedPrompts && _savedPrompts.length > 0) {
    var hasPrompts = _savedPrompts.some(p => p.derived_filters && Object.keys(p.derived_filters).length > 0);
    if (hasPrompts) {
      sel.innerHTML += '<option disabled>── Chat Prompts ──</option>';
      _savedPrompts.forEach(p => {
        if (p.derived_filters && Object.keys(p.derived_filters).length > 0) {
          sel.innerHTML += `<option value="prompt:${escapeHtml(p.id)}" data-prompt-id="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`;
        }
      });
    }
  }
}
populateOverrideFilterSelect();


// Session 5: Refresh override dropdown when saved prompts update
function refreshOverrideFilterSelectWithPrompts() {
  populateOverrideFilterSelect();
}
$('#override-filter-select')?.addEventListener('change', async (e) => {
  const filterName = e.target.value;
  if (!filterName) {
    $('#override-matrix-wrap').style.display = 'none';
    $('#override-empty').style.display = '';
    return;
  }
  $('#override-empty').style.display = 'none';
  $('#override-matrix-wrap').style.display = '';
  $('#override-filter-name').textContent = filterName;

  // Load existing overrides for this filter
  let overrides = {};
  if (currentUser) {
    try {
      const { data, error } = await sb.from('notification_filter_overrides')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('filter_name', filterName);
      if (error) { reportError('applications:overrides', error); }
      (data || []).forEach(o => { overrides[o.notification_type] = o; });
    } catch(e) { reportError('applications:ignore', e); }
  }

  // Build override matrix rows
  const tbody = $('#override-matrix-body');
  tbody.innerHTML = NOTIF_TYPES.map(nt => {
    const ov = overrides[nt.id];
    const emailChecked = ov ? ov.email : true;
    const smsChecked = ov ? ov.sms : nt.smsDefault;
    const freq = ov?.frequency || nt.defaultFreq;
    const smsDisabled = !phoneVerified ? 'disabled' : '';
    const smsClass = !phoneVerified ? 'disabled' : '';
    const freqHtml = nt.tier === 'realtime' || nt.tier === 'weekly'
      ? `<span style="font-size:12px;color:var(--text-faint);">${nt.tier === 'realtime' ? 'Real-time' : 'Weekly'}</span>`
      : `<select class="freq-select ov-freq" data-type="${nt.id}">
          <option value="realtime" ${freq==='realtime'?'selected':''}>Real-time</option>
          <option value="daily" ${freq==='daily'?'selected':''}>Daily</option>
          <option value="weekly" ${freq==='weekly'?'selected':''}>Weekly</option>
        </select>`;

    return `<tr data-ov-type="${nt.id}">
      <td>${nt.label}</td>
      <td><label class="toggle-switch"><input type="checkbox" class="ov-email" ${emailChecked?'checked':''}><span class="toggle-slider"></span></label></td>
      <td><label class="toggle-switch ${smsClass}"><input type="checkbox" class="ov-sms" ${smsChecked?'checked':''} ${smsDisabled}><span class="toggle-slider"></span></label></td>
      <td>${freqHtml}</td>
    </tr>`;
  }).join('');
});

$('#override-save')?.addEventListener('click', async () => {
  const filterName = $('#override-filter-select').value;
  if (!filterName || !currentUser) return;
  const btn = $('#override-save');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const rows = [];
    $$('#override-matrix-body tr[data-ov-type]').forEach(row => {
      const type = row.dataset.ovType;
      rows.push({
        user_id: currentUser.id,
        filter_name: filterName,
        notification_type: type,
        email: row.querySelector('.ov-email')?.checked ?? true,
        sms: row.querySelector('.ov-sms')?.checked ?? false,
        frequency: row.querySelector('.ov-freq')?.value || null
      });
    });
    await sb.from('notification_filter_overrides').upsert(rows, {
      onConflict: 'user_id,filter_name,notification_type'
    });
    btn.textContent = 'Saved';
    setTimeout(() => { btn.textContent = 'Save Overrides'; btn.disabled = false; }, 1500);
  } catch (e) {
    reportError('applications', e);
    console.error('[Notif] Override save failed:', e);
    btn.textContent = 'Error — retry';
    btn.disabled = false;
  }
});

$('#override-clear')?.addEventListener('click', async () => {
  const filterName = $('#override-filter-select').value;
  if (!filterName || !currentUser) return;
  if (!confirm(`Clear all notification overrides for "${filterName}"?`)) return;

  try {
    await sb.from('notification_filter_overrides')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('filter_name', filterName);
    // Re-trigger the dropdown to reload fresh
    $('#override-filter-select').dispatchEvent(new Event('change'));
  } catch(e) { reportError('applications', e); console.error('[Notif] Override clear failed:', e); }
});

// APR-001: Notification Log removed — lives exclusively on Notification Center page
// (rendered by notification-center.js with nc- prefixed IDs)

// ---- Pulsing Nav Dots ----
async function checkNavPulses() {
  if (!currentUser) return;
  try {
    // Get last_seen_at
    const { data: profile, error: profErr } = await sb.from('profiles')
      .select('last_seen_at')
      .eq('id', currentUser.id).single();
    if (profErr && profErr.code !== 'PGRST116') reportError('applications:nav-pulse', profErr);
    const lastSeen = profile?.last_seen_at || new Date(0).toISOString();

    // Applications: pending notification actions
    const { count: pendingActions } = await sb
      .from('notification_actions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', currentUser.id)
      .eq('status', 'pending');

    const appDot = document.querySelector('[data-page="applications"] .ext-status-dot');
    if (pendingActions > 0 && appDot) {
      appDot.classList.add('pulse');
    }

    // Jobs: new since last feed view (not last page load — cron adds jobs constantly)
    const lastFeedView = localStorage.getItem('bj_last_feed_view') || new Date(0).toISOString();
    const { count: newJobs } = await sb
      .from('ats_jobs')
      .select('*', { count: 'exact', head: true })
      .gt('first_seen_at', lastFeedView)
      .eq('status', 'open');

    if (newJobs > 25) {
      const jobsDot = document.querySelector('[data-page="jobs"] .ext-status-dot');
      if (jobsDot) jobsDot.classList.add('pulse');
    }

    // Update last_seen_at
    await sb.from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', currentUser.id);
  } catch(e) { reportError('applications', e); console.warn('[Pulse] Check failed:', e);
  }
}

// Clear pulse when navigating to a page
const _origNavClick = true;
$$('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const dot = item.querySelector('.ext-status-dot');
    if (dot) dot.classList.remove('pulse');
  });
});

// ---- Init notification system ----
async function initNotifications() {
  await loadNotifPrefs();
  await loadNotifLog();
  await checkNavPulses();
}
if (currentUser) {
  initNotifications();
} else {
  // Retry once auth completes (app.js init is async)
  const _waitAuth = setInterval(() => {
    if (currentUser) {
      clearInterval(_waitAuth);
      initNotifications();
    }
  }, 500);
  setTimeout(() => clearInterval(_waitAuth), 10000); // give up after 10s
}


// ── Pipeline Intelligence Settings (Phase D) ─────────────────
async function loadPipelineIntelligenceSettings() {
  if (!currentUser?.id) return;
  try {
    const { data, error } = await sb.from('pipeline_tracking_settings')
      .select('*').eq('user_id', currentUser.id).maybeSingle();
    if (error) { /* silent — table may not exist or user has no row yet */ return; }
    if (!data) return;
    const el = (id) => document.getElementById(id);
    if (el('pi-smart-prompts')) el('pi-smart-prompts').checked = data.smart_prompts_enabled !== false;
    if (el('pi-signal-detection')) el('pi-signal-detection').checked = data.signal_detection_enabled === true;
    if (el('pi-cadence-saved')) el('pi-cadence-saved').value = data.cadence_saved_days || 3;
    if (el('pi-cadence-applied')) el('pi-cadence-applied').value = data.cadence_applied_days || 7;
    if (el('pi-cadence-responded')) el('pi-cadence-responded').value = data.cadence_responded_days || 5;
    if (el('pi-cadence-interview')) el('pi-cadence-interview').value = data.cadence_interview_days || 3;
    if (el('pi-scan-freq')) el('pi-scan-freq').value = String(data.scan_frequency_minutes || 15);
    if (el('pi-thread-depth')) el('pi-thread-depth').value = data.email_thread_depth || 50;
    if (el('pi-cal-lookahead')) el('pi-cal-lookahead').value = data.calendar_lookahead_days || 14;
    const channels = data.prompt_channels || ['email', 'in_app'];
    if (el('pi-ch-email')) el('pi-ch-email').checked = channels.includes('email');
    if (el('pi-ch-inapp')) el('pi-ch-inapp').checked = channels.includes('in_app');
    if (el('pi-ch-sms')) el('pi-ch-sms').checked = channels.includes('sms');
    const confRadios = document.querySelectorAll('input[name="pi-confidence"]');
    confRadios.forEach(r => { r.checked = parseFloat(r.value) === (data.confidence_threshold || 0.6); });
  } catch(e) { reportError('applications', e); console.log('[BJ] No pipeline intelligence settings yet');
  }
  // Show Gmail status
  try {
    const { data: conn, error: connErr } = await sb.from('gmail_connections')
      .select('sync_status').eq('user_id', currentUser.id).single();
    if (connErr && connErr.code !== 'PGRST116') reportError('applications:gmail-status', connErr);
    const statusEl = document.getElementById('pi-gmail-status');
    if (statusEl) statusEl.style.display = '';
    if (conn?.sync_status === 'active') {
      const connEl = document.getElementById('pi-gmail-connected');
      const btnEl = document.getElementById('pi-gmail-connect');
      if (connEl) connEl.style.display = '';
      if (btnEl) btnEl.style.display = 'none';
      // v6.04: Mark integration connected for adoption suppression
      if (typeof markIntegrationConnected === 'function') markIntegrationConnected('gmail');
    }
  } catch(e) { reportError('applications:no connection', e); }
}

async function savePipelineIntelligenceSettings() {
  if (!currentUser?.id) return;
  const el = (id) => document.getElementById(id);
  const confRadio = document.querySelector('input[name="pi-confidence"]:checked');
  const settings = {
    user_id: currentUser.id,
    smart_prompts_enabled: el('pi-smart-prompts')?.checked ?? true,
    signal_detection_enabled: el('pi-signal-detection')?.checked ?? false,
    cadence_saved_days: parseInt(el('pi-cadence-saved')?.value) || 3,
    cadence_applied_days: parseInt(el('pi-cadence-applied')?.value) || 7,
    cadence_responded_days: parseInt(el('pi-cadence-responded')?.value) || 5,
    cadence_interview_days: parseInt(el('pi-cadence-interview')?.value) || 3,
    scan_frequency_minutes: parseInt(el('pi-scan-freq')?.value) || 15,
    confidence_threshold: confRadio ? parseFloat(confRadio.value) : 0.6,
    email_thread_depth: parseInt(el('pi-thread-depth')?.value) || 50,
    calendar_lookahead_days: parseInt(el('pi-cal-lookahead')?.value) || 14,
    prompt_channels: [
      ...(el('pi-ch-email')?.checked ? ['email'] : []),
      ...(el('pi-ch-inapp')?.checked ? ['in_app'] : []),
      ...(el('pi-ch-sms')?.checked ? ['sms'] : []),
    ],
    updated_at: new Date().toISOString(),
  };
  try {
    await sb.from('pipeline_tracking_settings').upsert(settings, { onConflict: 'user_id' });
    const btn = el('pi-save-btn');
    if (btn) { btn.textContent = 'Saved!'; setTimeout(() => btn.textContent = 'Save Pipeline Settings', 1500); }
  } catch(e) { reportError('applications', e); console.error('[BJ] Pipeline settings save error:', e);
  }
}

// Load settings when applications page is shown
if (typeof _origInitApplications === 'undefined') {
  var _origInitApplications = typeof initApplications === 'function' ? initApplications : null;
}

// CS-P1-004 FE-005: Register applications exports with BJ namespace
(function() {
  ['removeFromQueue','switchSettingsTab','toggleAppSettings'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'applications', registered: Date.now() };
    }
  });
})();
