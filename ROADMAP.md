# Brilliant Jobs — Architecture Hardening Roadmap

**Last updated:** 2026-02-19
**Target launch:** March 2026
**Total Phase A estimate:** ~19h (revised to ~16.5h after A1/A2 audit)

---

## Phase A: Pre-Launch Critical

### Sprint 1: Security Foundation ✅ COMPLETE (2026-02-19)

| # | Item | Est. | Actual | Status | Agent | Notes |
|---|------|------|--------|--------|-------|-------|
| A1 | Run migration 001 (RLS on ats_jobs) | 30min | 0min | ✅ Done | Data Architect + Sentinel | Already applied prior to sprint. Verified: `authenticated` SELECT, `service_role` ALL. |
| A2 | Enable RLS on ALL remaining tables | 2h | 30min | ✅ Done | Sentinel + Data Architect | Audit found RLS already enabled on all 20 tables. Added 6 missing policies: DELETE on `connections`/`companies`, service INSERT/ALL on `notification_log`, `notification_actions`, `location_cache`. |
| A9 | Add security headers to vercel.json | 30min | 15min | ✅ Done | Sentinel | Commit `6962109b`. Added CSP, HSTS (2yr+preload), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy, X-XSS-Protection. CSP allowlists self + Supabase + CDNs + PostHog. |
| A10 | Add DOMPurify for XSS protection | 1h | 45min | ✅ Done | Sentinel | Commits `33d77372` (dashboard.html), `91936b67` (keywords.js). DOMPurify 3.2.4 from cdnjs. Sanitizes all 5 innerHTML injection points for ATS-sourced job description HTML. |

**Sprint 1 totals:** Estimated 4h → Actual ~1.5h. Vercel deploy triggered.

**Decisions:**
- CSP includes `unsafe-inline`/`unsafe-eval` — required by vanilla JS dashboard. Tighten to nonce-based post-launch.
- PostHog domains pre-added to CSP for A13.
- DOMPurify config: `{ USE_PROFILES: { html: true }, ADD_ATTR: ['target'] }` — allows formatting, strips scripts/handlers.

---

### Sprint 2: Schema Foundations (Next)

| # | Item | Est. | Actual | Status | Agent | Review By |
|---|------|------|--------|--------|-------|-----------|
| A3 | Add `role` and `plan` to profiles | 1h | 15min | ✅ Done | Data Architect | Sentinel (RLS) |
| A11 | Create plans + subscriptions tables | 2h | 20min | ✅ Done | Data Architect | Sentinel + Performance + CRE (adversarial) |
| A4 | Create audit_log table | 1h | 15min | ✅ Done | Data Architect | Sentinel (access policies) |
| A5 | Add idempotency keys to notification tables | 1h | 10min | ✅ Done | Data Architect | CRE (dedup verification) |

**Dependencies:** A3 → A11 → A12. A4 benefits from A3 (role column for admin read policy).

---

### Sprint 3: Feature Gating + Resilience

| # | Item | Est. | Actual | Status | Agent | Review By |
|---|------|------|--------|--------|-------|-----------|
| A12 | Implement feature gating RPC | 2h | — | 🔲 Queued | Data Architect | Sentinel + Performance |
| A6 | Add timeouts + retries to all external calls | 3h | — | 🔲 Queued | CRE | Performance (backoff tuning) |

**Dependencies:** A12 depends on A3 + A11.

---

### Sprint 4: Observability

| # | Item | Est. | Actual | Status | Agent | Review By |
|---|------|------|--------|--------|-------|-----------|
| A8 | Set up structured logging in Edge Functions | 2h | — | 🔲 Queued | CRE | Data Architect (code consistency) |
| A7 | Create health check endpoint | 1h | — | 🔲 Queued | CRE | — |
| A13 | Add PostHog tracking | 2h | — | 🔲 Queued | Data Architect | Sentinel (data exposure) |

**Dependencies:** A8 → A7 (health check uses structured logging). A13 is independent but lowest priority — deferrable to week 1 post-launch if needed.

---

## Phase B: Post-Launch Foundation (Month 1-2)

| # | Item | Est. | Status |
|---|------|------|--------|
| B1 | Migrate localStorage data to Supabase | 8h | 🔲 |
| B2 | Create job_queue table + worker pattern | 4h | 🔲 |
| B3 | Move email/SMS sending through queue | 4h | 🔲 |
| B4 | Add soft deletes to user tables | 2h | 🔲 |
| B5 | Add usage_events tracking | 3h | 🔲 |
| B6 | Create data export endpoint | 3h | 🔲 |
| B7 | Create account deletion flow | 3h | 🔲 |
| B8 | Set up Supabase CLI migrations | 2h | 🔲 |
| B9 | Create baseline migration | 4h | 🔲 |
| B10 | Add missing indexes | 2h | 🔲 |
| B11 | Set up monitoring + alerts | 3h | 🔲 |
| B12 | Stripe integration | 8h | 🔲 |

---

## Phase C: Scale Readiness (Month 3-6)

| # | Item | Est. | Status |
|---|------|------|--------|
| C1 | Move resumes to Supabase Storage | 4h | 🔲 |
| C2 | Add orphaned file cleanup | 2h | 🔲 |
| C3 | Set up staging environment | 4h | 🔲 |
| C4 | CI/CD pipeline for migrations | 3h | 🔲 |
| C5 | Add feature flags table | 2h | 🔲 |
| C6 | Implement rate limiting | 3h | 🔲 |
| C7 | Correlation IDs across all functions | 3h | 🔲 |
| C8 | Containerize build | 2h | 🔲 |
| C9 | Pagination audit + fix all unbounded queries | 3h | 🔲 |
| C10 | Server-side caching (materialized views) | 3h | 🔲 |

---

## Changelog

| Date | Items | Summary |
|------|-------|---------|
| 2026-02-19 | A1, A2, A9, A10 | Sprint 1 complete. RLS verified + hardened on all 20 tables. Security headers deployed. DOMPurify XSS protection on job descriptions. |
| 2026-02-19 | A3, A4, A5, A11 | Sprint 2 complete. Profiles have role/plan columns (Marston = admin). Audit log table created (append-only, admin-readable). Idempotency keys on notification tables. Plans/subscriptions schema seeded with Free/Pro/Enterprise tiers. |
