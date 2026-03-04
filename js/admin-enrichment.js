// ========== Enrichment Coverage Dashboard (D1) ==========
var _enChart = null;

async function loadEnrichmentTab() {
  if (_adminTabInit['enrichment']) return;
  console.log('[Admin] loadEnrichmentTab');
  try {
    var res = await sb.rpc('get_enrichment_coverage');
    if (res.error) { console.error('[Admin] Enrichment RPC error:', res.error); toastWarning('Enrichment data unavailable'); return; }
    var d = res.data;

    // Coverage cards
    setAdminText('en-salary-pct', d.salary_pct + '%');
    setAdminText('en-loctype-pct', d.loc_type_pct + '%');
    setAdminText('en-dept-pct', d.department_pct + '%');
    setAdminText('en-country-pct', d.country_pct + '%');
    setAdminText('en-total-jobs', fmtAdminNum(d.total_jobs));

    // Color code cards by coverage level
    var salEl = document.getElementById('en-salary-pct');
    var ltEl = document.getElementById('en-loctype-pct');
    var dpEl = document.getElementById('en-dept-pct');
    var ctEl = document.getElementById('en-country-pct');
    if (salEl) salEl.style.color = d.salary_pct >= 40 ? '#4a9a6b' : d.salary_pct >= 20 ? '#a08858' : '#c06060';
    if (ltEl) ltEl.style.color = d.loc_type_pct >= 60 ? '#4a9a6b' : d.loc_type_pct >= 30 ? '#a08858' : '#c06060';
    if (dpEl) dpEl.style.color = d.department_pct >= 60 ? '#4a9a6b' : d.department_pct >= 30 ? '#a08858' : '#c06060';
    if (ctEl) ctEl.style.color = d.country_pct >= 80 ? '#4a9a6b' : d.country_pct >= 40 ? '#a08858' : '#c06060';

    // Gate indicators
    var gates = d.gates || {};
    var gateConfig = [
      { key: 'salary_40', label: 'Salary 40%', met: gates.salary_40, unlocks: 'Remote Tracker (A4), Multi-dim Stories (B2)' },
      { key: 'loc_type_60', label: 'Loc Type 60%', met: gates.loc_type_60, unlocks: 'Remote Tracker (A4), Multi-dim Stories (B2)' },
      { key: 'department_60', label: 'Department 60%', met: gates.department_60, unlocks: 'Multi-dim Stories (B2)' },
      { key: 'country_80', label: 'Country 80%', met: gates.country_80, unlocks: 'Jobs by Location (A3)' }
    ];
    var gateEl = document.getElementById('en-gates');
    if (gateEl) {
      gateEl.innerHTML = gateConfig.map(function(g) {
        var color = g.met ? '#4a9a6b' : '#a08858';
        var icon = g.met ? '✓' : '○';
        var label = g.met ? 'Gate met' : 'Not met';
        return '<div style="padding:8px 14px;border-radius:8px;border:1px solid ' + color + ';background:color-mix(in srgb,' + color + ' 10%,transparent);font-size:12px">' +
          '<span style="color:' + color + ';font-weight:700">' + icon + ' ' + g.label + '</span>' +
          '<span style="color:var(--text-dim);margin-left:6px">' + label + '</span>' +
          (g.met ? '' : '<div style="color:var(--text-faint);font-size:11px;margin-top:2px">Unlocks: ' + g.unlocks + '</div>') +
          '</div>';
      }).join('');
    }

    // Gate badge on coverage cards
    gateConfig.forEach(function(g, i) {
      var ids = ['en-salary-gate','en-loctype-gate','en-dept-gate','en-country-gate'];
      var el = document.getElementById(ids[i]);
      if (el) {
        el.innerHTML = g.met ? '<span style="color:#4a9a6b;font-size:11px">✓ Gate met</span>' : '<span style="color:#a08858;font-size:11px">Target: ' + g.label.split(' ')[1] + '</span>';
      }
    });

    // Platform breakdown table
    var platforms = d.platforms || [];
    var tbody = document.getElementById('en-platform-body');
    var tfoot = document.getElementById('en-platform-foot');
    if (tbody) {
      tbody.innerHTML = platforms.map(function(p) {
        var pct = function(n) { return p.total > 0 ? (n * 100 / p.total).toFixed(1) + '%' : '0%'; };
        var colorPct = function(n, target) {
          var v = p.total > 0 ? n * 100 / p.total : 0;
          var c = v >= target ? '#4a9a6b' : v >= target * 0.5 ? '#a08858' : '#c06060';
          return '<span style="color:' + c + '">' + v.toFixed(1) + '%</span>';
        };
        return '<tr>' +
          '<td class="admin-platform-name">' + p.ats_source + '</td>' +
          '<td style="text-align:right;font-family:var(--mono)">' + fmtAdminNum(p.total) + '</td>' +
          '<td style="text-align:right;font-family:var(--mono)">' + colorPct(p.with_salary, 40) + '</td>' +
          '<td style="text-align:right;font-family:var(--mono)">' + colorPct(p.with_loc_type, 60) + '</td>' +
          '<td style="text-align:right;font-family:var(--mono)">' + colorPct(p.with_department, 60) + '</td>' +
          '<td style="text-align:right;font-family:var(--mono)">' + colorPct(p.with_country, 80) + '</td>' +
          '</tr>';
      }).join('');
    }
    if (tfoot) {
      tfoot.innerHTML = '<tr style="font-weight:700;border-top:2px solid var(--border)">' +
        '<td>Total</td>' +
        '<td style="text-align:right;font-family:var(--mono)">' + fmtAdminNum(d.total_jobs) + '</td>' +
        '<td style="text-align:right;font-family:var(--mono)">' + d.salary_pct + '%</td>' +
        '<td style="text-align:right;font-family:var(--mono)">' + d.loc_type_pct + '%</td>' +
        '<td style="text-align:right;font-family:var(--mono)">' + d.department_pct + '%</td>' +
        '<td style="text-align:right;font-family:var(--mono)">' + d.country_pct + '%</td>' +
        '</tr>';
    }

    // Platform coverage bar chart
    var chartEl = document.getElementById('en-chart-platforms');
    if (chartEl && typeof echarts !== 'undefined') {
      if (_enChart) _enChart.dispose();
      _enChart = echarts.init(chartEl);
      var names = platforms.map(function(p) { return p.ats_source; });
      var mkSeries = function(field, name, color) {
        return {
          name: name, type: 'bar', stack: false,
          data: platforms.map(function(p) { return p.total > 0 ? +(p[field] * 100 / p.total).toFixed(1) : 0; }),
          itemStyle: { color: color, borderRadius: [2,2,0,0] },
          barMaxWidth: 24
        };
      };
      _enChart.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: function(params) {
          var tip = '<strong>' + params[0].name + '</strong>';
          params.forEach(function(p) { tip += '<br>' + p.marker + ' ' + p.seriesName + ': ' + p.value + '%'; });
          return tip;
        }},
        legend: { top: 0, textStyle: { color: 'var(--text-dim)', fontSize: 11 } },
        grid: { left: 50, right: 20, top: 36, bottom: 30 },
        xAxis: { type: 'category', data: names, axisLabel: { color: 'var(--text-dim)', fontSize: 11 } },
        yAxis: { type: 'value', max: 100, axisLabel: { color: 'var(--text-dim)', fontSize: 11, formatter: '{value}%' },
          splitLine: { lineStyle: { color: 'var(--border)' } } },
        series: [
          mkSeries('with_salary', 'Salary', '#6366f1'),
          mkSeries('with_loc_type', 'Loc Type', '#3b82f6'),
          mkSeries('with_department', 'Department', '#22c55e'),
          mkSeries('with_country', 'Country', '#f59e0b')
        ]
      });
      window.addEventListener('resize', function() { if (_enChart) _enChart.resize(); });
    }

    _adminTabInit['enrichment'] = true;

    // Load refresh schedule (A5)
    loadRefreshSchedule();
  } catch(e) {
    console.error('[Admin] Enrichment error:', e); toastError('Enrichment data failed to load');
  }
}

async function loadRefreshSchedule() {
  try {
    var res = await sb.rpc('get_refresh_schedule');
    if (res.error || !res.data) return;
    var pages = res.data;

    var dueCount = pages.filter(function(p) { return p.needs_refresh; }).length;
    var summaryEl = document.getElementById('en-refresh-summary');
    if (summaryEl) {
      summaryEl.innerHTML = dueCount > 0
        ? '<span style="color:#a08858">' + dueCount + ' pages due for refresh</span>'
        : '<span style="color:#4a9a6b">All pages fresh ✓</span>';
    }

    var tbody = document.getElementById('en-refresh-body');
    if (tbody) {
      tbody.innerHTML = pages.map(function(p) {
        var hrsAgo = Math.floor(p.hours_since_refresh);
        var hrsDue = Math.floor(p.hours_until_due || 0);
        var freshLabel = hrsAgo < 1 ? '<1h ago' : hrsAgo < 24 ? hrsAgo + 'h ago' : Math.floor(hrsAgo/24) + 'd ago';
        var dueLabel = p.needs_refresh ? 'Overdue' : (hrsDue < 1 ? '<1h' : hrsDue < 24 ? hrsDue + 'h' : Math.floor(hrsDue/24) + 'd');
        var statusColor = p.needs_refresh ? '#c06060' : hrsDue < 24 ? '#a08858' : '#4a9a6b';
        var statusIcon = p.needs_refresh ? '⚠' : '✓';
        return '<tr>' +
          '<td style="font-family:var(--mono);font-size:12px">' + p.cache_key + '</td>' +
          '<td>' + p.page_type + '</td>' +
          '<td style="text-align:right;font-family:var(--mono)">' + p.refresh_interval_days + 'd</td>' +
          '<td style="text-align:right;font-family:var(--mono)">' + freshLabel + '</td>' +
          '<td style="text-align:right;font-family:var(--mono)">' + dueLabel + '</td>' +
          '<td style="text-align:center;color:' + statusColor + '">' + statusIcon + '</td>' +
          '</tr>';
      }).join('');
    }
  } catch(e) {
    console.error('[Admin] Refresh schedule error:', e); toastWarning('Refresh schedule failed to load');
  }
}

// ═══════════════════════════════════════════════════════════
// D7: MOCK ATS LOG TAB (v4.85)
// Shows mock_ats_submissions with payload inspection
// ═══════════════════════════════════════════════════════════

async function loadMockAtsTab() {
  var container = document.getElementById('admin-panel-mock-ats');
  if (!container) return;

  container.innerHTML = '<div class="admin-loading">Loading mock ATS submissions...</div>';

  try {
    var { data, error } = await sb
      .from('mock_ats_submissions')
      .select('id, user_id, job_id, ats_source, response_type, response_body, payload, created_at, idempotency_key')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      container.innerHTML = '<div class="admin-red">Error loading mock ATS data: ' + escapeHtml(error.message) + '</div>';
      return;
    }

    if (!data || data.length === 0) {
      container.innerHTML = '<div style="padding:20px;color:var(--text-dim);text-align:center;">No mock ATS submissions yet.</div>';
      return;
    }

    // Stats summary
    var total = data.length;
    var success = data.filter(function(r) { return r.response_type === 'success'; }).length;
    var rejected = data.filter(function(r) { return r.response_type === 'rejected'; }).length;
    var timeout = data.filter(function(r) { return r.response_type === 'timeout'; }).length;

    var statsHtml = '<div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;">' +
      '<div class="admin-stat-card"><div class="admin-stat-val">' + total + '</div><div class="admin-stat-label">Total</div></div>' +
      '<div class="admin-stat-card" style="border-color:#22c55e40"><div class="admin-stat-val" style="color:#22c55e">' + success + '</div><div class="admin-stat-label">Success</div></div>' +
      '<div class="admin-stat-card" style="border-color:#f59e0b40"><div class="admin-stat-val" style="color:#f59e0b">' + rejected + '</div><div class="admin-stat-label">Rejected</div></div>' +
      '<div class="admin-stat-card" style="border-color:#ef444440"><div class="admin-stat-val" style="color:#ef4444">' + timeout + '</div><div class="admin-stat-label">Timeout</div></div>' +
      '</div>';

    // Table
    var tableHtml = '<div style="overflow-x:auto;"><table class="admin-table" style="width:100%;font-size:13px;">' +
      '<thead><tr>' +
      '<th>Time</th><th>Job ID</th><th>ATS</th><th>Result</th><th>User</th><th>Details</th>' +
      '</tr></thead><tbody>';

    tableHtml += data.map(function(row) {
      var time = new Date(row.created_at).toLocaleString();
      var badge = '';
      if (row.response_type === 'success') badge = '<span class="admin-badge admin-badge-green">✓ Success</span>';
      else if (row.response_type === 'rejected') badge = '<span class="admin-badge admin-badge-amber">✗ Rejected</span>';
      else badge = '<span class="admin-badge admin-badge-red">⏱ Timeout</span>';

      var detailSnippet = '';
      if (row.response_body) {
        if (row.response_type === 'success') detailSnippet = row.response_body.confirmation_id || '';
        else if (row.response_type === 'rejected') detailSnippet = (row.response_body.error || '') + ': ' + (row.response_body.detail || '');
        else detailSnippet = 'timeout';
      }

      var jobIdShort = (row.job_id || '').length > 20 ? row.job_id.substring(0, 20) + '…' : (row.job_id || '');
      var userIdShort = (row.user_id || '').substring(0, 8) + '…';

      return '<tr data-row-id="' + row.id + '" style="cursor:pointer;" onclick="toggleMockAtsDetail(this)">' +
        '<td style="white-space:nowrap;font-size:12px;color:var(--text-dim)">' + time + '</td>' +
        '<td style="font-family:var(--mono);font-size:12px;" title="' + escapeHtml(row.job_id || '') + '">' + escapeHtml(jobIdShort) + '</td>' +
        '<td>' + escapeHtml(row.ats_source || '') + '</td>' +
        '<td>' + badge + '</td>' +
        '<td style="font-family:var(--mono);font-size:11px;" title="' + escapeHtml(row.user_id || '') + '">' + escapeHtml(userIdShort) + '</td>' +
        '<td style="font-size:12px;color:var(--text-dim);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(detailSnippet) + '</td>' +
        '</tr>' +
        '<tr class="mock-ats-detail" style="display:none;"><td colspan="6">' +
          '<div style="background:var(--bg);padding:12px;border-radius:8px;font-size:12px;overflow-x:auto;">' +
            '<div style="margin-bottom:8px;"><strong>Request Payload:</strong></div>' +
            '<pre style="background:var(--bg-card);padding:10px;border-radius:6px;font-size:11px;overflow-x:auto;max-height:300px;color:var(--text-dim);">' + escapeHtml(JSON.stringify(row.payload, null, 2)) + '</pre>' +
            '<div style="margin:8px 0;"><strong>Response:</strong></div>' +
            '<pre style="background:var(--bg-card);padding:10px;border-radius:6px;font-size:11px;overflow-x:auto;max-height:200px;color:var(--text-dim);">' + escapeHtml(JSON.stringify(row.response_body, null, 2)) + '</pre>' +
            '<div style="margin-top:8px;font-size:11px;color:var(--text-faint);">Idempotency: ' + escapeHtml(row.idempotency_key || 'none') + '</div>' +
          '</div>' +
        '</td></tr>';
    }).join('');

    tableHtml += '</tbody></table></div>';

    container.innerHTML = statsHtml + tableHtml;

  } catch (e) {
    console.error('[Admin] Mock ATS tab error:', e); toastError('Mock ATS failed to load');
    container.innerHTML = '<div class="admin-red">Error: ' + escapeHtml(String(e)) + '</div>';
  }
}

function toggleMockAtsDetail(row) {
  var detail = row.nextElementSibling;
  if (detail && detail.classList.contains('mock-ats-detail')) {
    detail.style.display = detail.style.display === 'none' ? '' : 'none';
  }
}

// ─── Cache Health Tab (v6.55 A14 Session 2) ───

function refreshCacheHealthPanel() {
  var stats = (typeof getCacheStats === 'function') ? getCacheStats() : null;
  if (!stats) {
    var emptyEl = document.getElementById('cache-empty');
    if (emptyEl) { emptyEl.style.display = ''; emptyEl.textContent = 'getCacheStats() not available — globals.js may not be loaded.'; }
    return;
  }

  // Summary cards
  var entriesEl = document.getElementById('cache-entries');
  var hitRateEl = document.getElementById('cache-hit-rate');
  var totalRowsEl = document.getElementById('cache-total-rows');
  var memKbEl = document.getElementById('cache-mem-kb');
  if (entriesEl) entriesEl.textContent = stats.entries;
  if (hitRateEl) hitRateEl.textContent = stats.hitRate;
  if (totalRowsEl) totalRowsEl.textContent = stats.totalRows.toLocaleString();
  if (memKbEl) memKbEl.textContent = stats.memEstimateKB.toLocaleString();

  // Hits/misses label
  var hmEl = document.getElementById('cache-hits-misses');
  if (hmEl) hmEl.textContent = stats.hits + ' hits / ' + stats.misses + ' misses';

  // TTL tier table
  var tierBody = document.getElementById('cache-tier-body');
  if (tierBody && stats.tiers) {
    var tierHtml = '';
    var prefixes = Object.keys(stats.tiers);
    for (var i = 0; i < prefixes.length; i++) {
      var sec = Math.round(stats.tiers[prefixes[i]] / 1000);
      var label = sec >= 3600 ? Math.round(sec / 3600) + 'h' : sec >= 60 ? Math.round(sec / 60) + 'min' : sec + 's';
      tierHtml += '<tr><td><code>' + escapeHtml(prefixes[i]) + '</code></td><td>' + label + '</td></tr>';
    }
    tierHtml += '<tr><td><code>(default)</code></td><td>' + Math.round(stats.defaultTTL / 60000) + 'min</td></tr>';
    tierBody.innerHTML = tierHtml;
  }

  // Entries table
  var entriesBody = document.getElementById('cache-entries-body');
  var emptyMsg = document.getElementById('cache-empty');
  if (entriesBody) {
    if (stats.keys.length === 0) {
      entriesBody.innerHTML = '';
      if (emptyMsg) emptyMsg.style.display = '';
    } else {
      if (emptyMsg) emptyMsg.style.display = 'none';
      var html = '';
      for (var j = 0; j < stats.keys.length; j++) {
        var k = stats.keys[j];
        var staleClass = k.stale ? ' style="color:#ef4444;font-weight:600"' : '';
        html += '<tr>';
        html += '<td><code style="font-size:12px">' + escapeHtml(k.key) + '</code></td>';
        html += '<td>' + k.age + '</td>';
        html += '<td>' + k.ttl + '</td>';
        html += '<td>' + k.pctLife + '</td>';
        html += '<td>' + k.rows.toLocaleString() + '</td>';
        html += '<td' + staleClass + '>' + (k.stale ? 'Yes' : '—') + '</td>';
        html += '</tr>';
      }
      entriesBody.innerHTML = html;
    }
  }

  // A15 Session 2: MV staleness panel
  loadMVStalenessPanel();
}

// ─── MV Staleness Panel (v6.58 A15 Session 2) ───
async function loadMVStalenessPanel() {
  var panel = document.getElementById('mv-staleness-body');
  if (!panel) return;
  try {
    var views = ['mv_landing_stats', 'mv_job_feed_counts', 'mv_source_breakdown', 'mv_jobs_by_source', 'mv_jobs_by_day', 'mv_active_filter_keywords', 'mv_top_companies'];
    var html = '';
    for (var i = 0; i < views.length; i++) {
      var vName = views[i];
      try {
        var res = await sb.from(vName).select('refreshed_at').limit(1);
        if (res.data && res.data.length > 0) {
          var refreshedAt = new Date(res.data[0].refreshed_at);
          var ageMs = Date.now() - refreshedAt.getTime();
          var ageMins = Math.round(ageMs / 60000);
          var ageStr = ageMins < 60 ? ageMins + 'min' : Math.floor(ageMins / 60) + 'h ' + (ageMins % 60) + 'min';
          var fresh = ageMins <= 15;
          var statusBadge = fresh
            ? '<span style="color:#22c55e;font-weight:600">OK</span>'
            : '<span style="color:#ef4444;font-weight:600">STALE</span>';
          html += '<tr><td><code style="font-size:12px">' + vName + '</code></td>';
          html += '<td>' + ageStr + '</td>';
          html += '<td>' + statusBadge + '</td>';
          html += '<td style="font-size:11px;color:var(--text-faint)">' + refreshedAt.toLocaleTimeString() + '</td></tr>';
        } else {
          html += '<tr><td><code style="font-size:12px">' + vName + '</code></td><td>—</td><td><span style="color:#f59e0b">NO DATA</span></td><td>—</td></tr>';
        }
      } catch (e) {
        html += '<tr><td><code style="font-size:12px">' + vName + '</code></td><td>—</td><td><span style="color:#ef4444">ERROR</span></td><td style="font-size:11px">' + escapeHtml(e.message || 'unknown') + '</td></tr>';
      }
    }
    panel.innerHTML = html;
  } catch (e) {
    panel.innerHTML = '<tr><td colspan="4" style="color:#ef4444">Failed to check MV staleness: ' + escapeHtml(e.message) + '</td></tr>';
  }
}


