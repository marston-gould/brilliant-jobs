-- v6.44: Add get_total_company_count() for landing page stats consistency
-- Fixes: Hardcoded "39,000+" on landing page should be dynamic
-- The existing get_landing_stats() returns companies WITH active jobs (~8.5K).
-- This new function returns ALL companies being tracked (~39K+).
-- Both numbers are valid but serve different purposes:
--   get_landing_stats().companies = "companies currently hiring" (for hero stats)
--   get_total_company_count()    = "career pages we scan" (for coverage claims)

CREATE OR REPLACE FUNCTION public.get_total_company_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer FROM ats_companies;
$$;

-- Grant anon access (landing page is public, no auth)
GRANT EXECUTE ON FUNCTION public.get_total_company_count() TO anon;
GRANT EXECUTE ON FUNCTION public.get_total_company_count() TO authenticated;
