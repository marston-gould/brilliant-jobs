/**
 * admin-cost-monitor.js — AI Cost Monitoring Dashboard
 * REM-003: Edge Function Hardening + Cost Monitoring
 *
 * Renders:
 *   - Total spend overview (today, this week, this month, all-time)
 *   - Per-function cost breakdown table
 *   - Daily cost trend sparkline (30 days)
 *   - Budget utilization bar
 *   - Budget threshold management
 *
 * Depends on: cost-monitor Edge Function (via gateway)
 */

// ── API Helper ───────────────────────────────────────────────────────────────

async function _costAction(action, extra) {
  try {
    var sb = window.supabase || window._supabase;
    if (!sb) return null;
    var { data } = await sb.functions.invoke('api-gateway', {
      body: JSON.stringify(Object.assign({ action: action }, extra || {})),
      headers: { 'x-gateway-route': 'cost-monitor' }
    });
    return typeof data === 'string' ? JSON.parse(data) : data;
  } catch (e) {
    console.warn('[admin-cost]', action, 'failed:', e.message);
    return null;
  }
}

// ── Formatting Helpers ───────────────────────────────────────────────────────

function _fmtCost(usd) {
  if (usd === null || usd === undefined) return '—';
  return '$' + Number(usd).toFixed(4);
}

function _fmtTokens(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function _escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function _costStatCard(label, value, sub) {
  return '<div class="admin-stat-card">' +
    '<div class="admin-stat-label">' + _escHtml(label) + '</div>' +
    '<div class="admin-stat-value">' + _escHtml(value) + '</div>' +
    (sub ? '<div class="admin-stat-sub">' + _escHtml(sub) + '</div>' : '') +
    '</div>';
}

// ── SVG Sparkline ────────────────────────────────────────────────────────────

function _costSparkline(data, width, height) {
  if (!data || data.length < 2) return '<span style="color:#5a6070">No data yet</span>';
  var maxVal = Math.max.apply(null, data.map(function(d) { return d.cost_usd || 0; }));
  if (maxVal === 0) maxVal = 1;
  var pts = data.map(function(d, i) {
    var x = (i / (data.length - 1)) * width;
    var y = height - ((d.cost_usd || 0) / maxVal) * (height - 4);
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  return '<svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">' +
    '<polyline points="' + pts + '" fill="none" stroke="#4da3ff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
}

// ── Main Render ──────────────────────────────────────────────────────────────

async function renderAdminCostMonitor() {
  var el = document.getElementById('admin-page-cost-monitor');
  if (!el) return;

  el.innerHTML = '<div style="padding:24px;color:#8892b0;">Loading cost data...</div>';

  var res = await _costAction('summary', { days: 30 });
  if (!res || !res.ok || !res.data) {
    el.innerHTML = '<div style="padding:24px;color:#ef4444;">Failed to load cost data. Is the cost-monitor EF deployed?</div>';
    return;
  }

  var d = res.data;
  var budget = d.budget || {};
  var budgetPct = budget.monthly_budget > 0
    ? Math.round((budget.current_month_spend / budget.monthly_budget) * 100)
    : 0;
  var budgetColor = budgetPct > 90 ? '#ef4444' : budgetPct > 70 ? '#f59e0b' : '#22c55e';

  var html = '';

  // ── Overview Cards ──
  html += '<div class="admin-stat-row">';
  html += _costStatCard('30-Day Spend', _fmtCost(d.total_cost_usd), d.total_calls + ' calls');
  html += _costStatCard('Avg Cost/Call', _fmtCost(d.avg_cost_per_call), _fmtTokens(d.total_tokens) + ' tokens');
  html += _costStatCard('Monthly Budget', _fmtCost(budget.monthly_budget), budgetPct + '% used');
  html += _costStatCard('This Month', _fmtCost(budget.current_month_spend), 'Alert at ' + (budget.alert_threshold_pct || 80) + '%');
  html += '</div>';

  // ── Budget Bar ──
  html += '<div style="margin:16px 0;">';
  html += '<div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px;">';
  html += '<span style="color:#c8ccd4;">Budget Utilization</span>';
  html += '<span style="color:' + budgetColor + ';font-weight:600;">' + budgetPct + '%</span>';
  html += '</div>';
  html += '<div style="background:#1a1d2e;border-radius:4px;height:8px;overflow:hidden;">';
  html += '<div style="width:' + Math.min(budgetPct, 100) + '%;height:100%;background:' + budgetColor + ';border-radius:4px;transition:width 0.3s;"></div>';
  html += '</div></div>';

  // ── Daily Trend Sparkline ──
  if (d.daily_trend && d.daily_trend.length > 1) {
    html += '<div style="margin:16px 0;">';
    html += '<div style="font-size:13px;color:#c8ccd4;margin-bottom:8px;">30-Day Cost Trend</div>';
    html += _costSparkline(d.daily_trend, 600, 60);
    html += '</div>';
  }

  // ── Per-Function Breakdown ──
  if (d.by_function && d.by_function.length > 0) {
    html += '<div style="margin-top:20px;">';
    html += '<div style="font-size:14px;color:#e0e0e0;margin-bottom:8px;font-weight:600;">Cost by Function (30 days)</div>';
    html += '<table class="admin-table"><thead><tr>';
    html += '<th>Function</th><th>Calls</th><th>Tokens</th><th>Cost</th><th>Avg/Call</th>';
    html += '</tr></thead><tbody>';
    d.by_function.forEach(function(fn) {
      var avg = fn.calls > 0 ? (fn.cost_usd / fn.calls) : 0;
      html += '<tr>';
      html += '<td style="color:#4da3ff;">' + _escHtml(fn.function_name) + '</td>';
      html += '<td>' + fn.calls.toLocaleString() + '</td>';
      html += '<td>' + _fmtTokens(fn.tokens) + '</td>';
      html += '<td style="font-weight:600;">' + _fmtCost(fn.cost_usd) + '</td>';
      html += '<td style="color:#8892b0;">' + _fmtCost(avg) + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
  }

  el.innerHTML = html;
}

// Auto-render when admin page loads
if (typeof window !== 'undefined') {
  window.renderAdminCostMonitor = renderAdminCostMonitor;
}
