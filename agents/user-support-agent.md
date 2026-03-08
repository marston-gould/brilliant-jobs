# User Support Agent (Agent 5)

> **Session:** SA-020 | **Priority:** 5 (Month 4) | **Pair:** Backend + Frontend

## Purpose

Triages support requests from Canny feedback. Handles common Tier 1 issues (password reset guidance, billing questions, FAQ responses) via email templates. Escalates complex issues to Marston.

## Interfaces

- Canny feedback integration
- Email templates (Resend)
- User profiles
- Subscription data

## Behavior

- Ingests support requests from Canny feedback board.
- Classifies requests as Tier 1 (routine) or complex.
- Tier 1 handling: password reset guidance, billing questions, FAQ responses — uses pre-built email templates.
- Complex issues: escalated to Marston with context summary.
- All actions are suggestions until Month 4, then auto-handles Tier 1 issues.

## Human-in-the-Loop

All actions are suggestions until Month 4. After that, auto-handles Tier 1 issues. Complex issues always escalate to Marston.

## Graduation Path

| Phase | Criteria to Advance |
|-------|-------------------|
| Observe (SA-020) | Starts in observe mode alongside Cost Guardian. |
| Suggest (SA-021) | Graduated to suggest mode alongside full agent graduation. |
| Auto (Post SA-021) | Auto-handle Tier 1 issues after Month 4 trust period. |

## Testing (SA-020)

- Submit 10 test support requests (5 Tier 1, 5 complex).
- Verify Tier 1 correctly classified.
- Verify complex correctly escalated.
- Verify agent routes through gateway.
- Test kill switch.
