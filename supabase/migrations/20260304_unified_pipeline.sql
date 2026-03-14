-- ============================================================
-- Unified Pipeline Table Migration
-- Brilliant Jobs v6.95 — Overlay Pipeline Session 1
-- Date: 2026-03-04
-- Creates: pipeline, overlay_analytics tables + backfill
-- ============================================================

-- 1. ENUMS (idempotent)
DO $$ BEGIN
  CREATE TYPE pipeline_entry_source AS ENUM (
    'manual', 'auto_apply', 'overlay', 'gmail_detected', 'calendar_detected', 'import'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pipeline_stage AS ENUM (
    'saved', 'applied', 'phone_screen', 'interview', 'offer',
    'rejected', 'withdrawn', 'posting_closed'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. PIPELINE TABLE
CREATE TABLE IF NOT EXISTS pipeline (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Job identity
  source_url            text NOT NULL,
  source_platform       text,
  job_title             text,
  company_name          text,
  location              text,
  salary_raw            text,
  salary_min            integer,
  salary_max            integer,
  description_snippet   text,

  -- BJ feed linkage (nullable)
  job_id_ref            text,
  ats_source_ref        text,

  -- Pipeline state
  stage                 pipeline_stage NOT NULL DEFAULT 'saved',
  stage_changed_at      timestamptz NOT NULL DEFAULT now(),
  entry_source          pipeline_entry_source NOT NULL DEFAULT 'manual',
  activity_log          jsonb[] NOT NULL DEFAULT '{}',

  -- Resume
  resume_id             uuid REFERENCES resumes(id) ON DELETE SET NULL,

  -- Intelligence scores
  match_score           integer,
  match_label           text,
  fraud_score           integer,
  fraud_label           text,
  ai_content_score      numeric(4,3),
  ai_content_label      text,

  -- Auto-apply metadata
  applied_at            timestamptz,
  confirmation_detected boolean DEFAULT false,
  confirmation_pattern  text,
  approval_mode         text,

  -- Migration tracking
  migration_version     integer DEFAULT 0,
  legacy_pa_id          uuid,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 3. UNIQUE CONSTRAINT
DO $$ BEGIN
  ALTER TABLE pipeline ADD CONSTRAINT pipeline_user_source_url_unique UNIQUE (user_id, source_url);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4. INDEXES
CREATE INDEX IF NOT EXISTS idx_pipeline_user_stage ON pipeline (user_id, stage);
CREATE INDEX IF NOT EXISTS idx_pipeline_user_entry_source ON pipeline (user_id, entry_source);
CREATE INDEX IF NOT EXISTS idx_pipeline_source_url ON pipeline (source_url);
CREATE INDEX IF NOT EXISTS idx_pipeline_company_name ON pipeline (company_name);
CREATE INDEX IF NOT EXISTS idx_pipeline_updated_desc ON pipeline (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_user_updated_desc ON pipeline (user_id, updated_at DESC);

-- 5. UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION set_pipeline_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pipeline_updated_at ON pipeline;
CREATE TRIGGER trg_pipeline_updated_at
  BEFORE UPDATE ON pipeline
  FOR EACH ROW
  EXECUTE FUNCTION set_pipeline_updated_at();

-- 6. RLS
ALTER TABLE pipeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pipeline_user_crud ON pipeline;
DO $$ BEGIN
  CREATE POLICY pipeline_user_crud ON pipeline
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP POLICY IF EXISTS pipeline_admin_read ON pipeline;
DO $$ BEGIN
  CREATE POLICY pipeline_admin_read ON pipeline
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
      )
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 7. OVERLAY ANALYTICS TABLE
CREATE TABLE IF NOT EXISTS overlay_analytics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id      text,
  source_platform text,
  action_type     text NOT NULL,
  url_hash        text,
  tier            text,
  meta            jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_overlay_analytics_user ON overlay_analytics (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_overlay_analytics_action ON overlay_analytics (action_type, created_at DESC);

ALTER TABLE overlay_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS overlay_analytics_insert ON overlay_analytics;
DO $$ BEGIN
  CREATE POLICY overlay_analytics_insert ON overlay_analytics
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP POLICY IF EXISTS overlay_analytics_user_read ON overlay_analytics;
DO $$ BEGIN
  CREATE POLICY overlay_analytics_user_read ON overlay_analytics
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 8. BACKFILL pending_applications → pipeline
INSERT INTO pipeline (
  user_id, source_url, source_platform, job_title, company_name,
  stage, entry_source, applied_at, resume_id, match_score,
  confirmation_detected, confirmation_pattern, approval_mode,
  legacy_pa_id, activity_log, created_at, updated_at
)
SELECT
  pa.user_id,
  COALESCE(pa.job_url, 'legacy:pa:' || pa.id::text),
  COALESCE(pa.ats_source, 'unknown'),
  COALESCE(pa.job_title, 'Unknown Title'),
  COALESCE(pa.company_name, 'Unknown Company'),
  CASE pa.status
    WHEN 'submitted' THEN 'applied'::pipeline_stage
    WHEN 'pending'   THEN 'saved'::pipeline_stage
    WHEN 'approved'  THEN 'saved'::pipeline_stage
    WHEN 'skipped'   THEN 'rejected'::pipeline_stage
    WHEN 'expired'   THEN 'posting_closed'::pipeline_stage
    WHEN 'failed'    THEN 'saved'::pipeline_stage
    ELSE                  'saved'::pipeline_stage
  END,
  'auto_apply'::pipeline_entry_source,
  pa.submitted_at,
  CASE WHEN EXISTS (SELECT 1 FROM resumes r WHERE r.id = pa.resume_id) THEN pa.resume_id ELSE NULL END,
  pa.original_score,
  (pa.confirmation_detected_at IS NOT NULL),
  pa.confirmation_pattern,
  pa.approval_mode,
  pa.id,
  ARRAY[jsonb_build_object(
    'action', 'backfill_from_pending_applications',
    'timestamp', COALESCE(pa.created_at, now()),
    'detail', jsonb_build_object(
      'original_status', pa.status,
      'ats_source', COALESCE(pa.ats_source, 'unknown'),
      'job_id', pa.job_id
    )
  )],
  COALESCE(pa.created_at, now()),
  COALESCE(pa.submitted_at, pa.created_at, now())
FROM pending_applications pa
ON CONFLICT (user_id, source_url) DO NOTHING;

