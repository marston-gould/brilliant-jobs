/**
 * admin-capacity.js — Capacity Model + Scaling Triggers Dashboard
 * SA-028: Phase S6 — Architecture Governance
 *
 * Renders:
 *   - System health overview (snapshot metrics)
 *   - Growth forecast (6/12/24 month projections)
 *   - Cost model per service with tier transitions
 *   - Scaling trigger configuration and alert log
 *   - 24h trend sparklines (connections, users, replica lag)
 *
 * Depends on: capacity-model Edge Function (via gateway)
 */

// ── API Helper ───────────────────────────────────────────────────────────────

async function _capacityAction(action, extra) {
  try {
    var sb = window.supabase || window._supabase;
    if (!sb) return null;
    var { data } = await sb.functions.invoke('api-gateway', {
      body: JSON.stringify(Object.assign({ action: action }, extra || {})),
      headers: { 'x-gateway-route': 'capacity-model' }
    });
    return typeof data === 'string' ? JSON.parse(data) : data;
  } catch (e) {
    if (typeof reportError === 'function') reportError('admin-capacity', '_capacityAction:' + action, e);
    return null;
  }
}

// ── Refresh Functions ────────────────────────────────────────────────────────

async function refreshCapacityDashboard() {
  var container = document.getElementById('capacity-dashboard');
  if (!container) return;

  container.innerHTML = '<div class="admin-loading">Loading capacity data...</div>';

  var result = await _capacityAction('summary');
  if (!result || result.error) {
    container.innerHTML = '<div class="admin-error">Failed to load capacity data.</div>';
    return;
  }

  var summary = result.summary || {};
  var snapshot = summary.snapshot || {};
  var alerts = summary.alerts || {};
  var forecast = summary.forecast || {};
  var costTotals = summary.cost_totals || {};
  var recentAlerts = result.recent_alerts || [];
  var costProjections = result.cost_projections || [];
  var history = result.snapshot_history_24h || [];

  var statusColor = summary.status === 'critical' ? 'var(--admin-red)'
    : summary.status === 'warning' ? 'var(--admin-amber)'
    : 'var(--admin-green)';

  var html = '';

  // ── Health Overview ──────────────────────────────────────────────────────
  html += '<div class="admin-section">';
  html += '<h3 class="admin-section-title">';
  html += '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + statusColor + ';margin-right:8px"></span>';
  html += 'System Health — ' + (summary.status || 'unknown').toUpperCase();
  html += '</h3>';
  html += '<div class="admin-stat-grid">';
  html += _adminStatCard('Total Users', _fmtNum(snapshot.users?.total || 0), _fmtNum(snapshot.users?.active_24h || 0) + ' active (24h)');
  html += _adminStatCard('Database Size', (snapshot.db_size_gb || 0) + ' GB', _fmtNum(snapshot.db_rows || 0) + ' rows');
  html += _adminStatCard('Connections', (snapshot.connections?.active || 0) + ' / ' + (snapshot.connections?.max || 0), _connPct(snapshot.connections) + '% utilization');
  html += _adminStatCard('Replica Lag', (snapshot.replica_lag_ms || 0) + ' ms', snapshot.replica_lag_ms > 3000 ? '<i data-lucide="triangle-alert" class="icon-xs icon-stroke" style="color:var(--warm)"></i> HIGH' : 'OK Healthy');
  html += _adminStatCard('Budget Used', (snapshot.budget_utilization_pct || 0).toFixed(1) + '%', '$' + (costTotals.current_mo || 0).toFixed(2) + '/mo');
  html += _adminStatCard('Alerts', (alerts.unacknowledged || 0) + ' pending', (alerts.critical_24h || 0) + ' critical (24h)');
  html += '</div>';
  html += '</div>';

  // ── Growth Forecast ──────────────────────────────────────────────────────
  html += '<div class="admin-section">';
  html += '<h3 class="admin-section-title">Growth Forecast</h3>';

  var growthRate = forecast.growth_rate_configured_pct || 15;
  var actualGrowth = forecast.growth_rate_actual_30d_pct;

  html += '<div style="margin-bottom:12px;font-size:13px;color:var(--admin-muted)">';
  html += 'Configured growth: <strong>' + growthRate + '% MoM</strong>';
  if (actualGrowth !== null && actualGrowth !== undefined) {
    html += ' · Actual (30d): <strong>' + actualGrowth.toFixed(1) + '%</strong>';
  }
  html += ' · <button onclick="changeGrowthRate()" class="admin-btn-sm">Change Rate</button>';
  html += '</div>';

  html += '<table class="admin-table"><thead><tr>';
  html += '<th>Metric</th><th>Current</th><th>6 Months</th><th>12 Months</th><th>24 Months</th>';
  html += '</tr></thead><tbody>';

  var users = forecast.users || {};
  var rows = forecast.db_rows || {};
  var dbSize = forecast.db_size_bytes || {};
  var au = forecast.active_users_24h || {};

  html += _forecastRow('Total Users', users.current, users.month_6, users.month_12, users.month_24);
  html += _forecastRow('Active Users (24h)', au.current, au.month_6, au.month_12, au.month_24);
  html += _forecastRow('Database Rows', rows.current, rows.month_6, rows.month_12, rows.month_24);
  html += _forecastRow('DB Size (GB)', dbSize.current_gb, dbSize.month_6_gb, dbSize.month_12_gb, dbSize.month_24_gb, true);

  html += '</tbody></table>';
  html += '</div>';

  // ── Cost Model ───────────────────────────────────────────────────────────
  html += '<div class="admin-section">';
  html += '<h3 class="admin-section-title">Cost Model by Service</h3>';
  html += '<div style="margin-bottom:12px;font-size:13px;color:var(--admin-muted)">';
  html += 'Total: <strong>$' + (costTotals.current_mo || 0).toFixed(2) + '/mo</strong>';
  html += ' → $' + (costTotals.month_6 || 0).toFixed(2) + ' (6mo)';
  html += ' → $' + (costTotals.month_12 || 0).toFixed(2) + ' (12mo)';
  html += ' → $' + (costTotals.month_24 || 0).toFixed(2) + ' (24mo)';
  html += ' · <button onclick="refreshCostModel()" class="admin-btn-sm">Refresh</button>';
  html += '</div>';

  html += '<table class="admin-table"><thead><tr>';
  html += '<th>Service</th><th>Current</th><th>Tier</th><th>6mo</th><th>12mo</th><th>24mo</th><th>$/user</th>';
  html += '</tr></thead><tbody>';

  for (var i = 0; i < costProjections.length; i++) {
    var c = costProjections[i];
    html += '<tr>';
    html += '<td><strong>' + (c.service_name || '') + '</strong></td>';
    html += '<td>$' + (c.cost_current_mo || 0).toFixed(2) + '</td>';
    html += '<td>' + (c.tier_current || '—') + '</td>';
    html += '<td>$' + (c.cost_6mo || 0).toFixed(2) + _tierBadge(c.tier_current, c.tier_6mo) + '</td>';
    html += '<td>$' + (c.cost_12mo || 0).toFixed(2) + _tierBadge(c.tier_current, c.tier_12mo) + '</td>';
    html += '<td>$' + (c.cost_24mo || 0).toFixed(2) + _tierBadge(c.tier_current, c.tier_24mo) + '</td>';
    html += '<td>$' + (c.cost_per_user || 0).toFixed(4) + '</td>';
    html += '</tr>';
  }

  html += '</tbody></table>';
  html += '</div>';

  // ── Scaling Triggers ─────────────────────────────────────────────────────
  html += '<div class="admin-section">';
  html += '<h3 class="admin-section-title">Scaling Triggers</h3>';
  html += '<button onclick="evaluateTriggersNow()" class="admin-btn-sm" style="margin-bottom:12px">Evaluate Now</button>';

  if (recentAlerts.length > 0) {
    html += '<table class="admin-table"><thead><tr>';
    html += '<th>Time</th><th>Trigger</th><th>Severity</th><th>Value</th><th>Threshold</th><th>Action</th><th></th>';
    html += '</tr></thead><tbody>';

    for (var j = 0; j < recentAlerts.length; j++) {
      var a = recentAlerts[j];
      var sevColor = a.severity === 'critical' ? 'var(--admin-red)' : 'var(--admin-amber)';
      html += '<tr>';
      html += '<td>' + _fmtTime(a.created_at) + '</td>';
      html += '<td>' + (a.trigger_name || '') + '</td>';
      html += '<td><span style="color:' + sevColor + ';font-weight:600">' + (a.severity || '').toUpperCase() + '</span></td>';
      html += '<td>' + _fmtNum(a.metric_value) + '</td>';
      html += '<td>' + _fmtNum(a.threshold_value) + '</td>';
      html += '<td>' + (a.action_taken || '') + '</td>';
      html += '<td>';
      if (!a.acknowledged_at) {
        html += '<button onclick="acknowledgeAlert(' + a.id + ')" class="admin-btn-sm">Ack</button>';
      } else {
        html += '<span style="color:var(--admin-muted)">✓ ' + _fmtTime(a.acknowledged_at) + '</span>';
      }
      html += '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
  } else {
    html += '<div style="color:var(--admin-muted);padding:16px">No recent alerts.</div>';
  }
  html += '</div>';

  // ── Trend Sparklines (24h) ───────────────────────────────────────────────
  if (history.length > 1) {
    html += '<div class="admin-section">';
    html += '<h3 class="admin-section-title">24-Hour Trends</h3>';
    html += '<div class="admin-stat-grid">';
    html += _sparkline('Connections', history, 'db_connections_active');
    html += _sparkline('Active Users', history, 'active_users_24h');
    html += _sparkline('Replica Lag (ms)', history, 'replica_lag_ms');
    html += _sparkline('Total Rows', history, 'db_total_rows');
    html += '</div>';
    html += '</div>';
  }

  container.innerHTML = html;
}


// ── Action Handlers ──────────────────────────────────────────────────────────

async function changeGrowthRate() {
  var rate = prompt('Enter monthly growth rate (%):', '15');
  if (rate === null) return;
  var num = parseFloat(rate);
  if (isNaN(num) || num < 0 || num > 200) {
    alert('Invalid growth rate. Enter 0-200.');
    return;
  }
  await _capacityAction('cost-model', { growth_rate_pct: num });
  refreshCapacityDashboard();
}

async function refreshCostModel() {
  await _capacityAction('cost-model');
  refreshCapacityDashboard();
}

async function evaluateTriggersNow() {
  var result = await _capacityAction('triggers');
  if (result && result.result && result.result.fired > 0) {
    alert(result.result.fired + ' trigger(s) fired.');
  }
  refreshCapacityDashboard();
}

async function acknowledgeAlert(alertId) {
  await _capacityAction('acknowledge', { alert_id: alertId });
  refreshCapacityDashboard();
}


// ── Helpers ──────────────────────────────────────────────────────────────────

function _adminStatCard(title, value, subtitle) {
  return '<div class="admin-stat-card">'
    + '<div class="admin-stat-title">' + title + '</div>'
    + '<div class="admin-stat-value">' + value + '</div>'
    + '<div class="admin-stat-subtitle">' + (subtitle || '') + '</div>'
    + '</div>';
}

function _fmtNum(n) {
  if (n === null || n === undefined) return '—';
  if (typeof n === 'number') {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toLocaleString();
  }
  return String(n);
}

function _fmtTime(ts) {
  if (!ts) return '—';
  try {
    var d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch (_e) {
    return ts;
  }
}

function _connPct(conn) {
  if (!conn || !conn.max || conn.max === 0) return 0;
  return ((conn.active / conn.max) * 100).toFixed(1);
}

function _forecastRow(label, current, m6, m12, m24, isDecimal) {
  var fmt = isDecimal ? function(v) { return v !== null && v !== undefined ? v.toFixed(2) : '—'; } : _fmtNum;
  return '<tr>'
    + '<td><strong>' + label + '</strong></td>'
    + '<td>' + fmt(current) + '</td>'
    + '<td>' + fmt(m6) + '</td>'
    + '<td>' + fmt(m12) + '</td>'
    + '<td>' + fmt(m24) + '</td>'
    + '</tr>';
}

function _tierBadge(current, projected) {
  if (!projected || projected === current) return '';
  return ' <span style="background:var(--admin-amber);color:#000;padding:1px 6px;border-radius:4px;font-size:11px">'
    + projected + '</span>';
}

function _sparkline(label, data, key) {
  if (!data || data.length < 2) return '';

  var values = data.map(function(d) { return d[key] || 0; });
  var min = Math.min.apply(null, values);
  var max = Math.max.apply(null, values);
  var range = max - min || 1;

  var width = 160;
  var height = 40;
  var points = values.map(function(v, i) {
    var x = (i / (values.length - 1)) * width;
    var y = height - ((v - min) / range) * height;
    return x + ',' + y;
  }).join(' ');

  var current = values[values.length - 1];

  return '<div class="admin-stat-card">'
    + '<div class="admin-stat-title">' + label + '</div>'
    + '<svg width="' + width + '" height="' + (height + 4) + '" style="margin:4px 0">'
    + '<polyline points="' + points + '" fill="none" stroke="var(--admin-accent)" stroke-width="1.5"/>'
    + '</svg>'
    + '<div class="admin-stat-value">' + _fmtNum(current) + '</div>'
    + '<div class="admin-stat-subtitle">min: ' + _fmtNum(min) + ' · max: ' + _fmtNum(max) + '</div>'
    + '</div>';
}

// ── Expose for admin panel ───────────────────────────────────────────────────
window.refreshCapacityDashboard = refreshCapacityDashboard;
window.changeGrowthRate = changeGrowthRate;
window.refreshCostModel = refreshCostModel;
window.evaluateTriggersNow = evaluateTriggersNow;
window.acknowledgeAlert = acknowledgeAlert;
