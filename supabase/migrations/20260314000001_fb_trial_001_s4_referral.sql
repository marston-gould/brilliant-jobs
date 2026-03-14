-- FB-TRIAL-001-S4: Referral Program Schema + Clawback Cron
-- Adds referral_code_generated_at to profiles (Part 7 — code expiry tracking)
-- Adds referral-clawback-checker pg_cron job (Part 3)

-- ─── 1. Add referral_code_generated_at to profiles ───
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referral_code_generated_at TIMESTAMPTZ;

-- Backfill: set to created_at for existing users who have a referral_code
UPDATE profiles
  SET referral_code_generated_at = created_at
  WHERE referral_code IS NOT NULL
    AND referral_code_generated_at IS NULL;

-- When a new user gets a referral_code (on signup trigger), set generated_at = NOW()
-- Update fn_trial_on_signup to also set referral_code_generated_at
CREATE OR REPLACE FUNCTION fn_trial_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only run on INSERT
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Set trial fields if not already set
  IF NEW.trial_started_at IS NULL THEN
    NEW.trial_started_at = NOW();
  END IF;
  IF NEW.trial_expires_at IS NULL THEN
    NEW.trial_expires_at = NOW() + INTERVAL '7 days';
  END IF;
  IF NEW.user_state IS NULL OR NEW.user_state = '' THEN
    NEW.user_state = 'trialing';
  END IF;
  IF NEW.feature_samples_used IS NULL THEN
    NEW.feature_samples_used = '{}'::jsonb;
  END IF;

  -- Generate referral_code if not set
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code = substr(md5(random()::text || NEW.id::text), 1, 8);
    NEW.referral_code_generated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON COLUMN profiles.referral_code_generated_at IS
  'FB-TRIAL-001-S4: Timestamp when the current referral_code was generated. Used to enforce 90-day expiry.';

-- ─── 2. Referral Clawback Checker pg_cron ───
-- Runs daily. Finds trial_referrals where:
--   status = 'converted' AND the referred user's subscription was canceled
--   within 7 days of referred_converted_at.
-- For those: sets status = 'expired', flags for coupon reversal via referral-clawback EF.

CREATE OR REPLACE FUNCTION fn_referral_clawback_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clawback_ids UUID[];
  v_count INT := 0;
  v_result jsonb;
BEGIN
  -- Find converted referrals where referred user canceled within 7 days
  SELECT ARRAY_AGG(tr.id)
  INTO v_clawback_ids
  FROM trial_referrals tr
  JOIN user_subscriptions us ON us.user_id = tr.referred_id
  WHERE tr.status = 'converted'
    AND tr.referred_converted_at IS NOT NULL
    -- Subscription was canceled
    AND us.status IN ('canceled', 'expired')
    -- Cancellation was within 7 days of conversion
    AND us.canceled_at IS NOT NULL
    AND us.canceled_at < (tr.referred_converted_at + INTERVAL '7 days')
    -- Not already clawed back
    AND tr.referrer_credit_applied_at IS NULL;

  IF v_clawback_ids IS NOT NULL AND array_length(v_clawback_ids, 1) > 0 THEN
    -- Mark as expired
    UPDATE trial_referrals
      SET status = 'expired'
      WHERE id = ANY(v_clawback_ids);

    v_count := array_length(v_clawback_ids, 1);

    -- Log to agent_action_log for admin visibility
    INSERT INTO agent_action_log (agent_id, action_type, status, metadata)
    SELECT
      (SELECT id FROM agent_config WHERE agent_name = 'referral-pipeline' LIMIT 1),
      'referral_clawback',
      'completed',
      jsonb_build_object(
        'clawed_back_ids', v_clawback_ids,
        'count', v_count,
        'checked_at', NOW()
      )
    ON CONFLICT DO NOTHING;
  END IF;

  v_result := jsonb_build_object(
    'checked_at', NOW(),
    'clawed_back', v_count,
    'ids', COALESCE(v_clawback_ids, ARRAY[]::UUID[])
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_referral_clawback_check() TO service_role;

-- Schedule daily clawback check at 3:00 AM UTC
SELECT cron.schedule(
  'referral-clawback-checker',
  '0 3 * * *',
  $$SELECT fn_referral_clawback_check()$$
);
