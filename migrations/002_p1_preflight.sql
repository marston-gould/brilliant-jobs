-- ============================================================
-- MIGRATION 002: P1 pre-launch fixes
-- Date: 2026-02-18
-- Items: Dead boards inactive, NULL closed content, resume_filter_assignments user_id
-- ============================================================

-- ============================================================
-- P1 #4: Mark dead boards inactive
-- ============================================================

-- Add is_active column (default true so existing boards aren't affected)
ALTER TABLE ats_companies ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Mark boards with 0 jobs as inactive
UPDATE ats_companies SET is_active = false WHERE job_count = 0;

-- ============================================================
-- P1 #8: NULL content on closed jobs to reclaim space
-- ============================================================

UPDATE ats_jobs SET content = NULL WHERE status = 'closed' AND content IS NOT NULL;

-- ============================================================
-- P1 #10: Add user_id to resume_filter_assignments
-- ============================================================

-- Add column
ALTER TABLE resume_filter_assignments ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users ON DELETE CASCADE;

-- Backfill from resumes table
UPDATE resume_filter_assignments rfa
SET user_id = r.user_id
FROM resumes r
WHERE rfa.resume_id = r.id::text
AND rfa.user_id IS NULL;

-- Add RLS policy scoped to user
ALTER TABLE resume_filter_assignments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'resume_filter_assignments' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON resume_filter_assignments', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "users_manage_own_assignments"
    ON resume_filter_assignments FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_all_assignments"
    ON resume_filter_assignments FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
