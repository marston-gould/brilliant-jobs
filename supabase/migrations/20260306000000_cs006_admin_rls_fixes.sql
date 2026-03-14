-- CS-006: AD-FIX-01 — Admin RLS Security Migrations
-- Fixes: feature_flags write restriction, merch wrong JWT claim,
--   admin_notification_config open access, 6 SEO tables RLS enabled.
-- Date: 2026-03-06
-- Pair: Security + Backend

-- ════════════════════════════════════════════════════════════
-- Helper: is_admin() — checks profiles.role = 'admin' via app-level role
-- (NOT auth.jwt() ->> 'role', which is always 'authenticated')
-- ════════════════════════════════════════════════════════════

-- Create if not exists (may already exist from baseline)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ════════════════════════════════════════════════════════════
-- 1. feature_flags — restrict writes to admin only
-- Problem: service_manage_flags policy allows ALL with qual=true
-- ════════════════════════════════════════════════════════════

-- Drop the broken policy
DROP POLICY IF EXISTS "service_manage_flags" ON feature_flags;

-- Keep public read (needed by check_feature RPC)
-- anyone_read_flags already exists with qual=true for SELECT — leave it

-- Add admin-only write policy
DO $$ BEGIN
  CREATE POLICY "admin_manage_flags"
    ON feature_flags
    FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ════════════════════════════════════════════════════════════
-- 2. admin_notification_config — restrict to admin only
-- Problem: "Admin full access config" allows ALL with qual=true
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Admin full access config" ON admin_notification_config;

-- Admin can read + write
DO $$ BEGIN
  CREATE POLICY "admin_full_access_config"
    ON admin_notification_config
    FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ════════════════════════════════════════════════════════════
-- 3. merch_placements — fix wrong JWT claim
-- Problem: auth.jwt() ->> 'role' = 'admin' checks Supabase auth role
--   (always 'authenticated'), not app-level profiles.role
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Admins can manage merch_placements" ON merch_placements;

DO $$ BEGIN
  CREATE POLICY "admin_manage_merch_placements"
    ON merch_placements
    FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Public read stays: "Public can read active merch_placements" — correct as-is

-- ════════════════════════════════════════════════════════════
-- 4. merch_rules — fix wrong JWT claim (same issue)
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Admins can manage merch_rules" ON merch_rules;

DO $$ BEGIN
  CREATE POLICY "admin_manage_merch_rules"
    ON merch_rules
    FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Public read stays: "Public can read active merch_rules" — correct as-is

-- ════════════════════════════════════════════════════════════
-- 5. merch_content — fix wrong JWT claim (same issue)
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Admins can manage merch_content" ON merch_content;

DO $$ BEGIN
  CREATE POLICY "admin_manage_merch_content"
    ON merch_content
    FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Public read stays: "Public can read active merch_content" — correct as-is

-- ════════════════════════════════════════════════════════════
-- 6. Enable RLS on 6 SEO tables + add policies
-- Problem: All 6 tables have RLS disabled — any API caller can read/write
-- Policy: Public can read (SEO data is public), only admin can write
-- ════════════════════════════════════════════════════════════

-- seo_site_daily
ALTER TABLE seo_site_daily ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "public_read_seo_site_daily"
    ON seo_site_daily FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "admin_write_seo_site_daily"
    ON seo_site_daily FOR ALL
    USING (is_admin()) WITH CHECK (is_admin());
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- seo_page_daily
ALTER TABLE seo_page_daily ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "public_read_seo_page_daily"
    ON seo_page_daily FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "admin_write_seo_page_daily"
    ON seo_page_daily FOR ALL
    USING (is_admin()) WITH CHECK (is_admin());
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- seo_tech_audits
ALTER TABLE seo_tech_audits ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "public_read_seo_tech_audits"
    ON seo_tech_audits FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "admin_write_seo_tech_audits"
    ON seo_tech_audits FOR ALL
    USING (is_admin()) WITH CHECK (is_admin());
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- seo_index_status
ALTER TABLE seo_index_status ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "public_read_seo_index_status"
    ON seo_index_status FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "admin_write_seo_index_status"
    ON seo_index_status FOR ALL
    USING (is_admin()) WITH CHECK (is_admin());
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- seo_conversions
ALTER TABLE seo_conversions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "public_read_seo_conversions"
    ON seo_conversions FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "admin_write_seo_conversions"
    ON seo_conversions FOR ALL
    USING (is_admin()) WITH CHECK (is_admin());
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- seo_gsc_daily
ALTER TABLE seo_gsc_daily ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "public_read_seo_gsc_daily"
    ON seo_gsc_daily FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "admin_write_seo_gsc_daily"
    ON seo_gsc_daily FOR ALL
    USING (is_admin()) WITH CHECK (is_admin());
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ════════════════════════════════════════════════════════════
-- Verification queries (run after applying):
-- SELECT tablename, policyname, cmd, qual FROM pg_policies
--   WHERE tablename IN ('feature_flags', 'admin_notification_config',
--     'merch_placements', 'merch_rules', 'merch_content',
--     'seo_site_daily', 'seo_page_daily', 'seo_tech_audits',
--     'seo_index_status', 'seo_conversions', 'seo_gsc_daily');
-- ════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
-- 7. Rate limiting table for admin EFs (AD-FIX-03)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ef_rate_limits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  function_name text NOT NULL,
  caller_id text NOT NULL,
  called_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_ef_rate_limits_lookup
  ON ef_rate_limits (function_name, caller_id, called_at DESC);

-- Auto-cleanup: delete entries older than 2 hours (keeps table small)
-- This will be called by the existing cron sweep or manually
CREATE OR REPLACE FUNCTION cleanup_ef_rate_limits()
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM ef_rate_limits WHERE called_at < now() - interval '2 hours';
$$;

-- RLS: only service_role can access (EFs use service_role key)
ALTER TABLE ef_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies = only service_role can access (which is what we want)

-- Rate check function: returns true if under limit
CREATE OR REPLACE FUNCTION check_ef_rate_limit(
  p_function_name text,
  p_caller_id text,
  p_max_calls int,
  p_window_minutes int DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  -- Count calls in window
  SELECT count(*) INTO v_count
  FROM ef_rate_limits
  WHERE function_name = p_function_name
    AND caller_id = p_caller_id
    AND called_at > now() - (p_window_minutes || ' minutes')::interval;

  IF v_count >= p_max_calls THEN
    RETURN false;
  END IF;

  -- Record this call
  INSERT INTO ef_rate_limits (function_name, caller_id)
  VALUES (p_function_name, p_caller_id);

  -- Opportunistic cleanup (1% chance per call)
  IF random() < 0.01 THEN
    PERFORM cleanup_ef_rate_limits();
  END IF;

  RETURN true;
END;
$$;
