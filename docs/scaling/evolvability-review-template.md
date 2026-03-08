# Evolvability Review Template
**Phase Transition Gate — Brilliant Jobs Scaling Architecture**  
**Maintained by:** Evolvability Strategist  
**Reviewed by:** Chief Architect + Evolvability Strategist  
**Used at:** Each S-phase transition (S1→S2, S2→S3, S3→S4, S4→S5, S5→S6)

---

## Instructions

Fill in this template at the close of each phase to formally assess architectural health before advancing. This review is **non-blocking** (development continues regardless), but critical findings escalate to Marston + Chief Architect within 48 hours. Findings are logged in `technical-debt-register.md`.

---

## Review Header

| Field | Value |
|-------|-------|
| **Phase Transition** | S___ → S___ |
| **Review Date** | YYYY-MM-DD |
| **Sessions in Phase** | SA-0XX through SA-0XX |
| **Reviewer** | Evolvability Strategist |
| **Chief Architect** | (signature/initials) |
| **Prior Review Finding Count** | N open from last review |

---

## 1. Hook Point Utilization

A **hook** is a designed seam that is already wired up. This section asks: are we getting value from the hooks we built?

| Hook ID | Location | Status | Times Activated This Phase | Assessment |
|---------|----------|--------|--------------------------|------------|
| H-01 | Gateway middleware pipeline | ✅/🟡/🔲 | N | |
| H-02 | agent_config table rows | | | |
| H-03 | agentEfMap orchestrator | | | |
| H-04 | AtsHandler interface | | | |
| H-05 | _shared/types.ts SupabaseClient | | | |
| H-06 | DataProvider React context | | | |
| H-07 | fn_cost_guardian_summary | | | |
| H-08 | enrichment_queue.enrich_type | | | |
| H-09 | extraction_method CC staging | | | |
| H-10 | x-gateway-* headers | | | |
| H-11 | checkFraudPatterns() hook block | | | |
| H-12 | cc_run_dedup_batch() threshold | | | |
| H-13 | refresh_type mv_refresh_log | | | |
| H-14 | vendor_cost_budgets.track_via | | | |
| H-15 | fn_referral_pipeline_summary | | | |

**Hook utilization summary:**
- ACTIVE (has been used this phase or prior): ___
- READY (trigger condition known, not yet met): ___
- DORMANT (no known trigger, by design): ___
- RETIRED (intentionally removed, documented): ___

**Key finding:** (narrative summary — e.g., "H-01 is the highest-leverage hook with 4 activations; H-11 correctly dormant until agent graduation")

---

## 2. Scar Point Readiness

A **scar** is a dormant seam that is structurally prepared. This section asks: are our scars ready when needed?

| Scar ID | Description | Readiness | Activation Trigger Met? | Priority |
|---------|-------------|-----------|------------------------|----------|
| S-01 | x-gateway-* EF auth trust migration | 🟡 | No — 30d post-launch | High |
| S-02 | parseJson<T>() typed parse | 🟡 | No — SA-024+ | Medium |
| S-03 | GatewayContext typed context | 🔲 | No — SA-024 | Low |
| S-04 | webhook_subscriptions filters | 🟡 | No — post-launch | Medium |
| S-05 | agent_type CHECK constraint | 🔲 | On-demand | Low |
| S-06 | FLAG_AWARE_ROUTES expansion | 🟡 | No — when routes grow | Medium |
| S-07 | PostHog Remote Flags swap | 🟡 | No — post-launch | Low |
| S-08 | dedup_log.match_type ML strategy | 🔲 | No — post-1M jobs | Low |
| S-09 | ats_jobs_change_log.op field | 🔲 | No — SA-028+ | Medium |
| S-10 | DataProvider interface swap | 🟡 | No — SA-024+ | High |
| S-11 | canny_sync_log agent response | 🟡 | No — agent graduation | Low |
| S-12 | vendor_cost_budgets.api_endpoint | 🔲 | On-demand | Low |
| S-13 | fn_partition_health() CrewAI hook | 🟡 | Partially active | Medium |
| S-14 | v_partition_stats view | 🟡 | No — SA-028 | Medium |
| S-15 | replica_routing_stats analytics | 🟡 | No — post-launch | Low |
| S-16 | GRADUATED_AGENTS FF-05 list | 🔲 | First graduation | High |

**Scar health summary:** (narrative — e.g., "No scars were accidentally eroded. S-01 is highest-risk activation — recommend explicit SA session")

**Scars at risk of erosion:** (list any scars where surrounding code has changed significantly)

---

## 3. Technical Debt Assessment

List debt items accumulated **this phase** (new items added to `technical-debt-register.md`):

| ID | Item | Priority | Estimated Cost | Owner | Target |
|----|------|----------|---------------|-------|--------|
| TD-___ | | P0/P1/P2 | Xh | | SA-XXX |

**Total open debt items:** ___  
**Debt velocity this phase:** ___ new items, ___ resolved  
**Trend:** ↑ Accumulating / → Stable / ↓ Resolving

---

## 4. Architectural Drift from ADR Decisions

Check each ADR decision manually (FF-06 handles automated checking):

| ADR | Decision | Drift Risk | Evidence |
|-----|----------|------------|---------|
| ADR-01 | Typesense deferred, Postgres FTS primary | Low | chat-job-search route active |
| ADR-02 | SPA React Router, /app/* catch-all | Low | vercel.json rewrite present |
| ADR-03 | All EFs via gateway | Medium | All 108 routes tracked; direct calls possible |
| ADR-04 | TypeScript strict mode | Low | tsconfig enforced, CI gate active |
| ADR-05 | CrewAI observe-only until graduation | Medium | FF-05 active; graduation protocol documented |
| ADR-06 | Live web fetch for CC ingestion | Low | EF structure unchanged |
| ADR-07 | Two-tier dedup | Low | Functions in DB |
| ADR-08 | Deterministic FF bucket | Low | fn_evaluate_flag in DB |
| ADR-09 | Fitness functions enforce architecture | Low | 8 scripts in CI |

**Drift concerns this phase:** (narrative)

---

## 5. Dependency Health

| Category | Status | Last Checked | Action Required |
|----------|--------|-------------|-----------------|
| npm packages (direct) | 🟢/🟡/🔴 | YYYY-MM-DD | |
| npm packages (transitive) | | | |
| Supabase client version | | | |
| Deno std imports (EFs) | | | |
| CDN scripts (SRI hashes current) | | | |
| GitHub Actions versions | | | |

**Dependabot alerts open:** ___  
**High/Critical CVEs:** ___

---

## 6. Pattern Library Compliance

Check that new code added this phase follows established patterns:

| Pattern | Compliance | Violations | Notes |
|---------|------------|------------|-------|
| Bridge hook (components → hooks → window.*) | | | FF-08 active |
| Design tokens (no inline styles) | | | FF-08 + Gate 8 |
| EF shared auth middleware | | | Gate 4 |
| Migration version ordering | | | FF-03 |
| ADR before major decision | | | |
| Paired assignment for P0 sessions | | | |

---

## 7. Fitness Function Maintenance

| Script | Last Updated | Needs Update? | Reason |
|--------|-------------|---------------|--------|
| ff-01-hook-integrity.mjs | SA-026 | | |
| ff-02-scar-integrity.mjs | SA-026 | | |
| ff-03-migration-sequence.mjs | SA-026 | | |
| ff-04-ef-route-registry.mjs | SA-026 | | |
| ff-05-crewai-observe-guard.mjs | SA-026 | | |
| ff-06-adr-compliance.mjs | SA-026 | | |
| ff-07-test-non-regression.mjs | SA-026 | | |
| ff-08-architecture-boundaries.mjs | SA-026 | | |

---

## 8. Overall Assessment & Phase Gate Decision

**Architecture health:** 🟢 Healthy / 🟡 Concerns / 🔴 Critical

**Summary:**
(3–5 sentence narrative of overall architectural health — what's working, what needs attention, what to watch in the next phase)

**Critical findings (escalate to Marston within 48h if any):**
- [ ] No critical findings
- [ ] CRITICAL: (describe finding)

**Recommendations for next phase:**
1. 
2. 
3. 

**Phase gate decision:** ADVANCE / HOLD PENDING RESOLUTION OF:
(List any blockers, or write "None — advance")

---

*Signed: Evolvability Strategist ____________ | Chief Architect ____________ | Date ____________*
