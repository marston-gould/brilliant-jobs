# Content QA Agent (Agent 1)

> **Session:** SA-010 | **Priority:** 1 (Month 2) | **Pair:** Backend + Eng Lead

## Purpose

Reviews AI-generated editorial content for quality, accuracy, and brand voice. Approves content or flags it for Marston's human review.

## Interfaces

- `generate-editorial-content` Edge Function (via gateway)
- `approve-content` Edge Function (via gateway)
- Supabase editorial tables

## Behavior

- Evaluates every piece of AI-generated editorial content against quality, accuracy, and brand voice criteria.
- Logs approval/rejection decisions with confidence scores.
- Auto-approves when confidence > 90% (after graduating to auto-with-approval).
- Flags edge cases and low-confidence items for Marston's review in the admin panel.

## Human-in-the-Loop

Flagged items go to Marston for final review. Agent auto-approves only after graduating past suggest mode with < 10% override rate.

## Graduation Path

| Phase | Criteria to Advance |
|-------|-------------------|
| Observe (SA-010) | 2+ weeks running. Marston reviews decision logs. |
| Suggest (SA-012) | < 5% false positive rate in observe mode. |
| Auto-with-Approval (SA-021) | 4+ weeks in suggest with < 10% override rate. Auto-approves confidence > 90%. |

## Testing (SA-010)

- Generate 20 editorial content items.
- Run agent against all 20.
- Verify agent logs decisions with confidence scores.
- Verify agent routes all requests through gateway (not direct EF).
- Verify rate limiting tier applies correctly.
- Test kill switch: disable agent, verify it stops processing.
- Verify zero actual approve/reject actions taken (observe mode).

## Infrastructure Created (SA-010)

This is the first agent deployed, so it also establishes the shared CrewAI framework:

- Agent configuration store (Supabase table)
- Agent credentials (gateway API key per agent)
- Agent action log table (`agent_id`, `action_type`, `target`, `payload`, `result`, `confidence`, `created_at`)
- Admin panel kill switch toggle (per agent)
