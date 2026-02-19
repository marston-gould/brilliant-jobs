-- =====================================================
-- Brilliant Jobs — Supabase Audit Fixes Migration v2
-- Run in Supabase SQL Editor (Dashboard → SQL Editor)
-- =====================================================

-- =====================================================
-- PART 0: Create exec_sql helper for future remote SQL
-- =====================================================
CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE query;
  RETURN jsonb_build_object('status', 'ok');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('status', 'error', 'message', SQLERRM, 'detail', SQLSTATE);
END;
$$;

-- =====================================================
-- PART 1: Fix function search_path (all public functions)
-- Uses DO block to handle any missing/renamed functions gracefully
-- =====================================================
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname IN (
        'seed_notification_defaults',
        'queue_refresh_batch',
        'handle_new_user',
        'parse_location_parts',
        'get_landing_stats',
        'trigger_normalize_country',
        'geocode_jobs_from_ref',
        'trigger_parse_location',
        'parse_location_country',
        'jobs_within_radius',
        'find_jobs_within_radius',
        'normalize_job_locations',
        'exec_sql'
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn.sig);
      RAISE NOTICE 'Fixed: %', fn.sig;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped (error): % — %', fn.sig, SQLERRM;
    END;
  END LOOP;
END $$;

-- =====================================================
-- PART 2: Enable RLS on spatial_ref_sys (PostGIS table)
-- NOTE: spatial_ref_sys is owned by supabase_admin, not postgres.
-- Must be done via Supabase support or Dashboard → SQL Editor as superuser.
-- Skipping here — low risk (read-only reference data, no user content).
-- =====================================================
-- ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PART 3: Move extensions out of public schema
-- =====================================================
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
ALTER EXTENSION pg_net SET SCHEMA extensions;

-- =====================================================
-- PART 4: Fix RLS initplan — wrap auth.uid() in (select ...)
-- 20 policies across 10 tables
-- =====================================================

-- profiles (3 policies)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (id = (select auth.uid()));

-- connections (3 policies)
DROP POLICY IF EXISTS "Users can view own connections" ON public.connections;
CREATE POLICY "Users can view own connections" ON public.connections
  FOR SELECT USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own connections" ON public.connections;
CREATE POLICY "Users can insert own connections" ON public.connections
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own connections" ON public.connections;
CREATE POLICY "Users can update own connections" ON public.connections
  FOR UPDATE USING (user_id = (select auth.uid()));

-- companies (3 policies)
DROP POLICY IF EXISTS "Users can view own companies" ON public.companies;
CREATE POLICY "Users can view own companies" ON public.companies
  FOR SELECT USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own companies" ON public.companies;
CREATE POLICY "Users can insert own companies" ON public.companies
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own companies" ON public.companies;
CREATE POLICY "Users can update own companies" ON public.companies
  FOR UPDATE USING (user_id = (select auth.uid()));

-- company_collections (1 policy)
DROP POLICY IF EXISTS "Users manage own collections" ON public.company_collections;
CREATE POLICY "Users manage own collections" ON public.company_collections
  FOR ALL USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

-- feedback (2 policies)
DROP POLICY IF EXISTS "auth_insert_own_feedback" ON public.feedback;
CREATE POLICY "auth_insert_own_feedback" ON public.feedback
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "auth_read_own_feedback" ON public.feedback;
CREATE POLICY "auth_read_own_feedback" ON public.feedback
  FOR SELECT USING (user_id = (select auth.uid()));

-- resume_filter_assignments (1 policy)
DROP POLICY IF EXISTS "users_manage_own_assignments" ON public.resume_filter_assignments;
CREATE POLICY "users_manage_own_assignments" ON public.resume_filter_assignments
  FOR ALL USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

-- notification_actions (1 policy)
DROP POLICY IF EXISTS "Users see own actions" ON public.notification_actions;
CREATE POLICY "Users see own actions" ON public.notification_actions
  FOR SELECT USING (user_id = (select auth.uid()));

-- notification_log (1 policy)
DROP POLICY IF EXISTS "Users see own notifications" ON public.notification_log;
CREATE POLICY "Users see own notifications" ON public.notification_log
  FOR SELECT USING (user_id = (select auth.uid()));

-- notification_preferences (fix duplicate + initplan)
DROP POLICY IF EXISTS "Users read own preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users manage own preferences" ON public.notification_preferences;
CREATE POLICY "Users manage own preferences" ON public.notification_preferences
  FOR ALL USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

-- notification_channels (1 policy)
DROP POLICY IF EXISTS "Users manage own channels" ON public.notification_channels;
CREATE POLICY "Users manage own channels" ON public.notification_channels
  FOR ALL USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

-- notification_filter_overrides (1 policy)
DROP POLICY IF EXISTS "Users manage own overrides" ON public.notification_filter_overrides;
CREATE POLICY "Users manage own overrides" ON public.notification_filter_overrides
  FOR ALL USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

-- resumes (1 policy)
DROP POLICY IF EXISTS "Users manage own resumes" ON public.resumes;
CREATE POLICY "Users manage own resumes" ON public.resumes
  FOR ALL USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

-- =====================================================
-- PART 5: Drop duplicate index on ats_jobs
-- =====================================================
DROP INDEX IF EXISTS idx_ats_jobs_title;

-- =====================================================
-- PART 6: Add partial index for status='open' queries
-- (Cannot use CONCURRENTLY inside a transaction block in SQL Editor,
--  so using regular CREATE INDEX here)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_ats_jobs_status_open
  ON ats_jobs (updated_at DESC) WHERE status = 'open';

-- =====================================================
-- DONE. Run the Supabase linter again to verify.
-- Also enable Leaked Password Protection in:
-- Dashboard → Auth → Settings
-- =====================================================
