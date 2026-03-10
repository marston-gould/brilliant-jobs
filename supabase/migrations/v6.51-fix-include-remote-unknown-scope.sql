-- v6.51: Tighten include_remote unknown-country clause in search_jobs_multi (inline mode)
-- ─────────────────────────────────────────────────────────────────────────────
-- Bug: When include_remote = true, the RPC used three overly-broad clauses:
--   1. location ILIKE 'Remote%'         — no country scope; matches "Remote - Philippines"
--   2. loc_type = 'remote' AND (loc_country IS NULL OR ...)
--   3. is_remote = true AND (loc_country IS NULL OR ...)
--
-- Clauses 2 & 3 treat NULL loc_country as US benefit-of-the-doubt for ALL remote jobs,
-- including those whose location TEXT clearly signals a non-US country
-- (e.g. "Hyderabad, TS, IN", "Asia", "ph", "za").
--
-- Rule (from product owner):
--   - Remote, country known non-US   → exclude
--   - Remote, country known US        → include
--   - Remote, location text ambiguous → include (benefit of doubt)
--   - Remote, location text clearly non-US → exclude
--
-- Fix: Replace all three broad clauses with the same logic as buildUSRemoteClauses()
-- in src/app/pages/dashboard/feed/hooks/us-filter.ts. The TypeScript and SQL paths
-- must be identical in behavior.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION search_jobs_multi(
  p_filters     jsonb,
  p_sort_col    text    DEFAULT 'updated_at',
  p_sort_asc    boolean DEFAULT false,
  p_page        int     DEFAULT 0,
  p_per_page    int     DEFAULT 50,
  p_hidden_ids  text[]  DEFAULT '{}',
  p_content_search boolean DEFAULT false,
  p_trust_labels text[] DEFAULT NULL,
  p_ai_labels   text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_filter      jsonb;
  v_clauses     text[];
  v_or_parts    text[];
  v_ids         text[];
  v_val         text;
  v_safe        text;
  v_bbox        jsonb;
  v_sort_dir    text;
  v_sql         text;
  v_count_sql   text;
  v_where       text;
  v_total       bigint;
  v_data        jsonb;
  v_pay_min     numeric;
  v_pay_max     numeric;
  v_since       timestamptz;
  v_filter_idx  int;
  v_all_clauses text[];
  v_union_parts text[];
  v_ranked_sql  text;
  v_result      jsonb;
BEGIN
  v_sort_dir := CASE WHEN p_sort_asc THEN 'ASC' ELSE 'DESC' END;

  IF p_sort_col NOT IN ('updated_at','first_seen_at','salary_max','salary_min','company_name','title') THEN
    p_sort_col := 'updated_at';
  END IF;

  v_all_clauses := ARRAY[]::text[];
  v_filter_idx := 0;

  FOR v_filter IN SELECT jsonb_array_elements(p_filters)
  LOOP
    v_filter_idx := v_filter_idx + 1;
    v_clauses := ARRAY[]::text[];

    v_clauses := array_append(v_clauses, 'status = ''open''');

    -- WHAT
    IF v_filter ? 'what' AND jsonb_array_length(v_filter->'what') > 0 THEN
      v_or_parts := ARRAY[]::text[];
      FOR v_val IN SELECT jsonb_array_elements_text(v_filter->'what')
      LOOP
        v_safe := trim(regexp_replace(v_val, '[%_\\]', '\\&', 'g'));
        IF v_safe <> '' THEN
          v_or_parts := array_append(v_or_parts, format('title ILIKE %L', '%' || v_safe || '%'));
          IF p_content_search THEN
            v_or_parts := array_append(v_or_parts, format('content_tsv @@ websearch_to_tsquery(''english'', %L)', v_safe));
          END IF;
        END IF;
      END LOOP;
      IF array_length(v_or_parts, 1) > 0 THEN
        v_clauses := array_append(v_clauses, '(' || array_to_string(v_or_parts, ' OR ') || ')');
      END IF;
    END IF;

    IF v_filter ? 'what_not' AND jsonb_array_length(v_filter->'what_not') > 0 THEN
      FOR v_val IN SELECT jsonb_array_elements_text(v_filter->'what_not')
      LOOP
        v_safe := trim(regexp_replace(v_val, '^nor\s+', '', 'i'));
        v_safe := regexp_replace(v_safe, '[%_\\]', '\\&', 'g');
        IF v_safe <> '' THEN
          v_clauses := array_append(v_clauses, format('title NOT ILIKE %L', '%' || v_safe || '%'));
          IF p_content_search THEN
            v_clauses := array_append(v_clauses,
              format('(NOT content_tsv @@ websearch_to_tsquery(''english'', %L) OR content_tsv IS NULL)', v_safe));
          END IF;
        END IF;
      END LOOP;
    END IF;

    IF v_filter ? 'title_excludes' AND jsonb_array_length(v_filter->'title_excludes') > 0 THEN
      FOR v_val IN SELECT jsonb_array_elements_text(v_filter->'title_excludes')
      LOOP
        v_safe := trim(v_val);
        IF v_safe <> '' THEN
          v_clauses := array_append(v_clauses, format('title NOT ILIKE %L', '%' || v_safe || '%'));
        END IF;
      END LOOP;
    END IF;

    -- WHERE
    IF (v_filter->>'where_mode') = 'remote_only' THEN
      v_clauses := array_append(v_clauses,
        '(location ILIKE ''Remote%'' OR location ILIKE ''%remote%'' OR is_remote = true)');

    ELSIF (v_filter->>'where_mode') = 'ids' THEN
      IF v_filter ? 'where_ids' AND jsonb_array_length(v_filter->'where_ids') > 0 THEN
        SELECT array_agg(x) INTO v_ids FROM jsonb_array_elements_text(v_filter->'where_ids') x;
        IF array_length(v_ids, 1) <= 200 THEN
          v_clauses := array_append(v_clauses,
            format('greenhouse_id = ANY(%L::text[])', v_ids));
        ELSIF v_filter ? 'where_bbox' THEN
          v_bbox := v_filter->'where_bbox';
          v_clauses := array_append(v_clauses, format(
            '(loc_lat BETWEEN %s AND %s AND loc_lng BETWEEN %s AND %s)',
            (v_bbox->>'min_lat')::numeric, (v_bbox->>'max_lat')::numeric,
            (v_bbox->>'min_lng')::numeric, (v_bbox->>'max_lng')::numeric
          ));
        END IF;
        IF (v_filter->>'where_has_remote')::boolean IS TRUE THEN
          v_clauses := array_append(v_clauses, 'OR loc_type = ''remote''');
          v_clauses := array_append(v_clauses, 'OR location ILIKE ''%remote%''');
        END IF;
        IF array_length(v_ids, 1) > 200 THEN
          SELECT array_agg(x) INTO v_ids FROM (SELECT jsonb_array_elements_text(v_filter->'where_ids') x LIMIT 200) sub;
          IF v_ids IS NOT NULL THEN
            v_clauses := array_append(v_clauses, format('greenhouse_id = ANY(%L::text[])', v_ids));
          END IF;
        END IF;
      END IF;

      IF (v_filter->>'where_is_us_search')::boolean IS TRUE THEN
        v_clauses := array_append(v_clauses, '(loc_country <> ''CA'' OR loc_country IS NULL)');
        v_clauses := array_append(v_clauses, 'location NOT ILIKE ''%Canada%''');
        v_clauses := array_append(v_clauses, 'location NOT ILIKE ''%, BC%''');
        v_clauses := array_append(v_clauses, 'location NOT ILIKE ''%British Columbia%''');
      END IF;

    ELSIF (v_filter->>'where_mode') = 'inline' THEN
      IF v_filter ? 'where_text' AND jsonb_array_length(v_filter->'where_text') > 0 THEN
        v_or_parts := ARRAY[]::text[];
        FOR v_val IN SELECT jsonb_array_elements_text(v_filter->'where_text')
        LOOP
          v_safe := trim(v_val);
          IF v_safe <> '' THEN
            IF lower(v_safe) IN ('united states','usa','us','u.s.','america') THEN
              v_or_parts := array_append(v_or_parts, 'loc_country = ''US''');
            ELSIF lower(v_safe) IN ('canada') THEN
              v_or_parts := array_append(v_or_parts, 'loc_country = ''CA''');
            ELSIF lower(v_safe) IN ('united kingdom','uk','england') THEN
              v_or_parts := array_append(v_or_parts, 'loc_country = ''GB''');
            ELSE
              v_or_parts := array_append(v_or_parts, format('location ILIKE %L', '%' || v_safe || '%'));
              v_or_parts := array_append(v_or_parts, format('loc_display ILIKE %L', '%' || v_safe || '%'));
              v_or_parts := array_append(v_or_parts, format('loc_country ILIKE %L', '%' || v_safe || '%'));
            END IF;
            v_or_parts := array_append(v_or_parts, format('location ILIKE %L', '%' || v_safe || '%'));
          END IF;
        END LOOP;

        -- ── include_remote (v6.51) ──────────────────────────────────────────────
        -- Rule: show remote jobs that are (a) explicitly US, or (b) have no country
        -- signal AND location text does not clearly indicate a non-US country.
        -- "Unknown" means bare 'Remote', 'Anywhere', 'Work From Home', 'Remote Work' —
        -- NOT 'Remote - Philippines', 'Remote, India', 'Asia', etc.
        -- This mirrors buildUSRemoteClauses() in us-filter.ts exactly.
        -- ───────────────────────────────────────────────────────────────────────
        IF (v_filter->>'include_remote')::boolean IS TRUE THEN
          -- Explicitly US remote
          v_or_parts := array_append(v_or_parts, '(is_remote = true AND loc_country = ''US'')');
          v_or_parts := array_append(v_or_parts, '(loc_type = ''remote'' AND loc_country = ''US'')');
          -- NULL country + US state code + is_remote
          v_or_parts := array_append(v_or_parts,
            '(is_remote = true AND loc_country IS NULL AND loc_state IN (''AL'',''AK'',''AZ'',''AR'',''CA'',''CO'',''CT'',''DE'',''FL'',''GA'',''HI'',''ID'',''IL'',''IN'',''IA'',''KS'',''KY'',''LA'',''ME'',''MD'',''MA'',''MI'',''MN'',''MS'',''MO'',''MT'',''NE'',''NV'',''NH'',''NJ'',''NM'',''NY'',''NC'',''ND'',''OH'',''OK'',''OR'',''PA'',''RI'',''SC'',''SD'',''TN'',''TX'',''UT'',''VT'',''VA'',''WA'',''WV'',''WI'',''WY'',''DC''))');
          -- NULL country + US-signaling text in location
          v_or_parts := array_append(v_or_parts, '(loc_country IS NULL AND location ILIKE ''%Remote%United States%'')');
          v_or_parts := array_append(v_or_parts, '(loc_country IS NULL AND location ILIKE ''%Remote%USA%'')');
          v_or_parts := array_append(v_or_parts, '(loc_country IS NULL AND location ILIKE ''%Remote%, US'')');
          v_or_parts := array_append(v_or_parts, '(loc_country IS NULL AND location ILIKE ''%Remote%, US %'')');
          v_or_parts := array_append(v_or_parts, '(loc_country IS NULL AND location ILIKE ''%Remote%(US)%'')');
          v_or_parts := array_append(v_or_parts, '(loc_country IS NULL AND location ILIKE ''%Remote%- US'')');
          v_or_parts := array_append(v_or_parts, '(loc_country IS NULL AND location ILIKE ''%Remote%- US %'')');
          -- NULL country + truly ambiguous location text (genuine unknowns → benefit of doubt)
          v_or_parts := array_append(v_or_parts, '(loc_country IS NULL AND location = ''Remote'')');
          v_or_parts := array_append(v_or_parts, '(loc_country IS NULL AND location = ''Anywhere'')');
          v_or_parts := array_append(v_or_parts, '(loc_country IS NULL AND location ILIKE ''Work From Home%'')');
          v_or_parts := array_append(v_or_parts, '(loc_country IS NULL AND location ILIKE ''Remote Work%'')');
        END IF;

        IF array_length(v_or_parts, 1) > 0 THEN
          v_clauses := array_append(v_clauses, '(' || array_to_string(v_or_parts, ' OR ') || ')');
        END IF;
      END IF;
    END IF;

    -- WHERE NOT
    IF v_filter ? 'where_not' AND jsonb_array_length(v_filter->'where_not') > 0 THEN
      FOR v_val IN SELECT jsonb_array_elements_text(v_filter->'where_not')
      LOOP
        v_safe := trim(regexp_replace(v_val, '^nor\s+', '', 'i'));
        IF v_safe <> '' THEN
          v_clauses := array_append(v_clauses, format('location NOT ILIKE %L', '%' || v_safe || '%'));
        END IF;
      END LOOP;
    END IF;

    IF v_filter ? 'location_excludes' AND jsonb_array_length(v_filter->'location_excludes') > 0 THEN
      FOR v_val IN SELECT jsonb_array_elements_text(v_filter->'location_excludes')
      LOOP
        IF trim(v_val) <> '' THEN
          v_clauses := array_append(v_clauses, format('location NOT ILIKE %L', '%' || trim(v_val) || '%'));
        END IF;
      END LOOP;
    END IF;

    -- US-Only
    IF (v_filter->>'us_only')::boolean IS TRUE THEN
      v_clauses := array_append(v_clauses, '(' ||
        'loc_country = ''US'' OR ' ||
        '(loc_country IS NULL AND loc_state IN (''AL'',''AK'',''AZ'',''AR'',''CA'',''CO'',''CT'',''DE'',''FL'',''GA'',''HI'',''ID'',''IL'',''IN'',''IA'',''KS'',''KY'',''LA'',''ME'',''MD'',''MA'',''MI'',''MN'',''MS'',''MO'',''MT'',''NE'',''NV'',''NH'',''NJ'',''NM'',''NY'',''NC'',''ND'',''OH'',''OK'',''OR'',''PA'',''RI'',''SC'',''SD'',''TN'',''TX'',''UT'',''VT'',''VA'',''WA'',''WV'',''WI'',''WY'',''DC'')) OR ' ||
        '(loc_country IS NULL AND location ILIKE ''%United States%'') OR ' ||
        '(loc_country IS NULL AND location ILIKE ''% USA%'') OR ' ||
        '(loc_country IS NULL AND location = ''Remote'') OR ' ||
        '(loc_country IS NULL AND location ILIKE ''Remote%United States%'') OR ' ||
        '(loc_country IS NULL AND location ILIKE ''Remote%USA%'') OR ' ||
        '(loc_country IS NULL AND location ILIKE ''Remote%US %'')' ||
      ')');
      v_clauses := array_append(v_clauses, '(loc_country <> ''CA'' OR loc_country IS NULL)');
      v_clauses := array_append(v_clauses, 'location NOT ILIKE ''%Canada%''');
      v_clauses := array_append(v_clauses, 'location NOT ILIKE ''%, BC%''');
      v_clauses := array_append(v_clauses, 'location NOT ILIKE ''%British Columbia%''');
    END IF;

    -- EXCLUDE HOURLY
    IF (v_filter->>'exclude_hourly')::boolean IS TRUE THEN
      v_clauses := array_append(v_clauses, '(salary_rate <> ''hr'' OR salary_rate IS NULL)');
    END IF;

    -- EXCLUDE STAFFING
    IF (v_filter->>'exclude_staffing')::boolean IS TRUE THEN
      v_clauses := array_append(v_clauses, '(is_staffing_agency IS NOT TRUE)');
    END IF;

    -- WHO
    IF v_filter ? 'who' AND jsonb_array_length(v_filter->'who') > 0 THEN
      v_or_parts := ARRAY[]::text[];
      FOR v_val IN SELECT jsonb_array_elements_text(v_filter->'who')
      LOOP
        v_safe := trim(v_val);
        IF v_safe <> '' THEN
          v_or_parts := array_append(v_or_parts, format('company_name ILIKE %L', '%' || v_safe || '%'));
        END IF;
      END LOOP;
      IF array_length(v_or_parts, 1) > 0 THEN
        v_clauses := array_append(v_clauses, '(' || array_to_string(v_or_parts, ' OR ') || ')');
      END IF;
    END IF;

    IF v_filter ? 'who_not' AND jsonb_array_length(v_filter->'who_not') > 0 THEN
      FOR v_val IN SELECT jsonb_array_elements_text(v_filter->'who_not')
      LOOP
        v_safe := trim(regexp_replace(v_val, '^nor\s+', '', 'i'));
        IF v_safe <> '' THEN
          v_clauses := array_append(v_clauses, format('company_name NOT ILIKE %L', '%' || v_safe || '%'));
        END IF;
      END LOOP;
    END IF;

    IF v_filter ? 'company_excludes' AND jsonb_array_length(v_filter->'company_excludes') > 0 THEN
      FOR v_val IN SELECT jsonb_array_elements_text(v_filter->'company_excludes')
      LOOP
        IF trim(v_val) <> '' THEN
          v_clauses := array_append(v_clauses, format('company_name NOT ILIKE %L', '%' || trim(v_val) || '%'));
        END IF;
      END LOOP;
    END IF;

    IF v_filter ? 'industry_excludes' AND jsonb_array_length(v_filter->'industry_excludes') > 0 THEN
      FOR v_val IN SELECT jsonb_array_elements_text(v_filter->'industry_excludes')
      LOOP
        IF trim(v_val) <> '' THEN
          v_clauses := array_append(v_clauses, format('industry NOT ILIKE %L', '%' || trim(v_val) || '%'));
        END IF;
      END LOOP;
    END IF;

    -- WHEN
    IF v_filter ? 'when_since' THEN
      BEGIN
        v_since := (v_filter->>'when_since')::timestamptz;
        v_clauses := array_append(v_clauses, format('first_seen_at >= %L', v_since));
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

    -- PAY
    v_pay_min := (v_filter->>'pay_min')::numeric;
    v_pay_max := (v_filter->>'pay_max')::numeric;
    IF v_pay_min IS NOT NULL OR v_pay_max IS NOT NULL THEN
      DECLARE
        v_inc_no_sal boolean := coalesce((v_filter->>'include_no_salary')::boolean, true);
      BEGIN
        IF v_pay_min IS NOT NULL AND v_pay_max IS NOT NULL THEN
          IF v_inc_no_sal THEN
            v_clauses := array_append(v_clauses,
              format('(salary_max >= %s AND salary_min <= %s OR salary_min IS NULL)', v_pay_min, v_pay_max));
          ELSE
            v_clauses := array_append(v_clauses,
              format('(salary_max >= %s AND salary_min <= %s)', v_pay_min, v_pay_max));
          END IF;
        ELSIF v_pay_min IS NOT NULL THEN
          IF v_inc_no_sal THEN
            v_clauses := array_append(v_clauses, format('(salary_max >= %s OR salary_min IS NULL)', v_pay_min));
          ELSE
            v_clauses := array_append(v_clauses, format('salary_max >= %s', v_pay_min));
          END IF;
        ELSIF v_pay_max IS NOT NULL THEN
          IF v_inc_no_sal THEN
            v_clauses := array_append(v_clauses, format('(salary_min <= %s OR salary_min IS NULL)', v_pay_max));
          ELSE
            v_clauses := array_append(v_clauses, format('salary_min <= %s', v_pay_max));
          END IF;
        END IF;
      END;
    END IF;

    -- JD TERMS
    IF v_filter ? 'jd_terms' AND jsonb_array_length(v_filter->'jd_terms') > 0 THEN
      FOR v_val IN SELECT jsonb_array_elements_text(v_filter->'jd_terms')
      LOOP
        v_safe := trim(v_val);
        IF v_safe <> '' THEN
          v_clauses := array_append(v_clauses,
            format('content_tsv @@ websearch_to_tsquery(''english'', %L)', v_safe));
        END IF;
      END LOOP;
    END IF;

    -- SKILLS
    IF v_filter ? 'skills' AND jsonb_array_length(v_filter->'skills') > 0 THEN
      v_or_parts := ARRAY[]::text[];
      FOR v_val IN SELECT jsonb_array_elements_text(v_filter->'skills')
      LOOP
        v_safe := lower(trim(v_val));
        IF v_safe <> '' THEN
          v_or_parts := array_append(v_or_parts, format('extracted_skills @> ARRAY[%L]', v_safe));
        END IF;
      END LOOP;
      IF array_length(v_or_parts, 1) > 0 THEN
        v_clauses := array_append(v_clauses, '(' || array_to_string(v_or_parts, ' OR ') || ')');
      END IF;
    END IF;

    -- LEVELS
    IF v_filter ? 'levels' AND jsonb_array_length(v_filter->'levels') > 0 THEN
      v_or_parts := ARRAY[]::text[];
      FOR v_val IN SELECT jsonb_array_elements_text(v_filter->'levels')
      LOOP
        v_safe := lower(trim(v_val));
        IF v_safe <> '' THEN
          v_or_parts := array_append(v_or_parts, format('extracted_seniority = %L', v_safe));
        END IF;
      END LOOP;
      IF array_length(v_or_parts, 1) > 0 THEN
        v_clauses := array_append(v_clauses, '(' || array_to_string(v_or_parts, ' OR ') || ')');
      END IF;
    END IF;

    -- DEPARTMENTS
    IF v_filter ? 'depts' AND jsonb_array_length(v_filter->'depts') > 0 THEN
      v_or_parts := ARRAY[]::text[];
      FOR v_val IN SELECT jsonb_array_elements_text(v_filter->'depts')
      LOOP
        v_safe := lower(trim(v_val));
        IF v_safe <> '' THEN
          v_or_parts := array_append(v_or_parts, format('extracted_department = %L', v_safe));
        END IF;
      END LOOP;
      IF array_length(v_or_parts, 1) > 0 THEN
        v_clauses := array_append(v_clauses, '(' || array_to_string(v_or_parts, ' OR ') || ')');
      END IF;
    END IF;

    -- Trust / AI labels
    IF p_trust_labels IS NOT NULL THEN
      v_clauses := array_append(v_clauses,
        format('(trust_label = ANY(%L) OR trust_label IS NULL)', p_trust_labels));
    END IF;

    IF p_ai_labels IS NOT NULL THEN
      v_clauses := array_append(v_clauses,
        format('(ai_jd_label = ANY(%L) OR ai_jd_label IS NULL)', p_ai_labels));
    END IF;

    IF array_length(v_clauses, 1) > 0 THEN
      v_all_clauses := array_append(v_all_clauses,
        '(' || array_to_string(v_clauses, ' AND ') || ')');
    END IF;

  END LOOP;

  IF array_length(v_all_clauses, 1) = 0 THEN
    RETURN jsonb_build_object('data', '[]'::jsonb, 'count', 0);
  END IF;

  v_where := array_to_string(v_all_clauses, ' OR ');

  IF array_length(p_hidden_ids, 1) > 0 THEN
    v_where := v_where || format(' AND greenhouse_id <> ALL(%L::text[])', p_hidden_ids);
  END IF;

  v_sql := format(
    'SELECT *, COUNT(*) OVER() AS _total_count
     FROM ats_jobs
     WHERE (%s)
     ORDER BY %I %s
     LIMIT %s OFFSET %s',
    v_where,
    p_sort_col,
    v_sort_dir,
    p_per_page,
    p_page * p_per_page
  );

  EXECUTE format('SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), ''[]''::jsonb), MAX(t._total_count)
                  FROM (%s) t', v_sql)
    INTO v_data, v_total;

  RETURN jsonb_build_object(
    'data', coalesce(v_data, '[]'::jsonb),
    'count', coalesce(v_total, 0)
  );

END;
$$;
