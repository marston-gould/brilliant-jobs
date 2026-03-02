-- Phase 69 Session 2: Card 6 — SMS Delivery Receipts + Failure Handling
-- Migration: Add SMS tracking columns to notification_log + user_notification_state
-- Date: 2026-03-01
-- Version: v6.22
-- Backward-compatible: all columns nullable, no existing data affected

-- ═══════════════════════════════════════════════════════════
-- 1. notification_log: SMS delivery tracking columns
-- ═══════════════════════════════════════════════════════════
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS sms_message_id text;
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS sms_delivered_at timestamptz;
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS sms_failed_at timestamptz;
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS sms_error_code text;
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS sms_carrier_code text;

-- Index for vonage-webhook DLR lookups by message ID
CREATE INDEX IF NOT EXISTS idx_notification_log_sms_message_id 
  ON notification_log (sms_message_id) 
  WHERE sms_message_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════
-- 2. user_notification_state: SMS failure tracking for auto-fallback
-- ═══════════════════════════════════════════════════════════
ALTER TABLE user_notification_state ADD COLUMN IF NOT EXISTS sms_failure_count integer DEFAULT 0;
ALTER TABLE user_notification_state ADD COLUMN IF NOT EXISTS sms_last_failure_at timestamptz;
ALTER TABLE user_notification_state ADD COLUMN IF NOT EXISTS sms_fallback_email_only boolean DEFAULT false;

-- ═══════════════════════════════════════════════════════════
-- 3. held_notifications: retry_of column for SMS retries
-- ═══════════════════════════════════════════════════════════
ALTER TABLE held_notifications ADD COLUMN IF NOT EXISTS retry_of uuid;

-- ═══════════════════════════════════════════════════════════
-- 4. Update send-notification to capture Vonage message ID
--    (This is handled in the Edge Function code, not SQL)
-- ═══════════════════════════════════════════════════════════

-- Verification queries:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'notification_log' AND column_name LIKE 'sms_%';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'user_notification_state' AND column_name LIKE 'sms_%';
