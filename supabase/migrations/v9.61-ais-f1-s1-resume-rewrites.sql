-- AIS-F1-S1: resume_rewrites + rewrite_sessions tables
-- resume_rewrites: stores final rewrite outputs per spec §3
-- rewrite_sessions: workflow state for 4-agent pipeline (analyze -> Q&A -> execute -> QC)

-- ── rewrite_sessions: workflow state ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS rewrite_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id       uuid,
  job_id          text,
  job_title       text,
  company_name    text,
  resume_text     text,
  jd_text         text,
  gap_analysis    jsonb,                  -- Agent 1 output
  questions       jsonb,                  -- Agent 2 output
  qa_answers      jsonb,                  -- User Q&A answers
  rewritten_text  text,                   -- Agent 3 output
  quality_result  jsonb,                  -- Agent 4 output
  original_score  integer,
  new_score       integer,
  diff_json       jsonb,                  -- Section-level diff
  credits_charged numeric(5,2) NOT NULL DEFAULT 3,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','analyzing','questions_ready','rewriting','complete','failed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rewrite_sessions_user ON rewrite_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rewrite_sessions_status ON rewrite_sessions (status) WHERE status NOT IN ('complete','failed');

-- ── resume_rewrites: final rewrite store (spec §2.2) ───────────────────────
CREATE TABLE IF NOT EXISTS resume_rewrites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id       uuid,
  job_id          text,
  session_id      uuid REFERENCES rewrite_sessions(id) ON DELETE SET NULL,
  original_text   text NOT NULL,
  rewritten_text  text NOT NULL,
  diff_json       jsonb,
  original_score  integer,
  new_score       integer,
  credits_charged numeric(5,2) NOT NULL DEFAULT 3,
  status          text NOT NULL DEFAULT 'complete'
                    CHECK (status IN ('pending','processing','complete','failed')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resume_rewrites_user ON resume_rewrites (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resume_rewrites_job ON resume_rewrites (user_id, job_id) WHERE job_id IS NOT NULL;

-- updated_at trigger for rewrite_sessions
CREATE OR REPLACE FUNCTION fn_rewrite_sessions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_rewrite_sessions_updated_at ON rewrite_sessions;
CREATE TRIGGER trg_rewrite_sessions_updated_at
  BEFORE UPDATE ON rewrite_sessions
  FOR EACH ROW EXECUTE FUNCTION fn_rewrite_sessions_updated_at();

-- RLS
ALTER TABLE rewrite_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_rewrites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_rewrite_sessions" ON rewrite_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "service_role_full_rewrite_sessions" ON rewrite_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "users_manage_own_resume_rewrites" ON resume_rewrites
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "service_role_full_resume_rewrites" ON resume_rewrites
  FOR ALL TO service_role USING (true) WITH CHECK (true);
