-- v6.07: Interview Reminder Cron Jobs
-- Run in Supabase SQL Editor (pg_cron must be enabled via Dashboard → Extensions)
-- These cron jobs query user_pipeline for upcoming interviews and fire
-- interview-sequence Edge Function for 24h and 1h reminders.

-- ─── 24h Interview Reminder ───
-- Runs every 15 minutes. Finds pipeline entries where:
--   stage = 'interview', interview_date within 24h window, not yet notified.
-- Dedup: skips if notification_log already has entry for this pipeline_entry + '24h'

SELECT cron.schedule(
  'interview-reminder-24h',
  '*/15 * * * *',  -- every 15 minutes
  $$
  DO $$BODY$$
  DECLARE
    r RECORD;
    response TEXT;
  BEGIN
    FOR r IN
      SELECT
        up.id AS pipeline_entry_id,
        up.user_id,
        up.company_name,
        up.job_title,
        up.interview_date,
        up.interview_time,
        up.interview_format,
        p.timezone
      FROM user_pipeline up
      JOIN profiles p ON p.id = up.user_id
      WHERE up.stage = 'interview'
        AND up.interview_date IS NOT NULL
        -- Interview is within 24h from now but more than 1h away
        AND up.interview_date >= NOW()
        AND up.interview_date <= NOW() + INTERVAL '24 hours'
        AND up.interview_date > NOW() + INTERVAL '1 hour'
        -- Not already notified for 24h
        AND NOT EXISTS (
          SELECT 1 FROM notification_log nl
          WHERE nl.user_id = up.user_id
            AND nl.notification_type = 'interview_reminder_24h'
            AND nl.metadata->>'dedup_key' = up.id::TEXT
        )
    LOOP
      -- Call interview-sequence Edge Function
      SELECT content INTO response FROM
        net.http_post(
          url := current_setting('app.settings.supabase_url') || '/functions/v1/interview-sequence',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
          ),
          body := jsonb_build_object(
            'type', 'interview_reminder_24h',
            'userId', r.user_id,
            'pipelineEntryId', r.pipeline_entry_id,
            'companyName', r.company_name,
            'jobTitle', r.job_title,
            'interviewDate', to_char(r.interview_date, 'YYYY-MM-DD'),
            'interviewTime', COALESCE(r.interview_time, to_char(r.interview_date, 'HH:MI AM')),
            'timezone', COALESCE(r.timezone, 'America/New_York'),
            'interviewFormat', COALESCE(r.interview_format, 'TBD')
          )
        );
      RAISE NOTICE 'interview-reminder-24h: sent for pipeline_entry=%, response=%', r.pipeline_entry_id, response;
    END LOOP;
  END;
  $$BODY$$;
  $$
);


-- ─── 1h Interview Reminder ───
-- Runs every 10 minutes. Finds pipeline entries where:
--   stage = 'interview', interview_date within 1h window, not yet notified.
-- Does NOT respect quiet hours (by design — 1h reminder always fires).

SELECT cron.schedule(
  'interview-reminder-1h',
  '*/10 * * * *',  -- every 10 minutes
  $$
  DO $$BODY$$
  DECLARE
    r RECORD;
    response TEXT;
  BEGIN
    FOR r IN
      SELECT
        up.id AS pipeline_entry_id,
        up.user_id,
        up.company_name,
        up.job_title,
        up.interview_date,
        up.interview_time,
        up.interview_format,
        up.interview_location,
        up.match_score,
        p.timezone
      FROM user_pipeline up
      JOIN profiles p ON p.id = up.user_id
      WHERE up.stage = 'interview'
        AND up.interview_date IS NOT NULL
        -- Interview is within 1h from now but still in the future
        AND up.interview_date >= NOW()
        AND up.interview_date <= NOW() + INTERVAL '1 hour'
        -- Not already notified for 1h
        AND NOT EXISTS (
          SELECT 1 FROM notification_log nl
          WHERE nl.user_id = up.user_id
            AND nl.notification_type = 'interview_reminder_1h'
            AND nl.metadata->>'dedup_key' = up.id::TEXT
        )
    LOOP
      SELECT content INTO response FROM
        net.http_post(
          url := current_setting('app.settings.supabase_url') || '/functions/v1/interview-sequence',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
          ),
          body := jsonb_build_object(
            'type', 'interview_reminder_1h',
            'userId', r.user_id,
            'pipelineEntryId', r.pipeline_entry_id,
            'companyName', r.company_name,
            'jobTitle', r.job_title,
            'interviewTime', COALESCE(r.interview_time, to_char(r.interview_date, 'HH:MI AM')),
            'timezone', COALESCE(r.timezone, 'America/New_York'),
            'interviewFormat', COALESCE(r.interview_format, 'TBD'),
            'interviewLocation', r.interview_location,
            'matchScore', r.match_score
          )
        );
      RAISE NOTICE 'interview-reminder-1h: sent for pipeline_entry=%, response=%', r.pipeline_entry_id, response;
    END LOOP;
  END;
  $$BODY$$;
  $$
);


-- ─── Verify cron jobs registered ───
SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'interview-reminder%';

-- ─── Rollback (if needed) ───
-- SELECT cron.unschedule('interview-reminder-24h');
-- SELECT cron.unschedule('interview-reminder-1h');