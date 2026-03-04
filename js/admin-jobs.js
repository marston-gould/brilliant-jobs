/* ───────────────────────────────────────────────────────────
   admin-jobs.js — Jobs Sub-page (Admin IA v2 S3)
   v6.86 — Stats + action bar + paginated job table
   Helpers moved to admin-blocks.js
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

  // ── Daily New Jobs (7d) ──
  html += '<div class="admin-block" style="margin-top:16px;">';
  html += '<div class="admin-block-title">New Jobs (Last 7 Days)</div>';
  html += '<div style="overflow-x:auto;"><table class="admin-table" style="width:100%"><thead><tr>';
  html += '<th>Date</th><th style="text-align:right">New Jobs</th><th>Bar</th>';
  html += '</tr></thead><tbody>';

  var maxDaily = 0;
  (d.daily_new_7d || []).forEach(function(row) { if (row.cnt > maxDaily) maxDaily = row.cnt; });

  (d.daily_new_7d || []).forEach(function(row) {
    var barW = maxDaily ? Math.round((row.cnt / maxDaily) * 100) : 0;
    html += '<tr>';
    html += '<td>' + row.day + '</td>';
    html += '<td style="text-align:right">' + fmtAdminNum(row.cnt) + '</td>';
    html += '<td style="width:50%;"><div style="background:var(--green);height:6px;border-radius:3px;width:' + barW + '%;opacity:0.7;"></div></td>';
    html += '</tr>';
  });

  html += '</tbody></table></div></div>';

  // ── Action Bar + Paginated Job List ──
  html += '<div class="admin-block" style="margin-top:16px;">';
  html += '<div class="admin-block-title">All Jobs</div>';

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

  // Wire events
  _wireJobListEvents();
  _fetchJobList();
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
    limit: data.limit
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
}
