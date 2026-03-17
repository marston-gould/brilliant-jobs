-- FB-SURVEY-ADMIN-001 SVM-S1: Schema evolution for admin survey manager
-- Adds WHAT/WHO/WHEN/WHERE JSONB columns to survey_campaigns

-- 1. Add new JSONB columns
ALTER TABLE survey_campaigns
  ADD COLUMN IF NOT EXISTS questions jsonb,
  ADD COLUMN IF NOT EXISTS audience_config jsonb DEFAULT '{"type":"all"}'::jsonb,
  ADD COLUMN IF NOT EXISTS trigger_config jsonb DEFAULT '{"type":"page_navigation"}'::jsonb,
  ADD COLUMN IF NOT EXISTS placement_config jsonb;

-- 2. Backfill placement_config from existing channels array
UPDATE survey_campaigns SET placement_config = jsonb_build_object(
  'overlay', jsonb_build_object('enabled', channels @> ARRAY['overlay'], 'pages', '["feed","applications","stats","resumes","subscription"]'::jsonb),
  'merch', jsonb_build_object('enabled', channels @> ARRAY['merch'], 'pages', '["feed"]'::jsonb, 'position', 'sidebar'),
  'email', jsonb_build_object('enabled', channels @> ARRAY['email']),
  'sms', jsonb_build_object('enabled', channels @> ARRAY['sms'])
) WHERE placement_config IS NULL;

-- 3. Backfill trigger_config from survey_type
UPDATE survey_campaigns SET trigger_config = '{"type":"page_navigation"}'::jsonb
  WHERE survey_type IN ('micro','periodic') AND trigger_config IS NULL;
UPDATE survey_campaigns SET trigger_config = '{"type":"cron","schedule":"0 15 1 * *"}'::jsonb
  WHERE survey_version = 'nps_v1' AND trigger_config IS NULL;
UPDATE survey_campaigns SET trigger_config = '{"type":"cron","schedule":"0 15 * * 2"}'::jsonb
  WHERE survey_version = 'periodic_v2' AND trigger_config IS NULL;

-- 4. Backfill audience_config from existing target_audience
UPDATE survey_campaigns SET audience_config = jsonb_build_object(
  'type', 'behavioral',
  'min_sessions', (target_audience->>'min_sessions')::int
) WHERE target_audience IS NOT NULL AND target_audience->>'min_sessions' IS NOT NULL AND audience_config IS NULL;
UPDATE survey_campaigns SET audience_config = '{"type":"all"}'::jsonb
  WHERE audience_config IS NULL;

-- 5. Index for admin queries
CREATE INDEX IF NOT EXISTS idx_survey_campaigns_active_type ON survey_campaigns (is_active, survey_type);
