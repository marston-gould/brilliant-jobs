-- v6.01 — Session 3: Onboarding milestones tracking table
-- Tracks which onboarding emails have been sent/suppressed per user.
-- Each step in the 4-email drip sequence is tracked independently.

CREATE TABLE IF NOT EXISTS onboarding_milestones (
  user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  welcome_sent_at timestamptz,
  resume_nudge_sent_at timestamptz,
  resume_completed_at timestamptz,
  filter_nudge_sent_at timestamptz,
  filter_completed_at timestamptz,
  extension_nudge_sent_at timestamptz,
  extension_completed_at timestamptz,
  sequence_completed boolean DEFAULT false,
  sequence_completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE onboarding_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own milestones" ON onboarding_milestones;
CREATE POLICY "Users can view own milestones"
  ON onboarding_milestones FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages milestones" ON onboarding_milestones;
CREATE POLICY "Service role manages milestones"
  ON onboarding_milestones FOR ALL
  USING (auth.role() = 'service_role');

-- Index for cron to find incomplete users
CREATE INDEX IF NOT EXISTS idx_onboarding_incomplete
  ON onboarding_milestones (sequence_completed)
  WHERE sequence_completed = false;

-- Auto-update + auto-complete trigger
CREATE OR REPLACE FUNCTION update_onboarding_milestones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.resume_completed_at IS NOT NULL
     AND NEW.filter_completed_at IS NOT NULL
     AND NEW.extension_completed_at IS NOT NULL
     AND NEW.sequence_completed = false THEN
    NEW.sequence_completed = true;
    NEW.sequence_completed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_onboarding_milestones_updated ON onboarding_milestones;
CREATE TRIGGER trg_onboarding_milestones_updated
  BEFORE UPDATE ON onboarding_milestones
  FOR EACH ROW
  EXECUTE FUNCTION update_onboarding_milestones_updated_at();

-- Seed existing users (pre-launch, mark as complete)
INSERT INTO onboarding_milestones (user_id, welcome_sent_at, sequence_completed, sequence_completed_at)
SELECT id, created_at, true, now()
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM onboarding_milestones)
ON CONFLICT (user_id) DO NOTHING;
