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
    gsc_queries: fetch(SUPABASE_URL + '/rest/v1/seo_gsc_daily?select=query,clicks,impressions,ctr,position' + dateFilter + urlFilter + '&order=clicks.desc&limit=50', { headers: authHeaders }),
  };

  var keys = Object.keys(fetches);
  var responses = await Promise.all(keys.map(function(k) { return fetches[k].then(function(r) { return r.json(); }).catch(function() { return []; }); }));
  _seoData = {};
  keys.forEach(function(k, i) { _seoData[k] = Array.isArray(responses[i]) ? responses[i] : []; });
  console.log('[Admin] SEO data loaded:', Object.keys(_seoData).map(function(k) { return k + '=' + _seoData[k].length; }).join(', '));
}

// ─── Chart Rendering ───
function renderSeoCharts() {
  renderTrafficChart();
  renderGscChart();
  renderPsiChart();
  renderCruxChart();
  renderYltChart();
  renderCloudflareChart();
}

function seoChartTheme() {
  return {
    grid: { top: 35, right: 20, bottom: 30, left: 50, containLabel: true },
    tooltip: { trigger: 'axis', backgroundColor: '#1a1d2e', borderColor: '#2a2d3e', textStyle: { color: '#e1e4ed', fontSize: 11 } },
  };
}

function seoAxis() {
  return {
    xAxis: { type: 'category', axisLabel: { color: '#7b829a', fontSize: 10 }, axisLine: { lineStyle: { color: '#2a2d3e' } } },
    yAxis: { type: 'value', axisLabel: { color: '#7b829a', fontSize: 10 }, splitLine: { lineStyle: { color: '#1e2130' } } },
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
    title: { text: title, textStyle: { color: '#9ba1b4', fontSize: 12, fontWeight: 600 }, left: 4, top: 4 },
    graphic: { elements: [{ type: 'text', left: 'center', top: 'middle', style: { text: msg || 'No data yet — run sync', fill: '#555', fontSize: 12 } }] }
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
    title: { text: 'PostHog Traffic', textStyle: { color: '#9ba1b4', fontSize: 12, fontWeight: 600 }, left: 4, top: 4 },
    xAxis: Object.assign({}, ax.xAxis, { data: dates }),
    yAxis: ax.yAxis,
    series: [{ type: 'bar', data: dates.map(function(d) { return byDate[d]; }), itemStyle: { color: '#8b5cf6' }, barMaxWidth: 16 }]
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
    title: { text: 'Google Search Console', textStyle: { color: '#9ba1b4', fontSize: 12, fontWeight: 600 }, left: 4, top: 4 },
    legend: { data: ['Clicks', 'Impressions'], textStyle: { color: '#7b829a', fontSize: 10 }, top: 4, right: 10 },
    grid: { top: 35, right: 60, bottom: 30, left: 50 },
    xAxis: Object.assign({}, ax.xAxis, { data: dates }),
    yAxis: [ax.yAxis, { type: 'value', axisLabel: { color: '#7b829a', fontSize: 10 }, splitLine: { show: false } }],
    series: [
      { name: 'Clicks', type: 'bar', data: data.map(function(r) { return r.clicks || r.total_clicks || 0; }), itemStyle: { color: '#4d8eff' }, barMaxWidth: 12 },
      { name: 'Impressions', type: 'line', yAxisIndex: 1, data: data.map(function(r) { return r.impressions || r.total_impressions || 0; }), lineStyle: { color: '#34d399' }, itemStyle: { color: '#34d399' }, smooth: true, symbol: 'none' }
    ]
  }), true);
}

// 3. PSI 4 categories
function renderPsiChart() {
  var chart = initSeoChart('seo-chart-psi');
  if (!chart) return;
  var audits = (_seoData.tech_audits || []).filter(function(r) { return r.source === 'psi_mobile'; });
  if (!audits.length) { seoNoData(chart, 'PageSpeed Insights (Mobile)'); return; }

  if (_seoUrl) {
    // Single URL time series
    var dates = audits.map(function(r) { return r.date; });
    var t = seoChartTheme(), ax = seoAxis();
    chart.setOption(Object.assign({}, t, {
      title: { text: 'PageSpeed Insights (Mobile)', textStyle: { color: '#9ba1b4', fontSize: 12, fontWeight: 600 }, left: 4, top: 4 },
      legend: { data: ['Performance', 'SEO', 'Accessibility', 'Best Practices'], textStyle: { color: '#7b829a', fontSize: 10 }, top: 4, right: 10 },
      xAxis: Object.assign({}, ax.xAxis, { data: dates }),
      yAxis: Object.assign({}, ax.yAxis, { min: 0, max: 100 }),
      series: [
        { name: 'Performance', type: 'line', data: audits.map(function(r) { return r.metrics && r.metrics.performance; }), lineStyle: { color: '#f59e0b' }, itemStyle: { color: '#f59e0b' }, symbol: 'circle', symbolSize: 6 },
        { name: 'SEO', type: 'line', data: audits.map(function(r) { return r.metrics && r.metrics.seo; }), lineStyle: { color: '#34d399' }, itemStyle: { color: '#34d399' }, symbol: 'circle', symbolSize: 6 },
        { name: 'Accessibility', type: 'line', data: audits.map(function(r) { return r.metrics && r.metrics.accessibility; }), lineStyle: { color: '#4d8eff' }, itemStyle: { color: '#4d8eff' }, symbol: 'circle', symbolSize: 6 },
        { name: 'Best Practices', type: 'line', data: audits.map(function(r) { return r.metrics && r.metrics.best_practices; }), lineStyle: { color: '#a78bfa' }, itemStyle: { color: '#a78bfa' }, symbol: 'circle', symbolSize: 6 }
      ]
    }), true);
  } else {
    // Aggregate — latest scores by page
    var latestDate = audits[audits.length - 1].date;
    var latest = audits.filter(function(r) { return r.date === latestDate; });
    var labels = latest.map(function(r) { try { return new URL(r.url).pathname || '/'; } catch(e) { return r.url; } });
    var t = seoChartTheme(), ax = seoAxis();
    chart.setOption(Object.assign({}, t, {
      title: { text: 'PSI Performance by Page (Mobile)', textStyle: { color: '#9ba1b4', fontSize: 12, fontWeight: 600 }, left: 4, top: 4 },
      legend: { data: ['Performance', 'SEO', 'A11y', 'BP'], textStyle: { color: '#7b829a', fontSize: 10 }, top: 4, right: 10 },
      grid: { top: 35, right: 20, bottom: 60, left: 40 },
      xAxis: { type: 'category', data: labels, axisLabel: { color: '#7b829a', fontSize: 9, rotate: 35 } },
      yAxis: Object.assign({}, ax.yAxis, { min: 0, max: 100 }),
      series: [
        { name: 'Performance', type: 'bar', data: latest.map(function(r) { return r.metrics && r.metrics.performance; }), itemStyle: { color: '#f59e0b' }, barMaxWidth: 14 },
        { name: 'SEO', type: 'bar', data: latest.map(function(r) { return r.metrics && r.metrics.seo; }), itemStyle: { color: '#34d399' }, barMaxWidth: 14 },
        { name: 'A11y', type: 'bar', data: latest.map(function(r) { return r.metrics && r.metrics.accessibility; }), itemStyle: { color: '#4d8eff' }, barMaxWidth: 14 },
        { name: 'BP', type: 'bar', data: latest.map(function(r) { return r.metrics && r.metrics.best_practices; }), itemStyle: { color: '#a78bfa' }, barMaxWidth: 14 }
      ]
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
    title: { text: 'Chrome UX Report (p75)', textStyle: { color: '#9ba1b4', fontSize: 12, fontWeight: 600 }, left: 4, top: 4 },
    grid: { top: 35, right: 20, bottom: 50, left: 60 },
    xAxis: { type: 'category', data: labels, axisLabel: { color: '#7b829a', fontSize: 9, rotate: 30 } },
    yAxis: ax.yAxis,
    series: [{ type: 'bar', data: p75s, itemStyle: { color: function(p) { return ['#34d399','#4d8eff','#f59e0b','#a78bfa','#ef4444'][p.dataIndex % 5]; } }, barMaxWidth: 30 }]
  }), true);
}

// 5. Yellow Lab Tools
function renderYltChart() {
  var chart = initSeoChart('seo-chart-ylt');
  if (!chart) return;
  var yltData = (_seoData.tech_audits || []).filter(function(r) { return r.source === 'yellowlab'; });
  if (!yltData.length) { seoNoData(chart, 'Yellow Lab Tools'); return; }

  if (_seoUrl) {
    var dates = yltData.map(function(r) { return r.date; });
    var scores = yltData.map(function(r) { return r.score; });
    var t = seoChartTheme(), ax = seoAxis();
    chart.setOption(Object.assign({}, t, {
      title: { text: 'Yellow Lab Tools Score', textStyle: { color: '#9ba1b4', fontSize: 12, fontWeight: 600 }, left: 4, top: 4 },
      xAxis: Object.assign({}, ax.xAxis, { data: dates }),
      yAxis: Object.assign({}, ax.yAxis, { min: 0, max: 100 }),
      series: [{ type: 'line', data: scores, lineStyle: { color: '#eab308' }, itemStyle: { color: '#eab308' }, symbol: 'circle', symbolSize: 6, areaStyle: { color: 'rgba(234,179,8,0.1)' } }]
    }), true);
  } else {
    var latestDate = yltData[yltData.length - 1].date;
    var latest = yltData.filter(function(r) { return r.date === latestDate; });
    var labels = latest.map(function(r) { try { return new URL(r.url).pathname || '/'; } catch(e) { return r.url; } });
    var scores = latest.map(function(r) { return r.score || 0; });
    var t = seoChartTheme(), ax = seoAxis();
    chart.setOption(Object.assign({}, t, {
      title: { text: 'Yellow Lab Tools (by page)', textStyle: { color: '#9ba1b4', fontSize: 12, fontWeight: 600 }, left: 4, top: 4 },
      grid: { top: 35, right: 20, bottom: 50, left: 50 },
      xAxis: { type: 'category', data: labels, axisLabel: { color: '#7b829a', fontSize: 9, rotate: 30 } },
      yAxis: Object.assign({}, ax.yAxis, { min: 0, max: 100 }),
      series: [{ type: 'bar', data: scores, itemStyle: { color: function(p) { var v = p.value; return v >= 80 ? '#34d399' : v >= 50 ? '#f59e0b' : '#ef4444'; } }, barMaxWidth: 30 }]
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
    title: { text: 'Cloudflare', textStyle: { color: '#9ba1b4', fontSize: 12, fontWeight: 600 }, left: 4, top: 4 },
    legend: { data: ['Requests', 'Page Views', 'Uniques'], textStyle: { color: '#7b829a', fontSize: 10 }, top: 4, right: 10 },
    grid: { top: 35, right: 60, bottom: 30, left: 50 },
    xAxis: Object.assign({}, ax.xAxis, { data: dates }),
    yAxis: [ax.yAxis, { type: 'value', axisLabel: { color: '#7b829a', fontSize: 10 }, splitLine: { show: false } }],
    series: [
      { name: 'Requests', type: 'bar', data: cfData.map(function(r) { return r.metrics && r.metrics.total_requests || 0; }), itemStyle: { color: 'rgba(77,142,255,0.3)' }, barMaxWidth: 16 },
      { name: 'Page Views', type: 'line', data: cfData.map(function(r) { return r.metrics && r.metrics.page_views || 0; }), lineStyle: { color: '#f97316' }, itemStyle: { color: '#f97316' }, symbol: 'circle', symbolSize: 5 },
      { name: 'Uniques', type: 'line', yAxisIndex: 1, data: cfData.map(function(r) { return r.metrics && r.metrics.unique_visitors || 0; }), lineStyle: { color: '#34d399' }, itemStyle: { color: '#34d399' }, symbol: 'circle', symbolSize: 5 }
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
  if (!data.length) { el.innerHTML = '<div style="color:var(--text-faint);font-size:12px;padding:8px 0;">No inspection data yet. Requires Google Service Account key (GOOGLE_SA_KEY_JSON) to be set as a Supabase secret. <a href="#" onclick="triggerSeoSync([\'gsc_inspect\']);return false;" style="color:var(--blue);">Try running inspection</a></div>'; return; }

  if (_seoUrl) {
    var latest = data.find(function(r) { return r.url === _seoUrl; }) || data[0];
    var vc = latest.verdict === 'PASS' ? 'color:var(--green)' : latest.verdict === 'NEUTRAL' ? 'color:#f59e0b' : 'color:var(--red)';
    el.innerHTML = '<div style="display:flex;gap:12px;flex-wrap:wrap;font-size:12px;">' +
      '<div><span style="color:var(--text-faint);">Verdict:</span> <strong style="' + vc + '">' + (latest.verdict || '—') + '</strong></div>' +
      '<div><span style="color:var(--text-faint);">Coverage:</span> ' + (latest.coverage_state || '—') + '</div>' +
      '<div><span style="color:var(--text-faint);">Indexing:</span> ' + (latest.indexing_state || '—') + '</div>' +
      '<div><span style="color:var(--text-faint);">Last Crawl:</span> ' + (latest.last_crawl_time ? new Date(latest.last_crawl_time).toLocaleDateString() : '—') + '</div>' +
      '<div><span style="color:var(--text-faint);">Mobile:</span> ' + (latest.mobile_usability || '—') + '</div></div>';
  } else {
    var pass = 0, fail = 0, other = 0, seen = {};
    data.forEach(function(r) { if (seen[r.url]) return; seen[r.url] = true; if (r.verdict === 'PASS') pass++; else if (r.verdict === 'FAIL' || r.verdict === 'ERROR') fail++; else other++; });
    el.innerHTML = '<div style="display:flex;gap:16px;font-size:12px;">' +
      '<div><span style="color:var(--green);font-weight:600;">' + pass + '</span> indexed</div>' +
      '<div><span style="color:var(--red);font-weight:600;">' + fail + '</span> failed</div>' +
      '<div><span style="color:var(--text-faint);font-weight:600;">' + other + '</span> other</div></div>';
  }
}

function renderGscQueries() {
  var el = document.getElementById('seo-side-queries');
  if (!el) return;
  var queries = _seoData.gsc_queries || [];
  if (!queries.length) { el.innerHTML = '<div style="color:var(--text-faint);font-size:12px;padding:8px 0;">No search queries yet</div>'; return; }
  var qMap = {};
  queries.forEach(function(r) { if (!r.query) return; if (!qMap[r.query]) qMap[r.query] = { clicks:0, impressions:0, position:0, count:0 }; qMap[r.query].clicks += r.clicks||0; qMap[r.query].impressions += r.impressions||0; qMap[r.query].position += r.position||0; qMap[r.query].count++; });
  var sorted = Object.entries(qMap).sort(function(a,b) { return b[1].clicks - a[1].clicks; }).slice(0,20);
  el.innerHTML = '<table style="width:100%;font-size:11px;border-collapse:collapse;"><tr style="color:var(--text-faint);"><th style="text-align:left;padding:4px;">Query</th><th>Clicks</th><th>Impr</th><th>Pos</th></tr>' +
    sorted.map(function(e) { var q=e[0],d=e[1]; return '<tr style="border-top:1px solid var(--border);"><td style="padding:4px;color:var(--text-dim);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+q+'</td><td style="text-align:center;color:var(--blue);">'+d.clicks+'</td><td style="text-align:center;">'+d.impressions+'</td><td style="text-align:center;">'+(d.count>0?(d.position/d.count).toFixed(1):'—')+'</td></tr>'; }).join('') + '</table>';
}

function renderKnowledgeGraph() {
  var el = document.getElementById('seo-side-kg');
  if (!el) return;
  var kgData = (_seoData.tech_audits || []).filter(function(r) { return r.source === 'knowledge_graph'; });
  if (!kgData.length) { el.innerHTML = '<div style="color:var(--text-faint);font-size:12px;">No Knowledge Graph data yet</div>'; return; }
  var entities = (kgData[kgData.length-1].metrics && kgData[kgData.length-1].metrics.entities) || [];
  if (!entities.length) { el.innerHTML = '<div style="color:var(--text-faint);font-size:12px;">No entities found</div>'; return; }
  el.innerHTML = entities.map(function(e) {
    return '<div style="display:flex;gap:8px;align-items:baseline;padding:4px 0;border-bottom:1px solid var(--border);font-size:11px;"><span style="color:var(--text);font-weight:500;">'+(e.name||'—')+'</span><span style="color:var(--text-faint);font-size:10px;">'+(e.type||'')+'</span>'+(e.score?'<span style="margin-left:auto;color:var(--text-faint);font-size:10px;">'+e.score.toFixed(1)+'</span>':'')+'</div>';
  }).join('');
}

function renderPsiDrilldown() {
  var el = document.getElementById('seo-side-psi');
  if (!el) return;
  var audits = (_seoData.tech_audits || []).filter(function(r) { return r.source === 'psi_mobile'; });
  if (!audits.length) { el.innerHTML = '<div style="color:var(--text-faint);font-size:12px;">No PSI data yet</div>'; return; }
  var latest = audits[audits.length-1];
  var issues = latest.issues || [];
  var m = latest.metrics || {};
  var vitals = [
    { label:'FCP', val:m.fcp?(m.fcp/1000).toFixed(2)+'s':'—', good:m.fcp<1800 },
    { label:'LCP', val:m.lcp?(m.lcp/1000).toFixed(2)+'s':'—', good:m.lcp<2500 },
    { label:'CLS', val:m.cls!=null?m.cls.toFixed(3):'—', good:m.cls<0.1 },
    { label:'TBT', val:m.tbt!=null?Math.round(m.tbt)+'ms':'—', good:m.tbt<200 },
  ];
  var html = '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;">';
  vitals.forEach(function(v) { html += '<div style="text-align:center;"><div style="font-size:14px;font-weight:700;color:'+(v.good?'var(--green)':'var(--red)')+';">'+v.val+'</div><div style="font-size:9px;color:var(--text-faint);text-transform:uppercase;">'+v.label+'</div></div>'; });
  html += '</div>';
  html += issues.length > 0 ? issues.slice(0,8).map(function(i) { return '<div style="font-size:11px;padding:3px 0;color:var(--text-dim);border-bottom:1px solid var(--border);">● '+(i.title||i.id)+'</div>'; }).join('') : '<div style="color:var(--green);font-size:11px;">✓ No issues flagged</div>';
  el.innerHTML = html;
}


// ─── DataForSEO On-Page Audit ───
function renderDfsAudit() {
  var el = document.getElementById('seo-side-dfs');
  if (!el) return;
  var dfsData = (_seoData.tech_audits || []).filter(function(r) { return r.source === 'dataforseo'; });
  if (!dfsData.length) { el.innerHTML = '<div style="color:var(--text-faint);font-size:12px;">No DataForSEO data yet — run sync</div>'; return; }

  if (_seoUrl) {
    var latest = dfsData.filter(function(r) { return r.url === _seoUrl; });
    latest = latest.length ? latest[latest.length - 1] : dfsData[dfsData.length - 1];
    var m = latest.metrics || {};
    var issues = latest.issues || [];
    el.innerHTML =
      '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;margin-bottom:8px;">' +
      '<div><span style="color:var(--text-faint);">Score:</span> <strong style="color:' + (latest.score >= 90 ? 'var(--green)' : latest.score >= 50 ? '#f59e0b' : 'var(--red)') + ';">' + (latest.score || '—') + '</strong></div>' +
      '<div><span style="color:var(--text-faint);">Title:</span> ' + (m.title_length || '—') + ' chars</div>' +
      '<div><span style="color:var(--text-faint);">Desc:</span> ' + (m.description_length || '—') + ' chars</div>' +
      '<div><span style="color:var(--text-faint);">H1s:</span> ' + (m.h1_count || 0) + '</div>' +
      '<div><span style="color:var(--text-faint);">Int links:</span> ' + (m.internal_links || '—') + '</div>' +
      '<div><span style="color:var(--text-faint);">Ext links:</span> ' + (m.external_links || '—') + '</div>' +
      '<div><span style="color:var(--text-faint);">Size:</span> ' + (m.page_size ? Math.round(m.page_size/1024) + 'KB' : '—') + '</div>' +
      '<div><span style="color:var(--text-faint);">Load:</span> ' + (m.load_time ? m.load_time.toFixed(2) + 's' : '—') + '</div>' +
      '</div>' +
      (issues.length > 0 ? issues.slice(0,8).map(function(i) { return '<div style="font-size:11px;padding:3px 0;color:var(--text-dim);border-bottom:1px solid var(--border);">● ' + (i.message || i.check || '—') + '</div>'; }).join('') : '<div style="color:var(--green);font-size:11px;">✓ No issues</div>');
  } else {
    // Aggregate — show table of latest scores
    var latestDate = dfsData[dfsData.length - 1].date;
    var latest = dfsData.filter(function(r) { return r.date === latestDate; });
    el.innerHTML = '<table style="width:100%;font-size:11px;border-collapse:collapse;">' +
      '<tr style="color:var(--text-faint);"><th style="text-align:left;padding:4px;">Page</th><th>Score</th><th>Size</th><th>Links</th><th>Issues</th></tr>' +
      latest.map(function(r) {
        var m = r.metrics || {};
        var path = '/';
        try { path = new URL(r.url).pathname || '/'; } catch(e) {}
        var sc = r.score || 0;
        var scColor = sc >= 90 ? 'var(--green)' : sc >= 50 ? '#f59e0b' : 'var(--red)';
        return '<tr style="border-top:1px solid var(--border);"><td style="padding:4px;font-family:var(--mono);">' + path + '</td>' +
          '<td style="text-align:center;color:' + scColor + ';font-weight:600;">' + sc + '</td>' +
          '<td style="text-align:center;">' + (m.page_size ? Math.round(m.page_size/1024) + 'KB' : '—') + '</td>' +
          '<td style="text-align:center;">' + ((m.internal_links||0) + (m.external_links||0)) + '</td>' +
          '<td style="text-align:center;">' + (Array.isArray(r.issues) ? r.issues.length : 0) + '</td></tr>';
      }).join('') + '</table>';
  }
}

// ─── Sync Trigger ───
async function triggerSeoSync(tasks) {
  var btn = document.getElementById('seo-sync-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
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
    if (btn) btn.textContent = 'Done ✓';
    setTimeout(function() { if (btn) { btn.disabled = false; btn.textContent = '↻ Sync All'; } }, 2000);
    loadSeoTab();
  } catch(err) {
    console.error('[Admin] SEO sync error:', err);
    if (btn) { btn.disabled = false; btn.textContent = '↻ Sync All'; }
    alert('Sync failed: ' + err.message);
  }
}


// ═══════════════════════════════════════════════════════════
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
