# Brilliant Jobs — Architecture Hardening Roadmap

**Last updated:** 2026-02-20
**Target launch:** March 2026

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
| M1 | Deploy `health-check` Edge Function: `supabase functions deploy health-check --no-verify-jwt` | CEO | 🔲 |
| M2 | Deploy updated `send-notification`, `refresh-jobs`, `validate-signup` Edge Functions | CEO | 🔲 |
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
| D3 | Landing Page Phase 1 | 4d | 1h | ⏳ | Interactive preview (replaces static demo), hero ghost CTA, walkthrough carousel (6 slides), 8 PostHog events. **Blocked:** preview-jobs Edge Function deploy + 5 screenshot assets. |
| D4 | Cohort Phase B — Session Analytics | 2d | 30min | ✅ | Migration 005: user_sessions table + RLS. create_session/session_heartbeat RPCs. PostHog bridge (bj_session_id, bj_cohort_id, bj_plan_id super properties). sessionStorage-scoped, 5-min heartbeat. |
| D5 | Edge Function: refresh-jobs update | 0.5d | — | 🔲 | Patch to record last_http_status + last_refresh_at on every board fetch. Timeout → status 0. Deploy via Supabase CLI. |
| D6 | Edge Function: preview-jobs | 0.5d | — | 🔲 | New function for landing page preview. Source committed. Deploy via Supabase CLI. |
| D7 | Walkthrough screenshots (5x) | 0.5d | — | 🔲 | CPO: feed.webp, match.webp, stats.webp, pipeline.webp, notifications.webp → /img/walkthrough/ |

**Phase D status:** 4/7 complete. 3 pending items are operator tasks (Edge Function deploys + screenshots).

---

## Changelog

| Date | Sprint | Items | Summary |
|------|--------|-------|---------|
| 2026-02-20 | D-S1 | D1 | Stats page redesign: theme token extraction, CSS loading state, inline style removal. 3 commits. |
| 2026-02-20 | D-S2 | D2 | Admin panel: board health metrics. Migration 004, 2 admin RPCs, admin page with stat cards + platform table. 6 commits. |
| 2026-02-20 | D-S3 | D3 | Landing page Phase 1: interactive preview, walkthrough carousel, 8 PostHog events. 3 commits. Pending: EF deploy + screenshots. |
| 2026-02-20 | D-S4 | D4 | Cohort Phase B: session analytics. Migration 005, user_sessions table, PostHog bridge. 2 commits. |
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
