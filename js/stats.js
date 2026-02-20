// === js/stats.js ===
// Stats page — filter-scoped analytics with ECharts
// Dependencies: sb (Supabase client), savedFilters, filterColors, levelHierarchy, getJobLevel, buildFilterQuery, getLocationMatchIds

// ─── State ───
var statsInitialized = false;
var statsCharts = {};
var statsCache = {};
var STATS_CACHE_TTL = 10 * 60 * 1000;
var STATS_ROW_CAP = 5000;
var STATS_DEDUP_CAP = 10000;
var statsSelectedFilters = JSON.parse(localStorage.getItem('bj_stats_filters') || '["__all__"]');
var _statsDebounce = null;

var STATS_THEME = {
  tooltip: { backgroundColor: 'rgba(12,14,20,0.96)', borderColor: '#1e2230', borderWidth: 1, textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 } },
  axisLabel: { color: '#64748b', fontFamily: 'JetBrains Mono', fontSize: 10 },
  axisLine: { lineStyle: { color: '#2a2d35' } },
  splitLine: { lineStyle: { color: '#1a1d25' } },
};
var STATS_COLORS = ['#6366f1','#22c55e','#f59e0b','#ec4899','#06b6d4','#8b5cf6','#ef4444','#f97316','#14b8a6','#a855f7'];
var DEFAULT_LEVEL_LABELS = ['Intern','Entry','Associate','Mid','Senior','Staff','Lead','Principal','Manager','Director','VP','C-Suite'];
var STATS_COLUMNS = 'greenhouse_id,ats_source,title,company_name,salary_min,salary_max,salary_currency,location,loc_type,loc_state,loc_city,first_seen_at';

// ─── Init ───
function initStatsPage() {
  var page = document.getElementById('page-stats');
  if (!page || !page.classList.contains('active')) return;
  if (statsInitialized) { refreshStatsCharts(); return; }
  statsInitialized = true;
  renderFilterPills();
  fetchAndRenderStats();
  window.addEventListener('resize', statsResizeAll);
}

// ─── Filter Pills ───
function renderFilterPills() {
  var container = document.getElementById('stats-filter-pills');
  if (!container) return;
  container.innerHTML = '';
  var isAll = statsSelectedFilters.includes('__all__');

  var allPill = document.createElement('button');
  allPill.className = 'stats-fpill' + (isAll ? ' active' : '');
  allPill.textContent = 'All Filters';
  allPill.style.setProperty('--pill-color', 'var(--accent)');
  allPill.addEventListener('click', function() {
    statsSelectedFilters = ['__all__'];
    persistFilterSelection(); renderFilterPills(); debouncedFetchAndRender();
  });
  container.appendChild(allPill);

  savedFilters.forEach(function(sf, idx) {
    var pill = document.createElement('button');
    var color = filterColors[idx % filterColors.length];
    var isActive = isAll || statsSelectedFilters.includes(String(idx));
    pill.className = 'stats-fpill' + (isActive ? ' active' : '');
    pill.textContent = sf.name || ('Filter ' + (idx + 1));
    pill.style.setProperty('--pill-color', color);
    if (isActive && !isAll) {
      pill.style.borderColor = color;
      pill.style.background = 'color-mix(in srgb, ' + color + ' 15%, transparent)';
    }
    pill.addEventListener('click', function() {
      var id = String(idx);
      statsSelectedFilters = statsSelectedFilters.filter(function(f) { return f !== '__all__'; });
      var pos = statsSelectedFilters.indexOf(id);
      if (pos > -1) statsSelectedFilters.splice(pos, 1);
      else statsSelectedFilters.push(id);
      if (statsSelectedFilters.length === 0) statsSelectedFilters = ['__all__'];
      persistFilterSelection(); renderFilterPills(); debouncedFetchAndRender();
    });
    container.appendChild(pill);
  });

  var toggle = document.getElementById('stats-compare-sw');
  if (toggle) { toggle.style.opacity = '0.4'; toggle.style.pointerEvents = 'none'; toggle.title = 'Coming soon'; }
}

function persistFilterSelection() { localStorage.setItem('bj_stats_filters', JSON.stringify(statsSelectedFilters)); }

// ─── Data ───
function debouncedFetchAndRender() { clearTimeout(_statsDebounce); _statsDebounce = setTimeout(fetchAndRenderStats, 300); }

async function fetchAndRenderStats() {
  showStatsLoading(true);
  try {
    var configs = getSelectedFilterConfigs();
    if (configs.length === 0) { showEmptyState('no-filters'); return; }
    var allRows = [], anyCapped = false;
    for (var i = 0; i < configs.length; i++) {
      var sf = configs[i].sf, idx = configs[i].idx;
      var ck = JSON.stringify(sf) + '_' + idx;
      var cached = statsCache[ck];
      if (cached && Date.now() - cached.timestamp < STATS_CACHE_TTL) {
        allRows = allRows.concat(cached.rows);
        if (cached.capped) anyCapped = true;
        continue;
      }
      var rows = await fetchFilterData(sf);
      var capped = rows.length >= STATS_ROW_CAP;
      statsCache[ck] = { rows: rows, timestamp: Date.now(), capped: capped };
      allRows = allRows.concat(rows);
      if (capped) anyCapped = true;
    }
    var seen = {}, deduped = [];
    for (var j = 0; j < allRows.length; j++) {
      var r = allRows[j], k = r.greenhouse_id + ':' + r.ats_source;
      if (!seen[k]) { seen[k] = true; deduped.push(r); if (deduped.length >= STATS_DEDUP_CAP) break; }
    }
    if (deduped.length === 0) { showEmptyState('no-results'); return; }
    var stats = aggregateStats(deduped);
    showStatsLoading(false);
    renderStatCards(stats);
    renderTimeline(stats, deduped);
    renderSalaryDist(stats, deduped);
    renderLevelFunnel(stats);
    renderTopCompanies(stats);
    renderLocationBreakdown(stats);
    var notice = document.getElementById('stats-cap-notice');
    if (notice) {
      if (anyCapped) { notice.textContent = 'Based on ' + deduped.length.toLocaleString() + ' most recent matches'; notice.style.display = ''; }
      else { notice.style.display = 'none'; }
    }
  } catch (err) { console.error('[Stats] Fetch error:', err); showEmptyState('error'); }
}

function getSelectedFilterConfigs() {
  if (savedFilters.length === 0) return [];
  if (statsSelectedFilters.includes('__all__')) return savedFilters.map(function(sf, i) { return {sf:sf, idx:i}; });
  return statsSelectedFilters.map(function(id) { return {sf: savedFilters[Number(id)], idx: Number(id)}; }).filter(function(x) { return x.sf; });
}

async function fetchFilterData(sf) {
  try {
    var tuning = JSON.parse(localStorage.getItem('bj_tuning') || '{}');
    var locIds = await getLocationMatchIds(sf.wherePills || [], sf.whereNotPills || [], tuning, sf.includeRemote);
    var base = sb.from('ats_jobs').select(STATS_COLUMNS);
    var q = buildFilterQuery(sf, base, locIds);
    q = q.order('first_seen_at', { ascending: false }).limit(STATS_ROW_CAP);
    var res = await q;
    if (res.error) { console.error('[Stats] Query error:', res.error); return []; }
    return res.data || [];
  } catch (e) { console.error('[Stats] fetchFilterData:', e); return []; }
}

// ─── Aggregation ───
function aggregateStats(rows) {
  var s = { total: rows.length, medianSalary: null, seniorPct: 0, remotePct: 0, companyCount: 0,
    levelCounts: {}, salaryBuckets: {}, topCompanies: [], workTypeCounts: {}, timelineBuckets: {} };

  var cos = {}; rows.forEach(function(r) { if (r.company_name) cos[r.company_name] = true; });
  s.companyCount = Object.keys(cos).length;

  // Seniority — always show all hierarchy levels including 0
  var hier = (levelHierarchy && levelHierarchy.length > 0) ? levelHierarchy : null;
  var labels = hier ? hier.map(function(l) { return l.label; }) : DEFAULT_LEVEL_LABELS.slice();
  labels.forEach(function(l) { s.levelCounts[l] = 0; });
  s.levelCounts['Other'] = 0;
  var seniorSet = {senior:1,staff:1,lead:1,principal:1,manager:1,director:1,vp:1,head:1,chief:1};
  var seniorN = 0;
  rows.forEach(function(r) {
    var lvl = getJobLevel(r.title, hier);
    var label = lvl ? lvl.label : 'Other';
    s.levelCounts[label] = (s.levelCounts[label] || 0) + 1;
    if (lvl && seniorSet[lvl.label.toLowerCase()]) seniorN++;
  });
  s.seniorPct = rows.length > 0 ? Math.round((seniorN / rows.length) * 100) : 0;

  // Remote
  var remN = 0;
  rows.forEach(function(r) { if (r.loc_type === 'remote' || (r.location||'').toLowerCase().startsWith('remote')) remN++; });
  s.remotePct = rows.length > 0 ? Math.round((remN / rows.length) * 100) : 0;

  // Salary
  var sals = [];
  rows.forEach(function(r) { var v = r.salary_min || r.salary_max; if (v && v > 0) sals.push(v); });
  sals.sort(function(a,b) { return a-b; });
  if (sals.length > 0) {
    var mid = Math.floor(sals.length / 2);
    s.medianSalary = sals.length % 2 === 0 ? Math.round((sals[mid-1]+sals[mid])/2) : sals[mid];
  }
  var bSz = 25000;
  rows.forEach(function(r) {
    var v = r.salary_min || r.salary_max; if (!v || v <= 0) return;
    var b = Math.floor(v / bSz) * bSz;
    var label = '$' + (b/1000) + 'K';
    s.salaryBuckets[label] = (s.salaryBuckets[label]||0) + 1;
  });

  // Top companies
  var cc = {};
  rows.forEach(function(r) { if (r.company_name) cc[r.company_name] = (cc[r.company_name]||0) + 1; });
  s.topCompanies = Object.entries(cc).sort(function(a,b) { return b[1]-a[1]; }).slice(0, 15);

  // Work type breakdown (on-site vs hybrid vs remote)
  s.workTypeCounts = { 'On-site': 0, 'Hybrid': 0, 'Remote': 0, 'Unspecified': 0 };
  rows.forEach(function(r) {
    var loc = (r.location || '').toLowerCase();
    var lt = (r.loc_type || '').toLowerCase();
    if (lt === 'remote' || loc.startsWith('remote')) {
      // Check if "Remote - City" pattern (could be hybrid/flexible)
      if (loc.match(/^remote\s*[-\/]\s*.+/)) {
        // "Remote - Austin, TX" style — treat as remote but the city gives context
        s.workTypeCounts['Remote']++;
      } else {
        s.workTypeCounts['Remote']++;
      }
    } else if (lt === 'hybrid' || loc.includes('hybrid')) {
      s.workTypeCounts['Hybrid']++;
    } else if (r.location && r.location.trim()) {
      s.workTypeCounts['On-site']++;
    } else {
      s.workTypeCounts['Unspecified']++;
    }
  });

  // Timeline (weekly)
  rows.forEach(function(r) {
    if (!r.first_seen_at) return;
    var d = new Date(r.first_seen_at);
    var day = d.getDay();
    var mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    var key = mon.toISOString().slice(0, 10);
    s.timelineBuckets[key] = (s.timelineBuckets[key]||0) + 1;
  });

  return s;
}

// ─── Stat Cards ───
function renderStatCards(stats) {
  var fmt = function(n) { return n != null ? n.toLocaleString() : '\u2014'; };
  var fmtK = function(n) { if (n == null) return 'N/A'; return n >= 1000 ? ('$' + Math.round(n/1000) + 'K') : ('$' + fmt(n)); };
  setText('#sc-total', fmt(stats.total));
  setText('#sc-salary', fmtK(stats.medianSalary));
  setText('#sc-senior', stats.seniorPct + '%');
  setText('#sc-remote', stats.remotePct + '%');
  setText('#sc-companies', fmt(stats.companyCount));
}
function setText(sel, val) { var el = document.querySelector(sel); if (el) el.textContent = val; }

// ─── Chart Helper ───
function getOrCreateChart(id) {
  var elId = id.replace('#', '');
  var el = document.getElementById(elId);
  if (!el) { console.warn('[Stats] Not found:', elId); return null; }
  if (el.offsetWidth === 0 || el.offsetHeight === 0) { console.warn('[Stats] Zero size:', elId); return null; }
  if (statsCharts[id]) return statsCharts[id];
  var c = echarts.init(el, null, { renderer: 'canvas' });
  statsCharts[id] = c;
  return c;
}

// C1: Timeline — discrete bar chart (full width)
function renderTimeline(stats) {
  var chart = getOrCreateChart('#chart-timeline'); if (!chart) return;
  var sorted = Object.entries(stats.timelineBuckets).sort(function(a,b) { return a[0].localeCompare(b[0]); });
  var recent = sorted.slice(-26);
  chart.setOption({
    tooltip: { backgroundColor: STATS_THEME.tooltip.backgroundColor, borderColor: STATS_THEME.tooltip.borderColor, borderWidth:1, textStyle: STATS_THEME.tooltip.textStyle, trigger:'axis', axisPointer:{type:'shadow'},
      formatter: function(p) { var d = new Date(p[0].name); return '<b>Week of ' + d.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + '</b><br/>' + p[0].value.toLocaleString() + ' new jobs'; } },
    grid: { top:20, right:20, bottom:30, left:50 },
    xAxis: { type:'category', data: recent.map(function(e){return e[0];}),
      axisLabel: { color:'#64748b', fontFamily:'JetBrains Mono', fontSize:10, formatter: function(v) { var d=new Date(v); return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); }, interval: Math.max(0, Math.floor(recent.length/6)-1) },
      axisLine: STATS_THEME.axisLine },
    yAxis: { type:'value', axisLabel: STATS_THEME.axisLabel, splitLine: STATS_THEME.splitLine },
    series: [{ type:'bar', data: recent.map(function(e){return e[1];}),
      itemStyle:{ color: new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'#6366f1'},{offset:1,color:'rgba(99,102,241,0.3)'}]), borderRadius:[3,3,0,0] },
      barMaxWidth:28 }],
    animation:true, animationDuration:600,
  }, true);
}

// C2: Salary Distribution — donut with range segments
function renderSalaryDist(stats) {
  var chart = getOrCreateChart('#chart-salary'); if (!chart) return;
  var entries = Object.entries(stats.salaryBuckets).map(function(e) {
    return { label: e[0], count: e[1], num: parseInt(e[0].replace('$','').replace('K',''))*1000 };
  }).sort(function(a,b){return a.num-b.num;}).filter(function(e){return e.num>=25000 && e.num<=500000;});
  var salN = Object.values(stats.salaryBuckets).reduce(function(a,b){return a+b;}, 0);
  if (entries.length === 0) {
    chart.setOption({ graphic:[{type:'text',left:'center',top:'middle',style:{text:'No salary data available',fill:'#64748b',fontSize:13,fontFamily:'Outfit'}}], xAxis:{show:false},yAxis:{show:false},series:[] }, true);
    return;
  }
  // Consolidate into broader bands for a readable donut
  var bands = {};
  entries.forEach(function(e) {
    var k = e.num;
    var band;
    if (k < 50000) band = 'Under $50K';
    else if (k < 75000) band = '$50K\u2013$75K';
    else if (k < 100000) band = '$75K\u2013$100K';
    else if (k < 125000) band = '$100K\u2013$125K';
    else if (k < 150000) band = '$125K\u2013$150K';
    else if (k < 200000) band = '$150K\u2013$200K';
    else if (k < 250000) band = '$200K\u2013$250K';
    else band = '$250K+';
    bands[band] = (bands[band]||0) + e.count;
  });
  var bandOrder = ['Under $50K','$50K\u2013$75K','$75K\u2013$100K','$100K\u2013$125K','$125K\u2013$150K','$150K\u2013$200K','$200K\u2013$250K','$250K+'];
  var salColors = ['#334155','#475569','#6366f1','#818cf8','#22c55e','#f59e0b','#ec4899','#ef4444'];
  var data = bandOrder.filter(function(b){return bands[b]>0;}).map(function(b,i){
    var ci = bandOrder.indexOf(b);
    return {name:b,value:bands[b],itemStyle:{color:salColors[ci]}};
  });
  chart.setOption({
    graphic:[],
    tooltip:{backgroundColor:STATS_THEME.tooltip.backgroundColor,borderColor:STATS_THEME.tooltip.borderColor,borderWidth:1,textStyle:STATS_THEME.tooltip.textStyle,trigger:'item',
      formatter:function(p){return '<b>'+p.name+'</b><br/>'+p.value.toLocaleString()+' jobs ('+p.percent.toFixed(1)+'%)';}},
    legend:{orient:'vertical',right:10,top:'center',textStyle:{color:'#94a3b8',fontFamily:'Outfit',fontSize:11},
      formatter:function(name){var v=bands[name]||0;var pct=salN>0?Math.round(v/salN*100):0;return name+'  '+pct+'%';}},
    series:[{type:'pie',radius:['42%','70%'],center:['35%','50%'],avoidLabelOverlap:true,
      label:{show:false},
      emphasis:{label:{show:true,fontSize:13,fontFamily:'Outfit',fontWeight:'600',color:'#f0f1f3'}},
      data:data}],
    animation:true, animationDuration:600,
  }, true);
}

// C3: Seniority — donut of ALL open jobs (ignores filter to show market distribution)
var _seniorityCache = null;
var _seniorityCacheTime = 0;

async function fetchSeniorityData() {
  if (_seniorityCache && Date.now() - _seniorityCacheTime < STATS_CACHE_TTL) return _seniorityCache;
  try {
    var res = await sb.from('ats_jobs').select('title').eq('status','open').limit(STATS_ROW_CAP);
    if (res.error || !res.data) return null;
    _seniorityCache = res.data;
    _seniorityCacheTime = Date.now();
    return res.data;
  } catch(e) { console.error('[Stats] seniority fetch:', e); return null; }
}

function renderLevelFunnel(stats) {
  var chart = getOrCreateChart('#chart-funnel'); if (!chart) return;
  // Use the filter-scoped data for seniority breakdown 
  // but always show ALL levels from hierarchy
  var hier = (levelHierarchy && levelHierarchy.length > 0) ? levelHierarchy : null;
  var labels = hier ? hier.map(function(l){return l.label;}) : DEFAULT_LEVEL_LABELS.slice();
  
  // Count by level from the filtered data
  var counts = {};
  labels.forEach(function(l) { counts[l] = stats.levelCounts[l] || 0; });
  var otherCount = stats.levelCounts['Other'] || 0;
  
  // Build donut data — only include levels with jobs + Other
  var total = stats.total;
  var data = labels.filter(function(l) { return counts[l] > 0; })
    .map(function(l, i) { return { name: l, value: counts[l] }; });
  if (otherCount > 0) data.push({ name: 'Unclassified', value: otherCount });
  
  if (data.length === 0) {
    chart.setOption({ graphic:[{type:'text',left:'center',top:'middle',style:{text:'No seniority data',fill:'#64748b',fontSize:13,fontFamily:'Outfit'}}],xAxis:{show:false},yAxis:{show:false},series:[] }, true);
    return;
  }
  
  chart.setOption({
    graphic:[],
    tooltip:{backgroundColor:STATS_THEME.tooltip.backgroundColor,borderColor:STATS_THEME.tooltip.borderColor,borderWidth:1,textStyle:STATS_THEME.tooltip.textStyle,trigger:'item',
      formatter:function(p){return '<b>'+p.name+'</b><br/>'+p.value.toLocaleString()+' jobs ('+p.percent.toFixed(1)+'%)';}},
    legend:{orient:'vertical',right:10,top:'center',textStyle:{color:'#94a3b8',fontFamily:'Outfit',fontSize:11},
      formatter:function(name){var v=0;data.forEach(function(d){if(d.name===name)v=d.value;});var pct=total>0?Math.round(v/total*100):0;return name+'  '+pct+'%';}},
    series:[{type:'pie',radius:['42%','70%'],center:['35%','50%'],avoidLabelOverlap:true,
      label:{show:false},
      emphasis:{label:{show:true,fontSize:13,fontFamily:'Outfit',fontWeight:'600',color:'#f0f1f3'}},
      data:data.map(function(d,i){return{name:d.name,value:d.value,itemStyle:{color:STATS_COLORS[i%STATS_COLORS.length]}};})}],
    animation:true, animationDuration:600,
  }, true);
}

// C5: Top Companies — only shows when data is meaningful
function renderTopCompanies(stats) {
  var chart = getOrCreateChart('#chart-companies'); if (!chart) return;
  var top = stats.topCompanies.slice(0, 15);
  var maxCt = top.length > 0 ? top[0][1] : 0;
  
  // Need at least one company with 3+ roles to show meaningful concentration
  if (maxCt < 3) {
    var msg = stats.total < 50
      ? 'Too few matching jobs to show company trends.\nBroaden your filters to see which companies are hiring most.'
      : stats.companyCount + ' companies hiring, but no single company dominates.\nThis market is spread across many employers.';
    chart.setOption({ graphic:[{type:'text',left:'center',top:'middle',style:{text:msg,fill:'#64748b',fontSize:12,fontFamily:'Outfit',textAlign:'center',lineHeight:20}}],xAxis:{show:false},yAxis:{show:false},series:[] }, true);
    return;
  }
  
  // Only show companies with 2+ roles
  var meaningful = top.filter(function(e){return e[1]>=2;}).slice(0, 12);
  var rev = meaningful.slice().reverse();
  chart.setOption({
    graphic:[],
    tooltip:{backgroundColor:STATS_THEME.tooltip.backgroundColor,borderColor:STATS_THEME.tooltip.borderColor,borderWidth:1,textStyle:STATS_THEME.tooltip.textStyle,trigger:'axis',axisPointer:{type:'shadow'},
      formatter:function(p){return '<b>'+p[0].name+'</b><br/>'+p[0].value.toLocaleString()+' open roles';}},
    grid:{top:10,right:30,bottom:10,left:140},
    xAxis:{type:'value',axisLabel:STATS_THEME.axisLabel,splitLine:STATS_THEME.splitLine},
    yAxis:{type:'category',data:rev.map(function(e){return e[0];}),axisLabel:{color:'#94a3b8',fontFamily:'Outfit',fontSize:11,width:130,overflow:'truncate'},axisLine:{show:false},axisTick:{show:false}},
    series:[{type:'bar',data:rev.map(function(e){return e[1];}),itemStyle:{color:new echarts.graphic.LinearGradient(0,0,1,0,[{offset:0,color:'rgba(99,102,241,0.3)'},{offset:1,color:'#6366f1'}]),borderRadius:[0,3,3,0]},barMaxWidth:20,
      label:{show:true,position:'right',color:'#94a3b8',fontFamily:'JetBrains Mono',fontSize:10}}],
    animation:true, animationDuration:600,
  }, true);
}

// C7: Work Type Breakdown — donut (on-site vs hybrid vs remote)
function renderLocationBreakdown(stats) {
  var chart = getOrCreateChart('#chart-location'); if (!chart) return;
  var wt = stats.workTypeCounts;
  // Fixed order, fixed colors for consistency
  var typeColors = { 'On-site': '#6366f1', 'Hybrid': '#f59e0b', 'Remote': '#22c55e', 'Unspecified': '#334155' };
  var data = ['On-site','Hybrid','Remote','Unspecified']
    .filter(function(t) { return wt[t] > 0; })
    .map(function(t) { return { name: t, value: wt[t], itemStyle: { color: typeColors[t] } }; });
  if (data.length === 0) {
    chart.setOption({ graphic:[{type:'text',left:'center',top:'middle',style:{text:'No location data available',fill:'#64748b',fontSize:13,fontFamily:'Outfit'}}],xAxis:{show:false},yAxis:{show:false},series:[] }, true);
    return;
  }
  var total = data.reduce(function(a,d){return a+d.value;},0);
  chart.setOption({
    graphic:[],
    tooltip:{backgroundColor:STATS_THEME.tooltip.backgroundColor,borderColor:STATS_THEME.tooltip.borderColor,borderWidth:1,textStyle:STATS_THEME.tooltip.textStyle,trigger:'item',
      formatter:function(p){return '<b>'+p.name+'</b><br/>'+p.value.toLocaleString()+' jobs ('+p.percent.toFixed(1)+'%)';}},
    legend:{orient:'vertical',right:10,top:'center',textStyle:{color:'#94a3b8',fontFamily:'Outfit',fontSize:12},
      formatter:function(name){var v=wt[name]||0;var pct=total>0?Math.round(v/total*100):0;return name+'  '+pct+'%';}},
    series:[{type:'pie',radius:['42%','70%'],center:['35%','50%'],avoidLabelOverlap:true,
      label:{show:false},
      emphasis:{label:{show:true,fontSize:14,fontFamily:'Outfit',fontWeight:'600',color:'#f0f1f3'}},
      data:data}],
    animation:true, animationDuration:600,
  }, true);
}

// ─── Loading / Empty ───
function showStatsLoading(on) {
  var grid = document.getElementById('stats-charts-grid');
  var empty = document.getElementById('stats-empty');
  if (empty) empty.style.display = 'none';
  if (on) {
    ['#sc-total','#sc-salary','#sc-senior','#sc-remote','#sc-companies'].forEach(function(s){var e=document.querySelector(s);if(e)e.textContent='\u2014';});
    if (grid) grid.style.opacity = '0.4';
  } else { if (grid) grid.style.opacity = '1'; }
}
function showEmptyState(reason) {
  showStatsLoading(false);
  var msgs = { 'no-filters':'Create saved filters on the Jobs Feed page to see your personalized stats', 'no-results':'No jobs match this filter. Try broadening your search criteria.', 'error':'Something went wrong loading stats. Try refreshing the page.' };
  ['#sc-total','#sc-salary','#sc-senior','#sc-remote','#sc-companies'].forEach(function(s){setText(s,'\u2014');});
  var el = document.getElementById('stats-empty');
  if (el) { el.textContent = msgs[reason]||msgs['error']; el.style.display = ''; }
}

// ─── Resize / Refresh ───
function statsResizeAll() { Object.values(statsCharts).forEach(function(c){if(c&&!c.isDisposed())c.resize();}); }
function refreshStatsCharts() {
  renderFilterPills();
  var stale = Object.values(statsCache).some(function(c){return Date.now()-c.timestamp>=STATS_CACHE_TTL;});
  if (stale || Object.keys(statsCache).length === 0) fetchAndRenderStats();
  else statsResizeAll();
}
