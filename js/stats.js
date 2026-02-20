// === js/stats.js ===
// Stats page — filter-scoped analytics with ECharts
// Dependencies: sb (Supabase client), savedFilters, filterColors, levelHierarchy, getJobLevel, buildFilterQuery, getLocationMatchIds

// ─── State ───
let statsInitialized = false;
let statsCharts = {};          // { chartId: echartsInstance }
let statsCache = {};           // { filterId: { rows, timestamp } }
const STATS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const STATS_ROW_CAP = 5000;
const STATS_DEDUP_CAP = 10000;
let statsSelectedFilters = JSON.parse(localStorage.getItem('bj_stats_filters') || '["__all__"]');
let _statsDebounce = null;

// ─── ECharts Theme ───
const STATS_THEME = {
  tooltip: {
    backgroundColor: 'rgba(12,14,20,0.96)',
    borderColor: '#1e2230',
    borderWidth: 1,
    textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 },
  },
  axisLabel: { color: '#64748b', fontFamily: 'JetBrains Mono', fontSize: 10 },
  axisLine: { lineStyle: { color: '#2a2d35' } },
  splitLine: { lineStyle: { color: '#1a1d25' } },
};

// Stats color palette (muted, works on dark bg)
const STATS_COLORS = ['#6366f1','#22c55e','#f59e0b','#ec4899','#06b6d4','#8b5cf6','#ef4444','#f97316','#14b8a6','#a855f7'];

// ─── Select columns for stats queries (minimize payload) ───
const STATS_COLUMNS = 'greenhouse_id,ats_source,title,company_name,salary_min,salary_max,salary_currency,location,loc_type,first_seen_at';

// ─── Initialization ───
function initStatsPage() {
  // Only init when the stats page is actually visible
  const page = document.getElementById('page-stats');
  if (!page || !page.classList.contains('active')) return;

  if (statsInitialized) {
    refreshStatsCharts();
    return;
  }
  statsInitialized = true;
  renderFilterPills();
  fetchAndRenderStats();
  window.addEventListener('resize', statsResizeAll);
}

// ─── Filter Pill Bar ───
function renderFilterPills() {
  const container = $('#stats-filter-pills');
  if (!container) return;
  container.innerHTML = '';

  // "All Filters" pill
  const allPill = document.createElement('button');
  allPill.className = 'stats-fpill' + (statsSelectedFilters.includes('__all__') ? ' active' : '');
  allPill.textContent = 'All Filters';
  allPill.style.setProperty('--pill-color', 'var(--accent)');
  allPill.addEventListener('click', () => {
    statsSelectedFilters = ['__all__'];
    persistFilterSelection();
    renderFilterPills();
    debouncedFetchAndRender();
  });
  container.appendChild(allPill);

  // Individual filter pills
  savedFilters.forEach((sf, idx) => {
    const pill = document.createElement('button');
    const color = filterColors[idx % filterColors.length];
    const isActive = statsSelectedFilters.includes(String(idx));
    pill.className = 'stats-fpill' + (isActive ? ' active' : '');
    pill.textContent = sf.name || `Filter ${idx + 1}`;
    pill.style.setProperty('--pill-color', color);
    if (isActive) {
      pill.style.borderColor = color;
      pill.style.background = `color-mix(in srgb, ${color} 15%, transparent)`;
    }
    pill.addEventListener('click', () => {
      const id = String(idx);
      // Remove __all__ if selecting individual
      statsSelectedFilters = statsSelectedFilters.filter(f => f !== '__all__');
      const pos = statsSelectedFilters.indexOf(id);
      if (pos > -1) {
        statsSelectedFilters.splice(pos, 1);
      } else {
        statsSelectedFilters.push(id);
      }
      // If nothing selected, revert to all
      if (statsSelectedFilters.length === 0) statsSelectedFilters = ['__all__'];
      persistFilterSelection();
      renderFilterPills();
      debouncedFetchAndRender();
    });
    container.appendChild(pill);
  });

  // Compare toggle (disabled for launch)
  const toggle = $('#stats-compare-sw');
  if (toggle) {
    toggle.style.opacity = '0.4';
    toggle.style.pointerEvents = 'none';
    toggle.title = 'Coming soon';
  }
}

function persistFilterSelection() {
  localStorage.setItem('bj_stats_filters', JSON.stringify(statsSelectedFilters));
}

// ─── Data Fetching ───
function debouncedFetchAndRender() {
  clearTimeout(_statsDebounce);
  _statsDebounce = setTimeout(fetchAndRenderStats, 300);
}

async function fetchAndRenderStats() {
  showStatsLoading(true);

  try {
    const filtersToFetch = getSelectedFilterConfigs();
    if (filtersToFetch.length === 0) {
      showEmptyState('no-filters');
      return;
    }

    const allRows = [];
    let anyCapped = false;
    let cappedFilterName = '';

    for (const { sf, idx } of filtersToFetch) {
      const cacheKey = JSON.stringify(sf) + '_' + idx;
      const cached = statsCache[cacheKey];
      if (cached && Date.now() - cached.timestamp < STATS_CACHE_TTL) {
        allRows.push(...cached.rows);
        if (cached.capped) { anyCapped = true; cappedFilterName = sf.name || `Filter ${idx + 1}`; }
        continue;
      }

      const rows = await fetchFilterData(sf);
      const capped = rows.length >= STATS_ROW_CAP;
      statsCache[cacheKey] = { rows, timestamp: Date.now(), capped };
      allRows.push(...rows);
      if (capped) { anyCapped = true; cappedFilterName = sf.name || `Filter ${idx + 1}`; }
    }

    // Deduplicate by composite key
    const seen = new Set();
    const deduped = [];
    for (const row of allRows) {
      const key = `${row.greenhouse_id}:${row.ats_source}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(row);
        if (deduped.length >= STATS_DEDUP_CAP) break;
      }
    }

    if (deduped.length === 0) {
      showEmptyState('no-results');
      return;
    }

    // Aggregate and render
    const stats = aggregateStats(deduped);
    showStatsLoading(false);
    renderStatCards(stats);
    renderTimeline(stats, deduped);
    renderSalaryDist(stats, deduped);
    renderLevelFunnel(stats);
    renderTopCompanies(stats);
    renderSourceBreakdown(stats);

    // Show cap notice
    const notice = $('#stats-cap-notice');
    if (notice) {
      if (anyCapped) {
        notice.textContent = `Based on ${deduped.length.toLocaleString()} most recent matches`;
        notice.style.display = '';
      } else {
        notice.style.display = 'none';
      }
    }

  } catch (err) {
    console.error('[Stats] Fetch error:', err);
    showEmptyState('error');
  }
}

function getSelectedFilterConfigs() {
  if (savedFilters.length === 0) return [];
  if (statsSelectedFilters.includes('__all__')) {
    return savedFilters.map((sf, idx) => ({ sf, idx }));
  }
  return statsSelectedFilters
    .map(id => ({ sf: savedFilters[Number(id)], idx: Number(id) }))
    .filter(x => x.sf);
}

async function fetchFilterData(sf) {
  try {
    const tuning = JSON.parse(localStorage.getItem('bj_tuning') || '{}');
    const locationIds = await getLocationMatchIds(
      sf.wherePills || [],
      sf.whereNotPills || [],
      tuning,
      sf.includeRemote
    );

    let baseQuery = sb.from('ats_jobs').select(STATS_COLUMNS);
    let query = buildFilterQuery(sf, baseQuery, locationIds);
    query = query.order('first_seen_at', { ascending: false }).limit(STATS_ROW_CAP);

    const { data, error } = await query;
    if (error) { console.error('[Stats] Query error:', error); return []; }
    return data || [];
  } catch (err) {
    console.error('[Stats] fetchFilterData error:', err);
    return [];
  }
}

// ─── Aggregation ───
function aggregateStats(rows) {
  const stats = {
    total: rows.length,
    medianSalary: null,
    seniorPct: 0,
    remotePct: 0,
    companyCount: 0,
    levelCounts: {},
    salaryBuckets: {},
    topCompanies: [],
    sourceCounts: {},
    timelineBuckets: {},
  };

  // Companies
  const companies = new Set();
  rows.forEach(r => { if (r.company_name) companies.add(r.company_name); });
  stats.companyCount = companies.size;

  // Seniority
  const hierarchy = (levelHierarchy && levelHierarchy.length > 0) ? levelHierarchy : null;
  const seniorLabels = new Set(['senior', 'staff', 'lead', 'principal', 'manager', 'director', 'vp', 'vice president', 'c-suite', 'head', 'chief']);
  let seniorCount = 0;
  rows.forEach(r => {
    const lvl = getJobLevel(r.title, hierarchy);
    const label = lvl ? lvl.label : 'Other';
    stats.levelCounts[label] = (stats.levelCounts[label] || 0) + 1;
    if (lvl && seniorLabels.has(lvl.label.toLowerCase())) seniorCount++;
  });
  stats.seniorPct = rows.length > 0 ? Math.round((seniorCount / rows.length) * 100) : 0;

  // Remote
  let remoteCount = 0;
  rows.forEach(r => {
    if (r.loc_type === 'remote' || (r.location || '').toLowerCase().startsWith('remote')) remoteCount++;
  });
  stats.remotePct = rows.length > 0 ? Math.round((remoteCount / rows.length) * 100) : 0;

  // Salary
  const salaries = [];
  rows.forEach(r => {
    const sal = r.salary_min || r.salary_max;
    if (sal && sal > 0) salaries.push(sal);
  });
  salaries.sort((a, b) => a - b);
  if (salaries.length > 0) {
    const mid = Math.floor(salaries.length / 2);
    stats.medianSalary = salaries.length % 2 === 0
      ? Math.round((salaries[mid - 1] + salaries[mid]) / 2)
      : salaries[mid];
  }

  // Salary buckets ($25K)
  const bucketSize = 25000;
  rows.forEach(r => {
    const sal = r.salary_min || r.salary_max;
    if (!sal || sal <= 0) return;
    const bucket = Math.floor(sal / bucketSize) * bucketSize;
    const label = `$${bucket / 1000}K`;
    stats.salaryBuckets[label] = (stats.salaryBuckets[label] || 0) + 1;
  });

  // Top companies
  const coCounts = {};
  rows.forEach(r => { if (r.company_name) coCounts[r.company_name] = (coCounts[r.company_name] || 0) + 1; });
  stats.topCompanies = Object.entries(coCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  // ATS source breakdown
  rows.forEach(r => {
    const src = r.ats_source || 'Unknown';
    stats.sourceCounts[src] = (stats.sourceCounts[src] || 0) + 1;
  });

  // Timeline (weekly buckets)
  rows.forEach(r => {
    if (!r.first_seen_at) return;
    const d = new Date(r.first_seen_at);
    // Bucket to Monday of that week
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    const key = monday.toISOString().slice(0, 10);
    stats.timelineBuckets[key] = (stats.timelineBuckets[key] || 0) + 1;
  });

  return stats;
}

// ─── Stat Cards ───
function renderStatCards(stats) {
  const fmt = n => n != null ? n.toLocaleString() : '—';
  const fmtCurrency = n => {
    if (n == null) return 'N/A';
    if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
    return '$' + fmt(n);
  };

  setText('#sc-total', fmt(stats.total));
  setText('#sc-salary', fmtCurrency(stats.medianSalary));
  setText('#sc-senior', stats.seniorPct + '%');
  setText('#sc-remote', stats.remotePct + '%');
  setText('#sc-companies', fmt(stats.companyCount));
}

function setText(sel, val) {
  const el = $(sel);
  if (el) el.textContent = val;
}

// ─── Charts ───

function getOrCreateChart(containerId) {
  // Use getElementById directly (containerId starts with #)
  const id = containerId.replace('#', '');
  const el = document.getElementById(id);
  if (!el) { console.warn('[Stats] Chart container not found:', id); return null; }
  // Ensure container has dimensions before init
  if (el.offsetWidth === 0 || el.offsetHeight === 0) {
    console.warn('[Stats] Chart container has zero dimensions:', id);
    return null;
  }
  if (statsCharts[containerId]) {
    // Dispose and recreate if container was resized
    return statsCharts[containerId];
  }
  const chart = echarts.init(el, null, { renderer: 'canvas' });
  statsCharts[containerId] = chart;
  return chart;
}

// C1: Job Count Over Time — area chart
function renderTimeline(stats, rows) {
  const chart = getOrCreateChart('#chart-timeline');
  if (!chart) return;

  const sorted = Object.entries(stats.timelineBuckets).sort((a, b) => a[0].localeCompare(b[0]));
  // Only show last 26 weeks
  const recent = sorted.slice(-26);

  chart.setOption({
    tooltip: {
      ...STATS_THEME.tooltip,
      trigger: 'axis',
      formatter: params => {
        const p = params[0];
        const date = new Date(p.name);
        const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `<b>Week of ${label}</b><br/>${p.value.toLocaleString()} new jobs`;
      },
    },
    grid: { top: 20, right: 20, bottom: 30, left: 50 },
    xAxis: {
      type: 'category',
      data: recent.map(([k]) => k),
      axisLabel: {
        ...STATS_THEME.axisLabel,
        formatter: v => {
          const d = new Date(v);
          return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        },
        interval: Math.max(0, Math.floor(recent.length / 6) - 1),
      },
      axisLine: STATS_THEME.axisLine,
    },
    yAxis: {
      type: 'value',
      axisLabel: STATS_THEME.axisLabel,
      splitLine: STATS_THEME.splitLine,
    },
    series: [{
      type: 'line',
      data: recent.map(([, v]) => v),
      smooth: true,
      symbol: 'none',
      lineStyle: { color: STATS_COLORS[0], width: 2 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(99,102,241,0.35)' },
          { offset: 1, color: 'rgba(99,102,241,0.02)' },
        ]),
      },
    }],
    animation: true,
    animationDuration: 600,
  });
}

// C2: Salary Distribution — vertical bars
function renderSalaryDist(stats, rows) {
  const chart = getOrCreateChart('#chart-salary');
  if (!chart) return;

  const entries = Object.entries(stats.salaryBuckets)
    .map(([label, count]) => {
      const num = parseInt(label.replace('$', '').replace('K', '')) * 1000;
      return { label, count, num };
    })
    .sort((a, b) => a.num - b.num);

  // Filter to reasonable range ($25K - $500K)
  const filtered = entries.filter(e => e.num >= 25000 && e.num <= 500000);

  const salaryJobCount = Object.values(stats.salaryBuckets).reduce((a, b) => a + b, 0);

  if (filtered.length === 0) {
    chart.setOption({
      graphic: {
        type: 'text',
        left: 'center', top: 'middle',
        style: { text: 'No salary data available for these filters', fill: '#64748b', fontSize: 13, fontFamily: 'Outfit' },
      },
      xAxis: { show: false }, yAxis: { show: false }, series: [],
    });
    return;
  }

  chart.setOption({
    graphic: [], // clear any previous empty state text
    tooltip: {
      ...STATS_THEME.tooltip,
      trigger: 'axis',
      formatter: params => {
        const p = params[0];
        return `<b>${p.name}–${parseInt(p.name.replace('$','').replace('K',''))+25}K</b><br/>${p.value.toLocaleString()} jobs`;
      },
    },
    grid: { top: 24, right: 16, bottom: 36, left: 50 },
    xAxis: {
      type: 'category',
      data: filtered.map(e => e.label),
      axisLabel: { ...STATS_THEME.axisLabel, rotate: filtered.length > 10 ? 45 : 0 },
      axisLine: STATS_THEME.axisLine,
    },
    yAxis: {
      type: 'value',
      axisLabel: STATS_THEME.axisLabel,
      splitLine: STATS_THEME.splitLine,
      name: `${salaryJobCount.toLocaleString()} jobs with salary`,
      nameTextStyle: { color: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono', padding: [0, 0, 0, 0] },
      nameLocation: 'end',
    },
    series: [{
      type: 'bar',
      data: filtered.map(e => e.count),
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#22c55e' },
          { offset: 1, color: 'rgba(34,197,94,0.3)' },
        ]),
        borderRadius: [3, 3, 0, 0],
      },
      barMaxWidth: 36,
    }],
    animation: true,
    animationDuration: 600,
  });
}

// C3: Seniority Funnel — inverted funnel
function renderLevelFunnel(stats) {
  const chart = getOrCreateChart('#chart-funnel');
  if (!chart) return;

  // Sort by count descending for funnel
  const entries = Object.entries(stats.levelCounts)
    .filter(([label]) => label !== 'Other')
    .sort((a, b) => b[1] - a[1]);

  // Add "Other" at the end if present
  if (stats.levelCounts['Other']) {
    entries.push(['Other', stats.levelCounts['Other']]);
  }

  chart.setOption({
    tooltip: {
      ...STATS_THEME.tooltip,
      trigger: 'item',
      formatter: p => `<b>${p.name}</b><br/>${p.value.toLocaleString()} jobs (${((p.value / stats.total) * 100).toFixed(1)}%)`,
    },
    series: [{
      type: 'funnel',
      left: '15%',
      right: '15%',
      top: 10,
      bottom: 10,
      sort: 'descending',
      gap: 2,
      label: {
        show: true,
        position: 'inside',
        color: '#f0f1f3',
        fontFamily: 'Outfit',
        fontSize: 12,
        formatter: p => `${p.name} (${p.value.toLocaleString()})`,
      },
      itemStyle: { borderWidth: 0 },
      data: entries.map(([label, count], i) => ({
        name: label,
        value: count,
        itemStyle: { color: STATS_COLORS[i % STATS_COLORS.length] },
      })),
    }],
    animation: true,
    animationDuration: 600,
  });
}

// C5: Top Companies — horizontal bars
function renderTopCompanies(stats) {
  const chart = getOrCreateChart('#chart-companies');
  if (!chart) return;

  const top = stats.topCompanies.slice(0, 15);
  // Reverse so highest is at top
  const reversed = [...top].reverse();

  chart.setOption({
    tooltip: {
      ...STATS_THEME.tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: params => `<b>${params[0].name}</b><br/>${params[0].value.toLocaleString()} open roles`,
    },
    grid: { top: 10, right: 30, bottom: 10, left: 140 },
    xAxis: {
      type: 'value',
      axisLabel: STATS_THEME.axisLabel,
      splitLine: STATS_THEME.splitLine,
    },
    yAxis: {
      type: 'category',
      data: reversed.map(([name]) => name),
      axisLabel: {
        ...STATS_THEME.axisLabel,
        width: 130,
        overflow: 'truncate',
        fontFamily: 'Outfit',
        fontSize: 11,
        color: '#94a3b8',
      },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      type: 'bar',
      data: reversed.map(([, count]) => count),
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: 'rgba(99,102,241,0.3)' },
          { offset: 1, color: '#6366f1' },
        ]),
        borderRadius: [0, 3, 3, 0],
      },
      barMaxWidth: 20,
      label: {
        show: true,
        position: 'right',
        color: '#94a3b8',
        fontFamily: 'JetBrains Mono',
        fontSize: 10,
      },
    }],
    animation: true,
    animationDuration: 600,
  });
}

// C7: ATS Source Breakdown — donut
function renderSourceBreakdown(stats) {
  const chart = getOrCreateChart('#chart-source');
  if (!chart) return;

  const entries = Object.entries(stats.sourceCounts)
    .sort((a, b) => b[1] - a[1]);

  chart.setOption({
    tooltip: {
      ...STATS_THEME.tooltip,
      trigger: 'item',
      formatter: p => `<b>${p.name}</b><br/>${p.value.toLocaleString()} jobs (${p.percent.toFixed(1)}%)`,
    },
    legend: {
      orient: 'vertical',
      right: 10,
      top: 'center',
      textStyle: { color: '#94a3b8', fontFamily: 'Outfit', fontSize: 11 },
    },
    series: [{
      type: 'pie',
      radius: ['42%', '70%'],
      center: ['35%', '50%'],
      avoidLabelOverlap: true,
      label: { show: false },
      data: entries.map(([name, value], i) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
        itemStyle: { color: STATS_COLORS[i % STATS_COLORS.length] },
      })),
    }],
    animation: true,
    animationDuration: 600,
  });
}

// ─── Empty & Loading States ───
function showStatsLoading(loading) {
  const grid = $('#stats-charts-grid');
  const cards = $('#stats-cards');
  const emptyEl = $('#stats-empty');
  if (emptyEl) emptyEl.style.display = 'none';

  if (loading) {
    // Set cards to loading
    ['#sc-total', '#sc-salary', '#sc-senior', '#sc-remote', '#sc-companies'].forEach(sel => {
      const el = $(sel);
      if (el) el.textContent = '—';
    });
    if (grid) grid.style.opacity = '0.4';
  } else {
    if (grid) grid.style.opacity = '1';
  }
}

function showEmptyState(reason) {
  showStatsLoading(false);
  const messages = {
    'no-filters': 'Create saved filters on the Jobs Feed page to see your personalized stats',
    'no-results': 'No jobs match this filter. Try broadening your search criteria.',
    'error': 'Something went wrong loading stats. Try refreshing the page.',
  };

  // Clear stat cards
  ['#sc-total', '#sc-salary', '#sc-senior', '#sc-remote', '#sc-companies'].forEach(sel => setText(sel, '—'));

  // Show empty message
  const emptyEl = $('#stats-empty');
  if (emptyEl) {
    emptyEl.textContent = messages[reason] || messages['error'];
    emptyEl.style.display = '';
  }
}

// ─── Resize ───
function statsResizeAll() {
  Object.values(statsCharts).forEach(chart => {
    if (chart && !chart.isDisposed()) chart.resize();
  });
}

// ─── Refresh (called when navigating to stats tab) ───
function refreshStatsCharts() {
  // Re-render pills in case filters changed while on another page
  renderFilterPills();
  // If cache is stale, re-fetch; otherwise just resize charts
  const anyStale = Object.values(statsCache).some(c => Date.now() - c.timestamp >= STATS_CACHE_TTL);
  if (anyStale || Object.keys(statsCache).length === 0) {
    fetchAndRenderStats();
  } else {
    statsResizeAll();
  }
}
