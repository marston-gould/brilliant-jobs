-- AIS-F2-S1: linkedin_profiles table + linkedin-profiles Storage bucket
-- Standalone LinkedIn import decoupled from PAYL.
-- Used by: Feature 2 (LinkedIn Import), Feature 7 (Resume Builder seed),
--          answer-form-question EF (personal context).

CREATE TABLE IF NOT EXISTS linkedin_profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    text,
  headline        text,
  location        text,
  experience_json jsonb DEFAULT '[]'::jsonb,
  skills_array    text[] DEFAULT '{}',
  education_json  jsonb DEFAULT '[]'::jsonb,
  li_connections  integer,
  pdf_hash        text UNIQUE,             -- SHA-256 of uploaded PDF (dedup)
  raw_pdf_url     text,                    -- Supabase Storage path
  parsed_at       timestamptz NOT NULL DEFAULT now(),
  parse_confidence numeric(4,2),          -- 0.0–1.0
  fraud_signals   jsonb DEFAULT '{}'::jsonb, -- { low_connections, blank_experience, parse_failure }
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One active profile per user (latest parse wins)
CREATE UNIQUE INDEX IF NOT EXISTS idx_linkedin_profiles_user
  ON linkedin_profiles (user_id);

CREATE INDEX IF NOT EXISTS idx_linkedin_profiles_pdf_hash
  ON linkedin_profiles (pdf_hash) WHERE pdf_hash IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION fn_linkedin_profiles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_linkedin_profiles_updated_at ON linkedin_profiles;
CREATE TRIGGER trg_linkedin_profiles_updated_at
  BEFORE UPDATE ON linkedin_profiles
  FOR EACH ROW EXECUTE FUNCTION fn_linkedin_profiles_updated_at();

-- RLS
ALTER TABLE linkedin_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_linkedin_profiles" ON linkedin_profiles
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_role_full_linkedin_profiles" ON linkedin_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Storage bucket: linkedin-profiles (private, RLS-protected, 10MB, PDFs only)
-- Note: bucket creation is done via Supabase Dashboard or CLI, not SQL.
-- The following RLS policies apply to the storage.objects table.

-- Policy: users can upload their own PDFs
CREATE POLICY "linkedin_profiles_upload_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'linkedin-profiles' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: users can read their own PDFs
CREATE POLICY "linkedin_profiles_read_own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'linkedin-profiles' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: service role full access
CREATE POLICY "linkedin_profiles_service_role"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'linkedin-profiles')
WITH CHECK (bucket_id = 'linkedin-profiles');

-- SCAR S-LI-01: linkedin_raw_text column reserved for full resume text extraction (Feature 7)
-- COMMENT ON TABLE linkedin_profiles IS 'AIS-F2-S1: Standalone LinkedIn PDF import. S-LI-01: raw_text column reserved for resume builder.';
