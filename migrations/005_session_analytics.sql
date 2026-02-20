-- Migration 005: Session Analytics (Cohort Phase B)
-- Date: 2026-02-20
-- Applied: Live (via exec_sql)

-- 1. Session table
CREATE TABLE IF NOT EXISTS user_sessions (
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

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_cohort ON user_sessions (cohort_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_plan ON user_sessions (plan_id, started_at DESC);

-- 3. RLS
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sessions_read ON user_sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY sessions_no_direct_insert ON user_sessions
  FOR INSERT WITH CHECK (false);
CREATE POLICY sessions_no_direct_update ON user_sessions
  FOR UPDATE USING (false);

-- 4. Create session RPC (SECURITY DEFINER — bypasses RLS)
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

-- 5. Heartbeat RPC
CREATE OR REPLACE FUNCTION session_heartbeat(p_session_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE user_sessions SET last_active_at = now() WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
