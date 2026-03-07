# ADR-CS-P1-009-01: Dashboard Single-HTML Architecture

**Status:** Accepted  
**Date:** 2026-03-07  
**Context:** DS1-10 — All 14 dashboard pages served from single HTML file  
**Decision Makers:** Engineering Lead, Chief Architect, Evolvability Strategist

## Context

`dashboard.html` contains all 14 dashboard pages (17 page divs including 3 sub-browsers) in a single 262KB file. Navigation works by showing/hiding page divs via CSS (`display: none/block`). JS is already code-split by route (CS-016: shell, feed, keywords, pipeline, tuning, deferred chunks).

The question: should we split this into separate HTML files or adopt a framework-level routing solution now?

## Options Evaluated

### Option A: Keep Single HTML + CSS Visibility (Current)
- **Pros:** Zero latency on page switch (DOM already loaded). Simple mental model. CSS/JS already optimized. No routing framework needed.
- **Cons:** 262KB initial HTML payload (48KB gzipped). All page DOM exists even when unused. No opportunity for per-page CSS tree-shaking.

### Option B: Split into Separate HTML Files
- **Pros:** Smaller per-page payload. SEO benefits (though dashboard is noindex).
- **Cons:** Full page reload on navigation. Duplicated nav/header/auth across files. Requires server-side routing or link-based navigation. Breaks the SPA interaction model users expect.

### Option C: Defer to SA-013 (Vite + React Router Scaffold)
- **Pros:** Proper SPA routing with React Router. Component-level code splitting. No flash-of-empty on navigate. Design system integration natural.
- **Cons:** Requires React migration (scheduled in scaling phase).

## Decision

**Option C: Defer to SA-013.** The current single-HTML architecture is adequate for launch. The 48KB gzipped payload is acceptable. Route-based JS code splitting (already done in CS-016) addresses the main performance concern. Breaking up the HTML now would create a separate maintenance burden that gets thrown away when SA-013 migrates to React.

## Consequences

1. dashboard.html stays as a single file through Phase 1 remediation
2. SA-013 (Vite + React Router Scaffold) will implement proper per-route HTML generation
3. The DS1-3 utility class system and dark mode tokens created in this session provide the bridge — they work in both the current vanilla HTML and the future React architecture
4. Hook installed: data-theme attribute on <html> is framework-agnostic

## Architectural Scar

The `data-theme` attribute and CSS custom property system established in this session are the **scar** for future theming — any framework (React, Svelte, vanilla) can toggle themes by setting this single attribute. No framework lock-in.
