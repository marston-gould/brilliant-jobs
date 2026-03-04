/* ───────────────────────────────────────────────────────────
   admin-jobs.js — Jobs Sub-page (Admin IA v2 S2)
   v6.85 — Job inventory, enrichment stats, age distribution
   ─────────────────────────────────────────────────────────── */

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

  (d.by_platform || []).forEach(function(p) {
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

  panel.innerHTML = html;
}
