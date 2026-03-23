-- 20260323000009: Schedule salary-backfill cron
-- Runs every 5 minutes until backlog (~236K jobs) is cleared.
-- Each run processes 500 jobs. ~480 runs to clear backlog (~40 hours).
-- Unschedule manually once salary_min coverage is satisfactory.

SELECT cron.schedule(
  'salary-backfill-cron',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/salary-backfill',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
