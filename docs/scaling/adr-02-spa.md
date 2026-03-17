# ADR-02: SPA Migration — Vite + React Router

**Status:** IMPLEMENTED (SA-013 scaffold complete)
**Domain:** Frontend Architecture
**Effort:** 240–340 hours total (across SA-013 through SA-017)
**Date:** 2026-03-07
**Authors:** Frontend Engineer, CSS/Tailwind Engineer, Lead Platform Engineer, Chief Architect

## Context

The dashboard (dashboard.html) is a 3,716-line monolithic HTML file with 14 tab-switched pages,
all loaded on initial render. The admin (admin.html) is 1,087 lines with similar tab-switching.
Together they represent ~247KB + 72KB of HTML, with JavaScript organized as concatenated script
files built by esbuild (build.js).

Key constraints identified during remediation:
- No route-based code splitting possible (all JS loads on every page visit)
- Global scope pollution (window.BJ namespace, 827 inline styles)
- Tab-switching prevents URL-based deep linking and back/forward navigation
- TypeScript migration (ADR-04) is blocked at module boundaries by concatenated build
- Dark mode requires manual `[data-theme="dark"]` overrides on ~50 component classes

## Options Evaluated

| Option | Pros | Cons | Effort | Verdict |
|--------|------|------|--------|---------|
| **Vite + React Router** | True code splitting. HMR. React ecosystem. Gradual migration. | Full rewrite of all pages. | 240–340h | **SELECTED** |
| Next.js | SSR/SSG for SEO pages. API routes. | Dashboard is auth-only — no SSR benefit. Adds server complexity. | 280–400h | OVERKILL |
| Stay + Enhance | No migration cost. | 14 pages in one HTML. No per-page tree shaking. Velocity drag ~20%. | 0h (ongoing drag) | REJECTED |

## Decision

Migrate dashboard + admin to a Vite + React Router SPA with incremental page-by-page migration
through a dual-mode shell.

## Architecture

### Dual-Mode Shell
The SPA and legacy pages coexist during migration:

1. React Router controls URLs under `/app/*`
2. `AppShell` renders the unified sidebar navigation
3. Migrated pages render as React components
4. Unmigrated pages use `LegacyPageWrapper` to activate legacy tab content
5. Legacy `dashboard.html` and `admin.html` continue to work independently at their existing URLs

### Directory Structure
```
src/app/
├── main.tsx              # React entry point
├── index.html            # SPA HTML host
├── routes.tsx            # All route definitions
├── shell/
│   ├── AppShell.tsx      # Unified nav + content layout
│   ├── AuthGuard.tsx     # Auth-required route guard
│   ├── AdminGuard.tsx    # Admin-role route guard
│   └── LegacyPageWrapper.tsx  # Dual-mode bridge
├── components/           # Design system primitives
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── Badge.tsx
│   ├── Input.tsx
│   ├── Select.tsx
│   └── Modal.tsx
├── providers/            # Data abstraction layer (scar)
│   ├── types.ts          # Provider interfaces
│   ├── supabase.ts       # Supabase implementations
│   └── DataProvider.tsx  # React context
├── design-tokens/
│   └── tokens.ts         # Spacing, type, shadow, color tokens
├── hooks/                # Shared React hooks
└── pages/
    ├── dashboard/        # Migrated dashboard pages (SA-014+)
    └── admin/            # Migrated admin pages (SA-016+)
```

### Data Provider Pattern (Scar)
All data access goes through provider interfaces (SearchProvider, JobProvider, UserProvider,
PipelineProvider). Current implementations wrap `window.BJ.supabase`. Future options:
- Swap to REST API gateway calls
- Add client-side caching layer
- Mock providers for tests
- GraphQL provider

This is a "scar" — the interface is ready for backend changes without touching components.

### Code Splitting Strategy
```
react-vendor     → react core (~45KB gzip)
react-dom        → DOM rendering (~40KB gzip)
router           → react-router-dom (~12KB gzip)
design-system    → shared components (~5KB gzip)
providers        → data access layer (~8KB gzip)
admin-pages      → admin routes (lazy-loaded, ~50KB gzip)
[per-page chunks → loaded on navigation]
```

Initial SPA payload target: < 160KB gzip (shell + providers + feed page).

### Migration Order
1. **SA-014:** Feed page (highest traffic)
2. **SA-015:** Pipeline + Keywords pages
3. **SA-016:** Stats + Admin overview migration
4. **SA-017:** Remaining pages + legacy shell removal

### Design System Rules (enforced in all page migrations)
- Zero inline styles
- Zero hardcoded colors — design tokens only
- Dark mode complete on every component
- Tailwind utilities only — no raw CSS in components
- All data through providers — no direct Supabase calls in components

## Consequences

### Positive
- Route-based code splitting reduces initial load by ~60%
- URL-based deep linking and browser history support
- TypeScript migration can proceed per-component with proper module boundaries
- Dark mode becomes automatic via CSS custom properties + Tailwind
- Testing: components can be rendered with mock providers (no Supabase dependency)
- HMR during development (~100ms feedback loop vs full reload)

### Negative
- Dual-mode complexity during migration (legacy + React coexisting)
- 3–4 month migration timeline before legacy shell can be removed
- Team needs React proficiency (mitigated: gradual migration, pair programming)

### Risks
- Legacy JS relies on global scope — provider bridge must handle timing carefully
- SEO pages stay static (not part of SPA) — verified no negative SEO impact
- Bundle size must be monitored per-session to prevent regression

## SA-013 Deliverables (this session)
- [x] React, React Router, Vite React plugin installed
- [x] tsconfig.json updated for JSX + path aliases
- [x] vite.config.js updated with React plugin + code splitting
- [x] Design tokens defined (spacing, type, shadow, color)
- [x] Base component primitives: Button, Card, Badge, Input, Select, Modal
- [x] Data provider interfaces + Supabase implementations
- [x] DataProvider React context with convenience hooks
- [x] AppShell with unified sidebar navigation
- [x] AuthGuard + AdminGuard route guards
- [x] LegacyPageWrapper dual-mode bridge
- [x] Route definitions for 12 dashboard + 10 admin pages
- [x] SPA entry point (main.tsx + index.html)
- [x] Vercel rewrite for /app/* routes
- [x] Tailwind config updated to scan SPA files
- [x] Package.json scripts (dev:spa, build:spa)
- [x] This ADR

## Next: SA-014
Feed page migration: React + TypeScript component tree (FeedPage, JobCard, SearchBar,
FilterSidebar, PaginationControls). First real page using the design system and providers.

## SPA-CUT-1/2/3/FINAL: Bridge Elimination + Legacy Retirement (v10.39–v10.42)

**STATUS: IMPLEMENTED**

### What was delivered
- **Standalone Supabase client** (`src/app/lib/supabase.ts`) — zero window.BJ dependency
- **All 22 hooks cut from window.* bridge** — 133 total bridge calls eliminated
- **dashboard.html archived** (4,378 lines → `legacy/dashboard.html`)
- **admin.html archived** (1,318 lines → `legacy/admin.html`)
- **CSP hardened** — `unsafe-inline` removed from catch-all script-src
- **Vercel rewrites** — /dashboard, /admin → SPA
- **258 tests** across 4 sessions

### Bundle analysis
- FeedPage: 51.69KB (14.28KB gzip)
- PipelinePage: 29.74KB (8.18KB gzip)
- KeywordsPage: 13.03KB (4.06KB gzip)
- ResumesPage: 20.29KB (6.11KB gzip)
- ApplicationsPage: 12.17KB (3.31KB gzip)
- providers (incl Supabase client): 179.82KB (48.17KB gzip)
- app shell: 13.60KB (3.89KB gzip)
- Total initial: ~78KB gzip (React + Router + App shell)

### Design system
- 6 primitives: Button, Card, Badge, Input, Select, Modal
- Design tokens in `src/app/design-tokens/tokens.ts`
- 16 data-driven inline styles remaining (dynamic colors, widths, animation delays)
- All static styles via Tailwind utilities

### Known limitations
- Legacy JS modules (130 files in `js/`) still in repo — needed by roadmap.html and non-SPA pages
- `build.js` / `build-admin.js` still exist — build legacy bundles for non-SPA pages
- Tailwind output 167KB (custom CSS in input.css accounts for ~70KB floor)
- 6 TODO stubs in hooks: launchRewrite, uploadResume, replacePlaceholder, reUpload, processQueue, openJobModal
- These features work in legacy mode but need standalone React implementation
