# AUDIT-D2 — Dashboard Error & Observability
## Findings Log

**Session:** AUDIT-D2
**Date:** 2026-03-16
**Surface:** Dashboard — `js/` error handling patterns, PostHog integration, logging infrastructure
**Properties Assessed:** #5 Error Transparency, #16 Observability, #18 Easy Issue Detection, #19 Straightforward Issue Resolution
**Auditors:** Engineering Lead + Backend Engineer
**Pod 4 Reviewer:** Lead Platform Engineer

---

## Summary

| Severity | Count |
|----------|-------|
| P0       | 1     |
| P1       | 4     |
| P2       | 5     |
| P3       | 2     |
| **Total**| **12**|

---

## Findings

---

### AUDIT-D2-001
| Field | Value |
|-------|-------|
| **Severity** | **P0** |
| **Property** | #16 Observability |
| **File** | `js/cover-letter.js`, `js/linkedin-import.js`, `js/bulk-apply.js`, `js/apply-workflow.js:1436`, `js/rewrite.js:80,226,353` |
| **Description** | **`capturePostHog()` is called in 7 places across 5 modules but is never defined.** Every call is a silent no-op or throws a ReferenceError. Affected events: `cover_letter_generated`, `linkedin_pdf_uploaded`, `bulk_apply_initiated`, `bulk_apply_queued`, `bulk_save`, `bulk_apply_completed`, `auto_apply_consumer_triggered`, `resume_rewrite_started`, `resume_rewrite_qa_skipped`, `resume_rewrite_completed`. These are core AIS feature events — cover letter generation, LinkedIn import, bulk apply, and resume rewrite are all completely invisible in PostHog. Three of the five files (cover-letter, linkedin-import, bulk-apply) have **zero PostHog events** as a result. |
| **Evidence** | `grep -rn "^function capturePostHog\|window.capturePostHog" js/*.js` → 0 results. `grep -rn "capturePostHog" js/*.js \| grep -v "typeof capturePostHog"` → 7 direct calls without existence check. |
| **Remediation** | Define `capturePostHog` as a thin wrapper in `globals.js` or `posthog-dashboard.js`: `window.capturePostHog = function(event, props) { if (typeof posthog !== 'undefined') posthog.capture(event, props); };`. All 7 existing calls will immediately start firing. Then add `cover_letter_generated` to the 3 modules with zero events. |
| **Effort** | S |
| **Dependency** | None — fix immediately |

---

### AUDIT-D2-002
| Field | Value |
|-------|-------|
| **Severity** | **P1** |
| **Property** | #5 Error Transparency |
| **File** | `js/globals.js:833-838` |
| **Description** | **`window.addEventListener('error')` is console-only — uncaught JS runtime errors never reach PostHog.** The global error handler logs to `console.error` but does not call `reportError()` or `posthog.capture()`. Any uncaught exception (TypeError, ReferenceError, etc.) that bubbles to the window level disappears into the browser console. PostHog's `startExceptionAutocapture()` is enabled, but it captures unhandled exceptions independently and may miss timing-sensitive cases. The global handler should be the authoritative catch-all. |
| **Evidence** | `globals.js:833`: `window.addEventListener("error", function(event) { console.error("[BJ] Uncaught error:", ...) });` — no `reportError()` call, no PostHog capture. |
| **Remediation** | Update the `error` handler to call `reportError('uncaught', { message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno })`. Deduplication is already handled by `reportError`. |
| **Effort** | S |
| **Dependency** | None |

---

### AUDIT-D2-003
| Field | Value |
|-------|-------|
| **Severity** | **P1** |
| **Property** | #5 Error Transparency |
| **File** | `js/globals.js:836-860` |
| **Description** | **`unhandledrejection` handler only routes network errors to PostHog — all other unhandled promise rejections are console-only.** The handler checks if the rejection message contains "Failed to fetch", "NetworkError", or "Load failed" and routes those to `reportError()`. All other unhandled rejections (auth failures, unexpected nulls, Supabase RPC errors that bubble up unhandled) are written to `console.error` only. This is a significant observability gap: any promise-based operation without a `try/catch` or `.catch()` that throws a non-network error is completely invisible. |
| **Evidence** | `globals.js:858-860`: `else { console.error("[BJ] Unhandled promise rejection:", msg); }` — non-network rejections are console-only. |
| **Remediation** | Replace the `else` console.error with `reportError('unhandled_rejection', reason, { handler: 'unhandledrejection' })`. The existing deduplication in `reportError` will prevent noise from repeated rejections. |
| **Effort** | S |
| **Dependency** | None |

---

### AUDIT-D2-004
| Field | Value |
|-------|-------|
| **Severity** | **P1** |
| **Property** | #16 Observability / #18 Easy Issue Detection |
| **File** | `js/cover-letter.js:97,108,169`, `js/apply-workflow.js:114`, `js/resumes.js:1314,1316,1376`, `js/location.js:1664` |
| **Description** | **9 silent failure points across 4 modules — operations fail with no logging, no PostHog event, no user feedback.** Classified by impact: (1) `cover-letter.js:97` — localStorage resume fetch fails silently, cover letter is generated without resume context and user has no idea. (2) `cover-letter.js:108` — Supabase JD fetch fails silently, cover letter generated without job description context. (3) `cover-letter.js:169` — cover letter history load fails silently, history panel shows nothing with no explanation. (4) `apply-workflow.js:114` — `log-user-activity` fetch explicitly fire-and-forget with empty catch. (5–8) `resumes.js:1314,1316,1376` and `location.js:1664` — storage operations (IndexedDB deletes, Supabase storage removes, file puts) fail silently. |
| **Evidence** | `cover-letter.js:97`: `} catch (_) {}`. `cover-letter.js:108`: `} catch (_) {}`. `cover-letter.js:169`: `} catch (_) {}`. `apply-workflow.js:114`: `.catch(function() {}); // fire-and-forget`. |
| **Remediation** | `cover-letter.js`: Add `reportError('cover-letter:resume-fetch', e)` and `reportError('cover-letter:jd-fetch', e)` to the two data-fetch catches; add `reportError('cover-letter:history', e)` to the history catch. `apply-workflow.js`: Add `.catch(function(e) { reportError('activity-log:flush', e); })` — activity logging failures should be visible even if non-blocking. Storage catches: add `reportError()` calls — silent storage failures cause data loss that Marston cannot diagnose. |
| **Effort** | S |
| **Dependency** | None |

---

### AUDIT-D2-005
| Field | Value |
|-------|-------|
| **Severity** | **P1** |
| **Property** | #18 Easy Issue Detection / #16 Observability |
| **File** | `js/bulk-apply.js:203`, `js/cover-letter.js:111`, `js/linkedin-import.js:85`, `js/resumes.js:1696`, `js/settings.js:812` |
| **Description** | **5 Edge Function calls bypass the API gateway — no correlation ID, no middleware telemetry, no rate limiting.** Direct calls to `supabase.co/functions/v1/{ef-name}` go outside the gateway's request logger, auth middleware, and rate limiter. This means: (a) these calls produce no entries in the gateway's structured log, (b) there is no correlation ID to trace a user's request through the system, (c) failures in these EFs are not attributed to a specific user request in observability tooling, (d) rate limiting is EF-local only. Affected EFs: `bulk-apply-queue`, `generate-cover-letter`, `parse-linkedin-pdf`, `analyze-application-gap`, `extract-resume-profile`. |
| **Evidence** | `bulk-apply.js:203`: `fetch('https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/bulk-apply-queue', ...)`. Same pattern in 4 other files. Gateway base is `api-gateway` — none of these route through it. |
| **Remediation** | Replace all 5 direct URLs with gateway calls: `https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/api-gateway/{ef-name}`. Confirm each EF is registered in the gateway route registry (AUDIT-EF1 will verify). Add `X-Request-ID` header generation in the gateway client helper in `globals.js`. |
| **Effort** | S |
| **Dependency** | AUDIT-EF1 (verify route registry entries) |

---

### AUDIT-D2-006
| Field | Value |
|-------|-------|
| **Severity** | **P2** |
| **Property** | #16 Observability |
| **File** | `js/structured-logger.js` (loaded), all dashboard modules (not used) |
| **Description** | **`structured-logger.js` is loaded on every dashboard page but zero modules call it.** The logger (`BJ.createLogger()`) provides component-level structured logging with PostHog batching, PII sanitisation, and flush-on-unload. It was built, deployed, and documented — but never adopted. The example in the file header shows usage (`var log = BJ.createLogger('job-feed')`) but `job-feed.js` and all other modules still use `console.log`/`console.warn` directly. This means there is no component-level log trail in PostHog to aid debugging. |
| **Evidence** | `grep -rn "\.createLogger\b" js/*.js \| grep -v structured-logger` → 0 results. `structured-logger.js` is loaded via `<script>` tag in `dashboard.html`. |
| **Remediation** | Adopt in the 3 highest-value modules first: `apply-workflow.js`, `job-feed.js`, `cover-letter.js`. Replace `console.warn`/`console.error` calls with `log.warn()`/`log.error()`. This immediately gives PostHog a component-level trace for the most important flows. Track adoption as a CI metric. |
| **Effort** | M |
| **Dependency** | None |

---

### AUDIT-D2-007
| Field | Value |
|-------|-------|
| **Severity** | **P2** |
| **Property** | #18 Easy Issue Detection |
| **File** | `js/apply-workflow.js:1930` |
| **Description** | **Apply success rate is not tracked as a complete business metric.** `feed_apply_complete` only fires in two score-gated mode branches. Direct mode submissions (`proceedToApply` for non-score-gated flows), worker-routed submissions, and all Recruitee API submissions do not fire this event. `worker_submission_complete` captures the worker outcome but with different event name and schema — making funnel analysis across modes impossible. There is no single PostHog funnel that answers "what % of users who click Apply actually get a submission confirmed?" |
| **Evidence** | `_trackFeedApplyComplete()` called at lines 1917, 1921 only — both in score-gated branches. Worker success fires `worker_submission_complete` (different event). Direct Recruitee submissions fire no completion event. |
| **Remediation** | Standardise on `apply_outcome` event with consistent properties: `{ job_id, mode, surface, outcome: 'submitted'\|'failed'\|'queued', ats_type: 'recruitee'\|'worker'\|'direct', duration_ms }`. Fire from all completion paths. Build PostHog funnel: `feed_apply_initiated` → `apply_outcome{outcome=submitted}`. |
| **Effort** | M |
| **Dependency** | None |

---

### AUDIT-D2-008
| Field | Value |
|-------|-------|
| **Severity** | **P2** |
| **Property** | #19 Straightforward Issue Resolution |
| **File** | `js/cover-letter.js`, `js/linkedin-import.js`, `js/bulk-apply.js` |
| **Description** | **Three AIS feature modules have zero PostHog events, making post-incident diagnosis impossible.** If `generate-cover-letter` EF starts returning errors, `parse-linkedin-pdf` fails for all PDFs, or `bulk-apply-queue` stops processing — there is currently no way to detect this from PostHog dashboards. The only signal would be a user complaint or a spike in `reportError` if the catch blocks are fixed. For cover-letter: the generation flow has no start event, no success event, no failure count. For linkedin-import: upload initiation and result are invisible. For bulk-apply: the queue trigger and completion are invisible (AUDIT-D2-001 explains why). |
| **Evidence** | `grep -c "posthog.capture\|captureEvent" js/cover-letter.js` → 0. Same for `linkedin-import.js` and `bulk-apply.js`. |
| **Remediation** | Minimum event set per module: `{feature}_initiated` (user triggers action), `{feature}_completed` (success with key metrics), `{feature}_failed` (error with error_type). For cover-letter: add `cover_letter_initiated`, `cover_letter_completed` (word_count, tone, credits_charged), `cover_letter_failed` (error_type). Once AUDIT-D2-001 is fixed (`capturePostHog` defined), existing calls will fire — but start/fail events still need adding. |
| **Effort** | S |
| **Dependency** | AUDIT-D2-001 (define capturePostHog first) |

---

### AUDIT-D2-009
| Field | Value |
|-------|-------|
| **Severity** | **P2** |
| **Property** | #5 Error Transparency |
| **File** | `js/tier-gating.js:148` |
| **Description** | **Empty catch in `incrementAutoApplyDailyCount()` silently swallows localStorage failures.** If localStorage is full, disabled (private browsing quota exceeded), or throws a SecurityError, the daily limit counter silently fails to increment. The consequence: a user's daily apply count is undercounted, potentially allowing unlimited applies without any signal that the counting system is broken. This compounds the race condition identified in AUDIT-D1-006. |
| **Evidence** | `tier-gating.js:148`: `} catch (e) { }` — empty body, no reportError. |
| **Remediation** | Replace empty catch with `reportError('tier-gating:increment', e)`. Consider falling back to an in-memory counter when localStorage fails rather than silently no-oping. |
| **Effort** | S |
| **Dependency** | None |

---

### AUDIT-D2-010
| Field | Value |
|-------|-------|
| **Severity** | **P2** |
| **Property** | #19 Straightforward Issue Resolution |
| **File** | `js/globals.js` (console-only catches), `js/app.js`, `js/keywords.js`, `js/overlay-analytics.js`, `js/dashboard-inline.js` |
| **Description** | **7 console-only catch blocks in 5 dashboard modules — errors visible only to users with DevTools open.** These catches log to `console.warn` or `console.error` but do not call `reportError()`. Affected modules: `app.js` (2 catches), `admin.js` (1), `chat.js` (1), `dashboard-inline.js` (1), `keywords.js` (1), `overlay-analytics.js` (1). The `globals.js` catches in the encryption/decryption functions are deliberate (warn-and-continue pattern) and are acceptable. The others represent failures in user-facing flows that Marston cannot detect. |
| **Evidence** | `grep -n "console\.(warn\|error)" js/app.js \| grep catch` → 2 results. Pattern repeated across 4 other files. Total 7 console-only catches outside intentional globals.js pattern. |
| **Remediation** | Replace `console.warn/error` with `reportError(label, e)` in the 7 non-globals catch blocks. `reportError` itself calls `console.warn` as well as PostHog, so console output is preserved. |
| **Effort** | S |
| **Dependency** | None |

---

### AUDIT-D2-011
| Field | Value |
|-------|-------|
| **Severity** | **P3** |
| **Property** | #16 Observability |
| **File** | `js/posthog-dashboard.js` |
| **Description** | **PostHog session recording masks all inputs (`maskAllInputs: true`) which limits session replay utility for debugging user-reported issues.** This is a reasonable privacy default, but it means session replays cannot show what a user typed into resume text fields, job search queries, or cover letter prompts when debugging why a feature didn't work as expected. The mask is applied globally with no per-element opt-out for non-sensitive fields. |
| **Evidence** | `posthog-dashboard.js`: `session_recording: { maskAllInputs: true, maskTextSelector: '.sensitive-data' }`. |
| **Remediation** | Evaluate switching to `maskAllInputs: false` with selective masking via `data-ph-mask` on sensitive inputs (password, payment, EEO fields). Non-sensitive inputs (search, job title, company name) can be unmasked to improve debugging. This is a privacy/debugging tradeoff requiring a deliberate decision. |
| **Effort** | S |
| **Dependency** | Privacy review decision |

---

### AUDIT-D2-012
| Field | Value |
|-------|-------|
| **Severity** | **P3** |
| **Property** | #18 Easy Issue Detection |
| **File** | Dashboard (all surfaces) |
| **Description** | **No named PostHog metric tracks trial→paid conversion rate in real time.** `sample_conversion_prompted` and `sample_conversion_upgrade_click` exist, but there is no `subscription_activated` or `trial_converted` event that fires when a user successfully upgrades. The conversion funnel is: `trial_started` → `upgrade_click` → ??? The gap between click and confirmed subscription is invisible. If the billing flow broke, the only signal would be Stripe webhook failures — not a PostHog dashboard alert. |
| **Evidence** | `grep -rn "subscription_activated\|trial_converted\|upgrade_complete" js/*.js` → 0 results. `billing.js` handles subscription UI but has no completion event. |
| **Remediation** | Add `posthog.capture('subscription_activated', { plan, billing_period, source })` in `billing.js` on successful subscription confirmation from Stripe. Build a PostHog funnel: `sample_conversion_upgrade_click` → `subscription_activated`. |
| **Effort** | S |
| **Dependency** | None |

---

## Gap Summary

| Property | Score (0–5) | Finding Count | Highest Severity |
|----------|-------------|---------------|-----------------|
| #5 Error Transparency | 2 | 4 | P1 |
| #16 Observability | 2 | 4 | P0 |
| #18 Easy Issue Detection | 2 | 3 | P0 |
| #19 Straightforward Issue Resolution | 3 | 2 | P2 |

**Overall session score: 2.25 / 5**

---

## P0/P1 Items for Immediate Action

| ID | Severity | Description | Effort |
|----|----------|-------------|--------|
| AUDIT-D2-001 | **P0** | `capturePostHog()` undefined — 7 calls silently no-op, 3 AIS modules have zero PostHog events | S |
| AUDIT-D2-002 | P1 | `window.onerror` is console-only — uncaught JS errors never reach PostHog | S |
| AUDIT-D2-003 | P1 | `unhandledrejection` only routes network errors to PostHog — all others console-only | S |
| AUDIT-D2-004 | P1 | 9 silent failure points in 4 modules — cover-letter, activity-log, storage ops | S |
| AUDIT-D2-005 | P1 | 5 EF calls bypass API gateway — no correlation ID, no middleware telemetry | S |

---

## Next Session

**AUDIT-D3 — Dashboard Performance & Reliability**
Entry gate: AUDIT-D2 findings reviewed. AUDIT-D2-001 (capturePostHog fix) recommended before D3 starts.
