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

**CS-014** — Landing Page P1s + CX Sprint 3 Start (CSS + Shadow DOM)
- Completed: 2026-03-06
- Commit: `447051e`
- Tags: `index@0.5.0-p1`, `dashboard@0.8.0-echarts`, `extension@0.6.0-shadowdom`
- Fix items resolved: FIX-15c (IX-FE-003, IX-FE-004, IX-A11Y-001/002, IX-BE-002, IX-BE-004), CX-09, CX-10
- Notes: 12 landing catches wired to PostHog via bjError(). Loading/error/retry on 3 async flows. Stats staleness badge. Profile check 10s timeout + retry. ECharts lazy-loaded on Stats tab. Extension overlays in Shadow DOM. 98 inline styles extracted to landing.css (4 remain). 1024px + 768px responsive breakpoints.

---

## Session In Progress

None.

---

## Next Session

**CS-015** — Dashboard Core Fixes + Extension Hardening + Landing P2s

| Field | Detail |
|-------|--------|
| Surface | Dashboard + Extension + Landing Page |
| Fix Items | FIX-15 (FE-002/003, BE-003/004/005), FIX-09, FIX-15b |
| Hours | 30–45h |
| Pair | Frontend + Backend + Security |
| Expected tags | dashboard@0.9.0-core, extension@0.7.0-hardening, index@0.6.0-p2 |

### Entry Gate (verify before starting)

- [x] CS-013 complete — RLS deployed → `dashboard@0.7.0-rls`
- [x] CS-014 complete — Landing P1s + ECharts lazy load + Shadow DOM → `index@0.5.0-p1`

### What To Build

1. **FIX-15**: Dashboard core fixes — stale cache invalidation, error boundary improvements, retry logic for failed queries.
2. **FIX-09**: Extension selector hardening — resilient to DOM changes on target sites.
3. **FIX-15b**: Landing page P2 fixes — remaining console-only warnings, minor UX polish.

### Exit Gate

- Dashboard error boundaries operational
- Extension selector hardening verified on 3+ ATS platforms
- Landing page P2 findings addressed
- All existing tests still passing

---

## Current Version Manifest

| Surface | Version | Last Changed |
|---------|---------|-------------|
| Dashboard | `dashboard@0.8.0-echarts` | CS-014 |
| Extension | `extension@0.6.0-shadowdom` | CS-014 |
| Landing Page | `index@0.5.0-p1` | CS-014 |
| Admin | `admin@0.7.0-killswitch` | CS-013 |
| SEO Pages | (no remediation tag yet) | — |
| Email Templates | `email-templates@0.1.0-utm` | CS-011 |

---

## Completed Sessions (14 of 24)

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

---

## Remaining Sessions (10 of 24)

| Session | Fix Items | Phase | Notes |
|---------|-----------|-------|-------|
| CS-015 | FIX-15, FIX-09, FIX-15b | Phase 3 | Requires CS-013 complete (RLS deployed) |
| CS-016 | FIX-10 (FE-001), FIX-16 | Phase 4: Code Quality + Architecture |  |
| CS-017 | FIX-17 | Phase 4 |  |
| CS-018 | FIX-19a | Phase 4 |  |
| CS-019 | FIX-18 | Phase 4 |  |
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
| G7 | Privacy policy + DPAs sent | ⚡ | Policy published; DPA initiation pending legal |
| G8 | 72-hour dry run clean | 🔲 | CS-022 |
| G9 | Landing XSS + CSP enforced | 🔲 | CS-005: DOMPurify + CSP headers deployed; CSP enforce pending |
| G10 | Referral pipeline functional | 🔲 | CS-005: stale key fixed |
| G11 | Admin auth server-side | ⚡ | CS-006: RLS + MFA + role checks; shared middleware pending |
| G12 | Admin audit trail recording | ⚡ | CS-012: _logAdminAction() wired to 5 action categories |
| G13 | PostHog identity 100% | ⚡ | CS-003: identify() wired; needs prod verification |
| G14 | axe-core 0 critical | ⚡ | CS-007 + CS-011: dashboard + landing + extension addressed |
| G15 | All 10 quality gates in CI | 🔲 | CS-021 |

---

## Deferred Items

| Item | Original Session | Reason | Target |
|------|-----------------|--------|--------|
| SE-002 key rotation | CS-002 | Downgraded to hygiene — repo only accessed by Marston + Claude | Bundled with future config session |
| CP-002 DPA initiation | CS-004 | Legal review required (not a code task) | Pre-launch legal workstream |
| EXT-FE-004 (full) | CS-010 | Partial coverage; full selector hardening deferred | CS-013+ |
| QA-001 (full) | CS-010 | 64 tests written; full E2E deferred | CS-021 |
| CSP report-only → enforce | CS-005 | Deployed in report-only; enforce pass pending | CS-014 or CS-019 |

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
