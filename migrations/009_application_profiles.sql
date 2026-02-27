-- Migration 009: application_profiles table (Item #21) + extension_id column (Item #8)
-- v5.46 — February 27, 2026

-- Item #21: Application Profiles table
-- Enables multiple fill personas: different resumes, cover letters, pre-filled answers per profile
CREATE TABLE IF NOT EXISTS application_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_name text NOT NULL DEFAULT 'Default',
  resume_id uuid REFERENCES resumes(id) ON DELETE SET NULL,
  cover_letter text,
  default_answers jsonb DEFAULT '{}'::jsonb,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_profiles_user ON application_profiles(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_profiles_user_default ON application_profiles(user_id) WHERE is_default = true;

ALTER TABLE application_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_profiles_select ON application_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY app_profiles_insert ON application_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY app_profiles_update ON application_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY app_profiles_delete ON application_profiles FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_application_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_app_profiles_updated_at
  BEFORE UPDATE ON application_profiles
  FOR EACH ROW EXECUTE FUNCTION update_application_profiles_updated_at();

-- Item #8: Extension ID broadcast column on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS extension_id text;

-- Rollback:
-- DROP TRIGGER IF EXISTS trg_app_profiles_updated_at ON application_profiles;
-- DROP FUNCTION IF EXISTS update_application_profiles_updated_at();
-- DROP TABLE IF EXISTS application_profiles;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS extension_id;
