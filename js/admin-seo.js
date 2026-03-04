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
  } catch(err) { console.error('[Admin] SEO load error:', err); toastWarning('SEO data failed to load'); }
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
    console.error('[Admin] SEO sync error:', err); toastError('SEO sync failed');
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
    if (res.error) { console.error('[Admin] Revenue RPC error:', res.error); toastWarning('Revenue data unavailable'); return; }
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
        var email = escapeHtml(u.email || u.user_id.substring(0, 8)) + '...';
        return '<tr><td class="admin-platform-name">' + email + '</td>' +
          '<td style="color:hsl(0,70%,50%)">' + fmtAdminNum(u.credits_used) + '</td>' +
          '<td style="color:hsl(142,60%,40%)">' + fmtAdminNum(u.credits_granted) + '</td>' +
          '<td>' + fmtAdminNum(u.tx_count) + '</td></tr>';
      }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-faint)">No credit usage yet</td></tr>';
    }

    // Resize charts on window resize
    window.addEventListener('resize', function() { tierChart.resize(); dailyChart.resize(); });

  } catch (err) {
    console.error('[Admin] loadRevenueTab error:', err); toastError('Failed to load revenue data');
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
    console.error('[Admin] loadSurveysTab error:', err); toastError('Failed to load survey data');
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
          '<td style="font-weight:600;text-transform:capitalize;">' + escapeHtml((s.company_slug || '—').replace(/-/g, ' ')) + '</td>' +
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
    console.error('[BJ] Ghost admin error:', err); toastError('Ghost admin failed to load');
    var tbody = document.getElementById('ag-company-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--red);padding:24px;">Error: ' + escapeHtml(err.message || 'unknown') + '</td></tr>';
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
    if (error) { console.error('[Feedback]', error); toastWarning('Failed to load feedback'); return; }
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
        sel.innerHTML += '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>';
      });
    }

    applyFeedbackFilters();
    renderFeedbackCards();
  } catch (e) {
    console.error('[Feedback]', e); toastWarning('Feedback load error');
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
    var userShort = escapeHtml(user.length > 16 ? user.slice(0, 14) + '…' : user);
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
    console.error('[Feedback] Status update failed:', error); toastError('Status update failed');
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
  document.getElementById('afb-detail-meta').innerHTML = '<span style="color:' + (src.color || '#999') + ';font-weight:600;">' + escapeHtml(src.label) + '</span> · ' + escapeHtml(user) + ' · ' + new Date(item.submitted_at).toLocaleDateString() + (item.votes ? ' · ' + item.votes + ' votes' : '');
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
    console.error('[Feedback] Sync failed:', e); toastError('Feedback sync failed');
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

