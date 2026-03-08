-- v6.34-deploy-tracker.sql
-- BI-01: Build Instrumentation & Deployment Visibility System
-- Tracks all deployments, builds, and deploy health across surfaces
-- Provides admin visibility into release cadence, failure rates, and rollback history

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Tables
-- ══════════════════════════════════════════════════════════════════════════════

-- Deploy events — one row per deployment (manual or CI)
CREATE TABLE IF NOT EXISTS deploy_events (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  surface         text NOT NULL CHECK (surface IN ('dashboard','admin','extension','landing','edge-functions','migrations','css','spa','infrastructure')),
  environment     text NOT NULL DEFAULT 'production' CHECK (environment IN ('production','staging','preview')),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in-progress','success','failed','rolled-back')),
  trigger_type    text NOT NULL DEFAULT 'ci' CHECK (trigger_type IN ('ci','manual','hotfix','rollback','cron')),
  git_sha         text,
  git_branch      text DEFAULT 'main',
  git_tag         text,
  product_version text,                  -- BJ_VERSION at time of deploy
  deploy_url      text,                  -- Vercel preview URL or prod URL
  changed_files   integer DEFAULT 0,     -- Number of files changed
  changed_summary text,                  -- Brief description: "3 EFs, 2 migrations"
  duration_ms     integer,               -- Time from start to finish
  error_message   text,                  -- Populated on failure
  triggered_by    text DEFAULT 'github-actions',  -- who/what initiated
  metadata        jsonb DEFAULT '{}'::jsonb,       -- S-12 scar: extensible metadata
  created_at      timestamptz DEFAULT now(),
  completed_at    timestamptz
);

-- Build events — one row per build step (JS bundle, CSS, extension, etc.)
CREATE TABLE IF NOT EXISTS build_events (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  deploy_id       uuid REFERENCES deploy_events(id) ON DELETE CASCADE,
  step_name       text NOT NULL,         -- 'js-bundle', 'css-bundle', 'extension-build', 'migration', 'ef-deploy'
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','success','failed','skipped')),
  duration_ms     integer,
  output_size_kb  integer,               -- Bundle size tracking
  error_message   text,
  metadata        jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz DEFAULT now(),
  completed_at    timestamptz
);

-- Deploy health log — periodic health checks after deploy
CREATE TABLE IF NOT EXISTS deploy_health_log (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  deploy_id       uuid REFERENCES deploy_events(id) ON DELETE CASCADE,
  check_type      text NOT NULL CHECK (check_type IN ('smoke','error-rate','latency','availability','rollback-trigger')),
  status          text NOT NULL CHECK (status IN ('healthy','degraded','critical')),
  metric_value    numeric,               -- e.g., error rate %, p95 latency ms
  threshold       numeric,               -- threshold that was evaluated against
  details         jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Indexes
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_deploy_events_surface_created
  ON deploy_events (surface, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deploy_events_status
  ON deploy_events (status) WHERE status != 'success';

CREATE INDEX IF NOT EXISTS idx_deploy_events_env_created
  ON deploy_events (environment, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_build_events_deploy_id
  ON build_events (deploy_id);

CREATE INDEX IF NOT EXISTS idx_deploy_health_deploy_id
  ON deploy_health_log (deploy_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deploy_events_git_sha
  ON deploy_events (git_sha) WHERE git_sha IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. RLS
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE deploy_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE build_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE deploy_health_log ENABLE ROW LEVEL SECURITY;

-- Admin read-only for all three tables
CREATE POLICY deploy_events_admin_read ON deploy_events
  FOR SELECT USING (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY build_events_admin_read ON build_events
  FOR SELECT USING (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY deploy_health_admin_read ON deploy_health_log
  FOR SELECT USING (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
  );

-- Service role can insert/update (for EF and CI writes)
CREATE POLICY deploy_events_service_write ON deploy_events
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY build_events_service_write ON build_events
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY deploy_health_service_write ON deploy_health_log
  FOR ALL USING (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Views
-- ══════════════════════════════════════════════════════════════════════════════

-- Dashboard view: recent deploys with build step summary
CREATE OR REPLACE VIEW v_deploy_dashboard AS
SELECT
  d.id,
  d.surface,
  d.environment,
  d.status,
  d.trigger_type,
  d.git_sha,
  d.git_tag,
  d.product_version,
  d.changed_files,
  d.changed_summary,
  d.duration_ms,
  d.error_message,
  d.triggered_by,
  d.created_at,
  d.completed_at,
  (SELECT count(*) FROM build_events b WHERE b.deploy_id = d.id) AS build_step_count,
  (SELECT count(*) FROM build_events b WHERE b.deploy_id = d.id AND b.status = 'failed') AS failed_steps,
  (SELECT count(*) FROM deploy_health_log h WHERE h.deploy_id = d.id AND h.status = 'critical') AS critical_health_checks
FROM deploy_events d
ORDER BY d.created_at DESC;

-- Surface health summary: per-surface stats
CREATE OR REPLACE VIEW v_surface_deploy_health AS
SELECT
  surface,
  count(*) AS total_deploys,
  count(*) FILTER (WHERE status = 'success') AS successful,
  count(*) FILTER (WHERE status = 'failed') AS failed,
  count(*) FILTER (WHERE status = 'rolled-back') AS rolled_back,
  CASE WHEN count(*) > 0
    THEN round(100.0 * count(*) FILTER (WHERE status = 'success') / count(*), 1)
    ELSE 0
  END AS success_rate_pct,
  avg(duration_ms) FILTER (WHERE status = 'success') AS avg_duration_ms,
  max(created_at) AS last_deploy_at,
  max(product_version) AS latest_version
FROM deploy_events
WHERE created_at > now() - interval '30 days'
GROUP BY surface
ORDER BY surface;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. Functions
-- ══════════════════════════════════════════════════════════════════════════════

-- Deploy summary: overall stats for admin dashboard
CREATE OR REPLACE FUNCTION fn_deploy_summary(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'period_days', p_days,
    'total_deploys', count(*),
    'successful', count(*) FILTER (WHERE status = 'success'),
    'failed', count(*) FILTER (WHERE status = 'failed'),
    'rolled_back', count(*) FILTER (WHERE status = 'rolled-back'),
    'in_progress', count(*) FILTER (WHERE status IN ('pending', 'in-progress')),
    'success_rate_pct', CASE WHEN count(*) > 0
      THEN round(100.0 * count(*) FILTER (WHERE status = 'success') / count(*), 1)
      ELSE 0
    END,
    'avg_duration_ms', round(avg(duration_ms) FILTER (WHERE status = 'success')),
    'deploys_today', count(*) FILTER (WHERE created_at > now() - interval '1 day'),
    'deploys_this_week', count(*) FILTER (WHERE created_at > now() - interval '7 days'),
    'surfaces', (
      SELECT jsonb_agg(row_to_json(s))
      FROM v_surface_deploy_health s
    ),
    'recent', (
      SELECT jsonb_agg(row_to_json(r))
      FROM (
        SELECT id, surface, status, trigger_type, git_tag, product_version,
               duration_ms, changed_summary, error_message, created_at, completed_at
        FROM deploy_events
        WHERE created_at > now() - (p_days || ' days')::interval
        ORDER BY created_at DESC
        LIMIT 25
      ) r
    ),
    'daily_counts', (
      SELECT jsonb_agg(row_to_json(dc))
      FROM (
        SELECT
          date_trunc('day', created_at)::date AS day,
          count(*) AS total,
          count(*) FILTER (WHERE status = 'success') AS success,
          count(*) FILTER (WHERE status = 'failed') AS failed
        FROM deploy_events
        WHERE created_at > now() - (p_days || ' days')::interval
        GROUP BY date_trunc('day', created_at)
        ORDER BY day DESC
      ) dc
    )
  ) INTO result
  FROM deploy_events
  WHERE created_at > now() - (p_days || ' days')::interval;

  RETURN result;
END;
$$;

-- Record a deploy event (called by CI or manual trigger)
CREATE OR REPLACE FUNCTION fn_record_deploy(
  p_surface text,
  p_environment text DEFAULT 'production',
  p_trigger_type text DEFAULT 'ci',
  p_git_sha text DEFAULT NULL,
  p_git_branch text DEFAULT 'main',
  p_git_tag text DEFAULT NULL,
  p_product_version text DEFAULT NULL,
  p_changed_files integer DEFAULT 0,
  p_changed_summary text DEFAULT NULL,
  p_triggered_by text DEFAULT 'github-actions',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO deploy_events (
    surface, environment, status, trigger_type,
    git_sha, git_branch, git_tag, product_version,
    changed_files, changed_summary, triggered_by, metadata
  ) VALUES (
    p_surface, p_environment, 'in-progress', p_trigger_type,
    p_git_sha, p_git_branch, p_git_tag, p_product_version,
    p_changed_files, p_changed_summary, p_triggered_by, p_metadata
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Complete a deploy event (success or failure)
CREATE OR REPLACE FUNCTION fn_complete_deploy(
  p_deploy_id uuid,
  p_status text DEFAULT 'success',
  p_duration_ms integer DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE deploy_events
  SET status = p_status,
      duration_ms = p_duration_ms,
      error_message = p_error_message,
      completed_at = now()
  WHERE id = p_deploy_id;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. Cleanup cron — purge deploy events older than 90 days
-- ══════════════════════════════════════════════════════════════════════════════

SELECT cron.schedule(
  'cleanup-deploy-events-90d',
  '0 5 * * 0',  -- weekly Sunday 5am UTC
  $$DELETE FROM deploy_health_log WHERE created_at < now() - interval '90 days';
    DELETE FROM build_events WHERE created_at < now() - interval '90 days';
    DELETE FROM deploy_events WHERE created_at < now() - interval '90 days';$$
);

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. Seed: log this migration as the first deploy event
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO deploy_events (surface, environment, status, trigger_type, changed_summary, triggered_by, duration_ms, completed_at)
VALUES ('infrastructure', 'production', 'success', 'manual', 'BI-01: Deploy tracker migration', 'claude-session', 0, now());

-- Log to agent_action_log for CrewAI visibility
INSERT INTO agent_action_log (agent_name, action_type, action_detail, executed, result_summary)
VALUES ('system', 'deploy_tracker_migration', 'v6.34-deploy-tracker.sql — BI-01 Build Instrumentation', false,
        'Tables: deploy_events, build_events, deploy_health_log. Views: v_deploy_dashboard, v_surface_deploy_health. Functions: fn_deploy_summary, fn_record_deploy, fn_complete_deploy. Cron: weekly cleanup.');
