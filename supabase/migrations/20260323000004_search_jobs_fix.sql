-- 20260323000004: Fix search_jobs JSONB extraction bug
-- val->>'values'->0 was wrong (text -> integer operator error)
-- Fixed to val->'values'->>0 (jsonb -> integer -> text)
-- Also re-creates parse_when_value for completeness

-- v9.83: search_jobs RPC
-- Single server-side function that replaces all client-side filter logic.
-- Called by the SPA with filter IDs + pagination params.
-- Returns job records + matched_filter_ids[] + total_count.
-- 
-- FEED_SPEC.md Section 4 — this is the authoritative implementation.
-- Any change to filter logic must be reflected in FEED_SPEC.md.

-- ── Helper: parse when value string to interval ───────────────────────────
CREATE OR REPLACE FUNCTION parse_when_value(raw text)
RETURNS interval LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  lower_raw text := lower(trim(raw));
  n integer;
BEGIN
  IF lower_raw IN ('today', '1d', 'now') THEN RETURN interval '1 day'; END IF;
  IF lower_raw IN ('yesterday', '2d') THEN RETURN interval '2 days'; END IF;
  IF lower_raw ~ '^(this\s+)?week$|^7\s*d(ays?)?$|^1\s*w(eek)?$' THEN RETURN interval '7 days'; END IF;
  IF lower_raw ~ '^(this\s+)?month$|^30\s*d(ays?)?$|^1\s*m(onth)?$' THEN RETURN interval '30 days'; END IF;
  IF lower_raw ~ '^3\s*months?$|^90\s*d(ays?)?$' THEN RETURN interval '90 days'; END IF;
  -- "last N days" / "N days" / "Nd"
  IF lower_raw ~ '(?:last\s+)?(\d+)\s*d(?:ays?)?' THEN
    n := (regexp_match(lower_raw, '(\d+)\s*d(?:ays?)?'))[1]::integer;
    RETURN (n || ' days')::interval;
  END IF;
  -- "last N weeks" / "N weeks"
  IF lower_raw ~ '(?:last\s+)?(\d+)\s*w(?:eeks?)?' THEN
    n := (regexp_match(lower_raw, '(\d+)\s*w(?:eeks?)?'))[1]::integer;
    RETURN ((n * 7) || ' days')::interval;
  END IF;
  -- "last N months" / "N months"
  IF lower_raw ~ '(?:last\s+)?(\d+)\s*m(?:onths?)?' THEN
    n := (regexp_match(lower_raw, '(\d+)\s*m(?:onths?)?'))[1]::integer;
    RETURN ((n * 30) || ' days')::interval;
  END IF;
  RETURN NULL;
END;
$$;

-- ── Helper: build WHERE clause for a single filter ────────────────────────
-- Returns a boolean expression suitable for use in WHERE.
-- Used in the dynamic query builder inside search_jobs.

-- ── Main search_jobs function ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search_jobs(
  p_user_id     uuid,
  p_filter_ids  uuid[],
  p_page        integer  DEFAULT 0,
  p_page_size   integer  DEFAULT 50,
  p_sort_field  text     DEFAULT 'created_at',
  p_sort_asc    boolean  DEFAULT false
)
RETURNS TABLE (
  greenhouse_id        text,
  title                text,
  company_name         text,
  location             text,
  loc_country          text,
  loc_state            text,
  loc_city             text,
  is_remote            boolean,
  salary_min           integer,
  salary_max           integer,
  salary_currency      text,
  salary_rate          text,
  created_at           timestamptz,
  first_seen_at        timestamptz,
  apply_url            text,
  ats_source           text,
  extracted_seniority  text,
  extracted_skills     text[],
  is_staffing_agency   boolean,
  ai_label             text,
  ai_content_score     real,
  matched_filter_ids   uuid[],
  total_count          bigint
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  -- Tuning / global rules
  v_tuning              jsonb;
  v_us_only             boolean;
  v_exclude_staffing    boolean;
  v_exclude_hourly      boolean;
  v_company_excludes    text[];
  v_title_excludes      text[];
  v_location_excludes   text[];
  v_industry_excludes   text[];

  -- Hidden jobs
  v_hidden_ids          text[];

  -- Filter data
  v_filter              record;
  v_fd                  jsonb;

  -- Per-filter pill arrays
  v_what_terms          text[];
  v_what_not_terms      text[];
  v_where_values        text[];
  v_where_not_terms     text[];
  v_who_terms           text[];
  v_who_not_terms       text[];
  v_when_interval       interval;
  v_pay_min             numeric;
  v_pay_max             numeric;
  v_include_no_salary   boolean;
  v_include_remote      boolean;
  v_level_values        text[];
  v_skill_values        text[];
  v_dept_values         text[];
  v_jd_terms            text[];
  v_where_country_code  text;

  -- Country map
  v_country_map         jsonb := '{
    "united states":"US","usa":"US","us":"US","u.s.":"US","u.s.a.":"US","america":"US",
    "canada":"CA","united kingdom":"GB","uk":"GB","england":"GB","germany":"DE",
    "france":"FR","australia":"AU","india":"IN","ireland":"IE","netherlands":"NL",
    "singapore":"SG","japan":"JP","brazil":"BR","spain":"ES","italy":"IT",
    "israel":"IL","sweden":"SE","denmark":"DK","norway":"NO","finland":"FI",
    "new zealand":"NZ","austria":"AT","switzerland":"CH","belgium":"BE",
    "poland":"PL","mexico":"MX","south korea":"KR","korea":"KR"
  }'::jsonb;

  -- US states
  v_us_states           text[] := ARRAY['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
    'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT',
    'NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
    'TX','UT','VT','VA','WA','WV','WI','WY','DC'];

  -- Non-US text exclusions
  v_non_us_patterns     text[] := ARRAY['%EMEA%','% Europe%','%European Union%','%APAC%',
    '%LATAM%','%Latin America%','% India%','%Bangalore%','%Mumbai%','%Hyderabad%',
    '%Pune%','%Philippines%','%Manila%','%Kyiv%','%Kiev%','%London%','%Manchester%',
    '%Bristol%','%Edinburgh%','%Sydney%','%Melbourne%','%Toronto%','%Vancouver%',
    '%Montreal%','%, BC%','%British Columbia%','%Ontario, Canada%','%Alberta%',
    '%Quebec%','%Hong Kong%','%Budapest%','%Vilnius%','%Warsaw%','%Krakow%',
    '%Mexico City%','%São Paulo%','%Sao Paulo%','%Singapore%','%Tel Aviv%',
    '% Japan%','%Seoul%','%Berlin%','%Munich%','%Frankfurt%','%Amsterdam%',
    '%Stockholm%','%Copenhagen%','%Oslo%','%Helsinki%','%Zurich%','%Dublin, Ireland%'];

  -- Sort field map
  v_db_sort_field       text;

  -- Result tracking
  v_total               bigint;
  i                     integer;
  v_term                text;
  v_pattern             text;

BEGIN
  -- ── 1. Load tuning / global rules ──────────────────────────────────────
  SELECT COALESCE(user_data->'tuning', '{}'::jsonb)
    INTO v_tuning
    FROM profiles
    WHERE id = p_user_id;

  v_us_only          := COALESCE((v_tuning->>'usOnly')::boolean, false);
  v_exclude_staffing := COALESCE((v_tuning->>'excludeStaffing')::boolean, false);
  v_exclude_hourly   := COALESCE((v_tuning->>'excludeHourly')::boolean, false);

  -- Extract exclusion arrays from tuning
  SELECT ARRAY(
    SELECT LOWER(val->>'value') FROM jsonb_array_elements(COALESCE(v_tuning->'companyExcludes', '[]'::jsonb)) val
    WHERE val->>'value' IS NOT NULL
    UNION
    SELECT LOWER(val->'values'->>0) FROM jsonb_array_elements(COALESCE(v_tuning->'companyExcludes', '[]'::jsonb)) val
    WHERE val->'values' IS NOT NULL
  ) INTO v_company_excludes;

  SELECT ARRAY(
    SELECT LOWER(val->>'value') FROM jsonb_array_elements(COALESCE(v_tuning->'titleExcludes', '[]'::jsonb)) val
    WHERE val->>'value' IS NOT NULL
    UNION
    SELECT LOWER(val->'values'->>0) FROM jsonb_array_elements(COALESCE(v_tuning->'titleExcludes', '[]'::jsonb)) val
    WHERE val->'values' IS NOT NULL
  ) INTO v_title_excludes;

  SELECT ARRAY(
    SELECT LOWER(val->>'value') FROM jsonb_array_elements(COALESCE(v_tuning->'locationExcludes', '[]'::jsonb)) val
    WHERE val->>'value' IS NOT NULL
    UNION
    SELECT LOWER(val->'values'->>0) FROM jsonb_array_elements(COALESCE(v_tuning->'locationExcludes', '[]'::jsonb)) val
    WHERE val->'values' IS NOT NULL
  ) INTO v_location_excludes;

  SELECT ARRAY(
    SELECT LOWER(val->>'value') FROM jsonb_array_elements(COALESCE(v_tuning->'industryExcludes', '[]'::jsonb)) val
    WHERE val->>'value' IS NOT NULL
    UNION
    SELECT LOWER(val->'values'->>0) FROM jsonb_array_elements(COALESCE(v_tuning->'industryExcludes', '[]'::jsonb)) val
    WHERE val->'values' IS NOT NULL
  ) INTO v_industry_excludes;

  -- ── 2. Load hidden job IDs ─────────────────────────────────────────────
  SELECT ARRAY(SELECT job_id FROM hidden_jobs WHERE user_id = p_user_id)
    INTO v_hidden_ids;

  -- ── 3. Resolve sort field ──────────────────────────────────────────────
  v_db_sort_field := CASE p_sort_field
    WHEN 'days'         THEN 'created_at'
    WHEN 'salary'       THEN 'salary_max'
    WHEN 'company'      THEN 'company_name'
    WHEN 'title'        THEN 'title'
    WHEN 'created_at'   THEN 'created_at'
    WHEN 'salary_max'   THEN 'salary_max'
    WHEN 'company_name' THEN 'company_name'
    ELSE 'created_at'
  END;

  -- ── 4. Build result set ────────────────────────────────────────────────
  -- Use a temp table to collect results from all filters
  CREATE TEMP TABLE _search_results (
    greenhouse_id       text,
    title               text,
    company_name        text,
    location            text,
    loc_country         text,
    loc_state           text,
    loc_city            text,
    is_remote           boolean,
    salary_min          integer,
    salary_max          integer,
    salary_currency     text,
    salary_rate         text,
    created_at          timestamptz,
    first_seen_at       timestamptz,
    apply_url           text,
    ats_source          text,
    extracted_seniority text,
    extracted_skills    text[],
    is_staffing_agency  boolean,
    ai_label            text,
    ai_content_score    real,
    matched_filter_id   uuid
  ) ON COMMIT DROP;

  -- ── 4a. No filters — return all open jobs ──────────────────────────────
  IF p_filter_ids IS NULL OR array_length(p_filter_ids, 1) IS NULL THEN
    INSERT INTO _search_results
    SELECT
      j.greenhouse_id, j.title, j.company_name, j.location, j.loc_country,
      j.loc_state, j.loc_city, j.is_remote, j.salary_min, j.salary_max,
      j.salary_currency, j.salary_rate, j.created_at, j.first_seen_at,
      j.apply_url, j.ats_source, j.extracted_seniority, j.extracted_skills,
      j.is_staffing_agency, j.ai_label, j.ai_content_score,
      NULL::uuid
    FROM ats_jobs j
    WHERE j.status = 'open'
      AND (v_hidden_ids IS NULL OR j.greenhouse_id != ALL(v_hidden_ids))
      AND (NOT v_exclude_staffing OR j.is_staffing_agency IS NOT TRUE)
      AND (NOT v_exclude_hourly OR j.salary_rate IS NULL OR j.salary_rate != 'hr')
      AND (v_company_excludes IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(v_company_excludes) exc
        WHERE j.company_name ILIKE '%' || exc || '%'
      ))
      AND (v_title_excludes IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(v_title_excludes) exc
        WHERE j.title ILIKE '%' || exc || '%'
      ))
      AND (NOT v_us_only OR (
        j.loc_country = 'US'
        OR (j.loc_country IS NULL AND j.loc_state = ANY(v_us_states))
        OR (j.loc_country IS NULL AND j.location = 'Remote')
        OR (j.loc_country IS NULL AND j.location = 'Anywhere')
        OR (j.loc_country IS NULL AND j.is_remote = true)
      ));

  ELSE
    -- ── 4b. Run each filter as a subquery ────────────────────────────────
    FOR v_filter IN
      SELECT id, filter_data FROM user_filters
      WHERE id = ANY(p_filter_ids) AND user_id = p_user_id
    LOOP
      v_fd := v_filter.filter_data;

      -- Extract what terms (OR logic)
      SELECT ARRAY(
        SELECT LOWER(TRIM(val))
        FROM jsonb_array_elements(COALESCE(v_fd->'whatPills', '[]')) pill,
             jsonb_array_elements_text(pill->'values') val
        WHERE TRIM(val) != ''
      ) INTO v_what_terms;

      -- Extract what NOT terms
      SELECT ARRAY(
        SELECT LOWER(TRIM(val))
        FROM jsonb_array_elements(COALESCE(v_fd->'whatNotPills', '[]')) pill,
             jsonb_array_elements_text(pill->'values') val
        WHERE TRIM(val) != ''
      ) INTO v_what_not_terms;

      -- Extract where values
      SELECT ARRAY(
        SELECT LOWER(TRIM(val))
        FROM jsonb_array_elements(COALESCE(v_fd->'wherePills', '[]')) pill,
             jsonb_array_elements_text(pill->'values') val
        WHERE TRIM(val) != ''
      ) INTO v_where_values;

      -- Extract where NOT terms
      SELECT ARRAY(
        SELECT LOWER(TRIM(val))
        FROM jsonb_array_elements(COALESCE(v_fd->'whereNotPills', '[]')) pill,
             jsonb_array_elements_text(pill->'values') val
        WHERE TRIM(val) != ''
      ) INTO v_where_not_terms;

      -- Extract who terms
      SELECT ARRAY(
        SELECT LOWER(TRIM(val))
        FROM jsonb_array_elements(COALESCE(v_fd->'whoPills', '[]')) pill,
             jsonb_array_elements_text(pill->'values') val
        WHERE TRIM(val) != ''
      ) INTO v_who_terms;

      -- Extract who NOT terms
      SELECT ARRAY(
        SELECT LOWER(TRIM(val))
        FROM jsonb_array_elements(COALESCE(v_fd->'whoNotPills', '[]')) pill,
             jsonb_array_elements_text(pill->'values') val
        WHERE TRIM(val) != ''
      ) INTO v_who_not_terms;

      -- Extract when interval
      v_when_interval := NULL;
      SELECT parse_when_value(val) INTO v_when_interval
      FROM jsonb_array_elements(COALESCE(v_fd->'whenPills', '[]')) pill,
           jsonb_array_elements_text(pill->'values') val
      WHERE TRIM(val) != ''
      LIMIT 1;

      -- Extract pay
      v_pay_min := (v_fd->'payPills'->0->>'min')::numeric;
      v_pay_max := NULLIF(v_fd->'payPills'->0->>'max', '')::numeric;
      v_include_no_salary := COALESCE((v_fd->>'includeNoSalary')::boolean, true);
      v_include_remote := COALESCE((v_fd->>'includeRemote')::boolean, false);

      -- Extract level values
      SELECT ARRAY(
        SELECT LOWER(TRIM(val))
        FROM jsonb_array_elements(COALESCE(v_fd->'levelPills', '[]')) pill,
             jsonb_array_elements_text(pill->'values') val
        WHERE TRIM(val) != ''
      ) INTO v_level_values;

      -- Extract skills
      SELECT ARRAY(
        SELECT LOWER(TRIM(val))
        FROM jsonb_array_elements(COALESCE(v_fd->'skillsPills', '[]')) pill,
             jsonb_array_elements_text(pill->'values') val
        WHERE TRIM(val) != ''
      ) INTO v_skill_values;

      -- Extract dept values
      SELECT ARRAY(
        SELECT LOWER(TRIM(val))
        FROM jsonb_array_elements(COALESCE(v_fd->'deptPills', '[]')) pill,
             jsonb_array_elements_text(pill->'values') val
        WHERE TRIM(val) != ''
      ) INTO v_dept_values;

      -- Extract jd terms
      SELECT ARRAY(
        SELECT LOWER(TRIM(val))
        FROM jsonb_array_elements(COALESCE(v_fd->'jdPills', '[]')) pill,
             jsonb_array_elements_text(pill->'values') val
        WHERE TRIM(val) != ''
      ) INTO v_jd_terms;

      -- Insert matching jobs for this filter
      INSERT INTO _search_results
      SELECT
        j.greenhouse_id, j.title, j.company_name, j.location, j.loc_country,
        j.loc_state, j.loc_city, j.is_remote, j.salary_min, j.salary_max,
        j.salary_currency, j.salary_rate, j.created_at, j.first_seen_at,
        j.apply_url, j.ats_source, j.extracted_seniority, j.extracted_skills,
        j.is_staffing_agency, j.ai_label, j.ai_content_score,
        v_filter.id
      FROM ats_jobs j
      WHERE
        -- Always open jobs only
        j.status = 'open'

        -- WHAT — title word-boundary match (OR across terms)
        AND (
          v_what_terms IS NULL OR array_length(v_what_terms, 1) IS NULL
          OR EXISTS (
            SELECT 1 FROM unnest(v_what_terms) term
            WHERE j.title ~* ('\y' || regexp_replace(term, '([.*+?^${}()|[\]\\])', '\\\1', 'g') || '\y')
          )
        )

        -- WHAT NOT — title exclusion (AND across terms)
        AND (
          v_what_not_terms IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(v_what_not_terms) term
            WHERE j.title ILIKE '%' || term || '%'
          )
        )

        -- Global title exclusions
        AND (
          v_title_excludes IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(v_title_excludes) exc
            WHERE j.title ILIKE '%' || exc || '%'
          )
        )

        -- WHERE — location matching
        AND (
          -- No where filter — all locations pass
          v_where_values IS NULL OR array_length(v_where_values, 1) IS NULL
          OR EXISTS (
            SELECT 1 FROM unnest(v_where_values) wv
            WHERE
              -- Country code match
              (v_country_map->>wv IS NOT NULL AND j.loc_country = v_country_map->>wv)
              OR
              -- US-specific: state-level + remote
              (v_country_map->>wv = 'US' AND (
                (j.loc_country IS NULL AND j.loc_state = ANY(v_us_states))
                OR (j.loc_country IS NULL AND j.is_remote = true)
                OR (j.loc_country IS NULL AND j.location IN ('Remote', 'Anywhere'))
              ))
              OR
              -- Text match on location fields
              (v_country_map->>wv IS NULL AND (
                j.location ILIKE '%' || wv || '%'
                OR j.loc_country ILIKE '%' || wv || '%'
              ))
          )
          -- Include remote override
          OR (v_include_remote AND (
            j.is_remote = true
            OR j.loc_type = 'remote'
            OR j.location ILIKE 'Remote%'
          ))
        )

        -- WHERE NOT — location exclusion
        AND (
          v_where_not_terms IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(v_where_not_terms) term
            WHERE j.location ILIKE '%' || term || '%'
          )
        )

        -- Global location exclusions
        AND (
          v_location_excludes IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(v_location_excludes) exc
            WHERE j.location ILIKE '%' || exc || '%'
          )
        )

        -- Global US-only rule
        AND (
          NOT v_us_only
          OR j.loc_country = 'US'
          OR (j.loc_country IS NULL AND j.loc_state = ANY(v_us_states))
          OR (j.loc_country IS NULL AND j.location IN ('Remote', 'Anywhere'))
          OR (j.loc_country IS NULL AND j.is_remote = true)
        )

        -- Non-US text exclusions (when US-only active)
        AND (
          NOT v_us_only
          OR NOT EXISTS (
            SELECT 1 FROM unnest(v_non_us_patterns) pat
            WHERE j.location ILIKE pat
          )
        )

        -- WHO — company include (OR across terms)
        AND (
          v_who_terms IS NULL OR array_length(v_who_terms, 1) IS NULL
          OR EXISTS (
            SELECT 1 FROM unnest(v_who_terms) term
            WHERE j.company_name ILIKE '%' || term || '%'
          )
        )

        -- WHO NOT — company exclusion
        AND (
          v_who_not_terms IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(v_who_not_terms) term
            WHERE j.company_name ILIKE '%' || term || '%'
          )
        )

        -- Global company exclusions
        AND (
          v_company_excludes IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(v_company_excludes) exc
            WHERE j.company_name ILIKE '%' || exc || '%'
          )
        )

        -- WHEN — date range
        AND (
          v_when_interval IS NULL
          OR j.created_at >= (NOW() - v_when_interval)
        )

        -- PAY — salary range
        AND (
          -- No pay filter
          v_pay_min IS NULL AND v_pay_max IS NULL
          OR (
            -- Include no-salary jobs if flag set
            (v_include_no_salary AND j.salary_max IS NULL)
            OR (
              -- Min only
              v_pay_min IS NOT NULL AND v_pay_max IS NULL
              AND j.salary_max >= v_pay_min
            )
            OR (
              -- Max only
              v_pay_min IS NULL AND v_pay_max IS NOT NULL
              AND j.salary_min <= v_pay_max
            )
            OR (
              -- Both min and max — overlapping range
              v_pay_min IS NOT NULL AND v_pay_max IS NOT NULL
              AND j.salary_max >= v_pay_min
              AND j.salary_min <= v_pay_max
            )
          )
        )

        -- SKILLS — extracted_skills array contains any term
        AND (
          v_skill_values IS NULL OR array_length(v_skill_values, 1) IS NULL
          OR j.extracted_skills && v_skill_values
        )

        -- LEVEL — extracted_seniority match
        AND (
          v_level_values IS NULL OR array_length(v_level_values, 1) IS NULL
          OR LOWER(j.extracted_seniority) = ANY(v_level_values)
        )

        -- DEPT — extracted_department match
        AND (
          v_dept_values IS NULL OR array_length(v_dept_values, 1) IS NULL
          OR LOWER(j.extracted_department) = ANY(v_dept_values)
        )

        -- JD CONTAINS — full text search
        AND (
          v_jd_terms IS NULL OR array_length(v_jd_terms, 1) IS NULL
          OR EXISTS (
            SELECT 1 FROM unnest(v_jd_terms) term
            WHERE j.content_tsv @@ websearch_to_tsquery('english', term)
          )
        )

        -- Global: exclude staffing
        AND (NOT v_exclude_staffing OR j.is_staffing_agency IS NOT TRUE)

        -- Global: exclude hourly
        AND (NOT v_exclude_hourly OR j.salary_rate IS NULL OR j.salary_rate != 'hr')

        -- Global: industry exclusions
        AND (
          v_industry_excludes IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(v_industry_excludes) exc
            WHERE j.industry ILIKE '%' || exc || '%'
          )
        )

        -- Exclude hidden jobs
        AND (v_hidden_ids IS NULL OR j.greenhouse_id != ALL(v_hidden_ids));

    END LOOP;
  END IF;

  -- ── 5. Deduplicate + aggregate filter IDs ─────────────────────────────
  CREATE TEMP TABLE _deduped AS
  SELECT DISTINCT ON (greenhouse_id)
    greenhouse_id, title, company_name, location, loc_country, loc_state,
    loc_city, is_remote, salary_min, salary_max, salary_currency, salary_rate,
    created_at, first_seen_at, apply_url, ats_source, extracted_seniority,
    extracted_skills, is_staffing_agency, ai_label, ai_content_score,
    ARRAY(
      SELECT DISTINCT matched_filter_id
      FROM _search_results r2
      WHERE r2.greenhouse_id = _search_results.greenhouse_id
        AND r2.matched_filter_id IS NOT NULL
    ) AS matched_filter_ids
  FROM _search_results
  ORDER BY greenhouse_id,
    CASE v_db_sort_field
      WHEN 'created_at'   THEN EXTRACT(EPOCH FROM created_at)::text
      WHEN 'salary_max'   THEN COALESCE(salary_max, 0)::text
      WHEN 'company_name' THEN company_name
      WHEN 'title'        THEN title
    END;

  -- ── 6. Get total count ─────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_total FROM _deduped;

  -- ── 7. Return paginated + sorted results ──────────────────────────────
  RETURN QUERY
  SELECT
    d.greenhouse_id, d.title, d.company_name, d.location, d.loc_country,
    d.loc_state, d.loc_city, d.is_remote, d.salary_min, d.salary_max,
    d.salary_currency, d.salary_rate, d.created_at, d.first_seen_at,
    d.apply_url, d.ats_source, d.extracted_seniority, d.extracted_skills,
    d.is_staffing_agency, d.ai_label, d.ai_content_score,
    d.matched_filter_ids,
    v_total
  FROM _deduped d
  ORDER BY
    CASE WHEN v_db_sort_field = 'created_at'   AND NOT p_sort_asc THEN d.created_at   END DESC,
    CASE WHEN v_db_sort_field = 'created_at'   AND     p_sort_asc THEN d.created_at   END ASC,
    CASE WHEN v_db_sort_field = 'salary_max'   AND NOT p_sort_asc THEN d.salary_max   END DESC NULLS LAST,
    CASE WHEN v_db_sort_field = 'salary_max'   AND     p_sort_asc THEN d.salary_max   END ASC  NULLS LAST,
    CASE WHEN v_db_sort_field = 'company_name' AND NOT p_sort_asc THEN d.company_name END DESC,
    CASE WHEN v_db_sort_field = 'company_name' AND     p_sort_asc THEN d.company_name END ASC,
    CASE WHEN v_db_sort_field = 'title'        AND NOT p_sort_asc THEN d.title        END DESC,
    CASE WHEN v_db_sort_field = 'title'        AND     p_sort_asc THEN d.title        END ASC
  LIMIT p_page_size
  OFFSET (p_page * p_page_size);

  DROP TABLE IF EXISTS _deduped;

END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION search_jobs(uuid, uuid[], integer, integer, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION parse_when_value(text) TO authenticated;

