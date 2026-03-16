-- AIS-F7: Resume Builder tables
-- ai_generated_resumes: stores AI-built resumes from scratch
-- No resume_builder_sessions needed — wizard state is client-side

CREATE TABLE IF NOT EXISTS ai_generated_resumes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text,                       -- e.g. "Senior Engineer Resume v1"
  target_role     text,
  target_industry text,
  template        text NOT NULL DEFAULT 'clean',  -- clean|modern|executive|minimal|technical
  sections_json   jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {summary, experience, skills, education}
  full_text       text,                       -- plain text for scoring/export
  initial_score   integer,
  credits_charged numeric(5,2) NOT NULL DEFAULT 5,
  source          text NOT NULL DEFAULT 'manual'  -- manual|linkedin|hybrid
                    CHECK (source IN ('manual','linkedin','hybrid')),
  status          text NOT NULL DEFAULT 'complete'
                    CHECK (status IN ('generating','complete','failed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_generated_resumes_user ON ai_generated_resumes (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION fn_ai_generated_resumes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_ai_generated_resumes_updated_at ON ai_generated_resumes;
CREATE TRIGGER trg_ai_generated_resumes_updated_at
  BEFORE UPDATE ON ai_generated_resumes
  FOR EACH ROW EXECUTE FUNCTION fn_ai_generated_resumes_updated_at();

ALTER TABLE ai_generated_resumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_generated_resumes" ON ai_generated_resumes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "service_role_full_generated_resumes" ON ai_generated_resumes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
