# AUDIT-D1 — Dashboard Foundation Health
## Findings Log

**Session:** AUDIT-D1  
**Date:** 2026-03-15  
**Surface:** Dashboard — `index.html`, `js/` (121 files), `dist/` bundles, `src/` (React SPA scaffold)  
**Properties Assessed:** #1 Proficiency, #4 Maintainability, #17 Modularity, #22 Deterministic  
**Product Version at Audit:** v9.69  

---

## Summary

| Severity | Count |
|----------|-------|
| P0 | 0 |
| P1 | 3 |
| P2 | 7 |
| P3 | 2 |
| **Total** | **12** |

No P0 blockers. Three P1 findings requiring attention. The codebase is competently built — stack choices are sound, ESLint and TypeScript strict mode are in place, and debt is low. The primary structural risks are: (1) TypeScript migration 6% complete leaving most business logic untyped, (2) two parallel module systems co-existing without a migration gate, (3) `processApplyQueue` having no concurrency guard against double-submission.

---

## Findings

### AUDIT-D1-001 — Mixed module system: 133 raw window.* vs 8 registered exports
| | |
|--|--|
| **Severity** | P2 |
| **Property** | #17 Modularity |
| **Location** | `js/globals.js`, `js/*.js` (all modules) |
| **Description** | The codebase uses both ES import (via `main.js` + Vite) and raw `window.*` global exports. Only 8 functions use `window.BJ.export()` (the structured registry); 133 raw `window.*` assignments exist outside the registry. No enforced contract on what is public API vs internal. |
| **Evidence** | `grep "^window\.[a-zA-Z]" js/*.js | grep -v BJ | wc -l` → 133. `grep "BJ\.export" js/*.js | wc -l` → 8. |
| **Remediation** | Enforce boundary rule: all cross-module function calls must go through `window.BJ.export()`. Add ESLint rule flagging raw `window.*` assignments in `js/` source. |
| **Effort** | M |

---

### AUDIT-D1-002 — TypeScript migration 6% complete
| | |
|--|--|
| **Severity** | P1 |
| **Property** | #4 Maintainability, #17 Modularity |
| **Location** | `js/*.js` (113 files) |
| **Description** | Only 7 of ~120 dashboard JS files converted to `.ts`. All major business logic — `apply-workflow.js` (2,704 lines), `job-feed.js` (2,875 lines), `pipeline.js` (1,931 lines) — is untyped. ADR-04 committed to full migration; current state is early Phase 1. |
| **Evidence** | `ls js/*.ts | wc -l` → 7. `ls js/*.js | grep -v admin | wc -l` → 112. |
| **Remediation** | Any new files during the 100-item sprint must be `.ts`. Resume ADR-04 migration per priority order. Add CI gate blocking new `.js` files in migrated directories. |
| **Effort** | L (ongoing) |

---

### AUDIT-D1-003 — Core modules grown large
| | |
|--|--|
| **Severity** | P2 |
| **Property** | #4 Maintainability |
| **Location** | `js/apply-workflow.js`, `js/job-feed.js`, `js/pipeline.js` |
| **Description** | Three core modules: `apply-workflow.js` (2,704 lines), `job-feed.js` (2,875 lines), `pipeline.js` (1,931 lines). At least 6 functions exceed 100 lines including `renderPendingApplications`, `_renderBatchScoreResults`. Functional but accumulate risk as features are added. |
| **Evidence** | `wc -l js/apply-workflow.js js/job-feed.js js/pipeline.js` → 7,510 combined. |
| **Remediation** | Soft lint rule `max-lines-per-function: 120` as warning. Decompose during next refactor pass. No immediate action. |
| **Effort** | M (deferred) |

---

### AUDIT-D1-004 — Stub .js files alongside real .ts implementations
| | |
|--|--|
| **Severity** | P2 |
| **Property** | #4 Maintainability, #17 Modularity |
| **Location** | `js/api.js` / `js/api.ts`, `js/fingerprint.js` / `js/fingerprint.ts` |
| **Description** | `js/api.js` is a stub (`var api = {};`) left alongside the real implementation in `js/api.ts`. Same pattern for `fingerprint`. Build resolution order risk if wrong file is picked up. |
| **Evidence** | `cat js/api.js` → `var api = {};`. `cat js/api.ts` → full implementation. |
| **Remediation** | Delete `js/api.js` and `js/fingerprint.js` stubs. Add CI gate blocking `.js` files that have a `.ts` counterpart. |
| **Effort** | S |

---

### AUDIT-D1-005 — `window.refreshIcons` called 40 times across 20+ modules
| | |
|--|--|
| **Severity** | P2 |
| **Property** | #17 Modularity |
| **Location** | `js/app.js:410` (definition), 20+ consuming modules |
| **Description** | Highest fan-out coupling in the codebase. `window.refreshIcons` is called 40 times across 20+ modules (chat.js ×8, interview-prep.js ×8, referrals.js ×3, resumes.js ×3, job-feed.js ×3, payl.js ×3, etc.). Every module rendering dynamic UI has an implicit hard dependency on `app.js` load order. The `typeof` guard prevents crashes but creates silent failures if icon system is not ready. |
| **Evidence** | `grep -rn "window.refreshIcons" js/*.js | wc -l` → 40. |
| **Remediation** | Convert to event-driven: modules dispatch `bj:icons:refresh` custom event; `app.js` handles. Decouples all 20 modules from `app.js` load order. |
| **Effort** | M |

---

### AUDIT-D1-006 — `interview-prep.js` creates own Supabase client in 6 functions
| | |
|--|--|
| **Severity** | P2 |
| **Property** | #17 Modularity |
| **Location** | `js/interview-prep.js:147-148, 428-429, 511-512, 560-561, 583-584, 683-684` |
| **Description** | `interview-prep.js` creates its own Supabase client as fallback in 6 functions: `window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)`. Bypasses the shared `window.bjSupabase` client with its 30s timeout wrapper and auth config. Violates ADR-03 fitness function (no direct Supabase client creation outside provider layer). Creates second connection with potentially different auth state. |
| **Evidence** | `grep -n "supabase.createClient" js/interview-prep.js` → 6 occurrences. |
| **Remediation** | Remove `createClient` fallback from all 6 functions. Replace with: `var sb = window.bjSupabase; if (!sb) { reportError('interview-prep', 'Supabase not ready'); return; }` |
| **Effort** | S |

---

### AUDIT-D1-007 — `js/state.js` is an orphaned ESM module
| | |
|--|--|
| **Severity** | P3 |
| **Property** | #17 Modularity |
| **Location** | `js/state.js` |
| **Description** | `js/state.js` is an ES module with `export const sb = window.supabase.createClient(...)` creating a third Supabase client instance. It is excluded from ESLint config and not imported by `main.js` or any other module. Appears to be a scaffolding artifact — never wired up. `src/app/providers/supabase.ts` serves the same purpose for the SPA layer correctly. |
| **Evidence** | `cat js/state.js` → standalone ESM with own `createClient`. `grep "from.*state" js/*.js` → zero imports. |
| **Remediation** | Decide: if `js/state.js` is the intended migration path for legacy JS layer, document and wire up. If `src/app/providers/` is canonical, delete `js/state.js`. |
| **Effort** | S |

---

### AUDIT-D1-008 — `processApplyQueue` has no concurrency guard — duplicate submission risk
| | |
|--|--|
| **Severity** | P1 |
| **Property** | #17 Modularity, #22 Deterministic |
| **Location** | `js/apply-workflow.js:722`, `js/applications.js:216` |
| **Description** | `processApplyQueue()` and `processApplyQueueByMode()` have no `_isProcessing` flag, no button-disable on trigger, and no DB-level lock. Double-clicking the Process Queue button or two concurrent code paths will approve and route the same pending applications twice — **duplicate submission risk**. The button has a static disabled check on queue length, not a runtime processing lock. |
| **Evidence** | `sed -n '722,780p' js/apply-workflow.js` → no processing flag anywhere in function. `sed -n '215,235p' js/applications.js` → click handler calls `processApplyQueueByMode()` with no disable-on-click. |
| **Remediation** | Add `let _queueProcessing = false;` guard. Set `true` on entry, reset in `finally`. Disable button immediately on click in `applications.js`, re-enable on completion. Fix immediately. |
| **Effort** | S |

---

### AUDIT-D1-009 — `incrementAutoApplyDailyCount` empty catch — silent tier gate failure
| | |
|--|--|
| **Severity** | P1 |
| **Property** | #22 Deterministic |
| **Location** | `js/tier-gating.js:145` |
| **Description** | `incrementAutoApplyDailyCount()` has an empty `catch (e) {}`. If `localStorage` throws (private browsing, quota exceeded, corrupted), the increment is silently swallowed. Daily limit under-counts, allowing users to exceed tier limits undetected. Combined with the counter being client-side only (no server-side enforcement), this is both a silent failure and a determinism gap: same action produces different count results depending on storage availability. |
| **Evidence** | `sed -n '138,150p' js/tier-gating.js` → `} catch (e) { }` with empty body. |
| **Remediation** | (1) Replace empty catch with `captureEvent('tier_gate_storage_error', { error: e?.message })`. (2) Add server-side daily limit enforcement in `bulk-apply-queue` EF as the authoritative check — localStorage is UX hint only. |
| **Effort** | S (client fix) + M (server enforcement) |

---

### AUDIT-D1-010 — Two parallel UI systems with no migration gate
| | |
|--|--|
| **Severity** | P2 |
| **Property** | #1 Proficiency, #4 Maintainability |
| **Location** | `js/` (legacy) + `src/app/` (React SPA) |
| **Description** | Legacy vanilla JS and React SPA co-exist. SPA has 12 pages scaffolded with real implementations (FeedPage.tsx 377 lines). No CI gate prevents new features being added to both systems simultaneously. No documented "page X is now canonical in SPA — legacy deprecated" tracking. During a 100-item sprint, features can diverge across both systems without detection. |
| **Evidence** | `ls src/app/pages/dashboard/` → 12 pages. `vite.config.ts` confirms dual-mode. No migration status doc found. |
| **Remediation** | Create `docs/architecture/spa-migration-status.md` tracking canonical system per page. Add CI warning when a `js/` file is modified that has a corresponding SPA page. |
| **Effort** | S |

---

### AUDIT-D1-011 — `client_id` uses `Math.random()` — verify scope
| | |
|--|--|
| **Severity** | P2 |
| **Property** | #22 Deterministic |
| **Location** | `js/job-feed.js:71` |
| **Description** | Connection `client_id` generated as `'db-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8)`. If this propagates into analytics or audit logs as a stable user identifier it introduces non-determinism — new ID on every page load. Needs verification this is scoped to connection labelling only. |
| **Evidence** | `grep -n "client_id" js/job-feed.js` → line 71. |
| **Remediation** | Verify usage is connection-label only. If in PostHog events as session ID, replace with `posthog.get_distinct_id()`. |
| **Effort** | S |

---

### AUDIT-D1-012 — AIS feature modules not using feature flag SDK
| | |
|--|--|
| **Severity** | P3 |
| **Property** | #1 Proficiency |
| **Location** | `js/cover-letter.js`, `js/interview-prep.js`, `js/linkedin-import.js`, `js/resume-builder.js` |
| **Description** | New AIS feature modules are not gated behind feature flags. Only 1 call to `window.isFeatureEnabled` across all dashboard JS. The `feature-flags.js` SDK exists and is fully implemented — adoption is the gap. No ability to do controlled rollouts or instant kill-switches on these features. |
| **Evidence** | `grep -rn "window.isFeatureEnabled" js/*.js | grep -v admin | wc -l` → 1. |
| **Remediation** | Convention: any new user-facing feature in the 100-item sprint must be wrapped in a feature flag check. Add to PR checklist. Retrofit existing AIS features. |
| **Effort** | S (convention) + M (retrofit) |

---

## Gap Summary by Property

| Property | Count | Highest Sev | Key Gap |
|----------|-------|-------------|---------|
| #1 Proficiency | 2 | P2 | Dual system drift, flag adoption |
| #4 Maintainability | 4 | P1 | TS migration 6%, stubs alongside implementations |
| #17 Modularity | 6 | P1 | 133 raw globals, refreshIcons fan-out, duplicate Supabase clients |
| #22 Deterministic | 3 | P1 | Queue double-submit, localStorage silent fail |

---

## P1 Action Items

| ID | Fix | Effort |
|----|-----|--------|
| AUDIT-D1-002 | New files during sprint must be `.ts` | Sprint constraint |
| AUDIT-D1-008 | Add `_queueProcessing` guard to `processApplyQueue` | S — fix now |
| AUDIT-D1-009 | Replace empty catch in `incrementAutoApplyDailyCount` + server-side limit | S + M |

---

## Positive Observations

- ESLint configured meaningfully — `no-empty` enforced, `no-only-tests` in CI
- TypeScript strict mode on all 7 migrated files — `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess` enabled
- Technical debt markers extremely low — only 6 across 121 JS files
- SPA migration architecture is sound — provider interfaces well-typed, bridges to `window.BJ` correctly
- `window.BJ.export()` registry exists as the right pattern — needs broader adoption
- No hardcoded secrets — Supabase anon key in `globals.js` is the public anon key (correct and safe)
