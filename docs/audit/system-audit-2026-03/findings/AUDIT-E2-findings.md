# AUDIT-E2 — Extension: Error & Observability
**Date:** 2026-03-16
**Properties:** #5 Error Transparency, #16 Observability, #18 Easy Issue Detection, #19 Straightforward Resolution
**Session score:** 1.75/5
**Findings:** 8 (0×P0, 3×P1, 4×P2, 1×P3)

---

## #5 Error Transparency

### AUDIT-E2-001 — P1 — `errorReporter.ts` exists but is never imported
**File:** `extension/utils/errorReporter.ts` (imported by nothing)
**Detail:** A purpose-built error reporting utility (`reportCatchError`, `catchAndReport`, `checkLastError`) was written, ships in the build manifest, and is listed in `version.json` — but has **zero import statements** across the entire extension codebase. The infrastructure exists and is dead. All the catch blocks that should be using it are falling through to `console.warn` or silent swallow instead.
**Fix:** Import and wire `reportCatchError` / `catchAndReport` into every catch block that currently swallows or console-logs. Start with `job-site-overlay.ts` and `popup.ts` (both have 0 error reporting calls).

### AUDIT-E2-002 — P1 — 13/17 ATS handlers have zero error telemetry
**Files:** `handlers/workday.ts`, `workday-experience.ts`, `indeed.ts`, `icims.ts`, `taleo.ts`, `ashby.ts`, `avature.ts`, `smartrecruiters.ts`, `workable.ts`, `recruitee.ts`, `bamboohr.ts`, `jazzhr.ts`, `generic.ts`
**Detail:** Only 4 handlers report errors: `greenhouse-legacy`, `greenhouse-react`, `lever` (via `ats:handlerError`), and `linkedin-easy-apply` (via `chrome.runtime.sendMessage` reportError). The remaining 13 handlers have 31 catch blocks between them — all silent. A Workday form fill failure, a Taleo submission error, an Indeed field miss — none of these surface anywhere.
**Fix:** Apply the `ats:handlerError` pattern uniformly to all 17 handlers' top-level catch blocks.

### AUDIT-E2-003 — P1 — `captureEvent` in background.ts has a silent outer catch
**File:** `extension/background.ts:67–68`
**Detail:**
```ts
}).catch(() => {});   // PostHog fetch failure
} catch { /* silent fail */ }
```
Both the PostHog HTTP call and the outer `captureEvent` function swallow all failures silently. If the PostHog endpoint is unreachable or the event payload is malformed, there is no fallback log, no counter, no visibility. This means observability infrastructure itself can fail silently.
**Fix:** At minimum log to `console.warn` on captureEvent failure so local debugging is possible. A `chrome.storage`-based queue for offline retry would be ideal.

### AUDIT-E2-004 — P2 — `syncStateToSupabase` silently swallows failures
**File:** `extension/background.ts:147–149`
**Detail:**
```ts
} catch (e) {
  // Silent fail — local state is primary, Supabase is backup
}
```
State sync failures are invisible. If the user's scan state stops persisting to Supabase (e.g. auth token expired, network issue), the local state diverges from Supabase silently. No event, no badge update, no user notification.
**Fix:** Add `captureEvent('extension_state_sync_failed', { error: e.message })` in this catch.

### AUDIT-E2-005 — P2 — `popup.ts` has 25 catch blocks and zero error reporting
**File:** `extension/popup.ts`
**Detail:** 25 catch blocks across 1,654 lines — all fall through to `console.warn` or silent swallow. Popup errors (settings load failures, API call failures, UI render errors) are invisible outside the browser devtools. No `captureEvent`, no `reportCatchError`, no `chrome.runtime.sendMessage` error routing.
**Fix:** Import `reportCatchError` from `errorReporter.ts` and apply to all non-expected catches.

---

## #16 Observability

### AUDIT-E2-006 — P2 — ATS handler fill outcomes not tracked per platform
**Files:** All `handlers/*.ts`
**Detail:** No handler emits a `fill_started`, `fill_completed`, or `fill_failed` event. Background.ts captures `auto_apply_submitted` / `auto_rewrite_submitted` / `full_autopilot_submitted` at the dispatch level, but there is no per-platform fill outcome. It is impossible to know from PostHog which ATS platforms have high failure rates, slow fill times, or selector misses.
**Fix:** Add `fill_started` + `fill_completed`/`fill_failed` events to each handler's entry and exit points with `{ platform, job_url, field_count, duration_ms }`.

### AUDIT-E2-007 — P2 — Handler errors go to Supabase `extension_events` only, not PostHog
**File:** `extension/background.ts:2833–2856`
**Detail:** The `ats:handlerError` message handler writes to Supabase `extension_events` via a direct REST POST — not to PostHog. Error trends are not visible in the PostHog analytics dashboard used for monitoring. Additionally, `extension_version` is hardcoded as `'2.11.0'` in 4 telemetry writes (lines 2737, 2794, 2825, 2853) while the manifest declares `3.0.0` — all historical handler error records in Supabase carry the wrong version.
**Fix:** (1) Add `captureEvent('handler_error', {...})` alongside the Supabase write. (2) Replace hardcoded `'2.11.0'` with `chrome.runtime.getManifest().version` (pattern already used at line 144).

---

## #18 Easy Issue Detection / #19 Straightforward Resolution

### AUDIT-E2-008 — P3 — No structured error taxonomy for extension errors
**Detail:** Extension errors surface across three disconnected channels: PostHog (`captureEvent`), Supabase `extension_events` table, and browser `console.warn`. There is no unified error ID scheme, no severity tagging, no correlation between a PostHog event and a Supabase row. Diagnosing a user-reported fill failure requires checking three places with no shared key.
**Fix:** Define a shared `errorId` or `correlation_id` written to both PostHog and Supabase for the same error event. Add `severity: 'error'|'warning'|'info'` to all extension telemetry.

---

## Clean findings

| Area | Status |
|------|--------|
| Global SW error handler | ✅ `background.ts:71–84` — unhandled SW errors and rejections captured to PostHog |
| Token refresh errors | ✅ `extension_token_refresh_failed` + `extension_token_refresh_error` events fire |
| Circuit breaker telemetry | ✅ `auto_apply_circuit_breaker_tripped` event fires on platform failure streaks |
| Daily limit events | ✅ `daily_apply_limit_reached` fires in all 3 apply modes |
| Apply submission events | ✅ `auto_apply_submitted`, `auto_rewrite_submitted`, `full_autopilot_submitted` all fire |

---

## Summary

| Property | Score | Verdict |
|----------|-------|---------|
| #5 Error Transparency | 1.5/5 | errorReporter.ts dead; 13 handlers fully silent; captureEvent swallows own failures |
| #16 Observability | 2/5 | Apply dispatch tracked; fill outcomes and per-platform data completely absent |
| #18 Easy Issue Detection | 2/5 | Handler errors buried in Supabase table; no PostHog visibility |
| #19 Resolution | 2/5 | Three disconnected error channels; no correlation key; version data stale |
| **Session avg** | **1.75/5** | |

## Open Findings

| ID | Sev | Fix owner |
|----|-----|-----------|
| AUDIT-E2-001 | P1 | Sprint — wire errorReporter.ts into all catch blocks |
| AUDIT-E2-002 | P1 | Sprint — ats:handlerError pattern to all 13 silent handlers |
| AUDIT-E2-003 | P1 | Sprint — captureEvent failure logging |
| AUDIT-E2-004 | P2 | Sprint — syncStateToSupabase captureEvent on catch |
| AUDIT-E2-005 | P2 | Sprint — popup.ts error reporting |
| AUDIT-E2-006 | P2 | Sprint — per-handler fill outcome events |
| AUDIT-E2-007 | P2 | Sprint — handler errors to PostHog + fix hardcoded version |
| AUDIT-E2-008 | P3 | Backlog — unified error taxonomy |
