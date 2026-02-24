DROP FUNCTION IF EXISTS compute_seo_cache();
DROP FUNCTION IF EXISTS compute_seo_cache_market();
DROP FUNCTION IF EXISTS compute_seo_cache_metro(text);
DROP FUNCTION IF EXISTS compute_seo_cache_role(text);
DROP FUNCTION IF EXISTS compute_seo_cache_combo(text, text);
DROP FUNCTION IF EXISTS compute_seo_cache_rankings();

-- =============================================================================
-- 1. Market overview
-- =============================================================================
CREATE OR REPLACE FUNCTION compute_seo_cache_market()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET statement_timeout = '120s' AS $$
DECLARE
  v_now timestamptz := now();
  v_month_start timestamptz := date_trunc('month', v_now);
  v_prev_month_start timestamptz := date_trunc('month', v_now - interval '1 month');
  v_12w_start timestamptz := v_now - interval '12 weeks';
  v_result jsonb;
  v_total int;
BEGIN
  SELECT count(*) INTO v_total FROM ats_jobs WHERE status = 'open';

  WITH salary_data AS (
    SELECT COALESCE(salary_min, salary_max) as sal
    FROM ats_jobs WHERE status = 'open' AND (salary_min IS NOT NULL OR salary_max IS NOT NULL)
  ),
  timeline AS (
    SELECT date_trunc('week', first_seen_at)::date as week, count(*) as cnt
    FROM ats_jobs WHERE status = 'open' AND first_seen_at >= v_12w_start GROUP BY 1 ORDER BY 1
  ),
  cur_mo AS (SELECT count(*) as cnt FROM ats_jobs WHERE status = 'open' AND first_seen_at >= v_month_start),
  prev_mo AS (SELECT count(*) as cnt FROM ats_jobs WHERE status = 'open' AND first_seen_at >= v_prev_month_start AND first_seen_at < v_month_start),
  ats_bd AS (SELECT ats_source, count(*) as cnt FROM ats_jobs WHERE status = 'open' GROUP BY 1 ORDER BY 2 DESC),
  top_co AS (SELECT company_name, count(*) as cnt FROM ats_jobs WHERE status = 'open' AND company_name IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 20),
  sal_bkt AS (
    SELECT (floor(sal / 25000) * 25000)::int as bmin, count(*) as cnt FROM salary_data GROUP BY 1 ORDER BY 1
  )
  SELECT jsonb_build_object(
    'stats', jsonb_build_object(
      'total_jobs', v_total,
      'median_salary', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY sal) FROM salary_data),
      'with_salary_count', (SELECT count(*) FROM salary_data),
      'companies_count', (SELECT count(DISTINCT company_name) FROM ats_jobs WHERE status = 'open' AND company_name IS NOT NULL)
    ),
    'trends', jsonb_build_object(
      'velocity_mom', CASE WHEN (SELECT cnt FROM prev_mo) > 0
        THEN round(((SELECT cnt FROM cur_mo)::numeric - (SELECT cnt FROM prev_mo)) / (SELECT cnt FROM prev_mo) * 100, 1)
        ELSE 0 END
    ),
    'charts', jsonb_build_object(
      'timeline', (SELECT COALESCE(jsonb_agg(jsonb_build_object('week', week, 'count', cnt)), '[]'::jsonb) FROM timeline),
      'salary_buckets', (SELECT COALESCE(jsonb_agg(jsonb_build_object('range', '$' || (bmin/1000)::text || 'K-$' || ((bmin+25000)/1000)::text || 'K', 'count', cnt)), '[]'::jsonb) FROM sal_bkt),
      'top_companies', (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', company_name, 'count', cnt)), '[]'::jsonb) FROM top_co),
      'ats_sources', (SELECT COALESCE(jsonb_object_agg(ats_source, cnt), '{}'::jsonb) FROM ats_bd)
    ),
    'meta', jsonb_build_object(
      'total_jobs_rounded', (floor(v_total::numeric / 50000) * 50000)::int || '+',
      'computed_at', v_now
    )
  ) INTO v_result;

  INSERT INTO seo_page_cache (cache_key, page_type, data, job_count, computed_at, expires_at)
  VALUES ('market:overview', 'market', v_result, v_total, v_now, v_now + interval '24 hours')
  ON CONFLICT (cache_key) DO UPDATE SET data = EXCLUDED.data, job_count = EXCLUDED.job_count, computed_at = EXCLUDED.computed_at, expires_at = EXCLUDED.expires_at;

  RETURN jsonb_build_object('status', 'ok', 'total_jobs', v_total);
END;
$$;

-- =============================================================================
-- 2. Single metro compute
-- =============================================================================
CREATE OR REPLACE FUNCTION compute_seo_cache_metro(p_metro_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET statement_timeout = '60s' AS $$
DECLARE
  v_metro RECORD;
  v_now timestamptz := now();
  v_month_start timestamptz := date_trunc('month', v_now);
  v_prev_month_start timestamptz := date_trunc('month', v_now - interval '1 month');
  v_12w_start timestamptz := v_now - interval '12 weeks';
  v_result jsonb;
  v_total int;
BEGIN
  SELECT * INTO v_metro FROM seo_metro_map WHERE slug = p_metro_slug AND is_active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'metro not found'); END IF;

  CREATE TEMP TABLE _metro_jobs ON COMMIT DROP AS
    SELECT * FROM ats_jobs
    WHERE status = 'open'
      AND (
        CASE WHEN v_metro.loc_type_override = 'remote' THEN loc_type = 'remote' OR is_remote = true
        ELSE (loc_city = ANY(v_metro.city_variants) OR loc_state = v_metro.state_code)
          AND (v_metro.exclude_cities IS NULL OR NOT (loc_city = ANY(v_metro.exclude_cities)))
        END
      );

  SELECT count(*) INTO v_total FROM _metro_jobs;

  WITH salary_data AS (
    SELECT COALESCE(salary_min, salary_max) as sal FROM _metro_jobs WHERE salary_min IS NOT NULL OR salary_max IS NOT NULL
  ),
  timeline AS (
    SELECT date_trunc('week', first_seen_at)::date as week, count(*) as cnt
    FROM _metro_jobs WHERE first_seen_at >= v_12w_start GROUP BY 1 ORDER BY 1
  ),
  cur_mo AS (SELECT count(*) as cnt FROM _metro_jobs WHERE first_seen_at >= v_month_start),
  prev_mo AS (SELECT count(*) as cnt FROM _metro_jobs WHERE first_seen_at >= v_prev_month_start AND first_seen_at < v_month_start),
  level_funnel AS (
    SELECT CASE
      WHEN title ~* '\m(intern|internship)\M' THEN 'Intern'
      WHEN title ~* '\m(junior|jr|entry.level|associate)\M' THEN 'Junior'
      WHEN title ~* '\m(senior|sr|staff|principal)\M' THEN 'Senior'
      WHEN title ~* '\m(lead|team.lead)\M' THEN 'Lead'
      WHEN title ~* '\m(manager|mgr)\M' THEN 'Manager'
      WHEN title ~* '\m(director|head.of)\M' THEN 'Director'
      WHEN title ~* '\m(VP|vice.president)\M' THEN 'VP'
      WHEN title ~* '\m(chief|C-suite|CTO|CFO|CEO|CMO|COO|CIO|CPO)\M' THEN 'C-Suite'
      ELSE 'Other'
    END as level, count(*) as cnt FROM _metro_jobs GROUP BY 1
  ),
  loc_split AS (
    SELECT CASE
      WHEN loc_type = 'remote' OR is_remote = true THEN 'Remote'
      WHEN loc_type = 'hybrid' OR location ILIKE '%hybrid%' THEN 'Hybrid'
      WHEN location IS NOT NULL AND location != '' THEN 'On-site'
      ELSE 'Unspecified'
    END as wm, count(*) as cnt FROM _metro_jobs GROUP BY 1
  ),
  top_co AS (SELECT company_name, count(*) as cnt FROM _metro_jobs WHERE company_name IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 20),
  ats_bd AS (SELECT ats_source, count(*) as cnt FROM _metro_jobs GROUP BY 1 ORDER BY 2 DESC),
  sal_bkt AS (
    SELECT (floor(sal / 25000) * 25000)::int as bmin, count(*) as cnt FROM salary_data GROUP BY 1 ORDER BY 1
  )
  SELECT jsonb_build_object(
    'stats', jsonb_build_object(
      'total_jobs', v_total,
      'median_salary', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY sal) FROM salary_data),
      'with_salary_count', (SELECT count(*) FROM salary_data),
      'senior_plus_pct', (SELECT round(sum(CASE WHEN level IN ('Senior','Lead','Manager','Director','VP','C-Suite') THEN cnt ELSE 0 END)::numeric / NULLIF(sum(cnt),0) * 100, 0) FROM level_funnel),
      'remote_pct', (SELECT round(COALESCE((SELECT cnt FROM loc_split WHERE wm = 'Remote'), 0)::numeric / NULLIF(v_total, 0) * 100, 0)),
      'companies_count', (SELECT count(DISTINCT company_name) FROM _metro_jobs WHERE company_name IS NOT NULL)
    ),
    'trends', jsonb_build_object(
      'velocity_mom', CASE WHEN (SELECT cnt FROM prev_mo) > 0
        THEN round(((SELECT cnt FROM cur_mo)::numeric - (SELECT cnt FROM prev_mo)) / (SELECT cnt FROM prev_mo) * 100, 1)
        ELSE 0 END
    ),
    'charts', jsonb_build_object(
      'timeline', (SELECT COALESCE(jsonb_agg(jsonb_build_object('week', week, 'count', cnt)), '[]'::jsonb) FROM timeline),
      'salary_buckets', (SELECT COALESCE(jsonb_agg(jsonb_build_object('range', '$' || (bmin/1000)::text || 'K-$' || ((bmin+25000)/1000)::text || 'K', 'count', cnt)), '[]'::jsonb) FROM sal_bkt),
      'level_funnel', (SELECT COALESCE(jsonb_agg(jsonb_build_object('level', level, 'count', cnt)), '[]'::jsonb) FROM level_funnel),
      'top_companies', (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', company_name, 'count', cnt)), '[]'::jsonb) FROM top_co),
      'loc_type', (SELECT COALESCE(jsonb_object_agg(wm, cnt), '{}'::jsonb) FROM loc_split),
      'ats_sources', (SELECT COALESCE(jsonb_object_agg(ats_source, cnt), '{}'::jsonb) FROM ats_bd)
    ),
    'metro', jsonb_build_object('slug', v_metro.slug, 'display_name', v_metro.display_name),
    'meta', jsonb_build_object('computed_at', v_now)
  ) INTO v_result;

  INSERT INTO seo_page_cache (cache_key, page_type, data, job_count, computed_at, expires_at)
  VALUES ('metro:' || p_metro_slug, 'metro', v_result, v_total, v_now, v_now + interval '24 hours')
  ON CONFLICT (cache_key) DO UPDATE SET data = EXCLUDED.data, job_count = EXCLUDED.job_count, computed_at = EXCLUDED.computed_at, expires_at = EXCLUDED.expires_at;

  RETURN jsonb_build_object('status', 'ok', 'metro', p_metro_slug, 'jobs', v_total);
END;
$$;

-- =============================================================================
-- 3. Single role trend compute
-- =============================================================================
CREATE OR REPLACE FUNCTION compute_seo_cache_role(p_role_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET statement_timeout = '60s' AS $$
DECLARE
  v_role RECORD;
  v_now timestamptz := now();
  v_month_start timestamptz := date_trunc('month', v_now);
  v_prev_month_start timestamptz := date_trunc('month', v_now - interval '1 month');
  v_12w_start timestamptz := v_now - interval '12 weeks';
  v_result jsonb;
  v_total int;
BEGIN
  SELECT * INTO v_role FROM seo_role_map WHERE slug = p_role_slug AND is_active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'role not found'); END IF;

  CREATE TEMP TABLE _role_jobs ON COMMIT DROP AS
    SELECT * FROM ats_jobs
    WHERE status = 'open'
      AND title ILIKE ANY(SELECT '%' || unnest(v_role.keywords) || '%')
      AND (v_role.exclude_keywords IS NULL OR NOT (title ILIKE ANY(SELECT '%' || unnest(v_role.exclude_keywords) || '%')));

  SELECT count(*) INTO v_total FROM _role_jobs;

  WITH salary_data AS (
    SELECT COALESCE(salary_min, salary_max) as sal FROM _role_jobs WHERE salary_min IS NOT NULL OR salary_max IS NOT NULL
  ),
  timeline AS (
    SELECT date_trunc('week', first_seen_at)::date as week, count(*) as cnt
    FROM _role_jobs WHERE first_seen_at >= v_12w_start GROUP BY 1 ORDER BY 1
  ),
  cur_mo AS (SELECT count(*) as cnt FROM _role_jobs WHERE first_seen_at >= v_month_start),
  prev_mo AS (SELECT count(*) as cnt FROM _role_jobs WHERE first_seen_at >= v_prev_month_start AND first_seen_at < v_month_start),
  level_funnel AS (
    SELECT CASE
      WHEN title ~* '\m(intern|internship)\M' THEN 'Intern'
      WHEN title ~* '\m(junior|jr|entry.level|associate)\M' THEN 'Junior'
      WHEN title ~* '\m(senior|sr|staff|principal)\M' THEN 'Senior'
      WHEN title ~* '\m(lead|team.lead)\M' THEN 'Lead'
      WHEN title ~* '\m(director|head.of)\M' THEN 'Director'
      WHEN title ~* '\m(VP|vice.president)\M' THEN 'VP'
      ELSE 'Other'
    END as level, count(*) as cnt FROM _role_jobs GROUP BY 1
  ),
  top_co AS (SELECT company_name, count(*) as cnt FROM _role_jobs WHERE company_name IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 15),
  top_metros AS (
    SELECT loc_state, count(*) as cnt FROM _role_jobs WHERE loc_state IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 15
  ),
  loc_split AS (
    SELECT CASE
      WHEN loc_type = 'remote' OR is_remote = true THEN 'Remote'
      WHEN loc_type = 'hybrid' OR location ILIKE '%hybrid%' THEN 'Hybrid'
      WHEN location IS NOT NULL AND location != '' THEN 'On-site'
      ELSE 'Unspecified'
    END as wm, count(*) as cnt FROM _role_jobs GROUP BY 1
  ),
  sal_bkt AS (
    SELECT (floor(sal / 25000) * 25000)::int as bmin, count(*) as cnt FROM salary_data GROUP BY 1 ORDER BY 1
  )
  SELECT jsonb_build_object(
    'stats', jsonb_build_object(
      'total_jobs', v_total,
      'median_salary', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY sal) FROM salary_data),
      'with_salary_count', (SELECT count(*) FROM salary_data),
      'remote_pct', (SELECT round(COALESCE((SELECT cnt FROM loc_split WHERE wm = 'Remote'), 0)::numeric / NULLIF(v_total, 0) * 100, 0)),
      'companies_count', (SELECT count(DISTINCT company_name) FROM _role_jobs WHERE company_name IS NOT NULL)
    ),
    'trends', jsonb_build_object(
      'velocity_mom', CASE WHEN (SELECT cnt FROM prev_mo) > 0
        THEN round(((SELECT cnt FROM cur_mo)::numeric - (SELECT cnt FROM prev_mo)) / (SELECT cnt FROM prev_mo) * 100, 1)
        ELSE 0 END
    ),
    'charts', jsonb_build_object(
      'timeline', (SELECT COALESCE(jsonb_agg(jsonb_build_object('week', week, 'count', cnt)), '[]'::jsonb) FROM timeline),
      'salary_buckets', (SELECT COALESCE(jsonb_agg(jsonb_build_object('range', '$' || (bmin/1000)::text || 'K-$' || ((bmin+25000)/1000)::text || 'K', 'count', cnt)), '[]'::jsonb) FROM sal_bkt),
      'level_funnel', (SELECT COALESCE(jsonb_agg(jsonb_build_object('level', level, 'count', cnt)), '[]'::jsonb) FROM level_funnel),
      'top_companies', (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', company_name, 'count', cnt)), '[]'::jsonb) FROM top_co),
      'top_metros', (SELECT COALESCE(jsonb_agg(jsonb_build_object('state', loc_state, 'count', cnt)), '[]'::jsonb) FROM top_metros),
      'loc_type', (SELECT COALESCE(jsonb_object_agg(wm, cnt), '{}'::jsonb) FROM loc_split)
    ),
    'role', jsonb_build_object('slug', v_role.slug, 'display_name', v_role.display_name),
    'meta', jsonb_build_object('computed_at', v_now)
  ) INTO v_result;

  INSERT INTO seo_page_cache (cache_key, page_type, data, job_count, computed_at, expires_at)
  VALUES ('trends:' || p_role_slug, 'trends', v_result, v_total, v_now, v_now + interval '24 hours')
  ON CONFLICT (cache_key) DO UPDATE SET data = EXCLUDED.data, job_count = EXCLUDED.job_count, computed_at = EXCLUDED.computed_at, expires_at = EXCLUDED.expires_at;

  RETURN jsonb_build_object('status', 'ok', 'role', p_role_slug, 'jobs', v_total);
END;
$$;

-- =============================================================================
-- 4. Cross-metro rankings (run after all metros computed)
-- =============================================================================
CREATE OR REPLACE FUNCTION compute_seo_cache_rankings()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET statement_timeout = '30s' AS $$
DECLARE
  v_salary_ranking jsonb;
  v_volume_ranking jsonb;
  v_national_median numeric;
  v_total_rounded text;
  v_metro RECORD;
BEGIN
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY COALESCE(salary_min, salary_max))
  INTO v_national_median
  FROM ats_jobs WHERE status = 'open' AND (salary_min IS NOT NULL OR salary_max IS NOT NULL);

  SELECT data->'meta'->>'total_jobs_rounded' INTO v_total_rounded
  FROM seo_page_cache WHERE cache_key = 'market:overview';

  WITH metro_summaries AS (
    SELECT
      cache_key,
      data->'metro'->>'slug' as metro_slug,
      data->'metro'->>'display_name' as display_name,
      (data->'stats'->>'median_salary')::numeric as median_salary,
      (data->'stats'->>'total_jobs')::int as total_jobs
    FROM seo_page_cache
    WHERE page_type = 'metro' AND cache_key NOT LIKE '%:%:%'
  )
  SELECT
    jsonb_agg(jsonb_build_object('metro', metro_slug, 'display', display_name, 'median', median_salary) ORDER BY median_salary DESC NULLS LAST),
    jsonb_agg(jsonb_build_object('metro', metro_slug, 'display', display_name, 'count', total_jobs) ORDER BY total_jobs DESC)
  INTO v_salary_ranking, v_volume_ranking
  FROM metro_summaries;

  FOR v_metro IN SELECT slug FROM seo_metro_map WHERE is_active = true
  LOOP
    UPDATE seo_page_cache
    SET data = jsonb_set(
      jsonb_set(
        data,
        '{comparison}',
        jsonb_build_object(
          'salary_ranking', v_salary_ranking,
          'volume_ranking', v_volume_ranking,
          'national_median', v_national_median
        )
      ),
      '{meta}',
      COALESCE(data->'meta', '{}'::jsonb) || jsonb_build_object('total_jobs_rounded', v_total_rounded)
    )
    WHERE cache_key = 'metro:' || v_metro.slug;
  END LOOP;

  RETURN jsonb_build_object('status', 'ok', 'national_median', v_national_median, 'metros_updated', (SELECT count(*) FROM seo_metro_map WHERE is_active = true));
END;
$$;

-- =============================================================================
-- 5. Orchestrator — calls all sub-functions sequentially
-- =============================================================================
CREATE OR REPLACE FUNCTION compute_seo_cache_all()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET statement_timeout = '600s' AS $$
DECLARE
  v_metro RECORD;
  v_role RECORD;
  v_result jsonb;
  v_metros int := 0;
  v_roles int := 0;
BEGIN
  -- Market overview
  PERFORM compute_seo_cache_market();

  -- All metros
  FOR v_metro IN SELECT slug FROM seo_metro_map WHERE is_active = true ORDER BY sort_order
  LOOP
    PERFORM compute_seo_cache_metro(v_metro.slug);
    v_metros := v_metros + 1;
  END LOOP;

  -- Rankings (after all metros computed)
  PERFORM compute_seo_cache_rankings();

  -- All roles
  FOR v_role IN SELECT slug FROM seo_role_map WHERE is_active = true ORDER BY sort_order
  LOOP
    PERFORM compute_seo_cache_role(v_role.slug);
    v_roles := v_roles + 1;
  END LOOP;

  RETURN jsonb_build_object('status', 'ok', 'metros', v_metros, 'roles', v_roles);
END;
$$;
