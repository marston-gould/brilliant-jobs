# Task: Cohort Phase B — Session Analytics — Pod 2 Handoff

**From:** Pod 1 (Growth) — CPO
**To:** Pod 2 (Engineering) — CTO
**Date:** February 20, 2026
**Priority:** P2 — Post-launch Sprint 1
**Effort:** ~10 hours (2 dev days)
**Spec:** `docs/COHORT_SESSION_FEATURE_BRIEF.md` (lines 611–764)
**Depends on:** Phase A (Cohort + Entitlements) — done

---

## What This Does

Bridges PostHog behavioral data with Supabase transactional data. Every user visit gets a unique session ID shared between both systems. This enables:

- Filter PostHog by `bj_session_id` → full session behavior replay
- Group by `bj_cohort_id` → compare cohort experiences (launch_2026 vs. future cohorts)
- Break down by `bj_plan_id` → free vs. Pro behavior differences

Without this, PostHog events are anonymous behavioral blobs. With it, every click is tied to a cohort, plan, device, and referral source.

---

## What Exists Today

- **Phase A complete:** `cohorts` table, `cohort_plan_entitlements`, `profiles.cohort_id` populated, `check_entitlement()` v2 live
- **PostHog loaded:** `dashboard.html` L24-28, `posthog.init()` with `phc_RqMlQQfq0G0DOikTlgyRO43USYm1h4Jd1aBneeIR6ww`
- **Auth flow in `js/app.js`:** `init()` → `getSession()` → `loadUserData()` → hydrate localStorage → `loadStats()`. Session init hooks after L17 (`loadUserData`).
- **`subscriptions` table** exists (for plan lookup)
- **`profiles.cohort_id`** exists (populated by Phase A)

---

## Build Order (5 steps)

### Step 1: Schema + indexes + RLS (1h)

```sql
-- Migration: 005_session_analytics.sql

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

-- RLS: users read own sessions, all writes go through RPCs
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sessions_read ON user_sessions 
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY sessions_no_direct_insert ON user_sessions 
  FOR INSERT WITH CHECK (false);
CREATE POLICY sessions_no_direct_update ON user_sessions 
  FOR UPDATE USING (false);
-- Service role bypasses RLS, so RPCs (SECURITY DEFINER) can insert/update
```

**Key design decision:** `cohort_id` and `plan_id` are point-in-time snapshots, denormalized intentionally. If a user upgrades mid-month, we know which sessions happened on free vs. Pro. Never backfill or update retroactively.

### Step 2: RPCs (2h)

**create_session():**
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
  SELECT plan_id INTO v_plan 
    FROM subscriptions 
    WHERE user_id = p_user_id AND status = 'active' 
    LIMIT 1;

  INSERT INTO user_sessions (
    user_id, cohort_id, plan_id, 
    device_type, referral_source, entry_page, metadata
  )
  VALUES (
    p_user_id, v_cohort, COALESCE(v_plan, 'free'), 
    p_device_type, p_referral_source, p_entry_page, p_metadata
  )
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**session_heartbeat():**
```sql
CREATE OR REPLACE FUNCTION session_heartbeat(p_session_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE user_sessions SET last_active_at = now() WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Step 3: Client-side session init in `js/app.js` (2h)

Insert after L17 (`await loadUserData(currentUser.id)`) and before L19 (`checkAdminAccess`):

```javascript
// Session analytics — Phase B
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

  const { data: sessionId, error } = await sb.rpc('create_session', {
    p_user_id: currentUser.id,
    p_device_type: deviceType,
    p_referral_source: referralSource,
    p_entry_page: entryPage,
    p_metadata: {}
  });

  if (error) {
    console.error('[BJ] Session init error:', error);
    return null;
  }

  sessionStorage.setItem('bj_session_id', sessionId);
  return sessionId;
}

const bjSessionId = await initSession();

// Heartbeat every 5 minutes when tab is visible
if (bjSessionId) {
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      sb.rpc('session_heartbeat', { p_session_id: bjSessionId });
    }
  }, 5 * 60 * 1000);
}
```

**Why `sessionStorage` (not `localStorage`):** Tab close = session ends. New tab = new session. This is intentional — we want session-level granularity, not persistent IDs across visits.

**Hook point:** The `init()` function in `app.js` is currently synchronous after `loadUserData`. Adding `await initSession()` means `init()` needs to remain async (it already is). The session call adds ~50ms latency to dashboard load — acceptable.

### Step 4: PostHog super properties (1h)

After session init, register super properties so every subsequent PostHog event carries them:

```javascript
// PostHog bridge — after initSession()
if (bjSessionId && window.posthog) {
  posthog.register({
    bj_session_id: bjSessionId,
    bj_cohort_id: currentUser.cohort_id || null,
    bj_plan_id: currentUser.plan_id || 'free'
  });
}
```

**Note:** `currentUser` comes from `sb.auth.getSession()` which returns the auth user. `cohort_id` and `plan_id` may not be on the auth user object — they're on the `profiles` table. Pod 2 needs to either:
- (a) Fetch profile data in `loadUserData()` and attach to `currentUser` (may already happen), or
- (b) Do a separate profile fetch here for the two fields

Check what `loadUserData()` already fetches. If it already pulls `cohort_id` from profiles, just reference the cached value.

### Step 5: Testing (2h)

1. **New session creation:** Open dashboard → verify `user_sessions` row created with correct `cohort_id`, `plan_id`, device, referral, entry page
2. **Session reuse:** Refresh page → verify same session ID reused (sessionStorage), heartbeat fires, no new row
3. **New tab = new session:** Open new tab → verify new session row created
4. **Tab close + reopen:** Close tab, reopen → verify new session (sessionStorage cleared)
5. **Heartbeat:** Wait 5 minutes with tab visible → verify `last_active_at` updated
6. **Heartbeat pauses:** Switch to another tab → verify no heartbeat fires (visibility check)
7. **PostHog:** Open PostHog debugger → verify `bj_session_id`, `bj_cohort_id`, `bj_plan_id` present on all events
8. **RLS:** Try direct INSERT into `user_sessions` from client → verify denied
9. **Plan snapshot:** If user has no subscription → verify `plan_id = 'free'`

---

## Acceptance Criteria

- [ ] `user_sessions` table exists with 3 indexes
- [ ] RLS: users can SELECT own sessions, direct INSERT/UPDATE blocked
- [ ] `create_session()` RPC snapshots `cohort_id` from profiles and `plan_id` from subscriptions
- [ ] `create_session()` defaults `plan_id` to `'free'` when no active subscription
- [ ] `session_heartbeat()` RPC updates `last_active_at`
- [ ] Client: new session created on dashboard load if none in `sessionStorage`
- [ ] Client: existing session reused on page refresh (heartbeat only)
- [ ] Client: heartbeat fires every 5 minutes when tab is visible
- [ ] Client: heartbeat pauses when tab is hidden
- [ ] Tab close + reopen creates a new session
- [ ] PostHog: `bj_session_id`, `bj_cohort_id`, `bj_plan_id` registered as super properties
- [ ] PostHog: all subsequent events carry these three properties
- [ ] Device type detected correctly (mobile < 768px, tablet < 1024px, desktop)
- [ ] Referral source parsed from `utm_source` or `ref` query param, defaults to `'direct'`
- [ ] Entry page captured as `window.location.pathname`
- [ ] Session init adds < 100ms to dashboard load time
- [ ] Migration file in `migrations/` directory

---

## What NOT to Change

- `init()` flow in app.js — just insert session init between `loadUserData` and `checkAdminAccess`
- PostHog `init()` call in dashboard.html — already correct
- Phase A tables/functions — stable, don't modify
- Any existing PostHog event names — just add super properties

---

*All SQL and JS provided. Pod 2 executes. The only judgment call is how `cohort_id`/`plan_id` are accessed client-side — either from `loadUserData()` cache or a separate profile fetch.*
