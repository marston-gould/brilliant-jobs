-- CS-P1-016: Cron Management + Alert Configuration
-- Findings: 0.161 (cron management UI), 0.162 (cron alert config)

-- ═══════════════════════════════════════════════════════════
-- 0.162: Cron Alert Configuration Table
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.cron_alert_config (
  job_name TEXT PRIMARY KEY,
  max_consecutive_failures INT NOT NULL DEFAULT 3,
  stale_threshold_minutes INT NOT NULL DEFAULT 30,
  alert_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: admin only
ALTER TABLE public.cron_alert_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "admin_cron_alert_config_select" ON public.cron_alert_config
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin_cron_alert_config_insert" ON public.cron_alert_config
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin_cron_alert_config_update" ON public.cron_alert_config
    FOR UPDATE USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════
-- 0.161: Cron Management RPC Functions (service_role only)
-- ═══════════════════════════════════════════════════════════

-- Toggle active status
CREATE OR REPLACE FUNCTION public.admin_toggle_cron_job(
  p_job_id BIGINT,
  p_active BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  v_jobname TEXT;
BEGIN
  -- Verify job exists
  SELECT jobname INTO v_jobname FROM cron.job WHERE jobid = p_job_id;
  IF v_jobname IS NULL THEN
    RETURN jsonb_build_object('error', 'Job not found');
  END IF;

  -- Toggle via cron.alter_job
  PERFORM cron.alter_job(p_job_id, active := p_active);

  RETURN jsonb_build_object('job_id', p_job_id, 'active', p_active, 'job_name', v_jobname);
END;
$$;

-- Update schedule
CREATE OR REPLACE FUNCTION public.admin_update_cron_schedule(
  p_job_id BIGINT,
  p_schedule TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  v_jobname TEXT;
BEGIN
  SELECT jobname INTO v_jobname FROM cron.job WHERE jobid = p_job_id;
  IF v_jobname IS NULL THEN
    RETURN jsonb_build_object('error', 'Job not found');
  END IF;

  PERFORM cron.alter_job(p_job_id, schedule := p_schedule);

  RETURN jsonb_build_object('job_id', p_job_id, 'schedule', p_schedule, 'job_name', v_jobname);
END;
$$;

-- Get run history for a specific job
CREATE OR REPLACE FUNCTION public.admin_cron_run_history(
  p_job_id BIGINT,
  p_limit INT DEFAULT 20
) RETURNS TABLE(
  runid BIGINT,
  job_pid INT,
  status TEXT,
  return_message TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_s NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rd.runid,
    rd.job_pid,
    rd.status,
    rd.return_message,
    rd.start_time,
    rd.end_time,
    EXTRACT(EPOCH FROM (rd.end_time - rd.start_time))::NUMERIC AS duration_s
  FROM cron.job_run_details rd
  WHERE rd.jobid = p_job_id
  ORDER BY rd.start_time DESC
  LIMIT p_limit;
END;
$$;

-- Get job command (for display)
CREATE OR REPLACE FUNCTION public.admin_get_cron_job_command(
  p_job_id BIGINT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  v_command TEXT;
BEGIN
  SELECT command INTO v_command FROM cron.job WHERE jobid = p_job_id;
  RETURN v_command;
END;
$$;

-- Force-run: execute the job's command immediately
CREATE OR REPLACE FUNCTION public.admin_force_run_cron_job(
  p_job_id BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  v_command TEXT;
  v_jobname TEXT;
BEGIN
  SELECT command, jobname INTO v_command, v_jobname
  FROM cron.job WHERE jobid = p_job_id;

  IF v_command IS NULL THEN
    RETURN jsonb_build_object('error', 'Job not found');
  END IF;

  -- If it's an HTTP call (net.http_post), we execute via pg_net
  -- If it's a SQL command, execute directly
  IF v_command LIKE '%net.http_post%' OR v_command LIKE '%net.http_get%' THEN
    EXECUTE v_command;
  ELSE
    EXECUTE v_command;
  END IF;

  RETURN jsonb_build_object(
    'job_id', p_job_id,
    'job_name', v_jobname,
    'triggered_at', now()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'error', SQLERRM,
    'job_id', p_job_id,
    'job_name', v_jobname
  );
END;
$$;

-- Seed default alert configs for known cron jobs
INSERT INTO public.cron_alert_config (job_name, max_consecutive_failures, stale_threshold_minutes, alert_enabled)
SELECT
  j.jobname,
  3,
  CASE
    WHEN j.schedule LIKE '*/5 %' THEN 15
    WHEN j.schedule LIKE '*/10 %' THEN 30
    WHEN j.schedule LIKE '*/15 %' THEN 45
    WHEN j.schedule LIKE '0 */%' THEN 180
    ELSE 60
  END,
  true
FROM cron.job j
ON CONFLICT (job_name) DO NOTHING;

-- Grant execute to authenticated (admin check is in the EF, not here)
GRANT EXECUTE ON FUNCTION public.admin_toggle_cron_job TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_cron_schedule TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_cron_run_history TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_cron_job_command TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_force_run_cron_job TO service_role;

-- ═══════════════════════════════════════════════════════════
-- 0.176: First A/B Test Feature Flag
-- ═══════════════════════════════════════════════════════════

INSERT INTO public.feature_flags (id, enabled, description, rollout_pct, updated_at)
VALUES (
  'ab_landing_cta_copy',
  true,
  'A/B test: Landing page CTA copy. Variants: control (Start Free), variant_a (Find Your Next Job), variant_b (Start Searching)',
  100,
  now()
)
ON CONFLICT (id) DO NOTHING;
