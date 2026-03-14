-- Migration: Fake Job Posting Detection — Phase 1
-- Version: v6.30
-- Date: 2026-03-02
-- Description: Creates job_fraud_scores table for ML-powered fraud detection scoring

-- 1. Create job_fraud_scores table
CREATE TABLE IF NOT EXISTS job_fraud_scores (
  job_id          TEXT NOT NULL,
  ats_source      TEXT NOT NULL,
  fraud_score     NUMERIC(4,3) NOT NULL DEFAULT 0.000,
  fraud_label     TEXT NOT NULL DEFAULT 'unknown',
  confidence      NUMERIC(4,3) DEFAULT 0.000,
  top_signals     JSONB DEFAULT '{"signals": []}'::jsonb,
  model_version   TEXT NOT NULL DEFAULT 'heuristic-v1.0',
  scored_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, ats_source)
);

-- 2. Add constraint for valid fraud labels
DO $$ BEGIN
  ALTER TABLE job_fraud_scores 
    ADD CONSTRAINT chk_fraud_label 
    CHECK (fraud_label IN ('safe', 'caution', 'suspicious', 'unknown'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Add constraint for valid score range
DO $$ BEGIN
  ALTER TABLE job_fraud_scores 
    ADD CONSTRAINT chk_fraud_score_range 
    CHECK (fraud_score >= 0.000 AND fraud_score <= 1.000);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4. Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_fraud_scores_label ON job_fraud_scores(fraud_label);
CREATE INDEX IF NOT EXISTS idx_fraud_scores_score ON job_fraud_scores(fraud_score DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_scores_scored_at ON job_fraud_scores(scored_at DESC);

-- 5. RLS policies
ALTER TABLE job_fraud_scores ENABLE ROW LEVEL SECURITY;

-- Anyone can read fraud scores (public data for job seekers)
DO $$ BEGIN
  CREATE POLICY "Anyone can read fraud scores"
    ON job_fraud_scores FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Only service role can write fraud scores (Edge Function)
DO $$ BEGIN
  CREATE POLICY "Service role writes fraud scores"
    ON job_fraud_scores FOR INSERT 
    WITH CHECK (current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role updates fraud scores"
    ON job_fraud_scores FOR UPDATE 
    USING (current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role deletes fraud scores"
    ON job_fraud_scores FOR DELETE 
    USING (current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 6. Comment the table
COMMENT ON TABLE job_fraud_scores IS 'ML-powered fraud detection scores for job postings. Scored by score-job-fraud Edge Function.';
COMMENT ON COLUMN job_fraud_scores.fraud_score IS 'Probability of fraud: 0.000 (safe) to 1.000 (fraudulent)';
COMMENT ON COLUMN job_fraud_scores.fraud_label IS 'Human-readable label: safe (0-0.299), caution (0.3-0.649), suspicious (0.65-1.0), unknown';
COMMENT ON COLUMN job_fraud_scores.top_signals IS 'Top 5 contributing signals as JSONB array with feature, weight, and human-readable description';

-- Rollback (if needed):
-- DROP TABLE IF EXISTS job_fraud_scores CASCADE;
