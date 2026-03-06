/* ───────────────────────────────────────────────────────────
   admin-feed-health.js — Feed Health + Refresh Log
   Admin IA v2 · Session 5 (v6.88)
   ─────────────────────────────────────────────────────────── */

var _feedHealthState = { loaded: false, data: null };

async function refreshFeedHealthPanel() {
  var container = document.getElementById('admin-panel-feed-health');
  if (!container) return;
  if (_feedHealthState.loaded && _feedHealthState.data) {
    renderFeedHealthPanel(container, _feedHealthState.data);
    return;
  }
  container.innerHTML = '<div class="admin-loading">Loading feed health…</div>';
  try {
    var { data, error } = await sb.rpc('get_admin_feed_health');
    if (error) throw error;
    _feedHealthState.data = data;
    _feedHealthState.loaded = true;
    renderFeedHealthPanel(container, data);
  } catch (e) {
    container.innerHTML = '<div class="admin-error">Failed to load feed health: ' + _escHtml(e.message || String(e)) + '</div>';
  }
}

var _feedHealthChartInst = null;

function renderFeedHealthPanel(container, d) {
  var totals = d.totals_today || {};
  var today = d.today || [];
  var rs = d.refresh_summary || {};
  var rl = d.refresh_log || [];

  // ── Stat cards ──
  var lastRun = rs.last_run ? _timeAgo(rs.last_run) : '—';
  var statCards = [
    { label: 'Total Boards',    value: (totals.total_boards || 0).toLocaleString(),  sub: 'indexed today' },
    { label: 'Active Boards',   value: (totals.active_boards || 0).toLocaleString(), sub: 'have open jobs' },
    { label: 'Total Jobs',      value: (totals.total_jobs || 0).toLocaleString(),     sub: 'live today' },
    { label: 'Refresh Runs',    value: (rs.total_runs || 0).toLocaleString(),         sub: 'all time' },
    { label: 'Last Refresh',    value: lastRun,                                       sub: rs.last_run ? new Date(rs.last_run).toLocaleDateString() : '—', accent: !rs.last_run || (Date.now() - new Date(rs.last_run)) > 24*60*60*1000 },
    { label: 'Avg Duration',    value: rs.avg_duration_sec != null ? rs.avg_duration_sec + 's' : '—', sub: 'per run' },
  ];
  var statRow = '<div class="admin-stat-row">' + statCards.map(function(c) {
    return '<div class="admin-stat-card' + (c.accent ? ' admin-stat-card--alert' : '') + '">'
      + '<div class="asc-label">' + c.label + '</div>'
      + '<div class="asc-value">' + c.value + '</div>'
      + '<div class="asc-sub">' + c.sub + '</div>'
      + '</div>';
  }).join('') + '</div>';

  // ── Platform breakdown table ──
  var platformColors = { greenhouse: '#22c55e', lever: '#3b82f6', ashby: '#a855f7', workable: '#f59e0b', recruitee: '#ec4899', usajobs: '#14b8a6' };
  var platformRows = today.map(function(p) {
    var color = platformColors[p.platform] || 'var(--accent)';
    var dot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';margin-right:6px"></span>';
    return '<tr>'
      + '<td>' + dot + _escHtml(p.platform) + '</td>'
      + '<td>' + (p.total_boards || 0).toLocaleString() + '</td>'
      + '<td>' + (p.active_boards || 0).toLocaleString() + '</td>'
      + '<td>' + (p.active_pct != null ? p.active_pct + '%' : '—') + '</td>'
      + '<td>' + (p.total_jobs || 0).toLocaleString() + '</td>'
      + '</tr>';
  }).join('');

  // ── 7-day bar chart data ──
  var history = d.history_7d || [];
  var platforms = [...new Set(history.map(function(r) { return r.platform; }))];
  var dates = [...new Set(history.map(function(r) { return r.snapshot_date; }))].sort();

  // ── Refresh log table ──
  var refreshRows = rl.slice(0, 15).map(function(r) {
    var ok = r.error_count === 0;
    var dur = r.duration_sec != null ? r.duration_sec + 's' : '—';
    return '<tr>'
      + '<td style="color:var(--text-dim);font-size:11px">' + (r.started_at ? new Date(r.started_at).toLocaleString() : '—') + '</td>'
      + '<td>' + (r.boards_total || 0).toLocaleString() + '</td>'
      + '<td>' + (r.batches_run || 0) + '</td>'
      + '<td>' + (r.jobs_upserted || 0).toLocaleString() + '</td>'
      + '<td>' + (r.jobs_closed || 0).toLocaleString() + '</td>'
      + '<td>' + dur + '</td>'
      + '<td style="color:' + (ok ? 'var(--green)' : 'var(--red,#ef4444)') + '">' + (ok ? '✓ Clean' : r.error_count + ' errors') + '</td>'
      + '</tr>';
  }).join('');

  var html = statRow;

  // Platform breakdown
  html += '<div class="admin-block" style="margin-top:20px">'
    + '<div class="admin-block-title">Platform Breakdown — Today</div>'
    + '<table class="admin-table"><thead><tr><th>Platform</th><th>Total Boards</th><th>Active</th><th>Active %</th><th>Jobs</th></tr></thead>'
    + '<tbody>' + (platformRows || '<tr><td colspan="5" style="color:var(--text-dim)">No data for today</td></tr>') + '</tbody>'
    + '</table></div>';

  // 7-day chart container
  html += '<div class="admin-block" style="margin-top:16px">'
    + '<div class="admin-block-title">Job Inventory — 7 Day Trend</div>'
    + '<div id="feed-health-chart" style="width:100%;height:280px"></div>'
    + '</div>';

  // Refresh log
  html += '<div class="admin-block" style="margin-top:16px">'
    + '<div class="admin-block-title">Refresh Log</div>'
    + '<table class="admin-table"><thead><tr><th>Started</th><th>Boards</th><th>Batches</th><th>Upserted</th><th>Closed</th><th>Duration</th><th>Status</th></tr></thead>'
    + '<tbody>' + (refreshRows || '<tr><td colspan="7" style="color:var(--text-dim)">No refresh runs recorded</td></tr>') + '</tbody>'
    + '</table></div>';

  container.innerHTML = html;

  // Render ECharts after DOM update
  if (typeof echarts !== 'undefined' && dates.length > 0) {
    setTimeout(function() {
      var el = document.getElementById('feed-health-chart');
      if (!el) return;
      if (_feedHealthChartInst) { try { _feedHealthChartInst.dispose(); } catch(e){ /* CS-016: chart cleanup — safe to ignore */ } }
      _feedHealthChartInst = echarts.init(el, 'dark');

      var series = platforms.map(function(plat) {
        var color = platformColors[plat] || '#6b7280';
        var vals = dates.map(function(dt) {
          var row = history.find(function(r) { return r.platform === plat && r.snapshot_date === dt; });
          return row ? (row.total_jobs || 0) : null;
        });
        return {
          name: plat,
          type: 'line',
          smooth: true,
          connectNulls: true,
          data: vals,
          itemStyle: { color: color },
          lineStyle: { color: color, width: 2 },
        };
      });

      _feedHealthChartInst.setOption({
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        legend: { data: platforms, textStyle: { color: '#9ca3af', fontSize: 11 }, bottom: 0 },
        grid: { top: 20, left: 60, right: 20, bottom: 40 },
        xAxis: { type: 'category', data: dates, axisLabel: { color: '#9ca3af', fontSize: 11 },
          axisLine: { lineStyle: { color: '#374151' } } },
        yAxis: { type: 'value',
          axisLabel: { color: '#9ca3af', fontSize: 11, formatter: function(v) { return v >= 1000 ? (v/1000).toFixed(0)+'K' : v; } },
          splitLine: { lineStyle: { color: '#1f2937' } } },
        series: series
      });
    }, 50);
  }
}
