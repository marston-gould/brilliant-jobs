# ADR-05: CrewAI Agent Architecture

> Status: IN PROGRESS (SA-010 + SA-011 + SA-012 + SA-020 complete, SA-021 pending)
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

## SA-020: Cost Guardian Agent (Agent 4) + User Support Agent (Agent 5) — DONE 2026-03-07

### Cost Guardian Agent (Agent 4)

**What it does:** Monitors spend across all vendor services (Anthropic, Supabase, Vercel, Resend, PostHog, Cloudflare, GitHub, Canny) against monthly budgets. Compares `vendor_cost_log` actuals against `vendor_cost_budgets` thresholds. Runs hourly.

**Checks performed:**
1. **Budget Status** — Per-vendor spend vs warn/throttle/hard-stop thresholds via `fn_cost_guardian_summary()`
2. **Spend Velocity** — Month-to-date run rate projection; alerts if full-month projection exceeds 85%/100% of total budget
3. **Anthropic Token Rate** — Proxy cost tracking via `agent_action_log` AI call counts; estimates daily spend vs. daily budget slice

**Database additions:**
- `vendor_cost_budgets` table — 8 vendors seeded with conservative defaults; stores warn_pct/throttle_pct/hard_stop_pct per vendor
- `fn_cost_guardian_summary()` — SQL function returning full budget vs. actual comparison as JSONB for admin panel and orchestrator
- Gateway routes #104 (crewai-cost-guardian)
- pg_cron: hourly (on the hour)

**Observe mode:** Logs all findings with severity (ok/warn/critical) to `agent_action_log`. Zero remediation actions. Agent never throttles or activates kill switches automatically.

### User Support Agent (Agent 5)

**What it does:** Syncs Canny support requests, classifies by category (bug/feature_request/billing/account/general), assigns triage priority (urgent/high/medium/low), and drafts suggested responses for Marston review. Runs every 15 minutes.

**Checks performed:**
1. **Canny Sync** — Fetches latest posts from Canny API boards (general, bugs, feature-requests); upserts to `canny_sync_log`
2. **Triage** — Uses Claude Haiku to classify and prioritize unclassified items (up to 25 per run)
3. **Draft Responses** — Generates suggested response drafts for urgent/high priority items only

**Database additions:**
- `canny_sync_log` table — mirrors Canny posts with triage metadata, priority, agent_suggested_response, marston_reviewed flag
- `fn_user_support_summary()` — queue health function for admin panel: urgent/high/unreviewed/awaiting-triage counts
- Gateway routes #105 (crewai-user-support)
- pg_cron: every 15 minutes

**Observe mode:** Agent NEVER sends responses. `marston_reviewed = false` until Marston explicitly marks items reviewed. All drafts are suggestions only.

**AI usage:** Claude Haiku for classification + draft generation. Max 10 AI calls per run, capped to `max_items_per_run: 25`. Zero cost when CANNY_API_KEY not configured.

### Hook & Scar Points (SA-020 additions)

| Type | What | Purpose |
|------|------|---------|
| HOOK | `vendor_cost_budgets.track_via` column | 'manual' / 'vault_api' / 'stripe_webhook' — extensible without migration |
| HOOK | `vendor_cost_budgets.api_endpoint` | Ready to automate pull from vendor APIs when credentials available |
| HOOK | `fn_cost_guardian_summary()` | RPC function callable by CrewAI orchestrator and admin panel alike |
| SCAR | `canny_sync_log.category` | Enum-like text; ready for new categories as product grows |
| SCAR | `canny_sync_log.agent_suggested_response` | Draft field exists now; delivery mechanism (Canny API) added when agent graduates to suggest mode |
| SCAR | `vendor_cost_budgets` table | Budget ceilings in place before any real spend occurs; thresholds tunable without code changes |

---

## SA-021: Referral Pipeline Agent (Agent 6)

**Status:** IMPLEMENTED — 2026-03-07
**Session:** SA-021
**Trust Level:** observe

### Decision

Build a dedicated CrewAI agent to monitor the referral pipeline for fraud patterns, reward eligibility mismatches, and attribution gaps. The existing `referral-fraud-scan` EF performs real-time fraud scoring per-referral; this agent takes an aggregate observational view across the full pipeline — it never writes to user data and never modifies referral records.

### Rationale

The referral program is a growth-critical surface. Three failure modes are not caught by existing point-in-time fraud scans:
1. **Aggregate fraud patterns** — burst activity from a single referrer across a window
2. **Reward eligibility drift** — rewards issued before fraud was detected, now orphaned
3. **Attribution gaps** — invite-to-referral chain breaks causing lost attribution

An observe-mode agent provides continuous visibility into these patterns without any auto-remediation risk.

### Architecture

**Checks performed:**
1. **Fraud Pattern Monitor** — scans `referrals` for high fraud scores (≥ 0.7), elevated scores (≥ 0.4), burst referral volume (>15/referrer/24h). No AI cost — pure data comparison.
2. **Reward Eligibility Audit** — scans `referral_rewards` for expiring unclaimed rewards (within 7 days), expired backlogs (>50), and eligibility mismatches (active rewards on referrers with only rejected referrals).
3. **Attribution Validation** — scans `referral_invites` for orphaned invites (>48h, no corresponding `referrals` row), conversion velocity (0 conversions in 48h signals pipeline stall).

**Database additions:**
- `fn_referral_pipeline_summary()` — JSONB health snapshot with fraud/rewards/attribution subsections; stable contract for admin panel reads
- `agent_config` row: `id = 'referral-pipeline'`, trust_level = 'observe', schedule_cron = '*/30 * * * *'
- `api_consumers` row: `crewai-referral-pipeline`, rate_limit = 30/min
- pg_cron: every 30 minutes via `crewai-referral-pipeline-check`
- Gateway route #106 (crewai-referral-pipeline)

**Observe mode guarantees:**
- `executed: false` on all `agent_action_log` entries — always
- No writes to `referrals`, `referral_rewards`, or `profiles` tables
- All findings are logged as recommendations only; Marston must take explicit action

### Hook & Scar Points (SA-021)

| Type | What | Purpose |
|------|------|---------
| HOOK | `checkFraudPatterns()` — burst detection block | When trust_level = 'auto': inject auto-ban logic for referrers with score ≥ 0.9 + ≥ 3 confirmed signals |
| HOOK | `checkRewardEligibility()` — mismatch block | When trust_level = 'auto': auto-expire mismatched rewards via `referral-lifecycle` EF `reward_applied` event |
| HOOK | `fn_referral_pipeline_summary()` | CrewAI orchestrator can call this for cross-agent correlated reports |
| SCAR | `agent_config.config.thresholds` | All thresholds (fraud_score_warn, burst_max_referrals, etc.) tunable without code deploy |
| SCAR | `check-referral-activation` EF | Attribution velocity drop (0 conversions / 48h) signals this EF may need attention |

### Graduation Path (Observe → Auto)

The referral pipeline agent will remain in observe mode for launch. Graduation criteria (from `fn_evaluate_agent_graduation()`):
- 14 days of operation with < 5% false positive rate
- 200+ action log entries
- At least 3 confirmed fraud detections validated by Marston
- Explicit Marston approval via admin panel graduation button
