-- Brilliant Jobs — Referral Program Phase 4 Migration
-- v5.10: Fingerprint tracking, clawback status, click tracking RPC

-- 1. Add clawed_back as valid referral status
ALTER TABLE referrals 
  DROP CONSTRAINT IF EXISTS referrals_status_check;
ALTER TABLE referrals 
  ADD CONSTRAINT referrals_status_check 
  CHECK (status IN ('pending', 'activated', 'rewarded', 'rejected', 'clawed_back', 'expired'));

-- 2. Add clawback fields to referral_rewards
ALTER TABLE referral_rewards 
  ADD COLUMN IF NOT EXISTS clawback_reason TEXT,
  ADD COLUMN IF NOT EXISTS referral_id UUID REFERENCES referrals(id);

-- 3. Track referral click RPC (public/anon access for landing pages)
CREATE OR REPLACE FUNCTION track_referral_click(p_code TEXT, p_source TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_referrer_id UUID;
BEGIN
  -- Look up referrer by code
  SELECT id INTO v_referrer_id
  FROM profiles
  WHERE referral_code = UPPER(p_code) AND referral_banned = FALSE;
  
  IF v_referrer_id IS NULL THEN RETURN; END IF;
  
  -- Upsert invite record: if same code+source in last hour, just update clicked_at
  INSERT INTO referral_invites (referrer_id, channel, status, clicked_at)
  VALUES (v_referrer_id, COALESCE(p_source, 'direct'), 'clicked', NOW())
  ON CONFLICT DO NOTHING;
  
  -- We don't have a unique constraint to upsert on, so just insert
  -- Dedup happens at conversion time
END;
$$;

-- Grant anon access for landing pages
GRANT EXECUTE ON FUNCTION track_referral_click(TEXT, TEXT) TO anon;

-- 4. Index for faster fraud scans
CREATE INDEX IF NOT EXISTS idx_referrals_fraud_score 
  ON referrals(fraud_score DESC) 
  WHERE fraud_score > 0.2;

CREATE INDEX IF NOT EXISTS idx_referrals_status_pending 
  ON referrals(status) 
  WHERE status IN ('pending', 'activated');

CREATE INDEX IF NOT EXISTS idx_referral_rewards_not_clawed 
  ON referral_rewards(granted_at DESC) 
  WHERE clawed_back_at IS NULL;

-- 5. Update process_referral_attribution to capture fingerprint
CREATE OR REPLACE FUNCTION process_referral_attribution(
  p_referred_id UUID,
  p_referral_code TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_browser_fingerprint TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'link'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_referrer_id UUID;
  v_fraud_score NUMERIC := 0;
  v_fraud_signals JSONB := '{}';
  v_existing INT;
  v_ip_cluster INT;
  v_fp_cluster INT;
BEGIN
  -- Validate referral code
  SELECT id INTO v_referrer_id
  FROM profiles
  WHERE referral_code = UPPER(p_referral_code)
    AND referral_banned = FALSE
    AND id != p_referred_id;
  
  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;
  
  -- Check not already referred
  SELECT COUNT(*) INTO v_existing FROM referrals WHERE referred_id = p_referred_id;
  IF v_existing > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_referred');
  END IF;
  
  -- Fraud check 1: IP cluster (3+ from same IP in 7 days)
  IF p_ip_address IS NOT NULL THEN
    SELECT COUNT(*) INTO v_ip_cluster
    FROM referrals
    WHERE referrer_id = v_referrer_id
      AND ip_address = p_ip_address
      AND signup_at > NOW() - INTERVAL '7 days';
    
    IF v_ip_cluster >= 3 THEN
      v_fraud_score := v_fraud_score + 0.4;
      v_fraud_signals := v_fraud_signals || jsonb_build_object('ip_cluster', v_ip_cluster);
    ELSIF v_ip_cluster >= 1 THEN
      v_fraud_score := v_fraud_score + 0.15;
      v_fraud_signals := v_fraud_signals || jsonb_build_object('ip_repeat', v_ip_cluster);
    END IF;
  END IF;
  
  -- Fraud check 2: Browser fingerprint cluster
  IF p_browser_fingerprint IS NOT NULL THEN
    SELECT COUNT(*) INTO v_fp_cluster
    FROM referrals
    WHERE referrer_id = v_referrer_id
      AND browser_fingerprint = p_browser_fingerprint
      AND signup_at > NOW() - INTERVAL '30 days';
    
    IF v_fp_cluster >= 2 THEN
      v_fraud_score := v_fraud_score + 0.35;
      v_fraud_signals := v_fraud_signals || jsonb_build_object('fingerprint_match', v_fp_cluster);
    END IF;
  END IF;
  
  -- Fraud check 3: Self-referral (same IP as referrer's last login)
  IF p_ip_address IS NOT NULL THEN
    PERFORM 1 FROM auth.sessions
    WHERE user_id = v_referrer_id
      AND ip IS NOT NULL
      AND ip::TEXT = p_ip_address
    LIMIT 1;
    
    IF FOUND THEN
      v_fraud_score := v_fraud_score + 0.5;
      v_fraud_signals := v_fraud_signals || jsonb_build_object('self_referral_ip', true);
    END IF;
  END IF;
  
  -- Auto-reject if score too high
  INSERT INTO referrals (
    referrer_id, referred_id, referred_email,
    attribution_method, ip_address, browser_fingerprint,
    fraud_score, fraud_signals,
    status
  )
  SELECT
    v_referrer_id, p_referred_id, 
    (SELECT email FROM auth.users WHERE id = p_referred_id),
    p_source, p_ip_address, p_browser_fingerprint,
    v_fraud_score, v_fraud_signals,
    CASE WHEN v_fraud_score >= 0.8 THEN 'rejected' ELSE 'pending' END;
  
  -- Update profile
  UPDATE profiles SET referred_by = v_referrer_id, referral_source = p_source WHERE id = p_referred_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'referrer_id', v_referrer_id,
    'fraud_score', v_fraud_score,
    'auto_rejected', v_fraud_score >= 0.8
  );
END;
$$;
