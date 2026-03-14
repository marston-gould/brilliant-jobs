-- 20260314000003_fb_trial_001_s6_batch_scorer.sql
-- FB-TRIAL-001-S6: batch-resume-scorer EF support
-- Adds resume_text + job_description_text to resume_score_queue for batch processing
-- Adds pg_cron schedule for batch-resume-scorer submit + poll

-- ─── Add columns for batch scoring context ───
ALTER TABLE resume_score_queue
  ADD COLUMN IF NOT EXISTS resume_text TEXT,
  ADD COLUMN IF NOT EXISTS job_description_text TEXT;

-- ─── pg_cron: batch-resume-scorer-submit every 5 minutes ───
DO $guard$ BEGIN
  PERFORM cron.unschedule('batch-resume-scorer-submit');
EXCEPTION WHEN OTHERS THEN NULL;
END $guard$;
SELECT cron.schedule(
  'batch-resume-scorer-submit',
  '*/5 * * * *',
  'SELECT net.http_post(url := current_setting(''app.supabase_url'') || ''/functions/v1/batch-resume-scorer?action=submit'', headers := jsonb_build_object(''Authorization'', ''Bearer '' || current_setting(''app.service_role_key''), ''Content-Type'', ''application/json''), body := ''{}''::jsonb)'
);

-- ─── pg_cron: batch-resume-scorer-poll every 5 minutes ───
DO $guard$ BEGIN
  PERFORM cron.unschedule('batch-resume-scorer-poll');
EXCEPTION WHEN OTHERS THEN NULL;
END $guard$;
SELECT cron.schedule(
  'batch-resume-scorer-poll',
  '*/5 * * * *',
  'SELECT net.http_post(url := current_setting(''app.supabase_url'') || ''/functions/v1/batch-resume-scorer?action=poll'', headers := jsonb_build_object(''Authorization'', ''Bearer '' || current_setting(''app.service_role_key''), ''Content-Type'', ''application/json''), body := ''{}''::jsonb)'
);

-- ─── Index on submitted status for polling ───
CREATE INDEX IF NOT EXISTS idx_rsq_submitted
  ON resume_score_queue (status, batch_id)
  WHERE status = 'submitted';
