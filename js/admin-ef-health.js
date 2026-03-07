/* ───────────────────────────────────────────────────────────
   admin-ef-health.js — Edge Function Health Dashboard (AD-FIX-14)
   CS-024: Invocations, errors, latency p50/p95/p99 for all EFs.
   Data sourced from health_check_log + admin-analytics EF.
   ─────────────────────────────────────────────────────────── */

var _efHealthRefreshTimer = null;

var EF_ANALYTICS_URL = (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'https://qojhagupdnbtomfoxnsf.supabase.co') + '/functions/v1/admin-analytics';

async function loadEfHealthPanel() {
  var el = document.getElementById('admin-page-ef-health');
  if (!el) return;

  el.innerHTML = [
    '<div class="admin-block">',
    '  <div class="admin-block-header">',
    '    <h2 class="admin-block-title">Edge Function Health</h2>',
    '    <div class="admin-block-actions">',
    '      <span id="efh-last-refresh" style="font-size:12px;color:var(--muted);margin-right:8px;"></span>',
    '      <button class="admin-btn admin-btn-sm" id="efh-refresh-btn">↻ Refresh</button>',
    '    </div>',
    '  </div>',
    '',
    '  <!-- Summary Cards -->',
    '  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;" id="efh-summary-cards">',
    '    <div class="stat-card"><div class="stat-val" id="efh-total-functions">—</div><div class="stat-label">Deployed EFs</div></div>',
    '    <div class="stat-card"><div class="stat-val" id="efh-total-checks">—</div><div class="stat-label">Health Checks</div></div>',
    '    <div class="stat-card"><div class="stat-val" id="efh-healthy-pct">—</div><div class="stat-label">Healthy %</div></div>',
    '    <div class="stat-card"><div class="stat-val" id="efh-last-status">—</div><div class="stat-label">Last Status</div></div>',
    '  </div>',
    '',
    '  <!-- Last Health Check Detail -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:20px;">',
    '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">',
    '      <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;">Latest Health Check</div>',
    '      <div id="efh-last-check-time" style="font-size:12px;color:var(--muted);"></div>',
    '    </div>',
    '    <div id="efh-last-check-body" style="font-size:13px;color:var(--muted);">Loading…</div>',
    '  </div>',
    '',
    '  <!-- Check Metrics Table (latency/success by subsystem) -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:20px;">',
    '    <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Subsystem Metrics (from Health Checks)</div>',
    '    <div id="efh-metrics-body" style="overflow-x:auto;">',
    '      <div style="text-align:center;color:var(--muted);font-size:13px;padding:16px;">Loading metrics…</div>',
    '    </div>',
    '  </div>',
    '',
    '  <!-- Deployed Functions List -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;">',
    '    <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Deployed Edge Functions</div>',
    '    <div id="efh-functions-list" style="font-size:13px;color:var(--muted);">Loading…</div>',
    '  </div>',
    '</div>'
  ].join('\n');

  document.getElementById('efh-refresh-btn').addEventListener('click', function() { _refreshEfHealth(); });

  await _refreshEfHealth();

  if (_efHealthRefreshTimer) clearInterval(_efHealthRefreshTimer);
  _efHealthRefreshTimer = setInterval(_refreshEfHealth, 120000);
}

async function _refreshEfHealth() {
  var lastEl = document.getElementById('efh-last-refresh');
  if (lastEl) lastEl.textContent = 'Refreshing…';

  try {
    var token = '';
    if (typeof sb !== 'undefined') {
      var sess = await sb.auth.getSession();
      token = (sess.data && sess.data.session) ? sess.data.session.access_token : '';
    }

    var res = await fetch(EF_ANALYTICS_URL + '?action=ef-health', {
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
    });

    if (!res.ok) throw new Error('API ' + res.status);
    var data = await res.json();

    _renderEfSummary(data);
    _renderLastCheck(data.last_check);
    _renderCheckMetrics(data.check_metrics || []);
    _renderFunctionsList(data.functions || []);

  } catch (e) {
    console.error('[EfHealth] Refresh error:', e);
    if (typeof reportError === 'function') reportError('admin-ef-health', e);
  }

  if (lastEl) lastEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
}

function _renderEfSummary(data) {
  var hc = data.health_checks || {};
  var el;

  el = document.getElementById('efh-total-functions');
  if (el) el.textContent = data.function_count || 0;

  el = document.getElementById('efh-total-checks');
  if (el) el.textContent = hc.total || 0;

  el = document.getElementById('efh-healthy-pct');
  if (el) {
    var pct = hc.total > 0 ? Math.round((hc.healthy / hc.total) * 100) : 0;
    el.textContent = pct + '%';
    el.style.color = pct >= 95 ? '#22c55e' : pct >= 80 ? '#f59e0b' : '#ef4444';
  }

  el = document.getElementById('efh-last-status');
  if (el && data.last_check) {
    var status = (data.last_check.overall || 'unknown').toUpperCase();
    el.textContent = status;
    el.style.color = status === 'HEALTHY' ? '#22c55e' : status === 'DEGRADED' ? '#f59e0b' : '#ef4444';
  }
}

function _renderLastCheck(check) {
  var body = document.getElementById('efh-last-check-body');
  var timeEl = document.getElementById('efh-last-check-time');
  if (!body) return;

  if (!check) {
    body.innerHTML = '<div style="color:var(--muted);font-size:13px;">No health check data available.</div>';
    return;
  }

  if (timeEl && check.created_at) {
    timeEl.textContent = new Date(check.created_at).toLocaleString();
  }

  var checks = check.checks || {};
  var html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;">';

  Object.entries(checks).forEach(function(entry) {
    var name = entry[0];
    var detail = entry[1];
    var statusColor = detail.status === 'pass' ? '#22c55e' : '#ef4444';
    var statusIcon = detail.status === 'pass' ? '✓' : '✗';

    html += '<div style="background:var(--bg-card);border-radius:8px;padding:10px;border:1px solid var(--border);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
      '<span style="font-weight:600;font-size:12px;">' + _efhEsc(name.replace(/_/g, ' ')) + '</span>' +
      '<span style="color:' + statusColor + ';font-weight:600;font-size:12px;">' + statusIcon + ' ' + _efhEsc(detail.status) + '</span>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--muted);">' +
      (detail.latencyMs !== undefined ? detail.latencyMs + 'ms' : '') +
      (detail.message ? ' · ' + _efhEsc(detail.message) : '') +
      '</div></div>';
  });

  html += '</div>';
  body.innerHTML = html;
}

function _renderCheckMetrics(metrics) {
  var container = document.getElementById('efh-metrics-body');
  if (!container) return;

  if (!metrics.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:16px;">No check metrics available yet.</div>';
    return;
  }

  var html = '<table class="admin-table" style="width:100%;font-size:12px;">' +
    '<thead><tr>' +
    '<th>Subsystem</th>' +
    '<th style="text-align:right;">Invocations</th>' +
    '<th style="text-align:right;">Success %</th>' +
    '<th style="text-align:right;">p50 (ms)</th>' +
    '<th style="text-align:right;">p95 (ms)</th>' +
    '<th style="text-align:right;">p99 (ms)</th>' +
    '<th style="text-align:right;">Avg (ms)</th>' +
    '</tr></thead><tbody>';

  metrics.forEach(function(m) {
    var successColor = m.success_rate >= 95 ? '#22c55e' : m.success_rate >= 80 ? '#f59e0b' : '#ef4444';
    var p95Color = m.latency_p95 > 2000 ? '#ef4444' : m.latency_p95 > 1000 ? '#f59e0b' : 'var(--text-main)';

    html += '<tr>' +
      '<td><code style="font-size:11px;background:var(--bg-card);padding:1px 4px;border-radius:3px;">' + _efhEsc(m.name) + '</code></td>' +
      '<td style="text-align:right;">' + m.invocations + '</td>' +
      '<td style="text-align:right;color:' + successColor + ';font-weight:600;">' + m.success_rate + '%</td>' +
      '<td style="text-align:right;">' + m.latency_p50 + '</td>' +
      '<td style="text-align:right;color:' + p95Color + ';">' + m.latency_p95 + '</td>' +
      '<td style="text-align:right;">' + m.latency_p99 + '</td>' +
      '<td style="text-align:right;">' + m.latency_avg + '</td>' +
      '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function _renderFunctionsList(functions) {
  var container = document.getElementById('efh-functions-list');
  if (!container) return;

  if (!functions.length) {
    container.innerHTML = '<div style="color:var(--muted);">No functions listed.</div>';
    return;
  }

  var html = '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
  functions.forEach(function(fn) {
    html += '<span style="background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:3px 10px;font-size:11px;font-family:var(--font-mono,monospace);">' + _efhEsc(fn) + '</span>';
  });
  html += '</div>';
  container.innerHTML = html;
}

function _efhEsc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _cleanupEfHealthPanel() {
  if (_efHealthRefreshTimer) {
    clearInterval(_efHealthRefreshTimer);
    _efHealthRefreshTimer = null;
  }
}

window.loadEfHealthPanel = loadEfHealthPanel;
window._cleanupEfHealthPanel = _cleanupEfHealthPanel;

// CS-P1-004 FE-005: Register admin-ef-health exports with BJ namespace
(function() {
  ['_cleanupEfHealthPanel','loadEfHealthPanel'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'admin-ef-health', registered: Date.now() };
    }
  });
})();
