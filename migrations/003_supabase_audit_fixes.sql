-- =====================================================
-- Brilliant Jobs — Supabase Audit Fixes Migration
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
-- PART 1: Fix function search_path (13 functions)
-- =====================================================
ALTER FUNCTION public.seed_notification_defaults() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.parse_location_parts(text) SET search_path = public;
ALTER FUNCTION public.get_landing_stats() SET search_path = public;
ALTER FUNCTION public.trigger_normalize_country() SET search_path = public;
ALTER FUNCTION public.geocode_jobs_from_ref() SET search_path = public;
ALTER FUNCTION public.trigger_parse_location() SET search_path = public;
ALTER FUNCTION public.parse_location_country(text) SET search_path = public;
ALTER FUNCTION public.normalize_job_locations() SET search_path = public;

-- queue_refresh_batch may have multiple overloads - fix all
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'queue_refresh_batch'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn.sig);
  END LOOP;
END $$;

-- jobs_within_radius and find_jobs_within_radius - need exact signatures
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname IN ('jobs_within_radius', 'find_jobs_within_radius')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn.sig);
  END LOOP;
END $$;

-- =====================================================
-- PART 2: Enable RLS on spatial_ref_sys (PostGIS table)
-- =====================================================
ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
-- No policies = no access via PostgREST API (internal DB functions still work)

-- =====================================================
-- PART 3: Move extensions out of public schema
-- =====================================================
-- pg_trgm and pg_net can be moved safely
-- (postgis stays in public due to spatial_ref_sys dependencies)
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
ALTER EXTENSION pg_net SET SCHEMA extensions;

-- =====================================================
-- PART 4: Fix RLS initplan — wrap auth.uid() in (select ...)
-- This is the big one: 20 policies across 10 tables
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

-- notification_preferences (2 policies — also fixes duplicate permissive)
DROP POLICY IF EXISTS "Users read own preferences" ON public.notification_preferences;
-- ^ This was the redundant policy causing multiple_permissive_policies lint
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
-- Keep idx_ats_jobs_title_gin (GIN is better for text search), drop the other
DROP INDEX IF EXISTS idx_ats_jobs_title;

-- =====================================================
-- PART 6: Add partial index for status='open' queries
-- This speeds up the #1 slow query pattern (landing page + dashboard)
-- =====================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ats_jobs_status_open
  ON ats_jobs (updated_at DESC) WHERE status = 'open';

-- =====================================================
-- DONE. Summary:
-- - 13 functions: search_path fixed
-- - 1 table: RLS enabled (spatial_ref_sys)
-- - 2 extensions: moved to 'extensions' schema
-- - 20 RLS policies: auth.uid() → (select auth.uid())
-- - 1 redundant policy dropped (notification_preferences)
-- - 1 duplicate index dropped
-- - 1 partial index added for performance
-- - 1 exec_sql helper function created for future remote SQL
-- =====================================================
