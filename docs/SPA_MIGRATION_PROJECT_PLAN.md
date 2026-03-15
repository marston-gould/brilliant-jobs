# SPA Migration Project Plan

## Purpose

Replace the legacy `dashboard.html` (3,969 lines) + `admin.html` (1,207 lines) + 54,920 lines of vanilla JS with a React + TypeScript + Tailwind SPA. This is not a feature rewrite — it's a UI layer replacement. All Supabase EFs, migrations, extension code, and backend logic remain untouched.

## Why

1. **AI-maintainability.** AI agents (CrewAI, Claude pods) cannot reliably edit a 4000-line HTML file where a missing `</div>` on line 2810 breaks 5 pages. Isolated typed components are what AI is good at.
2. **Developer velocity.** New features on the monolith require surgery. New features on components require composition.
3. **Valuation.** React + TypeScript + Tailwind is what acquirers expect. A vanilla JS monolith gets flagged as tech debt and discounted on the term sheet.
4. **Pod parallelism.** Two pods can't touch `dashboard.html` simultaneously. With components, they work on different files.

## Scope

| Surface | Legacy Lines | Existing SPA | Gap |
|---|---|---|---|
| Dashboard JS (35 files) | 34,922 | ~6,100 (mostly feed) | ~29K to port |
| Dashboard HTML | 3,969 | — | Layout + page structure |
| Admin JS (47 files) | 19,998 | 0 | Full build |
| Admin HTML | 1,207 | — | Layout + page structure |
| Shared infra | 1,238 | Partial (router, auth) | Sync, flags, PostHog, toasts |
| CSS | ~3,200 (custom) | Tailwind scaffold exists | Full Tailwind conversion |
| **Total** | **~61,300** | **~6,100** | **~55K to port** |

## What Does NOT Change

- Supabase schema, EFs, migrations
- Chrome extension
- Fly.io worker
- Vercel routing (except adding SPA catch-all)
- API gateway routes
- CI pipeline (add Vite build step)
- Git repo (same repo, `src/app/` directory)

## Architecture Decisions

- **Same repo.** No new repo. SPA lives in `src/app/`, builds to `dist/spa/`.
- **Feature flag cutover.** `BJ_SPA=true` env var in Vercel serves SPA. `false` serves legacy. Zero-risk rollback.
- **Page-by-page migration.** Each session replaces one legacy page. Legacy page gets deleted when SPA replacement is verified.
- **Supabase client shared.** One `sb` instance, passed via React context. Same queries as legacy JS.
- **Tailwind only.** No custom CSS file. All styles via Tailwind utility classes. Design tokens as Tailwind config.
- **TypeScript strict.** All components typed. No `any` unless wrapping legacy bridge.

## Phase 1: Foundation (3 sessions)

### S1: Build system + routing + shell
- Vite config: build to `dist/spa/`, code split per route
- React Router: all dashboard routes + admin routes
- Shell layout: nav sidebar, user footer, theme toggle, mobile responsive
- Auth gate: Supabase session check, redirect to login
- Vercel config: `BJ_SPA` feature flag, catch-all rewrite
- Tailwind config: design tokens from legacy CSS variables
- **Exit gate:** SPA serves at `/dashboard` with nav and auth working

### S2: Shared infrastructure
- Supabase context provider (single `sb` instance)
- PostHog provider (capture, identify, feature flags)
- Toast system (success, error, info, warning)
- Skeleton loader system
- Sync engine (port `js/sync.ts` logic to React hook)
- Feature flag hook (`useFeatureFlag`)
- Theme provider (light/dark/auto)
- Credit balance component (nav footer)
- **Exit gate:** All shared hooks and providers working, no legacy bridge needed for infra

### S3: Notification center + real-time
- Notification bell + dropdown
- Notification log page (pagination, filters)
- Notification preferences matrix
- Phone setup + OTP verification
- Escalation timeline
- Quiet hours
- Supabase Realtime subscriptions (pipeline signals, tier changes)
- **Exit gate:** Full notification center working in SPA

## Phase 2: Core User Pages (15 sessions)

### S4–S5: Feed page (2 sessions)
- FeedPage already has 377 lines + 60 components (most complete SPA page)
- Port remaining: query builder pills, saved filters, sort bar, job table, job modal, fraud badges, trust filter, AI content filter, hide/save/apply actions, pagination, merch cards, feed hero stats
- Legacy: `job-feed.js` (2,874), `sort-bar.js` (287), `query-builder.js` (1,059), `us-filter.js` (158)

### S6–S7: Browsers (2 sessions)
- Company browser, location browser, industry browser, filter browser
- Alpha navigation, pill-wall layout, search, include/exclude toggles
- US-Only banners
- Legacy: `keywords.js` (4,377), `browsers.js` (1,374), `location.js` (1,948)

### S8–S9: Resumes (2 sessions)
- Resume grid, upload zone, PDF/DOCX parsing
- Score panel (AI scoring, gap analysis)
- Rewrite panel (side panel, diff view, Q&A)
- Resume archive reconciliation
- Resume metrics
- Legacy: `resumes.js` (1,811), `rewrite.js` (811), `resume-archive.js` (305), `resume-metrics.js` (274)

### S10: Resume Builder (1 session)
- Template selector, section editor, live preview
- Export to DOCX/PDF
- Legacy: `resume-builder.js` (953)

### S11–S12: Pipeline + Applications (2 sessions)
- Pipeline stages (accordion, drag-to-move)
- Signal cards (confirm/dismiss/snooze/correct)
- Application queue + history tables
- Score gate modal
- Pending applications cards
- Apply workflow (auto/manual/one-click modes)
- Legacy: `pipeline.js` (1,880), `applications.js` (968), `apply-workflow.js` (2,535)

### S13: Tuning (1 session)
- Tuning cards (collapsible)
- Level hierarchy editor
- Remote/salary/date preferences
- Job count previews
- Legacy: `tuning.js` (1,528)

### S14: Stats (1 session)
- ECharts integration (lazy-loaded)
- Filter pills, period toggle
- Resume metrics tab, overlay analytics tab
- Legacy: `stats.js` (1,301), `overlay-analytics.js` (249)

### S15: Chat (1 session)
- Chat interface with message history
- Filter extraction from AI responses
- Mode toggle (filters ↔ chat)
- Legacy: `chat.js` (1,658)

### S16: Settings (1 session)
- Appearance (theme toggle)
- Account (change password, export, delete)
- Applicant profile (name, email, phone, EEOC)
- Apply settings (mode, resume, daily limit)
- Legacy: `settings.js` (1,157)

### S17: Billing (1 session)
- Plan card, credit balance, usage breakdown
- Tier selector (Free/Starter/Pro + annual toggle)
- Credit packs + auto-refill
- Stripe checkout + customer portal
- Hire fee (PAYL)
- Legacy: `billing.js` (712), `upgrade.js` (276), `payl.js` (195), `trial-gate.js` (186)

### S18: Referrals (1 session)
- Referral hub (link, code, sharing)
- Outreach tracking (status, channels)
- Correlation stats
- Legacy: `referrals.js` (1,056), `referral-outreach.js` (515)

## Phase 3: Admin Pages (10 sessions)

### S19: Admin shell + core
- Admin layout, tab system, period toggles
- User management, health dashboard
- Legacy: `admin.js` (1,199), `admin-shell.js` (292)

### S20: Admin notifications + analytics
- Notification admin panel
- Notification analytics
- Legacy: `admin-notifications.js` (2,713), `admin-notif-analytics.js` (690)

### S21: Admin SEO + content
- GSC integration, entity extraction, CWV
- Content management, editorial
- Legacy: `admin-seo.js` (1,506), `admin-content.js` (184)

### S22: Admin biz ops + compliance
- Business operations dashboard
- Compliance checks
- Legacy: `admin-biz-ops.js` (951), `admin-compliance.js` (882)

### S23: Admin deploy + monitoring
- Deploy tracker, command center, reports, alerting, visibility
- Monitoring, capacity, DB activity
- Legacy: 7 files, ~2,100 lines total

### S24: Admin jobs + enrichment + companies
- Job management, enrichment pipeline
- Company data
- Legacy: `admin-jobs.js` (375), `admin-enrichment.js` (383), `admin-companies.js` (286)

### S25: Admin financial
- Stripe dashboard, revenue, cohort pricing, cost monitor
- Legacy: `admin-stripe.js` (336), `admin-revenue.js` (172), `admin-cohort-pricing.js` (378), `admin-cost-monitor.js` (153)

### S26: Admin AI + errors
- CrewAI dashboard, EF health, client errors, error replay
- Legacy: `admin-crewai.js` (522), `admin-ef-health.js` (239), `admin-client-errors.js` (414), `admin-error-replay.js` (214)

### S27: Admin remaining
- Merchandising, killswitch, AB tests, templates, blocks
- Autosubmit, ghost, signals, chat analytics, build analytics
- Feed health, cache health, referrals, PAYL, email, subscription
- Legacy: ~15 files, ~3,600 lines total

### S28: Admin cleanup + verification
- Cross-panel navigation
- Admin feature flags
- Full regression test

## Phase 4: Cutover (5 sessions)

### S29: Integration testing
- Full user flow: signup → setup → filter → score → apply → pipeline → billing
- Mobile responsive verification
- Dark mode verification

### S30: Performance
- Lighthouse audit, bundle size optimization
- Code split verification (each route lazy-loaded)
- Prefetch critical routes

### S31: Legacy bridge removal
- Remove all `window.` global bridges
- Remove legacy `js/` files from build
- Remove `dashboard.html` and `admin.html`
- Update CI gates

### S32: Vercel cutover
- Set `BJ_SPA=true` in production
- Monitor error rates for 24h
- Keep legacy available at `/dashboard-legacy` for 2 weeks

### S33: Cleanup
- Delete legacy files
- Update HANDOFF.md, ROADMAP.md
- Update pod documentation
- Final architecture fitness score

## Session Estimates

| Phase | Sessions | Focus |
|---|---|---|
| Foundation | 3 | Build system, routing, shell, infra |
| Core pages | 15 | All user-facing dashboard pages |
| Admin pages | 10 | All admin panels |
| Cutover | 5 | Testing, performance, deploy, cleanup |
| **Total** | **33** | |

Buffer for unknowns: +7 sessions (edge cases, legacy quirks, merge conflicts with ongoing feature work).

**Realistic total: 33–40 sessions.**

## Rules of Engagement

1. **One page per session.** Port it, test it, delete the legacy version. No partial ports.
2. **No legacy bridges.** If a component needs data, it queries Supabase directly. No `window.` globals.
3. **Tailwind only.** Zero custom CSS. If a pattern repeats, extract a Tailwind component class.
4. **TypeScript strict.** No `any`. Type every prop, hook return, and API response.
5. **Tests per page.** Each ported page gets component tests before the legacy version is deleted.
6. **Version bump every session.** No changes without a version increment.
7. **Feature flag always.** SPA never goes live until Phase 4 S32. All development behind `BJ_SPA=true`.

## Priority Order (if interrupted)

If you can only do 10 sessions post-launch, do these:
1. S1: Foundation (must have)
2. S2: Shared infra (must have)
3. S4–S5: Feed (highest traffic page)
4. S16: Settings (user config)
5. S17: Billing (revenue path)
6. S11–S12: Pipeline + Applications (core tracking)
7. S18: Referrals (growth)
8. S13: Tuning (user config)

That gives you the 8 most important pages in 10 sessions. Admin stays legacy — nobody sees it but you.

## Current State (v9.44)

- SPA scaffold exists: `src/app/`, Vite, React Router, 12 page stubs
- Feed page is ~30% ported (FeedPage.tsx + FilterBuilder + hooks)
- All other pages are stubs (<100 lines each)
- **932 commits** of features added to legacy since SPA was built
- SPA is effectively a fresh start using existing stubs as scaffolding
