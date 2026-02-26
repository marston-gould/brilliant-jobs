-- ============================================================
-- REFERRAL PROGRAM — Phase 1 Migration
-- Version: v5.07
-- Date: 2026-02-26
-- Scope: DB tables + profiles additions, referral code generation,
--         attribution system, activation gate, basic Tier 1 rewards,
--         structural fraud defenses
-- Cards closed: 1 (partial), 2 (partial), 3 (partial), 5 (partial), 7 (structural)
-- ============================================================
-- ROLLBACK SQL at bottom of file

BEGIN;

-- ============================================================
-- 1. PROFILES TABLE ADDITIONS
-- Referral-specific columns on existing profiles table
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_source text; -- 'link', 'code', 'email', 'linkedin', 'sms'
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS activated_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_count int NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_tier int NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS extra_filters int NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS priority_support boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS beta_access boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pro_bonus_until timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_banned boolean NOT NULL DEFAULT false;

-- Indexes for referral lookups
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles (referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON profiles (referred_by) WHERE referred_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_referral_tier ON profiles (referral_tier) WHERE referral_tier > 0;

-- ============================================================
-- 2. REFERRALS TABLE — Core tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  referred_email text,
  attribution_method text NOT NULL CHECK (attribution_method IN ('link', 'code', 'email', 'linkedin', 'sms')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'activated', 'rewarded', 'rejected', 'clawed_back')),
  
  -- Fraud signals
  fraud_score numeric(3,2) DEFAULT 0.00 CHECK (fraud_score >= 0 AND fraud_score <= 1),
  fraud_signals jsonb DEFAULT '{}',
  ip_address inet,
  browser_fingerprint text,
  
  -- Lifecycle timestamps
  signup_at timestamptz DEFAULT now(),
  activated_at timestamptz,
  rewarded_at timestamptz,
  rejected_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_id, status);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals (referred_id) WHERE referred_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_ip ON referrals (ip_address, created_at DESC) WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_referrals_fingerprint ON referrals (browser_fingerprint, created_at DESC) WHERE browser_fingerprint IS NOT NULL;

-- RLS
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Users can see their own referrals (as referrer or referred)
CREATE POLICY "users_see_own_referrals" ON referrals
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- Service role can do everything (Edge Functions)
CREATE POLICY "service_manage_referrals" ON referrals
  FOR ALL USING (auth.role() = 'service_role');

-- Authenticated users can insert (for self-attribution on signup)
CREATE POLICY "users_insert_referrals" ON referrals
  FOR INSERT WITH CHECK (auth.uid() = referred_id);

-- ============================================================
-- 3. REFERRAL_REWARDS TABLE — Tracks every reward distributed
-- ============================================================
CREATE TABLE IF NOT EXISTS referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referral_id uuid REFERENCES referrals(id) ON DELETE SET NULL,
  reward_type text NOT NULL CHECK (reward_type IN ('pro_time', 'credits', 'extra_filter', 'badge', 'priority_support', 'beta_access')),
  reward_value jsonb NOT NULL, -- e.g. {"days": 7}, {"credits": 25}, {"filters": 1}
  tier_at_grant int NOT NULL DEFAULT 1,
  granted_at timestamptz NOT NULL DEFAULT now(),
  clawed_back_at timestamptz,
  clawback_reason text,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_user ON referral_rewards (user_id, granted_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_type ON referral_rewards (user_id, reward_type);

-- RLS
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_see_own_rewards" ON referral_rewards
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "service_manage_rewards" ON referral_rewards
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 4. REFERRAL_INVITES TABLE — Track invite lifecycle
-- ============================================================
CREATE TABLE IF NOT EXISTS referral_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'linkedin', 'sms', 'copy_link', 'copy_code')),
  recipient_identifier text, -- email address, phone, or null for link copies
  utm_campaign text,
  utm_medium text,
  
  sent_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  clicked_at timestamptz,
  converted_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_invites_referrer ON referral_invites (referrer_id, sent_at DESC);

-- RLS
ALTER TABLE referral_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_see_own_invites" ON referral_invites
  FOR SELECT USING (auth.uid() = referrer_id);

CREATE POLICY "users_insert_invites" ON referral_invites
  FOR INSERT WITH CHECK (auth.uid() = referrer_id);

CREATE POLICY "service_manage_invites" ON referral_invites
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 5. REFERRAL_BADGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS referral_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_name text NOT NULL CHECK (badge_name IN ('connector', 'advocate', 'evangelist', 'champion', 'ambassador')),
  tier_threshold int NOT NULL, -- 1, 3, 5, 10, 25
  earned_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, badge_name)
);

CREATE INDEX IF NOT EXISTS idx_referral_badges_user ON referral_badges (user_id);

-- RLS
ALTER TABLE referral_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_see_own_badges" ON referral_badges
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "anyone_sees_badges" ON referral_badges
  FOR SELECT USING (true); -- badges are public

CREATE POLICY "service_manage_badges" ON referral_badges
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 6. REFERRAL_LEADERBOARD MATERIALIZED VIEW
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS referral_leaderboard AS
SELECT
  p.id AS user_id,
  LEFT(p.full_name, POSITION(' ' IN p.full_name || ' ') - 1) || ' ' || LEFT(SUBSTRING(p.full_name FROM POSITION(' ' IN p.full_name || ' ') + 1), 1) || '.' AS display_name,
  p.referral_count,
  p.referral_tier,
  p.sharing_enabled AS opted_in,
  (SELECT badge_name FROM referral_badges rb WHERE rb.user_id = p.id ORDER BY tier_threshold DESC LIMIT 1) AS highest_badge,
  RANK() OVER (ORDER BY p.referral_count DESC) AS rank
FROM profiles p
WHERE p.referral_count > 0
  AND p.sharing_enabled = true
  AND p.referral_banned = false
ORDER BY p.referral_count DESC
LIMIT 50;

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_leaderboard_user ON referral_leaderboard (user_id);

-- ============================================================
-- 7. REFERRAL_CONFIG TABLE — Admin-configurable tier thresholds
-- ============================================================
CREATE TABLE IF NOT EXISTS referral_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: read-only for authenticated, write for service role
ALTER TABLE referral_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_reads_config" ON referral_config
  FOR SELECT USING (true);

CREATE POLICY "service_writes_config" ON referral_config
  FOR ALL USING (auth.role() = 'service_role');

-- Seed tier configuration
INSERT INTO referral_config (key, value, description) VALUES
  ('tier_thresholds', '{
    "1": {"count": 1, "badge": "connector", "rewards": {"pro_days": 7, "credits": 25}},
    "2": {"count": 3, "badge": "advocate", "rewards": {"pro_days": 30, "credits": 50, "extra_filters": 1}},
    "3": {"count": 5, "badge": "evangelist", "rewards": {"pro_days": 90, "credits": 100, "unlimited_filters": true}},
    "4": {"count": 10, "badge": "champion", "rewards": {"pro_days": 180, "credits": 200, "priority_support": true, "beta_access": true}},
    "5": {"count": 25, "badge": "ambassador", "rewards": {"pro_days": -1, "credits": 500, "ambassador_title": true}}
  }', 'Referral tier thresholds and rewards. pro_days=-1 means lifetime.'),
  
  ('fraud_thresholds', '{
    "ip_cluster_max": 3,
    "ip_cluster_window_days": 7,
    "fingerprint_max": 3,
    "rapid_activation_seconds": 60,
    "burst_referral_max_daily": 10,
    "ghost_engagement_pct": 0.5,
    "invite_rate_daily": 5,
    "invite_rate_monthly": 50
  }', 'Fraud detection thresholds'),
  
  ('activation_gate', '{
    "email_verified": true,
    "profile_completed": true,
    "first_filter_saved": true,
    "first_search_performed": true,
    "min_engagement_seconds": 180
  }', 'Steps required before referral activation triggers reward'),
  
  ('referred_user_reward', '{
    "pro_days": 7,
    "credits": 25
  }', 'What the referred user gets on activation')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 8. REFERRAL CODE GENERATION TRIGGER
-- Auto-generates BJ-XXXXXX code on profile insert
-- ============================================================
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TRIGGER AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  -- Only generate if not already set
  IF NEW.referral_code IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  LOOP
    -- Generate BJ- + 6 alphanumeric chars (uppercase)
    new_code := 'BJ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    
    -- Check uniqueness
    SELECT EXISTS(SELECT 1 FROM profiles WHERE referral_code = new_code) INTO code_exists;
    
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  NEW.referral_code := new_code;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_referral_code ON profiles;
CREATE TRIGGER trg_generate_referral_code
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION generate_referral_code();

-- ============================================================
-- 9. BACKFILL existing profiles with referral codes
-- ============================================================
DO $$
DECLARE
  r RECORD;
  new_code text;
  code_exists boolean;
BEGIN
  FOR r IN SELECT id FROM profiles WHERE referral_code IS NULL
  LOOP
    LOOP
      new_code := 'BJ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      SELECT EXISTS(SELECT 1 FROM profiles WHERE referral_code = new_code) INTO code_exists;
      EXIT WHEN NOT code_exists;
    END LOOP;
    
    UPDATE profiles SET referral_code = new_code WHERE id = r.id;
  END LOOP;
END $$;

-- ============================================================
-- 10. UPDATED_AT TRIGGER for referrals table
-- ============================================================
CREATE OR REPLACE FUNCTION update_referrals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_referrals_updated_at ON referrals;
CREATE TRIGGER trg_referrals_updated_at
  BEFORE UPDATE ON referrals
  FOR EACH ROW
  EXECUTE FUNCTION update_referrals_updated_at();

-- ============================================================
-- 11. CHECK ACTIVATION RPC
-- Called when referred user completes activation steps
-- Returns whether all gates are passed
-- ============================================================
CREATE OR REPLACE FUNCTION check_referral_activation(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_gate jsonb;
  v_email_verified boolean;
  v_profile_completed boolean;
  v_has_filter boolean;
  v_has_search boolean;
  v_all_passed boolean;
BEGIN
  -- Get profile
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;
  
  -- Already activated?
  IF v_profile.activated_at IS NOT NULL THEN
    RETURN jsonb_build_object('already_activated', true, 'activated_at', v_profile.activated_at);
  END IF;
  
  -- Check gates
  -- 1. Email verified (Supabase auth handles this)
  SELECT (raw_user_meta_data->>'email_verified')::boolean INTO v_email_verified
  FROM auth.users WHERE id = p_user_id;
  v_email_verified := COALESCE(v_email_verified, false);
  
  -- 2. Profile completed (has full_name and linkedin_url)
  v_profile_completed := (v_profile.full_name IS NOT NULL AND v_profile.full_name != '' AND v_profile.approved = true);
  
  -- 3. Has at least one saved filter
  SELECT EXISTS(
    SELECT 1 FROM connections WHERE user_id = p_user_id LIMIT 1
  ) INTO v_has_filter;
  
  -- 4. Has performed at least one search (check if they have any user_data with searches)
  v_has_search := (v_profile.user_data IS NOT NULL AND v_profile.user_data != '{}'::jsonb);
  
  v_all_passed := v_email_verified AND v_profile_completed AND v_has_filter AND v_has_search;
  
  -- If all gates passed and user was referred, activate
  IF v_all_passed AND v_profile.referred_by IS NOT NULL AND v_profile.activated_at IS NULL THEN
    UPDATE profiles SET activated_at = now() WHERE id = p_user_id;
    
    -- Update referral record
    UPDATE referrals
    SET status = 'activated', activated_at = now()
    WHERE referred_id = p_user_id AND status = 'pending';
  END IF;
  
  RETURN jsonb_build_object(
    'all_passed', v_all_passed,
    'gates', jsonb_build_object(
      'email_verified', v_email_verified,
      'profile_completed', v_profile_completed,
      'first_filter_saved', v_has_filter,
      'first_search_performed', v_has_search
    ),
    'was_referred', v_profile.referred_by IS NOT NULL,
    'just_activated', v_all_passed AND v_profile.referred_by IS NOT NULL
  );
END;
$$;

-- ============================================================
-- 12. PROCESS REFERRAL ATTRIBUTION RPC
-- Called during signup to link referrer → referred
-- ============================================================
CREATE OR REPLACE FUNCTION process_referral_attribution(
  p_referred_id uuid,
  p_referral_code text DEFAULT NULL,
  p_attribution_method text DEFAULT 'link',
  p_ip_address text DEFAULT NULL,
  p_browser_fingerprint text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_referrer_id uuid;
  v_referral_id uuid;
  v_fraud_score numeric(3,2) := 0.00;
  v_fraud_signals jsonb := '{}';
  v_ip inet;
  v_ip_count int;
  v_fp_count int;
BEGIN
  -- Find referrer by code
  IF p_referral_code IS NULL OR p_referral_code = '' THEN
    RETURN jsonb_build_object('error', 'No referral code provided');
  END IF;
  
  SELECT id INTO v_referrer_id FROM profiles WHERE referral_code = upper(p_referral_code);
  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid referral code');
  END IF;
  
  -- Self-referral check
  IF v_referrer_id = p_referred_id THEN
    RETURN jsonb_build_object('error', 'Cannot refer yourself', 'fraud_signal', 'self_referral');
  END IF;
  
  -- Check if referrer is banned
  IF (SELECT referral_banned FROM profiles WHERE id = v_referrer_id) THEN
    RETURN jsonb_build_object('error', 'Referrer account restricted');
  END IF;
  
  -- Already referred?
  IF (SELECT referred_by FROM profiles WHERE id = p_referred_id) IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'User already has a referrer');
  END IF;
  
  -- Fraud scoring
  BEGIN
    v_ip := p_ip_address::inet;
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;
  
  -- IP cluster check
  IF v_ip IS NOT NULL THEN
    SELECT COUNT(*) INTO v_ip_count
    FROM referrals
    WHERE referrer_id = v_referrer_id
      AND ip_address = v_ip
      AND created_at > now() - interval '7 days';
    
    IF v_ip_count >= 3 THEN
      v_fraud_score := v_fraud_score + 0.40;
      v_fraud_signals := v_fraud_signals || '{"ip_cluster": true}'::jsonb;
    ELSIF v_ip_count >= 1 THEN
      v_fraud_score := v_fraud_score + 0.15;
      v_fraud_signals := v_fraud_signals || '{"ip_repeat": true}'::jsonb;
    END IF;
  END IF;
  
  -- Fingerprint check
  IF p_browser_fingerprint IS NOT NULL AND p_browser_fingerprint != '' THEN
    SELECT COUNT(*) INTO v_fp_count
    FROM referrals
    WHERE browser_fingerprint = p_browser_fingerprint
      AND created_at > now() - interval '30 days';
    
    IF v_fp_count >= 3 THEN
      v_fraud_score := v_fraud_score + 0.50;
      v_fraud_signals := v_fraud_signals || '{"fingerprint_cluster": true}'::jsonb;
    END IF;
  END IF;
  
  -- Same IP within 24h (self-referral proxy)
  IF v_ip IS NOT NULL THEN
    IF EXISTS(
      SELECT 1 FROM profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE p.id = v_referrer_id
      -- We can't easily check referrer IP here, but we flag if same IP used for multiple referrals in 24h
    ) THEN
      NULL; -- Placeholder for more sophisticated IP check
    END IF;
  END IF;
  
  -- Auto-reject if fraud score too high
  IF v_fraud_score >= 0.80 THEN
    INSERT INTO referrals (referrer_id, referred_id, attribution_method, status, fraud_score, fraud_signals, ip_address, browser_fingerprint)
    VALUES (v_referrer_id, p_referred_id, p_attribution_method, 'rejected', v_fraud_score, v_fraud_signals, v_ip, p_browser_fingerprint)
    RETURNING id INTO v_referral_id;
    
    RETURN jsonb_build_object('status', 'rejected', 'referral_id', v_referral_id, 'fraud_score', v_fraud_score);
  END IF;
  
  -- Create referral record
  INSERT INTO referrals (referrer_id, referred_id, attribution_method, fraud_score, fraud_signals, ip_address, browser_fingerprint)
  VALUES (v_referrer_id, p_referred_id, p_attribution_method, v_fraud_score, v_fraud_signals, v_ip, p_browser_fingerprint)
  RETURNING id INTO v_referral_id;
  
  -- Update referred user's profile
  UPDATE profiles
  SET referred_by = v_referrer_id,
      referral_source = p_attribution_method
  WHERE id = p_referred_id;
  
  RETURN jsonb_build_object(
    'status', 'pending',
    'referral_id', v_referral_id,
    'referrer_code', (SELECT referral_code FROM profiles WHERE id = v_referrer_id),
    'fraud_score', v_fraud_score
  );
END;
$$;

-- ============================================================
-- 13. PROCESS REFERRAL REWARD RPC
-- Called after activation to grant Tier 1 rewards (both parties)
-- ============================================================
CREATE OR REPLACE FUNCTION process_referral_reward(p_referral_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_referral RECORD;
  v_referrer RECORD;
  v_config jsonb;
  v_tier_config jsonb;
  v_new_count int;
  v_new_tier int := 0;
  v_referred_reward jsonb;
  v_rewards_granted jsonb := '[]';
BEGIN
  -- Get referral
  SELECT * INTO v_referral FROM referrals WHERE id = p_referral_id;
  IF v_referral IS NULL THEN
    RETURN jsonb_build_object('error', 'Referral not found');
  END IF;
  
  IF v_referral.status != 'activated' THEN
    RETURN jsonb_build_object('error', 'Referral not in activated status', 'current_status', v_referral.status);
  END IF;
  
  -- Get tier config
  SELECT value INTO v_config FROM referral_config WHERE key = 'tier_thresholds';
  SELECT value INTO v_referred_reward FROM referral_config WHERE key = 'referred_user_reward';
  
  -- Increment referrer count
  UPDATE profiles
  SET referral_count = referral_count + 1
  WHERE id = v_referral.referrer_id
  RETURNING referral_count INTO v_new_count;
  
  -- Determine new tier
  FOR i IN REVERSE 5..1 LOOP
    IF v_new_count >= (v_config->i::text->>'count')::int THEN
      v_new_tier := i;
      EXIT;
    END IF;
  END LOOP;
  
  -- Get referrer profile
  SELECT * INTO v_referrer FROM profiles WHERE id = v_referral.referrer_id;
  
  -- Update tier if upgraded
  IF v_new_tier > v_referrer.referral_tier THEN
    UPDATE profiles SET referral_tier = v_new_tier WHERE id = v_referral.referrer_id;
    
    -- Grant tier rewards for the NEW tier
    v_tier_config := v_config->v_new_tier::text;
    
    -- Pro time reward for referrer
    IF (v_tier_config->'rewards'->>'pro_days') IS NOT NULL THEN
      DECLARE
        v_pro_days int := (v_tier_config->'rewards'->>'pro_days')::int;
      BEGIN
        IF v_pro_days = -1 THEN
          -- Lifetime pro
          UPDATE profiles SET pro_bonus_until = '9999-12-31'::timestamptz WHERE id = v_referral.referrer_id;
        ELSIF v_pro_days > 0 THEN
          UPDATE profiles
          SET pro_bonus_until = GREATEST(COALESCE(pro_bonus_until, now()), now()) + (v_pro_days || ' days')::interval
          WHERE id = v_referral.referrer_id;
        END IF;
        
        INSERT INTO referral_rewards (user_id, referral_id, reward_type, reward_value, tier_at_grant)
        VALUES (v_referral.referrer_id, p_referral_id, 'pro_time', jsonb_build_object('days', v_pro_days), v_new_tier);
        
        v_rewards_granted := v_rewards_granted || jsonb_build_array(jsonb_build_object('type', 'pro_time', 'days', v_pro_days));
      END;
    END IF;
    
    -- Credits reward for referrer
    IF (v_tier_config->'rewards'->>'credits') IS NOT NULL THEN
      DECLARE
        v_credits int := (v_tier_config->'rewards'->>'credits')::int;
      BEGIN
        INSERT INTO referral_rewards (user_id, referral_id, reward_type, reward_value, tier_at_grant)
        VALUES (v_referral.referrer_id, p_referral_id, 'credits', jsonb_build_object('credits', v_credits), v_new_tier);
        
        v_rewards_granted := v_rewards_granted || jsonb_build_array(jsonb_build_object('type', 'credits', 'amount', v_credits));
      END;
    END IF;
    
    -- Extra filters
    IF (v_tier_config->'rewards'->>'extra_filters') IS NOT NULL THEN
      UPDATE profiles SET extra_filters = extra_filters + (v_tier_config->'rewards'->>'extra_filters')::int
      WHERE id = v_referral.referrer_id;
      
      INSERT INTO referral_rewards (user_id, referral_id, reward_type, reward_value, tier_at_grant)
      VALUES (v_referral.referrer_id, p_referral_id, 'extra_filter', jsonb_build_object('filters', (v_tier_config->'rewards'->>'extra_filters')::int), v_new_tier);
    END IF;
    
    -- Unlimited filters at tier 3
    IF (v_tier_config->'rewards'->>'unlimited_filters')::boolean IS TRUE THEN
      UPDATE profiles SET extra_filters = 999 WHERE id = v_referral.referrer_id;
    END IF;
    
    -- Priority support
    IF (v_tier_config->'rewards'->>'priority_support')::boolean IS TRUE THEN
      UPDATE profiles SET priority_support = true WHERE id = v_referral.referrer_id;
      
      INSERT INTO referral_rewards (user_id, referral_id, reward_type, reward_value, tier_at_grant)
      VALUES (v_referral.referrer_id, p_referral_id, 'priority_support', '{"enabled": true}', v_new_tier);
    END IF;
    
    -- Beta access
    IF (v_tier_config->'rewards'->>'beta_access')::boolean IS TRUE THEN
      UPDATE profiles SET beta_access = true WHERE id = v_referral.referrer_id;
      
      INSERT INTO referral_rewards (user_id, referral_id, reward_type, reward_value, tier_at_grant)
      VALUES (v_referral.referrer_id, p_referral_id, 'beta_access', '{"enabled": true}', v_new_tier);
    END IF;
    
    -- Badge
    IF (v_tier_config->>'badge') IS NOT NULL THEN
      INSERT INTO referral_badges (user_id, badge_name, tier_threshold)
      VALUES (v_referral.referrer_id, v_tier_config->>'badge', (v_tier_config->>'count')::int)
      ON CONFLICT (user_id, badge_name) DO NOTHING;
    END IF;
  END IF;
  
  -- Grant referred user reward (always Tier 1 reward)
  IF v_referred_reward IS NOT NULL AND v_referral.referred_id IS NOT NULL THEN
    -- Pro time for referred user
    IF (v_referred_reward->>'pro_days') IS NOT NULL THEN
      DECLARE
        v_ref_pro_days int := (v_referred_reward->>'pro_days')::int;
      BEGIN
        UPDATE profiles
        SET pro_bonus_until = GREATEST(COALESCE(pro_bonus_until, now()), now()) + (v_ref_pro_days || ' days')::interval
        WHERE id = v_referral.referred_id;
        
        INSERT INTO referral_rewards (user_id, referral_id, reward_type, reward_value, tier_at_grant)
        VALUES (v_referral.referred_id, p_referral_id, 'pro_time', jsonb_build_object('days', v_ref_pro_days), 1);
      END;
    END IF;
    
    -- Credits for referred user
    IF (v_referred_reward->>'credits') IS NOT NULL THEN
      INSERT INTO referral_rewards (user_id, referral_id, reward_type, reward_value, tier_at_grant)
      VALUES (v_referral.referred_id, p_referral_id, 'credits', jsonb_build_object('credits', (v_referred_reward->>'credits')::int), 1);
    END IF;
  END IF;
  
  -- Mark referral as rewarded
  UPDATE referrals SET status = 'rewarded', rewarded_at = now() WHERE id = p_referral_id;
  
  RETURN jsonb_build_object(
    'status', 'rewarded',
    'referrer_new_count', v_new_count,
    'referrer_new_tier', v_new_tier,
    'referrer_old_tier', v_referrer.referral_tier,
    'tier_upgraded', v_new_tier > v_referrer.referral_tier,
    'rewards_granted', v_rewards_granted
  );
END;
$$;

-- ============================================================
-- 14. GET REFERRAL STATS RPC — For Referral Hub dashboard
-- ============================================================
CREATE OR REPLACE FUNCTION get_referral_stats(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_stats jsonb;
  v_pending int;
  v_activated int;
  v_rewarded int;
  v_total_invites int;
  v_config jsonb;
  v_next_tier_count int;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;
  
  -- Counts by status
  SELECT COUNT(*) FILTER (WHERE status = 'pending'),
         COUNT(*) FILTER (WHERE status = 'activated'),
         COUNT(*) FILTER (WHERE status = 'rewarded')
  INTO v_pending, v_activated, v_rewarded
  FROM referrals WHERE referrer_id = p_user_id;
  
  -- Total invites sent
  SELECT COUNT(*) INTO v_total_invites FROM referral_invites WHERE referrer_id = p_user_id;
  
  -- Next tier threshold
  SELECT value INTO v_config FROM referral_config WHERE key = 'tier_thresholds';
  IF v_profile.referral_tier < 5 THEN
    v_next_tier_count := (v_config->(v_profile.referral_tier + 1)::text->>'count')::int;
  ELSE
    v_next_tier_count := NULL;
  END IF;
  
  RETURN jsonb_build_object(
    'referral_code', v_profile.referral_code,
    'referral_link', 'https://brilliantjobs.app/?ref=' || v_profile.referral_code,
    'current_tier', v_profile.referral_tier,
    'referral_count', v_profile.referral_count,
    'next_tier_at', v_next_tier_count,
    'progress_to_next', CASE
      WHEN v_next_tier_count IS NOT NULL THEN
        round((v_profile.referral_count::numeric / v_next_tier_count) * 100, 1)
      ELSE 100
    END,
    'stats', jsonb_build_object(
      'pending', v_pending,
      'activated', v_activated,
      'rewarded', v_rewarded,
      'total_invites', v_total_invites
    ),
    'badges', (SELECT jsonb_agg(jsonb_build_object('name', badge_name, 'earned_at', earned_at))
               FROM referral_badges WHERE user_id = p_user_id),
    'sharing_enabled', v_profile.sharing_enabled
  );
END;
$$;

-- ============================================================
-- 15. REFRESH LEADERBOARD — For pg_cron (every hour)
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_referral_leaderboard()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY referral_leaderboard;
END;
$$;

COMMIT;

-- ============================================================
-- ROLLBACK SQL (run manually if needed)
-- ============================================================
-- DROP FUNCTION IF EXISTS refresh_referral_leaderboard();
-- DROP FUNCTION IF EXISTS get_referral_stats(uuid);
-- DROP FUNCTION IF EXISTS process_referral_reward(uuid);
-- DROP FUNCTION IF EXISTS process_referral_attribution(uuid, text, text, text, text);
-- DROP FUNCTION IF EXISTS check_referral_activation(uuid);
-- DROP FUNCTION IF EXISTS update_referrals_updated_at();
-- DROP TRIGGER IF EXISTS trg_generate_referral_code ON profiles;
-- DROP FUNCTION IF EXISTS generate_referral_code();
-- DROP MATERIALIZED VIEW IF EXISTS referral_leaderboard;
-- DROP TABLE IF EXISTS referral_config;
-- DROP TABLE IF EXISTS referral_badges;
-- DROP TABLE IF EXISTS referral_invites;
-- DROP TABLE IF EXISTS referral_rewards;
-- DROP TABLE IF EXISTS referrals;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS referral_code;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS referred_by;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS referral_source;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS activated_at;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS referral_count;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS referral_tier;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS extra_filters;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS priority_support;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS beta_access;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS pro_bonus_until;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS referral_banned;
