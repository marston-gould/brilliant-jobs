-- v8.46: Fix jd_keyword browser — use extracted_skills (ts_stat times out on 500K rows)
-- Simply alias jd_keyword to the same extracted_skills source as skill dimension

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
      GROUP BY j.title ORDER BY COUNT(*) DESC LIMIT p_limit;

  ELSIF p_dimension IN ('skill', 'jd_keyword') THEN
    -- jd_keyword aliases to extracted_skills — ts_stat() on 500K rows always times out
    RETURN QUERY
      SELECT s AS value, COUNT(*)::int AS job_count
      FROM ats_jobs j, unnest(j.extracted_skills) AS s
      WHERE j.status = 'open' AND j.extracted_skills IS NOT NULL
        AND (NOT p_us_only OR j.loc_country = 'US')
      GROUP BY s ORDER BY COUNT(*) DESC LIMIT p_limit;

  ELSIF p_dimension = 'dept' THEN
    RETURN QUERY
      SELECT j.extracted_department AS value, COUNT(*)::int AS job_count
      FROM ats_jobs j
      WHERE j.status = 'open'
        AND j.extracted_department IS NOT NULL
        AND length(j.extracted_department) > 1
        AND j.extracted_department NOT IN (
          'other','drivers_license','nursing_license','pe_license',
          'clearance','remote','us_citizen','unknown','none','n/a','na'
        )
        AND (NOT p_us_only OR j.loc_country = 'US')
      GROUP BY j.extracted_department ORDER BY COUNT(*) DESC LIMIT p_limit;

  ELSIF p_dimension = 'level' THEN
    RETURN QUERY
      SELECT j.extracted_seniority AS value, COUNT(*)::int AS job_count
      FROM ats_jobs j
      WHERE j.status = 'open'
        AND j.extracted_seniority IS NOT NULL
        AND length(j.extracted_seniority) > 1
        AND j.extracted_seniority NOT IN ('unknown','ic','other','n/a','na','none')
        AND (NOT p_us_only OR j.loc_country = 'US')
      GROUP BY j.extracted_seniority ORDER BY COUNT(*) DESC LIMIT p_limit;

  ELSE
    RAISE EXCEPTION 'Unknown dimension: %', p_dimension;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_filter_browser_top(text, boolean, int) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_filter_browser_top(text, boolean, int) TO anon;
