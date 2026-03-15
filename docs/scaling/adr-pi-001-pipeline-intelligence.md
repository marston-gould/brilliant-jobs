# ADR-PI-001: Pipeline Intelligence Architecture

| Field | Value |
|-------|-------|
| **ADR ID** | ADR-PI-001 |
| **Status** | IMPLEMENTED |
| **Date** | 2026-03-15 |
| **Author** | Pod 3 (Claude) |
| **Feature** | FB-PI-001 Pipeline Intelligence |

## Context

Pipeline Intelligence requires AI-powered email/calendar classification at scale. Three options evaluated:

1. Supabase Edge Functions + Anthropic API
2. Fly.io worker (existing Playwright/Chromium worker)
3. Dedicated classifier microservice

## Decision

**Supabase Edge Functions calling Anthropic Claude Sonnet.**

EFs are stateless, scale horizontally, deploy via the existing CI pipeline (`supabase functions deploy`), and leverage prompt caching already operational from FB-TRIAL-001-S6. Classification is a pure function: input (email subject + snippet + from + date + source) → output structured JSON. No browser automation, no state, no long-running process.

## Processing Pipeline (implemented)

```
INGEST  gmail-scan EF (extended)
          → Gmail broad-subject query + Calendar API v3
          → pipeline_signal_inbox (UNIQUE dedup, source plugin H-PI-01)
          → user_scan_checkpoints (last_gmail_scan_at, last_calendar_scan_at)

CLASSIFY  classify-pipeline-signal EF (cron */15)
          → Anthropic claude-sonnet-4-20250514
          → Ephemeral system prompt caching (~800 tokens cached, ~200 output)
          → 9 signal types: ACK, REJ-PRE, INT, REJ-POST, OFFER, RESCHED,
            CAL-INT, CAL-OFFER, NONE
          → 6 few-shot examples in system prompt
          → Batch 10/cycle, retry_count < 3

MATCH     process-pipeline-action EF (cron 7,22,37,52)
          → 3-tier company matching:
            (1) rootDomain sender vs company_domain [score 1.0]
            (2) normaliseCompany exact match [score 1.0]
            (3) fn_fuzzy_match_pipeline pg_trgm RPC [threshold 0.35]
          → High/medium confidence + matched → auto_move
          → Low confidence OR untracked → prompted
          → HOOK H-PI-03: TransitionHandler swap point

NOTIFY    Supabase Realtime broadcast on pipeline_signals channel
          → Connected dashboard clients subscribe and refresh
          → PostHog: pipeline_signal_processed, pipeline_stage_auto_moved

ACT       Dashboard pipeline.js
          → Green cards: auto-move notifications (48h undo)
          → Amber cards: low-confidence prompts (Confirm/Wrong/Move to)
          → Blue cards: untracked app confirmations (Add to Pipeline/Dismiss)
          → Gray cards: staleness prompts (Mark/Archive/Snooze 7d)
          → Undo toasts: auto-archive undo (48h window)
```

## Rejected: Fly.io Worker

Fly.io worker is designed for Playwright/Chromium browser automation. Email classification doesn't need a browser. Adding classification to the worker would:
- Mix concerns (ATS form submission + AI classification)
- Create resource coupling (classification spikes competing with submission capacity)
- Require Playwright cold-start overhead for a stateless function call

## Rejected: Dedicated Microservice

Over-engineered for current scale. A dedicated service adds deployment complexity, monitoring surface, and infrastructure cost without proportional benefit until >50K users. The `SignalClassifier` hook (H-PI-02) allows swapping to a streaming or local model without changing the pipeline.

## Hook and Scar Points

### Hooks (Active)
| ID | Name | Implementation |
|----|------|---------------|
| H-PI-01 | Signal Source Plugin | `source` column in pipeline_signal_inbox; gmail-scan writes `gmail`/`calendar` |
| H-PI-02 | Classifier Model Swap | CLASSIFIER_SYSTEM_PROMPT in classify-pipeline-signal; swap for fine-tuned model |
| H-PI-03 | Stage Transition Handler | processSignal() in process-pipeline-action; auto-move or prompt paths |
| H-PI-04 | Signal Notification | send-notification EF via existing notification system |
| H-PI-05 | Pipeline Event Emitter | capturePostHog() + Supabase Realtime broadcast |

### Scars (Dormant)
| ID | Name | Activation Trigger |
|----|------|--------------------|
| S-PI-01 | LinkedIn InMail Signals | LinkedIn API access or extension interception |
| S-PI-02 | SMS Signal Parsing | Twilio integration |
| S-PI-03 | ATS Webhook Ingestion | ATS partnership agreements |
| S-PI-04 | User-Defined Signal Rules | `raw_metadata` jsonb in pipeline_signal_inbox |
| S-PI-05 | Outlook/iCal Calendar | Microsoft Graph OAuth or iCal URL import |
| S-PI-06 | ML Classifier Training | 500+ classified signals in training dataset |
| S-PI-07 | Company Response Analytics | Opt-in data sharing + sufficient user base |

## Database Schema (New Tables)

| Table | Purpose |
|-------|---------|
| `pipeline_signal_inbox` | Raw signal staging (S1) |
| `user_scan_checkpoints` | Per-user scan cursors (S1) |
| `pipeline_pending_confirmations` | Untracked app confirmation queue (S4) |

## Migrations Applied

| Version | Session | Contents |
|---------|---------|----------|
| 20260315000002 | S1 | pipeline_signal_inbox, user_scan_checkpoints, pipeline_signals extensions |
| 20260315000003 | S2 | classify-pipeline-signals pg_cron |
| 20260315000004 | S3 | fn_fuzzy_match_pipeline, process-pipeline-signals pg_cron |
| 20260315000005 | S4 | pipeline_pending_confirmations |
| 20260315000006 | S5 | staleness columns on pipeline_tracking_settings, check-pipeline-staleness cron |

## Cost Estimate

~$0.003 per classification (Sonnet, ~800 input tokens cached + ~200 output tokens).
At 100 signals/user/month × 1,000 users = ~$300/month.
Prompt caching reduces input cost by ~90% vs uncached calls.

## Risk Notes

| Risk | Status |
|------|--------|
| R1: Gmail API rate limits | Mitigated — GMAIL_MAX_MESSAGES=100, checkpoint prevents re-scan |
| R2: Classifier false positives | Mitigated — undo on every auto-move (48h), previous_stage stored |
| R3: OAuth token refresh failures | Mitigated — token_error status, reconnect prompt surfaces |
| R4: Anthropic API cost at scale | Mitigated — prompt caching, Sonnet not Opus, batch processing |
| R5: Google OAuth Testing mode (100 user cap) | **OPEN** — must submit for Google verification before public launch |
| R6: Calendar events without company context | Accepted — low confidence → prompt user, not auto-move |

## Review Date

Re-evaluate at 10K active users or if classification latency becomes user-facing.
