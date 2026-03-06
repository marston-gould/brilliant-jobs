# CX-07: Dashboard Inline Style Audit

**Date:** 2026-03-06
**Session:** CS-011
**Owner:** Senior CSS/Tailwind Engineer
**Input for:** CX-10 (CSS Migration)

---

## Executive Summary

The dashboard codebase contains approximately **1,008 inline style declarations** across 30 JavaScript files (non-admin), plus **803 inline styles** in `dashboard.html`, and **32** in `notification-center.js`. This document categorizes every inline style by type, identifies migration priority, and provides a phased extraction plan.

---

## Inline Style Distribution by File

| File | Count | Priority | Notes |
|------|-------|----------|-------|
| keywords.js | 371 | P1 | Largest contributor — tag/chip UI heavily inlined |
| location.js | 86 | P2 | Location selector UI |
| tuning.js | 84 | P2 | Slider/range UI components |
| referrals.js | 94 | P2 | Referral hub cards + modals |
| resumes.js | 50 | P2 | Resume cards + upload UI |
| job-feed.js | 41 | P1 | Core feed — most-visited page |
| resume-archive.js | 40 | P3 | Archive drawer UI |
| pipeline.js | 40 | P2 | Pipeline board columns |
| browsers.js | 37 | P3 | Browser detection UI |
| applications.js | 23 | P2 | Application cards |
| stats.js | 12 | P3 | Chart container sizing |
| notification-center.js | 32 | P2 | Opt-in modal + toggle matrix |
| billing.js | 9 | P3 | Pricing cards |
| chat.js | 9 | P3 | Chat window UI |
| dashboard.html | 803 | P1 | Static layout + embedded component styles |

**Total: ~1,843 inline style declarations across dashboard surface**

---

## Category Breakdown

| Category | Count | % of Total | Migration Approach |
|----------|-------|------------|-------------------|
| **Typography** (color, font-size, font-weight, font-family, text-align, text-transform, letter-spacing) | 3,452 | 43% | Extract to Tailwind utility classes or CSS custom properties |
| **Visual** (background, border, border-radius, box-shadow, opacity) | 1,489 | 19% | Extract to component classes in design system |
| **Spacing** (margin, padding) | 1,426 | 18% | Convert to Tailwind spacing utilities |
| **Layout** (display, flex, gap, align-items, justify-content, position, grid, overflow) | 1,307 | 16% | Convert to Tailwind flex/grid utilities |
| **Sizing** (width, height, max-width, min-width) | 359 | 4% | Extract to component-level CSS |

---

## Top 15 Most-Used Inline Properties

| Property | Count | Recommendation |
|----------|-------|---------------|
| color | 1,249 | Map to CSS custom properties (--text, --text-dim, --accent, etc.) |
| font-size | 1,107 | Standardize to type scale (11px, 12px, 13px, 14px, 16px, 18px, 20px) |
| padding | 739 | Convert to spacing scale utilities |
| background | 415 | Map to design tokens |
| border-radius | 379 | Standardize to radius scale (4px, 6px, 8px, 10px, 14px) |
| font-weight | 369 | Map to weight tokens (400, 500, 600, 700) |
| margin-bottom | 340 | Convert to spacing utilities |
| display | 322 | Convert to layout utilities (flex, grid, none, block) |
| text-align | 272 | Convert to alignment utilities |
| border | 269 | Map to border tokens |
| gap | 216 | Convert to gap utilities |
| margin-top | 197 | Convert to spacing utilities |
| font-family | 189 | Remove — should inherit from body/root |
| width | 169 | Extract to component CSS |
| align-items | 145 | Convert to flex alignment utilities |

---

## Migration Plan (5 Phases)

### Phase 1: Design Token Extraction (Est. 8h)

Extract repeated values into CSS custom properties in `styles.css`:

- **Colors:** Already partially done in `--text`, `--text-dim`, `--accent` etc. Audit JS files for any hardcoded hex values not in the token set.
- **Font sizes:** Create `--text-xs` through `--text-xl` mapping to the 7-step scale.
- **Spacing:** Create `--space-1` through `--space-8` mapping to the common spacing values (4px, 6px, 8px, 10px, 12px, 16px, 20px, 24px).
- **Radii:** Create `--radius-sm` through `--radius-xl`.

### Phase 2: Component Class Extraction (Est. 16h)

Create component classes for the most repeated patterns:

- `.chip` / `.tag` — covers ~200 of keywords.js inline styles
- `.stat-card` — covers stat cards across feed, pipeline, data
- `.modal-overlay` / `.modal-body` — covers notification opt-in, referral modals
- `.status-badge` — covers status indicators across feed, pipeline
- `.form-field` / `.input-group` — covers form layouts across settings, notifications

### Phase 3: File-by-File Extraction (Est. 24h)

Work through files in priority order:
1. **keywords.js** (371 styles) — chip/tag/filter UI → component classes
2. **job-feed.js** (41 styles) — feed cards → extract to CSS
3. **dashboard.html** (803 styles) — static layout → extract to styles.css
4. **notification-center.js** (32 styles) — modal → component classes
5. **referrals.js** (94 styles) — referral UI → component classes

### Phase 4: Remaining Files (Est. 12h)

Extract from lower-priority files: location.js, tuning.js, resumes.js, pipeline.js, browsers.js, applications.js, resume-archive.js.

### Phase 5: Validation (Est. 4h)

- Run visual regression against screenshots of all 14 dashboard pages
- Verify zero inline `style=` attributes remain in JS files (grep audit)
- Performance comparison: measure CSS bundle size vs. inline overhead

---

## Patterns to Eliminate

### 1. Repeated Color Assignment
```javascript
// BEFORE (appears ~1,249 times)
el.style.color = 'var(--text-dim)';

// AFTER
el.classList.add('text-dim');
```

### 2. Repeated Layout Boilerplate
```javascript
// BEFORE (appears ~300 times)
el.style.display = 'flex';
el.style.alignItems = 'center';
el.style.gap = '8px';

// AFTER
el.classList.add('flex', 'items-center', 'gap-2');
```

### 3. Repeated Font-Size + Weight
```javascript
// BEFORE (appears ~700 times)
el.style.fontSize = '12px';
el.style.fontWeight = '600';
el.style.color = 'var(--text-faint)';

// AFTER
el.classList.add('label'); // .label { font-size: 12px; font-weight: 600; color: var(--text-faint); }
```

---

## Success Criteria

- Zero inline `style=` in dashboard JS files (target: 0, current: 1,008)
- All visual properties driven by CSS classes or custom properties
- No visual regressions across all 14 dashboard pages
- CSS bundle size increase < 15KB (offset by reduced HTML/JS size)
- All colors, fonts, spacing, and radii use design tokens

---

*This audit document serves as the input specification for CX-10 (CSS Migration). The Senior CSS/Tailwind Engineer owns execution.*
