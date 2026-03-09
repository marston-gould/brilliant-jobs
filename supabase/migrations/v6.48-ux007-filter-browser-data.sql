-- ============================================================
-- UX-001-S3: Universal Filter Browser — mv_filter_browser_data
-- Materialized view combining top values from 5 filter dimensions
-- Refreshed by SA-009 refresh-mv-incremental cycle (every 15 min)
-- ============================================================

-- Materialized view: pre-computed top values per filter dimension
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_filter_browser_data AS
  -- WHAT: Top 200 job titles by count
  SELECT 'title'::text AS dimension, title AS value, COUNT(*)::int AS job_count
  FROM ats_jobs WHERE status = 'open' AND title IS NOT NULL AND length(title) > 2
  GROUP BY title ORDER BY COUNT(*) DESC LIMIT 200

  UNION ALL

  -- SKILLS: Top 200 extracted skills by count
  SELECT 'skill'::text AS dimension, unnest(extracted_skills) AS value, COUNT(*)::int AS job_count
  FROM ats_jobs WHERE status = 'open' AND extracted_skills IS NOT NULL
  GROUP BY 2 ORDER BY COUNT(*) DESC LIMIT 200

  UNION ALL

  -- DEPT: All departments (typically ~30-50 unique values)
  SELECT 'dept'::text AS dimension, extracted_department AS value, COUNT(*)::int AS job_count
  FROM ats_jobs WHERE status = 'open' AND extracted_department IS NOT NULL AND length(extracted_department) > 1
  GROUP BY extracted_department ORDER BY COUNT(*) DESC LIMIT 200

  UNION ALL

  -- LEVEL: All seniority levels (typically ~8-12 unique values)
  SELECT 'level'::text AS dimension, extracted_seniority AS value, COUNT(*)::int AS job_count
  FROM ats_jobs WHERE status = 'open' AND extracted_seniority IS NOT NULL AND length(extracted_seniority) > 1
  GROUP BY extracted_seniority ORDER BY COUNT(*) DESC

  UNION ALL

  -- JD KEYWORDS: Top 200 words from content_tsv by document frequency
  SELECT 'jd_keyword'::text AS dimension, word AS value, ndoc::int AS job_count
  FROM ts_stat('SELECT content_tsv FROM ats_jobs WHERE status = ''open'' AND content_tsv IS NOT NULL')
  WHERE length(word) > 3
  ORDER BY ndoc DESC LIMIT 200
WITH DATA;

-- Unique index for fast lookups + REFRESH CONCURRENTLY support
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_filter_browser_dimension_value
  ON mv_filter_browser_data (dimension, value);

-- Index for dimension queries
CREATE INDEX IF NOT EXISTS idx_mv_filter_browser_dimension
  ON mv_filter_browser_data (dimension);

-- Grant access
GRANT SELECT ON mv_filter_browser_data TO authenticated;
GRANT SELECT ON mv_filter_browser_data TO anon;

-- Register in SA-009 refresh cycle: add to mv_refresh_log
INSERT INTO mv_refresh_log (mv_name, refreshed_at, duration_ms, row_count)
SELECT 'mv_filter_browser_data', now(), 0, count(*)
FROM mv_filter_browser_data
ON CONFLICT DO NOTHING;

-- pg_cron: Refresh every 15 minutes (piggyback on existing MV refresh schedule)
SELECT cron.schedule(
  'refresh-filter-browser-data',
  '*/15 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_filter_browser_data$$
);
