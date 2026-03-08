# Cost Guardian Agent (Agent 4)

> **Session:** SA-020 | **Priority:** 4 (Month 3) | **Pair:** Backend + Frontend

## Purpose

Tracks spend across all 12+ services. Alerts on budget thresholds. Can throttle AI endpoints if spend exceeds daily cap to prevent runaway costs.

## Interfaces

- `vendor_cost_budgets` table
- Anthropic usage API
- Supabase metrics
- Typesense Cloud metrics
- Gateway rate limits (for throttle actions)

## Behavior

- Monitors spend across all vendor services via the `vendor_cost_budgets` table.
- Tracks Anthropic API usage (via usage API), Supabase metrics, and Typesense Cloud metrics.
- Alerts at 80% of monthly budget.
- Can throttle AI endpoints at 100% of budget: reduces CrewAI agent rate limits, pauses enrichment queue.
- Marston override available via admin panel (can lift throttle).

## Human-in-the-Loop

Alerts at 80% of budget. Auto-throttle at 100%. Marston can override via admin panel at any time.

## Graduation Path

| Phase | Criteria to Advance |
|-------|-------------------|
| Observe (SA-020) | Starts in observe mode. Reports current spend levels. |
| Suggest (SA-021) | Graduated to suggest mode alongside full agent graduation. |

## Testing (SA-020)

- Simulate 80% budget threshold. Verify alert generated.
- Simulate 100% threshold. Verify throttle recommendation logged.
- Verify agent routes through gateway.
- Test kill switch.
