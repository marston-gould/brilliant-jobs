-- Migration: Tiered Refresh for refresh-jobs v13
-- Changes pg_cron from every 6h to every 3 min
-- Adds composite index for tiered board selection queries

-- 1. Update pg_cron schedule: 6-hourly → every 3 minutes
-- Old: 0 */6 * * * (job ID 13)
-- New: */3 * * * *
DO $$ BEGIN
  PERFORM cron.unschedule('refresh-jobs');  -- remove old job by name if exists
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule(
  'refresh-jobs-tiered',
  '*/3 * * * *',
  $$SELECT net.http_post(
    url := 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/refresh-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU2OTA2NiwiZXhwIjoyMDg2MTQ1MDY2fQ._wuo4yuVmqM_x3PhOPLkfBwDrlpXcH62NZk7wX2q5tM'
    ),
    body := '{}'::jsonb
  );$$
);

-- 2. Composite index for HOT tier query: job_count > 0, ordered by last_checked
-- This replaces scanning the full 38K table on every invocation
CREATE INDEX IF NOT EXISTS idx_ats_companies_tier_hot
  ON ats_companies (last_checked ASC NULLS FIRST)
  WHERE job_count > 0;

-- 3. Composite index for WARM tier query: job_count = 0, active, not 404
CREATE INDEX IF NOT EXISTS idx_ats_companies_tier_warm
  ON ats_companies (last_checked ASC NULLS FIRST)
  WHERE job_count = 0 AND is_active = true AND last_http_status != 404;

-- 4. Composite index for COLD tier query: 404 or inactive
CREATE INDEX IF NOT EXISTS idx_ats_companies_tier_cold
  ON ats_companies (last_checked ASC NULLS FIRST)
  WHERE last_http_status = 404 OR is_active = false;
