-- v6.35-build-analytics.sql
-- BI-02: CI Pipeline Analytics & Bundle Size Tracking
-- Extends BI-01 deploy tracking with build step performance, bundle size history, and CI workflow visibility
-- Provides admin analytics for build health, CI trends, and bundle size regression detection

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Tables
-- ══════════════════════════════════════════════════════════════════════════════

-- CI workflow runs — one row per GitHub Actions workflow execution
CREATE TABLE IF NOT EXISTS ci_workflow_runs (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_name   text NOT NULL,              -- 'CI', 'deploy', 'dry-run', 'load-test', 'psi-audit', 'selector-monitor'
  run_id          bigint,                     -- GitHub Actions run_id (external reference)
  run_number      integer,                    -- GitHub Actions run_number
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled','timed_out')),
  conclusion      text CHECK (conclusion IN ('success','failure','cancelled','skipped','timed_out','action_required',NULL)),
  trigger_event   text DEFAULT 'push',        -- 'push', 'pull_request', 'schedule', 'workflow_dispatch'
  git_sha         text,
  git_branch      text DEFAULT 'main',
  actor           text,                       -- GitHub username that triggered the run
  runner_os       text DEFAULT 'ubuntu-latest',
  duration_ms     integer,
  total_jobs      integer DEFAULT 0,
  failed_jobs     integer DEFAULT 0,
  deploy_id       uuid REFERENCES deploy_events(id) ON DELETE SET NULL,  -- Link to deploy if this CI run triggered a deploy
  metadata        jsonb DEFAULT '{}'::jsonb,  -- S-12 scar: extensible
  created_at      timestamptz DEFAULT now(),
  completed_at    timestamptz
);

-- Bundle size history — one row per surface per measurement (captured after each build)
CREATE TABLE IF NOT EXISTS bundle_size_history (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  surface         text NOT NULL CHECK (surface IN ('dashboard','admin','extension','landing','edge-functions','migrations','css','spa','infrastructure')),
  bundle_name     text NOT NULL,              -- 'dashboard.min.js', 'admin.min.js', 'extension.zip', 'styles.css', etc.
  size_bytes      integer NOT NULL,
  gzip_bytes      integer,                    -- Gzipped size (if measured)
  product_version text,                       -- BJ_VERSION at time of measurement
  git_sha         text,
  deploy_id       uuid REFERENCES deploy_events(id) ON DELETE SET NULL,
  metadata        jsonb DEFAULT '{}'::jsonb,  -- S-12 scar: extensible (e.g., { chunks: [...] })
  created_at      timestamptz DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Indexes
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_ci_workflow_runs_name_created
  ON ci_workflow_runs (workflow_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ci_workflow_runs_status
  ON ci_workflow_runs (status) WHERE status != 'completed';

CREATE INDEX IF NOT EXISTS idx_ci_workflow_runs_conclusion
  ON ci_workflow_runs (conclusion, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ci_workflow_runs_deploy_id
  ON ci_workflow_runs (deploy_id) WHERE deploy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bundle_size_surface_created
  ON bundle_size_history (surface, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bundle_size_bundle_name
  ON bundle_size_history (bundle_name, created_at DESC);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. RLS
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE ci_workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bundle_size_history ENABLE ROW LEVEL SECURITY;

-- Admin read-only
CREATE POLICY ci_workflow_runs_admin_read ON ci_workflow_runs
  FOR SELECT USING (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY bundle_size_admin_read ON bundle_size_history
  FOR SELECT USING (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
  );

-- Service role write
CREATE POLICY ci_workflow_runs_service_write ON ci_workflow_runs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY bundle_size_service_write ON bundle_size_history
  FOR ALL USING (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Views
-- ══════════════════════════════════════════════════════════════════════════════

-- Build step performance: avg/p95 duration and failure rate per step name (last 30 days)
CREATE OR REPLACE VIEW v_build_step_performance AS
SELECT
  step_name,
  count(*) AS total_runs,
  count(*) FILTER (WHERE status = 'success') AS successful,
  count(*) FILTER (WHERE status = 'failed') AS failed,
  CASE WHEN count(*) > 0
    THEN round(100.0 * count(*) FILTER (WHERE status = 'failed') / count(*), 1)
    ELSE 0
  END AS failure_rate_pct,
  round(avg(duration_ms) FILTER (WHERE status = 'success')) AS avg_duration_ms,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE status = 'success')) AS p95_duration_ms,
  round(min(duration_ms) FILTER (WHERE status = 'success')) AS min_duration_ms,
  round(max(duration_ms) FILTER (WHERE status = 'success')) AS max_duration_ms,
  max(created_at) AS last_run_at
FROM build_events
WHERE created_at > now() - interval '30 days'
GROUP BY step_name
ORDER BY total_runs DESC;

-- Bundle size trends: last 30 measurements per surface+bundle
CREATE OR REPLACE VIEW v_bundle_size_trends AS
SELECT
  surface,
  bundle_name,
  size_bytes,
  gzip_bytes,
  product_version,
  created_at,
  -- Calculate delta from previous measurement
  size_bytes - lag(size_bytes) OVER (PARTITION BY surface, bundle_name ORDER BY created_at) AS delta_bytes,
  -- Row number for limiting
  row_number() OVER (PARTITION BY surface, bundle_name ORDER BY created_at DESC) AS rn
FROM bundle_size_history
ORDER BY surface, bundle_name, created_at DESC;

-- CI workflow health: per-workflow stats over 30 days
CREATE OR REPLACE VIEW v_ci_workflow_health AS
SELECT
  workflow_name,
  count(*) AS total_runs,
  count(*) FILTER (WHERE conclusion = 'success') AS successful,
  count(*) FILTER (WHERE conclusion = 'failure') AS failed,
  count(*) FILTER (WHERE conclusion = 'cancelled') AS cancelled,
  CASE WHEN count(*) > 0
    THEN round(100.0 * count(*) FILTER (WHERE conclusion = 'success') / count(*), 1)
    ELSE 0
  END AS success_rate_pct,
  round(avg(duration_ms) FILTER (WHERE conclusion = 'success')) AS avg_duration_ms,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE conclusion = 'success')) AS p95_duration_ms,
  max(created_at) AS last_run_at
FROM ci_workflow_runs
WHERE created_at > now() - interval '30 days'
GROUP BY workflow_name
ORDER BY total_runs DESC;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. Functions
-- ══════════════════════════════════════════════════════════════════════════════

-- Build analytics: combined stats for admin dashboard
CREATE OR REPLACE FUNCTION fn_build_analytics(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'period_days', p_days,

    -- Build step performance
    'build_steps', (
      SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb)
      FROM v_build_step_performance s
    ),

    -- CI workflow health
    'ci_workflows', (
      SELECT COALESCE(jsonb_agg(row_to_json(w)), '[]'::jsonb)
      FROM v_ci_workflow_health w
    ),

    -- Recent CI runs (last 20)
    'recent_ci_runs', (
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      FROM (
        SELECT id, workflow_name, status, conclusion, trigger_event,
               git_branch, actor, duration_ms, total_jobs, failed_jobs,
               created_at, completed_at
        FROM ci_workflow_runs
        WHERE created_at > now() - (p_days || ' days')::interval
        ORDER BY created_at DESC
        LIMIT 20
      ) r
    ),

    -- Bundle size latest per surface+bundle
    'bundle_sizes', (
      SELECT COALESCE(jsonb_agg(row_to_json(b)), '[]'::jsonb)
      FROM (
        SELECT surface, bundle_name, size_bytes, gzip_bytes,
               product_version, delta_bytes, created_at
        FROM v_bundle_size_trends
        WHERE rn = 1
      ) b
    ),

    -- Bundle size trends (last 15 per bundle for sparklines)
    'bundle_trends', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      FROM (
        SELECT surface, bundle_name, size_bytes, created_at
        FROM v_bundle_size_trends
        WHERE rn <= 15
      ) t
    ),

    -- Summary counts
    'total_builds', (
      SELECT count(*) FROM build_events
      WHERE created_at > now() - (p_days || ' days')::interval
    ),
    'total_ci_runs', (
      SELECT count(*) FROM ci_workflow_runs
      WHERE created_at > now() - (p_days || ' days')::interval
    ),
    'ci_success_rate', (
      SELECT CASE WHEN count(*) > 0
        THEN round(100.0 * count(*) FILTER (WHERE conclusion = 'success') / count(*), 1)
        ELSE 0
      END
      FROM ci_workflow_runs
      WHERE created_at > now() - (p_days || ' days')::interval
    ),
    'avg_build_duration', (
      SELECT round(avg(duration_ms))
      FROM build_events
      WHERE created_at > now() - (p_days || ' days')::interval
        AND status = 'success'
    ),
    'bundle_regressions', (
      SELECT count(*)
      FROM v_bundle_size_trends
      WHERE rn = 1 AND delta_bytes > 0
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- Cleanup cron: extend BI-01 pattern — keep 90 days of CI + bundle data
-- (BI-01 already has weekly cleanup for deploy_events/build_events/deploy_health_log)
SELECT cron.schedule(
  'cleanup-build-analytics',
  '0 4 * * 0',  -- Sundays at 4 AM UTC (offset from BI-01's 3 AM)
  $$
    DELETE FROM ci_workflow_runs WHERE created_at < now() - interval '90 days';
    DELETE FROM bundle_size_history WHERE created_at < now() - interval '90 days';
  $$
);
