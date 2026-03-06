# HANDOFF.md — Remediation Session State

> **Read this file first.** Do not search past conversations. Do not re-examine completed work.
> `git pull`, read this file, execute the next session per `Chat_Session_Remediation_Plan.docx` in project knowledge.

---

## Last Completed Session

**CS-012** — Admin Cron Panel + Audit Trail + Biz-Ops Tables
- Completed: 2026-03-06
- Commit: `ec6cbd1`
- Tag: `admin@0.6.0-visibility`
- Fix items resolved: AD-FIX-06, AD-FIX-07, AD-FIX-08

---

## Next Session

**CS-013** — Dashboard RLS + Extension Retry/Timeout + Kill-Switch

| Field | Detail |
|-------|--------|
| Surface | Dashboard + Extension + Admin |
| Fix Items | FIX-08 (RLS), FIX-12 (EXT-BE-002/004), FIX-13 (EXT-FEAT-001), FIX-14 (EXT-SEC-004) |
| Hours | 28–46h |
| Pair | Security + Backend + Frontend + Eng Lead |
| Expected tags | dashboard@0.7.0-rls, extension@0.5.0-killswitch, admin@0.7.0-killswitch |

### Entry Gate (verify before starting Step 1)

- [ ] CS-009 complete — safeQuery wired, RLS changes safe → **YES** (commit `01b9adc`)
- [ ] CS-010 complete — extension tests exist → **YES** (commit `4c972e3`)
- [ ] CS-003 complete — PostHog captures extension errors → **YES** (commit `5b548a9`)

### What To Build

1. **FIX-08**: Verify RLS policies on all 72 dashboard tables. Fix gaps. Extension manifest v3 compliance check.
2. **FIX-12**: Add `AbortSignal.timeout` to all extension fetch calls. Retry with exponential backoff on critical paths.
3. **FIX-13**: Three-layer kill-switch (ADR-006): heartbeat directives, `externally_connectable` message, DB flag. Admin UI: active scanners with kill toggle.
4. **FIX-14**: PII data minimisation for AI answerer — Edge Function accepts per-question field subsets instead of full profile.

### Exit Gate (verify before closing session)

- RLS verified on 72 tables
- All extension fetches have timeout + retry
- Kill-switch operational (3 layers)
- AI answerer sends per-question subsets only

---

## Current Version Manifest

| Surface | Version | Last Changed |
|---------|---------|-------------|
| Dashboard | `dashboard@0.6.0-cx-s2` | CS-011 |
| Extension | `extension@0.4.0-a11y` | CS-011 |
| Landing Page | `index@0.4.0-a11y` | CS-011 |
| Admin | `admin@0.6.0-visibility` | CS-012 |
| SEO Pages | (no remediation tag yet) | — |
| Email Templates | `email-templates@0.1.0-utm` | CS-011 |

---

## Completed Sessions (12 of 24)

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

---

## Remaining Sessions (12 of 24)

| Session | Fix Items | Phase |
|---------|-----------|-------|
| **CS-013** | FIX-08, FIX-12, FIX-13, FIX-14 | Phase 3: Visibility + Completeness |
| CS-014 | FIX-15c, CX-09, CX-10 | Phase 3 |
| CS-015 | FIX-15, AD-FIX-09, AD-FIX-10 | Phase 3 |
| CS-016 | FIX-10 (FE-001), FIX-16 | Phase 4: Code Quality + Architecture |
| CS-017 | FIX-17 | Phase 4 |
| CS-018 | FIX-19a | Phase 4 |
| CS-019 | FIX-18 | Phase 4 |
| CS-020 | FIX-20, FIX-21 | Phase 5: Validation + Launch |
| CS-021 | FIX-22 + Quality Gates | Phase 5 |
| CS-022 | FIX-23 (72-hour dry run + Go/No-Go) | Phase 5 |
| CS-023 | AD-FIX-11, AD-FIX-12 | Post-Launch: Admin Monitoring |
| CS-024 | AD-FIX-13, AD-FIX-14, AD-FIX-15 | Post-Launch: Admin Monitoring |

---

## Launch Gates (15 total)

| # | Gate | Status | Notes |
|---|------|--------|-------|
| G1 | All P0s resolved | 🔲 | |
| G2 | PostHog error tracking live | ⚡ | CS-003: deployed, needs prod verification |
| G3 | Service role key rotated | 🔲 | SE-002 downgraded to hygiene |
| G4 | Kill-switch operational | 🔲 | CS-013 target |
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

None as of CS-012 close.

---

## How To Use This File

**At session start:**
1. `git pull`
2. Read `HANDOFF.md` (this file)
3. Verify the entry gate for the next session
4. Execute the session per `Chat_Session_Remediation_Plan.docx`

**At session close (Step 7 of the lifecycle):**
1. Update "Last Completed Session" to the session you just finished
2. Move the completed session from "Remaining" to "Completed"
3. Update "Next Session" with entry gate, fix items, and exit gate from the plan
4. Update "Current Version Manifest" with any new tags
5. Update "Launch Gates" if any status changed
6. Update "Deferred Items" if anything was pushed
7. Update "Blockers" if any were discovered
8. Commit this file as part of the session's final push

**This file is the first thing the next session reads. If it's wrong, the next session starts wrong.**
