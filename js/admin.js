/* ───────────────────────────────────────────────────────────
   admin.js — Tabbed Admin Console
   Tab 1: Feed Health (existing)
   Tab 2: Cohorts
   Tab 3: Users + Sessions
   Tab 4: SEO / Data Coverage
   Tab 5: Revenue
   ─────────────────────────────────────────────────────────── */

// ─── Admin access gate ───
function checkAdminAccess() {
  if (typeof sb === 'undefined') { console.warn('[Admin] No sb client'); return; }
  sb.auth.getUser().then(function(res) {
    if (!res.data || !res.data.user) { console.warn('[Admin] No authenticated user'); return; }
    console.log('[Admin] Checking role for', res.data.user.email);
    sb.from('profiles').select('role').eq('id', res.data.user.id).single().then(function(r) {
      if (r.error) { console.error('[Admin] Profile query error:', r.error.message); return; }
      if (r.data && r.data.role === 'admin') {
        var nav = document.getElementById('nav-admin');
        if (nav) { nav.style.display = ''; console.log('[Admin] ✓ Nav shown'); }
      }
    }).catch(function(e) { console.error('[Admin] Profile query failed:', e); });
  }).catch(function(e) { console.error('[Admin] getUser failed:', e); });
}

// ─── Tab state ───
var adminActiveTab = localStorage.getItem('bj_admin_tab') || 'feed-health';
var _adminTabInit = {};
var adminPeriod = parseInt(localStorage.getItem('bj_admin_period')) || 168;

function initAdminPage() {
  var page = document.getElementById('page-admin');
  if (!page || !page.classList.contains('active')) {
    console.log('[Admin] page not active, skipping');
    return;
  }
  // Guard: don't load data until user is authenticated
  if (typeof currentUser === 'undefined' || !currentUser) {
    console.log('[Admin] waiting for auth, deferring load');
    _adminTabInit = {}; // reset so it reloads when auth is ready
    return;
  }
  console.log('[Admin] initAdminPage called');
  initAdminTabs();
}

function initAdminTabs() {
  var tabBar = document.getElementById('admin-tabs');
  if (!tabBar) return;

  tabBar.addEventListener('click', function(e) {
    var btn = e.target.closest('.admin-tab');
    if (!btn || btn.classList.contains('disabled')) return;
    switchAdminTab(btn.dataset.tab);
  });

  // Period toggle for Revenue tab
  var revPeriod = document.getElementById('admin-rev-period');
  if (revPeriod) {
    revPeriod.addEventListener('click', function(e) {
      var btn = e.target.closest('.admin-period-btn');
      if (!btn) return;
      revPeriod.querySelectorAll('.admin-period-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      _adminTabInit['revenue'] = false;
      loadRevenueTab(parseInt(btn.dataset.revDays));
    });
  }

  switchAdminTab(adminActiveTab);
}

function switchAdminTab(tabId) {
  document.querySelectorAll('.admin-tab').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  document.querySelectorAll('.admin-panel').forEach(function(p) {
    p.classList.toggle('active', p.id === 'admin-panel-' + tabId);
  });
  adminActiveTab = tabId;
  localStorage.setItem('bj_admin_tab', tabId);

  if (!_adminTabInit[tabId]) {
    _adminTabInit[tabId] = true;
    switch (tabId) {
      case 'feed-health': loadBoardHealth(); break;
      case 'cohorts': loadCohortTab(); break;
      case 'entitlements': loadEntitlementsTab(); break;
      case 'users': loadUsersTab(); break;
      case 'seo': loadSeoTab(); break;
      case 'revenue': loadRevenueTab(); break;
      case 'surveys': loadSurveysTab(); break;
      case 'ghost': loadGhostTab(); break;
      case 'feedback': loadFeedbackTab(); break;
      case 'merch': loadMerchTab(); break;
    }
  }
}

// ─── Helpers ───
function setAdminText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function fmtAdminNum(n) {
  if (n == null) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'K';
  return String(n);
}

function fmtAdminPct(n, d) {
  if (!d || d === 0) return '—';
  return Math.round(n / d * 100) + '%';
}

// ═══════════════════════════════════════════════════════════
// TAB 1: FEED HEALTH
// ═══════════════════════════════════════════════════════════

async function loadBoardHealth() {
  console.log('[Admin] loadBoardHealth called, period:', adminPeriod);
  try {
    // Load refresh cycle status (independent of period)
    loadRefreshCycle();

    var snapshot = await sb.rpc('get_board_health', { period_hours: adminPeriod });
    console.log('[Admin] RPC data:', snapshot.data);
    if (snapshot.error) {
      console.error('[Admin] RPC error:', snapshot.error);
      var healthEl = document.getElementById('admin-health');
      if (healthEl) healthEl.innerHTML = '<span class="admin-red">⚠ Feed health data unavailable — ' + (snapshot.error.message || 'unknown error') + '</span> <button onclick="_adminTabInit[\'feed-health\']=false;loadBoardHealth()" style="margin-left:8px;padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-card);color:var(--text-dim);font-size:13px;cursor:pointer">Retry</button>';
      return;
    }
    var d = snapshot.data;
    if (!d) return;

    setAdminText('ah-total', fmtAdminNum(d.total_feeds));
    setAdminText('ah-with-jobs', fmtAdminNum(d.feeds_with_jobs));
    setAdminText('ah-4xx', fmtAdminNum(d.feeds_4xx));
    setAdminText('ah-dead', fmtAdminNum(d.feeds_4xx));
    setAdminText('ah-unscraped', fmtAdminNum(d.feeds_never_scraped || 0));
    setAdminText('ah-jobs', fmtAdminNum(d.total_jobs));

    var net = (d.jobs_added || 0) - (d.jobs_lost || 0);
    setAdminText('ah-net', (net >= 0 ? '+' : '') + fmtAdminNum(net));

    setDelta('ah-total-delta', d.boards_added, '+');
    setDelta('ah-with-jobs-delta', null);
    setDelta('ah-4xx-delta', d.boards_lost, '+', true);
    setDelta('ah-dead-delta', null);
    setDelta('ah-unscraped-delta', null);
    setDelta('ah-jobs-delta', d.jobs_added, '+');
    setDelta('ah-net-delta', d.jobs_lost, '-', true);

    var healthPct = d.feed_health_pct || 0;
    var healthEl = document.getElementById('admin-health');
    if (healthEl) {
      var color = healthPct >= 80 ? 'admin-green' : healthPct >= 60 ? 'admin-amber' : 'admin-red';
      healthEl.innerHTML = '<span class="admin-health-dot ' + color + '"></span> Feed health: <strong>' + healthPct + '%</strong> of boards returning jobs';
    }

    var platform = await sb.rpc('get_board_health_by_platform', { period_hours: adminPeriod });
    if (platform.data && platform.data.length) {
      var tbody = document.getElementById('admin-platform-body');
      var tfoot = document.getElementById('admin-platform-foot');
      if (tbody) {
        var totBoards = 0, totWithJobs = 0, totDead = 0, totUnscraped = 0, totJobs = 0;
        tbody.innerHTML = platform.data.map(function(p) {
          var activePct = p.total > 0 ? Math.round((p.with_jobs / p.total) * 100) : 0;
          var pctColor = activePct >= 50 ? 'admin-green' : activePct >= 25 ? 'admin-amber' : 'admin-red';
          var jpb = p.with_jobs > 0 ? Math.round(p.jobs / p.with_jobs) : 0;
          var dead = p.dead || 0;
          var unscraped = p.never_scraped || 0;
          totBoards += p.total; totWithJobs += p.with_jobs; totDead += dead; totUnscraped += unscraped; totJobs += p.jobs;
          return '<tr>' +
            '<td class="admin-platform-name">' + (p.platform || 'unknown') + '</td>' +
            '<td>' + fmtAdminNum(p.total) + '</td>' +
            '<td class="' + pctColor + '">' + activePct + '%</td>' +
            '<td class="' + (dead > 0 ? 'admin-red' : '') + '">' + fmtAdminNum(dead) + '</td>' +
            '<td class="' + (unscraped > 0 ? 'admin-amber' : '') + '">' + fmtAdminNum(unscraped) + '</td>' +
            '<td>' + fmtAdminNum(p.jobs) + '</td>' +
            '<td style="font-family:var(--mono)">' + fmtAdminNum(jpb) + '</td>' +
            '</tr>';
        }).join('');
        if (tfoot) {
          var totPct = totBoards > 0 ? Math.round((totWithJobs / totBoards) * 100) : 0;
          var totJpb = totWithJobs > 0 ? Math.round(totJobs / totWithJobs) : 0;
          tfoot.innerHTML = '<tr style="font-weight:600;border-top:2px solid var(--border)">' +
            '<td>Total</td>' +
            '<td>' + fmtAdminNum(totBoards) + '</td>' +
            '<td>' + totPct + '%</td>' +
            '<td class="' + (totDead > 0 ? 'admin-red' : '') + '">' + fmtAdminNum(totDead) + '</td>' +
            '<td class="' + (totUnscraped > 0 ? 'admin-amber' : '') + '">' + fmtAdminNum(totUnscraped) + '</td>' +
            '<td>' + fmtAdminNum(totJobs) + '</td>' +
            '<td style="font-family:var(--mono)">' + fmtAdminNum(totJpb) + '</td>' +
            '</tr>';
        }
      }
    }

    // Load feed health charts
    loadFeedHealthCharts();
  } catch (err) {
    console.error('[Admin] loadBoardHealth error:', err);
  }
}

// ─── Feed Health Charts (stacked area by platform) ───
var _fhCharts = {};
var _platformColors = {
  greenhouse: '#5b8a72',
  lever: '#6b82a8',
  ashby: '#a08858',
  workable: '#8878a0',
  recruitee: '#a07080'
};
var _platformLineColors = {
  greenhouse: '#2d6b4a',
  lever: '#3b5a8a',
  ashby: '#7a6530',
  workable: '#5e4880',
  recruitee: '#804050'
};

async function loadFeedHealthCharts() {
  if (typeof echarts === 'undefined') return;
  try {
    var res = await sb.rpc('get_feed_health_history', { days_back: 90 });
    if (res.error || !res.data || !res.data.length) return;
    var rows = res.data;

    // Build date axis + per-platform series
    var dates = [];
    var dateSet = {};
    var platforms = [];
    var platSet = {};
    rows.forEach(function(r) {
      if (!dateSet[r.snapshot_date]) { dateSet[r.snapshot_date] = true; dates.push(r.snapshot_date); }
      if (!platSet[r.platform]) { platSet[r.platform] = true; platforms.push(r.platform); }
    });
    dates.sort();

    // Build lookup: data[platform][date] = row
    var lookup = {};
    rows.forEach(function(r) {
      if (!lookup[r.platform]) lookup[r.platform] = {};
      lookup[r.platform][r.snapshot_date] = r;
    });

    var t = seoChartTheme();
    var legend = { data: platforms.map(function(p) { return p.charAt(0).toUpperCase() + p.slice(1); }), textStyle: { color: '#7b829a', fontSize: 11 }, top: 4, right: 10 };
    var grid = { top: 40, right: 20, bottom: 30, left: 60 };
    var xAxis = { type: 'category', data: dates, axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10, rotate: 35, interval: Math.max(0, Math.floor(dates.length / 10) - 1) } };

    function makeSeries(field) {
      return platforms.map(function(p) {
        return {
          name: p.charAt(0).toUpperCase() + p.slice(1),
          type: 'line',
          stack: 'total',
          areaStyle: { opacity: 0.15 },
          lineStyle: { width: 2, color: _platformLineColors[p] || _platformColors[p] || '#666' },
          symbol: 'none',
          itemStyle: { color: _platformColors[p] || '#999' },
          data: dates.map(function(d) { return lookup[p] && lookup[p][d] ? lookup[p][d][field] : 0; })
        };
      });
    }

    // Chart 1: Total Boards
    var el1 = document.getElementById('fh-chart-total-boards');
    if (el1) {
      if (_fhCharts.totalBoards) _fhCharts.totalBoards.dispose();
      _fhCharts.totalBoards = echarts.init(el1);
      _fhCharts.totalBoards.setOption(Object.assign({}, t, {
        title: { text: 'Total Boards by Platform', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 } },
        legend: legend, grid: grid, xAxis: xAxis,
        yAxis: { type: 'value', axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 11 }, splitLine: { lineStyle: { color: '#e8eaef' } } },
        series: makeSeries('total_boards')
      }), true);
    }

    // Chart 2: Active Boards
    var el2 = document.getElementById('fh-chart-active-boards');
    if (el2) {
      if (_fhCharts.activeBoards) _fhCharts.activeBoards.dispose();
      _fhCharts.activeBoards = echarts.init(el2);
      _fhCharts.activeBoards.setOption(Object.assign({}, t, {
        title: { text: 'Active Boards by Platform (with jobs)', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 } },
        legend: legend, grid: grid, xAxis: xAxis,
        yAxis: { type: 'value', axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 11 }, splitLine: { lineStyle: { color: '#e8eaef' } } },
        series: makeSeries('active_boards')
      }), true);
    }

    // Chart 3: Jobs
    var el3 = document.getElementById('fh-chart-jobs');
    if (el3) {
      if (_fhCharts.jobs) _fhCharts.jobs.dispose();
      _fhCharts.jobs = echarts.init(el3);
      _fhCharts.jobs.setOption(Object.assign({}, t, {
        title: { text: 'Jobs by Platform', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 } },
        legend: legend, grid: grid, xAxis: xAxis,
        yAxis: { type: 'value', axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 11 }, splitLine: { lineStyle: { color: '#e8eaef' } } },
        series: makeSeries('total_jobs')
      }), true);
    }

    window.addEventListener('resize', function() {
      Object.keys(_fhCharts).forEach(function(k) { if (_fhCharts[k]) _fhCharts[k].resize(); });
    });
  } catch (err) {
    console.error('[Admin] Feed health charts error:', err);
  }
}

// ─── Refresh Cycle Status (Tiered) ───
async function loadRefreshCycle() {
  try {
    var res = await sb.rpc('get_refresh_cycle_status');
    if (res.error) { console.error('[Admin] Cycle RPC error:', res.error); return; }
    var c = res.data;
    if (!c) return;

    // HOT tier progress (primary metric)
    var hotPct = c.hot_pct || 0;
    setAdminText('ac-cycle-pct', hotPct + '%');
    var bar = document.getElementById('ac-cycle-bar');
    if (bar) setTimeout(function() { bar.style.width = hotPct + '%'; }, 100);

    setAdminText('ac-cycle-total', fmtAdminNum(c.total_boards));
    setAdminText('ac-cycle-refreshed', fmtAdminNum(c.hot_fresh || 0) + ' / ' + fmtAdminNum(c.hot_total || 0) + ' HOT');
    setAdminText('ac-cycle-pending', fmtAdminNum(c.hot_due || 0) + ' HOT due');

    // Rate with trend arrow: compare 1h vs 6h average
    var rate1h = c.rate_1h || 0;
    var rate6h = c.rate_6h || 0;
    var rateStr = fmtAdminNum(rate1h) + '/hr';
    if (rate6h > 0 && rate1h > 0) {
      var pctChange = Math.round(((rate1h - rate6h) / rate6h) * 100);
      if (pctChange > 10) {
        rateStr += ' <span style="color:#4a9a6b;font-size:0.8em">▲ ' + pctChange + '%</span>';
      } else if (pctChange < -10) {
        rateStr += ' <span style="color:#c06060;font-size:0.8em">▼ ' + Math.abs(pctChange) + '%</span>';
      } else {
        rateStr += ' <span style="color:#8b929e;font-size:0.8em">● steady</span>';
      }
    }
    var rateEl = document.getElementById('ac-cycle-rate');
    if (rateEl) rateEl.innerHTML = rateStr;

    // ETA based on HOT cycle
    var estHours = c.est_hot_cycle_hours || 0;
    if (estHours <= 0) {
      setAdminText('ac-cycle-eta', 'Up to date');
    } else if (estHours < 1) {
      setAdminText('ac-cycle-eta', Math.round(estHours * 60) + 'min cycle');
    } else {
      setAdminText('ac-cycle-eta', estHours.toFixed(1) + 'h cycle');
    }

    // Last refresh
    if (c.last_refresh) {
      var lr = new Date(c.last_refresh);
      var minsAgo = Math.round((Date.now() - lr.getTime()) / 60000);
      setAdminText('ac-cycle-start', minsAgo < 60 ? minsAgo + 'min ago' : Math.round(minsAgo / 60) + 'h ago');
    }

    // Sparkline: hourly throughput (last 24h)
    var sparkEl = document.getElementById('ac-cycle-spark');
    if (sparkEl && c.hourly_rates && c.hourly_rates.length > 1 && typeof echarts !== 'undefined') {
      var hours = c.hourly_rates.map(function(r) { return new Date(r.hour).getHours() + ':00'; });
      var counts = c.hourly_rates.map(function(r) { return r.count; });
      var chart = echarts.init(sparkEl);
      chart.setOption({
        grid: { top: 4, right: 4, bottom: 16, left: 30 },
        xAxis: { type: 'category', data: hours, axisLabel: { fontSize: 9, color: '#94a3b8' }, axisLine: { show: false }, axisTick: { show: false } },
        yAxis: { type: 'value', axisLabel: { fontSize: 9, color: '#94a3b8' }, splitLine: { lineStyle: { color: '#1e293b' } } },
        series: [{ type: 'bar', data: counts, itemStyle: { color: '#6b82a8', borderRadius: [2, 2, 0, 0] }, barMaxWidth: 16 }],
        tooltip: { trigger: 'axis', formatter: function(p) { return p[0].name + ': ' + p[0].value.toLocaleString() + ' boards'; } }
      });
    }
  } catch (err) {
    console.error('[Admin] loadRefreshCycle error:', err);
  }
}

function setDelta(id, val, prefix, invert) {
  var el = document.getElementById(id);
  if (!el) return;
  if (val == null || val === 0) { el.textContent = ''; return; }
  var cls = invert ? 'admin-red' : 'admin-green';
  el.innerHTML = '<span class="' + cls + '">' + (prefix || '') + fmtAdminNum(val) + '</span>';
}

// ═══════════════════════════════════════════════════════════
// TAB 2: COHORTS
// ═══════════════════════════════════════════════════════════

var _allCohorts = [];
var _selectedCohortIds = []; // empty = all selected

async function loadCohortTab() {
  console.log('[Admin] loadCohortTab');
  try {
    var res = await sb.rpc('get_cohort_overview');
    if (res.error) { console.error('[Admin] Cohort RPC error:', res.error); return; }
    var cohorts = res.data;
    if (!cohorts || !cohorts.length) {
      setAdminText('ac-total-cohorts', '0');
      setAdminText('ac-total-users', '0');
      setAdminText('ac-pro-pct', '—');
      setAdminText('ac-active-7d', '0');
      setAdminText('ac-churned', '0');
      return;
    }

    _allCohorts = cohorts;
    window._cohortList = cohorts;

    // Build cohort filter chips
    renderCohortData(cohorts);
  } catch (err) {
    console.error('[Admin] loadCohortTab error:', err);
  }
}

function toggleCohortFilter(id) {
  // Driven by table checkboxes now
  _selectedCohortIds = [];
  document.querySelectorAll('.cohort-row-cb:checked').forEach(function(cb) {
    _selectedCohortIds.push(cb.dataset.cohortId);
  });
  var selectAll = document.getElementById('cohort-select-all');
  if (selectAll) {
    var total = document.querySelectorAll('.cohort-row-cb').length;
    selectAll.checked = _selectedCohortIds.length === total;
    selectAll.indeterminate = _selectedCohortIds.length > 0 && _selectedCohortIds.length < total;
  }
  var filtered = _selectedCohortIds.length === 0 ? _allCohorts : _allCohorts.filter(function(c) {
    return _selectedCohortIds.indexOf(c.id) >= 0;
  });
  renderCohortData(filtered);
}
window.updateCohortCharts = function() { toggleCohortFilter(); };

function renderCohortData(cohorts) {
    var totalUsers = cohorts.reduce(function(s, c) { return s + (c.user_count || 0); }, 0);
    var totalPro = cohorts.reduce(function(s, c) { return s + (c.pro_count || 0); }, 0);
    var active7d = cohorts.reduce(function(s, c) { return s + (c.active_7d || 0); }, 0);
    var churned28d = cohorts.reduce(function(s, c) { return s + (c.churned_28d || 0); }, 0);

    setAdminText('ac-total-cohorts', cohorts.length);
    setAdminText('ac-total-users', fmtAdminNum(totalUsers));
    setAdminText('ac-pro-pct', fmtAdminPct(totalPro, totalUsers));
    setAdminText('ac-active-7d', fmtAdminNum(active7d));
    setAdminText('ac-churned', fmtAdminNum(churned28d));

    var tbody = document.getElementById('admin-cohort-body');
    if (!tbody) return;

    // Collect all plan types across all cohorts
    var allPlans = {};
    cohorts.forEach(function(c) {
      if (c.plan_breakdown) c.plan_breakdown.forEach(function(pb) { allPlans[pb.plan] = true; });
    });
    var planOrder = ['free', 'starter', 'pro', 'enterprise'].filter(function(p) { return allPlans[p]; });

    // Build dynamic header
    var thead = tbody.parentElement.querySelector('thead');
    if (thead) {
      thead.innerHTML = '<tr>' +
        '<th style="width:32px;"><input type="checkbox" id="cohort-select-all" title="Select all" style="cursor:pointer;" onchange="updateCohortCharts()"></th>' +
        '<th>ID</th><th>Age</th><th>Enrollment</th><th>Users</th><th>Active 7d</th><th>Churned</th>' +
        planOrder.map(function(p) { return '<th>' + p.charAt(0).toUpperCase() + p.slice(1) + '</th>'; }).join('') +
        '<th>Revenue/mo</th><th>LTV</th><th>ARPU</th>' +
        '</tr>';
    }

    tbody.innerHTML = cohorts.map(function(c) {
      var enrollStart = c.enrollment_start ? new Date(c.enrollment_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
      var enrollClose = c.enrollment_close ? new Date(c.enrollment_close).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Open';
      var isOpen = !c.enrollment_close || new Date(c.enrollment_close) > new Date();

      // Build plan count lookup
      var planCounts = {};
      if (c.plan_breakdown) c.plan_breakdown.forEach(function(pb) { planCounts[pb.plan] = pb.count; });

      return '<tr>' +
        '<td><input type="checkbox" class="cohort-row-cb" data-cohort-id="' + c.id + '" onchange="toggleCohortFilter()" style="cursor:pointer;"></td>' +
        '<td style="font-family:var(--mono);font-size:12px;color:var(--accent)">' + (c.display_id || c.id) + '</td>' +
        '<td>' + (c.age_days || 0) + 'd</td>' +
        '<td style="font-size:12px">' + enrollStart + ' — ' + enrollClose + (isOpen ? ' <span class="admin-green">●</span>' : '') + '</td>' +
        '<td>' + fmtAdminNum(c.user_count) + '</td>' +
        '<td>' + fmtAdminNum(c.active_7d) + '</td>' +
        '<td class="' + (c.churned_28d > 0 ? 'admin-red' : '') + '">' + fmtAdminNum(c.churned_28d) + '</td>' +
        planOrder.map(function(p) {
          var cnt = planCounts[p] || 0;
          var cls = p === 'pro' ? 'admin-green' : (p === 'enterprise' ? 'admin-amber' : '');
          return '<td class="' + cls + '">' + fmtAdminNum(cnt) + '</td>';
        }).join('') +
        '<td style="color:var(--text-faint)">—</td>' +
        '<td style="color:var(--text-faint)">—</td>' +
        '<td style="color:var(--text-faint)">—</td>' +
        '</tr>';
    }).join('');

    renderCohortCharts(cohorts);
}

// ─── Entitlements Tab ───
async function loadEntitlementsTab() {
  console.log('[Admin] loadEntitlementsTab');
  var select = document.getElementById('entitlement-cohort-select');
  var tbody = document.getElementById('admin-entitlement-body');
  if (!select || !tbody) return;

  // Populate dropdown if empty
  if (select.options.length === 0) {
    try {
      var res = await sb.from('cohorts').select('id,display_id,name').eq('is_active', true).order('created_at');
      if (res.data) {
        res.data.forEach(function(c) {
          var opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = (c.display_id || c.id) + ' — ' + c.name;
          select.appendChild(opt);
        });
      }
    } catch (e) {}
    select.addEventListener('change', function() { loadEntitlementRows(select.value); });
  }

  if (select.value) loadEntitlementRows(select.value);
}

async function loadEntitlementRows(cohortId) {
  var tbody = document.getElementById('admin-entitlement-body');
  if (!tbody || !cohortId) return;
  tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-faint)">Loading...</td></tr>';

  var res = await sb.from('cohort_plan_entitlements')
    .select('feature_id,plan_id,behavior,limit_value')
    .eq('cohort_id', cohortId)
    .order('feature_id')
    .order('plan_id');

  if (res.error || !res.data) {
    tbody.innerHTML = '<tr><td colspan="5" class="admin-red">Error loading entitlements</td></tr>';
    return;
  }

  // Group by feature for a cleaner view
  tbody.innerHTML = res.data.map(function(e) {
    var limitStr = e.limit_value === -1 ? '∞' : String(e.limit_value);
    var behaviorColor = e.behavior === 'off' ? 'admin-red' : (e.behavior === 'unlimited' ? 'admin-green' : '');
    return '<tr>' +
      '<td>' + e.feature_id + '</td>' +
      '<td>' + e.plan_id + '</td>' +
      '<td class="' + behaviorColor + '">' + e.behavior + '</td>' +
      '<td style="font-family:var(--mono)">' + limitStr + '</td>' +
      '<td>—</td>' +
      '</tr>';
  }).join('');
}

// ─── Cohort Charts ───
function renderCohortCharts(cohorts) {
  // 1. Sessions over time (adjusted to cohort open date)
  renderCohortSessionsChart();

  // 2. Cumulative Revenue (placeholder until Stripe data)
  renderCohortRevenueChart();

  // 3. Plan Distribution — stacked bar (Free/Pro per cohort)
  var planEl = document.getElementById('admin-cohort-plan-chart');
  if (planEl && typeof echarts !== 'undefined') {
    var planChart = echarts.init(planEl);
    var names = cohorts.map(function(c) { return c.display_id || c.name; });
    var t = seoChartTheme();
    planChart.setOption(Object.assign({}, t, {
      title: { text: 'Plan Distribution', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 } },
      legend: { data: ['Free', 'Pro'], textStyle: { color: '#7b829a', fontSize: 11 }, top: 4, right: 10 },
      grid: { top: 35, right: 20, bottom: 30, left: 40 },
      xAxis: { type: 'category', data: names, axisLabel: { color: '#7b829a', fontSize: 11 } },
      yAxis: { type: 'value', axisLabel: { color: '#7b829a', fontSize: 11 }, splitLine: { lineStyle: { color: '#e8eaef' } } },
      series: [
        { name: 'Free', type: 'bar', stack: 'plan', data: cohorts.map(function(c) { return c.free_count || 0; }), itemStyle: { color: '#8b929e' } },
        { name: 'Pro', type: 'bar', stack: 'plan', data: cohorts.map(function(c) { return c.pro_count || 0; }), itemStyle: { color: '#6b82a8' } }
      ]
    }), true);
    window.addEventListener('resize', function() { planChart.resize(); });
  }

  // 4. User Growth — cumulative signups
  renderCohortGrowthChart();
}

async function renderCohortRevenueChart() {
  var el = document.getElementById('admin-cohort-revenue-chart');
  if (!el || typeof echarts === 'undefined') return;
  var chart = echarts.init(el);
  // Placeholder until Stripe revenue data is wired
  chart.setOption({
    title: { text: 'Cumulative Revenue / Month', subtext: 'Waiting for Stripe integration', left: 'center', top: 'center', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, subtextStyle: { color: '#9ca3af', fontSize: 11 } }
  });
  window.addEventListener('resize', function() { chart.resize(); });
}

async function renderCohortGrowthChart() {
  var el = document.getElementById('admin-cohort-growth-chart');
  if (!el || typeof echarts === 'undefined') return;
  var chart = echarts.init(el);
  try {
    var res = await sb.from('profiles').select('created_at').order('created_at', { ascending: true });
    if (res.error || !res.data || !res.data.length) {
      chart.setOption({ title: { text: 'User Growth', subtext: 'No signup data yet', left: 'center', top: 'center', textStyle: { color: '#d1d5db', fontSize: 13 } } });
      return;
    }
    var weekMap = {};
    res.data.forEach(function(p) {
      var d = new Date(p.created_at);
      var wk = d.toISOString().slice(0, 10);
      weekMap[wk] = (weekMap[wk] || 0) + 1;
    });
    var dates = Object.keys(weekMap).sort();
    var cumulative = [], sum = 0;
    dates.forEach(function(d) { sum += weekMap[d]; cumulative.push(sum); });
    var t = seoChartTheme();
    chart.setOption(Object.assign({}, t, {
      title: { text: 'User Growth', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 } },
      grid: { top: 35, right: 20, bottom: 30, left: 40 },
      xAxis: { type: 'category', data: dates, axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10, rotate: 35 } },
      yAxis: { type: 'value', axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 11 }, splitLine: { lineStyle: { color: '#e8eaef' } } },
      series: [{ type: 'line', data: cumulative, smooth: true, lineStyle: { color: '#6b82a8', width: 2 }, itemStyle: { color: '#6b82a8' }, areaStyle: { color: 'rgba(107,130,168,0.06)' }, symbol: 'circle', symbolSize: 4 }]
    }), true);
    window.addEventListener('resize', function() { chart.resize(); });
  } catch (e) { console.error('[Admin] Growth chart error:', e); }
}

async function renderCohortSessionsChart() {
  var el = document.getElementById('admin-cohort-sessions-chart');
  if (!el || typeof echarts === 'undefined') return;
  var chart = echarts.init(el);
  try {
    var since = new Date(Date.now() - 30 * 86400000).toISOString();
    var res = await sb.from('user_sessions').select('started_at').gte('started_at', since).order('started_at', { ascending: true });
    if (res.error || !res.data || !res.data.length) {
      chart.setOption({ title: { text: 'Sessions / Day', subtext: 'Sessions will appear after launch', left: 'center', top: 'center', textStyle: { color: '#d1d5db', fontSize: 13 } } });
      return;
    }
    var dayMap = {};
    res.data.forEach(function(s) {
      var d = new Date(s.started_at).toISOString().slice(0, 10);
      dayMap[d] = (dayMap[d] || 0) + 1;
    });
    var dates = Object.keys(dayMap).sort();
    var counts = dates.map(function(d) { return dayMap[d]; });
    var t = seoChartTheme();
    chart.setOption(Object.assign({}, t, {
      title: { text: 'Sessions / Day (30d)', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 } },
      grid: { top: 35, right: 20, bottom: 30, left: 40 },
      xAxis: { type: 'category', data: dates, axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10, rotate: 35 } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 11 }, splitLine: { lineStyle: { color: '#e8eaef' } } },
      series: [{ type: 'bar', data: counts, itemStyle: { color: '#5b8a72', borderRadius: [3,3,0,0] } }]
    }), true);
    window.addEventListener('resize', function() { chart.resize(); });
  } catch (e) { console.error('[Admin] Sessions chart error:', e); }
}

// ═══════════════════════════════════════════════════════════
// TAB 3 (was 4): USERS + SESSIONS
// ═══════════════════════════════════════════════════════════

async function loadUsersTab() {
  console.log('[Admin] loadUsersTab');
  try {
    var res = await sb.rpc('get_user_overview');
    if (res.error) { console.error('[Admin] Users RPC error:', res.error); return; }
    var d = res.data;
    if (!d) return;

    setAdminText('au-total', fmtAdminNum(d.total_users));
    setAdminText('au-active-7d', fmtAdminNum(d.active_7d));
    setAdminText('au-new-7d', fmtAdminNum(d.new_7d));
    setAdminText('au-pro', fmtAdminNum(d.pro_users));
    setAdminText('au-filters', fmtAdminNum(d.with_filters));
    setAdminText('au-resumes', fmtAdminNum(d.with_resumes));
    setAdminText('au-connections', fmtAdminNum(d.with_connections));

    // Session stats
    if (d.sessions_7d != null) {
      setAdminText('au-sessions-7d', fmtAdminNum(d.sessions_7d));
      setAdminText('au-avg-duration', d.avg_duration_min != null ? d.avg_duration_min + 'm' : '—');
      setAdminText('au-device-desktop', fmtAdminNum(d.desktop_sessions || 0));
      setAdminText('au-device-mobile', fmtAdminNum(d.mobile_sessions || 0));
    }

    // Signup chart
    if (d.signup_by_week && d.signup_by_week.length && typeof echarts !== 'undefined') {
      var chartEl = document.getElementById('admin-signup-chart');
      if (chartEl) {
        var chart = echarts.init(chartEl);
        chart.setOption({
          tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 } },
          grid: { left: 50, right: 16, top: 12, bottom: 32 },
          xAxis: { type: 'category', data: d.signup_by_week.map(function(w) { return w.week; }), axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10, rotate: 35 } },
          yAxis: { type: 'value', axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10 }, splitLine: { lineStyle: { color: '#e8eaef' } } },
          series: [{ type: 'bar', data: d.signup_by_week.map(function(w) { return w.count; }), itemStyle: { borderRadius: [4, 4, 0, 0], color: '#6b82a8' }, barWidth: '60%' }]
        });
        window.addEventListener('resize', function() { chart.resize(); });
      }
    }
  } catch (err) {
    console.error('[Admin] loadUsersTab error:', err);
  }
}

// ═══════════════════════════════════════════════════════════
// TAB 4: SEO / DATA COVERAGE
// ═══════════════════════════════════════════════════════════
// v3.42 — 9-tool SEO dashboard, date range pickers, auth-only fetch

var _seoUrl = '';
var _seoDateFrom = '';
var _seoDateTo = '';
var _seoCharts = {};
var _seoData = {};

function setSeoUrl(url) {
  _seoUrl = url;
  loadSeoTab();
}

function seoDateChanged() {
  var from = document.getElementById('seo-date-from');
  var to = document.getElementById('seo-date-to');
  _seoDateFrom = from ? from.value : '';
  _seoDateTo = to ? to.value : '';
  loadSeoTab();
}

async function loadSeoTab() {
  console.log('[Admin] loadSeoTab url=' + (_seoUrl || 'ALL') + ' from=' + (_seoDateFrom || 'all') + ' to=' + (_seoDateTo || 'now'));
  try {
    await fetchSeoData();
    // Small delay to ensure panel is visible before chart init
    await new Promise(function(r) { setTimeout(r, 50); });
    renderSeoCharts();
    renderSeoSidePanel();
    // Resize all charts after render (handles hidden panel → visible transition)
    setTimeout(function() {
      Object.keys(_seoCharts).forEach(function(k) {
        if (_seoCharts[k]) _seoCharts[k].resize();
      });
    }, 200);
  } catch(err) { console.error('[Admin] SEO load error:', err); }
}

// ─── Data Fetching (auth-only) ───
async function fetchSeoData() {
  var hdr = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY };
  // Try auth session if available (for RLS-protected tables), fall back to anon key
  try {
    var session = (await sb.auth.getSession()).data.session;
    if (session) hdr = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + session.access_token };
  } catch(e) {}
  var authHeaders = hdr;

  var urlFilter = _seoUrl ? '&url=eq.' + encodeURIComponent(_seoUrl) : '';
  var dateFilter = '';
  if (_seoDateFrom) dateFilter += '&date=gte.' + _seoDateFrom;
  if (_seoDateTo) dateFilter += '&date=lte.' + _seoDateTo;

  var fetches = {
    site_daily:  fetch(SUPABASE_URL + '/rest/v1/seo_site_daily?select=*&order=date.asc' + dateFilter, { headers: authHeaders }),
    page_daily:  fetch(SUPABASE_URL + '/rest/v1/seo_page_daily?select=*&order=date.asc' + dateFilter + urlFilter, { headers: authHeaders }),
    tech_audits: fetch(SUPABASE_URL + '/rest/v1/seo_tech_audits?select=*&order=date.asc' + dateFilter + urlFilter, { headers: authHeaders }),
    index_status:fetch(SUPABASE_URL + '/rest/v1/seo_index_status?select=*&order=checked_at.desc' + (_seoUrl ? '&url=eq.' + encodeURIComponent(_seoUrl) : '') + '&limit=20', { headers: authHeaders }),
    conversions: fetch(SUPABASE_URL + '/rest/v1/seo_conversions?select=*&order=date.asc' + dateFilter, { headers: authHeaders }),
    gsc_queries: fetch(SUPABASE_URL + '/rest/v1/seo_gsc_daily?select=query,clicks,impressions,ctr,position' + dateFilter + (_seoUrl ? '&url=eq.' + encodeURIComponent(_seoUrl) : '&url=eq.*') + '&order=clicks.desc&limit=50', { headers: authHeaders }),
  };

  var keys = Object.keys(fetches);
  var responses = await Promise.all(keys.map(function(k) { return fetches[k].then(function(r) { return r.json(); }).catch(function() { return []; }); }));
  _seoData = {};
  keys.forEach(function(k, i) { _seoData[k] = Array.isArray(responses[i]) ? responses[i] : []; });
  console.log('[Admin] SEO data loaded:', Object.keys(_seoData).map(function(k) { return k + '=' + _seoData[k].length; }).join(', '));
}

// ─── Chart Rendering ───
function renderSeoCharts() {
  renderSeoStatCards();
  renderGscChart();
  renderPsiChart();
  renderCruxChart();
  renderYltChart();
  renderCloudflareChart();
}


function renderSeoStatCards() {
  var techAudits = _seoData.tech_audits || [];
  var indexStatus = _seoData.index_status || [];
  var siteDailyArr = _seoData.site_daily || [];

  // PSI avg performance (latest mobile) — average across ALL pages
  var psiMobile = techAudits.filter(function(r) { return r.source === 'psi_mobile'; });
  var psiPerf = null;
  if (psiMobile.length) {
    var latestPsiDate = psiMobile[psiMobile.length - 1].date;
    var latestPsiPages = psiMobile.filter(function(r) { return r.date === latestPsiDate; });
    var perfSum = 0;
    latestPsiPages.forEach(function(r) { if (r.metrics) perfSum += r.metrics.performance || 0; });
    psiPerf = latestPsiPages.length ? Math.round(perfSum / latestPsiPages.length) : null;
  }

  // YLT avg
  var yltData = techAudits.filter(function(r) { return r.source === 'yellowlab'; });
  var yltAvg = yltData.length ? Math.round(yltData.reduce(function(s, r) { return s + (r.score || 0); }, 0) / yltData.length) : null;

  // Indexed pages
  var indexed = 0, totalInspected = 0;
  var seen = {};
  indexStatus.forEach(function(r) { if (seen[r.url]) return; seen[r.url] = true; totalInspected++; if (r.verdict === 'PASS') indexed++; });

  // CF traffic (latest day)
  var cfData = techAudits.filter(function(r) { return r.source === 'cloudflare'; });
  var latestCf = cfData.length ? cfData[cfData.length - 1] : null;
  var cfRequests = latestCf && latestCf.metrics ? latestCf.metrics.total_requests : null;

  // GSC clicks (latest day)
  var latestSite = siteDailyArr.length ? siteDailyArr[siteDailyArr.length - 1] : null;
  var gscClicks = latestSite ? (latestSite.total_clicks || 0) : null;

  // Set values via DOM
  function setKpi(id, value, colorClass) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = value != null ? String(value) : '\u2014';
    el.className = 'stat-val';
    if (colorClass) el.classList.add(colorClass);
  }

  var psiColor = psiPerf >= 90 ? 'admin-green' : psiPerf >= 50 ? 'admin-amber' : psiPerf != null ? 'admin-red' : '';
  var yltColor = yltAvg >= 90 ? 'admin-green' : yltAvg >= 50 ? 'admin-amber' : yltAvg != null ? 'admin-red' : '';
  var idxColor = totalInspected > 0 && indexed === totalInspected ? 'admin-green' : indexed > 0 ? 'admin-amber' : totalInspected > 0 ? 'admin-red' : '';

  setKpi('seo-kpi-psi', psiPerf, psiColor);
  setKpi('seo-kpi-ylt', yltAvg, yltColor);
  setKpi('seo-kpi-indexed', totalInspected > 0 ? indexed + '/' + totalInspected : null, idxColor);
  setKpi('seo-kpi-cf', cfRequests != null ? cfRequests.toLocaleString() : null);
  setKpi('seo-kpi-gsc', gscClicks != null ? gscClicks.toLocaleString() : null);
  var gscDateEl = document.getElementById('seo-kpi-gsc-date');
  if (gscDateEl) gscDateEl.textContent = latestSite ? 'sampled ' + latestSite.date : '';
}

function seoChartTheme() {
  return {
    grid: { top: 35, right: 20, bottom: 30, left: 50, containLabel: true },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 } },
  };
}

function seoAxis() {
  return {
    xAxis: { type: 'category', axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10 }, axisLine: { lineStyle: { color: '#e8eaef' } } },
    yAxis: { type: 'value', axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10 }, splitLine: { lineStyle: { color: '#e8eaef' } } },
  };
}

function initSeoChart(elId) {
  var el = document.getElementById(elId);
  if (!el) return null;
  if (_seoCharts[elId]) { _seoCharts[elId].dispose(); }
  _seoCharts[elId] = echarts.init(el, null, { renderer: 'canvas' });
  return _seoCharts[elId];
}

function seoNoData(chart, title, msg) {
  chart.setOption({
    graphic: { elements: [{ type: 'group', left: 'center', top: 'middle', children: [
      { type: 'text', left: 'center', top: -10, style: { text: msg || 'No data yet', fill: '#9ca3af', fontSize: 13, fontFamily: 'Outfit' } },
      { type: 'text', left: 'center', top: 12, style: { text: 'Run sync to populate', fill: '#d1d5db', fontSize: 11, fontFamily: 'Outfit' } }
    ] }] }
  }, true);
}

// 1. PostHog Traffic
function renderTrafficChart() {
  var chart = initSeoChart('seo-chart-traffic');
  if (!chart) return;
  var convs = _seoData.conversions || [];
  var byDate = {};
  convs.forEach(function(r) { if (r.event_type === 'pageview') byDate[r.date] = (byDate[r.date] || 0) + (r.count || 0); });
  var dates = Object.keys(byDate).sort();
  if (!dates.length) { seoNoData(chart, 'PostHog Traffic', 'No pageview data yet'); return; }
  var t = seoChartTheme(), ax = seoAxis();
  chart.setOption(Object.assign({}, t, {
    title: { text: 'PostHog Traffic', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
    xAxis: Object.assign({}, ax.xAxis, { data: dates }),
    yAxis: ax.yAxis,
    series: [{ type: 'bar', data: dates.map(function(d) { return byDate[d]; }), itemStyle: { color: '#8878a0' }, barMaxWidth: 16 }]
  }), true);
}

// 2. GSC
function renderGscChart() {
  var chart = initSeoChart('seo-chart-gsc');
  if (!chart) return;
  var data = _seoUrl ? (_seoData.page_daily || []) : (_seoData.site_daily || []);
  if (!data.length) { seoNoData(chart, 'Google Search Console'); return; }
  var dates = data.map(function(r) { return r.date; });
  var t = seoChartTheme(), ax = seoAxis();
  chart.setOption(Object.assign({}, t, {

    legend: { data: ['Clicks', 'Impressions'], textStyle: { color: '#7b829a', fontSize: 10 }, top: 4, right: 10 },
    grid: { top: 35, right: 60, bottom: 30, left: 50 },
    xAxis: Object.assign({}, ax.xAxis, { data: dates }),
    yAxis: [ax.yAxis, { type: 'value', axisLabel: { color: '#7b829a', fontSize: 10 }, splitLine: { show: false } }],
    series: [
      { name: 'Clicks', type: 'bar', data: data.map(function(r) { return r.clicks || r.total_clicks || 0; }), itemStyle: { color: '#6b82a8' }, barMaxWidth: 12 },
      { name: 'Impressions', type: 'line', yAxisIndex: 1, data: data.map(function(r) { return r.impressions || r.total_impressions || 0; }), lineStyle: { color: '#5b8a72' }, itemStyle: { color: '#5b8a72' }, smooth: true, symbol: 'none' }
    ]
  }), true);
}

// 3. PSI 4 categories
function renderPsiChart() {
  var chart = initSeoChart('seo-chart-psi');
  if (!chart) return;
  var audits = (_seoData.tech_audits || []).filter(function(r) { return r.source === 'psi_mobile'; });
  if (!audits.length) { seoNoData(chart, 'PageSpeed Insights (Mobile)'); return; }

  // Logarithmic transform: compress 0-100 scale to show detail in 80-100 range
  // Use log10(101-v) inverted so higher scores get more visual space
  function psiLog(v) { if (v == null) return null; return v; }

  if (_seoUrl) {
    // Single URL — bar chart of latest scores (matches all-pages style)
    var pageAudits = audits.filter(function(r) { return r.url === _seoUrl; });
    if (!pageAudits.length) pageAudits = audits;
    var latest = pageAudits[pageAudits.length - 1];
    var m = latest.metrics || {};
    var labels = ['Performance', 'SEO', 'Accessibility', 'Best Practices'];
    var values = [m.performance || 0, m.seo || 0, m.accessibility || 0, m.best_practices || 0];
    var colors = ['#a08858', '#5b8a72', '#6b82a8', '#8878a0'];
    var t = seoChartTheme(), ax = seoAxis();
    chart.setOption(Object.assign({}, t, {
      title: { text: (new URL(_seoUrl).pathname) + ' — ' + (latest.date || ''), textStyle: { color: '#9ca3af', fontSize: 11, fontFamily: 'JetBrains Mono' }, left: 4, top: 4 },
      grid: { top: 35, right: 20, bottom: 30, left: 40 },
      xAxis: { type: 'category', data: labels, axisLabel: { color: '#7b829a', fontSize: 12 } },
      yAxis: Object.assign({}, ax.yAxis, { min: 60, max: 100, interval: 10, axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 11, formatter: function(v) { return Math.round(v); } } }),
      series: [{ type: 'bar', data: values.map(function(v, i) { return { value: v, itemStyle: { color: colors[i] } }; }),
        barMaxWidth: 50, itemStyle: { borderRadius: [4,4,0,0] },
        label: { show: true, position: 'top', color: '#6b7280', fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, formatter: function(p) { return p.value; } } }]
    }), true);
  } else {
    // Aggregate — average across all pages for latest date
    var latestDate = audits[audits.length - 1].date;
    var latest = audits.filter(function(r) { return r.date === latestDate; });
    var avgMetrics = { performance: 0, seo: 0, accessibility: 0, best_practices: 0 };
    latest.forEach(function(r) {
      if (r.metrics) {
        avgMetrics.performance += r.metrics.performance || 0;
        avgMetrics.seo += r.metrics.seo || 0;
        avgMetrics.accessibility += r.metrics.accessibility || 0;
        avgMetrics.best_practices += r.metrics.best_practices || 0;
      }
    });
    var n = latest.length || 1;
    Object.keys(avgMetrics).forEach(function(k) { avgMetrics[k] = Math.round(avgMetrics[k] / n); });
    
    var labels = ['Performance', 'SEO', 'Accessibility', 'Best Practices'];
    var values = [avgMetrics.performance, avgMetrics.seo, avgMetrics.accessibility, avgMetrics.best_practices];
    var colors = ['#a08858', '#5b8a72', '#6b82a8', '#8878a0'];
    var t = seoChartTheme(), ax = seoAxis();
    chart.setOption(Object.assign({}, t, {
      title: { text: 'Avg Across ' + n + ' Pages', textStyle: { color: '#9ca3af', fontSize: 11, fontFamily: 'JetBrains Mono' }, left: 4, top: 4 },
      grid: { top: 35, right: 20, bottom: 30, left: 40 },
      xAxis: { type: 'category', data: labels, axisLabel: { color: '#7b829a', fontSize: 11 } },
      yAxis: Object.assign({}, ax.yAxis, { min: 60, max: 100, interval: 10, axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10, formatter: function(v) { return Math.round(v); } } }),
      series: [{ type: 'bar', data: values.map(function(v, i) { return { value: v, itemStyle: { color: colors[i] } }; }),
        barMaxWidth: 50, itemStyle: { borderRadius: [4,4,0,0] },
        label: { show: true, position: 'top', color: '#6b7280', fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, formatter: function(p) { return p.value; } } }]
    }), true);
  }
}

// 4. CrUX
function renderCruxChart() {
  var chart = initSeoChart('seo-chart-crux');
  if (!chart) return;
  var cruxData = (_seoData.tech_audits || []).filter(function(r) { return r.source === 'crux'; });
  if (!cruxData.length) { seoNoData(chart, 'Chrome UX Report', 'Not enough traffic for CrUX data yet'); return; }
  var latest = cruxData[cruxData.length - 1];
  var m = latest.metrics || {};
  var metricNames = Object.keys(m);
  var labels = metricNames.map(function(k) { return k.replace(/_/g, ' ').toUpperCase(); });
  var p75s = metricNames.map(function(k) { return m[k] && m[k].p75 ? m[k].p75 : 0; });
  var t = seoChartTheme(), ax = seoAxis();
  chart.setOption(Object.assign({}, t, {

    grid: { top: 35, right: 20, bottom: 50, left: 60 },
    xAxis: { type: 'category', data: labels, axisLabel: { color: '#7b829a', fontSize: 9, rotate: 30 } },
    yAxis: ax.yAxis,
    series: [{ type: 'bar', data: p75s, itemStyle: { color: function(p) { return ['#5b8a72','#6b82a8','#a08858','#8878a0','#c06060'][p.dataIndex % 5]; } }, barMaxWidth: 30 }]
  }), true);
}

// 5. Yellow Lab Tools
function renderYltChart() {
  var chart = initSeoChart('seo-chart-ylt');
  if (!chart) return;
  var yltData = (_seoData.tech_audits || []).filter(function(r) { return r.source === 'yellowlab'; });
  if (!yltData.length) { seoNoData(chart, 'Yellow Lab Tools'); return; }

  if (_seoUrl) {
    // Single URL — radar of latest category scores (matches all-pages style)
    var pageData = yltData.filter(function(r) { return r.url === _seoUrl; });
    if (!pageData.length) { seoNoData(chart, 'YLT — no data for this URL'); return; }
    var latest = pageData[pageData.length - 1];
    var score = latest.score || 0;
    var cats = latest.metrics && latest.metrics.categories ? latest.metrics.categories : {};
    var catEntries = Object.values(cats).map(function(c) {
      return { name: c.label || 'Unknown', value: c.score || 0 };
    });
    if (!catEntries.length) { seoNoData(chart, 'YLT — no category data'); return; }

    var t = seoChartTheme();
    chart.setOption(Object.assign({}, t, {
      title: { text: score + '/100 — ' + (new URL(_seoUrl).pathname), textStyle: { color: '#9ca3af', fontSize: 11, fontFamily: 'JetBrains Mono' }, left: 4, top: 4 },
      radar: {
        indicator: catEntries.map(function(c) { return { name: c.name, max: 100 }; }),
        shape: 'polygon',
        axisName: { color: '#7b829a', fontSize: 10 },
        splitArea: { areaStyle: { color: ['rgba(59,130,246,0.02)', 'rgba(59,130,246,0.04)'] } },
        splitLine: { lineStyle: { color: '#e8eaef' } },
        axisLine: { lineStyle: { color: '#e8eaef' } }
      },
      series: [{ type: 'radar', data: [{
        value: catEntries.map(function(c) { return c.value; }),
        name: new URL(_seoUrl).pathname,
        lineStyle: { color: '#eab308', width: 2 },
        itemStyle: { color: '#eab308' },
        areaStyle: { color: 'rgba(234,179,8,0.15)' }
      }] }],
      tooltip: { trigger: 'item', formatter: function(p) {
        var lines = catEntries.map(function(c, i) { return c.name + ': ' + p.value[i]; });
        return '<b>' + score + '/100</b><br/>' + lines.join('<br/>');
      } }
    }), true);
  } else {
    // All Pages: blended average score + category radar
    var latestDate = yltData[yltData.length - 1].date;
    var latest = yltData.filter(function(r) { return r.date === latestDate; });
    var avgScore = Math.round(latest.reduce(function(s, r) { return s + (r.score || 0); }, 0) / (latest.length || 1));
    
    // Aggregate categories across all pages
    var catTotals = {}, catCount = 0;
    latest.forEach(function(r) {
      if (r.metrics && r.metrics.categories) {
        catCount++;
        Object.keys(r.metrics.categories).forEach(function(k) {
          var cat = r.metrics.categories[k];
          if (!catTotals[k]) catTotals[k] = { label: cat.label || k, total: 0, count: 0 };
          catTotals[k].total += cat.score || 0;
          catTotals[k].count++;
        });
      }
    });
    
    var catEntries = Object.values(catTotals).map(function(c) {
      return { name: c.label, value: Math.round(c.total / c.count) };
    });
    
    var t = seoChartTheme();
    chart.setOption(Object.assign({}, t, {
      title: { text: 'Avg: ' + avgScore + '/100 (' + latest.length + ' pages)', textStyle: { color: '#9ca3af', fontSize: 11, fontFamily: 'JetBrains Mono' }, left: 4, top: 4 },
      radar: {
        indicator: catEntries.map(function(c) { return { name: c.name, max: 100 }; }),
        shape: 'polygon',
        axisName: { color: '#7b829a', fontSize: 9 },
        splitArea: { areaStyle: { color: ['rgba(59,130,246,0.02)', 'rgba(59,130,246,0.04)'] } },
        splitLine: { lineStyle: { color: '#e8eaef' } },
        axisLine: { lineStyle: { color: '#e8eaef' } }
      },
      series: [{ type: 'radar', data: [{
        value: catEntries.map(function(c) { return c.value; }),
        name: 'Avg Score',
        lineStyle: { color: '#eab308', width: 2 },
        itemStyle: { color: '#eab308' },
        areaStyle: { color: 'rgba(234,179,8,0.15)' }
      }] }],
      tooltip: { trigger: 'item', formatter: function(p) {
        var lines = catEntries.map(function(c, i) { return c.name + ': ' + p.value[i]; });
        return '<b>Avg across ' + catCount + ' pages</b><br/>' + lines.join('<br/>');
      } }
    }), true);
  }
}

// 6. Cloudflare
function renderCloudflareChart() {
  var chart = initSeoChart('seo-chart-cf');
  if (!chart) return;
  var cfData = (_seoData.tech_audits || []).filter(function(r) { return r.source === 'cloudflare'; });
  if (!cfData.length) { seoNoData(chart, 'Cloudflare Traffic'); return; }
  var dates = cfData.map(function(r) { return r.date; });
  var t = seoChartTheme(), ax = seoAxis();
  chart.setOption(Object.assign({}, t, {

    legend: { data: ['Requests', 'Page Views', 'Uniques'], textStyle: { color: '#7b829a', fontSize: 10 }, top: 4, right: 10 },
    grid: { top: 35, right: 60, bottom: 30, left: 50 },
    xAxis: Object.assign({}, ax.xAxis, { data: dates }),
    yAxis: [ax.yAxis, { type: 'value', axisLabel: { color: '#7b829a', fontSize: 10 }, splitLine: { show: false } }],
    series: [
      { name: 'Requests', type: 'bar', data: cfData.map(function(r) { return r.metrics && r.metrics.total_requests || 0; }), itemStyle: { color: 'rgba(77,142,255,0.3)' }, barMaxWidth: 16 },
      { name: 'Page Views', type: 'line', data: cfData.map(function(r) { return r.metrics && r.metrics.page_views || 0; }), lineStyle: { color: '#f97316' }, itemStyle: { color: '#f97316' }, symbol: 'circle', symbolSize: 5 },
      { name: 'Uniques', type: 'line', yAxisIndex: 1, data: cfData.map(function(r) { return r.metrics && r.metrics.unique_visitors || 0; }), lineStyle: { color: '#5b8a72' }, itemStyle: { color: '#5b8a72' }, symbol: 'circle', symbolSize: 5 }
    ]
  }), true);
}

// ─── Side Panel ───
function renderSeoSidePanel() {
  renderUrlInspection();
  renderGscQueries();
  renderPsiDrilldown();
  renderDfsAudit();
  renderKnowledgeGraph();
}

function renderUrlInspection() {
  var el = document.getElementById('seo-side-inspection');
  if (!el) return;
  var data = _seoData.index_status || [];
  if (!data.length) {
    el.innerHTML = '<div class="seo-empty">No inspection data yet. Requires Google Service Account key.<br><a href="#" onclick="triggerSeoSync([&#39;gsc_inspect&#39;]);return false;">Run inspection</a></div>';
    return;
  }

  if (_seoUrl) {
    var latest = data.find(function(r) { return r.url === _seoUrl; }) || data[0];
    var vc = latest.verdict === 'PASS' ? 'admin-green' : latest.verdict === 'NEUTRAL' ? 'admin-amber' : 'admin-red';
    el.innerHTML =
      '<div class="seo-metric-row">' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Verdict</span> <span class="seo-metric-value ' + vc + '">' + (latest.verdict || '\u2014') + '</span></div>' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Coverage</span> <span class="seo-metric-value">' + (latest.coverage_state || '\u2014') + '</span></div>' +
      '</div>' +
      '<div class="seo-metric-row">' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Indexing</span> <span class="seo-metric-value">' + (latest.indexing_state || '\u2014') + '</span></div>' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Last Crawl</span> <span class="seo-metric-value">' + (latest.last_crawl_time ? new Date(latest.last_crawl_time).toLocaleDateString() : '\u2014') + '</span></div>' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Mobile</span> <span class="seo-metric-value">' + (latest.mobile_usability || '\u2014') + '</span></div>' +
      '</div>';
  } else {
    // All pages: show horizontal bar chart of verdict per URL
    var seen = {}, rows = [];
    data.forEach(function(r) { if (seen[r.url]) return; seen[r.url] = true; rows.push(r); });
    
    var pass = 0, fail = 0, other = 0;
    rows.forEach(function(r) { if (r.verdict === 'PASS') pass++; else if (r.verdict === 'FAIL' || r.verdict === 'ERROR') fail++; else other++; });
    
    var chartHtml = '<div style="margin-bottom:12px;display:flex;gap:16px;">' +
      '<div><span class="seo-metric-value admin-green" style="font-size:18px;">' + pass + '</span> <span class="seo-metric-label">indexed</span></div>' +
      '<div><span class="seo-metric-value admin-amber" style="font-size:18px;">' + other + '</span> <span class="seo-metric-label">pending</span></div>' +
      '<div><span class="seo-metric-value admin-red" style="font-size:18px;">' + fail + '</span> <span class="seo-metric-label">failed</span></div>' +
    '</div>';
    
    // Per-URL status table
    chartHtml += '<div style="max-height:200px;overflow-y:auto;">';
    chartHtml += '<table class="admin-platform-table" style="font-size:11px;"><thead><tr><th>URL</th><th>Status</th><th>Coverage</th></tr></thead><tbody>';
    rows.forEach(function(r) {
      var path = '/';
      try { path = new URL(r.url).pathname || '/'; } catch(e) {}
      var vc = r.verdict === 'PASS' ? 'admin-green' : r.verdict === 'NEUTRAL' ? 'admin-amber' : 'admin-red';
      chartHtml += '<tr><td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + path + '</td>' +
        '<td class="' + vc + '">' + (r.verdict || '—') + '</td>' +
        '<td style="font-size:10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;">' + (r.coverage_state || '—') + '</td></tr>';
    });
    chartHtml += '</tbody></table></div>';
    el.innerHTML = chartHtml;
  }
}

function renderGscQueries() {
  var el = document.getElementById('seo-side-queries');
  if (!el) return;
  var queries = _seoData.gsc_queries || [];
  if (!queries.length) { el.innerHTML = '<div class="seo-empty">No search queries yet</div>'; return; }
  var qMap = {};
  queries.forEach(function(r) { if (!r.query) return; if (!qMap[r.query]) qMap[r.query] = { clicks:0, impressions:0, position:0, count:0 }; qMap[r.query].clicks += r.clicks||0; qMap[r.query].impressions += r.impressions||0; qMap[r.query].position += r.position||0; qMap[r.query].count++; });
  var sorted = Object.entries(qMap).sort(function(a,b) { return b[1].clicks - a[1].clicks; }).slice(0,20);
  el.innerHTML = '<table class="admin-platform-table"><thead><tr><th>Query</th><th>Clicks</th><th>Impressions</th><th>Avg Position</th></tr></thead><tbody>' +
    sorted.map(function(e) {
      var q = e[0], d = e[1];
      var pos = d.count > 0 ? (d.position / d.count).toFixed(1) : '\u2014';
      return '<tr><td class="admin-platform-name" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + q + '</td>' +
        '<td class="admin-green">' + d.clicks + '</td>' +
        '<td>' + d.impressions + '</td>' +
        '<td>' + pos + '</td></tr>';
    }).join('') + '</tbody></table>';
}

function renderKnowledgeGraph() {
  var el = document.getElementById('seo-side-kg');
  if (!el) return;
  var kgData = (_seoData.tech_audits || []).filter(function(r) { return r.source === 'knowledge_graph'; });
  if (!kgData.length) { el.innerHTML = '<div class="seo-empty">No Knowledge Graph data yet</div>'; return; }
  var entities = (kgData[kgData.length-1].metrics && kgData[kgData.length-1].metrics.entities) || [];
  if (!entities.length) { el.innerHTML = '<div class="seo-empty">No entities found</div>'; return; }
  el.innerHTML = entities.map(function(e) {
    return '<div class="seo-entity-row">' +
      '<span class="seo-entity-name">' + (e.name || '\u2014') + '</span>' +
      '<span class="seo-entity-type">' + (e.type || '') + '</span>' +
      (e.score ? '<span class="seo-entity-score">' + e.score.toFixed(1) + '</span>' : '') +
    '</div>';
  }).join('');
}

function renderPsiDrilldown() {
  var el = document.getElementById('seo-side-psi');
  if (!el) return;
  var audits = (_seoData.tech_audits || []).filter(function(r) { return r.source === 'psi_mobile'; });
  if (!audits.length) { el.innerHTML = '<div class="seo-empty">No PSI data yet</div>'; return; }
  var latest = audits[audits.length-1];
  var issues = latest.issues || [];
  var m = latest.metrics || {};
  var vitals = [
    { label:'FCP', val:m.fcp?(m.fcp/1000).toFixed(2)+'s':'\u2014', good:m.fcp<1800 },
    { label:'LCP', val:m.lcp?(m.lcp/1000).toFixed(2)+'s':'\u2014', good:m.lcp<2500 },
    { label:'CLS', val:m.cls!=null?m.cls.toFixed(3):'\u2014', good:m.cls<0.1 },
    { label:'TBT', val:m.tbt!=null?Math.round(m.tbt)+'ms':'\u2014', good:m.tbt<200 },
  ];
  var html = '<div class="seo-metric-row" style="gap:24px;">';
  vitals.forEach(function(v) {
    html += '<div class="seo-vital"><div class="seo-vital-value ' + (v.good ? 'admin-green' : 'admin-red') + '">' + v.val + '</div><div class="seo-vital-label">' + v.label + '</div></div>';
  });
  html += '</div>';
  if (issues.length > 0) {
    html += '<div class="seo-issue-list">' + issues.slice(0,8).map(function(i) {
      return '<div class="seo-issue-item">' + (i.title || i.id) + '</div>';
    }).join('') + '</div>';
  } else {
    html += '<div class="seo-metric-row"><span class="seo-metric-value admin-green">\u2713 No issues flagged</span></div>';
  }
  el.innerHTML = html;
}


// ─── DataForSEO On-Page Audit ───
function renderDfsAudit() {
  var el = document.getElementById('seo-side-dfs');
  if (!el) return;
  var dfsData = (_seoData.tech_audits || []).filter(function(r) { return r.source === 'dataforseo'; });
  if (!dfsData.length) { el.innerHTML = '<div class="seo-empty">No DataForSEO data yet \u2014 <a href="#" onclick="triggerSeoSync([&#39;dataforseo&#39;]);return false;">run sync</a></div>'; return; }

  if (_seoUrl) {
    var latest = dfsData.filter(function(r) { return r.url === _seoUrl; });
    latest = latest.length ? latest[latest.length - 1] : dfsData[dfsData.length - 1];
    var m = latest.metrics || {};
    var issues = latest.issues || [];
    var sc = latest.score;
    var scColor = sc >= 90 ? 'admin-green' : sc >= 50 ? 'admin-amber' : sc != null ? 'admin-red' : '';
    var scDisplay = sc != null ? sc : '\u2014';
    el.innerHTML =
      '<div class="seo-metric-row">' +
        '<div class="seo-metric-item"><span class="seo-metric-label">On-Page Score</span> <span class="seo-metric-value ' + scColor + '" style="font-size:22px;">' + scDisplay + '</span></div>' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Checks</span> <span class="seo-metric-value"><span class="admin-green">' + (m.checks_passed || 0) + '</span>/<span>' + (m.checks_total || 0) + '</span></span></div>' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Status</span> <span class="seo-metric-value">' + (m.status_code || '\u2014') + '</span></div>' +
      '</div>' +
      '<div class="seo-metric-row">' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Title</span> <span class="seo-metric-value" title="' + (m.title || '').replace(/"/g, '&quot;') + '">' + (m.title_length || 0) + ' chars</span></div>' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Desc</span> <span class="seo-metric-value">' + (m.description_length || 0) + ' chars</span></div>' +
        '<div class="seo-metric-item"><span class="seo-metric-label">H1/H2/H3</span> <span class="seo-metric-value">' + (m.h1_count||0) + '/' + (m.h2_count||0) + '/' + (m.h3_count||0) + '</span></div>' +
      '</div>' +
      '<div class="seo-metric-row">' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Int Links</span> <span class="seo-metric-value">' + (m.internal_links || 0) + '</span></div>' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Ext Links</span> <span class="seo-metric-value">' + (m.external_links || 0) + '</span></div>' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Images</span> <span class="seo-metric-value">' + (m.images_count || 0) + (m.images_without_alt ? ' <span class="admin-amber">(' + m.images_without_alt + ' no alt)</span>' : '') + '</span></div>' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Size</span> <span class="seo-metric-value">' + (m.page_size ? Math.round(m.page_size/1024) + 'KB' : '\u2014') + '</span></div>' +
      '</div>' +
      (issues.length > 0 ? '<div style="margin-top:8px;font-size:10px;text-transform:uppercase;color:var(--text-faint);font-weight:600;letter-spacing:0.5px;">Failed Checks (' + issues.length + ')</div><div class="seo-issue-list">' + issues.slice(0,10).map(function(i) { return '<div class="seo-issue-item">\u2717 ' + (i.message || i.check || '\u2014') + '</div>'; }).join('') + '</div>' : '<div class="seo-metric-row" style="margin-top:4px;"><span class="seo-metric-value admin-green">\u2713 All checks passed</span></div>');
  } else {
    // Aggregate — table of all pages with scores
    var latestDate = dfsData[dfsData.length - 1].date;
    var latest = dfsData.filter(function(r) { return r.date === latestDate; });
    var avgScore = latest.reduce(function(s, r) { return s + (r.score || 0); }, 0);
    avgScore = latest.length ? Math.round(avgScore / latest.length) : 0;
    var avgColor = avgScore >= 90 ? 'admin-green' : avgScore >= 50 ? 'admin-amber' : 'admin-red';
    el.innerHTML = '<div style="margin-bottom:8px;"><span class="seo-metric-label">Avg On-Page Score</span> <span class="seo-metric-value ' + avgColor + '" style="font-size:18px;margin-left:6px;">' + avgScore + '</span></div>' +
      '<table class="admin-platform-table"><thead><tr><th>Page</th><th>Score</th><th>Title</th><th>H1s</th><th>Links</th><th>Issues</th></tr></thead><tbody>' +
      latest.map(function(r) {
        var m = r.metrics || {};
        var path = '/';
        try { path = new URL(r.url).pathname || '/'; } catch(e) {}
        var sc = r.score;
        var scColor = sc >= 90 ? 'admin-green' : sc >= 50 ? 'admin-amber' : sc != null ? 'admin-red' : '';
        return '<tr><td class="admin-platform-name" style="font-family:var(--mono)!important;">' + path + '</td>' +
          '<td class="' + scColor + '" style="font-weight:600;">' + (sc != null ? sc : '\u2014') + '</td>' +
          '<td>' + (m.title_length || 0) + '</td>' +
          '<td>' + (m.h1_count || 0) + '</td>' +
          '<td>' + ((m.internal_links||0) + (m.external_links||0)) + '</td>' +
          '<td>' + (Array.isArray(r.issues) ? r.issues.length : 0) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
}

// ─── Sync Trigger ───
async function triggerSeoSync(tasks) {
  var btn = document.getElementById('seo-sync-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Syncing\u2026'; }
  try {
    var session = (await sb.auth.getSession()).data.session;
    if (!session) { alert('Sign in required'); return; }
    var resp = await fetch(SUPABASE_URL + '/functions/v1/seo-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token, 'apikey': SUPABASE_KEY },
      body: JSON.stringify({ tasks: tasks || ['all'] })
    });
    var data = await resp.json();
    console.log('[Admin] SEO sync result:', data);
    if (btn) btn.textContent = 'Done \u2713';
    setTimeout(function() { if (btn) { btn.disabled = false; btn.textContent = '\u21BB Sync All'; } }, 2000);
    _adminTabInit['seo'] = false;
    loadSeoTab();
  } catch(err) {
    console.error('[Admin] SEO sync error:', err);
    if (btn) { btn.disabled = false; btn.textContent = '\u21BB Sync All'; }
    alert('Sync failed: ' + err.message);
  }
}


// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// TAB 5: REVENUE
// ═══════════════════════════════════════════════════════════

async function loadRevenueTab(daysBack) {
  daysBack = daysBack || 30;
  console.log('[Admin] loadRevenueTab', daysBack, 'days');
  try {
    var res = await sb.rpc('get_admin_revenue', { p_days_back: daysBack });
    if (res.error) { console.error('[Admin] Revenue RPC error:', res.error); return; }
    var d = res.data;
    if (!d) return;

    // KPI Cards
    setAdminText('ar-total-users', fmtAdminNum(d.total_users));
    var paidCount = (d.tier_distribution || []).filter(function(t) { return t.tier !== 'free'; }).reduce(function(s, t) { return s + t.user_count; }, 0);
    setAdminText('ar-paid-subs', fmtAdminNum(paidCount));
    var cs = d.credit_stats || {};
    setAdminText('ar-credits-granted', fmtAdminNum(cs.total_credits_granted || 0));
    setAdminText('ar-credits-used', fmtAdminNum(cs.total_credits_used || 0));
    setAdminText('ar-active-users', fmtAdminNum(cs.unique_users || 0));
    var totalCost = (d.cost_breakdown || []).reduce(function(s, c) { return s + (c.total_cost_cents || 0); }, 0);
    setAdminText('ar-platform-cost', '$' + (totalCost / 100).toFixed(2));

    // Tier Distribution Pie Chart
    var tierData = (d.tier_distribution || []).map(function(t) {
      return { name: (t.tier || 'free').charAt(0).toUpperCase() + (t.tier || 'free').slice(1), value: t.user_count };
    });
    if (tierData.length === 0) tierData = [{ name: 'Free', value: d.total_users || 0 }];
    var tierChart = echarts.init(document.getElementById('ar-chart-tiers'));
    tierChart.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      series: [{
        type: 'pie', radius: ['40%', '70%'], center: ['50%', '55%'],
        label: { show: true, formatter: '{b}\n{c}', fontSize: 11 },
        data: tierData,
        itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 }
      }]
    });

    // Daily Credit Activity Bar Chart
    var dailyData = d.daily_activity || [];
    var dailyChart = echarts.init(document.getElementById('ar-chart-daily'));
    dailyChart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 16, top: 20, bottom: 28 },
      xAxis: { type: 'category', data: dailyData.map(function(r) { return r.day; }), axisLabel: { fontSize: 10, rotate: 45 } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
      series: [
        { name: 'Granted', type: 'bar', stack: 'credits', data: dailyData.map(function(r) { return r.credits_in; }), itemStyle: { color: 'hsl(142, 60%, 50%)' } },
        { name: 'Used', type: 'bar', stack: 'used', data: dailyData.map(function(r) { return r.credits_out; }), itemStyle: { color: 'hsl(0, 70%, 55%)' } }
      ]
    });

    // Revenue by Type Table
    var typeBody = document.getElementById('ar-type-body');
    if (typeBody) {
      typeBody.innerHTML = (d.revenue_by_type || []).map(function(r) {
        return '<tr><td class="admin-platform-name">' + r.type + '</td>' +
          '<td>' + fmtAdminNum(r.tx_count) + '</td>' +
          '<td style="color:hsl(142,60%,40%)">' + fmtAdminNum(r.credits_in) + '</td>' +
          '<td style="color:hsl(0,70%,50%)">' + fmtAdminNum(r.credits_out) + '</td></tr>';
      }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-faint)">No transactions yet</td></tr>';
    }

    // Cost Breakdown Table
    var costBody = document.getElementById('ar-cost-body');
    if (costBody) {
      costBody.innerHTML = (d.cost_breakdown || []).map(function(r) {
        return '<tr><td class="admin-platform-name">' + (r.cost_category || '—').toUpperCase() + '</td>' +
          '<td>' + fmtAdminNum(r.tx_count) + '</td>' +
          '<td>$' + (r.total_cost_cents / 100).toFixed(2) + '</td></tr>';
      }).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text-faint)">No cost data yet</td></tr>';
    }

    // Top Users Table
    var usersBody = document.getElementById('ar-users-body');
    if (usersBody) {
      usersBody.innerHTML = (d.top_users || []).map(function(u) {
        var email = u.email || u.user_id.substring(0, 8) + '...';
        return '<tr><td class="admin-platform-name">' + email + '</td>' +
          '<td style="color:hsl(0,70%,50%)">' + fmtAdminNum(u.credits_used) + '</td>' +
          '<td style="color:hsl(142,60%,40%)">' + fmtAdminNum(u.credits_granted) + '</td>' +
          '<td>' + fmtAdminNum(u.tx_count) + '</td></tr>';
      }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-faint)">No credit usage yet</td></tr>';
    }

    // Resize charts on window resize
    window.addEventListener('resize', function() { tierChart.resize(); dailyChart.resize(); });

  } catch (err) {
    console.error('[Admin] loadRevenueTab error:', err);
  }
}

// ─── P13-10: Survey Analytics Tab ───
var _surveyDays = 30;

// Period toggle — now in Feedback page
(function() {
  var toggle = document.getElementById('fb-survey-period-toggle');
  if (!toggle) return;
  toggle.addEventListener('click', function(e) {
    var btn = e.target.closest('.admin-period-btn');
    if (!btn) return;
    toggle.querySelectorAll('.admin-period-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    _surveyDays = parseInt(btn.dataset.fbSurveyDays);
    _adminTabInit['surveys'] = false;
    loadSurveysTab();
  });
})();

// Expose for feedback tab switching
window.loadSurveyData = loadSurveysTab;

async function loadSurveysTab() {
  console.log('[Admin] loadSurveysTab', _surveyDays, 'days');
  _adminTabInit['surveys'] = true;

  try {
    var res = await sb.rpc('get_survey_analytics', { p_days: _surveyDays });
    if (res.error) throw res.error;
    var d = res.data || {};

    // KPIs
    setAdminText('sv-total', (d.total_responses || 0).toLocaleString());
    setAdminText('sv-respondents', (d.unique_respondents || 0).toLocaleString());

    // Avg completion: estimate from versions data
    var versions = d.versions || [];
    var totalQ = 0, totalV = 0;
    versions.forEach(function(v) { if (v.avg_rating) { totalQ += v.count; totalV++; } });
    setAdminText('sv-completion', versions.length > 0 ? versions.length + ' types' : '—');

    // Avg NPS
    var npsVersions = versions.filter(function(v) { return v.avg_nps !== null; });
    if (npsVersions.length > 0) {
      var avgNps = npsVersions.reduce(function(s, v) { return s + parseFloat(v.avg_nps); }, 0) / npsVersions.length;
      setAdminText('sv-nps', avgNps.toFixed(1));
    } else {
      setAdminText('sv-nps', '—');
    }

    // Chart: Responses by Version (bar)
    renderSurveyVersionsChart(versions);

    // Chart: Daily volume (line)
    renderSurveyDailyChart(d.daily || []);

    // Chart: NPS trend (line)
    renderSurveyNpsChart(d.nps_monthly || []);

    // Chart: Completion funnel (placeholder — shows version distribution as funnel)
    renderSurveyFunnel(versions);

    // Recent responses table
    renderSurveyRecentTable(d.recent || []);

  } catch (err) {
    console.error('[Admin] loadSurveysTab error:', err);
  }
}

function renderSurveyVersionsChart(versions) {
  var el = document.getElementById('sv-chart-versions');
  if (!el || !window.echarts) return;
  var chart = echarts.init(el);
  if (versions.length === 0) {
    chart.setOption({ graphic: { type: 'text', left: 'center', top: 'center', style: { text: 'No survey data yet', fill: '#888', fontSize: 14 } } });
    return;
  }
  chart.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: versions.map(function(v) { return v.version; }), axisLabel: { rotate: 30, fontSize: 11 } },
    yAxis: { type: 'value', name: 'Responses' },
    series: [{
      type: 'bar',
      data: versions.map(function(v) { return v.count; }),
      itemStyle: { color: '#6b82a8', borderRadius: [4, 4, 0, 0] }
    }],
    grid: { left: 50, right: 16, top: 30, bottom: 60 }
  });
}

function renderSurveyDailyChart(daily) {
  var el = document.getElementById('sv-chart-daily');
  if (!el || !window.echarts) return;
  var chart = echarts.init(el);
  if (daily.length === 0) {
    chart.setOption({ graphic: { type: 'text', left: 'center', top: 'center', style: { text: 'No daily data yet', fill: '#888', fontSize: 14 } } });
    return;
  }
  chart.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: daily.map(function(d) { return d.date; }), axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value' },
    series: [{
      type: 'line',
      data: daily.map(function(d) { return d.count; }),
      smooth: true,
      areaStyle: { opacity: 0.15 },
      lineStyle: { color: '#6b82a8' },
      itemStyle: { color: '#6b82a8' }
    }],
    grid: { left: 40, right: 16, top: 20, bottom: 40 }
  });
}

function renderSurveyNpsChart(npsMonthly) {
  var el = document.getElementById('sv-chart-nps');
  if (!el || !window.echarts) return;
  var chart = echarts.init(el);
  if (npsMonthly.length === 0) {
    chart.setOption({ graphic: { type: 'text', left: 'center', top: 'center', style: { text: 'No NPS data yet', fill: '#888', fontSize: 14 } } });
    return;
  }
  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['Promoters', 'Passives', 'Detractors'], bottom: 0, textStyle: { fontSize: 11 } },
    xAxis: { type: 'category', data: npsMonthly.map(function(m) { return m.month; }) },
    yAxis: { type: 'value' },
    series: [
      { name: 'Promoters', type: 'bar', stack: 'nps', data: npsMonthly.map(function(m) { return m.promoters; }), itemStyle: { color: '#5b8a72' } },
      { name: 'Passives', type: 'bar', stack: 'nps', data: npsMonthly.map(function(m) { return m.passives; }), itemStyle: { color: '#a08858' } },
      { name: 'Detractors', type: 'bar', stack: 'nps', data: npsMonthly.map(function(m) { return m.detractors; }), itemStyle: { color: '#c06060' } }
    ],
    grid: { left: 40, right: 16, top: 20, bottom: 50 }
  });
}

function renderSurveyFunnel(versions) {
  var el = document.getElementById('sv-chart-funnel');
  if (!el || !window.echarts) return;
  var chart = echarts.init(el);
  if (versions.length === 0) {
    chart.setOption({ graphic: { type: 'text', left: 'center', top: 'center', style: { text: 'No funnel data yet', fill: '#888', fontSize: 14 } } });
    return;
  }
  // Group by type: periodic, exit, nps, micro
  var groups = {};
  versions.forEach(function(v) {
    var type = 'other';
    if (v.version.indexOf('periodic') === 0) type = 'Periodic';
    else if (v.version.indexOf('exit') === 0) type = 'Exit';
    else if (v.version.indexOf('nps') === 0) type = 'NPS';
    else if (v.version.indexOf('micro') === 0) type = 'Micro-survey';
    groups[type] = (groups[type] || 0) + v.count;
  });
  var data = Object.keys(groups).map(function(k) { return { name: k, value: groups[k] }; });
  data.sort(function(a, b) { return b.value - a.value; });

  chart.setOption({
    tooltip: { trigger: 'item' },
    series: [{
      type: 'funnel',
      left: '10%',
      width: '80%',
      top: 10,
      bottom: 10,
      sort: 'descending',
      gap: 4,
      label: { show: true, position: 'inside', formatter: '{b}: {c}', fontSize: 12 },
      itemStyle: { borderWidth: 1, borderColor: '#fff' },
      data: data
    }]
  });
}

function renderSurveyRecentTable(recent) {
  var tbody = document.getElementById('sv-responses-body');
  if (!tbody) return;
  if (recent.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-faint);padding:24px;">No survey responses yet</td></tr>';
    return;
  }
  tbody.innerHTML = recent.map(function(r) {
    var date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    var userId = (r.user_id || 'anon').substring(0, 8);
    var nps = r.nps_score != null ? r.nps_score : '—';
    var rating = r.overall_rating != null ? '★'.repeat(r.overall_rating) : '—';
    var qCount = r.q_count || '—';
    return '<tr><td>' + date + '</td><td><code style="font-size:12px">' + (r.survey_version || '') + '</code></td><td><code style="font-size:11px">' + userId + '</code></td><td>' + qCount + '</td><td>' + nps + '</td><td>' + rating + '</td></tr>';
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// GHOST TAB
// ═══════════════════════════════════════════════════════════════

async function loadGhostTab() {
  try {
    // KPI: total applications tracked
    var { count: totalApps } = await sb.from('user_pipeline')
      .select('*', { count: 'exact', head: true })
      .in('stage', ['applied', 'posting_closed', 'responded', 'interview', 'rejected', 'archived']);
    setAdminText('ag-total-apps', fmtAdminNum(totalApps || 0));

    // KPI: ghosted count
    var { count: ghostedCount } = await sb.from('user_pipeline')
      .select('*', { count: 'exact', head: true })
      .in('stage', ['applied', 'posting_closed'])
      .lt('applied_at', new Date(Date.now() - 21 * 86400000).toISOString());
    setAdminText('ag-ghosted', fmtAdminNum(ghostedCount || 0));

    // KPI: gmail connected
    var { count: gmailCount } = await sb.from('gmail_connections')
      .select('*', { count: 'exact', head: true })
      .eq('sync_status', 'active');
    setAdminText('ag-gmail-connected', gmailCount || 0);

    // Company ghost stats table
    var { data: stats } = await sb.from('company_ghost_stats')
      .select('*')
      .order('ghost_rate', { ascending: false });

    var tbody = document.getElementById('ag-company-body');
    if (!stats || stats.length === 0) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-faint);padding:24px;">No ghost stats yet. Data populates as users track applications.</td></tr>';
      setAdminText('ag-avg-response', '—');
      renderAdminGhostChart([]);
      return;
    }

    // KPI: avg response days
    var responseDays = stats.filter(function(s) { return s.avg_response_days > 0; });
    var avgResp = responseDays.length > 0
      ? Math.round(responseDays.reduce(function(a, b) { return a + b.avg_response_days; }, 0) / responseDays.length)
      : 0;
    setAdminText('ag-avg-response', avgResp > 0 ? avgResp + 'd' : '—');

    // Render table
    if (tbody) {
      tbody.innerHTML = stats.map(function(s) {
        var rate = s.ghost_rate != null ? Math.round(s.ghost_rate * 100) : 0;
        var rateColor = rate >= 50 ? '#c06060' : rate >= 25 ? '#a08858' : '#4a9a6b';
        var responded = (s.total_applications || 0) - (s.ghosted_count || 0);
        var lastActivity = s.updated_at ? new Date(s.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
        var avgDays = s.avg_response_days > 0 ? s.avg_response_days + 'd' : '—';

        return '<tr>' +
          '<td style="font-weight:600;text-transform:capitalize;">' + (s.company_slug || '—').replace(/-/g, ' ') + '</td>' +
          '<td>' + (s.total_applications || 0) + '</td>' +
          '<td>' + responded + '</td>' +
          '<td>' + (s.ghosted_count || 0) + '</td>' +
          '<td style="color:' + rateColor + ';font-weight:600;">' + rate + '%</td>' +
          '<td>' + avgDays + '</td>' +
          '<td>' + lastActivity + '</td>' +
          '</tr>';
      }).join('');
    }

    renderAdminGhostChart(stats);

  } catch (err) {
    console.error('[BJ] Ghost admin error:', err);
    var tbody = document.getElementById('ag-company-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--red);padding:24px;">Error: ' + (err.message || 'unknown') + '</td></tr>';
  }
}

var _adminGhostChart = null;
function renderAdminGhostChart(stats) {
  var el = document.getElementById('ag-ghost-chart');
  if (!el || !window.echarts) return;
  if (_adminGhostChart) _adminGhostChart.dispose();
  _adminGhostChart = echarts.init(el);

  if (!stats || stats.length === 0) {
    _adminGhostChart.setOption({
      title: { text: 'No data yet', left: 'center', top: 'center', textStyle: { color: '#a0aec0', fontSize: 14 } }
    });
    return;
  }

  // Top 15 companies by total applications, sorted by ghost rate
  var top = stats.filter(function(s) { return s.total_applications >= 1; })
    .sort(function(a, b) { return (b.ghost_rate || 0) - (a.ghost_rate || 0); })
    .slice(0, 15);

  var names = top.map(function(s) { return (s.company_slug || '').replace(/-/g, ' '); });
  var rates = top.map(function(s) { return Math.round((s.ghost_rate || 0) * 100); });
  var colors = rates.map(function(r) { return r >= 50 ? '#c06060' : r >= 25 ? '#a08858' : '#4a9a6b'; });

  var isDark = document.body.classList.contains('dark');
  var textColor = isDark ? '#a0aec0' : '#4a5568';

  _adminGhostChart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 120, right: 24, top: 12, bottom: 24 },
    xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%', color: textColor, fontSize: 11 }, splitLine: { lineStyle: { color: isDark ? '#2d3748' : '#e2e8f0' } } },
    yAxis: { type: 'category', data: names.reverse(), axisLabel: { color: textColor, fontSize: 11, width: 100, overflow: 'truncate' } },
    series: [{
      type: 'bar',
      data: rates.slice().reverse().map(function(v, i) {
        var c = v >= 50 ? '#c06060' : v >= 25 ? '#a08858' : '#4a9a6b';
        return { value: v, itemStyle: { color: c } };
      }),
      barWidth: 16, itemStyle: { borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', formatter: '{c}%', fontSize: 11, color: textColor }
    }]
  });
}

// ============================================================
// SEO EXTRACT REPORT — v4.47
// Generates a downloadable HTML report combining all 5 SEO tools
// ============================================================
window.generateSeoReport = async function() {
  var btn = document.getElementById('seo-export-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating…'; }

  try {
    var url = _seoUrl || 'https://brilliantjobs.app/';
    var strategy = 'Mobile';
    var now = new Date().toLocaleString();

    // Gather data from _seoData (already loaded by SEO tab)
    var techAudits = (_seoData.tech_audits || []).filter(function(r) { return r.url === url || !_seoUrl; });
    var psiAudits = techAudits.filter(function(r) { return r.source === 'psi_mobile'; });
    var dfAudits = techAudits.filter(function(r) { return r.source === 'dataforseo'; });
    var yltAudits = techAudits.filter(function(r) { return r.source === 'yellowlab'; });
    var indexStatus = (_seoData.index_status || []).filter(function(r) { return r.url === url || !_seoUrl; });
    var siteDailyArr = _seoData.site_daily || [];
    var pageDailyArr = (_seoData.page_daily || []).filter(function(r) { return r.url === url || !_seoUrl; });
    var gscQueries = _seoData.gsc_queries || [];

    // PSI scores
    var latestPsi = psiAudits.length ? psiAudits[psiAudits.length - 1] : null;
    var psiMetrics = latestPsi ? (latestPsi.metrics || {}) : {};
    var perfScore = psiMetrics.performance || 0;
    var grade = perfScore >= 90 ? 'A' : perfScore >= 70 ? 'B' : perfScore >= 50 ? 'C' : perfScore >= 30 ? 'D' : 'F';
    var gradeColor = { A: '#22c55e', B: '#84cc16', C: '#f59e0b', D: '#f97316', F: '#ef4444' }[grade];

    // DataForSEO
    var latestDf = dfAudits.length ? dfAudits[dfAudits.length - 1] : null;
    var dfMetrics = latestDf ? (latestDf.metrics || {}) : {};

    // YLT
    var latestYlt = yltAudits.length ? yltAudits[yltAudits.length - 1] : null;
    var yltMetrics = latestYlt ? (latestYlt.metrics || {}) : {};

    // Index status
    var latestIdx = indexStatus.length ? indexStatus[indexStatus.length - 1] : null;
    var idxData = latestIdx ? (latestIdx.details || latestIdx.metrics || {}) : {};

    // GSC totals
    var gscTotalClicks = siteDailyArr.reduce(function(a, r) { return a + (r.total_clicks || 0); }, 0);
    var gscTotalImpr = siteDailyArr.reduce(function(a, r) { return a + (r.total_impressions || 0); }, 0);
    var gscAvgPos = siteDailyArr.filter(function(r) { return r.avg_position > 0; });
    var avgPos = gscAvgPos.length ? (gscAvgPos.reduce(function(a, r) { return a + r.avg_position; }, 0) / gscAvgPos.length).toFixed(1) : '—';

    function scoreBar(val, max) {
      max = max || 100;
      var pct = Math.min(100, Math.round((val / max) * 100));
      var c = pct >= 90 ? '#22c55e' : pct >= 70 ? '#84cc16' : pct >= 50 ? '#f59e0b' : '#ef4444';
      return '<div style="display:flex;align-items:center;gap:8px;"><div style="flex:1;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;"><div style="width:' + pct + '%;height:100%;background:' + c + ';border-radius:4px;"></div></div><span style="font-weight:700;color:' + c + ';">' + val + '</span></div>';
    }

    function row(label, value) {
      return '<tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;">' + label + '</td><td style="padding:6px 12px;font-weight:600;border-bottom:1px solid #f3f4f6;">' + (value != null ? value : '—') + '</td></tr>';
    }

    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>SEO Report — ' + url + '</title>' +
      '<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1a1a2e;background:#fff;padding:40px;max-width:900px;margin:0 auto;line-height:1.5}' +
      'h1{font-size:22px;margin-bottom:4px}h2{font-size:16px;color:#4b5563;margin:32px 0 12px;padding-bottom:8px;border-bottom:2px solid #e5e7eb}h3{font-size:14px;color:#6b7280;margin:16px 0 8px}' +
      'table{width:100%;border-collapse:collapse;margin-bottom:16px}th{text-align:left;padding:8px 12px;background:#f9fafb;font-size:12px;color:#6b7280;border-bottom:2px solid #e5e7eb}' +
      'td{padding:6px 12px;font-size:13px;border-bottom:1px solid #f3f4f6}.metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}' +
      '.metric-card{background:#f9fafb;border-radius:8px;padding:16px;text-align:center}.metric-card .val{font-size:28px;font-weight:700}.metric-card .lbl{font-size:11px;color:#6b7280;margin-top:4px}' +
      '.grade{display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;font-size:24px;font-weight:800;color:#fff}' +
      '@media print{body{padding:20px}h2{page-break-before:auto}}</style></head><body>';

    // Header
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">';
    html += '<div><h1>SEO Report</h1><div style="font-size:13px;color:#6b7280;">' + url + '</div><div style="font-size:11px;color:#9ca3af;">Generated ' + now + ' · Strategy: ' + strategy + '</div></div>';
    html += '<div class="grade" style="background:' + gradeColor + ';">' + grade + '</div>';
    html += '</div>';

    // Section 1: PSI Scores
    html += '<h2>1. PageSpeed Insights</h2>';
    html += '<div class="metric-grid">';
    ['Performance', 'SEO', 'Accessibility', 'Best Practices'].forEach(function(cat) {
      var key = cat.toLowerCase().replace(' ', '_');
      var val = psiMetrics[key] || 0;
      var c = val >= 90 ? '#22c55e' : val >= 70 ? '#f59e0b' : '#ef4444';
      html += '<div class="metric-card"><div class="val" style="color:' + c + ';">' + val + '</div><div class="lbl">' + cat + '</div></div>';
    });
    html += '</div>';

    // Core Web Vitals
    html += '<h3>Core Web Vitals</h3><table>';
    html += '<tr><th>Metric</th><th>Value</th><th>Status</th></tr>';
    var cwv = [
      ['LCP', psiMetrics.lcp, '< 2.5s'],
      ['FID / INP', psiMetrics.inp || psiMetrics.fid, '< 200ms'],
      ['CLS', psiMetrics.cls, '< 0.1'],
      ['TBT', psiMetrics.tbt, '< 200ms'],
      ['FCP', psiMetrics.fcp, '< 1.8s'],
      ['Speed Index', psiMetrics.speed_index || psiMetrics.si, '< 3.4s'],
    ];
    cwv.forEach(function(m) {
      var val = m[1] != null ? m[1] : '—';
      html += '<tr><td style="padding:6px 12px;font-weight:600;border-bottom:1px solid #f3f4f6;">' + m[0] + '</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">' + val + '</td><td style="padding:6px 12px;color:#6b7280;font-size:11px;border-bottom:1px solid #f3f4f6;">Target: ' + m[2] + '</td></tr>';
    });
    html += '</table>';

    // PSI Opportunities
    if (latestPsi && latestPsi.details && latestPsi.details.opportunities) {
      html += '<h3>Opportunities</h3><table><tr><th>Audit</th><th>Savings</th></tr>';
      latestPsi.details.opportunities.forEach(function(o) {
        html += '<tr><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">' + (o.title || o.id || '—') + '</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">' + (o.savings || o.displayValue || '—') + '</td></tr>';
      });
      html += '</table>';
    }

    // Section 2: DataForSEO
    html += '<h2>2. On-Page Audit (DataForSEO)</h2>';
    if (latestDf) {
      html += '<table>';
      html += row('Title', dfMetrics.title || '—');
      html += row('Title Length', dfMetrics.title_length || '—');
      html += row('Meta Description', (dfMetrics.meta_description || '—').toString().slice(0, 120));
      html += row('H1 Count', dfMetrics.h1_count || '—');
      html += row('Word Count', dfMetrics.word_count || '—');
      html += row('Internal Links', dfMetrics.internal_links || '—');
      html += row('External Links', dfMetrics.external_links || '—');
      html += row('Images', dfMetrics.images_count || '—');
      html += row('Images without Alt', dfMetrics.images_without_alt || '—');
      html += row('Readability', dfMetrics.readability_score || '—');
      html += '</table>';
    } else {
      html += '<p style="color:#9ca3af;font-style:italic;">No DataForSEO audit data available. Run a sync first.</p>';
    }

    // Section 3: URL Inspection
    html += '<h2>3. URL Inspection (Google Index)</h2>';
    if (latestIdx) {
      html += '<table>';
      html += row('Index Status', idxData.indexing_state || idxData.verdict || '—');
      html += row('Coverage State', idxData.coverage_state || '—');
      html += row('Last Crawl', idxData.last_crawl_time || idxData.last_crawl || '—');
      html += row('Crawl Status', idxData.crawl_status || idxData.pageFetchState || '—');
      html += row('Google Canonical', idxData.google_canonical || idxData.googleCanonical || '—');
      html += row('User Canonical', idxData.user_canonical || idxData.userCanonical || '—');
      html += row('Mobile Usability', idxData.mobile_usability || idxData.mobileFriendly || '—');
      html += row('Rich Results', idxData.rich_results || '—');
      html += '</table>';
    } else {
      html += '<p style="color:#9ca3af;font-style:italic;">No URL Inspection data. Requires Google Service Account with Search Console access.</p>';
    }

    // Section 4: Yellow Lab Tools
    html += '<h2>4. Page Quality (Yellow Lab Tools)</h2>';
    if (latestYlt) {
      html += '<table>';
      html += row('Global Score', scoreBar(yltMetrics.globalScore || yltMetrics.global_score || 0));
      var yltCats = ['weight', 'requests', 'domComplexity', 'cssComplexity', 'jsComplexity', 'fonts', 'serverConfig', 'images'];
      yltCats.forEach(function(cat) {
        var val = yltMetrics[cat] || yltMetrics[cat.replace(/([A-Z])/g, '_$1').toLowerCase()];
        if (val != null) html += row(cat.replace(/([A-Z])/g, ' $1').replace(/^./, function(s) { return s.toUpperCase(); }), typeof val === 'number' ? scoreBar(val) : val);
      });
      html += '</table>';
    } else {
      html += '<p style="color:#9ca3af;font-style:italic;">No Yellow Lab Tools data available.</p>';
    }

    // Section 5: CrUX / GSC Performance
    html += '<h2>5. Search Performance (Google Search Console)</h2>';
    html += '<div class="metric-grid">';
    html += '<div class="metric-card"><div class="val">' + gscTotalClicks + '</div><div class="lbl">Total Clicks</div></div>';
    html += '<div class="metric-card"><div class="val">' + gscTotalImpr.toLocaleString() + '</div><div class="lbl">Total Impressions</div></div>';
    html += '<div class="metric-card"><div class="val">' + avgPos + '</div><div class="lbl">Avg Position</div></div>';
    html += '<div class="metric-card"><div class="val">' + siteDailyArr.length + '</div><div class="lbl">Days of Data</div></div>';
    html += '</div>';

    if (gscQueries.length > 0) {
      html += '<h3>Top Queries</h3><table><tr><th>Query</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Position</th></tr>';
      gscQueries.slice(0, 20).forEach(function(q) {
        html += '<tr><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">' + (q.query || '—') + '</td>';
        html += '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">' + (q.clicks || 0) + '</td>';
        html += '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">' + (q.impressions || 0) + '</td>';
        html += '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">' + (q.ctr ? (q.ctr * 100).toFixed(1) + '%' : '—') + '</td>';
        html += '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">' + (q.position ? q.position.toFixed(1) : '—') + '</td></tr>';
      });
      html += '</table>';
    }

    // Daily breakdown
    if (siteDailyArr.length > 0) {
      html += '<h3>Daily Performance</h3><table><tr><th>Date</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Position</th></tr>';
      siteDailyArr.slice(-14).forEach(function(r) {
        html += '<tr><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">' + r.date + '</td>';
        html += '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">' + (r.total_clicks || 0) + '</td>';
        html += '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">' + (r.total_impressions || 0) + '</td>';
        html += '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">' + (r.avg_ctr ? (r.avg_ctr * 100).toFixed(1) + '%' : '—') + '</td>';
        html += '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">' + (r.avg_position || '—') + '</td></tr>';
      });
      html += '</table>';
    }

    html += '<div style="margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">Brilliant Jobs SEO Report · Generated ' + now + ' · <a href="https://brilliantjobs.app">brilliantjobs.app</a></div>';
    html += '</body></html>';

    // Create downloadable HTML file
    var blob = new Blob([html], { type: 'text/html' });
    var downloadUrl = URL.createObjectURL(blob);
    var slug = url.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/-$/, '');
    var dateStr = new Date().toISOString().slice(0, 10);
    var a = document.createElement('a');
    a.href = downloadUrl;
    a.download = 'seo-report-' + slug + '-' + dateStr + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

    if (typeof showToast === 'function') showToast('SEO report downloaded!', { type: 'success' });
  } catch (e) {
    console.error('[SEO Report]', e);
    if (typeof showToast === 'function') showToast('Report generation failed: ' + e.message, { type: 'error' });
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📄 Export Report'; }
  }
};

// ============================================================
// ADMIN FEEDBACK TAB — v4.48
// Unified view of Canny FR, Bug Reports, Supabase Feedback
// ============================================================

var _afbData = [];
var _afbFiltered = [];
var _afbSort = 'newest';
var _afbTypeFilter = 'all';
var _afbStatusFilter = 'all';
var _afbCohortFilter = 'all';
var _afbSearchQuery = '';
var _afbUserMap = {};

async function loadFeedbackTab() {
  console.log('[Admin] loadFeedbackTab');
  try {
    var { data, error } = await sb.from('admin_feedback')
      .select('*')
      .order('submitted_at', { ascending: false })
      .limit(1000);
    if (error) { console.error('[Feedback]', error); return; }
    _afbData = data || [];

    // Resolve user emails
    var userIds = [...new Set(_afbData.map(function(r) { return r.user_id; }).filter(Boolean))];
    if (userIds.length > 0) {
      var { data: profiles } = await sb.from('profiles').select('id, email, cohort_id').in('id', userIds);
      (profiles || []).forEach(function(p) { _afbUserMap[p.id] = p; });
    }

    // Populate cohort dropdown
    var cohorts = [...new Set(_afbData.map(function(r) { return r.cohort_id; }).filter(Boolean))];
    var sel = document.getElementById('afb-cohort-filter');
    if (sel) {
      sel.innerHTML = '<option value="all">All Cohorts</option>';
      cohorts.sort().forEach(function(c) {
        sel.innerHTML += '<option value="' + c + '">' + c + '</option>';
      });
    }

    applyFeedbackFilters();
    renderFeedbackCards();
  } catch (e) {
    console.error('[Feedback]', e);
  }
}

function applyFeedbackFilters() {
  _afbFiltered = _afbData.filter(function(r) {
    if (_afbTypeFilter !== 'all' && r.source !== _afbTypeFilter) return false;
    if (_afbStatusFilter !== 'all' && r.status !== _afbStatusFilter) return false;
    if (_afbCohortFilter !== 'all' && r.cohort_id !== _afbCohortFilter) return false;
    if (_afbSearchQuery) {
      var q = _afbSearchQuery.toLowerCase();
      var text = ((r.title || '') + ' ' + (r.content || '')).toLowerCase();
      if (text.indexOf(q) < 0) return false;
    }
    return true;
  });

  // Sort
  _afbFiltered.sort(function(a, b) {
    switch (_afbSort) {
      case 'oldest': return new Date(a.submitted_at) - new Date(b.submitted_at);
      case 'votes': return (b.votes || 0) - (a.votes || 0);
      case 'stale':
        var da = Math.floor((Date.now() - new Date(a.submitted_at).getTime()) / 86400000);
        var db = Math.floor((Date.now() - new Date(b.submitted_at).getTime()) / 86400000);
        return db - da;
      default: return new Date(b.submitted_at) - new Date(a.submitted_at);
    }
  });

  renderFeedbackTable();
}

function renderFeedbackCards() {
  var now = Date.now();
  var weekAgo = now - 7 * 86400000;
  var open = _afbData.filter(function(r) { return r.status !== 'done' && r.status !== 'wont_fix'; });
  var newWeek = _afbData.filter(function(r) { return new Date(r.submitted_at).getTime() > weekAgo; });
  var done = _afbData.filter(function(r) { return r.status === 'done'; });
  var topFr = _afbData.filter(function(r) { return r.source === 'canny_fr'; }).sort(function(a, b) { return (b.votes || 0) - (a.votes || 0); })[0];

  var el = function(id, val) { var e = document.getElementById(id); if (e) e.textContent = val; };
  el('afb-open', open.length);
  el('afb-new-week', newWeek.length);
  el('afb-avg-resolve', done.length > 0 ? '—' : '—'); // No resolved_at yet
  el('afb-top-fr', topFr ? (topFr.title || '').slice(0, 60) + ' (' + topFr.votes + '↑)' : '—');
}

var _SOURCE_LABELS = {
  'canny_fr': { label: 'FR', color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  'canny_bug': { label: 'Bug', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  'supabase_feedback': { label: 'FB', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  'survey': { label: 'Survey', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' }
};

var _STATUS_OPTIONS = ['new', 'reviewing', 'planned', 'in_progress', 'done', 'wont_fix'];
var _STATUS_LABELS = { 'new': 'New', 'reviewing': 'Reviewing', 'planned': 'Planned', 'in_progress': 'In Progress', 'done': 'Done', 'wont_fix': "Won't Fix" };

function renderFeedbackTable() {
  var tbody = document.getElementById('afb-tbody');
  var empty = document.getElementById('afb-empty');
  if (!tbody) return;

  if (_afbFiltered.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  var now = Date.now();
  var rows = _afbFiltered.slice(0, 200).map(function(r) {
    var src = _SOURCE_LABELS[r.source] || { label: r.source, color: '#999', bg: '#f5f5f5' };
    var daysSince = Math.floor((now - new Date(r.submitted_at).getTime()) / 86400000);
    var staleColor = daysSince < 7 ? '#22c55e' : daysSince < 30 ? '#f59e0b' : '#ef4444';
    var user = r.user_id && _afbUserMap[r.user_id] ? _afbUserMap[r.user_id].email : '—';
    var userShort = user.length > 16 ? user.slice(0, 14) + '…' : user;
    var title = (r.title || r.content || '').slice(0, 80);
    var relTime = daysSince === 0 ? 'today' : daysSince === 1 ? '1d ago' : daysSince < 7 ? daysSince + 'd ago' : daysSince < 30 ? Math.floor(daysSince / 7) + 'w ago' : Math.floor(daysSince / 30) + 'mo ago';

    var statusSelect = '<select onchange="updateFeedbackStatus(\'' + r.id + '\', this.value)" style="font-size:11px;padding:2px 4px;border-radius:4px;border:1px solid var(--border);background:var(--card);">';
    _STATUS_OPTIONS.forEach(function(s) {
      statusSelect += '<option value="' + s + '"' + (r.status === s ? ' selected' : '') + '>' + _STATUS_LABELS[s] + '</option>';
    });
    statusSelect += '</select>';

    return '<tr style="border-bottom:1px solid var(--border);cursor:pointer;" onclick="openFeedbackDetail(\'' + r.id + '\')">' +
      '<td style="padding:6px 10px;"><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;color:' + src.color + ';background:' + src.bg + ';">' + src.label + '</span></td>' +
      '<td style="padding:6px 10px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + (r.title || '').replace(/"/g, '&quot;') + '">' + title + '</td>' +
      '<td style="padding:6px 10px;font-size:11px;color:var(--text-faint);" title="' + user + '">' + userShort + '</td>' +
      '<td style="padding:6px 10px;">' + (r.cohort_id ? '<span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;background:rgba(99,102,241,0.1);color:var(--indigo);">' + r.cohort_id + '</span>' : '—') + '</td>' +
      '<td style="padding:6px 10px;font-size:11px;color:var(--text-faint);" title="' + new Date(r.submitted_at).toLocaleString() + '">' + relTime + '</td>' +
      '<td style="padding:6px 10px;text-align:center;font-weight:700;color:' + staleColor + ';">' + daysSince + '</td>' +
      '<td style="padding:6px 10px;text-align:center;font-weight:600;">' + (r.votes || 0) + '</td>' +
      '<td style="padding:6px 10px;" onclick="event.stopPropagation()">' + statusSelect + '</td>' +
      '</tr>';
  }).join('');

  tbody.innerHTML = rows;
}

window.updateFeedbackStatus = async function(id, newStatus) {
  var { error } = await sb.from('admin_feedback').update({ status: newStatus }).eq('id', id);
  if (error) {
    console.error('[Feedback] Status update failed:', error);
    if (typeof showToast === 'function') showToast('Status update failed', { type: 'error' });
    return;
  }
  // Update local data
  var item = _afbData.find(function(r) { return r.id === id; });
  if (item) item.status = newStatus;
  applyFeedbackFilters();
  renderFeedbackCards();
  if (typeof showToast === 'function') showToast('Status updated', { type: 'success' });
};

window.openFeedbackDetail = function(id) {
  var item = _afbData.find(function(r) { return r.id === id; });
  if (!item) return;
  var panel = document.getElementById('afb-detail');
  if (!panel) return;
  var src = _SOURCE_LABELS[item.source] || { label: item.source };
  var user = item.user_id && _afbUserMap[item.user_id] ? _afbUserMap[item.user_id].email : 'Unknown';
  document.getElementById('afb-detail-title').textContent = item.title || 'Feedback';
  document.getElementById('afb-detail-meta').innerHTML = '<span style="color:' + (src.color || '#999') + ';font-weight:600;">' + src.label + '</span> · ' + user + ' · ' + new Date(item.submitted_at).toLocaleDateString() + (item.votes ? ' · ' + item.votes + ' votes' : '');
  document.getElementById('afb-detail-content').textContent = item.content || '(no content)';
  panel.style.display = '';
};

window.closeFeedbackDetail = function() {
  var panel = document.getElementById('afb-detail');
  if (panel) panel.style.display = 'none';
};

window.sortFeedbackBy = function(field) {
  if (field === 'submitted') _afbSort = _afbSort === 'newest' ? 'oldest' : 'newest';
  else if (field === 'votes') _afbSort = 'votes';
  else if (field === 'stale') _afbSort = 'stale';
  applyFeedbackFilters();
};

window.triggerFeedbackSync = async function() {
  var btn = document.getElementById('afb-sync-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Syncing…'; }
  try {
    var res = await fetch(sb.supabaseUrl + '/functions/v1/sync-feedback', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + (await sb.auth.getSession()).data.session.access_token, 'Content-Type': 'application/json' }
    });
    var data = await res.json();
    console.log('[Feedback] Sync result:', data);
    if (typeof showToast === 'function') showToast('Synced: ' + (data.canny_fr || 0) + ' FR, ' + (data.canny_bug || 0) + ' bugs', { type: 'success' });
    loadFeedbackTab(); // Reload
  } catch (e) {
    console.error('[Feedback] Sync failed:', e);
    if (typeof showToast === 'function') showToast('Sync failed: ' + e.message, { type: 'error' });
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↻ Sync'; }
  }
};

// Wire up filter pills + search + sort
(function() {
  // Type pills
  document.getElementById('afb-type-pills')?.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-afb-type]');
    if (!btn) return;
    this.querySelectorAll('.admin-period-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    _afbTypeFilter = btn.dataset.afbType;
    applyFeedbackFilters();
  });
  // Status pills
  document.getElementById('afb-status-pills')?.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-afb-status]');
    if (!btn) return;
    this.querySelectorAll('.admin-period-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    _afbStatusFilter = btn.dataset.afbStatus;
    applyFeedbackFilters();
  });
  // Cohort filter
  document.getElementById('afb-cohort-filter')?.addEventListener('change', function() {
    _afbCohortFilter = this.value;
    applyFeedbackFilters();
  });
  // Sort
  document.getElementById('afb-sort')?.addEventListener('change', function() {
    _afbSort = this.value;
    applyFeedbackFilters();
  });
  // Search
  var searchTimeout;
  document.getElementById('afb-search')?.addEventListener('input', function() {
    clearTimeout(searchTimeout);
    var val = this.value;
    searchTimeout = setTimeout(function() {
      _afbSearchQuery = val;
      applyFeedbackFilters();
    }, 250);
  });
})();


/* ───────────────────────────────────────────────────────────
   Merchandising Admin Tab — v4.51
   Master-detail layout: Placements → Rules → Content Entries
   CRUD via Supabase service role (admin context)
   ─────────────────────────────────────────────────────────── */

// ─── State ───
var _merchPlacements = [];
var _merchRules = [];
var _merchContent = [];
var _merchSelectedPlacement = null;
var _merchSelectedRule = null;
var _merchCohorts = []; // cached cohort list

// ─── Load Tab ───
function loadMerchTab() {
  console.log('[Merch] Loading merchandising tab');
  fetchMerchPlacements();
  fetchMerchCohorts();
}

// ─── Fetch Cohorts (for rule dropdown) ───
function fetchMerchCohorts() {
  sb.from('cohorts').select('id,name').eq('is_active', true).order('name').then(function(r) {
    _merchCohorts = r.data || [];
    console.log('[Merch] Loaded ' + _merchCohorts.length + ' cohorts');
  });
}

// ─── Placements ───
function fetchMerchPlacements() {
  sb.from('merch_placements').select('*').order('page_url').order('element_name').then(function(r) {
    if (r.error) { console.error('[Merch] Placements error:', r.error); return; }
    _merchPlacements = r.data || [];
    renderMerchPlacements();
    // auto-select first or previously selected
    if (_merchSelectedPlacement) {
      var still = _merchPlacements.find(function(p) { return p.id === _merchSelectedPlacement.id; });
      if (still) { selectMerchPlacement(still.id); return; }
    }
    if (_merchPlacements.length > 0) selectMerchPlacement(_merchPlacements[0].id);
    else clearMerchDetail();
  });
}

function renderMerchPlacements() {
  var el = document.getElementById('merch-placement-list');
  if (!el) return;
  if (_merchPlacements.length === 0) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-faint)">No placements yet</div>';
    return;
  }
  var grouped = {};
  _merchPlacements.forEach(function(p) {
    if (!grouped[p.page_url]) grouped[p.page_url] = [];
    grouped[p.page_url].push(p);
  });
  var html = '';
  Object.keys(grouped).sort().forEach(function(url) {
    html += '<div style="font-size:11px;color:var(--text-faint);padding:8px 12px 4px;text-transform:uppercase;letter-spacing:.5px">' + escHtml(url) + '</div>';
    grouped[url].forEach(function(p) {
      var sel = _merchSelectedPlacement && _merchSelectedPlacement.id === p.id;
      var dot = p.is_active ? '<span style="color:var(--green)">●</span>' : '<span style="color:var(--text-faint)">○</span>';
      html += '<div class="merch-pl-card' + (sel ? ' selected' : '') + '" data-id="' + p.id + '" onclick="selectMerchPlacement(\'' + p.id + '\')" style="padding:10px 12px;cursor:pointer;border-left:3px solid ' + (sel ? 'var(--accent)' : 'transparent') + ';background:' + (sel ? 'var(--accent-glow)' : 'transparent') + ';transition:all .15s">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center">';
      html += '<span style="font-size:13px;font-weight:600">' + escHtml(p.element_name) + '</span>';
      html += dot;
      html += '</div>';
      html += '<div style="font-size:11px;color:var(--text-faint);font-family:var(--mono)">' + escHtml(p.element_id) + '</div>';
      html += '</div>';
    });
  });
  el.innerHTML = html;
}

function selectMerchPlacement(id) {
  var p = _merchPlacements.find(function(x) { return x.id === id; });
  if (!p) return;
  _merchSelectedPlacement = p;
  _merchSelectedRule = null;
  renderMerchPlacements(); // re-render to update selection
  renderMerchPlacementDetail(p);
  fetchMerchRules(p.id);
}

function clearMerchDetail() {
  var el = document.getElementById('merch-detail');
  if (el) el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-faint)">Select a placement or create one</div>';
}

function renderMerchPlacementDetail(p) {
  var el = document.getElementById('merch-detail-header');
  if (!el) return;
  var fields = (p.content_format && p.content_format.fields) ? p.content_format.fields.join(', ') : '—';
  var dot = p.is_active ? '<span style="color:var(--green)">● Active</span>' : '<span style="color:var(--red)">○ Inactive</span>';
  el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">' +
    '<div>' +
    '<h3 style="margin:0 0 4px;font-size:18px">' + escHtml(p.element_name) + '</h3>' +
    '<div style="font-size:12px;color:var(--text-faint)">Page: <strong style="font-family:var(--mono)">' + escHtml(p.page_url) + '</strong> &nbsp;·&nbsp; Element: <strong style="font-family:var(--mono)">' + escHtml(p.element_id) + '</strong> &nbsp;·&nbsp; Format: <strong>' + escHtml(fields) + '</strong></div>' +
    (p.element_description ? '<div style="font-size:12px;color:var(--text-faint);margin-top:4px">' + escHtml(p.element_description) + '</div>' : '') +
    '</div>' +
    '<div style="display:flex;gap:6px;align-items:center">' +
    dot +
    ' <button onclick="toggleMerchPlacementActive(\'' + p.id + '\',' + !p.is_active + ')" class="merch-btn-sm">' + (p.is_active ? 'Deactivate' : 'Activate') + '</button>' +
    ' <button onclick="deleteMerchPlacement(\'' + p.id + '\')" class="merch-btn-sm merch-btn-danger">Delete</button>' +
    '</div></div>';
}

// ─── Placement CRUD ───
function showAddPlacementForm() {
  var modal = document.getElementById('merch-modal');
  modal.innerHTML = '<div class="merch-modal-inner">' +
    '<h3 style="margin:0 0 16px">Add Placement</h3>' +
    '<label class="merch-label">Page URL</label><input id="mp-url" class="merch-input" placeholder="/" value="/">' +
    '<label class="merch-label">Element ID</label><input id="mp-eid" class="merch-input" placeholder="hero-headline">' +
    '<label class="merch-label">Element Name</label><input id="mp-name" class="merch-input" placeholder="Hero Rotating Copy">' +
    '<label class="merch-label">Description (optional)</label><input id="mp-desc" class="merch-input" placeholder="Admin context note">' +
    '<label class="merch-label">Content Fields (comma-separated)</label><input id="mp-fields" class="merch-input" placeholder="h1, sub" value="h1, sub">' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">' +
    '<button onclick="closeMerchModal()" class="merch-btn-sm">Cancel</button>' +
    '<button onclick="saveMerchPlacement()" class="merch-btn-sm merch-btn-primary">Save</button></div></div>';
  modal.style.display = 'flex';
}

function saveMerchPlacement() {
  var url = document.getElementById('mp-url').value.trim();
  var eid = document.getElementById('mp-eid').value.trim();
  var name = document.getElementById('mp-name').value.trim();
  var desc = document.getElementById('mp-desc').value.trim();
  var fieldsRaw = document.getElementById('mp-fields').value.trim();
  if (!url || !eid || !name) { alert('Page URL, Element ID, and Name are required'); return; }
  var fields = fieldsRaw.split(',').map(function(f) { return f.trim(); }).filter(Boolean);
  sb.from('merch_placements').insert({
    page_url: url, element_id: eid, element_name: name,
    element_description: desc || null,
    content_format: { fields: fields, supports_html: true, placeholders: ['{JOBS}', '{COMPANIES}'] }
  }).select().then(function(r) {
    if (r.error) { alert('Error: ' + r.error.message); return; }
    closeMerchModal();
    _merchSelectedPlacement = r.data[0];
    fetchMerchPlacements();
  });
}

function toggleMerchPlacementActive(id, active) {
  if (!active && !confirm('Deactivating will hide all content for this placement from visitors. Continue?')) return;
  sb.from('merch_placements').update({ is_active: active, updated_at: new Date().toISOString() }).eq('id', id).select().then(function(r) {
    if (r.error) { alert('Error: ' + r.error.message); return; }
    fetchMerchPlacements();
  });
}

function deleteMerchPlacement(id) {
  if (!confirm('Delete this placement? This will also delete all rules and content entries. This cannot be undone.')) return;
  sb.from('merch_placements').delete().eq('id', id).then(function(r) {
    if (r.error) { alert('Error: ' + r.error.message); return; }
    _merchSelectedPlacement = null;
    fetchMerchPlacements();
  });
}

// ─── Rules ───
function fetchMerchRules(placementId) {
  sb.from('merch_rules').select('*, merch_content(count)').eq('placement_id', placementId).order('priority', { ascending: false }).order('audience').then(function(r) {
    if (r.error) { console.error('[Merch] Rules error:', r.error); return; }
    _merchRules = r.data || [];
    renderMerchRules();
    // auto-select first rule
    if (_merchRules.length > 0) selectMerchRule(_merchRules[0].id);
    else { _merchSelectedRule = null; renderMerchContent(); }
  });
}

function renderMerchRules() {
  var el = document.getElementById('merch-rules-list');
  if (!el) return;
  if (_merchRules.length === 0) {
    el.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-faint);font-size:13px">No rules yet — add one to start adding content</div>';
    return;
  }
  var html = '';
  _merchRules.forEach(function(r) {
    var cohortName = r.cohort_id ? (_merchCohorts.find(function(c) { return c.id === r.cohort_id; }) || {}).name || r.cohort_id : 'All Cohorts';
    var cnt = (r.merch_content && r.merch_content[0]) ? r.merch_content[0].count : 0;
    var sel = _merchSelectedRule && _merchSelectedRule.id === r.id;
    var dot = r.is_active ? '<span style="color:var(--green)">●</span>' : '<span style="color:var(--text-faint)">○</span>';
    html += '<div class="merch-rule-row' + (sel ? ' selected' : '') + '" onclick="selectMerchRule(\'' + r.id + '\')" style="padding:8px 12px;cursor:pointer;border-radius:6px;background:' + (sel ? 'var(--accent-glow)' : 'var(--bg-card)') + ';border:1px solid ' + (sel ? 'var(--accent)' : 'var(--border)') + ';transition:all .15s">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center">';
    html += '<span style="font-size:13px"><strong>' + escHtml(cohortName) + '</strong> × <strong>' + escHtml(r.audience) + '</strong></span>';
    html += '<span style="font-size:12px;color:var(--text-faint)">' + cnt + ' entries &nbsp;' + dot + '</span>';
    html += '</div>';
    html += '<div style="font-size:11px;color:var(--text-faint)">Priority: ' + r.priority + '</div>';
    html += '</div>';
  });
  el.innerHTML = html;
}

function selectMerchRule(id) {
  var r = _merchRules.find(function(x) { return x.id === id; });
  if (!r) return;
  _merchSelectedRule = r;
  renderMerchRules(); // re-render to update selection
  fetchMerchContent(r.id);
  // Show rule controls
  var ctrl = document.getElementById('merch-rule-controls');
  if (ctrl) {
    ctrl.innerHTML = '<button onclick="toggleMerchRuleActive(\'' + r.id + '\',' + !r.is_active + ')" class="merch-btn-sm">' + (r.is_active ? 'Deactivate' : 'Activate') + '</button>' +
      ' <button onclick="deleteMerchRule(\'' + r.id + '\')" class="merch-btn-sm merch-btn-danger">Delete Rule</button>';
  }
}

function showAddRuleForm() {
  if (!_merchSelectedPlacement) { alert('Select a placement first'); return; }
  var cohortOpts = '<option value="">All Cohorts</option>';
  _merchCohorts.forEach(function(c) { cohortOpts += '<option value="' + c.id + '">' + escHtml(c.name) + '</option>'; });
  var modal = document.getElementById('merch-modal');
  modal.innerHTML = '<div class="merch-modal-inner">' +
    '<h3 style="margin:0 0 16px">Add Rule</h3>' +
    '<label class="merch-label">Cohort</label><select id="mr-cohort" class="merch-input">' + cohortOpts + '</select>' +
    '<label class="merch-label">Audience</label><select id="mr-audience" class="merch-input"><option value="all">All</option><option value="new">New</option><option value="returning">Returning</option><option value="lapsed">Lapsed</option><option value="active">Active</option></select>' +
    '<label class="merch-label">Priority (higher = evaluated first)</label><input id="mr-priority" class="merch-input" type="number" value="0">' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">' +
    '<button onclick="closeMerchModal()" class="merch-btn-sm">Cancel</button>' +
    '<button onclick="saveMerchRule()" class="merch-btn-sm merch-btn-primary">Save</button></div></div>';
  modal.style.display = 'flex';
}

function saveMerchRule() {
  var cohort = document.getElementById('mr-cohort').value || null;
  var audience = document.getElementById('mr-audience').value;
  var priority = parseInt(document.getElementById('mr-priority').value) || 0;
  sb.from('merch_rules').insert({
    placement_id: _merchSelectedPlacement.id,
    cohort_id: cohort, audience: audience, priority: priority
  }).select().then(function(r) {
    if (r.error) { alert('Error: ' + r.error.message); return; }
    closeMerchModal();
    _merchSelectedRule = r.data[0];
    fetchMerchRules(_merchSelectedPlacement.id);
  });
}

function toggleMerchRuleActive(id, active) {
  sb.from('merch_rules').update({ is_active: active, updated_at: new Date().toISOString() }).eq('id', id).then(function(r) {
    if (r.error) { alert('Error: ' + r.error.message); return; }
    fetchMerchRules(_merchSelectedPlacement.id);
  });
}

function deleteMerchRule(id) {
  if (!confirm('Delete this rule and all its content entries? Cannot be undone.')) return;
  sb.from('merch_rules').delete().eq('id', id).then(function(r) {
    if (r.error) { alert('Error: ' + r.error.message); return; }
    _merchSelectedRule = null;
    fetchMerchRules(_merchSelectedPlacement.id);
  });
}

// ─── Content Entries ───
function fetchMerchContent(ruleId) {
  sb.from('merch_content').select('*').eq('rule_id', ruleId).order('sort_order').then(function(r) {
    if (r.error) { console.error('[Merch] Content error:', r.error); return; }
    _merchContent = r.data || [];
    renderMerchContent();
  });
}

function renderMerchContent() {
  var el = document.getElementById('merch-content-body');
  if (!el) return;
  var hdr = document.getElementById('merch-content-header');
  if (!_merchSelectedRule) {
    el.innerHTML = '';
    if (hdr) hdr.textContent = 'Content Entries';
    return;
  }
  var cohortName = _merchSelectedRule.cohort_id ? (_merchCohorts.find(function(c) { return c.id === _merchSelectedRule.cohort_id; }) || {}).name || _merchSelectedRule.cohort_id : 'All Cohorts';
  if (hdr) hdr.textContent = 'Content — ' + cohortName + ' × ' + _merchSelectedRule.audience + ' (' + _merchContent.length + ')';

  if (_merchContent.length === 0) {
    el.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-faint)">No entries yet</td></tr>';
    return;
  }
  var html = '';
  _merchContent.forEach(function(c, i) {
    var h1Preview = (c.content && c.content.h1) ? c.content.h1.replace(/<[^>]*>/g, '').substring(0, 50) : '—';
    var subPreview = (c.content && c.content.sub) ? c.content.sub.replace(/<[^>]*>/g, '').substring(0, 40) : '—';
    var dot = c.is_active ? '<span style="color:var(--green)">●</span>' : '<span style="color:var(--text-faint)">○</span>';
    var visits = c.min_visits > 0 ? '≥' + c.min_visits : '—';
    if (c.max_visits) visits += ' / ≤' + c.max_visits;
    html += '<tr style="cursor:pointer" onclick="showEditContentModal(\'' + c.id + '\')">';
    html += '<td style="font-family:var(--mono);font-size:11px;color:var(--text-faint);width:40px">' + c.sort_order + '</td>';
    html += '<td style="font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escAttr(h1Preview) + '">' + escHtml(h1Preview) + '</td>';
    html += '<td style="font-size:11px;color:var(--text-faint);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(subPreview) + '</td>';
    html += '<td style="font-size:11px">' + (c.category ? '<span style="background:var(--purple-dim);color:var(--purple);padding:1px 6px;border-radius:3px;font-size:10px">' + escHtml(c.category) + '</span>' : '') + '</td>';
    html += '<td style="font-size:11px;font-family:var(--mono);color:var(--text-faint)">' + visits + '</td>';
    html += '<td style="text-align:center">' + dot + '</td>';
    html += '</tr>';
  });
  el.innerHTML = html;
}

// ─── Content Edit Modal ───
function showAddContentModal() {
  if (!_merchSelectedRule || !_merchSelectedPlacement) { alert('Select a placement and rule first'); return; }
  showContentModal(null);
}

function showEditContentModal(id) {
  var entry = _merchContent.find(function(c) { return c.id === id; });
  if (!entry) return;
  showContentModal(entry);
}

function showContentModal(entry) {
  var fields = (_merchSelectedPlacement.content_format && _merchSelectedPlacement.content_format.fields) || ['h1', 'sub'];
  var isEdit = !!entry;
  var modal = document.getElementById('merch-modal');
  var html = '<div class="merch-modal-inner" style="max-width:600px">';
  html += '<h3 style="margin:0 0 16px">' + (isEdit ? 'Edit' : 'Add') + ' Content Entry</h3>';

  // Content fields
  fields.forEach(function(f) {
    var val = (entry && entry.content && entry.content[f]) || '';
    html += '<label class="merch-label">' + f + '</label>';
    html += '<textarea id="mc-field-' + f + '" class="merch-input" rows="3" style="font-family:var(--mono);font-size:12px">' + escHtml(val) + '</textarea>';
  });

  // Metadata
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">';
  html += '<div><label class="merch-label">Category</label><input id="mc-category" class="merch-input" placeholder="persistence, humor, etc." value="' + escAttr((entry && entry.category) || '') + '"></div>';
  html += '<div><label class="merch-label">Sort Order</label><input id="mc-sort" class="merch-input" type="number" value="' + ((entry && entry.sort_order) || _merchContent.length) + '"></div>';
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:8px">';
  html += '<div><label class="merch-label">Min Visits</label><input id="mc-minv" class="merch-input" type="number" value="' + ((entry && entry.min_visits) || 0) + '"></div>';
  html += '<div><label class="merch-label">Max Visits</label><input id="mc-maxv" class="merch-input" type="number" value="' + ((entry && entry.max_visits) || '') + '" placeholder="no limit"></div>';
  html += '<div><label class="merch-label">Season Months</label><input id="mc-season" class="merch-input" placeholder="1,2,12" value="' + ((entry && entry.season && entry.season.months) ? entry.season.months.join(',') : '') + '"></div>';
  html += '</div>';
  html += '<div style="margin-top:8px"><label style="font-size:12px;color:var(--text-dim);display:flex;align-items:center;gap:6px"><input type="checkbox" id="mc-active"' + ((!entry || entry.is_active) ? ' checked' : '') + '> Active</label></div>';

  // Preview
  html += '<div style="margin-top:16px;padding:16px;background:var(--bg);border:1px solid var(--border);border-radius:8px">';
  html += '<div style="font-size:11px;color:var(--text-faint);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Preview</div>';
  html += '<div id="mc-preview" style="font-size:14px;line-height:1.5"></div>';
  html += '</div>';

  // Buttons
  html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">';
  if (isEdit) {
    html += '<button onclick="deleteMerchContent(\'' + entry.id + '\')" class="merch-btn-sm merch-btn-danger" style="margin-right:auto">Delete</button>';
  }
  html += '<button onclick="closeMerchModal()" class="merch-btn-sm">Cancel</button>';
  html += '<button onclick="saveMerchContent(' + (isEdit ? "'" + entry.id + "'" : 'null') + ')" class="merch-btn-sm merch-btn-primary">Save</button></div>';
  html += '</div>';

  modal.innerHTML = html;
  modal.style.display = 'flex';

  // Wire up live preview
  var previewFields = fields;
  previewFields.forEach(function(f) {
    var ta = document.getElementById('mc-field-' + f);
    if (ta) ta.addEventListener('input', updateMerchPreview);
  });
  updateMerchPreview();
}

function updateMerchPreview() {
  var el = document.getElementById('mc-preview');
  if (!el) return;
  var fields = (_merchSelectedPlacement.content_format && _merchSelectedPlacement.content_format.fields) || ['h1', 'sub'];
  var html = '';
  fields.forEach(function(f) {
    var ta = document.getElementById('mc-field-' + f);
    if (!ta) return;
    var val = ta.value.replace(/\{JOBS\}/g, '<span style="color:var(--accent)">135,000</span>').replace(/\{COMPANIES\}/g, '<span style="color:var(--accent)">7,500</span>');
    if (f === 'h1') html += '<div style="font-size:18px;font-weight:700;margin-bottom:6px">' + val + '</div>';
    else html += '<div style="font-size:13px;color:var(--text-dim)">' + val + '</div>';
  });
  el.innerHTML = html;
}

function saveMerchContent(editId) {
  var fields = (_merchSelectedPlacement.content_format && _merchSelectedPlacement.content_format.fields) || ['h1', 'sub'];
  var content = {};
  fields.forEach(function(f) {
    var ta = document.getElementById('mc-field-' + f);
    content[f] = ta ? ta.value : '';
  });
  var category = document.getElementById('mc-category').value.trim() || null;
  var sort = parseInt(document.getElementById('mc-sort').value) || 0;
  var minv = parseInt(document.getElementById('mc-minv').value) || 0;
  var maxvRaw = document.getElementById('mc-maxv').value.trim();
  var maxv = maxvRaw ? parseInt(maxvRaw) : null;
  var seasonRaw = document.getElementById('mc-season').value.trim();
  var season = seasonRaw ? { months: seasonRaw.split(',').map(function(m) { return parseInt(m.trim()); }).filter(function(m) { return !isNaN(m); }) } : null;
  var active = document.getElementById('mc-active').checked;

  var payload = {
    content: content, category: category, sort_order: sort,
    min_visits: minv, max_visits: maxv, season: season,
    is_active: active, updated_at: new Date().toISOString()
  };

  if (editId) {
    sb.from('merch_content').update(payload).eq('id', editId).then(function(r) {
      if (r.error) { alert('Error: ' + r.error.message); return; }
      closeMerchModal();
      fetchMerchContent(_merchSelectedRule.id);
    });
  } else {
    payload.rule_id = _merchSelectedRule.id;
    sb.from('merch_content').insert(payload).then(function(r) {
      if (r.error) { alert('Error: ' + r.error.message); return; }
      closeMerchModal();
      fetchMerchContent(_merchSelectedRule.id);
    });
  }
}

function deleteMerchContent(id) {
  if (!confirm('Delete this content entry?')) return;
  sb.from('merch_content').delete().eq('id', id).then(function(r) {
    if (r.error) { alert('Error: ' + r.error.message); return; }
    closeMerchModal();
    fetchMerchContent(_merchSelectedRule.id);
  });
}

// ─── Bulk Import ───
function showBulkImportModal() {
  if (!_merchSelectedRule) { alert('Select a rule first'); return; }
  var modal = document.getElementById('merch-modal');
  modal.innerHTML = '<div class="merch-modal-inner" style="max-width:600px">' +
    '<h3 style="margin:0 0 16px">Bulk Import</h3>' +
    '<p style="font-size:12px;color:var(--text-dim);margin-bottom:8px">Paste a JSON array of content objects. Each should have fields matching the placement format (e.g. h1, sub). Optional: category, min_visits.</p>' +
    '<textarea id="mc-bulk" class="merch-input" rows="12" style="font-family:var(--mono);font-size:11px" placeholder=\'[{"h1":"...", "sub":"...", "category":"humor"}]\'></textarea>' +
    '<div id="mc-bulk-status" style="font-size:12px;margin-top:8px"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">' +
    '<button onclick="closeMerchModal()" class="merch-btn-sm">Cancel</button>' +
    '<button onclick="runBulkImport()" class="merch-btn-sm merch-btn-primary">Import</button></div></div>';
  modal.style.display = 'flex';
}

function runBulkImport() {
  var raw = document.getElementById('mc-bulk').value.trim();
  var status = document.getElementById('mc-bulk-status');
  try {
    var entries = JSON.parse(raw);
    if (!Array.isArray(entries)) throw new Error('Must be a JSON array');
    var rows = entries.map(function(e, i) {
      var content = {};
      var fields = (_merchSelectedPlacement.content_format && _merchSelectedPlacement.content_format.fields) || ['h1', 'sub'];
      fields.forEach(function(f) { content[f] = e[f] || ''; });
      return {
        rule_id: _merchSelectedRule.id,
        content: content,
        sort_order: _merchContent.length + i,
        category: e.category || null,
        min_visits: e.min_visits || 0,
        max_visits: e.max_visits || null,
        season: e.season || null,
        is_active: true
      };
    });
    status.textContent = 'Importing ' + rows.length + ' entries...';
    status.style.color = 'var(--accent)';
    sb.from('merch_content').insert(rows).then(function(r) {
      if (r.error) { status.textContent = 'Error: ' + r.error.message; status.style.color = 'var(--red)'; return; }
      closeMerchModal();
      fetchMerchContent(_merchSelectedRule.id);
      fetchMerchRules(_merchSelectedPlacement.id); // refresh counts
    });
  } catch (e) {
    status.textContent = 'Parse error: ' + e.message;
    status.style.color = 'var(--red)';
  }
}

// ─── Utilities ───
function closeMerchModal() {
  var modal = document.getElementById('merch-modal');
  if (modal) modal.style.display = 'none';
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
