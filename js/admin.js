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
  if (!window.sb) { console.warn('[Admin] No sb client'); return; }
  sb.auth.getUser().then(function(res) {
    if (!res.data || !res.data.user) { console.warn('[Admin] No authenticated user'); return; }
    console.log('[Admin] Checking role for', res.data.user.email);
    sb.from('profiles').select('role').eq('id', res.data.user.id).single().then(function(r) {
      console.log('[Admin] Profile query result:', JSON.stringify(r.data), 'error:', JSON.stringify(r.error));
      if (r.data && r.data.role === 'admin') {
        var nav = document.getElementById('nav-admin');
        if (nav) { nav.style.display = ''; console.log('[Admin] Nav shown'); }
        else { console.warn('[Admin] nav-admin element not found'); }
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

  // Period toggle (lives inside feed-health panel)
  var periodToggle = document.getElementById('admin-period-toggle');
  if (periodToggle) {
    periodToggle.addEventListener('click', function(e) {
      var btn = e.target.closest('.admin-period-btn');
      if (!btn) return;
      periodToggle.querySelectorAll('.admin-period-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      adminPeriod = parseInt(btn.dataset.hours);
      localStorage.setItem('bj_admin_period', adminPeriod);
      _adminTabInit['feed-health'] = false;
      loadBoardHealth();
    });
    periodToggle.querySelectorAll('.admin-period-btn').forEach(function(b) {
      b.classList.toggle('active', parseInt(b.dataset.hours) === adminPeriod);
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
      case 'users': loadUsersTab(); break;
      case 'seo': loadSeoTab(); break;
      case 'revenue': loadRevenueTab(); break;
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
    var snapshot = await sb.rpc('get_board_health', { period_hours: adminPeriod });
    console.log('[Admin] RPC data:', snapshot.data);
    if (snapshot.error) { console.error('[Admin] RPC error:', snapshot.error); return; }
    var d = snapshot.data;
    if (!d) return;

    setAdminText('ah-total', fmtAdminNum(d.total_feeds));
    setAdminText('ah-with-jobs', fmtAdminNum(d.feeds_with_jobs));
    setAdminText('ah-4xx', fmtAdminNum(d.feeds_4xx));
    setAdminText('ah-jobs', fmtAdminNum(d.total_jobs));

    var net = (d.jobs_added || 0) - (d.jobs_lost || 0);
    setAdminText('ah-net', (net >= 0 ? '+' : '') + fmtAdminNum(net));

    setDelta('ah-total-delta', d.boards_added, '+');
    setDelta('ah-with-jobs-delta', null);
    setDelta('ah-4xx-delta', d.boards_lost, '+', true);
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
      if (tbody) {
        tbody.innerHTML = platform.data.map(function(p) {
          return '<tr>' +
            '<td class="admin-platform-name">' + (p.platform || 'unknown') + '</td>' +
            '<td>' + fmtAdminNum(p.total) + '</td>' +
            '<td class="admin-green">+' + fmtAdminNum(p.boards_added) + '</td>' +
            '<td class="admin-red">-' + fmtAdminNum(p.boards_lost) + '</td>' +
            '<td>' + fmtAdminNum(p.with_jobs) + '</td>' +
            '<td class="' + (p.errors_4xx > 0 ? 'admin-red' : '') + '">' + p.errors_4xx + '</td>' +
            '<td>' + fmtAdminNum(p.jobs) + '</td>' +
            '<td class="admin-green">+' + fmtAdminNum(p.jobs_added) + '</td>' +
            '<td class="admin-red">-' + fmtAdminNum(p.jobs_lost) + '</td>' +
            '</tr>';
        }).join('');
      }
    }
  } catch (err) {
    console.error('[Admin] loadBoardHealth error:', err);
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
      return;
    }

    var totalUsers = cohorts.reduce(function(s, c) { return s + (c.user_count || 0); }, 0);
    var totalPro = cohorts.reduce(function(s, c) { return s + (c.pro_count || 0); }, 0);
    var active7d = cohorts.reduce(function(s, c) { return s + (c.active_7d || 0); }, 0);

    setAdminText('ac-total-cohorts', cohorts.length);
    setAdminText('ac-total-users', fmtAdminNum(totalUsers));
    setAdminText('ac-pro-pct', fmtAdminPct(totalPro, totalUsers));
    setAdminText('ac-active-7d', fmtAdminNum(active7d));

    var tbody = document.getElementById('admin-cohort-body');
    if (!tbody) return;
    tbody.innerHTML = cohorts.map(function(c) {
      return '<tr class="admin-cohort-row" data-cohort-id="' + c.id + '" style="cursor:pointer">' +
        '<td class="admin-platform-name">' + c.name + ' <span style="color:var(--text-faint);font-size:10px">(' + c.slug + ')</span></td>' +
        '<td>' + fmtAdminNum(c.user_count) + '</td>' +
        '<td>' + fmtAdminNum(c.free_count) + '</td>' +
        '<td class="admin-green">' + fmtAdminNum(c.pro_count) + '</td>' +
        '<td>' + fmtAdminNum(c.active_7d) + '</td>' +
        '<td>' + fmtAdminNum(c.active_30d) + '</td>' +
        '<td>' + (c.entitlement_count || 0) + '</td>' +
        '<td>' + (c.is_locked ? '🔒' : '—') + '</td>' +
        '</tr>';
    }).join('');

    tbody.addEventListener('click', function(e) {
      var row = e.target.closest('.admin-cohort-row');
      if (!row) return;
      var cid = row.dataset.cohortId;
      var cohort = cohorts.find(function(c) { return String(c.id) === cid; });
      if (cohort) loadCohortDetail(cohort);
    });
  } catch (err) {
    console.error('[Admin] loadCohortTab error:', err);
  }
}

async function loadCohortDetail(cohort) {
  var detail = document.getElementById('admin-cohort-detail');
  var title = document.getElementById('admin-cohort-detail-title');
  var tbody = document.getElementById('admin-entitlement-body');
  if (!detail || !tbody) return;

  title.textContent = cohort.name + ' — Entitlements';
  detail.style.display = '';

  var res = await sb.from('cohort_plan_entitlements')
    .select('feature, plan, behavior, limit_value, bonus_max')
    .eq('cohort_id', cohort.id)
    .order('plan')
    .order('feature');

  if (res.error || !res.data) return;

  tbody.innerHTML = res.data.map(function(e) {
    return '<tr>' +
      '<td>' + e.feature + '</td>' +
      '<td>' + e.plan + '</td>' +
      '<td>' + e.behavior + '</td>' +
      '<td>' + (e.limit_value != null ? e.limit_value : '∞') + '</td>' +
      '<td>' + (e.bonus_max != null ? e.bonus_max : '—') + '</td>' +
      '</tr>';
  }).join('');
}

// ═══════════════════════════════════════════════════════════
// TAB 3: USERS + SESSIONS
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
          series: [{ type: 'bar', data: d.signup_by_week.map(function(w) { return w.count; }), itemStyle: { borderRadius: [4, 4, 0, 0], color: '#4d8eff' }, barWidth: '60%' }]
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

// ═══════════════════════════════════════════════════════════
// TAB 4: SEO — Full Analytics Dashboard
// ═══════════════════════════════════════════════════════════

var _seoSubtab = 'overview';
var _seoDays = 30;
var _seoCharts = {};

function switchSeoSubtab(tab) {
  _seoSubtab = tab;
  document.querySelectorAll('.seo-subpanel').forEach(function(p) { p.style.display = 'none'; });
  document.querySelectorAll('#seo-subtabs .admin-period-btn').forEach(function(b) { b.classList.remove('active'); });
  var panel = document.getElementById('seo-sub-' + tab);
  if (panel) panel.style.display = '';
  var btn = document.querySelector('#seo-subtabs [data-seotab="' + tab + '"]');
  if (btn) btn.classList.add('active');
  loadSeoSubtab(tab);
}

function setSeoRange(days) {
  _seoDays = days;
  document.querySelectorAll('#seo-date-range .admin-period-btn').forEach(function(b) { b.classList.remove('active'); });
  var btn = document.querySelector('#seo-date-range [data-seodays="' + days + '"]');
  if (btn) btn.classList.add('active');
  loadSeoSubtab(_seoSubtab);
}

async function loadSeoTab() {
  console.log('[Admin] loadSeoTab');
  loadSeoSubtab(_seoSubtab);
}

async function loadSeoSubtab(tab) {
  try {
    switch(tab) {
      case 'overview': await loadSeoOverview(); break;
      case 'pages': await loadSeoPages(); break;
      case 'queries': await loadSeoQueries(); break;
      case 'health': await loadSeoHealth(); break;
    }
  } catch(err) { console.error('[Admin] SEO subtab error:', err); }
}

// ─── Overview ───
async function loadSeoOverview() {
  // Summary cards
  var ov = await sb.rpc('get_seo_overview');
  if (ov.data) {
    var d = ov.data;
    setAdminText('seo-clicks-7d', fmtAdminNum(d.clicks_7d || 0));
    setAdminText('seo-impr-7d', fmtAdminNum(d.impressions_7d || 0));
    setAdminText('seo-position', d.avg_position_7d || '—');
    setAdminText('seo-psi', d.latest_psi_mobile || '—');
    setAdminText('seo-signups', fmtAdminNum(d.signups_7d || 0));
  }

  // Trend chart
  var trend = await sb.rpc('get_seo_site_trend', { days_back: _seoDays });
  if (trend.data && trend.data.length > 0) {
    var chartEl = document.getElementById('seo-chart-trend');
    if (chartEl) {
      if (!_seoCharts.trend) _seoCharts.trend = echarts.init(chartEl, null, { renderer: 'canvas' });
      var dates = trend.data.map(function(r) { return r.date; });
      _seoCharts.trend.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['Clicks', 'Impressions'], textStyle: { color: '#9ba1b4', fontSize: 11 }, top: 0 },
        grid: { top: 30, right: 60, bottom: 30, left: 50 },
        xAxis: { type: 'category', data: dates, axisLabel: { color: '#7b829a', fontSize: 10 } },
        yAxis: [
          { type: 'value', name: 'Clicks', axisLabel: { color: '#7b829a', fontSize: 10 }, splitLine: { lineStyle: { color: '#1e2130' } } },
          { type: 'value', name: 'Impressions', axisLabel: { color: '#7b829a', fontSize: 10 }, splitLine: { show: false } }
        ],
        series: [
          { name: 'Clicks', type: 'bar', data: trend.data.map(function(r) { return r.total_clicks; }), itemStyle: { color: '#4d8eff' }, barMaxWidth: 12 },
          { name: 'Impressions', type: 'line', yAxisIndex: 1, data: trend.data.map(function(r) { return r.total_impressions; }), lineStyle: { color: '#34d399' }, itemStyle: { color: '#34d399' }, smooth: true, symbol: 'none' }
        ]
      }, true);
    }
  }

  // ROI chart (clicks vs signups)
  var roi = await sb.rpc('get_seo_roi', { days_back: _seoDays });
  if (roi.data && roi.data.length > 0) {
    var roiEl = document.getElementById('seo-chart-roi');
    if (roiEl) {
      if (!_seoCharts.roi) _seoCharts.roi = echarts.init(roiEl, null, { renderer: 'canvas' });
      _seoCharts.roi.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['Clicks', 'Signups'], textStyle: { color: '#9ba1b4', fontSize: 11 }, top: 0 },
        grid: { top: 30, right: 40, bottom: 30, left: 50 },
        xAxis: { type: 'category', data: roi.data.map(function(r) { return r.date; }), axisLabel: { color: '#7b829a', fontSize: 10 } },
        yAxis: [
          { type: 'value', axisLabel: { color: '#7b829a', fontSize: 10 }, splitLine: { lineStyle: { color: '#1e2130' } } },
          { type: 'value', axisLabel: { color: '#7b829a', fontSize: 10 }, splitLine: { show: false } }
        ],
        series: [
          { name: 'Clicks', type: 'line', data: roi.data.map(function(r) { return r.total_clicks; }), lineStyle: { color: '#4d8eff' }, symbol: 'none', smooth: true },
          { name: 'Signups', type: 'bar', yAxisIndex: 1, data: roi.data.map(function(r) { return r.signups; }), itemStyle: { color: '#a78bfa' }, barMaxWidth: 8 }
        ]
      }, true);
    }
  }
}

// ─── Page Drilldown ───
async function loadSeoPages() {
  // Auto-load if a URL is already selected
  var sel = document.getElementById('seo-drill-url');
  if (sel && sel.value) loadSeoDrilldown();
}

async function loadSeoDrilldown() {
  var sel = document.getElementById('seo-drill-url');
  var url = sel ? sel.value : '';
  var content = document.getElementById('seo-drill-content');
  var empty = document.getElementById('seo-drill-empty');
  if (!url) {
    if (content) content.style.display = 'none';
    if (empty) empty.style.display = '';
    return;
  }
  if (content) content.style.display = '';
  if (empty) empty.style.display = 'none';

  var res = await sb.rpc('get_seo_page_drilldown', { target_url: url, days_back: _seoDays });
  if (!res.data) return;
  var d = res.data;

  // Score cards
  var latestMobile = null, latestDesktop = null;
  if (d.psi_trend && d.psi_trend.length) {
    for (var i = d.psi_trend.length - 1; i >= 0; i--) {
      if (!latestMobile && d.psi_trend[i].source === 'psi_mobile') latestMobile = d.psi_trend[i];
      if (!latestDesktop && d.psi_trend[i].source === 'psi_desktop') latestDesktop = d.psi_trend[i];
      if (latestMobile && latestDesktop) break;
    }
  }
  setAdminText('drill-psi-mobile', latestMobile ? latestMobile.score : '—');
  setAdminText('drill-psi-desktop', latestDesktop ? latestDesktop.score : '—');

  // Color the PSI scores
  var mEl = document.getElementById('drill-psi-mobile');
  var dEl = document.getElementById('drill-psi-desktop');
  if (mEl && latestMobile) mEl.style.color = latestMobile.score >= 90 ? 'var(--green)' : latestMobile.score >= 50 ? 'var(--amber,#f59e0b)' : 'var(--red)';
  if (dEl && latestDesktop) dEl.style.color = latestDesktop.score >= 90 ? 'var(--green)' : latestDesktop.score >= 50 ? 'var(--amber,#f59e0b)' : 'var(--red)';

  // GSC clicks total
  var totalClicks = 0;
  if (d.gsc_trend) d.gsc_trend.forEach(function(r) { totalClicks += r.clicks || 0; });
  setAdminText('drill-clicks', totalClicks || '—');

  // Conversions total
  var totalPV = 0;
  if (d.conversions) d.conversions.forEach(function(r) { if (r.event_type === 'pageview') totalPV += r.count || 0; });
  setAdminText('drill-pageviews', totalPV || '—');

  // PSI trend chart
  var chartEl = document.getElementById('seo-drill-chart');
  if (chartEl && d.psi_trend && d.psi_trend.length > 0) {
    if (!_seoCharts.drill) _seoCharts.drill = echarts.init(chartEl, null, { renderer: 'canvas' });
    var mobileData = d.psi_trend.filter(function(r) { return r.source === 'psi_mobile'; });
    var desktopData = d.psi_trend.filter(function(r) { return r.source === 'psi_desktop'; });
    var dates = [];
    var seen = {};
    d.psi_trend.forEach(function(r) { if (!seen[r.date]) { dates.push(r.date); seen[r.date] = true; } });
    dates.sort();

    var mobileMap = {}; mobileData.forEach(function(r) { mobileMap[r.date] = r.score; });
    var desktopMap = {}; desktopData.forEach(function(r) { desktopMap[r.date] = r.score; });

    _seoCharts.drill.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['Mobile', 'Desktop'], textStyle: { color: '#9ba1b4', fontSize: 11 }, top: 0 },
      grid: { top: 30, right: 40, bottom: 30, left: 40 },
      xAxis: { type: 'category', data: dates, axisLabel: { color: '#7b829a', fontSize: 10 } },
      yAxis: { type: 'value', min: 0, max: 100, axisLabel: { color: '#7b829a', fontSize: 10 }, splitLine: { lineStyle: { color: '#1e2130' } } },
      series: [
        { name: 'Mobile', type: 'line', data: dates.map(function(d) { return mobileMap[d] || null; }), lineStyle: { color: '#f59e0b', width: 2 }, itemStyle: { color: '#f59e0b' }, symbol: 'circle', symbolSize: 6, connectNulls: true },
        { name: 'Desktop', type: 'line', data: dates.map(function(d) { return desktopMap[d] || null; }), lineStyle: { color: '#4d8eff', width: 2 }, itemStyle: { color: '#4d8eff' }, symbol: 'circle', symbolSize: 6, connectNulls: true }
      ]
    }, true);
  }

  // Core Web Vitals
  var cwvGrid = document.getElementById('drill-cwv-grid');
  if (cwvGrid && latestMobile && latestMobile.metrics) {
    var m = latestMobile.metrics;
    var vitals = [
      { label: 'FCP', val: m.fcp ? (m.fcp/1000).toFixed(2) + 's' : '—', good: m.fcp < 1800 },
      { label: 'LCP', val: m.lcp ? (m.lcp/1000).toFixed(2) + 's' : '—', good: m.lcp < 2500 },
      { label: 'CLS', val: m.cls != null ? m.cls.toFixed(3) : '—', good: m.cls < 0.1 },
      { label: 'TBT', val: m.tbt != null ? Math.round(m.tbt) + 'ms' : '—', good: m.tbt < 200 },
      { label: 'SI', val: m.si ? (m.si/1000).toFixed(2) + 's' : '—', good: m.si < 3400 },
      { label: 'SEO', val: m.seo || '—', good: m.seo >= 90 }
    ];
    cwvGrid.innerHTML = vitals.map(function(v) {
      var cls = v.good ? 'admin-green' : 'admin-red';
      return '<div class="stat-card" style="padding:8px;"><div class="stat-val ' + cls + '" style="font-size:16px;">' + v.val + '</div><div class="stat-label" style="font-size:9px;">' + v.label + '</div></div>';
    }).join('');
  } else if (cwvGrid) {
    cwvGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-faint);font-size:12px;padding:12px;">No CWV data yet — run a PSI scan</div>';
  }

  // Issues
  var issuesEl = document.getElementById('drill-issues');
  if (issuesEl) {
    var allIssues = [];
    if (latestMobile && latestMobile.issues) allIssues = allIssues.concat(latestMobile.issues.map(function(i) { i._src = 'mobile'; return i; }));
    if (latestDesktop && latestDesktop.issues) allIssues = allIssues.concat(latestDesktop.issues.map(function(i) { i._src = 'desktop'; return i; }));
    if (allIssues.length > 0) {
      issuesEl.innerHTML = allIssues.map(function(i) {
        return '<div style="display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px;">' +
          '<span style="color:var(--red);font-size:10px;">●</span>' +
          '<span style="color:var(--text-dim);">' + (i.title || i.id) + '</span>' +
          '<span style="margin-left:auto;font-size:10px;color:var(--text-faint);">' + (i._src || '') + '</span>' +
          '</div>';
      }).join('');
    } else {
      issuesEl.innerHTML = '<div style="color:var(--green);font-size:12px;">✓ No issues flagged</div>';
    }
  }

  // Index status
  var idxEl = document.getElementById('drill-index');
  if (idxEl) {
    if (d.index_status) {
      var idx = d.index_status;
      var verdictCls = idx.verdict === 'PASS' ? 'admin-green' : idx.verdict === 'NEUTRAL' ? 'admin-amber' : 'admin-red';
      idxEl.innerHTML = '<span class="' + verdictCls + '">' + (idx.verdict || '—') + '</span>' +
        ' · ' + (idx.coverage_state || '—') +
        (idx.last_crawl_time ? ' · Crawled ' + new Date(idx.last_crawl_time).toLocaleDateString() : '') +
        (idx.mobile_usability ? ' · Mobile: ' + idx.mobile_usability : '');
    } else {
      idxEl.innerHTML = 'No inspection data. <a href="#" onclick="triggerSeoSync([&quot;gsc_inspect&quot;]);return false;" style="color:var(--blue);">Run URL inspection</a>';
    }
  }
}

async function runPsiForSelected() {
  var sel = document.getElementById('seo-drill-url');
  if (!sel || !sel.value) { alert('Select a page first'); return; }
  var btn = event.target;
  btn.disabled = true; btn.textContent = 'Running…';
  try {
    // Call seo-sync with just PSI for this specific URL
    var session = (await sb.auth.getSession()).data.session;
    if (!session) { alert('Sign in required'); return; }
    var resp = await fetch(SUPABASE_URL + '/functions/v1/seo-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({ tasks: ['psi'], target_url: sel.value })
    });
    var data = await resp.json();
    console.log('[Admin] PSI result:', data);
    btn.textContent = 'Done ✓';
    setTimeout(function() { btn.disabled = false; btn.textContent = '▸ Run PSI Now'; }, 2000);
    loadSeoDrilldown();
  } catch(err) {
    console.error('[Admin] PSI error:', err);
    btn.disabled = false; btn.textContent = '▸ Run PSI Now';
    alert('PSI failed: ' + err.message);
  }
}

// ─── Queries ───
async function loadSeoQueries() {
  var res = await sb.rpc('get_seo_top_queries', { days_back: _seoDays, lim: 50 });
  var tbody = document.getElementById('seo-queries-body');
  if (!tbody || !res.data) return;
  tbody.innerHTML = res.data.map(function(r) {
    var ctrPct = r.avg_ctr ? (r.avg_ctr * 100).toFixed(1) + '%' : '—';
    return '<tr><td style="font-size:12px;">' + (r.query || '—') + '</td>' +
      '<td>' + fmtAdminNum(r.total_clicks) + '</td>' +
      '<td>' + fmtAdminNum(r.total_impressions) + '</td>' +
      '<td>' + ctrPct + '</td>' +
      '<td>' + (r.avg_position || '—') + '</td></tr>';
  }).join('');
}

// ─── Technical Health ───
async function loadSeoHealth() {
  // Index status
  var idx = await sb.rpc('get_seo_index_status');
  var idxBody = document.getElementById('seo-index-body');
  if (idxBody && idx.data) {
    idxBody.innerHTML = idx.data.length > 0 ? idx.data.map(function(r) {
      var short = r.url.replace('https://brilliantjobs.app', '').replace('https://brilliantjobs.io', '') || '/';
      var verdictCls = r.verdict === 'PASS' ? 'admin-green' : r.verdict === 'NEUTRAL' ? 'admin-amber' : 'admin-red';
      var crawlDate = r.last_crawl_time ? new Date(r.last_crawl_time).toLocaleDateString() : '—';
      return '<tr><td style="font-family:var(--mono);font-size:11px;">' + short + '</td>' +
        '<td class="' + verdictCls + '">' + (r.verdict || '—') + '</td>' +
        '<td>' + (r.coverage_state || '—') + '</td>' +
        '<td>' + crawlDate + '</td>' +
        '<td>' + (r.mobile_usability || '—') + '</td></tr>';
    }).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text-faint);padding:20px;">No index data yet. Run the SEO sync edge function to populate.</td></tr>';
  }

  // Audit scores trend (PSI over time from seo_site_daily)
  var trend = await sb.rpc('get_seo_site_trend', { days_back: _seoDays });
  if (trend.data && trend.data.some(function(r) { return r.psi_mobile_score; })) {
    var psiEl = document.getElementById('seo-chart-psi-trend');
    if (psiEl) {
      if (!_seoCharts.psi) _seoCharts.psi = echarts.init(psiEl, null, { renderer: 'canvas' });
      var psiData = trend.data.filter(function(r) { return r.psi_mobile_score != null; });
      _seoCharts.psi.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['PSI Mobile', 'Impressions'], textStyle: { color: '#9ba1b4', fontSize: 11 }, top: 0 },
        grid: { top: 30, right: 50, bottom: 30, left: 50 },
        xAxis: { type: 'category', data: psiData.map(function(r) { return r.date; }), axisLabel: { color: '#7b829a', fontSize: 10 } },
        yAxis: [
          { type: 'value', name: 'PSI', min: 0, max: 100, axisLabel: { color: '#7b829a', fontSize: 10 }, splitLine: { lineStyle: { color: '#1e2130' } } },
          { type: 'value', name: 'Impressions', axisLabel: { color: '#7b829a', fontSize: 10 }, splitLine: { show: false } }
        ],
        series: [
          { name: 'PSI Mobile', type: 'line', data: psiData.map(function(r) { return r.psi_mobile_score; }), lineStyle: { color: '#f59e0b' }, itemStyle: { color: '#f59e0b' }, symbol: 'circle', symbolSize: 6 },
          { name: 'Impressions', type: 'bar', yAxisIndex: 1, data: psiData.map(function(r) { return r.total_impressions; }), itemStyle: { color: 'rgba(77,142,255,0.3)' }, barMaxWidth: 12 }
        ]
      }, true);
    }
  }

  // Audit table
  var audits = await sb.rpc('get_seo_tech_health', { days_back: _seoDays });
  var auditBody = document.getElementById('seo-audits-body');
  if (auditBody && audits.data) {
    auditBody.innerHTML = audits.data.length > 0 ? audits.data.slice(0, 30).map(function(r) {
      var short = r.url.replace('https://brilliantjobs.app', '').replace('https://brilliantjobs.io', '') || '/';
      var scoreCls = r.score >= 90 ? 'admin-green' : r.score >= 50 ? 'admin-amber' : 'admin-red';
      var issueCount = Array.isArray(r.issues) ? r.issues.length : 0;
      return '<tr><td>' + r.date + '</td>' +
        '<td style="font-family:var(--mono);font-size:11px;">' + short + '</td>' +
        '<td>' + r.source + '</td>' +
        '<td class="' + scoreCls + '">' + (r.score || '—') + '</td>' +
        '<td>' + issueCount + ' issues</td></tr>';
    }).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text-faint);padding:20px;">No audit data yet. Run technical audits to populate.</td></tr>';
  }
}

// ─── SEO Sync Trigger ───
async function triggerSeoSync(tasks) {
  var btn = document.getElementById('seo-sync-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
  try {
    var session = (await sb.auth.getSession()).data.session;
    if (!session) { alert('Sign in required'); return; }
    var resp = await fetch(SUPABASE_URL + '/functions/v1/seo-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({ tasks: tasks || ['psi', 'posthog'] })
    });
    var data = await resp.json();
    console.log('[Admin] SEO sync result:', data);
    if (btn) btn.textContent = 'Done ✓';
    setTimeout(function() { if (btn) { btn.disabled = false; btn.textContent = '↻ Sync Now'; } }, 2000);
    // Refresh the current subtab
    loadSeoSubtab(_seoSubtab);
  } catch(err) {
    console.error('[Admin] SEO sync error:', err);
    if (btn) { btn.disabled = false; btn.textContent = '↻ Sync Now'; }
    alert('Sync failed: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════════
// TAB 5: REVENUE
// ═══════════════════════════════════════════════════════════

async function loadRevenueTab() {
  console.log('[Admin] loadRevenueTab');
  try {
    var res = await sb.rpc('get_revenue_overview');
    if (res.error) { console.error('[Admin] Revenue RPC error:', res.error); return; }
    var d = res.data;
    if (!d) return;

    setAdminText('ar-total', fmtAdminNum(d.total_users));
    setAdminText('ar-pro', fmtAdminNum(d.pro_users));
    setAdminText('ar-conversion', d.conversion_rate != null ? d.conversion_rate + '%' : '0%');
    var mrr = (d.pro_users || 0) * 29;
    setAdminText('ar-mrr', '$' + fmtAdminNum(mrr));

    var plans = d.plan_distribution || [];
    var total = d.total_users || 1;
    var tbody = document.getElementById('admin-plan-body');
    if (tbody) {
      tbody.innerHTML = plans.map(function(p) {
        return '<tr><td class="admin-platform-name">' + (p.plan || 'free') + '</td>' +
          '<td>' + fmtAdminNum(p.count) + '</td>' +
          '<td>' + Math.round(p.count / total * 100) + '%</td></tr>';
      }).join('');
    }
  } catch (err) {
    console.error('[Admin] loadRevenueTab error:', err);
  }
}
