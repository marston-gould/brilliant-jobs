# Pipeline Health Agent (Agent 2)

> **Session:** SA-011 | **Priority:** 2 (Month 2) | **Pair:** Backend + Data Eng

## Purpose

Monitors pg_cron job execution, detects failures (missed schedules, error returns), triggers re-runs, and alerts on prolonged failures.

## Interfaces

- pg_cron via API gateway
- `monitoring_alerts` table
- Resend (email alerts to Marston)

## Behavior

- Monitors all pg_cron job executions through the gateway.
- Detects missed schedules and error return codes.
- Logs recommended actions: restart cron, alert Marston.
- Sends daily summary email to Marston in observe mode.
- After graduating to auto-with-approval: auto-restarts failed crons, alerts on prolonged failures.

## Human-in-the-Loop

Alert-only for the first month. Auto-remediate (restart failed crons) only after trust period in suggest mode.

## Graduation Path

| Phase | Criteria to Advance |
|-------|-------------------|
| Observe (SA-011) | 2+ weeks running. Marston reviews daily summary emails. |
| Suggest (SA-012) | < 10% false positive rate in observe mode. |
| Auto-with-Approval (SA-021) | Sustained accuracy in suggest mode. Auto-restarts failed crons. |

## Testing (SA-011)

- Simulate cron failure (disable a pg_cron job).
- Verify agent detects and logs the failure.
- Verify agent routes through gateway.
- Verify rate limiting applies.
- Test kill switch.
