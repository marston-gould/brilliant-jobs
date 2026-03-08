# CrewAI Agents — Brilliant Jobs

> **Framework:** CrewAI | **ADR:** ADR-05 | **Gateway Tier:** 600 req/min, 100 AI calls/hr
>
> All agents interface with the platform exclusively through the API gateway (ADR-03). No agent has direct database access. Every agent action is audit-logged. Every agent has a kill switch in the admin panel (CS-013 pattern).

## Agent Roster

| # | Agent | Session | Priority | Status |
|---|-------|---------|----------|--------|
| 1 | [Content QA Agent](content-qa-agent.md) | SA-010 | Month 2 | Planned |
| 2 | [Pipeline Health Agent](pipeline-health-agent.md) | SA-011 | Month 2 | Planned |
| 3 | [Data Freshness Agent](data-freshness-agent.md) | SA-011 | Month 3 | Planned |
| 4 | [Cost Guardian Agent](cost-guardian-agent.md) | SA-020 | Month 3 | Planned |
| 5 | [User Support Agent](user-support-agent.md) | SA-020 | Month 4 | Planned |
| 6 | [Referral Pipeline Agent](referral-pipeline-agent.md) | SA-021 | Month 5 | Planned |

## Trust Level Progression

Every agent follows the same graduation path. Progression requires Marston's explicit approval based on observed decision quality.

| Phase | Duration | Agent Behavior | Human Role |
|-------|----------|----------------|------------|
| **Observe** | 2 weeks per agent | Runs in shadow mode. Logs what it would do. No actions taken. | Marston reviews logs daily. Validates agent judgment. |
| **Suggest** | 2 weeks per agent | Recommends actions via admin panel notifications. No auto-execution. | Marston approves/rejects each suggestion. Feedback trains agent. |
| **Auto-with-Approval** | Ongoing | Auto-executes routine actions (confidence > 90%). Flags edge cases for human review. | Marston reviews flagged items. Override rate tracked. |
| **Autonomous** | When override rate < 5% for 30 days | Full autonomous operation within defined scope. Kill switch always available. | Marston monitors dashboards. Intervenes on anomalies. |

## Graduation Criteria

- Content QA: < 5% false positive rate in observe → suggest. < 10% override rate in suggest → auto-with-approval.
- Pipeline Health: < 10% false positive rate in observe → suggest.
- All agents: Kill switch tested at every trust level before promotion.

## Architecture Principles

- All agents route through the API gateway — never direct database or EF access.
- Every agent action is written to the `agent_action_log` table (agent_id, action_type, target, payload, result, confidence, created_at).
- Agent credentials are per-agent gateway API keys, managed in the `agent_configuration` Supabase table.
- Rate limiting: CrewAI Agent tier (600 req/min, 100 AI calls/hr) enforced at gateway level.
- Kill switches: toggle per agent in admin panel, immediate effect, no restart required.

## Admin Dashboard (SA-012)

The CrewAI admin dashboard provides:

- Per-agent status display (observe / suggest / auto / autonomous)
- Action log browser with filters (agent, date, action type, confidence)
- Override rate tracking (how often Marston overrides agent suggestions)
- Agent health metrics (uptime, actions/day, error rate)

## Implementation Sessions

| Session | Work | Hours |
|---------|------|-------|
| SA-010 | CrewAI framework + Content QA Agent (observe) | 16–20h |
| SA-011 | Pipeline Health Agent + Data Freshness Agent (observe) | 12–16h |
| SA-012 | Agent graduation (observe → suggest) + Admin dashboard | 10–14h |
| SA-020 | Cost Guardian Agent + User Support Agent (observe) | 14–18h |
| SA-021 | Referral Pipeline Agent + Full graduation (all 6 agents) | 12–16h |

## Dependencies

- SA-005 (gateway with middleware plugin architecture) must complete before SA-010.
- SA-010 must complete before SA-011.
- SA-011 must complete before SA-012 (2+ weeks of observe data required).
- SA-012 must complete before SA-020 (graduation pipeline must be operational).
- SA-020 must complete before SA-021 (5 agents deployed before building 6th).
