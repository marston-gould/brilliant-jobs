# Technical Debt Register
**Brilliant Jobs — Scaling Architecture**  
**Maintained by:** Evolvability Strategist  
**Last updated:** 2026-03-08 (SA-026)

---

## Active Debt Items

| ID | Title | Priority | Estimated Cost | Phase Found | Target Session | Owner |
|----|-------|----------|---------------|-------------|----------------|-------|
| TD-001 | S-01: EF auth trust migration (drop inline auth, trust gateway headers) | P1 | 8–12h | S1 | Post-launch, explicit SA session | Backend + Security |
| TD-002 | S-07: Replace custom feature flag polling with PostHog Remote Flags | P2 | 4h | S5 | Post-launch, when PostHog contract signed | Backend |
| TD-003 | S-08: Evaluate ML-based dedup (embedding/MinHash) for high false-negative rate | P2 | 16–24h | S2 | Post-1M jobs | Data Eng |
| TD-004 | S-10: Migrate DataProviders from window.BJ bridge to direct Supabase provider | P1 | 10–16h | S3 | Post-launch SPA consolidation | Frontend |
| TD-005 | SE-002 JWT secret rotation (compensating controls in place, needs maintenance window) | P1 | 2–4h | P1 Audit | Marston coordination required | Security + DevOps |
| TD-006 | Typesense cluster provisioning (SA-001–003 deferred post-launch) | P2 | 6–8h setup | S1 | When search latency > 500ms at scale | Data Eng |
| TD-007 | S-14: Build capacity model using v_partition_stats (SA-028) | P2 | 8h | S4 | SA-028 | Data Eng |
| TD-008 | S-15: Read replica routing analytics and SLA reporting | P2 | 4h | S4 | Post-launch | DevOps |
| TD-009 | ADR-03 S-04: Gateway request logging to Postgres (rate limiter analytics) | P2 | 4h | S1 | Post-launch | Backend |
| TD-010 | Deno std imports pinned to 0.177.0 across all EFs — upgrade to latest stable | P2 | 4h | S1 | Pre-launch or SA-027 | Backend + DevOps |

---

## Resolved Debt Items

| ID | Title | Resolved In | Notes |
|----|-------|-------------|-------|
| TD-R001 | Error silencing: 67 empty catch blocks | CS-P1-003, FIX-11 | All resolved in Phase 1 remediation |
| TD-R002 | Zero error monitoring | CS-003, CS-P1-005 | PostHog + Sentry on all surfaces |
| TD-R003 | Missing TypeScript types (201 `: any` annotations) | SA-022 | All EF files cleaned |
| TD-R004 | Direct EF access (no API gateway) | SA-004, SA-005 | All 108 routes through gateway |
| TD-R005 | Missing database indexes for 1M+ scale | SA-018, SA-019 | Read replica + partitioning |
| TD-R006 | Refresh-mv-incremental dangling gateway route | SA-026 | Fixed: now points to refresh-materialized-views |

---

## Debt Management Principles

1. **Debt is acceptable; invisible debt is not.** Every item on this register is being tracked — that's the goal.

2. **S-01 is the highest-risk activation** because it touches every EF. It must be an explicit SA session with paired assignment, not organic drift. Do not activate it casually.

3. **Priority levels:**
   - P0: Blocking — must resolve before next launch gate
   - P1: High — resolve in next 2–3 sessions
   - P2: Medium — resolve before next major traffic event or feature expansion
   - P3: Low — resolve when convenient, or accept permanently

4. **Adding items:** Any developer can add to this register. Removing items requires Evolvability Strategist review.

5. **Escalation:** If open P0/P1 items exceed 5, escalate to Chief Architect + Marston for prioritization.

---

## Debt Velocity Tracking

| Phase | Items Added | Items Resolved | Net Change |
|-------|------------|----------------|------------|
| Phase 1 Remediation | 10 (audit findings) | 6 | +4 |
| S1–S5 Scaling | 6 | 1 | +5 |
| S6 (SA-026) | 0 | 1 (TD-R006) | -1 |
| **Current total** | | | **10 open** |

---

## Notes

- TD-001 (S-01 EF auth trust) is the highest engineering risk. Once EFs trust gateway headers and drop inline auth checks, any compromise of the gateway propagates everywhere. This must be battle-tested in production for 30+ days before activation.
- TD-005 (JWT rotation) requires a maintenance window and coordination with active users. Marston must schedule this explicitly.
- TD-006 (Typesense) is post-launch only and has a clear activation trigger: user-facing search latency complaints or job count > 750K.
