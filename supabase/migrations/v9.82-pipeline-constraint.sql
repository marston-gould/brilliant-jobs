-- v9.82: Fix user_pipeline unique constraint
-- Note: filter_data normalization was applied directly via REST API on 2026-03-23
-- This migration handles the DDL that cannot run via REST

-- Drop the 3-col unique constraint on user_pipeline
-- Business rule per FEED_SPEC: one record per (user_id, job_id)
-- The 3-col constraint (user_id, job_id, ats_source) allowed duplicates when ats_source differed
ALTER TABLE user_pipeline 
  DROP CONSTRAINT IF EXISTS user_pipeline_user_id_job_id_ats_source_key;

-- Ensure the correct 2-col constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'user_pipeline'::regclass 
    AND conname = 'user_pipeline_user_job_unique'
  ) THEN
    ALTER TABLE user_pipeline ADD CONSTRAINT user_pipeline_user_job_unique 
      UNIQUE (user_id, job_id);
  END IF;
END;
$$;
