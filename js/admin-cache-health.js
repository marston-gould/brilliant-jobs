/* ───────────────────────────────────────────────────────────
   admin-cache-health.js — Cache Health + MV Staleness + Alerts
   Admin IA v2 · Session 5 (v6.88)
   ─────────────────────────────────────────────────────────── */

var _cacheHealthState = { loaded: false, data: null };

async function refreshCacheHealthPanel() {
  var container = document.getElementById('admin-panel-cache-health');
  if (!container) return;
  if (_cacheHealthState.loaded && _cacheHealthState.data) {
    renderCacheHealthPanel(container, _cacheHealthState.data);
    return;
  }
  container.innerHTML = '<div class="admin-loading">Loading cache health…</div>';
  try {
    var { data, error } = await sb.rpc('get_admin_cache_health');
    if (error) throw error;
    _cacheHealthState.data = data;
    _cacheHealthState.loaded = true;
    renderCacheHealthPanel(container, data);
  } catch (e) {
    container.innerHTML = '<div class="admin-error">Failed to load cache health: ' + _escHtml(e.message || String(e)) + '</div>';
  }
}

function renderCacheHealthPanel(container, d) {
  var alertsSummary = d.alerts_summary || {};
  var alerts = d.monitoring_alerts || [];
  var mvRows = d.mv_row_counts || [];
  var cache = d.major_job_cache || [];
  var cacheAt = d.cache_computed_at;

  // ── Stat cards ──
  var statCards = [
    { label: 'Open Alerts',   value: (alertsSummary.open || 0).toString(),     sub: 'unresolved',    accent: (alertsSummary.open || 0) > 0 },
    { label: 'Critical',      value: (alertsSummary.critical || 0).toString(), sub: 'severity',      accent: (alertsSummary.critical || 0) > 0 },
    { label: 'Warnings',      value: (alertsSummary.warning || 0).toString(),  sub: 'severity' },
    { label: 'Total Alerts',  value: (alertsSummary.total || 0).toString(),    sub: 'all time' },
    { label: 'MVs Tracked',   value: mvRows.length.toString(),                 sub: 'materialized views' },
    { label: 'Cache Age',     value: cacheAt ? _timeAgo(cacheAt) : '—',        sub: 'major_job_cache', accent: cacheAt && (Date.now() - new Date(cacheAt)) > 7*24*60*60*1000 },
  ];
  var statRow = '<div class="admin-stat-row">' + statCards.map(function(c) {
    return '<div class="admin-stat-card' + (c.accent ? ' admin-stat-card--alert' : '') + '">'
      + '<div class="asc-label">' + c.label + '</div>'
      + '<div class="asc-value">' + c.value + '</div>'
      + '<div class="asc-sub">' + c.sub + '</div>'
      + '</div>';
  }).join('') + '</div>';

  // ── Monitoring alerts table ──
  var severityColor = { critical: 'var(--red,#ef4444)', warning: 'var(--amber,#f59e0b)', info: 'var(--accent)' };
  var alertRows = alerts.map(function(a) {
    var sev = a.severity || 'info';
    var sc = severityColor[sev] || 'var(--text)';
    var resolvedBadge = a.resolved
      ? '<span style="color:var(--green);font-size:11px">✓ resolved</span>'
      : '<span style="color:' + sc + ';font-size:11px">● open</span>';
    return '<tr>'
      + '<td style="color:' + sc + ';font-weight:600">' + sev.toUpperCase() + '</td>'
      + '<td>' + _escHtml(a.check_name || '—') + '</td>'
      + '<td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _escHtml(a.message || '—') + '</td>'
      + '<td>' + resolvedBadge + '</td>'
      + '<td style="color:var(--text-dim);font-size:11px">' + (a.created_at ? _timeAgo(a.created_at) : '—') + '</td>'
      + '</tr>';
  }).join('');

  // ── MV row counts table ──
  var mvTableRows = mvRows.map(function(mv) {
    var stale = !mv.last_autovacuum && !mv.last_vacuum;
    var freshness = mv.last_autovacuum ? _timeAgo(mv.last_autovacuum)
                  : mv.last_vacuum ? _timeAgo(mv.last_vacuum)
                  : '<span style="color:var(--text-faint)">—</span>';
    return '<tr>'
      + '<td>' + _escHtml(mv.name || '—') + '</td>'
      + '<td>' + (mv.rows || 0).toLocaleString() + '</td>'
      + '<td>' + freshness + '</td>'
      + '</tr>';
  }).join('');

  // ── Major job cache table ──
  var cacheRows = cache.map(function(c) {
    return '<tr>'
      + '<td>' + _escHtml(c.major_category || '—') + '</td>'
      + '<td>' + (c.open_jobs || 0).toLocaleString() + '</td>'
      + '<td>' + (c.median_salary ? '$' + parseInt(c.median_salary).toLocaleString() : '—') + '</td>'
      + '<td>' + (c.remote_jobs || 0).toLocaleString() + '</td>'
      + '<td>' + (c.remote_pct != null ? c.remote_pct + '%' : '—') + '</td>'
      + '</tr>';
  }).join('');

  var html = statRow;

  // Monitoring alerts
  html += '<div class="admin-block" style="margin-top:20px">'
    + '<div class="admin-block-title">Monitoring Alerts</div>'
    + '<table class="admin-table"><thead><tr><th>Severity</th><th>Check</th><th>Message</th><th>Status</th><th>Age</th></tr></thead>'
    + '<tbody>' + (alertRows || '<tr><td colspan="5" style="color:var(--green)">✓ No alerts</td></tr>') + '</tbody>'
    + '</table></div>';

  // MV row counts side by side with major_job_cache
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">';

  html += '<div class="admin-block"><div class="admin-block-title">Materialized View Row Counts</div>'
    + '<table class="admin-table"><thead><tr><th>View</th><th>Rows</th><th>Last Vacuum</th></tr></thead>'
    + '<tbody>' + (mvTableRows || '<tr><td colspan="3" style="color:var(--text-dim)">No MV data</td></tr>') + '</tbody>'
    + '</table></div>';

  html += '<div class="admin-block"><div class="admin-block-title">Major Job Cache'
    + (cacheAt ? '<span style="font-size:11px;color:var(--text-dim);font-weight:400;margin-left:8px">computed ' + _timeAgo(cacheAt) + '</span>' : '')
    + '</div>'
    + '<table class="admin-table"><thead><tr><th>Category</th><th>Jobs</th><th>Median Salary</th><th>Remote</th><th>Rem%</th></tr></thead>'
    + '<tbody>' + (cacheRows || '<tr><td colspan="5" style="color:var(--text-dim)">No cache data</td></tr>') + '</tbody>'
    + '</table></div>';

  html += '</div>';

  container.innerHTML = html;
}

async function resolveMonitoringAlert(id) {
  try {
    var { error } = await sb.from('monitoring_alerts')
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    _cacheHealthState.loaded = false;
    await refreshCacheHealthPanel();
    if (typeof toastSuccess === 'function') toastSuccess('Alert resolved');
  } catch (e) {
    if (typeof toastError === 'function') toastError('Resolve failed: ' + (e.message || e));
  }
}
