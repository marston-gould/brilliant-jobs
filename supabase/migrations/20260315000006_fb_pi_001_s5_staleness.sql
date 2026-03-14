-- FB-PI-001 S5: Staleness Engine
-- Registers check-pipeline-staleness cron (daily 8AM UTC).
-- Adds staleness_threshold_days and snooze_days columns to pipeline_tracking_settings.

-- Add staleness config columns to pipeline_tracking_settings (if not already present)
ALTER TABLE pipeline_tracking_settings
  ADD COLUMN IF NOT EXISTS staleness_threshold_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS auto_archive_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_archive_days integer NOT NULL DEFAULT 30;

COMMENT ON COLUMN pipeline_tracking_settings.staleness_threshold_days IS
  'FB-PI-001 S5: Days of inactivity before staleness prompt. Default 7. User-configurable (spec §7.2).';
COMMENT ON COLUMN pipeline_tracking_settings.auto_archive_days IS
  'FB-PI-001 S5: Days before auto-archive. Fixed at 30 per spec §6.1 but stored per user for future flexibility.';

-- check-pipeline-staleness cron: daily at 8 AM UTC
DO $guard$ BEGIN
  PERFORM cron.unschedule('check-pipeline-staleness');
EXCEPTION WHEN OTHERS THEN NULL;
END $guard$;

SELECT cron.schedule(
  'check-pipeline-staleness',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/api-gateway/check-pipeline-staleness',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_action_log') THEN
    INSERT INTO agent_action_log (agent_id, action_type, result_summary)
    VALUES ('system', 'migration', 'FB-PI-001-S5: staleness columns added + check-pipeline-staleness cron registered (0 8 * * *)')
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
