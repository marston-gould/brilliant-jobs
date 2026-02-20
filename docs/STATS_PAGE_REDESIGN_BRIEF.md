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

## Component-by-Component Spec

### Filter Bar

**Current problem:** White pills, hamburger icon on "All," no aggregate/compare toggle, styling doesn't match the rest of the dashboard.

**Fix:**

```
Visual:
- Dark background bar (var(--surface) or var(--card-bg))
- Pills match Jobs Feed styling: dark pill bg, colored left-border or dot, 
  active state uses color-mix with filter color at 15% opacity
- "All" pill uses no icon — just the word "All" with a neutral accent border
- Active pills get the filter's assigned color as border + faded background

Interaction:
- Click a single pill → charts scope to that filter only
- Click multiple pills → union of results (aggregate mode, default)
- Dropdown at right: "Aggregate" (default) / "Compare" 
  - Aggregate: unions all selected filters, shows one set of charts
  - Compare: requires exactly 2 filters selected, renders dual-series 
    charts with each filter's color. If not exactly 2, show inline hint:
    "Select exactly 2 filters to compare"
- "All" is a convenience shortcut — selects all filters in aggregate mode
- Clicking "All" while individual pills are selected clears them back to all
- Clicking an individual pill while "All" is active deselects "All" and 
  selects only that pill

Styling (CSS — use existing variables, not hardcoded colors):
- .stats-fpill { 
    background: var(--bg-card); 
    border: 1.5px solid var(--border);
    color: var(--text-dim); 
    font: 600 12px/1.3 var(--sans);
    padding: 6px 14px; 
    border-radius: 20px;
  }
- .stats-fpill.active { 
    border-color: var(--pill-color); 
    background: color-mix(in srgb, var(--pill-color) 12%, white);
    color: var(--text); 
  }
- .stats-fpill .dot { 
    width: 8px; height: 8px; border-radius: 50%; 
    background: var(--pill-color); margin-right: 6px; 
  }
```

### Stat Cards

**Current problem:** Stat cards are styled correctly via CSS (`.stat-card` class uses `var(--bg-card)` and `var(--border)`), but inline JS styles may be overriding them.

**Fix:**

```
- Ensure .stat-card class is applied (it already exists in input.css with correct light theme styling)
- Remove any inline style overrides in stats.js
- Value: var(--text), JetBrains Mono (var(--mono)), clamp(20px, 2.2vw + 0.5rem, 28px) — already defined in .stat-val
- Label: var(--text-faint), 11px uppercase Outfit — already defined in .stat-label
- No changes needed to the 5 metrics — they're the right ones
- Just ensure the CSS classes aren't being overridden by JS
```

### C1: Job Count Over Time (full width)

**Current:** Bar chart, light grid, acceptable but could be better.

**Fix:**
- Switch to a **gradient area chart** for visual richness (smoother trend line than discrete bars)
- Area fill: linear gradient from `var(--indigo)` at top to `transparent` at bottom
- Line: 2px solid `var(--indigo)`
- Grid: light split lines using `var(--border)` or `hsl(228, 16%, 93%)`
- Tooltip: dark themed (already correct in STATS_THEME — dark tooltips floating over light content is standard)
- X-axis: week labels, JetBrains Mono 10px, `var(--text-faint)`
- Keep the last 26 weeks of data

### C2: Salary Distribution (half width)

**Current problem:** Rendered as a **donut chart**. Salary is continuous data — a donut is the wrong chart type.

**Fix:**
- **Vertical bar chart** with $25K buckets
- Bars: gradient fill (same indigo as timeline), rounded top corners
- X-axis: salary range labels ("$75K", "$100K", "$125K", etc.), rotated 45° if needed
- Y-axis: job count
- Empty state: if < 3 salary data points, show "Not enough salary data for this filter. Try broadening your search."
- Label the chart subtitle: "X of Y jobs have salary data" so users know coverage

### C3: Seniority Breakdown (half width)

**Current problem:** Donut chart showing "Unclassified 100%." Useless and embarrassing.

**Fix:**
- **Horizontal bar chart** — shows each level as a bar, ordered from highest count to lowest
- Only show levels with > 0 jobs
- If "Other/Unclassified" > 80% of total: suppress the chart entirely, show message: "Most jobs in this filter haven't been classified by seniority. Configure your seniority keywords in Tuning → Level Hierarchy to improve this."
- Colors: use a sequential gradient from light (Entry) to dark (C-Suite) within the indigo/purple family
- This matches the public career-level-data page approach

### C5: Top Companies (half width)

**Current:** Horizontal bar chart with good empty state. Mostly fine.

**Fix:**
- Use `.card` or `.stats-chart-card` class with design system variables (no inline overrides)
- Keep horizontal bars
- Truncate company names at 20 chars with ellipsis
- Show top 10 instead of 15 (less cramped)
- Bar color: gradient indigo left-to-right
- Only show companies with 2+ roles (already implemented)

### C7: Work Arrangement (half width)

**Current:** Donut chart, correctly used for categorical data. Styling is acceptable.

**Fix:**
- Ensure card styling comes from CSS classes, not inline JS
- Keep donut — correct chart type for composition
- Fixed color mapping: Remote = `#22c55e`, On-site = `#6366f1`, Hybrid = `#f59e0b`, Unspecified = `#334155`
- If "Unspecified" > 50%, suppress that segment and add note: "Location type not specified for many jobs"
- Legend: right side, vertical, show percentages

### C8: ATS Source (half width — NEW for launch)

**Current:** Not rendered in current build despite being in the feature brief.

**Add:**
- Donut chart showing job count by ATS platform (Greenhouse, Lever, Ashby, Workable, Recruitee)
- Each source gets a fixed color for consistency across views
- This is pure count data from `ats_source` — no coverage issues, no empty states possible
- Place in the bottom row

---

## Compare Mode (Deferred — but design the toggle now)

The dropdown at the right of the filter bar should exist but show "Aggregate" as the only option, with "Compare" grayed out and a tooltip: "Coming soon — compare two filters side by side."

This way the UI affordance is visible and users understand the capability is coming. When we ship compare mode post-launch, it's a dropdown change, not a layout change.

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
- [ ] No inline styles in stats.js — all styling via CSS classes
- [ ] Salary chart is a vertical bar chart, not a donut
- [ ] Seniority chart is a horizontal bar chart, not a donut
- [ ] Seniority chart suppressed when Unclassified > 80%, with helpful message linking to Tuning
- [ ] Work Arrangement donut suppresses Unspecified segment when > 50%
- [ ] ATS Source donut chart added (C8)
- [ ] "All" pill has no hamburger icon
- [ ] Aggregate/Compare dropdown present (Compare grayed out with "Coming soon" tooltip)
- [ ] Stat card values use JetBrains Mono, labels use Outfit
- [ ] Timeline uses gradient area chart instead of plain bars
- [ ] Responsive: single column at <= 900px, chart heights reduce to 240px
- [ ] All charts use updated STATS_THEME (dark tooltips, light-compatible grid lines and axis labels)

---

## Effort Estimate

This is primarily a restyling + chart type change. The data layer is untouched. 

| Work Unit | Effort |
|-----------|--------|
| Remove inline styles, apply CSS classes for dark theme | 1.5h |
| Restyle filter pills to match Jobs Feed system | 1h |
| Convert salary donut → vertical bar chart | 1h |
| Convert seniority donut → horizontal bar chart + suppression logic | 1.5h |
| Add ATS source donut (C8) | 0.5h |
| Convert timeline bars → gradient area chart | 0.5h |
| Add aggregate/compare dropdown (compare disabled) | 0.5h |
| Polish: empty states, responsive check, font audit | 1h |
| **Total** | **7.5h (~1.5 dev days)** |

This can run in parallel with the cohort work — different files, no conflicts.

---

*UI/UX Agent note: The engineers built the charts functionally correct — the data layer, caching, filter logic, and aggregation are solid. The issue is purely visual design and chart type selection. This brief doesn't change any data logic. It changes how the data is presented.*
