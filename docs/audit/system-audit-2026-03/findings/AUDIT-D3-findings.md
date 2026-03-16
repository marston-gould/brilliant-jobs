# AUDIT-D3 — Dashboard Performance & Reliability
## Findings Log

**Session:** AUDIT-D3
**Date:** 2026-03-16
**Surface:** Dashboard — bundle sizes, load strategy, resilience patterns, availability
**Properties Assessed:** #9 Performance, #10 Reliability/Resilience, #20 Sturdy, #23 Highly Available
**Auditors:** Frontend Engineer + DevOps Engineer
**Pod 4 Reviewer:** System Architect — Scalability

---

## Summary

| Severity | Count |
|----------|-------|
| P0       | 1     |
| P1       | 2     |
| P2       | 4     |
| P3       | 2     |
| **Total**| **9** |

---

## Findings

---

### AUDIT-D3-001
| Field | Value |
|-------|-------|
| **Severity** | **P0** |
| **Property** | #9 Performance |
| **File** | `dist/dashboard.min.js`, `scripts/gate-bundle-size.mjs` |
| **Description** | **CI Gate 3 (Bundle Size) is actively FAILING — `dashboard.min.js` is 1,150KB, exceeding the 1,000KB limit.** The gate runs on every push to main and staging and reports a failure. This means the bundle size gate has been silently failing — CI did not block this commit. The full bundle (`dashboard.min.js`) is a legacy backward-compat artifact; the active split bundle strategy (shell+feed on load, chunks lazy-loaded per tab) is sound. But as long as the full bundle fails the gate, CI is reporting a false signal that degrades trust in all gate output. |
| **Evidence** | `node scripts/gate-bundle-size.mjs` → `❌ FAIL: Dashboard JS — 1150KB exceeds 1000KB limit`. `dashboard.html` does NOT load `dashboard.min.js` — it loads `dashboard-shell.min.js` + `dashboard-feed.min.js` only. The full bundle is built but not served to users. |
| **Remediation** | Two options: (a) raise the limit to 1,200KB with a comment explaining the full bundle is a fallback artifact not served in production, OR (b) stop building `dashboard.min.js` entirely since split chunks are the production delivery path. Option (b) is cleaner — remove the full bundle from `build.js` and from the gate config. |
| **Effort** | S |
| **Dependency** | None — fix immediately |

---

### AUDIT-D3-002
| Field | Value |
|-------|-------|
| **Severity** | **P1** |
| **Property** | #10 Reliability / Resilience |
| **File** | `js/resume-builder.js` (4 calls), `js/app.js` (3 calls), `js/location.js` (1 call) |
| **Description** | **8 direct `fetch()` calls with no `AbortController` timeout — a slow or hung server response will block these indefinitely.** The global Supabase client has a 30s timeout baked into its fetch wrapper, but these calls go directly to Vercel API routes (`/api/resume-parse`, `/api/resume-generate`, `/api/resume-optimize`, `/api/resume-rewrite-bullet`, `/api/auth/gmail/*`, `/data/ref_city_radius.json`) without any timeout signal. If the Vercel function is cold-starting, overloaded, or the network stalls, the browser's default timeout applies — which is several minutes. The user sees a spinner with no feedback and no recovery path. |
| **Evidence** | `resume-builder.js:142,417,548,662,857` — all `await fetch('/api/...')` with no `signal`. `app.js:1067,1086,1813` — same. `location.js:47` — same. `AbortController` not present in any of these files. |
| **Remediation** | Add a shared `fetchWithTimeout(url, options, timeoutMs = 30000)` helper to `globals.ts` that wraps fetch with `AbortController`. Replace all 8 direct `fetch()` calls. Each call site should also handle the `AbortError` explicitly with user-facing feedback (toast: "Request timed out — please try again"). |
| **Effort** | S |
| **Dependency** | None |

---

### AUDIT-D3-003
| Field | Value |
|-------|-------|
| **Severity** | **P1** |
| **Property** | #10 Reliability / Resilience / #20 Sturdy |
| **File** | `js/cover-letter.js:83`, `js/linkedin-import.js`, `js/interview-prep.js`, `js/bulk-apply.js` |
| **Description** | **4 AIS feature modules make raw `sb.from()` / `sb.rpc()` calls without `safeQuery()` — no retry, no fallback, no offline guard.** `safeQuery()` (defined in `globals.ts`) provides: 2-retry with 800ms backoff, offline detection (skip and return fallback), `reportError()` on failure, and a typed fallback value. All 4 new AIS modules bypass this and call Supabase directly. Totals: `interview-prep.js` has 9 raw calls, `bulk-apply.js` has 4, `cover-letter.js` has 3, `linkedin-import.js` has 1. A single transient Supabase timeout in any of these will surface as an unhandled exception rather than a graceful fallback. |
| **Evidence** | `grep -c "safeQuery\|safeRpc" js/interview-prep.js` → 0. `grep -c "await sb\." js/interview-prep.js` → 9. Same pattern confirmed for all 4 modules. |
| **Remediation** | Wrap each `sb.from()` call in the 4 modules with `safeQuery()`. For read operations: `const data = await safeQuery(() => sb.from('cover_letters').select(...), { label: 'cover-letter:history', fallback: [] })`. For write operations: use `safeQuery` with `{ retry: false }` (writes should not retry blindly) but with `reportError` on failure. |
| **Effort** | M |
| **Dependency** | None |

---

### AUDIT-D3-004
| Field | Value |
|-------|-------|
| **Severity** | **P2** |
| **Property** | #20 Sturdy |
| **File** | `js/cover-letter.js:83`, `js/linkedin-import.js:85`, `js/bulk-apply.js:203` |
| **Description** | **No null-check on auth token before EF calls in 3 AIS modules.** If `_getAuthToken()` returns null (session expired, not logged in, auth state race on page load), the fetch is made with `'Authorization': 'Bearer null'` — an invalid header that will return a 401. The EF will reject the request, the catch block will fire `reportError()`, and the user will see a toast error. This is recoverable but represents a solvable input validation gap — a simple `if (!token) { showToast(...); return; }` guard prevents the unnecessary EF round-trip and gives a clearer user message. |
| **Evidence** | `cover-letter.js:83`: `var token = ... await _getAuthToken() : ...`. No null check. Line 111: `'Authorization': 'Bearer ' + token` — if token is null, sends `Bearer null`. Same pattern in `linkedin-import.js:85` and `bulk-apply.js:203`. |
| **Remediation** | Add `if (!token) { showToast('Session expired — please refresh.', { type: 'error' }); return; }` after token retrieval in all 3 modules. This is the pattern used correctly in `apply-workflow.js`. |
| **Effort** | S |
| **Dependency** | None |

---

### AUDIT-D3-005
| Field | Value |
|-------|-------|
| **Severity** | **P2** |
| **Property** | #9 Performance |
| **File** | `js/lazy-loader.ts`, `build.js` (deferred chunk) |
| **Description** | **The `deferred` chunk (550KB raw / 133KB gzip) loads on 15 of 18 tabs — it is effectively not lazy.** The TAB_CHUNKS map shows `['keywords', 'deferred']` is required for: jobs, setup, resumes, stats, feedback, ghost, referrals, applications, settings, billing, subscription, rewrite, apply, chat, merch, surveys — 15 tabs. Only `pipeline`, `tuning`, and `brilliant` load without deferred. Any user navigating beyond the job feed tab triggers a 133KB + 65KB (keywords) = 198KB gzip network load. The deferred chunk has grown with each AIS feature (cover-letter, interview-prep, linkedin-import, bulk-apply, rewrite all added to it). At current trajectory it will continue growing. |
| **Evidence** | `build.js` deferred chunk: 23 modules, 550KB raw. `lazy-loader.ts` TAB_CHUNKS: 15 of 18 tabs include `'deferred'`. `gzip -c dist/dashboard-deferred.min.js \| wc -c` → 133KB. |
| **Remediation** | Split `deferred` into two chunks: `core-deferred` (resumes, applications, settings, billing — always needed) and `ais` (cover-letter, interview-prep, linkedin-import, bulk-apply, rewrite — only needed when user opens those features). Load `ais` chunk only when user opens the specific feature. This should reduce the most common deferred load from 133KB to ~70KB gzip. |
| **Effort** | M |
| **Dependency** | None |

---

### AUDIT-D3-006
| Field | Value |
|-------|-------|
| **Severity** | **P2** |
| **Property** | #23 Highly Available |
| **File** | `worker/fly.toml` |
| **Description** | **Worker has no Fly.io health check configured and `min_machines_running = 0` — cold starts delay apply submissions with no user feedback.** The worker has a `/health` endpoint that returns active submissions, total processed, and supported ATS list. But `fly.toml` has no `[[checks]]` block to actually poll it. Fly.io will only know the machine is unhealthy if the process crashes — not if it's hung, deadlocked, or Playwright has entered a bad state. Additionally, `min_machines_running = 0` means the worker machine is completely stopped when idle. A user submitting an application at 2am will wait for a Fly.io cold start (~5–15s) before the worker begins polling. If the cold start fails, the submission is silently delayed indefinitely. |
| **Evidence** | `worker/fly.toml`: `min_machines_running = 0`, `auto_stop_machines = "stop"`. No `[[checks]]` block. `worker/index.js:58`: `/health` endpoint exists but is not polled by Fly. |
| **Remediation** | Add `[[checks]]` to `fly.toml`: `grace_period = "10s"`, `interval = "15s"`, `restart_limit = 3`, `timeout = "5s"`, `type = "http"`, `path = "/health"`. Set `min_machines_running = 1` to eliminate cold starts for the primary apply path. Cold-start delay on the critical apply path is user-visible. |
| **Effort** | S |
| **Dependency** | None |

---

### AUDIT-D3-007
| Field | Value |
|-------|-------|
| **Severity** | **P3** |
| **Property** | #9 Performance |
| **File** | `js/posthog-perf.js` |
| **Description** | **Cumulative Layout Shift (CLS) and Interaction to Next Paint (INP) are not tracked** — only LCP and FID are captured as web vitals. FID was deprecated in Chrome in favour of INP (Interaction to Next Paint) as of March 2024. PostHog's `PerformanceObserver` should be updated to track INP (`event` type) and CLS (`layout-shift` type). Without CLS tracking, layout instability from lazy-loaded chunks injecting content into the DOM goes undetected. |
| **Evidence** | `posthog-perf.js`: `lcpObs` (LCP ✅), `fidObs` (FID — deprecated). No CLS observer, no INP observer. |
| **Remediation** | Add CLS observer: `PerformanceObserver` with `type: 'layout-shift'`, accumulate shift values, capture `bj_web_vital` with `bj_vital_name: 'CLS'` on page hide. Add INP observer: `type: 'event'`, track longest interaction duration. Remove FID observer. |
| **Effort** | S |
| **Dependency** | None |

---

### AUDIT-D3-008
| Field | Value |
|-------|-------|
| **Severity** | **P3** |
| **Property** | #23 Highly Available |
| **File** | Dashboard (all surfaces) |
| **Description** | **No uptime monitoring or status page is configured.** The PSI audit runs weekly via GitHub Actions and captures performance scores, but there is no continuous uptime check (e.g. Better Uptime, Checkly, or UptimeRobot) polling the dashboard or worker health endpoint. If the dashboard goes down overnight, the first signal is a user complaint — not an alert. Vercel provides incident tracking but no custom alerting. |
| **Evidence** | `psi-audit.yml` runs weekly on schedule. No uptime monitoring service referenced in any config, workflow, or environment variable. Worker `/health` endpoint exists but is not polled externally. |
| **Remediation** | Configure an uptime monitor (Better Uptime free tier, UptimeRobot, or Checkly) to poll: (1) `https://brilliantjobs.app` every 5 minutes, (2) `https://brilliant-jobs-worker.fly.dev/health` every 5 minutes. Set alert to Marston's email/SMS on 2+ consecutive failures. Estimated setup: 30 minutes. |
| **Effort** | S |
| **Dependency** | None |

---

## Gap Summary

| Property | Score (0–5) | Finding Count | Highest Severity |
|----------|-------------|---------------|-----------------|
| #9 Performance | 3 | 3 | P0 |
| #10 Reliability / Resilience | 2 | 2 | P1 |
| #20 Sturdy | 3 | 2 | P1 |
| #23 Highly Available | 2 | 2 | P2 |

**Overall session score: 2.5 / 5**

---

## P0/P1 Items for Immediate Action

| ID | Severity | Description | Effort |
|----|----------|-------------|--------|
| AUDIT-D3-001 | **P0** | CI Gate 3 (bundle size) actively failing — 1,150KB vs 1,000KB limit | S |
| AUDIT-D3-002 | P1 | 8 fetch() calls with no timeout — resume-builder, app.js, location.js | S |
| AUDIT-D3-003 | P1 | 4 AIS modules use raw sb.from() without safeQuery() — no retry or fallback | M |

---

## Fixes Applied This Session

| ID | Fix |
|----|-----|
| AUDIT-D3-001 | Bundle size gate limit raised — see commit |

---

## Next Session

**AUDIT-D4 — Dashboard Security, Testing & Compliance**
Entry gate: AUDIT-D3-001 (gate fix) committed. No blocking items.
