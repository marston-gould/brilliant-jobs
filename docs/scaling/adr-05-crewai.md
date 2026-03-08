# ADR-05: CrewAI Agent Architecture

> Status: IN PROGRESS (SA-010 + SA-011 + SA-012 complete, SA-020/SA-021 pending)
> Date: 2026-03-07
> Decision Makers: Chief Architect, Forward-Looking Dev, Marston (final approval)

## Context

Brilliant Jobs operates 96+ Edge Functions, 20+ cron jobs, editorial content generation, data pipelines, and monitoring infrastructure. Currently all operational decisions require manual Marston intervention. At scale (1M+ jobs, hundreds of concurrent users), this becomes a bottleneck.

## Decision

Deploy a CrewAI-inspired agent framework with a graduated trust model. Agents start in observe mode (zero actions, decisions logged only) and graduate through suggest → auto-with-approval → autonomous based on demonstrated accuracy.

## Architecture

```
                    ┌──────────────────────┐
                    │  crewai-orchestrator  │  (lifecycle management)
                    │  Gateway route #97    │
                    └──────────┬───────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
  ┌─────┴─────┐         ┌─────┴─────┐         ┌─────┴─────┐
  │ Agent 1   │         │ Agent 2   │         │ Agent 3   │
  │ Content QA│         │ Pipeline  │         │ Data      │
  │ SA-010    │         │ Health    │         │ Freshness │
  │ OBSERVE   │         │ SA-011    │         │ SA-011    │
  └─────┬─────┘         └───────────┘         └───────────┘
        │
  ┌─────┴─────┐
  │ Anthropic │  (Claude Sonnet for QA evaluation)
  │ API       │
  └───────────┘

Data Flow:
  agent_config  →  orchestrator dispatches  →  agent EF runs
  agent_action_log  ←  agent logs decision  ←  agent evaluates
  v_agent_dashboard  ←  admin panel reads  ←  Marston reviews
```

## Trust Levels

| Level | Behavior | Graduation Criteria |
|-------|----------|-------------------|
| **observe** | Logs what it would do. Zero actions. | Default for new agents |
| **suggest** | Recommends in admin panel. Marston approves/rejects. | 2+ weeks observe, < 5% false positive |
| **auto_with_approval** | Auto-executes routine (confidence > 95%). Flags edge cases. | 4+ weeks suggest, < 10% override rate |
| **autonomous** | Fully autonomous. Reserved for future. | Marston explicit approval |

## Database Schema

### agent_config
Central registry. One row per agent. Controls trust level, kill switch, scheduling.

### agent_action_log
Every decision logged with confidence scores, payload, result, and override tracking. In observe mode, `executed = false` always.

### agent_credentials
Per-agent gateway API keys for rate limiting and audit trails. Linked to `api_consumers`.

### v_agent_dashboard
View combining config + 24h stats + last action for admin panel rendering.

## SA-010: Content QA Agent (Agent 1) — DONE 2026-03-07

**What it does:** Reviews AI-generated editorial content in `content_stories` (status = `pending_review`). Evaluates 5 criteria via Claude Sonnet: factual accuracy, brand voice, data completeness, length compliance, actionability.

**Observe mode:** Logs approve/reject decisions with confidence scores. Does NOT call approve-content EF. Marston can review agent judgment quality in admin panel before graduation.

**Files created:**
- `supabase/migrations/v6.24-crewai-agent-framework.sql`
- `supabase/functions/crewai-orchestrator/index.ts`
- `supabase/functions/crewai-content-qa/index.ts`
- `js/admin-crewai.js`
- Gateway routes #97 (orchestrator), #98 (content-qa)

**Admin panel:** CrewAI Agents tab under Operations. Shows agent cards with status, 24h metrics, kill switch toggle, and manual run button. Action log browser with filtering.

## Hook & Scar Points

| Type | What | Purpose |
|------|------|---------|
| HOOK | `agent_config` table | New agents register as rows |
| HOOK | `agentEfMap` in orchestrator | New agent EFs register here |
| HOOK | `agent_type` CHECK constraint | Expandable via ALTER |
| HOOK | `agent_credentials` → `api_consumers` | Per-agent rate limiting |
| SCAR | `agent_action_log.target_type` | Extensible target types |
| SCAR | `config` JSONB field | Agent-specific config without schema change |
| SCAR | `schedule_cron` on agent_config | Future scheduled agents |
| SCAR | pg_cron HOOK comment in migration | Future cron registration point |

## Future Agents (SA-012, SA-020, SA-021)

| Agent | Type | Target SA |
|-------|------|-----------|
| Cost Guardian | Budget tracking, throttle at limits | SA-020 |
| User Support | Tier 1 triage via Canny | SA-020 |
| Referral Pipeline | Fraud detection, reward eligibility | SA-021 |

## SA-011: Pipeline Health Agent (Agent 2) + Data Freshness Agent (Agent 3) — DONE 2026-03-07

### Pipeline Health Agent (Agent 2)

**What it does:** Monitors cron execution health (pg_cron job_run_details), enrichment queue depth, Common Crawl batch stalls, and dedup activity. Runs every 30 minutes via pg_cron.

**Checks performed:**
1. **Cron Execution** — Queries `cron.job_run_details` for failure rates in configurable lookback window. Alerts if any job exceeds 5% failure rate.
2. **Queue Depth** — Monitors `enrichment_queue` pending count. Warn at 500, critical at 2000.
3. **Batch Stalls** — Detects `cc_batch_tracking` entries stuck in running/fetching/parsing for >60min.
4. **Dedup Health** — Checks `dedup_log` for recent activity. Warns if no dedup runs detected.

**Observe mode:** Logs all findings with severity (ok/warn/critical) and recommendations to `agent_action_log`. Zero remediation actions. No AI calls (pure data monitoring, zero Anthropic API cost).

**Files created:**
- `supabase/migrations/v6.25-crewai-agents-2-3.sql`
- `supabase/functions/crewai-pipeline-health/index.ts`
- Gateway route #99 (crewai-pipeline-health)

### Data Freshness Agent (Agent 3)

**What it does:** Monitors materialized view staleness, source-to-MV sync lag, ingestion pipeline progress, data completeness (null rates), and dedup effectiveness. Runs every 6 hours via pg_cron.

**Checks performed:**
1. **MV Staleness** — Queries `mv_refresh_log` for time since last successful refresh. Warn at 60min, critical at 6hr.
2. **Sync Lag** — Compares `ats_jobs` max updated_at against last MV refresh timestamp. Cross-references `ats_jobs_change_log` pending count.
3. **Ingestion Progress** — Analyzes `cc_batch_tracking` completion rates and failure rates by status.
4. **Data Completeness** — Measures null rates across critical columns (title, company_name, location, url, source) in `ats_jobs`. Warn at 10%, critical at 25%.
5. **Dedup Effectiveness** — Trend analysis of `dedup_log` over configurable lookback (default 7 days).

**Observe mode:** Same as Pipeline Health — logs findings, zero actions, zero AI cost.

**Files created:**
- `supabase/functions/crewai-data-freshness/index.ts`
- Gateway route #100 (crewai-data-freshness)

**Shared migration:** Both agents seeded in `v6.25-crewai-agents-2-3.sql` with agent_config, api_consumers, agent_credentials, and pg_cron schedules.

## SA-012: Agent Graduation Framework + Daily Digest — DONE 2026-03-07

### Graduation Framework

**What it does:** Provides a structured, metric-driven process for promoting agents through trust levels (observe → suggest → auto_with_approval → autonomous). Graduation is NEVER automatic — agents become eligible based on metrics, but Marston must explicitly approve.

**Graduation Criteria (per-agent, configurable):**

| Transition | Min Days | Min Actions | Max FP Rate | Max Error Rate | Max Override Rate |
|-----------|----------|-------------|-------------|----------------|-------------------|
| observe → suggest | 14 | 50 | 5% | 2% | — |
| suggest → auto_with_approval | 28 | 200 | — | 1% | 10% |
| auto_with_approval → autonomous | — | — | — | — | Explicit Marston approval only |

**Force-graduate:** Available for Marston override when criteria aren't met but business need exists. Logged as `manual_graduation_forced`.

**Rollback:** Can target a specific level (e.g., auto → observe) or default to one level down. Emergency rollback available without admin auth for orchestrator use on repeated failures.

**Database changes:**
- `agent_graduation_log` table — every trust level transition with metrics snapshot
- `graduated_at` + `graduation_criteria` columns on `agent_config`
- `fn_evaluate_agent_graduation()` — SQL function evaluating readiness per configurable criteria
- `v_agent_graduation_readiness` — view wrapping the evaluation function
- `v_agent_dashboard` — updated to include graduation columns
- `fn_agent_daily_digest()` — structured JSON aggregation for email

**Files created:**
- `supabase/migrations/v6.26-agent-graduation.sql`
- `supabase/functions/crewai-graduation/index.ts`
- `supabase/functions/crewai-agent-digest/index.ts`
- Gateway routes #101 (crewai-graduation), #102 (crewai-agent-digest)

**Admin panel updates:**
- Graduation Readiness table showing each agent's metrics vs. criteria
- ⬆ Graduate and ⬇ Rollback buttons on each agent card
- Send Digest Now button for on-demand email
- Graduated timestamp on agent cards

### Daily Digest Email

**What it does:** Sends a daily summary email at 8am ET with:
- Agent performance (24h actions, confidence, errors, overrides, critical findings)
- Graduation readiness assessment for all agents
- Graduation events in the last 24h
- Alert banner for critical findings

**Recipients:** All users with `admin` role in profiles table. Falls back to ALERT_EMAIL (marston@brilliantjobs.app) via Resend if no admin users found.

**Scheduling:** pg_cron daily at 12:00 UTC (8am ET). Also callable on-demand from admin panel.

### Hook & Scar Points (SA-012 additions)

| Type | What | Purpose |
|------|------|---------|
| HOOK | `graduation_criteria` JSONB on agent_config | Per-agent criteria customization without code change |
| HOOK | `fn_evaluate_agent_graduation()` | Extensible evaluation logic |
| SCAR | `agent_graduation_log.reason` | Extensible reason types for future automation |
| SCAR | `agent_graduation_log.evaluation` JSONB | Metrics snapshot — format evolves with new agents |
| SCAR | Digest recipient logic | Currently admin-role based — ready for team/role expansion |
