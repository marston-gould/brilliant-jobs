# Task: Stats Page Redesign — Pod 2 Handoff

**From:** Pod 1 (Growth) — CPO
**To:** Pod 2 (Engineering) — CTO
**Date:** February 20, 2026
**Priority:** P1 — Blocks launch quality bar
**Effort:** ~9 hours (2 dev days)
**Spec:** `docs/STATS_PAGE_REDESIGN_BRIEF.md`
**Depends on:** Nothing (can run in parallel with cohort work)

---

## What Exists Today

**Files to modify:**
- `js/stats.js` (547 lines) — all chart rendering logic
- `src/input.css` (L354–L458) — Stats CSS section (already uses design system)
- `dashboard.html` — Stats page HTML (already has correct structure)

**What's working (don't touch):**
- `fetchAndRenderStats()` — data fetch + aggregation pipeline
- `aggregateStats()` — client-side bucketing (salary, level, location, company)
- `getSelectedFilterConfigs()` — filter selection logic
- Filter pill multi-select + dedup logic
- ECharts 5 dependency (already loaded)
- PostHog event instrumentation

**What's broken (fix these):**
- Inline `style` assignments bypass the CSS design system
- Salary chart is wrong type (was donut, now bar — but needs bar styling cleanup)
- Seniority chart needs suppression logic for Unclassified > 80%
- Work Arrangement donut needs suppression for Unspecified > 50%
- "All" pill still references hamburger icon (☰)
- No Aggregate/Compare dropdown
- ATS Source chart still renders (should be removed from user-facing)
- 23 hardcoded hex colors in JS instead of using CSS variables
- Top Companies shows 15 (should be 10)

---

## CSS Design System Reference

The CSS is already correct in `src/input.css`. The problem is that `stats.js` bypasses it with inline styles. Here are the classes that already exist and should be used:

```
.stats-filter-bar     — filter bar container
.stats-fpill          — filter pill (uses --bg-card, --border, --text-dim)
.stats-fpill.active   — active pill (uses --pill-color via color-mix)
.stats-fpill-dot      — colored dot inside pill
.stats-mode-dropdown  — aggregate/compare dropdown container
.stats-chart-sub      — subtitle text under chart title (mono, faint)
.stats-grid           — 2-col grid for charts
.stats-grid .full     — full-width chart card
.stats-chart-card     — chart container (uses --bg-card, --border)
.stats-chart-title    — chart heading (uppercase, 12px, dim)
.stats-grid .ec       — chart canvas (300px height)
.stats-grid .ec.tall  — tall chart canvas (380px height)
.stat-grid            — stat card grid (auto-fit, minmax 160px)
.stat-card            — stat card (uses --bg-card, --border)
.stat-val             — stat value (clamp 20-28px, --mono, --text)
.stat-label           — stat label (11px, --text-faint, uppercase)
```

**CSS variables to use (not hex codes):**
```
--bg-card: #fff           --border: hsl(228, 16%, 91%)
--bg-main: hsl(228,22%,97%)  --bg-hover: hsl(228, 16%, 95%)
--text: hsl(228, 25%, 15%)   --text-dim: hsl(228, 11%, 41%)
--text-faint: hsl(228,11%,58%)  --accent: hsl(237, 73%, 58%)
--mono: 'JetBrains Mono'     --sans: 'Outfit'
```

---

## Build Order (9 steps)

### Step 1: Remove all inline styles (1.5h)

Search `stats.js` for every `style.cssText`, `style.background`, `style.display`, `style.opacity` assignment. Replace with CSS class toggles.

**Current pattern (remove):**
```javascript
card.style.cssText = 'background:#fff;border:1px solid...';
```

**Replacement pattern:**
```javascript
card.classList.add('stats-chart-card');
```

The only acceptable inline styles are:
- `el.style.display = 'none'` / `''` for show/hide toggling (already used correctly in a few places)
- Chart container width/height (already in CSS via `.ec` class)

**Verify:** Page renders identically. Cards have white backgrounds, proper borders, correct fonts. No visual regression.

### Step 2: Update STATS_THEME for light context (0.25h)

The charts need a light-compatible theme. Add/update at top of stats.js:

```javascript
var STATS_THEME = {
  tooltip: {
    backgroundColor: 'rgba(15,23,42,0.95)',
    borderColor: 'hsl(228, 16%, 85%)',
    textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 }
  },
  axisLabel: { color: 'hsl(228, 11%, 41%)', fontFamily: 'JetBrains Mono', fontSize: 10 },
  axisLine: { lineStyle: { color: 'hsl(228, 16%, 91%)' } },
  splitLine: { lineStyle: { color: 'hsl(228, 16%, 93%)' } }
};
```

Apply these defaults in `getOrCreateChart()` or at each `chart.setOption()` call. Dark tooltips over light cards is the standard pattern (matches public data pages).

**Verify:** Axis labels are readable dark text on white. Grid lines are subtle. Tooltips are dark with white text.

### Step 3: Fix filter pills + remove hamburger (1h)

**In `renderFilterPills()`:**

1. Remove ☰ (hamburger) from the "All" pill. Just text: "All"
2. Ensure pills use the `.stats-fpill` CSS class (not inline styles)
3. Ensure the colored dot uses `.stats-fpill-dot` with `style.background = color` (this is the one acceptable inline style — it's a dynamic per-filter color)
4. Ensure active state uses `.stats-fpill.active` class with `--pill-color` CSS variable set inline

**Add Aggregate/Compare dropdown** (already in dashboard.html):
```html
<select disabled title="Compare mode coming soon — compare two filters side by side">
  <option selected>Aggregate</option>
  <option disabled>Compare (coming soon)</option>
</select>
```
This already exists in the HTML. Just verify it renders and the `disabled` + `cursor: not-allowed` styling from `.stats-mode-dropdown select` applies.

**Verify:** Pills match Jobs Feed styling. No hamburger icon. Dropdown visible but grayed out.

### Step 4: Salary Distribution — ensure bar chart (1h)

`renderSalaryDist()` already renders a bar chart (was converted from donut). Verify:

1. Type is `'bar'` (already is)
2. X-axis shows salary buckets ($50K–$75K, $75K–$100K, etc.)
3. Bar colors use gradient fill from the palette (already does)
4. **Add subtitle:** In the `.stats-chart-sub` element (`#chart-salary-sub`), show coverage:
   ```javascript
   const withSalary = rows.filter(r => r.salary_min || r.salary_max).length;
   const sub = document.getElementById('chart-salary-sub');
   if (sub) sub.textContent = withSalary + ' of ' + rows.length + ' jobs have salary data';
   ```

**Verify:** Bar chart renders. Subtitle shows coverage. No donut remnants.

### Step 5: Seniority Breakdown — horizontal bars + suppression (1.5h)

`renderSeniorityBars()` already renders horizontal bars. Add suppression logic:

```javascript
function renderSeniorityBars(stats) {
  const hierarchy = getHierarchy(); // uses levelHierarchy from tuning.js
  const data = buildSeniorityData(stats, hierarchy);
  
  // Suppression: if Unclassified > 80%, don't render
  const total = data.reduce((s, d) => s + d.value, 0);
  const unclassified = data.find(d => d.name === 'Unclassified');
  if (unclassified && total > 0 && (unclassified.value / total) > 0.8) {
    emptyChart(chart, 'Most jobs aren\'t classified by level yet.\nConfigure levels in Tuning to see this chart.');
    return;
  }
  
  // Filter out Unclassified from display (still counted in total)
  const filtered = data.filter(d => d.name !== 'Unclassified');
  // ... render horizontal bars with filtered data
}
```

**Seniority order:** Uses `levelHierarchy` from tuning.js (which now has Lead above Manager per today's fix). The chart should display most-senior at top, least-senior at bottom (reverse array for horizontal bars).

**Verify:** Chart shows horizontal bars in seniority order. When Unclassified > 80%, shows message with link-text to Tuning. When Unclassified < 80%, Unclassified segment is hidden.

### Step 6: Work Arrangement donut — suppress Unspecified (0.5h)

`renderWorkType()` already renders a donut (correct chart type for categorical composition). Add:

```javascript
// If Unspecified > 50%, suppress that segment
const unspecified = segments.find(s => s.name === 'Unspecified');
if (unspecified && total > 0 && (unspecified.value / total) > 0.5) {
  segments = segments.filter(s => s.name !== 'Unspecified');
  // Recalculate percentages based on remaining segments
}
```

**Fixed colors (replace hardcoded):**
- Remote: `#22c55e`
- On-site: `#6366f1`
- Hybrid: `#f59e0b`
- Unspecified: `#334155`

**Verify:** When > 50% Unspecified, donut shows only Remote/On-site/Hybrid with note "Location type not specified for many jobs." When < 50%, Unspecified shows as a segment.

### Step 7: Remove ATS Source chart (0.25h)

The ATS Source breakdown (which platform the job was scraped from) has zero action value for job seekers. Remove the chart render call from the render pipeline.

**Do NOT remove:**
- The data collection (still needed for internal analytics via PostHog)
- The HTML container (leave it in place but hidden, in case we want to re-enable for admin view)

```javascript
// In fetchAndRenderStats() or wherever charts are dispatched:
// renderATSSource(stats);  // REMOVED — no action value for users
```

**Verify:** ATS Source chart doesn't render. No empty card visible. Grid reflows correctly.

### Step 8: Top Companies — reduce to 10, truncate names (0.25h)

In `renderTopCompanies()`:

1. Change `.slice(0, 15)` to `.slice(0, 10)`
2. Truncate company names: `name.slice(0, 20) + (name.length > 20 ? '…' : '')`

**Verify:** Shows 10 companies max. Long names truncated with ellipsis.

### Step 9: Threshold guards for data-gated charts (2.5h)

Two charts should only render when data quality is sufficient:

**C6 — Salary by Level** (`renderSalaryByLevel()`):
```javascript
// Only render when:
// 1. Filter returns 100+ total jobs
// 2. At least 3 levels have 5+ salary data points each
const levelsWithData = levelData.filter(l => l.count >= 5);
if (stats.total < 100 || levelsWithData.length < 3) {
  // Hide the card entirely — don't render, don't show empty state
  const cardWrap = document.getElementById('chart-salary-level')?.closest('.stats-chart-card');
  if (cardWrap) cardWrap.style.display = 'none';
  return;
}
// Show the card
const cardWrap = document.getElementById('chart-salary-level')?.closest('.stats-chart-card');
if (cardWrap) cardWrap.style.display = '';
```

**C8 — Industry Breakdown** (`renderIndustryBars()`):
```javascript
// Only render when industry column is non-null for > 60% of jobs
const withIndustry = rows.filter(r => r.industry).length;
if (rows.length === 0 || (withIndustry / rows.length) < 0.6) {
  const cardWrap = document.getElementById('chart-industry')?.closest('.stats-chart-card');
  if (cardWrap) cardWrap.style.display = 'none';
  return;
}
const cardWrap = document.getElementById('chart-industry')?.closest('.stats-chart-card');
if (cardWrap) cardWrap.style.display = '';
```

When charts are hidden, the grid reflows naturally (CSS grid auto-fit handles this).

**Verify:** With sparse data, Salary by Level and Industry cards are absent (not empty, not broken — just not there). With sufficient data, they appear.

---

## Acceptance Criteria Checklist

- [ ] No inline `style.cssText` assignments in stats.js
- [ ] All chart cards use `.stats-chart-card` class (or equivalent using `var(--bg-card)`, `var(--border)`)
- [ ] Filter pills styled via CSS classes, not inline JS styles
- [ ] "All" pill has no hamburger icon (☰)
- [ ] Aggregate/Compare dropdown visible, Compare grayed out with tooltip
- [ ] Salary chart (C2) is a vertical bar chart with coverage subtitle
- [ ] Seniority chart (C3) is horizontal bars, suppressed when Unclassified > 80% with message linking to Tuning
- [ ] Work Arrangement (C7) donut suppresses Unspecified segment when > 50%
- [ ] ATS Source chart removed from user-facing render pipeline
- [ ] Top Companies shows top 10 (not 15), names truncated at 20 chars
- [ ] Stat card values use JetBrains Mono, labels use Outfit
- [ ] STATS_THEME applied: dark tooltips, light-compatible grid/axis
- [ ] C6 (Salary by Level) threshold: only renders when 100+ jobs AND 3+ levels with 5+ salary points
- [ ] C8 (Industry) threshold: only renders when `industry` non-null > 60%
- [ ] Responsive: single column at ≤ 900px, chart heights reduce (already in CSS)
- [ ] No visual regression on stat cards, filter selection, or data accuracy

---

## What NOT to Change

| Component | Reason |
|-----------|--------|
| Data fetch logic (`fetchFilterData`, `buildFilterQuery`) | Working correctly |
| Aggregation functions (`aggregateStats`, salary bucketing, level counting) | Working correctly |
| Filter pill selection logic (multi-select, union, dedup) | Working correctly |
| PostHog event tracking | Instrumented correctly |
| ECharts library version | Already loaded |
| dashboard.html structure | Already has correct HTML |
| `src/input.css` Stats section | Already uses design system correctly |

The data layer is solid. This task is purely visual: chart types, styling source, suppression logic, and threshold guards.

---

*Pod 1 has provided the full spec with all design decisions made. Pod 2 executes. No design judgment calls needed — every chart type, color, threshold, and suppression rule is specified above.*
