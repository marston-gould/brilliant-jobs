# Feature Brief: Cohort Experience System + Session Analytics Infrastructure

**From:** Pod 1 (Growth) — CPO
**To:** Pod 2 (Engineering) — CTO + Data Architect
**Date:** February 19, 2026
**Priority:** Phase A is P1 (pre-launch), Phase B is P2 (Week 1 post-launch)
**Shared with:** Pod 1 (Growth), Pod 2 (Engineering), Pod 3 (Operations)

---

## Strategic Context

### What a cohort IS

A cohort defines **what version of the product a user experiences.** It's the answer to "what are the rules of engagement for this user?" — which entitlements they get, what pricing they see, what onboarding flow they go through, what feature gates apply.

Cohorts are almost always tied to **acquisition timing** because the product evolves. The product you ship in March 2026 is not the product you ship in September 2026 — pricing changes, free-tier limits shift, features get added or gated differently. Each cohort is a **frozen experience definition.** Once a user is assigned to a cohort, their base experience doesn't change when new cohorts are created for newer users.

### What a cohort IS NOT

- **Not an attribution tag.** Referral source, UTM campaign, LinkedIn vs. organic — these are acquisition *channels*, stored as session or user attributes. A user referred by a friend and a user from SEO in the same week are in the **same cohort** because they get the same experience.
- **Not a plan.** A user's plan (free/pro/enterprise) determines their subscription tier. Their cohort determines the *version* of that plan they experience. Launch-cohort Pro at $14.99/mo is a different experience contract than summer-cohort Pro at $19.99/mo, even though both are "Pro."

### UX Principle: Cohort is invisible

The word "cohort" never appears in the UI. Users don't know they're in one. The cohort system is a backend analytical and operational construct only.

What users *do* see:

- **Their plan** — Free, Pro, Enterprise
- **Their limits** — "2 of 10 filters used", "Unlimited resume grading"
- **Their bonuses** — "10 included + 4 earned from referrals" (if adjustable)
- **Their member-since date** — displayed on the Subscription/Settings page, sourced from `profiles.created_at`. This is the user-facing proxy for cohort — it tells *them* when they joined, and tells *us* which experience contract they're on.
- **Upgrade prompts** — driven by `behavior = 'off'`, never by cohort identity

What users never see: cohort IDs, cohort names, "you're in the launch cohort," or any language suggesting they're in a test group or segmented population. If a `launch_2026` user and a `summer_2026` user compare screens, the differences should feel like natural product evolution ("they added a new trial") — not like A/B test exposure.

### Examples

| Cohort | Timing | Experience Definition |
|--------|--------|----------------------|
| `launch_2026` | March 2026 | 1 free filter, Pro at $14.99/mo, onboarding v1, no AI grading on free |
| `summer_2026` | June 2026 | 1 free filter, Pro at $19.99/mo, onboarding v2 with Stats tour, 7-day AI grading trial on free |
| `fall_2026` | Oct 2026 | 2 free filters, Pro at $19.99/mo, boolean operators on free, new dashboard layout |

When `summer_2026` rules go live, `launch_2026` users keep their experience. That's grandfathering — not just for pricing, but for the entire product surface.

---

## Feature Behavior Model

Every feature in the entitlement system has a **behavior category** that determines how it can change for a user within their cohort. This is critical for product management — it tells us what levers we can pull and what's locked.

### The Five Categories

| Category | Code | Meaning | Can change? | Example |
|----------|------|---------|-------------|---------|
| **Off** | `off` | Feature is disabled at this plan level within this cohort. Not visible, not accessible. | Only via plan upgrade or cohort-level override. | Free users: `auto_apply = off` |
| **Fixed** | `fixed` | Feature has a hard limit that doesn't change regardless of behavior or time. The user gets exactly this amount, period. | No. Locked to cohort + plan definition. | Free: `filters = 1` (always 1, can't earn more on free) |
| **Adjustable** | `adjustable` | Feature has a base limit that can be increased via entitlement grants (referrals, promotions, earned actions). | Yes — additive bonuses stack on the base. | Pro: `filters = 10` base, but referral bonuses can add +2 each |
| **Degradable** | `degradable` | Feature starts at a limit but can be reduced if usage is low or absent. Use-it-or-lose-it mechanics. | Yes — downward. System can revoke unused capacity. | Pro: `resume_grading = 50/mo` — if user grades 0 resumes for 3 consecutive months, reduce to 10/mo with "upgrade to restore" prompt |
| **Unlimited** | `unlimited` | No limit. Feature is fully open. | No ceiling to hit. | Enterprise: `filters = unlimited`, Pro: `resume_grading = unlimited` |

### Behavior Category Rules

1. **Off features show upgrade prompts.** When a user hits an `off` feature, the UI explains what it does and shows the path to access (upgrade to Pro, or trial if available).
2. **Fixed features are the conversion lever.** They create the constraint that drives upgrades. Don't make fixed features adjustable on free tier — that dilutes the upgrade incentive.
3. **Adjustable features reward engagement.** The base limit is the floor; earned actions raise the ceiling. This is where referral bonuses, onboarding rewards, and promotional grants apply.
4. **Degradable features prevent waste and enable re-engagement.** If a Pro user pays for resume grading but never uses it, degrading the limit after N months of zero usage lets you trigger a re-engagement campaign ("You haven't graded a resume in 3 months — your limit has been reduced to 10/mo. Grade a resume now to restore your full limit."). This requires usage tracking and a degradation schedule.
5. **Unlimited features are non-negotiable.** They never degrade, never cap. Used for Enterprise tier and for features where limiting creates more support burden than value.

### Current Feature Catalog with Behavior Categories

| Feature | Type | Free Behavior | Free Limit | Pro Behavior | Pro Limit | Enterprise |
|---------|------|---------------|------------|--------------|-----------|------------|
| `filters` | quota | fixed | 1 | adjustable | 10 | unlimited |
| `resumes` | quota | fixed | 2 | adjustable | 5 | unlimited |
| `resume_grading` | quota/mo | off | 0 | unlimited | -1 | unlimited |
| `sms_notifications` | boolean | off | 0 | fixed | on | on |
| `boolean_operators` | boolean | off | 0 | fixed | on | on |
| `auto_apply` | boolean | off | 0 | fixed | on | on |
| `network_intel` | boolean | off | 0 | fixed | on | on |
| `api_access` | quota/day | off | 0 | off | 0 | adjustable (10K/day) |
| `data_export` | quota/mo | off | 0 | unlimited | -1 | unlimited |
| `priority_refresh` | boolean | off | 0 | fixed | on | on |

**Note:** No features are `degradable` at launch. The category exists in the schema so we can activate it later based on usage data. The degradation engine (usage tracking + automatic limit reduction + re-engagement trigger) is a post-launch build.

---

## Schema Design

### Updated `entitlement_features` table

Add `behavior_category` to the existing feature catalog:

```sql
ALTER TABLE entitlement_features
  ADD COLUMN behavior_category text NOT NULL DEFAULT 'fixed'
    CHECK (behavior_category IN ('off', 'fixed', 'adjustable', 'degradable', 'unlimited'));

COMMENT ON COLUMN entitlement_features.behavior_category IS
  'Default behavior category. Actual behavior per plan+cohort is in cohort_plan_entitlements.behavior.';
```

### New table — `cohorts`

```sql
CREATE TABLE cohorts (
  id                text PRIMARY KEY,
  name              text NOT NULL,
  description       text,
  parent_cohort_id  text REFERENCES cohorts(id),
  criteria_type     text NOT NULL CHECK (criteria_type IN ('date_range', 'count_cap', 'manual', 'rule')),
  criteria_value    jsonb NOT NULL DEFAULT '{}',
  pricing_config    jsonb NOT NULL DEFAULT '{}',
  is_active         boolean NOT NULL DEFAULT true,
  is_locked         boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE cohorts IS 'Experience definitions. Each cohort is a frozen product configuration.';
COMMENT ON COLUMN cohorts.parent_cohort_id IS 'The cohort this was cloned from. Used for diff tracking — not runtime inheritance. check_entitlement() never walks the parent chain.';
COMMENT ON COLUMN cohorts.is_locked IS 'When true, cohort_plan_entitlements rows for this cohort cannot be modified. Prevents accidental changes to live cohorts. Unlock explicitly before editing.';
COMMENT ON COLUMN cohorts.pricing_config IS 'Stripe price IDs per plan for this cohort. E.g. {"pro_monthly": "price_xxx", "pro_annual": "price_yyy"}';
COMMENT ON COLUMN cohorts.criteria_value IS 'Membership rules. date_range: {"start": "...", "end": "..."}. count_cap: {"max_users": 500}. rule: {"utm_source": "linkedin_launch"}.';
```

### New table — `cohort_plan_entitlements`

This is the **experience definition** — what each feature looks like at each plan level within a specific cohort.

```sql
CREATE TABLE cohort_plan_entitlements (
  cohort_id   text NOT NULL REFERENCES cohorts(id),
  plan_id     text NOT NULL,
  feature_id  text NOT NULL REFERENCES entitlement_features(id),
  limit_value int NOT NULL,
  behavior    text NOT NULL CHECK (behavior IN ('off', 'fixed', 'adjustable', 'degradable', 'unlimited')),
  is_modified boolean NOT NULL DEFAULT false,

  PRIMARY KEY (cohort_id, plan_id, feature_id)
);

COMMENT ON TABLE cohort_plan_entitlements IS
  'The experience contract. Defines what each feature does at each plan level for a specific cohort. This is the source of truth for "what does this user get?"';
COMMENT ON COLUMN cohort_plan_entitlements.behavior IS
  'How this feature behaves: off (disabled), fixed (hard limit), adjustable (can earn more), degradable (can lose if unused), unlimited (no cap).';
COMMENT ON COLUMN cohort_plan_entitlements.is_modified IS
  'Set to true when this row has been changed from its parent cohort values. Cloned rows start as false. Enables instant diff queries: SELECT * WHERE is_modified = true.';
```

### Cohort lock guard

Prevents accidental modification of entitlements for live cohorts. Must explicitly unlock before editing.

```sql
CREATE OR REPLACE FUNCTION prevent_locked_cohort_changes()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM cohorts WHERE id = OLD.cohort_id AND is_locked = true) THEN
    RAISE EXCEPTION 'Cohort "%" is locked. Run: UPDATE cohorts SET is_locked = false WHERE id = ''%'' before modifying entitlements.', OLD.cohort_id, OLD.cohort_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lock_cohort_entitlements
  BEFORE UPDATE OR DELETE ON cohort_plan_entitlements
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_cohort_changes();
```

### Auto-mark modified rows

When a cloned row is updated, automatically set `is_modified = true`.

```sql
CREATE OR REPLACE FUNCTION mark_modified_entitlement()
RETURNS trigger AS $$
BEGIN
  IF OLD.limit_value IS DISTINCT FROM NEW.limit_value
     OR OLD.behavior IS DISTINCT FROM NEW.behavior THEN
    NEW.is_modified := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mark_modified
  BEFORE UPDATE ON cohort_plan_entitlements
  FOR EACH ROW EXECUTE FUNCTION mark_modified_entitlement();
```

### Clone cohort function

Creates a new cohort by copying all entitlement rows from an existing one. All copied rows start with `is_modified = false`. Update the rows that differ — the trigger auto-marks them as modified.

```sql
CREATE OR REPLACE FUNCTION clone_cohort(
  p_source text,
  p_target text,
  p_name text,
  p_description text,
  p_criteria_type text,
  p_criteria_value jsonb,
  p_pricing_config jsonb DEFAULT '{}'
)
RETURNS text AS $$
BEGIN
  INSERT INTO cohorts (id, name, description, parent_cohort_id, criteria_type, criteria_value, pricing_config)
  VALUES (p_target, p_name, p_description, p_source, p_criteria_type, p_criteria_value, p_pricing_config);

  INSERT INTO cohort_plan_entitlements (cohort_id, plan_id, feature_id, limit_value, behavior, is_modified)
  SELECT p_target, plan_id, feature_id, limit_value, behavior, false
  FROM cohort_plan_entitlements WHERE cohort_id = p_source;

  RETURN p_target;
END;
$$ LANGUAGE plpgsql;
```

**Usage — creating `summer_2026` from `launch_2026`:**

```sql
-- Clone the experience definition
SELECT clone_cohort(
  'launch_2026', 'summer_2026',
  'Summer Cohort', 'Users who sign up May–August 2026. Price increase.',
  'date_range', '{"start": "2026-05-01T00:00:00Z", "end": "2026-08-31T23:59:59Z"}',
  '{"pro_monthly": "price_summer_monthly", "pro_annual": "price_summer_annual"}'
);

-- Now update only what's different — triggers auto-mark is_modified = true
UPDATE cohort_plan_entitlements
SET limit_value = 5
WHERE cohort_id = 'summer_2026' AND plan_id = 'free' AND feature_id = 'resume_grading';

-- See what changed from the parent:
SELECT cpe.plan_id, cpe.feature_id, cpe.limit_value AS new_value, cpe.behavior AS new_behavior,
       parent.limit_value AS parent_value, parent.behavior AS parent_behavior
FROM cohort_plan_entitlements cpe
JOIN cohorts c ON c.id = cpe.cohort_id
JOIN cohort_plan_entitlements parent
  ON parent.cohort_id = c.parent_cohort_id
  AND parent.plan_id = cpe.plan_id
  AND parent.feature_id = cpe.feature_id
WHERE cpe.cohort_id = 'summer_2026' AND cpe.is_modified = true;
```

### Get user entitlements v2 (full matrix)

Returns the complete entitlement matrix for a user — all features with behavior, limits, bonuses, and source. Used for testing, support, and the Subscription settings page.

```sql
CREATE OR REPLACE FUNCTION get_user_entitlements(p_user_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb := '[]'::jsonb;
  v_feature record;
BEGIN
  FOR v_feature IN SELECT id FROM entitlement_features ORDER BY sort_order LOOP
    v_result := v_result || (SELECT check_entitlement(p_user_id, v_feature.id));
  END LOOP;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Test harness usage:**
```sql
-- Full picture for any user: cohort, plan, all features, all behaviors, all bonuses
SELECT get_user_entitlements('78ed2e8b-...');

-- Smoke test after any cohort change: verify a sample user from each cohort
SELECT p.cohort_id, get_user_entitlements(p.id)
FROM profiles p
WHERE p.cohort_id IN ('launch_2026', 'summer_2026')
ORDER BY p.cohort_id
LIMIT 2;
```

### Add `cohort_id` to `profiles`

```sql
ALTER TABLE profiles
  ADD COLUMN cohort_id text REFERENCES cohorts(id),
  ADD COLUMN cohort_assigned_at timestamptz;

CREATE INDEX idx_profiles_cohort ON profiles (cohort_id);
```

### Updated `check_entitlement()` Resolution

```
┌─────────────────────────────────────────────────────────┐
│              check_entitlement() v2                      │
│                                                         │
│  1. Look up user's plan (free/pro/enterprise)           │
│  2. Look up user's cohort (from profiles.cohort_id)     │
│  3. Check for user override → replaces everything       │
│  4. Check for active trial → activates if base = off    │
│  5. Get cohort_plan_entitlements for (cohort, plan,     │
│     feature) → base limit + behavior category           │
│  6. If no cohort entry → fall back to plan_entitlements  │
│  7. If behavior = 'adjustable':                         │
│       Sum active bonus + earned grants (additive)       │
│  8. If behavior = 'degradable':                         │
│       Check degradation rules, apply reduction if met   │
│  9. Return: allowed, effective_limit, remaining,        │
│             behavior, cohort_id                          │
└─────────────────────────────────────────────────────────┘
```

**Key change from v1:** Step 5 checks `cohort_plan_entitlements` first, falling back to `plan_entitlements` (step 6) only if no cohort-specific entry exists. This means existing `plan_entitlements` rows serve as the global default, and cohort entries override them per-cohort.

**New in response:** The `behavior` field is returned so the client knows whether to show "upgrade to unlock" (off), "you've used X of Y" (fixed/adjustable), or no limit indicator (unlimited). The client also knows whether bonuses can apply (adjustable) or not (fixed).

### Seed data — `launch_2026` cohort

```sql
-- Create the cohort
INSERT INTO cohorts (id, name, description, criteria_type, criteria_value, pricing_config) VALUES
  ('launch_2026', 'Launch Cohort', 'All users who sign up March–April 2026. Founding experience.',
   'date_range', '{"start": "2026-03-01T00:00:00Z", "end": "2026-04-30T23:59:59Z"}',
   '{"pro_monthly": "price_launch_monthly", "pro_annual": "price_launch_annual"}');

-- Define the experience
INSERT INTO cohort_plan_entitlements (cohort_id, plan_id, feature_id, limit_value, behavior) VALUES
  -- Free tier
  ('launch_2026', 'free', 'filters',            1,  'fixed'),
  ('launch_2026', 'free', 'resumes',            2,  'fixed'),
  ('launch_2026', 'free', 'resume_grading',     0,  'off'),
  ('launch_2026', 'free', 'sms_notifications',  0,  'off'),
  ('launch_2026', 'free', 'boolean_operators',  0,  'off'),
  ('launch_2026', 'free', 'auto_apply',         0,  'off'),
  ('launch_2026', 'free', 'network_intel',      0,  'off'),
  ('launch_2026', 'free', 'api_access',         0,  'off'),
  ('launch_2026', 'free', 'data_export',        0,  'off'),
  ('launch_2026', 'free', 'priority_refresh',   0,  'off'),

  -- Pro tier
  ('launch_2026', 'pro', 'filters',            10,  'adjustable'),
  ('launch_2026', 'pro', 'resumes',             5,  'adjustable'),
  ('launch_2026', 'pro', 'resume_grading',     -1,  'unlimited'),
  ('launch_2026', 'pro', 'sms_notifications',   1,  'fixed'),
  ('launch_2026', 'pro', 'boolean_operators',   1,  'fixed'),
  ('launch_2026', 'pro', 'auto_apply',          1,  'fixed'),
  ('launch_2026', 'pro', 'network_intel',       1,  'fixed'),
  ('launch_2026', 'pro', 'api_access',          0,  'off'),
  ('launch_2026', 'pro', 'data_export',        -1,  'unlimited'),
  ('launch_2026', 'pro', 'priority_refresh',    1,  'fixed'),

  -- Enterprise tier
  ('launch_2026', 'enterprise', 'filters',           -1,  'unlimited'),
  ('launch_2026', 'enterprise', 'resumes',           -1,  'unlimited'),
  ('launch_2026', 'enterprise', 'resume_grading',    -1,  'unlimited'),
  ('launch_2026', 'enterprise', 'sms_notifications',  1,  'fixed'),
  ('launch_2026', 'enterprise', 'boolean_operators',  1,  'fixed'),
  ('launch_2026', 'enterprise', 'auto_apply',         1,  'fixed'),
  ('launch_2026', 'enterprise', 'network_intel',      1,  'fixed'),
  ('launch_2026', 'enterprise', 'api_access',     10000,  'adjustable'),
  ('launch_2026', 'enterprise', 'data_export',       -1,  'unlimited'),
  ('launch_2026', 'enterprise', 'priority_refresh',   1,  'fixed');
```

### Auto-Assignment Trigger

```sql
CREATE OR REPLACE FUNCTION assign_user_cohort()
RETURNS trigger AS $$
DECLARE
  matching_cohort text;
BEGIN
  -- Date-range cohorts: most recently created active cohort whose range includes now
  SELECT id INTO matching_cohort
  FROM cohorts
  WHERE is_active = true
    AND criteria_type = 'date_range'
    AND (criteria_value->>'start')::timestamptz <= now()
    AND (criteria_value->>'end')::timestamptz >= now()
  ORDER BY created_at DESC
  LIMIT 1;

  -- Count-cap cohorts: find active cohort with room
  IF matching_cohort IS NULL THEN
    SELECT c.id INTO matching_cohort
    FROM cohorts c
    WHERE c.is_active = true
      AND c.criteria_type = 'count_cap'
      AND (SELECT COUNT(*) FROM profiles WHERE cohort_id = c.id) < (c.criteria_value->>'max_users')::int
    ORDER BY c.created_at DESC
    LIMIT 1;
  END IF;

  IF matching_cohort IS NOT NULL THEN
    NEW.cohort_id := matching_cohort;
    NEW.cohort_assigned_at := now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assign_cohort
  BEFORE INSERT ON profiles
  FOR EACH ROW
  WHEN (NEW.cohort_id IS NULL)
  EXECUTE FUNCTION assign_user_cohort();
```

### Backfill Existing Users

```sql
UPDATE profiles
SET cohort_id = 'launch_2026',
    cohort_assigned_at = created_at
WHERE cohort_id IS NULL;
```

---

## Updated `check_entitlement()` Function

```sql
CREATE OR REPLACE FUNCTION check_entitlement(
  p_user_id uuid,
  p_feature text,
  p_usage_count int DEFAULT 0
)
RETURNS jsonb AS $$
DECLARE
  v_plan text;
  v_cohort text;
  v_base_limit int;
  v_behavior text;
  v_override_row record;
  v_trial_row record;
  v_bonus int := 0;
  v_effective int;
  v_source text := 'plan';
BEGIN
  -- 1. Get user's plan and cohort
  SELECT COALESCE(s.plan_id, 'free') INTO v_plan
  FROM subscriptions s WHERE s.user_id = p_user_id AND s.status = 'active' LIMIT 1;
  IF v_plan IS NULL THEN v_plan := 'free'; END IF;

  SELECT cohort_id INTO v_cohort FROM profiles WHERE id = p_user_id;

  -- 2. User override (highest priority)
  SELECT * INTO v_override_row
  FROM user_entitlements
  WHERE user_id = p_user_id AND feature_id = p_feature AND grant_type = 'override'
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY created_at DESC LIMIT 1;

  IF v_override_row IS NOT NULL THEN
    v_effective := v_override_row.limit_value;
    RETURN jsonb_build_object(
      'allowed', CASE WHEN v_effective = -1 THEN true WHEN v_effective > 0 THEN p_usage_count < v_effective ELSE false END,
      'feature', p_feature, 'plan', v_plan, 'cohort', v_cohort,
      'behavior', 'override', 'base_limit', v_effective, 'bonus', 0,
      'effective_limit', v_effective, 'current', p_usage_count,
      'remaining', CASE WHEN v_effective = -1 THEN -1 ELSE GREATEST(v_effective - p_usage_count, 0) END,
      'source', 'override'
    );
  END IF;

  -- 3. Active trial
  SELECT * INTO v_trial_row
  FROM user_entitlements
  WHERE user_id = p_user_id AND feature_id = p_feature AND grant_type = 'trial'
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY expires_at DESC LIMIT 1;

  -- 4. Base limit — cohort_plan_entitlements first, fall back to plan_entitlements
  SELECT cpe.limit_value, cpe.behavior INTO v_base_limit, v_behavior
  FROM cohort_plan_entitlements cpe
  WHERE cpe.cohort_id = v_cohort AND cpe.plan_id = v_plan AND cpe.feature_id = p_feature;

  IF v_base_limit IS NULL THEN
    SELECT pe.limit_value INTO v_base_limit
    FROM plan_entitlements pe
    WHERE pe.plan_id = v_plan AND pe.feature_id = p_feature;

    SELECT ef.behavior_category INTO v_behavior
    FROM entitlement_features ef WHERE ef.id = p_feature;

    v_source := 'plan_default';
  ELSE
    v_source := 'cohort';
  END IF;

  -- Final fallback to feature default
  IF v_base_limit IS NULL THEN
    SELECT default_limit INTO v_base_limit FROM entitlement_features WHERE id = p_feature;
    v_source := 'feature_default';
  END IF;
  v_base_limit := COALESCE(v_base_limit, 0);
  v_behavior := COALESCE(v_behavior, 'fixed');

  -- 5. If base is off but trial is active, use trial
  IF v_base_limit = 0 AND v_trial_row IS NOT NULL THEN
    v_effective := v_trial_row.limit_value;
    RETURN jsonb_build_object(
      'allowed', CASE WHEN v_effective = -1 THEN true WHEN v_effective > 0 THEN p_usage_count < v_effective ELSE false END,
      'feature', p_feature, 'plan', v_plan, 'cohort', v_cohort,
      'behavior', 'adjustable', 'base_limit', 0, 'bonus', v_effective,
      'effective_limit', v_effective, 'current', p_usage_count,
      'remaining', CASE WHEN v_effective = -1 THEN -1 ELSE GREATEST(v_effective - p_usage_count, 0) END,
      'source', 'trial', 'trial_expires', v_trial_row.expires_at
    );
  END IF;

  -- 6. If adjustable, sum bonuses
  IF v_behavior = 'adjustable' THEN
    SELECT COALESCE(SUM(limit_value), 0) INTO v_bonus
    FROM user_entitlements
    WHERE user_id = p_user_id AND feature_id = p_feature
      AND grant_type IN ('bonus', 'earned')
      AND (expires_at IS NULL OR expires_at > now());
  END IF;

  -- 7. Calculate effective limit
  IF v_base_limit = -1 THEN
    v_effective := -1;
  ELSE
    v_effective := v_base_limit + v_bonus;
  END IF;

  RETURN jsonb_build_object(
    'allowed', CASE WHEN v_effective = -1 THEN true WHEN v_effective > 0 THEN p_usage_count < v_effective ELSE false END,
    'feature', p_feature, 'plan', v_plan, 'cohort', v_cohort,
    'behavior', v_behavior, 'base_limit', v_base_limit, 'bonus', v_bonus,
    'effective_limit', v_effective, 'current', p_usage_count,
    'remaining', CASE WHEN v_effective = -1 THEN -1 ELSE GREATEST(v_effective - p_usage_count, 0) END,
    'source', v_source
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### What the response tells you

```json
{
  "allowed": true,
  "feature": "filters",
  "plan": "pro",
  "cohort": "launch_2026",
  "behavior": "adjustable",
  "base_limit": 10,
  "bonus": 4,
  "effective_limit": 14,
  "current": 6,
  "remaining": 8,
  "source": "cohort"
}
```

The client answers all five questions from the `behavior` field:

1. **Is this off?** → `behavior = 'off'` → show upgrade prompt
2. **Is the limit fixed?** → `behavior = 'fixed'` → show "X of Y used", no earn-more messaging
3. **Can the user earn more?** → `behavior = 'adjustable'` → show "X of Y used" + "Earn more by referring friends"
4. **Can this be reduced?** → `behavior = 'degradable'` → show "Use it or lose it" indicator (future)
5. **Is this unlimited?** → `behavior = 'unlimited'` → show no limit indicator

---

## Phase A: Cohort Experience System (Pre-Launch)

### Acceptance Criteria

- [ ] `cohorts` table exists with `parent_cohort_id`, `is_locked`, and `launch_2026` seed row including `pricing_config`
- [ ] `cohort_plan_entitlements` table exists with `is_modified` column and full experience definition for `launch_2026` (10 features × 3 plans = 30 rows)
- [ ] Lock guard trigger: modifying entitlements for a locked cohort raises an exception
- [ ] Auto-mark trigger: updating `limit_value` or `behavior` on a cloned row sets `is_modified = true`
- [ ] `clone_cohort()` function: creates new cohort with `parent_cohort_id` set, copies all entitlement rows with `is_modified = false`
- [ ] Diff query works: `SELECT ... WHERE is_modified = true` shows only changed rows, joinable with parent for comparison
- [ ] `entitlement_features` has `behavior_category` column populated for all existing features
- [ ] `profiles` has `cohort_id` and `cohort_assigned_at` columns, indexed
- [ ] Auto-assignment trigger fires on new profile insert (handles `date_range` and `count_cap`)
- [ ] Existing users backfilled to `launch_2026`
- [ ] `check_entitlement()` v2 deployed with cohort → plan fallback → feature default resolution
- [ ] Response includes `behavior`, `cohort`, `base_limit`, `bonus`, `source` fields
- [ ] `get_user_entitlements()` v2 returns full feature matrix for a user (calls `check_entitlement()` per feature)
- [ ] Existing client-side callers of `check_entitlement()` handle expanded response (backward compatible — new fields are additive)
- [ ] RLS: `cohorts` and `cohort_plan_entitlements` read-only for authenticated, write for service role
- [ ] Entitlement catalog adjustments applied: free resumes 1→2, free data_export 1→0, pro resume_grading 50→unlimited
- [ ] `launch_2026` cohort locked after seed data verified (`is_locked = true`)

### Effort Estimate — Phase A

| Work Unit | Effort |
|-----------|--------|
| Schema: `cohorts` (with `parent_cohort_id`, `is_locked`) + `cohort_plan_entitlements` (with `is_modified`) + `behavior_category` column | 2h |
| Lock guard trigger + auto-mark modified trigger | 1h |
| `clone_cohort()` function | 1h |
| Schema: `profiles` columns + index + assignment trigger | 1h |
| Seed data: `launch_2026` cohort + 30 experience definition rows | 1h |
| `check_entitlement()` v2 with cohort resolution + behavior | 3h |
| `get_user_entitlements()` v2 (full matrix) | 1h |
| Backfill existing users | 0.5h |
| RLS policies | 0.5h |
| Entitlement catalog adjustments (3 UPDATE statements) | 0.5h |
| Testing: assignment, resolution priority, fallback, clone+diff, lock guard, backward compat | 2.5h |
| **Total** | **14h (~3 dev days)** |

---

## Phase B: Session Analytics (Post-Launch — Week 1)

### What We're Building

A server-aware session tracking system that bridges PostHog behavioral data with Supabase transactional data. Every user visit gets a unique session ID shared between both systems.

### Schema

```sql
CREATE TABLE user_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cohort_id       text,
  plan_id         text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  last_active_at  timestamptz NOT NULL DEFAULT now(),
  device_type     text,
  referral_source text,
  entry_page      text,
  metadata        jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_sessions_user ON user_sessions (user_id, started_at DESC);
CREATE INDEX idx_sessions_cohort ON user_sessions (cohort_id, started_at DESC);
CREATE INDEX idx_sessions_plan ON user_sessions (plan_id, started_at DESC);
```

`cohort_id` and `plan_id` are **point-in-time snapshots**, denormalized intentionally. If a user upgrades mid-month, we know which sessions happened on free and which on Pro. Never backfill or update retroactively.

### Session Creation RPC

```sql
CREATE OR REPLACE FUNCTION create_session(
  p_user_id uuid,
  p_device_type text DEFAULT NULL,
  p_referral_source text DEFAULT NULL,
  p_entry_page text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid AS $$
DECLARE
  v_session_id uuid;
  v_cohort text;
  v_plan text;
BEGIN
  SELECT cohort_id INTO v_cohort FROM profiles WHERE id = p_user_id;
  SELECT plan_id INTO v_plan FROM subscriptions WHERE user_id = p_user_id AND status = 'active' LIMIT 1;

  INSERT INTO user_sessions (user_id, cohort_id, plan_id, device_type, referral_source, entry_page, metadata)
  VALUES (p_user_id, v_cohort, COALESCE(v_plan, 'free'), p_device_type, p_referral_source, p_entry_page, p_metadata)
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Heartbeat RPC

```sql
CREATE OR REPLACE FUNCTION session_heartbeat(p_session_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE user_sessions SET last_active_at = now() WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Client-Side Integration

**In `js/app.js` (after auth resolves, before PostHog events fire):**

```javascript
async function initSession() {
  const existing = sessionStorage.getItem('bj_session_id');
  if (existing) {
    sb.rpc('session_heartbeat', { p_session_id: existing });
    return existing;
  }

  const deviceType = window.innerWidth < 768 ? 'mobile' :
                     window.innerWidth < 1024 ? 'tablet' : 'desktop';
  const params = new URLSearchParams(window.location.search);
  const referralSource = params.get('utm_source') || params.get('ref') || 'direct';
  const entryPage = window.location.pathname;

  const { data: sessionId } = await sb.rpc('create_session', {
    p_user_id: currentUser.id,
    p_device_type: deviceType,
    p_referral_source: referralSource,
    p_entry_page: entryPage,
    p_metadata: {}
  });

  sessionStorage.setItem('bj_session_id', sessionId);
  return sessionId;
}

const sessionId = await initSession();

// Heartbeat every 5 minutes when tab is visible
setInterval(() => {
  if (document.visibilityState === 'visible') {
    sb.rpc('session_heartbeat', { p_session_id: sessionId });
  }
}, 5 * 60 * 1000);
```

### PostHog Bridge

```javascript
posthog.register({
  bj_session_id: sessionId,
  bj_cohort_id: currentUser.cohort_id,
  bj_plan_id: currentUser.plan_id
});
```

Every PostHog event now carries these as super properties. The join path:
- Filter by `bj_session_id` → full session behavior
- Group by `bj_cohort_id` → compare cohort experiences
- Break down by `bj_plan_id` → free vs. Pro behavior

### RLS

```sql
CREATE POLICY sessions_read ON user_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY sessions_no_direct_insert ON user_sessions FOR INSERT WITH CHECK (false);
CREATE POLICY sessions_no_direct_update ON user_sessions FOR UPDATE USING (false);
```

### Acceptance Criteria — Phase B

- [ ] `user_sessions` table exists with indexes
- [ ] `create_session()` snapshots cohort_id and plan_id
- [ ] `session_heartbeat()` updates `last_active_at`
- [ ] Client: new session on app init if none in `sessionStorage`
- [ ] Client: heartbeat every 5 min when tab visible
- [ ] PostHog: `bj_session_id`, `bj_cohort_id`, `bj_plan_id` registered
- [ ] RLS: users read own sessions, no direct insert/update
- [ ] Tab close + reopen creates new session

### Effort Estimate — Phase B

| Work Unit | Effort |
|-----------|--------|
| Schema + indexes + RLS | 1h |
| create_session() + session_heartbeat() RPCs | 2h |
| Client-side session init + heartbeat in `js/app.js` | 2h |
| PostHog super property registration | 1h |
| Device detection + referral source parsing | 1h |
| Testing | 2h |
| Documentation | 1h |
| **Total** | **10h (2 dev days)** |

---

## Combined Effort Summary

| Phase | Scope | Effort | Timeline |
|-------|-------|--------|----------|
| A — Cohort Experience System | cohorts, cohort_plan_entitlements, behavior categories, check_entitlement v2, clone + diff + lock tooling, profiles migration, seed data | 14h (3 days) | Before launch |
| B — Session Analytics | user_sessions, RPCs, client init, PostHog bridge | 10h (2 days) | Week 1 post-launch |
| **Total** | | **24h (5 dev days)** | |

---

## Entitlement Catalog Adjustments

Applied as part of the Phase A migration:

| Feature | Current Free | New Free | Rationale |
|---------|-------------|----------|-----------|
| `resumes` | 1 | 2 | Removes friction at peak engagement. Zero marginal cost. |
| `data_export` | 1/mo | 0 | Export signals power usage. Don't give away free. |

| Feature | Current Pro | New Pro | Rationale |
|---------|-----------|---------|-----------|
| `resume_grading` | 50/mo | -1 (unlimited) | 50 is effectively unlimited. Simpler messaging. |

```sql
UPDATE plan_entitlements SET limit_value = 2 WHERE plan_id = 'free' AND feature_id = 'resumes';
UPDATE plan_entitlements SET limit_value = 0 WHERE plan_id = 'free' AND feature_id = 'data_export';
UPDATE plan_entitlements SET limit_value = -1 WHERE plan_id = 'pro' AND feature_id = 'resume_grading';
```

---

## Scope Boundaries

### In scope
- Cohort as experience definition (not attribution)
- Full experience contract per cohort+plan via `cohort_plan_entitlements`
- Five behavior categories (off, fixed, adjustable, degradable, unlimited)
- `check_entitlement()` v2 with cohort-aware resolution + behavior in response
- `get_user_entitlements()` v2 — full feature matrix for testing and support
- `clone_cohort()` function — one-call cohort creation from a parent with `parent_cohort_id` tracking
- `is_modified` diff tracking on entitlement rows — instant visibility into what changed from parent
- `is_locked` guard on cohorts — prevents accidental modification of live cohort entitlements
- Pricing config on cohort for Stripe price ID grandfathering
- Auto-assignment trigger (date_range + count_cap)
- Session tracking with point-in-time cohort/plan snapshots
- PostHog bridge for behavioral + transactional joins

### Out of scope (future work)
- **Admin UI** — SQL + Supabase dashboard until ~500 users. First admin build should be a read-only cohort dashboard (user counts, experience diffs, entitlement matrix lookup per user)
- **A/B split assignment** — weighted random across simultaneous cohorts. Needs `split` criteria type + trigger update. Build when volume supports experimentation (~500+ signups, month 2-3)
- **`feature_usage_summary` table** — daily/weekly aggregation of feature usage per user. Prerequisite for activating `degradable` behavior and for answering "which features are users actually using?" Build before any degradation thresholds are set.
- **Degradation engine** — `degradable` behavior defined in schema, but automated usage-tracking + limit-reduction + re-engagement not built at launch. Needs 3+ months of usage data to calibrate thresholds.
- **Re-subscription pricing rule** — what happens when a grandfathered user cancels and re-subscribes? Business rule to document before first price increase.
- **Cohort inheritance (runtime)** — not implementing parent-chain resolution in `check_entitlement()`. Clone + diff approach keeps resolution flat and fast.
- **Rule-based auto-assignment** — trigger handles `date_range` and `count_cap` only; `rule` and `manual` types assigned via SQL
- **Multi-cohort membership** — one cohort per user at launch
- **Cohort migration tooling** — manual `UPDATE profiles` for now

---

## Open Questions for Pod 2

1. **Subscription table:** `create_session()` and `check_entitlement()` query `subscriptions WHERE user_id = X AND status = 'active'`. Confirm table name and active-status filter.
2. **App bootstrap timing:** Session init runs after auth, before PostHog events. Confirm the hook point in `js/app.js`.
3. **`check_entitlement()` backward compat:** v2 adds `behavior`, `cohort`, `base_limit`, `source` to the response. Are existing callers destructuring specific fields, or do they just read `allowed` and `effective_limit`? If the latter, this is non-breaking.
4. **`plan_entitlements` coexistence:** v2 falls back to `plan_entitlements` when no cohort entry exists. CPO recommends keeping this fallback so new features work immediately without requiring cohort entries for every cohort.

---

*This brief was produced by Pod 1 (Growth). Pod 2 has authority to push back on effort, suggest alternatives, and flag risks. Security concerns are Pod 2 veto territory. Scope changes require CPO approval.*
