-- v6.36-deploy-visibility.sql
-- BI-03: Deployment Visibility System — Environment Status & Release Tracking
-- Completes the BI trilogy: BI-01 (deploy tracking), BI-02 (CI/bundle analytics), BI-03 (visibility)
-- Provides environment version matrix, drift detection, release history, and deploy cadence analytics

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Tables
-- ══════════════════════════════════════════════════════════════════════════════

-- Environment versions — current deployed version snapshot per surface per environment
-- Updated on every successful deploy completion. One row per surface×environment pair.
CREATE TABLE IF NOT EXISTS environment_versions (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  surface         text NOT NULL CHECK (surface IN ('dashboard','admin','extension','landing','edge-functions','migrations','css','spa','infrastructure')),
  environment     text NOT NULL DEFAULT 'production' CHECK (environment IN ('production','staging','preview')),
  product_version text,                  -- BJ_VERSION at time of deploy
  git_sha         text,
  git_tag         text,
  git_branch      text DEFAULT 'main',
  deploy_id       uuid REFERENCES deploy_events(id) ON DELETE SET NULL,
  deployed_at     timestamptz DEFAULT now(),
  deployed_by     text DEFAULT 'github-actions',
  metadata        jsonb DEFAULT '{}'::jsonb,  -- S-12 scar: extensible
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (surface, environment)           -- One row per surface×environment pair
);

-- Release notes — human or CI-generated summaries linked to git tags
CREATE TABLE IF NOT EXISTS release_notes (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  git_tag         text NOT NULL UNIQUE,
  product_version text,
  title           text NOT NULL,                -- "BI-02: CI Pipeline Analytics"
  summary         text,                         -- Markdown-formatted release notes
  surfaces        text[] DEFAULT '{}',          -- Which surfaces were affected
  finding_ids     text[] DEFAULT '{}',          -- Finding IDs resolved in this release
  deploy_ids      uuid[] DEFAULT '{}',          -- Associated deploy_events IDs
  release_type    text NOT NULL DEFAULT 'feature' CHECK (release_type IN ('feature','bugfix','security','hotfix','infrastructure')),
  is_rollback     boolean DEFAULT false,
  metadata        jsonb DEFAULT '{}'::jsonb,    -- S-12 scar: extensible
  released_at     timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Indexes
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_env_versions_surface_env
  ON environment_versions (surface, environment);

CREATE INDEX IF NOT EXISTS idx_env_versions_deployed_at
  ON environment_versions (deployed_at DESC);

CREATE INDEX IF NOT EXISTS idx_env_versions_deploy_id
  ON environment_versions (deploy_id) WHERE deploy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_release_notes_tag
  ON release_notes (git_tag);

CREATE INDEX IF NOT EXISTS idx_release_notes_released_at
  ON release_notes (released_at DESC);

CREATE INDEX IF NOT EXISTS idx_release_notes_type
  ON release_notes (release_type, released_at DESC);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. RLS
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE environment_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_notes ENABLE ROW LEVEL SECURITY;

-- Admin read access
CREATE POLICY env_versions_admin_read ON environment_versions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Service role write (CI/EF writes)
CREATE POLICY env_versions_service_write ON environment_versions
  FOR ALL USING (
    current_setting('role', true) = 'service_role'
  );

CREATE POLICY release_notes_admin_read ON release_notes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY release_notes_service_write ON release_notes
  FOR ALL USING (
    current_setting('role', true) = 'service_role'
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Views
-- ══════════════════════════════════════════════════════════════════════════════

-- Environment drift detection: surfaces where environments have different versions
CREATE OR REPLACE VIEW v_environment_drift AS
SELECT
  ev.surface,
  MAX(CASE WHEN ev.environment = 'production' THEN ev.product_version END)  AS prod_version,
  MAX(CASE WHEN ev.environment = 'production' THEN ev.git_sha END)          AS prod_sha,
  MAX(CASE WHEN ev.environment = 'production' THEN ev.deployed_at END)      AS prod_deployed_at,
  MAX(CASE WHEN ev.environment = 'staging' THEN ev.product_version END)     AS staging_version,
  MAX(CASE WHEN ev.environment = 'staging' THEN ev.git_sha END)             AS staging_sha,
  MAX(CASE WHEN ev.environment = 'staging' THEN ev.deployed_at END)         AS staging_deployed_at,
  MAX(CASE WHEN ev.environment = 'preview' THEN ev.product_version END)     AS preview_version,
  MAX(CASE WHEN ev.environment = 'preview' THEN ev.git_sha END)             AS preview_sha,
  MAX(CASE WHEN ev.environment = 'preview' THEN ev.deployed_at END)         AS preview_deployed_at,
  CASE
    WHEN MAX(CASE WHEN ev.environment = 'production' THEN ev.git_sha END) IS DISTINCT FROM
         MAX(CASE WHEN ev.environment = 'staging' THEN ev.git_sha END)
    THEN true
    ELSE false
  END AS has_drift
FROM environment_versions ev
GROUP BY ev.surface;

-- Release timeline: releases with associated deploy and surface data
CREATE OR REPLACE VIEW v_release_timeline AS
SELECT
  rn.id,
  rn.git_tag,
  rn.product_version,
  rn.title,
  rn.summary,
  rn.surfaces,
  rn.finding_ids,
  rn.release_type,
  rn.is_rollback,
  rn.released_at,
  COALESCE(array_length(rn.surfaces, 1), 0)    AS surface_count,
  COALESCE(array_length(rn.finding_ids, 1), 0)  AS findings_resolved,
  COALESCE(array_length(rn.deploy_ids, 1), 0)   AS deploy_count
FROM release_notes rn
ORDER BY rn.released_at DESC;

-- Deploy cadence: deployment frequency by surface over rolling windows
CREATE OR REPLACE VIEW v_deploy_cadence AS
SELECT
  de.surface,
  COUNT(*) FILTER (WHERE de.created_at >= now() - interval '7 days')  AS deploys_7d,
  COUNT(*) FILTER (WHERE de.created_at >= now() - interval '30 days') AS deploys_30d,
  COUNT(*) FILTER (WHERE de.created_at >= now() - interval '90 days') AS deploys_90d,
  COUNT(*) FILTER (WHERE de.status = 'success' AND de.created_at >= now() - interval '30 days') AS successes_30d,
  COUNT(*) FILTER (WHERE de.status = 'failed' AND de.created_at >= now() - interval '30 days')  AS failures_30d,
  COUNT(*) FILTER (WHERE de.status = 'rolled-back' AND de.created_at >= now() - interval '30 days') AS rollbacks_30d,
  ROUND(AVG(de.duration_ms) FILTER (WHERE de.created_at >= now() - interval '30 days'))::integer AS avg_duration_30d_ms,
  MAX(de.created_at) AS last_deploy_at
FROM deploy_events de
WHERE de.environment = 'production'
GROUP BY de.surface;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. Combined analytics function
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_deployment_visibility()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'environment_matrix', (
      SELECT COALESCE(jsonb_agg(row_to_json(ev.*)), '[]'::jsonb)
      FROM environment_versions ev
    ),
    'drift_report', (
      SELECT COALESCE(jsonb_agg(row_to_json(d.*)), '[]'::jsonb)
      FROM v_environment_drift d
    ),
    'release_timeline', (
      SELECT COALESCE(jsonb_agg(row_to_json(r.*)), '[]'::jsonb)
      FROM (SELECT * FROM v_release_timeline LIMIT 50) r
    ),
    'deploy_cadence', (
      SELECT COALESCE(jsonb_agg(row_to_json(c.*)), '[]'::jsonb)
      FROM v_deploy_cadence c
    ),
    'summary', jsonb_build_object(
      'total_surfaces', (SELECT COUNT(DISTINCT surface) FROM environment_versions),
      'surfaces_with_drift', (SELECT COUNT(*) FROM v_environment_drift WHERE has_drift = true),
      'total_releases', (SELECT COUNT(*) FROM release_notes),
      'latest_release', (SELECT git_tag FROM release_notes ORDER BY released_at DESC LIMIT 1),
      'latest_release_at', (SELECT released_at FROM release_notes ORDER BY released_at DESC LIMIT 1)
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. Auto-update trigger: update environment_versions on deploy completion
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_update_environment_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only trigger on successful deploy completions
  IF NEW.status = 'success' AND (OLD.status IS DISTINCT FROM 'success') THEN
    INSERT INTO environment_versions (surface, environment, product_version, git_sha, git_tag, git_branch, deploy_id, deployed_at, deployed_by, updated_at)
    VALUES (NEW.surface, NEW.environment, NEW.product_version, NEW.git_sha, NEW.git_tag, NEW.git_branch, NEW.id, COALESCE(NEW.completed_at, now()), NEW.triggered_by, now())
    ON CONFLICT (surface, environment) DO UPDATE SET
      product_version = EXCLUDED.product_version,
      git_sha         = EXCLUDED.git_sha,
      git_tag         = EXCLUDED.git_tag,
      git_branch      = EXCLUDED.git_branch,
      deploy_id       = EXCLUDED.deploy_id,
      deployed_at     = EXCLUDED.deployed_at,
      deployed_by     = EXCLUDED.deployed_by,
      updated_at      = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deploy_events_update_env_version
  AFTER UPDATE ON deploy_events
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_environment_version();

-- Also trigger on INSERT with status='success' (for pre-recorded successful deploys)
CREATE TRIGGER trg_deploy_events_insert_env_version
  AFTER INSERT ON deploy_events
  FOR EACH ROW
  WHEN (NEW.status = 'success')
  EXECUTE FUNCTION fn_update_environment_version();

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. Weekly cleanup cron (90-day retention, offset from BI-01/BI-02)
-- ══════════════════════════════════════════════════════════════════════════════

-- Release notes are kept indefinitely (historical record).
-- environment_versions only keeps current snapshot (no cleanup needed).
-- No periodic cleanup required for this migration.
