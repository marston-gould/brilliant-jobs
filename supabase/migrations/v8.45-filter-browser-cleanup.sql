-- ============================================================
-- v8.45: Filter Browser Data Quality
-- 1. Dept: exclude non-department values (job requirement tags)
-- 2. Level: exclude noise values (ic, unknown)
-- 3. JD Keywords: pre-computed table + pg_cron refresh
--    (ts_stat() on 508K rows times out — pre-compute instead)
-- ============================================================

-- ── 1 & 2: Update fn_filter_browser_top ─────────────────────

CREATE OR REPLACE FUNCTION fn_filter_browser_top(
  p_dimension text,
  p_us_only boolean DEFAULT false,
  p_limit int DEFAULT 200
)
RETURNS TABLE(value text, job_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '15s'
AS $$
BEGIN
  IF p_dimension = 'title' THEN
    RETURN QUERY
      SELECT j.title AS value, COUNT(*)::int AS job_count
      FROM ats_jobs j
      WHERE j.status = 'open' AND j.title IS NOT NULL AND length(j.title) > 2
        AND (NOT p_us_only OR j.loc_country = 'US')
      GROUP BY j.title
      ORDER BY COUNT(*) DESC
      LIMIT p_limit;

  ELSIF p_dimension = 'skill' THEN
    RETURN QUERY
      SELECT s AS value, COUNT(*)::int AS job_count
      FROM ats_jobs j, unnest(j.extracted_skills) AS s
      WHERE j.status = 'open' AND j.extracted_skills IS NOT NULL
        AND (NOT p_us_only OR j.loc_country = 'US')
      GROUP BY s
      ORDER BY COUNT(*) DESC
      LIMIT p_limit;

  ELSIF p_dimension = 'dept' THEN
    -- Exclude values that are job requirement tags, not departments
    RETURN QUERY
      SELECT j.extracted_department AS value, COUNT(*)::int AS job_count
      FROM ats_jobs j
      WHERE j.status = 'open'
        AND j.extracted_department IS NOT NULL
        AND length(j.extracted_department) > 1
        AND j.extracted_department NOT IN (
          'other',
          'drivers_license', 'nursing_license', 'pe_license',
          'clearance', 'remote', 'us_citizen',
          'unknown', 'none', 'n/a', 'na'
        )
        AND (NOT p_us_only OR j.loc_country = 'US')
      GROUP BY j.extracted_department
      ORDER BY COUNT(*) DESC
      LIMIT p_limit;

  ELSIF p_dimension = 'level' THEN
    -- Exclude noise values with insufficient data or non-display values
    RETURN QUERY
      SELECT j.extracted_seniority AS value, COUNT(*)::int AS job_count
      FROM ats_jobs j
      WHERE j.status = 'open'
        AND j.extracted_seniority IS NOT NULL
        AND length(j.extracted_seniority) > 1
        AND j.extracted_seniority NOT IN ('unknown', 'ic', 'other', 'n/a', 'na', 'none')
        AND (NOT p_us_only OR j.loc_country = 'US')
      GROUP BY j.extracted_seniority
      ORDER BY COUNT(*) DESC
      LIMIT p_limit;

  ELSIF p_dimension = 'jd_keyword' THEN
    -- Query pre-computed table (ts_stat() on 500K+ rows times out)
    RETURN QUERY
      SELECT k.keyword AS value, k.job_count
      FROM jd_keyword_stats k
      WHERE k.word_length > 3
        AND (NOT p_us_only OR k.us_job_count > 0)
      ORDER BY CASE WHEN p_us_only THEN k.us_job_count ELSE k.job_count END DESC
      LIMIT p_limit;

  ELSE
    RAISE EXCEPTION 'Unknown dimension: %', p_dimension;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_filter_browser_top(text, boolean, int) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_filter_browser_top(text, boolean, int) TO anon;

-- ── 3: JD Keyword Stats pre-computed table ───────────────────

CREATE TABLE IF NOT EXISTS jd_keyword_stats (
  keyword       text PRIMARY KEY,
  job_count     int  NOT NULL DEFAULT 0,
  us_job_count  int  NOT NULL DEFAULT 0,
  word_length   int  GENERATED ALWAYS AS (length(keyword)) STORED,
  refreshed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jd_keyword_stats_count
  ON jd_keyword_stats (job_count DESC);

CREATE INDEX IF NOT EXISTS idx_jd_keyword_stats_us_count
  ON jd_keyword_stats (us_job_count DESC);

-- Function to refresh keyword stats (called by pg_cron)
CREATE OR REPLACE FUNCTION refresh_jd_keyword_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
BEGIN
  -- Clear and repopulate from FTS dictionary
  DELETE FROM jd_keyword_stats;

  INSERT INTO jd_keyword_stats (keyword, job_count, us_job_count, refreshed_at)
  SELECT
    all_kw.word         AS keyword,
    all_kw.ndoc         AS job_count,
    COALESCE(us_kw.ndoc, 0) AS us_job_count,
    now()
  FROM ts_stat(
    'SELECT content_tsv FROM ats_jobs WHERE status = ''open'' AND content_tsv IS NOT NULL'
  ) AS all_kw
  LEFT JOIN ts_stat(
    'SELECT content_tsv FROM ats_jobs WHERE status = ''open'' AND content_tsv IS NOT NULL AND loc_country = ''US'''
  ) AS us_kw ON all_kw.word = us_kw.word
  WHERE length(all_kw.word) > 3;

  RAISE NOTICE 'jd_keyword_stats refreshed: % rows', (SELECT count(*) FROM jd_keyword_stats);
END;
$$;

-- Seed initial data (runs once on migration)
SELECT refresh_jd_keyword_stats();

-- Schedule nightly refresh at 3 AM UTC
SELECT cron.schedule(
  'refresh-jd-keyword-stats',
  '0 3 * * *',
  'SELECT refresh_jd_keyword_stats()'
);
