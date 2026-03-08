-- Migration: v6.23-incremental-materialized-views.sql
-- SA-009: Incremental Materialized Views + Staleness Monitoring
-- Creates: mv_job_feed_counts, mv_source_breakdown, mv_landing_stats,
--          mv_refresh_log, ats_jobs_change_log, change tracking trigger,
--          incremental refresh functions, cron schedules
-- Pair: Data Eng + DevOps | Reviewer: System Architect—Scalability

-- ============================================================
-- 1. Change Tracking on ats_jobs
-- ============================================================

-- Track which rows changed and what city/source was affected
CREATE TABLE IF NOT EXISTS ats_jobs_change_log (
  id          bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  job_id      text NOT NULL,          -- greenhouse_id
  ats_source  text,
  loc_city    text,
  op          text NOT NULL CHECK (op IN ('INSERT', 'UPDATE', 'DELETE')),
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_change_log_changed_at ON ats_jobs_change_log(changed_at);
CREATE INDEX IF NOT EXISTS idx_change_log_city ON ats_jobs_change_log(loc_city) WHERE loc_city IS NOT NULL;

COMMENT ON TABLE ats_jobs_change_log IS
  'SA-009: Row-level change tracking for incremental MV refresh. Rows consumed and truncated after each refresh cycle.';

-- Trigger function: log changes to ats_jobs
CREATE OR REPLACE FUNCTION fn_ats_jobs_change_log()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO ats_jobs_change_log (job_id, ats_source, loc_city, op)
    VALUES (OLD.greenhouse_id, OLD.ats_source, OLD.loc_city, 'DELETE');
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO ats_jobs_change_log (job_id, ats_source, loc_city, op)
    VALUES (NEW.greenhouse_id, NEW.ats_source, NEW.loc_city, 'UPDATE');
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO ats_jobs_change_log (job_id, ats_source, loc_city, op)
    VALUES (NEW.greenhouse_id, NEW.ats_source, NEW.loc_city, 'INSERT');
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ats_jobs_change_log ON ats_jobs;
CREATE TRIGGER trg_ats_jobs_change_log
  AFTER INSERT OR UPDATE OR DELETE ON ats_jobs
  FOR EACH ROW EXECUTE FUNCTION fn_ats_jobs_change_log();

COMMENT ON FUNCTION fn_ats_jobs_change_log IS
  'SA-009: Populates ats_jobs_change_log for incremental MV refresh.';


-- ============================================================
-- 2. Materialized View Tables (not Postgres MVs — regular tables
--    refreshed by functions, so we control incremental logic)
-- ============================================================

-- 2a. mv_job_feed_counts — per-source totals
CREATE TABLE IF NOT EXISTS mv_job_feed_counts (
  ats_source   text PRIMARY KEY,
  job_count    int NOT NULL DEFAULT 0,
  with_salary  int NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mv_job_feed_counts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mv_job_feed_counts_read" ON mv_job_feed_counts;
CREATE POLICY "mv_job_feed_counts_read" ON mv_job_feed_counts
  FOR SELECT TO anon, authenticated USING (true);

COMMENT ON TABLE mv_job_feed_counts IS
  'SA-009: Pre-aggregated per-source job counts. Dashboard reads instantly instead of COUNT(*) on ats_jobs.';


-- 2b. mv_source_breakdown — weekly source breakdown for timeline chart
CREATE TABLE IF NOT EXISTS mv_source_breakdown (
  id           bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  ats_source   text NOT NULL,
  week         date NOT NULL,
  jobs_added   int NOT NULL DEFAULT 0,
  companies    int NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ats_source, week)
);

ALTER TABLE mv_source_breakdown ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mv_source_breakdown_read" ON mv_source_breakdown;
CREATE POLICY "mv_source_breakdown_read" ON mv_source_breakdown
  FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_mv_source_breakdown_week ON mv_source_breakdown(week DESC);

COMMENT ON TABLE mv_source_breakdown IS
  'SA-009: Weekly job additions per source. Powers the source timeline stacked chart.';


-- 2c. mv_landing_stats — single-row global stats for dashboard/landing
CREATE TABLE IF NOT EXISTS mv_landing_stats (
  id               int PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton
  total_jobs       int NOT NULL DEFAULT 0,
  total_companies  int NOT NULL DEFAULT 0,
  total_with_salary int NOT NULL DEFAULT 0,
  total_remote     int NOT NULL DEFAULT 0,
  median_salary    int,
  avg_salary       int,
  remote_pct       numeric(5,2),
  top_cities       jsonb,                  -- [{city, state, count}] top 10
  top_sources      jsonb,                  -- [{source, count}]
  refreshed_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mv_landing_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mv_landing_stats_read" ON mv_landing_stats;
CREATE POLICY "mv_landing_stats_read" ON mv_landing_stats
  FOR SELECT TO anon, authenticated USING (true);

COMMENT ON TABLE mv_landing_stats IS
  'SA-009: Single-row global stats. Dashboard and landing page read instantly.';


-- ============================================================
-- 3. Refresh Log
-- ============================================================

CREATE TABLE IF NOT EXISTS mv_refresh_log (
  id              bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  refresh_type    text NOT NULL CHECK (refresh_type IN ('incremental', 'full')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  rows_processed  int DEFAULT 0,
  duration_ms     int,
  affected_cities int DEFAULT 0,
  affected_sources int DEFAULT 0,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mv_refresh_log_started ON mv_refresh_log(started_at DESC);

COMMENT ON TABLE mv_refresh_log IS
  'SA-009: Tracks each MV refresh cycle. Duration, rows processed, affected cities/sources.';


-- ============================================================
-- 4. Full Refresh Functions
-- ============================================================

-- 4a. Full refresh of mv_job_feed_counts
CREATE OR REPLACE FUNCTION mv_full_refresh_feed_counts()
RETURNS void AS $$
BEGIN
  DELETE FROM mv_job_feed_counts;
  INSERT INTO mv_job_feed_counts (ats_source, job_count, with_salary, refreshed_at)
  SELECT
    COALESCE(ats_source, 'unknown'),
    COUNT(*),
    COUNT(*) FILTER (WHERE salary_min IS NOT NULL AND salary_min > 0),
    now()
  FROM ats_jobs
  WHERE status = 'open'
  GROUP BY COALESCE(ats_source, 'unknown');
END;
$$ LANGUAGE plpgsql;

-- 4b. Full refresh of mv_source_breakdown
CREATE OR REPLACE FUNCTION mv_full_refresh_source_breakdown()
RETURNS void AS $$
BEGIN
  DELETE FROM mv_source_breakdown;
  INSERT INTO mv_source_breakdown (ats_source, week, jobs_added, companies, refreshed_at)
  SELECT
    COALESCE(ats_source, 'unknown'),
    date_trunc('week', first_seen_at)::date AS week,
    COUNT(*) AS jobs_added,
    COUNT(DISTINCT company_slug) AS companies,
    now()
  FROM ats_jobs
  WHERE status = 'open' AND first_seen_at IS NOT NULL
  GROUP BY COALESCE(ats_source, 'unknown'), date_trunc('week', first_seen_at)::date;
END;
$$ LANGUAGE plpgsql;

-- 4c. Full refresh of mv_landing_stats
CREATE OR REPLACE FUNCTION mv_full_refresh_landing_stats()
RETURNS void AS $$
BEGIN
  INSERT INTO mv_landing_stats (
    id, total_jobs, total_companies, total_with_salary, total_remote,
    median_salary, avg_salary, remote_pct, top_cities, top_sources, refreshed_at
  )
  SELECT
    1,
    COUNT(*),
    COUNT(DISTINCT company_slug),
    COUNT(*) FILTER (WHERE salary_min IS NOT NULL AND salary_min > 0),
    COUNT(*) FILTER (WHERE is_remote = true OR loc_type = 'remote'),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (COALESCE(salary_min,0)+COALESCE(salary_max,0))/2)
      FILTER (WHERE salary_min IS NOT NULL AND salary_min > 0),
    AVG((COALESCE(salary_min,0)+COALESCE(salary_max,0))/2)
      FILTER (WHERE salary_min IS NOT NULL AND salary_min > 0),
    ROUND(100.0 * COUNT(*) FILTER (WHERE is_remote = true OR loc_type = 'remote') / NULLIF(COUNT(*), 0), 2),
    (SELECT jsonb_agg(row_to_json(c) ORDER BY c.cnt DESC)
     FROM (SELECT loc_city AS city, loc_state AS state, COUNT(*) AS cnt
           FROM ats_jobs WHERE status = 'open' AND loc_city IS NOT NULL
           GROUP BY loc_city, loc_state ORDER BY cnt DESC LIMIT 10) c),
    (SELECT jsonb_agg(row_to_json(s) ORDER BY s.cnt DESC)
     FROM (SELECT COALESCE(ats_source, 'unknown') AS source, COUNT(*) AS cnt
           FROM ats_jobs WHERE status = 'open'
           GROUP BY ats_source ORDER BY cnt DESC) s),
    now()
  FROM ats_jobs
  WHERE status = 'open'
  ON CONFLICT (id) DO UPDATE SET
    total_jobs = EXCLUDED.total_jobs,
    total_companies = EXCLUDED.total_companies,
    total_with_salary = EXCLUDED.total_with_salary,
    total_remote = EXCLUDED.total_remote,
    median_salary = EXCLUDED.median_salary,
    avg_salary = EXCLUDED.avg_salary,
    remote_pct = EXCLUDED.remote_pct,
    top_cities = EXCLUDED.top_cities,
    top_sources = EXCLUDED.top_sources,
    refreshed_at = now();
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 5. Orchestrator: Full Refresh All
-- ============================================================

CREATE OR REPLACE FUNCTION mv_full_refresh_all()
RETURNS jsonb AS $$
DECLARE
  v_start timestamptz := clock_timestamp();
  v_log_id bigint;
  v_count int;
  v_duration int;
BEGIN
  INSERT INTO mv_refresh_log (refresh_type) VALUES ('full') RETURNING id INTO v_log_id;

  PERFORM mv_full_refresh_feed_counts();
  PERFORM mv_full_refresh_source_breakdown();
  PERFORM mv_full_refresh_landing_stats();

  SELECT COUNT(*) INTO v_count FROM ats_jobs WHERE status = 'open';

  v_duration := EXTRACT(MILLISECOND FROM clock_timestamp() - v_start)::int;

  UPDATE mv_refresh_log SET
    completed_at = clock_timestamp(),
    rows_processed = v_count,
    duration_ms = v_duration
  WHERE id = v_log_id;

  -- Clear change log after full refresh
  TRUNCATE ats_jobs_change_log;

  RETURN jsonb_build_object(
    'type', 'full',
    'rows_processed', v_count,
    'duration_ms', v_duration,
    'log_id', v_log_id
  );
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 6. Incremental Refresh (delta-only)
-- ============================================================

CREATE OR REPLACE FUNCTION mv_incremental_refresh(p_since timestamptz DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  v_start timestamptz := clock_timestamp();
  v_log_id bigint;
  v_changes int;
  v_affected_cities int := 0;
  v_affected_sources int := 0;
  v_duration int;
  v_since timestamptz;
BEGIN
  -- Default: process all changes since last refresh
  IF p_since IS NULL THEN
    SELECT MAX(completed_at) INTO v_since FROM mv_refresh_log WHERE completed_at IS NOT NULL;
  ELSE
    v_since := p_since;
  END IF;

  -- Count pending changes
  IF v_since IS NOT NULL THEN
    SELECT COUNT(*) INTO v_changes FROM ats_jobs_change_log WHERE changed_at > v_since;
  ELSE
    SELECT COUNT(*) INTO v_changes FROM ats_jobs_change_log;
  END IF;

  -- If no changes, skip refresh
  IF v_changes = 0 THEN
    RETURN jsonb_build_object('type', 'incremental', 'rows_processed', 0, 'skipped', true);
  END IF;

  -- If too many changes (>10% of table), do full refresh instead
  IF v_changes > (SELECT COUNT(*) * 0.1 FROM ats_jobs) THEN
    RETURN mv_full_refresh_all();
  END IF;

  INSERT INTO mv_refresh_log (refresh_type) VALUES ('incremental') RETURNING id INTO v_log_id;

  -- Refresh feed counts (always full — small table, fast)
  PERFORM mv_full_refresh_feed_counts();

  -- Refresh landing stats (always full — single row)
  PERFORM mv_full_refresh_landing_stats();

  -- Refresh source breakdown incrementally for affected weeks
  WITH affected_weeks AS (
    SELECT DISTINCT date_trunc('week', cl.changed_at)::date AS week,
           COALESCE(aj.ats_source, 'unknown') AS ats_source
    FROM ats_jobs_change_log cl
    LEFT JOIN ats_jobs aj ON aj.greenhouse_id = cl.job_id
    WHERE cl.changed_at > COALESCE(v_since, '1970-01-01'::timestamptz)
  ),
  new_breakdown AS (
    SELECT
      COALESCE(aj.ats_source, 'unknown') AS ats_source,
      date_trunc('week', aj.first_seen_at)::date AS week,
      COUNT(*) AS jobs_added,
      COUNT(DISTINCT aj.company_slug) AS companies
    FROM ats_jobs aj
    WHERE aj.status = 'open'
      AND aj.first_seen_at IS NOT NULL
      AND (COALESCE(aj.ats_source, 'unknown'), date_trunc('week', aj.first_seen_at)::date) IN
          (SELECT ats_source, week FROM affected_weeks)
    GROUP BY COALESCE(aj.ats_source, 'unknown'), date_trunc('week', aj.first_seen_at)::date
  )
  INSERT INTO mv_source_breakdown (ats_source, week, jobs_added, companies, refreshed_at)
  SELECT ats_source, week, jobs_added, companies, now()
  FROM new_breakdown
  ON CONFLICT (ats_source, week) DO UPDATE SET
    jobs_added = EXCLUDED.jobs_added,
    companies = EXCLUDED.companies,
    refreshed_at = now();

  -- Count affected dimensions
  SELECT COUNT(DISTINCT loc_city) INTO v_affected_cities
  FROM ats_jobs_change_log WHERE changed_at > COALESCE(v_since, '1970-01-01'::timestamptz);

  SELECT COUNT(DISTINCT ats_source) INTO v_affected_sources
  FROM ats_jobs_change_log WHERE changed_at > COALESCE(v_since, '1970-01-01'::timestamptz);

  v_duration := EXTRACT(MILLISECOND FROM clock_timestamp() - v_start)::int;

  UPDATE mv_refresh_log SET
    completed_at = clock_timestamp(),
    rows_processed = v_changes,
    duration_ms = v_duration,
    affected_cities = v_affected_cities,
    affected_sources = v_affected_sources
  WHERE id = v_log_id;

  -- Clear processed changes
  IF v_since IS NOT NULL THEN
    DELETE FROM ats_jobs_change_log WHERE changed_at <= clock_timestamp();
  ELSE
    TRUNCATE ats_jobs_change_log;
  END IF;

  RETURN jsonb_build_object(
    'type', 'incremental',
    'rows_processed', v_changes,
    'affected_cities', v_affected_cities,
    'affected_sources', v_affected_sources,
    'duration_ms', v_duration,
    'log_id', v_log_id
  );
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 7. Initial data population (full refresh)
-- ============================================================

SELECT mv_full_refresh_all();


-- ============================================================
-- 8. Cron schedules
-- ============================================================

-- Incremental refresh every 3 minutes
SELECT cron.schedule(
  'mv-incremental-refresh',
  '*/3 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/refresh-materialized-views',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"action":"incremental"}'::jsonb
  );$$
);

-- Weekly full refresh (Sunday 4 AM UTC) as consistency guarantee
SELECT cron.schedule(
  'mv-full-refresh-weekly',
  '0 4 * * 0',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/refresh-materialized-views',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"action":"full"}'::jsonb
  );$$
);

COMMENT ON FUNCTION mv_full_refresh_all IS
  'SA-009: Orchestrates full refresh of all 3 MV tables. Used for initial population and weekly consistency.';
COMMENT ON FUNCTION mv_incremental_refresh IS
  'SA-009: Delta-only refresh. Reads ats_jobs_change_log, refreshes only affected dimensions. Falls back to full if delta > 10%.';
