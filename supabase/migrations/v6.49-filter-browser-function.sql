-- ============================================================
-- UX-001-S3: Filter Browser — server-side top values function
-- Lightweight alternative to mv_filter_browser_data MV
-- Returns top N values for a given dimension, optionally US-only
-- ============================================================

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
    RETURN QUERY
      SELECT j.extracted_department AS value, COUNT(*)::int AS job_count
      FROM ats_jobs j
      WHERE j.status = 'open' AND j.extracted_department IS NOT NULL
        AND length(j.extracted_department) > 1
        AND (NOT p_us_only OR j.loc_country = 'US')
      GROUP BY j.extracted_department
      ORDER BY COUNT(*) DESC
      LIMIT p_limit;

  ELSIF p_dimension = 'level' THEN
    RETURN QUERY
      SELECT j.extracted_seniority AS value, COUNT(*)::int AS job_count
      FROM ats_jobs j
      WHERE j.status = 'open' AND j.extracted_seniority IS NOT NULL
        AND length(j.extracted_seniority) > 1
        AND (NOT p_us_only OR j.loc_country = 'US')
      GROUP BY j.extracted_seniority
      ORDER BY COUNT(*) DESC
      LIMIT p_limit;

  ELSIF p_dimension = 'jd_keyword' THEN
    RETURN QUERY
      SELECT word AS value, ndoc::int AS job_count
      FROM ts_stat(
        CASE WHEN p_us_only THEN
          'SELECT content_tsv FROM ats_jobs WHERE status = ''open'' AND content_tsv IS NOT NULL AND loc_country = ''US'''
        ELSE
          'SELECT content_tsv FROM ats_jobs WHERE status = ''open'' AND content_tsv IS NOT NULL'
        END
      )
      WHERE length(word) > 3
      ORDER BY ndoc DESC
      LIMIT p_limit;

  ELSE
    RAISE EXCEPTION 'Unknown dimension: %', p_dimension;
  END IF;
END;
$$;

-- Grant to authenticated users (browser needs this)
GRANT EXECUTE ON FUNCTION fn_filter_browser_top(text, boolean, int) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_filter_browser_top(text, boolean, int) TO anon;
