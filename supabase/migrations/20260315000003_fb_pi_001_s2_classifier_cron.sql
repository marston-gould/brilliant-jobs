-- FB-PI-001 S2: classify-pipeline-signal cron registration
-- Runs every 15 minutes to classify pending pipeline_signal_inbox items.
-- Batches of 10 per invocation (spec §5.1: max 50 classifications/minute).

-- Remove existing job first (idempotent)
DO $guard$ BEGIN
  PERFORM cron.unschedule('classify-pipeline-signals');
EXCEPTION WHEN OTHERS THEN NULL;
END $guard$;

-- classify-pipeline-signals: every 15 minutes
SELECT cron.schedule(
  'classify-pipeline-signals',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/api-gateway/classify-pipeline-signal',
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
    VALUES ('system', 'migration', 'FB-PI-001-S2: classify-pipeline-signals cron registered (*/15 * * * *)')
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
