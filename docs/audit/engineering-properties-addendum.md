# Engineering Audit Properties — Addendum

**Properties #17–24** — last updated 2026-03-15

Extends the original 16 active properties from `Website_Technical_Audit_Properties.docx`
(i18n excluded — not applicable at current stage).

---

## Audit Areas at a Glance (Full 24)

| # | Audit Area | Category | Default Priority |
|---|-----------|----------|-----------------|
| 01 | Proficiency | Foundation | Critical |
| 02 | Scalability | Foundation | Critical |
| 03 | Security | Foundation | Critical |
| 04 | Maintainability | Foundation | Critical |
| 05 | Error Transparency | Foundation | Critical |
| 06 | Testability | Operational | High |
| 07 | Deployability / CI/CD | Operational | High |
| 08 | Developer Experience (DX) | Operational | Medium |
| 09 | Performance | Quality | High |
| 10 | Reliability / Resilience | Quality | High |
| 11 | Cost Efficiency | Quality | Medium |
| 12 | Compliance & Privacy | Governance | High |
| 13 | Documentation | Governance | Medium |
| 14 | Dependency Management | Governance | Medium |
| 15 | Accessibility (a11y) | Quality | Medium |
| **16** | **Observability** | **Operational** | **High** |
| **17** | **Modularity** | **Foundation** | **Critical** |
| **18** | **Easy Issue Detection** | **Operational** | **High** |
| **19** | **Straightforward Issue Resolution** | **Operational** | **High** |
| **20** | **Sturdy** | **Foundation** | **Critical** |
| **21** | **Fault Tolerant** | **Quality** | **High** |
| **22** | **Deterministic** | **Foundation** | **Critical** |
| **23** | **Highly Available** | **Quality** | **High** |

---

## 16. Observability

**Category:** Operational | **Priority: High**

> **Core Question:** Can you see what your system is doing in production right now — and does it tell you before users do?

**Why It Matters**

Observability goes beyond error catching. It means structured logs, metrics, traces, and dashboards that answer "why is this slow?" or "why did that fail?" without a two-hour debugging session. A system is observable when you can understand its internal state by examining its outputs. For a solo founder, observability is the force multiplier that makes it possible to maintain a complex production system without a team — the system has to be able to explain itself. The three pillars are logs, metrics, and traces. All three are necessary. PostHog is the current implementation; the discipline is permanent.

**What to Audit**

- **Logging infrastructure** — Are logs structured, centralized, searchable, and retained long enough to investigate incidents? Can you filter by user ID, request ID, feature, or error type?
- **Metrics collection** — Are system metrics (worker health, EF invocation rates, queue depth, DB connection pool) and application metrics (apply success rate, score distribution, trial conversion) captured and graphed?
- **Event coverage** — Are all meaningful user and system actions captured as named events with rich properties? Or are there black holes where activity is invisible?
- **Distributed tracing** — Can you trace a single apply flow — from extension trigger through gateway through worker through ATS submission — and see where time is spent or where it failed?
- **Dashboard utility** — Are dashboards used and current, or are they stale artifacts nobody opens? Do they answer the questions that actually arise during incidents?
- **Alerting quality** — Are alerts actionable and specific? Is there alert fatigue from noisy, non-actionable notifications? Are thresholds calibrated to real failure conditions, not defaults?
- **Business observability** — Can you see in real time: apply success rate, trial→paid conversion, job feed freshness, extension active users? Or only technical infrastructure metrics?

**Red Flags**

```
⚠ No centralized log search — debugging requires grepping individual service logs
⚠ Events captured but never reviewed — PostHog dashboards that nobody opens
⚠ Apply flow success rate not tracked as a named metric
⚠ Worker health not visible until it stops responding
⚠ No way to correlate a user complaint with a specific event trail
⚠ Dashboards last updated at initial setup, not reflecting current feature set
⚠ Alert thresholds set to defaults, not calibrated to the system's actual baseline
```

**Common Tools & Technologies**

PostHog (events, funnels, session replay, dashboards), structured logging (pino), Fly.io metrics, Supabase Dashboard, Vercel Analytics, uptime monitors (Better Uptime, Checkly), `captureEvent()` with rich properties throughout the codebase

**Primary Owners**

**DevOps Engineer • Backend Engineer • Engineering Lead • Forward-Looking Developer**

---

## 17. Modularity

**Category:** Foundation | **Priority: Critical**

> **Core Question:** Is the system composed of independent, replaceable units — or is everything tangled together so that changing one thing breaks another?

**Why It Matters**

Modularity is the structural property that determines how much the system resists change versus accommodates it. A modular system lets you swap a data provider, add a new feature, or isolate a failing component without triggering a cascade of unintended consequences. Without modularity, every change is expensive and every new capability is a negotiation with existing code. The hook-and-scar architecture only works if the boundaries between modules are real — not nominal.

**What to Audit**

- **Boundary enforcement** — Are module boundaries enforced by tooling (import rules, layer fitness functions, barrel files), or just by convention that erodes over time?
- **Dependency direction** — Do dependencies flow in one direction? Data providers should never import from UI components. Components should never reach into pages. Violations are structural rot.
- **Coupling measurement** — How many modules does changing one module require you to touch? High fan-out on writes is the clearest signal of poor modularity.
- **Shared state hygiene** — Is global state minimal and intentional? Or does implicit shared state (global variables, singletons, module-level caches) create invisible coupling between unrelated components?
- **API surface discipline** — Are public interfaces for each module explicitly defined (barrel exports, typed contracts)? Or can consumers reach into module internals freely?
- **Feature containment** — When a new feature is added, does it require changes across many unrelated files, or does it land cleanly in a contained area?
- **Hook point integrity** — Are documented hook points (provider interfaces, middleware slots, event subscriptions, feature flag API) accessible and unconsumed? Or have they been quietly bypassed in favor of direct calls?

**Red Flags**

```
⚠ Adding a feature requires changing 10+ files across unrelated directories
⚠ Circular dependencies between modules
⚠ Direct Supabase client usage outside the data provider layer
⚠ Direct Edge Function calls that bypass the API gateway
⚠ Components that import from other components' internal files, not their public API
⚠ Single massive utility file that everything imports from
⚠ Feature flags wired directly into business logic rather than through the flag SDK
```

**Common Tools & Technologies**

ESLint import rules (`eslint-plugin-import`, `eslint-plugin-boundaries`), TypeScript path aliases for enforced layer separation, architecture fitness functions in CI, dependency-cruiser, Madge (circular dependency detection), barrel file discipline

**Primary Owners**

**Chief Architect • Lead Platform Engineer • Engineering Lead • Forward-Looking Developer**

---

## 18. Easy Issue Detection

**Category:** Operational | **Priority: High**

> **Core Question:** When something goes wrong, how fast does the team know — and do they know from the system or from a user complaint?

**Why It Matters**

Detection speed is the first multiplier on incident cost. A system that tells you something is wrong within seconds gives you options. A system that requires a user to report a problem first has already incurred the full cost of the failure — plus the trust damage. Easy issue detection means the system is opinionated about surfacing its own problems: structured errors, centralized alerting, anomaly detection, and dashboards that show the system's health at a glance rather than requiring investigation to discover it.

**What to Audit**

- **Error capture completeness** — Are all errors — frontend exceptions, Edge Function failures, worker crashes, cron job failures, RPC errors — captured and routed to a central system (PostHog, Sentry, Datadog)? Or are there silent failure paths?
- **Silent failure inventory** — Are there empty catch blocks, fire-and-forget async calls, or console-only error handling? These are detection blind spots. Every one is a class of problem that will go undetected.
- **Alert coverage** — Are alerts configured for the failure modes that matter: error rate spikes, queue depth growth, worker downtime, billing failures, auth failures? Or is alerting ad hoc?
- **Alert signal quality** — Are alerts actionable and specific, or is there alert fatigue from noisy notifications that the team has learned to ignore?
- **Anomaly vs. threshold alerting** — Is alerting purely threshold-based (error count > N) or does it also detect anomalies (sudden change in a metric's baseline)?
- **Health check coverage** — Do all services expose health endpoints? Are they polled? Does a failure surface immediately or only when the service is called?
- **Business metric visibility** — Can you see in real time when signups drop, when apply success rate falls, or when a payment flow breaks? Or are business-level issues only visible retrospectively?

**Red Flags**

```
⚠ Users report bugs before the team detects them
⚠ Empty catch blocks anywhere in the codebase — each one is a detection blackout
⚠ Cron jobs or background workers with no failure alerting
⚠ Errors logged only to the browser console, not captured to a monitoring system
⚠ No alerting on billing, auth, or apply flow failures
⚠ Dashboards that require manual refresh to see current state
⚠ Monitoring configured but never reviewed — stale dashboards no one opens
```

**Common Tools & Technologies**

PostHog (`captureEvent`, `captureException`), structured logging (pino, winston), uptime monitors (Better Uptime, Checkly), anomaly detection (Datadog, Grafana), health check endpoints, cron job heartbeat monitoring (Cronitor, Healthchecks.io)

**Primary Owners**

**Engineering Lead • DevOps Engineer • Backend Engineer • Frontend Engineer**

---

## 19. Straightforward Issue Resolution

**Category:** Operational | **Priority: High**

> **Core Question:** When an issue is detected, can a developer go from alert to root cause to fix without archaeology?

**Why It Matters**

Detection without resolution capability is just stress. The value of knowing something is broken is entirely determined by how fast and confidently you can fix it. Straightforward resolution requires: enough context in the error to understand what happened, enough tooling to reproduce it, enough isolation in the code that the fix doesn't break something else, and enough test coverage to verify the fix held. Systems that are hard to fix get avoided — developers route around the problem, accrete workarounds, and the system accumulates structural debt that makes the next fix even harder.

**What to Audit**

- **Error context richness** — When an error is captured, does it include enough context to understand what happened without needing to reproduce it? User ID, request parameters, environment, stack trace, preceding events?
- **Local reproducibility** — Can a production issue be reproduced locally? Is there seed data, environment parity, and tooling to replay failure scenarios?
- **Blast radius isolation** — When fixing a bug, how much of the system does the developer need to understand? Small blast radius (fix is contained to one module) is a sign of good modularity. Large blast radius is a red flag.
- **Fix verification** — Is there a test that can verify the fix works before it ships? Or does the developer deploy and watch the error count?
- **Rollback speed** — If a fix makes things worse, how fast can you revert? Under 5 minutes is good. "Deploy the previous version forward" is not good enough.
- **Runbook coverage** — Are common failure scenarios documented with resolution steps? Or does every incident require ad hoc investigation from scratch?
- **Post-incident learning** — Are postmortems conducted for significant incidents? Are the systemic causes (not just the proximate ones) addressed?

**Red Flags**

```
⚠ Error messages that say "something went wrong" with no additional context
⚠ No request ID or correlation ID to trace a user's specific failure
⚠ Fixes require understanding the entire system rather than a contained module
⚠ No way to reproduce production conditions locally
⚠ Fixes shipped without a test — same bug recurs in a future release
⚠ Incident response is tribal — only one person knows how to fix certain classes of problem
⚠ No rollback capability — fixes must always go forward
```

**Common Tools & Technologies**

PostHog session replay, structured error context (`captureEvent` with properties), feature flags (targeted rollback without full revert), Playwright for reproducing user flows, Vitest for regression test coverage, runbooks in `docs/`, postmortem templates

**Primary Owners**

**Engineering Lead • Backend Engineer • Frontend Engineer • DevOps Engineer • Technical Writer**

---

## 20. Sturdy

**Category:** Foundation | **Priority: Critical**

> **Core Question:** Does the system hold its shape under pressure — load spikes, bad inputs, dependency failures, and time — without requiring constant intervention to keep it standing?

**Why It Matters**

Sturdy is distinct from Reliability/Resilience (property 11), which asks "what happens when something fails?" Sturdy asks a harder question: does the system degrade gracefully under conditions it wasn't explicitly designed for, or does it require heroics to keep running? A sturdy system doesn't need babysitting. It handles malformed inputs without crashing, absorbs unexpected load without cascading, rejects invalid state rather than persisting it, and recovers from restarts cleanly without manual intervention. For a solo founder, sturdiness isn't optional — there's no on-call rotation to catch what the system can't handle itself.

**What to Audit**

- **Input validation coverage** — Are all inputs validated at the boundary before they enter the system? API payloads, user-provided strings, file uploads, query parameters? Or does invalid input propagate until it causes a runtime error somewhere deep?
- **Invariant enforcement** — Are database constraints (NOT NULL, UNIQUE, CHECK, foreign keys) defined at the schema level, not just in application code? Application-level-only validation is a single point of failure.
- **Graceful degradation under load** — When request volume spikes, does the system queue and throttle, or does it fall over? Are rate limits enforced to protect downstream services?
- **Restart cleanliness** — Can every service — worker, Edge Function, cron — restart from a clean state without manual intervention? Is there any state that only lives in memory and gets lost on restart?
- **Dependency failure tolerance** — If a non-critical dependency (analytics, third-party enrichment, email) becomes unavailable, does the core system continue running? Or does a dependency failure take down unrelated functionality?
- **Resource leak prevention** — Are database connections, file handles, and event listeners properly cleaned up? Do long-running processes accumulate memory or connection pool exhaustion over time?
- **Defensive programming discipline** — Is there consistent
defensive coding (null checks, type guards, bounds checks) discipline or does the code assume happy-path inputs?

**Red Flags**

```
⚠ API endpoints that crash on unexpected input rather than returning a 400
⚠ Validation only in the frontend — no server-side enforcement
⚠ Database constraints missing — relying solely on application logic for data integrity
⚠ Worker or cron process that requires manual restart after a crash
⚠ A failed analytics call that brings down the apply flow
⚠ Memory or connection pool growth over time that requires periodic restarts
⚠ Any service that can't be restarted cold without manual state reconstruction
```

**Common Tools & Technologies**

Zod / TypeScript strict mode (input validation), Supabase RLS + schema constraints (invariant enforcement), Fly.io `restart = always` + health checks (restart cleanliness), circuit breaker patterns, rate limiting middleware, PostHog error capture on all catch blocks

**Primary Owners**

**Chief Architect • Engineering Lead • Backend Engineer • DevOps Engineer**

---

## 21. Fault Tolerant

**Category:** Quality | **Priority: High**

> **Core Question:** When a component fails, does the system continue operating — degraded but functional — or does one failure bring everything down?

**Why It Matters**

Fault tolerance is about designing for the inevitability of failure. Not if a dependency goes down, but when. The difference between a fault-tolerant system and a fragile one is not uptime under normal conditions — it's behavior under abnormal ones. A fault-tolerant system isolates failures: a broken enrichment service doesn't break job ingestion; a failed email send doesn't block an apply submission; a crashed worker doesn't corrupt the queue. Faults are expected, contained, and survivable. For a solo founder with no on-call rotation, fault tolerance is what keeps the product running while you sleep.

**What to Audit**

- **Failure isolation** — Are failures contained within the component that failed, or do they cascade? Can a single failing Edge Function, worker crash, or third-party timeout take down unrelated functionality?
- **Fallback behavior** — When a non-critical service fails (analytics, enrichment, email), is there a defined fallback? Does the system degrade gracefully or error hard?
- **Retry and backoff discipline** — Are transient failures retried with exponential backoff and jitter? Or do failures propagate immediately to the caller?
- **Circuit breaker implementation** — Are there circuit breakers on high-volume external calls? When a downstream service is degraded, does the system stop hammering it?
- **Partial failure handling** — In bulk operations (batch apply, batch scoring), does a single item failure abort the entire batch, or are failures isolated and the rest processed?
- **Queue durability** — If the worker crashes mid-processing, are jobs lost or re-queued? Is the queue durable across restarts?
- **Timeout discipline** — Are all external calls (API requests, DB queries, EF invocations) wrapped with timeouts? Or can a single slow call block a thread indefinitely?

**Red Flags**

```
⚠ One failing Edge Function causes a cascading 500 across unrelated features
⚠ No fallback when a third-party API is unavailable — full feature blackout
⚠ Batch jobs that abort entirely on a single item failure
⚠ External API calls with no timeout — a slow upstream hangs the entire request
⚠ Queue jobs lost on worker restart — no durability guarantee
⚠ No circuit breakers on high-volume external calls
⚠ Retry logic that hammers a failing service without backoff, accelerating the failure
```

**Common Tools & Technologies**

Exponential backoff utilities, circuit breaker patterns (opossum), Fly.io worker restart policies (`restart = always`), durable queues (pg-based queue, BullMQ), timeout wrappers on all fetch calls, partial-failure patterns in batch EFs, PostHog fault event capture

**Primary Owners**

**Engineering Lead • Backend Engineer • DevOps Engineer • Chief Architect**

---

## 22. Deterministic

**Category:** Foundation | **Priority: Critical**

> **Core Question:** Given the same inputs, does the system always produce the same outputs — and if not, are the sources of non-determinism intentional and controlled?

**Why It Matters**

Non-determinism is the enemy of debuggability. When the same action produces different results in different runs, you can't reason about the system, you can't write reliable tests, and you can't trust your own data. Determinism doesn't mean the system never uses randomness — it means that randomness is explicit, controlled, and accounted for. Uncontrolled non-determinism in job scoring, apply flow routing, or state transitions creates a class of bugs that are nearly impossible to reproduce and fix. At the Brilliant Jobs scale — automated ATS submissions, AI-scored jobs, trial gate logic — determinism is what makes the system trustworthy.

**What to Audit**

- **Scoring and ranking stability** — Do job scores, resume match scores, and rankings produce consistent results for the same inputs? Are AI model calls deterministic (temperature=0 where consistency matters) or do they produce different outputs on each call?
- **State transition determinism** — Are state machines (application status, trial gate state, subscription state) deterministic? Can the same sequence of events produce different final states depending on timing?
- **Idempotency of write operations** — Are critical write operations (apply submission, payment processing, status updates) idempotent? Can they be safely retried without producing duplicate effects?
- **Time dependency** — Are there behaviors that change based on the current time in ways that are not explicit and testable? Expiry logic, trial windows, and scheduled actions should be deterministic given a known time input.
- **Race condition inventory** — Are there concurrent operations that can produce different outcomes depending on execution order? Concurrent applies, simultaneous tier upgrades, parallel cron runs?
- **Test reproducibility** — Can tests be run in any order and produce the same results? Or do tests depend on shared state, execution order, or external services?
- **External data stability** — When the system consumes external data (job feeds, AI responses, enrichment), are the non-deterministic boundaries explicit and handled?

**Red Flags**

```
⚠ AI scoring calls with temperature > 0 where consistency is required
⚠ State transitions that produce different results depending on which request arrives first
⚠ Write operations that aren't idempotent — retrying causes duplicate records or charges
⚠ Tests that pass in isolation but fail when run in parallel or in different order
⚠ Cron jobs with no guard against concurrent execution — two runs overlap and corrupt state
⚠ Ranking results that change between page loads for the same query
⚠ Apply flow behavior that varies based on unmeasured timing differences
```

**Common Tools & Technologies**

Idempotency keys on write operations, database-level unique constraints, `temperature: 0` on determinism-critical AI calls, mutex/advisory locks for concurrent cron prevention, deterministic test fixtures (no `Date.now()` in test logic), Vitest with isolated test state

**Primary Owners**

**Chief Architect • Backend Engineer • Engineering Lead • QA Engineer**

---

## 23. Highly Available

**Category:** Quality | **Priority: High**

> **Core Question:** Is the system available to users when they need it — and is availability a designed property, not a lucky outcome?

**Why It Matters**

High availability is the commitment that the system will be reachable and functional for users at the times they need it. It's distinct from Reliability (which covers graceful failure handling) and Fault Tolerance (which covers component-level failure isolation). High availability is about the end-to-end question: can a user open the dashboard, trigger an apply, or check their pipeline right now? For Brilliant Jobs, availability failures during peak job-search hours — weekday mornings — are disproportionately damaging. HA is achieved through redundancy, zero-downtime deployments, health monitoring, and eliminating single points of failure, not through hoping nothing breaks.

**What to Audit**

- **Uptime measurement** — Is uptime actively measured and tracked? Is there an SLO (e.g. 99.5% monthly)? Do you know your actual uptime over the last 30 days?
- **Single points of failure** — What components, if they went down, would make the product completely unavailable? Are any of those unprotected? Database, gateway, worker, auth provider?
- **Zero-downtime deployments** — Do deployments cause downtime? Is there a rolling deploy strategy, or does each deploy take the service offline briefly?
- **Health check and auto-recovery** — Do all services have health check endpoints that are monitored? Are unhealthy instances automatically replaced or restarted without manual intervention?
- **Database availability** — Is the database on a managed platform with automatic failover? Are connection pool settings tuned to survive traffic spikes without exhaustion?
- **CDN and static asset availability** — Are static assets served from a CDN with high availability guarantees? Is the availability of static assets decoupled from the availability of the application server?
- **Dependency availability risk** — Which third-party dependencies (Supabase, Fly.io, Vercel, Anthropic API, Resend) are on the critical path for availability? What's the plan when each one has an outage?

**Red Flags**

```
⚠ No uptime monitoring — outages discovered by users, not alerts
⚠ Deployments that take the service offline, even briefly
⚠ No automatic restart on worker crash — requires manual intervention to restore availability
⚠ Database connection pool exhaustion under moderate load — availability collapses under traffic
⚠ Single Fly.io machine for the worker with no redundancy
⚠ No status page — users have no visibility into known incidents
⚠ Third-party outage (e.g. Supabase) causes full product blackout with no degraded mode
```

**Common Tools & Technologies**

Better Uptime / Checkly (uptime monitoring + status page), Fly.io multi-instance deploy + health checks, Vercel zero-downtime deploys, Supabase managed HA + connection pooler (pgBouncer), CDN (Cloudflare) for static assets, PostHog availability event tracking

**Primary Owners**

**DevOps Engineer • Engineering Lead • Backend Engineer • Chief Architect**
