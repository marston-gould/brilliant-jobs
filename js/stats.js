// === js/stats.js ===
// Stats page — filter-scoped analytics with ECharts
// Redesigned per stats-page-redesign-brief.md (Pod 1, 2026-02-19)
// Dependencies: sb, savedFilters, filterColors, levelHierarchy, getJobLevel, buildFilterQuery, getLocationMatchIds

// ─── State ───
var statsInitialized = false;
var statsCharts = {};
var statsCache = {};
var STATS_CACHE_TTL = 10 * 60 * 1000;
var STATS_ROW_CAP = 5000;
var STATS_DEDUP_CAP = 10000;
var statsSelectedFilters = JSON.parse(localStorage.getItem('bj_stats_filters') || '["__all__"]');
var _statsDebounce = null;

// Light-theme ECharts (dark tooltips float over light cards)
// Color tokens — single source of truth, no hardcoded hsl() in chart functions
var _T = {
  border: 'hsl(228, 16%, 91%)',
  dim: 'hsl(228,11%,41%)',   // --text-dim equivalent
  faint: 'hsl(225,10%,63%)', // --text-faint equivalent
  dark: 'hsl(230,28%,14%)',  // --text equivalent
  mono: 'JetBrains Mono',
  sans: 'Outfit',
};
var STATS_THEME = {
  tooltip: { backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', borderWidth: 1, textStyle: { color: '#e8eaf0', fontFamily: _T.sans, fontSize: 12 } },
  axisLabel: { color: _T.dim, fontFamily: _T.mono, fontSize: 10 },
  axisLine: { lineStyle: { color: 'hsl(228,16%,91%)' } },
  splitLine: { lineStyle: { color: 'hsl(228,16%,93%)' } },
  // Reusable label presets for chart functions
  catLabel: { color: _T.dim, fontFamily: _T.sans, fontSize: 11 },
  barLabel: { show: true, position: 'right', color: _T.dim, fontFamily: _T.mono, fontSize: 10 },
};
var STATS_COLORS = ['#6366f1','#22c55e','#f59e0b','#ec4899','#06b6d4','#8b5cf6','#ef4444','#f97316','#14b8a6','#a855f7'];
var DEFAULT_LEVEL_HIERARCHY = [
  {label:'Intern', keywords:'intern,internship,co-op,coop'},
  {label:'Entry', keywords:'entry level,entry-level,junior,jr,new grad,graduate'},
  {label:'Mid', keywords:'mid level,mid-level,intermediate'},
  {label:'Senior', keywords:'senior,sr'},
  {label:'Staff', keywords:'staff'},
  {label:'Lead', keywords:'lead,team lead'},
  {label:'Principal', keywords:'principal,distinguished,fellow'},
  {label:'Manager', keywords:'manager,engineering manager,mgr'},
  {label:'Director', keywords:'director'},
  {label:'VP', keywords:'vp,vice president'},
  {label:'C-Suite', keywords:'cto,cfo,ceo,coo,cio,chief,c-suite,head of'},
];
var STATS_COLUMNS = 'greenhouse_id,ats_source,title,company_name,salary_min,salary_max,salary_currency,location,loc_type,loc_state,loc_city,first_seen_at,industry';

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

// ─── Filter Pills (CSS classes only, no inline styles) ───
function renderFilterPills() {
  var container = document.getElementById('stats-filter-pills');
  if (!container) return;
  container.innerHTML = '';
  var isAll = statsSelectedFilters.includes('__all__');

  // "All" pill — no hamburger icon
  var allPill = document.createElement('button');
  allPill.className = 'stats-fpill' + (isAll ? ' active' : '');
  allPill.textContent = 'All';
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
    pill.style.setProperty('--pill-color', color);

    // Colored dot
    var dot = document.createElement('span');
    dot.className = 'stats-fpill-dot';
    dot.style.background = color;
    pill.appendChild(dot);
    pill.appendChild(document.createTextNode(sf.name || ('Filter ' + (idx + 1))));

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
    renderTimeline(stats);
    renderSalaryDist(stats);
    renderSeniorityBars(stats);
    renderTopCompanies(stats);
    renderWorkType(stats);
    renderPostingAge(stats);
    renderGeoMap(stats, configs);
    renderSalaryByLevel(stats);
    renderIndustryBars(stats);
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
    levelCounts: {}, salaryBuckets: {}, topCompanies: [], workTypeCounts: {}, timelineBuckets: {},
    salaryByLevel: {}, industryCounts: {}, salaryJobCount: 0, industryNonNull: 0 };

  var cos = {}; rows.forEach(function(r) { if (r.company_name) cos[r.company_name] = true; });
  s.companyCount = Object.keys(cos).length;

  // Seniority + salary-by-level in one pass
  var hier = (levelHierarchy && levelHierarchy.length > 0) ? levelHierarchy : DEFAULT_LEVEL_HIERARCHY;
  hier.map(function(l) { return l.label; }).forEach(function(l) { s.levelCounts[l] = 0; });
  s.levelCounts['Other'] = 0;
  var seniorSet = {Senior:1,Staff:1,Lead:1,Principal:1,Manager:1,Director:1,VP:1,'C-Suite':1};
  var seniorN = 0;
  var salByLvl = {};

  rows.forEach(function(r) {
    var lvl = getJobLevel(r.title, hier);
    var label = lvl ? lvl.label : 'Other';
    s.levelCounts[label] = (s.levelCounts[label] || 0) + 1;
    if (lvl && seniorSet[lvl.label]) seniorN++;
    var sal = (r.salary_min && r.salary_max) ? (r.salary_min + r.salary_max) / 2 : (r.salary_min || r.salary_max || 0);
    if (sal > 0) { if (!salByLvl[label]) salByLvl[label] = []; salByLvl[label].push(sal); }
  });
  s.seniorPct = rows.length > 0 ? Math.round((seniorN / rows.length) * 100) : 0;
  Object.keys(salByLvl).forEach(function(label) {
    var arr = salByLvl[label];
    s.salaryByLevel[label] = { avg: Math.round(arr.reduce(function(a,b){return a+b;},0) / arr.length), count: arr.length };
  });

  // Remote
  var remN = 0;
  rows.forEach(function(r) { if (r.loc_type === 'remote' || (r.location||'').toLowerCase().startsWith('remote')) remN++; });
  s.remotePct = rows.length > 0 ? Math.round((remN / rows.length) * 100) : 0;

  // Salary distribution
  var sals = [];
  rows.forEach(function(r) { var v = r.salary_min || r.salary_max; if (v && v > 0) sals.push(v); });
  s.salaryJobCount = sals.length;
  sals.sort(function(a,b) { return a-b; });
  if (sals.length > 0) {
    var mid = Math.floor(sals.length / 2);
    s.medianSalary = sals.length % 2 === 0 ? Math.round((sals[mid-1]+sals[mid])/2) : sals[mid];
  }
  rows.forEach(function(r) {
    var v = r.salary_min || r.salary_max; if (!v || v <= 0) return;
    var b = Math.floor(v / 25000) * 25000;
    s.salaryBuckets['$' + (b/1000) + 'K'] = (s.salaryBuckets['$' + (b/1000) + 'K']||0) + 1;
  });

  // Top companies (top 10 per brief)
  var cc = {};
  rows.forEach(function(r) { if (r.company_name) cc[r.company_name] = (cc[r.company_name]||0) + 1; });
  s.topCompanies = Object.entries(cc).sort(function(a,b) { return b[1]-a[1]; }).slice(0, 10);

  // Work type
  s.workTypeCounts = { 'Remote': 0, 'On-site': 0, 'Hybrid': 0, 'Unspecified': 0 };
  rows.forEach(function(r) {
    var loc = (r.location || '').toLowerCase();
    var lt = (r.loc_type || '').toLowerCase();
    if (lt === 'remote' || loc.startsWith('remote')) s.workTypeCounts['Remote']++;
    else if (lt === 'hybrid' || loc.includes('hybrid')) s.workTypeCounts['Hybrid']++;
    else if (r.location && r.location.trim()) s.workTypeCounts['On-site']++;
    else s.workTypeCounts['Unspecified']++;
  });

  // Timeline — 12 complete weeks + WTD 13th (unless today is last day of week period)
  var weekMap = {};
  rows.forEach(function(r) {
    if (!r.first_seen_at) return;
    var d = new Date(r.first_seen_at);
    var day = d.getDay();
    var mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    weekMap[mon.toISOString().slice(0, 10)] = (weekMap[mon.toISOString().slice(0, 10)]||0) + 1;
  });
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var todayDay = today.getDay();
  var thisMonday = new Date(today); thisMonday.setDate(today.getDate() - (todayDay === 0 ? 6 : todayDay - 1));
  var isSunday = todayDay === 0;
  // 12 complete past weeks
  for (var w = 12; w >= 1; w--) {
    var weekStart = new Date(thisMonday); weekStart.setDate(thisMonday.getDate() - (w * 7));
    var wk = weekStart.toISOString().slice(0, 10);
    s.timelineBuckets[wk] = weekMap[wk] || 0;
  }
  // 13th slot: WTD (current week) unless today is Sunday (last day = week complete)
  if (!isSunday) {
    var wtdKey = thisMonday.toISOString().slice(0, 10);
    s.timelineBuckets[wtdKey] = weekMap[wtdKey] || 0;
    s.timelineWtdKey = wtdKey;
  } else {
    // Today is Sunday — this week is complete, show it as the 13th complete week
    var wk = thisMonday.toISOString().slice(0, 10);
    s.timelineBuckets[wk] = weekMap[wk] || 0;
    s.timelineWtdKey = null;
  }

  // Industry
  rows.forEach(function(r) {
    if (r.industry && r.industry.trim()) {
      s.industryNonNull++;
      s.industryCounts[r.industry.trim()] = (s.industryCounts[r.industry.trim()]||0) + 1;
    }
  });

  // Posting age distribution (days since first_seen_at)
  s.postingAgeBuckets = {'0-7 days':0,'8-14 days':0,'15-30 days':0,'31-60 days':0,'61-90 days':0,'90+ days':0};
  var nowMs = Date.now();
  rows.forEach(function(r) {
    if (!r.first_seen_at) return;
    var age = Math.floor((nowMs - new Date(r.first_seen_at).getTime()) / 86400000);
    if (age <= 7) s.postingAgeBuckets['0-7 days']++;
    else if (age <= 14) s.postingAgeBuckets['8-14 days']++;
    else if (age <= 30) s.postingAgeBuckets['15-30 days']++;
    else if (age <= 60) s.postingAgeBuckets['31-60 days']++;
    else if (age <= 90) s.postingAgeBuckets['61-90 days']++;
    else s.postingAgeBuckets['90+ days']++;
  });

  // Location aggregation for map + metro list
  s.stateCounts = {};
  s.cityCounts = {};
  rows.forEach(function(r) {
    if (r.loc_state) s.stateCounts[r.loc_state] = (s.stateCounts[r.loc_state]||0) + 1;
    if (r.loc_city && r.loc_state) {
      var key = r.loc_city + ', ' + r.loc_state;
      s.cityCounts[key] = (s.cityCounts[key]||0) + 1;
    }
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

// ─── Chart Helpers ───
function getOrCreateChart(id) {
  var el = document.getElementById(id.replace('#',''));
  if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) return null;
  if (statsCharts[id]) return statsCharts[id];
  var c = echarts.init(el, null, { renderer: 'canvas' });
  statsCharts[id] = c;
  return c;
}
function ttip() { return { backgroundColor:STATS_THEME.tooltip.backgroundColor, borderColor:STATS_THEME.tooltip.borderColor, borderWidth:1, textStyle:STATS_THEME.tooltip.textStyle }; }
function truncName(s, max) { return s && s.length > max ? s.slice(0, max) + '\u2026' : s; }
function emptyChart(chart, msg) {
  chart.setOption({ graphic:[{type:'text',left:'center',top:'middle',style:{text:msg,fill:_T.dim,fontSize:12,fontFamily:_T.sans,textAlign:'center',lineHeight:20}}], xAxis:{show:false},yAxis:{show:false},series:[] }, true);
}

// ─── C1: Job Count Over Time — bars, last 12 weeks, continuous ───
function renderTimeline(stats) {
  var chart = getOrCreateChart('#chart-timeline'); if (!chart) return;
  var sorted = Object.entries(stats.timelineBuckets).sort(function(a,b){ return a[0].localeCompare(b[0]); });
  chart.setOption({
    tooltip: Object.assign({ trigger:'axis', axisPointer:{type:'shadow'},
      formatter:function(p){ var d=new Date(p[0].name); var isWtd = stats.timelineWtdKey && p[0].name === stats.timelineWtdKey; return '<b>'+(isWtd?'WTD: ':'Week of ')+d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+'</b><br/>'+p[0].value+' new jobs'+(isWtd?' (so far)':''); }}, ttip()),
    grid: { top:20, right:20, bottom:30, left:50 },
    xAxis: { type:'category', data:sorted.map(function(e){return e[0];}),
      axisLabel: { color:_T.dim, fontFamily:_T.mono, fontSize:10, interval:0,
        formatter:function(v){ var d=new Date(v); var label=d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); return stats.timelineWtdKey && v===stats.timelineWtdKey ? label+'\n(WTD)' : label; }},
      axisLine: STATS_THEME.axisLine },
    yAxis: { type:'value', axisLabel:STATS_THEME.axisLabel, splitLine:STATS_THEME.splitLine, minInterval:1 },
    series: [{ type:'bar', data:sorted.map(function(e){
        var isWtd = stats.timelineWtdKey && e[0] === stats.timelineWtdKey;
        return { value:e[1], itemStyle:{ color: isWtd
          ? new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'#f59e0b'},{offset:1,color:'rgba(245,158,11,0.3)'}])
          : new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'#6366f1'},{offset:1,color:'rgba(99,102,241,0.3)'}]),
          borderRadius:[3,3,0,0], borderType: isWtd ? 'dashed' : 'solid' }};
      }),
      barMaxWidth:28 }],
    animation:true, animationDuration:600,
  }, true);
}

// ─── C2: Salary Distribution — pie chart, ordered low→high, salary-data colors ───
function renderSalaryDist(stats) {
  var chart = getOrCreateChart('#chart-salary'); if (!chart) return;
  var sub = document.getElementById('chart-salary-sub');
  if (sub) sub.textContent = stats.salaryJobCount + ' of ' + stats.total + ' jobs have salary data';

  var entries = Object.entries(stats.salaryBuckets).map(function(e) {
    return { label:e[0], count:e[1], num:parseInt(e[0].replace('$','').replace('K',''))*1000 };
  }).sort(function(a,b){return a.num-b.num;}).filter(function(e){return e.num>=25000 && e.num<=500000;});

  if (entries.length < 3) {
    emptyChart(chart, 'Not enough salary data for this filter.\nTry broadening your search.');
    return;
  }

  // Color gradient: cool (low salary) → warm (high salary), matching salary-data page
  var salaryColors = ['#06b6d4','#14b8a6','#22c55e','#84cc16','#eab308','#f59e0b','#f97316','#ef4444','#dc2626','#b91c1c','#991b1b','#7f1d1d'];

  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'item',
      formatter:function(p){return '<b>'+p.name+'</b><br/>'+p.value+' jobs ('+p.percent.toFixed(1)+'%)';}}, ttip()),
    legend: { orient:'vertical', right:4, top:'center', textStyle:{color:_T.dim,fontFamily:_T.mono,fontSize:10},
      formatter:function(name){var e=entries.find(function(x){return x.label===name;}); return name+(e?' ('+e.count+')':'');}},
    series: [{ type:'pie', radius:['38%','68%'], center:['35%','50%'],
      data:entries.map(function(e,i){return {name:e.label, value:e.count, itemStyle:{color:salaryColors[i%salaryColors.length]}};}),
      label:{show:false},
      emphasis:{label:{show:true,fontSize:13,fontFamily:_T.sans,fontWeight:'600',color:_T.dark}},
      itemStyle:{borderColor:'#fff',borderWidth:2} }],
    animation:true, animationDuration:600,
  }, true);
}

// ─── C3: Seniority — pie chart, ordered Entry→C-Suite. Suppress when Unclassified > 80% ───
function renderSeniorityBars(stats) {
  var chart = getOrCreateChart('#chart-funnel'); if (!chart) return;
  var otherCount = stats.levelCounts['Other'] || 0;
  var unclPct = stats.total > 0 ? (otherCount / stats.total) * 100 : 100;

  if (unclPct > 80) {
    emptyChart(chart, 'Most jobs haven\'t been classified by seniority.\nConfigure your level keywords in\nTuning \u2192 Level Hierarchy to improve this.');
    return;
  }

  // Ordered Entry → C-Suite (correct career ladder: Manager before Lead)
  var SENIORITY_ORDER = ['Entry Level','Associate','Mid-Level','Senior','Manager','Lead','Director','VP','C-Suite'];
  var hier = (levelHierarchy && levelHierarchy.length > 0) ? levelHierarchy : DEFAULT_LEVEL_HIERARCHY;
  var data = SENIORITY_ORDER.map(function(label) {
    var count = stats.levelCounts[label] || 0;
    return count > 0 ? {name:label, value:count} : null;
  }).filter(Boolean);
  // Add any levels not in the fixed order
  hier.forEach(function(l) {
    if (SENIORITY_ORDER.indexOf(l.label) === -1 && stats.levelCounts[l.label] > 0) {
      data.push({name:l.label, value:stats.levelCounts[l.label]});
    }
  });
  if (otherCount > 0 && unclPct <= 80) data.push({name:'Other', value:otherCount});

  if (data.length === 0) { emptyChart(chart, 'No seniority data'); return; }

  // Colors: cool (entry) → warm (C-suite), matching salary-data page seniority palette
  var senColors = ['#6366f1','#3b82f6','#06b6d4','#14b8a6','#22c55e','#eab308','#f59e0b','#f97316','#ef4444','#dc2626','#94a3b8'];

  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'item',
      formatter:function(p){ var pct=stats.total>0?Math.round(p.value/stats.total*100):0; return '<b>'+p.name+'</b><br/>'+p.value+' jobs ('+pct+'%)'; }}, ttip()),
    legend: { orient:'vertical', right:4, top:'center', textStyle:{color:_T.dim,fontFamily:_T.sans,fontSize:10},
      formatter:function(name){var d=data.find(function(x){return x.name===name;}); return name+(d?' ('+d.value+')':'');}},
    series: [{ type:'pie', radius:['38%','68%'], center:['35%','50%'],
      data:data.map(function(d,i){return {name:d.name, value:d.value, itemStyle:{color:senColors[i%senColors.length]}};}),
      label:{show:false},
      emphasis:{label:{show:true,fontSize:13,fontFamily:_T.sans,fontWeight:'600',color:_T.dark}},
      itemStyle:{borderColor:'#fff',borderWidth:2} }],
    animation:true, animationDuration:600,
  }, true);
}

// ─── C5: Industry Treemap — same categories as Data Lab ───
function renderTopCompanies(stats) {
  var chart = getOrCreateChart('#chart-companies'); if (!chart) return;
  var ind = stats.industryCounts;
  var sorted = Object.entries(ind).sort(function(a,b){return b[1]-a[1];});
  
  if (sorted.length === 0) {
    emptyChart(chart, 'No industry data available for this filter.');
    return;
  }

  var treePAL = ['#3b82f6','#22c55e','#a855f7','#f59e0b','#06b6d4','#ec4899','#6366f1','#ef4444','#14b8a6','#f97316','#8b5cf6','#0ea5e9','#d946ef','#84cc16','#e11d48'];
  
  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'item',
      formatter:function(p){return '<b>'+p.name+'</b><br/>'+Number(p.value).toLocaleString()+' jobs';}}, ttip()),
    series: [{ type:'treemap',
      data:sorted.map(function(d,i){return {name:d[0], value:d[1], itemStyle:{color:treePAL[i%treePAL.length], borderColor:'#fff', borderWidth:2}};}),
      label:{fontSize:12,fontFamily:'Outfit',fontWeight:500,color:'#fff',formatter:function(p){return p.name+'\n'+Number(p.value).toLocaleString();}},
      breadcrumb:{show:false}, roam:false, nodeClick:false,
      levels:[{itemStyle:{borderRadius:8}}],
      animationDuration:800 }],
  }, true);
}

// ─── C7: Work Arrangement — donut (correct for categorical composition) ───
function renderWorkType(stats) {
  var chart = getOrCreateChart('#chart-location'); if (!chart) return;
  var wt = stats.workTypeCounts;
  var typeColors = { 'Remote':'#22c55e', 'On-site':'#6366f1', 'Hybrid':'#f59e0b', 'Unspecified':'#334155' };
  var total = Object.values(wt).reduce(function(a,b){return a+b;},0);
  var unspecPct = total > 0 ? (wt['Unspecified'] / total) * 100 : 0;

  // Suppress Unspecified segment when > 50%
  var order = ['Remote','On-site','Hybrid'];
  if (unspecPct <= 50) order.push('Unspecified');

  var data = order.filter(function(t){return wt[t]>0;})
    .map(function(t){return {name:t, value:wt[t], itemStyle:{color:typeColors[t]}};});
  var displayTotal = data.reduce(function(a,d){return a+d.value;},0);

  if (data.length === 0) { emptyChart(chart, 'No location data available'); return; }

  var noteText = unspecPct > 50 ? 'Location type not specified for many jobs' : '';
  chart.setOption({
    graphic: noteText ? [{type:'text',left:'center',bottom:5,style:{text:noteText,fill:_T.faint,fontSize:10,fontFamily:_T.sans}}] : [],
    tooltip: Object.assign({ trigger:'item',
      formatter:function(p){return '<b>'+p.name+'</b><br/>'+p.value+' jobs ('+p.percent.toFixed(1)+'%)';}}, ttip()),
    legend: { orient:'vertical', right:10, top:'center', textStyle:{color:_T.dim,fontFamily:_T.sans,fontSize:12},
      formatter:function(name){ var v=wt[name]||0; var pct=displayTotal>0?Math.round(v/displayTotal*100):0; return name+'  '+pct+'%'; }},
    series: [{ type:'pie', radius:['42%','70%'], center:['35%','50%'], avoidLabelOverlap:true,
      label:{show:false},
      emphasis:{label:{show:true,fontSize:14,fontFamily:_T.sans,fontWeight:'600',color:_T.dark}},
      data:data }],
    animation:true, animationDuration:600,
  }, true);
}

// ─── C6: Salary by Level — threshold: 100+ jobs AND 3+ levels with 5+ salary points ───
function renderSalaryByLevel(stats) {
  var card = document.getElementById('chart-salary-level');
  var cardWrap = card ? card.closest('.stats-chart-card') : null;
  var salLvl = stats.salaryByLevel;

  var qualifiedLevels = Object.keys(salLvl).filter(function(l){ return salLvl[l].count >= 5; });
  var meetsThreshold = stats.total >= 100 && qualifiedLevels.length >= 3;

  if (!meetsThreshold) {
    if (cardWrap) cardWrap.style.display = 'none';
    return;
  }
  if (cardWrap) cardWrap.style.display = '';

  var chart = getOrCreateChart('#chart-salary-level'); if (!chart) return;
  var hier = (levelHierarchy && levelHierarchy.length > 0) ? levelHierarchy : DEFAULT_LEVEL_HIERARCHY;
  var ordered = hier.map(function(l){return l.label;}).filter(function(l){return salLvl[l] && salLvl[l].count>=5;})
    .map(function(l){return {label:l, avg:salLvl[l].avg, count:salLvl[l].count};});
  if (salLvl['Other'] && salLvl['Other'].count >= 5) ordered.push({label:'Other', avg:salLvl['Other'].avg, count:salLvl['Other'].count});

  var overallAvg = 0, totalCount = 0;
  ordered.forEach(function(d){overallAvg += d.avg * d.count; totalCount += d.count;});
  overallAvg = totalCount > 0 ? Math.round(overallAvg / totalCount) : 0;

  var barColors = ['#6366f1','#818cf8','#a78bfa','#22c55e','#34d399','#f59e0b','#fbbf24','#ec4899','#f97316','#ef4444','#06b6d4','#8b5cf6'];

  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'axis', axisPointer:{type:'shadow'},
      formatter:function(p){ var d=ordered.filter(function(x){return x.label===p[0].name;})[0]; return '<b>'+p[0].name+'</b><br/>Avg: $'+Math.round(p[0].value/1000)+'K'+(d?' ('+d.count+' data points)':''); }}, ttip()),
    grid: { top:30, right:30, bottom:40, left:60 },
    xAxis: { type:'category', data:ordered.map(function(d){return d.label;}),
      axisLabel:{ color:_T.dim, fontFamily:_T.sans, fontSize:11, rotate:ordered.length>8?30:0 },
      axisLine:STATS_THEME.axisLine },
    yAxis: { type:'value', axisLabel:{ color:_T.dim, fontFamily:_T.mono, fontSize:10,
      formatter:function(v){return '$'+Math.round(v/1000)+'K';}}, splitLine:STATS_THEME.splitLine },
    series: [{ type:'bar', data:ordered.map(function(d,i){return {value:d.avg, itemStyle:{color:barColors[i%barColors.length]}};  }),
      barMaxWidth:40, itemStyle:{borderRadius:[4,4,0,0]},
      label:{ show:ordered.length<=8, position:'top', color:_T.dim, fontFamily:_T.mono, fontSize:10,
        formatter:function(p){return '$'+Math.round(p.value/1000)+'K';}},
      markLine:{ silent:true, symbol:'none', lineStyle:{color:'#ef4444',type:'dashed',width:1.5},
        data:[{yAxis:overallAvg, label:{formatter:'Avg: $'+Math.round(overallAvg/1000)+'K',color:'#ef4444',fontFamily:_T.mono,fontSize:10}}]}}],
    animation:true, animationDuration:600,
  }, true);
}

// ─── C8: Industry — threshold: industry non-null > 60% ───
function renderIndustryBars(stats) {
  var card = document.getElementById('chart-industry');
  var cardWrap = card ? card.closest('.stats-chart-card') : null;
  var coveragePct = stats.total > 0 ? (stats.industryNonNull / stats.total) * 100 : 0;

  if (coveragePct < 60) {
    if (cardWrap) cardWrap.style.display = 'none';
    return;
  }
  if (cardWrap) cardWrap.style.display = '';

  var chart = getOrCreateChart('#chart-industry'); if (!chart) return;
  var sorted = Object.entries(stats.industryCounts).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
  if (sorted.length === 0) { emptyChart(chart, 'No industry data available'); return; }

  var rev = sorted.slice().reverse();
  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'axis', axisPointer:{type:'shadow'},
      formatter:function(p){return '<b>'+p[0].name+'</b><br/>'+p[0].value+' jobs';}}, ttip()),
    grid: { top:10, right:30, bottom:10, left:160 },
    xAxis: { type:'value', axisLabel:STATS_THEME.axisLabel, splitLine:STATS_THEME.splitLine, minInterval:1 },
    yAxis: { type:'category', data:rev.map(function(e){return e[0];}),
      axisLabel:{ color:_T.dim, fontFamily:_T.sans, fontSize:11, width:150, overflow:'truncate' }, axisLine:{show:false}, axisTick:{show:false} },
    series: [{ type:'bar', data:rev.map(function(e){return e[1];}),
      itemStyle:{ color:new echarts.graphic.LinearGradient(0,0,1,0,[{offset:0,color:'rgba(34,197,94,0.3)'},{offset:1,color:'#22c55e'}]), borderRadius:[0,3,3,0] },
      barMaxWidth:18,
      label:STATS_THEME.barLabel}],
    animation:true, animationDuration:600,
  }, true);
}

// ─── Posting Age Distribution — bar chart ───
function renderPostingAge(stats) {
  var chart = getOrCreateChart('#chart-posting-age'); if (!chart) return;
  var buckets = stats.postingAgeBuckets;
  var labels = ['0-7 days','8-14 days','15-30 days','31-60 days','61-90 days','90+ days'];
  var ageColors = ['#22c55e','#84cc16','#eab308','#f59e0b','#f97316','#ef4444'];
  
  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'axis', axisPointer:{type:'shadow'},
      formatter:function(p){return '<b>'+p[0].name+'</b><br/>'+p[0].value+' jobs';}}, ttip()),
    grid: { top:20, right:20, bottom:35, left:50 },
    xAxis: { type:'category', data:labels,
      axisLabel:{ color:_T.dim, fontFamily:_T.mono, fontSize:10 },
      axisLine:STATS_THEME.axisLine },
    yAxis: { type:'value', axisLabel:STATS_THEME.axisLabel, splitLine:STATS_THEME.splitLine, minInterval:1 },
    series: [{ type:'bar', data:labels.map(function(l,i){return {value:buckets[l]||0, itemStyle:{color:ageColors[i], borderRadius:[3,3,0,0]}};}),
      barMaxWidth:36,
      label:{ show:true, position:'top', color:_T.dim, fontFamily:_T.mono, fontSize:10,
        formatter:function(p){return p.value>0?p.value:'';}} }],
    animation:true, animationDuration:600,
  }, true);
}

// ─── Geo Map + Top Metros/Cities ───
function renderGeoMap(stats, configs) {
  var mapEl = document.getElementById('chart-geo-map');
  var listEl = document.getElementById('chart-geo-list');
  var titleEl = document.getElementById('chart-geo-title');
  if (!mapEl) return;

  var stateCounts = stats.stateCounts || {};
  var cityCounts = stats.cityCounts || {};
  var stateEntries = Object.entries(stateCounts).sort(function(a,b){return b[1]-a[1];});

  if (stateEntries.length === 0) {
    mapEl.innerHTML = '<div style="text-align:center;padding:80px 20px;color:'+_T.dim+';font-size:12px">No location data for this filter</div>';
    if (listEl) listEl.innerHTML = '';
    return;
  }

  // Detect if filter has metro pills
  var hasMetroPills = false;
  if (configs && configs.length > 0) {
    configs.forEach(function(c) {
      if (c.sf && c.sf.wherePills) {
        c.sf.wherePills.forEach(function(p) {
          if (p.locType === 'metro' || p.locType === 'city') hasMetroPills = true;
        });
      }
    });
  }

  // Title
  if (titleEl) titleEl.textContent = hasMetroPills ? 'Where Are the Jobs (Cities)' : 'Where Are the Jobs';

  // Map via ECharts (simple US bar chart by state for now — SVG map would need registered map)
  var chart = statsCharts['#chart-geo-map'];
  if (!chart) { chart = echarts.init(mapEl, null, {renderer:'canvas'}); statsCharts['#chart-geo-map'] = chart; }
  
  var top15 = stateEntries.slice(0,15).reverse();
  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'axis', axisPointer:{type:'shadow'},
      formatter:function(p){return '<b>'+p[0].name+'</b><br/>'+p[0].value+' jobs';}}, ttip()),
    grid: { top:10, right:30, bottom:10, left:40 },
    xAxis: { type:'value', axisLabel:STATS_THEME.axisLabel, splitLine:STATS_THEME.splitLine },
    yAxis: { type:'category', data:top15.map(function(e){return e[0];}),
      axisLabel:{ color:_T.dim, fontFamily:_T.mono, fontSize:11 }, axisLine:{show:false}, axisTick:{show:false} },
    series: [{ type:'bar', data:top15.map(function(e,i){return {value:e[1],
      itemStyle:{color:new echarts.graphic.LinearGradient(0,0,1,0,[{offset:0,color:'rgba(59,130,246,0.2)'},{offset:1,color:'#3b82f6'}]), borderRadius:[0,3,3,0]}};}),
      barMaxWidth:18, label:{ show:true, position:'right', color:_T.dim, fontFamily:_T.mono, fontSize:10,
        formatter:function(p){return p.value.toLocaleString();}} }],
    animation:true, animationDuration:600,
  }, true);

  // List: top 10 metros or cities
  if (!listEl) return;
  var listData;
  if (hasMetroPills) {
    // Show cities within the metro filter areas
    listData = Object.entries(cityCounts).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
    listEl.innerHTML = '<div style="font-weight:600;margin-bottom:8px;color:'+_T.dark+'">Top Cities in Filter</div>' +
      listData.map(function(e,i){return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid '+_T.border+'"><span>'+(i+1)+'. '+e[0]+'</span><span style="font-weight:600">'+e[1].toLocaleString()+'</span></div>';}).join('');
  } else {
    // Show top metro areas (city, state combos)
    listData = Object.entries(cityCounts).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
    listEl.innerHTML = '<div style="font-weight:600;margin-bottom:8px;color:'+_T.dark+'">Top 10 Metro Areas</div>' +
      listData.map(function(e,i){return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid '+_T.border+'"><span>'+(i+1)+'. '+e[0]+'</span><span style="font-weight:600">'+e[1].toLocaleString()+'</span></div>';}).join('');
  }
}

// ─── Loading / Empty (no inline styles) ───
function showStatsLoading(on) {
  var grid = document.getElementById('stats-charts-grid');
  var empty = document.getElementById('stats-empty');
  if (empty) empty.style.display = 'none';
  if (on) {
    ['#sc-total','#sc-salary','#sc-senior','#sc-remote','#sc-companies'].forEach(function(s){ var e=document.querySelector(s); if(e) e.textContent='\u2014'; });
    if (grid) grid.classList.add('loading');
  } else { if (grid) grid.classList.remove('loading'); }
}
function showEmptyState(reason) {
  showStatsLoading(false);
  var msgs = { 'no-filters':'Create saved filters on the Jobs Feed page to see your personalized stats',
    'no-results':'No jobs match this filter. Try broadening your search criteria.',
    'error':'Something went wrong loading stats. Try refreshing the page.' };
  ['#sc-total','#sc-salary','#sc-senior','#sc-remote','#sc-companies'].forEach(function(s){setText(s,'\u2014');});
  var el = document.getElementById('stats-empty');
  if (el) { el.textContent = msgs[reason]||msgs['error']; el.style.display = ''; }
}

// ─── Resize / Refresh ───
function statsResizeAll() { Object.values(statsCharts).forEach(function(c){ if(c&&!c.isDisposed()) c.resize(); }); }
function refreshStatsCharts() {
  renderFilterPills();
  var stale = Object.values(statsCache).some(function(c){return Date.now()-c.timestamp>=STATS_CACHE_TTL;});
  if (stale || Object.keys(statsCache).length === 0) fetchAndRenderStats();
  else statsResizeAll();
}
