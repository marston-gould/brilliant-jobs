-- Session 1.1: Synthetic Content Detection — Database Schema + RLS
-- Deploy: Database migration only. No frontend, no Edge Function.
-- Date: 2026-03-02
-- Version: v6.35

-- 1. Create content_ai_scores table
CREATE TABLE IF NOT EXISTS content_ai_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_type TEXT NOT NULL,          -- 'jd', 'resume', 'cover_letter'
  content_id TEXT NOT NULL,            -- greenhouse_id for JDs, resume UUID for resumes
  ats_source TEXT,                     -- ATS platform (greenhouse, lever, etc.)
  ai_generated_score NUMERIC(4,3) NOT NULL,  -- 0.000 to 1.000
  ai_label TEXT NOT NULL DEFAULT 'unknown',  -- 'human', 'mixed', 'ai_generated', 'unknown'
  perplexity_score NUMERIC(4,3),       -- predictability measure
  burstiness_score NUMERIC(4,3),       -- variation measure
  confidence NUMERIC(4,3),             -- model confidence in its assessment
  top_signals JSONB,                   -- [{signal, direction, weight}]
  summary TEXT,                        -- 1-sentence Claude verdict
  model_version TEXT NOT NULL,         -- e.g. 'claude-haiku-4-5-20251001'
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_type, content_id, ats_source)
);

-- 2. Partial indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_ai_scores_jd 
  ON content_ai_scores (content_id, ats_source) 
  WHERE content_type = 'jd';

CREATE INDEX IF NOT EXISTS idx_ai_scores_resume 
  ON content_ai_scores (content_id) 
  WHERE content_type = 'resume';

CREATE INDEX IF NOT EXISTS idx_ai_scores_label 
  ON content_ai_scores (ai_label, content_type);

-- 3. Add AI JD rate columns to ats_companies
ALTER TABLE ats_companies ADD COLUMN IF NOT EXISTS ai_jd_rate NUMERIC(4,3);
ALTER TABLE ats_companies ADD COLUMN IF NOT EXISTS ai_jd_rate_updated_at TIMESTAMPTZ;

-- 4. RLS policies
ALTER TABLE content_ai_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_scores_read_authenticated" ON content_ai_scores
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "ai_scores_write_service" ON content_ai_scores
  FOR ALL USING (auth.role() = 'service_role');

-- ROLLBACK (if needed):
-- DROP POLICY IF EXISTS "ai_scores_write_service" ON content_ai_scores;
-- DROP POLICY IF EXISTS "ai_scores_read_authenticated" ON content_ai_scores;
-- ALTER TABLE ats_companies DROP COLUMN IF EXISTS ai_jd_rate_updated_at;
-- ALTER TABLE ats_companies DROP COLUMN IF EXISTS ai_jd_rate;
-- DROP INDEX IF EXISTS idx_ai_scores_label;
-- DROP INDEX IF EXISTS idx_ai_scores_resume;
-- DROP INDEX IF EXISTS idx_ai_scores_jd;
-- DROP TABLE IF EXISTS content_ai_scores;
