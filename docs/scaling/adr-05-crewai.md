# ADR-05: CrewAI Agent Architecture

> Status: IN PROGRESS (SA-010 complete, SA-011–SA-012 pending)
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

## Future Agents (SA-011, SA-012, SA-020, SA-021)

| Agent | Type | Target SA |
|-------|------|-----------|
| Pipeline Health | Monitors cron execution, detects failures | SA-011 |
| Data Freshness | Monitors MV staleness, sync lag | SA-011 |
| Cost Guardian | Budget tracking, throttle at limits | SA-020 |
| User Support | Tier 1 triage via Canny | SA-020 |
| Referral Pipeline | Fraud detection, reward eligibility | SA-021 |
