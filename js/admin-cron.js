/* ───────────────────────────────────────────────────────────
   admin-cron.js — Cron Management Console (0.161 + 0.162)
   CS-P1-016: Full management UI — toggle, schedule edit,
   force-run, run history, alert config per job
   ─────────────────────────────────────────────────────────── */

var _cronRefreshTimer = null;
var _cronAlertConfigs = {};

// ─── EF helper ───
async function _cronMgmtCall(action, params, method) {
  var sb = loadSupabase();
  var session = (await sb.auth.getSession()).data.session;
  if (!session) { if (typeof toastWarning === 'function') toastWarning('Not authenticated'); return null; }

  var base = (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'https://qojhagupdnbtomfoxnsf.supabase.co');
  var url = base + '/functions/v1/admin-cron-management?action=' + action;
  var opts = {
    method: method || 'POST',
    headers: {
      'Authorization': 'Bearer ' + session.access_token,
      'apikey': typeof SUPABASE_KEY !== 'undefined' ? SUPABASE_KEY : '',
      'Content-Type': 'application/json'
    }
  };
  if (params && method !== 'GET') opts.body = JSON.stringify(params);
  if (method === 'GET' && params) {
    url += '&' + Object.keys(params).map(function(k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  }
  try {
    var res = await fetch(url, opts);
    return await res.json();
  } catch (e) {
    console.error('[Cron Mgmt]', action, e);
    if (typeof reportError === 'function') reportError('admin-cron:' + action, e);
    return null;
  }
}

async function loadCronPanel() {
  var el = document.getElementById('admin-page-cron');
  if (!el) return;

  el.innerHTML = [
    '<div class="admin-block">',
    '  <div class="admin-block-header">',
    '    <h2 class="admin-block-title">Cron Management</h2>',
    '    <div class="admin-block-actions">',
    '      <span id="cron-summary" style="font-size:13px;color:var(--muted);margin-right:12px;"></span>',
    '      <span id="cron-last-refresh" style="font-size:12px;color:var(--muted);margin-right:8px;"></span>',
    '      <button class="admin-btn admin-btn-sm" id="cron-refresh-btn">↻ Refresh</button>',
    '      <button class="admin-btn admin-btn-sm" id="cron-alert-config-btn" style="margin-left:4px;">⚡ Alert Config</button>',
    '    </div>',
    '  </div>',
    '  <div id="cron-filters" style="padding:8px 0;display:flex;gap:8px;flex-wrap:wrap;">',
    '    <button class="admin-btn admin-btn-sm admin-btn-active" data-cron-filter="all">All</button>',
    '    <button class="admin-btn admin-btn-sm" data-cron-filter="red">🔴 Failed</button>',
    '    <button class="admin-btn admin-btn-sm" data-cron-filter="amber">🟡 Stale</button>',
    '    <button class="admin-btn admin-btn-sm" data-cron-filter="green">🟢 Healthy</button>',
    '    <button class="admin-btn admin-btn-sm" data-cron-filter="disabled">⚫ Disabled</button>',
    '  </div>',
    '  <div id="cron-table-container" style="overflow-x:auto;"><div class="admin-loading">Loading cron data…</div></div>',
    '</div>',
    '<div id="cron-history-drawer" style="display:none;position:fixed;top:0;right:0;bottom:0;width:520px;max-width:90vw;background:var(--bg-card);border-left:1px solid var(--border);z-index:9998;box-shadow:-4px 0 24px rgba(0,0,0,0.15);overflow-y:auto;">',
    '  <div style="padding:20px;">',
    '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">',
    '      <h3 id="cron-history-title" style="margin:0;font-size:16px;">Run History</h3>',
    '      <button class="admin-btn admin-btn-sm" id="cron-history-close">✕ Close</button>',
    '    </div>',
    '    <div id="cron-history-body"><div class="admin-loading">Loading…</div></div>',
    '  </div>',
    '</div>',
    '<div id="cron-history-overlay" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);z-index:9997;"></div>',
    '<div id="cron-schedule-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:9999;align-items:center;justify-content:center;">',
    '  <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:24px;width:440px;max-width:90vw;">',
    '    <h3 id="cron-sched-modal-title" style="margin:0 0 16px;font-size:16px;">Edit Schedule</h3>',
    '    <div style="margin-bottom:12px;">',
    '      <label style="font-size:12px;font-weight:600;color:var(--text-dim);display:block;margin-bottom:4px;">Cron Expression</label>',
    '      <input type="text" id="cron-sched-input" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text);font-family:monospace;" placeholder="*/5 * * * *">',
    '      <div id="cron-sched-preview" style="font-size:11px;color:var(--muted);margin-top:4px;"></div>',
    '    </div>',
    '    <div style="display:flex;gap:8px;justify-content:flex-end;">',
    '      <button class="admin-btn admin-btn-sm" id="cron-sched-cancel">Cancel</button>',
    '      <button class="admin-btn admin-btn-sm" id="cron-sched-save" style="background:var(--accent);color:#fff;border-color:var(--accent);">Save Schedule</button>',
    '    </div>',
    '  </div>',
    '</div>',
    '<div id="cron-alert-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:9999;align-items:center;justify-content:center;">',
    '  <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:24px;width:600px;max-width:90vw;max-height:80vh;overflow-y:auto;">',
    '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">',
    '      <h3 style="margin:0;font-size:16px;">Cron Alert Configuration</h3>',
    '      <button class="admin-btn admin-btn-sm" id="cron-alert-close">✕</button>',
    '    </div>',
    '    <p style="font-size:13px;color:var(--muted);margin-bottom:16px;">Set failure thresholds and stale timeouts per cron job. Alerts fire when thresholds are exceeded.</p>',
    '    <div id="cron-alert-config-body"><div class="admin-loading">Loading…</div></div>',
    '  </div>',
    '</div>'
  ].join('\n');

  document.getElementById('cron-refresh-btn').addEventListener('click', _refreshCronPanel);
  document.getElementById('cron-alert-config-btn').addEventListener('click', function() {
    document.getElementById('cron-alert-modal').style.display = 'flex';
    _renderAlertConfigForm();
  });
  document.getElementById('cron-alert-close').addEventListener('click', function() {
    document.getElementById('cron-alert-modal').style.display = 'none';
  });
  document.getElementById('cron-history-close').addEventListener('click', _hideHistoryDrawer);
  document.getElementById('cron-history-overlay').addEventListener('click', _hideHistoryDrawer);
  document.getElementById('cron-sched-cancel').addEventListener('click', function() {
    document.getElementById('cron-schedule-modal').style.display = 'none';
  });
  document.getElementById('cron-sched-input').addEventListener('input', function() {
    var p = document.getElementById('cron-sched-preview');
    if (p) p.textContent = _describeCron(this.value);
  });

  document.querySelectorAll('[data-cron-filter]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('[data-cron-filter]').forEach(function(b) { b.classList.remove('admin-btn-active'); });
      btn.classList.add('admin-btn-active');
      _applyCronFilter(btn.getAttribute('data-cron-filter'));
    });
  });

  await _loadAlertConfigs();
  await _refreshCronPanel();
  if (_cronRefreshTimer) clearInterval(_cronRefreshTimer);
  _cronRefreshTimer = setInterval(_refreshCronPanel, 60000);
}

async function _loadAlertConfigs() {
  var result = await _cronMgmtCall('alert-config', null, 'GET');
  if (result && result.configs) {
    _cronAlertConfigs = {};
    result.configs.forEach(function(c) { _cronAlertConfigs[c.job_name] = c; });
  }
}

async function _refreshCronPanel() {
  var container = document.getElementById('cron-table-container');
  if (!container) return;
  try {
    var r = await sb.from('v_cron_health').select('*');
    if (r.error) { container.innerHTML = '<div class="admin-empty">Error: ' + r.error.message + '</div>'; return; }
    if (!r.data || r.data.length === 0) { container.innerHTML = '<div class="admin-empty">No cron jobs found.</div>'; return; }

    var counts = { green: 0, amber: 0, red: 0, disabled: 0, unknown: 0 };
    r.data.forEach(function(j) { counts[j.health] = (counts[j.health] || 0) + 1; });
    var s = document.getElementById('cron-summary');
    if (s) s.innerHTML = '<span style="color:#22c55e;">' + counts.green + ' healthy</span> · <span style="color:#f59e0b;">' + counts.amber + ' stale</span> · <span style="color:#ef4444;">' + counts.red + ' failed</span> · <span style="color:#6b7280;">' + counts.disabled + ' disabled</span> · <strong>' + r.data.length + ' total</strong>';
    var ts = document.getElementById('cron-last-refresh');
    if (ts) ts.textContent = 'Updated ' + new Date().toLocaleTimeString();
    window._cronData = r.data;
    _renderCronTable(r.data);
    var af = document.querySelector('[data-cron-filter].admin-btn-active');
    if (af) { var fv = af.getAttribute('data-cron-filter'); if (fv !== 'all') _applyCronFilter(fv); }
  } catch(e) {
    console.error('[Admin] Cron panel error:', e);
    if (typeof reportError === 'function') reportError('admin-cron:refresh', e);
    container.innerHTML = '<div class="admin-empty">Error: ' + e.message + '</div>';
  }
}

function _renderCronTable(data) {
  var container = document.getElementById('cron-table-container');
  if (!container) return;
  var hd = { green: '🟢', amber: '🟡', red: '🔴', disabled: '⚫', unknown: '⚪' };

  var rows = data.map(function(j) {
    var dot = hd[j.health] || '⚪';
    var ago = j.last_start ? _timeAgo(new Date(j.last_start)) : '—';
    var dur = j.last_duration_s != null ? (parseFloat(j.last_duration_s) < 60 ? parseFloat(j.last_duration_s).toFixed(1) + 's' : (parseFloat(j.last_duration_s) / 60).toFixed(1) + 'm') : '—';
    var msg = j.last_message ? _escHtml(j.last_message.substring(0, 120)) : '';
    var sd = _describeCron(j.schedule);
    var jid = j.jobid || j.job_id || 0;
    var act = j.active !== false;
    var ac = _cronAlertConfigs[j.jobname];
    var ab = ac && ac.alert_enabled ? '<span title="Alerts: ' + ac.max_consecutive_failures + ' fail / ' + ac.stale_threshold_minutes + 'm stale" style="font-size:10px;cursor:help;">⚡</span>' : '';
    var ti = act ? 'Disable' : 'Enable';
    var ic = act ? '⏸' : '▶';
    var jn = _escHtml(j.jobname || '');
    var actions = '<div style="display:flex;gap:4px;white-space:nowrap;">' +
      '<button class="admin-btn admin-btn-sm" data-cron-action="toggle" data-jid="' + jid + '" data-active="' + !act + '" title="' + ti + '" style="font-size:12px;min-width:28px;">' + ic + '</button>' +
      '<button class="admin-btn admin-btn-sm" data-cron-action="force" data-jid="' + jid + '" data-jname="' + jn + '" title="Force run" style="font-size:12px;min-width:28px;">🔄</button>' +
      '<button class="admin-btn admin-btn-sm" data-cron-action="edit" data-jid="' + jid + '" data-sched="' + _escHtml(j.schedule) + '" data-jname="' + jn + '" title="Edit schedule" style="font-size:12px;min-width:28px;">✏️</button>' +
      '<button class="admin-btn admin-btn-sm" data-cron-action="history" data-jid="' + jid + '" data-jname="' + jn + '" title="Run history" style="font-size:12px;min-width:28px;"><i data-lucide="clipboard-list" class="icon-xs icon-stroke"></i></button>' +
      '</div>';
    return '<tr data-cron-health="' + j.health + '">' +
      '<td style="white-space:nowrap;">' + dot + ' ' + ab + '</td>' +
      '<td style="font-weight:500;">' + _escHtml(j.jobname || '(unnamed)') + '</td>' +
      '<td><code style="font-size:11px;">' + _escHtml(j.schedule) + '</code><br><span style="font-size:11px;color:var(--muted);">' + sd + '</span></td>' +
      '<td>' + (act ? '<span style="color:#22c55e;">Active</span>' : '<span style="color:var(--muted);">Disabled</span>') + '</td>' +
      '<td>' + (j.last_status || '—') + '</td>' +
      '<td style="white-space:nowrap;">' + ago + '</td><td>' + dur + '</td>' +
      '<td style="font-size:11px;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + msg + '">' + msg + '</td>' +
      '<td>' + actions + '</td></tr>';
  }).join('');

  container.innerHTML = '<table class="admin-table" id="cron-table" style="width:100%;"><thead><tr>' +
    '<th style="width:30px;"></th><th>Job Name</th><th>Schedule</th><th>Status</th><th>Last Result</th><th>Last Run</th><th>Duration</th><th>Message</th><th style="min-width:140px;">Actions</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>';

  // Bind action buttons via delegation
  container.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-cron-action]');
    if (!btn) return;
    var a = btn.getAttribute('data-cron-action');
    var jid = parseInt(btn.getAttribute('data-jid'));
    var jname = btn.getAttribute('data-jname') || '';
    if (a === 'toggle') _cronToggle(jid, btn.getAttribute('data-active') === 'true');
    else if (a === 'force') _cronForceRun(jid, jname);
    else if (a === 'edit') _cronEditSchedule(jid, btn.getAttribute('data-sched'), jname);
    else if (a === 'history') _cronShowHistory(jid, jname);
  });
}

// ─── Management Actions ───
async function _cronToggle(jobId, newActive) {
  if (!confirm(newActive ? 'Enable this cron job?' : 'Disable this cron job?')) return;
  var r = await _cronMgmtCall('toggle', { job_id: jobId, active: newActive });
  if (r && r.success) {
    if (typeof toastSuccess === 'function') toastSuccess('Cron job ' + (newActive ? 'enabled' : 'disabled'));
    if (typeof _logAdminAction === 'function') _logAdminAction(newActive ? 'cron_enabled' : 'cron_disabled', 'cron_job', jobId);
    await _refreshCronPanel();
  } else {
    if (typeof toastWarning === 'function') toastWarning('Failed: ' + (r && r.error || 'Unknown'));
  }
}

async function _cronForceRun(jobId, jobName) {
  if (!confirm('Force-run "' + jobName + '" now?')) return;
  var r = await _cronMgmtCall('force-run', { job_id: jobId });
  if (r && r.success) {
    if (typeof toastSuccess === 'function') toastSuccess('"' + jobName + '" triggered');
    if (typeof _logAdminAction === 'function') _logAdminAction('cron_force_run', 'cron_job', jobId);
    setTimeout(_refreshCronPanel, 3000);
  } else {
    if (typeof toastWarning === 'function') toastWarning('Force-run failed: ' + (r && r.error || 'Unknown'));
  }
}

var _cronSchedEditJobId = null;
function _cronEditSchedule(jobId, currentSched, jobName) {
  _cronSchedEditJobId = jobId;
  var modal = document.getElementById('cron-schedule-modal');
  document.getElementById('cron-sched-modal-title').textContent = 'Edit Schedule: ' + jobName;
  document.getElementById('cron-sched-input').value = currentSched;
  document.getElementById('cron-sched-preview').textContent = _describeCron(currentSched);
  modal.style.display = 'flex';

  var saveBtn = document.getElementById('cron-sched-save');
  var newBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newBtn, saveBtn);
  newBtn.addEventListener('click', async function() {
    var sched = document.getElementById('cron-sched-input').value.trim();
    if (!sched) return;
    newBtn.disabled = true; newBtn.textContent = 'Saving…';
    var r = await _cronMgmtCall('update-schedule', { job_id: _cronSchedEditJobId, schedule: sched });
    if (r && r.success) {
      if (typeof toastSuccess === 'function') toastSuccess('Schedule updated');
      document.getElementById('cron-schedule-modal').style.display = 'none';
      await _refreshCronPanel();
    } else {
      if (typeof toastWarning === 'function') toastWarning('Failed: ' + (r && r.error || 'Unknown'));
      newBtn.disabled = false; newBtn.textContent = 'Save Schedule';
    }
  });
}

async function _cronShowHistory(jobId, jobName) {
  document.getElementById('cron-history-title').textContent = 'Run History: ' + jobName;
  document.getElementById('cron-history-body').innerHTML = '<div class="admin-loading">Loading…</div>';
  document.getElementById('cron-history-drawer').style.display = 'block';
  document.getElementById('cron-history-overlay').style.display = 'block';

  var r = await _cronMgmtCall('run-history', { job_id: jobId, limit: 30 }, 'GET');
  var body = document.getElementById('cron-history-body');
  if (!r || !r.runs || r.runs.length === 0) { body.innerHTML = '<div class="admin-empty">No run history found.</div>'; return; }

  var html = '<table class="admin-table" style="width:100%;font-size:12px;"><thead><tr><th>Started</th><th>Status</th><th>Duration</th><th>Message</th></tr></thead><tbody>';
  r.runs.forEach(function(run) {
    var st = run.start_time ? new Date(run.start_time).toLocaleString() : '—';
    var dr = run.duration_s != null ? (parseFloat(run.duration_s) < 60 ? parseFloat(run.duration_s).toFixed(1) + 's' : (parseFloat(run.duration_s) / 60).toFixed(1) + 'm') : '—';
    var sc = run.status === 'succeeded' ? '#22c55e' : (run.status === 'failed' ? '#ef4444' : 'var(--muted)');
    var m = run.return_message ? _escHtml(run.return_message.substring(0, 200)) : '';
    html += '<tr><td style="white-space:nowrap;">' + st + '</td><td><span style="color:' + sc + ';font-weight:500;">' + (run.status || '—') + '</span></td><td>' + dr + '</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + m + '">' + m + '</td></tr>';
  });
  body.innerHTML = html + '</tbody></table>';
}

function _hideHistoryDrawer() {
  document.getElementById('cron-history-drawer').style.display = 'none';
  document.getElementById('cron-history-overlay').style.display = 'none';
}

// ─── Alert Config Form (0.162) ───
function _renderAlertConfigForm() {
  var body = document.getElementById('cron-alert-config-body');
  if (!body) return;
  var cd = window._cronData || [];
  if (cd.length === 0) { body.innerHTML = '<div class="admin-empty">No cron jobs loaded yet.</div>'; return; }

  var html = '<table class="admin-table" style="width:100%;font-size:12px;"><thead><tr><th>Job Name</th><th style="width:70px;">Alerts</th><th style="width:90px;">Max Fails</th><th style="width:100px;">Stale (min)</th><th style="width:50px;"></th></tr></thead><tbody>';
  cd.forEach(function(j) {
    var c = _cronAlertConfigs[j.jobname] || { alert_enabled: true, max_consecutive_failures: 3, stale_threshold_minutes: 30 };
    var jn = _escHtml(j.jobname);
    html += '<tr data-alert-job="' + jn + '">' +
      '<td style="font-weight:500;font-size:12px;">' + jn + '</td>' +
      '<td><input type="checkbox" class="cron-alert-enabled"' + (c.alert_enabled ? ' checked' : '') + '></td>' +
      '<td><input type="number" class="cron-alert-failures" value="' + c.max_consecutive_failures + '" min="1" max="50" style="width:55px;padding:3px;border:1px solid var(--border);border-radius:4px;background:var(--bg-input);color:var(--text);font-size:12px;"></td>' +
      '<td><input type="number" class="cron-alert-stale" value="' + c.stale_threshold_minutes + '" min="5" max="1440" style="width:65px;padding:3px;border:1px solid var(--border);border-radius:4px;background:var(--bg-input);color:var(--text);font-size:12px;"></td>' +
      '<td><button class="admin-btn admin-btn-sm" data-save-alert="' + jn + '" style="font-size:11px;">Save</button></td></tr>';
  });
  html += '</tbody></table>';
  html += '<div style="margin-top:12px;"><button class="admin-btn admin-btn-sm" id="cron-alert-save-all" style="background:var(--accent);color:#fff;border-color:var(--accent);">Save All</button></div>';
  body.innerHTML = html;

  // Bind individual save buttons
  body.querySelectorAll('[data-save-alert]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _saveCronAlertConfig(btn.getAttribute('data-save-alert'));
    });
  });
  var saveAll = document.getElementById('cron-alert-save-all');
  if (saveAll) saveAll.addEventListener('click', _saveAllCronAlertConfigs);
}

async function _saveCronAlertConfig(jobName) {
  var row = document.querySelector('[data-alert-job="' + jobName + '"]');
  if (!row) return;
  var r = await _cronMgmtCall('alert-config', {
    job_name: jobName,
    max_consecutive_failures: parseInt(row.querySelector('.cron-alert-failures').value) || 3,
    stale_threshold_minutes: parseInt(row.querySelector('.cron-alert-stale').value) || 30,
    alert_enabled: row.querySelector('.cron-alert-enabled').checked
  });
  if (r && r.success) {
    _cronAlertConfigs[jobName] = r.config;
    if (typeof toastSuccess === 'function') toastSuccess('Alert config saved for ' + jobName);
  } else {
    if (typeof toastWarning === 'function') toastWarning('Failed: ' + (r && r.error || 'Unknown'));
  }
}

async function _saveAllCronAlertConfigs() {
  var rows = document.querySelectorAll('[data-alert-job]');
  var saved = 0;
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var jn = row.getAttribute('data-alert-job');
    var r = await _cronMgmtCall('alert-config', {
      job_name: jn,
      max_consecutive_failures: parseInt(row.querySelector('.cron-alert-failures').value) || 3,
      stale_threshold_minutes: parseInt(row.querySelector('.cron-alert-stale').value) || 30,
      alert_enabled: row.querySelector('.cron-alert-enabled').checked
    });
    if (r && r.success) { _cronAlertConfigs[jn] = r.config; saved++; }
  }
  if (typeof toastSuccess === 'function') toastSuccess(saved + ' alert configs saved');
}

// ─── Helpers ───
function _applyCronFilter(f) {
  document.querySelectorAll('#cron-table tbody tr').forEach(function(r) {
    r.style.display = (f === 'all' || r.getAttribute('data-cron-health') === f) ? '' : 'none';
  });
}

function _describeCron(schedule) {
  if (!schedule) return '';
  var p = schedule.trim().split(/\s+/);
  if (p.length < 5) return schedule;
  if (p[0].startsWith('*/') && p[1] === '*') return 'Every ' + p[0].slice(2) + ' min';
  if (p[0] === '0' && p[1].startsWith('*/')) return 'Every ' + p[1].slice(2) + ' hrs';
  if (p[0] === '0' && p[1] !== '*' && p[2] === '*') return 'Daily at ' + p[1] + ':00 UTC';
  if (p[0] !== '*' && p[1] !== '*' && p[2] === '*') return 'Daily at ' + p[1] + ':' + p[0].padStart(2, '0') + ' UTC';
  if (p[4] !== '*') return 'Weekly (dow=' + p[4] + ')';
  return schedule;
}

function _timeAgo(date) {
  var s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return s + 's ago';
  var m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  var h = Math.floor(m / 60);
  if (h < 24) return h + 'h ' + (m % 60) + 'm ago';
  return Math.floor(h / 24) + 'd ' + (h % 24) + 'h ago';
}

function _escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _cleanupCronPanel() {
  if (_cronRefreshTimer) { clearInterval(_cronRefreshTimer); _cronRefreshTimer = null; }
}

window.loadCronPanel = loadCronPanel;
window._cleanupCronPanel = _cleanupCronPanel;

(function() {
  ['_cleanupCronPanel','_cronData','loadCronPanel'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'admin-cron', registered: Date.now() };
    }
  });
})();
