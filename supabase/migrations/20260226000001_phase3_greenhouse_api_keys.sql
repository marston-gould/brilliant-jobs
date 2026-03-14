-- Phase 3A: Add API key columns to ats_companies for Greenhouse token storage
-- Run in Supabase SQL Editor

ALTER TABLE ats_companies 
  ADD COLUMN IF NOT EXISTS api_key_encrypted text,
  ADD COLUMN IF NOT EXISTS api_key_source text,
  ADD COLUMN IF NOT EXISTS api_key_scraped_at timestamptz;

-- Index for quick lookup when submitting applications
CREATE INDEX IF NOT EXISTS idx_ats_companies_api_key 
  ON ats_companies (slug, source) 
  WHERE api_key_encrypted IS NOT NULL;

COMMENT ON COLUMN ats_companies.api_key_encrypted IS 'ATS API key/token (e.g. Greenhouse gh_token). Plain text for now — these are public job board tokens, not secret keys.';
COMMENT ON COLUMN ats_companies.api_key_source IS 'How the key was obtained: scraped_iframe, scraped_js, manual, partner';
COMMENT ON COLUMN ats_companies.api_key_scraped_at IS 'When the key was last scraped/verified';
