// @ts-nocheck
/**
 * admin-deploy-reports.js — Deployment Performance Reports & DORA Metrics Dashboard
 * BI-06: DORA metrics visualization + trend analysis + report generation
 *
 * Renders:
 *   - 4 DORA metric cards with elite/high/medium/low classification + delta badges
 *   - Overall DORA classification banner
 *   - Performance trend sparklines (7d/30d moving averages)
 *   - Report history table with type badges
 *   - Generate report button (weekly/monthly/on-demand)
 *
 * Depends on: deploy-tracker Edge Function (via gateway) — actions:
 *   dora-metrics, performance-trends, deployment-reports, generate-report
 */

// ── API Helper ───────────────────────────────────────────────────────────────

async function _doraAction(action, extra) {
  try {
    var sb = window.supabase || window._supabase;
    if (!sb) return null;
    var { data } = await sb.functions.invoke('api-gateway', {
      body: JSON.stringify(Object.assign({ action: action }, extra || {})),
      headers: { 'x-gateway-route': 'deploy-tracker' }
    });
    return typeof data === 'string' ? JSON.parse(data) : data;
  } catch (e) {
    console.error('[deploy-reports] action failed:', action, e);
    return null;
  }
}

// ── Formatting Helpers ───────────────────────────────────────────────────────

function _drTimeAgo(ts) {
  if (!ts) return '—';
  var diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

function _drClassColor(cls) {
  switch (cls) {
    case 'elite': return '#22c55e';
    case 'high': return '#3b82f6';
    case 'medium': return '#f59e0b';
    case 'low': return '#ef4444';
    default: return '#6b7280';
  }
}

function _drClassBg(cls) {
  switch (cls) {
    case 'elite': return 'rgba(34,197,94,0.12)';
    case 'high': return 'rgba(59,130,246,0.12)';
    case 'medium': return 'rgba(245,158,11,0.12)';
    case 'low': return 'rgba(239,68,68,0.12)';
    default: return 'rgba(107,114,128,0.12)';
  }
}

function _drClassLabel(cls) {
  return (cls || 'n/a').toUpperCase();
}

function _drDeltaBadge(pct) {
  if (pct === null || pct === undefined) return '';
  var sign = pct > 0 ? '+' : '';
  var color = pct > 0 ? '#22c55e' : pct < 0 ? '#ef4444' : '#6b7280';
  return '<span style="font-size:11px;color:' + color + ';margin-left:6px;">' + sign + pct + '%</span>';
}

function _drSparkline(values, width, height, color) {
  if (!values || values.length < 2) return '';
  var min = Math.min.apply(null, values);
  var max = Math.max.apply(null, values);
  var range = max - min || 1;
  var step = width / (values.length - 1);
  var points = values.map(function(v, i) {
    return (i * step).toFixed(1) + ',' + (height - ((v - min) / range * (height - 4) + 2)).toFixed(1);
  }).join(' ');
  return '<svg width="' + width + '" height="' + height + '" style="vertical-align:middle">' +
    '<polyline points="' + points + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
}

// ── Main Panel ───────────────────────────────────────────────────────────────

var _drRefreshTimer = null;

async function loadDeployReportsPanel() {
  var root = document.getElementById('admin-page-deploy-reports');
  if (!root) return;
  root.innerHTML = '<div class="admin-loading">Loading DORA metrics…</div>';

  // Fetch all data in parallel
  var results = await Promise.all([
    _doraAction('dora-metrics'),
    _doraAction('performance-trends', { limit: 30 }),
    _doraAction('deployment-reports', { limit: 15 })
  ]);

  var metricsRes = results[0];
  var trendsRes = results[1];
  var reportsRes = results[2];

  var metrics = (metricsRes && metricsRes.metrics) || [];
  var trends = (trendsRes && trendsRes.trends) || [];
  var reports = (reportsRes && reportsRes.reports) || [];

  // Find the weekly metric (preferred for display) or fall back to daily
  var m = metrics.find(function(x) { return x.period_type === 'weekly'; })
       || metrics.find(function(x) { return x.period_type === 'daily'; })
       || {};

  var html = '';

  // ── Overall DORA Banner ──────────────────────────────────────────
  var overallClass = m.overall_class || 'n/a';
  html += '<div style="background:' + _drClassBg(overallClass) + ';border:1px solid ' + _drClassColor(overallClass) + ';border-radius:8px;padding:14px 20px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between">';
  html += '<div><span style="font-weight:600;font-size:15px;color:var(--text-primary)">Overall DORA Classification</span>';
  html += '<span style="display:inline-block;margin-left:12px;padding:3px 10px;border-radius:4px;font-weight:700;font-size:13px;color:' + _drClassColor(overallClass) + ';background:' + _drClassBg(overallClass) + '">' + _drClassLabel(overallClass) + '</span>';
  if (m.prev_overall_class && m.prev_overall_class !== overallClass) {
    html += '<span style="font-size:11px;color:#6b7280;margin-left:8px">was ' + _drClassLabel(m.prev_overall_class) + '</span>';
  }
  html += '</div>';
  html += '<div style="font-size:12px;color:#6b7280">' + (m.period_start || '') + ' → ' + (m.period_end || '') + '</div>';
  html += '</div>';

  // ── 4 DORA Metric Cards ──────────────────────────────────────────
  html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px">';

  // 1. Deploy Frequency
  html += _drMetricCard(
    'Deploy Frequency',
    m.deploy_frequency ? parseFloat(m.deploy_frequency).toFixed(2) + '/day' : '—',
    m.deploy_frequency_class,
    m.frequency_change_pct,
    m.total_deploys || 0,
    'total deploys'
  );

  // 2. Lead Time for Changes
  html += _drMetricCard(
    'Lead Time',
    m.lead_time_minutes ? parseFloat(m.lead_time_minutes).toFixed(0) + ' min' : '—',
    m.lead_time_class,
    m.lead_time_change_pct,
    null,
    null
  );

  // 3. MTTR
  html += _drMetricCard(
    'Mean Time to Recovery',
    m.mttr_minutes ? parseFloat(m.mttr_minutes).toFixed(0) + ' min' : '—',
    m.mttr_class,
    m.mttr_change_pct,
    (m.total_incidents || 0) + (m.total_rollbacks || 0),
    'incidents + rollbacks'
  );

  // 4. Change Failure Rate
  html += _drMetricCard(
    'Change Failure Rate',
    m.change_failure_rate !== undefined ? parseFloat(m.change_failure_rate).toFixed(1) + '%' : '—',
    m.change_failure_class,
    m.cfr_change_pct,
    null,
    null
  );

  html += '</div>';

  // ── Trend Sparklines ─────────────────────────────────────────────
  if (trends.length >= 3) {
    html += '<div style="background:var(--card-bg,#fff);border:1px solid var(--border-color,#e5e7eb);border-radius:8px;padding:16px;margin-bottom:18px">';
    html += '<div style="font-weight:600;font-size:14px;margin-bottom:12px;color:var(--text-primary)">Performance Trends (30d)</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">';

    var freqVals = trends.map(function(t) { return parseFloat(t.deploy_frequency) || 0; }).reverse();
    var leadVals = trends.map(function(t) { return parseFloat(t.lead_time_minutes) || 0; }).reverse();
    var mttrVals = trends.map(function(t) { return parseFloat(t.mttr_minutes) || 0; }).reverse();
    var cfrVals = trends.map(function(t) { return parseFloat(t.change_failure_rate) || 0; }).reverse();

    html += '<div style="text-align:center"><div style="font-size:11px;color:#6b7280;margin-bottom:4px">Frequency</div>' + _drSparkline(freqVals, 120, 32, '#22c55e') + '</div>';
    html += '<div style="text-align:center"><div style="font-size:11px;color:#6b7280;margin-bottom:4px">Lead Time</div>' + _drSparkline(leadVals, 120, 32, '#3b82f6') + '</div>';
    html += '<div style="text-align:center"><div style="font-size:11px;color:#6b7280;margin-bottom:4px">MTTR</div>' + _drSparkline(mttrVals, 120, 32, '#f59e0b') + '</div>';
    html += '<div style="text-align:center"><div style="font-size:11px;color:#6b7280;margin-bottom:4px">Change Failure Rate</div>' + _drSparkline(cfrVals, 120, 32, '#ef4444') + '</div>';

    html += '</div></div>';
  }

  // ── Generate Report Button ───────────────────────────────────────
  html += '<div style="display:flex;gap:8px;margin-bottom:18px">';
  html += '<button id="dr-gen-weekly" style="padding:6px 14px;border-radius:6px;border:1px solid var(--border-color,#d1d5db);background:var(--card-bg,#fff);color:var(--text-primary);cursor:pointer;font-size:12px;font-weight:500">Generate Weekly Report</button>';
  html += '<button id="dr-gen-monthly" style="padding:6px 14px;border-radius:6px;border:1px solid var(--border-color,#d1d5db);background:var(--card-bg,#fff);color:var(--text-primary);cursor:pointer;font-size:12px;font-weight:500">Generate Monthly Report</button>';
  html += '<button id="dr-gen-ondemand" style="padding:6px 14px;border-radius:6px;border:1px solid var(--border-color,#d1d5db);background:var(--card-bg,#fff);color:var(--text-primary);cursor:pointer;font-size:12px;font-weight:500">On-Demand Report</button>';
  html += '<button id="dr-refresh" style="padding:6px 14px;border-radius:6px;border:1px solid var(--border-color,#d1d5db);background:var(--card-bg,#fff);color:var(--text-primary);cursor:pointer;font-size:12px;font-weight:500">↻ Refresh</button>';
  html += '</div>';

  // ── Report History Table ─────────────────────────────────────────
  html += '<div style="background:var(--card-bg,#fff);border:1px solid var(--border-color,#e5e7eb);border-radius:8px;padding:16px">';
  html += '<div style="font-weight:600;font-size:14px;margin-bottom:12px;color:var(--text-primary)">Report History</div>';

  if (reports.length === 0) {
    html += '<div style="color:#6b7280;font-size:13px;padding:12px 0">No reports generated yet. Use the buttons above to generate your first report.</div>';
  } else {
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    html += '<thead><tr style="border-bottom:1px solid var(--border-color,#e5e7eb)">';
    html += '<th style="text-align:left;padding:8px 6px;color:#6b7280;font-weight:500">Title</th>';
    html += '<th style="text-align:left;padding:8px 6px;color:#6b7280;font-weight:500">Type</th>';
    html += '<th style="text-align:left;padding:8px 6px;color:#6b7280;font-weight:500">Period</th>';
    html += '<th style="text-align:right;padding:8px 6px;color:#6b7280;font-weight:500">Deploys</th>';
    html += '<th style="text-align:right;padding:8px 6px;color:#6b7280;font-weight:500">Rollbacks</th>';
    html += '<th style="text-align:right;padding:8px 6px;color:#6b7280;font-weight:500">Alerts</th>';
    html += '<th style="text-align:center;padding:8px 6px;color:#6b7280;font-weight:500">DORA</th>';
    html += '<th style="text-align:right;padding:8px 6px;color:#6b7280;font-weight:500">Generated</th>';
    html += '</tr></thead><tbody>';

    reports.forEach(function(r) {
      var typeColor = r.report_type === 'weekly' ? '#3b82f6' : r.report_type === 'monthly' ? '#8b5cf6' : '#6b7280';
      var typeBg = r.report_type === 'weekly' ? 'rgba(59,130,246,0.1)' : r.report_type === 'monthly' ? 'rgba(139,92,246,0.1)' : 'rgba(107,114,128,0.1)';

      html += '<tr style="border-bottom:1px solid var(--border-color,#f3f4f6)">';
      html += '<td style="padding:8px 6px;color:var(--text-primary)">' + (r.title || '—') + '</td>';
      html += '<td style="padding:8px 6px"><span style="padding:2px 8px;border-radius:3px;font-size:11px;font-weight:500;color:' + typeColor + ';background:' + typeBg + '">' + (r.report_type || '').toUpperCase() + '</span></td>';
      html += '<td style="padding:8px 6px;color:#6b7280;font-size:11px">' + (r.period_start || '') + ' → ' + (r.period_end || '') + '</td>';
      html += '<td style="padding:8px 6px;text-align:right;color:var(--text-primary)">' + (r.successful_deploys || 0) + '/' + (r.total_deploys || 0) + '</td>';
      html += '<td style="padding:8px 6px;text-align:right;color:' + (r.rollback_count > 0 ? '#f59e0b' : 'var(--text-primary)') + '">' + (r.rollback_count || 0) + '</td>';
      html += '<td style="padding:8px 6px;text-align:right;color:' + (r.critical_alert_count > 0 ? '#ef4444' : 'var(--text-primary)') + '">' + (r.alert_count || 0) + (r.critical_alert_count > 0 ? ' (' + r.critical_alert_count + ' crit)' : '') + '</td>';
      html += '<td style="padding:8px 6px;text-align:center"><span style="padding:2px 8px;border-radius:3px;font-size:11px;font-weight:600;color:' + _drClassColor(r.overall_dora_class) + ';background:' + _drClassBg(r.overall_dora_class) + '">' + _drClassLabel(r.overall_dora_class) + '</span></td>';
      html += '<td style="padding:8px 6px;text-align:right;color:#6b7280;font-size:11px">' + _drTimeAgo(r.created_at) + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table>';
  }

  html += '</div>';

  root.innerHTML = html;

  // ── Event Handlers ─────────────────────────────────────────────────

  var genWeekly = document.getElementById('dr-gen-weekly');
  if (genWeekly) genWeekly.onclick = async function() {
    genWeekly.disabled = true;
    genWeekly.textContent = 'Generating…';
    await _doraAction('generate-report', { report_type: 'weekly' });
    loadDeployReportsPanel();
  };

  var genMonthly = document.getElementById('dr-gen-monthly');
  if (genMonthly) genMonthly.onclick = async function() {
    genMonthly.disabled = true;
    genMonthly.textContent = 'Generating…';
    await _doraAction('generate-report', { report_type: 'monthly' });
    loadDeployReportsPanel();
  };

  var genOnDemand = document.getElementById('dr-gen-ondemand');
  if (genOnDemand) genOnDemand.onclick = async function() {
    genOnDemand.disabled = true;
    genOnDemand.textContent = 'Generating…';
    await _doraAction('generate-report', { report_type: 'on_demand' });
    loadDeployReportsPanel();
  };

  var refreshBtn = document.getElementById('dr-refresh');
  if (refreshBtn) refreshBtn.onclick = function() { loadDeployReportsPanel(); };

  // Auto-refresh every 2 minutes
  if (_drRefreshTimer) clearInterval(_drRefreshTimer);
  _drRefreshTimer = setInterval(loadDeployReportsPanel, 120000);
}

// ── Metric Card Builder ──────────────────────────────────────────────────────

function _drMetricCard(title, value, cls, deltaPct, subValue, subLabel) {
  var html = '<div style="background:var(--card-bg,#fff);border:1px solid var(--border-color,#e5e7eb);border-radius:8px;padding:14px">';
  html += '<div style="font-size:11px;color:#6b7280;margin-bottom:6px">' + title + '</div>';
  html += '<div style="font-size:22px;font-weight:700;color:var(--text-primary);margin-bottom:4px">' + value;
  html += _drDeltaBadge(deltaPct);
  html += '</div>';
  html += '<div style="display:flex;align-items:center;justify-content:space-between">';
  html += '<span style="padding:2px 8px;border-radius:3px;font-size:11px;font-weight:600;color:' + _drClassColor(cls) + ';background:' + _drClassBg(cls) + '">' + _drClassLabel(cls) + '</span>';
  if (subValue !== null && subLabel) {
    html += '<span style="font-size:11px;color:#6b7280">' + subValue + ' ' + subLabel + '</span>';
  }
  html += '</div></div>';
  return html;
}
