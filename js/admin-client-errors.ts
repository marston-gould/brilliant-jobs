// @ts-nocheck
/* ───────────────────────────────────────────────────────────
   admin-client-errors.js — Client Error Dashboard (DO-001)
   Real-time error monitoring from the client_errors table.
   Shows: error rate timeline, top errors, live stream,
   severity breakdown, affected users, surface distribution.
   ─────────────────────────────────────────────────────────── */

var _ceRefreshTimer = null;
var _ceHoursFilter = 24;
var _ceSeverityFilter = 'all';
var _ceSurfaceFilter = 'all';
var _ceCurrentPage = 0;
var _CE_PAGE_SIZE = 50;

async function loadClientErrorsPanel() {
  var el = document.getElementById('admin-page-client-errors');
  if (!el) return;

  el.innerHTML = [
    '<div class="admin-block">',
    '  <div class="admin-block-header">',
    '    <h2 class="admin-block-title">Client Errors</h2>',
    '    <div class="admin-block-actions">',
    '      <select id="ce-hours-filter" style="padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-main);font-size:12px;margin-right:4px;">',
    '        <option value="1">1h</option>',
    '        <option value="6">6h</option>',
    '        <option value="24" selected>24h</option>',
    '        <option value="72">3d</option>',
    '        <option value="168">7d</option>',
    '      </select>',
    '      <select id="ce-severity-filter" style="padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-main);font-size:12px;margin-right:4px;">',
    '        <option value="all">All Severity</option>',
    '        <option value="fatal">Fatal</option>',
    '        <option value="error">Error</option>',
    '        <option value="warning">Warning</option>',
    '      </select>',
    '      <select id="ce-surface-filter" style="padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-main);font-size:12px;margin-right:4px;">',
    '        <option value="all">All Surfaces</option>',
    '        <option value="dashboard">Dashboard</option>',
    '        <option value="extension">Extension</option>',
    '        <option value="landing">Landing</option>',
    '      </select>',
    '      <span id="ce-last-refresh" style="font-size:12px;color:var(--muted);margin-right:8px;"></span>',
    '      <button class="admin-btn admin-btn-sm" id="ce-refresh-btn">↻ Refresh</button>',
    '    </div>',
    '  </div>',
    '',
    '  <!-- KPI Cards -->',
    '  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;" id="ce-kpi-cards">',
    '    <div class="stat-card"><div class="stat-val" id="ce-total">—</div><div class="stat-label">Total Errors</div></div>',
    '    <div class="stat-card"><div class="stat-val admin-red" id="ce-fatal">—</div><div class="stat-label">Fatal</div></div>',
    '    <div class="stat-card"><div class="stat-val admin-amber" id="ce-errors">—</div><div class="stat-label">Errors</div></div>',
    '    <div class="stat-card"><div class="stat-val" id="ce-warnings">—</div><div class="stat-label">Warnings</div></div>',
    '    <div class="stat-card"><div class="stat-val" id="ce-unique">—</div><div class="stat-label">Unique</div></div>',
    '    <div class="stat-card"><div class="stat-val" id="ce-users">—</div><div class="stat-label">Affected Users</div></div>',
    '  </div>',
    '',
    '  <!-- Error Rate Chart -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:20px;">',
    '    <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Error Rate (hourly)</div>',
    '    <div id="ce-rate-chart" style="width:100%;height:200px;"></div>',
    '  </div>',
    '',
    '  <!-- Top Errors by Fingerprint -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:20px;">',
    '    <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Top Errors (grouped by fingerprint)</div>',
    '    <div id="ce-top-errors" style="overflow-x:auto;">',
    '      <div style="text-align:center;color:var(--muted);font-size:13px;padding:16px;">Loading…</div>',
    '    </div>',
    '  </div>',
    '',
    '  <!-- Error Stream -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;">',
    '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">',
    '      <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;">Live Error Stream</div>',
    '      <div id="ce-pager" style="display:flex;gap:6px;align-items:center;font-size:12px;color:var(--muted);"></div>',
    '    </div>',
    '    <div id="ce-stream" style="overflow-x:auto;">',
    '      <div style="text-align:center;color:var(--muted);font-size:13px;padding:16px;">Loading…</div>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('\n');

  // Bind filters
  document.getElementById('ce-refresh-btn').addEventListener('click', function() { _ceRefresh(); });
  document.getElementById('ce-hours-filter').addEventListener('change', function() {
    _ceHoursFilter = parseInt(this.value, 10) || 24;
    _ceCurrentPage = 0;
    _ceRefresh();
  });
  document.getElementById('ce-severity-filter').addEventListener('change', function() {
    _ceSeverityFilter = this.value;
    _ceCurrentPage = 0;
    _ceRefresh();
  });
  document.getElementById('ce-surface-filter').addEventListener('change', function() {
    _ceSurfaceFilter = this.value;
    _ceCurrentPage = 0;
    _ceRefresh();
  });

  await _ceRefresh();

  if (_ceRefreshTimer) clearInterval(_ceRefreshTimer);
  _ceRefreshTimer = setInterval(_ceRefresh, 30000); // 30s auto-refresh
}

async function _ceRefresh() {
  var lastEl = document.getElementById('ce-last-refresh');
  if (lastEl) lastEl.textContent = 'Loading…';

  try {
    var since = new Date(Date.now() - _ceHoursFilter * 3600000).toISOString();

    // Parallel queries
    var [kpiResult, topResult, streamResult, rateResult] = await Promise.all([
      _ceQueryKPI(since),
      _ceQueryTop(since),
      _ceQueryStream(since),
      _ceQueryRates(since)
    ]);

    _ceRenderKPI(kpiResult);
    _ceRenderTop(topResult);
    _ceRenderStream(streamResult);
    _ceRenderRateChart(rateResult);

  } catch (e) {
    console.error('[ClientErrors] Refresh failed:', e);
    if (typeof reportError === 'function') reportError('admin-client-errors:silent', e);
  }

  if (lastEl) lastEl.textContent = new Date().toLocaleTimeString();
}

// ── Query: KPI aggregates ──
async function _ceQueryKPI(since) {
  var q = sb.from('client_errors')
    .select('severity, user_id, fingerprint', { count: 'exact' })
    .gte('created_at', since);

  if (_ceSeverityFilter !== 'all') q = q.eq('severity', _ceSeverityFilter);
  if (_ceSurfaceFilter !== 'all') q = q.eq('surface', _ceSurfaceFilter);
  q = q.limit(5000);

  var { data, error, count } = await q;
  if (error) throw error;
  return { rows: data || [], total: count || 0 };
}

// ── Query: Top errors by fingerprint ──
async function _ceQueryTop(since) {
  // Use RPC or raw aggregation — Supabase doesn't support GROUP BY in client SDK
  // Fetch last 2000 rows and aggregate client-side
  var q = sb.from('client_errors')
    .select('fingerprint, label, message, severity, user_id')
    .gte('created_at', since);

  if (_ceSeverityFilter !== 'all') q = q.eq('severity', _ceSeverityFilter);
  if (_ceSurfaceFilter !== 'all') q = q.eq('surface', _ceSurfaceFilter);
  q = q.order('created_at', { ascending: false }).limit(2000);

  var { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// ── Query: Error stream (paginated) ──
async function _ceQueryStream(since) {
  var q = sb.from('client_errors')
    .select('id, created_at, surface, label, message, stack, severity, fingerprint, user_id, page, version, metadata')
    .gte('created_at', since);

  if (_ceSeverityFilter !== 'all') q = q.eq('severity', _ceSeverityFilter);
  if (_ceSurfaceFilter !== 'all') q = q.eq('surface', _ceSurfaceFilter);
  q = q.order('created_at', { ascending: false })
    .range(_ceCurrentPage * _CE_PAGE_SIZE, (_ceCurrentPage + 1) * _CE_PAGE_SIZE - 1);

  var { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// ── Query: Hourly error rates (from MV or raw) ──
async function _ceQueryRates(since) {
  try {
    var { data, error } = await sb.from('mv_error_rates')
      .select('hour, error_count, affected_users, unique_errors')
      .gte('hour', since)
      .order('hour', { ascending: true })
      .limit(200);
    if (!error && data && data.length > 0) return data;
  } catch (_) { /* MV might not exist yet, fall through */ }

  // Fallback: client-side bucketing
  var q = sb.from('client_errors')
    .select('created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(5000);
  var { data: raw } = await q;
  if (!raw) return [];
  var buckets = {};
  raw.forEach(function(r) {
    var h = r.created_at.slice(0, 13) + ':00:00';
    buckets[h] = (buckets[h] || 0) + 1;
  });
  return Object.entries(buckets).map(function(e) { return { hour: e[0], error_count: e[1] }; });
}

// ── Render: KPI cards ──
function _ceRenderKPI(result) {
  var rows = result.rows;
  var sevCounts = { fatal: 0, error: 0, warning: 0 };
  var users = {};
  var fingerprints = {};

  rows.forEach(function(r) {
    sevCounts[r.severity] = (sevCounts[r.severity] || 0) + 1;
    if (r.user_id) users[r.user_id] = true;
    if (r.fingerprint) fingerprints[r.fingerprint] = true;
  });

  _ceText('#ce-total', result.total.toLocaleString());
  _ceText('#ce-fatal', sevCounts.fatal);
  _ceText('#ce-errors', sevCounts.error);
  _ceText('#ce-warnings', sevCounts.warning);
  _ceText('#ce-unique', Object.keys(fingerprints).length);
  _ceText('#ce-users', Object.keys(users).length);
}

// ── Render: Top errors table ──
function _ceRenderTop(rows) {
  var container = document.getElementById('ce-top-errors');
  if (!container) return;

  // Group by fingerprint
  var groups = {};
  rows.forEach(function(r) {
    var fp = r.fingerprint || 'unknown';
    if (!groups[fp]) groups[fp] = { label: r.label, message: r.message, severity: r.severity, count: 0, users: {} };
    groups[fp].count++;
    if (r.user_id) groups[fp].users[r.user_id] = true;
  });

  var sorted = Object.entries(groups).sort(function(a, b) { return b[1].count - a[1].count; }).slice(0, 20);

  if (!sorted.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:16px;">No errors in this time window.</div>';
    return;
  }

  var html = '<table class="admin-table" style="width:100%;font-size:12px;">' +
    '<thead><tr><th>Count</th><th>Users</th><th>Severity</th><th>Label</th><th>Message</th></tr></thead><tbody>';

  sorted.forEach(function(entry) {
    var g = entry[1];
    var sevColor = g.severity === 'fatal' ? '#ef4444' : g.severity === 'error' ? '#f59e0b' : 'var(--muted)';
    var userCount = Object.keys(g.users).length;
    html += '<tr>' +
      '<td style="text-align:center;font-family:var(--mono);font-weight:700;font-size:14px;color:' + sevColor + ';">' + g.count + '</td>' +
      '<td style="text-align:center;font-family:var(--mono);">' + userCount + '</td>' +
      '<td><span style="font-size:10px;padding:1px 5px;border-radius:3px;background:' + sevColor + '20;color:' + sevColor + ';font-weight:600;text-transform:uppercase;">' + _ceEsc(g.severity) + '</span></td>' +
      '<td><code style="font-size:11px;background:var(--bg-card);padding:1px 4px;border-radius:3px;">' + _ceEsc(g.label) + '</code></td>' +
      '<td style="max-width:400px;overflow:hidden;text-overflow:ellipsis;" title="' + _ceEsc(g.message) + '">' + _ceEsc(g.message).substring(0, 100) + '</td>' +
      '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

// ── Render: Error stream with stack expand ──
function _ceRenderStream(rows) {
  var container = document.getElementById('ce-stream');
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:16px;">No errors in this time window.</div>';
    return;
  }

  var html = '<table class="admin-table" style="width:100%;font-size:12px;">' +
    '<thead><tr><th>Time</th><th>Sev</th><th>Surface</th><th>Label</th><th>Message</th><th>Page</th><th>Ver</th><th>Stack</th></tr></thead><tbody>';

  rows.forEach(function(r) {
    var time = new Date(r.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    var sevColor = r.severity === 'fatal' ? '#ef4444' : r.severity === 'error' ? '#f59e0b' : '#94a3b8';
    var stackBtn = r.stack
      ? '<button class="admin-btn admin-btn-sm" style="font-size:10px;padding:1px 6px;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'">▶</button><pre style="display:none;font-size:10px;max-height:200px;overflow:auto;background:var(--bg-card);padding:8px;border-radius:4px;margin:4px 0 0;white-space:pre-wrap;word-break:break-all;">' + _ceEsc(r.stack) + '</pre>'
      : '<span style="color:var(--muted);">—</span>';

    html += '<tr>' +
      '<td style="white-space:nowrap;font-family:var(--mono);font-size:11px;">' + _ceEsc(time) + '</td>' +
      '<td><span style="font-size:10px;padding:1px 4px;border-radius:3px;background:' + sevColor + '20;color:' + sevColor + ';font-weight:600;">' + _ceEsc(r.severity).charAt(0).toUpperCase() + '</span></td>' +
      '<td style="font-size:11px;">' + _ceEsc(r.surface) + '</td>' +
      '<td><code style="font-size:11px;background:var(--bg-card);padding:1px 4px;border-radius:3px;">' + _ceEsc(r.label) + '</code></td>' +
      '<td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;" title="' + _ceEsc(r.message) + '">' + _ceEsc(r.message).substring(0, 80) + '</td>' +
      '<td style="font-size:11px;">' + _ceEsc(r.page || '—') + '</td>' +
      '<td style="font-family:var(--mono);font-size:10px;">' + _ceEsc(r.version || '—') + '</td>' +
      '<td>' + stackBtn + '</td>' +
      '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;

  // Pager
  var pager = document.getElementById('ce-pager');
  if (pager) {
    pager.innerHTML =
      '<button class="admin-btn admin-btn-sm" style="font-size:11px;padding:2px 8px;"' +
      (_ceCurrentPage === 0 ? ' disabled' : '') +
      ' onclick="_cePrevPage()">← Prev</button>' +
      '<span>Page ' + (_ceCurrentPage + 1) + '</span>' +
      '<button class="admin-btn admin-btn-sm" style="font-size:11px;padding:2px 8px;"' +
      (rows.length < _CE_PAGE_SIZE ? ' disabled' : '') +
      ' onclick="_ceNextPage()">Next →</button>';
  }
}

// ── Render: Hourly rate chart ──
function _ceRenderRateChart(rateData) {
  var container = document.getElementById('ce-rate-chart');
  if (!container) return;

  if (!rateData || rateData.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:40px;">No data for chart.</div>';
    return;
  }

  // Render chart if ECharts is available
  if (typeof echarts !== 'undefined') {
    var chart = echarts.init(container, null, { renderer: 'canvas' });
    var labels = rateData.map(function(r) {
      var d = new Date(r.hour);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    });
    var values = rateData.map(function(r) { return r.error_count || 0; });

    chart.setOption({
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontSize: 12 } },
      grid: { top: 20, right: 20, bottom: 30, left: 50 },
      xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10, color: '#94a3b8', interval: Math.max(0, Math.floor(labels.length / 8)) } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 10, color: '#94a3b8' }, splitLine: { lineStyle: { color: 'hsl(228,16%,93%)' } } },
      series: [{
        type: 'bar',
        data: values,
        itemStyle: {
          color: function(params) { return params.data > 50 ? '#ef4444' : params.data > 10 ? '#f59e0b' : '#6366f1'; },
          borderRadius: [3, 3, 0, 0]
        }
      }]
    });

    window.addEventListener('resize', function() { chart.resize(); });
  } else {
    // Fallback: simple text table
    var html = '<div style="display:flex;gap:2px;align-items:flex-end;height:160px;">';
    var maxVal = Math.max.apply(null, rateData.map(function(r) { return r.error_count || 0; })) || 1;
    rateData.slice(-48).forEach(function(r) {
      var pct = Math.max(2, Math.round((r.error_count || 0) / maxVal * 140));
      var color = r.error_count > 50 ? '#ef4444' : r.error_count > 10 ? '#f59e0b' : '#6366f1';
      html += '<div style="flex:1;height:' + pct + 'px;background:' + color + ';border-radius:2px 2px 0 0;" title="' + r.hour + ': ' + r.error_count + ' errors"></div>';
    });
    html += '</div>';
    container.innerHTML = html;
  }
}

// ── Pagination ──
function _ceNextPage() {
  _ceCurrentPage++;
  _ceRefresh();
}

function _cePrevPage() {
  if (_ceCurrentPage > 0) _ceCurrentPage--;
  _ceRefresh();
}

// ── Helpers ──
function _ceText(sel, val) {
  var el = document.querySelector(sel);
  if (el) el.textContent = val;
}

function _ceEsc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _cleanupClientErrorsPanel() {
  if (_ceRefreshTimer) {
    clearInterval(_ceRefreshTimer);
    _ceRefreshTimer = null;
  }
}

window.loadClientErrorsPanel = loadClientErrorsPanel;
window._cleanupClientErrorsPanel = _cleanupClientErrorsPanel;
window._ceNextPage = _ceNextPage;
window._cePrevPage = _cePrevPage;

// Register exports
(function() {
  ['_cleanupClientErrorsPanel','loadClientErrorsPanel','_ceNextPage','_cePrevPage'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'admin-client-errors', registered: Date.now() };
    }
  });
})();
