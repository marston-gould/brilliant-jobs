-- =============================================================
-- v8.97 — Cohort-Based Pricing Configuration
-- Session: COHORT-PRICING-S1
-- Purpose: pricing_defaults table, rewrite get_effective_pricing,
--          cohort assignment trigger, seed founding cohorts
-- =============================================================

-- ─── 1. pricing_defaults table ─────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_defaults (
  tier text PRIMARY KEY,
  name text NOT NULL,
  subscription_price_cents integer NOT NULL DEFAULT 0,
  included_credits integer NOT NULL DEFAULT 0,
  payg_rate_cents integer NOT NULL DEFAULT 25,
  max_saved_filters integer,        -- NULL = unlimited
  max_resumes integer,              -- NULL = unlimited
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  stripe_price_id text,
  display_order integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  scar_meta jsonb                   -- S-12 extensibility
);

-- Seed global defaults (matches current hardcoded values in billing.js)
INSERT INTO pricing_defaults (tier, name, subscription_price_cents, included_credits, payg_rate_cents, max_saved_filters, max_resumes, features, display_order) VALUES
  ('free',    'Free',    0,    0,   25, 1,    1,    '["1 saved filter","1 resume","Basic job feed"]'::jsonb, 0),
  ('starter', 'Starter', 2000, 100, 15, 10,   5,    '["10 saved filters","5 resumes","AI resume scoring","SMS notifications","Boolean search"]'::jsonb, 1),
  ('pro',     'Pro',     4000, 300, 10, NULL,  NULL, '["Unlimited filters","Unlimited resumes","AI resume scoring","AI resume rewrites","SMS notifications","Boolean search","Auto-apply","Network intelligence"]'::jsonb, 2),
  ('payl',    'Pay After You Land', 0, 300, 10, NULL, NULL, '["Full Pro features","Deferred payment","3 referral requirement"]'::jsonb, 3)
ON CONFLICT (tier) DO NOTHING;

-- updated_at trigger
CREATE OR REPLACE FUNCTION fn_pricing_defaults_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pricing_defaults_updated ON pricing_defaults;
CREATE TRIGGER trg_pricing_defaults_updated
  BEFORE UPDATE ON pricing_defaults
  FOR EACH ROW EXECUTE FUNCTION fn_pricing_defaults_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pricing_defaults_order ON pricing_defaults (display_order);

-- RLS: admin read/write, authenticated read
ALTER TABLE pricing_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pricing_defaults_admin_all ON pricing_defaults;
CREATE POLICY pricing_defaults_admin_all ON pricing_defaults
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

DROP POLICY IF EXISTS pricing_defaults_user_read ON pricing_defaults;
CREATE POLICY pricing_defaults_user_read ON pricing_defaults
  FOR SELECT USING (auth.role() = 'authenticated');


-- ─── 2. pricing_audit_log table ────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_by uuid REFERENCES auth.users(id),
  change_type text NOT NULL CHECK (change_type IN ('global_default','cohort_override','cohort_create','cohort_assign')),
  target_id text NOT NULL,           -- tier ID or cohort ID
  before_value jsonb,
  after_value jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_audit_created ON pricing_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pricing_audit_target ON pricing_audit_log (target_id);

ALTER TABLE pricing_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pricing_audit_admin ON pricing_audit_log;
CREATE POLICY pricing_audit_admin ON pricing_audit_log
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );


-- ─── 3. Rewrite get_effective_pricing ──────────────────────
CREATE OR REPLACE FUNCTION get_effective_pricing(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_plan text;
  v_cohort_id text;
  v_cohort_config jsonb;
  v_tier_override jsonb;
  v_defaults record;
  v_result jsonb;
  v_all_tiers jsonb;
  v_resolved_price int;
  v_resolved_credits int;
  v_resolved_payg int;
  v_promo_label text;
  v_promo_expires text;
BEGIN
  -- 1. Get user plan + cohort
  SELECT COALESCE(plan, 'free'), cohort_id
    INTO v_plan, v_cohort_id
    FROM profiles WHERE id = p_user_id;

  IF v_plan IS NULL THEN v_plan := 'free'; END IF;

  -- PAYL maps to pro for feature access
  IF v_plan = 'payl' THEN
    SELECT * INTO v_defaults FROM pricing_defaults WHERE tier = 'payl';
    IF NOT FOUND THEN
      SELECT * INTO v_defaults FROM pricing_defaults WHERE tier = 'pro';
    END IF;
  ELSE
    SELECT * INTO v_defaults FROM pricing_defaults WHERE tier = v_plan;
  END IF;

  -- Fallback if tier not in table
  IF NOT FOUND THEN
    SELECT * INTO v_defaults FROM pricing_defaults WHERE tier = 'free';
  END IF;

  -- 2. Start with global defaults
  v_resolved_price   := v_defaults.subscription_price_cents;
  v_resolved_credits := v_defaults.included_credits;
  v_resolved_payg    := v_defaults.payg_rate_cents;
  v_promo_label      := NULL;

  -- 3. Apply cohort override if present
  IF v_cohort_id IS NOT NULL THEN
    SELECT pricing_config INTO v_cohort_config
      FROM cohorts WHERE id = v_cohort_id AND is_active = true;

    IF v_cohort_config IS NOT NULL THEN
      v_tier_override := v_cohort_config -> v_plan;

      IF v_tier_override IS NOT NULL THEN
        -- Check promo expiry
        v_promo_expires := v_tier_override ->> 'promo_expires_at';
        IF v_promo_expires IS NOT NULL AND v_promo_expires::timestamptz < now() THEN
          v_tier_override := NULL;  -- Expired, skip overrides
        END IF;
      END IF;

      IF v_tier_override IS NOT NULL THEN
        IF v_tier_override ? 'subscription_price_cents' THEN
          v_resolved_price := (v_tier_override ->> 'subscription_price_cents')::int;
        END IF;
        IF v_tier_override ? 'included_credits' THEN
          v_resolved_credits := (v_tier_override ->> 'included_credits')::int;
        END IF;
        IF v_tier_override ? 'payg_rate_cents' THEN
          v_resolved_payg := (v_tier_override ->> 'payg_rate_cents')::int;
        END IF;
        v_promo_label := v_tier_override ->> 'promo_label';
      END IF;
    END IF;
  END IF;

  -- 4. Build all_tiers array (with cohort overrides applied per tier)
  SELECT jsonb_agg(
    jsonb_build_object(
      'tier', d.tier,
      'name', d.name,
      'subscription_price_cents',
        COALESCE(
          CASE WHEN v_cohort_config IS NOT NULL
               AND (v_cohort_config -> d.tier) IS NOT NULL
               AND (v_cohort_config -> d.tier) ? 'subscription_price_cents'
               AND (
                 (v_cohort_config -> d.tier ->> 'promo_expires_at') IS NULL
                 OR (v_cohort_config -> d.tier ->> 'promo_expires_at')::timestamptz >= now()
               )
          THEN (v_cohort_config -> d.tier ->> 'subscription_price_cents')::int
          ELSE NULL END,
          d.subscription_price_cents
        ),
      'included_credits',
        COALESCE(
          CASE WHEN v_cohort_config IS NOT NULL
               AND (v_cohort_config -> d.tier) IS NOT NULL
               AND (v_cohort_config -> d.tier) ? 'included_credits'
               AND (
                 (v_cohort_config -> d.tier ->> 'promo_expires_at') IS NULL
                 OR (v_cohort_config -> d.tier ->> 'promo_expires_at')::timestamptz >= now()
               )
          THEN (v_cohort_config -> d.tier ->> 'included_credits')::int
          ELSE NULL END,
          d.included_credits
        ),
      'payg_rate_cents',
        COALESCE(
          CASE WHEN v_cohort_config IS NOT NULL
               AND (v_cohort_config -> d.tier) IS NOT NULL
               AND (v_cohort_config -> d.tier) ? 'payg_rate_cents'
               AND (
                 (v_cohort_config -> d.tier ->> 'promo_expires_at') IS NULL
                 OR (v_cohort_config -> d.tier ->> 'promo_expires_at')::timestamptz >= now()
               )
          THEN (v_cohort_config -> d.tier ->> 'payg_rate_cents')::int
          ELSE NULL END,
          d.payg_rate_cents
        ),
      'max_saved_filters', d.max_saved_filters,
      'max_resumes', d.max_resumes,
      'features', d.features,
      'display_order', d.display_order,
      'is_visible', d.is_visible,
      'promo_label',
        CASE WHEN v_cohort_config IS NOT NULL
             AND (v_cohort_config -> d.tier) IS NOT NULL
             AND (
               (v_cohort_config -> d.tier ->> 'promo_expires_at') IS NULL
               OR (v_cohort_config -> d.tier ->> 'promo_expires_at')::timestamptz >= now()
             )
        THEN v_cohort_config -> d.tier ->> 'promo_label'
        ELSE NULL END
    ) ORDER BY d.display_order
  ) INTO v_all_tiers
  FROM pricing_defaults d
  WHERE d.is_visible = true;

  -- 5. Build response
  RETURN jsonb_build_object(
    'tier', v_plan,
    'cohort_id', v_cohort_id,
    'subscription_price_cents', v_resolved_price,
    'included_credits', v_resolved_credits,
    'payg_rate_cents', v_resolved_payg,
    'max_saved_filters', v_defaults.max_saved_filters,
    'max_resumes', v_defaults.max_resumes,
    'features', v_defaults.features,
    'promo_label', v_promo_label,
    'all_tiers', COALESCE(v_all_tiers, '[]'::jsonb)
  );
END;
$$;


-- ─── 4. Cohort assignment trigger ──────────────────────────
CREATE OR REPLACE FUNCTION fn_assign_signup_cohort()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_cohort_id text;
BEGIN
  -- Only assign if not already assigned
  IF NEW.cohort_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_cohort_id
    FROM cohorts
    WHERE criteria_type = 'signup_date_range'
      AND is_active = true
      AND (criteria_value ->> 'start')::timestamptz <= now()
      AND (criteria_value ->> 'end')::timestamptz > now()
    ORDER BY created_at DESC
    LIMIT 1;

  IF v_cohort_id IS NOT NULL THEN
    NEW.cohort_id := v_cohort_id;
    NEW.cohort_assigned_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_cohort_on_signup ON profiles;
CREATE TRIGGER trg_assign_cohort_on_signup
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION fn_assign_signup_cohort();


-- ─── 5. Admin RPC: update pricing default ──────────────────
CREATE OR REPLACE FUNCTION fn_update_pricing_default(
  p_tier text,
  p_subscription_price_cents integer DEFAULT NULL,
  p_included_credits integer DEFAULT NULL,
  p_payg_rate_cents integer DEFAULT NULL,
  p_features jsonb DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_is_visible boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
BEGIN
  -- Verify admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- Capture before state
  SELECT to_jsonb(d) INTO v_before FROM pricing_defaults d WHERE d.tier = p_tier;
  IF v_before IS NULL THEN
    RETURN jsonb_build_object('error', 'Tier not found');
  END IF;

  -- Apply updates (only non-null params)
  UPDATE pricing_defaults SET
    subscription_price_cents = COALESCE(p_subscription_price_cents, subscription_price_cents),
    included_credits = COALESCE(p_included_credits, included_credits),
    payg_rate_cents = COALESCE(p_payg_rate_cents, payg_rate_cents),
    features = COALESCE(p_features, features),
    name = COALESCE(p_name, name),
    is_visible = COALESCE(p_is_visible, is_visible)
  WHERE tier = p_tier;

  -- Capture after state
  SELECT to_jsonb(d) INTO v_after FROM pricing_defaults d WHERE d.tier = p_tier;

  -- Audit log
  INSERT INTO pricing_audit_log (changed_by, change_type, target_id, before_value, after_value)
  VALUES (auth.uid(), 'global_default', p_tier, v_before, v_after);

  RETURN jsonb_build_object('success', true, 'tier', p_tier);
END;
$$;


-- ─── 6. Admin RPC: update cohort pricing override ──────────
CREATE OR REPLACE FUNCTION fn_update_cohort_pricing(
  p_cohort_id text,
  p_pricing_config jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_before jsonb;
BEGIN
  -- Verify admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- Capture before
  SELECT pricing_config INTO v_before FROM cohorts WHERE id = p_cohort_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Cohort not found');
  END IF;

  -- Update
  UPDATE cohorts SET pricing_config = p_pricing_config WHERE id = p_cohort_id;

  -- Audit
  INSERT INTO pricing_audit_log (changed_by, change_type, target_id, before_value, after_value)
  VALUES (auth.uid(), 'cohort_override', p_cohort_id, v_before, p_pricing_config);

  RETURN jsonb_build_object('success', true, 'cohort_id', p_cohort_id);
END;
$$;


-- ─── 7. Admin RPC: create time-based cohort ────────────────
CREATE OR REPLACE FUNCTION fn_create_pricing_cohort(
  p_id text,
  p_name text,
  p_start timestamptz,
  p_end timestamptz,
  p_pricing_config jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Verify admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  INSERT INTO cohorts (id, name, criteria_type, criteria_value, pricing_config, is_active)
  VALUES (
    p_id, p_name, 'signup_date_range',
    jsonb_build_object('start', p_start::text, 'end', p_end::text),
    p_pricing_config, true
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    criteria_value = EXCLUDED.criteria_value,
    pricing_config = EXCLUDED.pricing_config;

  -- Audit
  INSERT INTO pricing_audit_log (changed_by, change_type, target_id, before_value, after_value)
  VALUES (auth.uid(), 'cohort_create', p_id, NULL, p_pricing_config);

  RETURN jsonb_build_object('success', true, 'cohort_id', p_id);
END;
$$;


-- ─── 8. Seed founding cohorts ──────────────────────────────
INSERT INTO cohorts (id, name, criteria_type, criteria_value, pricing_config, is_active)
VALUES (
  'founding',
  'Founding Members',
  'signup_date_range',
  '{"start": "2024-01-01T00:00:00Z", "end": "2026-06-01T00:00:00Z"}'::jsonb,
  '{
    "starter": {"subscription_price_cents": 1500, "included_credits": 150, "payg_rate_cents": 12, "promo_label": "Founding Member"},
    "pro": {"subscription_price_cents": 2999, "included_credits": 400, "payg_rate_cents": 8, "promo_label": "Founding Member"}
  }'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE SET
  pricing_config = EXCLUDED.pricing_config,
  criteria_value = EXCLUDED.criteria_value;

INSERT INTO cohorts (id, name, criteria_type, criteria_value, pricing_config, is_active)
VALUES (
  'early-bird',
  'Early Bird',
  'signup_date_range',
  '{"start": "2026-06-01T00:00:00Z", "end": "2026-09-01T00:00:00Z"}'::jsonb,
  '{
    "pro": {"subscription_price_cents": 3499, "included_credits": 350, "payg_rate_cents": 9, "promo_label": "Early Bird"}
  }'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE SET
  pricing_config = EXCLUDED.pricing_config,
  criteria_value = EXCLUDED.criteria_value;

INSERT INTO cohorts (id, name, criteria_type, criteria_value, pricing_config, is_active)
VALUES (
  'general-launch',
  'General Launch',
  'signup_date_range',
  '{"start": "2026-09-01T00:00:00Z", "end": "2027-01-01T00:00:00Z"}'::jsonb,
  '{}'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE SET
  pricing_config = EXCLUDED.pricing_config,
  criteria_value = EXCLUDED.criteria_value;


-- ─── 9. GRANTs ─────────────────────────────────────────────
GRANT SELECT ON pricing_defaults TO authenticated;
GRANT ALL ON pricing_defaults TO service_role;
GRANT SELECT ON pricing_audit_log TO authenticated;
GRANT ALL ON pricing_audit_log TO service_role;
GRANT EXECUTE ON FUNCTION get_effective_pricing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_update_pricing_default(text, integer, integer, integer, jsonb, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_update_cohort_pricing(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_create_pricing_cohort(text, text, timestamptz, timestamptz, jsonb) TO authenticated;
