// @ts-nocheck
/* ───────────────────────────────────────────────────────────
   admin-jobs.js — Jobs Sub-page (Admin IA v2)
   v6.87 — S4: click-to-expand job detail panels + daily volume ECharts line chart
   ─────────────────────────────────────────────────────────── */

var _jobListState = { search: '', platform: '', status: 'open', sort: 'newest', offset: 0, limit: 50 };

function loadAdminJobs() {
  var panel = document.getElementById('admin-panel-jobs');
  if (!panel) return;

  panel.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-faint);font-size:13px;">Loading job data…</div>';

  sb.rpc('get_admin_jobs').then(function(res) {
    if (res.error) {
      panel.innerHTML = '<div style="color:var(--red);padding:20px;">Error: ' + res.error.message + '</div>';
      return;
    }
    renderJobsPage(panel, res.data);
  }).catch(function(e) {
    panel.innerHTML = '<div style="color:var(--red);padding:20px;">Failed to load: ' + e.message + '</div>';
  });
}

function renderJobsPage(panel, d) {
  var html = '';

  // ── Stat Cards ──
  var enrichPct = d.total_jobs ? Math.round((d.enriched_jd / d.total_jobs) * 100) : 0;
  var salaryPct = d.total_jobs ? Math.round((d.with_salary / d.total_jobs) * 100) : 0;
  var remotePct = d.open_jobs ? Math.round((d.remote_jobs / d.open_jobs) * 100) : 0;
  var skillsPct = d.total_jobs ? Math.round((d.with_skills / d.total_jobs) * 100) : 0;

  html += '<div class="admin-stat-row">';
  html += _adminStatCard('Total Jobs', fmtAdminNum(d.total_jobs), '');
  html += _adminStatCard('Open', fmtAdminNum(d.open_jobs), '');
  html += _adminStatCard('Closed', fmtAdminNum(d.closed_jobs), '');
  html += _adminStatCard('JD Enriched', fmtAdminNum(d.enriched_jd), enrichPct + '%');
  html += _adminStatCard('With Salary', fmtAdminNum(d.with_salary), salaryPct + '%');
  html += _adminStatCard('Remote', fmtAdminNum(d.remote_jobs), remotePct + '%');
  html += _adminStatCard('With Skills', fmtAdminNum(d.with_skills), skillsPct + '%');
  html += _adminStatCard('AI Scored', fmtAdminNum(d.ai_scored), '');
  html += '</div>';

  // ── Platform Breakdown ──
  html += '<div class="admin-block" style="margin-top:16px;">';
  html += '<div class="admin-block-title">Jobs by Platform</div>';
  html += '<div style="overflow-x:auto;"><table class="admin-table" style="width:100%"><thead><tr>';
  html += '<th>Platform</th><th style="text-align:right">Total</th><th style="text-align:right">Open</th><th style="text-align:right">Enriched</th><th style="text-align:right">With Salary</th><th style="text-align:right">Remote</th>';
  html += '</tr></thead><tbody>';

  var platforms = [];
  (d.by_platform || []).forEach(function(p) {
    platforms.push(p.ats_source);
    var ePct = p.total ? Math.round((p.enriched / p.total) * 100) : 0;
    html += '<tr>';
    html += '<td style="font-weight:600;text-transform:capitalize;">' + _escHtml(p.ats_source) + '</td>';
    html += '<td style="text-align:right">' + fmtAdminNum(p.total) + '</td>';
    html += '<td style="text-align:right">' + fmtAdminNum(p.open) + '</td>';
    html += '<td style="text-align:right">' + fmtAdminNum(p.enriched) + ' <span style="color:var(--text-faint);font-size:11px;">(' + ePct + '%)</span></td>';
    html += '<td style="text-align:right">' + fmtAdminNum(p.with_salary) + '</td>';
    html += '<td style="text-align:right">' + fmtAdminNum(p.remote) + '</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div></div>';

  // ── Daily Volume ECharts Line Chart ──
  html += '<div class="admin-block" style="margin-top:16px;">';
  html += '<div class="admin-block-title">New Jobs — Last 7 Days</div>';
  html += '<div id="admin-jobs-daily-chart" style="width:100%;height:220px;"></div>';
  html += '</div>';

  // ── Age Distribution ──
  html += '<div class="admin-block" style="margin-top:16px;">';
  html += '<div class="admin-block-title">Open Job Age Distribution</div>';
  html += '<div style="display:flex;gap:12px;flex-wrap:wrap;padding:8px 0;">';

  (d.age_distribution || []).forEach(function(b) {
    var pct = d.open_jobs ? Math.round((b.cnt / d.open_jobs) * 100) : 0;
    html += '<div class="admin-age-bucket">';
    html += '<div class="admin-age-bar" style="height:' + Math.max(4, pct * 2) + 'px;"></div>';
    html += '<div class="admin-age-count">' + fmtAdminNum(b.cnt) + '</div>';
    html += '<div class="admin-age-label">' + b.age_bucket + '</div>';
    html += '<div class="admin-age-pct">' + pct + '%</div>';
    html += '</div>';
  });

  html += '</div></div>';

  // ── Action Bar + Paginated Job List ──
  html += '<div class="admin-block" style="margin-top:16px;">';
  html += '<div class="admin-block-title">All Jobs <span style="font-size:11px;font-weight:400;color:var(--text-faint);">— click row to expand</span></div>';

  html += _adminActionBar({
    id: 'job-list',
    placeholder: 'Search by title or company…',
    platforms: platforms,
    statusOptions: [
      { value: 'open', label: 'Open', selected: true },
      { value: 'closed', label: 'Closed' },
      { value: '', label: 'All Status' }
    ],
    sorts: [
      { value: 'newest', label: 'Newest First' },
      { value: 'oldest', label: 'Oldest First' },
      { value: 'title_asc', label: 'Title A–Z' },
      { value: 'title_desc', label: 'Title Z–A' },
      { value: 'company_asc', label: 'Company A–Z' },
      { value: 'company_desc', label: 'Company Z–A' }
    ],
    defaultSort: 'newest'
  });

  html += '<div id="job-list-table">Loading…</div>';
  html += '</div>';

  panel.innerHTML = html;

  // Render ECharts daily line chart
  _renderJobsDailyChart(d.daily_new_7d || []);

  _wireJobListEvents();
  _fetchJobList();
}

function _renderJobsDailyChart(dailyData) {
  if (typeof echarts === 'undefined') return;
  var el = document.getElementById('admin-jobs-daily-chart');
  if (!el) return;
  var chart = echarts.init(el, null, { renderer: 'svg' });

  var dates = dailyData.map(function(r) { return r.day; });
  var counts = dailyData.map(function(r) { return r.cnt; });

  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'var(--bg-card)',
      borderColor: 'var(--border)',
      textStyle: { color: 'var(--text)', fontSize: 12 },
      formatter: function(params) {
        return params[0].name + '<br/><b>' + params[0].value.toLocaleString() + '</b> new jobs';
      }
    },
    grid: { top: 16, right: 16, bottom: 40, left: 60 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { lineStyle: { color: 'var(--border)' } },
      axisTick: { show: false },
      axisLabel: { color: 'var(--text-faint)', fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'var(--border)', type: 'dashed' } },
      axisLabel: { color: 'var(--text-faint)', fontSize: 11, formatter: function(v) { return v >= 1000 ? Math.round(v/1000) + 'K' : v; } }
    },
    series: [{
      type: 'line',
      data: counts,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { color: 'var(--green)', width: 2 },
      itemStyle: { color: 'var(--green)' },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: 'rgba(34,197,94,0.25)' },
          { offset: 1, color: 'rgba(34,197,94,0.02)' }
        ]
      }}
    }]
  });

  window.addEventListener('resize', function() { chart.resize(); });
}

function _wireJobListEvents() {
  var searchEl = document.getElementById('job-list-search');
  var platEl = document.getElementById('job-list-platform');
  var statusEl = document.getElementById('job-list-status');
  var sortEl = document.getElementById('job-list-sort');
  var debounce = null;

  if (searchEl) searchEl.addEventListener('input', function() {
    clearTimeout(debounce);
    debounce = setTimeout(function() {
      _jobListState.search = searchEl.value.trim();
      _jobListState.offset = 0;
      _fetchJobList();
    }, 300);
  });

  if (platEl) platEl.addEventListener('change', function() {
    _jobListState.platform = platEl.value;
    _jobListState.offset = 0;
    _fetchJobList();
  });

  if (statusEl) statusEl.addEventListener('change', function() {
    _jobListState.status = statusEl.value;
    _jobListState.offset = 0;
    _fetchJobList();
  });

  if (sortEl) sortEl.addEventListener('change', function() {
    _jobListState.sort = sortEl.value;
    _jobListState.offset = 0;
    _fetchJobList();
  });
}

function _fetchJobList() {
  var target = document.getElementById('job-list-table');
  if (!target) return;
  target.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-faint);font-size:13px;">Loading…</div>';

  var params = {
    p_search: _jobListState.search || null,
    p_platform: _jobListState.platform || null,
    p_status: _jobListState.status || null,
    p_sort: _jobListState.sort,
    p_offset: _jobListState.offset,
    p_limit: _jobListState.limit
  };

  sb.rpc('get_admin_jobs_list', params).then(function(res) {
    if (res.error) {
      target.innerHTML = '<div style="color:var(--red);padding:12px;">Error: ' + res.error.message + '</div>';
      return;
    }
    _renderJobTable(target, res.data);
  }).catch(function(e) {
    target.innerHTML = '<div style="color:var(--red);padding:12px;">Failed: ' + e.message + '</div>';
  });
}

function _renderJobTable(target, data) {
  var columns = [
    { key: 'title', label: 'Title', render: function(r) { return '<span style="font-weight:500;">' + _escHtml(r.title || '—') + '</span>'; } },
    { key: 'company_slug', label: 'Company', render: function(r) { return '<span style="font-family:var(--font-mono);font-size:12px;">' + _escHtml(r.company_slug) + '</span>'; } },
    { key: 'ats_source', label: 'Platform', render: function(r) { return '<span style="text-transform:capitalize;font-size:12px;">' + _escHtml(r.ats_source) + '</span>'; } },
    { key: 'location', label: 'Location', render: function(r) {
      if (r.is_remote) return '<span style="color:var(--green);font-size:12px;">Remote</span>';
      return '<span style="font-size:12px;">' + _escHtml(_fmtLocation(r.loc_city, r.loc_state, r.loc_country)) + '</span>';
    }},
    { key: 'salary', label: 'Salary', align: 'right', render: function(r) {
      return '<span style="font-size:12px;">' + _fmtSalary(r.salary_min, r.salary_max, r.salary_currency) + '</span>';
    }},
    { key: 'ai_seniority_level', label: 'Level', render: function(r) {
      return '<span style="font-size:12px;text-transform:capitalize;">' + _escHtml(r.ai_seniority_level || '—') + '</span>';
    }},
    { key: 'first_seen_at', label: 'Seen', render: function(r) { return '<span style="font-size:12px;color:var(--text-faint);">' + _timeAgo(r.first_seen_at) + '</span>'; } }
  ];

  target.innerHTML = _adminPagedTable({
    id: 'job-paged',
    columns: columns,
    rows: data.rows,
    total: data.total,
    offset: data.offset,
    limit: data.limit,
    expandable: true
  });

  // Wire pagination
  var prev = document.getElementById('job-paged-prev');
  var next = document.getElementById('job-paged-next');
  if (prev) prev.addEventListener('click', function() {
    _jobListState.offset = Math.max(0, _jobListState.offset - _jobListState.limit);
    _fetchJobList();
  });
  if (next) next.addEventListener('click', function() {
    _jobListState.offset += _jobListState.limit;
    _fetchJobList();
  });

  // Wire expand rows
  _wireExpandableRows({
    tableId: 'job-paged',
    rows: data.rows,
    loadDetail: function(row, panelEl) {
      _loadJobDetailPanel(row, panelEl);
    }
  });
}

function _loadJobDetailPanel(row, panelEl) {
  panelEl.innerHTML = '<span style="color:var(--text-faint);font-size:12px;">Loading detail…</span>';

  sb.rpc('get_admin_job_detail', { p_id: row.greenhouse_id, p_source: row.ats_source }).then(function(res) {
    if (res.error || !res.data) {
      panelEl.innerHTML = '<span style="color:var(--red);font-size:12px;">Error loading detail</span>';
      return;
    }
    var d = res.data;

    var applyLink = d.apply_url ? '<a href="' + _escHtml(d.apply_url) + '" target="_blank" style="color:var(--accent);text-decoration:none;">Apply Link</a>' : '—';
    var jobLink = d.url ? '<a href="' + _escHtml(d.url) + '" target="_blank" style="color:var(--accent);text-decoration:none;">Job Posting</a>' : '—';

    var skills = [];
    if (d.jd_skills && d.jd_skills.length) skills = d.jd_skills;
    else if (d.extracted_skills && d.extracted_skills.length) skills = d.extracted_skills;
    var skillsHtml = skills.length
      ? skills.slice(0, 12).map(function(s) {
          return '<span style="display:inline-block;background:var(--bg-main);border:1px solid var(--border);border-radius:4px;padding:1px 6px;font-size:11px;margin:2px;">' + _escHtml(s) + '</span>';
        }).join(' ')
      : '—';

    var contentPreview = d.content_preview
      ? '<div style="max-height:120px;overflow:hidden;font-size:12px;color:var(--text-dim);line-height:1.6;margin-top:8px;-webkit-mask-image:linear-gradient(to bottom, black 60%, transparent 100%);">' + _escHtml(d.content_preview) + '</div>'
      : '';

    var detailHtml = _adminDetailPanel([
      {
        title: 'Job Info',
        rows: [
          { label: 'ID', value: d.greenhouse_id, mono: true },
          { label: 'Platform', value: d.ats_source },
          { label: 'Status', value: d.status ? d.status.charAt(0).toUpperCase() + d.status.slice(1) : '—' },
          { label: 'Department', value: d.department || '—' },
          { label: 'Category', value: d.job_cat || '—' },
          { label: 'Employment', value: d.employment_type || '—' },
          { label: 'Apply', value: applyLink },
          { label: 'Posting', value: jobLink }
        ]
      },
      {
        title: 'Enrichment',
        rows: [
          { label: 'JD Enriched', value: d.jd_enriched ? '✓ Yes' : '✗ No' },
          { label: 'Enriched At', value: _timeAgo(d.jd_extracted_at) },
          { label: 'Priority', value: d.enrichment_priority != null ? String(d.enrichment_priority) : '—' },
          { label: 'Seniority', value: (d.jd_seniority || d.extracted_seniority || '—') },
          { label: 'Education', value: d.jd_education || '—' },
          { label: 'Experience', value: (d.jd_years_min || d.jd_years_max) ? (d.jd_years_min || '?') + '–' + (d.jd_years_max || '?') + ' yrs' : '—' },
          { label: 'AI Score', value: d.ai_content_score != null ? d.ai_content_score.toFixed(2) : '—' },
          { label: 'AI Label', value: d.ai_label || '—' },
          { label: 'AI Scored', value: _timeAgo(d.ai_scored_at) }
        ]
      },
      {
        title: 'Salary',
        rows: [
          { label: 'Range', value: _fmtSalary(d.salary_min, d.salary_max, d.salary_currency) },
          { label: 'Rate', value: d.salary_rate || '—' },
          { label: 'Currency', value: d.salary_currency || '—' },
          { label: 'Raw', value: d.salary_raw || '—' }
        ]
      }
    ]);

    // Skills row + JD preview appended below panels
    var extra = '';
    extra += '<div style="margin-top:12px;">';
    extra += '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-faint);margin-bottom:6px;">Skills</div>';
    extra += skillsHtml;
    extra += '</div>';

    if (contentPreview) {
      extra += '<div style="margin-top:12px;">';
      extra += '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-faint);margin-bottom:4px;">JD Preview</div>';
      extra += contentPreview;
      extra += '</div>';
    }

    panelEl.innerHTML = detailHtml + extra;
  }).catch(function(e) {
    panelEl.innerHTML = '<span style="color:var(--red);font-size:12px;">Failed: ' + e.message + '</span>';
  });
}
