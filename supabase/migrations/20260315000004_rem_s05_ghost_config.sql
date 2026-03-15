-- REM-S05: Move ghost tier thresholds from hardcoded to configurable
-- ghost_config table allows tuning via Supabase dashboard without migration deploy.

-- ─── 1. ghost_config table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ghost_config (
  key         text PRIMARY KEY,
  value       numeric NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: authenticated read, service_role write
ALTER TABLE ghost_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ghost_config"
  ON ghost_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages ghost_config"
  ON ghost_config FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 2. Seed default thresholds ───────────────────────────────────────
INSERT INTO ghost_config (key, value, description) VALUES
  ('tier_medium_threshold', 5, 'Minimum effective_count for medium tier (default: 5)'),
  ('tier_high_threshold', 16, 'Minimum effective_count for high tier (default: 16)')
ON CONFLICT (key) DO NOTHING;

-- ─── 3. Rewrite fn_ghost_score_refresh to read from ghost_config ──────
CREATE OR REPLACE FUNCTION fn_ghost_score_refresh()
RETURNS TABLE(companies_updated integer, tier_low integer, tier_medium integer, tier_high integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_companies integer := 0;
  v_low       integer := 0;
  v_medium    integer := 0;
  v_high      integer := 0;
  v_thresh_medium numeric := 5;
  v_thresh_high   numeric := 16;
BEGIN
  -- Read configurable thresholds (fallback to defaults if missing)
  SELECT COALESCE((SELECT value FROM ghost_config WHERE key = 'tier_medium_threshold'), 5)
    INTO v_thresh_medium;
  SELECT COALESCE((SELECT value FROM ghost_config WHERE key = 'tier_high_threshold'), 16)
    INTO v_thresh_high;

  -- Step 1: expire stale reports
  UPDATE ghost_reports
  SET    is_active = false
  WHERE  is_active = true
    AND  reported_at < now() - INTERVAL '18 months';

  -- Step 2: upsert aggregated scores with recency weighting
  WITH weighted AS (
    SELECT
      company_name,
      COUNT(*)                                                            AS raw_count,
      SUM(
        confidence *
        CASE
          WHEN reported_at >= now() - INTERVAL '6 months'  THEN 1.0
          WHEN reported_at >= now() - INTERVAL '12 months' THEN 0.5
          WHEN reported_at >= now() - INTERVAL '18 months' THEN 0.25
          ELSE 0
        END
      )                                                                   AS effective_count,
      COUNT(*) FILTER (WHERE source = 'self_reported')                   AS self_reported_count,
      COUNT(*) FILTER (WHERE source = 'auto_inferred')                   AS auto_inferred_count,
      MAX(reported_at)                                                    AS last_report_at
    FROM   ghost_reports
    WHERE  is_active = true
    GROUP  BY company_name
    HAVING SUM(
      confidence *
      CASE
        WHEN reported_at >= now() - INTERVAL '6 months'  THEN 1.0
        WHEN reported_at >= now() - INTERVAL '12 months' THEN 0.5
        WHEN reported_at >= now() - INTERVAL '18 months' THEN 0.25
        ELSE 0
      END
    ) >= 1.0
  )
  INSERT INTO ghost_company_scores
    (company_name, raw_count, effective_count, tier,
     self_reported_count, auto_inferred_count, last_report_at, updated_at)
  SELECT
    company_name,
    raw_count::integer,
    ROUND(effective_count::numeric, 2),
    CASE
      WHEN effective_count >= v_thresh_high   THEN 'high'
      WHEN effective_count >= v_thresh_medium THEN 'medium'
      ELSE 'low'
    END,
    self_reported_count::integer,
    auto_inferred_count::integer,
    last_report_at,
    now()
  FROM weighted
  ON CONFLICT (company_name) DO UPDATE SET
    raw_count           = EXCLUDED.raw_count,
    effective_count     = EXCLUDED.effective_count,
    tier                = EXCLUDED.tier,
    self_reported_count = EXCLUDED.self_reported_count,
    auto_inferred_count = EXCLUDED.auto_inferred_count,
    last_report_at      = EXCLUDED.last_report_at,
    updated_at          = now();

  -- Step 3: remove companies that no longer have active reports
  DELETE FROM ghost_company_scores
  WHERE company_name NOT IN (
    SELECT DISTINCT company_name FROM ghost_reports WHERE is_active = true
  );

  -- Count results
  SELECT COUNT(*) INTO v_companies FROM ghost_company_scores;
  SELECT COUNT(*) INTO v_low    FROM ghost_company_scores WHERE tier = 'low';
  SELECT COUNT(*) INTO v_medium FROM ghost_company_scores WHERE tier = 'medium';
  SELECT COUNT(*) INTO v_high   FROM ghost_company_scores WHERE tier = 'high';

  RETURN QUERY SELECT v_companies, v_low, v_medium, v_high;
END;
$$;
