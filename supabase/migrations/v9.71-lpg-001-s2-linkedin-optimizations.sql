-- SPEC-LPG-001-S2: linkedin_optimizations table for LinkedIn Profile Optimizer (F3)
-- Caches optimization results for 7 days per user

CREATE TABLE IF NOT EXISTS linkedin_optimizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linkedin_profile_id UUID REFERENCES linkedin_profiles(id),
  overall_score INTEGER CHECK (overall_score BETWEEN 0 AND 100),
  sections_json JSONB NOT NULL DEFAULT '{}',
  recommendations_json JSONB NOT NULL DEFAULT '{}',
  top_actions TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: users see only their own
ALTER TABLE linkedin_optimizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY linkedin_optimizations_sel ON linkedin_optimizations
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY linkedin_optimizations_ins ON linkedin_optimizations
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY linkedin_optimizations_service ON linkedin_optimizations
  FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_linkedin_opt_user
  ON linkedin_optimizations (user_id);

CREATE INDEX IF NOT EXISTS idx_linkedin_opt_expires
  ON linkedin_optimizations (expires_at)
  WHERE expires_at > NOW();

-- Grants
GRANT SELECT, INSERT ON linkedin_optimizations TO authenticated;
GRANT ALL ON linkedin_optimizations TO service_role;
