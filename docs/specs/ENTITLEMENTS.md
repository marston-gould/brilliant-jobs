# Entitlements System

**Date:** 2026-02-19
**Status:** Live in production

---

## Overview

The entitlements system controls feature access across Brilliant Jobs. It replaces hard-coded plan columns with a flexible, auditable system that supports plan-based defaults, individual overrides, earned bonuses, and time-limited trials.

**Single source of truth:** `check_entitlement(user_id, feature)` — one function call answers "can this user do this thing?"

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              check_entitlement()                │
│                                                 │
│  1. Look up user's plan (free/pro/enterprise)   │
│  2. Get plan_entitlements for this feature       │
│  3. Check for user override (replaces plan)      │
│  4. Check for active trial (if plan = off)       │
│  5. Sum bonus + earned grants (additive)         │
│  6. Return: allowed, effective_limit, remaining  │
└─────────────────────────────────────────────────┘
```

### Resolution Priority

1. **User override** → replaces everything (admin-granted)
2. **User trial** → activates if plan value is 0 (time-limited)
3. **Plan entitlement** → base value from user's subscription tier
4. **Bonus + earned** → stacks additively on top of plan value
5. **Feature default** → fallback if no plan entry exists

### Limit Values

| Value | Meaning |
|-------|---------|
| `-1` | Unlimited |
| `0` | Off / disabled |
| `N` | That many (quota) or on (boolean) |

---

## Tables

### entitlement_features

Master catalog of all gatable features.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | Machine key: `resume_grading`, `filters`, etc. |
| `name` | text | Human-readable: "AI Resume Grading" |
| `description` | text | What this feature does |
| `feature_type` | text | `boolean` (on/off), `quota` (counted), `tier` (level unlock) |
| `default_limit` | int | What you get with no plan (0=off, -1=unlimited) |
| `reset_period` | text | For quotas: `none`, `daily`, `weekly`, `monthly` |
| `sort_order` | int | Display ordering |

### plan_entitlements

What each plan grants for each feature.

| Column | Type | Description |
|--------|------|-------------|
| `plan_id` | text FK → plans | `free`, `pro`, `enterprise` |
| `feature_id` | text FK → entitlement_features | Which feature |
| `limit_value` | int | 0=off, -1=unlimited, N=that many |

### user_entitlements

Individual overrides and earned bonuses. Every row is auditable.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `user_id` | uuid FK → auth.users | Who gets it |
| `feature_id` | text FK → entitlement_features | Which feature |
| `limit_value` | int | Bonus amount (quotas) or override value |
| `grant_type` | text | `override`, `bonus`, `trial`, `earned` |
| `source` | text | Machine-readable origin: `referral:user_xyz`, `promo:launch2026` |
| `reason` | text | Human-readable: "Referred Jane Smith who signed up" |
| `expires_at` | timestamptz | NULL = permanent, set for trials/promos |
| `created_by` | uuid | Admin who granted it (NULL for system) |
| `created_at` | timestamptz | |

---

## Grant Types

| Type | Behavior | Stacking | Example |
|------|----------|----------|---------|
| `override` | Replaces plan value entirely | Latest wins | Admin gives someone unlimited filters |
| `bonus` | Adds to plan value | All active sum | Referral earns +2 filters |
| `earned` | Adds to plan value (action-tracked) | All active sum | Completed onboarding earns +3 resume gradings |
| `trial` | Temporary access to locked feature | Latest expiry wins | 5 free AI gradings for 7 days |

---

## Current Feature Catalog

| Feature | Type | Free | Pro | Enterprise |
|---------|------|------|-----|------------|
| `filters` | quota | 1 | 10 | unlimited |
| `resumes` | quota | 1 | 5 | unlimited |
| `resume_grading` | quota/monthly | off | 50/mo | unlimited |
| `sms_notifications` | boolean | off | on | on |
| `boolean_operators` | boolean | off | on | on |
| `auto_apply` | boolean | off | on | on |
| `network_intel` | boolean | off | on | on |
| `api_access` | quota/daily | off | off | 10K/day |
| `data_export` | quota/monthly | 1/mo | unlimited | unlimited |
| `priority_refresh` | boolean | off | on | on |

---

## Functions

### check_entitlement(user_id, feature, usage_count?)

Returns the user's access for a specific feature.

```sql
SELECT check_entitlement('78ed2e8b-...', 'resume_grading', 3);
```

Returns:
```json
{
  "allowed": true,
  "feature": "resume_grading",
  "type": "quota",
  "plan": "free",
  "plan_limit": 0,
  "bonus": 0,
  "override": false,
  "effective_limit": 5,
  "current": 3,
  "remaining": 2
}
```

### grant_entitlement(user_id, feature, limit, type, source?, reason?, expires_at?, granted_by?)

Grants access. Automatically logged to `audit_log`.

```sql
-- Trial: 5 AI gradings for 7 days
SELECT grant_entitlement(
  '78ed2e8b-...', 'resume_grading', 5, 'trial',
  'onboarding:first_login', 'First-time user trial',
  '2026-02-26T00:00:00Z'
);

-- Referral bonus: +2 filters, permanent
SELECT grant_entitlement(
  '78ed2e8b-...', 'filters', 2, 'earned',
  'referral:user_abc123', 'Referred Jane Smith who signed up'
);

-- Admin override: unlimited resume grading
SELECT grant_entitlement(
  '78ed2e8b-...', 'resume_grading', -1, 'override',
  'admin:marston', 'Beta tester reward'
);
```

### get_user_entitlements(user_id)

Returns all features at once (for dashboard/settings display).

```sql
SELECT get_user_entitlements('78ed2e8b-...');
```

---

## Client-Side Integration

```javascript
// Check a single feature before allowing action
const { data } = await sb.rpc('check_entitlement', {
  p_user_id: currentUser.id,
  p_feature: 'resume_grading',
  p_usage_count: currentGradingCount
});

if (!data.allowed) {
  showUpgradePrompt(data.feature, data.effective_limit);
  return;
}

// Load all entitlements for settings/dashboard
const { data: entitlements } = await sb.rpc('get_user_entitlements', {
  p_user_id: currentUser.id
});
```

---

## Adding a New Feature

1. Insert into `entitlement_features`:
```sql
INSERT INTO entitlement_features (id, name, feature_type, default_limit, reset_period)
VALUES ('new_feature', 'New Feature', 'quota', 0, 'monthly');
```

2. Set plan values in `plan_entitlements`:
```sql
INSERT INTO plan_entitlements (plan_id, feature_id, limit_value) VALUES
  ('free', 'new_feature', 0),
  ('pro', 'new_feature', 100),
  ('enterprise', 'new_feature', -1);
```

3. Call `check_entitlement()` in your code. No schema changes needed.

---

## Referral / Earned Rewards Flow

```
User A refers User B
  → User B signs up
  → System calls grant_entitlement(user_a, 'filters', 2, 'earned', 'referral:user_b_id', 'Referred User B')
  → User A's filter limit increases by 2
  → audit_log records the grant with full traceability
  → User A sees updated limit on next check_entitlement call
```

Multiple referrals stack: refer 3 people = +6 filters on top of plan.

---

## Relationship to Existing Tables

| Table | Role | Still Used? |
|-------|------|-------------|
| `plans` | Plan metadata (name, price, Stripe fields) | Yes — pricing and identity |
| `subscriptions` | Which plan a user is on | Yes — determines plan_id |
| `feature_flags` | Global on/off switches (rollouts, A/B) | Yes — separate concern (system-wide, not per-user) |
| `rate_limits` | Request throttling per time window | Yes — separate concern (abuse prevention) |
| `plan_entitlements` | What each plan grants | **New — replaces plan columns** |
| `user_entitlements` | Individual overrides/bonuses | **New** |
| `entitlement_features` | Feature catalog | **New** |

The `plans` table columns (`max_filters`, `boolean_operators`, etc.) are now legacy. `plan_entitlements` is the source of truth. The columns can be dropped in a future migration.
