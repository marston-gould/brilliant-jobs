-- Migration: AI JD Enrichment pipeline
-- Adds pg_cron schedule for enrich-jd-ai Edge Function
-- Creates progress tracking function

-- Progress function for AI enrichment specifically
CREATE OR REPLACE FUNCTION jd_ai_enrichment_progress()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total_with_content', (SELECT count(*) FROM ats_jobs WHERE content IS NOT NULL AND jd_extracted_at IS NOT NULL AND status = 'open'),
    'ai_enriched', (SELECT count(*) FROM ats_jobs WHERE jd_skills IS NOT NULL AND status = 'open'),
    'remaining', (SELECT count(*) FROM ats_jobs WHERE content IS NOT NULL AND jd_extracted_at IS NOT NULL AND jd_skills IS NULL AND status = 'open'),
    'has_skills', (SELECT count(*) FROM ats_jobs WHERE jd_skills IS NOT NULL AND array_length(jd_skills, 1) > 0 AND status = 'open'),
    'has_education', (SELECT count(*) FROM ats_jobs WHERE jd_education IS NOT NULL AND status = 'open'),
    'has_years', (SELECT count(*) FROM ats_jobs WHERE jd_years_min IS NOT NULL AND status = 'open'),
    'has_requirements', (SELECT count(*) FROM ats_jobs WHERE jd_requirements IS NOT NULL AND array_length(jd_requirements, 1) > 0 AND status = 'open'),
    'pct_complete', ROUND(
      (SELECT count(*)::numeric FROM ats_jobs WHERE jd_skills IS NOT NULL AND status = 'open') /
      NULLIF((SELECT count(*)::numeric FROM ats_jobs WHERE content IS NOT NULL AND jd_extracted_at IS NOT NULL AND status = 'open'), 0) * 100, 1
    )
  ) INTO result;
  RETURN result;
END;
$$;

-- pg_cron: call enrich-jd-ai every 5 minutes
-- Note: Uses net.http_post extension to call Edge Functions
-- The cron job calls the Edge Function URL with the service role key
SELECT cron.schedule(
  'enrich-jd-ai-batch',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/enrich-jd-ai',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
