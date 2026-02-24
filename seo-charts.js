/**
 * seo-charts.js — Client-side ECharts hydration for SEO data pages
 * Reads <script id="seo-chart-data"> JSON and renders each chart container.
 * Matches dashboard STATS_THEME colors for brand consistency.
 */
(function () {
  'use strict';

  // ── Design tokens ──
  var SANS = '"Outfit", -apple-system, sans-serif';
  var MONO = '"JetBrains Mono", monospace';
  var COLORS = ['#6366f1','#22c55e','#f59e0b','#ec4899','#06b6d4','#8b5cf6','#ef4444','#f97316','#14b8a6','#a855f7'];
  var DIM = 'hsl(228,11%,41%)';
  var FAINT = 'hsl(225,10%,63%)';
  var BORDER = 'hsl(228,16%,91%)';
  var SPLIT = 'hsl(228,16%,95%)';

  var ttip = {
    backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', borderWidth: 1,
    textStyle: { color: '#e8eaf0', fontFamily: SANS, fontSize: 12 }
  };

  // ── Helpers ──
  function fmtK(v) { return v >= 1000 ? (v/1000).toFixed(v >= 10000 ? 0 : 1) + 'K' : String(v); }
  function fmtSal(v) { return !v ? 'N/A' : v >= 1000000 ? '$'+(Math.round(v/100000)/10)+'M' : '$'+Math.round(v/1000)+'K'; }

  var charts = {};

  function getChart(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    if (charts[id]) { charts[id].dispose(); }
    charts[id] = echarts.init(el, null, { renderer: 'canvas' });
    return charts[id];
  }

  // ── Chart renderers ──

  function renderTimeline(data) {
    var c = getChart('chart-timeline');
    if (!c || !data.charts || !data.charts.timeline || data.charts.timeline.length === 0) return;
    var tl = data.charts.timeline;
    c.setOption({
      tooltip: Object.assign({}, ttip, { trigger: 'axis', formatter: function(p) {
        return '<b>' + p[0].axisValue + '</b><br>' + fmtK(p[0].value) + ' new jobs';
      }}),
      grid: { left: 48, right: 16, top: 24, bottom: 36 },
      xAxis: { type: 'category', data: tl.map(function(t){return t.week;}),
        axisLabel: { color: DIM, fontFamily: MONO, fontSize: 10, rotate: 30 },
        axisLine: { lineStyle: { color: BORDER } }
      },
      yAxis: { type: 'value', axisLabel: { color: FAINT, fontFamily: MONO, fontSize: 10, formatter: function(v){return fmtK(v);} },
        splitLine: { lineStyle: { color: SPLIT } }
      },
      series: [{
        type: 'bar', data: tl.map(function(t){return t.count;}),
        itemStyle: { color: COLORS[0], borderRadius: [3,3,0,0] },
        barMaxWidth: 32
      }]
    });
  }

  function renderSalary(data) {
    var c = getChart('chart-salary');
    if (!c || !data.charts || !data.charts.salary_buckets || data.charts.salary_buckets.length === 0) return;
    var bk = data.charts.salary_buckets;
    c.setOption({
      tooltip: Object.assign({}, ttip, { trigger: 'axis' }),
      grid: { left: 60, right: 16, top: 24, bottom: 56 },
      xAxis: { type: 'category', data: bk.map(function(b){return b.range;}),
        axisLabel: { color: DIM, fontFamily: MONO, fontSize: 9, rotate: 45 },
        axisLine: { lineStyle: { color: BORDER } }
      },
      yAxis: { type: 'value', axisLabel: { color: FAINT, fontFamily: MONO, fontSize: 10, formatter: function(v){return fmtK(v);} },
        splitLine: { lineStyle: { color: SPLIT } }
      },
      series: [{
        type: 'bar', data: bk.map(function(b){return b.count;}),
        itemStyle: { color: COLORS[1], borderRadius: [3,3,0,0] },
        barMaxWidth: 28,
        markLine: data.stats && data.stats.median_salary ? {
          silent: true,
          data: [{ xAxis: '$' + Math.round(Math.floor(data.stats.median_salary / 25000) * 25) + 'K-$' + Math.round((Math.floor(data.stats.median_salary / 25000) * 25) + 25) + 'K' }],
          label: { formatter: 'Median', fontSize: 10, fontFamily: MONO, color: DIM },
          lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 }
        } : undefined
      }]
    });
  }

  function renderCompanies(data) {
    var c = getChart('chart-companies');
    if (!c || !data.charts || !data.charts.top_companies || data.charts.top_companies.length === 0) return;
    var co = data.charts.top_companies.slice(0, 15);
    c.setOption({
      tooltip: Object.assign({}, ttip, { trigger: 'axis', axisPointer: { type: 'shadow' } }),
      grid: { left: 160, right: 48, top: 12, bottom: 16 },
      xAxis: { type: 'value', axisLabel: { color: FAINT, fontFamily: MONO, fontSize: 10 },
        splitLine: { lineStyle: { color: SPLIT } }
      },
      yAxis: { type: 'category', data: co.map(function(c){return c.name;}).reverse(),
        axisLabel: { color: DIM, fontFamily: SANS, fontSize: 11, width: 140, overflow: 'truncate' },
        axisLine: { show: false }, axisTick: { show: false }
      },
      series: [{
        type: 'bar', data: co.map(function(c){return c.count;}).reverse(),
        itemStyle: { color: COLORS[4], borderRadius: [0,3,3,0] },
        barMaxWidth: 20,
        label: { show: true, position: 'right', color: DIM, fontFamily: MONO, fontSize: 10, formatter: function(p){return fmtK(p.value);} }
      }]
    });
  }

  function renderLevels(data) {
    var c = getChart('chart-levels');
    if (!c || !data.charts || !data.charts.level_funnel || data.charts.level_funnel.length === 0) return;
    var lf = data.charts.level_funnel.filter(function(l){return l.count > 0;});
    c.setOption({
      tooltip: Object.assign({}, ttip, { trigger: 'axis', axisPointer: { type: 'shadow' } }),
      grid: { left: 100, right: 48, top: 12, bottom: 16 },
      xAxis: { type: 'value', axisLabel: { color: FAINT, fontFamily: MONO, fontSize: 10 },
        splitLine: { lineStyle: { color: SPLIT } }
      },
      yAxis: { type: 'category', data: lf.map(function(l){return l.level;}).reverse(),
        axisLabel: { color: DIM, fontFamily: SANS, fontSize: 11 },
        axisLine: { show: false }, axisTick: { show: false }
      },
      series: [{
        type: 'bar', data: lf.map(function(l){return l.count;}).reverse(),
        itemStyle: { color: function(p) { return COLORS[p.dataIndex % COLORS.length]; }, borderRadius: [0,3,3,0] },
        barMaxWidth: 22,
        label: { show: true, position: 'right', color: DIM, fontFamily: MONO, fontSize: 10, formatter: function(p){return fmtK(p.value);} }
      }]
    });
  }

  function renderWorktype(data) {
    var c = getChart('chart-worktype');
    if (!c || !data.charts || !data.charts.loc_type) return;
    var lt = data.charts.loc_type;
    var items = Object.entries(lt).filter(function(e){return e[1]>0;}).map(function(e){return {name:e[0],value:e[1]};});
    if (items.length === 0) return;
    c.setOption({
      tooltip: Object.assign({}, ttip, { trigger: 'item', formatter: function(p){return p.name+': '+fmtK(p.value)+' ('+p.percent+'%)';} }),
      legend: { bottom: 8, textStyle: { fontFamily: SANS, fontSize: 12, color: DIM } },
      series: [{
        type: 'pie', radius: ['40%','68%'], center: ['50%','45%'],
        data: items,
        itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
        color: [COLORS[1], COLORS[0], COLORS[2], FAINT],
        label: { show: false },
        emphasis: { label: { show: true, fontFamily: SANS, fontSize: 13, fontWeight: 600 } }
      }]
    });
  }

  function renderComparison(data) {
    var c = getChart('chart-comparison');
    if (!c || !data.comparison || !data.comparison.salary_ranking) return;
    var ranking = data.comparison.salary_ranking;
    var currentMetro = data.metro ? data.metro.slug : null;
    var natMed = data.comparison.national_median;

    c.setOption({
      tooltip: Object.assign({}, ttip, { trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: function(p) { return '<b>'+p[0].name+'</b><br>Median: '+fmtSal(p[0].value); }
      }),
      grid: { left: 180, right: 48, top: 12, bottom: 16 },
      xAxis: { type: 'value', axisLabel: { color: FAINT, fontFamily: MONO, fontSize: 10, formatter: function(v){return fmtSal(v);} },
        splitLine: { lineStyle: { color: SPLIT } }
      },
      yAxis: { type: 'category', data: ranking.map(function(r){return r.display;}).reverse(),
        axisLabel: { color: DIM, fontFamily: SANS, fontSize: 11, width: 160, overflow: 'truncate' },
        axisLine: { show: false }, axisTick: { show: false }
      },
      series: [{
        type: 'bar', data: ranking.map(function(r){return r.median;}).reverse(),
        itemStyle: {
          color: function(p) {
            var slug = ranking[ranking.length - 1 - p.dataIndex] ? ranking[ranking.length - 1 - p.dataIndex].metro : '';
            return slug === currentMetro ? COLORS[0] : 'hsl(228,16%,82%)';
          },
          borderRadius: [0,3,3,0]
        },
        barMaxWidth: 20,
        label: { show: true, position: 'right', color: DIM, fontFamily: MONO, fontSize: 10, formatter: function(p){return fmtSal(p.value);} },
        markLine: natMed ? {
          silent: true,
          data: [{ xAxis: natMed }],
          label: { formatter: 'National', fontSize: 10, fontFamily: MONO, color: '#ef4444', position: 'insideStartTop' },
          lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 }
        } : undefined
      }]
    });
  }

  function renderMetros(data) {
    var c = getChart('chart-metros');
    if (!c || !data.charts || !data.charts.top_metros || data.charts.top_metros.length === 0) return;
    var metros = data.charts.top_metros.slice(0, 15);
    c.setOption({
      tooltip: Object.assign({}, ttip, { trigger: 'axis', axisPointer: { type: 'shadow' } }),
      grid: { left: 60, right: 48, top: 12, bottom: 16 },
      xAxis: { type: 'value', axisLabel: { color: FAINT, fontFamily: MONO, fontSize: 10 },
        splitLine: { lineStyle: { color: SPLIT } }
      },
      yAxis: { type: 'category', data: metros.map(function(m){return m.state;}).reverse(),
        axisLabel: { color: DIM, fontFamily: SANS, fontSize: 11 },
        axisLine: { show: false }, axisTick: { show: false }
      },
      series: [{
        type: 'bar', data: metros.map(function(m){return m.count;}).reverse(),
        itemStyle: { color: COLORS[5], borderRadius: [0,3,3,0] },
        barMaxWidth: 20,
        label: { show: true, position: 'right', color: DIM, fontFamily: MONO, fontSize: 10, formatter: function(p){return fmtK(p.value);} }
      }]
    });
  }

  function renderMetroLeaderboard(data) {
    // For market overview — show metro comparison from cached data
    // This uses the same comparison ranking data but styled differently
    var c = getChart('chart-metro-leaderboard');
    if (!c) return;
    // Market page might not have comparison data directly, so we skip if unavailable
    // This chart will be populated when we have the metro link grid
    var el = document.getElementById('chart-metro-leaderboard');
    if (el) {
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.color = DIM;
      el.style.fontSize = '14px';
      el.style.fontFamily = SANS;
      el.innerHTML = '<div style="text-align:center;padding:40px"><p style="font-size:16px;font-weight:600;margin-bottom:12px">Explore by Metro</p>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">' +
        ['New York', 'San Francisco', 'Los Angeles', 'Austin', 'Seattle', 'Chicago', 'Boston', 'Denver', 'Atlanta', 'Dallas', 'Miami', 'D.C.', 'Portland', 'Minneapolis', 'Remote'].map(function(m) {
          var slug = m.toLowerCase().replace(/[^a-z]+/g, '-').replace(/(^-|-$)/g, '').replace('dc', 'washington-dc');
          if (slug === 'd-c-') slug = 'washington-dc';
          return '<a href="/jobs-in/' + slug + '" style="padding:8px 16px;background:#fff;border:1px solid hsl(228,16%,91%);border-radius:8px;text-decoration:none;color:hsl(230,28%,14%);font-size:13px;font-weight:500;transition:all .15s">' + m + '</a>';
        }).join('') +
        '</div></div>';
    }
  }

  // ── Populate related roles grid ──
  function populateRelatedRoles(data) {
    var grid = document.getElementById('related-roles');
    if (!grid || !data.metro) return;
    var roles = [
      {slug:'software-engineer',name:'Software Engineer'},
      {slug:'product-manager',name:'Product Manager'},
      {slug:'data-scientist',name:'Data Scientist'},
      {slug:'ux-designer',name:'UX Designer'},
      {slug:'sales-representative',name:'Sales'},
      {slug:'devops-engineer',name:'DevOps Engineer'},
      {slug:'data-analyst',name:'Data Analyst'},
      {slug:'project-manager',name:'Project Manager'},
      {slug:'marketing-manager',name:'Marketing Manager'},
      {slug:'customer-success',name:'Customer Success'}
    ];
    var metroSlug = data.metro.slug;
    grid.innerHTML = roles.map(function(r) {
      return '<a href="/jobs-in/' + metroSlug + '/' + r.slug + '">' + r.name + '</a>';
    }).join('');
  }

  // ── PostHog tracking ──
  function trackPageView(data) {
    if (typeof posthog === 'undefined') return;
    var props = {};
    if (data.metro) props.metro = data.metro.slug;
    if (data.role) props.role = data.role.slug;
    if (data.stats) {
      props.total_jobs = data.stats.total_jobs;
      props.median_salary = data.stats.median_salary;
    }
    posthog.capture('seo_page_viewed', props);
  }

  function trackChartInteraction(chartId) {
    if (typeof posthog === 'undefined') return;
    posthog.capture('seo_chart_interacted', { chart: chartId });
  }

  function trackCTAClick(target) {
    if (typeof posthog === 'undefined') return;
    posthog.capture('seo_cta_clicked', { target: target });
  }

  // ── Initialize ──
  function init() {
    var dataEl = document.getElementById('seo-chart-data');
    if (!dataEl) return;
    var data;
    try { data = JSON.parse(dataEl.textContent); } catch(e) { console.error('[SEO] Failed to parse chart data:', e); return; }

    // Render all charts
    renderTimeline(data);
    renderSalary(data);
    renderCompanies(data);
    renderLevels(data);
    renderWorktype(data);
    renderComparison(data);
    renderMetros(data);
    renderMetroLeaderboard(data);
    populateRelatedRoles(data);
    trackPageView(data);

    // Resize handler
    window.addEventListener('resize', function() {
      Object.values(charts).forEach(function(c) { if (c && !c.isDisposed()) c.resize(); });
    });

    // Track chart interactions
    Object.keys(charts).forEach(function(id) {
      if (charts[id] && !charts[id].isDisposed()) {
        charts[id].on('click', function() { trackChartInteraction(id); });
      }
    });

    // Track CTA clicks
    document.querySelectorAll('.seo-cta a').forEach(function(a) {
      a.addEventListener('click', function() { trackCTAClick(a.href); });
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
