# Dashboard Stats Page — Filter-Scoped Charts Spec

**Status:** Ready to build
**Page:** Stats (id `page-stats`)
**Chart Library:** Apache ECharts 5 (already used on public market data pages)
**Data Source:** Live Supabase queries via `buildFilterQuery()` reuse

---

## OVERVIEW

Replace the current Stats page (4 stat cards + top companies list) with a full analytics dashboard powered by ECharts. Charts are scoped to the user's saved filters — select one, multiple, or all filters to see salary distribution, seniority breakdown, hiring velocity, top companies, and more for exactly the jobs matching your search criteria.

Core principle: **same chart types as the public `/job-market-data` pages, but filtered to YOUR jobs.** The public pages show the whole market. The dashboard shows your slice.

---

## FILTER SELECTOR UI

### Layout
Horizontal pill bar at top of Stats page, above charts.

```
┌──────────────────────────────────────────────────────────┐
│ [All Filters ✓]  [① SEO Director]  [② Growth Lead]      │
│ [③ Marketing VP]  [④ Content Strategy]                   │
│                                                          │
│ Compare mode: [off / on toggle]                          │
└──────────────────────────────────────────────────────────┘
```

### Behavior
- Pills use the existing 10-color palette from saved filters (same colors as feed)
- Click a single filter → charts scope to that filter's matching jobs
- Click "All Filters" → union of all saved filter results
- Multi-select: click multiple filters → combined results (union)
- **Compare mode toggle:** when ON, selecting exactly 2 filters shows them side-by-side on charts (dual series, dual colors)
- Default on page load: "All Filters" selected
- Selection persists in `localStorage` key `bj_stats_filters`

### Data Source
- Reuse `buildFilterQuery(sf, baseQuery, locationIds)` from `job-feed.js`
- For each selected filter, run the same query chain used by `searchJobs()`
- Pre-fetch location IDs via `getLocationMatchIds()` (same as feed)
- Difference: Stats queries use aggregate selects, not `select('*')`

---

## DATA QUERIES

All queries run against `ats_jobs` using the existing filter infrastructure. Each chart needs a specific aggregation. Since Supabase JS client doesn't support `GROUP BY`, two approaches:

### Approach A: Fetch + Client-Side Aggregate (simpler, works now)
- Fetch matching jobs with `select('salary_min, salary_max, title, company_name, location, loc_type, loc_country, first_seen_at, ats_source, industry')` 
- Apply `buildFilterQuery()` to scope results
- Limit to 5,000 rows (sufficient for distribution charts)
- Aggregate in JS (bucket salaries, count by level, etc.)

### Approach B: Supabase RPC (faster, future)
- Create `get_filter_stats(filters jsonb)` PostgreSQL function
- Returns pre-aggregated salary buckets, level counts, company counts
- Better for large result sets, but requires Edge Function deployment

**Recommendation:** Start with Approach A. Move to RPCs when performance requires it.

### Query Shape
```javascript
async function fetchStatsData(selectedFilters) {
  const columns = 'title, company_name, salary_min, salary_max, salary_currency, location, loc_type, loc_country, first_seen_at, industry, ats_source';
  
  let allRows = [];
  for (const sf of selectedFilters) {
    const locIds = await getLocationMatchIds(sf.wherePills || [], sf.whereNotPills || [], tuning, sf.includeRemote);
    let q = sb.from('ats_jobs').select(columns);
    q = buildFilterQuery(sf, q, locIds);
    q = q.limit(5000);
    const { data } = await q;
    if (data) allRows.push(...data);
  }
  
  // Dedup by greenhouse_id if multiple filters overlap
  const seen = new Set();
  allRows = allRows.filter(r => {
    if (seen.has(r.greenhouse_id)) return false;
    seen.add(r.greenhouse_id);
    return true;
  });
  
  return allRows;
}
```

### Client-Side Aggregation Functions
```javascript
function aggregateStats(rows) {
  return {
    total: rows.length,
    withSalary: rows.filter(r => r.salary_min || r.salary_max).length,
    
    salaryBuckets: bucketSalaries(rows),
    levelCounts: countByLevel(rows),        // uses getJobLevel()
    remoteSplit: countByLocType(rows),       // remote/hybrid/on-site
    topCompanies: countByCompany(rows, 15),  // top 15
    industryCounts: countByIndustry(rows),
    sourceBreakdown: countBySource(rows),    // Greenhouse/Lever/etc.
    timelineCounts: countByWeek(rows),       // first_seen_at bucketed by week
    salaryByLevel: avgSalaryByLevel(rows),
    salaryByRemote: medianSalaryByLocType(rows),
  };
}
```

---

## CHARTS — 8 TOTAL

### Layout: 2-column grid with full-width options
Same card design as public pages (dark bg, badge, label, ECharts container).

### C1: Job Count Over Time (full-width)
- **Type:** Area chart
- **Data:** `first_seen_at` bucketed by week
- **X-axis:** Week labels
- **Y-axis:** New jobs discovered
- **Compare mode:** Two area series, one per filter color
- **Purpose:** "When are jobs in my search appearing?"

### C2: Salary Distribution (half-width)
- **Type:** Bar chart (vertical)
- **Data:** salary_min bucketed into $25K ranges ($25-50K, $50-75K, etc.)
- **Only jobs with salary data**
- **Compare mode:** Grouped bars, two colors
- **Purpose:** "What's the salary landscape for my search?"

### C3: Seniority Funnel (half-width)
- **Type:** Funnel (inverted, wide-at-top)
- **Data:** `getJobLevel(title, hierarchy)` counts
- **Uses user's custom level hierarchy from tuning** (not just DEFAULT_LEVELS)
- **Compare mode:** Side-by-side funnels
- **Purpose:** "What levels are hiring in my search?"

### C4: Remote / On-Site / Hybrid (half-width)
- **Type:** Donut
- **Data:** `loc_type` or fallback to location string parsing
- **Segments:** Remote, On-site, Hybrid, Unspecified
- **Compare mode:** Two donuts side by side
- **Purpose:** "How remote-friendly is my search?"

### C5: Top Companies (half-width)
- **Type:** Horizontal bars
- **Data:** Top 15 companies by job count
- **Compare mode:** Grouped horizontal bars
- **Purpose:** "Who's hiring the most in my search?"

### C6: Salary by Level (full-width)
- **Type:** Bar chart (vertical, rainbow gradient)
- **Data:** Average salary_min+salary_max midpoint per seniority level
- **Only levels with 3+ salary data points**
- **Mark line at overall average**
- **Compare mode:** Grouped bars per level
- **Purpose:** "What does each level pay in my search?"

### C7: ATS Source Breakdown (half-width)
- **Type:** Donut
- **Data:** Count by `ats_source` (Greenhouse, Lever, Ashby, Workable, Recruitee)
- **Purpose:** "Which ATS platforms have my jobs?"

### C8: Industry Breakdown (half-width)
- **Type:** Horizontal bars
- **Data:** Top 10 industries by count (from `industry` column where available)
- **Compare mode:** Grouped bars
- **Purpose:** "What industries overlap with my search?"

---

## COMPARE MODE

When compare mode is ON and exactly 2 filters are selected:

- Each chart renders two data series using the two filter colors
- Legend shows filter names (e.g., "① SEO Director" vs "② Growth Lead")
- Area/bar charts: overlapping or grouped
- Donut charts: render as two side-by-side donuts
- Funnel: two narrow funnels side by side

If 0 or 1 or 3+ filters selected with compare ON → show warning: "Select exactly 2 filters to compare"

### Compare Data Flow
```javascript
async function fetchCompareData(filterA, filterB) {
  const rowsA = await fetchFilteredRows(filterA);
  const rowsB = await fetchFilteredRows(filterB);
  return {
    a: { name: filterA.name, color: filterA._filterColor, stats: aggregateStats(rowsA) },
    b: { name: filterB.name, color: filterB._filterColor, stats: aggregateStats(rowsB) },
  };
}
```

---

## STAT CARDS ROW

Above the charts, a stat card row (similar to current but dynamic):

```
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│  1,247  │ │  $112K  │ │   68%   │ │  23%    │ │   142   │
│ Matching│ │ Median  │ │ Senior+ │ │ Remote  │ │Companies│
│  Jobs   │ │ Salary  │ │  Level  │ │  Jobs   │ │ Hiring  │
└─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘
```

Cards update on every filter change. Values are:
- **Matching Jobs** — total count from filtered query
- **Median Salary** — median of (salary_min + salary_max) / 2 where available
- **Senior+ Level** — % of jobs classified as Senior, Lead, Manager, Director, VP, C-Suite
- **Remote Jobs** — % with loc_type = remote or location containing "remote"
- **Companies Hiring** — distinct company_name count

---

## IMPLEMENTATION

### New JS Module: `js/stats.js`

```
js/stats.js
├── initStatsPage()           — set up filter pills, ECharts instances
├── onFilterSelectionChange() — re-fetch data, re-render all charts  
├── fetchStatsData(filters)   — query Supabase with buildFilterQuery
├── aggregateStats(rows)      — bucket/count/average computations
├── renderStatCards(stats)    — update the 5 stat card values
├── renderTimeline(stats)     — C1: area chart
├── renderSalaryDist(stats)   — C2: salary bars
├── renderLevelFunnel(stats)  — C3: seniority funnel
├── renderRemoteSplit(stats)  — C4: donut
├── renderTopCompanies(stats) — C5: horizontal bars  
├── renderSalaryByLevel(stats)— C6: salary ladder
├── renderSourceBreakdown(stats) — C7: ATS donut
├── renderIndustryBars(stats) — C8: industry bars
├── renderCompare(a, b)       — compare mode for all charts
└── resizeAll()               — window resize handler
```

### ECharts Loading
Add to `dashboard.html` head:
```html
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
```
Or self-host on Vercel edge (per earlier CDN optimization work).

### HTML Structure (replace current #page-stats content)
```html
<div class="page" id="page-stats">
  <div class="page-header">
    <h2>Stats</h2>
    <p>Your data filtered, visualized 
      <a class="page-how-link" href="#" onclick="...">How this works →</a>
    </p>
  </div>
  <div class="page-body">
    <!-- Filter selector -->
    <div id="stats-filter-bar" class="stats-filter-bar">
      <div id="stats-filter-pills"></div>
      <label class="stats-compare-toggle">
        <span>Compare</span>
        <div class="toggle-switch" id="stats-compare-sw">
          <input type="checkbox" id="stats-compare-cb">
          <span class="toggle-slider"></span>
        </div>
      </label>
    </div>
    
    <!-- Stat cards -->
    <div class="stat-grid" id="stats-cards">
      <div class="stat-card"><div class="stat-val" id="sc-total">—</div><div class="stat-label">Matching Jobs</div></div>
      <div class="stat-card"><div class="stat-val" id="sc-salary">—</div><div class="stat-label">Median Salary</div></div>
      <div class="stat-card"><div class="stat-val" id="sc-senior">—</div><div class="stat-label">Senior+ Level</div></div>
      <div class="stat-card"><div class="stat-val" id="sc-remote">—</div><div class="stat-label">Remote Jobs</div></div>
      <div class="stat-card"><div class="stat-val" id="sc-companies">—</div><div class="stat-label">Companies</div></div>
    </div>
    
    <!-- Charts grid -->
    <div class="stats-grid">
      <div class="card full"><div class="ch"><div><div class="cl">Discovery Timeline</div><div class="ct">New Jobs Per Week</div></div></div><div class="ec" id="sc-timeline"></div></div>
      
      <div class="card"><div class="ch"><div><div class="cl">Compensation</div><div class="ct">Salary Distribution</div></div></div><div class="ec" id="sc-salary-dist"></div></div>
      <div class="card"><div class="ch"><div><div class="cl">Seniority</div><div class="ct">Level Distribution</div></div></div><div class="ec" id="sc-funnel"></div></div>
      
      <div class="card"><div class="ch"><div><div class="cl">Work Arrangement</div><div class="ct">Remote vs On-Site</div></div></div><div class="ec" id="sc-remote"></div></div>
      <div class="card"><div class="ch"><div><div class="cl">Employers</div><div class="ct">Top Companies</div></div></div><div class="ec" id="sc-companies"></div></div>
      
      <div class="card full"><div class="ch"><div><div class="cl">Salary Ladder</div><div class="ct">Average Salary by Level</div></div></div><div class="ec tall" id="sc-salary-level"></div></div>
      
      <div class="card"><div class="ch"><div><div class="cl">Data Sources</div><div class="ct">ATS Platforms</div></div></div><div class="ec" id="sc-source"></div></div>
      <div class="card"><div class="ch"><div><div class="cl">Sectors</div><div class="ct">Top Industries</div></div></div><div class="ec" id="sc-industry"></div></div>
    </div>
  </div>
</div>
```

### CSS Additions (to `src/input.css`)
```css
/* Stats filter bar */
.stats-filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-block-end: 20px;
  flex-wrap: wrap;
}
#stats-filter-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.stats-fpill {
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 16px;
  cursor: pointer;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-dim);
  transition: all 0.15s;
  font-weight: 500;
}
.stats-fpill.active {
  border-color: var(--pill-color, var(--accent));
  background: color-mix(in srgb, var(--pill-color, var(--accent)) 15%, transparent);
  color: var(--text);
}
.stats-compare-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-dim);
  margin-inline-start: auto;
}

/* Stats chart grid */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.stats-grid .full { grid-column: 1 / -1; }
.stats-grid .ec { width: 100%; height: 300px; }
.stats-grid .ec.tall { height: 380px; }

@media (max-width: 900px) {
  .stats-grid { grid-template-columns: 1fr; }
  .stats-grid .full { grid-column: auto; }
  .stats-grid .ec { height: 240px !important; }
}

/* Loading state */
.stats-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--text-faint);
  font-size: 13px;
}
```

---

## AGGREGATION FUNCTIONS

### Level Classification
```javascript
function countByLevel(rows) {
  const hierarchy = levelHierarchy.length > 0 ? levelHierarchy : DEFAULT_LEVELS;
  const counts = {};
  rows.forEach(r => {
    const lvl = getJobLevel(r.title, hierarchy);
    const label = lvl ? lvl.label : 'Other';
    counts[label] = (counts[label] || 0) + 1;
  });
  return counts;
}
```

### Salary Bucketing
```javascript
function bucketSalaries(rows, bucketSize = 25000) {
  const buckets = {};
  rows.forEach(r => {
    const sal = r.salary_min || r.salary_max;
    if (!sal) return;
    const bucket = Math.floor(sal / bucketSize) * bucketSize;
    const label = `$${bucket/1000}K-${(bucket + bucketSize)/1000}K`;
    buckets[label] = (buckets[label] || 0) + 1;
  });
  return buckets;
}
```

### Remote/On-Site
```javascript
function countByLocType(rows) {
  const counts = { Remote: 0, 'On-site': 0, Hybrid: 0, Unspecified: 0 };
  rows.forEach(r => {
    if (r.loc_type === 'remote' || (r.location || '').toLowerCase().startsWith('remote')) {
      counts.Remote++;
    } else if (r.loc_type === 'hybrid' || (r.location || '').toLowerCase().includes('hybrid')) {
      counts.Hybrid++;
    } else if (r.location) {
      counts['On-site']++;
    } else {
      counts.Unspecified++;
    }
  });
  return counts;
}
```

---

## ECHART THEME

Match dashboard dark theme (same as public pages):
```javascript
const STATS_THEME = {
  tooltip: {
    backgroundColor: 'rgba(12,14,20,0.96)',
    borderColor: '#1e2230',
    textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 }
  },
  axisLabel: { color: '#4a5068', fontFamily: 'JetBrains Mono', fontSize: 10 },
  splitLine: { lineStyle: { color: '#151820' } },
};
```

---

## PERFORMANCE CONSIDERATIONS

1. **5,000 row limit per filter** — sufficient for distribution charts. If user has broad filters matching 50K+ jobs, cap at 5K and show note: "Showing analysis of 5,000 most recent jobs from [filter name]"
2. **Debounce filter changes** — 300ms debounce on pill clicks to avoid rapid re-queries
3. **Cache per filter** — store `{ filterId: { rows, timestamp } }` in memory. Invalidate after 10 minutes or on explicit refresh.
4. **Lazy chart init** — only initialize ECharts instances when Stats page is first viewed
5. **Loading skeleton** — show shimmer animation while data fetches

---

## EMPTY STATES

- **No saved filters:** "Create saved filters on the Jobs Feed page to see your personalized stats"
- **Filter matches 0 jobs:** "No jobs match this filter. Try broadening your search criteria."
- **No salary data in results:** Show salary charts grayed out with "No salary data available for these filters"

---

## BUILD ORDER

1. **ECharts dependency** — add to dashboard.html (CDN or self-hosted)
2. **HTML structure** — replace #page-stats content
3. **CSS** — filter bar, chart grid, responsive
4. **stats.js skeleton** — init, filter pills, page load
5. **Data layer** — fetchStatsData + aggregation functions
6. **Stat cards** — wire up 5 summary numbers
7. **Charts 1-4** — timeline, salary dist, funnel, remote donut
8. **Charts 5-8** — companies, salary by level, source, industry
9. **Compare mode** — dual-series rendering
10. **Polish** — loading states, empty states, caching, resize

---

## DEPENDENCIES

- **ECharts 5** (new dashboard dependency, already used on public pages)
- **buildFilterQuery()** from `job-feed.js` (reuse, no changes needed)
- **getJobLevel()** from `tuning.js` (reuse)
- **getLocationMatchIds()** from `job-feed.js` (reuse)
- **Saved filters from localStorage** (existing `bj_saved_filters`)
- **Level hierarchy from tuning** (existing `bj_tuning`)
