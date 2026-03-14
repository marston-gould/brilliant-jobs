-- ============================================================
-- GHOST BUILD PHASE 1: Foundation Tables
-- Migration: 20260223000001_ghost_phase1.sql
-- Created: 2026-02-23
-- ============================================================

-- 1. USER PIPELINE TABLE
CREATE TABLE IF NOT EXISTS user_pipeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  job_id text,
  ats_source text,
  company_slug text NOT NULL,
  company_domain text,
  job_title text NOT NULL,
  job_url text,
  stage text NOT NULL DEFAULT 'saved'
    CHECK (stage IN ('saved', 'applied', 'posting_closed', 'responded', 'interview', 'offer', 'hired', 'rejected', 'archived')),
  saved_at timestamptz DEFAULT now(),
  applied_at timestamptz,
  responded_at timestamptz,
  interview_at timestamptz,
  offer_at timestamptz,
  hired_at timestamptz,
  rejected_at timestamptz,
  archived_at timestamptz,
  auto_advanced boolean DEFAULT false,
  auto_advanced_source text CHECK (auto_advanced_source IN ('gmail', 'listing_closed', 'manual', NULL)),
  notes text,
  filter_id uuid,
  filter_tags text[] DEFAULT '{}',
  resume_used text,
  match_score int,
  company_name text,
  salary_estimate int,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, job_id, ats_source)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_user_stage ON user_pipeline (user_id, stage);
CREATE INDEX IF NOT EXISTS idx_pipeline_company ON user_pipeline (company_slug);
CREATE INDEX IF NOT EXISTS idx_pipeline_applied ON user_pipeline (applied_at) WHERE stage = 'applied';
CREATE INDEX IF NOT EXISTS idx_pipeline_user_updated ON user_pipeline (user_id, updated_at DESC);

ALTER TABLE user_pipeline ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own pipeline" ON user_pipeline;
DO $$ BEGIN
  CREATE POLICY "Users manage own pipeline" ON user_pipeline FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DROP POLICY IF EXISTS "Admins read all pipeline" ON user_pipeline;
DO $$ BEGIN
  CREATE POLICY "Admins read all pipeline" ON user_pipeline FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. COMPANY GHOST STATS TABLE
CREATE TABLE IF NOT EXISTS company_ghost_stats (
  company_slug text PRIMARY KEY,
  total_applications int DEFAULT 0,
  total_ghosted int DEFAULT 0,
  ghost_rate numeric DEFAULT 0,
  avg_response_days int DEFAULT 7,
  last_computed_at timestamptz DEFAULT now()
);

-- 3. GHOST ALERTS DEDUP TABLE
CREATE TABLE IF NOT EXISTS ghost_alerts_sent (
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  pipeline_entry_id uuid REFERENCES user_pipeline(id) ON DELETE CASCADE NOT NULL,
  ghost_status text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, pipeline_entry_id, ghost_status)
);

-- 4. COMPUTE GHOST SCORE FUNCTION
CREATE OR REPLACE FUNCTION compute_ghost_score(
  p_days_since_applied int, p_avg_response_days int,
  p_email_classification text, p_listing_status text, p_company_ghost_rate numeric
) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_time_score numeric; v_email_score numeric; v_listing_score numeric;
  v_company_score numeric; v_total numeric; v_status text; v_confidence text;
BEGIN
  v_time_score := LEAST(p_days_since_applied::numeric / GREATEST(2 * p_avg_response_days, 14), 1.0) * 100;
  v_email_score := CASE p_email_classification
    WHEN 'silence' THEN 100 WHEN 'auto_reply' THEN 50 WHEN 'rejection' THEN 10
    WHEN 'response' THEN 0 WHEN 'interview' THEN 0 WHEN 'scheduling' THEN 0
    ELSE 70 END;
  v_listing_score := CASE p_listing_status
    WHEN 'closed' THEN 100 WHEN 'removed' THEN 100 WHEN 'reposted' THEN 50
    WHEN 'open' THEN 0 ELSE 30 END;
  v_company_score := COALESCE(p_company_ghost_rate * 100, 50);
  v_total := (v_time_score * 0.40) + (v_email_score * 0.30) + (v_listing_score * 0.15) + (v_company_score * 0.15);
  v_status := CASE WHEN v_total >= 80 THEN 'ghosted' WHEN v_total >= 50 THEN 'likely_ghosted'
    WHEN v_total >= 25 THEN 'waiting' ELSE 'active' END;
  v_confidence := CASE
    WHEN p_email_classification IS NOT NULL AND p_email_classification NOT IN ('silence', 'unknown') THEN 'high'
    WHEN p_email_classification = 'silence' THEN 'medium' ELSE 'low' END;
  RETURN jsonb_build_object('score', round(v_total), 'status', v_status, 'confidence', v_confidence,
    'factors', jsonb_build_object('time', round(v_time_score), 'email', round(v_email_score),
      'listing', round(v_listing_score), 'company_history', round(v_company_score)));
END; $$;

-- 5. GET PIPELINE GHOST STATUS RPC
CREATE OR REPLACE FUNCTION get_pipeline_ghost_status(p_user_id uuid)
RETURNS TABLE (
  pipeline_entry_id uuid, company_slug text, company_name text, job_title text,
  applied_at timestamptz, days_since_applied int, email_classification text,
  listing_status text, ghost_score int, ghost_status text, confidence text, recommended_action text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH pipeline_data AS (
    SELECT p.id AS p_id, p.company_slug AS p_company_slug,
      COALESCE(p.company_name, c.name, p.company_slug) AS p_company_name,
      p.job_title AS p_job_title, p.applied_at AS p_applied_at,
      EXTRACT(DAY FROM now() - p.applied_at)::int AS p_days,
      'unknown'::text AS p_email_class, COALESCE(j.status, 'unknown') AS p_listing_status,
      COALESCE(cg.avg_response_days, 7) AS p_avg_days, cg.ghost_rate AS p_ghost_rate
    FROM user_pipeline p
    LEFT JOIN ats_jobs j ON j.greenhouse_id = p.job_id AND j.ats_source = p.ats_source
    LEFT JOIN ats_companies c ON c.slug = p.company_slug AND c.source = p.ats_source
    LEFT JOIN company_ghost_stats cg ON cg.company_slug = p.company_slug
    WHERE p.user_id = p_user_id AND p.stage IN ('applied', 'posting_closed')
  ),
  scored AS (
    SELECT pd.*, compute_ghost_score(pd.p_days, pd.p_avg_days, pd.p_email_class, pd.p_listing_status, pd.p_ghost_rate) AS ghost_result
    FROM pipeline_data pd
  )
  SELECT s.p_id, s.p_company_slug, s.p_company_name, s.p_job_title, s.p_applied_at, s.p_days,
    s.p_email_class, s.p_listing_status, (s.ghost_result->>'score')::int, s.ghost_result->>'status',
    s.ghost_result->>'confidence',
    CASE (s.ghost_result->>'status')
      WHEN 'ghosted' THEN 'Move on. Follow up one last time or archive.'
      WHEN 'likely_ghosted' THEN 'Send a polite follow-up email.'
      WHEN 'waiting' THEN 'Still within normal response window.'
      ELSE 'No action needed.' END
  FROM scored s ORDER BY s.p_applied_at ASC;
END; $$;

-- 6. RECOMPUTE COMPANY GHOST STATS
CREATE OR REPLACE FUNCTION recompute_company_ghost_stats()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO company_ghost_stats (company_slug, total_applications, total_ghosted, ghost_rate, avg_response_days, last_computed_at)
  SELECT p.company_slug, count(*),
    count(*) FILTER (WHERE EXTRACT(DAY FROM now() - p.applied_at) > 21 AND p.stage IN ('applied', 'posting_closed')),
    CASE WHEN count(*) > 0 THEN count(*) FILTER (WHERE EXTRACT(DAY FROM now() - p.applied_at) > 21 AND p.stage IN ('applied', 'posting_closed'))::numeric / count(*) ELSE 0 END,
    COALESCE(AVG(EXTRACT(DAY FROM p.responded_at - p.applied_at)) FILTER (WHERE p.responded_at IS NOT NULL), 7)::int, now()
  FROM user_pipeline p
  WHERE p.stage IN ('applied', 'posting_closed', 'responded', 'interview', 'offer', 'hired', 'rejected')
  GROUP BY p.company_slug
  ON CONFLICT (company_slug) DO UPDATE SET
    total_applications = EXCLUDED.total_applications, total_ghosted = EXCLUDED.total_ghosted,
    ghost_rate = EXCLUDED.ghost_rate, avg_response_days = EXCLUDED.avg_response_days, last_computed_at = now();
END; $$;

-- 7. UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION update_pipeline_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_pipeline_updated_at ON user_pipeline;
CREATE TRIGGER trg_pipeline_updated_at BEFORE UPDATE ON user_pipeline FOR EACH ROW EXECUTE FUNCTION update_pipeline_updated_at();
