# ADR-03: API Gateway — Architecture Decision Record

**Status:** IMPLEMENTED (SA-004 skeleton, SA-005 full migration — 2026-03-07)
**Authors:** Backend Engineer + Security Engineer + Lead Platform Engineer + DevOps
**Chief Architect Sign-off:** ✅ SA-004 skeleton. SA-005 full migration pending validation.
**Related:** ADR-01 (Search), ADR-04 (TypeScript)

---

## Context

Prior to SA-004, all 88 Edge Functions were callable directly by any client with only per-function auth enforcement. This created:

- **No unified auth layer** — each EF implemented its own JWT verification, with variable quality
- **No rate limiting** — any client could hammer any endpoint without restriction
- **No CDN cache headers** — every request hit cold-start Edge Functions regardless of data freshness
- **No request tracing** — no correlation IDs meant debugging cross-function failures was guesswork
- **No extension point** — adding cross-cutting concerns (analytics, A/B, webhooks) required editing each EF individually

At expected launch scale (hundreds of concurrent users) and planned automation scale (CrewAI agents making 600+ req/min), these gaps would become hard production failures.

---

## Decision

Build a **middleware plugin gateway** as a single Supabase Edge Function (`api-gateway`) that:

1. Receives all `/api/v1/*` requests
2. Runs an ordered middleware pipeline
3. Proxies to the appropriate downstream EF
4. Returns the response with gateway-level headers attached

The gateway is the **primary hook** in the scaling architecture — all future cross-cutting concerns (analytics, transformation, webhook dispatch, A/B routing, feature flags) slot into the middleware pipeline without touching the gateway core or any downstream EF.

---

## Middleware Plugin Interface Contract

Every middleware conforms to this interface:

```typescript
type MiddlewareFn = (
  req: Request,
  ctx: GatewayContext,
  next: () => Promise<Response>,
) => Promise<Response>;
```

**Rules:**
- Call `next()` to continue the pipeline
- Return a `Response` directly to short-circuit (e.g. 401, 429)
- Mutations to `ctx` are visible to all downstream middleware
- Middleware must never throw — catch errors internally, degrade gracefully

**Context fields populated by built-in middleware:**

| Field | Populated by | Description |
|---|---|---|
| `correlationId` | request-logger | UUID for distributed tracing |
| `userId` | auth | Authenticated user ID or null |
| `userRole` | auth | Role from profiles table |
| `rateLimitTier` | auth | anonymous / free / pro / crewai / admin |
| `upstreamFunction` | gateway router | Downstream EF name |

---

## Built-in Middleware (execution order)

### 1. request-logger
- Assigns/forwards `x-correlation-id`
- Logs method + path (no query string, no PII)
- Logs response status + duration on completion

### 2. auth
- Extracts Bearer token from Authorization header
- Service role JWT → admin tier, no DB lookup
- Valid user JWT → queries `profiles.role`, maps to rate limit tier
- Invalid/missing JWT → anonymous tier, allows request to continue
  (downstream EFs enforce their own auth requirements)

### 3. rate-limiter
- Reads limit config from `rate_limits` table (tier + endpoint pattern)
- Counts requests in sliding window via `gateway_request_log`
- Returns 429 with `Retry-After` header if limit exceeded
- Fires request log write as non-blocking fire-and-forget (never fails the request)
- Admin tier bypasses rate limiting entirely

### 4. response-cache
- GET requests only — never caches writes
- Sets `Cache-Control: public, max-age={ttl}, s-maxage={ttl}` for Cloudflare edge caching
- Per-endpoint TTL configuration (chat-job-search: 60s, stats: 600s)
- Non-cached GETs get `Cache-Control: no-store` to prevent accidental CDN caching

---

## Route Registry

Config-driven URL pattern → function name map. Adding a new route is a config change, not a code change.

Format: `/api/v1/{route-key}/*` → `{function-name}` Edge Function

**SA-004 routes (first 10 highest-traffic endpoints):**

| Route key | Downstream EF | Rationale |
|---|---|---|
| `chat-job-search` | chat-job-search | Primary feature, highest user traffic |
| `score-resume` | score-resume | Core pipeline, frequent calls |
| `score-job-fraud` | score-job-fraud | Quality gate, high volume |
| `enrich-jd-ai` | enrich-jd-ai | Enrichment, background + interactive |
| `validate-signup` | validate-signup | Auth path, high volume |
| `account-lifecycle` | account-lifecycle | User lifecycle events |
| `send-notification` | send-notification | Communications, frequent |
| `daily-digest` | daily-digest | Email, scheduled + on-demand |
| `submit-application` | submit-application | Core user action |
| `billing-notifications` | billing-notifications | Revenue path |

**SA-005:** All remaining 78 EFs added to registry. Direct EF paths deprecated.

**Future hook (SA-010+):** Route registry will be extended with `api_consumers` table for per-consumer rate limit overrides and API key authentication for CrewAI agents.

---

## Rate Limit Tiers

| Tier | max_requests/min (global) | chat-job-search | Notes |
|---|---|---|---|
| anonymous | 30 | 10 | IP-keyed |
| free | 120 | 20 | user_id-keyed |
| pro | 300 | 60 | user_id-keyed |
| crewai | 600 | 120 | Agent workloads |
| admin | unlimited | unlimited | Never enforced |

AI endpoint (chat-job-search) has tighter limits due to Claude API cost.

---

## Cache Strategy

| Endpoint | TTL | Rationale |
|---|---|---|
| chat-job-search | 60s | Search results stale quickly |
| refresh-city-stats | 600s | Aggregate stats, slow-changing |
| admin-analytics | 600s | Dashboard aggregates |
| All write endpoints | no-store | Never cached |
| Other GETs | no-store | Prevent accidental auth response caching |

Cache is **Cloudflare edge** (CDN-level) — no in-memory caching at EF level. `Vary: Authorization` ensures separate cache entries per auth state.

---

## Alternatives Considered

### Alternative A: Cloudflare Workers as gateway
**Rejected.** Requires separate deployment pipeline and credentials. Supabase EF proxy keeps all infrastructure in one platform. Can migrate to Workers post-launch if latency becomes critical.

### Alternative B: Middleware embedded in each EF (current state)
**Rejected.** Already proven insufficient — 67 empty catch blocks, zero correlation IDs, per-EF rate limits that were never implemented. The current state IS the problem.

### Alternative C: Vercel Edge Middleware
**Rejected.** Vercel middleware runs before routing, cannot proxy to Supabase EFs without additional network hops. Gateway-as-EF adds only ~10-20ms overhead for a much simpler deployment model.

---

## Latency Overhead Budget

Target: < 50ms gateway overhead (SA-004 exit gate).

Expected breakdown:
- Middleware execution: 2-5ms (no DB calls in logger/cache)
- Auth DB lookup (profiles.role): 5-15ms (only on auth requests; anonymous = 0ms)
- Rate limiter DB lookup: 10-25ms (two queries: config + count)
- Proxy overhead: 5-15ms (internal Supabase network)

Total expected: 22-60ms. DB indexes on `gateway_request_log` (window_key, tier, created_at) are critical to stay within budget.

---

## Scars (Visible Architectural Seams)

Per the hooks-and-scars architecture principle, these deliberate seams are preserved:

1. **Route registry as config** — the boundary between gateway core and routing decisions is a visible seam. The registry was deliberately not embedded in the proxy logic so it can be migrated to a DB-backed table (SA-005/SA-010) without gateway rewrites.

2. **`x-gateway-*` headers** — downstream EFs receive `x-gateway-user-id`, `x-gateway-user-role`, `x-gateway-tier` headers. This is a deliberate scar: these headers are the contract between gateway and EFs. When EFs are refactored to trust gateway auth (removing their own auth checks), this header contract is the migration path.

3. **`gateway_request_log` table** — the rate limiter writes to a Postgres table rather than an in-memory store. This is slower than Redis but creates a permanent record of request patterns — a scar that enables future analytics, abuse investigation, and SLA reporting without additional instrumentation.

4. **Direct EF paths kept active in SA-004** — backward compatibility scar. All existing EFs remain callable directly. Deprecation happens in SA-005. This scar ensures zero-downtime migration.

---

## Files Created (SA-004)

```
supabase/functions/api-gateway/index.ts             — Gateway EF
supabase/functions/_shared/gateway-middleware.ts    — Middleware interface + built-ins
supabase/migrations/v6.19-gateway-rate-limits.sql   — rate_limits + gateway_request_log tables
docs/scaling/adr-03-gateway.md                      — This document
```

---

## Exit Gate Validation (SA-004)

Before SA-005 begins, verify:

- [ ] Auth middleware: valid JWT passes, expired JWT rejected (401), missing JWT → anonymous tier
- [ ] Rate limiting: exceed anonymous tier limit (30/min), verify 429 with Retry-After
- [ ] Routing: `/api/v1/chat-job-search` routes to chat-job-search EF
- [ ] Middleware pipeline: add test middleware, verify executes in correct order, remove cleanly
- [ ] Cache headers: `Cache-Control: public, max-age=60` on chat-job-search GET
- [ ] Cache headers: `Cache-Control: no-store` on POST and non-cached GETs
- [ ] Gateway latency overhead: < 50ms measured in production
- [ ] All 10 routes respond correctly through gateway
- [ ] `x-correlation-id` and `x-api-version` present on all responses
- [ ] `x-gateway` header present confirming request traversed gateway

---

## Next: SA-005

Add all remaining 78 Edge Functions to route registry. Build `api_consumers` table for API key management (hook for future third-party access). Deprecate direct EF paths with log warnings. Target: all 88 EFs through gateway, error rate < 0.1% for 1 hour post-cutover.

---

## SA-005: Full Migration — All 93 EFs + API Consumer Management

Completed: 2026-03-07

### Route Registry: 93 Endpoints by Domain

| Domain | Count | Endpoints |
|---|---|---|
| Jobs (search, enrichment, intelligence) | 14 | chat-job-search, enrich-jd-ai, enrich-job, enrich-job-ondemand, enrich-fcd-batch, preview-jobs, refresh-jobs, refresh-usajobs, refresh-orchestrator, refresh-city-stats, discover-boards, job-intelligence, analyze-hidden-job, score-ai-content |
| Pipeline & Applications | 8 | submit-application, pipeline-write, confirm-pipeline-signal, prompt-pipeline-updates, scan-pipeline-signals, apply-on-notification, auto-apply-trigger, mock-ats-submit |
| Resume & Cover Letter | 6 | score-resume, extract-resume-profile, rewrite-resume, rewrite-resume-analyze, rewrite-resume-execute, generate-cover-letter |
| Scoring & Quality | 3 | score-job-fraud, score-sequence, analyze-application-gap |
| Keywords & Filters | 4 | filter-to-prompt, prompt-to-filter, generate-filter, match-score-overlay |
| User Auth & Lifecycle | 5 | validate-signup, account-lifecycle, account-delete, confirm-email, resend-confirmation |
| Billing & Subscription | 6 | billing-notifications, create-checkout, manage-subscription, stripe-webhook, hire-fee, auto-refill |
| Notifications & Communications | 9 | send-notification, daily-digest, weekly-summary, monthly-report, handle-notification-response, handle-sms-reply, push-subscribe, vonage-webhook, resend-webhook |
| Gmail Integration | 3 | gmail-auth, gmail-disconnect, gmail-scan |
| Referral System | 7 | check-referral-activation, process-referral-reward, referral-clawback, referral-fraud-scan, referral-lifecycle, referral-reward-clawback, distribute-leaderboard-rewards |
| Admin & Content | 7 | admin-analytics, admin-cron-management, approve-content, seo-sync, generate-editorial-content, detect-editorial-insights, evaluate-alerts |
| Extension | 4 | extension-heartbeat, build-extension, answer-form-question, recruiter-lookup |
| Engagement & Sequences | 9 | adoption-sequence, interview-sequence, onboarding-sequence, re-engagement, nps-pulse, periodic-survey-pulse, marketing-campaign, community-feedback, escalation-checker |
| Data & Maintenance | 6 | data-export, cleanup-orphans, archive-inactive, queue-worker, trend-anomaly-detector, health-check |
| Search Infrastructure (deferred) | 2 | typesense-search, typesense-seed |
| **TOTAL** | **93** | |

Note: Original estimate was 88 EFs. Actual count is 93 due to EFs added during remediation sessions (data-export, evaluate-alerts, trend-anomaly-detector, community-feedback, escalation-checker).

### API Consumer Management

**Table:** `api_consumers` (v6.20 migration)

**Built-in consumers (seeded):**

| consumer_id | Tier | Description |
|---|---|---|
| dashboard | free | Primary web dashboard |
| extension | free | Chrome extension |
| landing-page | anonymous | Public landing page |
| admin | admin | Admin panel |

**Authentication flow:**
1. Client sends `X-API-Key: bj_xxxx` header
2. Auth middleware hashes key (SHA-256)
3. Looks up `api_consumers` by `api_key_hash`
4. If found + active: sets `ctx.meta.consumerId` and optional rate limit override
5. JWT auth proceeds normally after consumer identification

**Scar (future third-party access):**
- Table and validation logic exist now
- Self-service developer portal and external API key registration are future work
- CrewAI agent keys (SA-010) will use the same infrastructure
- The architecture is ready when the product decision comes

### Deprecation: Direct EF Access

**Status:** Soft deprecation (log warnings only, no blocking)

**Mechanism:** Gateway sets `x-gateway` header. EFs import `gateway-deprecation.ts` helper to detect and log direct access.

**Timeline:**
- SA-005: Log warnings for direct access
- SA-010+: Consider hard deprecation (reject requests without `x-gateway` header)
- Post-launch: Evaluate based on consumer migration progress

### Files Created (SA-005)

```
supabase/migrations/v6.20-api-consumers.sql           — api_consumers table + seeds
supabase/functions/_shared/gateway-deprecation.ts      — direct access deprecation helper
```

### Files Modified (SA-005)

```
supabase/functions/api-gateway/index.ts                — 10 → 93 routes in registry
supabase/functions/_shared/gateway-middleware.ts        — API key auth + expanded cache TTL
docs/scaling/adr-03-gateway.md                         — this document (SA-005 section)
```
