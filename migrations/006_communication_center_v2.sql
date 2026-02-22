-- ============================================================
-- Migration 006: Communication Center v2
-- Phase 1 of Communication System — schema upgrades for
-- credit-based 3-tier pricing, new notification types,
-- tier-aware preference gating
-- ============================================================

-- 1. Add v2 columns to notification_preferences
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS digest_time time DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS digest_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekly_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS credit_alerts_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_refill_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_refill_threshold int DEFAULT 10,
  ADD COLUMN IF NOT EXISTS auto_refill_amount text DEFAULT '$5';

-- 2. Add new v2 notification types to notification_channels
-- Insert default channel prefs for v2 notification types (idempotent)
-- These will be populated per-user on first load via the UI

-- 3. Add idempotency_key to notification_log if not exists
ALTER TABLE notification_log
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE INDEX IF NOT EXISTS idx_notif_log_idempotency
  ON notification_log (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 4. Add cohort + plan tracking to notification_log for analytics
ALTER TABLE notification_log
  ADD COLUMN IF NOT EXISTS user_plan text,
  ADD COLUMN IF NOT EXISTS user_cohort text,
  ADD COLUMN IF NOT EXISTS template_version text;

-- 5. Add credit tracking fields to notification_actions
ALTER TABLE notification_actions
  ADD COLUMN IF NOT EXISTS credits_used int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notification_tier text;

-- 6. Create notification_templates table for cohort-versioned templates
CREATE TABLE IF NOT EXISTS notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type text NOT NULL,
  plan text NOT NULL DEFAULT 'free',
  cohort_id text,
  version text DEFAULT '2.0.0',
  config jsonb NOT NULL DEFAULT '{}',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(notification_type, plan, cohort_id)
);

-- Enable RLS on notification_templates (admin-only read, service-role write)
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "admin_read_templates" ON notification_templates
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 7. Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_notif_log_user_type
  ON notification_log (user_id, notification_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_log_user_status
  ON notification_log (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_channels_user
  ON notification_channels (user_id);

CREATE INDEX IF NOT EXISTS idx_notif_actions_pending
  ON notification_actions (status, expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_notif_actions_user_status
  ON notification_actions (user_id, status, created_at DESC);

-- 8. Insert default template configs for launch cohort
INSERT INTO notification_templates (notification_type, plan, cohort_id, config) VALUES
  -- Daily digest
  ('daily_digest', 'free', 'cohort_launch', '{"max_matches_shown": 5, "show_upgrade_cta": true, "upgrade_target": "starter", "show_ai_insights": false, "show_credit_balance": false}'::jsonb),
  ('daily_digest', 'starter', 'cohort_launch', '{"max_matches_shown": 20, "show_upgrade_cta": true, "upgrade_target": "pro", "show_ai_insights": false, "show_credit_balance": true}'::jsonb),
  ('daily_digest', 'pro', 'cohort_launch', '{"max_matches_shown": null, "show_upgrade_cta": false, "show_ai_insights": true, "show_credit_balance": true}'::jsonb),
  -- Weekly summary
  ('weekly_summary', 'free', 'cohort_launch', '{"show_upgrade_cta": true, "upgrade_target": "starter", "show_credit_usage": false}'::jsonb),
  ('weekly_summary', 'starter', 'cohort_launch', '{"show_upgrade_cta": true, "upgrade_target": "pro", "show_credit_usage": true}'::jsonb),
  ('weekly_summary', 'pro', 'cohort_launch', '{"show_upgrade_cta": false, "show_credit_usage": true}'::jsonb),
  -- Ghost alert
  ('ghost_alert', 'free', 'cohort_launch', '{"show_follow_up_template": false}'::jsonb),
  ('ghost_alert', 'starter', 'cohort_launch', '{"show_follow_up_template": true}'::jsonb),
  ('ghost_alert', 'pro', 'cohort_launch', '{"show_follow_up_template": true}'::jsonb)
ON CONFLICT (notification_type, plan, cohort_id) DO NOTHING;

-- 9. RPC to get user notification preferences with channel defaults
CREATE OR REPLACE FUNCTION get_notification_prefs(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  prefs jsonb;
  channels jsonb;
  overrides jsonb;
BEGIN
  -- Get global preferences
  SELECT to_jsonb(np.*) INTO prefs
  FROM notification_preferences np
  WHERE np.user_id = p_user_id;

  -- Get per-type channel settings
  SELECT coalesce(jsonb_agg(to_jsonb(nc.*)), '[]'::jsonb) INTO channels
  FROM notification_channels nc
  WHERE nc.user_id = p_user_id;

  -- Get filter overrides
  SELECT coalesce(jsonb_agg(to_jsonb(nfo.*)), '[]'::jsonb) INTO overrides
  FROM notification_filter_overrides nfo
  WHERE nfo.user_id = p_user_id;

  RETURN jsonb_build_object(
    'preferences', coalesce(prefs, '{}'::jsonb),
    'channels', channels,
    'overrides', overrides
  );
END;
$$;

-- 10. RPC to upsert notification channel preferences
CREATE OR REPLACE FUNCTION upsert_notification_channel(
  p_user_id uuid,
  p_notification_type text,
  p_email boolean DEFAULT true,
  p_sms boolean DEFAULT false,
  p_frequency text DEFAULT 'realtime'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO notification_channels (user_id, notification_type, email, sms, frequency)
  VALUES (p_user_id, p_notification_type, p_email, p_sms, p_frequency)
  ON CONFLICT (user_id, notification_type)
  DO UPDATE SET email = p_email, sms = p_sms, frequency = p_frequency;
END;
$$;

-- 11. RPC to save escalation settings
CREATE OR REPLACE FUNCTION save_escalation_settings(
  p_user_id uuid,
  p_quiet_start time DEFAULT '22:00',
  p_quiet_end time DEFAULT '07:00',
  p_timezone text DEFAULT 'America/New_York',
  p_escalation_timeout int DEFAULT 4
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE notification_preferences
  SET quiet_start = p_quiet_start,
      quiet_end = p_quiet_end,
      timezone = p_timezone,
      escalation_timeout_hours = p_escalation_timeout,
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- Rollback SQL (for reference):
-- ALTER TABLE notification_preferences DROP COLUMN IF EXISTS digest_time;
-- ALTER TABLE notification_preferences DROP COLUMN IF EXISTS digest_enabled;
-- ALTER TABLE notification_preferences DROP COLUMN IF EXISTS weekly_enabled;
-- ALTER TABLE notification_preferences DROP COLUMN IF EXISTS credit_alerts_enabled;
-- ALTER TABLE notification_preferences DROP COLUMN IF EXISTS auto_refill_enabled;
-- ALTER TABLE notification_preferences DROP COLUMN IF EXISTS auto_refill_threshold;
-- ALTER TABLE notification_preferences DROP COLUMN IF EXISTS auto_refill_amount;
-- ALTER TABLE notification_log DROP COLUMN IF EXISTS user_plan;
-- ALTER TABLE notification_log DROP COLUMN IF EXISTS user_cohort;
-- ALTER TABLE notification_log DROP COLUMN IF EXISTS template_version;
-- ALTER TABLE notification_actions DROP COLUMN IF EXISTS credits_used;
-- ALTER TABLE notification_actions DROP COLUMN IF EXISTS notification_tier;
-- DROP TABLE IF EXISTS notification_templates;
-- DROP FUNCTION IF EXISTS get_notification_prefs;
-- DROP FUNCTION IF EXISTS upsert_notification_channel;
-- DROP FUNCTION IF EXISTS save_escalation_settings;
