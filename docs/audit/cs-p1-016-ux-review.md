# Admin Dashboard UX Review — CS-P1-016 (Finding 0.177)

**Date:** 2026-03-07  
**Reviewer:** Pod 3 Frontend + CSS Engineers  
**Scope:** admin.html + all js/admin-*.js modules  

## Executive Summary

The admin console has grown from 15 to 37 sub-pages across 4 sections. While the IA v2 sidebar reorganization (CS-024) was a significant improvement, several UX issues have accumulated that affect daily admin workflow. This review identifies and prioritizes them.

## Findings

### Critical (Fix Now)

**UX-001: 37 nav items overwhelm the sidebar**  
With 37 pages spread across 4 collapsible sections, finding a specific page requires scanning. No search or pinning mechanism exists.  
*Recommendation:* Add a sidebar search (Cmd+K) that filters pages by name. Add a "pinned" section at the top for frequently used pages (persisted to localStorage).

**UX-002: No breadcrumb back navigation**  
The breadcrumb shows "Operations > Cron Health" but is not clickable — it's display-only. Users can't click "Operations" to see all pages in that section.  
*Recommendation:* Make breadcrumb segments clickable to expand the relevant sidebar section.

**UX-003: Loading states are inconsistent**  
Some panels show a spinner (monitoring, alerts), some show "Loading…" text (cron, PostHog), and some show nothing (cohorts, feedback). Users can't tell if a panel is loading or broken.  
*Recommendation:* Standardize on the admin-loading-state spinner pattern from CS-016 for all panels.

### Major (Fix This Sprint)

**UX-004: Inline styles dominate JS-rendered panels**  
171 inline style attributes in admin.html, and JS modules use extensive inline styles in .innerHTML templates. This makes theming inconsistent and dark mode unreliable.  
*Recommendation:* Extract to CSS classes in a dedicated admin-panels.css. Priority: cron, monitoring, alerts, PostHog panels.

**UX-005: Modals have no keyboard support**  
Alert rule modal, schedule edit modal, and alert config modal are mouse-only. No Escape-to-close, no focus trapping, no tab cycling.  
*Recommendation:* Add a shared `_adminModal()` helper with Escape binding, focus trap, and aria attributes.

**UX-006: Table headers are not sortable**  
Admin tables (cron, alerts, users, feedback) display data in insertion/query order with no sort capability. Finding specific items in 60+ row tables requires scrolling.  
*Recommendation:* Add client-side column sort to admin tables using a shared `_sortableTable()` utility.

**UX-007: Auto-refresh indicators are invisible**  
Cron (60s), monitoring (30s), alerts (60s), and PostHog (5m) panels auto-refresh, but the user has no visual indicator of the countdown or when the next refresh happens.  
*Recommendation:* Add a subtle progress bar under the refresh button showing time until next auto-refresh.

### Minor (Backlog)

**UX-008: No dark mode for new panels (CS-P1-016)**  
The cron management drawer, schedule modal, and alert config modal use hardcoded colors in some places. Verify all new UI respects `var(--*)` tokens.  
*Status:* Verified — all new CS-P1-016 code uses CSS custom properties.

**UX-009: Period selectors are inconsistent**  
Revenue uses a period toggle (24h/7d/30d), PostHog uses hardcoded 7d/24h per metric. There's no unified time period selector.  
*Recommendation:* Create a shared `<admin-period-select>` component.

**UX-010: Mobile responsiveness is minimal**  
The sidebar collapses to 60px on < 768px, but panel content doesn't adapt. Tables overflow, modals are unusable on small screens.  
*Recommendation:* Add responsive breakpoints for all admin panels. Priority: cron table (add horizontal scroll).

## Priority Matrix

| ID | Severity | Effort | Priority |
|----|----------|--------|----------|
| UX-001 | Critical | 4h | P0 |
| UX-002 | Critical | 1h | P0 |
| UX-003 | Critical | 2h | P0 |
| UX-004 | Major | 6h | P1 |
| UX-005 | Major | 3h | P1 |
| UX-006 | Major | 3h | P1 |
| UX-007 | Minor | 2h | P2 |
| UX-008 | Minor | 1h | P2 |
| UX-009 | Minor | 2h | P2 |
| UX-010 | Minor | 8h | P2 |

**Total estimated effort:** ~32h across all items  
**Recommended Phase 2 scope:** UX-001 through UX-006 (19h)
