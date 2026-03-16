# AUDIT-E1 — Extension: Foundation Health
**Date:** 2026-03-16
**Properties:** #1 Proficiency, #4 Maintainability, #17 Modularity, #22 Deterministic
**Session score:** 2.25/5
**Findings:** 6 (0×P0, 2×P1, 3×P2, 1×P3)

---

## #1 Proficiency

### AUDIT-E1-001 — P1 — TypeScript compile errors in production source [job-site-overlay.ts:2543-2544]
**File:** `extension/job-site-overlay.ts:2543–2544`
**Detail:** `tsc --noEmit` (run from `extension/`) reports 2 errors — unescaped single quotes inside single-quoted string literals in onclick handler templates:
```
onclick="window._bjAnswerReviewFeedback(' + i + ','up')"
```
The `,` before `'up'` terminates the outer string, producing a TS parse error. esbuild silently bundles past this; `tsc` does not. The built extension may behave unexpectedly in feedback handlers.
**Compounding factor:** Root `tsconfig.json` explicitly excludes `extension/`. CI's `tsc --noEmit` step never checks extension TypeScript. This error has been present undetected.
**Fix:** Escape the inner quotes: `,'up\\')`  or use double quotes for the onclick attribute. Add `cd extension && npx tsc --noEmit` as a CI gate step.

### AUDIT-E1-002 — P1 — `background.ts` is a 3,675-line god file
**File:** `extension/background.ts`
**Detail:** Single service-worker file contains at least 8 distinct responsibility domains:
- Auth / token management (`getAuth`, `setAuth`, `ensureValidToken`)
- State persistence (`saveState`, `loadState`, `syncStateToSupabase`)
- Human-sim scheduling (`randInt`, `fisherYatesShuffle`, `visitDelaySec`, `scheduleNextVisit`)
- Business-hours logic (`isWithinBusinessHours`, `getNextBusinessStart`)
- LinkedIn scraping (`scrapeExperience`, `scrapeExperienceDetails`, `visitNextProfile` — 384 lines alone)
- Message routing / ATS dispatch (`matchAtsUrl`, `injectContentScriptIfNeeded`)
- Alarms + keepalive (`setupAlarms`, `keepAlive`, `sendHeartbeat`)
- Version checking (`_checkExtensionVersion`)

No module boundaries. Adding or debugging any one domain requires navigating the full 3,675 lines.
**Fix:** Extract into focused modules: `bg-auth.ts`, `bg-state.ts`, `bg-scan.ts`, `bg-linkedin-scraper.ts`, `bg-ats-router.ts`, `bg-alarms.ts`. `background.ts` becomes a thin bootstrap that imports and wires them.

---

## #4 Maintainability

### AUDIT-E1-003 — P2 — `job-site-overlay.ts` is a 2,823-line single IIFE
**File:** `extension/job-site-overlay.ts`
**Detail:** Entire file is wrapped in one `(function() { ... })()` — 2,823 lines, all functions are inner closures with no exports. Covers: settings loading, job meta parsing, toast UI, save-button injection, apply-button interception, score gate overlay, answer review panel, and more. Nothing is importable or independently testable.
**Fix:** Break into focused modules (`overlay-settings.ts`, `overlay-ui.ts`, `overlay-apply.ts`, `overlay-answer-review.ts`) with proper ES exports.

### AUDIT-E1-004 — P2 — Extension TypeScript excluded from CI type-check
**File:** `.github/workflows/ci.yml`, `tsconfig.json`
**Detail:** Root `tsconfig.json` `exclude` list contains `"extension"`. CI's TypeScript gate (`npx tsc --noEmit`) therefore never checks any extension `.ts` file. Only `node extension/build-extension.js` runs in CI, which uses esbuild — no type checking. Two god files (6,498 lines combined) have zero type-check enforcement.
**Fix:** Add a dedicated CI step: `cd extension && npx tsc --noEmit`. This would have caught AUDIT-E1-001 on first commit.

---

## #17 Modularity

### AUDIT-E1-005 — P2 — `background.ts` uses `importScripts()` instead of ES module imports
**File:** `extension/background.ts:1–4`
**Detail:** Service worker loads dependencies via `importScripts('supabase.js')` etc. — the pre-MV3 pattern. While technically valid in MV3 service workers declared as non-module scripts, it prevents static dependency analysis, tree-shaking, and unit testing of imported modules in isolation. Only 4 `importScripts` calls exist; the remaining ~3,670 lines are all inline.
**Fix:** Declare background as `"type": "module"` in manifest (MV3 supports this), replace `importScripts` with `import` statements, enabling proper module graph.

---

## #22 Deterministic

### AUDIT-E1-006 — P3 — `noUnusedLocals` / `noUnusedParameters` disabled in both tsconfigs
**File:** `extension/tsconfig.json`, root `tsconfig.json`
**Detail:** Both configs set `noUnusedLocals: false` and `noUnusedParameters: false`. Dead variables and unused parameters accumulate silently. Root tsconfig notes ESLint covers this, but extension ESLint coverage is not confirmed. Silent dead code reduces confidence in what the extension is actually executing.
**Fix:** Either enable in tsconfig or confirm ESLint `no-unused-vars` runs over extension source with zero suppressions.

---

## Clean findings

| Area | Status |
|------|--------|
| ATS handler isolation | ✅ 17 handlers, properly scoped, right-sized (64–945L) |
| Handler cross-imports | ✅ Only `bamboohr`/`jazzhr` → `generic.ts` (base handler) and `workday` → `workday-experience` (logical pair) |
| TypeScript strict config | ✅ `strict`, `noImplicitAny`, `strictNullChecks`, `noImplicitReturns` all enabled |
| Randomness scope | ✅ `Math.random()` confined to human-sim scheduling — business logic is deterministic |
| Window global pollution | ✅ Only 2 legitimate DOM calls in utils; no `window.*` assignment pattern |
| Manifest version | ✅ MV3 |

---

## Summary

| Property | Score | Verdict |
|----------|-------|---------|
| #1 Proficiency | 2/5 | TS compile errors in prod source; CI blind to extension type errors |
| #4 Maintainability | 2/5 | Two god files (6,498L combined); IIFE pattern prevents refactor |
| #17 Modularity | 2.5/5 | Handlers well-isolated; entry points are monolithic |
| #22 Deterministic | 3.5/5 | Business logic deterministic; unused-code enforcement gaps |
| **Session avg** | **2.25/5** | |

## Open Findings

| ID | Sev | Fix owner |
|----|-----|-----------|
| AUDIT-E1-001 | P1 | Sprint — fix syntax + add CI tsc gate for extension |
| AUDIT-E1-002 | P1 | Backlog — background.ts decomposition (large) |
| AUDIT-E1-003 | P2 | Backlog — job-site-overlay.ts decomposition (large) |
| AUDIT-E1-004 | P2 | Sprint — add `cd extension && tsc --noEmit` CI gate |
| AUDIT-E1-005 | P2 | Backlog — ES module migration for background |
| AUDIT-E1-006 | P3 | Backlog — confirm ESLint coverage or enable noUnusedLocals |
