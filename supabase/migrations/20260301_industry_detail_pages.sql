-- Migration: Industry Detail Page RPCs
-- v5.90 — Industry Detail Pages (#16)
-- Creates 5 RPCs that accept an industry_name parameter for per-industry analytics

-- 1. Per-industry job count, salary stats, remote breakdown
CREATE OR REPLACE FUNCTION get_industry_detail(p_industry text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH industry_map AS (
    SELECT CASE
      WHEN industry IN ('computer software','computer games','information technology and services','internet','information services') THEN 'Technology'
      WHEN industry IN ('hospital & health care','medical devices','medical practice','mental health care','health, wellness and fitness','biotechnology','pharmaceuticals') THEN 'Healthcare'
      WHEN industry IN ('financial services','banking','insurance','venture capital & private equity','accounting') THEN 'Finance'
      WHEN industry IN ('management consulting','human resources','staffing and recruiting','professional training & coaching','outsourcing/offshoring','facilities services','environmental services') THEN 'Consulting & Services'
      WHEN industry IN ('retail','consumer goods','consumer electronics','consumer services','food & beverages','food production','cosmetics','luxury goods & jewelry','apparel & fashion') THEN 'Retail & Consumer'
      WHEN industry IN ('marketing and advertising','media production','entertainment','public relations and communications','graphic design','photography') THEN 'Media & Marketing'
      WHEN industry IN ('mechanical or industrial engineering','electrical/electronic manufacturing','building materials','machinery','automotive','defense & space','shipbuilding') THEN 'Manufacturing'
      WHEN industry IN ('real estate','construction','civil engineering') THEN 'Real Estate & Construction'
      WHEN industry IN ('utilities','renewables & environment','mining & metals') THEN 'Energy'
      WHEN industry IN ('higher education','primary/secondary education','research') THEN 'Education'
      WHEN industry IN ('logistics and supply chain','transportation/trucking/railroad') THEN 'Logistics & Transport'
      WHEN industry IN ('law practice','legal services') THEN 'Legal'
      WHEN industry IN ('non-profit organization management','fund-raising') THEN 'Non-Profit'
      WHEN industry IN ('hospitality','leisure, travel & tourism') THEN 'Hospitality'
      WHEN industry IN ('security and investigations','translation and localization') THEN 'Other'
      ELSE 'Other'
    END AS sector, *
    FROM ats_jobs
    WHERE industry IS NOT NULL
  ),
  filtered AS (
    SELECT * FROM industry_map WHERE sector = p_industry
  ),
  stats AS (
    SELECT
      count(*) AS total_jobs,
      count(*) FILTER (WHERE salary_min IS NOT NULL OR salary_max IS NOT NULL) AS jobs_with_salary,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY (COALESCE(salary_min,0)+COALESCE(salary_max,0))/2.0) FILTER (WHERE salary_min IS NOT NULL OR salary_max IS NOT NULL)) AS median_salary,
      round(avg((COALESCE(salary_min,0)+COALESCE(salary_max,0))/2.0) FILTER (WHERE salary_min IS NOT NULL OR salary_max IS NOT NULL)) AS avg_salary,
      count(DISTINCT company_name) AS unique_companies,
      count(*) FILTER (WHERE loc_type = 'Remote' OR is_remote = true) AS remote_jobs,
      count(*) FILTER (WHERE loc_type = 'Hybrid') AS hybrid_jobs,
      count(*) FILTER (WHERE loc_type = 'On-site' OR (loc_type IS NULL AND is_remote IS NOT TRUE)) AS onsite_jobs
    FROM filtered
  )
  SELECT jsonb_build_object(
    'total_jobs', (SELECT total_jobs FROM stats),
    'jobs_with_salary', (SELECT jobs_with_salary FROM stats),
    'median_salary', (SELECT median_salary FROM stats),
    'avg_salary', (SELECT avg_salary FROM stats),
    'unique_companies', (SELECT unique_companies FROM stats),
    'remote_jobs', (SELECT remote_jobs FROM stats),
    'hybrid_jobs', (SELECT hybrid_jobs FROM stats),
    'onsite_jobs', (SELECT onsite_jobs FROM stats)
  );
$$;

-- 2. Top companies in an industry
CREATE OR REPLACE FUNCTION get_industry_top_companies(p_industry text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH industry_map AS (
    SELECT CASE
      WHEN industry IN ('computer software','computer games','information technology and services','internet','information services') THEN 'Technology'
      WHEN industry IN ('hospital & health care','medical devices','medical practice','mental health care','health, wellness and fitness','biotechnology','pharmaceuticals') THEN 'Healthcare'
      WHEN industry IN ('financial services','banking','insurance','venture capital & private equity','accounting') THEN 'Finance'
      WHEN industry IN ('management consulting','human resources','staffing and recruiting','professional training & coaching','outsourcing/offshoring','facilities services','environmental services') THEN 'Consulting & Services'
      WHEN industry IN ('retail','consumer goods','consumer electronics','consumer services','food & beverages','food production','cosmetics','luxury goods & jewelry','apparel & fashion') THEN 'Retail & Consumer'
      WHEN industry IN ('marketing and advertising','media production','entertainment','public relations and communications','graphic design','photography') THEN 'Media & Marketing'
      WHEN industry IN ('mechanical or industrial engineering','electrical/electronic manufacturing','building materials','machinery','automotive','defense & space','shipbuilding') THEN 'Manufacturing'
      WHEN industry IN ('real estate','construction','civil engineering') THEN 'Real Estate & Construction'
      WHEN industry IN ('utilities','renewables & environment','mining & metals') THEN 'Energy'
      WHEN industry IN ('higher education','primary/secondary education','research') THEN 'Education'
      WHEN industry IN ('logistics and supply chain','transportation/trucking/railroad') THEN 'Logistics & Transport'
      WHEN industry IN ('law practice','legal services') THEN 'Legal'
      WHEN industry IN ('non-profit organization management','fund-raising') THEN 'Non-Profit'
      WHEN industry IN ('hospitality','leisure, travel & tourism') THEN 'Hospitality'
      WHEN industry IN ('security and investigations','translation and localization') THEN 'Other'
      ELSE 'Other'
    END AS sector, company_name, salary_min, salary_max
    FROM ats_jobs
    WHERE industry IS NOT NULL
  )
  SELECT jsonb_agg(row_to_json(t)::jsonb)
  FROM (
    SELECT
      company_name,
      count(*) AS job_count,
      round(avg((COALESCE(salary_min,0)+COALESCE(salary_max,0))/2.0) FILTER (WHERE salary_min IS NOT NULL OR salary_max IS NOT NULL)) AS avg_salary
    FROM industry_map
    WHERE sector = p_industry
    GROUP BY company_name
    ORDER BY count(*) DESC
    LIMIT 15
  ) t;
$$;

-- 3. Department distribution within an industry
CREATE OR REPLACE FUNCTION get_industry_departments(p_industry text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH industry_map AS (
    SELECT CASE
      WHEN industry IN ('computer software','computer games','information technology and services','internet','information services') THEN 'Technology'
      WHEN industry IN ('hospital & health care','medical devices','medical practice','mental health care','health, wellness and fitness','biotechnology','pharmaceuticals') THEN 'Healthcare'
      WHEN industry IN ('financial services','banking','insurance','venture capital & private equity','accounting') THEN 'Finance'
      WHEN industry IN ('management consulting','human resources','staffing and recruiting','professional training & coaching','outsourcing/offshoring','facilities services','environmental services') THEN 'Consulting & Services'
      WHEN industry IN ('retail','consumer goods','consumer electronics','consumer services','food & beverages','food production','cosmetics','luxury goods & jewelry','apparel & fashion') THEN 'Retail & Consumer'
      WHEN industry IN ('marketing and advertising','media production','entertainment','public relations and communications','graphic design','photography') THEN 'Media & Marketing'
      WHEN industry IN ('mechanical or industrial engineering','electrical/electronic manufacturing','building materials','machinery','automotive','defense & space','shipbuilding') THEN 'Manufacturing'
      WHEN industry IN ('real estate','construction','civil engineering') THEN 'Real Estate & Construction'
      WHEN industry IN ('utilities','renewables & environment','mining & metals') THEN 'Energy'
      WHEN industry IN ('higher education','primary/secondary education','research') THEN 'Education'
      WHEN industry IN ('logistics and supply chain','transportation/trucking/railroad') THEN 'Logistics & Transport'
      WHEN industry IN ('law practice','legal services') THEN 'Legal'
      WHEN industry IN ('non-profit organization management','fund-raising') THEN 'Non-Profit'
      WHEN industry IN ('hospitality','leisure, travel & tourism') THEN 'Hospitality'
      WHEN industry IN ('security and investigations','translation and localization') THEN 'Other'
      ELSE 'Other'
    END AS sector, extracted_department
    FROM ats_jobs
    WHERE industry IS NOT NULL
  )
  SELECT jsonb_agg(row_to_json(t)::jsonb)
  FROM (
    SELECT
      COALESCE(extracted_department, 'other') AS department,
      count(*) AS job_count
    FROM industry_map
    WHERE sector = p_industry
    GROUP BY extracted_department
    ORDER BY count(*) DESC
    LIMIT 12
  ) t;
$$;

-- 4. Salary distribution buckets for an industry
CREATE OR REPLACE FUNCTION get_industry_salary_distribution(p_industry text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH industry_map AS (
    SELECT CASE
      WHEN industry IN ('computer software','computer games','information technology and services','internet','information services') THEN 'Technology'
      WHEN industry IN ('hospital & health care','medical devices','medical practice','mental health care','health, wellness and fitness','biotechnology','pharmaceuticals') THEN 'Healthcare'
      WHEN industry IN ('financial services','banking','insurance','venture capital & private equity','accounting') THEN 'Finance'
      WHEN industry IN ('management consulting','human resources','staffing and recruiting','professional training & coaching','outsourcing/offshoring','facilities services','environmental services') THEN 'Consulting & Services'
      WHEN industry IN ('retail','consumer goods','consumer electronics','consumer services','food & beverages','food production','cosmetics','luxury goods & jewelry','apparel & fashion') THEN 'Retail & Consumer'
      WHEN industry IN ('marketing and advertising','media production','entertainment','public relations and communications','graphic design','photography') THEN 'Media & Marketing'
      WHEN industry IN ('mechanical or industrial engineering','electrical/electronic manufacturing','building materials','machinery','automotive','defense & space','shipbuilding') THEN 'Manufacturing'
      WHEN industry IN ('real estate','construction','civil engineering') THEN 'Real Estate & Construction'
      WHEN industry IN ('utilities','renewables & environment','mining & metals') THEN 'Energy'
      WHEN industry IN ('higher education','primary/secondary education','research') THEN 'Education'
      WHEN industry IN ('logistics and supply chain','transportation/trucking/railroad') THEN 'Logistics & Transport'
      WHEN industry IN ('law practice','legal services') THEN 'Legal'
      WHEN industry IN ('non-profit organization management','fund-raising') THEN 'Non-Profit'
      WHEN industry IN ('hospitality','leisure, travel & tourism') THEN 'Hospitality'
      WHEN industry IN ('security and investigations','translation and localization') THEN 'Other'
      ELSE 'Other'
    END AS sector, salary_min, salary_max
    FROM ats_jobs
    WHERE industry IS NOT NULL AND (salary_min IS NOT NULL OR salary_max IS NOT NULL)
  ),
  sal AS (
    SELECT (COALESCE(salary_min,0)+COALESCE(salary_max,0))/2.0 AS mid
    FROM industry_map WHERE sector = p_industry
  ),
  buckets AS (
    SELECT
      CASE
        WHEN mid < 50000 THEN '$0-50K'
        WHEN mid < 75000 THEN '$50-75K'
        WHEN mid < 100000 THEN '$75-100K'
        WHEN mid < 125000 THEN '$100-125K'
        WHEN mid < 150000 THEN '$125-150K'
        WHEN mid < 200000 THEN '$150-200K'
        ELSE '$200K+'
      END AS range,
      CASE
        WHEN mid < 50000 THEN 1
        WHEN mid < 75000 THEN 2
        WHEN mid < 100000 THEN 3
        WHEN mid < 125000 THEN 4
        WHEN mid < 150000 THEN 5
        WHEN mid < 200000 THEN 6
        ELSE 7
      END AS sort_order
    FROM sal
  )
  SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_order)
  FROM (
    SELECT range, count(*) AS job_count, sort_order
    FROM buckets GROUP BY range, sort_order ORDER BY sort_order
  ) t;
$$;

-- 5. Seniority distribution for an industry
CREATE OR REPLACE FUNCTION get_industry_seniority(p_industry text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH industry_map AS (
    SELECT CASE
      WHEN industry IN ('computer software','computer games','information technology and services','internet','information services') THEN 'Technology'
      WHEN industry IN ('hospital & health care','medical devices','medical practice','mental health care','health, wellness and fitness','biotechnology','pharmaceuticals') THEN 'Healthcare'
      WHEN industry IN ('financial services','banking','insurance','venture capital & private equity','accounting') THEN 'Finance'
      WHEN industry IN ('management consulting','human resources','staffing and recruiting','professional training & coaching','outsourcing/offshoring','facilities services','environmental services') THEN 'Consulting & Services'
      WHEN industry IN ('retail','consumer goods','consumer electronics','consumer services','food & beverages','food production','cosmetics','luxury goods & jewelry','apparel & fashion') THEN 'Retail & Consumer'
      WHEN industry IN ('marketing and advertising','media production','entertainment','public relations and communications','graphic design','photography') THEN 'Media & Marketing'
      WHEN industry IN ('mechanical or industrial engineering','electrical/electronic manufacturing','building materials','machinery','automotive','defense & space','shipbuilding') THEN 'Manufacturing'
      WHEN industry IN ('real estate','construction','civil engineering') THEN 'Real Estate & Construction'
      WHEN industry IN ('utilities','renewables & environment','mining & metals') THEN 'Energy'
      WHEN industry IN ('higher education','primary/secondary education','research') THEN 'Education'
      WHEN industry IN ('logistics and supply chain','transportation/trucking/railroad') THEN 'Logistics & Transport'
      WHEN industry IN ('law practice','legal services') THEN 'Legal'
      WHEN industry IN ('non-profit organization management','fund-raising') THEN 'Non-Profit'
      WHEN industry IN ('hospitality','leisure, travel & tourism') THEN 'Hospitality'
      WHEN industry IN ('security and investigations','translation and localization') THEN 'Other'
      ELSE 'Other'
    END AS sector, extracted_seniority
    FROM ats_jobs
    WHERE industry IS NOT NULL
  )
  SELECT jsonb_agg(row_to_json(t)::jsonb)
  FROM (
    SELECT
      COALESCE(extracted_seniority, 'unknown') AS level,
      count(*) AS job_count
    FROM industry_map
    WHERE sector = p_industry
    GROUP BY extracted_seniority
    ORDER BY count(*) DESC
  ) t;
$$;

-- Grant anon access
GRANT EXECUTE ON FUNCTION get_industry_detail(text) TO anon;
GRANT EXECUTE ON FUNCTION get_industry_top_companies(text) TO anon;
GRANT EXECUTE ON FUNCTION get_industry_departments(text) TO anon;
GRANT EXECUTE ON FUNCTION get_industry_salary_distribution(text) TO anon;
GRANT EXECUTE ON FUNCTION get_industry_seniority(text) TO anon;
