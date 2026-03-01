-- ================================================================
-- v5.91 Migration: Notification System Session 1
-- Run date: 2026-03-01
-- Tables: admin_notification_config, notification_templates (expanded), template_send_log
-- ================================================================

-- Migration 1: Admin notification config (per-notification-type, per-cohort controls)
CREATE TABLE IF NOT EXISTS admin_notification_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type text NOT NULL,
  cohort_id text NOT NULL DEFAULT 'all',
  enabled boolean DEFAULT true,
  cadence text DEFAULT 'default',
  channel_override text DEFAULT 'user_preference',
  subject_variants jsonb DEFAULT '[]'::jsonb,
  body_template_version text DEFAULT '1.0.0',
  cta_primary jsonb DEFAULT '{}'::jsonb,
  cta_secondary jsonb DEFAULT '{}'::jsonb,
  frequency_cap_count int,
  frequency_cap_period text,
  suppression_rules jsonb DEFAULT '[]'::jsonb,
  landing_page text,
  landing_tab text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(notification_type, cohort_id)
);

ALTER TABLE admin_notification_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access config" ON admin_notification_config FOR ALL USING (true);

-- Migration 2: Expand notification_templates with full template management columns
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS channel text DEFAULT 'email';
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS status text DEFAULT 'production';
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS is_production boolean DEFAULT true;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS subject_line text;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS preheader text;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS html_body text;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS plain_text_body text;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS theme text DEFAULT 'white';
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS sms_body text;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS in_app_title text;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS in_app_body text;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS in_app_icon text;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS in_app_action_url text;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS cta_primary_text text;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS cta_primary_url text;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS cta_secondary_text text;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS cta_secondary_url text;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS variables jsonb DEFAULT '[]'::jsonb;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS promoted_by text;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS promoted_at timestamptz;

-- Indexes (includes plan for backward compat with v1 data)
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_production
  ON notification_templates (notification_type, channel, cohort_id, plan)
  WHERE is_production = true;
CREATE INDEX IF NOT EXISTS idx_template_lookup
  ON notification_templates (notification_type, channel, cohort_id, status)
  WHERE is_production = true;
CREATE INDEX IF NOT EXISTS idx_template_versions
  ON notification_templates (notification_type, channel, cohort_id, created_at DESC);

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

-- Migration 3: Template send log (audit trail)
CREATE TABLE IF NOT EXISTS template_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_log_id uuid,
  template_id uuid REFERENCES notification_templates(id),
  template_version text NOT NULL,
  cohort_id text NOT NULL,
  variables_resolved jsonb,
  sent_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_send_log_template ON template_send_log (template_id, sent_at DESC);
ALTER TABLE template_send_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access send log" ON template_send_log FOR ALL USING (true);

-- Rollback (if needed):
-- DROP TABLE IF EXISTS template_send_log CASCADE;
-- DROP TABLE IF EXISTS admin_notification_config CASCADE;
-- ALTER TABLE notification_templates DROP COLUMN IF EXISTS channel, DROP COLUMN IF EXISTS status, ...;
