-- FB-SURVEY-DELIVERY-001 SDV-S5: pg_cron schedules for survey email dispatch
-- NPS: monthly 1st at 10am ET (15:00 UTC)
-- Periodic: bi-weekly Tuesday at 10am ET (15:00 UTC)

-- NPS monthly survey
SELECT cron.schedule(
  'survey-nps-monthly',
  '0 15 1 * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-survey-invite',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"action":"send_email","campaign_version":"nps_v1"}'::jsonb
  )$$
) ON CONFLICT (jobname) DO UPDATE SET schedule = '0 15 1 * *';

-- Periodic bi-weekly survey (every other Tuesday)
SELECT cron.schedule(
  'survey-periodic-biweekly',
  '0 15 * * 2',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-survey-invite',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"action":"send_email","campaign_version":"periodic_v2"}'::jsonb
  )$$
) ON CONFLICT (jobname) DO UPDATE SET schedule = '0 15 * * 2';
