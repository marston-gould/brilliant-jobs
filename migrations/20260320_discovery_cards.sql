-- ============================================================
-- Migration: Discovery Cards Feature Usage Tracking
-- Spec: POD2_HANDOFF_DiscoveryCards — DC-01
-- Version: v11.56 | Date: 2026-03-20
-- ============================================================

CREATE TABLE IF NOT EXISTS user_feature_usage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  feature_key     text NOT NULL CHECK (feature_key IN (
    'exclusion_filter_set', 'resume_tailored', 'resume_scored',
    'cover_letter_generated', 'auto_apply_configured', 'ghost_badge_viewed',
    'interview_practice_started', 'not_filter_set', 'linkedin_connected',
    'salary_filter_used', 'linkedin_optimizer_used', 'staffing_flag_viewed'
  )),
  first_used_at   timestamptz NOT NULL DEFAULT now(),
  use_count       integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_user_feature UNIQUE (user_id, feature_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ufu_user_id ON user_feature_usage(user_id);

-- RLS
ALTER TABLE user_feature_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY ufu_user_select ON user_feature_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY ufu_user_insert ON user_feature_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- No UPDATE policy — use upsert (ON CONFLICT) pattern only
