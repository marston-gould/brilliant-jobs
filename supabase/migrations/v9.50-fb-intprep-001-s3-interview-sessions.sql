-- FB-INTPREP-001-S3: AI Interview Simulation — Schema
-- Spec: FB-INTPREP-001_InterviewPrep.docx §4.4, §10 Phase 3

-- ════════════════════════════════════════════════════════════════
-- 1. interview_sessions table
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS interview_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id            text,
  pipeline_entry_id uuid,
  messages          jsonb NOT NULL DEFAULT '[]'::jsonb,
  scorecard         jsonb,
  overall_score     int CHECK (overall_score >= 0 AND overall_score <= 100),
  feedback_mode     boolean NOT NULL DEFAULT true,
  question_count    int NOT NULL DEFAULT 6 CHECK (question_count >= 3 AND question_count <= 10),
  status            text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  started_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE interview_sessions IS 'FB-INTPREP-001: AI mock interview sessions stored for review and re-practice';
COMMENT ON COLUMN interview_sessions.messages IS 'Array of {role, content, timestamp} message objects';
COMMENT ON COLUMN interview_sessions.scorecard IS 'Post-interview scorecard JSON (null until completed)';
COMMENT ON COLUMN interview_sessions.status IS 'in_progress | completed | abandoned';

-- ════════════════════════════════════════════════════════════════
-- 2. Indexes
-- ════════════════════════════════════════════════════════════════

CREATE INDEX idx_is_user_id ON interview_sessions (user_id);
CREATE INDEX idx_is_status ON interview_sessions (status) WHERE status = 'in_progress';
CREATE INDEX idx_is_job_id ON interview_sessions (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_is_pipeline_entry ON interview_sessions (pipeline_entry_id) WHERE pipeline_entry_id IS NOT NULL;
CREATE INDEX idx_is_started_at ON interview_sessions (started_at DESC);
CREATE INDEX idx_is_user_status ON interview_sessions (user_id, status, started_at DESC);

-- ════════════════════════════════════════════════════════════════
-- 3. RLS
-- ════════════════════════════════════════════════════════════════

ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own sessions
CREATE POLICY "interview_sessions_user_select" ON interview_sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "interview_sessions_user_insert" ON interview_sessions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "interview_sessions_user_update" ON interview_sessions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role full access
CREATE POLICY "interview_sessions_service" ON interview_sessions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════
-- 4. GRANTs
-- ════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE ON interview_sessions TO authenticated;
GRANT ALL ON interview_sessions TO service_role;
