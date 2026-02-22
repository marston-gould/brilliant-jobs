# Brilliant Jobs — Architecture Hardening Roadmap

**Last updated:** 2026-02-22
**Target launch:** March 2026
**Current version:** v3.40

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
| M1 | Deploy `health-check` Edge Function: `supabase functions deploy health-check --no-verify-jwt` | CEO | ✅ |
| M2 | Deploy updated `send-notification`, `refresh-jobs`, `validate-signup` Edge Functions | CEO | ✅ |
| M3 | Create PostHog project → set `window.POSTHOG_API_KEY` in globals.js | CEO | 🔲 |
| M4 | Verify Vercel deploy completed (security headers + DOMPurify live) | CEO | 🔲 |

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
| B12 | Stripe integration | 8h | ⏳ | Deferred — awaiting Stripe account + pricing confirmation |

**Phase B total estimate:** ~46h | **Actual:** ~3h | **Status:** 11/12 complete (B12 deferred)

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
| D11 | Data pages: live data + security | 4d | 2h | ✅ | All 5 data pages converted to live Supabase RPC calls with localStorage caching (24h TTL). Methodology footers on all pages. 15 RPCs already existed; wired hiring-trends, career-level-data, salary-data, jobs-by-industry, market-dynamics. v3.39. |

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
| E18 | AI filter from hidden jobs | v3.27 | ✅ | "Improve" button → Claude Haiku suggests WHAT NOT/WHERE NOT/WHO NOT terms. |
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

**Phase E total: 43 items across 6 sprints, all complete. Version range: v2.68 → v3.45.**

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

## Changelog

| Date | Sprint | Items | Summary |
|------|--------|-------|---------|
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
