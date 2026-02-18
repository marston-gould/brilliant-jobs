-- ============================================================
-- MIGRATION: Fix ats_jobs RLS — restrict writes to service_role
-- Date: 2026-02-18
-- Risk: MEDIUM — 8 client-side enrichment writes in keywords.js
--        and job-feed.js will silently fail after this migration.
--        These need to be moved to an enrich-job Edge Function.
-- Rollback: DROP POLICY statements at bottom
-- ============================================================

-- Step 1: Ensure RLS is enabled
ALTER TABLE ats_jobs ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop ALL existing policies on ats_jobs
-- (We don't know exact names, so drop by pattern — safe to run even if they don't exist)
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname FROM pg_policies WHERE tablename = 'ats_jobs' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON ats_jobs', pol.policyname);
        RAISE NOTICE 'Dropped policy: %', pol.policyname;
    END LOOP;
END $$;

-- Step 3: Create new policies
-- Anon can READ (needed for dashboard job feed)
CREATE POLICY "anon_read_ats_jobs"
    ON ats_jobs
    FOR SELECT
    TO anon
    USING (true);

-- Authenticated users can READ (same as anon, but explicit)
CREATE POLICY "authenticated_read_ats_jobs"
    ON ats_jobs
    FOR SELECT
    TO authenticated
    USING (true);

-- Service role can do everything (Edge Functions, cron)
-- Note: service_role bypasses RLS by default, but explicit policy is belt-and-suspenders
CREATE POLICY "service_all_ats_jobs"
    ON ats_jobs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Step 4: Verify — this should show exactly 3 policies
-- Run manually: SELECT policyname, roles, cmd FROM pg_policies WHERE tablename = 'ats_jobs';

-- ============================================================
-- ROLLBACK (if needed):
-- DROP POLICY IF EXISTS "anon_read_ats_jobs" ON ats_jobs;
-- DROP POLICY IF EXISTS "authenticated_read_ats_jobs" ON ats_jobs;
-- DROP POLICY IF EXISTS "service_all_ats_jobs" ON ats_jobs;
-- -- Then re-create the old permissive policy:
-- CREATE POLICY "allow_all" ON ats_jobs FOR ALL USING (true) WITH CHECK (true);
-- ============================================================
