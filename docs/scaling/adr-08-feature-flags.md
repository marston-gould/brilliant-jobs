# ADR-08: Feature Flags + Experimentation

**Status:** IMPLEMENTED
**Session:** SA-025
**Date:** 2026-03-07
**Pair:** Frontend + Backend + Forward-Looking Dev(s)
**Reviewer:** Lead Platform Engineer

---

## Context

With the React SPA (SA-013–SA-017), CrewAI agent framework (SA-010–SA-021), and event bus (SA-024) in place, Brilliant Jobs needs a feature flagging layer to:

1. **Control rollout** — ship code to production without activating features for all users
2. **Run experiments** — A/B and multivariate tests with sticky variant assignment
3. **Gate AI features** — expensive AI paths (resume rewrite v2, pipeline signals) activate only for targeted segments
4. **Support CrewAI graduation** — agents can be gated behind flags during observe → suggest → auto progression
5. **PostHog integration** — experiment exposures must flow into PostHog for statistical analysis

## Decision

Build a lightweight native feature flag system on Supabase, rather than adopting PostHog Feature Flags as primary, LaunchDarkly, or similar SaaS SDKs.

### Architecture

```
Browser / Extension
  │
  ├── FeatureFlagProvider.tsx (React context)
  │     └── useFeatureFlag(key) / useFeatureFlagVariant(key)
  │           └── reads from bootstrapped FlagMap (evaluate_all on mount, 60s poll)
  │
  └── API Gateway ──→ feature-flag-middleware.ts (H-03 activation)
        │               evaluates flags for flag-aware routes
        │               injects x-gateway-flags header (base64 JSON)
        │
        └── feature-flags EF
              actions: evaluate, evaluate_all, create, update, list, status, segments, override
              database: fn_evaluate_flag() + fn_evaluate_all_flags() in Postgres
```

### Tables

| Table | Purpose |
|-------|---------|
| `feature_flags` | Flag registry (key, type, status, rollout_percentage, variants) |
| `user_segments` | Reusable targeting segments (beta, pro, new users, power users) |
| `flag_assignments` | Sticky user→flag assignments (bucket 0–99, variant, override support) |
| `flag_evaluation_log` | Audit trail + PostHog sync (fire-and-forget) |

### Evaluation Algorithm

1. Flag not active → disabled
2. Manual override (admin set) → use override value
3. Targeting rules (future: user attribute matching)
4. Deterministic bucket: `abs(hashtext(user_id + flag_key)) % 100` — deterministic bucket, sticky, reproducible rollout
5. Variant assignment: cumulative weight distribution over `abs(hashtext('variant:' + user_id + flag_key)) % total_weight`
6. Upsert sticky assignment for authenticated users

### Flag Types

| Type | Behavior |
|------|----------|
| `boolean` | On/off via rollout_percentage |
| `percentage` | Same as boolean (explicit naming for clarity) |
| `variant` | Multi-variant with weighted assignment; user always gets same variant |

---

## Alternatives Rejected

### PostHog Feature Flags (primary)

PostHog Remote Evaluation was the first alternative considered. Rejected because:
- Adds PostHog as a hard runtime dependency for every page load
- Flag evaluation requires PostHog SDK initialization (adds ~80ms to FCP)
- Cannot gate at the database/Edge Function layer (only JS-side)
- PostHog plan limits the number of flags on lower tiers

**Scar S-07:** When PostHog Remote Flags become the preferred source (e.g., when PostHog's statistical engine is needed for significance tests), replace `fn_evaluate_all_flags()` with `posthog.getAllFlags()` in `FeatureFlagProvider.tsx`. The `featureFlagMiddleware` hook point remains; swap the evaluation source without changing EF consumers.

### LaunchDarkly / Split.io

SaaS flag platforms — rejected for cost/complexity ratio at pre-launch scale. Can be adopted post-launch via Scar S-07 without changes to EF consumers.

### Redis-backed flag cache

Considered for sub-millisecond flag reads at high volume. Rejected: Supabase read replica handles flag reads. Revisit at 10k+ DAU when flag evaluation shows up in query analytics.

---

## Hook & Scar Points

### Hooks (activated in this session)

| Hook | Location | Activated By |
|------|----------|-------------|
| H-03 | `featureFlagMiddleware()` in gateway pipeline | SA-025 |

H-03 injects `x-gateway-flags` header into requests for flag-aware routes. Downstream EFs parse this header with `parseFlagHeader()` to gate behavior without their own DB calls.

### Scars (standing — ready for future use)

| Scar | Location | What It Enables |
|------|----------|----------------|
| S-06 | `FLAG_AWARE_ROUTES` set in `feature-flag-middleware.ts` | Expand flag injection to more routes without touching gateway core |
| S-07 | `FeatureFlagProvider.tsx` comment block | Swap evaluation source to PostHog Remote Flags or LaunchDarkly |
| S-08 | `flag_evaluation_log.posthog_synced` column | Batch-sync evaluation events to PostHog experiments API |
| S-09 | `flag_assignments.expires_at` column | Time-bounded experiments that auto-expire without code changes |
| S-10 | `feature_flags.targeting_rules` JSONB column | Full targeting rule engine (attribute matching, segment targeting) |
| S-11 | `feature_flags.metadata` JSONB column | Arbitrary flag metadata (owner, docs link, rollback plan) |

### PostHog Integration

Current state: `$feature_flag_called` events fire in `FeatureFlagProvider` when a flag transitions from disabled → enabled on re-fetch. This provides exposure tracking for active experiments.

Future (S-08): When experiment sample sizes are large enough to need statistical significance, implement the `posthog_synced` batch job to push evaluation log rows into the PostHog experiment results API.

---

## Seed Flags (draft — Marston activates)

| Key | Type | Rollout | Purpose |
|-----|------|---------|---------|
| `new-feed-layout` | percentage | 10% | Redesigned feed with inline previews |
| `chat-mode-v2` | boolean | 100% | Streaming chat search responses |
| `pipeline-ai-signals` | boolean | 100% | AI engagement signals in pipeline |
| `referral-dashboard` | percentage | 25% | New referral analytics for beta users |
| `resume-rewrite-v2` | variant | 50% | Control (v1) vs Treatment (v2) rewrite |

---

## Consequences

**Positive:**
- Zero external dependencies (no SaaS SDK in critical path)
- Flag reads hit read replica (SA-018 integration)
- Sticky variant assignment prevents experiment churn
- Admin override support for QA and internal testing
- PostHog experiment exposure tracking without PostHog as a dependency

**Negative:**
- Flag evaluation in Postgres (vs. in-memory) adds ~5–15ms per `evaluate_all` call
- No real-time flag push (60s poll; flags lag up to 60s after activation)
- Targeting rules (S-10) not yet implemented — rollout is bucket-based only

**Mitigations:**
- Read replica routes flag queries away from primary
- 60s lag is acceptable for pre-launch feature rollouts
- Manual override bypasses bucket for instant QA access

---

## Testing

See `tests/sa-025-feature-flags.test.js` — 72 validation tests covering:
- Migration structure (tables, indexes, functions, views, RLS)
- EF actions (evaluate, evaluate_all, create, update, list, segments, override, status)
- React SDK (useFeatureFlag, useFeatureFlagVariant, useAllFeatureFlags)
- FeatureFlagProvider (context shape, polling, PostHog integration)
- Middleware (FLAG_AWARE_ROUTES coverage, header encoding/decoding)
- Gateway integration (route #108, middleware in pipeline)
- ADR documentation (this file)
