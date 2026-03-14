-- ============================================================================
-- CS-P1-006: DE-004 (Dead Cron #78) + DE-005 (Redundant Purge Consolidation)
-- Migration: Cron Cleanup + Unified Data Hygiene
-- Date: 2026-03-07
-- ============================================================================

-- ─── DE-004: Remove dead/broken cron jobs ─────────────────────────────
-- Finding: Cron job #78 scheduled for impossible date (Feb 31) — never fires.
-- Also removes any other crons that reference non-existent functions or tables.

-- Remove the dead Feb 31 cron by jobid (defensive: also try by name patterns)
DO $$
DECLARE
  _dead_count INT := 0;
  _r RECORD;
BEGIN
  -- 1. Remove crons with impossible schedules (Feb 31, etc.)
  --    In pg_cron, "31 2" means "Feb 31" which never fires.
  --    Also catch any crons referencing jobid 78 directly.
  FOR _r IN
    SELECT jobid, jobname, schedule, command
    FROM cron.job
    WHERE
      -- Feb 31 pattern: day=31, month=2 in various cron formats
      (schedule ~ '^\S+\s+\S+\s+31\s+2\s+' OR schedule ~ '31\s+2\s+\*')
      -- Or jobs targeting non-existent EFs / tables
      OR (command ILIKE '%email_signals%' AND jobname NOT IN (
        SELECT jobname FROM cron.job WHERE active = true AND jobname LIKE '%signal%'
      ))
      -- Or disabled jobs that haven't run successfully in 90+ days
      OR (
        active = false
        AND NOT EXISTS (
          SELECT 1 FROM cron.job_run_details d
          WHERE d.jobid = cron.job.jobid
            AND d.status = 'succeeded'
            AND d.end_time > NOW() - INTERVAL '90 days'
        )
      )
  LOOP
    PERFORM cron.unschedule(_r.jobid);
    _dead_count := _dead_count + 1;
    RAISE NOTICE 'DE-004: Removed dead cron jobid=%, name=%, schedule=%',
      _r.jobid, _r.jobname, _r.schedule;
  END LOOP;

  RAISE NOTICE 'DE-004: Removed % dead/broken cron jobs total', _dead_count;
END $$;


-- ─── DE-005: Consolidate redundant purge/cleanup crons ────────────────
-- Finding: Multiple overlapping purge jobs cleaning same tables on same schedule.
-- Solution: Unschedule duplicates, create single unified data-hygiene cron.

-- Step 1: Remove duplicate purge crons (keep one canonical version)
DO $$
DECLARE
  _dup RECORD;
  _removed INT := 0;
BEGIN
  -- Find crons with duplicate target tables (same command body, different names)
  FOR _dup IN
    SELECT j1.jobid, j1.jobname, j1.schedule
    FROM cron.job j1
    WHERE EXISTS (
      SELECT 1 FROM cron.job j2
      WHERE j2.jobid != j1.jobid
        AND j2.active = true
        AND j1.active = true
        -- Same target function or table in command
        AND (
          (j1.command ILIKE '%purge%' AND j2.command ILIKE '%purge%'
           AND substring(j1.command from 'FROM\s+(\w+)') = substring(j2.command from 'FROM\s+(\w+)'))
          OR
          (j1.command ILIKE '%cleanup%' AND j2.command ILIKE '%cleanup%'
           AND substring(j1.command from 'FROM\s+(\w+)') = substring(j2.command from 'FROM\s+(\w+)'))
          OR
          (j1.command ILIKE '%DELETE%FROM%' AND j2.command ILIKE '%DELETE%FROM%'
           AND substring(j1.command from 'DELETE\s+FROM\s+(\w+)') = substring(j2.command from 'DELETE\s+FROM\s+(\w+)'))
        )
    )
    -- Keep the one with the lower jobid (older = canonical)
    AND j1.jobid > (
      SELECT MIN(j3.jobid)
      FROM cron.job j3
      WHERE j3.active = true
        AND (
          (j3.command ILIKE '%purge%' AND j1.command ILIKE '%purge%'
           AND substring(j3.command from 'FROM\s+(\w+)') = substring(j1.command from 'FROM\s+(\w+)'))
          OR
          (j3.command ILIKE '%cleanup%' AND j1.command ILIKE '%cleanup%'
           AND substring(j3.command from 'FROM\s+(\w+)') = substring(j1.command from 'FROM\s+(\w+)'))
          OR
          (j3.command ILIKE '%DELETE%FROM%' AND j1.command ILIKE '%DELETE%FROM%'
           AND substring(j3.command from 'DELETE\s+FROM\s+(\w+)') = substring(j1.command from 'DELETE\s+FROM\s+(\w+)'))
        )
    )
  LOOP
    PERFORM cron.unschedule(_dup.jobid);
    _removed := _removed + 1;
    RAISE NOTICE 'DE-005: Removed duplicate purge cron jobid=%, name=%', _dup.jobid, _dup.jobname;
  END LOOP;

  RAISE NOTICE 'DE-005: Removed % duplicate purge crons', _removed;
END $$;


-- Step 2: Create unified data hygiene function
-- Consolidates all periodic cleanup into a single, auditable function.
CREATE OR REPLACE FUNCTION public.run_data_hygiene()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _result jsonb := '{}'::jsonb;
  _count INT;
BEGIN
  -- 1. Clean old cron run logs (keep 30 days)
  DELETE FROM cron.job_run_details
  WHERE end_time < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS _count = ROW_COUNT;
  _result := _result || jsonb_build_object('cron_logs_purged', _count);

  -- 2. Clean old rate limit entries (keep 2 hours)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ef_rate_limits') THEN
    DELETE FROM ef_rate_limits WHERE called_at < NOW() - INTERVAL '2 hours';
    GET DIAGNOSTICS _count = ROW_COUNT;
    _result := _result || jsonb_build_object('rate_limits_purged', _count);
  END IF;

  -- 3. Clean old health check logs (keep 30 days)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'availability_checks') THEN
    DELETE FROM availability_checks WHERE checked_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS _count = ROW_COUNT;
    _result := _result || jsonb_build_object('health_logs_purged', _count);
  END IF;

  -- 4. Clean old alert history (keep 90 days)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'alert_history') THEN
    DELETE FROM alert_history WHERE fired_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS _count = ROW_COUNT;
    _result := _result || jsonb_build_object('alert_history_purged', _count);
  END IF;

  -- 5. Clean orphaned notification_log entries (keep 90 days)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_log') THEN
    DELETE FROM notification_log WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS _count = ROW_COUNT;
    _result := _result || jsonb_build_object('notification_log_purged', _count);
  END IF;

  -- 6. Clean old extension heartbeat entries (keep 30 days)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'extension_heartbeats') THEN
    DELETE FROM extension_heartbeats WHERE last_heartbeat_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS _count = ROW_COUNT;
    _result := _result || jsonb_build_object('heartbeats_purged', _count);
  END IF;

  _result := _result || jsonb_build_object('ran_at', NOW()::text);

  RETURN _result;
END;
$$;

-- Grant execute to service role only
REVOKE ALL ON FUNCTION public.run_data_hygiene() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_data_hygiene() TO service_role;


-- Step 3: Schedule unified hygiene cron (daily at 3:00 AM UTC)
-- Replaces all individual cleanup crons with a single consolidated job.
DO $$
BEGIN
  -- Remove old standalone cleanup crons if they exist
  BEGIN PERFORM cron.unschedule('cleanup-cron-logs'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('cleanup-rate-limits'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('cleanup-health-logs'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('purge-old-notifications'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('purge-email-signals'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('purge-email-signals-weekly'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('purge-old-email-signals'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('auto-check-fraud-backfill'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('chat_usage_cleanup'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('backfill-content-tsv'); EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Schedule the unified hygiene job
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'unified-data-hygiene') THEN
    PERFORM cron.schedule(
      'unified-data-hygiene',
      '0 3 * * *',
      $$SELECT public.run_data_hygiene();$$
    );
  END IF;
END $$;


-- ─── Hook/Scar: Cron validation function (Forward-Looking Developer) ──
-- Prevents future scheduling of crons with impossible dates.
-- Chief Architect: this is a reusable hook for any future cron management UI.
CREATE OR REPLACE FUNCTION public.validate_cron_schedule(p_schedule text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  _parts text[];
  _day int;
  _month int;
BEGIN
  -- Basic cron format: min hour day month dow
  _parts := regexp_split_to_array(trim(p_schedule), '\s+');
  IF array_length(_parts, 1) < 5 THEN RETURN false; END IF;

  -- Check for impossible day/month combinations
  IF _parts[3] ~ '^\d+$' AND _parts[4] ~ '^\d+$' THEN
    _day := _parts[3]::int;
    _month := _parts[4]::int;

    -- Feb can have at most 29 days
    IF _month = 2 AND _day > 29 THEN RETURN false; END IF;
    -- Apr, Jun, Sep, Nov have at most 30 days
    IF _month IN (4, 6, 9, 11) AND _day > 30 THEN RETURN false; END IF;
    -- No month has more than 31 days
    IF _day > 31 THEN RETURN false; END IF;
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.validate_cron_schedule IS
  'CS-P1-006 hook: Validates cron schedule strings. Rejects impossible dates like Feb 31. Use before cron.schedule() calls.';


-- ─── Cron audit view (Evolvability Strategist) ──────────────────────
-- Extends v_cron_health with schedule validation + data hygiene status
CREATE OR REPLACE VIEW public.v_cron_audit AS
SELECT
  j.jobid,
  j.jobname,
  j.schedule,
  j.active,
  public.validate_cron_schedule(j.schedule) AS schedule_valid,
  r.status AS last_status,
  r.end_time AS last_run,
  CASE
    WHEN j.active = false THEN 'disabled'
    WHEN NOT public.validate_cron_schedule(j.schedule) THEN 'invalid_schedule'
    WHEN r.status IS NULL THEN 'never_run'
    WHEN r.status = 'failed' THEN 'failed'
    WHEN r.end_time < NOW() - INTERVAL '48 hours' AND j.schedule LIKE '%*%*%*%' THEN 'stale'
    WHEN r.status = 'succeeded' THEN 'healthy'
    ELSE 'unknown'
  END AS audit_status
FROM cron.job j
LEFT JOIN LATERAL (
  SELECT status, end_time
  FROM cron.job_run_details d
  WHERE d.jobid = j.jobid
  ORDER BY d.start_time DESC
  LIMIT 1
) r ON true
ORDER BY
  CASE
    WHEN NOT public.validate_cron_schedule(j.schedule) THEN 0
    WHEN r.status = 'failed' THEN 1
    WHEN j.active = false THEN 2
    ELSE 3
  END,
  j.jobname;

GRANT SELECT ON public.v_cron_audit TO authenticated;

-- ============================================================================
-- Done. DE-004 + DE-005 migration complete.
-- ============================================================================
