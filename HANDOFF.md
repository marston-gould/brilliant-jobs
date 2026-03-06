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
| 6 | Version Bump | Apply git tags listed in the session details below |
| 7 | Update Docs | Update ROADMAP.md **AND** `/roadmap` page (`roadmap.html`) — BOTH must be updated every session. Mark findings RESOLVED. |
| 8 | Update HANDOFF.md | Update THIS FILE as the last commit of the session |

---

## Last Completed Session

**CS-019** — Extension Architecture: Privacy Policy + PII Inventory + Cost Dashboard (FIX-18)
- Completed: 2026-03-06
- Commit: `f614247`
- Tags: `extension@0.8.0-architecture`, `admin@0.9.0-cost`
- Fix items resolved: FIX-18 (EXT-CWS-002, CP-001, CE-002)
- Notes: Privacy policy linkage — homepage_url in manifest, popup link, privacy.html updated with all 9 vendors + DPA ref + consent ref. PII inventory — docs/PII_INVENTORY.md maps all tables by sensitivity, extension storage, third-party sharing, Edge Function flows, deletion cascades, review schedule. Cost dashboard budget alerts — vendor_cost_budgets table, admin progress bars (green/yellow/red), budget edit form, chart budget line. 36 new tests (323 total).

---

## Session In Progress

None.

---

## Next Session

**CS-020** — Load Testing + Staging Environment + CI/CD (FIX-20, FIX-21)

| Field | Detail |
|-------|--------|
| Surface | All Surfaces |
| Fix Items | FIX-20 (Load Testing), FIX-21 (Staging + CI/CD) |
| Phase | Phase 5: Validation + Launch |
| Pair | DevOps + QA + Eng Lead |
| Expected tags | TBD |

### Entry Gate (verify before starting)

- [x] CS-019 complete — Privacy + PII + Cost deployed → `extension@0.8.0-architecture`, `admin@0.9.0-cost`
- [x] CS-013 complete — Kill-switch operational (safety valve during load test)
- [x] All P0 fixes deployed

### What To Build

1. **FIX-20**: Load test at 1,200 concurrent users — dashboard API, extension heartbeat/scan, landing preview-jobs, admin concurrent access
2. **FIX-21**: Staging environment mirrors prod. Automated deploy pipeline (Vercel). Automated extension build + hosting pipeline.

### Exit Gate

- No P0-class failures under load
- p95 response <2s
- Error rate <0.1%
- Extension heartbeat stable under load
- Landing preview-jobs rate limit holds
- Staging mirrors prod config
- CI/CD pipeline operational

---

## Current Version Manifest

| Surface | Version | Last Changed |
|---------|---------|-------------|
| Dashboard | `dashboard@1.0.0-bundle` | CS-016 |
| Extension | `extension@0.8.0-architecture` | CS-019 |
| Landing Page | `index@0.6.0-architecture` | CS-018 |
| Admin | `admin@0.9.0-cost` | CS-019 |
| SEO Pages | (no remediation tag yet) | — |
| Email Templates | `email-templates@0.1.0-utm` | CS-011 |

---

## Completed Sessions (19 of 24)

| Session | Date | Fix Items | Tag(s) |
|---------|------|-----------|--------|
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

---

## Remaining Sessions (5 of 24)

| Session | Fix Items | Phase | Notes |
|---------|-----------|-------|-------|
| CS-020 | FIX-20, FIX-21 | Phase 5: Validation + Launch |  |
| CS-021 | FIX-22 + Quality Gates | Phase 5 |  |
| CS-022 | FIX-23 (72-hour dry run + Go/No-Go) | Phase 5 |  |
| CS-023 | AD-FIX-11, AD-FIX-12 | Post-Launch: Admin Monitoring |  |
| CS-024 | AD-FIX-13, AD-FIX-14, AD-FIX-15 | Post-Launch: Admin Monitoring |  |

---

## Launch Gates (15 total)

| # | Gate | Status | Notes |
|---|------|--------|-------|
| G1 | All P0s resolved | 🔲 | |
| G2 | PostHog error tracking live | ⚡ | CS-003: deployed, needs prod verification |
| G3 | Service role key rotated | 🔲 | SE-002 downgraded to hygiene |
| G4 | Kill-switch operational | ✅ | CS-013: 3-layer kill-switch deployed + tested. DB flag toggle verified via REST API. Admin UI live. |
| G5 | Critical-path tests pass | 🔲 | |
| G6 | Connection pooler live (300+) | 🔲 | CS-009: Supavisor enabled, needs load test |
| G7 | Privacy policy + DPAs sent | ⚡ | CS-019: Privacy policy updated (9 vendors, DPA ref, consent ref). Extension manifest + popup linked. PII inventory complete. DPAs pending legal. |
| G8 | 72-hour dry run clean | 🔲 | CS-022 |
| G9 | Landing XSS + CSP enforced | ✅ | CS-005: DOMPurify + CSP deployed. CS-018: unsafe-inline removed from landing page CSP. Zero inline scripts. |
| G10 | Referral pipeline functional | 🔲 | CS-005: stale key fixed |
| G11 | Admin auth server-side | ⚡ | CS-006: RLS + MFA + role checks; shared middleware pending |
| G12 | Admin audit trail recording | ⚡ | CS-012: _logAdminAction() wired to 5 action categories. CS-015: pgAudit extension enabled (DDL + write). |
| G13 | PostHog identity 100% | ✅ | CS-003: identify() on dashboard + extension. CS-018: identify() on landing showLoggedIn(). All 3 surfaces covered. |
| G14 | axe-core 0 critical | ⚡ | CS-007 + CS-011: dashboard + landing + extension addressed |
| G15 | All 10 quality gates in CI | 🔲 | CS-021 |

---

## Deferred Items

| Item | Original Session | Reason | Target |
|------|-----------------|--------|--------|
| SE-002 key rotation | CS-002 | Downgraded to hygiene — repo only accessed by Marston + Claude | Bundled with future config session |
| CP-002 DPA initiation | CS-004 | Legal review required (not a code task) | Pre-launch legal workstream |
| QA-001 (full) | CS-010 | 64 tests written; full E2E deferred | CS-021 |
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
