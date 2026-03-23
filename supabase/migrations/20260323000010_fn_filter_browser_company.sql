-- 20260323000010: Add company dimension to fn_filter_browser_top
-- The existing function only handles title/skill/dept/level.
-- Company browse was using a REST limit(50000) which PostgREST caps at 1000.
-- This adds server-side aggregation for companies.

CREATE OR REPLACE FUNCTION public.fn_filter_browser_top(
  p_dimension text,
  p_us_only   boolean DEFAULT false,
  p_limit     integer DEFAULT 200
)
RETURNS TABLE(value text, job_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '15s'
AS $function$
BEGIN
  IF p_dimension = 'title' THEN
    RETURN QUERY
      SELECT j.title AS value, COUNT(*)::int AS job_count
      FROM ats_jobs j
      WHERE j.status = 'open' AND j.title IS NOT NULL AND length(j.title) > 2
        AND (NOT p_us_only OR j.loc_country = 'US')
      GROUP BY j.title ORDER BY COUNT(*) DESC LIMIT p_limit;

  ELSIF p_dimension IN ('skill', 'jd_keyword') THEN
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

  ELSIF p_dimension = 'company' THEN
    RETURN QUERY
      SELECT j.company_name AS value, COUNT(*)::int AS job_count
      FROM ats_jobs j
      WHERE j.status = 'open'
        AND j.company_name IS NOT NULL
        AND length(trim(j.company_name)) > 0
        AND (NOT p_us_only OR j.loc_country = 'US')
      GROUP BY j.company_name ORDER BY COUNT(*) DESC LIMIT p_limit;

  ELSE
    RAISE EXCEPTION 'Unknown dimension: %', p_dimension;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_filter_browser_top(text, boolean, integer) TO authenticated;
