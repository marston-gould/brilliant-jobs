# POSTHOG_MIGRATION_READY.md
# PostHog Cloud → Self-Hosted Migration Design

**Status:** Design doc only — DO NOT EXECUTE  
**Trigger:** Review when PostHog cloud analytics bill exceeds $50/mo  
**Author:** FB-TRIAL-001-S6 (2026-03-14)

---

## Current PostHog Cloud Cost Model

PostHog cloud pricing (as of 2026) is event-based free tier then metered:

| Product | Free tier | Paid tier |
|---------|-----------|-----------|
| Analytics (events) | 1M events/mo free | ~$0.00031/event after |
| Session Replay | 5K recordings/mo free | ~$0.005/recording after |
| Feature Flags | 1M API calls/mo free | ~$0.0001/call after |
| Surveys / Heatmaps | Included | Included |

At 5,000 MAU with ~200 events/user/month = ~1M events/mo — currently in free tier. Costs spike when:
- Event volume exceeds 1M/mo (aggressive PostHog captures or large user base)
- Session Replay enabled beyond free tier
- Feature flag API calls spike from high-frequency polling

**Expected trigger point:** ~8,000–10,000 MAU or ~$50/mo cloud bill.

---

## Billing Cap Settings (Set Now — Manual Step)

> ⚠️ **Action Required:** Set these caps in PostHog dashboard immediately to prevent runaway spend.

**Navigation path:**  
PostHog → Organization (top-left avatar) → Billing → Usage limits (gear icon per product)

| Product | Cap to set | Value |
|---------|-----------|-------|
| Analytics | Monthly spend limit | **$50/mo** |
| Session Replay | Monthly spend limit | **$0** (disable paid tier) |
| Feature Flags | Monthly spend limit | **$0** (free tier only) |

Setting Session Replay and Feature Flags to $0 disables paid overage — they simply stop recording/evaluating once the free tier is consumed each month. This is acceptable at current scale.

---

## Trigger Condition

Do not migrate until:
1. PostHog cloud invoice > $50/mo for 2 consecutive months, OR
2. Privacy requirements demand EU data residency and PostHog Cloud EU pricing exceeds self-hosted TCO

---

## Self-Hosting Architecture Options

### Option A: PostHog Cloud EU
- Hosted by PostHog team in EU (Frankfurt)
- No infra management overhead
- ~Same pricing as US cloud
- Best for: GDPR compliance without ops burden
- Migration effort: DNS/API host change only (~2 hours)

### Option B: Self-Hosted on Fly.io
- Deploy `posthog/posthog` Docker Compose stack on Fly.io
- Requires: 2–4 GB RAM machine, ClickHouse + Postgres + Redis + Kafka
- Cost: ~$40–80/mo for a production-grade Fly.io setup
- Break-even vs cloud: when cloud bill > $100/mo
- Migration effort: ~2 days (infra + data migration + SDK swap)

### Option C: Self-Hosted on Render
- Render Web Services + managed Postgres
- Simpler than Fly.io, slightly more expensive
- Cost: ~$60–100/mo
- Migration effort: ~1.5 days

**Recommended path:** Option A (PostHog Cloud EU) first — zero ops overhead, satisfies GDPR, trivial migration. Only move to Option B/C if EU cloud pricing becomes prohibitive.

---

## Data Migration Plan

### Step 1: Export historical events from PostHog Cloud

```bash
# PostHog Events Export API (paginated)
curl -H "Authorization: Bearer $POSTHOG_PERSONAL_API_KEY" \
  "https://app.posthog.com/api/projects/$PROJECT_ID/events/?format=json&limit=1000&after=2026-01-01" \
  > posthog_export_batch_1.json
```

Repeat with `&before=` / `&after=` cursors for full history. PostHog also provides a bulk export button in Settings → Data Management → Export.

### Step 2: Historical backfill to new instance

PostHog's `/capture` endpoint accepts a `timestamp` field — use this to backfill historical events in chronological order:

```bash
curl -X POST "https://your-self-hosted-host/capture/" \
  -H "Content-Type: application/json" \
  -d '{"api_key": "NEW_API_KEY", "event": "...", "timestamp": "2026-01-15T10:00:00Z", ...}'
```

Backfill at ~500 events/second to avoid overwhelming ClickHouse on new instance.

### Step 3: Feature flag migration

1. Export all feature flags via PostHog API: `GET /api/projects/$ID/feature_flags/`
2. Re-create flags on new instance via API or UI
3. Verify rollout percentages and conditions match
4. Swap `api_host` in SDK (see below) and run both in parallel for 24h to verify parity

---

## SDK Swap Steps (4 surfaces)

All 4 surfaces share the same swap pattern. Change `api_host` only:

### dashboard.html (inline PostHog snippet)
```js
// Before
posthog.init('phc_XXXXX', { api_host: 'https://app.posthog.com' })

// After (self-hosted)
posthog.init('NEW_PROJECT_API_KEY', { api_host: 'https://posthog.yourdomain.com' })
```

### js/landing-app.js, admin-shell.js, extension/background.ts
Same pattern — find `api_host` and replace with self-hosted URL. Project API key also changes.

**Files to update:**
1. `dashboard.html` — inline snippet (~line 8)
2. `js/landing-app.js` — `posthog.init()` call
3. `js/admin-shell.js` — `posthog.init()` call  
4. `extension/background.ts` — `posthog.init()` call

Each change requires a version bump + rebuild.

---

## Feature Flag Migration Path

1. List all flags: `GET /api/projects/{id}/feature_flags/`
2. For each flag, POST to new instance: `POST /api/projects/{id}/feature_flags/`
3. PostHog feature flag evaluation uses deterministic bucketing by distinct_id — rollout percentages will produce consistent results for same users on new instance
4. Verify via: enable flag on 1% of users on new instance, compare with 1% rollout on old instance using same distinct_id set

---

## Engineering Effort Estimate

| Migration path | Effort | Risk |
|----------------|--------|------|
| Cloud EU (Option A) | 2 hours | Very low |
| Fly.io self-hosted (Option B) | 1.5–2 days | Medium (infra ops) |
| Data backfill (all options) | 4–8 hours | Low |
| SDK swap (all options) | 1 hour | Low |
| Feature flag migration | 2 hours | Low |
| **Total (Option A)** | **~1 day** | **Low** |
| **Total (Option B/C)** | **~3 days** | **Medium** |

---

## Checklist Before Executing

- [ ] Cloud bill exceeds $50/mo for 2 consecutive months
- [ ] Billing caps verified set (see above)
- [ ] New PostHog instance provisioned and health-checked
- [ ] Test project created on new instance with sample events
- [ ] Historical export completed and verified (event count matches)
- [ ] Flags exported and re-created on new instance
- [ ] SDK swap deployed to staging, verified working
- [ ] Parallel 24h run: both instances receiving events simultaneously
- [ ] Parity verified: funnel/retention numbers within 2% between instances
- [ ] DNS/CNAME pointing to new instance
- [ ] Old instance deprecated (keep data read-only for 90 days)
