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
var statsSelectedFilters = safeReadLS('bj_stats_filters', ["__all__"]);
var _statsDebounce = null;
var statsCompareMode = false;

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
  {label:'Entry Level', keywords:'entry level,entry-level,junior,jr,new grad,graduate'},
  {label:'Associate', keywords:'associate,assoc'},
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
var STATS_COLUMNS = 'greenhouse_id,ats_source,title,company_name,company_slug,salary_min,salary_max,salary_currency,location,loc_type,loc_state,loc_city,first_seen_at,industry';

// ─── CS-014: CX-09 — Lazy-load ECharts on first Stats tab open ───
var _echartsLoaded = false;
var _echartsLoading = false;
function loadECharts(cb) {
  if (_echartsLoaded && typeof echarts !== 'undefined') { cb(); return; }
  if (_echartsLoading) { var _iv = setInterval(function() { if (_echartsLoaded) { clearInterval(_iv); cb(); } }, 100); return; }
  _echartsLoading = true;
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js';
  s.onload = function() { _echartsLoaded = true; cb(); };
  s.onerror = function() { _echartsLoading = false; console.error('[Stats] Failed to load ECharts'); };
  document.head.appendChild(s);
}

// ─── Init ───
function initStatsPage() {
  var page = document.getElementById('page-stats');
  if (!page || !page.classList.contains('active')) return;
  if (statsInitialized) { refreshStatsCharts(); return; }
  // CS-014: lazy-load ECharts before initializing charts
  loadECharts(function() {
    statsInitialized = true;
    renderFilterPills();
    initCompareToggle();
    fetchAndRenderStats();
    window.addEventListener('resize', statsResizeAll);

    // P13-06: Start data value assessment timer (shows after 10s viewing)
    if (typeof startDataViewTimer === 'function') startDataViewTimer('stats_charts');
  });
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

// ─── A15 S6 v6.62: Source pill counts from mv_job_feed_counts ───
// Shows per-ATS-source job counts as small chips in the stats filter bar (All mode only)
var _sourceCountsRendered = false;
var _sourcePillColors = { 'greenhouse':'#22c55e', 'lever':'#6366f1', 'ashby':'#f59e0b', 'workable':'#ec4899', 'recruitee':'#06b6d4', 'usajobs':'#3b82f6' };
var _sourcePillLabels = { 'greenhouse':'Greenhouse', 'lever':'Lever', 'ashby':'Ashby', 'workable':'Workable', 'recruitee':'Recruitee', 'usajobs':'USAJobs' };

async function renderSourceCountPills() {
  var container = document.getElementById('stats-filter-pills');
  if (!container) return;
  // Remove old source pills
  var oldPills = container.querySelectorAll('.stats-source-pill');
  for (var i = 0; i < oldPills.length; i++) oldPills[i].remove();
  // Only show in All mode
  if (!statsSelectedFilters.includes('__all__')) { _sourceCountsRendered = false; return; }

  var totals = await fetchSourceTotalsFromMV();
  if (!totals) return;

  // Sort sources by job count descending
  var sources = Object.keys(totals).sort(function(a, b) { return totals[b].jobs - totals[a].jobs; });

  // Insert a separator dot before source pills
  var sep = document.createElement('span');
  sep.className = 'stats-source-pill';
  sep.style.cssText = 'width:3px;height:3px;border-radius:50%;background:var(--border);margin:0 2px;align-self:center;';
  // Insert before MV freshness badge if it exists, else append
  var freshBadge = document.getElementById('stats-mv-freshness');
  if (freshBadge) container.insertBefore(sep, freshBadge);
  else container.appendChild(sep);

  for (var s = 0; s < sources.length; s++) {
    var src = sources[s];
    var count = totals[src].jobs;
    if (count === 0) continue;
    var chip = document.createElement('span');
    chip.className = 'stats-source-pill';
    chip.title = (_sourcePillLabels[src] || src) + ': ' + count.toLocaleString() + ' jobs (' + totals[src].withSalary.toLocaleString() + ' with salary)';
    chip.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:10px;font-family:var(--mono);color:var(--text-dim);border:1px solid var(--border);background:var(--bg-card);cursor:default;white-space:nowrap;';
    var dot = document.createElement('span');
    dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:' + (_sourcePillColors[src] || '#475569') + ';flex-shrink:0;';
    chip.appendChild(dot);
    chip.appendChild(document.createTextNode((_sourcePillLabels[src] || src) + ' ' + _formatCompact(count)));
    if (freshBadge) container.insertBefore(chip, freshBadge);
    else container.appendChild(chip);
  }
  _sourceCountsRendered = true;
}

function _formatCompact(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function initCompareToggle() {
  var sel = document.getElementById('stats-compare-toggle');
  if (!sel) return;
  sel.disabled = false;
  sel.addEventListener('change', function() {
    statsCompareMode = sel.value === 'compare';
    debouncedFetchAndRender();
  });
}

async function fetchAndRenderCompare(filterA, filterB) {
  var rowsA = await fetchFilterData(filterA.sf);
  var rowsB = await fetchFilterData(filterB.sf);
  var statsA = aggregateStats(rowsA);
  var statsB = aggregateStats(rowsB);
  var colorA = filterColors[filterA.idx % filterColors.length];
  var colorB = filterColors[filterB.idx % filterColors.length];
  var nameA = filterA.sf.name || ('Filter ' + (filterA.idx + 1));
  var nameB = filterB.sf.name || ('Filter ' + (filterB.idx + 1));
  return { a: { stats: statsA, color: colorA, name: nameA }, b: { stats: statsB, color: colorB, name: nameB } };
}

// ─── Data ───
function debouncedFetchAndRender() { clearTimeout(_statsDebounce); _statsDebounce = setTimeout(fetchAndRenderStats, 300); }

async function fetchAndRenderStats() {
  showStatsLoading(true);
  try {
    var configs = getSelectedFilterConfigs();
    if (configs.length === 0) { showEmptyState('no-filters'); return; }

    // Compare mode: exactly 2 filters selected
    if (statsCompareMode) {
      var selected = configs.filter(function(c) { return statsSelectedFilters.includes(String(c.idx)); });
      if (selected.length !== 2 && !statsSelectedFilters.includes('__all__')) {
        showStatsLoading(false);
        var warn = document.getElementById('stats-compare-warn');
        if (warn) { warn.textContent = 'Select exactly 2 filters to compare'; warn.style.display = ''; }
        return;
      }
      if (statsSelectedFilters.includes('__all__') || selected.length !== 2) {
        showStatsLoading(false);
        var warn = document.getElementById('stats-compare-warn');
        if (warn) { warn.textContent = 'Select exactly 2 individual filters to compare (not "All")'; warn.style.display = ''; }
        return;
      }
      var cmp = await fetchAndRenderCompare(selected[0], selected[1]);
      showStatsLoading(false);
      var warnEl = document.getElementById('stats-compare-warn');
      if (warnEl) warnEl.style.display = 'none';
      renderCompareTimeline(cmp);
      renderCompareSalary(cmp);
      renderCompareWorkType(cmp);
      renderCompareTopCompanies(cmp);
      renderCompareStatCards(cmp);
      renderSeniorityBars(cmp.a.stats); // Single series fallback for complex charts
      renderSalaryByLevel(cmp.a.stats);
      renderPostingAge(cmp.a.stats);
      renderGeoMap(cmp.a.stats, configs);
      renderIndustryBars(cmp.a.stats);
      renderSourceBreakdown(cmp.a.stats);
      return;
    }

    // Hide compare warning
    var warnEl = document.getElementById('stats-compare-warn');
    if (warnEl) warnEl.style.display = 'none';
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

    // A15 Session 5: When "All" filters selected, use MV data for stat cards + source charts
    var isAllMode = statsSelectedFilters.includes('__all__');
    var mvSourceTotals = null, mvSourceTimeline = null, mvLandingStats = null;
    if (isAllMode) {
      try {
        var mvResults = await Promise.all([fetchSourceTotalsFromMV(), fetchSourceBreakdownFromMV(), fetchLandingStatsFromMV()]);
        mvSourceTotals = mvResults[0];
        mvSourceTimeline = mvResults[1];
        mvLandingStats = mvResults[2];
      } catch(e) { reportError('stats', e); console.warn('[Stats] MV fetch failed, falling back to row data:', e.message); }
    }

    // A15 S5: Render stat cards from MV when in All mode (instant, no row aggregation)
    if (mvLandingStats) {
      renderStatCardsFromMV(mvLandingStats);
      renderMVFreshnessNotice(mvLandingStats.refreshed_at);
    } else {
      renderStatCards(stats);
      hideMVFreshnessNotice();
    }

    // A15 S6 v6.62: Render source count pills from MV (All mode)
    renderSourceCountPills();

    // Use MV-powered source timeline when available, otherwise standard
    if (mvSourceTimeline && mvSourceTimeline.length > 0) {
      renderSourceTimelineFromMV(mvSourceTimeline);
    } else {
      renderTimeline(stats);
    }

    renderSalaryDist(stats);
    renderSeniorityBars(stats);
    renderTopCompanies(stats);
    renderWorkType(stats);
    renderPostingAge(stats);
    renderGeoMap(stats, configs);
    renderSalaryByLevel(stats);
    renderIndustryBars(stats);

    // Use MV-powered source breakdown when available, otherwise standard
    if (mvSourceTotals) {
      renderSourceBreakdownFromMV(mvSourceTotals);
    } else {
      renderSourceBreakdown(stats);
    }
    var notice = document.getElementById('stats-cap-notice');
    if (notice) {
      if (anyCapped) { notice.textContent = 'Based on ' + deduped.length.toLocaleString() + ' most recent matches'; notice.style.display = ''; }
      else { notice.style.display = 'none'; }
    }
  } catch (err) { console.error('[Stats] Fetch error:', err); toastError('Failed to load stats data'); showEmptyState('error'); }
}

function getSelectedFilterConfigs() {
  if (savedFilters.length === 0) return [];
  if (statsSelectedFilters.includes('__all__')) return savedFilters.map(function(sf, i) { return {sf:sf, idx:i}; });
  return statsSelectedFilters.map(function(id) { return {sf: savedFilters[Number(id)], idx: Number(id)}; }).filter(function(x) { return x.sf; });
}

async function fetchFilterData(sf) {
  try {
    var tuning = safeReadLS('bj_tuning', {});
    var locIds = await getLocationMatchIds(sf.wherePills || [], sf.whereNotPills || [], tuning, sf.includeRemote);
    // A14 Session 3: wrap stats data queries in cachedQuery
    var cKey = _filterCacheKey('stats:page', sf);
    var cResult = await cachedQuery(cKey, function() {
      var base = sb.from('ats_jobs').select(STATS_COLUMNS);
      var q = buildFilterQuery(sf, base, locIds);
      // Exclude user-hidden jobs to match feed counts
      var hiddenIds = safeReadLS('bj_hidden', []);
      if (hiddenIds.length > 0) { q = q.not('greenhouse_id', 'in', '(' + hiddenIds.join(',') + ')'); }
      q = q.order('first_seen_at', { ascending: false }).limit(STATS_ROW_CAP);
      return q;
    });
    if (cResult && cResult.error) { console.error('[Stats] Query error:', cResult.error); toastWarning('Stats query failed'); return []; }
    return (cResult && cResult.data) || [];
  } catch (e) { console.error('[Stats] fetchFilterData:', e); toastWarning('Stats data failed to load'); return []; }
}

// ─── Aggregation ───
function aggregateStats(rows) {
  var s = { total: rows.length, medianSalary: null, seniorPct: 0, remotePct: 0, companyCount: 0,
    levelCounts: {}, salaryBuckets: {}, topCompanies: [], workTypeCounts: {}, timelineBuckets: {},
    salaryByLevel: {}, industryCounts: {}, salaryJobCount: 0, industryNonNull: 0, sourceCounts: {} };

  var cos = {}; rows.forEach(function(r) { var ck = r.company_slug || r.company_name; if (ck) cos[ck] = true; });
  s.companyCount = Object.keys(cos).length;

  // Seniority + salary-by-level in one pass
  var hier = (levelHierarchy && levelHierarchy.length > 0) ? levelHierarchy : DEFAULT_LEVEL_HIERARCHY;
  hier.map(function(l) { return l.label; }).forEach(function(l) { s.levelCounts[l] = 0; });
  s.levelCounts['Other'] = 0;
  var seniorSet = {Senior:1,Staff:1,Lead:1,Principal:1,Manager:1,Director:1,VP:1,'C-Suite':1,'Sr Director':1,'Assoc Director':1,'Sr Manager':1};
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
    var arr = salByLvl[label].sort(function(a,b){return a-b;});
    var n = arr.length;
    var p = function(pct) { var i = Math.floor(pct * (n - 1)); var f = pct * (n - 1) - i; return Math.round(arr[i] + (arr[Math.min(i+1,n-1)] - arr[i]) * f); };
    s.salaryByLevel[label] = { avg: Math.round(arr.reduce(function(a,b){return a+b;},0) / n), p15: p(0.15), median: p(0.5), p85: p(0.85), count: n };
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
    var day = d.getUTCDay();
    var mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (day === 0 ? 6 : day - 1)));
    var mk = mon.toISOString().slice(0, 10);
    weekMap[mk] = (weekMap[mk]||0) + 1;
  });
  var now = new Date();
  var todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  var todayDay = todayUTC.getUTCDay();
  var thisMonday = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), todayUTC.getUTCDate() - (todayDay === 0 ? 6 : todayDay - 1)));
  var isSunday = todayDay === 0;
  // 12 complete past weeks
  for (var w = 12; w >= 1; w--) {
    var weekStart = new Date(thisMonday.getTime() - (w * 7 * 86400000));
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

  // ATS Source
  rows.forEach(function(r) {
    var src = r.ats_source || 'Unknown';
    s.sourceCounts[src] = (s.sourceCounts[src]||0) + 1;
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

  // Location aggregation for map + metro list (US only)
  s.stateCounts = {};
  s.cityCounts = {};
  s.locationCounts = {};
  s.locationsTotal = 0;
  var US_ST = {AL:1,AK:1,AZ:1,AR:1,CA:1,CO:1,CT:1,DC:1,DE:1,FL:1,GA:1,HI:1,ID:1,IL:1,IN:1,IA:1,KS:1,KY:1,LA:1,ME:1,MD:1,MA:1,MI:1,MN:1,MS:1,MO:1,MT:1,NE:1,NV:1,NH:1,NJ:1,NM:1,NY:1,NC:1,ND:1,OH:1,OK:1,OR:1,PA:1,RI:1,SC:1,SD:1,TN:1,TX:1,UT:1,VT:1,VA:1,WA:1,WV:1,WI:1,WY:1};
  function normalizeLocation(raw) {
    var loc = raw.toLowerCase().trim();
    // Strip country suffixes
    loc = loc.replace(/,?\s*united states$/,'').replace(/,?\s*usa$/,'').replace(/,?\s*us$/,'').trim();
    // Handle remote variants
    if (loc === 'remote' || loc === '') return null;
    if (/^remote\s*[-–—]\s*/.test(loc)) loc = loc.replace(/^remote\s*[-–—]\s*/,'').trim();
    if (/^remote,?\s*/.test(loc) && loc !== 'remote') loc = loc.replace(/^remote,?\s*/,'').trim();
    if (loc === '' || loc === 'remote') return null;
    // Handle "(remote)" suffix
    loc = loc.replace(/\s*\(remote\)\s*$/,'').trim();
    // Multi-location: split on semicolons and take first
    if (loc.indexOf(';') !== -1) loc = loc.split(';')[0].trim();
    if (!loc) return null;
    return loc;
  }
  rows.forEach(function(r) {
    var raw = (r.location || '').trim();
    var loc = normalizeLocation(raw);
    if (loc) {
      s.locationsTotal++;
      s.locationCounts[loc] = (s.locationCounts[loc]||0) + 1;
    }
    if (r.loc_state && US_ST[r.loc_state]) {
      s.stateCounts[r.loc_state] = (s.stateCounts[r.loc_state]||0) + 1;
      if (r.loc_city) {
        var key = r.loc_city + ', ' + r.loc_state;
        s.cityCounts[key] = (s.cityCounts[key]||0) + 1;
      }
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
  // Restore label in case it was changed by MV mode
  var salaryLabel = document.querySelector('#sc-salary');
  if (salaryLabel && salaryLabel.nextElementSibling) salaryLabel.nextElementSibling.textContent = 'Median Salary';
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
  // Compute cumulative
  var cum = [], running = 0;
  sorted.forEach(function(e) { running += e[1]; cum.push(running); });
  chart.setOption({
    tooltip: Object.assign({ trigger:'axis', axisPointer:{type:'shadow'},
      formatter:function(p){ var d=new Date(p[0].name); var isWtd = stats.timelineWtdKey && p[0].name === stats.timelineWtdKey; var cumVal=p[1]?p[1].value:0; return '<b>'+(isWtd?'WTD: ':'Week of ')+d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+'</b><br/>'+p[0].value+' new jobs'+(isWtd?' (so far)':'')+'<br/>'+cumVal+' cumulative'; }}, ttip()),
    grid: { top:30, right:50, bottom:30, left:50 },
    xAxis: { type:'category', data:sorted.map(function(e){return e[0];}),
      axisLabel: { color:_T.dim, fontFamily:_T.mono, fontSize:10, interval:0,
        formatter:function(v){ var d=new Date(v); var label=d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); return stats.timelineWtdKey && v===stats.timelineWtdKey ? label+'\n(WTD)' : label; }},
      axisLine: STATS_THEME.axisLine },
    yAxis: [
      { type:'value', axisLabel:STATS_THEME.axisLabel, splitLine:STATS_THEME.splitLine, minInterval:1 },
      { type:'value', position:'right', axisLabel:{ color:'rgba(99,102,241,0.6)', fontFamily:_T.mono, fontSize:10, formatter:function(v){return v>=1000?(v/1000).toFixed(0)+'K':v;} }, splitLine:{show:false}, axisLine:{show:false}, axisTick:{show:false} }
    ],
    series: [{ type:'bar', yAxisIndex:0, data:sorted.map(function(e){
        var isWtd = stats.timelineWtdKey && e[0] === stats.timelineWtdKey;
        return { value:e[1], itemStyle:{ color: isWtd
          ? new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'#818cf8'},{offset:1,color:'rgba(129,140,248,0.3)'}])
          : new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'#60a5fa'},{offset:1,color:'rgba(59,130,246,0.4)'}]),
          borderRadius:[3,3,0,0], borderType: isWtd ? 'dashed' : 'solid' }};
      }),
      barMaxWidth:28 },
      { type:'line', yAxisIndex:1, data:cum, smooth:0.3, symbol:'none',
        lineStyle:{color:'rgba(99,102,241,0.7)',width:2},
        areaStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(99,102,241,0.15)'},{offset:1,color:'rgba(99,102,241,0)'}])} }
    ],
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
  var salaryColors = ['#3b82f6','#6366f1','#8b5cf6','#a855f7','#d946ef','#ec4899','#f43f5e','#ef4444','#f97316','#f59e0b','#eab308','#22c55e'];

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

  if (unclPct > 95) {
    emptyChart(chart, 'Most jobs haven\'t been classified by seniority.\nConfigure your level keywords in\nTuning \u2192 Level Hierarchy to improve this.');
    return;
  }

  // Ordered Entry → C-Suite (correct career ladder)
  var SENIORITY_ORDER = ['Entry','Analyst','Associate','Mid','Senior','Sr Manager','Manager','Head','Lead','Principal','Staff','Assoc Director','Director','Sr Director','VP','C-Suite'];
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
  if (otherCount > 0 && unclPct <= 95) data.push({name:'Other', value:otherCount});

  if (data.length === 0) { emptyChart(chart, 'No seniority data'); return; }

  // Colors: cool (entry) → warm (C-suite), matching salary-data page seniority palette
  var senColors = ['#3b82f6','#6366f1','#8b5cf6','#22c55e','#14b8a6','#f59e0b','#f97316','#ec4899','#ef4444','#dc2626','#94a3b8'];

  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'item',
      formatter:function(p){ var pct=stats.total>0?Math.round(p.value/stats.total*100):0; return '<b>'+p.name+'</b><br/>'+p.value+' jobs ('+pct+'%)'; }}, ttip()),
    legend: { orient:'vertical', right:4, top:'center', textStyle:{color:_T.dim,fontFamily:_T.sans,fontSize:10},
      formatter:function(name){var d=data.find(function(x){return x.name===name;}); var total=data.reduce(function(a,b){return a+b.value;},0); var pct=d&&total>0?Math.round(d.value/total*100):0; return name+(d?' ('+pct+'%)':'');}},
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
    .map(function(l){return {label:l, avg:salLvl[l].avg, p15:salLvl[l].p15, median:salLvl[l].median, p85:salLvl[l].p85, count:salLvl[l].count};});
  if (salLvl['Other'] && salLvl['Other'].count >= 5) ordered.push({label:'Other', avg:salLvl['Other'].avg, p15:salLvl['Other'].p15, median:salLvl['Other'].median, p85:salLvl['Other'].p85, count:salLvl['Other'].count});

  var overallAvg = 0, totalCount = 0;
  ordered.forEach(function(d){overallAvg += d.avg * d.count; totalCount += d.count;});
  overallAvg = totalCount > 0 ? Math.round(overallAvg / totalCount) : 0;

  var barColors = ['#6366f1','#818cf8','#a78bfa','#22c55e','#34d399','#f59e0b','#fbbf24','#ec4899','#f97316','#ef4444','#06b6d4','#8b5cf6'];
  var fK = function(v){return '$'+Math.round(v/1000)+'K';};

  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'axis', axisPointer:{type:'shadow'},
      formatter:function(p){ var idx=p[0].dataIndex; var d=ordered[idx]; if(!d)return ''; return '<b>'+d.label+'</b> ('+d.count+' jobs)<br/>P85: '+fK(d.p85)+'<br/>Median: <b>'+fK(d.median)+'</b><br/>P15: '+fK(d.p15); }}, ttip()),
    grid: { top:30, right:30, bottom:40, left:60 },
    xAxis: { type:'category', data:ordered.map(function(d){return d.label;}),
      axisLabel:{ color:_T.dim, fontFamily:_T.sans, fontSize:11, rotate:ordered.length>8?30:0 },
      axisLine:STATS_THEME.axisLine },
    yAxis: { type:'value', axisLabel:{ color:_T.dim, fontFamily:_T.mono, fontSize:10,
      formatter:function(v){return fK(v);}}, splitLine:STATS_THEME.splitLine },
    series: [
      { name:'P15 base', type:'bar', stack:'range', data:ordered.map(function(d){return {value:d.p15, itemStyle:{color:'transparent'}};}),
        barMaxWidth:40, itemStyle:{borderRadius:0} },
      { name:'Range', type:'bar', stack:'range', data:ordered.map(function(d,i){return {value:d.p85-d.p15, itemStyle:{color:barColors[i%barColors.length],opacity:0.35,borderRadius:[4,4,0,0]}};}),
        barMaxWidth:40 },
      { name:'Median', type:'scatter', symbol:'rect', symbolSize:function(v,p){return [36,3];},
        data:ordered.map(function(d,i){return {value:d.median, itemStyle:{color:barColors[i%barColors.length]}};}),
        z:10, label:{ show:ordered.length<=8, position:'top', color:_T.dim, fontFamily:_T.mono, fontSize:10,
          formatter:function(p){return fK(p.value);}}}
    ],
    animation:true, animationDuration:600,
  }, true);
}

// ─── C8: Industry — threshold: industry non-null > 60% ───
function renderIndustryBars(stats) {
  var card = document.getElementById('chart-industry');
  var cardWrap = card ? card.closest('.stats-chart-card') : null;
  var coveragePct = stats.total > 0 ? (stats.industryNonNull / stats.total) * 100 : 0;

  if (cardWrap) cardWrap.style.display = '';
  if (coveragePct < 1) {
    emptyChart(chart || getOrCreateChart('#chart-industry'), 'Industry data available for ' + stats.industryNonNull + ' of ' + stats.total + ' jobs (' + Math.round(coveragePct) + '%). More enrichment coming soon.');
    return;
  }

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

// ─── C9: ATS Source Breakdown — donut ───
function renderSourceBreakdown(stats) {
  var chart = getOrCreateChart('#chart-source'); if (!chart) return;
  var src = stats.sourceCounts;
  var sorted = Object.entries(src).sort(function(a,b){return b[1]-a[1];});
  if (sorted.length === 0) { emptyChart(chart, 'No source data'); return; }
  var sourceColors = { 'greenhouse':'#22c55e', 'lever':'#6366f1', 'ashby':'#f59e0b', 'workable':'#ec4899', 'recruitee':'#06b6d4', 'usajobs':'#3b82f6', 'Unknown':'#475569' };
  var total = sorted.reduce(function(a,e){return a+e[1];},0);
  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'item',
      formatter:function(p){return '<b>'+p.name+'</b><br/>'+p.value.toLocaleString()+' jobs ('+((p.value/total)*100).toFixed(1)+'%)';}}, ttip()),
    series: [{ type:'pie', radius:['45%','72%'], center:['50%','55%'],
      data:sorted.map(function(e){
        var name = e[0].charAt(0).toUpperCase() + e[0].slice(1);
        return {name:name, value:e[1], itemStyle:{color:sourceColors[e[0]]||STATS_COLORS[sorted.indexOf(e)%STATS_COLORS.length]}};
      }),
      label:{fontSize:11,fontFamily:_T.sans,color:_T.dim,formatter:function(p){return p.name+' '+((p.value/total)*100).toFixed(0)+'%';}},
      emphasis:{itemStyle:{shadowBlur:10,shadowColor:'rgba(0,0,0,0.2)'}},
      animationType:'scale', animationDuration:600 }],
  }, true);
}

// ─── Posting Age Distribution — bar chart ───
function renderPostingAge(stats) {
  var chart = getOrCreateChart('#chart-posting-age'); if (!chart) return;
  var buckets = stats.postingAgeBuckets;
  var labels = ['0-7 days','8-14 days','15-30 days','31-60 days','61-90 days','90+ days'];
  var ageColors = ['#3b82f6','#6366f1','#8b5cf6','#f59e0b','#f97316','#ef4444'];
  
  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'axis', axisPointer:{type:'shadow'},
      formatter:function(p){return '<b>'+p[0].name+'</b><br/>'+p[0].value+' jobs';}}, ttip()),
    grid: { top:20, right:20, bottom:35, left:50 },
    xAxis: { type:'category', data:labels,
      axisLabel:{ color:_T.dim, fontFamily:_T.mono, fontSize:10, interval:0 },
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
  var locationCounts = stats.locationCounts || {};
  var stateEntries = Object.entries(stateCounts).sort(function(a,b){return b[1]-a[1];});
  var locationEntries = Object.entries(locationCounts).sort(function(a,b){return b[1]-a[1];});

  if (locationEntries.length === 0 && stateEntries.length === 0) {
    mapEl.innerHTML = '<div style="text-align:center;padding:80px 20px;color:'+_T.dim+';font-size:12px">No location data for this filter</div>';
    if (listEl) listEl.innerHTML = '';
    return;
  }

  // For small result sets (<75 jobs), show a clean list instead of a bar chart
  if (stats.total < 75) {
    // Destroy existing chart if any
    if (statsCharts['#chart-geo-map']) { statsCharts['#chart-geo-map'].dispose(); delete statsCharts['#chart-geo-map']; }
    if (titleEl) titleEl.textContent = 'Where Are the Jobs (' + stats.locationsTotal + ' of ' + stats.total + ' have locations)';
    var top20 = locationEntries.slice(0, 20);
    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0">';
    top20.forEach(function(e, i) {
      html += '<div style="display:flex;justify-content:space-between;padding:10px 16px;border-bottom:1px solid '+_T.border+';font-size:13px;' + (i%2===0?'border-right:1px solid '+_T.border+';':'') + '">' +
        '<span style="color:'+_T.dim+'">' + e[0] + '</span>' +
        '<span style="font-weight:700;font-family:'+_T.mono+';color:'+_T.dark+'">' + e[1] + '</span></div>';
    });
    html += '</div>';
    if (stats.locationsTotal === 0) {
      html = '<div style="text-align:center;padding:60px 20px;color:'+_T.dim+';font-size:13px">All jobs in this filter are remote or have no location specified</div>';
    }
    mapEl.innerHTML = html;
    mapEl.style.height = 'auto';
    if (listEl) listEl.style.display = 'none';
    return;
  }
  // For larger result sets, restore chart height and show list
  mapEl.style.height = '400px';
  if (listEl) listEl.style.display = '';

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
    listData = Object.entries(cityCounts).filter(function(e){
        var st=e[0].split(', ').pop();
        return /^[A-Z]{2}$/.test(st) && 'AL,AK,AZ,AR,CA,CO,CT,DC,DE,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY'.indexOf(st)>=0;
      }).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
    listEl.innerHTML = '<div style="font-weight:600;margin-bottom:8px;color:'+_T.dark+'">Top Cities in Filter</div>' +
      listData.map(function(e,i){return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid '+_T.border+'"><span>'+(i+1)+'. '+e[0]+'</span><span style="font-weight:600">'+e[1].toLocaleString()+'</span></div>';}).join('');
  } else {
    // Show top metro areas (city, state combos)
    listData = Object.entries(cityCounts).filter(function(e){
        var st=e[0].split(', ').pop();
        return /^[A-Z]{2}$/.test(st) && 'AL,AK,AZ,AR,CA,CO,CT,DC,DE,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY'.indexOf(st)>=0;
      }).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
    listEl.innerHTML = '<div style="font-weight:600;margin-bottom:8px;color:'+_T.dark+'">Top 10 Metro Areas</div>' +
      listData.map(function(e,i){return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid '+_T.border+'"><span>'+(i+1)+'. '+e[0]+'</span><span style="font-weight:600">'+e[1].toLocaleString()+'</span></div>';}).join('');
  }
}

// ─── Compare Mode Renderers (v6.09) ───
function renderCompareStatCards(cmp) {
  var a = cmp.a.stats, b = cmp.b.stats;
  setText('#sc-total', a.total.toLocaleString() + ' vs ' + b.total.toLocaleString());
  var salA = a.medianSalary ? '$' + Math.round(a.medianSalary/1000) + 'K' : '\u2014';
  var salB = b.medianSalary ? '$' + Math.round(b.medianSalary/1000) + 'K' : '\u2014';
  setText('#sc-salary', salA + ' vs ' + salB);
  setText('#sc-senior', a.seniorPct + '% vs ' + b.seniorPct + '%');
  setText('#sc-remote', a.remotePct + '% vs ' + b.remotePct + '%');
  setText('#sc-companies', a.companyCount.toLocaleString() + ' vs ' + b.companyCount.toLocaleString());
}

function renderCompareTimeline(cmp) {
  var chart = getOrCreateChart('#chart-timeline'); if (!chart) return;
  var keysA = Object.keys(cmp.a.stats.timelineBuckets).sort();
  var keysB = Object.keys(cmp.b.stats.timelineBuckets).sort();
  var allKeys = Array.from(new Set(keysA.concat(keysB))).sort();
  var labels = allKeys.map(function(k) { var d = new Date(k + 'T00:00:00Z'); return (d.getUTCMonth()+1) + '/' + d.getUTCDate(); });
  chart.setOption({
    graphic:[], tooltip: Object.assign({ trigger:'axis' }, ttip()),
    legend: { data:[cmp.a.name, cmp.b.name], textStyle:{color:_T.dim,fontFamily:_T.sans,fontSize:11}, top:0 },
    grid: { top:30, right:20, bottom:24, left:50 },
    xAxis: { type:'category', data:labels, axisLabel:STATS_THEME.axisLabel },
    yAxis: { type:'value', axisLabel:STATS_THEME.axisLabel, splitLine:STATS_THEME.splitLine, minInterval:1 },
    series: [
      { name:cmp.a.name, type:'bar', data:allKeys.map(function(k){return cmp.a.stats.timelineBuckets[k]||0;}),
        itemStyle:{color:cmp.a.color}, barGap:'20%' },
      { name:cmp.b.name, type:'bar', data:allKeys.map(function(k){return cmp.b.stats.timelineBuckets[k]||0;}),
        itemStyle:{color:cmp.b.color} }
    ],
    animation:true, animationDuration:600,
  }, true);
}

function renderCompareSalary(cmp) {
  var chart = getOrCreateChart('#chart-salary'); if (!chart) return;
  var allBuckets = Object.assign({}, cmp.a.stats.salaryBuckets, cmp.b.stats.salaryBuckets);
  var labels = Object.keys(allBuckets).sort(function(a,b) {
    return parseInt(a.replace(/\D/g,'')) - parseInt(b.replace(/\D/g,''));
  });
  if (labels.length === 0) { emptyChart(chart, 'No salary data'); return; }
  chart.setOption({
    graphic:[], tooltip: Object.assign({ trigger:'axis' }, ttip()),
    legend: { data:[cmp.a.name, cmp.b.name], textStyle:{color:_T.dim,fontFamily:_T.sans,fontSize:11}, top:0 },
    grid: { top:30, right:20, bottom:30, left:50 },
    xAxis: { type:'category', data:labels, axisLabel:Object.assign({},STATS_THEME.axisLabel,{rotate:45}) },
    yAxis: { type:'value', axisLabel:STATS_THEME.axisLabel, splitLine:STATS_THEME.splitLine, minInterval:1 },
    series: [
      { name:cmp.a.name, type:'bar', data:labels.map(function(l){return cmp.a.stats.salaryBuckets[l]||0;}),
        itemStyle:{color:cmp.a.color}, barGap:'20%' },
      { name:cmp.b.name, type:'bar', data:labels.map(function(l){return cmp.b.stats.salaryBuckets[l]||0;}),
        itemStyle:{color:cmp.b.color} }
    ],
    animation:true, animationDuration:600,
  }, true);
}

function renderCompareWorkType(cmp) {
  var chart = getOrCreateChart('#chart-location'); if (!chart) return;
  var cats = ['Remote','On-site','Hybrid','Unspecified'];
  chart.setOption({
    graphic:[], tooltip: Object.assign({ trigger:'axis' }, ttip()),
    legend: { data:[cmp.a.name, cmp.b.name], textStyle:{color:_T.dim,fontFamily:_T.sans,fontSize:11}, top:0 },
    grid: { top:30, right:20, bottom:24, left:80 },
    xAxis: { type:'value', axisLabel:STATS_THEME.axisLabel, splitLine:STATS_THEME.splitLine },
    yAxis: { type:'category', data:cats, axisLabel:{ color:_T.dim, fontFamily:_T.sans, fontSize:11 } },
    series: [
      { name:cmp.a.name, type:'bar', data:cats.map(function(c){return cmp.a.stats.workTypeCounts[c]||0;}),
        itemStyle:{color:cmp.a.color}, barGap:'20%' },
      { name:cmp.b.name, type:'bar', data:cats.map(function(c){return cmp.b.stats.workTypeCounts[c]||0;}),
        itemStyle:{color:cmp.b.color} }
    ],
    animation:true, animationDuration:600,
  }, true);
}

function renderCompareTopCompanies(cmp) {
  var chart = getOrCreateChart('#chart-companies'); if (!chart) return;
  // Merge top companies from both
  var merged = {};
  cmp.a.stats.topCompanies.forEach(function(e) { if (!merged[e[0]]) merged[e[0]] = {a:0,b:0}; merged[e[0]].a = e[1]; });
  cmp.b.stats.topCompanies.forEach(function(e) { if (!merged[e[0]]) merged[e[0]] = {a:0,b:0}; merged[e[0]].b = e[1]; });
  var sorted = Object.entries(merged).sort(function(x,y){return (y[1].a+y[1].b)-(x[1].a+x[1].b);}).slice(0,10);
  if (sorted.length === 0) { emptyChart(chart, 'No industry data'); return; }
  var rev = sorted.slice().reverse();
  chart.setOption({
    graphic:[], tooltip: Object.assign({ trigger:'axis', axisPointer:{type:'shadow'} }, ttip()),
    legend: { data:[cmp.a.name, cmp.b.name], textStyle:{color:_T.dim,fontFamily:_T.sans,fontSize:11}, top:0 },
    grid: { top:30, right:30, bottom:10, left:120 },
    xAxis: { type:'value', axisLabel:STATS_THEME.axisLabel, splitLine:STATS_THEME.splitLine },
    yAxis: { type:'category', data:rev.map(function(e){return truncName(e[0],20);}),
      axisLabel:{ color:_T.dim, fontFamily:_T.sans, fontSize:11 } },
    series: [
      { name:cmp.a.name, type:'bar', data:rev.map(function(e){return e[1].a;}),
        itemStyle:{color:cmp.a.color}, barGap:'20%' },
      { name:cmp.b.name, type:'bar', data:rev.map(function(e){return e[1].b;}),
        itemStyle:{color:cmp.b.color} }
    ],
    animation:true, animationDuration:600,
  }, true);
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

// ─── A15 Session 2: MV-backed aggregate queries ───

// Fetch source totals from mv_job_feed_counts (pre-aggregated, instant)
async function fetchSourceTotalsFromMV() {
  try {
    var cKey = 'mv:source-totals';
    var result = await cachedQuery(cKey, function() {
      return sb.from('mv_job_feed_counts').select('ats_source,job_count,with_salary,refreshed_at');
    }, { ttl: 600000 }); // 10 min — matches MV refresh cycle
    if (result && result.data) {
      var totals = {};
      for (var i = 0; i < result.data.length; i++) {
        var row = result.data[i];
        var src = row.ats_source || 'unknown';
        if (!totals[src]) totals[src] = { jobs: 0, withSalary: 0 };
        totals[src].jobs += row.job_count;
        totals[src].withSalary += row.with_salary;
      }
      return totals;
    }
  } catch(e) { reportError('stats', e); console.warn('[Stats] MV source totals failed:', e.message); }
  return null;
}

// Fetch weekly source breakdown from mv_source_breakdown (for timeline overlay)
async function fetchSourceBreakdownFromMV() {
  try {
    var cKey = 'mv:source-breakdown';
    var result = await cachedQuery(cKey, function() {
      return sb.from('mv_source_breakdown').select('ats_source,week,jobs_added,companies,refreshed_at').order('week', { ascending: false });
    }, { ttl: 600000 }); // 10 min
    return (result && result.data) || null;
  } catch(e) { reportError('stats', e); console.warn('[Stats] MV source breakdown failed:', e.message); }
  return null;
}

// A15 S5: Fetch landing stats from MV for stat cards (total_jobs, salary, remote, companies)
async function fetchLandingStatsFromMV() {
  try {
    var cKey = 'mv:landing-stats';
    var result = await cachedQuery(cKey, function() {
      return sb.from('mv_landing_stats').select('*').single();
    }, { ttl: 600000 }); // 10 min — matches MV refresh cycle
    return (result && result.data) || null;
  } catch(e) { reportError('stats', e); console.warn('[Stats] MV landing stats failed:', e.message); }
  return null;
}

// A15 S5: Render stat cards from materialized view data (no row aggregation needed)
function renderStatCardsFromMV(mv) {
  var fmt = function(n) { return n != null ? Number(n).toLocaleString() : '\u2014'; };
  setText('#sc-total', fmt(mv.total_jobs));
  // Salary % = jobs_with_salary / total_jobs (MV has count, not median)
  var salaryPct = mv.total_jobs > 0 ? Math.round((mv.jobs_with_salary / mv.total_jobs) * 100) : 0;
  setText('#sc-salary', salaryPct + '%');
  // Update label to reflect the metric change
  var salaryLabel = document.querySelector('#sc-salary');
  if (salaryLabel && salaryLabel.nextElementSibling) salaryLabel.nextElementSibling.textContent = 'With Salary';
  // Remote %
  var remotePct = mv.total_jobs > 0 ? Math.round((mv.remote_jobs / mv.total_jobs) * 100) : 0;
  setText('#sc-remote', remotePct + '%');
  setText('#sc-companies', fmt(mv.total_companies));
  // Senior % not available from MV — show dash
  setText('#sc-senior', '\u2014');
}

// A15 S5: Show MV freshness badge
function renderMVFreshnessNotice(refreshedAt) {
  var el = document.getElementById('stats-mv-freshness');
  if (!el) {
    // Create badge dynamically if not in HTML
    var container = document.getElementById('stats-filter-pills');
    if (!container) return;
    el = document.createElement('span');
    el.id = 'stats-mv-freshness';
    el.style.cssText = 'font-size:11px;color:var(--text-faint);font-family:var(--mono);margin-left:auto;padding:3px 8px;border:1px solid var(--border);border-radius:6px;white-space:nowrap;display:flex;align-items:center;gap:4px;';
    container.appendChild(el);
  }
  if (refreshedAt) {
    var minsAgo = Math.round((Date.now() - new Date(refreshedAt).getTime()) / 60000);
    var fresh = minsAgo <= 15;
    var ageStr = minsAgo < 60 ? minsAgo + 'min ago' : Math.round(minsAgo / 60) + 'h ' + (minsAgo % 60) + 'min ago';
    el.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:' + (fresh ? '#22c55e' : '#f59e0b') + ';display:inline-block"></span> Data ' + ageStr;
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}

function hideMVFreshnessNotice() {
  var el = document.getElementById('stats-mv-freshness');
  if (el) el.style.display = 'none';
}

// Check MV freshness — returns { fresh: bool, age: string, refreshed_at: string }
async function checkMVStaleness() {
  try {
    var result = await sb.from('mv_landing_stats').select('refreshed_at').single();
    if (result.error && result.error.code !== 'PGRST116') reportError('stats:mv-staleness', result.error);
    if (result && result.data) {
      var refreshedAt = new Date(result.data.refreshed_at);
      var ageMs = Date.now() - refreshedAt.getTime();
      var ageMins = Math.round(ageMs / 60000);
      var ageStr = ageMins < 60 ? ageMins + 'min ago' : Math.round(ageMins / 60) + 'h ' + (ageMins % 60) + 'min ago';
      return { fresh: ageMins <= 15, ageMs: ageMs, ageStr: ageStr, refreshedAt: result.data.refreshed_at };
    }
  } catch(e) { reportError('stats', e); console.warn('[Stats] MV staleness check failed:', e.message); }
  return { fresh: false, ageStr: 'unknown', refreshedAt: null };
}

// ─── A15 S3: Source-Colored Stacked Timeline from MV ───
function renderSourceTimelineFromMV(mvData) {
  var chart = getOrCreateChart('#chart-timeline'); if (!chart) return;
  var sourceColors = { 'greenhouse':'#22c55e', 'lever':'#6366f1', 'ashby':'#f59e0b', 'workable':'#ec4899', 'recruitee':'#06b6d4', 'usajobs':'#3b82f6' };

  // Build { week: { source: count } } map
  var weekMap = {}, sources = {};
  for (var i = 0; i < mvData.length; i++) {
    var r = mvData[i];
    var wk = r.week; var src = r.ats_source || 'unknown';
    if (!weekMap[wk]) weekMap[wk] = {};
    weekMap[wk][src] = (weekMap[wk][src] || 0) + r.jobs_added;
    sources[src] = true;
  }

  // Sort weeks, take last 13
  var weeks = Object.keys(weekMap).sort();
  if (weeks.length > 13) weeks = weeks.slice(weeks.length - 13);
  var sourceList = Object.keys(sources).sort();

  // Build stacked bar series
  var series = sourceList.map(function(src) {
    return {
      name: src.charAt(0).toUpperCase() + src.slice(1),
      type: 'bar', stack: 'total', barMaxWidth: 28,
      data: weeks.map(function(wk) { return weekMap[wk][src] || 0; }),
      itemStyle: { color: sourceColors[src] || '#475569', borderRadius: sourceList.indexOf(src) === sourceList.length - 1 ? [3,3,0,0] : [0,0,0,0] },
      emphasis: { itemStyle: { shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.15)' } }
    };
  });

  // WTD detection: last week might be current incomplete week
  var now = new Date();
  var todayDay = now.getUTCDay();
  var thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (todayDay === 0 ? 6 : todayDay - 1)));
  var wtdKey = thisMonday.toISOString().slice(0, 10);
  var hasWtd = todayDay !== 0 && weeks.indexOf(wtdKey) !== -1;

  chart.setOption({
    tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: function(params) {
        var d = new Date(params[0].name);
        var isWtd = hasWtd && params[0].name === wtdKey;
        var header = '<b>' + (isWtd ? 'WTD: ' : 'Week of ') + d.toLocaleDateString('en-US', {month:'short',day:'numeric'}) + '</b>' + (isWtd ? ' (so far)' : '');
        var total = 0;
        var lines = params.filter(function(p){return p.value > 0;}).map(function(p) {
          total += p.value;
          return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + p.color + ';margin-right:4px;"></span>' + p.seriesName + ': ' + p.value.toLocaleString();
        });
        return header + '<br/>' + lines.join('<br/>') + '<br/><b>Total: ' + total.toLocaleString() + '</b>';
      }
    }, ttip()),
    legend: { top: 0, textStyle: { fontFamily: _T.sans, fontSize: 11, color: _T.dim } },
    grid: { top: 35, right: 20, bottom: 30, left: 50 },
    xAxis: { type: 'category', data: weeks,
      axisLabel: { color: _T.dim, fontFamily: _T.mono, fontSize: 10, interval: 0,
        formatter: function(v) { var d = new Date(v); var label = d.toLocaleDateString('en-US', {month:'short',day:'numeric'}); return hasWtd && v === wtdKey ? label + '\n(WTD)' : label; } },
      axisLine: STATS_THEME.axisLine },
    yAxis: { type: 'value', axisLabel: STATS_THEME.axisLabel, splitLine: STATS_THEME.splitLine, minInterval: 1 },
    series: series,
    animation: true, animationDuration: 600
  }, true);
}

// ─── A15 S3: Source Breakdown Donut from MV Totals ───
function renderSourceBreakdownFromMV(mvTotals) {
  var chart = getOrCreateChart('#chart-source'); if (!chart) return;
  var sourceColors = { 'greenhouse':'#22c55e', 'lever':'#6366f1', 'ashby':'#f59e0b', 'workable':'#ec4899', 'recruitee':'#06b6d4', 'usajobs':'#3b82f6', 'unknown':'#475569' };

  var entries = Object.entries(mvTotals).sort(function(a,b) { return b[1].jobs - a[1].jobs; });
  if (entries.length === 0) { emptyChart(chart, 'No source data'); return; }

  var total = entries.reduce(function(a, e) { return a + e[1].jobs; }, 0);
  chart.setOption({
    graphic: [],
    tooltip: Object.assign({ trigger: 'item',
      formatter: function(p) {
        var src = p.name.toLowerCase();
        var entry = mvTotals[src];
        var salaryPct = entry && entry.withSalary > 0 ? Math.round((entry.withSalary / entry.jobs) * 100) : 0;
        return '<b>' + p.name + '</b><br/>' + p.value.toLocaleString() + ' jobs (' + ((p.value / total) * 100).toFixed(1) + '%)' +
          (salaryPct > 0 ? '<br/>' + salaryPct + '% with salary data' : '');
      }
    }, ttip()),
    series: [{
      type: 'pie', radius: ['45%', '72%'], center: ['50%', '55%'],
      data: entries.map(function(e, i) {
        var name = e[0].charAt(0).toUpperCase() + e[0].slice(1);
        return { name: name, value: e[1].jobs, itemStyle: { color: sourceColors[e[0]] || STATS_COLORS[i % STATS_COLORS.length] } };
      }),
      label: { fontSize: 11, fontFamily: _T.sans, color: _T.dim,
        formatter: function(p) { return p.name + ' ' + ((p.value / total) * 100).toFixed(0) + '%'; } },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' } },
      animationType: 'scale', animationDuration: 600
    }]
  }, true);
}

// ─── Resize / Refresh ───
function statsResizeAll() { Object.values(statsCharts).forEach(function(c){ if(c&&!c.isDisposed()) c.resize(); }); }
function refreshStatsCharts() {
  renderFilterPills();
  var stale = Object.values(statsCache).some(function(c){return Date.now()-c.timestamp>=STATS_CACHE_TTL;});
  if (stale || Object.keys(statsCache).length === 0) fetchAndRenderStats();
  else statsResizeAll();
}
