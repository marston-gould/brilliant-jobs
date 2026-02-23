-- P13 Survey & User Intelligence: Database Migration
-- Version: v3.93
-- Date: 2026-02-23
-- 
-- Changes:
-- 1. Add feature_context column to feedback table (for micro-surveys)
-- 2. Add nps_score column to feedback table (for NPS trend tracking)
-- 3. Add GIN index on profiles.user_data for JSONB query performance
-- 4. Schedule nps-pulse Edge Function via pg_cron (1st of each month, 10am ET)
-- 5. Create survey_social_proof view for landing page (P13-11 prep)

-- 1. Add feature_context column for micro-surveys (P13-04/05/06/09)
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS feature_context text;
COMMENT ON COLUMN feedback.feature_context IS 'Feature/page context for micro-surveys (e.g., chart name, feature name, filter context)';

-- 2. Add nps_score for trend tracking (P13-08)
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS nps_score smallint;
COMMENT ON COLUMN feedback.nps_score IS 'Net Promoter Score (0-10) from NPS surveys. Separate column for easy aggregation.';

-- 3. GIN index on profiles.user_data for JSONB performance (Architecture Review recommendation)
CREATE INDEX IF NOT EXISTS idx_profiles_user_data_gin ON profiles USING GIN (user_data);

-- 4. Schedule nps-pulse cron job (1st of each month, 10am ET = 15:00 UTC)
-- Note: Run this via Supabase dashboard or SQL editor, not as migration
-- SELECT cron.schedule(
--   'nps-monthly-pulse',
--   '0 15 1 * *',
--   $$SELECT net.http_post(
--     'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/nps-pulse',
--     '{}',
--     'application/json',
--     ARRAY[
--       net.http_header('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'))
--     ]
--   )$$
-- );

-- 5. Anon-readable view for landing page social proof (P13-11 prep)
-- Returns aggregate stats only, never individual responses
CREATE OR REPLACE VIEW survey_social_proof AS
SELECT
  COUNT(*) FILTER (WHERE survey_version LIKE 'periodic%' OR survey_version LIKE 'nps%') AS total_respondents,
  ROUND(AVG((answers->>'overall_rating')::numeric) FILTER (WHERE answers->>'overall_rating' IS NOT NULL), 1) AS avg_rating,
  ROUND(AVG(nps_score::numeric) FILTER (WHERE nps_score IS NOT NULL), 0) AS avg_nps,
  COUNT(*) FILTER (WHERE nps_score >= 9) AS promoters,
  COUNT(*) FILTER (WHERE nps_score >= 7 AND nps_score <= 8) AS passives,
  COUNT(*) FILTER (WHERE nps_score <= 6) AS detractors
FROM feedback
WHERE created_at > now() - interval '90 days';

-- Grant anon access to the view (for landing page)
GRANT SELECT ON survey_social_proof TO anon;

-- Rollback SQL (if needed):
-- ALTER TABLE feedback DROP COLUMN IF EXISTS feature_context;
-- ALTER TABLE feedback DROP COLUMN IF EXISTS nps_score;
-- DROP INDEX IF EXISTS idx_profiles_user_data_gin;
-- DROP VIEW IF EXISTS survey_social_proof;
-- SELECT cron.unschedule('nps-monthly-pulse');
