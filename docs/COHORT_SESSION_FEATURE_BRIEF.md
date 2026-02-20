# Feature Brief: Cohort Identity + Session Analytics Infrastructure

**From:** Pod 1 (Growth) — CPO
**To:** Pod 2 (Engineering) — CTO + Data Architect
**Date:** February 19, 2026
**Priority:** Phase A is P1 (pre-launch), Phase B is P2 (Week 1 post-launch)
**Shared with:** Pod 1 (Growth), Pod 2 (Engineering), Pod 3 (Operations)

---

## Strategic Context

The entitlements system (live in production per `docs/ENTITLEMENTS.md`) controls what each user can access. But we currently have no way to answer: "which *group* of users behaves differently, and why?"

This brief adds two capabilities:

1. **Cohort identity** — tag every user with a cohort so we can segment analysis, run experiments, and grandfather pricing.
2. **Session tracking** — give every user visit a unique ID so we can join behavioral data (PostHog) with transactional data (Supabase) and measure feature impact at the session level.

Without this, we're flying blind on every decision that follows launch: pricing changes, free-tier adjustments, feature gating experiments, referral program ROI, and retention analysis.

---

## User Stories

**As the** Brilliant Jobs product team,
**We want to** assign every user to a cohort at signup and track each session with a unique ID,
**So that** we can compare behavior across user segments, measure the impact of entitlement changes, and make data-driven decisions about pricing, features, and growth.

**As an** analyst reviewing launch performance,
**I want to** join a user's cohort, plan, entitlements, and session activity in a single query,
**So that** I can answer questions like "Do launch-cohort users who visit Stats in session 1 convert to Pro at a higher rate?" without stitching data across disconnected systems.

**As a** product owner planning a pricing change,
**I want to** define a cohort by signup date range and guarantee their entitlements persist,
**So that** early adopters are grandfathered and I can measure the impact of changes on new cohorts without affecting existing users.

---

## Technical Stack Context

- **Dev server:** Vite 6 (`npx vite`, port 3000)
- **JS build:** esbuild via `build.js` — concatenates 15+ modules in `js/` → `dist/dashboard.min.js`
- **CSS:** Tailwind 3.4 (`src/input.css` → `styles.css`)
- **Backend:** Supabase (PostgreSQL + Auth + Edge Functions + RLS)
- **Analytics:** PostHog (installed, collecting events)
- **No frontend framework** — modular JS files, no React/Vue

Session init logic should live in `js/app.js` or `js/main.js` (app bootstrap), not a standalone script. New modules are added to the `jsFiles` array in `build.js`.

---

## Phase A: Cohort Identity (Pre-Launch — Ship Before March 2026)

### What We're Building

A lightweight cohort tagging system on the user profile. No new tables — just columns, a trigger, and a seed.

### Schema Changes

**Add to `profiles` table:**

```sql
ALTER TABLE profiles
  ADD COLUMN cohort_id text,
  ADD COLUMN cohort_assigned_at timestamptz;

CREATE INDEX idx_profiles_cohort ON profiles (cohort_id);

COMMENT ON COLUMN profiles.cohort_id IS 'User cohort for segmentation and analysis. Set at signup by trigger, can be overridden manually.';
```

**New table — `cohorts` (reference/catalog only):**

```sql
CREATE TABLE cohorts (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  description     text,
  criteria_type   text NOT NULL CHECK (criteria_type IN ('date_range', 'count_cap', 'manual', 'rule')),
  criteria_value  jsonb NOT NULL DEFAULT '{}',
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE cohorts IS 'Catalog of user cohorts. criteria_value defines membership rules. Actual membership is on profiles.cohort_id.';
```

**Seed the first cohort:**

```sql
INSERT INTO cohorts (id, name, description, criteria_type, criteria_value) VALUES
  ('launch_2026', 'Launch Cohort', 'All users who sign up before April 30, 2026', 'date_range',
   '{"start": "2026-01-01T00:00:00Z", "end": "2026-04-30T23:59:59Z"}');
```

### Auto-Assignment Trigger

```sql
CREATE OR REPLACE FUNCTION assign_user_cohort()
RETURNS trigger AS $$
DECLARE
  matching_cohort text;
BEGIN
  -- Date-range cohorts: find the first active cohort whose range includes now
  SELECT id INTO matching_cohort
  FROM cohorts
  WHERE is_active = true
    AND criteria_type = 'date_range'
    AND (criteria_value->>'start')::timestamptz <= now()
    AND (criteria_value->>'end')::timestamptz >= now()
  ORDER BY created_at ASC
  LIMIT 1;

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
WHERE created_at >= '2026-01-01T00:00:00Z'
  AND cohort_id IS NULL;
```

### Acceptance Criteria — Phase A

- [ ] `profiles` table has `cohort_id` and `cohort_assigned_at` columns
- [ ] `cohorts` table exists with `launch_2026` seed row
- [ ] New signups automatically get `cohort_id = 'launch_2026'` via trigger
- [ ] Existing users are backfilled
- [ ] `cohort_id` is indexed for query performance
- [ ] RLS on `cohorts` table: read-only for authenticated users, write for service role only

### Effort Estimate — Phase A

| Work Unit | Effort |
|-----------|--------|
| Schema migration (columns + cohorts table + index) | 1h |
| Trigger function + testing | 1h |
| Backfill script | 0.5h |
| RLS policies | 0.5h |
| **Total** | **3h** |

---

## Phase B: Session Analytics (Post-Launch — Week 1)

### What We're Building

A server-aware session tracking system that bridges PostHog behavioral data with Supabase transactional data. Every user visit gets a unique session ID that's shared between both systems.

### Schema

**New table — `user_sessions`:**

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
  metadata        jsonb NOT NULL DEFAULT '{}',
  
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE INDEX idx_sessions_user ON user_sessions (user_id, started_at DESC);
CREATE INDEX idx_sessions_cohort ON user_sessions (cohort_id, started_at DESC);
CREATE INDEX idx_sessions_plan ON user_sessions (plan_id, started_at DESC);

COMMENT ON COLUMN user_sessions.cohort_id IS 'Snapshot of profiles.cohort_id at session start. Denormalized for fast joins — do not update retroactively.';
COMMENT ON COLUMN user_sessions.plan_id IS 'Snapshot of user plan at session start. Denormalized — captures what plan was active during this session.';
COMMENT ON COLUMN user_sessions.metadata IS 'Flexible bag: experiment assignments, active feature flags, A/B variant, etc.';
```

### Why Snapshots Matter

`cohort_id` and `plan_id` are denormalized onto the session record intentionally. If a user upgrades from free to Pro mid-month, we need to know which sessions happened on free and which on Pro. These are point-in-time snapshots, not live lookups. Never backfill or update them retroactively.

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
  -- Snapshot current cohort and plan
  SELECT cohort_id INTO v_cohort FROM profiles WHERE id = p_user_id;
  SELECT plan_id INTO v_plan FROM subscriptions WHERE user_id = p_user_id AND status = 'active' LIMIT 1;

  INSERT INTO user_sessions (user_id, cohort_id, plan_id, device_type, referral_source, entry_page, metadata)
  VALUES (p_user_id, v_cohort, COALESCE(v_plan, 'free'), p_device_type, p_referral_source, p_entry_page, p_metadata)
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Heartbeat RPC (keeps session alive)

```sql
CREATE OR REPLACE FUNCTION session_heartbeat(p_session_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE user_sessions SET last_active_at = now() WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Client-Side Integration

**In `js/app.js` (or `js/main.js` — wherever app bootstrap runs):**

```javascript
// Session management
async function initSession() {
  const existing = sessionStorage.getItem('bj_session_id');
  if (existing) {
    // Resume existing session — send heartbeat
    sb.rpc('session_heartbeat', { p_session_id: existing });
    return existing;
  }

  // New session — detect context
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

// Call on app init (after auth resolves)
const sessionId = await initSession();

// Heartbeat every 5 minutes to keep session alive
setInterval(() => {
  if (document.visibilityState === 'visible') {
    sb.rpc('session_heartbeat', { p_session_id: sessionId });
  }
}, 5 * 60 * 1000);
```

### PostHog Bridge

**Critical integration — this is the join point between behavioral and transactional data.**

```javascript
// After session init, register the session ID with PostHog
posthog.register({
  bj_session_id: sessionId,
  bj_cohort_id: currentUser.cohort_id,
  bj_plan_id: currentUser.plan_id
});

// Now every PostHog event automatically carries these properties.
// In PostHog, you can:
//   - Filter events by bj_session_id to see a full session replay
//   - Group by bj_cohort_id to compare cohort behavior
//   - Break down by bj_plan_id to see free vs. Pro behavior
```

### Session Timeout Logic

A session ends when the user closes the tab/browser (sessionStorage clears) or after 30 minutes of inactivity (no heartbeat). The `last_active_at` field handles this — sessions with `last_active_at` more than 30 minutes old are considered closed for analysis purposes.

No explicit "end session" call needed. Query pattern:

```sql
-- Active sessions: heartbeat within last 30 minutes
SELECT * FROM user_sessions
WHERE last_active_at > now() - interval '30 minutes';

-- Session duration: last_active_at - started_at
SELECT id, user_id, cohort_id, plan_id,
       last_active_at - started_at AS duration
FROM user_sessions;
```

### RLS Policies

```sql
-- Users can read their own sessions
CREATE POLICY sessions_read ON user_sessions
  FOR SELECT USING (auth.uid() = user_id);

-- Sessions created via RPC (SECURITY DEFINER), no direct insert
CREATE POLICY sessions_no_direct_insert ON user_sessions
  FOR INSERT WITH CHECK (false);

-- No direct updates — heartbeat via RPC only
CREATE POLICY sessions_no_direct_update ON user_sessions
  FOR UPDATE USING (false);
```

### Acceptance Criteria — Phase B

- [ ] `user_sessions` table exists with indexes
- [ ] `create_session()` RPC snapshots cohort_id and plan_id at session start
- [ ] `session_heartbeat()` RPC updates `last_active_at`
- [ ] Client-side: new session created on app init if none exists in `sessionStorage`
- [ ] Client-side: heartbeat fires every 5 minutes when tab is visible
- [ ] PostHog: `bj_session_id`, `bj_cohort_id`, `bj_plan_id` registered as super properties
- [ ] RLS: users can read own sessions, no direct insert/update
- [ ] Closing tab and reopening creates a new session (sessionStorage behavior)
- [ ] Session works across dashboard page navigation (single-page app, sessionStorage persists)

### Effort Estimate — Phase B

| Work Unit | Effort |
|-----------|--------|
| Schema migration (user_sessions + indexes + RLS) | 1h |
| create_session() + session_heartbeat() RPCs | 2h |
| Client-side session init + heartbeat in `js/app.js` | 2h |
| PostHog super property registration | 1h |
| Device detection + referral source parsing | 1h |
| Testing (new session, resume session, heartbeat, tab close) | 2h |
| Documentation | 1h |
| **Total** | **10h (2 dev days)** |

---

## Combined Effort Summary

| Phase | Scope | Effort | Timeline |
|-------|-------|--------|----------|
| A — Cohort Identity | profiles columns, cohorts table, trigger, backfill | 3h (0.5 day) | Before launch |
| B — Session Analytics | user_sessions table, RPCs, client init, PostHog bridge | 10h (2 days) | Week 1 post-launch |
| **Total** | | **13h (2.5 days)** | |

---

## What This Unlocks (Analysis Queries)

Once both phases are live, the following queries become possible:

**Conversion path analysis:**
```sql
-- Do users who visit Stats in their first session convert at a higher rate?
SELECT
  s.cohort_id,
  CASE WHEN s.entry_page = '/dashboard.html#stats' THEN 'stats_first' ELSE 'other' END AS first_page,
  COUNT(DISTINCT s.user_id) AS users,
  COUNT(DISTINCT CASE WHEN sub.plan_id = 'pro' THEN s.user_id END) AS converted
FROM user_sessions s
LEFT JOIN subscriptions sub ON sub.user_id = s.user_id AND sub.plan_id = 'pro'
WHERE s.started_at = (
  SELECT MIN(s2.started_at) FROM user_sessions s2 WHERE s2.user_id = s.user_id
)
GROUP BY 1, 2;
```

**Cohort retention:**
```sql
-- 7-day retention by cohort
SELECT
  p.cohort_id,
  COUNT(DISTINCT p.id) AS total_users,
  COUNT(DISTINCT CASE
    WHEN EXISTS (
      SELECT 1 FROM user_sessions s
      WHERE s.user_id = p.id
        AND s.started_at > p.created_at + interval '7 days'
    ) THEN p.id
  END) AS retained_7d
FROM profiles p
GROUP BY 1;
```

**Entitlement impact:**
```sql
-- Do users with referral bonuses have more sessions?
SELECT
  CASE WHEN ue.id IS NOT NULL THEN 'has_referral_bonus' ELSE 'no_bonus' END AS segment,
  AVG(session_count) AS avg_sessions
FROM profiles p
LEFT JOIN user_entitlements ue ON ue.user_id = p.id AND ue.grant_type = 'earned' AND ue.source LIKE 'referral:%'
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS session_count FROM user_sessions s WHERE s.user_id = p.id
) sc ON true
GROUP BY 1;
```

**Session-level feature engagement (joining PostHog):**
```
PostHog query: events WHERE bj_session_id = X
→ Returns: page views, button clicks, chart hovers, filter changes
→ Join with: user_sessions.cohort_id, user_sessions.plan_id
→ Answer: "Free users in the launch cohort spent 3x longer on Stats than post-launch free users"
```

---

## Scope Boundaries

### In scope
- Cohort assignment at signup (automatic via trigger)
- Cohort catalog table with date-range criteria
- Session creation and heartbeat tracking
- PostHog property bridge
- Point-in-time plan and cohort snapshots on sessions
- Read-only RLS for users on their own sessions

### Out of scope (future work)
- **Admin UI for cohort management** — use SQL + Supabase dashboard for now. Build admin tool when operational volume justifies it (est. 500+ users).
- **Count-cap cohorts** (e.g., "first 500 signups") — the `criteria_type` supports it but the trigger only implements `date_range` for now. Add `count_cap` logic when needed.
- **Rule-based cohorts** (e.g., "users who came from LinkedIn ad campaign") — supported by schema but not implemented in trigger. Can be assigned manually or via a future automation.
- **Cohort-level entitlements** (`cohort_entitlements` table with resolution in `check_entitlement()`) — deferred. Use individual `grant_entitlement()` calls tagged with `source: 'cohort:launch_2026'` for now. Build the cohort entitlements layer when we have 3+ active cohorts with different feature sets.
- **Multi-cohort membership** — a user belongs to one cohort (primary). If multi-cohort becomes necessary (e.g., "launch cohort" AND "referral cohort"), we'll add a `cohort_memberships` junction table. Not needed at launch scale.
- **Session replay integration** — PostHog has session replay. The `bj_session_id` bridge makes it joinable but we're not building custom replay UI.

---

## Entitlement Catalog Adjustments

During this review, Pod 1 identified three changes to the current entitlement values in `plan_entitlements`. These should be applied as part of the Phase A migration:

| Feature | Current Free | New Free | Rationale |
|---------|-------------|----------|-----------|
| `resumes` | 1 | 2 | Removes friction at peak engagement (user wants to tailor resumes). Zero marginal cost. |
| `data_export` | 1/mo | 0 | Export signals power usage. A free user can export once and churn. Move to Pro-only. |

| Feature | Current Pro | New Pro | Rationale |
|---------|-----------|---------|-----------|
| `resume_grading` | 50/mo | -1 (unlimited) | 50 is effectively unlimited given expected usage of 5-8/mo. Simpler messaging, no tracking overhead. |

```sql
-- Apply with Phase A migration
UPDATE plan_entitlements SET limit_value = 2 WHERE plan_id = 'free' AND feature_id = 'resumes';
UPDATE plan_entitlements SET limit_value = 0 WHERE plan_id = 'free' AND feature_id = 'data_export';
UPDATE plan_entitlements SET limit_value = -1 WHERE plan_id = 'pro' AND feature_id = 'resume_grading';
```

---

## Open Questions for Pod 2

1. **Subscription lookup:** The `create_session()` function queries `subscriptions` for the user's current plan. Confirm the table name and the correct filter for active subscriptions (`status = 'active'`? Different column?).
2. **App bootstrap timing:** Where exactly in the init flow does auth resolve? The session init must run *after* we have `currentUser.id` but *before* any PostHog events fire. Confirm the right hook point in `js/app.js`.
3. **Edge case — unauthenticated pages:** The session system only tracks authenticated users on the dashboard. Public pages (`/job-market-data`, landing page) are tracked by PostHog alone with no `bj_session_id`. Is that acceptable, or do we want anonymous session tracking on public pages too? CPO recommendation: authenticated only for launch. Anonymous sessions add complexity with low analytical value at this stage.

---

*This brief was produced by Pod 1 (Growth). Pod 2 has authority to push back on effort estimates, suggest simpler alternatives, and flag technical risks. Security concerns are Pod 2 veto territory. Scope changes require CPO approval.*
