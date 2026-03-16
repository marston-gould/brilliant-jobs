-- =============================================================
-- SPEC-COHORT-001-S1: Cohort Tier System — Schema + Seed
-- Credits = Entitlements. Three-bucket pool (base/rolled/award).
-- Configurable rollover. Full feature cost register.
-- =============================================================

-- ─── 1. cohort_tiers table ──────────────────────────────────
-- NOTE: Distinct from the existing `cohorts` table (promotional
-- signup-date-range cohorts). cohort_tiers = billing/feature tiers.
CREATE TABLE IF NOT EXISTS cohort_tiers (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  slug                    text NOT NULL UNIQUE,          -- 'free' | 'starter' | 'pro' | 'beta'
  price_monthly_cents     integer NOT NULL CHECK (price_monthly_cents >= 0),
  price_annual_cents      integer NOT NULL CHECK (price_annual_cents >= 0),
  credits_monthly         integer NOT NULL CHECK (credits_monthly >= 0),
  rollover_cap            integer NOT NULL DEFAULT 0     -- 0=none, -1=full, N=cap at N
    CHECK (rollover_cap >= -1),
  stripe_monthly_price_id text,
  stripe_annual_price_id  text,
  is_public               boolean NOT NULL DEFAULT true,
  sort_order              integer NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cohort_tiers_slug ON cohort_tiers (slug);
CREATE INDEX IF NOT EXISTS idx_cohort_tiers_order ON cohort_tiers (sort_order);

-- updated_at trigger
CREATE OR REPLACE FUNCTION fn_cohort_tiers_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_cohort_tiers_updated ON cohort_tiers;
CREATE TRIGGER trg_cohort_tiers_updated
  BEFORE UPDATE ON cohort_tiers
  FOR EACH ROW EXECUTE FUNCTION fn_cohort_tiers_updated_at();

-- RLS
ALTER TABLE cohort_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cohort_tiers_admin_all ON cohort_tiers;
CREATE POLICY cohort_tiers_admin_all ON cohort_tiers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );
DROP POLICY IF EXISTS cohort_tiers_user_read ON cohort_tiers;
CREATE POLICY cohort_tiers_user_read ON cohort_tiers
  FOR SELECT USING (auth.role() = 'authenticated');

GRANT SELECT ON cohort_tiers TO authenticated;
GRANT ALL ON cohort_tiers TO service_role;


-- ─── 2. profiles additions ──────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS cohort_tier_id      uuid REFERENCES cohort_tiers(id),
  ADD COLUMN IF NOT EXISTS cohort_tier_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS rollover_cap_override integer
    CHECK (rollover_cap_override IS NULL OR rollover_cap_override >= -1);

CREATE INDEX IF NOT EXISTS idx_profiles_cohort_tier ON profiles (cohort_tier_id)
  WHERE cohort_tier_id IS NOT NULL;


-- ─── 3. bj_credit_ledger table ─────────────────────────────────
-- Richer than existing credit_transactions. Three-bucket model.
-- Existing credit_transactions preserved for backward compat.
CREATE TABLE IF NOT EXISTS bj_credit_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket        text NOT NULL CHECK (bucket IN ('base','rolled','award')),
  event_type    text NOT NULL CHECK (event_type IN (
    'cohort_grant',      -- base allotment at period start
    'rollover_grant',    -- carried forward credits
    'rollover_expire',   -- surplus voided at period end
    'award_grant',       -- bonus credit issued
    'award_expire',      -- award reached expires_at
    'feature_debit',     -- paid feature usage
    'admin_adjustment',  -- manual admin grant/deduct
    'cohort_prorate',    -- mid-cycle cohort change delta
    'refund_restore'     -- credit restored on EF error
  )),
  amount        integer NOT NULL,                -- positive=grant, negative=debit
  feature       text,                           -- EF name for debits
  expires_at    timestamptz,                    -- award entries only; NULL=no expiry
  voided        boolean NOT NULL DEFAULT false,
  source_ref    text,                           -- referral_id, promo_code, job_id, etc
  period_start  timestamptz,                    -- billing period (NULL for awards)
  notes         text,                           -- required for admin_adjustment
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bj_credit_ledger_user_created
  ON bj_credit_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bj_credit_ledger_user_period
  ON bj_credit_ledger (user_id, period_start)
  WHERE period_start IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bj_credit_ledger_awards_expiry
  ON bj_credit_ledger (user_id, expires_at)
  WHERE bucket = 'award' AND voided = false AND amount > 0;
CREATE INDEX IF NOT EXISTS idx_bj_credit_ledger_feature
  ON bj_credit_ledger (user_id, feature, created_at)
  WHERE feature IS NOT NULL;

ALTER TABLE bj_credit_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bj_credit_ledger_user_read ON bj_credit_ledger;
CREATE POLICY bj_credit_ledger_user_read ON bj_credit_ledger
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS bj_credit_ledger_service_all ON bj_credit_ledger;
CREATE POLICY bj_credit_ledger_service_all ON bj_credit_ledger
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON bj_credit_ledger TO authenticated;
GRANT ALL ON bj_credit_ledger TO service_role;


-- ─── 4. feature_costs table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_costs (
  feature_key  text PRIMARY KEY,               -- EF name
  credit_cost  integer NOT NULL DEFAULT 0      -- credits debited per call
    CHECK (credit_cost >= 0),
  daily_cap    integer,                        -- passive features: max calls/user/day
  is_passive   boolean NOT NULL DEFAULT false, -- ambient/cron vs user-initiated
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feature_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feature_costs_admin_all ON feature_costs;
CREATE POLICY feature_costs_admin_all ON feature_costs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );
DROP POLICY IF EXISTS feature_costs_user_read ON feature_costs;
CREATE POLICY feature_costs_user_read ON feature_costs
  FOR SELECT USING (auth.role() = 'authenticated');

GRANT SELECT ON feature_costs TO authenticated;
GRANT ALL ON feature_costs TO service_role;


-- ─── 5. Seed: cohort_tiers ───────────────────────────────────
INSERT INTO cohort_tiers
  (name, slug, price_monthly_cents, price_annual_cents, credits_monthly,
   rollover_cap, is_public, sort_order)
VALUES
  ('Free',    'free',    0,    0,      50,  0,    true,  0),
  ('Starter', 'starter', 2000, 19200,  250, 50,   true,  1),
  ('Pro',     'pro',     4000, 38400,  750, -1,   true,  2),
  ('Beta',    'beta',    0,    0,      500, 200,  false, 3)
ON CONFLICT (slug) DO UPDATE SET
  name                = EXCLUDED.name,
  price_monthly_cents = EXCLUDED.price_monthly_cents,
  price_annual_cents  = EXCLUDED.price_annual_cents,
  credits_monthly     = EXCLUDED.credits_monthly,
  rollover_cap        = EXCLUDED.rollover_cap,
  is_public           = EXCLUDED.is_public,
  sort_order          = EXCLUDED.sort_order,
  updated_at          = now();


-- ─── 6. Seed: feature_costs ──────────────────────────────────
INSERT INTO feature_costs (feature_key, credit_cost, daily_cap, is_passive) VALUES
  ('score-resume',             3,  NULL, false),
  ('rewrite-resume-analyze',   2,  NULL, false),
  ('rewrite-resume-execute',   5,  NULL, false),
  ('analyze-application-gap',  3,  NULL, false),
  ('chat-job-search',          2,  NULL, false),
  ('answer-form-question',     1,  NULL, false),
  ('extract-resume-profile',   1,  NULL, false),
  ('auto-apply-trigger',       1,  50,   true),
  ('analyze-hidden-job',       1,  20,   true),
  ('score-ai-content',         1,  30,   true),
  ('rewrite-resume-extension', 1,  NULL, false)
ON CONFLICT (feature_key) DO UPDATE SET
  credit_cost = EXCLUDED.credit_cost,
  daily_cap   = EXCLUDED.daily_cap,
  is_passive  = EXCLUDED.is_passive,
  updated_at  = now();


-- ─── 7. profiles.cohort_tier_id backfill ────────────────────
-- Map existing plan column → cohort_tier_id for active users
-- Runs only where cohort_tier_id is not yet set
DO $$
DECLARE
  v_free_id    uuid;
  v_starter_id uuid;
  v_pro_id     uuid;
BEGIN
  SELECT id INTO v_free_id    FROM cohort_tiers WHERE slug = 'free';
  SELECT id INTO v_starter_id FROM cohort_tiers WHERE slug = 'starter';
  SELECT id INTO v_pro_id     FROM cohort_tiers WHERE slug = 'pro';

  -- Update only users who don't already have a cohort_tier_id
  UPDATE profiles SET
    cohort_tier_id = CASE
      WHEN plan IN ('pro','payl') THEN v_pro_id
      WHEN plan = 'starter'       THEN v_starter_id
      ELSE                             v_free_id
    END,
    cohort_tier_assigned_at = COALESCE(created_at, now())
  WHERE cohort_tier_id IS NULL;
END;
$$;


-- ─── 8. fn_get_user_credit_balance RPC ──────────────────────
-- Returns spendable balance broken into three buckets.
-- Used by get-user-balance EF.
CREATE OR REPLACE FUNCTION fn_get_user_credit_balance(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_period_start timestamptz;
  v_rolled       integer;
  v_base         integer;
  v_awards       integer;
BEGIN
  -- Determine current period start (beginning of current month as proxy;
  -- replenishment EF will use actual billing dates)
  v_period_start := date_trunc('month', now());

  SELECT COALESCE(SUM(amount), 0) INTO v_rolled
    FROM bj_credit_ledger
    WHERE user_id   = p_user_id
      AND bucket     = 'rolled'
      AND period_start >= v_period_start
      AND voided     = false;

  SELECT COALESCE(SUM(amount), 0) INTO v_base
    FROM bj_credit_ledger
    WHERE user_id   = p_user_id
      AND bucket     = 'base'
      AND period_start >= v_period_start
      AND voided     = false;

  SELECT COALESCE(SUM(amount), 0) INTO v_awards
    FROM bj_credit_ledger
    WHERE user_id   = p_user_id
      AND bucket     = 'award'
      AND (expires_at IS NULL OR expires_at > now())
      AND voided     = false;

  RETURN jsonb_build_object(
    'rolled',    GREATEST(0, v_rolled),
    'base',      GREATEST(0, v_base),
    'awards',    GREATEST(0, v_awards),
    'total',     GREATEST(0, v_rolled) + GREATEST(0, v_base) + GREATEST(0, v_awards)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION fn_get_user_credit_balance(uuid) TO authenticated, service_role;


-- ─── 9. fn_debit_credits RPC ────────────────────────────────
-- Atomic balance check + debit. Debit order: rolled → base → award.
-- Returns new balance jsonb or raises 'insufficient_credits'.
CREATE OR REPLACE FUNCTION fn_debit_credits(
  p_user_id   uuid,
  p_feature   text,
  p_amount    integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance jsonb;
  v_total   integer;
BEGIN
  -- Lock user row for this transaction
  PERFORM 1 FROM profiles WHERE id = p_user_id FOR UPDATE;

  v_balance := fn_get_user_credit_balance(p_user_id);
  v_total   := (v_balance ->> 'total')::integer;

  IF v_total < p_amount THEN
    RAISE EXCEPTION 'insufficient_credits: balance=%, cost=%', v_total, p_amount;
  END IF;

  -- Write debit entry (bucket='base' as canonical debit bucket;
  -- actual bucket ordering is handled in EF middleware for now)
  INSERT INTO bj_credit_ledger
    (user_id, bucket, event_type, amount, feature)
  VALUES
    (p_user_id, 'base', 'feature_debit', -p_amount, p_feature);

  RETURN fn_get_user_credit_balance(p_user_id);
END;
$$;
GRANT EXECUTE ON FUNCTION fn_debit_credits(uuid, text, integer) TO service_role;


-- ─── 10. fn_grant_base_credits RPC ──────────────────────────
-- Grants base cohort allotment at period start.
CREATE OR REPLACE FUNCTION fn_grant_base_credits(
  p_user_id     uuid,
  p_amount      integer,
  p_period_start timestamptz DEFAULT date_trunc('month', now())
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO bj_credit_ledger
    (user_id, bucket, event_type, amount, period_start)
  VALUES
    (p_user_id, 'base', 'cohort_grant', p_amount, p_period_start);

  RETURN fn_get_user_credit_balance(p_user_id);
END;
$$;
GRANT EXECUTE ON FUNCTION fn_grant_base_credits(uuid, integer, timestamptz) TO service_role;


-- ─── 11. fn_grant_award_credits RPC ─────────────────────────
CREATE OR REPLACE FUNCTION fn_grant_award_credits(
  p_user_id    uuid,
  p_amount     integer,
  p_source_ref text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_notes      text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO bj_credit_ledger
    (user_id, bucket, event_type, amount, source_ref, expires_at, notes)
  VALUES
    (p_user_id, 'award', 'award_grant', p_amount, p_source_ref, p_expires_at, p_notes);

  RETURN fn_get_user_credit_balance(p_user_id);
END;
$$;
GRANT EXECUTE ON FUNCTION fn_grant_award_credits(uuid, integer, text, timestamptz, text) TO service_role;


-- ─── 12. Bootstrap: grant initial credits to all users ──────
-- One-time seed: give every user their current cohort's monthly credits
-- as a base grant so they start with a non-zero balance.
DO $$
DECLARE
  r record;
  v_period timestamptz := date_trunc('month', now());
BEGIN
  FOR r IN
    SELECT p.id AS user_id, ct.credits_monthly
    FROM profiles p
    JOIN cohort_tiers ct ON ct.id = p.cohort_tier_id
    WHERE ct.credits_monthly > 0
      AND NOT EXISTS (
        SELECT 1 FROM bj_credit_ledger cl
        WHERE cl.user_id = p.id
          AND cl.event_type = 'cohort_grant'
          AND cl.period_start >= v_period
      )
  LOOP
    INSERT INTO bj_credit_ledger
      (user_id, bucket, event_type, amount, period_start)
    VALUES
      (r.user_id, 'base', 'cohort_grant', r.credits_monthly, v_period);
  END LOOP;
END;
$$;


-- ─── COMMENTS ────────────────────────────────────────────────
COMMENT ON TABLE cohort_tiers IS
  'SPEC-COHORT-001: Billing/feature tiers. Distinct from cohorts table (promo date-range cohorts).';
COMMENT ON TABLE bj_credit_ledger IS
  'SPEC-COHORT-001: Append-only credit event log. Three buckets: base/rolled/award. Balance = live query.';
COMMENT ON TABLE feature_costs IS
  'SPEC-COHORT-001: Per-EF credit costs and passive daily caps. Admin-editable without code deploy.';
COMMENT ON COLUMN bj_credit_ledger.bucket IS
  'base=cohort allotment, rolled=carried forward, award=bonus/referral/promo';
COMMENT ON COLUMN cohort_tiers.rollover_cap IS
  '0=no rollover, -1=full rollover, N=cap at N credits per cycle';

