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
  // Clear loading states
  document.querySelectorAll('.seo-loading').forEach(function(el) { el.remove(); });
  renderSeoStatCards();
  renderGscChart();
  renderPsiChart();
  renderCruxChart();
  renderYltChart();
  renderCloudflareChart();
}


function renderSeoStatCards() {
  var el = document.getElementById('seo-stat-cards');
  if (!el) return;
  el.innerHTML = '';

  var techAudits = _seoData.tech_audits || [];
  var indexStatus = _seoData.index_status || [];
  var siteDailyArr = _seoData.site_daily || [];

  // PSI avg performance (latest mobile)
  var psiMobile = techAudits.filter(function(r) { return r.source === 'psi_mobile'; });
  var latestPsi = psiMobile.length ? psiMobile[psiMobile.length - 1] : null;
  var psiPerf = latestPsi && latestPsi.metrics ? latestPsi.metrics.performance : null;

  // YLT avg
  var yltData = techAudits.filter(function(r) { return r.source === 'yellowlab'; });
  var yltAvg = yltData.length ? Math.round(yltData.reduce(function(s, r) { return s + (r.score || 0); }, 0) / yltData.length) : null;

  // Indexed pages
  var indexed = 0, totalInspected = 0;
  var seen = {};
  indexStatus.forEach(function(r) { if (seen[r.url]) return; seen[r.url] = true; totalInspected++; if (r.verdict === 'PASS') indexed++; });

  // CF traffic
  var cfData = techAudits.filter(function(r) { return r.source === 'cloudflare'; });
  var latestCf = cfData.length ? cfData[cfData.length - 1] : null;
  var cfRequests = latestCf && latestCf.metrics ? latestCf.metrics.total_requests : null;

  // GSC clicks
  var latestSite = siteDailyArr.length ? siteDailyArr[siteDailyArr.length - 1] : null;
  var gscClicks = latestSite ? (latestSite.total_clicks || 0) : null;

  function makeCard(label, value, colorClass) {
    var card = document.createElement('div');
    card.className = 'stat-card';
    var valEl = document.createElement('div');
    valEl.className = 'stat-val';
    if (colorClass) valEl.classList.add(colorClass);
    valEl.textContent = value != null ? value : '—';
    var labelEl = document.createElement('div');
    labelEl.className = 'stat-label';
    labelEl.textContent = label;
    card.appendChild(valEl);
    card.appendChild(labelEl);
    return card;
  }

  function scoreColor(v) { return v >= 90 ? 'admin-green' : v >= 50 ? 'admin-amber' : 'admin-red'; }

  el.appendChild(makeCard('PSI Performance', psiPerf, psiPerf != null ? scoreColor(psiPerf) : ''));
  el.appendChild(makeCard('YLT Score', yltAvg, yltAvg != null ? scoreColor(yltAvg) : ''));
  el.appendChild(makeCard('Indexed', totalInspected > 0 ? indexed + '/' + totalInspected : '—', totalInspected > 0 ? (indexed === totalInspected ? 'admin-green' : indexed > 0 ? 'admin-amber' : 'admin-red') : ''));
  el.appendChild(makeCard('CF Requests', cfRequests != null ? cfRequests.toLocaleString() : '—', ''));
  el.appendChild(makeCard('GSC Clicks', gscClicks != null ? gscClicks.toLocaleString() : '—', ''));
}


function seoChartTheme() {
  return {
    tooltip: { backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 } },
    grid: { left: 50, right: 20, top: 16, bottom: 36 },
    legend: { textStyle: { fontFamily: 'Outfit', fontSize: 11, color: '#7b829a' }, icon: 'roundRect', itemWidth: 12, itemHeight: 8, top: 0 }
  };
}
function seoAxis(type, labelFmt) {
  return { type: type || 'category', axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10, formatter: labelFmt }, splitLine: { lineStyle: { color: '#e8eaef' } }, axisLine: { lineStyle: { color: '#e8eaef' } } };
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
  if (!data.length) {
    el.innerHTML = '<div class="seo-empty">No inspection data yet.<br><a href="#" onclick="triggerSeoSync(['gsc_inspect']);return false;">Run inspection</a></div>';
    return;
  }
  var seen = {};
  var rows = data.filter(function(r) { if (seen[r.url]) return false; seen[r.url] = true; return true; });
  var html = '';
  rows.forEach(function(r) {
    var path = r.url.replace('https://brilliantjobs.app', '') || '/';
    var pass = r.verdict === 'PASS';
    html += '<div class="seo-metric-row">';
    html += '<span class="seo-metric-label">' + path + '</span>';
    html += '<span class="seo-metric-value ' + (pass ? 'seo-verdict-pass' : 'seo-verdict-fail') + '">' + (pass ? '✓ Indexed' : r.coverage_state || 'Not indexed') + '</span>';
    html += '</div>';
  });
  el.innerHTML = html;
}


function renderGscQueries() {
  var el = document.getElementById('seo-side-queries');
  if (!el) return;
  var data = _seoData.gsc_daily || [];
  if (!data.length) {
    el.innerHTML = '<div class="seo-empty">No search query data yet. Site needs impressions in Google Search.</div>';
    return;
  }
  var sorted = data.slice().sort(function(a, b) { return (b.clicks || 0) - (a.clicks || 0); }).slice(0, 20);
  var html = '<table class="admin-platform-table"><thead><tr><th>Query</th><th>Clicks</th><th>Impressions</th><th>Avg Position</th></tr></thead><tbody>';
  sorted.forEach(function(r) {
    html += '<tr><td class="admin-platform-name">' + (r.query || '—') + '</td>';
    html += '<td>' + (r.clicks || 0) + '</td>';
    html += '<td>' + (r.impressions || 0) + '</td>';
    html += '<td>' + (r.position ? r.position.toFixed(1) : '—') + '</td></tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}


function renderKnowledgeGraph() {
  var el = document.getElementById('seo-side-kg');
  if (!el) return;
  var data = (_seoData.tech_audits || []).filter(function(r) { return r.source === 'knowledge_graph'; });
  if (!data.length) {
    el.innerHTML = '<div class="seo-empty">No Knowledge Graph data yet.</div>';
    return;
  }
  var html = '';
  var latest = data[data.length - 1];
  var entities = latest.metrics ? (latest.metrics.entities || []) : [];
  if (entities.length) {
    entities.forEach(function(e) {
      html += '<div class="seo-metric-row"><span class="seo-metric-label">' + (e.name || '—') + '</span><span class="seo-metric-value">' + (e.type || '') + (e.score ? ' · ' + Math.round(e.score * 100) + '%' : '') + '</span></div>';
    });
  } else {
    html = '<div class="seo-empty">No entities found in Knowledge Graph.</div>';
  }
  el.innerHTML = html;
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
  var data = (_seoData.tech_audits || []).filter(function(r) { return r.source === 'dataforseo'; });
  if (!data.length) {
    el.innerHTML = '<div class="seo-empty">No DataForSEO data yet.<br><a href="#" onclick="triggerSeoSync(['dataforseo']);return false;">Run audit</a></div>';
    return;
  }
  var html = '';
  data.forEach(function(r) {
    var m = r.metrics || {};
    var path = r.url.replace('https://brilliantjobs.app', '') || '/';
    html += '<div class="seo-metric-row"><span class="seo-metric-label">' + path + '</span><span class="seo-metric-value">' + (r.score != null ? r.score : '—') + '</span></div>';
    if (m.h1_count != null) html += '<div class="seo-metric-row"><span class="seo-metric-label">H1 tags</span><span class="seo-metric-value">' + m.h1_count + '</span></div>';
    if (m.title_length) html += '<div class="seo-metric-row"><span class="seo-metric-label">Title length</span><span class="seo-metric-value">' + m.title_length + '</span></div>';
    if (m.internal_links) html += '<div class="seo-metric-row"><span class="seo-metric-label">Internal links</span><span class="seo-metric-value">' + m.internal_links + '</span></div>';
    if (m.external_links) html += '<div class="seo-metric-row"><span class="seo-metric-label">External links</span><span class="seo-metric-value">' + m.external_links + '</span></div>';
  });
  el.innerHTML = html;
}


