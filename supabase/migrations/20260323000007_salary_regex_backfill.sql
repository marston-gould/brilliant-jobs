-- 20260323000007: Regex salary backfill for existing open jobs
-- Extracts salary from content text using pattern matching.
-- No AI cost. Runs once on deploy.
-- On-demand AI extraction for pay-filtered searches is future work.

-- Helper: extract salary from plain text
CREATE OR REPLACE FUNCTION extract_salary_from_text(raw_text text)
RETURNS TABLE(salary_min integer, salary_max integer, salary_rate text, salary_currency text)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  clean   text;
  pat_full  text := '\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*[kK]?\s*[-–to]+\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*[kK]?';
  pat_single text := '\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*[kK]?(?:\s*(?:per\s+)?(?:year|yr|annual|annually))?';
  m1 text; m2 text;
  v_min numeric; v_max numeric;
  v_rate text := 'yr';
  v_currency text := 'USD';
BEGIN
  -- Strip HTML tags
  clean := regexp_replace(raw_text, '<[^>]+>', ' ', 'g');
  clean := regexp_replace(clean, '\s+', ' ', 'g');

  -- Skip if no USD signal
  IF clean !~ '\$' AND clean !~* '\bUSD\b' THEN
    RETURN;
  END IF;

  -- Try range pattern first: $80,000 - $100,000 or $80k-$100k
  IF clean ~ pat_full THEN
    m1 := (regexp_match(clean, pat_full))[1];
    m2 := (regexp_match(clean, pat_full))[2];
    v_min := replace(m1, ',', '')::numeric;
    v_max := replace(m2, ',', '')::numeric;

    -- k suffix handling
    IF clean ~* '\$\s*\d+\s*[kK]\s*[-–]' THEN
      v_min := v_min * 1000;
      v_max := v_max * 1000;
    END IF;
  ELSE
    -- Single value
    IF clean ~ pat_single THEN
      m1 := (regexp_match(clean, pat_single))[1];
      v_min := replace(m1, ',', '')::numeric;
      IF clean ~* '\$\s*\d+\s*[kK]' THEN
        v_min := v_min * 1000;
      END IF;
      v_max := NULL;
    END IF;
  END IF;

  IF v_min IS NULL THEN RETURN; END IF;

  -- Detect hourly rate (< $500 is almost certainly hourly)
  IF v_min < 500 THEN
    v_rate := 'hr';
    v_min := v_min * 2080;
    IF v_max IS NOT NULL THEN v_max := v_max * 2080; END IF;
  END IF;

  -- Sanity check: reasonable salary range $10k–$5M annually
  IF v_min < 10000 OR v_min > 5000000 THEN RETURN; END IF;
  IF v_max IS NOT NULL AND (v_max < v_min OR v_max > 5000000) THEN
    v_max := NULL;
  END IF;

  salary_min     := v_min::integer;
  salary_max     := v_max::integer;
  salary_rate    := v_rate;
  salary_currency := v_currency;
  RETURN NEXT;
END;
$$;

-- Backfill: update open jobs where salary_min is null but content has extractable salary
DO $$
DECLARE
  updated_count integer := 0;
  r record;
  s record;
BEGIN
  FOR r IN
    SELECT greenhouse_id, content
    FROM ats_jobs
    WHERE status = 'open'
      AND salary_min IS NULL
      AND content IS NOT NULL
      AND length(content) > 100
      AND content ~* '\$\s*\d'
  LOOP
    SELECT * INTO s FROM extract_salary_from_text(r.content) LIMIT 1;
    IF s.salary_min IS NOT NULL THEN
      UPDATE ats_jobs SET
        salary_min      = s.salary_min,
        salary_max      = s.salary_max,
        salary_rate     = s.salary_rate,
        salary_currency = s.salary_currency
      WHERE greenhouse_id = r.greenhouse_id
        AND salary_min IS NULL; -- guard: never overwrite ATS-provided values
      updated_count := updated_count + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'salary_regex_backfill: updated % jobs', updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION extract_salary_from_text(text) TO authenticated;
