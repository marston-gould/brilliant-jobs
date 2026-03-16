-- =============================================================
-- SPEC-COHORT-001-REM: Cohort & Credit System Remediation
-- Closes all 15 gaps identified in post-delivery audit.
-- =============================================================

-- ─── GAP-1 (P0): fn_debit_credits — correct bucket debit order ────────────
-- Spec §1.1 + §4.2: Rolled → Base → Award (oldest expiry first).
-- Previous implementation always debited from bucket='base'.
CREATE OR REPLACE FUNCTION fn_debit_credits(
  p_user_id   uuid,
  p_feature   text,
  p_amount    integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance   jsonb;
  v_total     integer;
  v_remaining integer;
  v_rolled    integer;
  v_base      integer;
  v_awards    integer;
  r           record;
BEGIN
  -- Lock user row for atomic check+debit
  PERFORM 1 FROM profiles WHERE id = p_user_id FOR UPDATE;

  v_balance := fn_get_user_credit_balance(p_user_id);
  v_total   := (v_balance ->> 'total')::integer;

  IF v_total < p_amount THEN
    RAISE EXCEPTION 'insufficient_credits: balance=%, cost=%', v_total, p_amount;
  END IF;

  v_remaining := p_amount;

  -- Step 1: Drain rolled bucket first
  v_rolled := (v_balance ->> 'rolled')::integer;
  IF v_rolled > 0 AND v_remaining > 0 THEN
    DECLARE v_drain integer := LEAST(v_rolled, v_remaining);
    BEGIN
      INSERT INTO bj_credit_ledger (user_id, bucket, event_type, amount, feature)
        VALUES (p_user_id, 'rolled', 'feature_debit', -v_drain, p_feature);
      v_remaining := v_remaining - v_drain;
    END;
  END IF;

  -- Step 2: Drain base bucket
  v_base := (v_balance ->> 'base')::integer;
  IF v_base > 0 AND v_remaining > 0 THEN
    DECLARE v_drain integer := LEAST(v_base, v_remaining);
    BEGIN
      INSERT INTO bj_credit_ledger (user_id, bucket, event_type, amount, feature)
        VALUES (p_user_id, 'base', 'feature_debit', -v_drain, p_feature);
      v_remaining := v_remaining - v_drain;
    END;
  END IF;

  -- Step 3: Drain award entries oldest-expiry-first
  IF v_remaining > 0 THEN
    FOR r IN
      SELECT id, amount
      FROM bj_credit_ledger
      WHERE user_id   = p_user_id
        AND bucket     = 'award'
        AND event_type = 'award_grant'
        AND voided     = false
        AND amount     > 0
        AND (expires_at IS NULL OR expires_at > now())
        -- Not yet fully offset by award_expire entries
        AND NOT EXISTS (
          SELECT 1 FROM bj_credit_ledger child
          WHERE child.source_ref = bj_credit_ledger.id::text
            AND child.event_type = 'award_expire'
            AND child.voided     = false
        )
      ORDER BY COALESCE(expires_at, '9999-12-31'::timestamptz) ASC
    LOOP
      EXIT WHEN v_remaining <= 0;
      DECLARE v_drain integer := LEAST(r.amount, v_remaining);
      BEGIN
        INSERT INTO bj_credit_ledger (user_id, bucket, event_type, amount, feature, source_ref)
          VALUES (p_user_id, 'award', 'feature_debit', -v_drain, p_feature, r.id::text);
        v_remaining := v_remaining - v_drain;
      END;
    END LOOP;
  END IF;

  RETURN fn_get_user_credit_balance(p_user_id);
END;
$$;
GRANT EXECUTE ON FUNCTION fn_debit_credits(uuid, text, integer) TO service_role;
COMMENT ON FUNCTION fn_debit_credits IS
  'SPEC-COHORT-001-REM: Fixed debit order: rolled → base → award (oldest expiry first). §1.1 §4.2';


-- ─── GAP-6 (P1): operational cap columns on cohort_tiers ────────────────────
-- Spec §3.3 + §6: max_auto_apply_daily, max_saved_jobs, max_pipeline_items,
-- max_recruiter_lookups_daily, csv_export_enabled, api_access_enabled
ALTER TABLE cohort_tiers
  ADD COLUMN IF NOT EXISTS max_auto_apply_daily     integer,   -- NULL = unlimited
  ADD COLUMN IF NOT EXISTS max_saved_jobs           integer,   -- NULL = unlimited
  ADD COLUMN IF NOT EXISTS max_pipeline_items       integer,   -- NULL = unlimited
  ADD COLUMN IF NOT EXISTS max_recruiter_lookups_daily integer, -- NULL = unlimited
  ADD COLUMN IF NOT EXISTS csv_export_enabled       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS api_access_enabled       boolean NOT NULL DEFAULT false;

-- Seed per-spec §6 values
UPDATE cohort_tiers SET
  max_auto_apply_daily          = 0,
  max_saved_jobs                = 50,
  max_pipeline_items            = 50,
  max_recruiter_lookups_daily   = 0,
  csv_export_enabled            = false,
  api_access_enabled            = false
WHERE slug = 'free';

UPDATE cohort_tiers SET
  max_auto_apply_daily          = 10,
  max_saved_jobs                = 500,
  max_pipeline_items            = 500,
  max_recruiter_lookups_daily   = 5,
  csv_export_enabled            = true,
  api_access_enabled            = false
WHERE slug = 'starter';

UPDATE cohort_tiers SET
  max_auto_apply_daily          = 50,
  max_saved_jobs                = NULL,
  max_pipeline_items            = NULL,
  max_recruiter_lookups_daily   = 25,
  csv_export_enabled            = true,
  api_access_enabled            = true
WHERE slug = 'pro';

UPDATE cohort_tiers SET
  max_auto_apply_daily          = 50,
  max_saved_jobs                = NULL,
  max_pipeline_items            = NULL,
  max_recruiter_lookups_daily   = 25,
  csv_export_enabled            = true,
  api_access_enabled            = true
WHERE slug = 'beta';

COMMENT ON COLUMN cohort_tiers.max_auto_apply_daily IS
  'SPEC-COHORT-001-REM §3.3: NULL = unlimited. Enforced by worker + extension combined.';
COMMENT ON COLUMN cohort_tiers.csv_export_enabled IS
  'SPEC-COHORT-001-REM §3.3: false for free cohort.';


-- ─── GAP-7 (P1): per-cohort daily_cap_override table ────────────────────────
-- Spec §4.3: "handled by a per-cohort daily_cap_override table"
CREATE TABLE IF NOT EXISTS cohort_feature_caps (
  cohort_tier_id  uuid NOT NULL REFERENCES cohort_tiers(id) ON DELETE CASCADE,
  feature_key     text NOT NULL REFERENCES feature_costs(feature_key) ON DELETE CASCADE,
  daily_cap       integer NOT NULL CHECK (daily_cap >= 0),
  PRIMARY KEY (cohort_tier_id, feature_key)
);

-- Seed: free cohort has stricter caps per spec §4.3
INSERT INTO cohort_feature_caps (cohort_tier_id, feature_key, daily_cap)
SELECT ct.id, fc.feature_key,
  CASE fc.feature_key
    WHEN 'analyze-hidden-job' THEN 5
    WHEN 'score-ai-content'   THEN 10
    WHEN 'auto-apply-trigger' THEN 0
  END
FROM cohort_tiers ct, feature_costs fc
WHERE ct.slug = 'free'
  AND fc.feature_key IN ('analyze-hidden-job', 'score-ai-content', 'auto-apply-trigger')
ON CONFLICT (cohort_tier_id, feature_key) DO UPDATE SET daily_cap = EXCLUDED.daily_cap;

ALTER TABLE cohort_feature_caps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cohort_feature_caps_admin ON cohort_feature_caps;
CREATE POLICY cohort_feature_caps_admin ON cohort_feature_caps FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));
DROP POLICY IF EXISTS cohort_feature_caps_read ON cohort_feature_caps;
CREATE POLICY cohort_feature_caps_read ON cohort_feature_caps
  FOR SELECT USING (auth.role() = 'authenticated');
GRANT SELECT ON cohort_feature_caps TO authenticated;
GRANT ALL ON cohort_feature_caps TO service_role;

COMMENT ON TABLE cohort_feature_caps IS
  'SPEC-COHORT-001-REM §4.3: Per-cohort daily cap overrides for passive features.';


-- ─── GAP-8 (P1): signup trigger — grant credits on new profile ───────────────
-- Spec §5.1: New profile → cohort_grant entry written immediately.
-- Attaches to existing fn_trial_on_signup trigger.
CREATE OR REPLACE FUNCTION fn_cohort_grant_on_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_credits  integer;
  v_period   timestamptz := date_trunc('month', now());
BEGIN
  -- Look up credits_monthly for the assigned cohort_tier
  SELECT credits_monthly INTO v_credits
    FROM cohort_tiers WHERE id = NEW.cohort_tier_id;

  IF v_credits IS NOT NULL AND v_credits > 0 THEN
    INSERT INTO bj_credit_ledger (user_id, bucket, event_type, amount, period_start)
      VALUES (NEW.id, 'base', 'cohort_grant', v_credits, v_period);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cohort_grant_on_signup ON profiles;
CREATE TRIGGER trg_cohort_grant_on_signup
  AFTER INSERT ON profiles
  FOR EACH ROW
  WHEN (NEW.cohort_tier_id IS NOT NULL)
  EXECUTE FUNCTION fn_cohort_grant_on_signup();

COMMENT ON FUNCTION fn_cohort_grant_on_signup IS
  'SPEC-COHORT-001-REM §5.1: Grants base credits to new users on profile creation.';


-- ─── GAP-3 (P1): cohort_prorate function ─────────────────────────────────────
-- Spec §5.3: prorated credit delta on mid-cycle cohort change.
-- Called by stripe-webhook after cohort_tier_id update.
CREATE OR REPLACE FUNCTION fn_cohort_prorate(
  p_user_id       uuid,
  p_old_tier_slug text,
  p_new_tier_slug text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_old_monthly   integer;
  v_new_monthly   integer;
  v_period_start  timestamptz := date_trunc('month', now());
  v_period_end    timestamptz := date_trunc('month', now()) + interval '1 month';
  v_days_in_period integer;
  v_days_remaining integer;
  v_old_prorate   integer;
  v_new_prorate   integer;
  v_delta         integer;
BEGIN
  SELECT credits_monthly INTO v_old_monthly FROM cohort_tiers WHERE slug = p_old_tier_slug;
  SELECT credits_monthly INTO v_new_monthly FROM cohort_tiers WHERE slug = p_new_tier_slug;

  IF v_old_monthly IS NULL OR v_new_monthly IS NULL THEN
    RAISE EXCEPTION 'Unknown cohort slug';
  END IF;

  v_days_in_period  := EXTRACT(DAY FROM v_period_end - v_period_start)::integer;
  v_days_remaining  := GREATEST(0, EXTRACT(DAY FROM v_period_end - now())::integer);

  v_old_prorate := FLOOR(v_old_monthly::numeric * v_days_remaining / v_days_in_period)::integer;
  v_new_prorate := FLOOR(v_new_monthly::numeric * v_days_remaining / v_days_in_period)::integer;
  v_delta       := v_new_prorate - v_old_prorate;

  IF v_delta > 0 THEN
    INSERT INTO bj_credit_ledger (user_id, bucket, event_type, amount, period_start,
      notes)
    VALUES (p_user_id, 'base', 'cohort_prorate', v_delta, v_period_start,
      format('Upgrade %s→%s: +%s prorated credits (%s days remaining)',
        p_old_tier_slug, p_new_tier_slug, v_delta, v_days_remaining));
  ELSIF v_delta < 0 THEN
    -- Never push balance below 0 — check first
    DECLARE v_current integer;
    BEGIN
      SELECT ((fn_get_user_credit_balance(p_user_id))->>'total')::integer INTO v_current;
      DECLARE v_actual_debit integer := GREATEST(-v_current, v_delta);
      BEGIN
        IF v_actual_debit < 0 THEN
          INSERT INTO bj_credit_ledger (user_id, bucket, event_type, amount, period_start,
            notes)
          VALUES (p_user_id, 'base', 'cohort_prorate', v_actual_debit, v_period_start,
            format('Downgrade %s→%s: %s prorated credits (%s days remaining)',
              p_old_tier_slug, p_new_tier_slug, v_actual_debit, v_days_remaining));
        END IF;
      END;
    END;
  END IF;

  RETURN jsonb_build_object(
    'old_slug', p_old_tier_slug,
    'new_slug', p_new_tier_slug,
    'delta', v_delta,
    'days_remaining', v_days_remaining
  );
END;
$$;
GRANT EXECUTE ON FUNCTION fn_cohort_prorate(uuid, text, text) TO service_role;
COMMENT ON FUNCTION fn_cohort_prorate IS
  'SPEC-COHORT-001-REM §5.3: Prorated credit delta on mid-cycle cohort change.';


-- ─── GAP-4 (P1): pg_cron daily replenishment on billing anniversary ──────────
-- Spec §5.2: pg_cron fires daily, processes users whose period_end = today.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-credit-replenishment') THEN
    PERFORM cron.schedule(
      'daily-credit-replenishment',
      '0 1 * * *',  -- 01:00 UTC daily
      $$
        SELECT net.http_post(
          url := current_setting('app.supabase_url') || '/functions/v1/replenish-credits',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
            'Content-Type', 'application/json'
          ),
          body := '{}'::jsonb
        )
      $$
    );
  END IF;
END; $$;


-- ─── GAP-9 (P2): award_expiry_failed PostHog — add error handling wrapper ────
-- Spec §1.3: if expiry job fails, PostHog event 'award_expiry_failed' must fire.
-- Since pg_cron can't call PostHog directly, we wrap fn_expire_awards in a
-- logged version that captures failures to a monitoring table.
CREATE TABLE IF NOT EXISTS cron_run_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name    text NOT NULL,
  ran_at      timestamptz NOT NULL DEFAULT now(),
  result      jsonb,
  error       text,
  duration_ms integer
);
CREATE INDEX IF NOT EXISTS idx_cron_run_log_job ON cron_run_log (job_name, ran_at DESC);
ALTER TABLE cron_run_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cron_run_log_admin ON cron_run_log;
CREATE POLICY cron_run_log_admin ON cron_run_log FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));
GRANT ALL ON cron_run_log TO service_role;

-- Wrap fn_expire_awards to log results + surface failures
CREATE OR REPLACE FUNCTION fn_expire_awards_monitored()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_start timestamptz := clock_timestamp();
  v_result jsonb;
  v_error text;
BEGIN
  BEGIN
    v_result := fn_expire_awards();
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    INSERT INTO cron_run_log (job_name, result, error, duration_ms)
      VALUES ('expire-award-credits', NULL, v_error,
        EXTRACT(milliseconds FROM clock_timestamp() - v_start)::integer);
    -- Re-raise so pg_cron marks job as failed
    RAISE;
  END;

  INSERT INTO cron_run_log (job_name, result, duration_ms)
    VALUES ('expire-award-credits', v_result,
      EXTRACT(milliseconds FROM clock_timestamp() - v_start)::integer);
END;
$$;
GRANT EXECUTE ON FUNCTION fn_expire_awards_monitored() TO service_role;

-- Update the cron to use the monitored wrapper
SELECT cron.unschedule('expire-award-credits') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'expire-award-credits'
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-award-credits') THEN
    PERFORM cron.schedule('expire-award-credits', '0 2 * * *',
      'SELECT fn_expire_awards_monitored()');
  END IF;
END; $$;

COMMENT ON TABLE cron_run_log IS
  'SPEC-COHORT-001-REM §1.3: Captures cron job results. Failed award expiry surfaced here + via PostHog via admin health check.';

