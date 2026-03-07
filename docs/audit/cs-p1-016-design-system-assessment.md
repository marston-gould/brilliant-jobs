# Design System Assessment — CS-P1-016 (Finding 0.178)

**Date:** 2026-03-07  
**Assessor:** Pod 3 Senior CSS/Tailwind Engineer  
**Scope:** styles.css, admin.html inline styles, all JS modules  

## Design System Maturity: Level 2 of 5 (Tokenized)

### What Exists (Strengths)

**Comprehensive CSS custom property system**  
The `:root` block defines 50+ custom properties with HSL color model, semantic naming, and dark mode overrides via `[data-theme=dark]` and `@media (prefers-color-scheme: dark)`. This is a solid foundation.

**Token categories already defined:**
- Colors: bg, text, accent, green, warm, red, purple, pink, indigo (all with HSL + dim variants)
- Typography: `--sans` (Outfit), `--mono` (JetBrains Mono)
- Fluid type: `--fs-page-title`, `--fs-stat`, `--fs-section`, `--fs-card-title` (clamp-based)
- Navigation: `--nav-w`, `--nav-bg`, `--nav-text` family
- Layout: implicit via `padding: 28px 40px` pattern (not tokenized)

**Dark mode is comprehensive**  
Every custom property has a dark mode counterpart. Both explicit (`[data-theme=dark]`) and automatic (`@media prefers-color-scheme`) modes work correctly. Color shifts are considered (e.g., accent-hsl shifts from 217/100%/62% to 217/92%/68%).

### What's Missing (Gaps)

**1. No spacing scale (Gap: High)**  
Spacing is ad-hoc throughout: `padding: 28px 40px`, `gap: 16px`, `margin-block-end: 20px`. There's no spacing scale like `--space-1` through `--space-8`. This causes inconsistency across panels.  
*Recommendation:* Define `--space-1: 4px` through `--space-8: 48px` on an 8px grid. Adopt in Phase 2 CSS migration.

**2. No elevation/shadow tokens (Gap: Medium)**  
Shadows are inline: `box-shadow: 0 4px 24px rgba(0,0,0,.08)`, `0 1px 3px rgba(0,0,0,.02)`, etc. Different dark mode shadow adjustments are spread across the CSS.  
*Recommendation:* Define `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-overlay` with dark mode variants.

**3. No border-radius tokens (Gap: Medium)**  
Border radius ranges from `4px` to `16px` with no pattern: cards use `12px`, buttons `8px`, inputs `6px` to `8px`, badges `4px` to `8px`, pills `20px`.  
*Recommendation:* Define `--radius-sm: 4px`, `--radius-md: 8px`, `--radius-lg: 12px`, `--radius-xl: 16px`, `--radius-full: 9999px`.

**4. No component tokens (Gap: High)**  
Components like `.admin-btn`, `.admin-table`, `.admin-metric-card` are defined with raw properties, not references to shared component tokens. When admin JS modules render HTML via `.innerHTML`, they inline styles that should reference component classes.  
*Recommendation:* Create an admin component token layer: `--admin-card-bg`, `--admin-card-border`, `--admin-btn-height`, `--admin-table-cell-padding`.

**5. No animation tokens (Gap: Low)**  
Transitions use `transition: all .15s` or `0.2s` inconsistently. No shared easing or duration variables.  
*Recommendation:* Define `--duration-fast: 100ms`, `--duration-normal: 200ms`, `--duration-slow: 300ms` and `--ease-default: cubic-bezier(.4,0,.2,1)`.

**6. No icon system (Gap: Medium)**  
Icons are a mix of emoji (🟢, ⚡, ✕), inline SVGs (nav icons), and Lucide (dashboard). No consistent icon sizing, color inheritance, or library.  
*Recommendation:* Standardize on Lucide SVG icons at 16px/20px sizes. Phase out emoji in admin UI over Phase 2.

### Maturity Levels

| Level | Name | Status |
|-------|------|--------|
| 1 | Ad-hoc | ✅ Past this |
| 2 | **Tokenized** | ✅ **Current** — colors + type tokenized |
| 3 | Component library | ⬜ — no shared component definitions |
| 4 | Documented + governed | ⬜ — no Storybook or docs |
| 5 | Automated + enforced | ⬜ — no linting or CI enforcement |

### Recommended Path to Level 3 (Component Library)

**Phase 1 (4h, can start immediately):**
1. Define spacing, shadow, radius, and animation tokens in `:root`
2. Create `admin-components.css` with `.ac-*` prefixed component classes
3. Migrate cron, alerts, and monitoring panels to use component classes

**Phase 2 (8h, after Phase 1):**
1. Create `.ac-card`, `.ac-table`, `.ac-modal`, `.ac-drawer`, `.ac-metric` component classes
2. Extract all admin JS `.innerHTML` inline styles to CSS classes
3. Lint for inline `style=` in admin JS modules (CI gate)

**Phase 3 (12h, post-launch):**
1. Create design system documentation page at `/admin/design-system`
2. Add visual regression testing for admin panels
3. Evaluate Storybook or similar component browser

### Current Token Inventory

| Category | Count | Tokenized | Dark Mode |
|----------|-------|-----------|-----------|
| Colors (bg) | 8 | ✅ | ✅ |
| Colors (text) | 4 | ✅ | ✅ |
| Colors (semantic) | 8 | ✅ | ✅ |
| Typography (family) | 2 | ✅ | N/A |
| Typography (size) | 4 | ✅ (clamp) | N/A |
| Navigation | 6 | ✅ | ✅ |
| Spacing | 0 | ❌ | N/A |
| Shadows | 0 | ❌ | N/A |
| Radii | 0 | ❌ | N/A |
| Animation | 0 | ❌ | N/A |
| Components | 0 | ❌ | N/A |

**Total: ~32 tokens defined, ~20 needed**
