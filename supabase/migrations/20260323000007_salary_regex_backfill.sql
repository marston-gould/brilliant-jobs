-- 20260323000007: Regex salary extraction helper function
-- Creates extract_salary_from_text() for use in on-demand backfill.
-- The actual backfill runs separately via the salary-backfill edge function
-- to avoid statement timeouts on the large ats_jobs table.

CREATE OR REPLACE FUNCTION extract_salary_from_text(raw_text text)
RETURNS TABLE(salary_min integer, salary_max integer, salary_rate text, salary_currency text)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  clean    text;
  m        text[];
  v_min    numeric;
  v_max    numeric;
  v_rate   text := 'yr';
BEGIN
  -- Strip HTML tags and normalize whitespace
  clean := regexp_replace(raw_text, '<[^>]+>', ' ', 'g');
  clean := regexp_replace(clean, '\s+', ' ', 'g');

  -- Skip if no USD signal
  IF clean !~ '\$' AND clean !~* '\bUSD\b' THEN RETURN; END IF;

  -- Range: $80,000 - $100,000 or $80k - $100k or $80K–$100K
  m := regexp_match(clean,
    '\$\s*(\d{1,3}(?:,\d{3})*|\d+)\s*([kK])?\s*[-–to]+\s*\$?\s*(\d{1,3}(?:,\d{3})*|\d+)\s*([kK])?'
  );
  IF m IS NOT NULL THEN
    v_min := replace(m[1], ',', '')::numeric * CASE WHEN m[2] IS NOT NULL THEN 1000 ELSE 1 END;
    v_max := replace(m[3], ',', '')::numeric * CASE WHEN m[4] IS NOT NULL THEN 1000 ELSE 1 END;
  ELSE
    -- Single value: $80,000 or $80k
    m := regexp_match(clean, '\$\s*(\d{1,3}(?:,\d{3})*|\d+)\s*([kK])?');
    IF m IS NULL THEN RETURN; END IF;
    v_min := replace(m[1], ',', '')::numeric * CASE WHEN m[2] IS NOT NULL THEN 1000 ELSE 1 END;
  END IF;

  -- Hourly: values under $500 are almost certainly hourly rates
  IF v_min < 500 THEN
    v_rate := 'hr';
    v_min := v_min * 2080;
    IF v_max IS NOT NULL THEN v_max := v_max * 2080; END IF;
  END IF;

  -- Sanity: $10k–$5M annual only
  IF v_min < 10000 OR v_min > 5000000 THEN RETURN; END IF;
  IF v_max IS NOT NULL AND (v_max < v_min OR v_max > 5000000) THEN
    v_max := NULL;
  END IF;

  salary_min      := v_min::integer;
  salary_max      := v_max::integer;
  salary_rate     := v_rate;
  salary_currency := 'USD';
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION extract_salary_from_text(text) TO authenticated, service_role;

-- Run a quick batch (5000 jobs max) within statement timeout
-- The rest will be caught by the scheduled backfill edge function
DO $$
DECLARE
  r record;
  s record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT greenhouse_id, content
    FROM ats_jobs
    WHERE status = 'open'
      AND salary_min IS NULL
      AND content IS NOT NULL
      AND content ~* '\$\s*\d'
    LIMIT 5000
  LOOP
    SELECT * INTO s FROM extract_salary_from_text(r.content) LIMIT 1;
    IF s.salary_min IS NOT NULL THEN
      UPDATE ats_jobs SET
        salary_min = s.salary_min, salary_max = s.salary_max,
        salary_rate = s.salary_rate, salary_currency = s.salary_currency
      WHERE greenhouse_id = r.greenhouse_id AND salary_min IS NULL;
      n := n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'salary_regex_backfill initial batch: % jobs updated', n;
END;
$$;
