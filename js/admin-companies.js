/* ───────────────────────────────────────────────────────────
   admin-companies.js — Companies Sub-page (Admin IA v2)
   v6.87 — S4: click-to-expand company detail panels
   ─────────────────────────────────────────────────────────── */

var _companyListState = { search: '', platform: '', sort: 'boards_desc', offset: 0, limit: 50 };

function loadAdminCompanies() {
  var panel = document.getElementById('admin-panel-companies');
  if (!panel) return;

  panel.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-faint);font-size:13px;">Loading company data…</div>';

  sb.rpc('get_admin_companies').then(function(res) {
    if (res.error) {
      panel.innerHTML = '<div style="color:var(--red);padding:20px;">Error: ' + res.error.message + '</div>';
      return;
    }
    var d = res.data;
    renderCompaniesPage(panel, d);
  }).catch(function(e) {
    panel.innerHTML = '<div style="color:var(--red);padding:20px;">Failed to load: ' + e.message + '</div>';
  });
}

function renderCompaniesPage(panel, d) {
  var html = '';

  // ── Stat Cards ──
  var enrichPct = d.total_boards ? Math.round((d.enriched_boards / d.total_boards) * 100) : 0;
  var industryPct = d.total_boards ? Math.round((d.with_industry / d.total_boards) * 100) : 0;
  var activePct = d.total_boards ? Math.round((d.active_boards / d.total_boards) * 100) : 0;

  html += '<div class="admin-stat-row">';
  html += _adminStatCard('Total Boards', fmtAdminNum(d.total_boards), '');
  html += _adminStatCard('Active', fmtAdminNum(d.active_boards), activePct + '%');
  html += _adminStatCard('Inactive', fmtAdminNum(d.inactive_boards), '');
  html += _adminStatCard('PDL Enriched', fmtAdminNum(d.enriched_boards), enrichPct + '%');
  html += _adminStatCard('With Industry', fmtAdminNum(d.with_industry), industryPct + '%');
  html += _adminStatCard('Staffing Agencies', fmtAdminNum(d.staffing_agencies), '');
  html += '</div>';

  // ── Platform Breakdown Table ──
  html += '<div class="admin-block" style="margin-top:16px;">';
  html += '<div class="admin-block-title">Boards by Platform</div>';
  html += '<div style="overflow-x:auto;"><table class="admin-table" style="width:100%"><thead><tr>';
  html += '<th>Platform</th><th style="text-align:right">Boards</th><th style="text-align:right">Active</th><th style="text-align:right">Jobs</th><th style="text-align:right">Enriched</th><th style="text-align:right">Industry</th><th style="text-align:right">Staffing</th>';
  html += '</tr></thead><tbody>';

  (d.by_platform || []).forEach(function(p) {
    html += '<tr>';
    html += '<td style="font-weight:600;text-transform:capitalize;">' + _escHtml(p.source) + '</td>';
    html += '<td style="text-align:right">' + fmtAdminNum(p.boards) + '</td>';
    html += '<td style="text-align:right">' + fmtAdminNum(p.active) + '</td>';
    html += '<td style="text-align:right">' + fmtAdminNum(p.jobs) + '</td>';
    html += '<td style="text-align:right">' + fmtAdminNum(p.enriched) + '</td>';
    html += '<td style="text-align:right">' + fmtAdminNum(p.with_industry) + '</td>';
    html += '<td style="text-align:right">' + fmtAdminNum(p.staffing) + '</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div></div>';

  // ── Top Industries ──
  html += '<div class="admin-block" style="margin-top:16px;">';
  html += '<div class="admin-block-title">Top Industries</div>';
  html += '<div style="overflow-x:auto;"><table class="admin-table" style="width:100%"><thead><tr>';
  html += '<th>Industry</th><th style="text-align:right">Boards</th><th>Share</th>';
  html += '</tr></thead><tbody>';

  var maxInd = 0;
  (d.top_industries || []).forEach(function(ind) { if (ind.cnt > maxInd) maxInd = ind.cnt; });

  (d.top_industries || []).forEach(function(ind) {
    var pct = d.with_industry ? Math.round((ind.cnt / d.with_industry) * 100) : 0;
    var barW = maxInd ? Math.round((ind.cnt / maxInd) * 100) : 0;
    html += '<tr>';
    html += '<td style="text-transform:capitalize;">' + _escHtml(ind.industry) + '</td>';
    html += '<td style="text-align:right">' + fmtAdminNum(ind.cnt) + '</td>';
    html += '<td style="width:40%;"><div style="background:var(--accent);height:6px;border-radius:3px;width:' + barW + '%;opacity:0.7;"></div><span style="font-size:11px;color:var(--text-faint);">' + pct + '%</span></td>';
    html += '</tr>';
  });

  html += '</tbody></table></div></div>';

  // ── Action Bar + Paginated Company List ──
  html += '<div class="admin-block" style="margin-top:16px;">';
  html += '<div class="admin-block-title">All Companies <span style="font-size:11px;font-weight:400;color:var(--text-faint);">— click row to expand</span></div>';

  var platforms = [];
  (d.by_platform || []).forEach(function(p) { platforms.push(p.source); });

  html += _adminActionBar({
    id: 'co-list',
    placeholder: 'Search by slug or name…',
    platforms: platforms,
    sorts: [
      { value: 'boards_desc', label: 'Newest First' },
      { value: 'boards_asc', label: 'Oldest First' },
      { value: 'name_asc', label: 'Name A–Z' },
      { value: 'name_desc', label: 'Name Z–A' }
    ],
    defaultSort: 'boards_desc'
  });

  html += '<div id="co-list-table">Loading…</div>';
  html += '</div>';

  // ── Recently Discovered ──
  html += '<div class="admin-block" style="margin-top:16px;">';
  html += '<div class="admin-block-title">Recently Discovered</div>';
  html += '<div style="overflow-x:auto;"><table class="admin-table" style="width:100%"><thead><tr>';
  html += '<th>Slug</th><th>Name</th><th>Platform</th><th style="text-align:right">Jobs</th><th>Discovered</th>';
  html += '</tr></thead><tbody>';

  (d.recently_discovered || []).forEach(function(c) {
    html += '<tr>';
    html += '<td style="font-family:var(--font-mono);font-size:12px;">' + _escHtml(c.slug) + '</td>';
    html += '<td>' + _escHtml(c.name || '—') + '</td>';
    html += '<td style="text-transform:capitalize;">' + _escHtml(c.source) + '</td>';
    html += '<td style="text-align:right">' + (c.job_count || 0) + '</td>';
    html += '<td style="color:var(--text-faint);font-size:12px;">' + _timeAgo(c.created_at) + '</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div></div>';

  panel.innerHTML = html;

  _wireCompanyListEvents();
  _fetchCompanyList();
}

function _wireCompanyListEvents() {
  var searchEl = document.getElementById('co-list-search');
  var platEl = document.getElementById('co-list-platform');
  var sortEl = document.getElementById('co-list-sort');
  var debounce = null;

  if (searchEl) searchEl.addEventListener('input', function() {
    clearTimeout(debounce);
    debounce = setTimeout(function() {
      _companyListState.search = searchEl.value.trim();
      _companyListState.offset = 0;
      _fetchCompanyList();
    }, 300);
  });

  if (platEl) platEl.addEventListener('change', function() {
    _companyListState.platform = platEl.value;
    _companyListState.offset = 0;
    _fetchCompanyList();
  });

  if (sortEl) sortEl.addEventListener('change', function() {
    _companyListState.sort = sortEl.value;
    _companyListState.offset = 0;
    _fetchCompanyList();
  });
}

function _fetchCompanyList() {
  var target = document.getElementById('co-list-table');
  if (!target) return;
  target.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-faint);font-size:13px;">Loading…</div>';

  var params = {
    p_search: _companyListState.search || null,
    p_platform: _companyListState.platform || null,
    p_sort: _companyListState.sort,
    p_offset: _companyListState.offset,
    p_limit: _companyListState.limit
  };

  sb.rpc('get_admin_companies_list', params).then(function(res) {
    if (res.error) {
      target.innerHTML = '<div style="color:var(--red);padding:12px;">Error: ' + res.error.message + '</div>';
      return;
    }
    _renderCompanyTable(target, res.data);
  }).catch(function(e) {
    target.innerHTML = '<div style="color:var(--red);padding:12px;">Failed: ' + e.message + '</div>';
  });
}

function _renderCompanyTable(target, data) {
  var columns = [
    { key: 'slug', label: 'Slug', render: function(r) { return '<span style="font-family:var(--font-mono);font-size:12px;">' + _escHtml(r.slug) + '</span>'; } },
    { key: 'name', label: 'Name', render: function(r) { return _escHtml(r.name || '—'); } },
    { key: 'source', label: 'Platform', render: function(r) { return '<span style="text-transform:capitalize;">' + _escHtml(r.source) + '</span>'; } },
    { key: 'is_active', label: 'Status', render: function(r) {
      var color = r.is_active ? 'var(--green)' : 'var(--text-faint)';
      return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';margin-right:6px;"></span>' + (r.is_active ? 'Active' : 'Inactive');
    }},
    { key: 'open_jobs', label: 'Open Jobs', align: 'right', render: function(r) { return fmtAdminNum(r.open_jobs); } },
    { key: 'total_jobs', label: 'Total Jobs', align: 'right', render: function(r) { return fmtAdminNum(r.total_jobs); } },
    { key: 'industry', label: 'Industry', render: function(r) { return '<span style="text-transform:capitalize;font-size:12px;">' + _escHtml(r.industry || '—') + '</span>'; } },
    { key: 'last_checked', label: 'Last Check', render: function(r) { return '<span style="font-size:12px;color:var(--text-faint);">' + _timeAgo(r.last_checked) + '</span>'; } }
  ];

  target.innerHTML = _adminPagedTable({
    id: 'co-paged',
    columns: columns,
    rows: data.rows,
    total: data.total,
    offset: data.offset,
    limit: data.limit,
    expandable: true
  });

  // Wire pagination
  var prev = document.getElementById('co-paged-prev');
  var next = document.getElementById('co-paged-next');
  if (prev) prev.addEventListener('click', function() {
    _companyListState.offset = Math.max(0, _companyListState.offset - _companyListState.limit);
    _fetchCompanyList();
  });
  if (next) next.addEventListener('click', function() {
    _companyListState.offset += _companyListState.limit;
    _fetchCompanyList();
  });

  // Wire expand rows
  _wireExpandableRows({
    tableId: 'co-paged',
    rows: data.rows,
    loadDetail: function(row, panelEl) {
      _loadCompanyDetailPanel(row, panelEl);
    }
  });
}

function _loadCompanyDetailPanel(row, panelEl) {
  panelEl.innerHTML = '<span style="color:var(--text-faint);font-size:12px;">Loading detail…</span>';

  sb.rpc('get_admin_company_detail', { p_slug: row.slug, p_source: row.source }).then(function(res) {
    if (res.error || !res.data) {
      panelEl.innerHTML = '<span style="color:var(--red);font-size:12px;">Error loading detail</span>';
      return;
    }
    var d = res.data;
    var boardUrl = d.board_url;
    var boardLink = boardUrl ? '<a href="' + _escHtml(boardUrl) + '" target="_blank" style="color:var(--accent);text-decoration:none;">' + _escHtml(boardUrl) + '</a>' : '—';
    var websiteLink = d.website ? '<a href="' + _escHtml(d.website) + '" target="_blank" style="color:var(--accent);text-decoration:none;">' + _escHtml(d.website) + '</a>' : '—';
    var linkedinLink = d.linkedin_url ? '<a href="' + _escHtml(d.linkedin_url) + '" target="_blank" style="color:var(--accent);text-decoration:none;">LinkedIn</a>' : '—';

    panelEl.innerHTML = _adminDetailPanel([
      {
        title: 'Board',
        rows: [
          { label: 'Board URL', value: boardLink },
          { label: 'ATS Source', value: d.source },
          { label: 'Discovered Via', value: d.discovered_via || '—' },
          { label: 'Last Scraped', value: _timeAgo(d.last_refresh_at) },
          { label: 'Last HTTP', value: d.last_http_status ? String(d.last_http_status) : '—' },
          { label: 'First Seen', value: _timeAgo(d.created_at) },
          { label: 'Last Checked', value: _timeAgo(d.last_checked) }
        ]
      },
      {
        title: 'Company Info',
        rows: [
          { label: 'Website', value: websiteLink },
          { label: 'LinkedIn', value: linkedinLink },
          { label: 'Industry', value: d.industry ? d.industry.charAt(0).toUpperCase() + d.industry.slice(1) : '—' },
          { label: 'Employees', value: d.employee_size || '—' },
          { label: 'Location', value: [d.locality, d.region, d.country].filter(Boolean).join(', ') || '—' },
          { label: 'Founded', value: d.founded ? String(d.founded) : '—' },
          { label: 'Staffing Agency', value: d.is_staffing_agency ? 'Yes' : 'No' }
        ]
      },
      {
        title: 'PDL & Enrichment',
        rows: [
          { label: 'PDL Matched', value: d.pdl_matched ? '✓ Yes (ID: ' + d.ref_company_id + ')' : 'No' },
          { label: 'JD AI Rate', value: d.ai_jd_rate != null ? (Math.round(d.ai_jd_rate * 100) + '%') : '—' },
          { label: 'JD Rate Updated', value: _timeAgo(d.ai_jd_rate_updated_at) },
          { label: 'Open Jobs', value: fmtAdminNum(d.open_jobs) },
          { label: 'Total Jobs', value: fmtAdminNum(d.job_count) }
        ]
      }
    ]);
  }).catch(function(e) {
    panelEl.innerHTML = '<span style="color:var(--red);font-size:12px;">Failed: ' + e.message + '</span>';
  });
}
