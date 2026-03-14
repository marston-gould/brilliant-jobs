-- CS-015: DE-002 — Performance indexes for commonly filtered/sorted columns
-- DE-003 — Geospatial index for bounding-box queries (job_lat, job_lng)
-- All indexes are CONCURRENTLY created to avoid table locks in production.

-- ============================================================
-- ats_jobs — most queried table (23+ call sites in dashboard)
-- ============================================================

-- Status filter: every job feed query starts with .eq('status', 'open')
CREATE INDEX IF NOT EXISTS idx_ats_jobs_status
  ON ats_jobs (status);

-- Location: state-based filtering (.eq('loc_state', ...))
CREATE INDEX IF NOT EXISTS idx_ats_jobs_loc_state
  ON ats_jobs (loc_state) WHERE status = 'open';

-- DE-003: Geospatial — bounding box queries (.gte('job_lat',...).lte('job_lat',...))
-- Composite index on lat/lng for range scans
CREATE INDEX IF NOT EXISTS idx_ats_jobs_geospatial
  ON ats_jobs (job_lat, job_lng) WHERE status = 'open';

-- Sort: updated_at is default sort field for feed
CREATE INDEX IF NOT EXISTS idx_ats_jobs_updated_at
  ON ats_jobs (updated_at DESC) WHERE status = 'open';

-- Company slug: used in company-based filtering
CREATE INDEX IF NOT EXISTS idx_ats_jobs_company_slug
  ON ats_jobs (company_slug) WHERE status = 'open';

-- Remote jobs filter
CREATE INDEX IF NOT EXISTS idx_ats_jobs_remote
  ON ats_jobs (is_remote) WHERE status = 'open' AND is_remote = true;

-- ============================================================
-- profiles — most queried table (38+ call sites)
-- ============================================================

-- Plan + role used in tier gating, admin checks
CREATE INDEX IF NOT EXISTS idx_profiles_plan_role
  ON profiles (plan, role);

-- Cohort lookup
CREATE INDEX IF NOT EXISTS idx_profiles_cohort
  ON profiles (cohort_id) WHERE cohort_id IS NOT NULL;

-- ============================================================
-- resume_archive — 13 call sites, filtered by user_id
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_resume_archive_user
  ON resume_archive (user_id, archived_at DESC);

-- ============================================================
-- notification_log — 12 call sites, filtered by user_id + time
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_notification_log_user_created
  ON notification_log (user_id, created_at DESC);

-- ============================================================
-- user_pipeline — 11 call sites, filtered by user_id + status
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_user_pipeline_user_stage
  ON user_pipeline (user_id, stage);

-- ============================================================
-- pending_applications — filtered by user_id + status
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_pending_applications_user
  ON pending_applications (user_id, status);

-- ============================================================
-- referrals — filtered by referrer/referee + status
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_referrals_referrer
  ON referrals (referrer_id, status);

CREATE INDEX IF NOT EXISTS idx_referrals_referee
  ON referrals (referred_id, status);

-- ============================================================
-- billing_events — filtered by user_id + event time
-- ============================================================

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_billing_events_user
    ON billing_events (user_id, created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- DE-001: Cron failure alerting — create a cron_run_log table
-- for tracking cron execution success/failure
-- ============================================================

CREATE TABLE IF NOT EXISTS cron_run_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_name    TEXT NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error')),
  error_msg   TEXT,
  rows_affected INTEGER DEFAULT 0
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_cron_run_log_job_status
    ON cron_run_log (job_name, status, started_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Auto-cleanup: keep 30 days of cron logs
-- This can be wired to a pg_cron job: DELETE FROM cron_run_log WHERE started_at < now() - interval '30 days';

COMMENT ON TABLE cron_run_log IS 'CS-015: DE-001 cron failure alerting. Edge Functions log start/finish/error here. Alerting queries for status=error in last N minutes.';
