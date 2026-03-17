/**
 * admin-deploy-alerting.js — Deployment Alerting & Health Scoring Dashboard
 * BI-04: Deployment Alerting & Health Scoring
 *
 * Renders:
 *   - Composite health score gauge (0-100 with letter grade and color)
 *   - Health dimension breakdown (5 dimensions with scores and weights)
 *   - Active alerts table with acknowledge/resolve buttons
 *   - Alert rules configuration table with enable/disable toggles
 *   - Manual evaluate button for on-demand alert checks
 *
 * Depends on: deploy-tracker Edge Function (via gateway)
 * Auto-refreshes every 2 minutes.
 */

// ── API Helper ───────────────────────────────────────────────────────────────

async function _deployAlertAction(action, extra) {
  try {
    var sb = window.supabase || window._supabase;
    if (!sb) return null;
    var { data } = await sb.functions.invoke('api-gateway', {
      body: JSON.stringify(Object.assign({ action: action }, extra || {})),
      headers: { 'x-gateway-route': 'deploy-tracker' }
    });
    return typeof data === 'string' ? JSON.parse(data) : data;
  } catch (e) {
    reportError('admin_deploy_alerting', e);
    console.warn('[admin-deploy-alerting]', action, 'failed:', e.message);
    return null;
  }
}

// ── Health Score Gauge ───────────────────────────────────────────────────────

function _healthScoreColor(score) {
  if (score >= 90) return '#22c55e';
  if (score >= 75) return '#84cc16';
  if (score >= 60) return '#eab308';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

function _renderHealthGauge(health) {
  var score = health.composite_score || 0;
  var grade = health.grade || '?';
  var color = _healthScoreColor(score);
  var alerts = health.alerts || {};

  var alertBadge = '';
  if (alerts.active_critical > 0) {
    alertBadge = '<span style="background:#ef4444;color:#fff;padding:2px 8px;border-radius:9999px;font-size:12px;margin-left:8px;">' +
      alerts.active_critical + ' CRITICAL</span>';
  }
  if (alerts.active_warning > 0) {
    alertBadge += '<span style="background:#f97316;color:#fff;padding:2px 8px;border-radius:9999px;font-size:12px;margin-left:8px;">' +
      alerts.active_warning + ' WARNING</span>';
  }

  return '<div style="display:flex;align-items:center;gap:24px;padding:16px;background:var(--bg-card,#fff);border-radius:12px;border:2px solid ' + color + ';">' +
    '<div style="text-align:center;min-width:100px;">' +
      '<div style="font-size:48px;font-weight:700;color:' + color + ';">' + score + '</div>' +
      '<div style="font-size:24px;font-weight:600;color:' + color + ';">' + grade + '</div>' +
      '<div style="font-size:11px;color:var(--text-muted,#666);margin-top:4px;">Health Score</div>' +
    '</div>' +
    '<div style="flex:1;">' +
      '<div style="font-size:16px;font-weight:600;color:var(--text,#333);margin-bottom:8px;">Deployment Health' + alertBadge + '</div>' +
      '<div style="font-size:12px;color:var(--text-muted,#666);">Composite of deploy success (30%), CI health (25%), environment drift (20%), bundle health (15%), deploy duration (10%)</div>' +
      '<div style="font-size:11px;color:var(--text-muted,#888);margin-top:4px;">Last evaluated: ' +
        (health.evaluated_at ? new Date(health.evaluated_at).toLocaleString() : 'N/A') + '</div>' +
    '</div>' +
  '</div>';
}

// ── Dimension Breakdown ──────────────────────────────────────────────────────

function _renderDimensions(dimensions) {
  if (!dimensions) return '<div style="color:var(--text-muted);">No dimension data</div>';

  var dims = [
    { key: 'deploy_success', label: 'Deploy Success', icon: '🚀' },
    { key: 'ci_health', label: 'CI Health', icon: '⚙️' },
    { key: 'environment_drift', label: 'Environment Drift', icon: '🔄' },
    { key: 'bundle_health', label: 'Bundle Health', icon: '📦' },
    { key: 'deploy_duration', label: 'Deploy Duration', icon: '⏱️' }
  ];

  var html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:16px;">';

  for (var i = 0; i < dims.length; i++) {
    var dim = dimensions[dims[i].key];
    if (!dim) continue;
    var score = dim.score || 0;
    var weight = dim.weight ? (dim.weight * 100) + '%' : '';
    var color = _healthScoreColor(score);
    var barWidth = Math.max(0, Math.min(100, score));

    var detail = '';
    if (dims[i].key === 'deploy_success' && dim.stats) {
      detail = dim.stats.success + '/' + dim.stats.total + ' deploys (7d)';
    } else if (dims[i].key === 'ci_health') {
      detail = (dim.total - dim.failures) + '/' + dim.total + ' passed (7d)';
    } else if (dims[i].key === 'environment_drift') {
      detail = dim.drift_count + ' surface(s) drifted';
    } else if (dims[i].key === 'bundle_health') {
      detail = dim.regressions + ' regression(s) (7d)';
    } else if (dims[i].key === 'deploy_duration') {
      detail = dim.avg_seconds ? Math.round(dim.avg_seconds) + 's avg' : 'No data';
    }

    html += '<div style="padding:12px;background:var(--bg-card,#fff);border-radius:8px;border:1px solid var(--border,#e5e7eb);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
        '<span style="font-size:13px;font-weight:600;">' + dims[i].icon + ' ' + dims[i].label + '</span>' +
        '<span style="font-size:11px;color:var(--text-muted,#888);">Weight: ' + weight + '</span>' +
      '</div>' +
      '<div style="font-size:24px;font-weight:700;color:' + color + ';">' + score + '</div>' +
      '<div style="height:4px;background:var(--border,#e5e7eb);border-radius:2px;margin:6px 0;">' +
        '<div style="height:100%;width:' + barWidth + '%;background:' + color + ';border-radius:2px;transition:width 0.5s;"></div>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--text-muted,#666);">' + detail + '</div>' +
    '</div>';
  }

  html += '</div>';
  return html;
}

// ── Active Alerts Table ──────────────────────────────────────────────────────

function _severityBadge(severity) {
  var colors = { critical: '#ef4444', warning: '#f97316', info: '#3b82f6' };
  var bg = colors[severity] || '#6b7280';
  return '<span style="background:' + bg + ';color:#fff;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;text-transform:uppercase;">' + severity + '</span>';
}

function _statusBadge(status) {
  var colors = { active: '#ef4444', acknowledged: '#eab308', resolved: '#22c55e', expired: '#6b7280' };
  var bg = colors[status] || '#6b7280';
  return '<span style="background:' + bg + '22;color:' + bg + ';padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;">' + status + '</span>';
}

function _renderAlerts(data) {
  var alerts = data.alerts || [];
  var counts = data.counts || {};

  var html = '<div style="margin-top:24px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
      '<h3 style="font-size:16px;font-weight:600;color:var(--text,#333);margin:0;">Active Alerts</h3>' +
      '<div style="display:flex;gap:8px;align-items:center;">' +
        '<span style="font-size:12px;color:var(--text-muted);">🔴 ' + (counts.active_critical || 0) + ' critical</span>' +
        '<span style="font-size:12px;color:var(--text-muted);">🟡 ' + (counts.active_warning || 0) + ' warning</span>' +
        '<span style="font-size:12px;color:var(--text-muted);">🔵 ' + (counts.active_info || 0) + ' info</span>' +
        '<button onclick="window._evaluateAlertsNow()" style="padding:4px 12px;font-size:12px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);cursor:pointer;">🔄 Evaluate Now</button>' +
      '</div>' +
    '</div>';

  if (alerts.length === 0) {
    html += '<div style="padding:24px;text-align:center;color:var(--text-muted);background:var(--bg-card);border-radius:8px;border:1px solid var(--border);">✅ No active alerts</div>';
  } else {
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      '<thead><tr style="border-bottom:2px solid var(--border,#e5e7eb);">' +
        '<th style="text-align:left;padding:8px;">Severity</th>' +
        '<th style="text-align:left;padding:8px;">Rule</th>' +
        '<th style="text-align:left;padding:8px;">Message</th>' +
        '<th style="text-align:left;padding:8px;">Status</th>' +
        '<th style="text-align:left;padding:8px;">Fired</th>' +
        '<th style="text-align:left;padding:8px;">Age</th>' +
        '<th style="text-align:right;padding:8px;">Actions</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < alerts.length; i++) {
      var a = alerts[i];
      var age = a.minutes_since_fired ? Math.round(a.minutes_since_fired) + 'm' : '?';
      if (a.minutes_since_fired > 60) age = Math.round(a.minutes_since_fired / 60) + 'h';
      if (a.minutes_since_fired > 1440) age = Math.round(a.minutes_since_fired / 1440) + 'd';

      var actions = '';
      if (a.status === 'active') {
        actions = '<button onclick="window._ackAlert(\'' + a.id + '\')" style="padding:2px 8px;font-size:11px;border:1px solid var(--border);border-radius:4px;background:var(--bg-card);cursor:pointer;margin-right:4px;">Ack</button>' +
          '<button onclick="window._resolveAlert(\'' + a.id + '\')" style="padding:2px 8px;font-size:11px;border:1px solid #22c55e;border-radius:4px;background:#22c55e22;color:#22c55e;cursor:pointer;">Resolve</button>';
      } else if (a.status === 'acknowledged') {
        actions = '<button onclick="window._resolveAlert(\'' + a.id + '\')" style="padding:2px 8px;font-size:11px;border:1px solid #22c55e;border-radius:4px;background:#22c55e22;color:#22c55e;cursor:pointer;">Resolve</button>';
      }

      html += '<tr style="border-bottom:1px solid var(--border,#f0f0f0);">' +
        '<td style="padding:8px;">' + _severityBadge(a.severity) + '</td>' +
        '<td style="padding:8px;font-weight:500;">' + (a.rule_name || '') + '</td>' +
        '<td style="padding:8px;max-width:300px;overflow:hidden;text-overflow:ellipsis;">' + (a.message || '') + '</td>' +
        '<td style="padding:8px;">' + _statusBadge(a.status) + '</td>' +
        '<td style="padding:8px;white-space:nowrap;">' + (a.fired_at ? new Date(a.fired_at).toLocaleString() : '') + '</td>' +
        '<td style="padding:8px;white-space:nowrap;">' + age + '</td>' +
        '<td style="padding:8px;text-align:right;white-space:nowrap;">' + actions + '</td>' +
      '</tr>';
    }

    html += '</tbody></table>';
  }

  html += '</div>';
  return html;
}

// ── Alert Rules Table ────────────────────────────────────────────────────────

function _renderRules(data) {
  var rules = data.rules || [];

  var html = '<div style="margin-top:24px;">' +
    '<h3 style="font-size:16px;font-weight:600;color:var(--text,#333);margin-bottom:12px;">Alert Rules</h3>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
    '<thead><tr style="border-bottom:2px solid var(--border,#e5e7eb);">' +
      '<th style="text-align:left;padding:8px;">Enabled</th>' +
      '<th style="text-align:left;padding:8px;">Rule</th>' +
      '<th style="text-align:left;padding:8px;">Type</th>' +
      '<th style="text-align:left;padding:8px;">Severity</th>' +
      '<th style="text-align:left;padding:8px;">Threshold</th>' +
      '<th style="text-align:left;padding:8px;">Cooldown</th>' +
      '<th style="text-align:left;padding:8px;">Last Fired</th>' +
    '</tr></thead><tbody>';

  for (var i = 0; i < rules.length; i++) {
    var r = rules[i];
    var thresholdStr = '';
    try {
      var t = r.threshold || {};
      var parts = [];
      for (var k in t) {
        if (t.hasOwnProperty(k)) parts.push(k.replace(/_/g, ' ') + ': ' + t[k]);
      }
      thresholdStr = parts.join(', ');
    } catch (e) { thresholdStr = JSON.stringify(r.threshold); }

    var toggleId = 'toggle-rule-' + r.id;
    html += '<tr style="border-bottom:1px solid var(--border,#f0f0f0);' + (!r.is_enabled ? 'opacity:0.5;' : '') + '">' +
      '<td style="padding:8px;">' +
        '<label style="cursor:pointer;" title="' + (r.is_enabled ? 'Disable' : 'Enable') + '">' +
          '<input type="checkbox" id="' + toggleId + '" ' + (r.is_enabled ? 'checked' : '') +
          ' onchange="window._toggleRule(\'' + r.id + '\')" style="cursor:pointer;" />' +
        '</label>' +
      '</td>' +
      '<td style="padding:8px;font-weight:500;">' + (r.rule_name || '') + '</td>' +
      '<td style="padding:8px;"><code style="font-size:11px;background:var(--bg-code,#f3f4f6);padding:2px 6px;border-radius:4px;">' + (r.rule_type || '') + '</code></td>' +
      '<td style="padding:8px;">' + _severityBadge(r.severity) + '</td>' +
      '<td style="padding:8px;font-size:11px;">' + thresholdStr + '</td>' +
      '<td style="padding:8px;white-space:nowrap;">' + (r.cooldown_minutes || 60) + 'min</td>' +
      '<td style="padding:8px;white-space:nowrap;font-size:11px;">' + (r.last_fired_at ? new Date(r.last_fired_at).toLocaleString() : 'Never') + '</td>' +
    '</tr>';
  }

  html += '</tbody></table></div>';
  return html;
}

// ── Panel Loader ─────────────────────────────────────────────────────────────

var _deployAlertingRefreshTimer = null;

async function loadDeployAlertingPanel() {
  var container = document.getElementById('admin-page-deploy-alerting');
  if (!container) return;

  container.innerHTML = '<div class="admin-loading">Loading deployment health & alerting…</div>';

  try {
    // Fetch all 3 data sources in parallel
    var results = await Promise.all([
      _deployAlertAction('deploy-health-score'),
      _deployAlertAction('deploy-alerts'),
      _deployAlertAction('manage-alert-rules', { sub_action: 'list' })
    ]);

    var health = results[0] || {};
    var alertsData = results[1] || {};
    var rulesData = results[2] || {};

    var html = _renderHealthGauge(health) +
      _renderDimensions(health.dimensions) +
      _renderAlerts(alertsData) +
      _renderRules(rulesData);

    container.innerHTML = html;

  } catch (e) {
    reportError('admin_deploy_alerting', e);
    container.innerHTML = '<div style="color:#ef4444;padding:16px;">Failed to load deploy alerting: ' + e.message + '</div>';
  }

  // Auto-refresh every 2 minutes
  if (_deployAlertingRefreshTimer) clearInterval(_deployAlertingRefreshTimer);
  _deployAlertingRefreshTimer = setInterval(function() {
    var panel = document.getElementById('admin-panel-deploy-alerting');
    if (panel && panel.style.display !== 'none') {
      loadDeployAlertingPanel();
    } else if (_deployAlertingRefreshTimer) {
      clearInterval(_deployAlertingRefreshTimer);
      _deployAlertingRefreshTimer = null;
    }
  }, 120000);
}

// ── Action Handlers (global for onclick) ─────────────────────────────────────

window._ackAlert = async function(alertId) {
  await _deployAlertAction('acknowledge-alert', { alert_id: alertId });
  loadDeployAlertingPanel();
};

window._resolveAlert = async function(alertId) {
  var notes = prompt('Resolve notes (optional):');
  await _deployAlertAction('acknowledge-alert', {
    alert_id: alertId,
    resolve: true,
    resolve_notes: notes || null
  });
  loadDeployAlertingPanel();
};

window._toggleRule = async function(ruleId) {
  await _deployAlertAction('manage-alert-rules', { sub_action: 'toggle', rule_id: ruleId });
  loadDeployAlertingPanel();
};

window._evaluateAlertsNow = async function() {
  var result = await _deployAlertAction('manage-alert-rules', { sub_action: 'evaluate' });
  if (result) {
    alert('Evaluated ' + (result.checked || 0) + ' rules, fired ' + (result.fired || 0) + ' alerts');
  }
  loadDeployAlertingPanel();
};

// Export for ADMIN_SUBPAGE_MAP
window.loadDeployAlertingPanel = loadDeployAlertingPanel;
