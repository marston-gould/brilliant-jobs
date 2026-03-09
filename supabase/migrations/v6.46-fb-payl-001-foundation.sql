-- ============================================================================
-- FB-PAYL-S1: Pay After You Land — Foundation Migration
-- ============================================================================
-- Tables: payl_enrollments, payl_referrals
-- Storage: linkedin-profiles bucket
-- Functions: fn_payl_enrollment_status, fn_payl_check_referral_qualification,
--            fn_payl_expiry_check, fn_payl_summary
-- Views: v_payl_dashboard
-- Feature flag: payl_tier_enabled
-- pg_cron: daily expiry check
-- ============================================================================

-- ── Feature Flag ────────────────────────────────────────────────────────────
INSERT INTO feature_flags (id, description, enabled, rollout_pct)
VALUES (
  'payl_tier_enabled',
  'FB-PAYL-001: Pay After You Land pricing tier. Gates PAYL enrollment flow, referral tracking, and LinkedIn PDF upload.',
  false,
  0
) ON CONFLICT (id) DO NOTHING;

-- ── Table: payl_enrollments ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payl_enrollments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status                 text NOT NULL DEFAULT 'pending_pdf'
                         CHECK (status IN ('pending_pdf', 'pending_referrals', 'active', 'converted', 'expired', 'revoked')),
  linkedin_pdf_path      text,
  linkedin_pdf_hash      text UNIQUE,
  parsed_profile         jsonb DEFAULT '{}'::jsonb,
  referral_code          text NOT NULL UNIQUE,
  referrals_qualified    integer NOT NULL DEFAULT 0 CHECK (referrals_qualified >= 0 AND referrals_qualified <= 10),
  activated_at           timestamptz,
  expires_at             timestamptz,
  converted_at           timestamptz,
  stripe_setup_intent_id text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  -- Scar: S-12 custom_metrics for future analytics extensions
  scar_meta              jsonb DEFAULT '{}'::jsonb,

  CONSTRAINT uq_payl_user UNIQUE (user_id)
);

COMMENT ON TABLE payl_enrollments IS 'FB-PAYL-001: Pay After You Land enrollment tracking. One enrollment per user.';
COMMENT ON COLUMN payl_enrollments.linkedin_pdf_hash IS 'SHA-256 hash of raw PDF for dedup. Same file cannot be used by multiple accounts.';
COMMENT ON COLUMN payl_enrollments.referral_code IS 'Unique 8-char alphanumeric code for referral link: brilliantjobs.app/r/{code}';
COMMENT ON COLUMN payl_enrollments.scar_meta IS 'S-12 scar: extensible metadata for future analytics/ML features';

-- ── Table: payl_referrals ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payl_referrals (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payl_enrollment_id     uuid NOT NULL REFERENCES payl_enrollments(id) ON DELETE CASCADE,
  referred_user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status                 text NOT NULL DEFAULT 'signed_up'
                         CHECK (status IN ('signed_up', 'subscribed', 'qualified', 'revoked')),
  subscribed_at          timestamptz,
  qualified_at           timestamptz,
  revoked_at             timestamptz,
  revoke_reason          text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  -- Fraud detection metadata
  signup_ip              text,
  signup_device_hash     text,
  payment_method_hash    text,

  -- Scar: S-12 custom_metrics
  scar_meta              jsonb DEFAULT '{}'::jsonb,

  CONSTRAINT uq_payl_referral_user UNIQUE (payl_enrollment_id, referred_user_id)
);

COMMENT ON TABLE payl_referrals IS 'FB-PAYL-001: Tracks individual referrals for PAYL enrollment qualification.';
COMMENT ON COLUMN payl_referrals.signup_ip IS 'Anti-gaming: IP at referral signup for self-referral detection';
COMMENT ON COLUMN payl_referrals.signup_device_hash IS 'Anti-gaming: Device fingerprint hash for self-referral detection';
COMMENT ON COLUMN payl_referrals.payment_method_hash IS 'Anti-gaming: Payment method hash — same card across referrals = suspicious';

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payl_enrollments_user_id ON payl_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_payl_enrollments_status ON payl_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_payl_enrollments_referral_code ON payl_enrollments(referral_code);
CREATE INDEX IF NOT EXISTS idx_payl_enrollments_expires_at ON payl_enrollments(expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_payl_enrollments_pdf_hash ON payl_enrollments(linkedin_pdf_hash) WHERE linkedin_pdf_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payl_referrals_enrollment_id ON payl_referrals(payl_enrollment_id);
CREATE INDEX IF NOT EXISTS idx_payl_referrals_referred_user ON payl_referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_payl_referrals_status ON payl_referrals(status);

-- ── Updated_at Triggers ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_payl_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payl_enrollments_updated_at
  BEFORE UPDATE ON payl_enrollments
  FOR EACH ROW EXECUTE FUNCTION fn_payl_updated_at();

CREATE TRIGGER trg_payl_referrals_updated_at
  BEFORE UPDATE ON payl_referrals
  FOR EACH ROW EXECUTE FUNCTION fn_payl_updated_at();

-- ── RLS Policies ────────────────────────────────────────────────────────────
ALTER TABLE payl_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payl_referrals ENABLE ROW LEVEL SECURITY;

-- Users can read their own enrollment
CREATE POLICY payl_enrollments_user_read ON payl_enrollments
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can manage all enrollments
CREATE POLICY payl_enrollments_service_all ON payl_enrollments
  FOR ALL USING (auth.role() = 'service_role');

-- Users can read referrals for their own enrollment
CREATE POLICY payl_referrals_user_read ON payl_referrals
  FOR SELECT USING (
    payl_enrollment_id IN (
      SELECT id FROM payl_enrollments WHERE user_id = auth.uid()
    )
  );

-- Service role can manage all referrals
CREATE POLICY payl_referrals_service_all ON payl_referrals
  FOR ALL USING (auth.role() = 'service_role');

-- ── Storage Bucket ──────────────────────────────────────────────────────────
-- Note: Bucket creation via Supabase Dashboard or CLI. Migration creates the
-- policy structure. Bucket: linkedin-profiles (private, 10MB limit, PDF only)
-- Path pattern: {user_id}/linkedin-profile.pdf

-- ── Function: fn_payl_generate_referral_code ────────────────────────────────
CREATE OR REPLACE FUNCTION fn_payl_generate_referral_code()
RETURNS text AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  LOOP
    -- Generate 8-char alphanumeric code
    new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    SELECT EXISTS(SELECT 1 FROM payl_enrollments WHERE referral_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  RETURN new_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_payl_generate_referral_code IS 'Generates unique 8-char referral code for PAYL enrollment. Collision-safe via loop.';

-- ── Function: fn_payl_enroll ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_payl_enroll(p_user_id uuid)
RETURNS jsonb AS $$
DECLARE
  existing_enrollment payl_enrollments;
  new_code text;
  new_enrollment payl_enrollments;
BEGIN
  -- Check for existing enrollment
  SELECT * INTO existing_enrollment FROM payl_enrollments WHERE user_id = p_user_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User already has a PAYL enrollment',
      'enrollment_id', existing_enrollment.id,
      'status', existing_enrollment.status
    );
  END IF;

  -- Generate unique referral code
  new_code := fn_payl_generate_referral_code();

  -- Create enrollment
  INSERT INTO payl_enrollments (user_id, referral_code, status)
  VALUES (p_user_id, new_code, 'pending_pdf')
  RETURNING * INTO new_enrollment;

  RETURN jsonb_build_object(
    'success', true,
    'enrollment_id', new_enrollment.id,
    'referral_code', new_enrollment.referral_code,
    'status', new_enrollment.status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_payl_enroll IS 'Creates PAYL enrollment for user. Returns existing enrollment if already enrolled.';

-- ── Function: fn_payl_activate ──────────────────────────────────────────────
-- Called after LinkedIn PDF is parsed AND referral gate is met
CREATE OR REPLACE FUNCTION fn_payl_activate(p_enrollment_id uuid)
RETURNS jsonb AS $$
DECLARE
  enrollment payl_enrollments;
BEGIN
  SELECT * INTO enrollment FROM payl_enrollments WHERE id = p_enrollment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enrollment not found');
  END IF;

  -- Must have PDF uploaded
  IF enrollment.linkedin_pdf_hash IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'LinkedIn PDF not yet uploaded');
  END IF;

  -- Must have 3 qualified referrals
  IF enrollment.referrals_qualified < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Need 3 qualified referrals, have ' || enrollment.referrals_qualified);
  END IF;

  -- Activate
  UPDATE payl_enrollments
  SET status = 'active',
      activated_at = now(),
      expires_at = now() + interval '180 days'
  WHERE id = p_enrollment_id AND status IN ('pending_pdf', 'pending_referrals');

  RETURN jsonb_build_object(
    'success', true,
    'status', 'active',
    'activated_at', now(),
    'expires_at', now() + interval '180 days'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Function: fn_payl_record_pdf ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_payl_record_pdf(
  p_enrollment_id uuid,
  p_pdf_path text,
  p_pdf_hash text,
  p_parsed_profile jsonb
)
RETURNS jsonb AS $$
DECLARE
  hash_exists boolean;
  enrollment payl_enrollments;
BEGIN
  -- Check hash dedup
  SELECT EXISTS(
    SELECT 1 FROM payl_enrollments
    WHERE linkedin_pdf_hash = p_pdf_hash AND id != p_enrollment_id
  ) INTO hash_exists;

  IF hash_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This LinkedIn PDF has already been used by another account',
      'fraud_signal', 'duplicate_pdf'
    );
  END IF;

  -- Update enrollment
  UPDATE payl_enrollments
  SET linkedin_pdf_path = p_pdf_path,
      linkedin_pdf_hash = p_pdf_hash,
      parsed_profile = p_parsed_profile,
      status = CASE
        WHEN referrals_qualified >= 3 THEN 'active'
        ELSE 'pending_referrals'
      END,
      activated_at = CASE
        WHEN referrals_qualified >= 3 THEN now()
        ELSE activated_at
      END,
      expires_at = CASE
        WHEN referrals_qualified >= 3 THEN now() + interval '180 days'
        ELSE expires_at
      END
  WHERE id = p_enrollment_id AND status = 'pending_pdf'
  RETURNING * INTO enrollment;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enrollment not in pending_pdf status');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', enrollment.status,
    'parsed_fields', (SELECT count(*) FROM jsonb_object_keys(p_parsed_profile))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Function: fn_payl_qualify_referral ───────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_payl_qualify_referral(p_referral_id uuid)
RETURNS jsonb AS $$
DECLARE
  ref payl_referrals;
  enrollment payl_enrollments;
  new_qualified_count integer;
BEGIN
  SELECT * INTO ref FROM payl_referrals WHERE id = p_referral_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referral not found');
  END IF;

  IF ref.status != 'subscribed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referral not in subscribed status');
  END IF;

  -- Qualify the referral
  UPDATE payl_referrals
  SET status = 'qualified', qualified_at = now()
  WHERE id = p_referral_id;

  -- Increment parent enrollment count
  UPDATE payl_enrollments
  SET referrals_qualified = referrals_qualified + 1
  WHERE id = ref.payl_enrollment_id
  RETURNING referrals_qualified INTO new_qualified_count;

  -- Check if auto-activation should fire (PDF uploaded + 3 qualified)
  SELECT * INTO enrollment FROM payl_enrollments WHERE id = ref.payl_enrollment_id;
  IF enrollment.linkedin_pdf_hash IS NOT NULL AND new_qualified_count >= 3 AND enrollment.status = 'pending_referrals' THEN
    UPDATE payl_enrollments
    SET status = 'active',
        activated_at = now(),
        expires_at = now() + interval '180 days'
    WHERE id = ref.payl_enrollment_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'referrals_qualified', new_qualified_count,
    'enrollment_status', (SELECT status FROM payl_enrollments WHERE id = ref.payl_enrollment_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Function: fn_payl_revoke_referral ───────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_payl_revoke_referral(p_referral_id uuid, p_reason text DEFAULT 'subscription_cancelled')
RETURNS jsonb AS $$
DECLARE
  ref payl_referrals;
  was_qualified boolean;
BEGIN
  SELECT * INTO ref FROM payl_referrals WHERE id = p_referral_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referral not found');
  END IF;

  was_qualified := (ref.status = 'qualified');

  UPDATE payl_referrals
  SET status = 'revoked', revoked_at = now(), revoke_reason = p_reason
  WHERE id = p_referral_id;

  -- Decrement qualified count if was previously qualified
  IF was_qualified THEN
    UPDATE payl_enrollments
    SET referrals_qualified = GREATEST(referrals_qualified - 1, 0)
    WHERE id = ref.payl_enrollment_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'was_qualified', was_qualified,
    'referral_status', 'revoked'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Function: fn_payl_expiry_check ──────────────────────────────────────────
-- Called by pg_cron daily. Expires overdue PAYL enrollments.
CREATE OR REPLACE FUNCTION fn_payl_expiry_check()
RETURNS jsonb AS $$
DECLARE
  expired_count integer;
  expiring_soon_count integer;
BEGIN
  -- Expire active enrollments past their window
  UPDATE payl_enrollments
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at < now();
  GET DIAGNOSTICS expired_count = ROW_COUNT;

  -- Count those expiring within 15 days (for notification)
  SELECT count(*) INTO expiring_soon_count
  FROM payl_enrollments
  WHERE status = 'active'
    AND expires_at BETWEEN now() AND now() + interval '15 days';

  RETURN jsonb_build_object(
    'expired', expired_count,
    'expiring_soon_15d', expiring_soon_count,
    'checked_at', now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Function: fn_payl_convert ───────────────────────────────────────────────
-- Called when PAYL user self-reports employment or auto-converts at expiry
CREATE OR REPLACE FUNCTION fn_payl_convert(p_enrollment_id uuid)
RETURNS jsonb AS $$
DECLARE
  enrollment payl_enrollments;
BEGIN
  UPDATE payl_enrollments
  SET status = 'converted', converted_at = now()
  WHERE id = p_enrollment_id AND status = 'active'
  RETURNING * INTO enrollment;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enrollment not active or not found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'converted_at', enrollment.converted_at,
    'days_active', EXTRACT(DAY FROM enrollment.converted_at - enrollment.activated_at)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Function: fn_payl_summary ───────────────────────────────────────────────
-- Admin summary for dashboard
CREATE OR REPLACE FUNCTION fn_payl_summary()
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_enrollments', count(*),
    'pending_pdf', count(*) FILTER (WHERE status = 'pending_pdf'),
    'pending_referrals', count(*) FILTER (WHERE status = 'pending_referrals'),
    'active', count(*) FILTER (WHERE status = 'active'),
    'converted', count(*) FILTER (WHERE status = 'converted'),
    'expired', count(*) FILTER (WHERE status = 'expired'),
    'revoked', count(*) FILTER (WHERE status = 'revoked'),
    'total_referrals', (SELECT count(*) FROM payl_referrals),
    'qualified_referrals', (SELECT count(*) FROM payl_referrals WHERE status = 'qualified'),
    'avg_days_to_qualify', (
      SELECT round(avg(EXTRACT(EPOCH FROM qualified_at - created_at) / 86400)::numeric, 1)
      FROM payl_referrals WHERE status = 'qualified'
    ),
    'conversion_rate', CASE
      WHEN count(*) FILTER (WHERE status IN ('active', 'converted', 'expired')) > 0
      THEN round(
        count(*) FILTER (WHERE status = 'converted')::numeric /
        count(*) FILTER (WHERE status IN ('active', 'converted', 'expired'))::numeric * 100, 1
      )
      ELSE 0
    END,
    'checked_at', now()
  ) INTO result
  FROM payl_enrollments;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── View: v_payl_dashboard ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_payl_dashboard AS
SELECT
  e.id AS enrollment_id,
  e.user_id,
  e.status,
  e.referral_code,
  e.referrals_qualified,
  e.activated_at,
  e.expires_at,
  e.converted_at,
  e.linkedin_pdf_hash IS NOT NULL AS has_pdf,
  e.stripe_setup_intent_id IS NOT NULL AS has_payment_method,
  CASE
    WHEN e.expires_at IS NOT NULL THEN
      GREATEST(0, EXTRACT(DAY FROM e.expires_at - now())::integer)
    ELSE NULL
  END AS days_remaining,
  e.created_at,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id,
      'referred_user_id', r.referred_user_id,
      'status', r.status,
      'subscribed_at', r.subscribed_at,
      'qualified_at', r.qualified_at
    ) ORDER BY r.created_at)
    FROM payl_referrals r
    WHERE r.payl_enrollment_id = e.id
  ) AS referrals
FROM payl_enrollments e;

COMMENT ON VIEW v_payl_dashboard IS 'FB-PAYL-001: Dashboard view for PAYL enrollment status + referral details';

-- ── pg_cron: Daily Expiry Check ─────────────────────────────────────────────
SELECT cron.schedule(
  'payl-expiry-check',
  '0 6 * * *',  -- 6 AM UTC daily
  $$SELECT fn_payl_expiry_check()$$
);

-- ── Event Bus Integration (H-02) ────────────────────────────────────────────
-- PAYL lifecycle events published to event bus for webhook subscribers
-- Events: payl.enrolled, payl.pdf_uploaded, payl.referral_qualified,
--         payl.activated, payl.converted, payl.expired
-- Implementation: Edge Functions call fn_publish_event() after state changes

-- ── Log migration event (conditional — agent_action_log may not exist) ──────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_action_log') THEN
    INSERT INTO agent_action_log (agent_id, action_type, action_payload, result_summary)
    SELECT id, 'migration', '{"migration": "v6.46-fb-payl-001-foundation"}'::jsonb,
      'FB-PAYL-S1: payl_enrollments + payl_referrals tables, 8 indexes, 4 RLS policies, 8 functions, 1 view, 1 feature flag, 1 pg_cron'
    FROM agent_config WHERE agent_key = 'system' LIMIT 1;
  END IF;
END $$;
