# ADR-09: Architecture Fitness Functions
**Status:** IMPLEMENTED  
**Date:** 2026-03-08  
**Session:** SA-026  
**Phase:** S6 — Architecture Governance  
**Authors:** Eng Lead + Evolvability Strategist + Chief Architect  
**Pair:** Eng Lead + Evolvability Strategist + QA + DevOps

---

## Context

After 25 completed sessions (SA-004–SA-025), the Brilliant Jobs platform has accumulated:

- 15 hook points (H-01–H-15) across gateway, CrewAI, SPA, and type system
- 15 scar points (S-01–S-15) representing deferred extension seams
- 8 ADRs documenting architectural decisions
- 108 gateway routes covering all Edge Functions
- 44 database migrations with strict v6.XX ordering for scaling work
- A React SPA with bridge pattern isolating components from legacy globals

The risk we are solving: **architectural drift**. As development continues, there is natural pressure to take shortcuts that silently erode these structures:

- A hook point gets refactored away without anyone noticing
- A scar gets overwritten by a developer who didn't know it was intentional
- A gateway route points to a deleted EF (discovered during SA-026: `refresh-mv-incremental` → `refresh-mv-incremental` was pointing to a non-existent function)
- A CrewAI agent escapes observe mode through a code change
- An ADR decision gets reversed without review

Without automated detection, these regressions accumulate silently until they create expensive failures.

---

## Decision

**Implement 8 architecture fitness functions as automated CI gates** that run on every PR to `main` or `staging`.

A fitness function (per "Building Evolutionary Architectures", Ford/Parsons/Kua) is an objective, automated test of an architectural characteristic. Unlike feature tests that verify what the system does, fitness functions verify how the system is structured — they enforce architectural decisions continuously.

**The 8 fitness functions:**

| ID | Name | What it protects |
|----|------|-----------------|
| FF-01 | Hook Integrity | H-01–H-15 hook points exist at documented locations |
| FF-02 | Scar Point Integrity | S-01–S-15 scar points not accidentally removed |
| FF-03 | Migration Sequence | v6.XX migrations ordered, no duplicates, count non-regression |
| FF-04 | EF Route Registry | All EF directories routed; no dangling routes |
| FF-05 | CrewAI Observe Guard | No agent escapes observe mode without Marston graduation |
| FF-06 | ADR Compliance Snapshot | Key architectural decisions not silently reversed |
| FF-07 | Test Non-Regression | Test count only grows, critical suites never shrink |
| FF-08 | Architecture Boundaries | Bridge pattern enforced; no BJ globals in components |

**Total CI gates after SA-026: 18** (10 quality gates + 8 fitness functions)

---

## Hook & Scar Fitness Function Philosophy

The fitness functions are designed around the **hook and scar** model that has guided the entire scaling architecture:

**Hooks** are designed seams that accept new attachments. A hook that silently disappears means future work must re-cut the seam from scratch — paying the cost twice and potentially breaking existing integrations. FF-01 ensures hooks remain intact.

**Scars** are dormant extension points. They are invisible to end users but visible to developers — deliberate marks that say "extend here when the time comes." An accidentally overwritten scar leaves no breadcrumb for the next developer. FF-02 ensures scars remain readable.

**Both hooks and scars are architectural contracts**, not implementation details. Their removal requires an explicit decision with Chief Architect sign-off, followed by updating both the fitness function and the relevant ADR.

---

## Alternatives Considered

### Option A: Manual evolvability reviews only
Pros: No automation overhead.  
Rejected: Sa-023 review caught significant state but relies on session cadence. Drift between reviews is invisible. The original audit found 67 empty catch blocks that accumulated over months — manual review misses cumulative drift.

### Option B: Snapshot testing (Jest snapshots of key files)
Pros: Catches any change.  
Rejected: Too brittle. Snapshot tests fail on every legitimate refactor, creating review fatigue and pressure to update snapshots blindly.

### Option C: Architecture tests via ts-arch or ArchUnit-style libraries
Pros: Expressive, well-known pattern in enterprise Java.  
Rejected: No mature Node.js equivalent. Our custom scripts are readable, maintainable, and already proven to catch real issues (FF-04 found the dangling `refresh-mv-incremental` route on first run).

### Option D: Selected fitness functions + dependency automation (chosen)
The 8 functions are scoped to high-value structural invariants only. Each function catches a specific class of regression that was either observed historically (the error silencing pattern, the audit's original finding) or poses meaningful risk at launch-scale (agent graduation, ADR compliance).

---

## Bug Found During SA-026

FF-04 (EF Route Registry) caught a real production bug on its first run:

```
❌ Route "refresh-mv-incremental" points to non-existent EF directory
```

The gateway `ROUTE_REGISTRY` had `"refresh-mv-incremental": "refresh-mv-incremental"` but the actual EF directory is named `refresh-materialized-views`. This would cause a runtime dispatch failure in production when the incremental MV refresh was triggered.

**Fix applied:** Gateway route updated to `"refresh-mv-incremental": "refresh-materialized-views"`.

This validates the fitness function approach: a bug that existed since SA-009 was caught immediately on first automated check.

---

## Implementation

**Scripts:** `scripts/ff-01-hook-integrity.mjs` through `scripts/ff-08-architecture-boundaries.mjs`  
**CI:** New `fitness-functions` job in `.github/workflows/ci.yml`, required in `all-gates` summary  
**Docs:** This ADR, `evolvability-review-template.md`, `technical-debt-register.md`  
**Dependency automation:** `.github/dependabot.yml`

---

## Consequences

**Positive:**
- Architectural drift is caught immediately on PR, not in periodic reviews
- Hook and scar erosion becomes a conscious decision, not accidental
- ADR decisions are continuously validated, not just documented
- Test count can only grow — the original audit's "silencing errors" pattern is now mechanically prevented
- Bridge pattern enforced automatically — SPA migration path stays open

**Negative / Accepted tradeoffs:**
- Each new hook point added to an ADR requires updating FF-01
- Each new scar documented requires updating FF-02
- Each ADR decision requires a corresponding FF-06 check
- This maintenance burden is a feature: it forces explicit decisions and discourages accidental reversals

**Evolution protocol:**
- To remove a hook or scar: ADR update + Chief Architect sign-off + FF script update
- To graduate a CrewAI agent: Marston approval + graduation endpoint + GRADUATED_AGENTS list update in FF-05
- To lower a test count minimum: QA Engineer sign-off + documented rationale in FF-07 comment
- Fitness functions themselves are immutable without Chief Architect + Evolvability Strategist review

---

## Scars (S-12 through S-15 are standing; S-16 created here)

| Scar | Description | Activation Trigger |
|------|-------------|-------------------|
| S-16 | `GRADUATED_AGENTS` list in FF-05 | When first agent graduates — update list + HANDOFF note |

---

## Phase S6 Status

SA-026 establishes Phase S6: Architecture Governance. The fitness functions are the primary deliverable. Future S6 sessions may add:
- SA-027: Dependency health automation (Renovate / Dependabot)
- SA-028: Capacity model + partition growth projections
- SA-029: Architectural complexity metrics (coupling, cohesion)
