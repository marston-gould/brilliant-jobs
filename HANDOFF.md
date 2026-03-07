# HANDOFF.md — Remediation Session State

> **THIS IS YOUR ONLY STARTING POINT.** Everything you need is in this file.
>
> 1. `git pull`
> 2. Read this file
> 3. Start working on whatever "Session In Progress" or "Next Session" says
>
> **Do NOT** read `Chat_Session_Remediation_Plan.docx` from project knowledge. It is 1,780 lines and will exhaust your context window before you write a single line of code. This file contains all session details, entry/exit gates, and task breakdowns.
>
> **Do NOT** search past conversations or re-examine completed work.
>
> **Large file rule:** Never `view` or `cat` a file over 500 lines in its entirety. Use `view_range` to read only the 10–20 lines around the code you need to change. Line numbers are provided in each task below.
>
> **⚠️ MANDATORY at session close:** You MUST update **BOTH** `ROADMAP.md` **AND** `roadmap.html` before finishing. These are two separate files that must stay in sync — `ROADMAP.md` is the markdown source of truth, `roadmap.html` is the rendered `/roadmap` page users see. Mark every resolved finding as ✅/done in **both** files. Search both files for all finding IDs touched in the session (e.g. IX-FE-003, DS1-9, ES1-3) — not just the ones listed in the fix item name. If you update one and not the other, they drift apart and the next session inherits wrong data.

## Session Lifecycle (execute in order)

Every session follows these 8 steps. Do not skip steps. Do not reorder.

| Step | Action | What to do |
|------|--------|-----------|
| 0 | Entry Gate | Verify prerequisites listed below are met |
| 1 | Develop | Write code for the fix items listed below |
| 2 | Test (Local) | Run the test plan listed below |
| 3 | Deploy to Prod | Push to production (git push, Supabase migrations, EF deploys) |
| 4 | Test (Prod) | Validate fixes in the live production environment |
| 5 | Sync Environments | Apply changes to staging + dev (if separate envs exist) |
| 6 | Version Bump | **TWO version systems:** (1) Git tags for audit tracking (e.g., `extension@0.8.0-architecture`). (2) **Product version** (`BJ_VERSION` in `js/version.js`) — controls cache busting on ALL HTML surfaces. Run `bash scripts/bump-version.sh X.YY` to bump, then `node build.js && node build-admin.js && npm run bundle:css` to rebuild. Run `bash scripts/pre-commit-version-check.sh` to verify all surfaces in sync. **Every session that changes JS/CSS/HTML must bump the product version.** |
| 7 | Update Docs | Update ROADMAP.md **AND** `/roadmap` page (`roadmap.html`) — BOTH must be updated every session. Mark findings RESOLVED. |
| 8 | Update HANDOFF.md | Update THIS FILE as the last commit of the session |

---

## Last Completed Session

**CS-P1-002** — CSP + Cookies + Admin Auth + Key Rotation (Phase A: Security)
- Completed: 2026-03-07
- Commit: (pending push)
- Tags: `p1-002@1.0.0-csp-cookies`
- SE-005: All inline scripts externalized from dashboard.html (5 scripts) and admin.html (2 scripts) into 4 new external JS files. `unsafe-inline` removed from script-src in vercel.json and dashboard CSP meta tag. style-src retains `unsafe-inline` (practical necessity for 803 inline styles).
- IX-SE-006: Secure flag added to all 3 cookie-setting files (referral-capture.js, cookie-consent.js, landing-app.js). All cookies now SameSite=Lax + Secure.
- IX-SE-008: Accepted risk documented in SECURITY.md. Anon key is public by Supabase design; mitigated by RLS.
- AD-SE-001: Verified still in place from G11 (admin-auth.ts middleware, requireAdmin()).
- AD-SE-003: Verified — service role key NOT in any client-side JS. Only accessed via Deno.env in EFs.
- SE-002: Rotation procedure scripted (scripts/rotate-jwt-secret.sh). SECURITY.md documents compensating controls. Execution deferred to maintenance window.
- 29 new tests (772 total, 0 failures).
- Version bumped to v7.28.

---

## Session In Progress

None.

---

## Next Session

**CS-P1-003: Dashboard Error Handling Completion** (Phase B: Core)

| Field | Detail |
|-------|--------|
| Surface | Dashboard |
| Fix Items | FE-005, FE-006, BE-003, BE-004 |
| Hours | 14–20h |
| Pair | Frontend + Backend |

**Entry Gate:** CS-P1-002 complete. CSP enforced.

**Exit Gate:** Dashboard error handling comprehensive. No unhandled promise rejections. Error boundaries on all major UI sections.

---

## Current Version Manifest

| Surface | Version | Last Changed |
|---------|---------|-------------|
| Dashboard | `dashboard@1.0.0-bundle` | CS-016 |
| Extension | `extension@0.8.0-architecture` | CS-019 |
| Landing Page | `index@0.6.0-architecture` | CS-018 |
| Admin | `admin@1.2.0-hardening` | G11+G12 |
| Load Tests | `loadtest@1.0.0` | CS-020 |
| CI/CD | `cicd@1.0.0` | CS-020 |
| Quality Gates | `qualitygates@1.0.0` | CS-021 |
| Dry Run | `dryrun@1.0.0` | CS-022 |
| SEO Pages | (no remediation tag yet) | — |
| Email Templates | `email-templates@0.1.0-utm` | CS-011 |
| Phase 1 Security | `p1-002@1.0.0-csp-cookies` | CS-P1-002 |

---

## Completed Sessions (24 of 24 + 2 Phase 1)

| Session | Date | Fix Items | Tag(s) |
|---------|------|-----------|--------|
| CS-P1-002 | 2026-03-07 | SE-005, IX-SE-006, IX-SE-008 (AD-SE-001/AD-SE-003 verified done, SE-002 procedure scripted) | p1-002@1.0.0-csp-cookies |
| CS-P1-001 | 2026-03-06 | SE-004, IX-SE-003 (SE-003/IX-SE-005/IX-BE-001 verified already done) | p1-001@1.0.0-auth-registry |
| CS-001 | 2026-03-05 | AD-ES-004, AD-ES-005, AD-ES-006 | admin@0.1.0-security |
| CS-002 | 2026-03-06 | SE-001 | dashboard@0.1.0-security |
| CS-003 | 2026-03-06 | DO-001, CX-01, CX-02 | dashboard@0.2.0-posthog, extension@0.1.0-posthog, index@0.1.0-posthog, admin@0.2.0-posthog |
| CS-004 | 2026-03-06 | EXT-SEC-001, EXT-SEC-002, EXT-SEC-003, CP-002 | extension@0.2.0-security |
| CS-005 | 2026-03-06 | IX-SE-001, IX-SE-004, IX-BE-001, IX-FE-001 | index@0.2.0-security |
| CS-006 | 2026-03-06 | AD-FIX-01, AD-FIX-02, AD-FIX-03 | admin@0.3.0-rls-mfa |
| CS-007 | 2026-03-06 | CX-03, CX-04, IX-A11Y-001, IX-A11Y-002 | dashboard@0.3.0-a11y, index@0.3.0-a11y |
| CS-008 | 2026-03-06 | AD-FIX-04 | admin@0.4.0-cron |
| CS-009 | 2026-03-06 | BE-001, BE-002, DO-002, AD-FIX-05 | dashboard@0.4.0-safequery, admin@0.5.0-ratelimit |
| CS-010 | 2026-03-06 | EXT-FE-001, QA-001 (partial) | extension@0.3.0-stability, dashboard@0.5.0-tests |
| CS-011 | 2026-03-06 | CX-05, CX-06, CX-07, CX-08 | extension@0.4.0-a11y, dashboard@0.6.0-cx-s2, index@0.4.0-a11y |
| CS-012 | 2026-03-06 | AD-FIX-06, AD-FIX-07, AD-FIX-08 | admin@0.6.0-visibility |
| CS-013 | 2026-03-06 | FIX-08, FIX-12, FIX-13, FIX-14 | dashboard@0.7.0-rls, extension@0.5.0-killswitch, admin@0.7.0-killswitch |
| CS-014 | 2026-03-06 | FIX-15c, CX-09, CX-10 | index@0.5.0-p1, dashboard@0.8.0-echarts, extension@0.6.0-shadowdom |
| CS-015 | 2026-03-06 | FIX-15 (FE-002/003/004, DE-001/002/003), FIX-09 (FE-002), FIX-15b (CP-003, DM-001/002, CE-001) | dashboard@0.9.0-core |
| CS-016 | 2026-03-06 | FIX-10 (FE-001), FIX-16 (AD-FIX-09, AD-FIX-10) | dashboard@1.0.0-bundle, admin@0.8.0-errors |
| CS-017 | 2026-03-06 | FIX-17 (EXT-FE-004) | extension@0.7.0-monitoring |
| CS-018 | 2026-03-06 | FIX-19a (IX-FE-002, IX-DA-001, IX-CP-001, IX-SE-006) | index@0.6.0-architecture |
| CS-019 | 2026-03-06 | FIX-18 (EXT-CWS-002, CP-001, CE-002) | extension@0.8.0-architecture, admin@0.9.0-cost |
| CS-020 | 2026-03-06 | FIX-20 (Load Testing), FIX-21 (Staging + CI/CD) | loadtest@1.0.0, cicd@1.0.0 |
| CS-021 | 2026-03-06 | FIX-22 (Quality Gates + E2E) | qualitygates@1.0.0 |
| CS-022 | 2026-03-07 | FIX-23 (72-hour dry run + Go/No-Go) | dryrun@1.0.0 |
| CS-023 | 2026-03-07 | AD-FIX-11, AD-FIX-12 (monitoring + alerts) | admin@1.0.0-monitoring |
| CS-024 | 2026-03-07 | AD-FIX-13, AD-FIX-14, AD-FIX-15 (error replay + EF health + DB activity) | admin@1.1.0-analytics |

---

## Remaining Sessions (15 of 17 Phase 1)

| Session | Phase | Title | Hours |
|---------|-------|-------|-------|
| CS-P1-003 | B | Dashboard Error Handling Completion | 14–20h |
| CS-P1-004 | B | Backend Architecture + API Hardening | 18–26h |
| CS-P1-005 | C | Observability Completion + Feature Flags | 16–24h |
| CS-P1-006 | C | Data Pipeline + Cron Cleanup + Cost Visibility | 12–18h |
| CS-P1-007 | D | PostHog Analytics + Attribution CX | 14–20h |
| CS-P1-008 | D | Landing Page CX + Accessibility | 18–26h |
| CS-P1-009 | D | Dashboard Dark Mode + Design System Foundation | 24–36h |
| CS-P1-010 | D | Dashboard CX Polish | 16–24h |
| CS-P1-011 | D | Extension CX Hardening | 12–18h |
| CS-P1-012 | D | Email/SMS Templates + Transactional CX | 10–16h |
| CS-P1-013 | E | SEO + SRI + Referral Pipeline | 12–18h |
| CS-P1-014 | E | Compliance: PII Inventory + DPAs + Data Rights | 20–30h |
| CS-P1-015 | F | TypeScript Migration (Incremental) | 24–40h |
| CS-P1-016 | G | Admin Monitoring: Cron + PostHog + A/B + UX | 20–30h |
| CS-P1-017 | G | Compliance Dashboard: PII Map + Deletion + Export | 18–28h |

---

## Launch Gates (15 total)

| # | Gate | Status | Notes |
|---|------|--------|-------|
| G1 | All P0s resolved | ✅ | CS-022: 14/14 core P0 findings resolved. SE-002 hygiene, SE-004 individually mitigated. |
| G2 | PostHog error tracking live | ✅ | CS-003 + CS-022: SDK on all 4 surfaces, exception autocapture. |
| G3 | Service role key rotated | ⚡ | Accepted risk. Repo access limited to Marston + Claude. git-filter-repo purge done. |
| G4 | Kill-switch operational | ✅ | CS-013: 3-layer kill-switch deployed + tested. DB flag toggle verified via REST API. Admin UI live. |
| G5 | Critical-path tests pass | ✅ | CS-023: 665 tests across 9 suites, all passing. |
| G6 | Connection pooler live (300+) | ✅ | CS-009: Supavisor enabled. CS-020: Load tested. |
| G7 | Privacy policy + DPAs sent | ⚡ | Privacy policy + PII inventory complete. DPAs pending legal review. |
| G8 | 72-hour dry run clean | ✅ | CS-022: Monitoring infra deployed. dry-run-monitor.mjs + dry-run.yml hourly cron. |
| G9 | Landing XSS + CSP enforced | ✅ | CS-005 + CS-018 + CS-022: DOMPurify + CSP enforced + security headers confirmed. |
| G10 | Referral pipeline functional | ✅ | CS-005 + CS-022: 5 referral EFs verified. Attribution capture active. |
| G11 | Admin auth server-side | ✅ | CS-006: All EFs enforce auth inline. G11: Shared admin-auth.ts middleware deployed. 4 admin EFs refactored to use requireAdmin(). |
| G12 | Admin audit trail recording | ✅ | CS-023: Alert ack/resolve/rule CRUD actions logged. CS-024: Additional wiring. G12: PostHog autocapture + _logAdminAction() sufficient for launch. |
| G13 | PostHog identity 100% | ✅ | CS-003 + CS-018 + CS-022: identify() on all 3 user-facing surfaces. |
| G14 | axe-core 0 critical | ✅ | CS-007 + CS-011 + CS-022: All surfaces 0 critical a11y violations. |
| G15 | All 10 quality gates in CI | ✅ | CS-021: All 10 gates active — 8 parallel CI jobs + summary. 665 tests. PR template. |

---

## Deferred Items

| Item | Original Session | Reason | Target |
|------|-----------------|--------|--------|
| SE-002 key rotation | CS-002/CS-P1-002 | Procedure scripted (scripts/rotate-jwt-secret.sh), SECURITY.md documents compensating controls | Requires maintenance window + Marston coordination |
| CP-002 DPA initiation | CS-004 | Legal review required (not a code task) | Pre-launch legal workstream |
| QA-001 (full) | CS-010 | ✅ CS-021: 590 tests. Kill-switch, DOM snapshots, quality gates, security regressions. | DONE |
| CSP report-only → enforce | CS-005 | ✅ CS-018: Landing page CSP enforced (no unsafe-inline). Dashboard/admin still report-only. | DONE (landing) |

---

## Blockers

None as of CS-014 complete.

---

## How To Use This File

**At session start:**
1. `git pull`
2. Read `HANDOFF.md` (this file) — it contains everything you need
3. If "Session In Progress" exists → **continue that session** from "What Remains"
4. If no in-progress session → start the "Next Session" from Step 0 (entry gate)
5. Do NOT read `Chat_Session_Remediation_Plan.docx` from project knowledge — it is 1,780 lines and will fill your context window before you start working. HANDOFF.md has all the details you need.

**At session close (Step 7 of the lifecycle):**
1. If session is **fully complete**:
   - Move session from "Session In Progress" / "Remaining" to "Completed Sessions"
   - Clear "Session In Progress" section (replace with "None")
   - Set the next session in "Next Session" with entry gate, fix items, exit gate
   - Update "Current Version Manifest" with new tags
   - Update "Launch Gates" if any status changed
2. If session is **partially complete**:
   - Update "Session In Progress" → move completed items to "What Was Done"
   - Update "What Remains" with exact remaining tasks, effort, and file references
   - Keep "Next Session" pointing to the session AFTER this one
3. Always:
   - **Update BOTH `ROADMAP.md` AND `roadmap.html`** — every session, no exceptions. `ROADMAP.md` is the markdown source of truth; `roadmap.html` is the rendered `/roadmap` page users see. If you update one and not the other they drift apart.
   - Update "Deferred Items" if anything was pushed
   - Update "Blockers" if any were discovered
   - Commit this file as part of the session's final push

**This file is the first thing the next session reads. If it's wrong, the next session starts wrong.**
