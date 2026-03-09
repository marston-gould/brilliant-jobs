-- FA-005: Server-side multi-filter merge
-- Replaces client-side N-query merge with a single Postgres function call.
-- Accepts an array of filter definitions, builds UNION ALL, deduplicates,
-- sorts, and paginates server-side. Single round trip.
--
-- ADR: Edge Function was considered but would duplicate 400+ lines of
-- filter-building logic. Postgres function with dynamic SQL is simpler,
-- uses existing indexes, and avoids the PostgREST intermediary for N queries.

-- Feature flag for rollback
INSERT INTO public.feature_flags (id, description, enabled, rollout_pct, metadata, updated_at)
VALUES (
  'feed_server_merge',
  'FA-005: Replace client-side multi-filter merge with server-side UNION via Postgres function. Toggle OFF to revert to client-side merge.',
  true,
  100,
  '{"category": "ops", "name": "Feed Server Merge"}'::jsonb,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  enabled = true,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Main function
CREATE OR REPLACE FUNCTION public.search_jobs_multi(
  p_filters jsonb,           -- Array of filter definition objects
  p_sort_col text DEFAULT 'updated_at',
  p_sort_asc boolean DEFAULT false,
  p_page int DEFAULT 0,
  p_per_page int DEFAULT 50,
  p_hidden_ids text[] DEFAULT ARRAY[]::text[],
  p_content_search boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET statement_timeout = '10s'
AS $$
DECLARE
  v_filter jsonb;
  v_idx int := 0;
  v_union_parts text[] := ARRAY[]::text[];
  v_part text;
  v_where text;
  v_sql text;
  v_count_sql text;
  v_result jsonb;
  v_rows jsonb;
  v_total_count bigint;
  v_offset int;
  v_sort_dir text;
  v_sort_safe text;
  -- Allowed sort columns (whitelist to prevent SQL injection)
  v_allowed_sorts text[] := ARRAY[
    'updated_at', 'first_seen_at', 'salary_min', 'salary_max',
    'title', 'company_name', 'location', 'created_at'
  ];
BEGIN
  -- Validate inputs
  IF p_filters IS NULL OR jsonb_array_length(p_filters) = 0 THEN
    RETURN jsonb_build_object('data', '[]'::jsonb, 'count', 0, 'filter_map', '{}'::jsonb, 'error', NULL);
  END IF;

  IF jsonb_array_length(p_filters) > 20 THEN
    RETURN jsonb_build_object('data', '[]'::jsonb, 'count', 0, 'filter_map', '{}'::jsonb, 'error', 'Too many filters (max 20)');
  END IF;

  -- Validate sort column
  v_sort_safe := 'updated_at';
  IF p_sort_col = ANY(v_allowed_sorts) THEN
    v_sort_safe := p_sort_col;
  END IF;
  v_sort_dir := CASE WHEN p_sort_asc THEN 'ASC' ELSE 'DESC' END;

  -- Validate pagination
  IF p_page < 0 THEN p_page := 0; END IF;
  IF p_per_page < 1 OR p_per_page > 200 THEN p_per_page := 50; END IF;
  v_offset := p_page * p_per_page;

  -- Build UNION ALL: one SELECT per filter
  FOR v_filter IN SELECT * FROM jsonb_array_elements(p_filters)
  LOOP
    v_idx := v_idx + 1;
    v_where := _build_filter_where(v_filter, p_hidden_ids, p_content_search);
    v_part := format(
      '(SELECT greenhouse_id, title, company_name, location, loc_display, loc_city, loc_state, loc_country, loc_type, '
      || 'salary_min, salary_max, salary_rate, salary_currency, is_remote, status, first_seen_at, updated_at, created_at, '
      || 'url, content, apply_url, extracted_seniority, extracted_department, extracted_skills, content_tsv, '
      || 'industry, is_staffing_agency, job_lat, job_lng, '
      || '%s AS _filter_idx '
      || 'FROM public.ats_jobs WHERE %s)',
      v_idx,
      v_where
    );
    v_union_parts := array_append(v_union_parts, v_part);
  END LOOP;

  -- Count query: COUNT(DISTINCT greenhouse_id) across all filters
  v_count_sql := format(
    'SELECT COUNT(DISTINCT greenhouse_id) FROM (%s) AS _union_all',
    array_to_string(v_union_parts, ' UNION ALL ')
  );
  EXECUTE v_count_sql INTO v_total_count;

  -- Data query: deduplicate, aggregate filter tags, sort, paginate
  -- Uses DISTINCT ON with aggregation via subquery
  v_sql := format(
    'WITH _union AS (%s), '
    || '_filter_tags AS ('
    || '  SELECT greenhouse_id, jsonb_agg(DISTINCT _filter_idx) AS _filter_idxs '
    || '  FROM _union GROUP BY greenhouse_id'
    || '), '
    || '_deduped AS ('
    || '  SELECT DISTINCT ON (u.greenhouse_id) '
    || '    u.greenhouse_id, u.title, u.company_name, u.location, u.loc_display, '
    || '    u.loc_city, u.loc_state, u.loc_country, u.loc_type, '
    || '    u.salary_min, u.salary_max, u.salary_rate, u.salary_currency, '
    || '    u.is_remote, u.status, u.first_seen_at, u.updated_at, u.created_at, '
    || '    u.url, u.content, u.apply_url, u.extracted_seniority, u.extracted_department, '
    || '    u.extracted_skills, u.industry, u.is_staffing_agency, u.job_lat, u.job_lng, '
    || '    ft._filter_idxs '
    || '  FROM _union u '
    || '  JOIN _filter_tags ft ON ft.greenhouse_id = u.greenhouse_id '
    || '  ORDER BY u.greenhouse_id, u._filter_idx'
    || ') '
    || 'SELECT jsonb_agg(row_to_json(t.*)) FROM ('
    || '  SELECT * FROM _deduped ORDER BY %I %s NULLS LAST LIMIT %s OFFSET %s'
    || ') t',
    array_to_string(v_union_parts, ' UNION ALL '),
    v_sort_safe, v_sort_dir,
    p_per_page, v_offset
  );
  EXECUTE v_sql INTO v_rows;

  -- Return result
  RETURN jsonb_build_object(
    'data', COALESCE(v_rows, '[]'::jsonb),
    'count', v_total_count,
    'error', NULL
  );
END;
$$;

-- Helper function: build WHERE clause from a single filter definition
CREATE OR REPLACE FUNCTION public._build_filter_where(
  p_filter jsonb,
  p_hidden_ids text[],
  p_content_search boolean
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_clauses text[] := ARRAY['status = ''open'''];
  v_val text;
  v_vals text[];
  v_or_parts text[];
  v_or_clause text;
  v_safe text;
  v_ids text[];
  v_bbox jsonb;
  v_states text[];
BEGIN
  -- ==========================================================================
  -- WHAT pills (title ilike + optional content_tsv wfts, OR'd together)
  -- ==========================================================================
  IF p_filter ? 'what' AND jsonb_array_length(p_filter->'what') > 0 THEN
    v_or_parts := ARRAY[]::text[];
    FOR v_val IN SELECT jsonb_array_elements_text(p_filter->'what')
    LOOP
      v_safe := regexp_replace(v_val, '[,()'']', '', 'g');
      v_safe := trim(v_safe);
      IF v_safe <> '' THEN
        v_or_parts := array_append(v_or_parts,
          format('title ILIKE %L', '%' || v_safe || '%'));
        IF p_content_search THEN
          v_or_parts := array_append(v_or_parts,
            format('content_tsv @@ websearch_to_tsquery(''english'', %L)', v_safe));
        END IF;
      END IF;
    END LOOP;
    IF array_length(v_or_parts, 1) > 0 THEN
      v_clauses := array_append(v_clauses,
        '(' || array_to_string(v_or_parts, ' OR ') || ')');
    END IF;
  END IF;

  -- ==========================================================================
  -- WHAT NOT pills (NOT title ilike + optional NOT content_tsv)
  -- ==========================================================================
  IF p_filter ? 'what_not' AND jsonb_array_length(p_filter->'what_not') > 0 THEN
    FOR v_val IN SELECT jsonb_array_elements_text(p_filter->'what_not')
    LOOP
      v_safe := trim(regexp_replace(v_val, '^nor\s+', '', 'i'));
      IF v_safe <> '' THEN
        v_clauses := array_append(v_clauses,
          format('title NOT ILIKE %L', '%' || v_safe || '%'));
        IF p_content_search THEN
          -- FA-002 NULL-safe: don't exclude NULL content_tsv rows
          v_clauses := array_append(v_clauses,
            format('(NOT content_tsv @@ websearch_to_tsquery(''english'', %L) OR content_tsv IS NULL)', v_safe));
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Global title excludes
  IF p_filter ? 'title_excludes' AND jsonb_array_length(p_filter->'title_excludes') > 0 THEN
    FOR v_val IN SELECT jsonb_array_elements_text(p_filter->'title_excludes')
    LOOP
      IF trim(v_val) <> '' THEN
        v_clauses := array_append(v_clauses,
          format('title NOT ILIKE %L', '%' || trim(v_val) || '%'));
        IF p_content_search THEN
          v_clauses := array_append(v_clauses,
            format('(NOT content_tsv @@ websearch_to_tsquery(''english'', %L) OR content_tsv IS NULL)', trim(v_val)));
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- ==========================================================================
  -- WHERE — location filtering
  -- ==========================================================================
  -- Mode: "remote_only" — pure remote search
  IF (p_filter->>'where_mode') = 'remote_only' THEN
    v_clauses := array_append(v_clauses,
      '(location ILIKE ''Remote%'' OR location ILIKE ''%remote%'' OR is_remote = true)');

  -- Mode: "ids" — pre-fetched location IDs
  ELSIF (p_filter->>'where_mode') = 'ids' THEN
    IF p_filter ? 'where_ids' AND jsonb_array_length(p_filter->'where_ids') > 0 THEN
      SELECT array_agg(x) INTO v_ids FROM jsonb_array_elements_text(p_filter->'where_ids') x;
      IF array_length(v_ids, 1) <= 200 THEN
        v_clauses := array_append(v_clauses,
          format('greenhouse_id = ANY(%L::text[])', v_ids));
      ELSIF p_filter ? 'where_bbox' THEN
        v_bbox := p_filter->'where_bbox';
        v_clauses := array_append(v_clauses, format(
          '(job_lat >= %s AND job_lat <= %s AND job_lng >= %s AND job_lng <= %s)',
          (v_bbox->>'min_lat')::numeric, (v_bbox->>'max_lat')::numeric,
          (v_bbox->>'min_lng')::numeric, (v_bbox->>'max_lng')::numeric
        ));
      ELSE
        -- SQL-native fallback: use state codes + radius + remote
        v_or_parts := ARRAY[]::text[];
        IF p_filter ? 'where_state_codes' THEN
          SELECT array_agg(x) INTO v_states FROM jsonb_array_elements_text(p_filter->'where_state_codes') x;
          IF v_states IS NOT NULL AND array_length(v_states, 1) > 0 THEN
            v_or_parts := array_append(v_or_parts, format('loc_state = ANY(%L::text[])', v_states));
          END IF;
        END IF;
        IF p_filter ? 'where_radius_bboxes' THEN
          FOR v_bbox IN SELECT * FROM jsonb_array_elements(p_filter->'where_radius_bboxes')
          LOOP
            v_or_parts := array_append(v_or_parts, format(
              '(job_lat >= %s AND job_lat <= %s AND job_lng >= %s AND job_lng <= %s)',
              (v_bbox->>'min_lat')::numeric, (v_bbox->>'max_lat')::numeric,
              (v_bbox->>'min_lng')::numeric, (v_bbox->>'max_lng')::numeric
            ));
          END LOOP;
        END IF;
        IF (p_filter->>'where_has_remote')::boolean IS TRUE THEN
          v_or_parts := array_append(v_or_parts, 'loc_type = ''remote''');
          v_or_parts := array_append(v_or_parts, 'location ILIKE ''%remote%''');
        END IF;
        IF array_length(v_or_parts, 1) > 0 THEN
          v_clauses := array_append(v_clauses, '(' || array_to_string(v_or_parts, ' OR ') || ')');
        ELSE
          -- Absolute fallback
          SELECT array_agg(x) INTO v_ids FROM (SELECT jsonb_array_elements_text(p_filter->'where_ids') x LIMIT 200) sub;
          IF v_ids IS NOT NULL THEN
            v_clauses := array_append(v_clauses, format('greenhouse_id = ANY(%L::text[])', v_ids));
          END IF;
        END IF;
      END IF;

      -- US search disambiguation
      IF (p_filter->>'where_is_us_search')::boolean IS TRUE THEN
        v_clauses := array_append(v_clauses, '(loc_country <> ''CA'' OR loc_country IS NULL)');
        v_clauses := array_append(v_clauses, 'location NOT ILIKE ''%Canada%''');
        v_clauses := array_append(v_clauses, 'location NOT ILIKE ''%, BC%''');
        v_clauses := array_append(v_clauses, 'location NOT ILIKE ''%British Columbia%''');
      END IF;
    END IF;

  -- Mode: "inline" — text-based location search (no pre-fetched IDs)
  ELSIF (p_filter->>'where_mode') = 'inline' THEN
    IF p_filter ? 'where_text' AND jsonb_array_length(p_filter->'where_text') > 0 THEN
      v_or_parts := ARRAY[]::text[];
      FOR v_val IN SELECT jsonb_array_elements_text(p_filter->'where_text')
      LOOP
        v_safe := trim(v_val);
        IF v_safe <> '' THEN
          -- Check for country names → loc_country match
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
          -- Always add ilike fallback for country names too
          v_or_parts := array_append(v_or_parts, format('location ILIKE %L', '%' || v_safe || '%'));
        END IF;
      END LOOP;
      -- Include remote if toggled
      IF (p_filter->>'include_remote')::boolean IS TRUE THEN
        v_or_parts := array_append(v_or_parts, 'location ILIKE ''Remote%''');
        v_or_parts := array_append(v_or_parts, 'loc_type = ''remote''');
        v_or_parts := array_append(v_or_parts, 'is_remote = true');
      END IF;
      IF array_length(v_or_parts, 1) > 0 THEN
        v_clauses := array_append(v_clauses, '(' || array_to_string(v_or_parts, ' OR ') || ')');
      END IF;
    END IF;
  END IF;

  -- WHERE NOT pills
  IF p_filter ? 'where_not' AND jsonb_array_length(p_filter->'where_not') > 0 THEN
    FOR v_val IN SELECT jsonb_array_elements_text(p_filter->'where_not')
    LOOP
      v_safe := trim(regexp_replace(v_val, '^nor\s+', '', 'i'));
      IF v_safe <> '' THEN
        v_clauses := array_append(v_clauses, format('location NOT ILIKE %L', '%' || v_safe || '%'));
      END IF;
    END LOOP;
  END IF;

  -- Global location excludes
  IF p_filter ? 'location_excludes' AND jsonb_array_length(p_filter->'location_excludes') > 0 THEN
    FOR v_val IN SELECT jsonb_array_elements_text(p_filter->'location_excludes')
    LOOP
      IF trim(v_val) <> '' THEN
        v_clauses := array_append(v_clauses, format('location NOT ILIKE %L', '%' || trim(v_val) || '%'));
      END IF;
    END LOOP;
  END IF;

  -- ==========================================================================
  -- US-Only filter (FA-009 smart tiered)
  -- ==========================================================================
  IF (p_filter->>'us_only')::boolean IS TRUE THEN
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

  -- ==========================================================================
  -- Remote exclusion (when location filter active but no explicit remote)
  -- ==========================================================================
  IF (p_filter->>'exclude_remote')::boolean IS TRUE THEN
    v_clauses := array_append(v_clauses, 'location NOT ILIKE ''Remote%''');
    v_clauses := array_append(v_clauses, 'loc_type <> ''remote''');
  END IF;

  -- ==========================================================================
  -- Exclude hourly / staffing
  -- ==========================================================================
  IF (p_filter->>'exclude_hourly')::boolean IS TRUE THEN
    v_clauses := array_append(v_clauses, 'salary_rate <> ''hr''');
  END IF;
  IF (p_filter->>'exclude_staffing')::boolean IS TRUE THEN
    v_clauses := array_append(v_clauses, 'is_staffing_agency <> true');
  END IF;

  -- ==========================================================================
  -- WHO pills (company_name ilike)
  -- ==========================================================================
  IF p_filter ? 'who' AND jsonb_array_length(p_filter->'who') > 0 THEN
    v_or_parts := ARRAY[]::text[];
    FOR v_val IN SELECT jsonb_array_elements_text(p_filter->'who')
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

  -- WHO NOT pills + global company excludes
  IF p_filter ? 'who_not' AND jsonb_array_length(p_filter->'who_not') > 0 THEN
    FOR v_val IN SELECT jsonb_array_elements_text(p_filter->'who_not')
    LOOP
      v_safe := trim(regexp_replace(v_val, '^nor\s+', '', 'i'));
      IF v_safe <> '' THEN
        v_clauses := array_append(v_clauses, format('company_name NOT ILIKE %L', '%' || v_safe || '%'));
      END IF;
    END LOOP;
  END IF;
  IF p_filter ? 'company_excludes' AND jsonb_array_length(p_filter->'company_excludes') > 0 THEN
    FOR v_val IN SELECT jsonb_array_elements_text(p_filter->'company_excludes')
    LOOP
      IF trim(v_val) <> '' THEN
        v_clauses := array_append(v_clauses, format('company_name NOT ILIKE %L', '%' || trim(v_val) || '%'));
      END IF;
    END LOOP;
  END IF;

  -- Global industry excludes
  IF p_filter ? 'industry_excludes' AND jsonb_array_length(p_filter->'industry_excludes') > 0 THEN
    FOR v_val IN SELECT jsonb_array_elements_text(p_filter->'industry_excludes')
    LOOP
      IF trim(v_val) <> '' THEN
        v_clauses := array_append(v_clauses, format('industry NOT ILIKE %L', '%' || trim(v_val) || '%'));
      END IF;
    END LOOP;
  END IF;

  -- ==========================================================================
  -- WHEN pills (first_seen_at >= date)
  -- ==========================================================================
  IF p_filter ? 'when_since' AND (p_filter->>'when_since') IS NOT NULL THEN
    v_clauses := array_append(v_clauses,
      format('first_seen_at >= %L::timestamptz', p_filter->>'when_since'));
  END IF;

  -- ==========================================================================
  -- PAY pills (salary range with include_no_salary)
  -- ==========================================================================
  IF p_filter ? 'pay_min' OR p_filter ? 'pay_max' THEN
    DECLARE
      v_pay_min numeric := (p_filter->>'pay_min')::numeric;
      v_pay_max numeric := (p_filter->>'pay_max')::numeric;
      v_incl_no_sal boolean := COALESCE((p_filter->>'include_no_salary')::boolean, true);
    BEGIN
      IF v_pay_min IS NOT NULL AND v_pay_max IS NOT NULL THEN
        IF v_incl_no_sal THEN
          v_clauses := array_append(v_clauses,
            format('((salary_max >= %s AND salary_min <= %s) OR salary_min IS NULL)', v_pay_min, v_pay_max));
        ELSE
          v_clauses := array_append(v_clauses,
            format('(salary_max >= %s AND salary_min <= %s)', v_pay_min, v_pay_max));
        END IF;
      ELSIF v_pay_min IS NOT NULL THEN
        IF v_incl_no_sal THEN
          v_clauses := array_append(v_clauses,
            format('(salary_max >= %s OR salary_min IS NULL)', v_pay_min));
        ELSE
          v_clauses := array_append(v_clauses, format('salary_max >= %s', v_pay_min));
        END IF;
      ELSIF v_pay_max IS NOT NULL THEN
        IF v_incl_no_sal THEN
          v_clauses := array_append(v_clauses,
            format('(salary_min <= %s OR salary_min IS NULL)', v_pay_max));
        ELSE
          v_clauses := array_append(v_clauses, format('salary_min <= %s', v_pay_max));
        END IF;
      END IF;
    END;
  END IF;

  -- ==========================================================================
  -- SKILLS pills (extracted_skills array contains)
  -- ==========================================================================
  IF p_filter ? 'skills' AND jsonb_array_length(p_filter->'skills') > 0 THEN
    v_or_parts := ARRAY[]::text[];
    FOR v_val IN SELECT jsonb_array_elements_text(p_filter->'skills')
    LOOP
      v_safe := trim(lower(v_val));
      IF v_safe <> '' THEN
        v_or_parts := array_append(v_or_parts,
          format('extracted_skills @> ARRAY[%L]', v_safe));
      END IF;
    END LOOP;
    IF array_length(v_or_parts, 1) > 0 THEN
      v_clauses := array_append(v_clauses, '(' || array_to_string(v_or_parts, ' OR ') || ')');
    END IF;
  END IF;

  -- ==========================================================================
  -- LEVEL pills (extracted_seniority)
  -- ==========================================================================
  IF p_filter ? 'levels' AND jsonb_array_length(p_filter->'levels') > 0 THEN
    SELECT array_agg(lower(trim(x))) INTO v_vals FROM jsonb_array_elements_text(p_filter->'levels') x;
    IF array_length(v_vals, 1) = 1 THEN
      v_clauses := array_append(v_clauses, format('extracted_seniority = %L', v_vals[1]));
    ELSE
      v_clauses := array_append(v_clauses, format('extracted_seniority = ANY(%L::text[])', v_vals));
    END IF;
  END IF;

  -- ==========================================================================
  -- JD pills (content_tsv websearch)
  -- ==========================================================================
  IF p_filter ? 'jd_terms' AND jsonb_array_length(p_filter->'jd_terms') > 0 THEN
    FOR v_val IN SELECT jsonb_array_elements_text(p_filter->'jd_terms')
    LOOP
      v_safe := regexp_replace(trim(v_val), '[,()'']', '', 'g');
      IF v_safe <> '' THEN
        v_clauses := array_append(v_clauses,
          format('content_tsv @@ websearch_to_tsquery(''english'', %L)', v_safe));
      END IF;
    END LOOP;
  END IF;

  -- ==========================================================================
  -- DEPARTMENT pills (extracted_department)
  -- ==========================================================================
  IF p_filter ? 'depts' AND jsonb_array_length(p_filter->'depts') > 0 THEN
    SELECT array_agg(lower(trim(x))) INTO v_vals FROM jsonb_array_elements_text(p_filter->'depts') x;
    IF array_length(v_vals, 1) = 1 THEN
      v_clauses := array_append(v_clauses, format('extracted_department = %L', v_vals[1]));
    ELSE
      v_clauses := array_append(v_clauses, format('extracted_department = ANY(%L::text[])', v_vals));
    END IF;
  END IF;

  -- ==========================================================================
  -- Hidden job IDs
  -- ==========================================================================
  IF p_hidden_ids IS NOT NULL AND array_length(p_hidden_ids, 1) > 0 THEN
    v_clauses := array_append(v_clauses,
      format('greenhouse_id <> ALL(%L::text[])', p_hidden_ids));
  END IF;

  -- Build final WHERE string
  RETURN array_to_string(v_clauses, ' AND ');
END;
$$;

-- Grant execute to authenticated users (anon can't use this — dashboard only)
GRANT EXECUTE ON FUNCTION public.search_jobs_multi(jsonb, text, boolean, int, int, text[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public._build_filter_where(jsonb, text[], boolean) TO authenticated;

COMMENT ON FUNCTION public.search_jobs_multi IS 'FA-005: Server-side multi-filter merge. Accepts array of filter definitions, returns deduped + sorted + paginated results in a single round trip.';
