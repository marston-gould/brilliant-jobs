# Referral Pipeline Agent (Agent 6)

> **Session:** SA-021 | **Priority:** 6 (Month 5) | **Pair:** Backend + Eng Lead

## Purpose

Tracks referral activations, calculates reward eligibility, and flags suspicious referral patterns (same IP, rapid sign-ups). All reward distributions require Marston's explicit approval.

## Interfaces

- Referral tables (from remediation)
- `check-referral-activation` Edge Function (via gateway)
- Leaderboard Edge Function (via gateway)

## Behavior

- Monitors referral activations via referral tables.
- Calculates reward eligibility based on activation criteria.
- Flags suspicious patterns: same IP addresses, rapid sequential sign-ups, other fraud indicators.
- All reward distributions require Marston's approval — this agent never auto-distributes rewards.
- Starts in observe mode.

## Human-in-the-Loop

All reward distributions require Marston approval. This is a permanent constraint, not a trust-level limitation — financial actions always require human sign-off.

## Graduation Path

| Phase | Criteria to Advance |
|-------|-------------------|
| Observe (SA-021) | Starts in observe mode. Logs observations on referral activity. |

## Testing (SA-021)

- Test with mock referral data.
- Verify suspicious pattern detection (same IP, rapid sign-ups).
- Verify reward calculation accuracy.
- Verify agent routes through gateway.
- Test kill switch.

## Notes

This is the final agent deployed (Agent 6 of 6). SA-021 also graduates all existing agents to their next trust levels:

- Content QA Agent → auto-with-approval (confidence > 90% auto-approves)
- Pipeline Health Agent → auto-with-approval (auto-restarts failed crons)
- Data Freshness Agent → suggest mode
- Cost Guardian Agent → suggest mode
- User Support Agent → suggest mode
- Referral Pipeline Agent → observe mode (new)

After SA-021, ADR-05 (CrewAI) is marked as IMPLEMENTED.
