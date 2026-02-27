-- ============================================================
-- REFERRAL HUB REDESIGN — Phase 2: Leaderboard Rewards Backend
-- v5.20 | Spec: referral-hub-redesign-spec v3, Section 3.5
-- ============================================================

-- 1. leaderboard_rewards table
-- Tracks periodic (weekly/monthly) leaderboard reward distributions.
-- Separate from referral_rewards (which tracks per-referral activation rewards).
CREATE TABLE IF NOT EXISTS leaderboard_rewards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_type     text NOT NULL CHECK (period_type IN ('weekly', 'monthly')),
  period_start    timestamptz NOT NULL,
  period_end      timestamptz NOT NULL,
  rank            integer NOT NULL,
  referral_count  integer NOT NULL DEFAULT 0,
  credits_awarded integer NOT NULL DEFAULT 0,
  pro_days_awarded integer NOT NULL DEFAULT 0,
  reward_tier     text NOT NULL CHECK (reward_tier IN ('first', 'top3', 'top10', 'top_pct')),
  distributed_at  timestamptz NOT NULL DEFAULT now(),
  notified        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_lb_rewards_user ON leaderboard_rewards (user_id, distributed_at DESC);
CREATE INDEX idx_lb_rewards_period ON leaderboard_rewards (period_type, period_start, period_end);
CREATE UNIQUE INDEX idx_lb_rewards_unique ON leaderboard_rewards (user_id, period_type, period_start);

-- RLS: users can read their own rewards
ALTER TABLE leaderboard_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own leaderboard rewards"
  ON leaderboard_rewards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "No direct insert by users"
  ON leaderboard_rewards FOR INSERT
  WITH CHECK (false);

CREATE POLICY "No direct update by users"
  ON leaderboard_rewards FOR UPDATE
  USING (false);

CREATE POLICY "No direct delete by users"
  ON leaderboard_rewards FOR DELETE
  USING (false);


-- 2. distribute_leaderboard_rewards RPC
-- Called by pg_cron. Calculates rankings for the completed period,
-- distributes credits + pro days, inserts leaderboard_rewards rows.
-- SECURITY DEFINER: bypasses RLS to write rewards and update profiles.
CREATE OR REPLACE FUNCTION distribute_leaderboard_rewards(p_period_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start timestamptz;
  v_period_end   timestamptz;
  v_now          timestamptz := now();
  v_success      integer := 0;
  v_fail         integer := 0;
  v_total_credits integer := 0;
  v_total_pro    integer := 0;
  v_min_refs     integer;
  v_top_pct      numeric;
  rec            record;
  v_credits      integer;
  v_pro_days     integer;
  v_tier         text;
  v_total_users  integer;
  v_pct_cutoff   integer;
BEGIN
  -- Determine period window
  IF p_period_type = 'weekly' THEN
    -- Previous week: Monday 00:00 to Sunday 23:59:59 UTC
    v_period_end   := date_trunc('week', v_now);  -- Monday 00:00 of current week
    v_period_start := v_period_end - interval '7 days';
    v_min_refs := 1;
    v_top_pct  := 0.10;
  ELSIF p_period_type = 'monthly' THEN
    -- Previous month
    v_period_end   := date_trunc('month', v_now);
    v_period_start := v_period_end - interval '1 month';
    v_min_refs := 2;
    v_top_pct  := 0.25;
  ELSE
    RETURN jsonb_build_object('error', 'Invalid period_type. Use weekly or monthly.');
  END IF;

  -- Check for duplicate distribution (idempotency)
  IF EXISTS (
    SELECT 1 FROM leaderboard_rewards
    WHERE period_type = p_period_type
      AND period_start = v_period_start
      AND period_end = v_period_end
    LIMIT 1
  ) THEN
    RETURN jsonb_build_object(
      'error', 'Already distributed',
      'period_type', p_period_type,
      'period_start', v_period_start,
      'period_end', v_period_end
    );
  END IF;

  -- Build ranked list: count activated referrals in the period, only opted-in users
  -- who meet the minimum referral threshold
  CREATE TEMP TABLE _lb_ranked ON COMMIT DROP AS
  SELECT
    r.referrer_id AS user_id,
    COUNT(*) AS ref_count,
    ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC, MIN(r.activated_at) ASC) AS rank
  FROM referrals r
  JOIN profiles p ON p.id = r.referrer_id
  WHERE r.status IN ('activated', 'rewarded')
    AND r.activated_at >= v_period_start
    AND r.activated_at < v_period_end
    AND p.sharing_enabled = true
    AND r.fraud_score < 70
  GROUP BY r.referrer_id
  HAVING COUNT(*) >= v_min_refs;

  SELECT COUNT(*) INTO v_total_users FROM _lb_ranked;

  IF v_total_users = 0 THEN
    RETURN jsonb_build_object(
      'status', 'no_qualifying_users',
      'period_type', p_period_type,
      'period_start', v_period_start,
      'period_end', v_period_end
    );
  END IF;

  -- Calculate top % cutoff rank
  v_pct_cutoff := GREATEST(CEIL(v_total_users * v_top_pct), 1);

  -- Distribute rewards
  FOR rec IN SELECT * FROM _lb_ranked ORDER BY rank LOOP
    -- Determine tier and reward amounts (spec 3.5)
    IF rec.rank = 1 THEN
      v_tier := 'first';
      IF p_period_type = 'weekly' THEN
        v_credits := 50; v_pro_days := 14;
      ELSE
        v_credits := 100; v_pro_days := 30;
      END IF;
    ELSIF rec.rank <= 3 THEN
      v_tier := 'top3';
      IF p_period_type = 'weekly' THEN
        v_credits := 25; v_pro_days := 7;
      ELSE
        v_credits := 50; v_pro_days := 14;
      END IF;
    ELSIF rec.rank <= 10 THEN
      v_tier := 'top10';
      IF p_period_type = 'weekly' THEN
        v_credits := 10; v_pro_days := 0;
      ELSE
        v_credits := 25; v_pro_days := 7;
      END IF;
    ELSIF rec.rank <= v_pct_cutoff THEN
      v_tier := 'top_pct';
      IF p_period_type = 'weekly' THEN
        v_credits := 5; v_pro_days := 0;
      ELSE
        v_credits := 10; v_pro_days := 0;
      END IF;
    ELSE
      CONTINUE;  -- Outside reward range
    END IF;

    -- Cap at 500 credits/month per user from all referral sources (spec risk mitigation)
    DECLARE
      v_month_start timestamptz := date_trunc('month', v_now);
      v_month_credits integer;
    BEGIN
      SELECT COALESCE(SUM(credits_awarded), 0) INTO v_month_credits
      FROM leaderboard_rewards
      WHERE user_id = rec.user_id
        AND distributed_at >= v_month_start;

      IF v_month_credits + v_credits > 500 THEN
        v_credits := GREATEST(500 - v_month_credits, 0);
      END IF;
    END;

    -- Insert reward record
    BEGIN
      INSERT INTO leaderboard_rewards (
        user_id, period_type, period_start, period_end,
        rank, referral_count, credits_awarded, pro_days_awarded, reward_tier
      ) VALUES (
        rec.user_id, p_period_type, v_period_start, v_period_end,
        rec.rank, rec.ref_count, v_credits, v_pro_days, v_tier
      );

      -- Grant credits to profile
      IF v_credits > 0 THEN
        UPDATE profiles
        SET ai_credits = COALESCE(ai_credits, 0) + v_credits
        WHERE id = rec.user_id;
      END IF;

      -- Grant pro days (extend or set pro_expires_at)
      IF v_pro_days > 0 THEN
        UPDATE profiles
        SET pro_expires_at = GREATEST(COALESCE(pro_expires_at, v_now), v_now) + (v_pro_days || ' days')::interval
        WHERE id = rec.user_id;
      END IF;

      v_success := v_success + 1;
      v_total_credits := v_total_credits + v_credits;
      v_total_pro := v_total_pro + v_pro_days;

    EXCEPTION WHEN OTHERS THEN
      v_fail := v_fail + 1;
    END;
  END LOOP;

  -- Return summary for admin alerting
  RETURN jsonb_build_object(
    'status', 'complete',
    'period_type', p_period_type,
    'period_start', v_period_start,
    'period_end', v_period_end,
    'total_qualifying', v_total_users,
    'success', v_success,
    'fail', v_fail,
    'total_credits', v_total_credits,
    'total_pro_days', v_total_pro
  );
END;
$$;


-- 3. get_leaderboard RPC
-- Replaces the referral_leaderboard view with period-aware ranking + reward tier info.
CREATE OR REPLACE FUNCTION get_leaderboard(
  p_period_type text DEFAULT 'weekly',
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  user_id         uuid,
  display_name    text,
  referral_count  bigint,
  rank            bigint,
  reward_tier     text,
  earning_credits integer,
  earning_pro_days integer,
  is_me           boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start timestamptz;
  v_period_end   timestamptz;
  v_min_refs     integer;
  v_top_pct      numeric;
  v_total        integer;
  v_pct_cutoff   integer;
BEGIN
  -- Current period window
  IF p_period_type = 'weekly' THEN
    v_period_start := date_trunc('week', now());
    v_period_end   := v_period_start + interval '7 days';
    v_min_refs := 1;
    v_top_pct  := 0.10;
  ELSE
    v_period_start := date_trunc('month', now());
    v_period_end   := v_period_start + interval '1 month';
    v_min_refs := 2;
    v_top_pct  := 0.25;
  END IF;

  -- Count qualifying users
  SELECT COUNT(DISTINCT r.referrer_id) INTO v_total
  FROM referrals r
  JOIN profiles p ON p.id = r.referrer_id
  WHERE r.status IN ('activated', 'rewarded')
    AND r.activated_at >= v_period_start
    AND r.activated_at < v_period_end
    AND p.sharing_enabled = true
    AND r.fraud_score < 70;

  v_pct_cutoff := GREATEST(CEIL(v_total * v_top_pct), 1);

  RETURN QUERY
  WITH ranked AS (
    SELECT
      r.referrer_id,
      p.display_name AS dname,
      COUNT(*) AS ref_count,
      ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC, MIN(r.activated_at) ASC) AS rn
    FROM referrals r
    JOIN profiles p ON p.id = r.referrer_id
    WHERE r.status IN ('activated', 'rewarded')
      AND r.activated_at >= v_period_start
      AND r.activated_at < v_period_end
      AND p.sharing_enabled = true
      AND r.fraud_score < 70
    GROUP BY r.referrer_id, p.display_name
    HAVING COUNT(*) >= v_min_refs
  )
  SELECT
    rk.referrer_id,
    CASE WHEN rk.referrer_id = p_user_id THEN 'You' ELSE rk.dname END,
    rk.ref_count,
    rk.rn,
    CASE
      WHEN rk.rn = 1 THEN 'first'
      WHEN rk.rn <= 3 THEN 'top3'
      WHEN rk.rn <= 10 THEN 'top10'
      WHEN rk.rn <= v_pct_cutoff THEN 'top_pct'
      ELSE NULL
    END,
    CASE
      WHEN rk.rn = 1 THEN (CASE WHEN p_period_type = 'weekly' THEN 50 ELSE 100 END)
      WHEN rk.rn <= 3 THEN (CASE WHEN p_period_type = 'weekly' THEN 25 ELSE 50 END)
      WHEN rk.rn <= 10 THEN (CASE WHEN p_period_type = 'weekly' THEN 10 ELSE 25 END)
      WHEN rk.rn <= v_pct_cutoff THEN (CASE WHEN p_period_type = 'weekly' THEN 5 ELSE 10 END)
      ELSE 0
    END,
    CASE
      WHEN rk.rn = 1 THEN (CASE WHEN p_period_type = 'weekly' THEN 14 ELSE 30 END)
      WHEN rk.rn <= 3 THEN (CASE WHEN p_period_type = 'weekly' THEN 7 ELSE 14 END)
      WHEN rk.rn <= 10 THEN (CASE WHEN p_period_type = 'weekly' THEN 0 ELSE 7 END)
      ELSE 0
    END,
    (rk.referrer_id = p_user_id)
  FROM ranked rk
  ORDER BY rk.rn
  LIMIT 20;
END;
$$;


-- 4. pg_cron schedules
-- Weekly: Monday 00:00 UTC
SELECT cron.schedule(
  'distribute-weekly-leaderboard',
  '0 0 * * 1',
  $$SELECT distribute_leaderboard_rewards('weekly')$$
);

-- Monthly: 1st of month 00:00 UTC
SELECT cron.schedule(
  'distribute-monthly-leaderboard',
  '0 0 1 * *',
  $$SELECT distribute_leaderboard_rewards('monthly')$$
);
