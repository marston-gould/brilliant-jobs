/* ───────────────────────────────────────────────────────────
   admin-companies.js — Companies Sub-page (Admin IA v2 S2)
   v6.85 — Board inventory, platform breakdown, industry mix
   ─────────────────────────────────────────────────────────── */

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

  // ── Recently Discovered ──
  html += '<div class="admin-block" style="margin-top:16px;">';
  html += '<div class="admin-block-title">Recently Discovered</div>';
  html += '<div style="overflow-x:auto;"><table class="admin-table" style="width:100%"><thead><tr>';
  html += '<th>Slug</th><th>Name</th><th>Platform</th><th style="text-align:right">Jobs</th><th>Discovered</th>';
  html += '</tr></thead><tbody>';

  (d.recently_discovered || []).forEach(function(c) {
    var ago = _timeAgo(c.created_at);
    html += '<tr>';
    html += '<td style="font-family:var(--font-mono);font-size:12px;">' + _escHtml(c.slug) + '</td>';
    html += '<td>' + _escHtml(c.name || '—') + '</td>';
    html += '<td style="text-transform:capitalize;">' + _escHtml(c.source) + '</td>';
    html += '<td style="text-align:right">' + (c.job_count || 0) + '</td>';
    html += '<td style="color:var(--text-faint);font-size:12px;">' + ago + '</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div></div>';

  panel.innerHTML = html;
}

// ── Reusable Stat Card ──
function _adminStatCard(label, value, sub) {
  return '<div class="admin-stat-card">' +
    '<div class="admin-stat-value">' + value + '</div>' +
    '<div class="admin-stat-label">' + label + '</div>' +
    (sub ? '<div class="admin-stat-sub">' + sub + '</div>' : '') +
    '</div>';
}

// ── HTML escape ──
function _escHtml(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── Time ago ──
function _timeAgo(dateStr) {
  if (!dateStr) return '—';
  var diff = Date.now() - new Date(dateStr).getTime();
  var mins = Math.floor(diff / 60000);
  if (mins < 60) return mins + 'm ago';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  var days = Math.floor(hrs / 24);
  if (days < 30) return days + 'd ago';
  return Math.floor(days / 30) + 'mo ago';
}
