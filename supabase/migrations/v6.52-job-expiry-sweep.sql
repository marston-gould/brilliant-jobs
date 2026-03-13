-- v6.52-job-expiry-sweep.sql
-- Daily sweep: expire stale pending_applications and update pipeline entries
--
-- Rules:
--   1. pending_applications in 'approved' for >48h → expired (worker never picked up)
--   2. pending_applications in 'failed' for >7d → expired (not retried)
--   3. Corresponding user_pipeline entries moved to 'posting_closed'

CREATE OR REPLACE FUNCTION fn_sweep_expired_applications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_approved_expired int := 0;
  v_failed_expired int := 0;
  v_pipeline_updated int := 0;
  v_app record;
BEGIN
  -- 1. Expire approved applications stuck for >48 hours (worker never processed)
  FOR v_app IN
    SELECT id, user_id, job_id
    FROM pending_applications
    WHERE status = 'approved'
      AND created_at < now() - interval '48 hours'
  LOOP
    UPDATE pending_applications
    SET status = 'expired',
        submission_error = 'Worker did not process within 48 hours'
    WHERE id = v_app.id;
    v_approved_expired := v_approved_expired + 1;

    -- Update pipeline entry
    UPDATE user_pipeline
    SET stage = 'posting_closed'
    WHERE user_id = v_app.user_id
      AND job_id = v_app.job_id
      AND stage = 'applied';
    IF FOUND THEN
      v_pipeline_updated := v_pipeline_updated + 1;
    END IF;
  END LOOP;

  -- 2. Expire failed applications not retried for >7 days
  FOR v_app IN
    SELECT id, user_id, job_id
    FROM pending_applications
    WHERE status = 'failed'
      AND created_at < now() - interval '7 days'
  LOOP
    UPDATE pending_applications
    SET status = 'expired'
    WHERE id = v_app.id;
    v_failed_expired := v_failed_expired + 1;

    -- Update pipeline entry
    UPDATE user_pipeline
    SET stage = 'posting_closed'
    WHERE user_id = v_app.user_id
      AND job_id = v_app.job_id
      AND stage = 'applied';
    IF FOUND THEN
      v_pipeline_updated := v_pipeline_updated + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'approved_expired', v_approved_expired,
    'failed_expired', v_failed_expired,
    'pipeline_updated', v_pipeline_updated,
    'swept_at', now()
  );
END;
$$;

-- Grant to service role (cron runs as service)
GRANT EXECUTE ON FUNCTION fn_sweep_expired_applications() TO service_role;

-- Daily sweep at 5 AM UTC
SELECT cron.schedule(
  'sweep-expired-applications',
  '0 5 * * *',
  $$SELECT fn_sweep_expired_applications()$$
);
