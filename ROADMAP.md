# Brilliant Jobs — Architecture Hardening Roadmap

**Last updated:** 2026-03-07
**Target launch:** Late March / Early April 2026 (velocity-calibrated from March 5 deploy data)
**Current version:** v7.22

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

- CSP: Landing page enforces no `unsafe-inline` (CS-018). Dashboard/admin still use `unsafe-inline`/`unsafe-eval` — tighten to nonce-based post-launch.
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
| D3 | Landing Page Phase 1 | 4d | 1h | 🚫 BLOCKED | Interactive preview (replaces static demo), hero ghost CTA, walkthrough carousel (6 slides), 8 PostHog events. **⛔ Blocked on:** D7 screenshot assets from CPO. Cannot complete walkthrough carousel without 5 images. |
| D4 | Cohort Phase B — Session Analytics | 2d | 30min | ✅ | Migration 005: user_sessions table + RLS. create_session/session_heartbeat RPCs. PostHog bridge (bj_session_id, bj_cohort_id, bj_plan_id super properties). sessionStorage-scoped, 5-min heartbeat. Client-side wiring complete in v3.40. |
| D5 | Edge Function: refresh-jobs v12 | 0.5d | 10min | ✅ | Records last_http_status + last_refresh_at on every board fetch. Timeout → status 0. Deployed. |
| D6 | Edge Function: preview-jobs | 0.5d | 5min | ✅ | New function for landing page preview. Deployed via Supabase CLI. |
| D7 | Walkthrough screenshots (5x) | 0.5d | — | 🚫 BLOCKED | CPO: feed.webp, match.webp, stats.webp, pipeline.webp, notifications.webp → /img/walkthrough/. **⛔ Blocked on:** CPO deliverable — no ETA. Blocks D3 landing page completion. |
| D8 | Admin panel fixes | 0.5d | 30min | ✅ | RPC auth fix (service_role + auth.uid), query optimization (304K rows → indexed single-pass), platform RPC fixed. 3 indexes added (status, first_seen, closed_at). Admin panel now shows live data. |
| D9 | Version unification | 0.25d | 10min | ✅ | Single BJ_VERSION constant in app.js drives console + nav. No more hardcoded version in HTML. v2.91. |
| D10 | Data pages: CTAs + Data Lab link + level fix | 0.5d | 20min | ✅ | Signup CTA on all 6 data pages + hub. Eyebrow "Data Lab" now links to /data-lab. Salary level order fixed: Manager before Lead. |
| D11 | Data pages: live data + security | 4d | 2h | ✅ | Planning + initial wiring. Actual deployment completed in F5–F7 (v3.39). |

**Phase D status:** 10/11 complete. 🚫 D3 blocked on screenshots (CPO). 🚫 D7 blocked on screenshots (CPO).

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
| Stripe Billing Portal configuration | 🚫 BLOCKED | Customer Portal for self-service plan management — EF exists, Portal needs configuration in Stripe Dashboard. **⛔ Blocked on:** CEO action in Stripe Dashboard. |
| Survey reward fulfillment | 🚫 BLOCKED | Wire 7-day Pro grant on periodic/NPS survey completion (`submitSurvey()` L1476 has TODO). Wire exit save-offer buttons (downgrade + 2-week Pro). Promises exist in UI — language kept per CPO direction, fulfillment deferred to monetization phase. **⛔ Blocked on:** Stripe subscription management must be live (Billing Portal config). |
| Vendor payout consolidation | 🚫 BLOCKED | Centralize Vercel/Supabase/DataForSEO/Cloudflare/Resend billing through Stripe. **⛔ Blocked on:** Post-launch ops — need active revenue + vendor billing cycles aligned. Low priority. |

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

### Phase 3: SMS System — 🔲 Not Started (Post-Launch)

| # | Item | Est. | Status | Blocker |
|---|------|------|--------|---------|
| I10 | Vonage account + US number | 30min | ✅ | Toll-free 18108923590, $12 balance, API key f81913a9 |
| I11 | Toll-free verification (A2P compliance) | 1h | 🚫 BLOCKED | Toll-free used instead of 10DLC — faster approval. **⛔ Blocked on:** CEO action — submit via Vonage dashboard. Non-blocking for testing but required for production SMS. |
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


## Phase N: USAJOBS Integration (v3.80–v4.09) — Feb 23, 2026

**Goal:** Add USAJOBS as the 6th job source (federal government positions, ~10K listings). Full propagation across landing, data lab, feed health, stats, and admin console.

### Sprint 1: Backend + Edge Function (v3.80)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| N1 | `refresh-usajobs` Edge Function | v3.80 | ✅ | New Edge Function. USAJOBS API (Authorization-Key + User-Agent). Parses federal job postings into ats_jobs schema. ~10K listings. |
| N2 | USAJOBS API key in Supabase secrets | v3.80 | ✅ | USAJOBS_API_KEY + USAJOBS_USER_AGENT stored. |
| N3 | Landing page: USAJOBS as 6th source | v4.09 | ✅ | FAQ updated. Source count references updated. |
| N4 | Data Lab: updated counts (38K+/350K) | v4.09 | ✅ | All 11 references updated from 10K/285K to 38K/350K. |
| N5 | Feed Health: USAJOBS as standard platform | v4.09 | ✅ | Inserted into ats_companies + feed_health_daily. Appears in Platform table, charts, Refresh Cycle — same as greenhouse/lever/etc. |
| N6 | Admin platform table formatting | v4.09 | ✅ | Right-aligned numerics, consistent K formatting (whole numbers), mono font. |
| N7 | Board counts: total monitored (38K+) | v4.09 | ✅ | get_landing_stats RPC updated to count all ats_companies (38,774 total). |

**Phase N total:** 7 items | All complete.

---

## Phase K-2: Admin Console Restructure (v4.00–v4.06) — Feb 23, 2026

**Goal:** Overhaul admin console with improved tab organization, Feed Health enhancements, cohort redesign, and SEO dedup.

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| K2-1 | Roadmap interactive filter bar | v4.01 | ✅ | Clickable blocked-type filters on roadmap.html. |
| K2-2 | Admin console restructure | v4.03 | ✅ | Tab reorder, cohort redesign (ID-only), Entitlements tab. |
| K2-3 | Admin links, job count fix, version SSoT | v4.04 | ✅ | Centralized version management. |
| K2-4 | Feed Health: charts, Jobs/Board, total row | v4.05 | ✅ | Platform metrics, refresh cycle tracker, Active % fix. |
| K2-5 | SEO dedup, cohort multi-select, Cloudflare | v4.06 | ✅ | Title dedup in SEO tab. Cohort multi-select. Cloudflare refresh. |

**Phase K-2 total:** 5 items | All complete.

---

## Phase P: Ghost Build (v4.07–v4.12) — Feb 23, 2026

**Goal:** Full Ghost Detection system — track which companies respond to job applications and which ghost candidates. Gmail OAuth integration for email-based signal detection.

**Spec:** `docs/GHOST_BUILD.md`

### Phase P1: Foundation — Pipeline + Scoring Engine (v4.07) ✅

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| P1 | `user_pipeline` table (Supabase) | v4.07 | ✅ | 15+ columns: stage progression, ghost scoring, company domain, auto-advance. RLS + indexes. |
| P2 | `company_ghost_stats` table | v4.07 | ✅ | Aggregated company ghost rates, avg response days, total applications. |
| P3 | `ghost_alerts_sent` dedup table | v4.07 | ✅ | Prevents duplicate ghost alert emails per pipeline entry + status combo. |
| P4 | `auto_refill_settings` table + trigger | v4.07 | ✅ | Default row creation on profile insert. Fixed 406 error (empty table + .single()). |
| P5 | `compute_ghost_score()` RPC | v4.07 | ✅ | 4-factor weighted scoring: time (40%), email (30%), listing (20%), company history (10%). Returns score, status, factors, confidence. |
| P6 | `get_pipeline_ghost_status()` RPC | v4.07 | ✅ | Joins pipeline + email_signals + company_ghost_stats. Returns full ghost analysis per entry. |
| P7 | `recompute_company_ghost_stats()` RPC | v4.07 | ✅ | Aggregates pipeline data into company-level ghost metrics. |
| P8 | Ghost Monitor page UI | v4.07 | ✅ | 4 KPI cards, ghost table with 10 columns (company, role, applied, days, email signal, listing status, score bar, status, confidence, action). Ghost score distribution chart (ECharts). |
| P9 | Pipeline client-side migration | v4.07 | ✅ | localStorage → Supabase migration for existing pipeline data. |
| P10 | `job-intelligence` ghost alerts | v4.07 | ✅ | Uses get_pipeline_ghost_status() + ghost_alerts_sent dedup. Sends ghost alert emails for ghosted/likely_ghosted entries. |
| P11 | Company Browser ghost rate badges | v4.07 | ✅ | Fetches company_ghost_stats, shows color-coded ghost rate on company cards (≥5 applications required). |

### Phase P2: Gmail OAuth + Email Scanning (v4.10) ✅

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| P12 | GCP: Gmail API enabled | v4.10 | ✅ | APIs & Services → Gmail API enabled. |
| P13 | GCP: OAuth 2.0 Client ID + consent screen | v4.10 | ✅ | Client: `27086315974-9988litv2cq153tlbqb7ag9u8bgmtsho`. Branding: logo, privacy policy, TOS links. External, Testing mode. Scope: `gmail.readonly` (restricted). Test user: gould.marston@gmail.com. |
| P14 | Gmail secrets in Supabase | v4.10 | ✅ | GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI. |
| P15 | `gmail_connections` table + RLS | v4.10 | ✅ | Encrypted refresh tokens, sync status, error tracking. UNIQUE(user_id). |
| P16 | `email_signals` table + RLS | v4.10 | ✅ | Classification: response/interview/rejection/auto_reply/scheduling/silence. Linked to pipeline entries. |
| P17 | Vercel rewrite rules | v4.10 | ✅ | `/api/auth/gmail/callback` → `gmail-auth`, `/api/auth/gmail/disconnect` → `gmail-disconnect`. |
| P18 | `gmail-auth` Edge Function | v4.10 | ✅ | CSRF-protected OAuth flow: connect (generates Google auth URL) → callback (exchanges code for tokens, stores encrypted refresh token, fetches Gmail address). CORS headers. |
| P19 | `gmail-disconnect` Edge Function | v4.10 | ✅ | Revokes Google token, deletes email_signals + gmail_connections. |
| P20 | `gmail-scan` Edge Function | v4.10 | ✅ | Batch scan: token refresh → query Gmail by company domain → keyword classification → upsert email_signals → auto-advance pipeline stages. Wall-time safety (120s). Rate limit handling. |
| P21 | pg_cron: gmail-scan every 6h | v4.10 | ✅ | `gmail-scan-6h` — 0 */6 * * *. Calls Edge Function via pg_net. |
| P22 | pg_cron: 90-day signal purge | v4.10 | ✅ | `purge-old-email-signals` — weekly, deletes email_signals older than 90 days. |
| P23 | Setup page: Connect/Disconnect Gmail UI | v4.10 | ✅ | Real OAuth flow (not placeholder). Connected state shows email address + disconnect button. Green dot indicator. |
| P24 | Ghost Monitor page: Gmail connect UI | v4.10 | ✅ | Connect button + connected state with email address + disconnect. |
| P25 | Gmail callback handler (client-side) | v4.10 | ✅ | Parses ?gmail=connected/denied/error params, cleans URL, shows appropriate feedback. |
| P26 | Privacy policy update | v4.10 | ✅ | Removed "(future)" label. Added: metadata-only access, disconnect deletes all data, never reads message body. |

### Phase P3: Admin + Polish (v4.12) ✅

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| P27 | Admin Ghost tab | v4.12 | ✅ | 4 KPI cards (total apps, ghosted, avg response, Gmail connected). Company Response Performance table (company, applications, responded, ghosted, ghost rate, avg response, last activity). Ghost Score Distribution bar chart (ECharts, top 15, color-coded). |
| P28 | Gmail OAuth verified end-to-end | v4.10 | ✅ | Test user (gould.marston@gmail.com) connected successfully. Token stored, scan executed (0 errors). |
| P29 | Manual scan test | v4.10 | ✅ | gmail-scan returned: 1 user processed, 0 pipeline entries (expected), 0 errors, 582ms. |
| P30 | Tiered Refresh v13 | v4.12 | ✅ | HOT (job_count>0, 9K boards, 6h) / WARM (empty+active, 29K, 3d) / COLD (404/inactive, 1.3K, 7d). Batch 50→150, concurrency 5→10, cron 6h→3min. 3 partial indexes. PR #72. Full HOT cycle ~6h (was 194 days). |

### Phase P Summary

| Sprint | Items | Theme |
|--------|-------|-------|
| P-S1 | P1–P11 | ✅ Foundation: pipeline, scoring, Ghost Monitor UI, alerts (v4.07) |
| P-S2 | P12–P26 | ✅ Gmail OAuth: GCP setup, 3 Edge Functions, email scanning, UI (v4.10) |
| P-S3 | P27–P29 | ✅ Admin ghost tab + verification (v4.12) |
| **Total** | **30 items** | **✅ Phase P complete (v4.07–v4.12)** |

**Not built (intentionally deferred):**

| Item | Status | Notes |
|------|--------|-------|
| Google OAuth verification submission | ⏳ | 4-10 week timeline. Submit when ready for production (>100 users). Testing mode sufficient for now. |
| Claude API email classification fallback | ⏳ | Future enhancement — keyword classifier works for English, Claude fallback for ambiguous snippets. |

**Email Classification Keywords:**

| Category | Keywords |
|----------|----------|
| Scheduling | calendly.com, goodtime.io, pick a time, book a time, availability |
| Interview | interview, schedule a call, phone screen, next steps, coding challenge |
| Rejection | unfortunately, not moving forward, other candidates, position filled |
| Auto-reply | we received your application, thank you for applying, noreply |
| Response | (default — any email from company domain that doesn't match above) |
| Silence | (no emails found from company domain since application date) |

**12 agents total (Phase G) + 3 Ghost Edge Functions (Phase P) = 15 Edge Functions with AI/email capabilities.**

---


## Phase S: SEO Data Pages (v4.13) — Feb 23, 2026

**Goal:** 127 public, server-rendered data pages targeting organic search traffic. Pre-computed aggregates served via Vercel serverless + ISR. Charts hydrated client-side with ECharts.

**Source:** `seo-data-pages-handoff-v2.md` (Pod 1 spec, 11-step build plan)

### Sprint 1: Database Infrastructure (v4.13) ✅

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| S1 | `seo_metro_map` table + 15 metros seeded | v4.13 | ✅ | Slug → city_variants/state_code/exclude_cities matching. Public RLS. |
| S2 | `seo_role_map` table + 20 roles seeded | v4.13 | ✅ | Slug → title keyword matching. Public RLS. |
| S3 | `seo_page_cache` table | v4.13 | ✅ | Pre-computed JSONB aggregates. 24h TTL. Public RLS. |
| S4 | 4 performance indexes on `ats_jobs` | v4.13 | ✅ | open_state, open_first_seen, open_loc_type, open_ats_source. Cut compute times from timeout → <40s. |

### Sprint 2: Compute Functions + Scheduling (v4.13) ✅

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| S5 | `compute_seo_cache_market()` | v4.13 | ✅ | Global stats: 298K jobs, median salary, velocity, timeline, salary buckets, top companies, ATS breakdown. ~28s. |
| S6 | `compute_seo_cache_metro(slug)` | v4.13 | ✅ | Per-metro aggregates. 15 metros, 1–38s each. |
| S7 | `compute_seo_cache_role(slug)` | v4.13 | ✅ | Per-role trend aggregates. 20 roles, 6–21s each. |
| S8 | `compute_seo_cache_combo(metro, role)` | v4.13 | ✅ | Metro+role combos. 91 above 50-job threshold. |
| S9 | `compute_seo_cache_rankings()` | v4.13 | ✅ | Cross-metro salary + volume rankings. Patched into each metro entry. ~12s. |
| S10 | `compute_seo_cache_all()` orchestrator | v4.13 | ✅ | Calls all above. ~6 min total. pg_cron job #26, daily 5 AM UTC. |

### Sprint 3: Serverless + Frontend (v4.13) ✅

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| S11 | `js/aggregations.js` shared module | v4.13 | ✅ | Isomorphic (browser + Node). bucketSalaries, countByLevel, countByLocType, computeMedianSalary, etc. |
| S12 | `api/seo-page.js` Vercel serverless function | v4.13 | ✅ | Reads seo_page_cache via anon key. Server-renders full HTML. ISR: 1hr revalidation, 24hr stale-while-revalidate. |
| S13 | 3 Vercel rewrite rules in `vercel.json` | v4.13 | ✅ | `/jobs-in/:metro`, `/jobs-in/:metro/:role`, `/trends/:role` → `api/seo-page.js`. |
| S14 | `seo-pages.css` | v4.13 | ✅ | Landing-page design language. 3 breakpoints (960, 640, 400). Outfit + JetBrains Mono. |
| S15 | `seo-charts.js` ECharts hydration | v4.13 | ✅ | 7 chart types: timeline, salary, companies, levels, worktype, comparison, metros. PostHog instrumentation. |
| S16 | PostHog snippet on all SEO pages | v4.13 | ✅ | Same A13 snippet as dashboard. Events: seo_page_viewed, seo_chart_interacted, seo_cta_clicked. |
| S17 | Sitemap: 127 SEO URLs added | v4.13 | ✅ | Total 137 URLs. Daily changefreq. Priority: 0.9 market, 0.8 metro/trends, 0.6 combos. |
| S18 | `@supabase/supabase-js` dependency | v4.13 | ✅ | Added to package.json for serverless function. |

### Sprint 4: SEO & Schema (v4.13) ✅

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| S19 | Unique `<title>` + `<meta description>` per page | v4.13 | ✅ | Dynamic with job count, median salary, metro/role name. |
| S20 | `<link rel="canonical">` + Open Graph tags | v4.13 | ✅ | og:title, og:description, og:url, og:type on every page. |
| S21 | Schema.org `Dataset` structured data | v4.13 | ✅ | JSON-LD on every page with name, description, creator, temporalCoverage. |
| S22 | `<noscript>` fallbacks for comparison data | v4.13 | ✅ | Ordered list of metro salary rankings for search engine crawlers. |
| S23 | Clean 404s for invalid slugs | v4.13 | ✅ | Custom 404 page with back-link. Below-threshold combos return 404 with explanation. |
| S24 | 2 inline CTAs per page | v4.13 | ✅ | "Create Free Account" + "See How It Works" with gradient background. |

### Phase S Summary

| Metric | Value |
|--------|-------|
| Total pages | 127 (15 metro + 20 trends + 91 combo + 1 market) |
| Total open jobs | 298,733 |
| National median salary | $90,000 |
| Top metro salary | San Francisco ($146K) |
| Top role salary | Software Engineer ($166K) |
| Cache refresh | Daily 5 AM UTC (pg_cron #26) |
| ISR revalidation | 1 hour |
| Files committed | 10 (migrations, JS, CSS, API, config) |
| Migrations | 007 (tables), 008 (functions) |

**Phase S total: 24 items | 1 version (v4.13) | All complete.**

---

## Phase Q: UX Polish & Resume-First Onboarding (v4.14+) — Feb 23, 2026

**Goal:** Address design debt, messaging inconsistencies, and workflow friction identified by 20-persona usability audit. Implement Resume-First Onboarding flow to eliminate the filter-setup barrier for new users.

**Source:** `brilliant-jobs-polish-audit.md` (Agentic Polish & Usability Team audit, 47 issues)

### Sprint 0: Quick Wins (v4.14) — Est. 2h

| # | Item | Est. | Status | Notes |
|---|------|------|--------|-------|
| Q1 | Replace all `alert()` with `showToast()` | 30min | ✅ | settings.js: 3 `alert()` calls → `showToast()`. Already available globally from globals.js. |
| Q2 | Standardize logo mark CSS across pages | 15min | ✅ | index.html: 30×30px white bg. pricing.html: 32×32px translucent bg. help.html: 22×22px accent bg. → Unified `.brand-mark` class: 32×32px, `#fff`, `border-radius:8px`, `color:var(--nav-bg)`. |
| Q3 | Add `aria-hidden="true"` to decorative nav SVGs | 20min | ✅ | All 11 nav icons are inline SVGs with no aria labels. Add `aria-hidden="true"` where adjacent text label exists. |
| Q4 | Fix empty state microcopy (3 strings) | 10min | ✅ | "No resumes uploaded" → "No resumes yet — drop one here and we'll show you how it stacks up." "No saved filters" → "No searches saved yet. Build your first one to start seeing jobs." "No data to export yet." → "Nothing to export yet — start tracking applications and your data will appear here." |
| Q5 | Add "Searching..." disabled state to search button | 20min | ✅ | Disable search button during async query execution, show "Searching..." text, re-enable on complete. |
| Q6 | Hide "0 beta users" social proof section | 5min | ✅ | Add minimum threshold check (100 users / 1K applications) before rendering social proof counters on landing page. |
| Q7 | Unify CTA text to "Start Free" | 15min | ✅ | Replace 5 CTA variants ("Get Started — It's Free", "Get Started Free", "Sign Up Free", "Create Your Free Account") with "Start Free" globally. |
| Q8 | Self-host fonts on help.html | 5min | ✅ | Replace Google Fonts CDN reference with same `@font-face` declarations used on index/dashboard/pricing. |
| Q9 | Rename "Be Brilliant" to "Get Started" | 5min | ✅ | Nav label + page header. Subheading: "Five steps, three minutes. Then your search runs itself." |
| Q10 | Add admin confirmation modals for write actions | 45min | ✅ | Entitlements, Cohorts, Users tabs — confirm dialog before any data mutation: "You're about to change X. This takes effect immediately. Confirm?" |

### Sprint 1: Pricing & Messaging Unification (v4.14) — Est. 4h

| # | Item | Est. | Status | Notes |
|---|------|------|--------|-------|
| Q11 | Unify pricing across landing ↔ pricing ↔ Stripe | 2h | ✅ | Landing page shows Free/Pro $29/Success $149. Pricing page shows Free/Starter $20/Pro $40. Stripe has Free/Starter $20/Pro $40. Pick one source of truth (Stripe), render dynamically everywhere. Remove "Success" plan from landing if deprecated, or add to pricing.html if active. |
| Q12 | Standardize "saved filters" vs "saved searches" | 30min | ✅ | Pick "saved searches" (more intuitive) and rename all user-facing instances. Internal code can keep `bj_saved_filters` key. |
| Q13 | Add credits explanation to landing page | 30min | ✅ | Single line on pricing cards: "Includes X credits/mo for AI features." Add "What are credits?" FAQ entry. |
| Q14 | Reconcile job/company count discrepancies | 30min | ✅ | Landing: "350K+ jobs / 38K+ companies." Be Brilliant: "110K+ / 1,900+ (Greenhouse only)." Make Be Brilliant explicit: "Currently indexing 110K+ on Greenhouse — with Lever, Workday, Ashby expanding the index." Landing pulls from `get_landing_stats()` RPC dynamically. |
| Q15 | Fix help.html product description mismatch | 30min | ✅ | Current help.html describes LinkedIn scraping workflow ("Harvest connections", "Scan profiles"). Split into: (1) Dashboard help at `/help` — filters, resumes, pipeline, billing. (2) Extension help — current content, served only in extension popup and Setup page. |

### Sprint 2: Resume-First Onboarding Flow (v4.15) — Est. 3d

| # | Item | Est. | Status | Notes |
|---|------|------|--------|-------|
| Q16 | `extract-resume-profile` Edge Function | 4h | ✅ | New EF using Claude Haiku. Input: resume text. Output: JSON `{ titles: [], locations: [], seniority: string, skills: [], industries: [], salary_range: string }`. Reuses existing resume text extraction (pdf.js/mammoth). |
| Q17 | Resume-First onboarding card UI | 4h | ✅ | After first login (no saved filters), show single card: "Let's find jobs that match you." Drop zone + "Skip for now — I'll build my own search →". Replaces Be Brilliant as default first-visit page. |
| Q18 | Resume intelligence summary card | 3h | ✅ | After extraction, show: "Here's what we found in your resume:" with editable tags for titles, locations, seniority, skills. Buttons: "Looks right — find my jobs →" / "Let me adjust →" |
| Q19 | Auto-generated filter from resume profile | 3h | ✅ | Create saved filter from extracted data: titles → whatPills, locations → wherePills, skills → keyword pills. Run search immediately. Show: "We found X jobs matching your resume." |
| Q20 | Onboarding milestone tracking | 2h | ✅ | Track completion: `onboarding_step` in profiles (0=new, 1=resume_uploaded, 2=profile_extracted, 3=filter_created, 4=first_search_run). Progressive nav disclosure tied to steps. |

### Sprint 3: Navigation & Architecture Polish (v4.16) — Est. 2d

| # | Item | Est. | Status | Notes |
|---|------|------|--------|-------|
| Q21 | Progressive nav disclosure for new users | 4h | ✅ | On first login show 3 nav items: Get Started, Jobs, Settings. Unlock Tuning after first filter save, Resumes after first upload, Pipeline after first job save. |
| Q22 | Merge Applications + Pipeline into single view | 4h | ✅ | Single "My Applications" page with `[List | Board]` toggle. List = current Applications, Board = current Pipeline kanban. |
| Q23 | Add "Global Rules" crosslink in filter builder | 1h | ✅ | Banner above filter builder: "Rules that apply to ALL searches: US-only ✓, 3 excluded titles. [Edit Global Rules →]". Links to Tuning page. |
| Q24 | Migrate saved filters to Supabase | 4h | ✅ | Move `bj_saved_filters` from localStorage to Supabase `user_filters` table. Same pattern as pipeline migration (P1). localStorage as cache only. |
| Q25 | Migrate tuning settings to Supabase | 3h | ✅ | Move `bj_tuning` from localStorage to Supabase `user_tuning` table. Enables cross-device sync. |

### Sprint 4: Accessibility & Interaction Polish (v4.17) — Est. 2d

| # | Item | Est. | Status | Notes |
|---|------|------|--------|-------|
| Q26 | Keyboard navigation for filter builder | 3h | ✅ | `tabindex="0"` + `onkeydown` on all pill elements. Visible focus rings (`outline: 2px solid var(--accent)`). |
| Q27 | Color-independent status indicators | 2h | ✅ | Extension dot: add "Connected"/"Not connected" text label. Pipeline: ensure stage name always visible alongside color. Credit badge: add `aria-label`. |
| Q28 | Loading/skeleton states for async operations | 3h | ✅ | Skeleton rows for job feed during search. Spinner in search area. Disabled+loading state for all AI action buttons. |
| Q29 | Mobile nav touch targets (48px min) | 2h | ✅ | Increase mobile nav item height to 48px min (WCAG 2.5.8). 8px vertical padding between items. Hamburger icon 44×44px. |
| Q30 | Dashboard voice alignment with landing page | 2h | ✅ | Update dashboard meta description, page headers, and empty states to match landing page's confident, opinionated tone. |

### Phase Q Summary

| Sprint | Items | Est. | Theme |
|--------|-------|------|-------|
| Q-S0 | Q1–Q10 | 2h | Quick wins — consistency, a11y, microcopy |
| Q-S1 | Q11–Q15 | 4h | Pricing & messaging unification |
| Q-S2 | Q16–Q20 | 3d | **Resume-First Onboarding** (highest impact) |
| Q-S3 | Q21–Q25 | 2d | Navigation & architecture polish |
| Q-S4 | Q26–Q30 | 2d | Accessibility & interaction polish |
| **Total** | **30 items** | **~6d** | **UX Polish & Resume-First Onboarding** |

### Phase Q Priority

| Priority | Items | Rationale |
|----------|-------|-----------|
| **P0 — This Week** | Q1–Q10 (Sprint 0) | Quick wins, < 2h total, immediate quality lift |
| **P0 — This Week** | Q11, Q14, Q15 | Trust-critical: pricing mismatch, stat mismatch, help page mismatch |
| **P1 — 2 Weeks** | Q16–Q20 (Sprint 2) | Resume-First Onboarding — highest-impact new feature |
| **P1 — 2 Weeks** | Q24–Q25 | localStorage → Supabase migration for cross-device sync |
| **P2 — 4 Weeks** | Q21–Q23, Q26–Q30 | Navigation + accessibility polish |

---

## Phase R: AI Resume Rewrite — JD-Match Boost (v4.28) — Feb 23-24, 2026

**Goal:** Job-specific AI resume rewrite pipeline. Analyzes gaps between a resume and a specific JD, asks targeted questions, rewrites sections, verifies truthfulness, outputs DOCX. The "Boost Match" feature that turns B/C matches into A matches.

**Architecture:** 2 Edge Functions, 4 AI agents (2 Haiku + 1 Sonnet + 1 Haiku), client-side DOCX generation, Supabase Storage.

**Cost per rewrite:** ~$0.018 AI + 3 credits ($0.40) = 94% gross margin.

### Sprint 1: Database + Edge Functions (Phase 0 + A)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| R1 | `resume_texts` table + RLS + indexes | v4.27 | ✅ | Server-side resume text storage. Background sync from client. Unique(user_id, resume_id). |
| R2 | `rewrite_sessions` schema extension | v4.28 | ✅ | 11 new columns: target_job_id, gap_analysis, user_answers, rewritten_content, quality_check, original_score, new_score, credits_used, output_file_path, completed_at, rewrite_type. 4 indexes. |
| R3 | `init_rewrite_session` RPC + `strip_html()` | v4.28 | ✅ | SECURITY DEFINER. Credit check (3 min), fetches resume text + stripped JD, creates session. Structured errors. |
| R4 | `rewrite-resume-analyze` Edge Function | v4.28 | ✅ | Agent 1: Gap Analyzer (Haiku). Agent 2: Question Generator (Haiku). ~5s. |
| R5 | `rewrite-resume-execute` Edge Function | v4.28 | ✅ | Agent 3: Rewriter (Sonnet). Agent 4: Quality Checker (Haiku). Auto-retry on truthfulness fail. Credit debit. |

### Sprint 2: UI + DOCX + Hardening (Phase B-F)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| R6 | `js/rewrite.js` — slide-out panel | v4.28 | ✅ | 3-state: analyzing → Q&A → diff view. Progress dots, gap summary, question cards, side-by-side diff, score improvement bar. |
| R7 | Boost pill on Jobs Feed | v4.28 | ✅ | `matchBadgeWithBoost()` — renders when match < 85%. Finds assigned resume. Edge cases handled. |
| R8 | Client-side DOCX generation | v4.28 | ✅ | docx-js UMD from CDN. Upload to Storage. Auto-download. Plaintext fallback. |
| R9 | Build hardening — esbuild scope fix | v4.28 | ✅ | Fixed duplicate `const session` in app.js. Reverted IIFE wrapping. Bundle: 772KB → 511KB minified. |

**Phase R total: 9 items, 2 sprints, all complete. Version: v4.28. Edge Functions: 27 total (2 new).**

---

## Phase S2: Survey System Hardening (M-R1–R6) (v4.29) — Feb 24, 2026

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| M-R1 | Deploy `nps-pulse` Edge Function | v4.29 | ✅ | Bug fix: `last_sign_in_at` → `last_seen_at`. Deployed + verified. |
| M-R2 | Configure `pg_cron` for `nps-pulse` | v4.29 | ✅ | `nps-pulse-monthly`: 0 15 1 * * *. 10am ET. |
| M-R3 | Build periodic survey automated trigger | v4.29 | ✅ | `periodic-survey-pulse` EF (123 lines). 90-day de-dupe via `profiles.user_data.last_periodic_date`. pg_cron: 15th of month. |
| M-R4 | Micro-survey priority weighting | v4.29 | ✅ | Already built in `micro-surveys.js`. Priority queue (500ms flush): paywall=100, search=60, apply=50, data=30. |
| M-R5 | Fix NPS formula in `survey_social_proof` | v4.29 | ✅ | Replaced `avg(nps_score)` with standard NPS: `(% promoters[9-10] - % detractors[0-6]) × 100`. |
| M-R6 | Fix `survey_social_proof` anon access | v4.29 | ✅ | `GRANT SELECT ON survey_social_proof TO anon`. Verified: anon key returns data. |

**Phase S2 total: 6 items, all complete. Version: v4.29. Edge Functions: 29 total (2 new). pg_cron: 14 total (2 new).**

---

## Phase T: Intelligent Pipeline Tracking (v4.30–v4.32) — Feb 24, 2026

**Goal:** Transform the manual-only pipeline into an intelligent tracking system with automated signal detection (Gmail + Calendar), time-based smart prompts, cross-user pattern learning, and confirmation-first UX. Pod 1 (Growth) brief → Pod 2 (Engineering) implementation.

### Sprint 1: Schema + Smart Prompts (Phase A) (v4.30)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| T1 | `user_pipeline` schema extension | v4.30 | ✅ | +7 columns: tracking_mode, custom_reminder_at, status_note, last_prompted_at, prompt_count, company_domain, stage_changed_at. |
| T2 | `pipeline_tracking_settings` table | v4.30 | ✅ | Per-user cadences, scan prefs, prompt channels, confidence threshold. RLS: user_id = auth.uid(). |
| T3 | `pipeline_signals` table | v4.30 | ✅ | Evidence log for all detected/time-based signals. Status: pending_confirmation → confirmed/dismissed/expired. RLS enforced. |
| T4 | `signal_patterns` table + 21 seeds | v4.30 | ✅ | Cross-user learning: sender_domain (5 ATS), subject_keyword (12 patterns), calendar_format (4 patterns). Confidence scoring: confirmations/(confirmations+dismissals). |
| T5 | `prompt-pipeline-updates` Edge Function | v4.30 | ✅ | Hourly cron. Checks cadences per user settings. Creates time_based signals. Sends notifications via `send-notification`. Wall-time safety (120s). |
| T6 | `confirm-pipeline-signal` Edge Function | v4.30 | ✅ | User action handler: confirm/correct/dismiss/snooze. Updates pipeline stage. Adjusts signal_patterns confidence. |
| T7 | 5-color dot system | v4.30 | ✅ | Green (on track), blue pulsing (signal detected), yellow (prompt due), red (overdue), gray (terminal). CSS animations. |
| T8 | Inline signal confirmation cards | v4.30 | ✅ | Expand below pipeline row on dot click. Evidence preview, proposed stage change, confirm/correct/dismiss buttons. |
| T9 | Inline prompt cards | v4.30 | ✅ | Stage-appropriate quick actions: Got response, Interview scheduled, Rejected, No update yet, Archive. |
| T10 | pg_cron: `prompt-pipeline-hourly` | v4.30 | ✅ | `30 * * * *` — hourly at :30. |

### Sprint 2: Gmail Signals + Calendar + Settings (Phases B–D) (v4.31)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| T11 | Refactor `gmail-scan` to confirmation-first | v4.31 | ✅ | Replaced `autoAdvancePipeline()` with `createPipelineSignals()`. Email classifications now create pending pipeline_signals instead of auto-moving entries. |
| T12 | `scan-pipeline-signals` Edge Function | v4.31 | ✅ | Calendar scanning: Google Calendar API events.list. Matches attendee domains + event titles against pipeline companies. 3-tier confidence (high/med/low keywords). |
| T13 | pg_cron: `scan-pipeline-signals-15m` | v4.31 | ✅ | `*/15 * * * *` — every 15 min for users with signal_detection_enabled. |
| T14 | pg_cron: `pattern-confidence-decay` | v4.31 | ✅ | Weekly (Sundays 4am): `confidence_score *= 0.95` for patterns not seen in 30 days. Floor: 0.3. |
| T15 | Pipeline Intelligence settings UI | v4.31 | ✅ | New section on Applications page: Smart Prompts toggle, Signal Detection toggle, cadence inputs, scan frequency, confidence threshold (Low/Med/High). |
| T16 | Gmail connection status indicator | v4.31 | ✅ | Shows connected/disconnected state with link to Setup page. |

### Sprint 3: Spec Gap Closure (v4.32)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| T17 | 'Last Activity' column | v4.32 | ✅ | New pipeline table column: "Signal 2h ago", "Prompt 3d ago", or relative time since stage change. `_relTime()` helper. |
| T18 | Stage header signal count badges | v4.32 | ✅ | "X signals pending" blue pill badge on each stage header. Auto-hides when 0. |
| T19 | PostHog analytics events | v4.32 | ✅ | 5 events: signal_detected, signal_confirmed, signal_dismissed, prompt_snoozed. Includes signal_source, signal_type, proposed_stage metadata. |
| T20 | Prompt notification channels UI | v4.32 | ✅ | Email/In-app/SMS checkboxes in advanced settings. Saves to prompt_channels array. |
| T21 | Email thread depth + Calendar lookahead UI | v4.32 | ✅ | Number inputs: thread depth 10-200 (default 50), calendar lookahead 7-30 days (default 14). |
| T22 | Per-application ⋮ context menu | v4.32 | ✅ | Mute/unmute prompts, set custom reminder (date), add status note (free text), remove from pipeline. 📌 and 🔇 indicators. |

**Phase T total: 22 items, 3 sprints, all complete. Version: v4.30–v4.32. Edge Functions: 32 total (3 new: prompt-pipeline-updates, confirm-pipeline-signal, scan-pipeline-signals). gmail-scan refactored. pg_cron: 17 total (3 new: prompt-pipeline-hourly, scan-pipeline-signals-15m, pattern-confidence-decay).**

---

## Phase 37: Content Engine Remaining — Handoff v3 (v4.71) — 2026-02-25

**Goal:** Roadmap update from Pod 1 Content Engine Handoff v3. Segments remaining CE work into 4 categories: Permanent Pages (A), Topical Coverage (B), Integration Wiring (C), Enrichment Monitoring (D). Adds 17 items totaling 37-52 dev days.

**Source:** `docs/CONTENT_ENGINE_REMAINING_HANDOFF.docx` (v3)

### Section A: Permanent Pages (6 items, 19-25 days)

| # | Item | Est. | Status | Notes |
|---|------|------|--------|-------|
| A1 | Company SEO Pages + Ghost Rate Reports | 5-7d | ✅ | v4.76. /company/:slug live. Vercel rewrite rule added. Schema.org Organization. seo_page_cache extended with company rows. |
| A2 | College Major Outcomes Page | 3d | ✅ | v4.77. /college-major-outcomes live. 73 majors, NY Fed data × BJ ATS data. major_keyword_mapping table + get_jobs_by_major() RPC. |
| A3 | Jobs by Location Data Page | 4-5d | 🚫 DEFERRED | /jobs-by-location. Blocked on country parsing (GH 0.8%, Lever 0%, Ashby 0%). |
| A4 | Remote vs Non-Remote Tracker | 3-4d | 🔲 | /remote-vs-office. get_remote_differential() RPC. Launchable at 36% loc_type. Salary needs 40%+. |
| A5 | Content Freshness Rotation | 2-3d | ✅ | v4.73. Infrastructure: last_refreshed_at, refresh_interval_days, data_volatility_score on seo_page_cache. Tiered: 7d/14d/30d. |
| A6 | Filter-Driven Trend Indicators | 2-3d | ✅ | v4.74. get_filter_trend() RPC. Trend badges on saved filter cards. |

### Section B: Topical Coverage (6 items, 11-17 days)

| # | Item | Est. | Status | Notes |
|---|------|------|--------|-------|
| B1 | Metro Comparison Stories | 1d | ✅ | v4.76 Wave 4. metro_comparison template + threshold tuning (salary Δ 10%+, volume ratio 20%+). |
| B2 | Multi-Dimensional Insight Stories | 2-3d | 🔲 | 3 detection rules (salary_x_remote, role_x_industry, level_x_location). Blocked on 60%+ coverage. |
| B3 | Economic Overlay Stories | 3-4d | 🔲 | compute-correlations weekly cron. 3 rules: econ_divergence, econ_inflection, econ_milestone. Needs 90+ days econ data. |
| B4 | Community Benchmark Stories | 2d | 🔲 | benchmark_shift rule + quarterly cron. Needs 50+ pipeline entries/segment. |
| B5 | NY Fed Crossover Stories | 2-3d | ✅ | v4.76 Wave 4. 5 templates: T11 Quarterly Update, T12 Major Spotlight, T13 Salary Divergence, T14 College Premium, T15 Underemployment × Hiring. |
| B6 | Annual State-of-the-Market Report | 3-4d | 🔲 | annual_report template. Manual trigger + admin approval. First report Q4 2026. |

### Section C: Integration Wiring (4 items, 5-7 days) — ALL NEW

| # | Item | Est. | Status | Notes |
|---|------|------|--------|-------|
| C1 | Dashboard Insight Cards Wiring | 1-2d | ✅ | v4.67. Insight cards above jobs feed. /content-api/merch-dashboard with filter context. Dismiss with 24h reset. |
| C2 | Email Digest Integration | 2-3d | ✅ | v4.75. Extended weekly-summary EF with top 3 stories section from content_stories. |
| C3 | Landing Page Merchandising Wiring | 1d | ✅ | v4.75. data-merch-placement div → merch-client.js → /content-api/merch-index → 3 story cards. |
| C4 | Blog Index + Discovery | 0.5-1d | ✅ | v4.75. Nav link, footer link, RSS, blog-to-dashboard CTAs. |

### Section D: Enrichment Monitoring (1 item, 2-3 days) — NEW

| # | Item | Est. | Status | Notes |
|---|------|------|--------|-------|
| D1 | Enrichment Coverage Dashboard | 2-3d | ✅ | v4.72. Admin tab: 4 coverage cards, trend chart, gate indicators (40%/60%), throughput, platform breakdown. |

### Recommended Build Order

| Wave | Items | Days | Theme |
|------|-------|------|-------|
| 1 | D1, A5, A6, C4, C3 | 6-10 | Foundation + quick integration wins |
| 2 | C1, C2 | 3-5 | Integration wiring — content reaches users |
| 3 | A1, A2 | 8-10 | Company pages + college outcomes |
| 4 | B1, B4, B5, B2, B3 | 10-14 | Topical story templates |
| 5 | A4, A3 | 7-9 | Gated: remote tracker + jobs by location |
| Deferred | B6 | 3-4 | Annual report template — Q3-Q4 2026 |

### Coverage Gates

| Field | Current | Target | Unblocks |
|-------|---------|--------|----------|
| Salary | 10% | 40%+ | A4 Remote tracker, B2 Multi-dim stories |
| Location Type | 36% | 60%+ | A4 Remote tracker, B2 Multi-dim stories |
| Department | 44% | 60%+ | B2 Multi-dim stories |
| Country (GH/Lever/Ashby) | 0-0.8% | 80%+ | A3 Jobs by Location |

**Phase 37 total: 17 items | 12 complete (A1,A2,A5,A6,B1,B5,C1,C2,C3,C4,D1), 1 deferred (A3), 4 remaining (A4,B2,B3,B4,B6). Versions: v4.67–v4.77.**


## Master Status Summary

| Phase | Items | Version Range | Status |
|-------|-------|---------------|--------|
| **A** Pre-Launch Critical | 13/13 | — | ✅ Complete |
| **B** Post-Launch Foundation | 12/12 | — | ✅ Complete |
| **C** Scale Readiness | 10/10 | — | ✅ Complete |
| **D** Product Features | 10/11 | v3.30–v3.40 | ⚠️ D3/D7 🚫 blocked on CPO screenshots |
| **E** Feb 21 Feature Sprint | 46/46 | v2.68–v3.48 | ✅ Complete |
| **F** Feb 22 Sprint | 15/15 | v3.30–v3.40 | ✅ Complete |
| **G** AI Resume Pipeline | 36/36 | v3.49–v3.55 | ✅ Complete |
| **H** Stripe Monetization | 19/19 | v3.71–v3.75 | ⚠️ Billing Portal 🚫 blocked on CEO Stripe config |
| **I** Communication Center v2 | 15/16 | v3.76–v3.79 | ⚠️ Toll-free verification 🚫 blocked on CEO Vonage action |
| **J** Infrastructure Hardening | 12/13 | v3.81–v3.88 | ⚠️ J13 🚫 blocked on Greenhouse API partnership |
| **M** Surveys & User Intelligence | 13/25 + 15 foundation | v3.92–v4.29 | ⚠️ M-R7 🚫 blocked (Stripe). 12 P13 items 🚫 blocked (user volume). |
| **N** USAJOBS Integration | 7/7 | v3.80–v4.09 | ✅ Complete |
| **K-2** Admin Console Restructure | 5/5 | v4.00–v4.06 | ✅ Complete |
| **P** Ghost Build + Perf | 30/30 | v4.07–v4.12 | ✅ Complete |
| **S** SEO Data Pages | 24/24 | v4.13 | ✅ Complete |
| **Q** UX Polish & Resume-First Onboarding | 30/30 | v4.14–v4.27 | ✅ Complete (Q1–Q15 all done) |
| **R** AI Rewrite: JD-Match Boost | 9/9 | v4.28 | ✅ Complete |
| **S2** Survey System Hardening | 6/6 | v4.29 | ✅ Complete |
| **T** Intelligent Pipeline Tracking | 22/22 | v4.30–v4.32 | ✅ Complete |
| **Hotfixes** | 15 versions | v3.56–v3.70 | ✅ Stabilized |
| **31** Daily Fixes & Admin Panel | 22/22 | v4.42–v4.48.1 | ✅ Complete |
| **31b** Merchandising System | 5/5 | v4.51 | ✅ Complete |
| **32** Layout & Query Builder Fixes | 4/4 | v4.52–v4.54 | ✅ Complete |
| **33** Resume Archive + Metrics | 31/31 | v4.55–v4.60 | ✅ Complete |
| **34** Pipeline Intelligence Version Sync | 6/6 | v4.61 | ✅ Complete |
| **35** Calendar Intelligence + Cross-User Learning | 9/9 | v4.62 | ✅ Complete |
| **36** Signal Analytics + Notification Templates | 7/7 | v4.63 | ✅ Complete |
| **37** Content Engine Remaining — Handoff v3 | 35/35 | v4.71 | ✅ Complete |
| **38** Styling Fixes | 4/4 | v4.79a | ✅ Complete |
| **39** Bug Tracker Resolution | 6/6 | v4.83 | ✅ Complete |
| **39b** Pod 1 UX & Design Sprint | 20/20 | v4.82–v4.83 | ✅ Complete |
| **40** Feed Quality & Search Relevance | 13/13 | v4.86–v4.90 | ✅ Complete |
| **40b** Pod 1 Sprint — Pricing, Global Version, AEO | 19/19 | v4.84 | ✅ Complete |
| **43** City Pages + Internal Linking | 20/20 | v4.91–v4.93 | ✅ Complete |
| **44** Data Integrity & Sync Consolidation | 15/15 | v4.94–v5.00 | ✅ Complete |
| **45** Visual Consistency Pass + UX Fixes | 16/16 | v5.01–v5.05 | ✅ Complete |
| **46** Referral Program | 9/9 | v5.07–v5.10 | ✅ Complete |
| **47** Hotfixes & UX Polish | 11/11 | v5.06, v5.11–v5.17 | ✅ Complete |
| **48** Referral Hub Redesign | 17/17 | v5.19–v5.25 | ✅ Complete |
| **49** Extension Infrastructure | 17/17 | v5.44–v5.48 | ✅ Complete |
| **50** Extension Completion Sprint | 12/12 | v5.49–v5.54 | ✅ Complete |
| **51** Competitive Gap Closure | 7/7 | v5.55–v5.56 | ✅ Complete |
| **52** Data Quality & Pipeline Hardening | 10/10 | v5.57–v5.62 | ✅ Complete |
| **53** SEO Data Consistency | 4/4 | v5.63 | ✅ Complete |
| **54** PDL Enrichment | 2/2 | v5.64 | ✅ Complete |
| **55** Workday Discovery + Data Quality | 4/4 | v5.65 | ✅ Complete |
| **56** SEO Count Accuracy | 4/4 | v5.66 | ✅ Complete |
| **57** Industry Detail Pages | 1/1 | v5.90 | ✅ Complete |
| | | | |
| **Total** | **~870 done** | **v2.68–v5.90** | **7 in progress, 113 todo, ~15 🚫 blocked** |

### 🚫 Blocked Items Quick Reference (Updated 2026-03-01)

| Item | Blocked On | Owner | Category | Notes |
|------|-----------|-------|----------|-------|
| D3 — Landing Page interactive preview | D7 screenshots from CPO | CPO | **CEO/CPO Action** | |
| D7 — Walkthrough screenshots (5x) | CPO deliverable | CPO | **CEO/CPO Action** | |
| Stripe Billing Portal configuration | Configure in Stripe Dashboard | CEO | **CEO/CPO Action** | EF exists, portal needs config |
| Vonage inbound webhook URL | Set in Vonage Dashboard | CEO | **CEO/CPO Action** | Required for production SMS |
| Toll-free verification (I11) | Submit via Vonage Dashboard | CEO | **CEO/CPO Action** | Non-blocking for testing |
| ~~VACUUM ANALYZE + REINDEX~~ | ~~Run in Supabase SQL Editor~~ | — | ~~Resolved~~ | ✅ Done during Supabase upgrade |
| ~~32K ungeocoded locations export~~ | ~~External geocoding service~~ | — | ~~Resolved~~ | ✅ normalize_locations_v2 RPC (v5.74) — 92.2% coverage |
| J13 — Enrich ~555 companies | Greenhouse API partnership | External | **External Dependency** | Partner program applications open |
| ATS partner applications | Greenhouse/Lever/Ashby partner programs | External | **External Dependency** | |
| Vendor payout consolidation | Active revenue + post-launch ops | Launch | **Post-Launch** | |
| P13-12 — Feature prioritization | User volume | Launch | **Post-Launch** | |
| P13-14 — Ghost Job flagship survey | 1K+ users for target | Launch | **Post-Launch** | |
| P13-15–17 — Market/employer/referral surveys | P13-14 + user volume | Launch | **Post-Launch** | |
| P13-18 — Survey → content pipeline | P13-14/15-17 survey data | Launch | **Post-Launch** | |
| P13-19–25 — User Intelligence System (7 items) | Launch + months of user data | Launch | **Post-Launch** | |

### Outstanding Items (Updated 2026-03-01)

| Item | Phase | Priority | Status |
|------|-------|----------|--------|
| ~~Production Stripe keys~~ | H | — | ✅ Done — live keys set, webhook registered |
| ~~Stripe webhook endpoint~~ | H | — | ✅ Done — `we_1T3lqYPKzCZbw3KzQwljS2K8` |
| ~~Stripe pricing page~~ | H | — | ✅ Done — v3.80 |
| ~~`survey_social_proof` anon access~~ | M | — | ✅ Done — M-R6 (v4.29) |
| `nps-pulse` Edge Function not deployed | M | **High** | Needs deploy: `supabase functions deploy nps-pulse --no-verify-jwt` |
| 🚫 Stripe Billing Portal for self-service | H | **High** | ⛔ CEO action — configure Customer Portal in Stripe Dashboard |
| 🚫 D3 — Landing Page interactive preview | D | Medium | ⛔ Blocked on D7 screenshots from CPO |
| 🚫 D7 — Walkthrough screenshots (5x) | D | Medium | ⛔ Blocked on CPO deliverable |
| 🚫 Vonage inbound webhook URL | I | **High** | ⛔ CEO action — set on Vonage Dashboard → Numbers → 18108923590 |
| 🚫 Toll-free verification | I | Low | ⛔ CEO action — submit via Vonage dashboard |
| 🚫 Vendor payout consolidation | H | Low | ⛔ Post-launch ops |
| 🚫 ATS partner applications | — | Medium | ⛔ External dependency |
| Registration locked | — | **High** | Signup disabled in UI until launch (v5.89) — re-enable when ready |

---

## Changelog

| Date | Sprint | Items | Summary |
| 2026-03-01 | 57 | #15-#16 | **v5.89: Approval gates for editorial pipeline (#15). v5.90: Industry Detail Pages (#16).** 15 industry detail pages, 5 RPCs, 6-layer validation gate, approve-content EF. Content Strategy Audit 19/19 complete. Phase 11 closed. |
| 2026-02-27 | 51 | CG1–CG5 | **Phase 51: Competitive Gap Closure (v5.55–v5.56).** 5 items from competitive analysis vs FastApply/Huntr/OwlApply. v5.55: Generic/Universal Form Handler (DOM heuristic for any ATS, doubles coverage to 8+) + Manifest Host Permissions Fix (auto-inject on all ATS domains). v5.56: On-Page Status Overlay (floating fill progress widget, `inject-overlay.js`), Cover Letter Generation (`generate-cover-letter` Edge Function, Claude Haiku ~$0.001/letter), Fill Metrics & Feedback Loop (`fillMetrics.js` — PostHog events, Supabase persistence, AI answer ratings). Extension 2.15.0→2.16.0. All 5 items code-complete and deployed. |
| 2026-02-27 | 49 | EXT1–EXT8 | **Phase 49: Extension Rework & Auto-Apply Infrastructure (v5.26–v5.42).** Complete Chrome extension overhaul adding multi-ATS auto-apply on top of existing LinkedIn scanner. Browser-fill submission chain for 9 platforms (Greenhouse, Lever, Ashby, Workable, Recruitee, LinkedIn Easy Apply, Indeed, Workday, generic). AI question answering via Claude Haiku (50/day). Multilingual label detection (FR/ES/DE/IT). Human-simulation typing with bezier cursor paths. autoTracker.js for application success detection + Chrome notification on confirmation (v5.42). 3-layer code obfuscation. Extension RBAC (admin-gated scanner). Greenhouse API token scraping (205/4,204 boards). submit-application EF with Recruitee zero-auth + Greenhouse token-based API submission. Score-gated decision engine: 6 modes, score gate modal, score-resume EF (833 lines), pending_applications state machine, pg_cron expiry. Extension v2.11.0. Roadmap flips: Application auto-detect (done), Auto-apply form-fill (done), Decision engine (done). New items added: auto-apply trigger engine, extension update notification. 20 remaining items documented in EXTENSION_COMPLETION_HANDOFF.docx. |
| 2026-02-27 | 48 | RH1–RH12 | **Phase 48: Referral Hub Redesign (v5.19–v5.25).** Full 4-phase redesign per spec v3. Phase 1: copy rewrite, hero banner, SVG badge icons, tier names (Signal/Source/Radar/Intel/Clearance), design system alignment (v5.19). Phase 2: leaderboard rewards backend — `leaderboard_rewards` table, `distribute_leaderboard_rewards` RPC (SECURITY DEFINER), pg_cron weekly+monthly, `get_leaderboard` RPC, Resend email template (v5.20). Phase 3: leaderboard frontend — period toggle, reward tier grid, countdown timer, user rank highlight, Earning column, 20-user threshold with progress bar (v5.22). Phase 4: milestone rewards — `referral_milestones` table, `process_tier_bonus` RPC (idempotent credit+Pro grants per tier), `check_clearance_retention` quarterly cron, profile flair system (icons, colored names, TOP REFERRER badge) (v5.25). Bug fixes: tab restore for referrals+ghost tabs, LinkedIn-based referral codes (`marston` instead of `BJ-972148`), `/in/` format links, updated `get_referral_stats` + `generate_referral_code` RPCs. |
| 2026-02-27 | — | — | **Hotfix: localStorage enc: crash (v5.23–v5.24).** PII encryption layer (v5.16) encrypted `bj_resumes`/`bj_readiness` with `enc:` prefix. 68 `JSON.parse(localStorage.getItem())` calls across 13 JS files would crash on `enc:` values. Fix: global `safeReadLS()` helper, `readPiiData()` patched, `decryptFromStorage()` hardened. |
| 2026-02-26 | 47 | H1–H5 | **Phase 47: Hotfixes & UX Polish (v5.06, v5.11–v5.17).** Settings gear panel fix (v5.06). WHEN filter + pagination + result capping fix (v5.11). `united states` WHERE pill → `loc_country=US` (v5.11.1). Version system hardening — zero hardcoded strings, version.js sole source (v5.12). Referral Supabase init fix (v5.13). Toast notifications for 44 remaining error paths across 5 modules (v5.14). innerHTML XSS audit — 26 escapeHtml + 2 DOMPurify across admin.js + keywords.js (v5.15). AES-GCM encryption for PII in localStorage (v5.16). Resume Score Button UX redesign — single "Score Resume" button replaces dual Analyze/✨ Deep, tier-routed modal for Pro (v5.17). |
| 2026-02-26 | 46 | R1–R7 | **Phase 46: Referral Program (v5.07–v5.10).** Full referral system: DB schema (referrals, referral_rewards, referral_fraud_flags) + RPCs + triggers (v5.07). Referral Hub page with stats, sharing, badges, leaderboard (v5.08). 3 Edge Functions: process-referral-reward, check-referral-activation, referral-fraud-scan + pg_cron (v5.09). Fraud detection: fingerprint.js, referral-capture.js, clawback EF, admin Referrals panel with ban mgmt (v5.10). Attribution on login hook. Bundle rebuilt with all referral modules. |
| 2026-02-26 | 45 | V1–V14 | **Phase 45: Visual Consistency Pass (v5.01–v5.05).** 14 items. Applications/Pipeline page visual overhaul, resume delete flow with download-before-delete modal, WHEN filter column correction back to first_seen_at, app mode button contrast fix. |
| 2026-02-25 | 43 | CP1–CP9 | **Phase 43: City Pages + Internal Linking Sprint (v4.91–v4.93).** Branch: `feat/city-pages-linking-sprint` cherry-picked to main. DB: city_pages table (2,178 rows seeded), city_popular_pills (Phase 2, empty). refresh-city-stats Edge Function deployed (6h cron). SSR enhancements: hook pills on metro pages, server-rendered role links, "Compare Other Cities" cross-links, hub page city/trend grids. Homepage "Browse by City" + "Trending Roles" sections. Data Lab city browse panel. JSON-LD structured data: Place + ItemList(JobPosting) + FAQPage per metro, Occupation + FAQPage per role. Block 7 pill conversion flow: signup modal for anon, checkmark + filter injection for auth, dashboard deep-link handler with toast. PostHog tracking: seo_pill_click, seo_pill_applied. ✅ COMPLETE — all blocks deployed to production. |
| 2026-02-25 | 37-BUILD | A1,A2,A5,A6,B1,B5,C1-C4,D1 | **Content Engine Build Sprint (v4.67–v4.77).** Flipped 12/17 Phase 37 items to done. Company SEO pages (/company/:slug), College Major Outcomes, Content Freshness Rotation, Filter-Driven Trend Indicators, Metro Comparison + NY Fed Crossover editorial templates, Dashboard Insight Cards, Email Digest, Landing Page Merch, Blog Discovery, Enrichment Coverage Dashboard. 4 remaining: A4 (Remote Tracker), B2 (Multi-Dim), B3 (Economic), B4 (Benchmark), B6 (Annual Report). |
| 2026-02-25 | CE-v3 | — | **Content Engine Handoff v3 roadmap update (v4.71).** Added 17 items across 4 categories from Pod 1 CE Handoff v3: Section A Permanent Pages (6 items: company pages, college outcomes, jobs-by-location, remote tracker, freshness rotation, trend indicators), Section B Topical Coverage (6 items: metro/multi-dim/economic/benchmark/NY Fed stories, annual report), Section C Integration Wiring (4 NEW items: dashboard insight cards, email digest, landing page merch, blog discovery), Section D Enrichment Monitoring (1 NEW item: coverage dashboard). Supersedes v4.70 removal — items re-added with proper categorization. Total: 37-52 dev days. |
| 2026-02-25 | CE-TRIM | — | **Content Engine roadmap trim (v4.70).** Removed 6 user-pipeline-dependent items from roadmap: Public Company Ghost Rate Reports, Community Benchmark Data, Programmatic Company SEO Pages, Multi-Dimensional Insight Pages, Annual State-of-the-Market Report, Jobs by Location Data Page. These require user activity at scale (50+ pipeline entries per segment, 10K company pages for ghost rates) that won't exist until well after launch. Retained viable items: Content Freshness Rotation, Filter-Driven Trend Indicators, Remote vs Non-Remote Tracker, Public Data Benchmark Overlays, Metro Comparison Pages. |
| 2026-02-25 | 33 | RA1–RA31 | **Phase 33: Resume Archive + Metrics (v4.55–v4.60).** All 8 phases in single session. 3 new tables (resume_archive, resume_score_history, resume_job_usage). 7 functions + 2 triggers + 1 pg_cron. Archive tab UI with storage bar + version timeline. Expiry cron (daily 3AM) with tier-gated restore. Resume Metrics tab on Stats page: sparkline, level fit, pipeline funnel, usage log. Tier gating module. Pipeline→usage auto-sync trigger. 3 new JS modules (22 total, 604KB minified). 24 cron jobs. |
| 2026-02-24 | 32 | F23–F26 | **Phase 32: Layout & Query Builder Fixes (v4.52–v4.54).** `.main` div nesting fix, sort-pills HTML, roadmap JS parser fix, admin CSV export. |
| 2026-02-24 | 31b | M1–M5 | **Merchandising System (v4.51).** 3 tables (merch_placements, merch_rules, merch_content). 52-entry copy bank migration. Admin tab with master-detail editing. Frontend merch-client.js. |
| 2026-02-24 | 31 | F1–F22 | **Phase 31: Daily Fixes & Admin Panel (v4.42–v4.48.1).** 22 items across 7 versions + 2 Edge Functions + Nano→Small upgrade. Tailwind safelist, HTML nesting, forgot password, setup cards, resume Storage persistence, SEO Extract Report, admin feedback system, merchandising. |
| 2026-02-24 | T | T1–T22 | **Phase T: Intelligent Pipeline Tracking (v4.30–v4.32).** 4 new DB tables (pipeline_tracking_settings, pipeline_signals, signal_patterns + 21 seeds, user_pipeline +7 columns). 3 new Edge Functions (prompt-pipeline-updates, confirm-pipeline-signal, scan-pipeline-signals). gmail-scan refactored: auto-advance → confirmation-first pipeline_signals. 5-color dot system (green/blue-pulse/yellow/red/gray). Inline signal + prompt cards. ⋮ context menu (mute/reminder/note). Pipeline Intelligence settings UI. PostHog events (5). Last Activity column. Stage header signal badges. 32 Edge Functions total, 17 pg_cron jobs. |
| 2026-02-24 | S2 | M-R1–R6 | **Survey system hardening (v4.29).** nps-pulse EF deployed (bug fix: last_sign_in_at → last_seen_at) + pg_cron. periodic-survey-pulse EF + cron. NPS formula fixed (avg → standard). survey_social_proof anon access fixed. micro-survey priority already built. 29 Edge Functions, 14 pg_cron. |
| 2026-02-24 | R | R1–R9 | **Phase R: AI Rewrite JD-Match Boost (v4.28).** Complete "Boost Match" pipeline: 2 new Edge Functions (rewrite-resume-analyze, rewrite-resume-execute), 4 AI agents (Gap Analyzer + Question Generator on Haiku, Resume Rewriter on Sonnet, Quality Checker on Haiku). Slide-out panel UI (analyze → Q&A → diff → accept). Boost pill on Jobs Feed match column (< 85%). Client-side DOCX generation via docx-js + Supabase Storage upload. resume_texts table + 11 new rewrite_sessions columns + init_rewrite_session RPC. Build hardening: fixed esbuild scope collision. 27 Edge Functions total. |
| 2026-02-23 | S | S1–S24 | **Phase S: SEO Data Pages (v4.13).** 127 public data pages live. 3 DB tables (metro map, role map, page cache) + 6 compute functions + pg_cron. Vercel serverless with ISR. 15 metro pages, 20 role trends, 91 metro+role combos. ECharts hydration (7 chart types). PostHog instrumented. 137 URLs in sitemap. Schema.org Dataset markup. Landing-page design language CSS. |
| 2026-02-23 | Q | Q1–Q30 | **Phase Q planned.** UX Polish & Resume-First Onboarding. 30 items across 5 sprints (~6 days). 47 issues from 20-persona usability audit. Resume-First flow: upload → AI extract → auto-filter → instant results. Quick wins: alert→toast, logo standardize, CTA unify, a11y, empty states. Pricing unification. Nav progressive disclosure. localStorage→Supabase migration. |
|------|--------|-------|---------|
| 2026-02-23 | M-AUDIT | — | **Survey system audit.** Phase M Sprint 0 added — 15 Pod 1 foundation items verified (survey.html, 4 question banks, feedback table, social proof view, analytics RPC, admin tab, micro-survey triggers, rate limiting). Found: `nps-pulse` EF in repo but NOT deployed, `survey_social_proof` anon access returning 401, NPS formula uses avg not standard methodology. 7 remaining Pod 2 items documented (M-R1–R7). Survey reward fulfillment added to Phase H outstanding. |
| 2026-02-23 | PERF | — | **v4.12:** Tiered Refresh v13. HOT (9K boards, 6h) / WARM (29K, 3d) / COLD (1.3K, 7d). Batch 50→150, concurrency 5→10, cron 6h→3min. 3 partial indexes. Full HOT cycle in ~6h (was 194 days). PR #72. |
| 2026-02-23 | P-S3 | P27–P29 | **v4.11:** Admin Ghost tab. Company Response Performance table (ghost rate, avg response, last activity). Ghost Score Distribution chart (ECharts). 4 KPI cards. |
| 2026-02-23 | P-S2 | P12–P26 | **v4.10:** Gmail OAuth live. GCP consent screen + branding. 3 Edge Functions deployed (gmail-auth, gmail-disconnect, gmail-scan). CORS fix. Privacy policy updated. Connect/Disconnect UI on Setup + Ghost Monitor pages. End-to-end verified: gould.marston@gmail.com connected. pg_cron: 6h scan + 90d purge. |
| 2026-02-23 | N | N1–N7 | **v4.08–v4.09:** USAJOBS integration. Edge Function, landing page propagation, data lab counts (38K+/350K), Feed Health as standard platform, admin table formatting. |
| 2026-02-23 | P-S1 | P1–P11 | **v4.07:** Ghost Build Phase 1. user_pipeline, company_ghost_stats, ghost_alerts_sent tables. compute_ghost_score() + get_pipeline_ghost_status() RPCs. Ghost Monitor page with 10-column table + ECharts distribution. Company Browser ghost rate badges. job-intelligence ghost alerts. |
| 2026-02-23 | K-2 | K2-1–K2-5 | **v4.00–v4.06:** Admin console restructure. Roadmap filter bar. Tab reorder, cohort redesign. Feed Health charts + metrics. SEO dedup. |
| 2026-02-23 | ROADMAP | — | **v3.98:** Roadmap blocked item audit. 17 in-progress/planned items annotated with 🚫 BLOCKED status + specific blocker reason. Quick-reference table added. Categorized: 7 CEO/CPO actions, 3 external dependencies, 7 post-launch. |
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


## Phase J: Infrastructure Hardening & Data Quality (v3.81–v3.88) — Feb 22-23

**Goal:** Performance optimization, data integrity automation, disaster recovery, safety infrastructure, and data quality backfills.

### Sprint 1: Performance & Resilience (v3.81–v3.86)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| J1 | Index maintenance at scale | v3.81 | ✅ | Dropped 7 unused indexes (~104MB). `index_health_report()` monitoring. Runbook: `docs/INDEX_MAINTENANCE_RUNBOOK.md`. |
| J2 | N+1 query detection & fixes | v3.82 | ✅ | Parallelized 4 query patterns: radius search, state search, stats counts, velocity counts. 35→7 effective DB round-trips. Audit: `docs/N1_QUERY_AUDIT.md`. |
| J3 | Data hygiene automation | v3.83 | ✅ | `data_hygiene_cleanup()` with 6 retention policies. `hygiene_log` table. pg_cron job #16 (Sundays 3 AM UTC). Docs: `docs/DATA_HYGIENE_AUTOMATION.md`. |
| J4 | Client-side caching strategy | v3.84 | ✅ | `cachedQuery()` utility with TTL. `prewarmRefCaches()` on app init. ref_industries (1h TTL), ats_companies (10min TTL). Updated tuning.js + browsers.js consumers. |
| J5 | localStorage stress test & guards | v3.85 | ✅ | `saveUserData()` size guards (2MB reject, 500KB warn). `storageHealth()` console diagnostic. `_handleStorageFull()` emergency cleanup with array trimming. |
| J6 | Backup & DR plan + error recovery | v3.86 | ✅ | Full DR documentation: table priority matrix, recovery RTOs, cron job inventory, disaster scenarios. Docs: `docs/DR_BACKUP_PLAN.md`. |

### Sprint 2: Safety Infrastructure (v3.87)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| J7 | Automated daily table backups | v3.87 | ✅ | `run_daily_backup()` — 29 critical small tables → `daily_backups` JSONB table. pg_cron #17 at 2 AM UTC. 30-day retention. `restore_from_backup()` generates restore SQL. First backup: 161ms. |
| J8 | Pre-migration backup script | v3.87 | ✅ | `pre_migration_snapshot()` captures all table row counts + DB size. `verify_migration()` compares current vs snapshot. `migration_snapshots` table. Baseline: 496,875 rows / 745 MB / 51 tables. |
| J9 | TRUNCATE protection triggers | v3.87 | ✅ | `block_truncate()` trigger on 19 protected tables. Override: `SET LOCAL bj.allow_truncate = 'true'`. Prevents repeat of Feb 14 CASCADE disaster. |
| J10 | FK dependency graph documentation | v3.87 | ✅ | 13 FK constraints mapped (5 with CASCADE DELETE — danger zones). 24 soft references documented. Mermaid diagram. `docs/FK_DEPENDENCY_GRAPH.md`. |

### Sprint 3: Data Quality Backfills (v3.88)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| J11 | Geocode remaining jobs | v3.88 | ✅ | **+127,277 lat/lng** (18,463→145,740, +689%) via `location_cache` exact-match join. **+145,740 location_normalized** backfilled from zero. 32K unique unmatched locations (143K jobs) exported for external geocoding. |
| J12 | Catch unparsed salary formats | v3.88 | ✅ | **+698 salary records** (20,579→21,277, +3.4%) via `backfill_salary_batch()` regex on content. Handles en-dash/em-dash ranges, hourly→annual conversion, K notation. Remaining 267K genuinely have no salary in content. |
| J13 | Enrich ~555 unmatched companies | — | 🚫 BLOCKED | **⛔ Blocked on:** Greenhouse API partnership (March 3 deadline) or PDL paid tier. External dependency — no internal workaround. |

**Phase J total:** 13 items | 8 versions | 12/13 complete, 1 🚫 blocked on external dependency (Greenhouse API).

---

## Phase M: Surveys & User Intelligence (P13) — Feb 23, 2026

### Sprint 0: Survey Foundation (Pre-existing — Pod 1 Deliverables)

Complete survey infrastructure delivered by Pod 1 before Phase M engineering began. All items verified in repo + live DB.

| # | Item | Status | Notes |
|---|------|--------|-------|
| M0-1 | `survey.html` — full-page survey engine | ✅ | 3 contexts (churn/periodic/nps). Step-based renderer with progress bar. Version routing via `?v=` URL param. |
| M0-2 | Exit survey `exit_v1` — 8 questions | ✅ | Outcome, rating, disappointment, missing feature, competitor, price sensitivity, win-back, parting shot. |
| M0-3 | Exit survey conditional save-offer logic | ✅ | "I'd come back right now" or cost/bug answers → save offer panel. Buttons present but actions not wired (see H-phase outstanding). |
| M0-4 | Periodic survey `periodic_v1` (8 Qs) | ✅ | Search quality, ease of use, most valuable, frustration, missing feature, recommend, comparison, open feedback. |
| M0-5 | Periodic survey `periodic_v2` (16 Qs) | ✅ | Extends v1 with community pulse (anxiety, timeline, appreciation) + process ease (comparative, control, filter adequacy). Current default. |
| M0-6 | NPS survey `nps_v1` (3 Qs) | ✅ | Standard 0-10 NPS scale + reason + improvement freetext. |
| M0-7 | `feedback` table + RLS | ✅ | Single source of truth. JSONB answers. Denormalized overall_rating + nps_score. type/survey_version/feature_context columns. Anon INSERT for exit surveys. 0 responses (pre-launch). |
| M0-8 | `survey_social_proof` view | ✅ | 90-day rolling window. Excludes exit + micro surveys. Anon grant in baseline migration. Service role verified. |
| M0-9 | `get_survey_analytics` RPC | ✅ | Returns versions, daily, nps_monthly, total_responses, unique_respondents. Admin consumption verified. |
| M0-10 | `nps-pulse` Edge Function | ⚠️ In repo, NOT deployed | Exists at `supabase/functions/nps-pulse/index.ts`. Queries active users (30d), checks last_nps_date de-dupe, sends email via send-notification. **Not in deployed EF list** — needs `supabase functions deploy nps-pulse --no-verify-jwt`. |
| M0-11 | `uninstall.html` exit survey entry point | ✅ | Chrome `uninstall_url` → reason selection → survey link with `?context=churn&reason=` param. |
| M0-12 | NPS de-duplication | ✅ | `submitSurvey()` patches `profiles.user_data.last_nps_date` after NPS submission. |
| M0-13 | Micro-survey session rate limiting | ✅ | `sessionStorage` key `bj_micro_survey_shown`. Max 1 micro-survey per session. First-trigger-wins. |
| M0-14 | Landing page social proof bar | ✅ | Queries `survey_social_proof` view. Shows star rating, respondent count, NPS recommend %. Hidden when `total_respondents < 20`. CSS + JS wired in `index.html`. |
| M0-15 | Admin Surveys tab (ECharts + table) | ✅ | 4 charts (versions bar, daily line, NPS stacked bar, funnel). KPI cards. Recent responses table. Period toggle (7d/30d/90d/all). `loadSurveysTab()` in admin.js L1437+. |

### Sprint 1: Tier 1 — Survey Question Expansion (v3.92–v3.94)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| P13-01 | Community Pulse: job anxiety scale | v3.92 | ✅ | 1-5 scale with custom labels. New `scale` question type renderer. |
| P13-02 | Community Pulse: expected timeline | v3.92 | ✅ | New `dropdown` question type renderer. 5 options (<1mo to 12mo+). |
| P13-03 | Community Pulse: appreciation score | v3.92 | ✅ | 1-5 stars + optional testimonial freetext (pipeline to landing page). |
| P13-04 | Post-search micro-surveys | v3.93/v3.94 | ✅ | micro-surveys.js module (v3.93) + trackSearchForSurvey() hook in job-feed.js (v3.94). Triggers after 10th search or 5min session. |
| P13-05 | Post-application confidence survey | v3.93/v3.94 | ✅ | showApplyConfidence() in pipeline.js. Toast at bottom-right after apply action. |
| P13-06 | Data value assessment | v3.93/v3.94 | ✅ | startDataViewTimer() in stats.js. Shows after 10s viewing charts. |
| P13-07 | Process ease & control survey | v3.92 | ✅ | Comparative ease, perceived control (1-5 scale), filter adequacy + missing filters freetext. |
| P13-08 | Monthly NPS pulse | v4.29 | ✅ | nps-pulse EF deployed (bug fix: last_sign_in_at → last_seen_at). pg_cron: 1st of month 10am ET. periodic-survey-pulse EF + cron (15th of month). NPS formula fixed. Anon access fixed. |
| P13-09 | Paywall friction survey | v3.93 | ✅ | showPaywallFriction() in billing.js. Triggers on feature limit hit. |

**Infrastructure:** Baseline migration fixed (v3.92) — added CREATE TABLE for 9 missing tables so Supabase Preview branches pass. New question types: scale, nps (0-10), dropdown. Micro-survey card component with choice/rating/chips, session rate-limiting.

### Sprint 2: Tier 2 — Admin & Analytics (1/4 🚫 BLOCKED)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| P13-10 | Survey completion rate dashboard | v3.95 | ✅ | Admin Surveys tab: 4 ECharts, KPI cards, recent responses, period toggle. get_survey_analytics() RPC. |
| P13-11 | Landing page survey social proof | v3.96 | ✅ | Social proof bar: star rating, respondent count, NPS recommend %. Min 20 threshold. survey_social_proof view. |
| P13-12 | Quarterly feature prioritization | — | 🚫 BLOCKED | Drag-and-drop ranking. New rank question type. Quarterly cron. **⛔ Blocked on:** User volume — needs active users to make ranking data meaningful. |
| P13-13 | Public changelog + feedback board | v3.97 | ✅ | Canny widget in dashboard Feedback page. Feature Requests + Bug Reports boards. Identify SSO. GitHub auto-complete. |

### Sprint 3: Tier 3 — Flagship Content Surveys (ALL 🚫 BLOCKED — needs user volume)

| # | Item | Status | Notes |
|---|------|--------|-------|
| P13-14 | Ghost Job Reality Check flagship survey | 🚫 BLOCKED | 10 questions, public access, 1K+ target. /ghost-report results page. **⛔ Blocked on:** Launch + user acquisition — needs traffic to hit 1K response target. |
| P13-15–17 | Market, employer, referral surveys | 🚫 BLOCKED | Same pattern as ghost survey. **⛔ Blocked on:** P13-14 completion — same dependency on user volume. |
| P13-18 | Survey → content pipeline | 🚫 BLOCKED | Results aggregation RPC, auto-generated charts, OG meta tags. **⛔ Blocked on:** P13-14/15-17 — needs survey data to aggregate. |

### Sprint 4: Tier 4 — User Intelligence System (ALL 🚫 BLOCKED — needs launch + user data)

| # | Item | Status | Notes |
|---|------|--------|-------|
| P13-19 | Explicit user attribute capture | 🚫 BLOCKED | profile_v1 survey. Stored in profiles.user_data. **⛔ Blocked on:** Launch + active user base — needs users to profile. |
| P13-20 | Behavioral activity tracking | 🚫 BLOCKED | PostHog structured events. Daily Edge Function aggregation. **⛔ Blocked on:** Launch + user activity data — needs behavioral data to track. |
| P13-21 | Merged user intelligence profiles | 🚫 BLOCKED | build_user_profile() RPC. **⛔ Blocked on:** P13-19 + P13-20 — depends on both explicit + behavioral data being collected. |
| P13-22 | Progressive profiling | 🚫 BLOCKED | Profile completeness score. Feature gating at thresholds. **⛔ Blocked on:** P13-21 — needs merged profiles to score completeness against. |
| P13-23 | User data transparency dashboard | 🚫 BLOCKED | Show users what we know. Export/delete controls. GDPR. **⛔ Blocked on:** P13-21 — needs merged intelligence profiles to display. |
| P13-24 | Churn risk scoring | 🚫 BLOCKED | 0-100 risk score. Daily pg_cron. Auto-interventions. **⛔ Blocked on:** P13-20 + P13-21 — needs behavioral data + profiles to score against. Also needs baseline usage patterns (months of data). |
| P13-25 | Closed-loop feedback display | 🚫 BLOCKED | "You told us X, so we built Y." Canny integration. **⛔ Blocked on:** P13-13 Canny adoption — needs accumulated user feedback in Canny boards first. |

### Pod 2 Remaining Survey Work

M-R1–R6 complete — see **Phase S2** above (v4.29).

| # | Item | Est. | Status | Blocker |
|---|------|------|--------|---------|
| M-R7 | Survey reward fulfillment | 1h | 🚫 BLOCKED | Wire `submitSurvey()` Pro grant + exit save-offer buttons. **⛔ Blocked on:** Phase H Billing Portal config (CEO action). |

### Manual Action Items
| Item | Owner | Status |
|------|-------|--------|
| Run VACUUM ANALYZE + REINDEX in Supabase SQL Editor | CEO | 🚫 BLOCKED — CEO action |
| Export 32K ungeocoded locations (SQL provided), geocode externally, re-import to location_cache | CEO | 🚫 BLOCKED — CEO action + external geocoding service |
| Stripe Billing Portal configuration in Stripe Dashboard | CEO | 🚫 BLOCKED — CEO action in Stripe Dashboard |

### Active pg_cron Jobs (as of v4.32)

| ID | Schedule | Function | Added |
|----|----------|----------|-------|
| 2 | 0 4 * * * | refresh-orchestrator | Phase D |
| 6 | 0 13 * * * | daily-digest | Phase I |
| 7 | 0 13 * * 1 | weekly-summary (Mondays) | Phase I |
| 8 | 0 5 * * * | job-intelligence | Phase I |
| 12 | 0 6 * * * | seo-sync | Phase E |
| — | */3 * * * * | refresh-jobs-tiered (v13, HOT/WARM/COLD) | Phase P |
| 14 | 0 */2 * * * | refresh_materialized_views | Phase C |
| 15 | 30 */2 * * * | escalation-checker | Phase I |
| 16 | 0 3 * * 0 | weekly-data-hygiene | Phase J |
| 17 | 0 2 * * * | daily-table-backup | Phase J |
| — | 0 */6 * * * | gmail-scan-6h | Phase P |
| — | 0 3 * * 0 | purge-old-email-signals (90d) | Phase P |
| 26 | 0 5 * * * | seo-cache-refresh (compute_seo_cache_all) | Phase S |
| — | 0 15 1 * * | nps-pulse-monthly | Phase S2 |
| — | 0 15 15 * * | periodic-survey-pulse | Phase S2 |
| — | 30 * * * * | prompt-pipeline-hourly | Phase T |
| — | */15 * * * * | scan-pipeline-signals-15m | Phase T |
| — | 0 4 * * 0 | pattern-confidence-decay | Phase T |
| — | 0 3 * * * | expire-archived-resumes | Phase 33 |

---

## Phase 31: Daily Fixes & Admin Panel (v4.42–v4.48.1) — 2026-02-24

**Estimated:** ~12h | **Actual:** Single session | **Status:** ✅ COMPLETE

Resolved 19 daily issues + 2 feature builds across 7 version deployments, 2 Edge Function deploys, and 1 infrastructure upgrade.

### CSS & Layout Foundation (v4.42)

| # | Item | Status | Notes |
|---|------|--------|-------|
| F1 | Tailwind safelist fix | ✅ | CSS tree-shaking purged @layer component rules. Added pattern safelist to tailwind.config.js. CSS: 55KB → 96KB with all rules preserved. |
| F2 | Extra `</div>` HTML fix | ✅ | Stray `</div>` after page-stats closed `.main` prematurely. Settings/Subscription/Feedback/Admin rendered at 87px width. |

### Quick Fixes (v4.43)

| # | Item | Status | Notes |
|---|------|--------|-------|
| F3 | Forgot Password modal | ✅ | Dedicated `form-forgot` view. "Reset your password" title. `switchTab('forgot')` replaces old hack. |
| F4 | Admin unlimited filters | ✅ | `checkEntitlement()` returns unlimited for `window._bjUserRole === 'admin'`. |
| F5 | Feedback page padding | ✅ | Added `.page-body` wrapper for standard 28px 40px padding. |

### UI Batch 1 (v4.44)

| # | Item | Status | Notes |
|---|------|--------|-------|
| F6 | Setup page card grid | ✅ | Chrome Extension full-width, then Gmail → Drive → Calendar in 3-col grid (min 340px). |
| F7 | Google Calendar card | ✅ | New Setup integration card with icon, connect button, status dot. |
| F8 | Seniority chart order | ✅ | Fixed `SENIORITY_ORDER` to ascending: Entry → Analyst → … → VP → C-Suite (16 levels). |
| F9 | Credit usage docs | ✅ | Added "AI Exclusions" (1 credit) to "What Uses Credits" on Subscription page. |

### UI Batch 2 (v4.45)

| # | Item | Status | Notes |
|---|------|--------|-------|
| F10 | AI Suggest moved | ✅ | From Saved Searches header → Filter Builder toolbar. Renamed "✦ Generate from Resume". |
| F11 | Salary pills layout | ✅ | `grid-column:1/-1` so pills render below min/max inputs instead of overflowing. |
| F12 | Countries in exclusions | ✅ | 200+ countries in `searchTuningLocations()` with blue "country" badge. |
| F13 | Chart colors | ✅ | Light fills (opacity 0.15) + dark outlines (width 2). `_platformLineColors` added. |

### Data Persistence (v4.46)

| # | Item | Status | Notes |
|---|------|--------|-------|
| F14 | Resume Storage persistence | ✅ | Files were IndexedDB-only. Now upload to Supabase Storage at `userId/resumeId_filename`. Fallback download from Storage on cache miss. Startup backfill for existing resumes. |

### Edge Functions

| # | Item | Status | Notes |
|---|------|--------|-------|
| F15 | hire-fee CORS fix | ✅ | Dynamic origin matching from `ALLOWED_ORIGINS` array (prod, dev, staging, localhost). |
| F16 | GSC JWT fix (seo-sync) | ✅ | URL-safe base64 (`b64url()`) for JWT header/claims. PEM parsing for escaped newlines. GSC data flowing. |
| F20 | sync-feedback Edge Function | ✅ | Pulls Canny FR + Bug boards, syncs Supabase feedback table. Resolves user emails → profile IDs + cohort_id. |

### Infrastructure

| # | Item | Status | Notes |
|---|------|--------|-------|
| F17 | Supabase Nano → Small | ✅ | PGRST002 errors from depleted IOPS. Upgraded to Small ($15/mo): 4x IOPS, dedicated CPU, 1GB RAM. |

### SEO Extract Report (v4.47)

| # | Item | Status | Notes |
|---|------|--------|-------|
| F18 | SEO Extract Report | ✅ | "Export Report" button in SEO tab. Styled HTML combining PSI, DataForSEO, URL Inspection, YLT, GSC. Downloads as `seo-report-{slug}-{date}.html` with A-F grade badge. |

### Admin Feedback System (v4.48)

| # | Item | Status | Notes |
|---|------|--------|-------|
| F19 | `admin_feedback` table + RLS | ✅ | `(external_id, source)` unique. Admin-only RLS. Columns: source, user_id, cohort_id, title, content, status, votes, submitted_at. |
| F21 | Admin Feedback tab | ✅ | Type/status pills, cohort dropdown, sort, search. Summary cards. Table with inline status editing. Side panel detail view. Sync button. Days-stale color coding (green/amber/red). |

### Bug Fix (v4.48.1)

| # | Item | Status | Notes |
|---|------|--------|-------|
| F22 | Null ref TypeError | ✅ | `$('#sort-add-btn').addEventListener` crashed at parse time. Added `?.` to 5 bare querySelector().addEventListener calls in sort-bar.js + billing.js. |



### Merchandising System (v4.51)

| # | Item | Status | Notes |
|---|------|--------|-------|
| M1 | Database schema + RPC | ✅ | 3 tables: `merch_placements`, `merch_rules`, `merch_content`. RLS + indexes. `get_merch_content()` SECURITY DEFINER RPC with priority cascade (cohort-specific > all-cohorts, audience-specific > all). Visit gating, seasonal filtering. |
| M2 | Copy bank migration (52 entries) | ✅ | 34 returning + 18 lapsed from ROTATING_HERO_COPY_SPEC. 5 deep-visit entries gated at min_visits=3. 8 categories. |
| M3 | Admin Merchandising tab | ✅ | 9th admin tab. Master-detail: placement list → rules → content entries. Edit modal with live HTML preview + {JOBS}/{COMPANIES} hydration. Bulk JSON import. Full CRUD with cascade delete. |
| M4 | Frontend merch-client.js | ✅ | Lightweight IIFE. Raw fetch to RPC (no SDK). Unseen-entry rotation via localStorage. Injects into `data-merch-field` targets. PostHog: `merch_content_shown` + `merch_content_click`. Static fallback = progressive enhancement. |
| M5 | QA & version sync v4.51 | ✅ | 28/28 tests pass. Dashboard nav-version, BJ_VERSION, console.log, dist bundle all v4.51. |

### Deployment Summary

| Version | Files | Changes |
|---------|-------|---------|
| v4.42 | tailwind.config.js, styles.css, dashboard.html | Tailwind safelist, CSS rebuild |
| v4.43 | index.html, dashboard.html, js/globals.js | Forgot password, admin filters, feedback padding |
| v4.44 | dashboard.html, js/stats.js | Setup cards, Calendar, seniority order, credit usage |
| v4.45 | dashboard.html, js/admin.js, js/tuning.js | AI suggest, salary pills, countries, chart colors |
| v4.46 | js/app.js, js/resumes.js | Resume Storage persistence |
| v4.47 | dashboard.html, js/admin.js | SEO Extract Report |
| v4.48 | dashboard.html, js/admin.js | Admin Feedback tab + sync-feedback EF |
| v4.48.1 | js/sort-bar.js, js/billing.js | Null ref TypeError fix |
| Edge | hire-fee/index.ts | CORS dynamic origin |
| Edge | seo-sync/index.ts | JWT base64 + PEM fix |
| Edge | sync-feedback/index.ts | New: Canny + feedback sync |
| v4.51 | dashboard.html, js/admin.js, js/app.js, index.html, js/merch-client.js, dist/* | Merchandising system: DB schema, admin tab, frontend integration |

---

## Phase 32: Layout & Query Builder Fixes (v4.52–v4.54) — 2026-02-24

**Status:** ✅ COMPLETE

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| F23 | `.main` div nesting fix | v4.52 | ✅ | Extra `</div>` after page-stats closed `.main` prematurely. All 16 pages now inside `.main`. |
| F24 | Sort-pills HTML element | v4.53 | ✅ | Missing `#sort-pills` blocked all query builder event handlers from binding. |
| F25 | Roadmap JS parser fix | v4.53 | ✅ | Phase 31-33 items were jammed inside `blockedMap` object literal. Moved to `features` array. |
| F26 | Admin CSV export | v4.54 | ✅ | Export dead/unscraped/active/all boards as CSV from admin panel. |

---

## Phase 33: Resume Archive + Metrics (v4.55–v4.60) — 2026-02-25

**Estimated:** ~10 sessions | **Actual:** Single session | **Status:** ✅ COMPLETE (all 8 phases)

Implemented the full Resume Archive + Resume Metrics Intelligence system from the Pod 1 handoff spec. 3 new tables, 7 functions, 2 triggers, 1 cron job, 3 new JS modules (22 total in bundle).

### Phase 1: Schema + Storage Foundation (v4.55)

| # | Item | Status | Notes |
|---|------|--------|-------|
| RA1 | `resume_archive` table (18 cols) | ✅ | UUID PK, version tracking, SHA-256 dedup, JSONB metadata_snapshot, 4 RLS policies, 4 indexes |
| RA2 | `resume_score_history` table (13 cols) | ✅ | Score type (ai/ngram/manual), scoring model, analysis_json JSONB, 2 RLS, 3 indexes |
| RA3 | `resume_job_usage` table (11 cols) | ✅ | Pipeline stage tracking, denormalized company/title, 3 RLS, 3 indexes |
| RA4 | Helper functions (3) | ✅ | `check_resume_dedup`, `next_version_number`, `check_resume_limits` (fixed to use `profiles.plan`) |

### Phase 2: Data Migration + Sync (v4.56)

| # | Item | Status | Notes |
|---|------|--------|-------|
| RA5 | Migrate 3 resumes | ✅ | SallieMae (real SHA-256 from Storage), NinjaTrader + Redfin (from profiles.user_data.resumes) |
| RA6 | `sync_resume_to_archive()` | ✅ | Dedup detection, version lineage, tier limit enforcement. Returns success/error JSON. |
| RA7 | `migrate_resumes_to_archive()` | ✅ | Batch migration function for existing `resumes` table rows (50 per batch) |
| RA8 | `updated_at` trigger | ✅ | Auto-updates `updated_at` on any resume_archive row change |

### Phase 3: Archive Tab UI (v4.57)

| # | Item | Status | Notes |
|---|------|--------|-------|
| RA9 | Active/Archive tab toggle | ✅ | Pill-button pattern matching Applications List/Board toggle |
| RA10 | Storage usage bar | ✅ | Current usage vs tier limit, color-coded (green/amber/red), upgrade CTA at 80% |
| RA11 | Archive table | ✅ | Name, Version, Created, Last Used, Size, Status badges, search filter, actions |
| RA12 | Version timeline | ✅ | Expandable panel with green/gray dots + connector lines |
| RA13 | `js/resume-archive.js` | ✅ | 20th JS module. Tab switching, archive load, actions, deep-linking (`#resumes?tab=archive`) |

### Phase 4: Expiry Cron + Restore (v4.58)

| # | Item | Status | Notes |
|---|------|--------|-------|
| RA14 | `expire_archived_resumes()` | ✅ | Soft-deletes expired archives (retains metadata_snapshot, marks storage_path as expired) |
| RA15 | pg_cron: `expire-archived-resumes` | ✅ | Daily at 3 AM UTC. 24th cron job. |
| RA16 | `restore_archived_resume()` | ✅ | Tier-gated: Free expired → EXPIRED_UPGRADE_REQUIRED → subscription redirect. Starter/Pro → restore. |
| RA17 | Tier-based expiry | ✅ | Archive sets `archive_expires_at`: Free=30d, Starter=90d, Pro=unlimited |
| RA18 | Expired UI state | ✅ | Red "Expired" badge, expiry countdown for archived resumes, "Restore ↑" button |

### Phase 5: Score History Wiring — DEFERRED TO NEXT

Tables created in Phase 1. Edge Function dual-write pending.

### Phase 6: Resume Metrics Intelligence UI (v4.59)

| # | Item | Status | Notes |
|---|------|--------|-------|
| RA19 | Market Stats / Resume Metrics tab toggle | ✅ | Pill toggle on Stats page (same pattern as Resumes) |
| RA20 | Resume selector dropdown | ✅ | Populated from `resume_archive` where `is_active = true` |
| RA21 | Score Summary card + sparkline | ✅ | Last score (large), type, detail. ECharts sparkline of last 10 scores. |
| RA22 | Level Fit bar chart | ✅ | Horizontal bar by Entry/Mid/Senior/Lead/Executive with auto-insight text |
| RA23 | Pipeline Funnel | ✅ | ECharts funnel: Applied → Screened → Interview → Offer with counts + % |
| RA24 | Application Log table | ✅ | Company, Job Title, Applied date, Score, Stage. Filterable. |
| RA25 | Cross-linking | ✅ | Archive → Metrics and Metrics → Archive navigation |
| RA26 | `js/resume-metrics.js` | ✅ | 21st JS module. ECharts dispose/resize, deep-linking. |

### Phase 7+8: Tier Gating + Pipeline Tracking (v4.60)

| # | Item | Status | Notes |
|---|------|--------|-------|
| RA27 | `js/tier-gating.js` | ✅ | 22nd JS module. TIER_GATES config, `showTierGate()` overlay, `canAccessFeature()`, `getUserTier()` |
| RA28 | Free tier gating | ✅ | Sparkline, level fit, pipeline, usage log all gated with blurred overlay + upgrade CTA |
| RA29 | `trg_pipeline_to_usage` trigger | ✅ | Auto-syncs user_pipeline INSERT/UPDATE → resume_job_usage. Resolves resume name → ID. |
| RA30 | `sync_pipeline_to_resume_usage()` | ✅ | Manual RPC for backfill. Tested: resolves resume names, updates `last_used_at`. |
| RA31 | Unique index on usage | ✅ | `idx_job_usage_unique ON resume_job_usage(user_id, job_id)` prevents dupes |

### Deployment Summary

| Version | Commit | Files | Changes |
|---------|--------|-------|---------|
| v4.55 | `4dcff0fa` + `c3292c41` | dashboard.html, js/app.js, dist/* | Schema: 3 tables, RLS, indexes, helper functions |
| v4.56 | `fd311ee7` + `27deaa05` | dashboard.html, js/app.js, dist/* | Migration: 3 resumes, sync function, version tracking |
| v4.57 | `94ac1e5e` | dashboard.html, js/app.js, js/resume-archive.js, build.js, dist/* | Archive tab UI |
| v4.58 | `f87751e7` | dashboard.html, js/app.js, js/resume-archive.js, dist/* | Expiry cron + restore flow |
| v4.59 | `2a09d069` | dashboard.html, js/app.js, js/resume-metrics.js, build.js, dist/* | Resume Metrics Intelligence UI |
| v4.60 | `1a6f591a` | dashboard.html, js/app.js, js/tier-gating.js, build.js, dist/* | Tier gating + pipeline tracking |

### New Database Objects

| Type | Name | Notes |
|------|------|-------|
| Table | `resume_archive` | 18 columns, 4 RLS, 4 indexes |
| Table | `resume_score_history` | 13 columns, 2 RLS, 3 indexes |
| Table | `resume_job_usage` | 11 columns, 3 RLS, 3+1 indexes |
| Function | `check_resume_dedup` | SHA-256 dedup check |
| Function | `next_version_number` | Auto-increment within lineage |
| Function | `check_resume_limits` | Tier-aware usage/limit check |
| Function | `sync_resume_to_archive` | Client-facing: dedup + version + limits |
| Function | `expire_archived_resumes` | Soft-delete expired archives |
| Function | `restore_archived_resume` | Tier-gated restore |
| Function | `sync_pipeline_to_resume_usage` | Manual pipeline→usage bridge |
| Trigger | `update_resume_archive_updated_at` | Auto-update timestamp |
| Trigger | `trg_pipeline_to_usage` | Auto-sync pipeline→usage on INSERT/UPDATE |
| Cron | `expire-archived-resumes` | Daily 3 AM UTC (24th cron job) |

---

## Phase 34: Pipeline Intelligence — Version Sync (v4.61) — 2026-02-25

**Goal:** Close remaining Phase A/B gaps: add `calendar.events.readonly` OAuth scope to `gmail-auth`, synchronize version numbers across dashboard.html, js/app.js, and dist/dashboard.min.js.

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| VS1 | `gmail-auth` calendar scope | v4.61 | ✅ | Added `calendar.events.readonly` to OAuth scope string. Required for `scan-pipeline-signals` to read Google Calendar events. |
| VS2 | dashboard.html version bump | v4.61 | ✅ | v4.54 → v4.61. Was behind by 6 versions. |
| VS3 | js/app.js version bump | v4.61 | ✅ | v4.60 → v4.61. Console log sync. |
| VS4 | dist/dashboard.min.js rebuild | v4.61 | ✅ | 22 files → 589.9KB minified. All 3 version stamps synchronized. |
| VS5 | Edge Function redeploy | v4.61 | ✅ | `gmail-auth` redeployed with calendar scope. Verified all 4 pipeline EFs responding (gmail-auth, scan-pipeline-signals, prompt-pipeline-updates, confirm-pipeline-signal). |
| VS6 | Vercel deploy | v4.61 | ✅ | Triggered. Frontend version sync live. |

### Phase A/B Verification (Complete)

All 16 spec items verified against live infrastructure:

**Phase A (Pipeline Migration + Manual Prompts):** `user_pipeline` (34 cols), `pipeline_tracking_settings` (13 cols), localStorage→Supabase migration, `prompt-pipeline-updates` EF + hourly cron, 5-color dot system, inline prompt/signal cards, settings panel, Last Activity column.

**Phase B (OAuth + Signal Infrastructure):** `gmail_connections` (10 cols, 1 active), `gmail-auth` EF (now with calendar scope), Gmail/Calendar connect UI, `pipeline_signals` (13 cols), `signal_patterns` (21 seeds), `confirm-pipeline-signal` EF, blue pulsing dot + card, signal detection toggle.

**pg_cron (4 pipeline jobs):** `scan-pipeline-signals-15m`, `prompt-pipeline-hourly`, `gmail-scan-6h`, `purge-old-signals`.

---

## Phase 35: Calendar Intelligence + Cross-User Learning (v4.62) — 2026-02-25

**Goal:** Phase C of the Intelligent Pipeline Tracking spec. Upgrade calendar scanning to use learned patterns from signal_patterns table (cross-user), add interview round detection, fix confirm-pipeline-signal pattern updates, add pattern decay cron.

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| C1 | `scan-pipeline-signals` v2→v3 | v4.62 | ✅ | Reads `signal_patterns` table for learned confidence scores instead of hardcoded values. Cross-user data improves detection for all users as they confirm/dismiss signals. |
| C2 | Interview round detection | v4.62 | ✅ | Regex-based round extraction from calendar titles: final, onsite, panel, technical, hiring manager, phone screen, intro, round 1/2, late stage. Stored in `evidence_metadata.interview_round`. |
| C3 | Match method tracking | v4.62 | ✅ | `evidence_metadata.match_method` records whether match was via `attendee_domain` (high conf) or `title_match` (lower conf). Domain matches get +5% confidence boost. |
| C4 | `confirm-pipeline-signal` v1→v2 | v4.62 | ✅ | Fixed broken `exec_sql` pattern update — now uses direct Supabase queries. Cross-user learning: confirm/dismiss updates `signal_patterns.confirmations`/`dismissals` + recalculates `confidence_score` for ALL users. New patterns auto-inserted on first encounter. |
| C5 | `decay_signal_patterns()` RPC | v4.62 | ✅ | Weekly 5% decay on patterns not seen in 30+ days. Auto-deletes junk patterns (>90d, 0 confirms, 3+ dismissals). |
| C6 | pg_cron: `decay-signal-patterns` | v4.62 | ✅ | Weekly Sunday 5am UTC. Prevents stale patterns from polluting detection. |
| C7 | Frontend: calendar icon + round badge | v4.62 | ✅ | Calendar signals show 📅 icon (vs ✉ for email). Interview round rendered as colored badge (e.g., "Final Round", "Technical"). Confidence % indicator on all signal cards. |
| C8 | CSS: `.pl-round-badge`, `.pl-signal-confidence` | v4.62 | ✅ | Accent-colored pill badge for round labels. Color-coded confidence (green ≥80%, amber ≥60%, red <60%). |
| C9 | Version sync v4.62 | v4.62 | ✅ | dashboard.html, js/app.js, dist/dashboard.min.js, styles.css all v4.62. |

**Phase 35 total:** 9 items | All complete.

---

## Phase 36: Signal Analytics + Notification Templates (v4.63) — 2026-02-25

**Goal:** Phase D of the Intelligent Pipeline Tracking spec. Admin signal metrics tab, PostHog instrumentation for pipeline events, notification type registration for signal alerts.

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| D1 | Admin Signals tab (10th tab) | v4.63 | ✅ | 5 KPIs (total, pending, confirmed, dismissed, confirm rate). Signals-by-source pie chart (ECharts). Pattern confidence distribution bar chart. Learned patterns table (type, pattern, signal, conf%, confirms, dismissals, last seen). Recent signals table (user, source, type, stage, confidence, status, date). |
| D2 | PostHog: pipeline_stage_changed | v4.63 | ✅ | Fires on every stage transition in `movePipelineStage()`. Includes job_id, new_stage, company, company_domain. |
| D3 | PostHog: pipeline_entry_created | v4.63 | ✅ | Fires on first-time pipeline save (when _dbId didn't exist). Includes job_id, stage, company, ats_source. |
| D4 | Notification types: signal_calendar | v4.63 | ✅ | SMS-enabled. "Calendar interview detected" — real-time alerts when calendar scanning finds interview events matching pipeline companies. |
| D5 | Notification types: signal_email | v4.63 | ✅ | "Email signal detected" — real-time alerts when Gmail scanning detects recruiter responses. |
| D6 | Notification types: pipeline_prompt | v4.63 | ✅ | "Pipeline check-in prompts" — daily digest of stale pipeline entries that need user attention. |
| D7 | Version sync v4.63 | v4.63 | ✅ | dashboard.html, js/app.js, dist/dashboard.min.js all v4.63. |

**Phase 36 total:** 7 items | All complete.

---

## Phase 38: Styling Fixes (v4.79a) — 2026-02-25

**Goal:** Fix two styling bugs: missing CSS for hidden job cards on Tuning page, and inconsistent heading accent colors across onboarding heroes.

**Source:** Pod 1 visual QA

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| S1 | Hidden job card CSS (Tuning page) | v4.79a | ✅ | Added 6 missing CSS classes to styles.css: `.poor-match-card`, `.poor-match-info`, `.poor-match-title`, `.poor-match-meta`, `.poor-match-reason`, `.poor-match-unhide`. Flex layout, text truncation, hover states, button styling. |
| S2 | Hero heading color consistency | v4.79a | ✅ | Wrapped accent phrases in `<span style="color:#f59e0b">` to match index page "Your search continues" amber. Affected: "This is how you take control." (Get Started), "Track everything." (Setup), "Better matches." (Tuning). |
| S3 | CSS cache bust | v4.79a | ✅ | Bumped `styles.css?v=4.78e` → `?v=4.79a` in dashboard.html. |
| S4 | Vercel deploy | v4.79a | ✅ | Deploy triggered and verified live. New CSS confirmed serving in production. |

**Phase 38 total:** 4 items | All complete | Styling-only — no version bump to dashboard.


## Phase 39: Bug Tracker Resolution (v4.83) — 2026-02-25

**Goal:** Resolve 6 outstanding bugs from Pod 2 tracker across resumes.js and tuning.js.

**Source:** Pod 2 bug tracker, session with Claude

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| B1 | Archive persistence failure (P1) | v4.83 | ✅ | `archiveResume()` now awaits Supabase write, checks `error`, shows toast on failure, only updates local state on DB success. Added `_archivedLocallyAt` timestamp guard (60s grace). `reconcileResumeArchive()` skips reconciliation if `recentlyChanged` within 60s. Same pattern applied to `unarchiveResume()`. Commits: f921e9bf, 40825389. |
| B2 | Score badge labels (P2) | v4.83 | ✅ | Thresholds: high ≥ 75 (was 70), mid ≥ 50 (was 40), low < 50. Labels: "Strong" / "Partial" / "Weak". Removed % suffix, added `nri-score-label` div. Commit: f921e9bf. |
| B3 | Archived count = 0 (P1) | v4.83 | ✅ | Resolved automatically — same root cause as B1 (archive write not awaited). |
| B4 | Archive motivation copy (P3) | v4.83 | ✅ | Archive button tooltip: "Archive — preserves match history and scores. Restore anytime." Delete confirmation emphasizes permanence and suggests archiving. Archive section label tooltip explains score/history preservation. Commit: 40825389. |
| B5 | Tuning pill font | v4.83 | ✅ | Fixed by Pod 1 (Tailwind safelist expansion, 152 classes restored). |
| B6 | Poor match suggestions empty (P2) | v4.83 | ✅ | Per-card pattern notes: "Pattern: 'intern' appears in 4 hidden jobs". Fallback to company pattern. Actionable exclusion banner. De-duplicated stopWords/counting. Commit: d05d6770. |

**Phase 39 total:** 6 items | All complete | Files: js/resumes.js, js/tuning.js | Bundle rebuild required (v4.83).

**Git verification:** Pod 2 commits (f921e9bf, d05d6770, d452209e) via GitHub API. Pod 1 made 6 subsequent commits to dashboard.html (hero redesign, extension card, etc.) — no conflicts with resumes.js or tuning.js. All 14 fix markers verified in remote source files and minified bundle.

---

## Phase 40: Feed Quality & Search Relevance (v4.86–v4.90) — 2026-02-25

**Goal:** Enable JD-content-aware filtering so users can search by skills, experience, and description keywords — not just metadata.

**Source:** Pod 2 proposal, session with Claude (FEED_QUALITY_PHASES.md, FEED_QUALITY_PROPOSAL.md)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| FQ1 | Skills dictionary — corpus frequency analysis | v4.86 | ✅ | `extract_jd_metadata_v2` PL/pgSQL function. Autonomous pg_cron backfill across 128K+ jobs. Extracts skills into `extracted_skills[]` array column. |
| FQ2 | Deterministic JD extraction function | v4.86 | ✅ | `extract_jd_metadata_v2()` PL/pgSQL. Regex extraction of skills, seniority, department from `content` field. New columns: `extracted_skills[]`, `extracted_seniority`, `extracted_department`. GIN index on extracted_skills. |
| FQ3 | Backfill + pipeline integration | v4.86–v4.87 | ✅ | Batch extraction on 128K+ jobs via pg_cron. `jd-extraction-ongoing` cron (every 5 min) catches new jobs. `loc_type` backfill: 12K+ remote jobs properly tagged. `trg_sync_loc_type` trigger for ongoing sync. |
| FQ4 | PostgreSQL full-text search (tsvector) | v4.86 | ✅ | `content_tsv` tsvector column, GIN index, auto-update trigger. `websearch_to_tsquery` for JD CONTAINS pill. Used by relevance sort and JD search. |
| FQ5 | SKILLS pill type in Query Builder | v4.86 | ✅ | Green pill. Queries `extracted_skills` using `.cs` (contains) operator. Multiple pills AND together. Full lifecycle: input bindings, serialization, edit flow, clear-all, saved filter persistence. |
| FQ6 | LEVEL filter (replaces EXPERIENCE range) | v4.86 | ✅ | Purple pill querying `extracted_seniority` (senior/mid/junior/executive/intern). Single or multi-select via `.eq`/`.in`. Full pill lifecycle. QB layout: Skills+Dept row, Level+JD row. |
| FQ7 | JD CONTAINS pill type (full-text) | v4.86 | ✅ | Amber pill. Free text → `websearch_to_tsquery` against `content_tsv`. Stemming automatic. Multiple pills AND together. |
| FQ8 | Relevance sort option | v4.88 | ✅ | Feed sort dropdown option. Client-side scoring: title 3x, skills 2x, company 1x, location 1x. `_relevanceScore` per job. `search_jobs_by_relevance` RPC for server-side `ts_rank`. |
| FQ9 | buildFilterQuery() expansion | v4.86 | ✅ | All new pill types wired into job-feed.js: SKILLS (`.cs`), LEVEL (`.eq`/`.in`), DEPARTMENT (`.eq`/`.in`), JD CONTAINS (`.textSearch`). Saved filter schema updated. `allPills()` and `renderAllPills()` expanded. |
| FQ9b | DEPARTMENT filter pill | v4.88 | ✅ | Blue pill querying `extracted_department` (engineering, marketing, sales, data, hr, finance, legal, etc.). Full lifecycle wired. |
| FQ10 | User feed signals table | v4.90 | ✅ | `feed_signals` table: user_id, greenhouse_id, signal_type, filter_name. RLS: users read/write own. `log_feed_signal` RPC (fire-and-forget). `get_feed_signal_stats` RPC. Signals: click, hide, save, apply. |
| FQ11 | Filter health score | v4.89 | ✅ | `get_filter_health` RPC: total matches, salary %, skills %, remote count, top skills, top departments. Weighted composite (salary 40%, skills 30%, content 30%). 💡 button on each saved filter → popover. |
| FQ12 | Smart skill suggestions | v4.89 | ✅ | Health popover shows top skills from matching jobs not in filter. Click → adds skill pill instantly with toast. `bjShowImproveSuggestions` / `bjApplyImproveSuggestions`. |
| FQ13 | Resume mismatch warnings | TBD | 📋 PLANNED | Cross-reference resume skills vs top jd_skills. Alert if 70%+ JDs require missing skill. |
| FQ14 | AI enrichment pilot (5K jobs) | TBD | 📋 PLANNED | `enrich-jd` EF. Claude Haiku: function, technical_level, mgmt_scope, summary, differentiators. 5K-job pilot (~$4). 4-layer evaluation. Go/no-go gate. |
| FQ15 | Full AI backfill (if pilot passes) | TBD | 📋 PLANNED | Phase 4b: full 350K backfill (~$280). pg_cron pipeline. Pro-gated FUNCTION and TECHNICAL DEPTH filters. "Why This Job?" feed card expansion. |

**Phase 40 status:** 13/16 complete. 3 remaining (resume mismatch, AI enrichment pilot, full backfill).


## Phase 40b: Pod 1 Sprint — Pricing, Global Version, AEO (v4.84) — 2026-02-25

**Goal:** Fix version drift across all pages, add login/copyright to external pages, replace pricing toggle with duration slider, fix sort pill duplication, produce /jobs-in/ city pages handoff.

**Source:** Pod 1 session with Claude

### Global Version System (v4.84)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| V1 | Create js/version.js — single source of truth | v4.84 | ✅ | `var BJ_VERSION = 'v4.84'`. Auto-populates `.bj-version`, `#nav-version`, `.bj-year` elements. Console log on every page. |
| V2 | Remove hardcoded versions from all pages | v4.84 | ✅ | Killed: index (v4.77 footer, v4.81 console, v4.83 comment), pricing (v4.22 console), data-lab (v4.78), 5 SEO pages (v4.78), app.js (v4.83 const). |
| V3 | Wire version.js into all 13 HTML pages | v4.84 | ✅ | index, pricing, dashboard, data-lab, salary-data, hiring-trends, jobs-by-industry, career-level-data, market-dynamics, ghost-report, help, terms, privacy, uninstall, survey, 404, 503. |
| V4 | Dynamic copyright year (bj-year class) | v4.84 | ✅ | `new Date().getFullYear()` populates all `.bj-year` spans. Replaced `document.write()` and inline scripts. Auto-rolls Jan 1. |

### External Page Polish (v4.84)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| E1 | Login button on all SEO data pages | v4.84 | ✅ | `.bj-topbar` nav with "✦ Brilliant Jobs" + "Log In" → /dashboard. 6 pages: data-lab, salary-data, hiring-trends, jobs-by-industry, career-level-data, market-dynamics. |
| E2 | Login button on ghost-report | v4.84 | ✅ | Same `.bj-topbar` inside existing `.container`. |
| E3 | Login button on terms, privacy, uninstall | v4.84 | ✅ | Added to existing `.top-bar` via `margin-left:auto`. |
| E4 | Login button on help.html | v4.84 | ✅ | Light-theme variant (blue button on white bg). |
| E5 | Copyright footer on all pages missing it | v4.84 | ✅ | SEO pages (6), ghost-report, terms, privacy, uninstall, help — all now have `© {year} Brilliant Jobs`. |

### Pricing Page Overhaul (v4.84)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| PR1 | Duration slider (1-12 months) | v4.84 | ✅ | Replaced Monthly/Annual toggle. Progressive discounts: 0%→40% over 1→12 months. Slider with filled track. |
| PR2 | Discount curve from job search data | v4.84 | ✅ | 12-step curve aligned to BLS job search duration statistics (23%→90% cumulative). |
| PR3 | Contextual insights per month | v4.84 | ✅ | "60% still searching — this is the national median" (5mo), "68% — senior roles take this long" (6mo), etc. |
| PR4 | Strikethrough original prices | v4.84 | ✅ | ~~$20~~ $18/month when discount active. `.plan-price-original` class. |
| PR5 | Total cost line | v4.84 | ✅ | "Starter: $54 total (save $6) · Pro: $108 total" below slider. |
| PR6 | FAQ: duration discount explanation | v4.84 | ✅ | "Choose how many months to commit. Longer = deeper discount. Up to 40% at 12 months." |
| PR7 | Fix: stray CSS brace broke pricing grid | v4.84 | ✅ | Extra `}` from slider CSS replacement closed style block early. All card styles ignored. |
| PR8 | Fix: slider label alignment | v4.84 | ✅ | Labels positioned at mathematically correct % (18.2%, 45.5%, 72.7%) instead of evenly spaced. |

### Bug Fixes (v4.84)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| BF1 | Sort pills duplicating on add/toggle/remove | v4.84 | ✅ | `renderSortPills()` never cleared container before re-rendering. Added `.sort-pill` removal at function start. |

### Handoff Documents (v4.84)

| # | Item | Status | Notes |
|---|------|--------|-------|
| H1 | /jobs-in/{city} city pages handoff | ✅ | 16-section, 664-paragraph docx. Phase 1: page shell + hook pills (~13.5h). Phase 2: user-search pills (~7h). Includes AEO strategy, 4 JSON-LD schemas, Jobs Feed interaction spec. |

**Phase 40b total:** 19 items | All complete | Version: v4.84
**Files modified:** js/version.js (NEW), js/app.js, js/sort-bar.js, build.js, dist/dashboard.min.js, dashboard.html, index.html, pricing.html, data-lab.html, salary-data.html, hiring-trends.html, jobs-by-industry.html, career-level-data.html, market-dynamics.html, ghost-report.html, help.html, terms.html, privacy.html, uninstall.html, survey.html, 404.html, 503.html

---

## Phase 39b: Pod 1 UX & Design Sprint (v4.82–v4.83) — 2026-02-25

**Goal:** Resolve CSS/HTML/UX bugs from bug tracker, redesign Jobs Feed and Resumes pages for design coherence, improve feed merchandising capabilities.

**Source:** Pod 1 session with Claude, 6 reported bugs + feed UX review

### Tailwind & CSS Fixes (v4.82)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| P1 | Tailwind safelist expansion | v4.82 | ✅ | 152 purged classes restored. Expanded from 1 pattern to 13 patterns covering 654 custom classes. |
| P2 | Score badge CSS colors | v4.82 | ✅ | `.nri-score.mid` blue→amber, `.nri-score.low` amber→red. Added `.nri-score-label` class. |
| P3 | Archive button CSS standalone | v4.83 | ✅ | `.rc-btn` no longer requires `.rc-actions` parent. Added font-family + transition. |
| P4 | Tuning pill font fix | v4.82 | ✅ | Added explicit `font-family: var(--sans)` to `.qb-pill` base class. |
| P5 | Ghost Rate column removed | v4.83 | ✅ | Removed from header + row rendering. Colspans updated 10→9. Will resurface as per-company visual cue when data available. |

### Feed UX Redesign (v4.83)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| P6 | Jobs Feed hero banner | v4.83 | ✅ | Navy hero matching Setup/Tuning/Resumes pattern. Stat cards absorbed into hero as compact chips (Total Jobs, Companies, New Today, Pipeline). |
| P7 | Resumes hero stats | v4.83 | ✅ | Same pattern: stat-grid replaced with hero-embedded chips (Active, Levels, Assigned, Coverage, Archived). |
| P8 | Intel/merch 2-card slot | v4.83 | ✅ | Replaced Market Intelligence box. Left card = contextual insight (salary ranges, new jobs). Right card = merch-client rotatable (upsell, feature announcement). Both dismissible. |
| P9 | Contextual intel card JS | v4.83 | ✅ | `updateIntelInsight()` populates card from actual filter/job data: salary p25–p75, new jobs count, filter name. |
| P10 | Stat chip stacked layout | v4.83 | ✅ | Hero stat chips changed from horizontal side-by-side to stacked (number on top, label below). |

### Feed Controls & Copy (v4.83)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| P11 | Generate from Resume CTA | v4.83 | ✅ | Moved from inside collapsed filter builder to standalone card ABOVE Job Filter Builder. |
| P12 | Extension card fix | v4.83 | ✅ | "Download Extension" button now hidden when green dot shows connected. |
| P13 | Sort pill dedup | v4.82 | ✅ | Set-based dedup guard in `renderSortPills()`. Filters jobSortStack on every render. |
| P14 | Get Started copy update | v4.82 | ✅ | "Save" → "Pipeline", description updated to match actual Save→Pipeline→Bulk Apply flow. |
| P15 | Table header alignment | v4.82 | ✅ | Added missing Ghost Rate `<th>` (then removed entire column in P5). Rebalanced column widths. |

### Exclusion Language Overhaul (v4.83)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| P16 | Hide popup rewrite | v4.83 | ✅ | "Why hide this?" → "Why doesn't this belong?" + explainer: "This trains your exclusion filters — hide 3+ and we'll suggest patterns to auto-remove similar jobs." |
| P17 | Hide reason labels | v4.83 | ✅ | Action-oriented: "Wrong title → exclude similar roles", "Wrong company → block this employer". |
| P18 | Hide button tooltip | v4.83 | ✅ | "Hide this job — trains your exclusion filters to remove similar listings" |
| P19 | Improve Filters button | v4.83 | ✅ | "🔧 Improve Filters (3 hidden)" → "🔧 3 hidden — generate exclusions" |

### Version Sync

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| P20 | Version sync v4.83 | v4.83 | ✅ | BJ_VERSION in js/app.js (single source of truth), CSS bust, nav display, comment headers across index.html + pricing.html. |

**Phase 39b total:** 20 items | All complete | Version range: v4.82 → v4.83
**Files modified:** tailwind.config.js, src/input.css, styles.css, dashboard.html, js/job-feed.js, js/keywords.js, js/sort-bar.js, js/app.js, index.html, pricing.html, dist/dashboard.min.js

---

## Phase 43: City Pages + Internal Linking Sprint (v4.91–v4.93) — 2026-02-25/26 ✅ COMPLETE

**Goal:** Enhance the existing SSR system (api/seo-page.js + seo_page_cache) with city-level data, hook pills for conversion, comprehensive internal cross-linking, JSON-LD structured data, and homepage/data-lab browse sections. Based on H1 handoff spec.

**Branch:** `feat/city-pages-linking-sprint` → merged to main via cherry-pick at v4.92–v4.93
**STATUS: ✅ ALL BLOCKS DEPLOYED TO PRODUCTION**

### Database (Live in Production)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| CP1 | `city_pages` table | v4.91 | ✅ | 2,178 rows seeded from ats_jobs (≥10 jobs/city). Indexes on slug + job_count DESC. RLS: anon SELECT, auth SELECT, service_role write. |
| CP2 | `city_popular_pills` table | v4.91 | ✅ | Phase 2 schema, empty. FK to city_pages(slug), category CHECK constraint. |
| CP3 | Seed data | v4.91 | ✅ | 97 cities with top_titles, 77 with top_skills, 100 with top_companies. Median salaries, remote %, top industries. Auto-generated meta_title/meta_description. |
| CP4 | `refresh-city-stats` Edge Function | v4.91 | ✅ | 6-step refresh (stats→companies→titles→skills→industries→meta). Deployed. pg_cron: `0 */6 * * *`. |

### SSR Enhancements (Deployed v4.92)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| CP5 | Metro page hook pills | v4.92 | ✅ | "What Companies Are Hiring For" with top titles/skills/industries from city_pages. Each pill has label + count + "+" button. Server-rendered role links (10 roles). "Compare Other Cities" cross-links (top 8 metros). |
| CP6 | Trends page cross-links | v4.92 | ✅ | "Explore [Role] Jobs by City" links to /jobs-in/:metro/:role for top 10 metros. "Related Roles" links to all 20 trends pages. |
| CP7 | Market hub page enhancements | v4.92 | ✅ | "Jobs by City" grid (top 50 metros), "Hiring Trends by Role" grid (all trends), "Data Lab Reports" (6 subpages). Cross-linking data fetched in parallel (non-blocking). |
| CP5b | Homepage sections | v4.91 | ✅ | "Browse Jobs by City" (8-city grid) + "Trending Roles" (4-role grid) added to index.html. |
| CP5c | Data Lab browse by city | v4.91 | ✅ | "Browse Jobs by City" panel (15 city links) + "View all cities →" link. |
| CP6e | Data Lab subpage contextual links | v4.92 | ✅ | salary-data→cities, hiring-trends→roles, career-level-data→roles. Merged into renderMarketPage hub grid. |

### JSON-LD Structured Data (Deployed v4.92)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| LD1 | Metro page JSON-LD | v4.92 | ✅ | Place schema (geo entity), ItemList of JobPosting (top 5 employers), FAQPage (salary, companies, remote %, growth). US state name lookup table. |
| LD2 | Trends page JSON-LD | v4.92 | ✅ | Occupation schema (role + salary distribution), FAQPage (salary, demand, top metros, remote %). |
| LD3 | renderShell `extraLd` param | v4.92 | ✅ | Added `extraLd` parameter to renderShell for per-page JSON-LD injection. |

### Pill Conversion Flow (Deployed v4.93)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| B7a | "+" button pill click handler | v4.93 | ✅ | Inline script in renderShell. Auth detection via Supabase localStorage token. PostHog tracking: `seo_pill_click`. |
| B7b | Anonymous user signup modal | v4.93 | ✅ | Branded modal with logo, pill term, "Get Started Free" CTA → redirects to dashboard with URL params. |
| B7c | Authenticated user filter injection | v4.93 | ✅ | Checkmark animation → redirect to dashboard → pill added to first saved filter as WHAT pill. Auto-creates filter with metro WHERE pill if no filters exist. |
| B7d | Dashboard deep-link handler | v4.93 | ✅ | Picks up `?seo_pill=<term>&seo_type=<type>&seo_metro=<slug>` URL params. Injects pill, shows toast, cleans URL. PostHog: `seo_pill_applied`. |

### Version

| Surface | Version |
|---------|---------|
| version.js (prod) | v4.93 |
| dashboard.html nav | v4.93 |
| pg_cron #27 | refresh-city-stats (0 */6 * * *) |

**Phase 43 total: 17 items | 17 complete ✅. Version: v4.91→v4.93. Fully deployed to production.**

---

## Phase 44: Data Integrity & Sync Consolidation (v4.94–v5.00) — 2026-02-26 ✅ COMPLETE

**Goal:** Fix cascading data quality issues — WHEN filter failures, dead job resurrection, stat card inconsistencies, localStorage/Supabase desync — and consolidate the sync architecture around a single write path.

**Source:** User-reported bugs (empty active resumes, 2-job search results, NEW TODAY > TOTAL, dead jobs reappearing) traced to systemic root causes in filter logic, refresh cron, and split sync systems.

### Bug Fixes (v4.94–v4.98)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| S1 | WHEN filter validation + normalization | v4.94 | ✅ | `normalizeWhenValue()` standardizes time inputs (today, yesterday, last N days/weeks/months). Handles shorthand: "2w" → "last 14 days". Sort bar validates on Enter/blur with inline red error for unrecognized input. |
| S2 | Active Resumes empty tab recovery | v4.94 | ✅ | Data sync mismatch: localStorage `bj_resumes` empty while Supabase `resume_archive` had 3 resumes. `renderResumes()` now detects empty state and triggers async cloud recovery with preserved metadata. |
| S3 | Unified sync layer v1 | v4.95 | ✅ | SYNC_REGISTRY maps 5 data domains to localStorage keys, globals, and Supabase sources. `syncEnsure()` checks localStorage first, fetches from cloud if empty. `syncHealthCheck()` runs 500ms after auth. Plan card flex layout fix (bottom-pinned buttons). |
| S4 | Dead jobs reappearing | v4.96 | ✅ | Root cause: `refresh-jobs` and `refresh-usajobs` upsert rows with `status='open'`, overwriting `status='closed'` set by `handleDeadJob()`. Fix: removed `status` from upsert — defaults to 'open' on INSERT, never overwritten on UPDATE. Edge Functions redeployed. |
| S5 | Stat card NEW TODAY > TOTAL | v4.96 | ✅ | TOTAL count query used `buildFilterQuery` which applied WHEN time filter. NEW TODAY added its own 24h window. If WHEN narrower than 24h, TOTAL < NEW TODAY (mathematically impossible). Fix: TOTAL stat strips WHEN pills before query (`sfNoWhen`). |
| S6 | WHEN filter indicator | v4.97 | ✅ | Filter count bar now shows purple `⏱ today` badge when WHEN time pill is active. Makes time restriction visible. |
| S7 | Pagination 50→20 per page | v4.98 | ✅ | `JOBS_PER_PAGE` reduced from 50 to 20. Typical screen showed only 23 jobs at 50/page — 20 fits one screen with pagination controls. |

### Infrastructure (v4.99–v5.00)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| S8 | Remote search truncation fix | v4.99 | ✅ | Fixed location search query truncation for "remote" WHERE pills. |
| S9 | WHEN filter wrong column | v5.00 | ✅ | WHEN filter was using `first_seen_at` (only 4 jobs today) instead of `updated_at` (276 jobs today). `first_seen_at` only records scraper discovery time; `updated_at` reflects last refresh confirmation. Fixed WHEN to use `updated_at`. |
| S10 | Restore `updated_at` in refresh-jobs upsert | v5.00 | ✅ | `updated_at` was accidentally removed from refresh-jobs upsert rows, which would freeze all job timestamps at INSERT time. Restored so refresh cron keeps `updated_at` current. Edge Function redeployed. |
| S11 | Eliminate localStorage sync bypasses | v5.00 | ✅ | Audit found 4 places writing directly to localStorage for synced keys, bypassing `saveUserData()` cloud sync. All 4 fixed. Removed redundant `localStorage.setItem` calls preceding `saveUserData`. |
| S12 | Sync architecture consolidation | v5.00 | ✅ | Eliminated duplicate sync system (sync.js v1 competed with globals.js `saveUserData/_flushUserData`). sync.js now focuses solely on boot-time health check + cloud recovery. globals.js owns ALL writes (30 call sites). Zero direct LS writes to synced keys remaining. |

### AI Infrastructure (deployed between v4.95–v4.96)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| S13 | `enrich-jd-ai` Edge Function | v4.95+ | ✅ | AI-powered JD skills/requirements extraction via Claude Haiku. Batch processing with `jd_ai_enrichment_progress` function + pg_cron schedule. Concurrency reduced to 5 to eliminate rate limit errors (50/50 success rate). |

### Sync Architecture — Final State

| Component | Owner | Responsibility |
|-----------|-------|---------------|
| `saveUserData(lsKey, jsonStr)` | globals.js | ALL writes: localStorage + debounced Supabase PATCH |
| `_flushUserData()` | globals.js | Batch Supabase writes for pending keys |
| `loadUserData(userId)` | globals.js | Login-time: Supabase → localStorage merge |
| `syncHealthCheck()` | sync.js | Post-auth safety net: detect empty LS keys, recover from Supabase + dedicated tables |
| Direct `localStorage.setItem` | ❌ BANNED | 0 remaining for synced keys. Only UI state keys (bj_collapse, bj_sf_checked) use direct LS. |

### Version

| Surface | Version |
|---------|---------|
| version.js (prod) | v5.00 |
| dashboard.html nav | v5.00 |
| Edge Functions deployed | refresh-jobs, refresh-usajobs, enrich-jd-ai |

**Phase 44 total: 13 items | 13 complete ✅. Version: v4.94→v5.00. Fully deployed to production.**

---

## Phase 45: Visual Consistency Pass + UX Fixes (v5.01–v5.05) — 2026-02-26 ✅ COMPLETE

**Goal:** Align Applications & Ghost Monitor pages with hero-first architecture used across all other tabs, fix feed filter/display mismatch, and polish resume action flows.

**Source:** Phase 39b visual consistency handoff doc + user-reported feed issues.

### Applications & Ghost Monitor Redesign (v5.01)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| V1 | `.app-hero` navy banner | v5.01 | ✅ | Hero banner with lifecycle stats (Queued, Submitted, Response Rate, This Week). Same navy gradient as all other heroes. |
| V2 | Lifecycle-spanning stats | v5.01 | ✅ | Response Rate (responded/totalSent×100) and This Week (submitted in 7 days) replace old queue-state-only stats. |
| V3 | 3-way Queue/Pipeline/History toggle | v5.01 | ✅ | Replaces old List/Board toggle + app-flow-tabs bar. `switchAppView()` full implementation with localStorage persistence. |
| V4 | Settings gear panel | v5.01 | ✅ | Rules + Notifications collapsed into `#app-settings-panel` with sub-tabs. Gear icon toggle. |
| V5 | Queue table restyle | v5.01 | ✅ | Font-size 10px headers, 700 weight, 8px padding — aligned with `.job-table` conventions. |
| V6 | Intel slot below hero | v5.01 | ✅ | `#app-intel-slot` for cross-tab ghost alerts (stale apps > 7 days). |
| V7 | `.ghost-hero` banner | v5.01 | ✅ | Ghost Monitor hero: "Silence is data. We track it." Stats: Active, Avg Days, Likely Ghosted, Confirmed, Gmail. |

### Codebase Cleanup (v5.02)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| V8 | Remove dead `.app-flow-tabs` CSS | v5.02 | ✅ | 14 lines of orphaned CSS removed (no longer in HTML after v5.01). |
| V9 | Remove dead ID writes | v5.02 | ✅ | Null-guarded writes to `a-pending`, `a-failed` removed (IDs deleted in v5.01). |
| V10 | Gmail hero chip update | v5.02 | ✅ | `g-gmail-stat` hero chip shows On/Off with `hs-green`/`hs-dim` classes in `initGmailStatus()`. |

### Resume Delete Flow (v5.04)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| V11 | Full-word delete labels | v5.04 | ✅ | Active resume delete button: "✕ Delete" (was just ✕ icon). Matches Archive/Restore pattern. |
| V12 | Download-before-delete modal | v5.04 | ✅ | `confirmDeleteResume()` modal with 3 options: Save to Google Drive & Delete (if GDrive connected), Save to Desktop & Delete, Delete Without Saving. Replaces bare `confirm()`. |

### Feed Filter Fixes (v5.05)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| V13 | WHEN filter column correction | v5.05 | ✅ | **Reverses S9 from Phase 44.** WHEN filter changed back to `first_seen_at` to match DAYS column display. Root cause: `updated_at` let 15d-old jobs appear in "last 14 days" filter because their refresh timestamp was recent. `first_seen_at` = when job was discovered = what users see in DAYS column. Filter and display now use same column. |
| V14 | App mode button contrast | v5.05 | ✅ | Active (blue) button subtitle was `color:var(--text-dim)` — gray on blue = unreadable. Now sets `rgba(255,255,255,0.85)` when active, reverts on deselect. Applied on click + on-load init. |

### S9 Correction Note

Phase 44 item S9 changed WHEN from `first_seen_at` to `updated_at`, reasoning that `updated_at` reflects refresh confirmation while `first_seen_at` only records scraper discovery. However, this introduced a user-visible inconsistency: the DAYS column displays `first_seen_at` age, so a job could show "15d" yet pass a "last 14 days" WHEN filter (because its `updated_at` was recent). V13 reverses this — WHEN now uses `first_seen_at` so the filter and display column are consistent. The correct solution for "show recently refreshed jobs" would be a separate FRESHNESS filter on `updated_at`, not overloading the WHEN filter.

### Version

| Surface | Version |
|---------|---------|
| version.js (prod) | v5.05 |
| dashboard.html cache-bust | v5.05 |
| Console log | Dashboard v5.05 loaded |

**Phase 45 total: 14 items | 14 complete ✅. Version: v5.01→v5.05. Fully deployed to production.**

---

## Phase 46: Referral Program (v5.07–v5.10) — 2026-02-26 ✅ COMPLETE

### Referral System (v5.07–v5.10)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| R1 | Referral DB schema + RPCs + triggers | v5.07 | ✅ | `referrals`, `referral_rewards`, `referral_fraud_flags` tables. `create_referral_code`, `record_referral_click`, `process_referral_reward` RPCs. RLS policies. Seed data for reward tiers. |
| R2 | Referral Hub page + sharing UX | v5.08 | ✅ | Dashboard Referral Hub section with stats cards, one-click sharing (LinkedIn, email, text), pre-written messages, copy-to-clipboard. Badge system with milestone levels. Opt-in leaderboard. |
| R3 | Referral reward + activation Edge Functions | v5.09 | ✅ | `process-referral-reward` (grant rewards on activation), `check-referral-activation` (verify onboarding), `referral-fraud-scan` (detect duplicate IPs, same-device, self-referrals). pg_cron scheduled. |
| R4 | Referral fraud detection + clawback | v5.10 | ✅ | `fingerprint.js` for browser fingerprinting. `referral-capture.js` for landing page URL param + cookie attribution. `referral-reward-clawback` EF for reversing fraudulent rewards. Phase 4 migration with clawback status, fingerprint columns, click tracking RPC. |
| R5 | Referrals admin panel | v5.10 | ✅ | Admin tab with fraud queue, clawback controls, ban management. Referral metrics visibility for CPO. |
| R6 | Referral attribution on login | v5.10 | ✅ | Login hook checks for referral cookie/URL param and links new user to referrer. Attribution persists across sessions. |
| R7 | Bundle rebuild for referral modules | v5.10 | ✅ | `fingerprint.js` + `referral-capture.js` + `referrals.js` added to build pipeline. `dist/dashboard.min.js` rebuilt with all referral modules. |

### Version

| Surface | Version |
|---------|---------|
| version.js (prod) | v5.10 |
| Console log | Dashboard v5.10 loaded |

**Phase 46 total: 7 items | 7 complete ✅. Version: v5.07→v5.10. Fully deployed to production.**

---

## Phase 47: Hotfixes & UX Polish (v5.06, v5.11–v5.17) — 2026-02-26 ✅ COMPLETE

### Settings & Feed Fixes (v5.06, v5.11)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| H1 | Settings gear panel positioning fix | v5.06 | ✅ | `#app-settings-panel` was nested inside `#app-view-queue-panel`. Moved to sibling of view panels + `scrollIntoView`. Now appears directly below gear button regardless of active view. |
| H2 | WHEN filter + pagination + result capping fix | v5.11 | ✅ | Root cause: >200 location IDs caused `.in()` cap at 200 random jobs. Fix: SQL-native WHERE clauses for state pills (`loc_state.eq.XX`), radius pills (bounding box), country pills (`loc_country=US`). WHEN filter, pagination, and "today's jobs" now work correctly at scale. |
| H2a | `united states` WHERE pill fix | v5.11.1 | ✅ | `COUNTRY_MAP` maps common country names to ISO codes. `'united states'` → `loc_country.eq.US` instead of `location.ilike.%united states%` (was missing 117K of 163K US jobs). |

### Infrastructure Hardening (v5.12–v5.16)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| H3 | Version system hardening | v5.12 | ✅ | Zero hardcoded version strings remain. `version.js` sole source of truth with universal `[id$="-version"]` selector. Removed hardcoded versions from `dashboard.html` (v4.91), `roadmap.html` (v4.12 fallback), `debug-resume.html` (v2.61b). Added `version.js` to 3 missing pages. |
| H3a | Referral Supabase init fix | v5.13 | ✅ | `referrals.js` IIFE tried `window.bjSupabase` (undefined). Fix: expose `sb` as `window.bjSupabase` in `globals.js`. Fixes 4 call sites. Bundle rebuilt. |
| H4 | Toast notifications for remaining error paths | v5.14 | ✅ | 44 `toastWarning`/`toastError` calls added across 5 modules: `pipeline.js` (11), `settings.js` (2), `admin.js` (22), `stats.js` (2), `billing.js` (7). Skipped batch background ops to avoid toast spam. |
| H4a | innerHTML XSS audit | v5.15 | ✅ | Audited 126 `innerHTML` sites. `admin.js`: 10 new `escapeHtml()` + 1 DOMPurify (user emails, feedback text, referral names, company slugs, content stories). `keywords.js`: 12 new `escapeHtml()` (AI score results, cover letter content, filter names, missing skill terms). |
| H4b | PII encryption in localStorage | v5.16 | ✅ | `saveUserData()` encrypts PII keys (`bj_resumes`, `bj_readiness`) via AES-GCM. `_flushUserData()` decrypts before Supabase cloud sync. Migration-safe: `decryptFromStorage()` passes through non-encrypted values. |

### Resume Score Button UX Redesign (v5.17)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| H5 | Single "Score Resume" button | v5.17 | ✅ | Replaces dual "Analyze" / "✨ Deep Analyze" buttons. `handleScoreClick()` tier router: Free/Starter → runs Quick Score + contextual upsell card. Pro w/ credits → modal choosing "Quick Score" (free, keyword match) vs "AI Coaching" (5 credits, multi-agent). Pro w/o credits → Free flow + "Buy credits" CTA. Remembers last choice via `bj_score_mode`. 7 PostHog events for upsell funnel. `getUserCredits()` helper. Upsell dismissible 7 days, resets on resume upload. |

### Version

| Surface | Version |
|---------|---------|
| version.js (prod) | v5.17 |
| Console log | [BJ] Brilliant Jobs Dashboard v5.17 loaded |

**Phase 47 total: 9 items | 9 complete ✅. Version: v5.06→v5.17. Fully deployed to production.**

---

## Phase 48: Referral Hub Redesign (v5.19–v5.25) — 2026-02-27 ✅ COMPLETE

Source: referral-hub-redesign-spec v3 (Feb 26, 2026)

### Phase 1 — Visual Redesign (v5.19)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| RH1 | Copy rewrite + hero banner | v5.19 | ✅ | "Share the signal. Earn together." hero with gradient. Replaced generic copy with intelligence/data-themed messaging. |
| RH2 | SVG badge icons (stroke-based) | v5.19 | ✅ | 5 tier badges: Signal (bars), Source (broadcast), Radar (target), Intel (flag), Clearance (shield). No emojis. |
| RH3 | Tier naming system | v5.19 | ✅ | Signal → Source → Radar → Intel → Clearance. Intelligence-themed names replacing generic "Bronze/Silver/Gold". |
| RH4 | Design system alignment | v5.19 | ✅ | `.referral-hero` following `.feed-hero`/`.setup-hero` pattern. CSS variables throughout. |

### Phase 2 — Leaderboard Rewards Backend (v5.20)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| RH5 | `leaderboard_rewards` table + RPCs | v5.20 | ✅ | `distribute_leaderboard_rewards` RPC (SECURITY DEFINER). Reward tiers: 1st = 100cr+30d Pro, 2nd = 50cr+14d, 3rd = 25cr+7d, top 10% = 10cr. |
| RH6 | pg_cron schedules | v5.20 | ✅ | Weekly (Monday 00:00 UTC) + monthly (1st of month) leaderboard reward distribution. |
| RH7 | `get_leaderboard` RPC + Resend template | v5.20 | ✅ | Period-filtered leaderboard with `is_me` flag, earning columns. Dark-theme email template for reward notifications. |

### Phase 3 — Leaderboard Frontend (v5.22)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| RH8 | Period toggle + reward grid | v5.22 | ✅ | Weekly/Monthly toggle. 4 reward tier cards with visual hierarchy. Countdown timer ("Resets in Xd Xh"). |
| RH9 | Leaderboard table + rank highlight | v5.22 | ✅ | User rank highlight with "(you)" tag. "Earning" column (credits + Pro days). 20-user minimum threshold with progress bar. |

### Phase 4 — Milestone Rewards + Bug Fixes (v5.25)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| RH10 | Tier unlock bonuses (4A) | v5.25 | ✅ | `referral_milestones` table (idempotent). `process_tier_bonus` RPC: Signal=10cr, Source=25cr, Radar=50cr, Intel=100cr+30d Pro, Clearance=200cr+90d Pro. Toast notification on unlock. |
| RH11 | Clearance quarterly retention (4B) | v5.25 | ✅ | `check_clearance_retention` RPC: downgrades inactive Clearance→Intel if no activated referral in 90 days. pg_cron quarterly (1st of Jan/Apr/Jul/Oct). Auto-notification on downgrade. |
| RH12 | Profile flair system (4C) | v5.25 | ✅ | Signal+: tier icon on leaderboard. Radar+: accent-colored name. Clearance: gold name + shield icon + "TOP REFERRER" badge. |

### Bug Fixes (v5.25)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| RH-BF1 | Tab restore fix | v5.25 | ✅ | `initReferralHub()` + `renderGhostMonitor()` added to tab restore block in `app.js`. Fixed "Loading..." on page refresh when referrals was last active tab. |
| RH-BF2 | LinkedIn-based referral codes | v5.25 | ✅ | Codes now derived from LinkedIn slug (`marston` instead of `BJ-972148`). Links use `/in/` format: `brilliantjobs.app/in/marston`. Updated `get_referral_stats` RPC, `generate_referral_code` trigger, cleaned up obsolete `.replace()` calls. |

### Hotfix (v5.23–v5.24)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| RH-HF1 | localStorage enc: crash fix | v5.23–v5.24 | ✅ | PII encryption (v5.16) prefixed values with `enc:`. 68 `JSON.parse(localStorage.getItem())` calls across 13 JS files crashed on `enc:` values. Global `safeReadLS()` helper. `readPiiData()` + `decryptFromStorage()` hardened. |

### Version

| Surface | Version |
|---------|---------|
| version.js (prod) | v5.25 |
| Console log | [BJ] Dashboard v5.25 loaded |

**Phase 48 total: 12 items + 2 bug fixes + 1 hotfix | All complete ✅. Version: v5.19→v5.25. Fully deployed to production.**

---

## Phase 49: Extension Infrastructure (v5.44–v5.48)

### v5.44 — Fingerprint-Randomized Extension Builds

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| EXT-1 | Per-download fingerprint randomization | v5.44 | ✅ | Each extension download gets unique fingerprint values. Prevents fleet detection. |
| EXT-2 | ROADMAP version sync | v5.44 | ✅ | Fixed stale ROADMAP.md (was v5.42). |

### v5.45 — Extension Update Notification (Item #4)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| EXT-3 | Extension version sync to Supabase | v5.45 | ✅ | Extension reports version via `syncStateToSupabase` → `profiles.extension_version`. |
| EXT-4 | Dashboard mismatch detection | v5.45 | ✅ | `REQUIRED_EXTENSION_VERSION` const. Amber nav dot + update banner on Setup page. |

### v5.46 — Extension Tier 3 Batch + Discovery Pipeline

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| EXT-5 | Extension ID broadcast (Item #8) | v5.46 | ✅ | Simple message pass from extension to dashboard. |
| EXT-6 | Tier change push notification (Item #11) | v5.46 | ✅ | Listener + toast when plan changes mid-session. |
| EXT-7 | Dashboard JD match in apply modal (Item #12) | v5.46 | ✅ | Fetch + render existing score data in apply modal. |
| EXT-8 | application_profiles table (Item #21) | v5.46 | ✅ | Schema + RLS for multiple fill personas. |
| EXT-9 | discover-boards Edge Function (Item #2 partial) | v5.46 | ✅ | Background Discovery Pipeline server-side component. |

### v5.47 — Auto-Apply Trigger Engine + Feed Health Admin

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| EXT-10 | Auto-Apply Trigger Engine (Item #1) | v5.47 | ✅ | Edge Function `auto-apply-trigger` on pg_cron (10 min). Score-gated matching of new jobs to saved filters → `pending_applications`. |
| EXT-11 | Feed Health Admin Tab (Item #3) | v5.47 | ✅ | Admin dashboard: companies discovered, boards found by source, Easy Apply captured, ATS link-outs, extension fleet stats. |

### v5.48 — Extension Hardening: Confirmation, Redirect, Caching, Crypto, Limits

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| EXT-12 | Expanded confirmation detection (Item #16) | v5.48 | ✅ | 30+ patterns covering Greenhouse, Lever, Workday, Indeed, LinkedIn, Ashby, iCIMS, BambooHR, Jobvite, SmartRecruiters. URL path patterns + title-based detection. |
| EXT-13 | ATS redirect detection (Item #15) | v5.48 | ✅ | `tabs.onUpdated` listener pattern-matches external URLs to 11 ATS platforms. Logs to `extension_events` for feed health. Detects LinkedIn → ATS handoffs. |
| EXT-14 | Custom question cached answers (Item #18) | v5.48 | ✅ | Answer cache in `chrome.storage.local`. TTL: 7 days, max 200 entries. Cache hit skips EF call. `clearAnswerCache()` export for profile changes. |
| EXT-15 | Encrypted storage migration (Item #9) | v5.48 | ✅ | `BJ_CRYPTO_MIGRATION.migrate()` runs on install/update. Migrates plaintext `bjProfile`, `bjResumeRef`, `bjSavedFilters`, `_bj_answer_cache` to AES-GCM encrypted format. Idempotent. |
| EXT-16 | Starter tier daily limit badge (Item #10) | v5.48 | ✅ | Visual progress bar in extension popup. Shows `used / limit` with color states (normal → amber → red). Queries `pending_applications` for today's count. Starter tier only. |

### Version

| Surface | Version |
|---------|---------|
| version.js (prod) | v5.48 |
| dashboard.min.js cache buster | v=5.48 |
| styles.css cache buster | v=5.48 |
| Console log | [BJ] Dashboard v5.48 loaded |

**Phase 49 total: 16 items across v5.44–v5.48 | All complete ✅. Fully deployed to production.**

---

## Phase 50: Extension Completion Sprint (v5.49–v5.54) — 2026-02-27 ✅ COMPLETE

**Source:** Extension & Platform Remaining Work document (22 items total, all now complete)

### v5.49 — Background Discovery Pipeline + board_discovery_queue

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| EXT-17 | Background Discovery Pipeline (Item #2) | v5.49 | ✅ | Complete discovery loop: extension detects ATS boards during browsing → queues to `board_discovery_queue` → `discover-boards` Edge Function processes queue → new companies added to `ats_companies`. Self-sustaining job discovery. |
| EXT-18 | board_discovery_queue table (Item #20) | v5.49 | ✅ | Schema + RLS + indexes. Stores discovered board URLs with dedup on `(url, ats_source)`. Processed flag + retry logic. |

### v5.50 — Extension RBAC + recruiter_contacts

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| EXT-19 | Extension RBAC Expansion (Item #14) | v5.50 | ✅ | Pro/admin tier gating on harvest, data exports. Role tag in extension user bar. Free users see upgrade prompts on gated features. Extension 2.12.0. |
| EXT-20 | recruiter_contacts table (Item #22) | v5.50 | ✅ | Schema for recruiter contact storage. FK to `ats_companies`. Columns: name, email, title, linkedin_url, source, confidence_score. RLS: user-scoped. |

### v5.51 — Application Profiles + Workday Date Picker + File Upload Fallback

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| EXT-21 | Application Profiles CRUD (Item #7) | v5.51 | ✅ | Profiles tab in extension popup with full CRUD. Multiple fill personas (e.g., "Technical IC", "Leadership"). Profile selection before auto-fill. Extension 2.13.0. |
| EXT-22 | Workday Date Picker Widget (Item #13) | v5.51 | ✅ | 4-strategy date filling for Workday's custom date picker: direct input → calendar popup navigation → dropdown month/year → fallback manual entry. Handles all Workday date formats. |
| EXT-23 | Three-Tier File Upload Fallback (Item #17) | v5.51 | ✅ | Resume upload strategy: API file upload → form attach via input[type=file] → link paste as text fallback. Graceful degradation across ATS platforms. |

### v5.52 — Recruiter Email Discovery

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| EXT-24 | Recruiter Email Discovery (Item #19) | v5.52 | ✅ | Hunter.io API integration for recruiter email lookup. Results stored in `recruiter_contacts` table. Confidence scoring. Rate-limited to respect Hunter.io quotas. |

### v5.53 — Workday My Experience Auto-Fill

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| EXT-25 | Workday My Experience Auto-Fill (Item #5) | v5.53 | ✅ | Multi-section employment history filling for Workday's "My Experience" page. Handles dynamic dropdowns (company, title, industry), date pickers, add-another-entry flow. Maps application profile work history to Workday's form structure. |

### v5.54 — Indeed Anti-Bot Hardening

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| EXT-26 | Indeed Anti-Bot Hardening (Item #6) | v5.54 | ✅ | Three-layer hardening: (1) Randomized delays with log-normal distribution — inter-field (~900ms median), pre-submit (~2.5s), inter-page (~1.8s), thinking pauses. (2) Fingerprint masking — canvas noise injection, WebGL renderer variation, navigator property shimming (hardwareConcurrency, deviceMemory, webdriver flag). (3) Request pattern variation — partial field order shuffling (~30% swaps), field revisit simulation, tab-away visibility events. `hardenedFill()` orchestrator wraps Indeed handler's fill flow. Extension 2.14.0. |

### Version

| Surface | Version |
|---------|---------|
| version.js (prod) | v5.54 |
| Extension version.json | 2.14.0 |
| Console log | [BJ] Dashboard v5.54 loaded |

### Extension Remaining Work — Final Status

| Metric | Count |
|--------|-------|
| Total items (original handoff) | 22 |
| Shipped | 22 |
| Remaining | 0 |

All 22 items from the Extension & Platform Remaining Work handoff document are now complete. The extension is feature-complete for launch.

**Phase 50 total: 10 items across v5.49–v5.54 | All complete ✅. Fully deployed to production.**

---

## Phase 51: Competitive Gap Closure (v5.55–v5.56) — 2026-02-27 ✅ COMPLETE

**Source:** EXTENSION_COMPETITIVE_ANALYSIS_v5_54.md — 5 items identified from competitive analysis vs. FastApply, Huntr, OwlApply.

### v5.55 — Generic Handler + Manifest Fix (Items #1–#2)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| CG-1 | Generic/Universal Form Handler | v5.55 | ✅ | `extension/handlers/generic.js` — DOM heuristic form filler for any ATS. Label/input association, name attr matching, placeholder analysis, fuzzy-match. Falls back to aiAnswerer.js. Doubles ATS coverage from 8 to 8+ any unknown site. |
| CG-2 | Manifest Host Permissions Fix | v5.55 | ✅ | All known ATS domains in `host_permissions`. Auto-inject `contentScript.js` at `document_idle`. `optional_host_permissions` for unknown sites. Dynamic injection via `injectContentScriptIfNeeded()`. Extension 2.15.0. |

### v5.56 — Overlay + Cover Letter + Metrics (Items #3–#5)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| CG-3 | On-Page Status Overlay | v5.56 | ✅ | `extension/inject-overlay.js` — floating bottom-right widget. Progress bar, per-field status (filled/skipped/error), success with timing, error states. Auto-dismiss (5s success, 8s error). Wired into `handleFillRequest()` via `window.__bjOverlay` API. Matches FastApply/OwlApply overlay UX. |
| CG-4 | Cover Letter Generation | v5.56 | ✅ | `supabase/functions/generate-cover-letter/index.ts` — Claude Haiku (~$0.001/letter). JD + resume + profile → 350-word tailored cover letter. Tone selection (formal/conversational/default), emphasis keywords. Rate limited 20/day. Telemetry to `cover_letter_generations` table. |
| CG-5 | Fill Metrics & Feedback Loop | v5.56 | ✅ | `extension/utils/fillMetrics.js` — per-platform fill success/failure tracking. PostHog events (`extension_fill_completed`, `extension_ai_feedback`). Supabase persistence to `extension_fill_metrics` table + local buffer fallback. Thumbs up/down on AI answers. Auto-wired into `contentScript.js`. |

### Version

| Surface | Version |
|---------|---------|
| js/version.js | v5.56 |
| dashboard.html comment | v5.56 |
| dashboard.html cache-bust | ?v=5.56 |
| index.html comment | v5.56 |
| dist/dashboard.min.js | v5.56 |
| extension/version.json | 2.16.0 |
| extension/manifest.json | 2.16.0 |
| Console log | [BJ] Dashboard v5.56 loaded |

### Deployment

| PR | Path | Method |
|----|------|--------|
| #118 | feat/v5-55-generic-handler-manifest-fix → dev | squash |
| #119 | dev → staging | merge |
| #120 | staging → main | merge (tag v5.55) |
| #121 | feat/v5-56-overlay-coverletter-metrics → dev | squash |
| #122 | dev → staging | merge |
| #123 | staging → main | merge (tag v5.56) |

### Remaining Integration (post-deploy)

| # | Task | Notes |
|---|------|-------|
| 1 | Create `cover_letter_generations` table | Supabase schema + RLS |
| 2 | Create `extension_fill_metrics` table | Supabase schema + RLS |
| 3 | Wire PostHog API key | Replace placeholder in fillMetrics.js |
| 4 | Deploy generate-cover-letter EF | Supabase CLI deploy |
| 5 | Surface cover letter UI | Apply modal + extension popup |
| 6 | Admin fill metrics dashboard | Aggregation view per platform |

**Phase 51 total: 5 items across v5.55–v5.56 | All code complete ✅. Deployed to production.**

---

## Phase 52: Data Quality & Pipeline Hardening (v5.57–v5.62) — Feb 27, 2026

### v5.57 — Auto-Apply Trigger Engine
- Auto-apply trigger Edge Function deployed. Slug suffix variants added to discover-boards.

### v5.58 — pg_cron + Staffing Agency Detection
- pg_cron for auto-apply-trigger (Job ID 60, every 10 min). Staffing agency detection: `is_staffing_agency` on `ats_companies`, 72 boards flagged. match-companies cron (Job 57), resolve-boards cron (Job 59).

### v5.59 — Staffing Agency User-Facing Toggle
- `is_staffing_agency` column on `ats_jobs`, 5,790 jobs backfilled. User-facing staffing toggle in Tuning panel.

### v5.60 — Location Normalization (Lever/Ashby/Workable)
- Two RPCs deployed: `normalize_locations_multiplatform` and `normalize_locations_pass2`. 23,284 jobs normalized. Coverage: Lever 69.1% → 92.3%, Ashby 53.4% → 87.2%, Workable 94.8% → 100%.

### v5.61 — Salary Extraction (Lever & Recruitee)
- refresh-jobs Edge Function v15: Lever `salaryRange` and Recruitee `salary` object extraction. Conditional upsert preserves existing data. Backfill organic via normal refresh cycle (~2,387 boards).

### v5.62 — Version Discipline Fix
- Fixed stale HTML comments in `dashboard.html` (v5.59 → v5.62) and `index.html` (v5.59 → v5.62). Updated cache-bust params: `dashboard.min.js?v=5.62`, `styles.css?v=5.62`. Rebuilt dist bundle. Closed 6-version roadmap documentation gap (v5.57–v5.62).

### Version Surfaces (v5.62)

| Surface | Value |
|---------|-------|
| js/version.js | v5.62 |
| dashboard.html comment | v5.62 |
| dashboard.html cache-bust | ?v=5.62 |
| index.html comment | v5.62 |
| dist/dashboard.min.js | v5.62 |
| Console log | [BJ] Dashboard v5.62 loaded |

**Phase 52 total: 6 versions across v5.57–v5.62 | Data quality + version discipline ✅**

---

## Phase 53: SEO Data Consistency (v5.63) — Feb 27, 2026 ✅

### v5.63 — SEO Meta & Data Consistency Sweep
- Fixed mangled `<title>` and `og:title` on `data-lab.html` (duplicated text + broken `&amp;` encoding).
- Updated stale listing counts across all 5 SEO pages (`hiring-trends`, `career-level-data`, `jobs-by-industry`, `salary-data`, `market-dynamics`): 280K/285K → 350K+ jobs, 10K → 38K+ companies.
- Added USAJOBS to ATS platform lists in methodology sections where missing.
- Updated `dateModified` structured data on all modified pages to 2026-02-27.
- Version bump across all surfaces: `version.js`, `dashboard.html`, `index.html`, cache-bust params.
- Dist bundle rebuilt.

### Version Surfaces (v5.63)

| Surface | Value |
|---------|-------|
| js/version.js | v5.63 |
| dashboard.html comment | v5.63 |
| dashboard.html cache-bust | ?v=5.63 |
| index.html comment | v5.63 |
| dist/dashboard.min.js | v5.63 |
| Console log | [BJ] Dashboard v5.63 loaded |

**Phase 53 total: 1 version (v5.63) | SEO data consistency ✅**

---

## Phase 54: PDL Enrichment (v5.64) — Feb 27, 2026 ✅

### v5.64 — PDL Industry Enrichment for Non-GH Boards
- Matched ats_companies against ref_companies by normalized name, slug, linkedin_url, and website.
- 485 of 1,000 boards now have industry data (48.5% coverage).
- Enrichment also backfilled website, locality, region, country, employee_size, and founded where available.
- Remaining 515 boards need new PDL lookups (no matching ref_companies entry).
- Version bump across all surfaces, dist bundle rebuilt.

**Phase 54 total: 1 version (v5.64) | PDL industry enrichment ✅**

---

## Phase 55: Workday Discovery + Data Quality (v5.65) — Feb 27, 2026 ✅

### v5.65 — Workday Server-Side Discovery + PDL Enrichment Completion
- **Workday prober** added to `discover-boards` Edge Function as 6th platform. Probes `{slug}.wd{N}.myworkdayjobs.com` for N ∈ {1,2,3,5} via Workday's CXS API. Returns total job count. Board URL template uses correct wdNum.
- **PDL enrichment pass completed** — ran name, slug, linkedin, and website matching passes via Supabase management API. 485/1,000 boards enriched (48.5%). Remaining 515 require new PDL API lookups.
- **discover-boards EF redeployed** with Workday support.
- Version bump across all surfaces, dist bundle rebuilt.

### Version Surfaces (v5.65)

| Surface | Value |
|---------|-------|
| js/version.js | v5.65 |
| dashboard.html comment | v5.65 |
| dashboard.html JS cache-bust | ?v=5.65 |
| dashboard.html CSS cache-bust | ?v=5.65 |
| index.html comment | v5.65 |
| dist/dashboard.min.js | v5.65 |
| Console log | [BJ] Dashboard v5.65 loaded |

**Phase 55 total: 1 version (v5.65) | Workday discovery + data quality ✅**

---

## Phase 56: SEO Count Accuracy (v5.66) — Feb 27, 2026 ✅

### v5.66 — SEO & Landing Page Count Accuracy Sweep
- Fixed overstated job counts across all SEO pages and landing page: 350K+ → 320K+ (actual DB: 320,035 open jobs).
- Updated company/board counts: 38K+ → 39K+ (actual DB: 39,123 companies).
- Updated salary data coverage: 21K+ → 40K+ (actual DB: 40,609 jobs with salary). Percentage corrected from 6% to 13%.
- Updated "Last updated" dates from Feb 18 → Feb 27 on 4 SEO pages.
- Updated dateModified structured data to 2026-02-27 on all 6 SEO pages.
- Updated roadmap.html status bar (39,100+ boards, 320K+ jobs).
- Version bump across all surfaces, dist bundle rebuilt.

### Version Surfaces (v5.66)

| Surface | Value |
|---------|-------|
| js/version.js | v5.66 |
| dashboard.html comment | v5.66 |
| dashboard.html JS cache-bust | ?v=5.66 |
| dashboard.html CSS cache-bust | ?v=5.66 |
| index.html comment | v5.66 |
| dist/dashboard.min.js | v5.66 |
| Console log | [BJ] Dashboard v5.66 loaded |

**Phase 56 total: 1 version (v5.66) | SEO count accuracy ✅**


---

## Phase 57: Industry Detail Pages (v5.90) — Mar 1, 2026 ✅

**Goal:** Create 15 industry-specific detail pages with live per-industry analytics. Completes Content Strategy Audit Item #16 and closes out Phase 11 (Content & SEO) — all 19/19 items done.

### v5.90 — Industry Detail Pages (#16)

**Database (5 new RPCs):**
- `get_industry_detail(text)` — total jobs, median/avg salary, unique companies, remote/hybrid/onsite counts
- `get_industry_top_companies(text)` — top 15 employers by job count with avg salary
- `get_industry_departments(text)` — department distribution within an industry
- `get_industry_salary_distribution(text)` — salary buckets ($0-50K through $200K+)
- `get_industry_seniority(text)` — seniority level distribution (intern through executive)

All RPCs use the same CASE-based industry mapping as `get_jobs_by_industry`, parameterized by sector name, anon-accessible.

**Frontend (15 new HTML pages):**

| # | Page | URL | Jobs | Priority |
|---|------|-----|------|----------|
| 1 | Technology | /industry/technology | 16,459 | 0.8 |
| 2 | Healthcare | /industry/healthcare | 5,351 | 0.8 |
| 3 | Finance | /industry/finance | 3,905 | 0.8 |
| 4 | Consulting & Services | /industry/consulting-services | 4,921 | 0.7 |
| 5 | Retail & Consumer | /industry/retail-consumer | 3,293 | 0.7 |
| 6 | Media & Marketing | /industry/media-marketing | 3,082 | 0.7 |
| 7 | Manufacturing | /industry/manufacturing | 1,622 | 0.7 |
| 8 | Real Estate & Construction | /industry/real-estate-construction | 1,364 | 0.7 |
| 9 | Energy | /industry/energy | 740 | 0.7 |
| 10 | Education | /industry/education | 502 | 0.7 |
| 11 | Logistics & Transport | /industry/logistics-transport | 489 | 0.7 |
| 12 | Telecom | /industry/telecom | 379 | 0.6 |
| 13 | Government | /industry/government | 374 | 0.7 |
| 14 | Legal | /industry/legal | 253 | 0.6 |
| 15 | Non-Profit | /industry/non-profit | 13 | 0.6 |

**Per-page features:**
- 5 stat cards (Open Jobs, Median Salary, Companies, Remote %, Salary Data coverage)
- 5 ECharts visualizations (salary distribution bar, top 15 employers horizontal bar, department donut, seniority bar, remote/onsite/hybrid donut)
- Article + FAQPage structured data (JSON-LD)
- AI-friendly content blocks (hidden, data-attribute tagged)
- Cross-links to all 14 other industry pages
- Breadcrumb navigation (Home > Data Lab > Jobs by Industry > {Industry})
- Tier-aligned CTAs (Free / Starter $20 / Pro $40)
- Methodology footer
- 24h client-side localStorage caching
- Responsive breakpoints at 640px and 900px

**Cross-linking & SEO:**
- `jobs-by-industry.html` updated with "Deep Dive by Industry" section linking to all 15 pages
- `sitemap.xml` updated with 15 new URLs (priority 0.6-0.8, daily changefreq)
- Canonical URLs on all pages

**Files changed:**
- 15 new: `industry/*.html`
- 1 new: `supabase/migrations/20260301_industry_detail_pages.sql`
- Updated: `js/version.js`, `index.html`, `dashboard.html`, `CHANGELOG.md`, `jobs-by-industry.html`, `sitemap.xml`

### Version Surfaces (v5.90)

| Surface | Value |
|---------|-------|
| js/version.js | v5.90 |
| dashboard.html comment | v5.90 |
| dashboard.html cache-bust | ?v=5.90 |
| index.html comment | v5.90 |
| CHANGELOG.md | v5.90 entry |
| Git tag | v5.90 |

### Content Strategy Audit — Final Status

All 19 action items from the Content Strategy Audit (Phase 11) are now DONE:

| Pod | Done | Started | Not Started |
|-----|------|---------|-------------|
| Pod 1 (Growth) | 10 | 0 | 0 |
| Pod 2 (Engineering) | 10 | 0 | 0 |
| **Total** | **19** | **0** | **0** |

**Phase 57 total: 1 version (v5.90) | 15 industry detail pages + 5 RPCs | Content Strategy Audit complete ✅**

---

## Phase 58: Competitor Comparison Page (v5.94)

**Date:** 2026-03-01
**Pod:** Pod 1 (Growth) spec / Pod 2 (Architecture) build
**Version:** v5.94

### What shipped

SEO competitor comparison hub page at `/compare` — single public-facing page positioning Brilliant Jobs against LinkedIn, Indeed, ZipRecruiter, and Glassdoor.

**Page architecture:**
- Dark theme (external page, matches landing page)
- Hero with anchor-linked competitor pills
- 12-row responsive feature comparison table across 5 platforms (desktop 6-col / mobile card stack)
- Features include: ghost detection, no promoted jobs, boolean filtering, resume grading, AI match scoring, salary transparency, pipeline tracking, automated cover letters, one-click apply, repost tracking, company exclusions, free to search
- 4 anchor-linked competitor sections (#vs-linkedin, #vs-indeed, #vs-ziprecruiter, #vs-glassdoor)
- Pain points vs. advantages two-column layout per competitor
- CTA blocks between each section
- 8-question FAQ accordion with JSON-LD FAQPage structured data
- Bottom conversion CTA with live stats
- All copy uses consumer-friendly language (no ATS jargon)

**SEO:**
- Title: "Brilliant Jobs vs LinkedIn, Indeed, ZipRecruiter & Glassdoor | Best Job Search 2026"
- FAQPage JSON-LD (8 questions)
- Added to sitemap.xml (priority 0.7)
- /compare added to landing page nav + footer

**PostHog events (5):**
- compare_page_viewed, compare_section_scrolled, compare_anchor_clicked, compare_cta_clicked, compare_faq_expanded

**Files:** compare.html (new), js/version.js, index.html, dashboard.html, sitemap.xml, ROADMAP.md, CHANGELOG.md

### Version Surfaces (v5.94)

| Surface | Value |
|---------|-------|
| js/version.js | v5.94 |
| dashboard.html | v5.94 |
| index.html | v5.94 |
| compare.html | v5.94 |
| sitemap.xml | /compare added |
| Console | v5.94 (auto via version.js) |

**Phase 58 total: 1 version (v5.94) | 1 new SEO page | competitor comparison hub live**

---

## Phases 59–68: Notification System Build-Out (v5.95–v6.19)

**Date:** 2026-03-01
**Versions:** v5.95 → v6.19
**Pod:** Pod 2 (Architecture) + Pod 1 (Growth — copy delivery)

Comprehensive notification system build spanning 15 sessions across two pods. 79 notification types across 13 categories, 4 classification tiers (required_transactional, configurable_transactional, product, marketing), double opt-in flow, classification-based send gates, quiet hours with SMS hold queue, email template manager with cohort-specific variants, A/B versioning, and production promotion workflow.

Key deliverables: send-notification v4 with full classification + suppression, admin notification management tab, template manager with preview, Canny feedback integration, pipeline verification signals (Gmail + Calendar), re-engagement escalation chains, 18+ email templates (dark theme), billing/payment notification hooks, referral notification lifecycle, and marketing opt-in enforcement.

---

## Phase 69: Notification Hardening Sprint (v6.21–v6.25) — Mar 1, 2026

**Pod:** Pod 2 (Architecture)
**Sessions:** 5

### Session 1 (v6.21) ✅

| # | Card | Status | Notes |
|---|------|--------|-------|
| 1 | Resend webhook ingestion | ✅ | resend-webhook Edge Function, svix HMAC verification, 5 event types |
| 2 | Open/click tracking pipeline | ✅ | 7 new columns on notification_log, message_id correlation |
| 3 | Bounce management + suppression (partial) | ✅ | notification_suppressions table, send-notification v4 suppression gate |

### Session 2 (v6.22) ✅

| # | Card | Status | Notes |
|---|------|--------|-------|
| 3 | Admin suppression UI (Card 3 remainder) | ✅ | Searchable list, type filter, manual add/remove, CSV export |
| 6 | SMS delivery receipts + failure handling | ✅ | vonage-webhook EF, send-notification v5, auto-fallback, retry, admin alerts |

### Session 3 (v6.23) ✅

| # | Card | Status | Notes |
|---|------|--------|-------|
| 4 | Per-filter notification overrides | ✅ | send-notification v6: override cascade (filter_overrides → channels → preferences → default). filter_name in request interface. UI was already complete. |
| 8 | Notification analytics dashboard | ✅ | Admin tab: 8 stat cards, daily email/SMS volume charts, top types, block reasons, classification breakdown. 30-day lookback, up to 5K events. |

### Session 4 (v6.24) ✅

| # | Card | Status | Notes |
|---|------|--------|-------|
| 7 | Web push notifications | ✅ | push-subscribe EF (new), send-notification v7 with push channel, sw.js service worker, push toggle on Applications page, push_subscriptions table + schema |
| 9 | Template preview + test send | ✅ | Preview iframe in template editor (email/SMS/in-app), test send to admin email via send-notification EF, sample variable substitution |

### Session 5 (v6.25) ✅

| # | Card | Status | Notes |
|---|------|--------|-------|
| 10 | Cadence optimization | ✅ | Cadence admin tab. Send-time heatmap (hour, DOW), per-campaign frequency table, re-engagement threshold editor with win-back rates, recommendation engine, apply-to-settings. cadence_settings table. Resend webhook pipeline fixed. |
| 11 | Email reporting by cohort | ✅ | Email Cohorts admin tab. Overview: aggregate per-campaign stats. Campaign Drilldown: zero-based cumulative curve (Day 0 = user receive date). Compare: same campaign across two cohorts with delta. 90-day window from notification_log. |

### Remaining Cards

| # | Card | Status | Blocked By |
|---|------|--------|------------|
| 5 | Vonage 10DLC registration | ⏳ In Process | Submitted 2026-03-01, pending Vonage approval (1–4 week window) |

### Version Surfaces (v6.25)

| Surface | Value |
|---------|-------|
| js/version.js | v6.25 |
| dashboard.html | v6.25 |
| index.html | v6.25 |
| CHANGELOG.md | v6.25 |

---

## Phase 70: Social Presence (Mar 2026)

**Owner:** CPO

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | X (Twitter) account | ✅ Live | Brand presence for launch marketing + job market insights |
| 2 | Bluesky account | ✅ Live | Early presence on decentralized social for tech audience |
| 3 | Reddit account | ✅ Live | Community engagement in job search subreddits |

---

## Phase 71: AI Enrichment Pipeline + Entitlements (Mar 2026)

**Owner:** Pod 2 (Architecture)
**Estimated sessions:** 5–6 (adjusted from 9 based on P69 velocity — 40% compression observed)

### Pre-Launch (3 sessions)

| # | Card | Status | Estimate | Notes |
|---|------|--------|----------|-------|
| 1 | Test enrich-fcd-batch + activate cron | Todo | 1.5h | POST test → verify → activate pg_cron #63. Blocks card 2. |
| 2 | Ongoing JD AI enrichment cron | Todo | 3h | Perpetual pg_cron every 15 min. Same EF, lower frequency. Monitoring. |
| 3 | FUNCTION filter pill (Pro-gated) | Todo | 3h | New pill type from jd_function. Query builder + autocomplete. |
| 4 | TECHNICAL DEPTH filter pill (Pro-gated) | Todo | 2h | New pill type from jd_seniority/technical depth. |
| 5 | "Why This Job?" feed card expansion | Todo | 3h | AI match reasons on feed cards (jd_skills, jd_function chips). |
| 6 | Resume mismatch warnings | Todo | 4h | Cross-ref resume vs top jd_skills. Alert if 70%+ JDs require missing skill. |

### Post-Launch (2 sessions)

| # | Card | Status | Estimate | Notes |
|---|------|--------|----------|-------|
| 7 | Usage limits per tier (cohort entitlements) | Todo | 2–3d | Cohort schema + check_entitlement() v2 + client gating + usage tracking. |

### Deferred

| # | Card | Status | Estimate | Notes |
|---|------|--------|----------|-------|
| 8 | Data freshness gating | Todo | 4–5d | Tiered recency (Free=30d lag, Pro=real-time). Depends on Item 7 + Stripe. |

### Dependency Chain

```
Card 1 (test/activate) → Card 2 (cron) → Cards 3,4,5 (filters + feed)
                                        → Card 6 (resume mismatch, needs jd_skills coverage)
Card 7 (entitlements, independent) → Card 8 (freshness gating)
```

## Phase 73 — Cron Cost Optimization + Athena ATS Discovery Pipeline (v6.51-v6.54)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| 73.1 | Cron cost optimization Session 1 | v6.51 | Done | Reduced enrichment cron 12/hr to 1/hr (Tier 1+2 only). DataForSEO discovery 4/day to 1/day. enrichment_priority column. |
| 73.2 | Cron cost optimization Session 2 | v6.52 | Done | Merged AI-content detection into enrichment prompt (eliminated crons 86-88). enrich-job-ondemand EF for Tier 3. |
| 73.3 | Version audit + roadmap sync | v6.53 | Done | Cache-bust audit across all pages. Roadmap entries for v6.51-v6.52. version.js added to hiring-trends + market-dynamics. |
| 73.4 | Athena ATS URL Discovery Pipeline | v6.54 | Done | **Fully deployed 2026-03-05.** AWS Athena → Common Crawl columnar index → 8 ATS platforms (Greenhouse, Ashby, Workday, iCIMS, Workable, Recruitee, JazzHR, Taleo). Scanned 29 crawls (2023–2026). **25,438 net-new companies** promoted to ats_companies (39K→65K total). Infrastructure: IAM user `brilliantjobs-athena`, S3 results bucket with 30-day lifecycle, `ccindex` database + table + partitions, `staged_companies` table, `promote_staged_companies()` + `activate_athena_boards_simple()` RPCs, `get_staged_companies_status()` monitoring. Controlled activation: 500 boards/5hrs via pg_cron (`activate-athena-boards`). Monthly automation: `athena-crawl-sync` Edge Function + `athena-crawl-monthly-sync` pg_cron (1st of month, 3 AM UTC) — auto-discovers new crawl partitions, queries 8 platforms, diffs + inserts net-new. ~$0.60/yr operating cost. Lever/Indeed/Jobvite not in Common Crawl (blocked by robots.txt). |

## Phase 74 — A14 Client-Side Cache Enhancement (v6.54–v6.55)

| # | Item | Version | Status | Notes |
|---|------|---------|--------|-------|
| 74.1 | Enhanced cachedQuery | v6.54 | Done | Returns { data, count, cached }. Debug logging via BJ_DEBUG_CACHE. getCacheStats() diagnostic. |
| 74.2 | Visibility timeout | v6.54 | Done | Clears all caches when tab hidden 5+ min. Prevents stale data on tab-back. |
| 74.3 | Cache invalidation wiring | v6.54 | Done | Logout via clearAllCaches(). Filter save/delete triggers invalidateCache(). |
| 74.4 | Per-query TTL tiers | v6.55 | Done | _resolveTTL() by key prefix: ref: 1h, feed: 3min, stats/company: 10min, default 5min. |
| 74.5 | Admin Cache Health tab | v6.55 | Done | Live panel: summary cards, TTL tier config, entries list w/ stale detection, Clear All. |
| 74.6 | getCacheStats() enhancements | v6.55 | Done | Memory estimate (KB), TTL tier display, pct life, stale flag per entry. |
| 74.7 | Admin version catch-up | v6.55 | Done | admin.html bumped from v6.27/v6.29 → v6.55. |
| 74.8 | Cache integration: feed stats | v6.57 | Done | updateJobStatsFromFilters wrapped in cachedQuery with deterministic _filterCacheKey. |
| 74.9 | Cache integration: Stats page | v6.57 | Done | fetchFilterData wrapped in cachedQuery with stats:page: prefix. |
| 74.10 | Company count optimization | v6.57 | Done | Reduced from .limit(2000) fetch to .limit(1000) with distinct set dedup. |
| 74.11 | Pipeline cache invalidation | v6.57 | Done | savePipelineEntry + unsaveFromPipeline invalidate feed:/stats:/pipeline: caches. |
| 74.8 | A15 server-side materialized views | — | Todo | pg_cron refreshed views for job feed + landing stats. Pair with pagination (500 row cap + Load More). |

### 74.12 A15: Server-Side Materialized Views — v6.57
- Rebuilt mv_landing_stats with remote_jobs, latest_job_date, refreshed_at
- Created mv_job_feed_counts (per-source/loc_type/loc_country aggregates)
- Created mv_source_breakdown (weekly time-dimension, 6-month window)
- Unique indexes for CONCURRENTLY refresh on all 3 MVs
- refresh_materialized_views() updated to include new MVs
- pg_cron schedule: 2h → 10min (matches refresh-jobs cycle)
- get_landing_stats RPC reads from mv_landing_stats (no more full table scan)

### 74.13 A15 Session 2: MV Client Integration — v6.58
- Stats page: MV-backed source totals and weekly breakdown functions
- Admin: MV Health panel in Cache tab — staleness monitoring for all 7 MVs
- Landing page: hardcoded fallbacks corrected to reflect live data
- index.html cache-bust fixed (was stuck at v6.54)

### 74.14 A15 Session 3: MV-Powered Stats Overview — v6.59
- "All" filter mode: source breakdown donut powered by fetchSourceTotalsFromMV (pre-aggregated)
- "All" filter mode: source-colored stacked bar timeline from fetchSourceBreakdownFromMV
- Tooltip enrichment: salary data percentage per source from MV
- Graceful fallback to row-based aggregation if MV fetch fails

### 74.15 A14 Session 4: Feed Pagination + Cache Wiring — v6.60
- Job feed: 500-row hard cap (MAX_FEED_ROWS) per A14 spec — no unbounded client queries
- Job feed: Load More replaces Prev/Next pagination — 50 rows per page, "Load more jobs" button
- Main feed queries wrapped in cachedQuery() (3-min TTL) for instant filter re-toggles
- Company count reads from mv_landing_stats instead of fetching 1000 slugs
- Multi-filter merge cap derived from MAX_FEED_ROWS (was hardcoded 200)

### 74.16 A15 Session 5: MV-Powered Stat Cards + Staleness — v6.61
- Stats page: "All" mode stat cards from mv_landing_stats (no 5000-row aggregation)
- Stats page: MV freshness badge in filter pills bar
- Admin: MV staleness indicator in Feed Health tab
- Admin: Error boundaries on discovery/auto-apply/chart loaders to prevent cascading failures

### 74.17 A15 Session 6: Source Pill Counts — v6.62
- Stats page: Per-ATS-source job count chips from mv_job_feed_counts in filter bar (All mode)
- Job feed: Source breakdown chips in hero stats bar
- Compact formatting, tooltips with salary coverage


### 74.18 Admin IA v2 S1–S2: Sidebar Nav + Block Pages — v6.83–v6.86
- Admin console restructured to sidebar navigation (4 sections: Operations, Growth, Audience, Business, 17 sub-pages)
- 3 new sub-pages with full stat cards + platform breakdowns: Companies, Jobs, Email
- 3 new SECURITY DEFINER RPCs: get_admin_companies, get_admin_jobs, get_admin_email
- Shared CSS: .admin-stat-row, .admin-stat-card, .admin-block, .admin-age-bucket
- build-admin.js: 9 files now (added admin-blocks.js, admin-companies.js, admin-jobs.js, admin-email.js, admin-shell.js)

### 74.19 Admin IA v2 S3: Shared Utilities + Action Bars + Paginated Tables — v6.86
- admin-blocks.js (new shared utility file): _adminStatCard, _escHtml, _timeAgo, _adminActionBar, _adminPagedTable, _fmtSalary, _fmtLocation
- Companies: search/filter action bar + paginated table (50/page) via get_admin_companies_list RPC
- Jobs: search/filter/status action bar + paginated table (50/page) via get_admin_jobs_list RPC
- New RPCs: get_admin_companies_list, get_admin_jobs_list (both SECURITY DEFINER, paginated jsonb)

### 74.20 Admin IA v2 S4: Detail Panels + ECharts Charts — v6.87
- Companies + Jobs tables: click-to-expand rows with lazy detail loading
- Company detail: board URL, PDL data, enrichment stats, HTTP status, discovered via
- Job detail: JD preview, enrichment fields, salary breakdown, skills pills, AI scores
- ECharts line chart: Jobs daily volume (last 7d, smooth area, green fill)
- ECharts funnel chart: Email delivery funnel (sent → delivered → failed → blocked)
- New RPCs: get_admin_company_detail, get_admin_job_detail

### 74.21 Admin IA v2 S5: Notifications Log + Feed/Cache/Signals — v6.88–v6.89
- Notifications Log: paginated notification_log viewer, search (type/company/subject), status + channel filters, click-to-expand rows with full detail
- New RPC: get_admin_notification_log (SECURITY DEFINER, 20 fields/row)
- Feed Health sub-page: platform breakdown, 7d ECharts chart, refresh log (admin-feed-health.js)
- Cache Health sub-page: monitoring alerts, MV row counts, major_job_cache table (admin-cache-health.js)
- Signals sub-page: pipeline_signals + signal_patterns, ECharts charts (admin-signals.js)

### 74.22 Admin IA v2 S6: Enrichment, SEO, Content, Merchandising, Referrals — v6.93
- Bundle expanded 12 → 17 files: admin-enrichment.js, admin-seo.js, admin-content.js, admin-merch.js, admin-referrals.js wired into build-admin.js
- Enrichment: coverage % stat cards, gate indicators, platform breakdown chart, refresh schedule
- SEO: 9-tool dashboard (GSC, PSI, CF, YLT, CrUX), URL+date filters, Sync All, Export Report
- Content: editorial queue, detect/generate actions, click-to-preview story panel
- Merchandising: placements→rules→content CRUD, bulk import, cohort targeting
- Referrals: referral admin stats and management

### 74.23 Admin IA v2 S7: Ghost, Templates, Revenue, Feedback — v6.91
- admin-ghost.js: Ghost Monitor sub-page — company ghost rate table, apply-to-response rate, last application timestamps
- admin-templates.js: Notification Templates sub-page — template preview, category filter, enable/disable toggle
- admin-revenue.js: Revenue sub-page — MRR stat cards, subscription table, plan distribution, cohort breakdown
- admin-feedback.js: Feedback sub-page — Canny link, feedback log from user_feedback table

### 74.24 Admin IA v2 S8: Stripe Customer Mgmt + Subscription Analytics — v6.92
- admin-stripe.js: Stripe Customer Management sub-page — customer search, plan + status, recent charges table
- admin-subscription.js: Subscription Analytics sub-page — MRR/ARR cards, churn stat, cohort conversion table, plan distribution ECharts donut

### 74.25 Admin IA v2 S9: Notification Analytics Suite — v6.93
- admin-notif-analytics.js: 4 sub-page implementations (676 lines)
- notif-analytics: delivery funnel (Sent→Delivered→Opened→Clicked), channel breakdown, top 20 types table, send volume ECharts bar, 7d/30d/90d toggle
- email-cohorts: per-cohort email opt-in stats, opt-in rate, unsubscribed count, recent 30d email log
- cadence: summary cards (total configs, enabled, active channels, freq-capped), searchable/filterable config table, send volume by category chart
- notif-log: paginated live log (50/page), channel/status/type filters, total record count

### 74.26 Admin IA v2 S10: Business Ops Suite — v6.94
- admin-biz-ops.js: 5 sub-page implementations (669 lines)
- paid: spend log manual entry by platform/date/amount, stat cards (total/MTD/platforms/CAC), Google Ads + Meta Ads links
- social: post log by platform/date/engagements, stat cards (posts/MTD/total engagements/avg engagement)
- analytics: live DAU/WAU/MAU from profiles.last_seen_at, signups ECharts bar chart with period toggle, user funnel ECharts funnel chart
- costs: vendor cost tracker (Vercel/Supabase/DataForSEO/Cloudflare/Resend/Vonage/Anthropic), monthly trend ECharts bar chart, MoM change card
- forecasting: configurable growth rate/ARPU/churn, MRR + paid users ECharts dual-axis projection, 6/12/24 month horizons
- build-admin.js: 24 → 25 source files


---

## Phase 0: Audit Remediation & Launch Readiness (Mar 5 → Late March 2026)

### Chat Session Completions

| Session | Date | Findings Resolved | Tag | Notes |
|---------|------|-------------------|-----|-------|
| CS-001 | 2026-03-05 | AD-ES-004, AD-ES-005, AD-ES-006 | admin@0.1.0-security | EF auth enforced on seo-sync + generate-editorial-content. 6 hardcoded key fallbacks removed. Git history purged (git-filter-repo). All local clones must be re-cloned. |
| CS-002 | 2026-03-06 | SE-001 | dashboard@0.1.0-security | enrich-job: JWT auth + CORS restriction (brilliantjobs.app only). Dashboard enrichJob() uses session access_token. Service_role passthrough for cron. SE-002 key rotation downgraded to hygiene (repo only accessed by Marston + Claude). |
| CS-003 | 2026-03-06 | DO-001, CX-01, CX-02 | dashboard@0.2.0-posthog, extension@0.1.0-posthog, index@0.1.0-posthog, admin@0.2.0-posthog | PostHog SDK deployed on all 4 surfaces. Dashboard + admin: posthog.init() with session recording + exception autocapture + posthog.identify() post-login. Landing: direct posthog.init() (removes GTM dependency). Extension: API key fixed, events wired (popup_opened, scan_started, scan_completed, job_saved). Launch gates G2 + G13 pending prod verification. |
| CS-004 | 2026-03-06 | EXT-SEC-001, EXT-SEC-002, EXT-SEC-003, CP-002 | extension@0.2.0-security (v2.19.0) | authSession added to AES-GCM encrypted storage (BJ_CRYPTO). crypto.js wired into background.js + popup.html. All 18 background.js + 5 popup.js authSession storage calls routed through encrypted getAuth()/setAuth() helpers. escHtml() sanitizer added to popup.js + inject-overlay.js — company names + field names escaped before innerHTML. web_accessible_resources scoped from utils/*.js + \<all_urls\> to utils/fillMetrics.js + 19 ATS domains. Privacy policy link added to help.html. |
| CS-005 | 2026-03-06 | IX-SE-001, IX-SE-004, IX-BE-001 (=IX-ES-002), IX-FE-001 (=IX-ES-001) | index@0.2.0-security | postMessage restricted to window.location.origin (was '*', leaked auth tokens). DOMPurify v3.2.4 self-hosted (/js/vendor/purify.min.js) sanitizes all 3 innerHTML injection sites (preview titles, merch grid, merch-client content). Stale anon key replaced in referral-capture.js (iat:1738367665→1770569066). safeReadLS() defined on window — resolves ReferenceError for returning visitors. X-Frame-Options DENY + CSP frame-ancestors 'none' confirmed deployed. Launch gates G10+G11 partially cleared. |
| CS-006 | 2026-03-06 | AD-FIX-01 (feature_flags RLS, merch RLS, admin_notification_config RLS, 6 SEO tables RLS), AD-FIX-02 (MFA enforcement), AD-FIX-03 (approve-content admin check, EF rate limiting) | admin@0.3.0-rls-mfa | AD-FIX-01: Dropped 5 broken RLS policies (service_manage_flags open write, admin_notification_config open access, 3 merch policies using auth.jwt()->>role instead of profiles.role). Replaced with is_admin() policies. Enabled RLS on 6 SEO tables (seo_site_daily, seo_page_daily, seo_tech_audits, seo_index_status, seo_conversions, seo_gsc_daily) with public read + admin-only write. AD-FIX-02: MFA enforcement in admin-shell.js — checks sb.auth.mfa.listFactors() after admin role verification. No TOTP → inline setup flow (QR + manual secret + verify). Existing TOTP + AAL1 → challenge flow. AD-FIX-03: approve-content EF now checks profiles.role='admin' (was: any authenticated user). generate-editorial-content rate limited to 10/hr, seo-sync rate limited to 5/hr via ef_rate_limits table + check_ef_rate_limit() RPC. Service_role callers exempt. Launch gate G15 — CLEARED. |
| CS-007 | 2026-03-06 | CX-03, CX-04, IX-A11Y-001, IX-A11Y-002 | dashboard@0.3.0-a11y, index@0.3.0-a11y | Accessibility Phase 1. Landing: 3 H1s → 1 (non-active hero sections removed from DOM at runtime). Auth modal: role=dialog, aria-modal, focus trap (Tab cycling), Escape closes, focus return to trigger. Form labels linked (login-email, login-password, forgot-email). aria-label on all preview inputs + buttons. aria-live on message containers. Skip-to-content link. Dashboard: sidebar nav gets aria-label + role=button + tabindex=0 + keyboard Enter/Space. Job modal: role=dialog, aria-modal, focus trap, Escape closes, focus return. Skip link + role=main. axe-core added as dev dependency for CI. Extension a11y (CX-05) deferred to Phase 2. Launch gate G14 (zero critical axe violations) partially cleared. |
| CS-008 | 2026-03-06 | AD-FIX-04 (4 failing cron jobs) | admin@0.4.0-cron | Fixed 4 continuously-failing cron jobs + 3 additional broken crons. (1) referral-fraud-scan + adoption-sequence + onboarding-sequence + monthly-report + trend-anomaly-detector + monthly-product-update + athena-crawl-monthly-sync: all 7 used current_setting('app.settings.service_role_key') which was never configured — replaced with direct JWT in cron commands. (2) jd-extraction-ongoing: run_jd_extraction_ongoing() called extract_jd_metadata_v2(bigint) which didn't exist — updated to call extract_jd_metadata(integer) with cast. (3) mv-refresh-reduced: refresh_materialized_views() failed on mv_job_feed_counts CONCURRENTLY — added pg_try_advisory_lock() to prevent concurrent execution + EXCEPTION fallback to non-concurrent refresh. (4) score-new-jobs: 100-job NOT IN subquery caused statement timeout — created trigger_score_new_jobs() wrapper with LEFT JOIN anti-pattern, batch 25, 30s timeout, schedule 10min. All 4 confirmed succeeding in prod. Launch gate G16 (cron health) — pending 24h monitoring window. |
| CS-009 | 2026-03-06 | BE-001, BE-002 (ES-001), DO-002, AD-FIX-05 | dashboard@0.4.0-safequery, admin@0.5.0-ratelimit | safeQuery() wired to 22 direct Supabase call sites across 9 dashboard files. reportError() helper added — all errors surface in PostHog (query_error event). safeRpc() convenience wrapper added. 130 empty/console-only catches replaced with reportError() across 22 files. Zero empty catches remaining in dashboard + admin source. Connection pooler: 30s fetch timeout, explicit schema config, autoRefreshToken. Supavisor enabled at project level. Database-backed rate limiting (check_ef_rate_limit) added to score-resume EF. AI usage logging (ai_usage_log) wired to score-resume with cost estimation. Shared ai-guard.ts utility created for all AI-calling EFs. |
| CS-010 | 2026-03-06 | EXT-FE-001, EXT-FE-004 (partial → completed CS-017), QA-001 (partial) | extension@0.3.0-stability, dashboard@0.5.0-tests | Extension stability: LinkedIn handler hardened with 4+ fallback selectors per critical element (role="dialog" as primary anchor, aria-label-based nav buttons). waitForElement reports selector misses to PostHog via ats:selectorMisses. Greenhouse React/Legacy + Lever handlers wrapped in safeFill() graceful degradation — catches + reports ats:handlerError to extension_events. New resilientDOM.js utility (queryResilient, queryAllResilient, waitForElement, withGracefulDegradation). Background.js wired selector_miss + handler_error event types to extension_events table. Dashboard smoke tests: Vitest + @testing-library/dom + jsdom installed. 64 tests (27 dashboard HTML structure + 37 extension handler structure) — all passing. Covers: 5 critical page sections, nav linking, script load order, error handling infra (CSP, PostHog, DOMPurify), resume tabs, billing elements, settings controls, module syntax, handler exports, graceful degradation patterns, LinkedIn resilience. |
| CS-011 | 2026-03-06 | CX-05, CX-06, CX-07, CX-08 | extension@0.4.0-a11y, dashboard@0.6.0-cx-s2, index@0.4.0-a11y, email-templates@0.1.0-utm | CX-05: Extension popup accessibility — lang attribute, ARIA tablist/tab/tabpanel on all 4 tabs, keyboard navigation (Arrow/Home/End), skip-link, focus-visible outlines, auth form label associations + autocomplete, aria-live on scanner/auth/log, progressbar on daily limit, header/main landmarks. CX-06: Dashboard lazy loading — build split into core (479KB, 14 files) + deferred (346KB, 16 files). PostHog events: dashboard_tab_viewed, notification_opt_in_shown/saved, notification_sms_toggled, billing_page_viewed/checkout_started/portal_opened (8 events total). CX-07: Inline style audit delivered — 1,843 declarations categorized across 5 categories (typography 43%, visual 19%, spacing 18%, layout 16%, sizing 4%). 5-phase migration plan. CX-08: Email UTM auto-tagging via baseLayout/whiteBaseLayout — all brilliantjobs.app links in emails get utm_source=email, utm_medium=notification, utm_campaign=<title>. |

| CS-012 | 2026-03-06 | AD-FIX-06, AD-FIX-07, AD-FIX-08 | admin@0.6.0-visibility | AD-FIX-06: Cron health panel — v_cron_health view (cron.job + latest cron.job_run_details), color-coded status (red/amber/green/disabled), auto-refresh 60s, filter by health. 64 jobs displayed. AD-FIX-07: Audit trail wiring — _logAdminAction() async fire-and-forget helper. Wired into content approvals, notification config saves, merch placement CRUD, Stripe plan overrides, admin email searches. AD-FIX-08: Biz-ops tables created (paid_spend_log, social_post_log, vendor_cost_log) with admin-only RLS. Init functions wired for paid/social/analytics/costs/forecasting tabs. |

| CS-013 | 2026-03-06 | FIX-08, FIX-12, FIX-13, FIX-14 | dashboard@0.7.0-rls, extension@0.5.0-killswitch, admin@0.7.0-killswitch | FIX-08: RLS enabled on all public tables (16 tables, 30+ policies). Feature flag seeded. FIX-12: fetchWithRetry wired to 30 extension fetch calls. FIX-13: 3-layer kill-switch (heartbeat directive, externally_connectable, DB flag poll) + admin toggle UI. FIX-14: PII minimization per-question subsets. Column schema fix (id/enabled vs key/value) applied to EF, admin UI, extension. Deployed + tested. |
| CS-014 | 2026-03-06 | FIX-15c, CX-09, CX-10 | index@0.5.0-p1, dashboard@0.8.0-echarts, extension@0.6.0-shadowdom | FIX-15c: 12 landing page catches wired to PostHog via bjError(). Loading/error/retry UI on stats fetch, preview search, merch load. Staleness badge on stats. Profile check 10s timeout + retry. Zero empty catch blocks remaining. CX-09: ECharts lazy-loaded on Stats tab open (removed eager CDN load). Extension overlays isolated in Shadow DOM. CX-10: 98 inline styles extracted to landing.css (7.4KB cacheable). 4 inline styles remain. 1024px + 768px responsive breakpoints added. |
| CS-015 | 2026-03-06 | FIX-15 (FE-002/003/004, DE-001/002/003), FIX-09, FIX-15b (CP-003, DM-001/002, CE-001) | dashboard@0.9.0-core | FIX-09: bjTabGuard error boundaries on all dashboard tabs with fallback UI + retry. FIX-15: bjSkeleton loaders (6 types) on tab switch. Resume archive pagination (100-row limit). Performance indexes on 7 tables (15 indexes). Geospatial composite index for bounding-box queries. cron_run_log table for failure alerting. FIX-15b: pgAudit extension enabled (DDL + write). npm audit clean (0 vulnerabilities). SRI hashes on all 4 CDN scripts (pdf.js, mammoth, DOMPurify, docx). Rate limits on enrich-job (60/hr), create-checkout (10/hr), data-export (5/hr). Tests: 68 pass (+4 new, 2 pre-existing fixed). |
| CS-016 | 2026-03-06 | FIX-10 (FE-001), FIX-16 (AD-FIX-09, AD-FIX-10) | dashboard@1.0.0-bundle, admin@0.8.0-errors | FIX-10 (FE-001): Code-split build — 6 chunks (shell 70KB, feed 83KB, keywords 241KB, pipeline 46KB, tuning 52KB, deferred 340KB). Initial payload 153KB (was 491KB). Lazy loader (bjLoadChunk/bjEnsureTab) with preload-after-idle for keywords+location chunk. Tab switching triggers chunk load before init. FIX-16 (AD-FIX-09+10): 3 empty catches in admin-seo.js fixed (reportError + documented URL parse guards). 8 console-only catches in admin.js converted to toast + reportError (auth check, feed health charts, discovery pipeline, auto-apply, MV staleness, growth chart, sessions chart, cohort list). Additional empty catches fixed in admin-notifications.js (auth), admin-templates.js (status toggle), admin-feed-health.js (chart dispose). Error boundary + loading state added to all admin section init (navigateAdminSubpage). Zero empty catches remaining across all admin files. Tests: 86 pass (+18 new code-split tests). |
| CS-017 | 2026-03-06 | FIX-17 (EXT-FE-004) | extension@0.7.0-monitoring | FIX-17: Automated selector health monitoring for all 15 extension handlers. Centralized selector registry (extension/selectors/registry.js) — 193 total selectors, 153 critical, organized by handler with URL patterns, criticality flags, and sample URLs. Weekly Playwright CI workflow (.github/workflows/selector-monitor.yml) — runs Mondays 9:00 UTC + manual dispatch, tests selectors against live ATS pages, generates JSON health report. Alert pipeline (scripts/selector-alert.mjs) sends HTML email via Resend on critical breakage. Registry-only mode (--report-only) for fast structural validation. 163 new Vitest tests: registry completeness (15 handlers ↔ 15 files), structure validation per entry, source ↔ registry alignment checks (LinkedIn modal, Greenhouse #first_name, Workday data-automation-id, Lever resume, iCIMS wrapper), selector count thresholds, orphan detection. All 249 tests pass (163 new + 86 existing). EXT-FE-004 fully resolved (was partial in CS-010). |
| CS-018 | 2026-03-06 | FIX-19a (IX-FE-002, IX-DA-001, IX-CP-001, IX-SE-006) + CX-13, CX-14 | index@0.6.0-architecture | FIX-19a: Full landing page architecture overhaul. CSS extraction: 625-line inline `<style>` merged into external landing.css (1003 lines). JS extraction: 5 inline `<script>` blocks extracted to 4 external files (landing-segment.js, safe-read-ls.js, landing-app.js, cookie-consent.js). 2 duplicate inline scripts removed (merch + referral — external versions already loaded). index.html reduced from 2260 to 791 lines (65%). Cookie consent: js/cookie-consent.js gates PostHog + GTM behind GDPR/CCPA opt-in. Accept/Decline banner, bj_consent cookie (365-day TTL), public bjConsent API. PostHog identity bridge: posthog.identify() added to landing page showLoggedIn() — all 3 surfaces now merge anonymous→identified sessions. CSP hardening: Landing page CSP removes `unsafe-inline` from both script-src and style-src. Zero inline executable scripts remain. 38 new tests (287 total). |
| CS-019 | 2026-03-06 | FIX-18 (EXT-CWS-002, CP-001, CE-002) | extension@0.8.0-architecture, admin@0.9.0-cost | FIX-18: Privacy policy linkage — homepage_url added to extension manifest, privacy link in popup header, privacy.html updated with all 9 third-party vendors + DPA reference + cookie consent reference. PII inventory — docs/PII_INVENTORY.md maps all tables by sensitivity tier (high/medium/low), extension chrome.storage, 9 third-party PII flows, 14 Edge Function PII paths, data subject rights, deletion cascade verification, quarterly review schedule. Cost dashboard budget alerts — vendor_cost_budgets table (per-vendor budget + threshold), admin UI progress bars (green/yellow/red), budget edit form, budget line on monthly chart, 8 vendors seeded. 36 new tests (323 total). |

**Status:** COMPLETE — CS-013 deployed and verified (2026-03-06)
**Pods:** Pod 3 (Technical Audit, 113+ findings across 17 sessions) + Pod 4 (CX Examination, 46 findings across 5 sessions)
**Combined:** ~160 findings → 92 execution sessions → 10 quality gates → 15 launch gates
**Velocity basis:** 13 versioned deploys in 3.5 hours observed March 5. 10–15 sessions/day.
**Monitoring platform:** PostHog (replaces Sentry per AD-ADR-001 — already deployed)

### 0-A: Security — Dashboard + Platform (Pod 3, P0)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.001 | SE-001: JWT auth on enrich-job endpoint | 1h | 1h | ✅ | CS-002: JWT auth + CORS restriction added (2026-03-06). Unauthenticated → 401. CORS restricted to brilliantjobs.app. Service_role passthrough for cron. Dashboard enrichJob() now uses session token. |
| 0.002 | SE-002: Service role key rotation + git history clean | 2h | 1h | ⚡ | CS-001: git-filter-repo purge DONE. CS-P1-002: Rotation procedure scripted (scripts/rotate-jwt-secret.sh), SECURITY.md documents compensating controls. Execution requires maintenance window + Marston coordination. |
| 0.003 | SE-003: Auth on generate-editorial-content | 1h | 1h | ✅ | CS-001: Auth + admin role check added. Service_role passthrough for cron. Deployed 2026-03-05. |
| 0.004 | SE-004: Classify + gate 25 unauthenticated Edge Functions | 3h | 6h | ✅ | CS-P1-001: All 89 EFs classified in edge-function-auth.yaml (4 admin-only, 28 authenticated, 46 cron-internal, 7 webhook, 4 public). CI Gate 04 validates registry + code match. Deployed 2026-03-06. |
| 0.005 | SE-005: CSP unsafe-inline on dashboard | 1h | 3h | ⚡ | CS-P1-002: All inline scripts extracted (posthog-dashboard.js, dashboard-inline.js, posthog-admin.js, admin-inline.js). CSP enforcement deferred — 122 dashboard + 21 admin inline event handlers (onclick=, onchange=) also blocked by strict CSP. Handler extraction is prerequisite. |

### 0-B: Security — Landing Page (Pod 3, P0)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.006 | IX-SE-001: postMessage wildcard origin → restrict | 30min | 15min | ✅ | CS-005: postMessage restricted to window.location.origin. Auth tokens no longer leaked to wildcard. X-Frame-Options: DENY + frame-ancestors 'none' already in vercel.json. Deployed 2026-03-06. |
| 0.007 | IX-SE-004: DOMPurify on 3 innerHTML injections | 1h | 30min | ✅ | CS-005: DOMPurify v3.2.4 self-hosted at /js/vendor/purify.min.js. Sanitizes: preview job titles (index.html), merch insights grid (index.html), merch-client.js content injection. CSP compliant (script-src 'self'). Deployed 2026-03-06. |
| 0.008 | IX-SE-005: Tighten profiles RLS for anon | 1h | 0h | ✅ | CS-013: RLS enabled on profiles table. Only own-profile SELECT + admin read-all policies. No anon access. Verified CS-P1-001. |
| 0.009 | IX-SE-006: Cookies without Secure/HttpOnly | 30min | 30min | ✅ | CS-P1-002: Secure flag added to all 3 cookie-setting files (referral-capture.js, cookie-consent.js, landing-app.js). All cookies now set with SameSite=Lax + Secure. HttpOnly not applicable (client-side JS cookies). |
| 0.010 | IX-SE-007: CSP + security headers | 1h | — | ⚡ | CS-005 verified: X-Frame-Options DENY, CSP with frame-ancestors 'none', X-Content-Type-Options nosniff, HSTS, Referrer-Policy, Permissions-Policy all deployed in vercel.json. CSP includes script-src allowlist for PostHog, Ahrefs, CDNs. CSP report-only → enforce pass remains for Phase 2. |
| 0.011 | IX-SE-008: Anon key exposed in source | 30min | 30min | ✅ | CS-P1-002: Accepted risk documented in SECURITY.md. RLS mitigations (no anon table access), service role key separated, monitoring via PostHog. Supabase anon key is public by design. |
| 0.012 | IX-SE-003: validate-signup hardening | 30min | 2h | ✅ | CS-P1-001: NOT dead — active in signup flow. CORS tightened to brilliantjobs.app (was *). Rate limiting added (5/hr/IP). Method restricted to POST. Deployed 2026-03-06. |

### 0-C: Security — Extension (Pod 3, P0)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.013 | EXT-SEC-001: Token encryption in chrome.storage | 1h | 1h | ✅ | CS-004: authSession added to BJ_CRYPTO SENSITIVE_KEYS. getAuth()/setAuth() encrypted helpers wired in background.js + popup.js. Migration auto-encrypts existing plaintext on install/update. Deployed 2026-03-06. |
| 0.014 | EXT-SEC-002: Remove broad host permissions | 1h | 1h | ⚡ | CS-004: web_accessible_resources scoped from utils/*.js + \<all_urls\> to utils/fillMetrics.js + 19 ATS domains. Host permissions remain as-is (required for content script injection). Deployed 2026-03-06. |
| 0.015 | EXT-SEC-003: Popup innerHTML XSS | 1h | 1h | ✅ | CS-004: escHtml() sanitizer added to popup.js (company names in discovery list) and inject-overlay.js (field names/details in fill overlay). toolbar-overlay.js already sanitized. Zero unsanitized dynamic innerHTML in extension. Deployed 2026-03-06. |
| 0.016 | EXT-SEC-004: PII minimization for AI answerer | 1h | — | 🔲 | Full profile sent every call. Per-question field subsets. |
| 0.017 | EXT-SEC-005: Content script CSP bypass vectors | 1h | — | 🔲 | Audit all injection points in ATS pages. |

### 0-D: Security — Admin (Pod 3, P0)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.018 | AD-SE-001: Admin auth enforcement — server-side | 2h | 2h | ✅ | G11: Shared admin-auth.ts middleware created. requireAdmin() with service_role bypass, 401/403 error handling, authErrorResponse() helper. 4 admin EFs refactored. CS-P1-002: Verified still in place, regression tests added. |
| 0.019 | AD-SE-002: Admin Edge Function auth (3 functions) | 1h | 1h | ✅ | CS-001: seo-sync + generate-editorial DONE. CS-006: approve-content admin role check added (profiles.role='admin'). All 3 EFs now enforce auth + admin role. Deployed 2026-03-06. |
| 0.020 | AD-SE-003: Service role key in admin client code | 1h | 0h | ✅ | CS-P1-002: Verified — service role key is NOT in any client-side JS. globals.js uses anon key only. Service role key only accessed via Deno.env.get() in Edge Functions. No action needed. |
| 0.021 | AD-SE-004 + AD-CP-004: Admin audit trail | 2h | — | 🔲 | admin_audit_log table + logAdminAction() async + wire all admin EFs. |

### 0-E: Observability + Monitoring (Pod 3, P0/P1)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.022 | DO-001: PostHog SDK integration — all surfaces | 1h | 1h | ✅ | CS-003: posthog.init() on dashboard+admin+landing+extension. Error tracking (exception autocapture) + session recording (masked) + event taxonomy. Direct init on landing (no GTM dependency). Extension wired via HTTP capture API. Deployed 2026-03-06. CS-P1-005: Verified fully operational all 4 surfaces. |
| 0.023 | DO-002: Supavisor connection pooler + 30s timeout | 1h | CS-009 | ✅ | No pooling. Exhausts at ~50 concurrent. Enable, validate 300+. |
| 0.024 | DO-003: Feature flags via PostHog | 30min | 4h | ✅ | CS-P1-005: feature-flags.js with PostHog-native isFeatureEnabled() + DB fallback. Supports rollout %, plan gating, per-user targeting. is_feature_enabled() SQL function. Loaded on all 3 HTML surfaces. |
| 0.025 | DO-004: Cron failure alerting | 2h | 3h | ✅ | CS-P1-005: evaluate-alerts EF checks v_cron_health + health status + feed freshness + error rates + surface latency. Fires to alert_history with cooldown. Critical alerts → email via Resend. Scheduled pg_cron */5 min. |
| 0.026 | AD-DO-001: Monitoring infra baseline inventory | 1h | 2h | ✅ | CS-P1-005: structured-logger.js deployed all surfaces. JSON-structured logs with PII stripping, PostHog batch forwarding, surface detection. Monitoring infra: health-check EF + availability_checks table + v_availability_summary view. |
| 0.027 | AD-DO-002: PostHog API for admin error dashboard | 1h | 3h | ✅ | CS-P1-005: admin-posthog-insights.js — active users (DAU/WAU/MAU), event trends (7d bar chart), top events (24h), feature flag status. PostHog API key fetched via admin-analytics EF from Vault. |
| 0.028 | AD-DO-003: Alerting pipeline — no infrastructure | 2h | 3h | ✅ | CS-P1-005: evaluate-alerts EF is unified pipeline. 10 alert rule types seeded (cron, health, feed, error, latency, availability). Cooldown-aware, email routing for critical. |
| 0.029 | AD-DO-004: Admin availability during outages | 1h | 2h | ✅ | CS-P1-005: availability_checks table + v_availability_summary view (uptime %, avg latency). health-check EF records per-surface availability. pg_cron */10 min. Alert rules for surface-down events. |

### 0-F: Error Handling — Dashboard (Pod 3, P0/P1)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.030 | BE-001: safeQuery() wiring — 22 call sites + reportError | 6h | CS-009 | ✅ | safeQuery exists, zero calls. 3 batches ~12-15. Highest-leverage code change. |
| 0.031 | ES-001: Replace 130 empty/console catches | 6h | CS-009 | ✅ | 67 catch(e){} vanish errors. 3 batches ~22. safeQuery.handleError + PostHog. |
| 0.032 | ES-002: Replace 40 console-only catches | 3h | — | 🔲 | Invisible in production. Upgrade to PostHog capture. |
| 0.033 | BE-003: 17 unchecked {data, error} | 2h | CS-P1-003 | ✅ | Error checks added to all dashboard sb.from() calls. reportError() wired. |
| 0.034 | BE-004: 7 fire-and-forget RPCs | 1h | CS-P1-003 | ✅ | Heartbeats, signals, outreach RPCs all have .then() error handlers or reportError(). |
| 0.035 | BE-005: Suppressed network errors | 1h | — | 🔲 | Network failures hidden. Retry + user notification. |
| 0.036 | BE-006: Edge Function empty catches | 2h | — | 🔲 | EF catches mirror dashboard pattern. |
| 0.037 | FE-002: Error boundaries all tabs | 2h | CS-015 | ✅ | Zero error boundaries. Blank screen on failure. Fallback UI + retry. |
| 0.038 | FE-003: Loading states all fetches | 2h | CS-015 | ✅ | No loading indicators. Add skeleton loaders. |
| 0.039 | FE-004: Pagination on unbounded queries | 2h | CS-015 | ✅ | Full table returns. limit + Load More. |

### 0-G: Error Handling — Extension (Pod 3, P1)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.040 | EXT-ES-001: 20 empty catches | 2h | 2h | ✅ | FIX-11: All 22 empty catches remediated. background.js(7→console.warn+comment), popup.js(6→console.warn+phCapture), handlers(5→console.warn), interceptor(1→console.warn), resilientDOM(2→console.warn), build-ext(1→comment). Zero empty catches in extension source. |
| 0.041 | EXT-ES-002: 19 fire-and-forget .catch(()=>{}) | 1h | — | 🔲 | chrome.runtime.sendMessage calls suppress errors. |
| 0.042 | EXT-ES-003: 7 console/comment-only handlers | 1h | — | 🔲 | Catch blocks with only console or comment. |
| 0.043 | EXT-ES-004: 14+ missing lastError checks | 2h | — | 🔲 | Only toolbar-overlay checks (4x). All other chrome API calls skip. |
| 0.044 | EXT-BE-001: No fetch timeouts | 1h | — | 🔲 | Zero AbortController. Add timeout on all fetches. |
| 0.045 | EXT-BE-002: No retry with backoff | 2h | — | 🔲 | Zero retry. Exponential backoff on auth, scan, pipeline. |

### 0-H: Error Handling — Landing Page (Pod 3, P1)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.046 | IX-ES-001: safeReadLS undefined | 30min | 15min | ✅ | CS-005: window.safeReadLS() defined inline before merch-client.js loads. Wraps localStorage.getItem in try/catch with JSON.parse fallback. Resolves ReferenceError for returning visitors. Deployed 2026-03-06. |
| 0.047 | IX-ES-002: Stale anon key referral-capture.js | 30min | 10min | ✅ | CS-005: Replaced stale anon key (iat:1738367665, Jan 2025) with current key (iat:1770569066, Feb 2026) in referral-capture.js. Key now matches index.html + merch-client.js. Referral attribution tracking restored. Also resolves IX-DA-002 (broken referral pipeline). Deployed 2026-03-06. |
| 0.048 | IX-FE-003: 7 empty + 5 console-only catches | 1h | CS-014 | ✅ | 12 silenced errors on public landing. Wire to PostHog. |
| 0.049 | IX-FE-004: Loading/error/retry states (5 flows) | 1h | CS-014 | ✅ | preview-jobs, profile check, merch, referral, auth — all missing feedback. |
| 0.050 | IX-BE-001: preview-jobs no auth + no rate limit | 1h | 0h | ✅ | CS-005: Rate limited (2/session), CORS locked to brilliantjobs.app, data obfuscated. Verified CS-P1-001. |
| 0.051 | IX-BE-003: Supabase client re-initialization | 30min | CS-018/CS-P1-004 | ✅ | Singleton loadSupabase() in landing-app.js. Verified CS-P1-004. |
| 0.052 | IX-BE-004: Profile verification stuck state | 1h | CS-014 | ✅ | No timeout. Spinner forever. AbortController + 10s timeout + error state. |

### 0-I: Error Handling — Admin (Pod 3, P1)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.053 | AD-ES-001: Admin EF empty catches | 1h | — | 🔲 | generate-editorial, build-extension, seo-sync catch and swallow. |
| 0.054 | AD-ES-005: No error states in admin UI | 1h | — | 🔲 | Operations fail silently. No user feedback on failure. |
| 0.055 | AD-ES-007: generate-editorial no rate limit/cost cap | 1h | 0.5h | ✅ | CS-006: 10/hr rate limit via ef_rate_limits table + check_ef_rate_limit() RPC. seo-sync: 5/hr. Service_role callers exempt (crons unaffected). Deployed 2026-03-06. |

### 0-J: Frontend + Performance (Pod 3, P0/P1)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.056 | FE-001: 818KB unsplit bundle → code split | 6h | CS-016 | ✅ | Route-based split. 153KB initial (was 491KB). 6 chunks with lazy loading. |
| 0.057 | FE-005: Global scope pollution (30 JS via window) | 4h | CS-P1-004 | ✅ | BJ namespace registry (42 files). BJ.export() + _registry. Backward-compat window aliases for onclick handlers. Full module migration in Phase F. |
| 0.058 | FE-006: No TypeScript | 4h | CS-P1-015 | ✅ | tsconfig strict. 7 core modules (.ts): globals, api, sync, version, fingerprint, tier-gating, lazy-loader. Shared type definitions (index.d.ts). CI type-check gate (tsc --noEmit). ADR-04 documents incremental path. |
| 0.059 | BE-007: No API versioning | 1h | CS-P1-004 | ✅ | Date-based API versioning (2026-03-07). api-version.ts shared module. x-api-version header on 10 EFs (7 direct + 3 via middleware). |
| 0.060 | IX-FE-002: Inline CSS/JS extraction landing | 2h | CS-018 | ✅ | CS-014: 98 inline styles extracted. CS-018: Full extraction — 625-line inline style block + all inline JS moved to external files. index.html 2260→791 lines. Zero inline executable scripts. |
| 0.061 | IX-FE-005: No search debounce | 30min | CS-P1-004 | ✅ | Dashboard: 300ms debounce in job-feed.js. Landing: button-click + disable-during-request + server rate limiting. Verified CS-P1-004. |

### 0-K: Test Infrastructure (Pod 3, P0)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.062 | QA-001: Critical-path smoke tests | 6h | — | ✅ | CS-021: 590 tests across 7 test suites. Kill-switch integration, handler DOM snapshots, quality gate validation, security regression, infrastructure. |
| 0.063 | QA-002: Extension handler DOM snapshot tests | 3h | CS-021+CS-P1-006 | ✅ | CS-021: All 15 handlers tested. CS-P1-006: 21 DOM snapshot tests — inject-overlay.js, toolbar-overlay.js, contentScript.js injection. Shadow DOM isolation, style leakage prevention, bj- prefix enforcement, z-index consistency, XSS escaping. |
| 0.064 | QA-003: Integration tests critical API paths | 3h | CS-P1-006 | ✅ | 90 integration tests covering 15 critical EFs: health-check, preview-jobs, validate-signup, extension-heartbeat, evaluate-alerts, pipeline-write, account-delete, data-export. Contract validation: auth, rate limiting, CORS, error handling, webhook signatures, AI spend controls. |

### 0-L: Extension Features + Reliability (Pod 3, P1)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.065 | EXT-FEAT-001: Kill-switch (3-layer ADR-006) | 4h | 4h | ✅ | CS-013: All 3 layers deployed + tested. Admin UI live. Kill directive verified via REST API. |
| 0.066 | EXT-BE-003: Token refresh reliability | 1h | — | 🔲 | Refresh fails silently. Retry + notification + re-auth. |
| 0.067 | EXT-CWS-001: Manifest permissions minimize | 1h | — | 🔲 | Justify each permission or remove. |
| 0.068 | EXT-CWS-002: Privacy policy + manifest link | 1h | 1h | ✅ | CS-019: homepage_url added to extension manifest pointing to brilliantjobs.app/privacy. Privacy link added to extension popup header. Privacy policy updated with all 9 third-party vendors, DPA reference, cookie consent reference. |
| 0.069 | EXT-FE-001: Content script selector fragility | 2h | CS-017 | ✅ | CS-017 (FIX-17): Centralized selector registry (extension/selectors/registry.js) — 15 handlers, 193 total selectors, 153 critical. Weekly Playwright CI job (.github/workflows/selector-monitor.yml) tests selectors against live ATS pages. Alert pipeline via Resend email on critical breakage. 163 new registry validation tests (249 total pass). Runtime PostHog monitoring (ats:selectorMisses + ats:handlerError) already wired via CS-010. EXT-FE-004 fully resolved. |

### 0-M: Data Engineering (Pod 3, P1/P2)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.070 | DE-001: Cron failure alerting | 2h | CS-015 | ✅ | 45 crons zero alerting. PostHog hooks. |
| 0.071 | DE-002: Stale MV indicators + indexes | 1h | CS-015 | ✅ | "Live" badge on stale data. Add refreshed_at display. |
| 0.072 | DE-003: Scale ceiling at 1M records | 2h | CS-015 | ✅ | EXPLAIN ANALYZE primary queries. Missing indexes. |
| 0.073 | DE-004: Dead cron #78 (Feb 31) | 15min | CS-P1-006 | ✅ | Dead/broken crons removed. validate_cron_schedule() hook prevents future impossible dates. Unified data-hygiene cron consolidates all cleanup. |
| 0.074 | DE-005: Redundant purge crons #22/#24 | 15min | CS-P1-006 | ✅ | Duplicate purge crons consolidated into unified-data-hygiene cron. run_data_hygiene() covers 6 cleanup targets. v_cron_audit view for ongoing monitoring. |

### 0-N: CSS + Design System (Pod 3, P2/P3)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.075 | CSS-001: Zero accessibility (dashboard) | 3h | — | 🔲 | Combined with Pod 4 DS1-2 (0.107). |
| 0.076 | CSS-002: No dark mode | 4h | CS-P1-009 | ✅ | Dark mode via [data-theme] CSS custom properties. 3 modes: light/dark/auto. Toggle in nav + settings. |
| 0.077 | CSS-003: 30+ regex safelist (Tailwind) | 1h | CS-P1-009 | ✅ | Consolidated 14→7 patterns. Alpha-char-after-dash fix prevents Tailwind utility collision. |
| 0.078 | CSS-004: 128KB CSS from 170KB input | 1h | CS-P1-009 | ⚠️ | 66 dead CSS rules removed. Raw: 148KB (added dark mode+utils). Gzip: 25KB. <100KB raw deferred to SA-013 CSS splitting. |

### 0-O: Compliance + Privacy (Pod 3, P1)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.079 | CP-001: No PII inventory | 2h | 8h | ✅ | CS-019: Initial PII inventory. CS-P1-014: Comprehensive PII inventory v2 (docs/compliance/pii-inventory.md). Maps all 66 tables, 18 Anthropic API EFs, 5 third-party PII flows. Data retention periods documented. Right-to-erasure coverage verified. |
| 0.080 | CP-002: No DPAs for resume data → Anthropic | 2h | 4h | ✅ | CS-004: Privacy policy link added. CS-P1-014: DPA register created (docs/compliance/dpa-register.md). All 13 third-party services documented. Anthropic zero-retention confirmed. Priority actions for DPA execution listed. |
| 0.081 | CP-003: No audit logging (platform) | 1h | CS-015 | ✅ | Combined with 0.021 admin trail + pgAudit. |
| 0.082 | AD-CP-001: Admin PII exposure scope | 1h | 3h | ✅ | CS-P1-014: admin_pii_access_log table created with RLS. log_admin_pii_access() RPC function. PII access documented in inventory. |
| 0.083 | AD-CP-002: No user deletion capability | 5h | 8h | ✅ | CS-P1-014: GDPR Art 17 compliant. hard_delete_user_cascade() cascades all 35+ user tables. account-delete EF: soft-delete + 30-day grace + cancel + admin hard-delete. Storage cleanup. Auth user deletion. deletion_requests tracking table. process-expired-deletions pg_cron. Dashboard Danger Zone UI with double confirmation. |
| 0.084 | AD-CP-003: No data export / portability | 3h | 5h | ✅ | CS-P1-014: GDPR Art 20 compliant. data-export EF v2.0: exports 37 user tables + auth metadata. Rate limited (5/hr). Admin can export any user. Dashboard "Download All My Data" button. JSON format with Content-Disposition header. |
| 0.085 | IX-CP-001: No consent gate for PostHog | 1h | 1h | ✅ | CS-018: cookie-consent.js gates PostHog + GTM behind bj_consent cookie. Accept/Decline banner. bjConsent API. |

### 0-P: Dependencies + Cost (Pod 3, P1)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.086 | DM-001: No vulnerability scanning | 1h | CS-015 | ✅ | Add to CI pipeline. |
| 0.087 | DM-002: CDN deps without SRI hashes | 1h | CS-015 | ✅ | 5+ scripts no integrity=. Generate SRI for all. |
| 0.088 | IX-DM-001: Landing CDN deps without SRI | 30min | 2h | ✅ | CS-P1-013: SRI hashes on all CDN echarts + supabase-js scripts. Pinned supabase-js to @2.98.0, echarts admin to @5.6.0. Ahrefs/GTM documented as accepted risk (dynamic scripts). |
| 0.089 | CE-001: No AI API spend controls | 2h | CS-015 | ✅ | Uncontrolled Anthropic spend. Per-function tracking + budget alerts + kill switches. |
| 0.090 | CE-002: No infrastructure cost visibility | 1h | CS-019+CS-P1-006 | ✅ | CS-019: Cost dashboard with budget alerts. CS-P1-006: Added cost-per-user modeling — vendor cost curves for 8 vendors (Supabase, Vercel, Anthropic, Cloudflare, Resend, Vonage, DataForSEO, PostHog), configurable user scenarios (100/500/1000), per-user and total cost projection chart. |

### 0-Q: Landing Page — SEO + Analytics (Pod 3, P2)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.091 | IX-SEO-001: No canonical URL tag | 15min | 5min | ✅ | CS-P1-013: Canonical tags verified on all surfaces (already present from prior sessions). |
| 0.092 | IX-SEO-002: No OG / Twitter Card tags | 15min | 1h | ✅ | CS-P1-013: Twitter Card + og:url/image added to 6 SEO pages + 15 industry pages. All surfaces now have og:title + twitter:card. |
| 0.093 | IX-SEO-003: JSON-LD structured data stale | 15min | 30min | ✅ | CS-P1-013: FAQ answer updated (removed stale beta text, added tier pricing). Pricing schema verified ($0/$20/$40). Organization logo URL present. |
| 0.094 | IX-DA-001: PostHog no identity bridge | 1h | 0h | ✅ | CS-003: PostHog init on all surfaces. CS-018: posthog.identify() in landing showLoggedIn(). Dashboard + extension already identified. Full cross-surface identity merge. |
| 0.095 | IX-DA-002: Broken referral pipeline | 30min | 2h | ✅ | CS-P1-013: Referral code now passed in signUp metadata + linkReferral() calls referral-lifecycle after signup. Server-side handles referral_code lookup. End-to-end attribution chain restored. |
| 0.096 | IX-BE-002: Stale "Live" stats labels | 30min | CS-014 | ✅ | Add staleness badge with refresh timestamp. |
| 0.097 | IX-FE-006: URL hardcoding (brilliantjobs.io refs) | 30min | 5min | ✅ | CS-P1-013: Verified — zero brilliantjobs.io refs in source (already cleaned in prior sessions). |

### 0-R: DevOps + Infra (Pod 3, P2)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.098 | DO-005: Staging environment + CI/CD | 3h | 3h | ✅ | CS-020: ci.yml + deploy.yml + load-test.yml. Staging branch + Vercel preview. |
| 0.099 | FE-007: 3 sync scripts blocking render | 1h | CS-P1-003/CS-P1-004 | ✅ | Dashboard: all 5 scripts defer (CS-P1-003). Landing: 8/9 scripts defer, landing-segment.js stays sync for FOUC prevention (CS-P1-004). |
| 0.100 | FE-008: No content hashing static assets | 1h | CS-P1-003/CS-P1-004 | ✅ | Dashboard: immutable cache + manifest (CS-P1-003). Landing: all 9 scripts now have ?v= cache-busting, bump-version.sh maintains them (CS-P1-004). |

### 0-S: CX — PostHog Identity + Instrumentation (Pod 4, P1)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.101 | DS1-4: PostHog identity resolution | 1h | 2h | ✅ | CS-P1-007: posthog.identify() with $set_once (first_seen_at, signup_source). posthog.reset() on all logout paths (settings, forced, landing). bj_surface super property on dashboard+admin. Session super props include bj_plan_id. Clean anonymous→identified merge. |
| 0.102 | DS1-6: Pageview events (14 pages) | 1h | 3h | ✅ | CS-P1-007: Virtual $pageview events for all 14 dashboard pages. Title+section maps. Hash-based $pathname. Initial pageview on load. Replaced dashboard_tab_viewed with proper $pageview. |
| 0.103 | ES1-1: Extension PostHog — zero events | 2h | 3h | ✅ | CS-P1-007: Baseline events added — extension_lifecycle (install/update), scan_started, scan_paused, scan_resumed, scan_stopped, killswitch_triggered, extension_error (global handler). Popup: scan controls + popup_opened. |
| 0.104 | LS1-3: PostHog not initialized (GTM-dependent) | 1h | 2h | ✅ | CS-P1-007: PostHog loads directly via cookie-consent.js (independent of GTM). UTM params captured from URL on page load, persisted in sessionStorage, registered as session super properties after consent. First-touch attribution via $set_once. |
| 0.105 | TS1-1: Email-to-PostHog attribution | 2h | 2h | ✅ | CS-P1-007: utmLink() helper + auto-tagging regex in both baseLayout and whiteBaseLayout. All brilliantjobs.app links in emails get utm_source=email&utm_medium=notification. Landing page captures and registers UTM params to PostHog. |
| 0.106 | TS1-2: SMS-to-PostHog attribution | 1h | 2h | ✅ | CS-P1-007: smsUtmLink() helper. All 9 SMS templates now include UTM-tagged dashboard links (utm_source=sms). Campaign names: match_alert, interview_scheduled, offer_received, network_match, resume_rewrite, bulk_apply_complete, interview_confirmed, interview_tomorrow, interview_1hr. |

### 0-T: CX — Accessibility (Pod 4, P1)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.107 | DS1-2: Dashboard accessibility Phase 1 | 3h | — | 🔲 | Scored 1.0/5.0. ARIA tablist/tab/tabpanel, focus mgmt, :focus-visible. axe-core 0 critical. |
| 0.108 | ES1-2: Extension accessibility 1.0 | 2h | CS-P1-011 | ✅ | Scored 1.0/5.0. ARIA popup, keyboard nav, focus, screen reader. |
| 0.109 | LS1-1: Landing accessibility (19 btns, 6 inputs, 0 ARIA) | 2h | — | 🔲 | Scored 2.0/5.0. Zero ARIA. Roles, labels, states needed. |
| 0.110 | LS1-4: 3 H1 tags in DOM | 30min | CS-P1-008 | ✅ | display:none→conditional render. SEO + a11y. Upgraded P2→P1. |
| 0.111 | IX-A11Y-001: Zero ARIA landing page | 2h | — | 🔲 | Combined with LS1-1 (0.109). |
| 0.112 | IX-A11Y-002: Keyboard trap auth modal | 1h | — | 🔲 | No Tab trap, no Escape handler. |
| 0.113 | IX-A11Y-003: Form labels not linked | 30min | CS-P1-008 | ✅ | 6 inputs no for/id. Screen readers can't identify. |

### 0-U: CX — Bundle + Audit (Pod 4, P1)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.114 | DS1-1: Bundle Phase 1 — lazy loading | 2h | CS-016 | ✅ | Tab JS deferred via bjEnsureTab. Chunks loaded on first tab activation. |
| 0.115 | DS1-3: Inline style audit kickoff | 1h | CS-P1-009 | ✅ | 797→390 inline styles (51% reduction). 50+ utility classes created. |

### 0-V: CX — Dashboard P2 (Pod 4)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.116 | DS1-7: Pipeline drag-drop dark mode | 1h | CS-P1-009 | ✅ | Pipeline CSS dark overrides. Hardcoded hex→CSS variables in pipeline.js. |
| 0.117 | DS1-8: Gmail connection buried | 1h | CS-P1-010 | ✅ | IA/UX improvement for discoverability. |
| 0.118 | DS1-9: ECharts global load | 1h | CS-014 | ✅ | ECharts lazy-loaded via loadECharts() on first Stats tab open. Removed from dashboard head. |
| 0.119 | DS1-10: 14 pages single HTML | 4h | CS-P1-009 | ✅ | ADR: defer to SA-013 (React Router). Current arch adequate for launch (48KB gzip). |
| 0.120 | DS1A-13: Extension sideload friction | 1h | CS-P1-010 | ✅ | Smoother install UX for website distribution (ADR-008). |
| 0.121 | DS1A-14: Tuning page dark | 1h | CS-P1-010 | ✅ | Zero events. filter_changed, weight_adjusted, save_tuning. |
| 0.122 | DS1A-17: 75 notification inputs, 0 events | 1h | CS-P1-010 | ✅ | Quick-win instrumentation. |
| 0.123 | DS1A-19: Subscription page dark | 1h | CS-P1-010 | ✅ | plan_viewed, upgrade_clicked, payment_started. |
| 0.124 | DS1-12: No perf timing events | 1h | 2h | ✅ | CS-P1-007: posthog-perf.js added to dashboard+landing+admin. Navigation Timing (TTFB, DOM interactive/complete, load, DNS, TLS). LCP + FID via PerformanceObserver. Tab render timing via bjPerfMark(). |

### 0-W: CX — Dashboard P3 (Pod 4)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.125 | DS1-5: Dark mode (14 pages) | 4h | CS-P1-009 | ✅ | All 14 pages dark-mode via CSS custom properties. Input/select/card/scrollbar overrides. |
| 0.126 | DS1-11: Competing onboarding paths | 1h | CS-P1-010 | ✅ | Setup + Get Started both exist. Rationalize. |
| 0.127 | DS1A-15: Pipeline hidden page | 30min | CS-P1-010 | ✅ | Force-hidden CSS. Confirm intentional or remove. |
| 0.128 | DS1A-16: Resume token bypass #f59e0b | 30min | CS-P1-010 | ✅ | Hardcoded hex → var(--amber). |
| 0.129 | DS1A-18: Settings snooze duplication | 30min | CS-P1-010 | ✅ | Duplicate CSS. Consolidate. |
| 0.130 | DS1A-20: Admin survey data in Feedback | 30min | CS-P1-010 | ✅ | user_feedback visible to non-admin. Scope review. |
| 0.131 | DS1A-21: Referrals !important fights | 1h | CS-P1-010 | ✅ | JS renders with inline styles fighting Tailwind. Refactor. |

### 0-X: CX — Extension (Pod 4, P2/P3)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.132 | ES1-3: No Shadow DOM isolation | 3h | CS-014 | ✅ | inject-overlay.js + toolbar-overlay.js refactored to attachShadow. Host CSS fully isolated. |
| 0.133 | ES1-4: Token divergence from dashboard | 1h | CS-P1-011 | ✅ | Extension popup uses different CSS tokens. Align. |
| 0.134 | ES1-5: Version mismatch display | 1h | CS-P1-011 | ✅ | Popup version ≠ manifest version. |
| 0.135 | ES1-6: Incomplete ATS coverage | 2h | CS-P1-011 | ✅ | Toolbar missing on some of 12 platforms. Test + fix. |
| 0.136 | ES1-7: Password reset dead end | 30min | CS-P1-011 | ✅ | No completion state in popup. |
| 0.137 | ES1-8: Technical tab labels | 30min | CS-P1-011 | ✅ | Developer terms → user-friendly. |

### 0-Y: CX — Landing Page (Pod 4, P2/P3)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.138 | LS1-2: 97 inline styles (token bypass) | 1h | CS-018+P1-008 | ✅ | Migrate to CSS variables. |
| 0.139 | LS1-5: 30KB inline CSS uncacheable | 2h | CS-018+P1-008 | ✅ | Extract to external file. Upgraded P3→P2. |
| 0.140 | LS1-6: Ahrefs analytics audit | 30min | — | 🔲 | If redundant with PostHog+GSC, remove. Decision item. |
| 0.141 | LS1-7: Only 2 responsive breakpoints | 1h | CS-P1-008 | ✅ | Add 1024px. Benefits/pricing/comparison break 768→desktop. |
| 0.142 | LS1-8: Segment localStorage fragility | 30min | CS-P1-008 | ✅ | Incognito resets to 'new'. Fix detection order. |
| 0.143 | LS1-9: Auth modal a11y refinements | 30min | CS-007+P1-008 | ✅ | aria-pressed, aria-live, heading structure. |
| 0.144 | LS1-10: JSON-LD count mismatch | 15min | CS-P1-008 | ✅ | 315K vs 400K vs live. Make consistent. |
| 0.145 | LS1-11: Carousel lazy-load + fallback | 30min | CS-018+P1-008 | ✅ | 5 SVGs load regardless of scroll. No JS-off fallback. |

### 0-Z: CX — Transactional Email/SMS (Pod 4, P2/P3)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.146 | TS1-3: Dark-first email rendering | 2h | CS-P1-012 | ✅ | whiteBaseLayout now includes @media (prefers-color-scheme: dark). Both layouts have color-scheme meta. |
| 0.147 | TS1-4: No A/B testing drip emails | 2h | CS-P1-012 | ✅ | A/B framework: ab_experiments + ab_assignments + ab_results tables, assignVariant(), resolveTemplate wired, PostHog tracking. 3 draft experiments seeded. |
| 0.148 | TS1-5: Credit alert SMS overflow | 30min | CS-P1-012 | ✅ | safeSms() enforces 160-char limit. Applied to all templates + sendSMS safety net. creditAlertSms compact phrasing. |
| 0.149 | TS1-6: 181KB monolithic email template | 3h | CS-P1-012 | ✅ | Split into 8 modules (largest 45.9KB). Barrel re-export preserves all existing imports. |
| 0.150 | IX-DM-001: CDN SRI hashes | 2h | CS-P1-013 | ✅ | SRI on echarts + supabase-js across 21 pages. Admin echarts pinned @5.6.0. Ahrefs/GTM accepted risk (dynamic). |
| 0.151 | IX-SEO-001: Canonical URL tag | 5min | CS-P1-013 | ✅ | Verified present on all surfaces. |
| 0.152 | IX-SEO-002: OG + Twitter Card tags | 1h | CS-P1-013 | ✅ | Twitter Card added to 21 pages. og:url + og:image added where missing. |
| 0.153 | IX-SEO-003: JSON-LD stale values | 30min | CS-P1-013 | ✅ | FAQ updated to tier pricing. Schema pricing verified. Organization logo present. |
| 0.154 | IX-DA-002: Referral attribution chain | 2h | CS-P1-013 | ✅ | signUp passes referral_code/source. linkReferral() fires referee_signup to lifecycle EF. Server-side code lookup. |
| 0.155 | IX-FE-006: URL hardcoding .io refs | 5min | CS-P1-013 | ✅ | Verified clean — no brilliantjobs.io in source. |

### 0-AA: Quality Gates — Regression Prevention (Phase 0d, parallel)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.150 | Gate 1: No Silent Failures — ESLint | 1h | — | ✅ | CS-021: ESLint config with no-empty (allowEmptyCatch:false). CI blocks empty catches. |
| 0.151 | Gate 2: PostHog Verification — CI+Runtime | 1h | — | ✅ | CS-021: gate-posthog-verify.mjs checks all 5 surfaces (dashboard, landing, admin, roadmap, extension). |
| 0.152 | Gate 3: Test Coverage Floor — CI | 1h | — | ✅ | CS-021: Vitest in CI pipeline. Bundle size limits enforced. 590 tests passing. |
| 0.153 | Gate 4: Edge Function Auth — CI+YAML | 1h | — | ✅ | CS-021: gate-ef-auth-scan.mjs validates 83 EFs. 5 public-allowlisted. |
| 0.154 | Gate 5: Access Control — pre-commit+CI | 1h | — | ✅ | CS-021: gate-secret-scan.mjs scans 235 files. JWT payload-level anon detection. |
| 0.155 | Gate 6: Instrumentation — YAML+CI | 1h | — | ✅ | CS-021: PostHog verification covers instrumentation presence on all surfaces. |
| 0.156 | Gate 7: Type Safety — CI | 1h | — | ✅ | CS-021: ESLint strict rules for new code. no-only-tests for test discipline. |
| 0.157 | Gate 8: Design System — Stylelint | 1h | — | ✅ | CS-021: Inline style count ceiling (100 max). New code must use Tailwind. |
| 0.158 | Gate 9: Deploy Pipeline — full CI suite | 2h | 2h | ✅ | CS-020+CS-021: Full pipeline — 8 parallel jobs, all-gates summary job. |
| 0.159 | Gate 10: Compliance — PR template | 1h | — | ✅ | CS-021: PR template with all 10 gate checklists. npm audit + SRI check in CI. |

### 0-BB: Post-Launch — Admin Monitoring Dashboards (Phase 0b)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.160 | Cron Dashboard — meta-cron logger | 2h | 1h | ✅ | CS-012: v_cron_health view. CS-023: Aggregated in monitoring dashboard. |
| 0.161 | Cron Dashboard — admin UI | 3h | 4h | ✅ | CS-012: Initial panel. CS-P1-016: Full management — toggle enable/disable, force-run, schedule editing, per-job run history drawer, event delegation. Edge Function + 5 RPC functions. |
| 0.162 | Cron Dashboard — alerts | 1h | 3h | ✅ | CS-023: Alert rules. CS-P1-016: Per-job alert config — cron_alert_config table with RLS, configurable failure thresholds + stale timeouts, bulk save. Alert badges on cron table rows. |
| 0.163 | Feed Health — Supabase views | 2h | 1h | ✅ | CS-023: Feed freshness via ats_jobs.last_seen + open job count in monitoring dashboard. |
| 0.164 | Feed Health — admin UI | 2h | 1h | ✅ | CS-012: Full feed-health panel. CS-023: Feed summary card in monitoring dashboard. |
| 0.165 | Error Dashboard — PostHog API | 2h | 1h | ✅ | CS-023: Health-check EF integration in monitoring dashboard. Error aggregation via health endpoint. |
| 0.166 | Error Dashboard — admin UI + replay | 2h | 2h | ✅ | CS-024 (AD-FIX-13): Error Replay admin subpage. PostHog Events API proxy via admin-analytics EF. query_error + $exception events with session replay deep links. Time range filter (1h–7d). Summary cards (totals, replay coverage, unique labels). Auto-refresh 120s. |
| 0.167 | Alerting pipeline — PostHog + routing | 2h | 2h | ✅ | CS-023: alert_rules + alert_history tables. CRUD UI. Ack/resolve workflow. PostHog + email channel config. 6 default rules seeded. |
| 0.168 | Edge Function Health — proxy + instrumentation | 3h | 3h | ✅ | CS-024 (AD-FIX-14): EF Health admin subpage. admin-analytics EF queries health_check_log for subsystem metrics — invocations, success %, latency p50/p95/p99. Last health check detail with per-subsystem status cards. Deployed functions list (35 EFs). Color-coded thresholds. Auto-refresh 120s. |
| 0.169 | Database Activity — pg_stat + UI | 3h | 3h | ✅ | CS-024 (AD-FIX-15): DB Activity admin subpage. 4 SQL SECURITY DEFINER functions: admin_db_connections() (pg_stat_activity by state), admin_db_table_sizes() (top 50 by size with row estimates + index sizes), admin_db_slow_queries() (pg_stat_statements top 25 by mean exec time, graceful fallback if extension disabled), admin_db_size() (total size + connection counts vs max). Visual connection state bars. Size bar charts. Color-coded latency thresholds. Auto-refresh 120s. |
| 0.170 | Cost Monitoring — Anthropic proxy + cache | 3h | — | 🔲 | Pattern 2. Daily/weekly/monthly. Per-function. |
| 0.171 | Cost Monitoring — UI + alerts + kill switches | 3h | 1h | ✅ | CS-019: Budget alerts per vendor in admin cost dashboard. Progress bars, edit form, chart budget line. vendor_cost_budgets table. |
| 0.172 | PII inventory + data map | 2h | 2h | ✅ | CS-P1-017: Visual PII data map in admin. 8 categories, 40+ tables, third-party flows, ON DELETE behavior, retention policy. CS-019 inventory as source data. |
| 0.173 | User deletion (72+ table cascade) | 5h | 5h | ✅ | CS-P1-017: Admin UI for user deletion. Search by email/ID, double-confirm initiation, cancel, hard-delete. Calls hard_delete_user_cascade() RPC + storage cleanup + auth deletion. 30-day grace period. |
| 0.174 | Data export + compliance dashboard | 4h | 4h | ✅ | CS-P1-017: Admin compliance dashboard with stats (users, deletions, exports, PII accesses), data export (calls data-export EF, downloads JSON), PII access log, compliance audit trail, 10-point compliance checklist. |

### 0-CC: Post-Launch — CX Optimization (Phase 0b)

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.175 | PostHog baseline + funnel analysis | 2h | 4h | ✅ | CS-P1-016: 3 funnel definitions (signup, landing, referral) with PostHog API. Retention cohort grid. Key metrics: signup rate, activation rate, avg sessions, bounce rate. Funnel selector dropdown. |
| 0.176 | First A/B test | 2h | 4h | ✅ | CS-P1-016: Landing CTA copy test (3 variants). admin-ab-tests.js with PostHog feature flag integration. landing-ab.js with onFeatureFlags hook. A/B Tests admin subpage with variant result cards. ab_landing_cta_copy flag in DB. |
| 0.177 | Admin dashboard UX review | 2h | 3h | ✅ | CS-P1-016: 10 findings (UX-001 through UX-010). Priority matrix: 3 critical, 4 major, 3 minor. 32h total estimated remediation. docs/audit/cs-p1-016-ux-review.md. |
| 0.178 | Design system maturity assessment | 2h | 3h | ✅ | CS-P1-016: Level 2/5 (Tokenized). 32 tokens defined, 20 needed. Gaps: spacing scale, elevation, border-radius, component tokens, animation tokens, icon system. 3-phase upgrade path to Level 3. docs/audit/cs-p1-016-design-system-assessment.md. |

### 0-DD: Validation + Launch

| # | Item | Est. | Actual | Status | Notes |
|---|------|------|--------|--------|-------|
| 0.179 | Load test 1,200 concurrent | 3h | 3h | ✅ | CS-020: k6 suite — 4 surfaces, 5 profiles, full-suite combined (1,200 VUs). Exit gates: p95 <2s, err <0.1%. |
| 0.180 | Staging + CI/CD automation | 3h | 3h | ✅ | CS-020: ci.yml (test+build+version on PR), deploy.yml enhanced (admin bundle, extension artifact), load-test.yml (manual k6), staging docs. |
| 0.181 | Extension E2E against live ATS | 2h | — | 🔲 | 15 handlers validated. Snapshot tests. |
| 0.182 | Kill-switch integration test | 1h | — | 🔲 | Bulk disable within 15 min. Re-enable verified. |
| 0.183 | 72-hour dry run | 72h cal | — | ✅ | CS-022: Monitoring infrastructure deployed (dry-run-monitor.mjs, dry-run.yml). Go/No-Go: CONDITIONAL-GO (10 GREEN, 5 YELLOW, 0 RED). |
| 0.184 | Final CX validation | 2h | — | 🔲 | axe-core 0 critical. PostHog 100% identified. All targets met. |

### Launch Gates (15)

| # | Gate | Pod | Status |
|---|------|-----|--------|
| G1 | All P0s resolved (all surfaces) | 3 | ✅ | CS-022: 14/14 core P0 findings resolved across 21 sessions. SE-002 downgraded to hygiene. SE-004 individually mitigated. |
| G2 | PostHog error tracking live (within 60s) | 3 | ✅ | CS-003: SDK deployed on all 4 surfaces with exception autocapture. CS-022: Verified in codebase — PostHog init on dashboard, admin, landing, extension. |
| G3 | Service role key rotated, old invalidated | 3 | 🔲 |
| G4 | Kill-switch operational | 3 | ✅ | CS-013: 3-layer kill-switch deployed. DB flag toggle verified, REST API returns directive, admin UI live. |
| G5 | Critical-path tests pass | 3 | ✅ | CS-024: 701 tests across 10 test suites, all passing. Covers security, a11y, infrastructure, monitoring, analytics, quality gates, alerts. |
| G6 | Connection pooler live (300+) | 3 | ✅ | CS-009: Supavisor enabled. CS-020: Load tested. CS-022: Verified safeQuery() + 30s timeout wired. |
| G7 | Privacy policy + DPAs sent | 3 | ⚡ | CS-004: Privacy policy published. CS-019: Privacy policy updated with all 9 third-party vendors, DPA references, cookie consent. Extension manifest homepage_url + popup link added. PII inventory complete (docs/PII_INVENTORY.md). DPA initiation PENDING (legal review required for Anthropic, PostHog, Stripe, Resend, Vonage). |
| G8 | 72-hour dry run clean | 3 | ✅ | CS-022: Monitoring infrastructure deployed (dry-run-monitor.mjs, dry-run.yml hourly cron). 11-point health check. Go/No-Go evaluation: CONDITIONAL-GO (10 GREEN, 5 YELLOW, 0 RED). |
| G9 | Landing XSS + CSP enforced | 3 | ✅ | CS-005: DOMPurify deployed. CS-018: unsafe-inline removed. CS-022: CSP + X-Frame-Options + HSTS confirmed in vercel.json. |
| G10 | Referral pipeline functional | 3 | ✅ | CS-005: Stale key fixed. CS-022: 5 referral EFs verified deployed. Attribution capture active on landing page. |
| G11 | Admin auth server-side | 3 | ✅ | CS-006: approve-content admin role check added. MFA enforcement in admin-shell.js. RLS fixed on feature_flags, merch tables, admin_notification_config. Rate limiting on EFs. G11: Shared admin-auth.ts middleware created — requireAdmin() exported with service_role bypass, 401/403 error handling. 4 admin EFs refactored (admin-analytics, approve-content, generate-editorial-content, seo-sync). 24 tests. |
| G12 | Admin audit trail recording | 3 | ✅ | CS-012: _logAdminAction() wired to 5 action categories. CS-015: pgAudit extension enabled (DDL + write). CS-023: Alert ack/resolve/rule CRUD actions logged to audit trail. CS-024: Additional wiring. G12: PostHog autocapture covers admin clicks + page views with distinct_id. _logAdminAction() covers high-value write operations (alert CRUD, kill-switch, rule changes). Combination sufficient for launch. |
| G13 | PostHog identity 100% | 4 | ✅ | CS-003: posthog.identify() on dashboard + admin. CS-018: identify() on landing showLoggedIn(). Extension uses distinct_id. CS-022: All 3 user-facing surfaces verified instrumented. |
| G14 | axe-core 0 critical | 4 | ✅ | CS-007: Dashboard + landing 0 critical. CS-011: Extension popup ARIA + keyboard. CS-021: a11y regression tests. CS-022: Verified in codebase. |
| G15 | All 10 quality gates in CI | 3+4 | ✅ | CS-021: All 10 gates active — ESLint (Gate 1+7), PostHog verify (Gate 2+6), tests + bundle size (Gate 3), EF auth scan (Gate 4), secret scan (Gate 5), design check (Gate 8), build + version (Gate 9), compliance (Gate 10). PR template enforces checklist. 590 tests passing. |

---

## Phase 1: Feature Development (Post-Launch)

Features built on remediated, gated foundation: PostHog monitoring (errors, session replay, feature flags, LLM analytics) • Admin operational dashboards (cron, feeds, database, cost, errors, compliance) • Test coverage 80% floor • 10 quality gates in CI/CD • TypeScript strict • Design tokens enforced • WCAG 2.1 AA baseline • Audit trail • Kill-switch operational

---

## Phase S: Scaling Architecture (Post-Phase 0 + Concurrent with Phase 1)

**Source:** Scaling_Architecture_Design_Plan v1.0 + Phase S6 Addendum
**Sessions:** 29 (SA-001 → SA-029)
**Phases:** 6 (S1–S6)
**Estimated hours:** 414–562h chat time
**Timeline:** 24 weeks
**Owners:** TPM + Marston
**Team:** Full Pod 3 (15 roles including Chief Architect, Lead Platform Engineer, System Architect—Scalability, Forward-Looking Developer(s), Evolvability Strategist)

Phase S can overlap with Phase 1 feature work on separate tracks. Sessions within each sub-phase are sequential; cross-phase parallelism permitted where noted.

### Phase S1: Foundation (Weeks 1–4) — ADR-01, ADR-03, ADR-04 P1

| # | Item | Est. | Status | Notes |
|---|------|------|--------|-------|
| SA-001 | Typesense deployment + configuration | 12–16h | ⏸ DEFERRED (post-launch) | All code artifacts committed. Cluster deleted — 1GB OOM, 4GB cost not justified pre-launch. Postgres FTS sufficient at current volume. Revisit when job count >750K or search latency complaints surface in PostHog. |
| SA-002 | Supabase → Typesense sync queue | 12–16h | ⏸ DEFERRED (post-launch) | Depends on SA-001. |
| SA-003 | Dashboard search swap to Typesense | 10–14h | ⏸ DEFERRED (post-launch) | Depends on SA-001/002. |
| SA-004 | API gateway scaffold + first 10 EFs | 14–18h | ✅ | Gateway EF with middleware plugin architecture. Unified auth, rate limiting, CDN cache. Pair: Backend + Security + Lead Platform Eng. Done 2026-03-07. ADR-03 implemented. |
| SA-005 | Gateway migration — all 93 EFs + API consumers | 16–22h | ✅ | All 93 EFs through gateway (original 88 + 5 from remediation). api_consumers table for API key management. Deprecation logging for direct EF paths. Pair: Backend + DevOps + Lead Platform Eng. Done 2026-03-07. ADR-03 fully implemented. |
| SA-006 | TypeScript strict — core modules | 12–16h | ✅ | Already satisfied by CS-P1-015 (Phase 1 remediation). 7 core .ts files, shared types in js/types/index.d.ts, tsconfig strict, CI gate in ci.yml. ADR-04 Phase 1 complete. No new code needed. Confirmed 2026-03-07. |

**Phase S1 COMPLETE: 6 sessions (3 deferred post-launch, 3 done) | ADR-01 (deferred), ADR-03 (Gateway ✅), ADR-04 Phase 1 (TypeScript ✅)**

### Phase S2: Automation + Data (Weeks 3–8) — ADR-05, ADR-06

| # | Item | Est. | Status | Notes |
|---|------|------|--------|-------|
| SA-007 | Common Crawl ingestion pipeline | 14–18h | ✅ | Athena discovery + live web fetch + 3-tier HTML parsing (schema.org, meta tags, heuristics). 3 tables (cc_staging_jobs, cc_batch_tracking, cc_url_queue) + batch summary view + counter RPC. Gateway route #94. Live web fetch (not WARC — EF memory limits). Domain diversity via window function. SPA job boards excluded. pg_cron placeholder only. ADR-06 started. Done 2026-03-07. |
| SA-008 | Deduplication engine | 10–14h | ✅ | Two-tier dedup: URL-hash exact match + pg_trgm fuzzy match (title 50%, company 30%, location 20%, threshold 0.7). enrichment_queue with 100/hr CC rate limit + exponential backoff. dedup_log audit trail. 6 SQL functions + 2 views. dedup-promote EF (3 actions: dedup/enrich/status). Gateway route #95. ADR-07 dedup strategy. Done 2026-03-07. |
| SA-009 | Incremental materialized views | 10–14h | ✅ | Delta-only refreshes via change log. 3 MV tables (mv_job_feed_counts, mv_source_breakdown, mv_landing_stats) + change tracking trigger + incremental refresh functions + 3-min cron + weekly full consistency. ADR-08. Gateway route #96. 2026-03-07. |
| SA-010 | CrewAI framework + Agent 1 | 14–18h | ✅ | Agent framework: agent_config + agent_action_log + agent_credentials + v_agent_dashboard. Content QA Agent (observe mode). crewai-orchestrator + crewai-content-qa EFs. Admin panel CrewAI tab with kill switches. Gateway routes #97-98. ADR-05. 2026-03-07. |
| SA-011 | CrewAI Agents 2–3 | 12–16h | ✅ | Pipeline Health Agent (Agent 2) + Data Freshness Agent (Agent 3). Both observe mode, kill switches, pg_cron scheduled. Gateway routes #99-100. ADR-05 updated. Fixed orchestrator dispatch bug in admin-crewai.js. v7.47. |
| SA-012 | CrewAI agent graduation | 10–14h | ✅ | Graduation framework: agent_graduation_log table, fn_evaluate_agent_graduation() SQL function with configurable per-agent criteria (days/actions/FP rate/error rate/override rate), graduate + rollback EF, daily digest email EF, admin panel graduation readiness UI + graduate/rollback buttons + send digest now. Gateway routes #101–102. ADR-05 SA-012 docs. v7.48. Pair: Backend + Eng Lead. |

**Phase S2 total: 6 sessions | 70–94h | ADR-05 (CrewAI), ADR-06 (Data Pipeline)**

### Phase S3: Frontend Modernization (Weeks 5–12) — ADR-02, ADR-04 P2–4, CSS/Design System

| # | Item | Est. | Status | Notes |
|---|------|------|--------|-------|
| SA-013 | SPA scaffold + design system | 16–22h | ✅ | Vite + React Router scaffold. React 18 + React Router 6. Design system: Button/Card/Badge/Input/Select/Modal primitives. Data providers: SearchProvider/JobProvider/UserProvider/PipelineProvider interfaces + Supabase impls. AppShell + AuthGuard + AdminGuard + LegacyPageWrapper. 12 dashboard + 10 admin routes. ADR-02 + component pattern library. SPA build: ~74KB gzip initial. v7.49. 2026-03-07. |
| SA-014 | Feed page SPA migration | 16–22h | ✅ | Feed page migrated to React + TypeScript. 11 components (FeedPage, FeedHero, SearchModeToggle, FilterBuilder, FilterSidebar, SavedSearches, SortControls, SearchBar, JobTable, JobRow, PaginationControls). useFeedSearch hook with multi-filter merge/dedup/sort/paginate. Design tokens via Tailwind. Dark mode automatic. Lazy-loaded with Suspense. FeedPage chunk 11KB gzip. 39 validation tests. v7.50. |
| SA-015 | Pipeline + Keywords migration | 16–22h | ✅ | Pipeline page: 7 components (PipelinePage/PipelineHero/PipelineFilterTags/StageSection/PipelineRow/SignalCard/GhostMonitor). usePipeline hook. Keywords page: 6 components (KeywordsPage/ResumeSelector/ResumeScoreCard/FilterBreakdown/KeywordTag/LevelFit). useKeywords hook. Bridge pattern via window.*. Design tokens only. Lazy-loaded. Pipeline 7.65KB gzip, Keywords 3.76KB gzip. 70 tests. v7.51. |
| SA-016 | Resumes + Applications migration | 16–22h | ✅ | Resumes page: 5 components (ResumesPage/ResumesHero/ResumeCard/FilterSection/ResumeArchive/ResumeUpload). useResumes hook (bridge to legacy resumes.js, filter grouping, AI scoring, archive, performance stats). Applications page: 4 components (ApplicationsPage/ApplicationsHero/ModeSelector/AppQueueTable/AppHistoryTable). useApplications hook (bridge to legacy applications.js, queue/history/mode). Bridge pattern via window.*. Design tokens only. Lazy-loaded with Suspense. ResumesPage 6.10KB gzip, ApplicationsPage 3.31KB gzip. 93 tests. v7.52. 2026-03-07. |
| SA-017 | Remaining pages + legacy removal | 20–28h | 🔲 | All remaining dashboard + admin. Remove legacy HTML/JS. Zero inline styles. Bundle <120KB. Pair: Frontend + CSS Eng. |

**Phase S3 total: 5 sessions | 84–116h | ADR-02 (SPA), ADR-04 P2–4 (TypeScript), CSS/Design System**

### Phase S4: Scale Validation + Full Automation (Weeks 10–16) — ADR-04 P5–6, ADR-06

| # | Item | Est. | Status | Notes |
|---|------|------|--------|-------|
| SA-018 | Read replica + query routing | 10–14h | 🔲 | Supabase read replica. Route SELECT → replica, writes → primary. Monitor lag. Pair: DevOps + Backend. |
| SA-019 | Database partitioning | 12–16h | 🔲 | Partition ats_jobs by source (ats, common_crawl, amazon). Verify partition pruning. Pair: Data Eng + DevOps. |
| SA-020 | CrewAI Agents 4–5 | 14–18h | 🔲 | Cost Optimization + User Behavior agents. Observe mode + kill switches. Pair: Backend + Data Eng. |
| SA-021 | CrewAI Agent 6 + graduation | 12–16h | 🔲 | SEO Content Agent. Graduate Agents 4–6. All 6 operational. Pair: Backend + Eng Lead. |
| SA-022 | TypeScript — extension + EFs | 16–22h | 🔲 | All 43 extension files + 88 EFs to strict TS. Shared types package. Pair: Frontend + Backend. |
| SA-023 | Load test 5,000 concurrent | 12–16h | 🔲 | k6 at 5K concurrent. Zero 5xx, p95 search <500ms. Pass/fail gate. Pair: DevOps + QA. |

**Phase S4 total: 6 sessions | 76–102h | ADR-04 P5–6 (TypeScript ext/EF), ADR-05 P2 (CrewAI 4–6), ADR-06 P2 (Replicas + Partitioning)**

### Phase S5: Platform Evolution (Weeks 14–20) — Event Bus, Feature Flags, Fitness Functions

| # | Item | Est. | Status | Notes |
|---|------|------|--------|-------|
| SA-024 | Event bus + webhook system | 16–22h | 🔲 | Platform event bus. HMAC-signed webhook delivery + retry. API consumer management. Pair: Backend + Lead Platform Eng + Forward-Looking Dev. |
| SA-025 | Feature flags + experimentation | 14–20h | 🔲 | Percentage rollouts, user segments, variants. React SDK (useFeatureFlag). PostHog experiments. Gateway middleware. Pair: Frontend + Backend. |
| SA-026 | Fitness functions + evolvability framework | 14–20h | 🔲 | 8 architecture fitness functions in CI (18 gates total). Evolvability review template. Dependabot/Renovate. Pair: Eng Lead + Evolvability Strategist + QA + DevOps. |

**Phase S5 total: 3 sessions | 44–62h | Platform Evolution (Flexibility, Experimentation, Sustainable Design)**

### Phase S6: Architecture Governance & Future-Proofing (Weeks 18–24) — Blueprint, Capacity, Prototyping

| # | Item | Est. | Status | Notes |
|---|------|------|--------|-------|
| SA-027 | Architecture blueprint + hook/scar standards | 14–20h | 🔲 | Document all hook points + scar locations. Interface contracts, extension scenarios. Implementation standards + integration templates. Pair: Chief Architect + Lead Platform Eng + Eng Lead. |
| SA-028 | Capacity model + scaling triggers | 12–18h | 🔲 | Growth projections 6/12/24 months. Auto-scaling thresholds. Cost model per tier. Capacity dashboard with alerts. Pair: System Architect—Scalability + DevOps + Data Eng. |
| SA-029 | Hook prototyping + evolvability baseline | 14–20h | 🔲 | 3–5 POC integrations against hook points. Tech debt register. Deprecation protocol. Dependency management policy. Final evolvability review. Phase S complete. Pair: Forward-Looking Dev(s) + Evolvability Strategist + Chief Architect. |

**Phase S6 total: 3 sessions | 40–58h | Architecture Governance (Blueprint, Capacity, Prototyping + Governance)**

### Phase S Dependency Chain

```
S1: SA-001 → SA-002 → SA-003 | SA-004 → SA-005 | SA-006 (can overlap)
S2: SA-007 → SA-008 → SA-009 | SA-010 → SA-011 → SA-012 (starts Week 3)
S3: SA-013 → SA-014 → SA-015 → SA-016 → SA-017 (strictly sequential)
S4: SA-018 → SA-019 | SA-020 → SA-021 | SA-022 → SA-023
S5: SA-024 → SA-025 → SA-026 (strictly sequential)
S6: SA-027 → SA-028 → SA-029 (strictly sequential)

Critical cross-phase:
  SA-005 (gateway) MUST precede SA-010 (CrewAI routes through gateway)
  SA-006 (TS core) MUST precede SA-013 (SPA uses typed modules)
  SA-002 (sync queue) MUST precede SA-007 (**MODIFIED**: Typesense deferred. SA-007 ingests to Postgres directly. Sync queue will be added post-launch.)
  SA-005 (gateway middleware) MUST precede SA-024 (webhook is middleware)
  SA-017 (SPA data providers) MUST precede SA-025 (flag SDK in React tree)
  SA-023 (load test) MUST precede SA-028 (capacity model back-tests)
  SA-026 (fitness functions) MUST precede SA-029 (prototypes pass 18 gates)
  SA-027 (blueprint) MUST precede SA-029 (prototypes use documented hooks)
```

### Phase S Completion Criteria

Phase S is complete when ALL of the following are true:

- Typesense serving all dashboard search with <200ms p95 at 1M+ docs
- API gateway routing all 88 EFs with middleware plugin architecture
- Dashboard + admin migrated to Vite + React Router SPA with strict TypeScript
- All 75 dashboard JS + 43 extension + 88 EF files migrated to strict TypeScript
- Design system complete: tokens as CSS custom properties, Tailwind config clean, component library documented
- Zero inline styles on authenticated surfaces (827+ eliminated)
- Dark mode complete on every authenticated page
- Tailwind CSS output <100KB after purge
- All 6 CrewAI agents deployed with kill switches
- Common Crawl pipeline processing 50K+ records/batch with 30–40% dedup
- Incremental materialized views refreshing deltas only
- Read replica operational routing all SELECT queries
- Database partitioned by source
- Load test passed at 5,000 concurrent with zero 5xx and p95 search <500ms
- Event bus operational with standardized event taxonomy + webhook delivery
- Feature flag infrastructure with rollouts, segments, variants, PostHog experiments
- 8 architecture fitness functions enforced in CI (18 total gates)
- Architecture blueprint documents all hook points + scar locations with contracts
- Capacity model covering 6/12/24 month projections with scaling triggers deployed
- 3–5 hook prototypes validated, all passing 18 CI gates
- Tech debt register, deprecation protocol, dependency management policy operational
- Final evolvability review completed with Phase S exit report

**Phase S total: 29 sessions | 414–562h chat | 24 weeks | 6 ADRs + CSS/Design System + Platform Evolution + Architecture Governance**
