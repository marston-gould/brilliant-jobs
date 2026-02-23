# Brilliant Jobs — Architecture Hardening Roadmap

**Last updated:** 2026-02-22
**Target launch:** March 2026
**Current version:** v3.80

---

## Phase A: Pre-Launch Critical ✅ COMPLETE

**Estimated:** ~19h | **Actual:** ~5h | **Completed:** 2026-02-19

### Sprint 1: Security Foundation ✅

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| A1 | RLS on ats_jobs (migration 001) | 30min | 0min | ✅ | Already applied. Verified in audit. |
| A2 | RLS on ALL remaining tables | 2h | 30min | ✅ | All 20 tables confirmed. +6 gap-fill policies. |
| A9 | Security headers (vercel.json) | 30min | 15min | ✅ | CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy. |
| A10 | DOMPurify XSS protection | 1h | 45min | ✅ | Sanitizes 5 innerHTML injection points for ATS job descriptions. |

### Sprint 2: Schema Foundations ✅

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| A3 | `role` + `plan` on profiles | 1h | 15min | ✅ | Roles: user/admin/service. Plans: free/pro/enterprise. Admin RLS. |
| A4 | audit_log table | 1h | 15min | ✅ | Append-only. Admin-readable. Indexed on user, action, resource. |
| A5 | Idempotency keys | 1h | 10min | ✅ | `idempotency_key` on notification_log + UNIQUE on notification_actions. |
| A11 | plans + subscriptions tables | 2h | 20min | ✅ | 3 tiers seeded. Stripe fields ready. Adversarial review passed. |

### Sprint 3: Feature Gating + Resilience ✅

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| A12 | Feature gating RPC | 2h | 20min | ✅ | `check_feature()` enforces 8 plan-gated features server-side. |
| A6 | Timeouts + retries (all external calls) | 3h | 45min | ✅ | Shared resilience.ts. Applied to Resend, Vonage, ATS APIs, LinkedIn. |

### Sprint 4: Observability ✅

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| A8 | Structured logging | 2h | 30min | ✅ | Shared logger.ts — JSON output, correlation IDs, duration tracking. |
| A7 | Health check endpoint | 1h | 30min | ✅ | Checks DB, job pipeline, live jobs, notification failure rate. |
| A13 | PostHog tracking | 2h | 15min | ✅ | JS snippet added. Gated — inactive until API key is configured. |

### Phase A Manual Action Items

| # | Action | Owner | Status |
|---|--------|-------|--------|
| M1 | Deploy `health-check` Edge Function | CEO | ✅ |
| M2 | Deploy updated `send-notification`, `refresh-jobs`, `validate-signup` Edge Functions | CEO | ✅ |
| M3 | Create PostHog project → set `window.POSTHOG_API_KEY` in globals.js | CEO | ✅ | PostHog project 318006 active |
| M4 | Verify Vercel deploy completed (security headers + DOMPurify live) | CEO | ✅ |

### Phase A Key Decisions

- CSP uses `unsafe-inline`/`unsafe-eval` (required by vanilla JS architecture — tighten to nonce-based post-launch)
- DOMPurify config allows HTML formatting but strips all scripts/event handlers
- Feature gating falls through: active subscription → profiles.plan → free default
- PostHog configured for US cloud, identified-only person profiles (privacy-first)
- A13 is the only item that could have been deferred — kept it in since it was 15 minutes

---

## Phase B: Post-Launch Foundation (Month 1-2)

| # | Item | Est. | Status | Dependencies |
|---|------|------|--------|-------------|
| B1 | Migrate localStorage data to Supabase | 8h | ✅ | Pre-existing — saveUserData() sync layer covers all 11 keys |
| B2 | Create job_queue table + worker pattern | 4h | ✅ | claim_queue_job/complete_queue_job RPCs, FOR UPDATE SKIP LOCKED |
| B3 | Move email/SMS sending through queue | 4h | ✅ | enqueue_notification() + queue-worker Edge Function |
| B4 | Add soft deletes to user tables | 2h | ✅ | deleted_at on profiles/connections/resumes/companies/company_collections |
| B5 | Add usage_events tracking | 3h | ✅ | usage_events table + log_usage_event() with rate limiting |
| B6 | Create data export endpoint | 3h | ✅ | data-export Edge Function — 13 tables, admin override, audit logged |
| B7 | Create account deletion flow | 3h | ✅ | account-delete Edge Function — soft delete + 30-day grace + cancel |
| B8 | Set up Supabase CLI migrations | 2h | ✅ | supabase/config.toml committed |
| B9 | Create baseline migration | 4h | ✅ | 20260219000000_baseline.sql — full Phase A+B schema |
| B10 | Add missing indexes | 2h | ✅ | 7 indexes added (location, source+status, user composites, refresh) |
| B11 | Set up monitoring + alerts | 3h | ✅ | monitoring_alerts table + evaluate_alerts() — 3 automated checks |
| B12 | Stripe integration | 8h | ✅ | Phase H complete — webhook, checkout, credit system, subscription management. See Phase H. |

**Phase B total estimate:** ~46h | **Actual:** ~3h | **Status:** 12/12 complete (B12 built in Phase H)

---

## Phase C: Scale Readiness (Month 3-6)

| # | Item | Est. | Status |
|---|------|------|--------|
| C1 | Move resumes to Supabase Storage | 4h | ✅ | Pre-existing — resumes bucket + user_id/ folder structure already in place |
| C2 | Add orphaned file cleanup | 2h | ✅ | cleanup-orphans Edge Function — 7-day grace, audit logged |
| C3 | Set up staging environment | 4h | ✅ | Vercel preview deployments + docs/STAGING.md |
| C4 | CI/CD pipeline for migrations | 3h | ✅ | .github/workflows/deploy.yml — auto-migrate + auto-deploy functions |
| C5 | Add feature flags table | 2h | ✅ | feature_flags table + is_feature_enabled() with rollout/plan/user gating |
| C6 | Implement rate limiting | 3h | ✅ | rate_limits table + check_rate_limit_for_user() plan-aware |
| C7 | Correlation IDs across all functions | 3h | ✅ | _shared/middleware.ts withCorrelation() wrapper |
| C8 | Containerize build | 2h | ✅ | Dockerfile + .dockerignore |
| C9 | Pagination audit + fix all unbounded queries | 3h | ✅ | Audit complete — all queries have .limit()/.single()/.range() |
| C10 | Server-side caching (materialized views) | 3h | ✅ | 3 materialized views + get_landing_stats() RPC + refresh function |

---

## Phase D: Product Features — Pre-Launch Sprint (February 2026)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| D1 | Stats Page Redesign | 2d | 1h | ✅ | Theme tokens extracted (_T object), 15+ hardcoded colors/fonts → STATS_THEME. Loading state via CSS class. Inline styles removed from HTML. |
| D2 | ATS Board Health (Admin Panel) | 2d | 1h | ✅ | Migration 004: last_http_status + last_refresh_at on ats_companies. Admin RPCs (get_board_health, get_board_health_by_platform). Admin page with 5 stat cards, delta badges, period toggle, platform table. |
| D3 | Landing Page Phase 1 | 4d | 1h | ⏳ | Interactive preview (replaces static demo), hero ghost CTA, walkthrough carousel (6 slides), 8 PostHog events. **Blocked:** 5 screenshot assets. |
| D4 | Cohort Phase B — Session Analytics | 2d | 30min | ✅ | Migration 005: user_sessions table + RLS. create_session/session_heartbeat RPCs. PostHog bridge (bj_session_id, bj_cohort_id, bj_plan_id super properties). sessionStorage-scoped, 5-min heartbeat. Client-side wiring complete in v3.40. |
| D5 | Edge Function: refresh-jobs v12 | 0.5d | 10min | ✅ | Records last_http_status + last_refresh_at on every board fetch. Timeout → status 0. Deployed. |
| D6 | Edge Function: preview-jobs | 0.5d | 5min | ✅ | New function for landing page preview. Deployed via Supabase CLI. |
| D7 | Walkthrough screenshots (5x) | 0.5d | — | 🔲 | CPO: feed.webp, match.webp, stats.webp, pipeline.webp, notifications.webp → /img/walkthrough/ |
| D8 | Admin panel fixes | 0.5d | 30min | ✅ | RPC auth fix (service_role + auth.uid), query optimization (304K rows → indexed single-pass), platform RPC fixed. 3 indexes added (status, first_seen, closed_at). Admin panel now shows live data. |
| D9 | Version unification | 0.25d | 10min | ✅ | Single BJ_VERSION constant in app.js drives console + nav. No more hardcoded version in HTML. v2.91. |
| D10 | Data pages: CTAs + Data Lab link + level fix | 0.5d | 20min | ✅ | Signup CTA on all 6 data pages + hub. Eyebrow "Data Lab" now links to /data-lab. Salary level order fixed: Manager before Lead. |
| D11 | Data pages: live data + security | 4d | 2h | ✅ | Planning + initial wiring. Actual deployment completed in F5–F7 (v3.39). |

**Phase D status:** 10/11 complete. D3 blocked on screenshots (CPO). D7 blocked on screenshots (CPO).

---

## Phase E: Feb 21 Feature Sprint (v2.86 → v3.29)

**34 version bumps in one day.** Two sessions covering data fixes, chart improvements, AI features, and admin tooling.

### Sprint 0: Stats Redesign + Perf + Market Dynamics (v2.68–v2.85) — Feb 20

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| E0a | Stats page redesign (10 iterations) | v2.68–v2.77 | ✅ | From donuts to bars. Location/seniority/salary/industry/work-type charts. Continuous 12-week timeline. Filter pill styling. Light theme compat. Per Pod 1 brief. |
| E0b | Console cleanup + dead listing detection | v2.78 | ✅ | enrich-job 401 fix (anon key). Greenhouse-only API gating. Dead ATS listing fallback. Mixed content CSP. |
| E0c | Perf + accessibility audit | v2.79 | ✅ | Deferred ECharts. Non-blocking fonts. Main landmark. AA contrast (4 badge colors). Link underlines. Custom ECharts build (43% smaller). |
| E0d | Feed improvements | v2.80 | ✅ | Remove Source column. Salary parser (space-separated thousands, standalone rates, currency codes). Exclude hourly toggle. US-only filter (38 country names). |
| E0e | Market Dynamics page | v2.80–v2.86 | ✅ | New /market-dynamics: Industry×Dept heatmap, Dept×Level heatmap, US State choropleth. Timeline animation. SVG choropleth with GeoJSON. 3 materialized views. |
| E0f | PSI automation | — | ✅ | Weekly GitHub Action against sitemap. Tracks 6 metrics. Regression detection. |
| E0g | Badge contrast (WCAG AA) | — | ✅ | 4 badge colors lightened to 4.5:1+ ratio. CLS fix (min-height on summary). |

### Sprint 1: Data Fixes & Admin Foundation (v2.86–v2.95)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| E1 | Metro count fix | v2.86 | ✅ | Fixed data.locations→data.metros reference. Updated fallback stats. |
| E2 | Data Lab rename + treemap/funnel fix | v2.87 | ✅ | job-market-data → data-lab. Fixed missing ECharts modules for treemap + funnel. Salary color, seniority, map, cross-nav fixes. |
| E3 | Standardize counts across all pages | v2.88 | ✅ | Unified: 285K jobs, 10K companies, 21K salary. No more inconsistencies. |
| E4 | Admin panel + session analytics + stats redesign | v2.90 | ✅ | Board health stat cards, session analytics (Cohort Phase B), stats theme tokens. |
| E5 | Tab restore fix | v2.91 | ✅ | initAdminPage/initStatsPage on tab restore. Debug breadcrumbs fixed. |
| E6 | Admin tabbed console (5 tabs) | v2.92 | ✅ | Feed Health, Cohorts, Users, SEO, Revenue tabs. Lazy-loaded content. |
| E7 | ref_city_radius cache | v2.93 | ✅ | Static JSON (210 rows, 23KB). No more Supabase queries per keystroke. |
| E8 | AI resume scoring + market-dynamics security | v2.94 | ✅ | score-resume Edge Function (Claude Haiku). 6-dimension analysis. Pro/Free gating, 20/day limit. SECURITY DEFINER RPC for market-dynamics. |
| E9 | Resume selector dropdown | v2.95 | ✅ | Choose which resume to analyze in readiness panel. |

### Sprint 1.5: AI Scoring UX + Data Page Polish (v2.96–v3.19)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| E9a | AI readiness + resume card redesign | v2.96–v2.97 | ✅ | AI readiness scoring. Resume names as hero element. Grade display cleanup. |
| E9b | Comprehensive AI scoring + per-resume analyze | v2.98–v3.00 | ✅ | 6-dimension analysis. Per-resume + Analyze All. Analysis moved to side panel. Triangle markers (▹). |
| E9c | RLS + admin + seniority order fixes | v3.01–v3.02 | ✅ | RLS policy fix. Manager/Lead seniority order corrected across all pages. |
| E9d | Data Lab nav on all daughter pages | v3.03–v3.10 | ✅ | Deep-dive nav + current-page highlighting. Data Lab link in index. Hero button fix. Index footer version. |
| E9e | Chart + nav consistency | v3.11–v3.15 | ✅ | Version sync. enrich-job duplicate fix. getJobLevel stub fix. usOnly + WHERE pill fix. Industry threshold lowered. |
| E9f | Data page nav iterations | v3.16–v3.18 | ✅ | Nav position iterated: top → bottom → above-fold. All pages consistent. salary-data nav fix. |
| E9g | Chart visual polish | v3.19 | ✅ | Bright bar colors. Removed duplicate Remote chart. Reordered industry stats. Vertical geo legend. Better bubble labels. |

### Sprint 2: Charts & Stats (v3.20–v3.25)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| E10 | Real cumulative job data | v3.20 | ✅ | Replaced fake Math.sin() with get_weekly_job_counts() RPC. 35 weeks real data. |
| E11 | Heatmap rounding + legend | v3.20 | ✅ | Values rounded to nearest 100. Per-10K legend: Best/Good/Low/Sparse. Vertical color bar. |
| E12 | Fix flipped bubble map | v3.21 | ✅ | yAxis inverse:true. Seattle was in Florida. |
| E13 | Stats chart reorder | v3.22 | ✅ | Logical flow. Removed duplicate industry bar chart. |
| E14 | Stats 2×2 grid layout | v3.23 | ✅ | Posting Age full-width, Salary/Seniority grid, Industry/Work grid, Salary Ladder after. |
| E15 | Stats/feed count mismatch | v3.24 | ✅ | excludeHidden() added to stats. company_slug alignment. US-Only save fix. |
| E16 | Geo chart improvements | v3.25 | ✅ | List view for small filters (<75 jobs). Full location coverage (61%→99.9%). Coverage % shown. |

### Sprint 3: AI Features (v3.26–v3.27)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| E17 | Dead job auto-removal | v3.26 | ✅ | Detect 404/410 + dead content. Close in DB, fade from feed. enrich-job v6 accepts status. |
| E18 | AI filter from hidden jobs | v3.27, v3.53 | ✅ | "Improve" button → Claude Haiku suggests WHAT NOT/WHERE NOT/WHO NOT terms. **v3.53:** Frontend wiring added — analyze-hidden-job EF existed but had no UI trigger. Batch analysis of 5 hidden jobs, suggestion modal, one-click apply to filter exclusions. |
| E19 | AI filter from resume | v3.27 | ✅ | generate-filter Edge Function extracts titles, locations, salary, exclusions. Preview modal. |

### Sprint 4: SEO Admin Dashboard (v3.28–v3.29, expanded v3.41)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| E20 | SEO analytics dashboard | v3.28 | ✅ | 6 DB tables, 7 RPCs, 4 sub-tabs. seo-sync Edge Function (PSI + PostHog + DataForSEO). Speed-vs-search correlation charts. |
| E21 | SEO page drilldown | v3.29 | ✅ | Per-URL PSI trend, CWV cards, issues, index status, "Run PSI Now". seo-sync v2 (10 URLs). get_seo_page_drilldown() RPC. |
| E22 | seo-sync v3: 4 new tools | v3.41 | ✅ | Yellow Lab Tools (public API, 50/day), CrUX API (real-user p75 + histograms), Knowledge Graph Search API (entity detection), Cloudflare Analytics (httpRequests1dGroups, free plan). 9 tools total. |
| E23 | PSI 4-category expansion | v3.41 | ✅ | PSI now collects Accessibility + Best Practices in addition to Performance + SEO. All stored in seo_tech_audits metrics JSONB. |
| E24 | SEO Admin redesign | v3.41 | ✅ | Replaced 4-subtab layout with unified view: URL dropdown (all/individual), date range (7d/30d/90d), 6 time series charts (PostHog, GSC, PSI, CrUX, YLT, Cloudflare) + side panel (URL inspection, CWV drilldown, GSC queries, Knowledge Graph entities). |
| E25 | Credential consolidation | v3.41 | ✅ | Unified 4 credential files into CREDENTIALS_MASTER. 10 services: GitHub, Supabase (anon+service+CLI), Vercel, Google (API key+SA), Anthropic, PostHog (project+personal), DataForSEO, Cloudflare. |
| E26 | GSC domain property fix | v3.44 | ✅ | Fixed GSC_SITE from `https://brilliantjobs.app/` to `sc-domain:brilliantjobs.app` (domain property format). Removed all `brilliantjobs.io` references from Edge Function, dashboard HTML, and Supabase secrets. URL Inspection now returns real data (1/6 indexed, 5 discovered). |
| E27 | RLS disable on SEO tables | v3.44 | ✅ | Disabled Row Level Security on all 6 SEO tables (seo_tech_audits, seo_site_daily, seo_page_daily, seo_gsc_daily, seo_index_status, seo_conversions). Data is admin-only aggregate metrics, RLS was blocking all frontend reads. |
| E28 | InLinks semantic schemas | v3.45 | ✅ | Added WebPage ld+json schemas with `about` and `mentions` entities (Wikipedia sameAs links) to all 6 public pages: salary-data, hiring-trends, jobs-by-industry, career-level-data, data-lab, index. 3 from InLinks, 3 generated to match. |
| E29 | Daily SEO cron job | v3.44 | ✅ | `trigger_seo_sync()` PL/pgSQL function calls seo-sync Edge Function via pg_net. Scheduled via pg_cron as `daily-seo-sync` at 6 AM UTC. |
| E30 | SEO tab redesign | v3.48 | ✅ | Full visual redesign per Pod 1 handoff spec. 13 new CSS classes (.seo-controls, .seo-select, .seo-section-label, .seo-detail-grid, .seo-metric-row, etc.). 4-section layout: Controls → Stat Cards → Charts → Drilldowns. DOM-based stat cards replacing innerHTML. CrUX promoted to own card. Chart heights 300/280px. Light-theme ECharts. Loading + empty states. All 12 acceptance criteria pass. |
| E31 | Dead job lightbulb icon | v3.47 | ✅ | Replaced 3D 🚫 emoji with on-brand SVG burned-out lightbulb for job removal modal. Copy: "This Brilliant opportunity has dimmed." |

**Phase E total: 46 items across 6 sprints, all complete. Version range: v2.68 → v3.48.**

---

## Phase F: Feb 22 Sprint (v3.30 → v3.40)

### Sprint 1: Admin Panel Fix + Cohort Phase A Database (v3.30–v3.38)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| F1 | Admin panel display fix | v3.30–v3.38 | ✅ | Unclosed div nesting in page-stats caused page-settings/subscription/admin to not render. Multi-version debug cycle with deferred logging. |
| F2 | Cohort Phase A — Database layer | v3.38 | ✅ | cohorts table + launch_2026 seed. cohort_plan_entitlements (30 rows: 10 features × 3 plans). profiles: cohort_id + cohort_assigned_at columns. Auto-assignment trigger (trg_assign_cohort). Both users backfilled. |
| F3 | check_entitlement() v2 RPC | v3.38 | ✅ | Cohort-aware entitlement engine. Resolution: user override → trial → cohort-specific → plan default → feature default. Returns plan, cohort, behavior, source, allowed, limits, remaining. |
| F4 | Entitlement catalog adjustments | v3.38 | ✅ | Free resumes: 1→2. Free data_export: 1→0. Pro resume_grading: 50→-1 (unlimited). behavior_category defaults set (fixed/off per feature). |

### Sprint 2: Data Pages Live RPC + Caching (v3.39)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| F5 | Data pages: live Supabase RPCs | v3.39 | ✅ | All 5 data pages (hiring-trends, career-level-data, salary-data, jobs-by-industry, market-dynamics) converted from hardcoded arrays to live RPC calls. 15 existing RPCs wired. |
| F6 | Data page caching | v3.39 | ✅ | localStorage caching with 24h TTL on all data pages. Cache key per RPC function name. |
| F7 | Methodology footers | v3.39 | ✅ | All 5 data pages now include methodology section explaining data sources, classification methods, and refresh frequency. |

### Sprint 3: Cohort Experience — Client Wiring (v3.40)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| F8 | checkEntitlement() client helper | v3.40 | ✅ | Client-side wrapper in globals.js with 5-min cache. Calls check_entitlement() RPC. Graceful fallback (fail-open) on errors. |
| F9 | Feature gates — filters | v3.40 | ✅ | Entitlement check on filter save (new filters only) and filter duplicate. clearEntitlementCache() after mutations. |
| F10 | Feature gates — resumes | v3.40 | ✅ | Entitlement check on resume upload (active count) and create-by-level scaffolding. |
| F11 | Upgrade toast UI | v3.40 | ✅ | showUpgradePrompt() with smooth slide-up toast. Distinguishes 'off' (Pro feature) vs 'fixed' (limit reached) messaging. |
| F12 | PostHog plan_id fix | v3.40 | ✅ | Changed from hardcoded 'free' to window._bjUserPlan (read from profiles.plan at auth). |
| F13 | behavior_category defaults | v3.40 | ✅ | Updated entitlement_features: filters/resumes → fixed, 8 others → off. Matches feature brief catalog. |

### Sprint 4: Infrastructure Cleanup (post v3.40)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| F14 | Edge Function bulk deploy | — | ✅ | Installed Supabase CLI in automation environment. Deployed 10 stale functions (resilience module + AI filter updates). All 22 functions now current. CLI deploy capability permanent. |
| F15 | pg_cron: materialized view refresh | — | ✅ | Scheduled refresh_materialized_views() every 10 minutes (job 10). Refreshes mv_landing_stats, mv_jobs_by_source, mv_jobs_by_day. 8 total cron jobs active. |

**Phase F total: 15 items across 4 sprints, all complete. Version range: v3.30 → v3.40.**

### Cohort Experience System — Final Status

| Component | Status | Notes |
|-----------|--------|-------|
| cohorts table + seed | ✅ | launch_2026 cohort active |
| cohort_plan_entitlements (30 rows) | ✅ | 10 features × 3 plans |
| check_entitlement() v2 RPC | ✅ | Cohort-aware, 5-priority resolution |
| Auto-assignment trigger | ✅ | trg_assign_cohort on profiles |
| RLS on cohorts + CPE + user_sessions | ✅ | Read policies + insert/update guards |
| Client checkEntitlement() helper | ✅ | 5-min cache, fail-open |
| Feature gates (filters, resumes) | ✅ | Save, duplicate, upload, scaffold |
| Upgrade toast UI | ✅ | Slide-up notification |
| Session init + heartbeat | ✅ | create_session() + 5-min heartbeat |
| PostHog super properties | ✅ | bj_session_id, bj_cohort_id, bj_plan_id |
| behavior_category defaults | ✅ | All 10 features categorized |

---

## Phase G: AI Resume Pipeline (v3.49+)

**Goal:** Two-tier AI resume scoring → guided rewrite → QA → output integration. The premium feature set that justifies credit-based monetization.

**Specs:** `docs/PREMIUM_RESUME_SCORING_SPEC.md`, `docs/RESUME_REWRITE_PIPELINE_SPEC.md`, `docs/RESUME_SCORING_AUDIT.md`

### Sprint 1: Premium Scoring Pipeline (v3.49) ✅

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| G1 | Premium multi-agent scoring Edge Function | v3.49 | ✅ | 3-pass pipeline: Pass 1 parallel Haiku extraction (Resume Structurer + JD Synthesizer), Pass 2 Sonnet analysis with Gold Standard calibration, Pass 3 Sonnet career coaching. 4 agents total. `tier` parameter (basic/premium). Graceful fallback to basic on failure. |
| G2 | 5 industry Gold Standards | v3.49 | ✅ | Calibration anchors for Software Engineering, Marketing, Sales, Data Science, Product Management. Injected into Match Analyst prompt based on JD Synthesizer industry classification. |
| G3 | Frontend: fetchAIScore premium handling | v3.49 | ✅ | Handles both basic and premium response formats. Normalizes dimension scores, gap analysis, coaching, strength map, industry detection. |
| G4 | Frontend: dimension score bars | v3.49 | ✅ | 6-dimension weighted bar visualization (trajectory, impact, skills, alignment, education, presentation). Color-coded by threshold. |
| G5 | Frontend: premium coaching renderer | v3.49 | ✅ | Priority actions panel, before/after rewrite suggestions, gap bridging, competitive positioning. Inline in readiness side panel. |
| G6 | Frontend: Deep Analysis button | v3.49 | ✅ | "✨ Deep" button on resume cards alongside "Analyze". Gradient background. Triggers `tier: 'premium'`. |

### Sprint 2: Gap Interview + Acceptance UI (v3.50) ✅

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| G7 | Gap Interviewer agent | v3.50 | ✅ | New `gap-interview` mode on score-resume EF. Haiku agent generates lateral questions per gap (K8s → asks about Docker, ECS, cloud). |
| G8 | Gap Interview UI | v3.50 | ✅ | Card-per-gap with severity badges, per-question input fields. Skip + Continue buttons. Answers feed into rewrite brief. |
| G9 | Acceptance UI — recommendation toggles | v3.50 | ✅ | Accept/reject per recommendation with checkboxes. Select All/Deselect All. Live counter. 7 categories: priority, rewrite, keyword, title, achievement, format, gap. |
| G10 | Acceptance UI — achievement prompt inputs | v3.50 | ✅ | Expandable text inputs when user accepts achievement prompt. Prevents fabrication — user provides real metrics. |
| G11 | User highlights & notes section | v3.50 | ✅ | Freeform notes + structured highlight chips with add/remove. Exclusion support. |
| G12 | Cover letter opt-in checkbox | v3.50 | ✅ | Toggle on acceptance UI. Template selector (3 options). |

### Sprint 3: Templates + Rewrite Team (v3.51) ✅

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| G13 | 3 resume template configs | v3.51 | ✅ | Executive (Georgia/Calibri, navy), Modern (Calibri, blue), Classic (Times, black). Full docx-js configs with margins, spacing, bullet indent. |
| G14 | Template thumbnail previews | v3.50 | ✅ | Visual card selector with "best for" labels (Senior roles / Tech+creative / Finance+legal). |
| G15 | Template selection UI | v3.50 | ✅ | 3-card picker integrated into Acceptance UI with active state highlighting. |
| G16 | `rewrite-resume` Edge Function — Resume Writer | v3.51 | ✅ | Sonnet agent. Strict rules: no fabrication, no cross-job bleed, no AI-speak kill list. Honors accepted recs, user highlights, gap answers, exclusions. Structured JSON output for docx generation. |
| G17 | Cover Letter Writer agent | v3.51 | ✅ | Sonnet, conditional. 3-4 paragraphs, <350 words. Company-specific hook. No resume regurgitation. |
| G18 | Document generation (docx-js) | v3.51 | ✅ | Server-side .docx rendering with section-aware formatting (jobs with tab-stop dates, education, skills groups, certifications). Uploaded to Supabase Storage `rewrites` bucket. |

### Sprint 4: QA Team (v3.52) ✅

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| G19 | Accuracy Auditor agent | v3.52 | ✅ | Haiku. Cross-references original vs rewritten. Flags fabricated metrics, inflated scope, added skills. Critical/warning/note severity. |
| G20 | Bleed Detector agent | v3.52 | ✅ | Haiku. Ensures bullets stay with correct jobs. Flags cross-job contamination + date misalignment. |
| G21 | Voice & Polish Auditor agent | v3.52 | ✅ | Sonnet. AI-speak kill list (leveraged, spearheaded, synergized, etc.). Punctuation standardization. Auto-fixes applied to cleaned sections. |
| G22 | QA reconciliation logic | v3.52 | ✅ | 3 QA agents run in parallel. Voice auditor's cleaned sections used for docx generation. Critical accuracy flags noted for user review. Full QA report in response + rendered in results panel. |

### Sprint 5: Output Integration + LinkedIn (v3.53–v3.55) ✅

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| G23 | Auto-add rewrite to resume library | v3.53 | ✅ | Auto-saved on rewrite complete. Named `{original} — {filter} v{round}`. Source: 'rewrite'. Auto-assigned to same filter. Keywords extracted from sections. |
| G24 | `cover_letters` table + RLS | v3.53 | ✅ | Table pre-existed. Cover letters saved with structured paragraphs, salutation, closing, word count, storage path, tier. |
| G25 | Cover letter archive UI | v3.55 | ✅ | Rendered on Resumes page below archives. Preview/download/delete per letter. Tier badge. Filter-grouped. |
| G26 | Tier provenance tracking | v3.53 | ✅ | `tier_history` array on resumes. Badge on resume cards: "✨ Premium Rewrite" with round number. Hover shows full history. |
| G27 | `rewrites` Storage bucket | v3.51 | ✅ | Created in Sprint 3. Public bucket for .docx downloads. |
| G28 | Chrome Extension: LI profile capture | v3.55 | ✅ | Manifest v3. Content script on linkedin.com/in/*. Floating "Sync to Brilliant Jobs" button. Extracts name, headline, experience, education, skills. Stores in chrome.storage.local. Popup with status + clear. |
| G29 | LinkedIn Alignment Checker agent | v3.52 | ✅ | Haiku agent in rewrite-resume EF. Flags title/date/company discrepancies. Runs conditionally when linkedin_profile provided. Shipped with Sprint 4 EF commit. |
| G30 | LI alignment UI in QA report | v3.52 | ✅ | Discrepancy list with severity + field comparison. Integrated in bjShowRewriteResults QA section. Shipped with Sprint 4 frontend commit. |

### Sprint 6: Feedback + Iteration (v3.54–v3.55) ✅

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| G31 | Feedback UI — star ratings | v3.54 | ✅ | 5 dimensions: overall, accuracy, relevance, voice, formatting. 1-5 star interactive ratings. |
| G32 | Feedback UI — qualitative input | v3.54 | ✅ | Freeform textarea for specific change requests. Saved to rewrite_rounds table. |
| G33 | Revision Assessor agent | v3.54 | ✅ | Haiku. `revision-assess` mode on score-resume EF. Evaluates feedback specificity, predicts revision value, estimates per-dimension improvements. |
| G34 | Revision loop | v3.54 | ✅ | Re-runs full rewrite pipeline with previous_feedback context. New resume version per round. Old results cleared, new results shown inline. |
| G35 | `rewrite_sessions` + `rewrite_rounds` tables | v3.54 | ✅ | Tables pre-existed. Sessions track user, template, filter. Rounds track ratings, feedback, QA reports, storage paths. DB persistence wired in rewrite-resume EF. |
| G36 | Entitlement features | v3.55 | ✅ | `resume_rewrite`, `resume_rewrite_cover`, `resume_rewrite_revision` added to feature_flags. Pro/Enterprise gated. |

### Phase G Summary

| Sprint | Items | Est. | Theme |
|--------|-------|------|-------|
| G-S1 | G1–G6 | — | ✅ Premium scoring pipeline (v3.49) |
| G-S2 | G7–G12 | — | ✅ Gap interview + acceptance UI (v3.50) |
| G-S3 | G13–G18 | — | ✅ Templates + rewrite team (v3.51) |
| G-S4 | G19–G22 | — | ✅ QA team agents (v3.52) |
| G-S5 | G23–G30 | — | ✅ Output integration + LinkedIn (v3.52–v3.55) |
| G-S6 | G31–G36 | — | ✅ Feedback + iteration (v3.54–v3.55) |
| **Total** | **36 items** | **—** | **✅ Phase G complete (v3.49–v3.55)** |

**12 agents across 3 Edge Functions:**

| # | Agent | Model | Stage |
|---|-------|-------|-------|
| 1 | Resume Structurer | Haiku | Premium Analysis (Pass 1) |
| 2 | JD Synthesizer | Haiku | Premium Analysis (Pass 1) |
| 3 | Match Analyst | Sonnet | Premium Analysis (Pass 2) |
| 4 | Career Coach | Sonnet | Premium Analysis (Pass 3) |
| 5 | Gap Interviewer | Haiku | Pre-Rewrite |
| 6 | Resume Writer | Sonnet | Rewrite |
| 7 | Cover Letter Writer | Sonnet | Rewrite (conditional) |
| 8 | Accuracy Auditor | Haiku | QA |
| 9 | Bleed Detector | Haiku | QA |
| 10 | Voice & Polish Auditor | Sonnet | QA |
| 11 | LinkedIn Alignment Checker | Haiku | QA (conditional) |
| 12 | Revision Assessor | Haiku | Feedback |

---


## Phase H: Stripe Monetization (v3.71–v3.75)

**Goal:** Credit-based monetization with three subscription tiers, PAYG credit purchases, auto-refill, pay-when-hired model, and admin revenue dashboard.

**Source:** `MONETIZATION_HANDOFF.docx` (Pod 1 spec, 16-step implementation plan)

### Sprint 1: Stripe Backend (v3.71) ✅

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| H1 | Stripe products + prices in Dashboard | v3.71 | ✅ | 3 subscription tiers (Free/$0, Starter/$20, Pro/$40), 3 credit packs (10/$5, 50/$20, 100/$35), auto-refill prices. Stripe account `acct_1T3TKyAUKPQHZOPa`. |
| H2 | `stripe-webhook` Edge Function | v3.71 | ✅ | Signature validation, routes: checkout.session.completed, customer.subscription.updated/deleted, invoice.payment_succeeded/failed. Credit allocation on subscription start. |
| H3 | `create-checkout` Edge Function | v3.71 | ✅ | Creates Stripe Checkout Sessions for subscriptions + one-time credit purchases. Success/cancel return URLs. |
| H4 | `manage-subscription` Edge Function | v3.71 | ✅ | Opens Stripe Customer Portal for plan changes, cancellation, billing history. |
| H5 | Billing frontend (`js/billing.js`) | v3.71 | ✅ | Credit balance badge in nav, pricing modal (3 tiers), Stripe checkout redirect flows. |

### Sprint 2: Subscription Tab (v3.72) ✅

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| H6 | Subscription tab UI | v3.72 | ✅ | Plan card with current tier, credit balance + burn rate, usage breakdown, tier comparison table. |
| H7 | Credit packs UI | v3.72 | ✅ | 3 credit pack cards (10/50/100) with tier-discounted pricing, one-click Stripe checkout. |
| H8 | Auto-refill UI | v3.72 | ✅ | Toggle + 3 level cards (10/25/50 credits), threshold config, saves to DB. |
| H9 | Admin plan display | v3.72 | ✅ | "ADMIN" badge, ∞ credits shown, no low-credit alerts, no upgrade prompts. |
| H10 | Upgrade banner | v3.72 | ✅ | Tier-specific messaging for free/starter users. Customer Portal link. |

### Sprint 3: Admin Revenue Tab (v3.75) ✅

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| H11 | Admin Revenue tab | v3.75 | ✅ | KPIs (MRR, active subs, credit velocity, ARPU), tier pie chart, daily activity bars, cost breakdown, top users table, period toggle (7d/30d/90d). |

### Sprint 4: Credit Gating (v3.75) ✅

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| H12 | `debitCreditsForAction()` client helper | v3.75 | ✅ | Deducts credits before AI calls. Calls `debit_credits` RPC. |
| H13 | Resume AI Score gating (3 credits) | v3.75 | ✅ | Wired into `fetchAIScore()`. |
| H14 | AI Filter Generation gating (2 credits) | v3.75 | ✅ | Wired into `generate-filter` call. |
| H15 | `auto-refill` Edge Function | v3.75 | ✅ | Monitors credit balance, triggers Stripe charge when below threshold. Admin bypass. Deployed to Supabase. |

### Sprint 5: Pay-When-Hired Pipeline (v3.74–v3.75) ✅

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| H16 | "Hired" pipeline stage | v3.74 | ✅ | New stage between Offer and Rejected in pipeline progression. |
| H17 | SetupIntent authorization flow | v3.74 | ✅ | Stripe SetupIntent to collect payment method on hire confirmation. |
| H18 | `hire-fee` Edge Function | v3.74 | ✅ | Processes hire fee charge (configurable % of reported salary). Deployed to Supabase. |
| H19 | Job title/salary persistence | v3.74 | ✅ | Stored in pipeline meta for hire fee reference. |

### Phase H Summary

| Sprint | Items | Theme |
|--------|-------|-------|
| H-S1 | H1–H5 | ✅ Stripe backend + billing frontend (v3.71) |
| H-S2 | H6–H10 | ✅ Subscription tab UI (v3.72) |
| H-S3 | H11 | ✅ Admin Revenue tab (v3.75) |
| H-S4 | H12–H15 | ✅ Credit gating + auto-refill (v3.75) |
| H-S5 | H16–H19 | ✅ Pay-when-hired pipeline (v3.74–v3.75) |
| **Total** | **19 items** | **✅ Phase H complete (v3.71–v3.75)** |

### What's NOT Built Yet

| Item | Status | Notes |
|------|--------|-------|
| Live Stripe testing | ✅ | Checkout sessions (subscription + one-time), test card payment (pm_card_visa $20 succeeded), webhook delivered (0 pending), EF auth gating verified |
| Production Stripe keys | ✅ | Live keys deployed. `sk_live_*` in Supabase secrets. `pk_live_*` in billing.js. |
| Smart Job Alert credit debit (1cr) | ✅ | v3.78: apply-on-notification debits 1cr, free plan blocked, admin bypass |
| AI Resume Rewrite credit debit (5cr) | ✅ | v3.78: rewrite-resume debits 5cr, free plan 403, insufficient 402, admin bypass |
| Stripe production webhook registration | ✅ | `we_1T3lqYPKzCZbw3KzQwljS2K8` — checkout.session.completed + 4 more events |
| Public pricing page (`pricing.html`) | ✅ | v3.80: Cohort-tied pricing page, monthly/annual toggle, credit packs, FAQ |
| Stripe Billing Portal configuration | 🔲 | Customer Portal for self-service plan management — EF exists, Portal needs configuration in Stripe Dashboard |
| Vendor payout consolidation | 🔲 | Centralize Vercel/Supabase/DataForSEO/Cloudflare/Resend billing through Stripe |

---

## Phase I: Communication Center v2 (v3.76–v3.77)

3-phase notification system overhaul: UI preferences, email delivery, SMS escalation.

### Phase 1: Communication Center UI (v3.76) ✅

| # | Item | Version | Status | Details |
|---|------|---------|--------|---------|
| I1 | Migration 006 — v2 schema | v3.76 | ✅ | 7 new columns on notification_preferences (digest/credit/auto-refill). 4 new columns on notification_log (idempotency_key, user_plan, user_cohort, template_version) + 3 indexes. 2 new columns on notification_actions (credits_used, notification_tier) + 2 indexes. New notification_templates table with RLS + 9 default configs (3 types × 3 plans × cohort_launch). |
| I2 | RPCs — preference management | v3.76 | ✅ | get_notification_prefs(), upsert_notification_channel(), save_escalation_settings(). All SECURITY DEFINER. |
| I3 | Dashboard UI — 8 new notification types | v3.76 | ✅ | 22 total data-notif rows (was 14). Job Intelligence: company_new_roles, resume_decay, resume_improve, exclusion_override. Credit & Billing (Starter/Pro gated): credit_low, autorefill_success, autorefill_failed, credit_exhausted. |
| I4 | JS — NOTIF_TYPES array update | v3.76 | ✅ | 23 entries (was 14). v2 types with tier='event' and tier='credit'. Existing loadNotifPrefs() + save handler auto-support new rows. |

### Phase 2: Email System (v3.77) ✅

| # | Item | Version | Status | Details |
|---|------|---------|--------|---------|
| I5 | 11 new email templates | v3.77 | ✅ | Credit/Billing: creditLow, autoRefillSuccess, autoRefillFailed, creditExhausted. Upgrade: upgradeStarter, upgradePro. Resume Intelligence: resumeDecay, resumeImprove, exclusionOverride. Re-engagement: reengagement. SEO: seoNurture. Total: 28 templates. |
| I6 | send-notification v2 | v3.77 | ✅ | idempotency_key dedup (check before logging), user_plan/user_cohort/template_version fields logged. |
| I7 | Edge Function deployments | v3.77 | ✅ | 7 functions redeployed: send-notification v19, account-lifecycle v20, daily-digest v19, weekly-summary v19, escalation-checker v19, job-intelligence v19, apply-on-notification v19. |
| I8 | Email delivery verified | v3.77 | ✅ | Resend domain (brilliantjobs.app) verified. Welcome email sends. Daily digest sends. Idempotency dedup confirmed (1 log entry, not 2). |
| I9 | pg_cron schedules active | v3.77 | ✅ | daily-digest (8am ET), weekly-summary (Mon 8am ET), escalation-checker (every 2h), job-intelligence (5am UTC). |

### Phase 3: SMS System — 🔲 Not Started

| # | Item | Est. | Status | Blocker |
|---|------|------|--------|---------|
| I10 | Vonage account + US number | 30min | ✅ | Toll-free 18108923590, $12 balance, API key f81913a9 |
| I11 | Toll-free verification (A2P compliance) | 1h | 🔲 | Toll-free used instead of 10DLC — faster approval. Submit via Vonage dashboard. |
| I12 | Vonage secrets in Supabase | 15min | ✅ | VONAGE_API_KEY, VONAGE_API_SECRET, VONAGE_FROM set via supabase secrets |
| I13 | 4 SMS templates (≤160 chars) | 1h | ✅ | sms-templates.ts: applyAlertSms, interviewReminderSms, offerReceivedSms, creditAlertSms |
| I14 | Escalation chain completion | 2h | ✅ | escalation-checker v21: SMS template import, v2 tracking, idempotency. Full chain: email → timeout → SMS → 2h grace → missed. |
| I15 | Inbound SMS webhook (handle-sms-reply) | 2h | ✅ | handle-sms-reply v1: Vonage POST/GET, Y/N/YES/NO parsing, user lookup by phone, action resolution, confirmation SMS reply. |
| I16 | SMS quiet hours + cost tracking | 1h | ✅ | Quiet hours in send-notification + escalation-checker (22:00–07:00 user TZ). Cost tracked via Vonage dashboard ($0.01/msg toll-free). |

### Sprint Log

| Sprint | Items | Summary |
|--------|-------|---------|
| I-S1 | I1–I4 | ✅ Phase 1 UI — Migration 006, 3 RPCs, 22 notification rows, NOTIF_TYPES expanded (v3.76) |
| I-S2 | I5–I9 | ✅ Phase 2 Email — 11 v2 templates, send-notification v2 with idempotency, 7 EFs deployed, delivery verified (v3.77) |
| I-S3 | I10–I16 | ✅ Phase 3 SMS — Vonage toll-free 18108923590, secrets set, 4 SMS templates, escalation chain wired, handle-sms-reply v1, quiet hours (v3.79) |

| **Total** | **16 items** | **✅ Phase I complete (v3.76–v3.79). Only toll-free verification pending (non-blocking for testing).** |

---

## Production Hotfix Log (v3.56–v3.70)

**27 versions across 3 days of production debugging and stabilization.**

### v3.56–v3.60: Critical Production Fixes

| Version | Status | Summary |
|---------|--------|---------|
| v3.56 | ✅ | Bundle rebuild (stale at v3.47), dashboard perf (deferred scripts), landing page segment fix |
| v3.57 | ✅ | Segment visibility bleed, RPC error handling, version sync, bundle rebuild |
| v3.58 | ✅ | openModal global scope (landing login broken), salary min→max UX, Entry Level sort, dept salary axis scaling, AK/HI choropleth, velocity map green ramp |
| v3.59 | ✅ | Bundle stale detection, Edge Function deploys |
| v3.60 | ✅ | Metro table blue gradient color scheme, Open Jobs color scaling, per-capita bubble map dedup |

### v3.61–v3.65: Dashboard & Data Fixes

| Version | Status | Summary |
|---------|--------|---------|
| v3.61 | ✅ | Forgot password flow, lapsed-user hero button, 7 production issues |
| v3.62 | ✅ | Seniority breakdown %, stat card layout, chart label improvements, 8 UX issues |
| v3.63 | ✅ | WHEN filter "last 14 days" fix (was silently ignored) |
| v3.64 | ✅ | Stat card numbers invisible, map fixes, resume card layout, 7 issues |
| v3.65 | ✅ | Salary P15-P85 ranges, resume picker, 406 circuit breaker |

### v3.66–v3.70: Admin & SEO Fixes

| Version | Status | Summary |
|---------|--------|---------|
| v3.66 | ✅ | AI filter upload+picker+auto-tag, salary ranges, 500 diagnosis |
| v3.67 | ✅ | Location normalization, cumulative line chart, white borders, AK fix |
| v3.68 | ✅ | Admin SEO dashboard 7 fixes |
| v3.69 | ✅ | DataForSEO fix: instant_pages + proper issue filtering |
| v3.70 | ✅ | Timeline bar timezone bug (2/15 vs 2/16) |

### v3.71–v3.73: Feature Releases

| Version | Status | Summary |
|---------|--------|---------|
| v3.71 | ✅ | Monetization backend (Stripe webhook, checkout, billing frontend) |
| v3.72 | ✅ | Subscription tab (plan card, credit balance, tier comparison, credit packs, auto-refill UI, admin plan) |
| v3.73 | ✅ | Admin text sizing, PSI/YLT chart redesign, cohort analytics (5 KPIs + 3 charts), Feed Health fix |

### v3.74–v3.75: Monetization Completion

| Version | Status | Summary |
|---------|--------|---------|
| v3.74 | ✅ | Pay-when-hired SetupIntent, hired pipeline stage, hire fee Edge Function |
| v3.75 | ✅ | Admin Revenue tab, credit gating (score-resume 3cr, generate-filter 2cr), auto-refill EF, bundle rebuild |


## Master Status Summary

| Phase | Items | Version Range | Status |
|-------|-------|---------------|--------|
| **A** Pre-Launch Critical | 13/13 | — | ✅ Complete |
| **B** Post-Launch Foundation | 12/12 | — | ✅ Complete |
| **C** Scale Readiness | 10/10 | — | ✅ Complete |
| **D** Product Features | 10/11 | v3.30–v3.40 | ✅ (D3/D7 blocked on screenshots) |
| **E** Feb 21 Feature Sprint | 46/46 | v2.68–v3.48 | ✅ Complete |
| **F** Feb 22 Sprint | 15/15 | v3.30–v3.40 | ✅ Complete |
| **G** AI Resume Pipeline | 36/36 | v3.49–v3.55 | ✅ Complete |
| **H** Stripe Monetization | 19/19 | v3.71–v3.75 | ✅ Complete |
| **I** Communication Center v2 | 15/16 | v3.76–v3.79 | ✅ Phase 1+2+3 complete. Toll-free verification pending. |
| **Hotfixes** | 15 versions | v3.56–v3.70 | ✅ Stabilized |
| **Total built** | **176+ items** | **v2.68–v3.80** | — |

### Outstanding Items (Not Done)

| Item | Phase | Priority | Blocker |
|------|-------|----------|---------|
| Production Stripe keys (`sk_live_*`) | H | ✅ | Live keys set in Supabase secrets + billing.js. Webhook registered. 3 EFs redeployed. |
| Stripe webhook endpoint (live) | H | ✅ | `we_1T3lqYPKzCZbw3KzQwljS2K8` — 5 events, signing secret set |
| Stripe pricing page (`pricing.html`) | H | ✅ | v3.80: Public pricing page live — cohort-tied (launch_2026), 3-tier (Free/Starter/Pro), credit packs, FAQ |
| Stripe Billing Portal for self-service | H | **Medium** | Customer Portal for plan changes, cancellation, billing history (EF exists but Portal not configured in Stripe Dashboard) |
| D3 — Landing Page interactive preview | D | Medium | 5 screenshot assets from CPO (D7) |
| D7 — Walkthrough screenshots (5x) | D | Medium | CPO deliverable |
| Vendor payout consolidation | H | Low | Post-launch ops (Vercel/Supabase/DataForSEO/Cloudflare/Resend → Stripe) |
| Toll-free verification | I | Low | Submit via Vonage dashboard — non-blocking for testing |
| Vonage inbound webhook URL | I | **High** | Manual: Set on Vonage Dashboard → Numbers → 18108923590 → Inbound URL |
| ATS partner applications (Greenhouse, Lever, Ashby) | — | Medium | Greenhouse deadline March 3 |
| Remaining ATS customer list (H-Z) | — | Low | Could add significant job inventory |

---

## Changelog

| Date | Sprint | Items | Summary |
|------|--------|-------|---------|
| 2026-02-22 | H++ | — | **Stripe LIVE:** Production keys deployed. 11 live price IDs in create-checkout, 3 in auto-refill. Live webhook endpoint registered (`we_1T3lqY`). Supabase secrets updated (STRIPE_SECRET_KEY, PUBLISHABLE_KEY, WEBHOOK_SECRET). billing.js → pk_live. 3 Edge Functions redeployed. |
| 2026-02-22 | H+ | — | **v3.80:** Public pricing page (`pricing.html`). Cohort-tied (launch_2026). 3-tier: Free/Starter($20)/Pro($40). DB aligned: `starter` plan added, `pro` price updated to $40. 13 starter entitlements seeded. Monthly/annual toggle, credit packs, FAQ. |
| 2026-02-22 | I-S3 | I10–I16 | **v3.79:** Phase 3 SMS system. Vonage toll-free (18108923590) secrets set. 4 SMS templates (sms-templates.ts). handle-sms-reply v1 (inbound Y/N webhook). escalation-checker v21 (SMS template + v2 tracking). Schema: decision + response_channel columns. SMS delivery verified end-to-end. |
| 2026-02-22 | I-S2+ | — | **v3.78:** Credit gating wired into Edge Functions. apply-on-notification: 1cr debit (Starter/Pro only, free blocked). rewrite-resume: 5cr debit (free→403, insufficient→402, admin bypass). Closes 2 outstanding H-phase items. |
| 2026-02-22 | I-S2 | I5–I9 | **v3.77:** Phase 2 Email System verified live. 11 new v2 templates (credit/billing, upgrade, resume intelligence, re-engagement, SEO nurture — 28 total). send-notification v2 with idempotency dedup + cohort tracking. 7 Edge Functions redeployed. Resend domain verified, delivery confirmed. pg_cron all 4 schedules active. |
| 2026-02-22 | I-S1 | I1–I4 | **v3.76:** Communication Center v2 Phase 1. Migration 006 (7 pref columns, 4 log columns, notification_templates table, 9 default configs). 3 RPCs. Dashboard: 22 notification rows (+8 v2 types). JS: 23 NOTIF_TYPES. |
| 2026-02-22 | H-ALL | H1–H19 | **v3.75:** Phase H Stripe Monetization complete. 5 sprints: Stripe backend (webhook/checkout/portal EFs), subscription tab UI, admin Revenue tab, credit gating (score 3cr, filter 2cr), auto-refill EF, pay-when-hired (SetupIntent + hire-fee EF + hired stage). All 5 open PRs merged, bundle rebuilt, Edge Functions deployed. |
| 2026-02-22 | DEPLOY | — | **v3.73:** Admin text sizing, PSI/YLT chart redesign (bar+radar), cohort analytics (5 KPIs + 3 ECharts), Feed Health RPC timeout fix. |
| 2026-02-22 | HOTFIX | — | **v3.60 metro + map fixes:** Metro table color scheme changed from rainbow (green/blue/purple/gray) to consistent blue gradient. Open Jobs column now color-scaled. Per-capita bubble map: removed duplicate Dallas/Phoenix entries, blue gradient bubbles, sqrt sizing. |
| 2026-02-22 | HOTFIX | — | **v3.58 prod bug fixes:** openModal global scope (landing login broken). Salary min→max UX (focus max on Enter). Entry Level sort fix (space vs hyphen). Dept salary ranges axis scaling. AK/HI choropleth 40% bigger. Velocity map green ramp + sqrt scaling. Removed markLine from salary charts. |
| 2026-02-22 | BUILD | — | **CRITICAL FIX:** Bundle `dist/dashboard.min.js` was stale at v3.47. All source changes from v3.48–v3.55 (Phase G, E18 fix, SEO redesign) were committed to source files but never bundled. Rebuilt and deployed. |
| 2026-02-22 | G-S5+S6 | G23–G36 | Sprint 5+6: Output integration + feedback + iteration. Auto-save rewrites to library with tier provenance badges (v3.53). Cover letter archive UI (v3.55). Chrome Extension for LI profile capture (v3.55). Feedback UI with 5-dimension star ratings + qualitative text (v3.54). Revision Assessor agent + revision loop (v3.54). Entitlement features (v3.55). G29/G30 (LI checker + UI) shipped with Sprint 4 EF. **Phase G complete: v3.49–v3.55.** |
| 2026-02-22 | E18-fix | E18 | Improve Filters from Hidden Jobs — frontend wiring. analyze-hidden-job EF existed but had no UI. Added "Improve Filters" button on sort bar (appears after 3+ hidden), batch analysis modal, one-click apply to filter exclusions. v3.53. **Note:** Button was lost from dashboard.html when G-S5+S6 tree commit overwrote file; re-added at v3.55. |
| 2026-02-22 | G-S4 | G19–G22 | QA team: 3 parallel agents. Accuracy Auditor (Haiku) flags fabrication. Bleed Detector (Haiku) flags cross-job contamination. Voice & Polish Auditor (Sonnet) AI-speak kill list + auto-fixes. Cleaned sections used for docx. QA report in results panel. v3.52. |
| 2026-02-22 | G-S3 | G13–G18 | Rewrite team: Resume Writer (Sonnet) + Cover Letter Writer (Sonnet, conditional). 3 docx templates (Executive/Modern/Classic). docx-js server-side generation. Supabase Storage `rewrites` bucket. Full rewrite brief from acceptance UI. v3.51. |
| 2026-02-22 | G-S2 | G7–G12 | Gap Interview + Acceptance UI. Gap Interviewer agent (Haiku) with lateral questioning. Toggleable recommendation cards. Achievement prompt inputs. User highlights/notes/exclusions. Cover letter opt-in. Template picker. v3.50. |
| 2026-02-22 | G-S1 | G1–G6 | Premium multi-agent resume scoring pipeline. 4 agents (2 Haiku + 2 Sonnet), 3-pass architecture, 5 industry Gold Standards. Deep Analysis button. Dimension bars + coaching renderer. v3.49. |
| 2026-02-22 | E-S4+++ | E30–E31 | SEO tab full redesign per Pod 1 spec (13 CSS classes, 4-section layout, DOM stat cards, light-theme charts, loading/empty states). Dead job lightbulb icon. v3.46–v3.48. |
| 2026-02-22 | E-S4++ | E26–E29 | GSC sc-domain fix (URL Inspection working). RLS disabled on SEO tables (charts render). InLinks semantic schemas on 6 pages. Daily seo-sync cron job. v3.44–v3.45. |
| 2026-02-22 | E-S4+ | E22–E25 | SEO Admin v3.41: seo-sync v3 (9 tools — added Yellow Labs, CrUX, Knowledge Graph, Cloudflare). PSI 4-category. Dashboard redesign (6 charts + side panel). Credential consolidation. |
| 2026-02-22 | F-S4 | F14, F15 | Supabase CLI installed in automation. 10 stale Edge Functions deployed. pg_cron job added for materialized view refresh (every 10 min). |
| 2026-02-22 | F-S3 | F8–F13 | Cohort client wiring: checkEntitlement() helper, feature gates on filters/resumes, upgrade toast UI, PostHog plan_id fix, behavior_category defaults. v3.40. |
| 2026-02-22 | F-S2 | F5–F7 | Data pages live: 5 pages converted to Supabase RPCs with localStorage caching + methodology footers. v3.39. |
| 2026-02-22 | F-S1 | F1–F4 | Admin panel fix, Cohort Phase A database (cohorts, CPE, check_entitlement v2, auto-assign trigger, catalog adjustments). v3.30–v3.38. |
| 2026-02-21 | E-S4 | E20, E21 | SEO admin dashboard (6 tables, 7 RPCs, 4 sub-tabs, seo-sync EF). Page drilldown with PSI trends, CWV, index status. v3.28–v3.29. |
| 2026-02-21 | E-S3 | E17, E18, E19 | Dead job auto-removal. AI filter from hidden jobs (Improve button). AI filter from resume (generate-filter EF). v3.26–v3.27. |
| 2026-02-21 | E-S2 | E10–E16 | Real DB data for charts. Flipped map fix. Stats reorder + 2×2 grid. Count mismatch fix. Geo chart list view. v3.20–v3.25. |
| 2026-02-21 | E-S1.5 | E9a–E9g | AI scoring UX (v2.96–v3.00). Data Lab nav + current-page highlighting (v3.03–v3.10). Chart/nav consistency (v3.11–v3.19). |
| 2026-02-21 | E-S1 | E1–E9 | Data Lab rename, treemap/funnel fix, count standardization, admin 5-tab console, ref_city_radius cache, AI resume scoring, market-dynamics security RPC. v2.86–v2.95. |
| 2026-02-20 | E-S0 | E0a–E0g | Stats redesign (10 iterations, v2.68–v2.77). Console cleanup + dead listings (v2.78). Perf/a11y audit (v2.79). Feed improvements (v2.80). Market Dynamics page build (v2.80–v2.86). PSI automation. Badge contrast WCAG AA. |
| 2026-02-20 | D-S1 | D1 | Stats page redesign: theme token extraction, CSS loading state, inline style removal. 3 commits. |
| 2026-02-20 | D-S2 | D2 | Admin panel: board health metrics. Migration 004, 2 admin RPCs, admin page with stat cards + platform table. 6 commits. |
| 2026-02-20 | D-S3 | D3 | Landing page Phase 1: interactive preview, walkthrough carousel, 8 PostHog events. 3 commits. Pending: EF deploy + screenshots. |
| 2026-02-20 | D-S4 | D4 | Cohort Phase B: session analytics. Migration 005, user_sessions table, PostHog bridge. 2 commits. |
| 2026-02-20 | D-S5 | D5, D6 | Edge Functions deployed: refresh-jobs v12 (HTTP status tracking), preview-jobs (landing page). |
| 2026-02-20 | D-S6 | D8, D9 | Admin panel fixes: RPC auth + query optimization. Version unification (BJ_VERSION constant). Bundle rebuilt. |
| 2026-02-20 | D-S7 | D10 | Data pages: signup CTAs on all 6 pages, Data Lab eyebrow link, salary level order fix (Manager before Lead). |
| 2026-02-19 | S1 | A1, A2, A9, A10 | RLS verified on 20 tables (+6 policies). Security headers deployed. DOMPurify on job descriptions. |
| 2026-02-19 | S2 | A3, A4, A5, A11 | Role/plan on profiles. Audit log. Idempotency keys. Plans/subscriptions schema (3 tiers). |
| 2026-02-19 | S3 | A6, A12 | Feature gating RPC (8 features). Resilience module. Timeout+retry on all external calls. |
| 2026-02-19 | B-S1 | B8, B9, B10 | Supabase CLI migrations. Baseline migration. 7 performance indexes (82 total). |
| 2026-02-19 | C-S1 | C5, C6, C9, C10 | Feature flags, rate limiting, pagination audit, materialized views |
| 2026-02-19 | C-S2 | C3, C4, C7, C8 | Staging docs, CI/CD pipeline, correlation IDs, Dockerfile |
| 2026-02-19 | C-S3 | C1, C2 | Resume storage verified (pre-existing), orphan cleanup function |
| 2026-02-19 | B-S4 | B5, B6, B7 | Usage events tracking with rate-limited logger. Data export (13 tables, GDPR). Account deletion (soft delete + 30-day grace + cancel). |
| 2026-02-19 | B-S3 | B2, B3, B11 | Job queue (claim/complete/dead letter). Queue worker for async notifications. Monitoring alerts (pipeline stale, notification failures, dead jobs). |
| 2026-02-19 | B-S2 | B1, B4 | Soft deletes on 5 user tables. localStorage sync audit — already complete (saveUserData covers all 11 keys). |
| 2026-02-19 | S4 | A7, A8, A13 | Structured logger. Health check endpoint. PostHog snippet (gated). |


## Phase J: Infrastructure Hardening (v3.81–v3.86) — Feb 22

**Goal:** Performance optimization, data integrity automation, disaster recovery preparedness.

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| J1 | Index maintenance at scale | v3.81 | ✅ | Dropped 7 unused indexes (~104MB). `index_health_report()` monitoring. Runbook: `docs/INDEX_MAINTENANCE_RUNBOOK.md`. |
| J2 | N+1 query detection & fixes | v3.82 | ✅ | Parallelized 4 query patterns: radius search, state search, stats counts, velocity counts. 35→7 effective DB round-trips. Audit: `docs/N1_QUERY_AUDIT.md`. |
| J3 | Data hygiene automation | v3.83 | ✅ | `data_hygiene_cleanup()` with 6 retention policies. `hygiene_log` table. pg_cron job #16 (Sundays 3 AM UTC). Docs: `docs/DATA_HYGIENE_AUTOMATION.md`. |
| J4 | Client-side caching strategy | v3.84 | ✅ | `cachedQuery()` utility with TTL. `prewarmRefCaches()` on app init. ref_industries (1h TTL), ats_companies (10min TTL). Updated tuning.js + browsers.js consumers. |
| J5 | localStorage stress test & guards | v3.85 | ✅ | `saveUserData()` size guards (2MB reject, 500KB warn). `storageHealth()` console diagnostic. `_handleStorageFull()` emergency cleanup with array trimming. |
| J6 | Backup & DR plan + error recovery | v3.86 | ✅ | Full DR documentation: table priority matrix, recovery RTOs, cron job inventory, disaster scenarios. Docs: `docs/DR_BACKUP_PLAN.md`. |

**Phase J total:** 7 items | 6 versions | All complete.

### Manual Action Items
| Item | Owner | Status |
|------|-------|--------|
| Run VACUUM ANALYZE + REINDEX in Supabase SQL Editor | CEO | 🔲 |
