-- ================================================================
-- v5.95 Migration: Notification System Session 2
-- Double Opt-In + Notification Preferences + Message Classification
-- Run date: 2026-03-01
-- Tables: user_notification_preferences, user_notification_state
-- Dependencies: Session 1 tables (v5.91) must be deployed
-- ================================================================

-- ================================================================
-- Table 1: user_notification_state
-- Tracks double opt-in status, marketing consent, SMS verification
-- One row per user — created at signup
-- ================================================================
CREATE TABLE IF NOT EXISTS user_notification_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Email verification (double opt-in)
  email_verified boolean DEFAULT false,
  email_verified_at timestamptz,
  double_opt_in_sent_at timestamptz,
  double_opt_in_token text,
  double_opt_in_expires_at timestamptz,
  -- Marketing consent
  marketing_opt_in boolean DEFAULT false,
  marketing_opt_in_at timestamptz,
  -- SMS verification
  sms_verified boolean DEFAULT false,
  sms_verified_at timestamptz,
  phone_number text,
  phone_country_code text,
  sms_consent boolean DEFAULT false,
  sms_consent_at timestamptz,
  -- Quiet hours + caps
  quiet_hours_start text DEFAULT '22:00',
  quiet_hours_end text DEFAULT '07:00',
  timezone text DEFAULT 'America/New_York',
  daily_email_cap int DEFAULT 10,
  -- Preference completion
  preferences_completed boolean DEFAULT false,
  preferences_completed_at timestamptz,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS: Users read/write own state, admin full access
ALTER TABLE user_notification_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notification state"
  ON user_notification_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own notification state"
  ON user_notification_state FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access notification state"
  ON user_notification_state FOR ALL
  USING (auth.role() = 'service_role');

-- Index for token lookups (confirm-email flow)
CREATE INDEX IF NOT EXISTS idx_notif_state_token
  ON user_notification_state (double_opt_in_token)
  WHERE double_opt_in_token IS NOT NULL;

-- ================================================================
-- Table 2: user_notification_preferences
-- Per-user, per-notification-type channel preferences
-- Counterpart to admin_notification_config (admin-side)
-- ================================================================
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  notification_type text NOT NULL,
  email_enabled boolean DEFAULT true,
  sms_enabled boolean DEFAULT false,
  in_app_enabled boolean DEFAULT true,
  frequency text DEFAULT 'realtime',  -- realtime | daily | weekly
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, notification_type)
);

-- RLS: Users read/write own preferences, admin full access
ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notification preferences"
  ON user_notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own notification preferences"
  ON user_notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own notification preferences"
  ON user_notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own notification preferences"
  ON user_notification_preferences FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access notification preferences"
  ON user_notification_preferences FOR ALL
  USING (auth.role() = 'service_role');

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_user_notif_prefs_user
  ON user_notification_preferences (user_id);

CREATE INDEX IF NOT EXISTS idx_user_notif_prefs_lookup
  ON user_notification_preferences (user_id, notification_type);

-- ================================================================
-- Add classification + reason columns to notification_log
-- For send-gate decision tracking
-- ================================================================
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS classification text;
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS send_decision text DEFAULT 'sent';
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS send_reason text;

-- Index for send decision analytics
CREATE INDEX IF NOT EXISTS idx_notif_log_decision
  ON notification_log (user_id, send_decision, created_at DESC);

-- ================================================================
-- Updated_at trigger function (reusable)
-- ================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to new tables
DROP TRIGGER IF EXISTS trg_user_notification_state_updated ON user_notification_state;
CREATE TRIGGER trg_user_notification_state_updated
  BEFORE UPDATE ON user_notification_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_user_notification_preferences_updated ON user_notification_preferences;
CREATE TRIGGER trg_user_notification_preferences_updated
  BEFORE UPDATE ON user_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================
-- Rollback (if needed):
-- DROP TABLE IF EXISTS user_notification_preferences CASCADE;
-- DROP TABLE IF EXISTS user_notification_state CASCADE;
-- ALTER TABLE notification_log DROP COLUMN IF EXISTS classification;
-- ALTER TABLE notification_log DROP COLUMN IF EXISTS send_decision;
-- ALTER TABLE notification_log DROP COLUMN IF EXISTS send_reason;
-- ================================================================
