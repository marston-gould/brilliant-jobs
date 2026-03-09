-- FA-006: Server-side trust/AI content filtering
-- Moves trust (fraud_label) and AI (ai_label) filters from client-side post-filtering
-- to server-side WHERE clauses inside search_jobs_multi.
-- Ensures every page shows exactly per_page rows regardless of filter settings.
--
-- Approach:
--   Filtering: EXISTS subqueries in each UNION member's WHERE clause (no JOIN duplication)
--   Badge data: LEFT JOINs in the final result CTE (after dedup, one row per job)
--   NULL handling: Jobs without fraud/AI scores are treated as 'unknown'/'unscored'
--
-- Backwards compatible: new params have NULL defaults = no filter (existing callers unaffected)

-- Feature flag for rollback
INSERT INTO public.feature_flags (id, description, enabled, rollout_pct, metadata, updated_at)
VALUES (
  'feed_server_trust_filter',
  'FA-006: Move trust/AI filters server-side. Toggle OFF to revert to client-side post-filtering.',
  true,
  100,
  '{"category": "ops", "name": "Feed Server Trust Filter"}'::jsonb,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  enabled = true,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Updated search_jobs_multi with trust/AI filter support
CREATE OR REPLACE FUNCTION public.search_jobs_multi(
  p_filters jsonb,           -- Array of filter definition objects
  p_sort_col text DEFAULT 'updated_at',
  p_sort_asc boolean DEFAULT false,
  p_page int DEFAULT 0,
  p_per_page int DEFAULT 50,
  p_hidden_ids text[] DEFAULT ARRAY[]::text[],
  p_content_search boolean DEFAULT false,
  p_trust_labels text[] DEFAULT NULL,   -- FA-006: trust filter labels (NULL = no filter)
  p_ai_labels text[] DEFAULT NULL       -- FA-006: AI content filter labels (NULL = no filter)
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
  v_trust_clause text := '';
  v_ai_clause text := '';
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
  -- FA-006: normalized AI labels for DB matching
  v_ai_db_labels text[];
  v_ai_include_null boolean := false;
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

  -- ══════════════════════════════════════════════════════════════════
  -- FA-006: Build trust filter clause (applied to each UNION member)
  -- ══════════════════════════════════════════════════════════════════
  IF p_trust_labels IS NOT NULL AND array_length(p_trust_labels, 1) > 0 THEN
    IF 'unknown' = ANY(p_trust_labels) THEN
      -- Include jobs WITH a matching label OR WITHOUT any fraud score
      v_trust_clause := format(
        ' AND (EXISTS (SELECT 1 FROM public.job_fraud_scores jfs WHERE jfs.job_id = a.greenhouse_id AND jfs.fraud_label = ANY(%L::text[]))'
        || ' OR NOT EXISTS (SELECT 1 FROM public.job_fraud_scores jfs WHERE jfs.job_id = a.greenhouse_id))',
        p_trust_labels
      );
    ELSE
      -- Only include jobs WITH a matching fraud label
      v_trust_clause := format(
        ' AND EXISTS (SELECT 1 FROM public.job_fraud_scores jfs WHERE jfs.job_id = a.greenhouse_id AND jfs.fraud_label = ANY(%L::text[]))',
        p_trust_labels
      );
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════════════
  -- FA-006: Build AI content filter clause
  -- Map client labels to DB labels:
  --   'unscored' → includes NULL (no row) + 'unknown' ai_label
  --   'human'    → matches 'human' (and legacy 'human_written')
  --   'mixed'    → matches 'mixed' (and legacy 'mixed_content')
  --   'ai_generated' → matches 'ai_generated'
  -- ══════════════════════════════════════════════════════════════════
  IF p_ai_labels IS NOT NULL AND array_length(p_ai_labels, 1) > 0 THEN
    -- Build the DB-native label array and check for 'unscored'
    v_ai_db_labels := ARRAY[]::text[];
    v_ai_include_null := false;

    IF 'unscored' = ANY(p_ai_labels) THEN
      v_ai_include_null := true;
      v_ai_db_labels := array_append(v_ai_db_labels, 'unknown');
    END IF;
    IF 'human' = ANY(p_ai_labels) THEN
      v_ai_db_labels := array_append(v_ai_db_labels, 'human');
      v_ai_db_labels := array_append(v_ai_db_labels, 'human_written');  -- legacy
    END IF;
    IF 'mixed' = ANY(p_ai_labels) THEN
      v_ai_db_labels := array_append(v_ai_db_labels, 'mixed');
      v_ai_db_labels := array_append(v_ai_db_labels, 'mixed_content');  -- legacy
    END IF;
    IF 'ai_generated' = ANY(p_ai_labels) THEN
      v_ai_db_labels := array_append(v_ai_db_labels, 'ai_generated');
    END IF;

    IF v_ai_include_null THEN
      -- Include jobs WITH a matching label OR WITHOUT any AI score
      v_ai_clause := format(
        ' AND (EXISTS (SELECT 1 FROM public.content_ai_scores cas WHERE cas.content_id = a.greenhouse_id AND cas.content_type = ''jd'' AND cas.ai_label = ANY(%L::text[]))'
        || ' OR NOT EXISTS (SELECT 1 FROM public.content_ai_scores cas WHERE cas.content_id = a.greenhouse_id AND cas.content_type = ''jd''))',
        v_ai_db_labels
      );
    ELSE
      -- Only include jobs WITH a matching AI label
      v_ai_clause := format(
        ' AND EXISTS (SELECT 1 FROM public.content_ai_scores cas WHERE cas.content_id = a.greenhouse_id AND cas.content_type = ''jd'' AND cas.ai_label = ANY(%L::text[]))',
        v_ai_db_labels
      );
    END IF;
  END IF;

  -- Build UNION ALL: one SELECT per filter
  FOR v_filter IN SELECT * FROM jsonb_array_elements(p_filters)
  LOOP
    v_idx := v_idx + 1;
    v_where := _build_filter_where(v_filter, p_hidden_ids, p_content_search);
    v_part := format(
      '(SELECT a.greenhouse_id, a.title, a.company_name, a.location, a.loc_display, a.loc_city, a.loc_state, a.loc_country, a.loc_type, '
      || 'a.salary_min, a.salary_max, a.salary_rate, a.salary_currency, a.is_remote, a.status, a.first_seen_at, a.updated_at, a.created_at, '
      || 'a.url, a.content, a.apply_url, a.extracted_seniority, a.extracted_department, a.extracted_skills, a.content_tsv, '
      || 'a.industry, a.is_staffing_agency, a.job_lat, a.job_lng, '
      || '%s AS _filter_idx '
      || 'FROM public.ats_jobs a WHERE %s%s%s)',
      v_idx,
      v_where,
      v_trust_clause,
      v_ai_clause
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
  -- FA-006: LEFT JOIN fraud/AI tables in final result for badge data
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
    || '), '
    || '_enriched AS ('
    || '  SELECT d.*, '
    || '    jfs.fraud_score AS _fraud_score, '
    || '    jfs.fraud_label AS _fraud_label, '
    || '    jfs.confidence AS _fraud_confidence, '
    || '    jfs.top_signals AS _fraud_signals, '
    || '    cas.ai_label AS _ai_label, '
    || '    cas.ai_generated_score AS _ai_score, '
    || '    cas.confidence AS _ai_confidence, '
    || '    cas.summary AS _ai_summary, '
    || '    cas.perplexity_score AS _ai_perplexity, '
    || '    cas.burstiness_score AS _ai_burstiness, '
    || '    cas.top_signals AS _ai_signals '
    || '  FROM _deduped d '
    || '  LEFT JOIN LATERAL ('
    || '    SELECT fraud_score, fraud_label, confidence, top_signals '
    || '    FROM public.job_fraud_scores '
    || '    WHERE job_id = d.greenhouse_id '
    || '    ORDER BY scored_at DESC LIMIT 1'
    || '  ) jfs ON true '
    || '  LEFT JOIN LATERAL ('
    || '    SELECT ai_label, ai_generated_score, confidence, summary, perplexity_score, burstiness_score, top_signals '
    || '    FROM public.content_ai_scores '
    || '    WHERE content_id = d.greenhouse_id AND content_type = ''jd'' '
    || '    ORDER BY scored_at DESC LIMIT 1'
    || '  ) cas ON true '
    || ') '
    || 'SELECT jsonb_agg(row_to_json(t.*)) FROM ('
    || '  SELECT * FROM _enriched ORDER BY %I %s NULLS LAST LIMIT %s OFFSET %s'
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

-- Update grants for new function signature
GRANT EXECUTE ON FUNCTION public.search_jobs_multi(jsonb, text, boolean, int, int, text[], boolean, text[], text[]) TO authenticated;

COMMENT ON FUNCTION public.search_jobs_multi IS 'FA-005+FA-006: Server-side multi-filter merge with trust/AI filtering. Accepts array of filter definitions + optional trust/AI label arrays, returns deduped + filtered + sorted + paginated results with fraud/AI badge data in a single round trip.';
