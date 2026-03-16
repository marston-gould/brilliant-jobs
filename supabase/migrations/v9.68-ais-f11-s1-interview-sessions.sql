-- AIS-F11: interview_sessions table
CREATE TABLE IF NOT EXISTS interview_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id          text,
  resume_id       uuid,
  session_type    text NOT NULL DEFAULT 'behavioral'
                    CHECK (session_type IN ('behavioral','technical','company')),
  questions_json  jsonb NOT NULL DEFAULT '[]'::jsonb,
  answers_json    jsonb NOT NULL DEFAULT '[]'::jsonb,
  feedback_json   jsonb NOT NULL DEFAULT '[]'::jsonb,
  aggregate_score integer,         -- 0-100
  duration_seconds integer,
  credits_charged numeric(5,2) NOT NULL DEFAULT 3,
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','complete','abandoned')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_user ON interview_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_job ON interview_sessions (user_id, job_id) WHERE job_id IS NOT NULL;

ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_interview_sessions" ON interview_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "service_role_full_interview_sessions" ON interview_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
