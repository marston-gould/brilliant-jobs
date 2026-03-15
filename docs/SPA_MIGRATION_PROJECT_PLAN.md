# Platform Migration Project Plan

## Purpose

Transform Brilliant Jobs from a single-product job search dashboard into a **multi-vertical lead generation platform**. The UI layer (currently a 4000-line HTML monolith) gets replaced with a React + TypeScript + Tailwind SPA where every component is split into a **generic platform shell** and a **domain config**. Standing up a new vertical (senior care, gated communities, etc.) becomes a recipe: create a domain config, supply the data source, deploy.

## Why

1. **Multi-vertical revenue.** Same engine, different data. Job search is vertical #1. Senior care, gated communities, and others follow without rebuilding the platform.
2. **CrewAI operations.** AI agents operate through admin panels. They need typed, isolated, predictable components — not a 4000-line HTML file.
3. **AI-maintainability.** Isolated typed components are what AI agents can reliably read, modify, and extend.
4. **Valuation.** "Platform that powers multiple verticals" commands a fundamentally different multiple than "single-product job board."
5. **Launch speed.** First vertical took 3,684 commits across 35 days. Second vertical should take 1 week.

## Architecture: Platform + Domain Config

### The Split

Every component in the system gets split into two layers:

```
┌─────────────────────────────────────────────┐
│  Domain Config (per vertical)               │
│  - Data source, schema, labels, stages      │
│  - Scoring rubric, match criteria           │
│  - Pipeline stages, signal types            │
│  - Browse dimensions, filter fields         │
│  - Outreach actions, CTA labels             │
│  - Branding (logo, colors, name)            │
├─────────────────────────────────────────────┤
│  Platform Shell (shared across verticals)   │
│  - Search engine (query, filter, sort, page)│
│  - Scoring engine (AI match framework)      │
│  - Pipeline engine (stages, signals, moves) │
│  - Outreach engine (actions, tracking)      │
│  - Notification engine (channels, prefs)    │
│  - Billing engine (credits, subs, Stripe)   │
│  - Admin engine (users, analytics, ops)     │
│  - Auth, routing, real-time, sync           │
└─────────────────────────────────────────────┘
```

### Domain Config Shape

Every vertical is defined by a single TypeScript config file:

```typescript
// src/domains/brilliant-jobs/domain.config.ts
export const domain: DomainConfig = {
  id: 'brilliant-jobs',
  name: 'Brilliant Jobs',
  tagline: 'Your market. Your numbers.',
  logo: '/img/bj-logo.svg',
  theme: { accent: '#4d8eff', accentHover: '#2e76ea' },

  // Data
  entityName: 'job',
  entityNamePlural: 'jobs',
  dataTable: 'connections',
  profileType: 'resume',
  profileTable: 'user_resumes',

  // Search
  searchDimensions: [
    { key: 'title', label: 'What', type: 'keyword', placeholder: 'Job titles, skills...' },
    { key: 'company', label: 'Who', type: 'entity', browseable: true },
    { key: 'location', label: 'Where', type: 'location' },
    { key: 'salary', label: 'Pay', type: 'range', unit: '$' },
    { key: 'level', label: 'Level', type: 'hierarchy' },
    { key: 'when', label: 'When', type: 'date_range' },
  ],
  sortFields: ['title', 'company', 'location', 'salary', 'days', 'level', 'ghost'],
  defaultSort: [{ field: 'days', dir: 'asc' }],

  // Scoring
  scoring: {
    profileVsEntity: true,
    dimensions: ['skills', 'experience', 'industry', 'location'],
    weights: { skills: 40, experience: 30, industry: 20, location: 10 },
    model: 'claude-haiku-4-5-20251001',
  },

  // Pipeline
  pipeline: {
    stages: [
      { id: 'saved', label: 'Saved', color: '#3b82f6' },
      { id: 'applied', label: 'Applied', color: '#8b5cf6' },
      { id: 'responded', label: 'Responded', color: '#06b6d4' },
      { id: 'interviewing', label: 'Interviewing', color: '#f59e0b' },
      { id: 'offer', label: 'Offer', color: '#22c55e' },
      { id: 'hired', label: 'Hired', color: '#10b981' },
      { id: 'rejected', label: 'Rejected', color: '#ef4444' },
      { id: 'archived', label: 'Archived', color: '#6b7280' },
    ],
    signalTypes: ['ACK', 'REJ-PRE', 'INT', 'REJ-POST', 'OFFER', 'RESCHED', 'CAL-INT', 'CAL-OFFER'],
    autoAdvanceEnabled: true,
  },

  // Outreach
  outreach: {
    primaryAction: { label: 'Apply', icon: 'send' },
    secondaryAction: { label: 'Save', icon: 'bookmark' },
    modes: ['manual', 'one-click', 'auto-apply', 'score-gated', 'auto-score-gate'],
    referralEnabled: true,
  },

  // Browse
  browsers: [
    { dimension: 'company', label: 'Company Browser', icon: 'building' },
    { dimension: 'location', label: 'Location Browser', icon: 'map-pin' },
    { dimension: 'industry', label: 'Industry Browser', icon: 'briefcase' },
    { dimension: 'title', label: 'Title Browser', icon: 'tag' },
  ],

  // Intelligence
  intelligence: {
    emailScanEnabled: true,
    calendarScanEnabled: true,
    classifierPromptKey: 'job_application_classifier',
  },

  // Entity display
  entityCard: {
    titleField: 'title',
    subtitleField: 'company_name',
    locationField: 'location',
    priceField: 'salary',
    priceLabel: 'Salary',
    dateField: 'posted_at',
    dateLabel: 'Posted',
    badgeField: 'level',
    sourceField: 'ats_source',
  },
};
```

### Example: Senior Care Vertical

```typescript
// src/domains/senior-care/domain.config.ts
export const domain: DomainConfig = {
  id: 'senior-care',
  name: 'CareMatch',
  tagline: 'Find the right care. On your terms.',
  logo: '/img/carematch-logo.svg',
  theme: { accent: '#0ea5e9', accentHover: '#0284c7' },

  entityName: 'facility',
  entityNamePlural: 'facilities',
  dataTable: 'facilities',
  profileType: 'care_assessment',
  profileTable: 'user_care_profiles',

  searchDimensions: [
    { key: 'care_type', label: 'Care Type', type: 'keyword', placeholder: 'Assisted living, memory care...' },
    { key: 'provider', label: 'Provider', type: 'entity', browseable: true },
    { key: 'location', label: 'Location', type: 'location' },
    { key: 'cost', label: 'Cost', type: 'range', unit: '$/mo' },
    { key: 'rating', label: 'Rating', type: 'range', unit: '★' },
  ],
  sortFields: ['name', 'provider', 'location', 'cost', 'rating', 'beds'],
  defaultSort: [{ field: 'rating', dir: 'desc' }],

  scoring: {
    profileVsEntity: true,
    dimensions: ['care_needs', 'budget', 'location', 'amenities'],
    weights: { care_needs: 40, budget: 30, location: 20, amenities: 10 },
    model: 'claude-haiku-4-5-20251001',
  },

  pipeline: {
    stages: [
      { id: 'saved', label: 'Saved', color: '#3b82f6' },
      { id: 'inquired', label: 'Inquired', color: '#8b5cf6' },
      { id: 'toured', label: 'Toured', color: '#f59e0b' },
      { id: 'applied', label: 'Applied', color: '#06b6d4' },
      { id: 'accepted', label: 'Accepted', color: '#22c55e' },
      { id: 'moved_in', label: 'Moved In', color: '#10b981' },
      { id: 'declined', label: 'Declined', color: '#ef4444' },
    ],
    signalTypes: ['ACK', 'TOUR-CONFIRM', 'TOUR-CANCEL', 'WAITLIST', 'ACCEPTED', 'DECLINED'],
    autoAdvanceEnabled: false,
  },

  outreach: {
    primaryAction: { label: 'Request Info', icon: 'mail' },
    secondaryAction: { label: 'Save', icon: 'bookmark' },
    modes: ['manual'],
    referralEnabled: false,
  },

  browsers: [
    { dimension: 'provider', label: 'Provider Browser', icon: 'building' },
    { dimension: 'location', label: 'Location Browser', icon: 'map-pin' },
    { dimension: 'care_type', label: 'Care Type Browser', icon: 'heart' },
  ],

  intelligence: {
    emailScanEnabled: false,
    calendarScanEnabled: false,
    classifierPromptKey: null,
  },

  entityCard: {
    titleField: 'name',
    subtitleField: 'provider_name',
    locationField: 'location',
    priceField: 'monthly_cost',
    priceLabel: 'Monthly',
    dateField: 'updated_at',
    dateLabel: 'Updated',
    badgeField: 'care_type',
    sourceField: 'source',
  },
};
```

### How Components Consume Config

```typescript
// Platform component — domain-agnostic
function SearchBar() {
  const { searchDimensions, entityNamePlural } = useDomain();
  return (
    <div className="flex flex-col gap-2">
      {searchDimensions.map(dim => (
        <FilterRow key={dim.key} dimension={dim} />
      ))}
      <span className="text-xs text-gray-400">
        Search {entityNamePlural}
      </span>
    </div>
  );
}

// Platform component — domain-agnostic
function PipelineBoard() {
  const { pipeline } = useDomain();
  return (
    <div className="flex flex-col gap-4">
      {pipeline.stages.map(stage => (
        <StageSection key={stage.id} stage={stage} />
      ))}
    </div>
  );
}

// Domain provider wraps the app
function App() {
  const domain = loadDomain(); // reads from env or URL
  return (
    <DomainProvider config={domain}>
      <RouterProvider router={router} />
    </DomainProvider>
  );
}
```

## New Vertical Recipe

When standing up a new vertical:

1. **Create domain config** — `src/domains/[name]/domain.config.ts` (~200 lines)
2. **Create data schema** — Supabase migration for the entity table + profile table
3. **Create scoring prompt** — Anthropic system prompt for profile-vs-entity matching
4. **Create classifier prompt** — (optional) Email signal classification for this vertical
5. **Set env vars** — `DOMAIN=senior-care` in Vercel, Supabase secrets
6. **Deploy** — Same repo, different env var. Vercel preview branch per domain, or separate Vercel projects pointing at same repo.

**No code changes to platform components.** The config drives everything.

**Estimated time per new vertical: 3–5 sessions** (schema + scoring prompt + data ingestion + testing). Compare to the 3,684 commits for vertical #1.

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

- Supabase schema, EFs, migrations (parameterized by domain where needed)
- Chrome extension (job search only for now)
- Fly.io worker
- Vercel routing (except adding SPA catch-all + domain routing)
- API gateway routes
- CI pipeline (add Vite build step)
- Git repo (same repo, `src/app/` directory)

## Architecture Decisions

- **Same repo.** No new repo. SPA lives in `src/app/`, builds to `dist/spa/`.
- **Feature flag cutover.** `BJ_SPA=true` env var in Vercel serves SPA. `false` serves legacy.
- **Domain config drives everything.** No hardcoded entity names in platform components.
- **One Supabase project, domain column.** Shared tables get a `domain` column. Domain-specific tables prefixed (e.g., `bj_connections`, `cm_facilities`).
- **Tailwind only.** No custom CSS. Design tokens in Tailwind config, themed by domain.
- **TypeScript strict.** All components typed. No `any`.

## Revised Phase Plan

### Phase 0: Platform Extraction (3 sessions)

#### S1: Domain config type system
- Define `DomainConfig` TypeScript interface (all fields, all types)
- Create `src/domains/brilliant-jobs/domain.config.ts`
- Create `DomainProvider` React context + `useDomain()` hook
- Create domain loader (reads `DOMAIN` env var, imports matching config)
- Create `src/domains/_template/domain.config.ts` — blank recipe starter
- **Exit gate:** `useDomain().entityName` returns `'job'` in dev

#### S2: Platform component contracts
- Define TypeScript interfaces for every platform component's props
- Split existing SPA components (feed, pipeline, etc.) into shell + domain
- Create `useSearch()`, `usePipeline()`, `useScoring()` hooks that read from domain config
- All Supabase queries parameterized by domain config (table names, field names)
- **Exit gate:** Feed page renders using domain config, not hardcoded field names

#### S3: Multi-domain infrastructure
- Vercel config: domain-based routing (env var per deploy)
- Supabase: schema strategy (domain column on shared tables)
- Branding: theme provider reads from domain config
- Nav: sidebar items driven by domain config (some verticals don't have referrals, etc.)
- **Exit gate:** Same codebase serves two different domain configs with different branding

### Phase 1: Foundation (3 sessions)

#### S4: Build system + routing + shell
- Vite config: build to `dist/spa/`, code split per route
- React Router: all dashboard routes + admin routes
- Shell layout: nav sidebar, user footer, theme toggle, mobile responsive
- Auth gate: Supabase session check, redirect to login
- Vercel config: `BJ_SPA` feature flag, catch-all rewrite
- Tailwind config: design tokens from domain config theme
- **Exit gate:** SPA serves at `/dashboard` with nav and auth working

#### S5: Shared infrastructure
- Supabase context provider (single `sb` instance)
- PostHog provider (capture, identify, feature flags)
- Toast system (success, error, info, warning)
- Skeleton loader system
- Sync engine (port `js/sync.ts` logic to React hook)
- Feature flag hook (`useFeatureFlag`)
- Theme provider (light/dark/auto, domain-themed)
- Credit balance component (nav footer)
- **Exit gate:** All shared hooks and providers working

#### S6: Notification center + real-time
- Notification bell + dropdown
- Notification log page (pagination, filters)
- Notification preferences matrix
- Phone setup + OTP verification
- Escalation timeline, quiet hours
- Supabase Realtime subscriptions (pipeline signals, tier changes)
- **Exit gate:** Full notification center working in SPA

### Phase 2: Admin Pages — CrewAI Operating Surface (10 sessions)

> **These come first.** CrewAI agents operate through admin. This is the surface that must be AI-ready before anything else.

#### S7: Admin shell + core
- Admin layout, tab system, period toggles
- User management, health dashboard
- All admin labels read from domain config
- Legacy: `admin.js` (1,199), `admin-shell.js` (292)

#### S8: Admin notifications + analytics
- Notification admin panel
- Notification analytics
- Legacy: `admin-notifications.js` (2,713), `admin-notif-analytics.js` (690)

#### S9: Admin SEO + content
- GSC integration, entity extraction, CWV
- Content management, editorial
- Legacy: `admin-seo.js` (1,506), `admin-content.js` (184)

#### S10: Admin biz ops + compliance
- Business operations dashboard
- Compliance checks
- Legacy: `admin-biz-ops.js` (951), `admin-compliance.js` (882)

#### S11: Admin deploy + monitoring
- Deploy tracker, command center, reports, alerting, visibility
- Monitoring, capacity, DB activity
- Legacy: 7 files, ~2,100 lines total

#### S12: Admin jobs + enrichment + companies
- Entity management (jobs/facilities/communities — driven by domain config)
- Enrichment pipeline
- Company/provider data
- Legacy: `admin-jobs.js` (375), `admin-enrichment.js` (383), `admin-companies.js` (286)

#### S13: Admin financial
- Stripe dashboard, revenue, cohort pricing, cost monitor
- Legacy: `admin-stripe.js` (336), `admin-revenue.js` (172), `admin-cohort-pricing.js` (378), `admin-cost-monitor.js` (153)

#### S14: Admin AI + errors
- CrewAI dashboard, EF health, client errors, error replay
- Legacy: `admin-crewai.js` (522), `admin-ef-health.js` (239), `admin-client-errors.js` (414), `admin-error-replay.js` (214)

#### S15: Admin remaining
- Merchandising, killswitch, AB tests, templates, blocks
- Autosubmit, ghost, signals, chat analytics, build analytics
- Feed health, cache health, referrals, PAYL, email, subscription
- Legacy: ~15 files, ~3,600 lines total

#### S16: Admin cleanup + verification
- Cross-panel navigation
- Admin feature flags
- Full regression test
- Verify all admin labels use domain config

### Phase 3: Core User Pages (15 sessions)

#### S17–S18: Feed page (2 sessions)
- Query builder reads `searchDimensions` from domain config
- Sort bar reads `sortFields` from config
- Entity card renders using `entityCard` field mapping
- Job table → entity table (column headers from config)
- Legacy: `job-feed.js` (2,874), `sort-bar.js` (287), `query-builder.js` (1,059), `us-filter.js` (158)

#### S19–S20: Browsers (2 sessions)
- Browser list driven by `browsers` config array
- Dimension name, icon, label all from config
- Alpha navigation, pill-wall, search, include/exclude toggles
- US-Only banner → location-specific banner (domain-configurable)
- Legacy: `keywords.js` (4,377), `browsers.js` (1,374), `location.js` (1,948)

#### S21–S22: Resumes / Profiles (2 sessions)
- "Resume" → `profileType` from config ("resume", "care_assessment", "buyer_profile")
- Upload, parse, score against entity
- Rewrite panel (job-specific, optional per domain)
- Legacy: `resumes.js` (1,811), `rewrite.js` (811), `resume-archive.js` (305)

#### S23: Resume/Profile Builder (1 session)
- Template selector, section editor, live preview
- Sections driven by profile type config
- Legacy: `resume-builder.js` (953)

#### S24–S25: Pipeline + Applications (2 sessions)
- Stage names, colors, transitions from `pipeline.stages` config
- Signal types from `pipeline.signalTypes` config
- Outreach modes from `outreach.modes` config
- "Apply" → `outreach.primaryAction.label`
- Legacy: `pipeline.js` (1,880), `applications.js` (968), `apply-workflow.js` (2,535)

#### S26: Tuning (1 session)
- Tuning cards, hierarchy editor, preferences
- Dimension labels from domain config
- Legacy: `tuning.js` (1,528)

#### S27: Stats (1 session)
- ECharts (lazy-loaded), filter pills, period toggle
- Axis labels and metrics named by domain
- Legacy: `stats.js` (1,301), `overlay-analytics.js` (249)

#### S28: Chat (1 session)
- Chat interface, filter extraction
- Prompt templates parameterized by domain
- Legacy: `chat.js` (1,658)

#### S29: Settings (1 session)
- Appearance, account, profile form
- Profile form fields driven by `profileType` config
- Legacy: `settings.js` (1,157)

#### S30: Billing (1 session)
- Plan card, credits, Stripe checkout
- Credit actions labeled by domain ("score a job" vs "score a facility")
- Legacy: `billing.js` (712), `upgrade.js` (276), `payl.js` (195), `trial-gate.js` (186)

#### S31: Referrals (1 session)
- Referral hub, outreach tracking
- Only renders if `outreach.referralEnabled` is true in config
- Legacy: `referrals.js` (1,056), `referral-outreach.js` (515)

### Phase 4: Cutover (5 sessions)

#### S32: Integration testing
- Full user flow: signup → setup → search → score → pipeline → billing
- Mobile responsive verification
- Dark mode verification

#### S33: Performance
- Lighthouse audit, bundle size optimization
- Code split verification (each route lazy-loaded)
- Prefetch critical routes

#### S34: Legacy bridge removal
- Remove all `window.` global bridges
- Remove legacy `js/` files from build
- Remove `dashboard.html` and `admin.html`
- Update CI gates

#### S35: Vercel cutover
- Set `BJ_SPA=true` in production
- Monitor error rates for 24h
- Keep legacy at `/dashboard-legacy` for 2 weeks

#### S36: Cleanup
- Delete legacy files
- Update HANDOFF.md, ROADMAP.md
- Final architecture fitness score

### Phase 5: Second Vertical Proof (3 sessions)

#### S37: Domain config + schema
- `src/domains/senior-care/domain.config.ts` (or gated communities)
- Supabase migration for entity table + profile table
- Scoring prompt for profile-vs-entity matching

#### S38: Data ingestion
- Scraper/API integration for entity data
- Seed data for testing

#### S39: Verification
- Full flow: search → score → pipeline → outreach
- Confirm zero platform code changes needed
- **Exit gate:** Second vertical works end-to-end with only config + schema + data

## Session Estimates

| Phase | Sessions | Focus |
|---|---|---|
| Platform extraction | 3 | Domain config, component contracts, multi-domain infra |
| Foundation | 3 | Build system, routing, shell, shared infra, notifications |
| Admin pages | 10 | CrewAI operating surface |
| Core user pages | 15 | All user-facing dashboard pages |
| Cutover | 5 | Testing, performance, deploy, cleanup |
| Second vertical proof | 3 | End-to-end new vertical with zero platform code changes |
| **Total** | **39** | |

Buffer: +6 sessions for unknowns.

**Realistic total: 39–45 sessions for platform + first vertical migration + second vertical proof.**

**Each additional vertical after that: 3–5 sessions.**

> **Why admin first:** CrewAI agents will operate the website through admin panels. They need typed, isolated React components they can reliably read and modify. The legacy admin (47 vanilla JS files, 20K lines) is the worst surface for AI agents to work on.

## Rules of Engagement

1. **Every component is domain-agnostic.** If you type the word "job" in a platform component, you're doing it wrong. Use `useDomain().entityName`.
2. **Config is the contract.** If a component needs data, it reads from domain config. If domain config doesn't have the field, add it to the interface.
3. **One page per session.** Port it, test it against domain config, delete legacy.
4. **Tailwind only.** Zero custom CSS.
5. **TypeScript strict.** No `any`.
6. **Version bump every session.**
7. **Feature flag always.** SPA never goes live until Phase 4 S35.
8. **Recipe test.** After Phase 3, create a dummy vertical config to verify no hardcoded domain logic leaked into platform components.

## Priority Order (if interrupted)

If you can only do 15 sessions:
1. S1–S3: Platform extraction (must have — this is the whole point)
2. S4–S6: Foundation + infra
3. S7–S16: Admin (CrewAI needs this)
4. Stop. Ship admin as SPA, user dashboard stays legacy.

That gives you a platform-ready admin in 16 sessions. User pages migrate later.

## Domain Ideas Backlog

| Vertical | Entity | Profile | Match | Pipeline |
|---|---|---|---|---|
| **Brilliant Jobs** | Job listing | Resume | Skills/experience vs JD | Applied → Interview → Offer |
| **Senior Care** | Care facility | Care needs assessment | Needs/budget vs capabilities | Inquiry → Tour → Move-in |
| **Gated Communities** | Community/home | Buyer preferences | Budget/lifestyle vs amenities | Inquiry → Visit → Contract |
| **Pet Adoption** | Animal listing | Adopter profile | Lifestyle vs animal needs | Interested → Meet → Adopt |
| **Tutoring** | Tutor profile | Student needs | Subject/level vs expertise | Inquiry → Trial → Enroll |
| **Contractors** | Contractor | Project scope | Scope/budget vs specialties | Bid → Interview → Hire |

Each follows the same pattern: **search → score → track → act**. The platform handles all of it. The config makes it specific.

## Current State (v9.44)

- SPA scaffold exists: `src/app/`, Vite, React Router, 12 page stubs
- Feed page ~30% ported (FeedPage.tsx + FilterBuilder + hooks)
- All other pages are stubs (<100 lines each)
- **932 commits** of features added to legacy since SPA was built
- SPA is effectively a fresh start using existing stubs as scaffolding
- Legacy dashboard works but is unmaintainable at scale
- Admin is 47 vanilla JS files (20K lines) with no SPA equivalent
