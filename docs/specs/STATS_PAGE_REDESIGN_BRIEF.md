# Stats Page Redesign Brief — UI/UX + CPO Directive

**From:** Pod 1 (Growth) — UI/UX Agent + CPO
**To:** Pod 2 (Engineering) — CTO
**Date:** February 19, 2026
**Priority:** P1 — Blocks launch quality bar
**Replaces:** Current stats.js implementation (v2.72)

---

## The Problem

The current Stats page has four critical issues:

### 1. Inline styles override the design system
The dashboard has a well-defined light theme: white card backgrounds (`--bg-card: #fff`), light grey page background (`--bg-main: hsl(228, 22%, 97%)`), dark navy sidebar, with text colors, borders, and accents all managed through CSS variables. The Stats page *should* look consistent with this, and the CSS classes exist (`stat-card`, `card`, etc.) — but `stats.js` overrides everything with hardcoded inline `style.cssText` assignments. This means the charts don't inherit the design system properly. Colors, fonts, and spacing are set in JS instead of CSS, making the page fragile and inconsistent. All inline styles should be removed and replaced with proper CSS classes using the existing variable system.

### 2. Chart type mismatches
- **Salary Range** is a donut chart. Salary data is continuous/ordinal — it should be a **bar chart** (distribution). Donuts are for categorical composition (like work type). You can't visually compare "$100K–$125K vs $125K–$150K" when they're pie wedges.
- **Seniority Mix** is a donut showing "Unclassified 100%" — useless when the hierarchy hasn't been configured or the filter is too narrow. Should degrade gracefully: either show a helpful message ("Configure your seniority levels in Tuning to see this chart") or suppress the chart entirely.
- **Top Companies** shows an empty state when data is sparse, which is fine, but the messaging could be more actionable.

### 3. Filter interaction is incomplete
- The "All Filters" pill uses a hamburger icon (☰) which is semantically wrong — that's a menu icon, not an aggregation icon.
- There's no visual distinction between aggregate mode and compare mode — multi-select always aggregates.
- The filter pills use inline-styled colors instead of the existing `filterColors` palette treatment used in Jobs Feed.

### 4. Information architecture is flat
Everything is the same visual weight. The stat cards, the timeline, the donuts — they all compete for attention equally. There's no hierarchy guiding the eye from "summary" to "distribution" to "detail."

---

## Design Principles for the Redesign

1. **Use the design system, not inline styles.** Every visual property should come from CSS variables (`--bg-card`, `--border`, `--text`, `--text-dim`, `--text-faint`) and existing CSS classes (`.card`, `.stat-card`). Remove all `style.cssText` assignments from `stats.js`. The dashboard's light theme (white cards, light grey background, dark navy sidebar) is correct — the charts just need to live within it properly.
2. **Chart type matches data type.** Bars for distributions (salary, seniority). Donuts for composition (work type, ATS source). Timeline stays as area/bar.
3. **Progressive disclosure.** Stat cards are the summary. Charts are the detail. Top → bottom = overview → deep dive.
4. **Filter pills match the existing system.** Use CSS classes consistent with the Jobs Feed filter pill styling — colored dots, proper active state using `color-mix` with the filter's assigned color.
5. **Graceful degradation.** If a chart can't render meaningfully (< 3 data points, 100% unclassified), suppress it with a helpful action message. Don't show broken charts.
6. **Same chart library, consistent theme.** ECharts 5 with a light-compatible STATS_THEME — dark tooltips are fine (they float above), but axis labels, grid lines, and backgrounds should work within the light card context.

---

## Revised Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Stats                                                        │
│ Your data filtered, visualized  [How this works →]           │
│                                                              │
│ ┌─── Filter Bar ───────────────────────────────────────────┐ │
│ │ [● All]  [● SEO Director]  [● Growth Lead]  ...         │ │
│ │                                        [Aggregate ▾]    │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │
│ │   29   │ │ $124K  │ │  34%   │ │  90%   │ │   24   │    │
│ │  Jobs  │ │ Median │ │Senior+ │ │ Remote │ │Companies│   │
│ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘    │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Job Count Over Time                        [full width]  │ │
│ │ ▁▂▁▁▃▂▃▃▅▅▇█████                                       │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌───────────────────────┐ ┌───────────────────────┐        │
│ │ Salary Distribution   │ │ Seniority Breakdown   │        │
│ │ ▁▃▆█▇▅▃▂ (bar chart) │ │ ▁▃▅█▆▃▁ (hor. bars)  │        │
│ └───────────────────────┘ └───────────────────────┘        │
│                                                              │
│ ┌───────────────────────┐ ┌───────────────────────┐        │
│ │ Top Companies         │ │ Work Arrangement      │        │
│ │ ████████ (hor. bars)  │ │ ◉ donut (Rem/On/Hyb) │        │
│ └───────────────────────┘ └───────────────────────┘        │
│                                                              │
│ ┌───────────────────────┐                                   │
│ │ ATS Sources           │ (half width, last row)            │
│ │ ◉ donut               │                                   │
│ └───────────────────────┘                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Chart Selection Rationale

**Team evaluation considered:** available data columns (`title, company_name, salary_min, salary_max, salary_currency, location, loc_type, loc_state, loc_city, first_seen_at, ats_source, industry`), what external public pages show, chart type suitability for each data shape, and the core question: **does this chart help a job seeker make a decision?**

**External pages show (for reference, not to copy):**
- `hiring-trends.html`: Cumulative Growth, Weekly Velocity, Top Employers, Listing Duration
- `salary-data.html`: Department Compensation, Salary Ladder by Level
- `career-level-data.html`: Level Distribution, Salary Ladder, Work Arrangement, Remote Premium
- `jobs-by-industry.html`: Job Volume by Industry, Compensation by Industry, Functional Areas

**The internal Stats page is different.** External pages answer "what does the whole market look like?" Internal Stats answers "what does MY search look like, and what should I do about it?" Every chart should either confirm a strategy or prompt an action.

---

## Filter Bar

**Current problem:** Hamburger icon on "All Filters," inline-styled pill colors, no aggregate/compare toggle.

**Fix:**

```
Visual:
- Pills use CSS classes with design system variables (not inline styles)
- "All" pill: just the word "All" — no hamburger icon
- Active pills: filter's assigned color as border + faded background 
  via color-mix(in srgb, var(--pill-color) 12%, white)
- Colored dot indicator on each filter pill (same as Jobs Feed)

Interaction:
- Click a single pill → charts scope to that filter only
- Click multiple pills → union of results (aggregate mode, default)
- "All" is a convenience shortcut — selects all filters in aggregate mode
- Dropdown at right: "Aggregate" (default) / "Compare"
  - Compare grayed out with tooltip: "Coming soon — compare two filters side by side"
  - When shipped post-launch: requires exactly 2 filters, renders dual-series charts

Styling:
- .stats-fpill { 
    background: var(--bg-card); 
    border: 1.5px solid var(--border);
    color: var(--text-dim); 
    font: 600 12px/1.3 var(--sans);
    padding: 6px 14px; border-radius: 20px;
  }
- .stats-fpill.active { 
    border-color: var(--pill-color); 
    background: color-mix(in srgb, var(--pill-color) 12%, white);
    color: var(--text); 
  }
```

---

## Stat Cards

**5 cards, no changes to metrics.** Ensure CSS classes (`.stat-card`, `.stat-val`, `.stat-label`) are applied without inline JS overrides.

---

### C1: Job Count Over Time (full-width)
- **Type:** Bar chart (keep current)
- **User question:** "Is my search area growing or slowing?"
- **Action it prompts:** If flat/declining → broaden filters. If spiking → act fast on new listings.
- **Data:** `first_seen_at` bucketed by week, last 26 weeks
- **Chart style:** Gradient indigo bars, rounded top corners
- **Axis labels:** `var(--text-faint)`, JetBrains Mono 10px
- **Grid lines:** `var(--border)` or `hsl(228, 16%, 93%)`
- **Dark tooltip** (standard floating pattern on light background)

### C2: Salary Distribution (half-width)
- **Type:** Vertical bar chart — **CHANGE from donut**
- **User question:** "What salary range should I target?"
- **Action it prompts:** See where the mass of jobs clusters → calibrate expectations. If bimodal, there might be two distinct job levels in the filter.
- **Data:** `salary_min` (or `salary_max` if min absent) bucketed into $25K ranges
- **Chart style:** Gradient indigo bars. X-axis: salary labels ($75K, $100K, etc.). Y-axis: job count.
- **Subtitle:** "X of Y jobs have salary data" (shows coverage)
- **Empty state:** If < 3 salary data points → "Not enough salary data for this filter. Try broadening your search."
- **Why not donut:** Salary is continuous/ordinal data. You need to see the shape of the distribution — bell curve, skew, bimodal. Donut hides this by converting it to arc-length comparison, which humans are bad at.

### C3: Seniority Breakdown (half-width)
- **Type:** Horizontal bar chart — **CHANGE from donut**
- **User question:** "Are the jobs in my search matching at my level?"
- **Action it prompts:** If 80% entry-level and user is senior → tuning keywords need adjustment. If spread across levels → healthy filter.
- **Data:** `getJobLevel(title, hierarchy)` counts per level
- **Chart style:** Bars ordered by count (highest at top). Colors from a sequential gradient (light→dark within indigo/purple family).
- **Suppression rule:** If "Unclassified" > 80% of total → suppress chart, show: "Most jobs haven't been classified by seniority. Configure your level keywords in Tuning → Level Hierarchy to improve this."
- **Why not donut:** 7-8 thin slices at 3% each are unreadable in a donut. Horizontal bars make the dominance of "Head 31%" immediately obvious with natural top-to-bottom reading order matching the career ladder.

### C5: Top Companies (half-width)
- **Type:** Horizontal bar chart (keep current)
- **User question:** "Who's hiring the most for what I want?"
- **Action it prompts:** Research and target these companies. Check their career pages directly.
- **Data:** Top 10 companies by job count (changed from 15 — less cramped)
- **Threshold:** Only show companies with 2+ roles (already implemented)
- **Empty state:** Already good — "Too few matching jobs to show company trends. Broaden your filters..."
- **Chart style:** Gradient indigo bars, truncate company names at 20 chars with ellipsis

### C7: Work Arrangement (half-width)
- **Type:** Donut (keep current — correct chart type)
- **User question:** "How remote-friendly is this space?"
- **Action it prompts:** If mostly on-site and user wants remote → need to adjust search. If mostly remote → validates strategy.
- **Data:** `loc_type` or location string parsing → Remote, On-site, Hybrid, Unspecified
- **Fixed colors:** Remote = `#22c55e`, On-site = `#6366f1`, Hybrid = `#f59e0b`, Unspecified = `#334155`
- **Suppression:** If "Unspecified" > 50% → suppress that segment, add note: "Location type not specified for many jobs"
- **Why donut works here:** 2-4 segments with typically clear dominance (e.g., Remote 90%). This is the correct use case for a donut.

---

## Charts — Data-Gated (ship when thresholds are met)

These charts are valuable but current data coverage makes them unreliable. They should be implemented with threshold guards that auto-enable the chart when data quality improves. Silent data collection starts at launch.

### C6: Salary by Level (full-width)
- **Type:** Grouped vertical bar chart with mark line at overall average
- **User question:** "What does each level pay in my field?"
- **Action it prompts:** Highest-action chart in the system — directly informs salary negotiation and level targeting.
- **Data:** Average salary midpoint per seniority level from `getJobLevel()` × salary data
- **Threshold to ship:** Filter returns 100+ jobs AND at least 3 levels have 5+ salary data points each
- **When below threshold:** Don't render the chart at all. No empty state — just absent from the grid.

### C8: Industry Breakdown (half-width)
- **Type:** Horizontal bars, top 10 industries by count
- **User question:** "What industries overlap with my search?"
- **Action it prompts:** Discover industries the user hadn't considered. Cross-industry exploration.
- **Data:** `industry` column (PDL-enriched)
- **Threshold to ship:** `industry` column is non-null for > 60% of jobs across all filters
- **When below threshold:** Don't render. Absent from grid.

### Dropped from spec

| Original spec chart | Reason for dropping |
|---------------------|---------------------|
| C7 (original): ATS Source Breakdown | Zero action value for job seekers. "Your jobs are on Greenhouse" doesn't inform any decision. Data retained for internal analytics via PostHog — just not shown to users. |

---

---

## What NOT to change

- **The 5 stat cards** — correct metrics, correct order
- **Filter pill multi-select logic** — the JS logic for union/dedup is correct
- **Data layer** — `fetchStatsData()`, `aggregateStats()`, caching, and dedup logic are all solid
- **PostHog events** — keep the instrumentation plan from the feature brief
- **ECharts dependency** — already loaded, keep using it

---

## Specific CSS Fixes Required

The current stats.js uses inline styles (`el.style.cssText = ...`) to force styling, bypassing the CSS design system. This makes the page fragile and inconsistent. All styling should come from `src/input.css` using the existing CSS variable system.

```
Remove all inline style assignments in stats.js for:
- card.style.cssText = 'background:#fff;border:...'
- container.style.cssText = 'display:flex;...'
- pill.style.cssText = basePill + 'border:...'
- grid.style.cssText = 'display:grid;...'

Replace with proper CSS classes that use:
- var(--bg-card) for card backgrounds (#fff — correct for light theme)
- var(--border) for borders
- var(--text), var(--text-dim), var(--text-faint) for text colors
- var(--bg-main) for page background
- The existing .card, .stat-card, .stat-val, .stat-label classes
```

The chart cards should use the existing `.card` class. If `.stats-chart-card` needs to exist separately, it should use the same variables. The ECharts STATS_THEME should be updated to work within the light context:

```javascript
var STATS_THEME = {
  // Dark tooltips floating over light content (standard pattern)
  tooltip: {
    backgroundColor: 'rgba(15,23,42,0.95)',
    borderColor: 'hsl(228, 16%, 85%)',
    textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 }
  },
  // Light-theme axis and grid
  axisLabel: { color: 'hsl(228, 11%, 41%)', fontFamily: 'JetBrains Mono', fontSize: 10 },
  axisLine: { lineStyle: { color: 'hsl(228, 16%, 91%)' } },
  splitLine: { lineStyle: { color: 'hsl(228, 16%, 93%)' } },
};
```

---

## Acceptance Criteria

- [ ] All chart cards use the design system (`.card` class or equivalent using `var(--bg-card)`, `var(--border)`)
- [ ] Filter pills styled via CSS classes using design system variables, not inline JS styles
- [ ] No inline `style.cssText` assignments in stats.js — all styling via CSS classes
- [ ] Salary chart (C2) is a **vertical bar chart**, not a donut
- [ ] Salary chart shows "X of Y jobs have salary data" subtitle
- [ ] Seniority chart (C3) is a **horizontal bar chart**, not a donut
- [ ] Seniority chart suppressed when Unclassified > 80%, with message linking to Tuning
- [ ] Work Arrangement (C7) donut suppresses Unspecified segment when > 50%
- [ ] ATS Source chart removed from user-facing Stats (data retained for internal analytics)
- [ ] "All" pill has no hamburger icon
- [ ] Aggregate/Compare dropdown present (Compare grayed out with "Coming soon" tooltip)
- [ ] Stat card values use JetBrains Mono (var(--mono)), labels use Outfit (var(--sans))
- [ ] Top Companies shows top 10 (not 15), company names truncated at 20 chars
- [ ] Responsive: single column at <= 900px, chart heights reduce to 240px
- [ ] All charts use updated STATS_THEME (dark tooltips, light-compatible grid lines and axis labels)
- [ ] C6 (Salary by Level) threshold guard implemented: only renders when 100+ jobs AND 3+ levels with 5+ salary data points
- [ ] C8 (Industry) threshold guard implemented: only renders when `industry` non-null > 60%

---

## Effort Estimate

| Work Unit | Effort |
|-----------|--------|
| Remove all inline styles, apply CSS classes for design system | 1.5h |
| Restyle filter pills + remove hamburger icon + add disabled compare dropdown | 1h |
| Convert salary donut → vertical bar chart + coverage subtitle | 1h |
| Convert seniority donut → horizontal bar chart + suppression logic | 1.5h |
| Remove ATS Source chart from render pipeline | 0.25h |
| Implement C6 threshold guard (salary by level, auto-enables when data sufficient) | 1.5h |
| Implement C8 threshold guard (industry, auto-enables when enrichment sufficient) | 1h |
| Update STATS_THEME for light dashboard context | 0.25h |
| Top Companies: reduce to top 10, truncate names | 0.25h |
| Polish: empty states, responsive check, font audit | 1h |
| **Total** | **~9h (2 dev days)** |

This can run in parallel with the cohort work — different files, no conflicts.

---

*UI/UX Agent note: The engineers built the charts functionally correct — the data layer, caching, filter logic, and aggregation are solid. The issue is purely visual design and chart type selection. This brief doesn't change any data logic. It changes how the data is presented.*
