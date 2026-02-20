# Project Knowledge Corrections — Dashboard Theme

**Date:** February 19, 2026
**Flagged by:** Pod 1 (Growth) — UI/UX Agent
**Priority:** Housekeeping — prevents future engineering errors

---

## Issue

Three project knowledge files describe the dashboard as using a **dark theme** with dark hex values. The actual production dashboard (`src/input.css`, confirmed via screenshot of v2.73) uses a **light theme** with a dark sidebar.

The dark hex values in the knowledge files (`#0f1117`, `#181a20`, etc.) appear to be from an earlier design iteration or from the **external/public pages** (job-market-data.html, salary-data.html, etc.), which do use a dark theme. The internal dashboard has been light-themed for some time.

This mismatch caused the Stats page to be specced with dark chart styling, and likely contributed to the engineers using inline style hacks instead of the CSS class system.

---

## Files Requiring Correction

### 1. BRILLIANT_JOBS_CONTEXT.md — Lines 111–124

**Current (WRONG):**
```
### Theme: Dark-first
--bg-main: #0f1117
--bg-card: #181a20
--bg-input: #1e2028
--text: #f0f1f3
--text-dim: #94a3b8
--text-faint: #64748b
--accent: #3b82f6 (blue)
--green: #22c55e
--red: #ef4444
--warm: #f59e0b (amber)
--border: #2a2d35
```

**Correct (from production `src/input.css`):**
```
### Theme: Light dashboard, dark sidebar
#### Dashboard (internal)
--bg-main: hsl(228, 22%, 97%)     /* light grey page background */
--bg-card: #ffffff                  /* white cards */
--bg-input: hsl(228, 14%, 95%)     /* light input fields */
--text: hsl(230, 28%, 14%)         /* near-black text */
--text-dim: hsl(228, 11%, 41%)     /* muted text */
--text-faint: hsl(225, 10%, 63%)   /* faint labels */
--accent: hsl(217, 100%, 62%)      /* blue */
--green: hsl(142, 71%, 45%)
--red: hsl(0, 84%, 60%)
--warm: hsl(38, 92%, 50%)          /* amber */
--border: hsl(228, 16%, 91%)       /* light grey borders */
--nav-bg: hsl(215, 61%, 27%)       /* dark navy sidebar */

#### External/Public pages (job-market-data, salary-data, etc.)
--bg-main: #0f1117                  /* dark background */
--bg-card: #181a20                  /* dark cards */
(these values are correct for the public SEO pages, not the dashboard)

#### Email templates
Dark-themed HTML via Resend (this is correct — emails use dark theme)
```

### 2. PROJECT_KNOWLEDGE.md — Lines 268–281

**Same correction.** Replace "CSS Variables (dark theme)" section with the light dashboard values above. Add note that public pages use a separate dark theme.

Also fix line 63:
- **Current:** `- **CSS variables** for theming (dark-first design)`
- **Correct:** `- **CSS variables** for theming (light dashboard, dark sidebar; public pages use dark theme)`

And line 147:
- **Current:** `- **18 email templates:** Dark-themed HTML via shared template library in Resend`
- **This one is correct** — emails do use dark theme.

### 3. STATS_CHARTS_SPEC.md — Lines 426–437

**Current (WRONG):**
```
Match dashboard dark theme (same as public pages):
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

**Correct:**
```
Dashboard uses light theme. Tooltips are dark (standard floating pattern).
Axis labels and grid lines use light-compatible colors:
const STATS_THEME = {
  tooltip: {
    backgroundColor: 'rgba(15,23,42,0.95)',
    borderColor: 'hsl(228, 16%, 85%)',
    textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 }
  },
  axisLabel: { color: 'hsl(228, 11%, 41%)', fontFamily: 'JetBrains Mono', fontSize: 10 },
  splitLine: { lineStyle: { color: 'hsl(228, 16%, 93%)' } },
};
```

Also line 118:
- **Current:** `Same card design as public pages (dark bg, badge, label, ECharts container).`
- **Correct:** `Same card layout as public pages but using dashboard light theme (white bg, border, label, ECharts container).`

---

## Impact

These corrections prevent:
1. Future engineers speccing new dashboard features with dark hex values
2. Chart themes being built for dark backgrounds that render on white cards
3. Inline style hacks to "fix" styling that conflicts with the CSS class system

---

## Action Required

Marston: update the three project knowledge files in the Claude Project settings with the corrected values above. These are read-only from Claude's perspective — only you can edit them.
