-- ============================================================================
-- FB-TRIAL-001-S1: Trial Gate + Free Samples + Referral Program Schema
-- ============================================================================
-- Phase 18: 1-Week Trial Gate, Free Samples, Referral Program
-- Reference: POD2_HANDOFF_TrialGate_Samples_Referral_CostOpt.docx
-- Session: FB-TRIAL-001-S1 (DB Schema + Migration + checkFeatureAccess)
-- ============================================================================

-- ── 1. PROFILES TABLE: Trial + Sample + Referral columns ───────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ DEFAULT NULL;

-- user_state: trialing (7-day full access), active_pro (paid), expired_free (browse + samples)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS user_state TEXT NOT NULL DEFAULT 'trialing'
  CHECK (user_state IN ('trialing', 'active_pro', 'expired_free'));

-- feature_samples_used: JSONB object tracking one-time free sample consumption per feature
-- Keys: chat, score, sms, email, apply, stats, filter, boolean
-- Values: true when consumed. Empty {} = no samples used yet.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS feature_samples_used JSONB NOT NULL DEFAULT '{}';

-- Referral columns on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_credit_expires_at TIMESTAMPTZ;

-- Index for pg_cron trial-expiry-checker (every 15 min)
CREATE INDEX IF NOT EXISTS idx_profiles_trial_expiry
  ON profiles (trial_expires_at)
  WHERE user_state = 'trialing';

-- Index for referral lookups
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code
  ON profiles (referral_code)
  WHERE referral_code IS NOT NULL;

-- Index for referred_by lookups
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by
  ON profiles (referred_by)
  WHERE referred_by IS NOT NULL;


-- ── 2. REFERRALS TABLE ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS referrals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     UUID NOT NULL REFERENCES profiles(id),
  referred_id     UUID REFERENCES profiles(id),
  referral_code   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'signed_up', 'converted', 'rewarded', 'expired')),
  referred_signup_at          TIMESTAMPTZ,
  referred_converted_at       TIMESTAMPTZ,
  referrer_credit_applied_at  TIMESTAMPTZ,
  referred_credit_applied_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_code
  ON referrals (referral_code);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer
  ON referrals (referrer_id, status);

CREATE INDEX IF NOT EXISTS idx_referrals_referred
  ON referrals (referred_id)
  WHERE referred_id IS NOT NULL;

-- RLS
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Users can read their own referrals (as referrer or referred)
DO $$ BEGIN
  CREATE POLICY referrals_user_read ON referrals
    FOR SELECT USING (
      auth.uid() = referrer_id OR auth.uid() = referred_id
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Service role has full access
DO $$ BEGIN
  CREATE POLICY referrals_service_all ON referrals
    FOR ALL USING (
      (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- ── 3. RESUME_SCORE_QUEUE TABLE (Cost Optimization 5.2: Batch API) ─────────

CREATE TABLE IF NOT EXISTS resume_score_queue (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES profiles(id),
  resume_id   UUID,  -- References resumes in storage, not a FK to avoid coupling
  job_id      TEXT,  -- ats_jobs reference for scoring context
  status      TEXT DEFAULT 'pending'
                CHECK (status IN ('pending', 'submitted', 'completed', 'failed')),
  batch_id    TEXT,
  result      JSONB,  -- Score result when completed
  error       TEXT,   -- Error message when failed
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rsq_status
  ON resume_score_queue (status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_rsq_user
  ON resume_score_queue (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rsq_batch
  ON resume_score_queue (batch_id)
  WHERE batch_id IS NOT NULL;

-- RLS
ALTER TABLE resume_score_queue ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY rsq_user_read ON resume_score_queue
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY rsq_service_all ON resume_score_queue
    FOR ALL USING (
      (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- ── 4. pg_cron: Trial Expiry Checker ───────────────────────────────────────
-- Runs every 15 minutes. Transitions trialing → expired_free when:
--   trial_expires_at < NOW() AND user is not an active subscriber
-- Uses LEFT JOIN to user_subscriptions to check subscription status

DO $$
BEGIN
  -- Remove existing schedule if present (idempotent)
  PERFORM cron.unschedule('trial-expiry-checker');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'trial-expiry-checker',
  '*/15 * * * *',
  $$
    UPDATE profiles p
    SET user_state = 'expired_free'
    WHERE p.user_state = 'trialing'
      AND p.trial_expires_at < NOW()
      AND NOT EXISTS (
        SELECT 1 FROM user_subscriptions us
        WHERE us.user_id = p.id
          AND us.status = 'active'
      );
  $$
);

COMMENT ON COLUMN profiles.user_state IS 'FB-TRIAL-001: User lifecycle state. trialing=7-day full access, active_pro=paid subscriber, expired_free=browse+samples only';
COMMENT ON COLUMN profiles.feature_samples_used IS 'FB-TRIAL-001: JSONB tracking one-time free sample usage per feature. Keys: chat,score,sms,email,apply,stats,filter,boolean. Values: true when consumed.';
COMMENT ON TABLE referrals IS 'FB-TRIAL-001: Referral tracking. Paying users refer others; both get 1 free week on referred conversion.';
COMMENT ON TABLE resume_score_queue IS 'FB-TRIAL-001 5.2: Batch API queue for resume scoring. pg_cron submits pending items to Anthropic Batch API every 5 minutes.';


-- ── 5. EXISTING USER MIGRATION ─────────────────────────────────────────────
-- Classifies all existing users into correct states.
-- MUST run after column additions above.

-- 5a. Active subscribers → active_pro, all samples pre-consumed (they don't need samples)
UPDATE profiles
SET user_state = 'active_pro',
    feature_samples_used = '{"chat":true,"score":true,"sms":true,"email":true,"apply":true,"stats":true,"filter":true,"boolean":true}'
WHERE id IN (
  SELECT us.user_id FROM user_subscriptions us WHERE us.status = 'active'
)
AND user_state != 'active_pro';

-- 5b. Expired users (signed up > 7 days ago, no active subscription) → expired_free with fresh samples
UPDATE profiles
SET user_state = 'expired_free',
    trial_started_at = created_at,
    trial_expires_at = created_at + INTERVAL '7 days',
    feature_samples_used = '{}'
WHERE id NOT IN (
  SELECT us.user_id FROM user_subscriptions us WHERE us.status = 'active'
)
AND created_at < NOW() - INTERVAL '7 days'
AND user_state != 'expired_free';

-- 5c. Recent signups (< 7 days) → trialing with remaining trial time
UPDATE profiles
SET user_state = 'trialing',
    trial_started_at = created_at,
    trial_expires_at = created_at + INTERVAL '7 days',
    feature_samples_used = '{}'
WHERE id NOT IN (
  SELECT us.user_id FROM user_subscriptions us WHERE us.status = 'active'
)
AND created_at >= NOW() - INTERVAL '7 days'
AND user_state != 'trialing';

-- 5d. Generate referral codes for paying users
UPDATE profiles
SET referral_code = substr(md5(random()::text), 1, 8)
WHERE user_state = 'active_pro'
  AND referral_code IS NULL;


-- ── 6. SIGNUP TRIGGER: Auto-set trial columns on new user creation ─────────

CREATE OR REPLACE FUNCTION fn_trial_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  NEW.trial_started_at := NOW();
  NEW.trial_expires_at := NOW() + INTERVAL '7 days';
  NEW.user_state := 'trialing';
  NEW.feature_samples_used := '{}';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only fire when trial_started_at is not already set (new signups only)
DROP TRIGGER IF EXISTS trg_trial_on_signup ON profiles;
CREATE TRIGGER trg_trial_on_signup
  BEFORE INSERT ON profiles
  FOR EACH ROW
  WHEN (NEW.trial_started_at IS NULL)
  EXECUTE FUNCTION fn_trial_on_signup();


-- ── 7. HELPER FUNCTION: Check feature access server-side ───────────────────
-- Used by Edge Functions for gating. Returns JSONB with access decision.
-- This is the SQL companion to _shared/checkFeatureAccess.ts

CREATE OR REPLACE FUNCTION fn_check_feature_access(
  p_user_id UUID,
  p_feature TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_profile RECORD;
  v_sub_active BOOLEAN;
  v_rows_updated INT;
BEGIN
  -- Get profile
  SELECT user_state, trial_expires_at, feature_samples_used
  INTO v_profile
  FROM profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'user_not_found');
  END IF;

  -- Check subscription status
  SELECT EXISTS(
    SELECT 1 FROM user_subscriptions
    WHERE user_id = p_user_id AND status = 'active'
  ) INTO v_sub_active;

  -- Branch 1: Active Pro
  IF v_profile.user_state = 'active_pro' AND v_sub_active THEN
    RETURN jsonb_build_object('allowed', true);
  END IF;

  -- Branch 2: Trialing (within trial window)
  IF v_profile.user_state = 'trialing' AND v_profile.trial_expires_at > NOW() THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'daysRemaining', EXTRACT(EPOCH FROM (v_profile.trial_expires_at - NOW())) / 86400
    );
  END IF;

  -- Branch 3: Expired free — check sample availability
  IF v_profile.user_state = 'expired_free' THEN
    -- Check if sample NOT yet consumed for this feature
    IF NOT (v_profile.feature_samples_used ? p_feature) THEN
      -- Atomic sample consumption: UPDATE with WHERE guard prevents race conditions
      UPDATE profiles
      SET feature_samples_used = feature_samples_used || jsonb_build_object(p_feature, true)
      WHERE id = p_user_id
        AND NOT (feature_samples_used ? p_feature)
      RETURNING 1 INTO v_rows_updated;  -- Workaround: count affected

      IF v_rows_updated = 1 THEN
        RETURN jsonb_build_object('allowed', true, 'isSample', true);
      END IF;
      -- If 0 rows updated, race condition — sample already consumed by concurrent request
    END IF;
  END IF;

  -- Branch 4: Denied
  RETURN jsonb_build_object('allowed', false, 'reason', 'upgrade_required');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_check_feature_access IS 'FB-TRIAL-001: 4-branch feature gating. Returns {allowed, isSample?, daysRemaining?, reason?}. Sample consumption is atomic via JSONB WHERE guard.';

-- Grant to authenticated users (called via EFs with user JWT)
GRANT EXECUTE ON FUNCTION fn_check_feature_access TO authenticated;
GRANT EXECUTE ON FUNCTION fn_check_feature_access TO service_role;
