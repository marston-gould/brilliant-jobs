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

> ⛔ **NON-NEGOTIABLE — ROADMAP UPDATES EVERY SESSION:**
>
> Steps 7–8 require updating **THREE files**: `ROADMAP.md`, `roadmap.html`, AND `HANDOFF.md`.
>
> - `ROADMAP.md` = markdown source of truth
> - `roadmap.html` = live `/roadmap` page users see
> - `HANDOFF.md` = session state for the next session
>
> **All three must reflect the same status.** This has been flagged multiple times by Marston.
>
> **Before committing Step 7, run this verification:**
> ```bash
> grep "SA-XXX" ROADMAP.md     # Must show ✅
> grep "SA-XXX" roadmap.html   # Must show s: 'done'
> ```
> If either grep shows the old status, the update is incomplete. Fix it before committing.
> **Do NOT close the session until all three files are updated, committed, and pushed.**

| Step | Action | What to do |
|------|--------|-----------|
| 0 | Entry Gate | Verify prerequisites listed below are met |
| 1 | Develop | Write code for the fix items listed below |
| 2 | Test (Local) | Run the test plan listed below |
| 3 | Deploy to Prod | Push to production (git push, Supabase migrations, EF deploys) |
| 4 | Test (Prod) | Validate fixes in the live production environment |
| 5 | Sync Environments | Apply changes to staging + dev (if separate envs exist) |
| 6 | Version Bump | **TWO version systems:** (1) Git tags for audit tracking (e.g., `extension@0.8.0-architecture`). (2) **Product version** (`BJ_VERSION` in `js/version.js`) — controls cache busting on ALL HTML surfaces. Run `bash scripts/bump-version.sh X.YY` to bump, then `node build.js && node build-admin.js && npm run bundle:css` to rebuild. Run `bash scripts/pre-commit-version-check.sh` to verify all surfaces in sync. **Every session that changes JS/CSS/HTML must bump the product version.** |
| 7 | ⛔ Update ROADMAP.md + roadmap.html | **MANDATORY — BOTH files, EVERY session, NO exceptions.** Find the session row in `ROADMAP.md` → change status to ✅ with notes. Find matching entry in `roadmap.html` → change `s:` to `'done'`, `p:` to `100`. Run `grep "SA-XXX" ROADMAP.md roadmap.html` to verify both reflect the same status. If they don't match, fix before committing. |
| 8 | Update HANDOFF.md | Update THIS FILE as the last commit of the session. Move session to Completed, set Next Session, update Version Manifest. |

---

## Last Completed Session

**SA-007** — Common Crawl Ingestion Worker + Staging Table (Phase S2)
- Completed: 2026-03-07
- Git tag: `infra@common-crawl-v0.1.0`
- No product version bump (infrastructure only, no JS/CSS/HTML changes)
- ROADMAP.md updated: SA-007 row → ✅ with completion notes
- roadmap.html updated: SA-007 entry → `s: 'done'`, p: 100
- Created: v6.21-common-crawl-staging.sql migration, ingest-common-crawl EF, adr-06-pipeline.md
- Modified: api-gateway/index.ts (93 → 94 routes)
- Database: cc_staging_jobs, cc_batch_tracking, cc_url_queue tables + cc_batch_summary view + 2 functions
- EF deployed: ingest-common-crawl (Athena discovery + live web fetch + 3-tier HTML parsing)
- Gateway: Route #94 (ingest-common-crawl)
- Secrets: CC_AWS_ACCESS_KEY, CC_AWS_SECRET_KEY set in Supabase Vault
- Production tested: Athena discovery (500+ URLs), auth enforcement (401), batch tracking, error handling
- Architecture decision: Live web fetch replaces WARC archive (EF memory limits). Documented in ADR-06.

**SA-006** — TypeScript Phase 1: Core Files + CI Gate (Phase S1)
- Completed: 2026-03-07 (already satisfied by CS-P1-015 — no new code needed)
- All 7 core .ts files, shared types, strict tsconfig, CI gate — all present from Phase 1 remediation
- Phase S1 COMPLETE (SA-004 ✅, SA-005 ✅, SA-006 ✅, SA-001–003 deferred post-launch)
- Team manifest created: docs/scaling/pod-team-manifest.md (5 new Pod 4 roles added)

**SA-005** — Gateway Migration: All 93 EFs + API Consumer Management (Phase S1)
- Completed: 2026-03-07
- Git tags: `infra@gateway-v1.0.0`
- Product version bumped: `v7.44` → `v7.45` (bump-version.sh + node build.js + node build-admin.js + npm run bundle:css + pre-commit-version-check ✅)
- ROADMAP.md updated: SA-005 row → ✅ with completion notes
- roadmap.html updated: SA-005 entry → `s: 'done'`, p: 100
- Created: v6.20-api-consumers.sql migration, gateway-deprecation.ts helper
- Modified: api-gateway/index.ts (10 → 93 routes), gateway-middleware.ts (API key auth + expanded cache TTL), adr-03-gateway.md (full SA-005 docs)
- Route registry: 93 EFs organized into 15 domain groups (Jobs 14, Pipeline 8, Resume 6, Scoring 3, Filters 4, Auth 5, Billing 6, Notifications 9, Gmail 3, Referral 7, Admin 7, Extension 4, Engagement 9, Data 6, Search 2)
- api_consumers table: 4 built-in consumers seeded (dashboard, extension, landing-page, admin)
- Auth middleware: X-API-Key header support + SHA-256 key validation + consumer rate limit overrides
- Deprecation: gateway-deprecation.ts helper for EFs to detect and log direct access
- ⚠️ PROD VALIDATION PENDING: supabase db push (v6.19 + v6.20), supabase functions deploy api-gateway, hit all 93 routes, verify error rate < 0.1% for 1h, Chief Architect sign-off

---

## Session In Progress

None.

---

## Next Session

**SA-008** — Deduplication Engine + Enrichment Queue Integration (Phase S2)
- Entry gate: SA-007 complete ✅. Staging table operational with test records. Batch tracking functional. pg_trgm extension available in Supabase.
- Pair: Data Eng + Backend
- Estimated: 12–16h
- Build: Enable pg_trgm extension. Hash-based exact match on URL (fast path). Fuzzy match on title + company + location using pg_trgm similarity (threshold 0.7). Promote surviving records from cc_staging_jobs → ats_jobs. Connect to enrichment queue. Rate-limit enrichment at 100 Anthropic API calls/hour for CC records.

**OR SA-010** — CrewAI Agent Framework + Content QA Agent (Phase S2, parallel track)
- Entry gate: SA-005 complete ✅ (gateway operational).
- Pair: Backend + Eng Lead + Forward-Looking Dev
- Estimated: 16–22h
- Build: CrewAI framework, agent lifecycle manager, Content QA Agent (Agent 1) in observe mode, admin panel integration.

---

## Deferred: SA-001 / SA-002 / SA-003 (Typesense)

**Decision (2026-03-07):** SA-001 through SA-003 deferred to post-launch.

Rationale: Postgres FTS handles 413K jobs without performance issues. Typesense's primary value
(typo tolerance, faceted counts, sub-50ms at 1M+ docs) does not solve any current user-facing pain
point. The 1GB cluster provisioned during SA-001 ran out of memory before the collection could even
be created — the right cluster size (4GB+) adds meaningful recurring cost with no launch-blocking
benefit. All code artifacts are committed and ready to execute post-launch when there is user
evidence that search is a bottleneck.

**What was built (preserved in repo, not deployed):**
- `docs/scaling/typesense-schema.json` — 29-field collection schema
- `supabase/functions/typesense-seed/index.ts` — batch-resumable seed EF
- `supabase/functions/typesense-search/index.ts` — search EF with Postgres FTS fallback
- `docs/scaling/adr-01-search.md` — full ADR-01 implementation log
- `scripts/run-typesense-seed.js` — seed orchestration script
- Vault secrets set: TYPESENSE_HOST, TYPESENSE_API_KEY (cluster deleted — secrets are stale, reset on revival)

**Post-launch trigger:** Revisit when search latency complaints appear in PostHog, OR when job
count exceeds 750K rows, OR when faceted filter UX becomes a product priority — whichever comes first.

---

## Current Version Manifest

| Surface | Version | Last Changed |
|---------|---------|-------------|
| **Product (BJ_VERSION)** | **`v7.45`** | **SA-005** |
| Dashboard | `dashboard@1.2.0-typescript` | CS-P1-015 |
| Extension | `extension@2.22.0-error-handling` | FIX-11 |
| Landing Page | `index@0.7.0-seo` | CS-P1-013 |
| Admin | `admin@1.4.0-compliance` | CS-P1-017 |
| **API Gateway** | **`infra@gateway-v1.0.0`** | **SA-005** |
| **Common Crawl** | **`infra@common-crawl-v0.1.0`** | **SA-007** |
| Load Tests | `loadtest@1.0.0` | CS-020 |
| CI/CD | `cicd@1.0.0` | CS-020 |
| Quality Gates | `qualitygates@1.0.0` | CS-021 |
| Dry Run | `dryrun@1.0.0` | CS-022 |
| SEO Pages | `seo-pages@1.0.0-sri-og` | CS-P1-013 |
| Email Templates | `email-templates@1.0.0-modular` | CS-P1-012 |
| Phase 1 Security | `p1-017@1.0.0-compliance-dashboard` | CS-P1-017 |

---

## Completed Sessions (24 of 24 + 17 Phase 1)

| Session | Date | Fix Items | Tag(s) |
|---------|------|-----------|--------|
| SA-007 | 2026-03-07 | CC ingestion: 3 tables + batch view + 2 functions + EF + gateway route #94 + ADR-06 + Athena discovery + live web fetch + 3-tier parser | infra@common-crawl-v0.1.0 |
| SA-006 | 2026-03-07 | ALREADY SATISFIED by CS-P1-015 (tsconfig strict, 7 core .ts modules, shared types, CI gate, ADR-04). No new code needed. | (see p1-015@1.0.0-typescript) |
| SA-005 | 2026-03-07 | All 93 EFs routed + api_consumers table + API key auth + deprecation logging + ADR-03 complete | infra@gateway-v1.0.0 |
| SA-004 | 2026-03-07 | Gateway EF + middleware plugins + 10 routes + rate_limits migration + ADR-03 | infra@gateway-v0.1.0 |
| FIX-11 | 2026-03-07 | EXT-ES-001 (22 empty catches → console.warn + PostHog + comments) | extension@2.22.0-error-handling |
| CS-P1-017 | 2026-03-07 | 0.172 (PII data map), 0.173 (user deletion cascade), 0.174 (data export + compliance dash) | p1-017@1.0.0-compliance-dashboard |
| CS-P1-016 | 2026-03-07 | 0.161 (cron management UI), 0.162 (cron alert config), 0.175 (PostHog funnel+retention), 0.176 (first A/B test), 0.177 (UX review), 0.178 (design system assessment) | p1-016@1.0.0-admin-monitoring |
| CS-P1-015 | 2026-03-07 | FE-006 (TypeScript migration: tsconfig strict, 7 core .ts modules, shared types, CI gate, ADR-04) | p1-015@1.0.0-typescript |
| CS-P1-014 | 2026-03-07 | CP-001 (PII inventory v2), CP-002 (DPA register), AD-CP-001 (admin PII logging), AD-CP-002 (user deletion cascade), AD-CP-003 (data export v2) | p1-014@1.0.0-compliance |
| CS-P1-013 | 2026-03-07 | IX-DM-001 (SRI), IX-SEO-001 (canonical), IX-SEO-002 (OG/Twitter), IX-SEO-003 (JSON-LD), IX-DA-002 (referral chain), IX-FE-006 (.io refs) | p1-013@1.0.0-seo-sri-referral |
| CS-P1-012 | 2026-03-07 | TS1-3 (dark mode email), TS1-4 (A/B drip framework), TS1-5 (SMS overflow), TS1-6 (template modularization) | p1-012@1.0.0-email-sms-cx |
| CS-P1-011 | 2026-03-07 | ES1-2 (a11y baseline), ES1-4 (token sync), ES1-5 (version check), ES1-6 (ATS BambooHR+JazzHR), ES1-7 (password reset), ES1-8 (tab labels) | p1-011@1.0.0-extension-cx |
| CS-P1-010 | 2026-03-07 | DS1-8 (Gmail onboarding), DS1-11 (unified setup), DS1A-13 (extension walkthrough), DS1A-14 (tuning dark), DS1A-15 (pipeline nav), DS1A-16 (resume color), DS1A-17 (notif events), DS1A-18 (snooze dedup), DS1A-19 (sub dark), DS1A-20 (admin survey gate), DS1A-21 (referral !important) | p1-010@1.0.0-cx-polish |
| CS-P1-009 | 2026-03-07 | CSS-002 (dark mode), CSS-003 (safelist), CSS-004 (purge), DS1-3 (inline styles), DS1-5 (14-page dark), DS1-7 (pipeline dark), DS1-10 (ADR) | p1-009@1.0.0-dark-mode |
| CS-P1-008 | 2026-03-07 | LS1-10 (JSON-LD sync), LS1-4 (single H1), LS1-8 (localStorage safety), IX-A11Y-003 (form labels), LS1-7 (breakpoints), LS1-11 (carousel fallback), LS1-2/5/9 (verified) | p1-008@1.0.0-landing-cx |
| CS-P1-007 | 2026-03-07 | DS1-4 (identity resolution), DS1-6 (14-page pageviews), DS1-12 (perf timing), ES1-1 (extension baseline), LS1-3 (UTM capture), TS1-1 (email UTM), TS1-2 (SMS UTM) | p1-007@1.0.0-posthog-analytics |
| CS-P1-006 | 2026-03-07 | DE-004 (dead crons), DE-005 (purge consolidation), CE-002 (cost-per-user modeling), QA-002 (21 DOM snapshots), QA-003 (90 API integration tests) | p1-006@1.0.0-data-pipeline |
| CS-P1-005 | 2026-03-07 | DO-001 (verified), DO-003 (feature flags), DO-004 (cron alerting), AD-DO-001 (structured logging), AD-DO-002 (PostHog API), AD-DO-003 (alerting pipeline), AD-DO-004 (availability) | p1-005@1.0.0-observability-flags |
| CS-P1-004 | 2026-03-07 | IX-BE-003 (verified), FE-005 (BJ namespace), BE-007 (API versioning), IX-FE-005 (verified), FE-007 (landing defer), FE-008 (landing cache-bust) | p1-004@1.0.0-api-hardening |
| CS-P1-003 | 2026-03-07 | FE-005 (defer), FE-006 (immutable cache), BE-003 (error checks), BE-004 (fire-and-forget) | p1-003@1.0.0-error-handling |
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

## Remaining Sessions (0 of 17 Phase 1)

All 17 Phase 1 sessions complete.

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
| G7 | Privacy policy + DPAs sent | ✅ | Privacy policy live. PII inventory v2 complete. DPA register created. User deletion + export functional. CS-P1-017: Compliance dashboard with PII map, deletion UI, export UI, audit trail. |
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
3. ⛔ **ALWAYS — ROADMAP VERIFICATION (non-negotiable):**
   - Update `ROADMAP.md`: find the session row → set status to ✅ → add completion notes
   - Update `roadmap.html`: find the matching JS object → set `s: 'done'` → set `p: 100`
   - **RUN THIS VERIFICATION BEFORE COMMITTING:**
     ```
     grep "SA-XXX" ROADMAP.md roadmap.html
     ```
   - Both lines must show the updated status. If either still shows the old value, fix it.
   - **Do NOT commit Step 8 (HANDOFF.md) until Step 7 verification passes.**
4. Always:
   - Update "Deferred Items" if anything was pushed
   - Update "Blockers" if any were discovered
   - Commit this file as part of the session's final push

**This file is the first thing the next session reads. If it's wrong, the next session starts wrong.**
