-- AIS-F8-S1: cover_letters table
-- Stores generated cover letters with version history and tone tracking.

CREATE TABLE IF NOT EXISTS cover_letters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id          text,
  resume_id       uuid,
  tone            text NOT NULL DEFAULT 'professional'
                  CHECK (tone IN ('professional','conversational','enthusiastic','executive')),
  content         text NOT NULL,
  version         integer NOT NULL DEFAULT 1,
  ai_score        numeric(5,2),       -- optional quality score
  credits_charged numeric(5,2) NOT NULL DEFAULT 2,
  word_count      integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cover_letters_user_job
  ON cover_letters (user_id, job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cover_letters_user
  ON cover_letters (user_id, created_at DESC);

ALTER TABLE cover_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_cover_letters" ON cover_letters
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "service_role_cover_letters" ON cover_letters
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- SCAR S-CL-01: docx_url column reserved for DOCX export storage path
-- COMMENT ON TABLE cover_letters IS 'AIS-F8-S1. S-CL-01: docx_url text column reserved.';
