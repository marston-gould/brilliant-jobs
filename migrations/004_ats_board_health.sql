-- Migration 004: ATS Board Health tracking + Admin RPCs
-- Date: 2026-02-20
-- Applied: Live (via exec_sql)

-- 1. Add tracking columns to ats_companies
ALTER TABLE ats_companies ADD COLUMN IF NOT EXISTS last_http_status INT;
ALTER TABLE ats_companies ADD COLUMN IF NOT EXISTS last_refresh_at TIMESTAMPTZ;
-- created_at already exists with DEFAULT NOW()

-- 2. Indexes for health + delta queries
CREATE INDEX IF NOT EXISTS idx_ats_companies_health 
  ON ats_companies (source, last_http_status, job_count);
CREATE INDEX IF NOT EXISTS idx_ats_companies_created 
  ON ats_companies (created_at);
CREATE INDEX IF NOT EXISTS idx_ats_companies_refresh 
  ON ats_companies (last_refresh_at) WHERE last_http_status BETWEEN 400 AND 499;

-- 3. Admin RPC: Board health snapshot + deltas
CREATE OR REPLACE FUNCTION get_board_health(period_hours INT DEFAULT 168)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  period_start TIMESTAMPTZ := NOW() - (period_hours || ' hours')::INTERVAL;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT json_build_object(
    'total_feeds', (SELECT COUNT(*) FROM ats_companies),
    'feeds_with_jobs', (SELECT COUNT(*) FROM ats_companies WHERE job_count > 0),
    'feeds_4xx', (SELECT COUNT(*) FROM ats_companies WHERE last_http_status BETWEEN 400 AND 499),
    'feeds_never_scraped', (SELECT COUNT(*) FROM ats_companies WHERE last_http_status IS NULL),
    'feeds_zero_jobs', (SELECT COUNT(*) FROM ats_companies WHERE job_count = 0 AND (last_http_status IS NULL OR last_http_status = 200)),
    'total_jobs', (SELECT COUNT(*) FROM ats_jobs WHERE status != 'closed'),
    'boards_added', (SELECT COUNT(*) FROM ats_companies WHERE created_at >= period_start),
    'boards_lost', (SELECT COUNT(*) FROM ats_companies WHERE last_http_status BETWEEN 400 AND 499 AND last_refresh_at >= period_start),
    'jobs_added', (SELECT COUNT(*) FROM ats_jobs WHERE first_seen_at >= period_start),
    'jobs_lost', (SELECT COUNT(*) FROM ats_jobs WHERE closed_at >= period_start),
    'feed_health_pct', ROUND(
      (SELECT COUNT(*) FROM ats_companies WHERE job_count > 0)::NUMERIC / 
      NULLIF((SELECT COUNT(*) FROM ats_companies), 0) * 100, 1
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- 4. Admin RPC: Platform breakdown with deltas
CREATE OR REPLACE FUNCTION get_board_health_by_platform(period_hours INT DEFAULT 168)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  period_start TIMESTAMPTZ := NOW() - (period_hours || ' hours')::INTERVAL;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT json_agg(row_to_json(t)) INTO result FROM (
    SELECT 
      c.source AS platform,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE c.job_count > 0) AS with_jobs,
      COUNT(*) FILTER (WHERE c.last_http_status BETWEEN 400 AND 499) AS errors_4xx,
      COUNT(*) FILTER (WHERE c.created_at >= period_start) AS boards_added,
      COUNT(*) FILTER (WHERE c.last_http_status BETWEEN 400 AND 499 AND c.last_refresh_at >= period_start) AS boards_lost,
      COALESCE((SELECT COUNT(*) FROM ats_jobs j WHERE j.ats_source = c.source AND j.status != 'closed'), 0) AS jobs,
      COALESCE((SELECT COUNT(*) FROM ats_jobs j WHERE j.ats_source = c.source AND j.first_seen_at >= period_start), 0) AS jobs_added,
      COALESCE((SELECT COUNT(*) FROM ats_jobs j WHERE j.ats_source = c.source AND j.closed_at >= period_start), 0) AS jobs_lost
    FROM ats_companies c
    GROUP BY c.source
    ORDER BY COUNT(*) DESC
  ) t;

  RETURN result;
END;
$$;
