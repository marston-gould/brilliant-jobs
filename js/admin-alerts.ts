/* ───────────────────────────────────────────────────────────
   admin-alerts.js — Operational Alerts Panel (AD-FIX-12)
   CS-023: Alert rules CRUD, alert history, ack/resolve workflow,
   PostHog event-based alerting, notification routing
   ─────────────────────────────────────────────────────────── */

var _alertsRefreshTimer = null;

async function loadAlertsPanel() {
  var el = document.getElementById('admin-page-alerts');
  if (!el) return;

  el.innerHTML = [
    '<div class="admin-block">',
    '  <div class="admin-block-header">',
    '    <h2 class="admin-block-title">Operational Alerts</h2>',
    '    <div class="admin-block-actions">',
    '      <span id="alerts-last-refresh" style="font-size:12px;color:var(--muted);margin-right:8px;"></span>',
    '      <button class="admin-btn admin-btn-sm" id="alerts-refresh-btn">↻ Refresh</button>',
    '      <button class="admin-btn admin-btn-sm" id="alerts-add-rule-btn" style="margin-left:4px;">+ Add Rule</button>',
    '    </div>',
    '  </div>',
    '',
    '  <!-- Active Alerts -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:20px;">',
    '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">',
    '      <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;">Active Alerts</div>',
    '      <div id="alerts-active-count" style="font-size:12px;color:var(--muted);"></div>',
    '    </div>',
    '    <div id="alerts-active-body">',
    '      <div style="text-align:center;color:var(--muted);font-size:13px;padding:12px;">Loading…</div>',
    '    </div>',
    '  </div>',
    '',
    '  <!-- Alert Rules -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:20px;">',
    '    <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Alert Rules</div>',
    '    <div id="alerts-rules-body">',
    '      <div style="text-align:center;color:var(--muted);font-size:13px;padding:12px;">Loading…</div>',
    '    </div>',
    '  </div>',
    '',
    '  <!-- Alert History -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;">',
    '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">',
    '      <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;">Alert History (7 days)</div>',
    '      <div style="display:flex;gap:4px;">',
    '        <button class="admin-btn admin-btn-sm admin-btn-active" data-alert-filter="all">All</button>',
    '        <button class="admin-btn admin-btn-sm" data-alert-filter="fired">Active</button>',
    '        <button class="admin-btn admin-btn-sm" data-alert-filter="acknowledged">Ack\'d</button>',
    '        <button class="admin-btn admin-btn-sm" data-alert-filter="resolved">Resolved</button>',
    '      </div>',
    '    </div>',
    '    <div id="alerts-history-body">',
    '      <div style="text-align:center;color:var(--muted);font-size:13px;padding:12px;">Loading…</div>',
    '    </div>',
    '  </div>',
    '',
    '  <!-- Add/Edit Rule Modal -->',
    '  <div id="alert-rule-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:9999;display:none;align-items:center;justify-content:center;">',
    '    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:24px;width:480px;max-width:90vw;">',
    '      <h3 id="alert-modal-title" style="margin:0 0 16px;font-size:16px;">Add Alert Rule</h3>',
    '      <div id="alert-modal-form"></div>',
    '      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">',
    '        <button class="admin-btn admin-btn-sm" id="alert-modal-cancel">Cancel</button>',
    '        <button class="admin-btn admin-btn-sm" id="alert-modal-save" style="background:var(--accent);color:#fff;border-color:var(--accent);">Save Rule</button>',
    '      </div>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('\n');

  // Bind buttons
  document.getElementById('alerts-refresh-btn').addEventListener('click', _refreshAlerts);
  document.getElementById('alerts-add-rule-btn').addEventListener('click', function() { _showRuleModal(null); });
  document.getElementById('alert-modal-cancel').addEventListener('click', _hideRuleModal);

  // Bind history filters
  document.querySelectorAll('[data-alert-filter]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('[data-alert-filter]').forEach(function(b) { b.classList.remove('admin-btn-active'); });
      btn.classList.add('admin-btn-active');
      _applyAlertHistoryFilter(btn.getAttribute('data-alert-filter'));
    });
  });

  // Initial load
  await _refreshAlerts();

  // Auto-refresh every 2 minutes
  if (_alertsRefreshTimer) clearInterval(_alertsRefreshTimer);
  _alertsRefreshTimer = setInterval(_refreshAlerts, 120000);
}

async function _refreshAlerts() {
  var lastEl = document.getElementById('alerts-last-refresh');
  if (lastEl) lastEl.textContent = 'Refreshing…';

  try {
    await Promise.allSettled([
      _loadActiveAlerts(),
      _loadAlertRules(),
      _loadAlertHistory()
    ]);
  } catch (e) {
    console.error('[Alerts] Refresh error:', e);
    if (typeof reportError === 'function') reportError('admin-alerts', e);
  }

  if (lastEl) lastEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
}

// ─── Active Alerts ───
async function _loadActiveAlerts() {
  var container = document.getElementById('alerts-active-body');
  var countEl = document.getElementById('alerts-active-count');
  if (!container) return;

  try {
    var res = await sb.from('alert_history')
      .select('*')
      .eq('status', 'fired')
      .order('created_at', { ascending: false })
      .limit(20);

    if (res.error) {
      if (res.error.code === '42P01' || res.error.message.indexOf('does not exist') !== -1) {
        container.innerHTML = '<div style="color:var(--muted);font-size:13px;">Run CS-023 migration to enable alert tracking.</div>';
        return;
      }
      throw new Error(res.error.message);
    }

    var alerts = res.data || [];
    if (countEl) countEl.textContent = alerts.length + ' active';

    if (alerts.length === 0) {
      container.innerHTML = '<div style="color:#22c55e;font-size:13px;text-align:center;padding:8px;">✅ No active alerts</div>';
      return;
    }

    var html = '';
    alerts.forEach(function(a) {
      var sevColor = a.severity === 'critical' ? '#ef4444' : a.severity === 'warning' ? '#f59e0b' : '#6b82a8';
      var sevIcon = a.severity === 'critical' ? '🔴' : a.severity === 'warning' ? '🟡' : '🔵';

      html += '<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">' +
        '<span style="font-size:16px;">' + sevIcon + '</span>' +
        '<div style="flex:1;">' +
        '<div style="font-weight:500;margin-bottom:2px;">' + _alertEsc(a.rule_name) + '</div>' +
        '<div style="font-size:12px;color:var(--muted);">' + _alertEsc(a.message) + '</div>' +
        '<div style="font-size:11px;color:var(--muted);margin-top:2px;">' + _alertTimeAgo(new Date(a.created_at)) + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:4px;">' +
        '<button class="admin-btn admin-btn-sm" onclick="_ackAlert(\'' + a.id + '\')">Acknowledge</button>' +
        '<button class="admin-btn admin-btn-sm" onclick="_resolveAlert(\'' + a.id + '\')">Resolve</button>' +
        '</div>' +
        '</div>';
    });

    container.innerHTML = html;

  } catch (e) {
    container.innerHTML = '<span style="color:var(--muted);font-size:13px;">Unavailable: ' + _alertEsc(e.message) + '</span>';
  }
}

// ─── Alert Rules ───
async function _loadAlertRules() {
  var container = document.getElementById('alerts-rules-body');
  if (!container) return;

  try {
    var res = await sb.from('alert_rules')
      .select('*')
      .order('category', { ascending: true });

    if (res.error) {
      if (res.error.code === '42P01' || res.error.message.indexOf('does not exist') !== -1) {
        container.innerHTML = '<div style="color:var(--muted);font-size:13px;">Run CS-023 migration to enable alert rules.</div>';
        return;
      }
      throw new Error(res.error.message);
    }

    var rules = res.data || [];

    if (rules.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:12px;">No alert rules configured. Click "+ Add Rule" to create one.</div>';
      return;
    }

    var html = '<table class="admin-table" style="width:100%;"><thead><tr>' +
      '<th>Status</th><th>Name</th><th>Category</th><th>Severity</th><th>Condition</th>' +
      '<th>Cooldown</th><th>Channels</th><th style="text-align:right;">Actions</th></tr></thead><tbody>';

    rules.forEach(function(r) {
      var enabled = r.enabled ? '🟢' : '⚫';
      var sevBadge = r.severity === 'critical' ? '<span style="color:#ef4444;font-weight:600;">Critical</span>' :
        r.severity === 'warning' ? '<span style="color:#f59e0b;">Warning</span>' :
        '<span style="color:#6b82a8;">Info</span>';

      var cond = r.condition || {};
      var condStr = (cond.metric || '?') + ' ' + (cond.operator || '?') + ' ' + (cond.threshold || '?');

      var channels = [];
      if (r.notify_email) channels.push('📧');
      if (r.notify_posthog) channels.push('📊');

      var lastTrig = r.last_triggered_at ? _alertTimeAgo(new Date(r.last_triggered_at)) : 'Never';

      html += '<tr>' +
        '<td>' + enabled + '</td>' +
        '<td style="font-weight:500;">' + _alertEsc(r.name) + '</td>' +
        '<td><code style="font-size:11px;">' + _alertEsc(r.category) + '</code></td>' +
        '<td>' + sevBadge + '</td>' +
        '<td style="font-size:12px;">' + _alertEsc(condStr) + '</td>' +
        '<td style="font-size:12px;">' + r.cooldown_minutes + 'min</td>' +
        '<td>' + channels.join(' ') + '</td>' +
        '<td style="text-align:right;">' +
        '<button class="admin-btn admin-btn-sm" onclick="_toggleRule(\'' + r.id + '\', ' + !r.enabled + ')" title="' + (r.enabled ? 'Disable' : 'Enable') + '">' +
        (r.enabled ? '⏸' : '▶') + '</button> ' +
        '<button class="admin-btn admin-btn-sm" onclick="_editRule(\'' + r.id + '\')" title="Edit">✏️</button> ' +
        '<button class="admin-btn admin-btn-sm" onclick="_deleteRule(\'' + r.id + '\')" title="Delete" style="color:#ef4444;">✕</button>' +
        '</td></tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    window._alertRulesCache = rules;

  } catch (e) {
    container.innerHTML = '<span style="color:var(--muted);font-size:13px;">Unavailable: ' + _alertEsc(e.message) + '</span>';
  }
}

// ─── Alert History ───
async function _loadAlertHistory() {
  var container = document.getElementById('alerts-history-body');
  if (!container) return;

  try {
    var sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    var res = await sb.from('alert_history')
      .select('*')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(50);

    if (res.error) {
      if (res.error.code === '42P01' || res.error.message.indexOf('does not exist') !== -1) {
        container.innerHTML = '<div style="color:var(--muted);font-size:13px;">Run CS-023 migration to enable alert history.</div>';
        return;
      }
      throw new Error(res.error.message);
    }

    var history = res.data || [];

    if (history.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:12px;">No alerts in the last 7 days.</div>';
      return;
    }

    var html = '<table class="admin-table" id="alert-history-table" style="width:100%;"><thead><tr>' +
      '<th>Time</th><th>Severity</th><th>Rule</th><th>Message</th><th>Status</th><th>Actions</th></tr></thead><tbody>';

    history.forEach(function(a) {
      var sevIcon = a.severity === 'critical' ? '🔴' : a.severity === 'warning' ? '🟡' : '🔵';
      var statusBadge = a.status === 'fired' ? '<span style="color:#ef4444;font-weight:600;">Active</span>' :
        a.status === 'acknowledged' ? '<span style="color:#f59e0b;">Ack\'d</span>' :
        '<span style="color:#22c55e;">Resolved</span>';

      var actions = '';
      if (a.status === 'fired') {
        actions = '<button class="admin-btn admin-btn-sm" onclick="_ackAlert(\'' + a.id + '\')">Ack</button> ' +
          '<button class="admin-btn admin-btn-sm" onclick="_resolveAlert(\'' + a.id + '\')">Resolve</button>';
      } else if (a.status === 'acknowledged') {
        actions = '<button class="admin-btn admin-btn-sm" onclick="_resolveAlert(\'' + a.id + '\')">Resolve</button>';
      }

      html += '<tr data-alert-status="' + a.status + '">' +
        '<td style="white-space:nowrap;font-size:12px;">' + _alertTimeAgo(new Date(a.created_at)) + '</td>' +
        '<td>' + sevIcon + '</td>' +
        '<td style="font-weight:500;font-size:12px;">' + _alertEsc(a.rule_name) + '</td>' +
        '<td style="font-size:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _alertEsc(a.message) + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' + actions + '</td>' +
        '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;

  } catch (e) {
    container.innerHTML = '<span style="color:var(--muted);font-size:13px;">Unavailable: ' + _alertEsc(e.message) + '</span>';
  }
}

function _applyAlertHistoryFilter(filter) {
  var rows = document.querySelectorAll('#alert-history-table tbody tr');
  rows.forEach(function(row) {
    if (filter === 'all') {
      row.style.display = '';
    } else {
      row.style.display = row.getAttribute('data-alert-status') === filter ? '' : 'none';
    }
  });
}

// ─── Alert Actions ───
async function _ackAlert(id) {
  try {
    var res = await sb.from('alert_history')
      .update({
        status: 'acknowledged',
        acknowledged_by: window.currentUser ? window.currentUser.id : null,
        acknowledged_at: new Date().toISOString()
      })
      .eq('id', id);

    if (res.error) throw new Error(res.error.message);
    _logAdminAction('alert_acknowledge', 'alert_history', id, {});
    if (window.posthog) posthog.capture('admin_alert_acknowledged', { alert_id: id });
    _refreshAlerts();
  } catch (e) {
    alert('Error acknowledging alert: ' + e.message);
  }
}
window._ackAlert = _ackAlert;

async function _resolveAlert(id) {
  try {
    var res = await sb.from('alert_history')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString()
      })
      .eq('id', id);

    if (res.error) throw new Error(res.error.message);
    _logAdminAction('alert_resolve', 'alert_history', id, {});
    if (window.posthog) posthog.capture('admin_alert_resolved', { alert_id: id });
    _refreshAlerts();
  } catch (e) {
    alert('Error resolving alert: ' + e.message);
  }
}
window._resolveAlert = _resolveAlert;

// ─── Rule CRUD ───
async function _toggleRule(id, newState) {
  try {
    var res = await sb.from('alert_rules')
      .update({ enabled: newState, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (res.error) throw new Error(res.error.message);
    _logAdminAction('alert_rule_toggle', 'alert_rules', id, { enabled: newState });
    if (window.posthog) posthog.capture('admin_alert_rule_toggled', { rule_id: id, enabled: newState });
    _loadAlertRules();
  } catch (e) {
    alert('Error toggling rule: ' + e.message);
  }
}
window._toggleRule = _toggleRule;

async function _deleteRule(id) {
  if (!confirm('Delete this alert rule? This cannot be undone.')) return;
  try {
    var res = await sb.from('alert_rules').delete().eq('id', id);
    if (res.error) throw new Error(res.error.message);
    _logAdminAction('alert_rule_delete', 'alert_rules', id, {});
    if (window.posthog) posthog.capture('admin_alert_rule_deleted', { rule_id: id });
    _loadAlertRules();
  } catch (e) {
    alert('Error deleting rule: ' + e.message);
  }
}
window._deleteRule = _deleteRule;

function _editRule(id) {
  var rules = window._alertRulesCache || [];
  var rule = rules.find(function(r) { return r.id === id; });
  if (rule) _showRuleModal(rule);
}
window._editRule = _editRule;

// ─── Rule Modal ───
function _showRuleModal(existingRule) {
  var modal = document.getElementById('alert-rule-modal');
  var titleEl = document.getElementById('alert-modal-title');
  var formEl = document.getElementById('alert-modal-form');
  var saveBtn = document.getElementById('alert-modal-save');
  if (!modal || !formEl) return;

  var r = existingRule || {};
  var cond = r.condition || {};

  titleEl.textContent = existingRule ? 'Edit Alert Rule' : 'Add Alert Rule';

  formEl.innerHTML = [
    '<div style="display:grid;gap:12px;">',
    '  <div><label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Rule Name</label>',
    '    <input id="rule-name" value="' + _alertEsc(r.name || '') + '" style="width:100%;padding:8px;background:var(--bg-main);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;" /></div>',
    '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">',
    '    <div><label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Category</label>',
    '      <select id="rule-category" style="width:100%;padding:8px;background:var(--bg-main);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;">',
    '        <option value="cron"' + (r.category === 'cron' ? ' selected' : '') + '>Cron</option>',
    '        <option value="health"' + (r.category === 'health' ? ' selected' : '') + '>Health</option>',
    '        <option value="feed"' + (r.category === 'feed' ? ' selected' : '') + '>Feed</option>',
    '        <option value="error"' + (r.category === 'error' ? ' selected' : '') + '>Error</option>',
    '        <option value="latency"' + (r.category === 'latency' ? ' selected' : '') + '>Latency</option>',
    '        <option value="custom"' + (r.category === 'custom' ? ' selected' : '') + '>Custom</option>',
    '      </select></div>',
    '    <div><label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Severity</label>',
    '      <select id="rule-severity" style="width:100%;padding:8px;background:var(--bg-main);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;">',
    '        <option value="info"' + (r.severity === 'info' ? ' selected' : '') + '>Info</option>',
    '        <option value="warning"' + (r.severity === 'warning' ? ' selected' : '') + '>Warning</option>',
    '        <option value="critical"' + (r.severity === 'critical' ? ' selected' : '') + '>Critical</option>',
    '      </select></div>',
    '  </div>',
    '  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">',
    '    <div><label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Metric</label>',
    '      <input id="rule-metric" value="' + _alertEsc(cond.metric || '') + '" placeholder="e.g. cron_failed_count" style="width:100%;padding:8px;background:var(--bg-main);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;" /></div>',
    '    <div><label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Operator</label>',
    '      <select id="rule-operator" style="width:100%;padding:8px;background:var(--bg-main);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;">',
    '        <option value=">="' + (cond.operator === '>=' ? ' selected' : '') + '>&gt;=</option>',
    '        <option value=">"' + (cond.operator === '>' ? ' selected' : '') + '>&gt;</option>',
    '        <option value="=="' + (cond.operator === '==' ? ' selected' : '') + '>==</option>',
    '        <option value="<"' + (cond.operator === '<' ? ' selected' : '') + '>&lt;</option>',
    '        <option value="<="' + (cond.operator === '<=' ? ' selected' : '') + '>&lt;=</option>',
    '      </select></div>',
    '    <div><label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Threshold</label>',
    '      <input id="rule-threshold" value="' + _alertEsc(String(cond.threshold || '')) + '" style="width:100%;padding:8px;background:var(--bg-main);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;" /></div>',
    '  </div>',
    '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">',
    '    <div><label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Cooldown (minutes)</label>',
    '      <input id="rule-cooldown" type="number" value="' + (r.cooldown_minutes || 60) + '" style="width:100%;padding:8px;background:var(--bg-main);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;" /></div>',
    '    <div><label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Window (minutes)</label>',
    '      <input id="rule-window" type="number" value="' + (cond.window_minutes || 60) + '" style="width:100%;padding:8px;background:var(--bg-main);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;" /></div>',
    '  </div>',
    '  <div style="display:flex;gap:16px;">',
    '    <label style="font-size:13px;display:flex;align-items:center;gap:6px;cursor:pointer;">',
    '      <input type="checkbox" id="rule-notify-email"' + (r.notify_email !== false ? ' checked' : '') + ' /> Email notification</label>',
    '    <label style="font-size:13px;display:flex;align-items:center;gap:6px;cursor:pointer;">',
    '      <input type="checkbox" id="rule-notify-posthog"' + (r.notify_posthog !== false ? ' checked' : '') + ' /> PostHog event</label>',
    '  </div>',
    '</div>'
  ].join('\n');

  modal.style.display = 'flex';

  // Re-bind save (remove old handler)
  var newSave = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSave, saveBtn);
  newSave.addEventListener('click', function() { _saveRule(existingRule ? existingRule.id : null); });
}

function _hideRuleModal() {
  var modal = document.getElementById('alert-rule-modal');
  if (modal) modal.style.display = 'none';
}

async function _saveRule(existingId) {
  var name = document.getElementById('rule-name').value.trim();
  if (!name) { alert('Rule name is required.'); return; }

  var data = {
    name: name,
    category: document.getElementById('rule-category').value,
    severity: document.getElementById('rule-severity').value,
    condition: {
      metric: document.getElementById('rule-metric').value.trim(),
      operator: document.getElementById('rule-operator').value,
      threshold: document.getElementById('rule-threshold').value.trim(),
      window_minutes: parseInt(document.getElementById('rule-window').value) || 60
    },
    cooldown_minutes: parseInt(document.getElementById('rule-cooldown').value) || 60,
    notify_email: document.getElementById('rule-notify-email').checked,
    notify_posthog: document.getElementById('rule-notify-posthog').checked,
    updated_at: new Date().toISOString()
  };

  try {
    var res;
    if (existingId) {
      res = await sb.from('alert_rules').update(data).eq('id', existingId);
    } else {
      data.created_by = window.currentUser ? window.currentUser.id : null;
      res = await sb.from('alert_rules').insert(data);
    }

    if (res.error) throw new Error(res.error.message);

    _logAdminAction(existingId ? 'alert_rule_update' : 'alert_rule_create', 'alert_rules', existingId || 'new', data);
    if (window.posthog) posthog.capture('admin_alert_rule_saved', { rule_name: name, is_update: !!existingId });

    _hideRuleModal();
    _loadAlertRules();
  } catch (e) {
    alert('Error saving rule: ' + e.message);
  }
}

// ─── Utilities ───
function _alertTimeAgo(date) {
  var secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return secs + 's ago';
  var mins = Math.floor(secs / 60);
  if (mins < 60) return mins + 'm ago';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ' + (mins % 60) + 'm ago';
  var days = Math.floor(hrs / 24);
  return days + 'd ' + (hrs % 24) + 'h ago';
}

function _alertEsc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Cleanup on tab switch
function _cleanupAlertsPanel() {
  if (_alertsRefreshTimer) {
    clearInterval(_alertsRefreshTimer);
    _alertsRefreshTimer = null;
  }
  _hideRuleModal();
}

// Export
window.loadAlertsPanel = loadAlertsPanel;
window._cleanupAlertsPanel = _cleanupAlertsPanel;

// CS-P1-004 FE-005: Register admin-alerts exports with BJ namespace
(function() {
  ['_ackAlert','_alertRulesCache','_cleanupAlertsPanel','_deleteRule','_editRule','_resolveAlert','_toggleRule','loadAlertsPanel'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'admin-alerts', registered: Date.now() };
    }
  });
})();
