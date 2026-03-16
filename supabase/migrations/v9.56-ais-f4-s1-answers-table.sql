-- AIS-F4-S1: answers table
-- Persists AI-generated form answers for history, caching, and feedback.
-- Cached answers (same user + field_label within 7 days) are served free (0 credits).

CREATE TABLE IF NOT EXISTS answers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id          text,                         -- ATS job ID if known
  job_title       text,                         -- For context labelling
  company_name    text,
  field_label     text NOT NULL,                -- The question label (cache key)
  field_type      text NOT NULL DEFAULT 'text', -- text | textarea | select
  generated_answer text NOT NULL,               -- Raw AI output
  user_edited_answer text,                      -- NULL = user accepted unchanged
  feedback        text CHECK (feedback IN ('up', 'down', NULL)),
  credits_charged numeric(5,2) NOT NULL DEFAULT 0.5,
  cached          boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_answers_user_id      ON answers (user_id);
CREATE INDEX IF NOT EXISTS idx_answers_user_label   ON answers (user_id, field_label, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_answers_user_job     ON answers (user_id, job_id) WHERE job_id IS NOT NULL;

-- RLS
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_answers" ON answers
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_role_full_answers" ON answers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- SCAR S-ANS-01: feedback_score column reserved for ML training signal aggregation
-- COMMENT ON TABLE answers IS 'AIS-F4-S1: AI-generated form answers with history + caching. S-ANS-01: ml_training_signal JSONB column reserved.';
