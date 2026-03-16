# Engineering Audit Properties — Addendum

**Properties #17–21** added 2026-03-15

These five properties extend the original 16 active properties from `Website_Technical_Audit_Properties.docx`
(i18n excluded — not applicable at current stage). Observability elevated to explicit named property.
They reflect the maturity of the Brilliant Jobs platform and the operational realities of a
solo founder running a production system at scale.

---

## Audit Areas at a Glance (Full 21)

| # | Audit Area | Category | Default Priority |
|---|-----------|----------|-----------------|
| 01 | Proficiency | Foundation | Critical |
| 02 | Scalability | Foundation | Critical |
| 03 | Security | Foundation | Critical |
| 04 | Maintainability | Foundation | Critical |
| 05 | Error Transparency | Foundation | Critical |
| 06 | Observability | Operational | High |
| 07 | Testability | Operational | High |
| 08 | Deployability / CI/CD | Operational | High |
| 09 | Developer Experience (DX) | Operational | Medium |
| 10 | Performance | Quality | High |
| 11 | Reliability / Resilience | Quality | High |
| 12 | Cost Efficiency | Quality | Medium |
| 13 | Compliance & Privacy | Governance | High |
| 14 | Documentation | Governance | Medium |
| 15 | Dependency Management | Governance | Medium |
| 16 | Accessibility (a11y) | Quality | Medium |
| **17** | **Observability** | **Operational** | **High** |
| **18** | **Modularity** | **Foundation** | **Critical** |
| **19** | **Easy Issue Detection** | **Operational** | **High** |
| **20** | **Straightforward Issue Resolution** | **Operational** | **High** |
| **21** | **Sturdy** | **Foundation** | **Critical** |

---

## 17. Observability

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

## 18. Modularity

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

## 19. Easy Issue Detection

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

## 20. Straightforward Issue Resolution

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

## 21. Sturdy

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
