-- Migration 011: recruiter_contacts table (Item #22)
-- v5.50 — February 27, 2026
-- Prerequisite for Item #19 (Recruiter Email Discovery)

-- Stores discovered recruiter contact info for companies in the user's pipeline
CREATE TABLE IF NOT EXISTS recruiter_contacts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  company_name text,
  recruiter_name text,
  recruiter_email text,
  recruiter_title text,
  linkedin_url text,
  source text DEFAULT 'manual',           -- 'manual', 'hunter', 'extension', 'import'
  confidence_score smallint DEFAULT 0,     -- 0-100, from Hunter.io or similar
  last_contacted_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recruiter_contacts_user ON recruiter_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_recruiter_contacts_company ON recruiter_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_recruiter_contacts_email ON recruiter_contacts(user_id, recruiter_email);

-- RLS
ALTER TABLE recruiter_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY rc_select ON recruiter_contacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY rc_insert ON recruiter_contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY rc_update ON recruiter_contacts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY rc_delete ON recruiter_contacts FOR DELETE USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_recruiter_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recruiter_contacts_updated_at
  BEFORE UPDATE ON recruiter_contacts
  FOR EACH ROW EXECUTE FUNCTION update_recruiter_contacts_updated_at();

-- Rollback:
-- DROP TRIGGER IF EXISTS trg_recruiter_contacts_updated_at ON recruiter_contacts;
-- DROP FUNCTION IF EXISTS update_recruiter_contacts_updated_at();
-- DROP TABLE IF EXISTS recruiter_contacts;
