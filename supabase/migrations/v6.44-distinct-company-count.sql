-- v6.44: get_distinct_company_count — returns count of distinct companies with open jobs
-- Used by Get Started stats to show "companies hiring now" as a different number from "career pages tracked"

CREATE OR REPLACE FUNCTION public.get_distinct_company_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(DISTINCT company_name)
  FROM ats_jobs
  WHERE status = 'open'
    AND company_name IS NOT NULL
    AND company_name != '';
$$;

-- Allow anon access (public stat)
GRANT EXECUTE ON FUNCTION public.get_distinct_company_count() TO anon;
GRANT EXECUTE ON FUNCTION public.get_distinct_company_count() TO authenticated;
