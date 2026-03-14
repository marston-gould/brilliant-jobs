-- Migration: FB-GHOST-BADGE-001 Ghost Intelligence Badges
-- Creates ghost_reports + ghost_company_scores tables,
-- recency-weighted aggregation function, pg_cron schedules.
-- Companion EFs: ghost-report-submit, ghost-auto-detect, ghost-score-refresh.

-- ─── 1. ghost_reports ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ghost_reports (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_name    text         NOT NULL,                     -- normalized lower-case
  application_id  uuid         REFERENCES pending_applications(id) ON DELETE SET NULL,
  source          text         NOT NULL CHECK (source IN ('self_reported', 'auto_inferred')),
  confidence      numeric(3,2) NOT NULL DEFAULT 1.0,         -- 1.0 self, 0.5 auto
  reported_at     timestamptz  NOT NULL DEFAULT now(),
  expires_at      timestamptz  NOT NULL DEFAULT (now() + INTERVAL '18 months'),
  is_active       boolean      NOT NULL DEFAULT true
);

-- Dedup: one active report per user per company per source per 90-day window
CREATE UNIQUE INDEX IF NOT EXISTS idx_ghost_reports_dedup
  ON ghost_reports (user_id, company_name, source, (date_trunc('day', reported_at) + INTERVAL '90 days'))
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_ghost_reports_company     ON ghost_reports (company_name) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ghost_reports_user        ON ghost_reports (user_id);
CREATE INDEX IF NOT EXISTS idx_ghost_reports_expires     ON ghost_reports (expires_at)   WHERE is_active = true;

COMMENT ON TABLE  ghost_reports IS 'FB-GHOST-BADGE-001: crowdsourced ghosting signals per (user, company)';
COMMENT ON COLUMN ghost_reports.source     IS 'self_reported=user action, auto_inferred=pg_cron stale check';
COMMENT ON COLUMN ghost_reports.confidence IS '1.0 for self-reported, 0.5 for auto-inferred';

-- ─── 2. ghost_company_scores ──────────────────────────────────────────────
-- Aggregated/cached scores, refreshed every 6h via pg_cron + on-demand.
CREATE TABLE IF NOT EXISTS ghost_company_scores (
  company_name        text         PRIMARY KEY,
  raw_count           integer      NOT NULL DEFAULT 0,
  effective_count     numeric(8,2) NOT NULL DEFAULT 0,        -- recency-weighted
  tier                text         NOT NULL DEFAULT 'low' CHECK (tier IN ('low', 'medium', 'high')),
  self_reported_count integer      NOT NULL DEFAULT 0,
  auto_inferred_count integer      NOT NULL DEFAULT 0,
  last_report_at      timestamptz,
  updated_at          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ghost_scores_tier ON ghost_company_scores (tier);

COMMENT ON TABLE  ghost_company_scores IS 'FB-GHOST-BADGE-001: cached aggregation of ghost_reports with recency weighting';
COMMENT ON COLUMN ghost_company_scores.effective_count IS 'SUM(confidence * recency_factor). Thresholds: low=1-4, medium=5-15, high=16+';

-- ─── 3. RLS ───────────────────────────────────────────────────────────────
ALTER TABLE ghost_reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ghost_company_scores  ENABLE ROW LEVEL SECURITY;

-- ghost_reports: users INSERT/SELECT own rows; service_role all
DROP POLICY IF EXISTS "ghost_reports_user_insert"  ON ghost_reports;
DROP POLICY IF EXISTS "ghost_reports_user_select"  ON ghost_reports;
DROP POLICY IF EXISTS "ghost_reports_service_all"  ON ghost_reports;

CREATE POLICY "ghost_reports_user_insert"
  ON ghost_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ghost_reports_user_select"
  ON ghost_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "ghost_reports_service_all"
  ON ghost_reports FOR ALL
  USING (auth.role() = 'service_role');

-- ghost_company_scores: all authenticated users can SELECT; only service_role writes
DROP POLICY IF EXISTS "ghost_scores_authenticated_read"  ON ghost_company_scores;
DROP POLICY IF EXISTS "ghost_scores_service_write"       ON ghost_company_scores;

CREATE POLICY "ghost_scores_authenticated_read"
  ON ghost_company_scores FOR SELECT
  USING (auth.role() IN ('authenticated', 'anon'));

CREATE POLICY "ghost_scores_service_write"
  ON ghost_company_scores FOR ALL
  USING (auth.role() = 'service_role');

-- ─── 4. fn_ghost_score_refresh ────────────────────────────────────────────
-- Recalculates ghost_company_scores for all companies with active reports.
-- Recency factors: <6mo=1.0, 6-12mo=0.5, 12-18mo=0.25, >18mo=excluded.
-- Tiers: effective_count 1-4=low, 5-15=medium, 16+=high.
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
BEGIN
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
    ) >= 1.0  -- only keep companies with at least 1 effective report
  )
  INSERT INTO ghost_company_scores
    (company_name, raw_count, effective_count, tier,
     self_reported_count, auto_inferred_count, last_report_at, updated_at)
  SELECT
    company_name,
    raw_count::integer,
    ROUND(effective_count::numeric, 2),
    CASE
      WHEN effective_count >= 16 THEN 'high'
      WHEN effective_count >= 5  THEN 'medium'
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

  -- Count results for reporting
  SELECT COUNT(*) INTO v_companies FROM ghost_company_scores;
  SELECT COUNT(*) INTO v_low    FROM ghost_company_scores WHERE tier = 'low';
  SELECT COUNT(*) INTO v_medium FROM ghost_company_scores WHERE tier = 'medium';
  SELECT COUNT(*) INTO v_high   FROM ghost_company_scores WHERE tier = 'high';

  RETURN QUERY SELECT v_companies, v_low, v_medium, v_high;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_ghost_score_refresh TO service_role;

-- ─── 5. pg_cron ───────────────────────────────────────────────────────────
-- ghost-score-refresh: every 6 hours
DO $guard1$ BEGIN
  PERFORM cron.unschedule('ghost-score-refresh');
EXCEPTION WHEN OTHERS THEN NULL;
END $guard1$;
SELECT cron.schedule('ghost-score-refresh', '0 */6 * * *', 'SELECT fn_ghost_score_refresh()');

-- ghost-auto-detect: daily at 2 AM UTC (called via EF, not direct SQL)
-- The EF reads user_pipeline and inserts auto_inferred reports.
-- Scheduled here as a reminder anchor; actual work done in ghost-auto-detect EF.
DO $guard2$ BEGIN
  PERFORM cron.unschedule('ghost-auto-detect');
EXCEPTION WHEN OTHERS THEN NULL;
END $guard2$;
SELECT cron.schedule('ghost-auto-detect', '0 2 * * *',
  'SELECT net.http_post(url := current_setting(''app.settings.supabase_url'', true) || ''/functions/v1/api-gateway'', headers := jsonb_build_object(''Content-Type'', ''application/json'', ''x-gateway-route'', ''ghost-auto-detect'', ''Authorization'', ''Bearer '' || current_setting(''app.settings.service_role_key'', true)), body := ''{"action":"detect"}''::jsonb)'
);

-- ─── 6. agent_action_log migration event ─────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_action_log') THEN
    INSERT INTO agent_action_log (agent_name, action_type, details)
    VALUES ('migration', 'schema_change', jsonb_build_object(
      'migration', '20260314000004_fb_ghost_badge_001',
      'tables',    ARRAY['ghost_reports', 'ghost_company_scores'],
      'feature',   'FB-GHOST-BADGE-001'
    ));
  END IF;
END $$;
