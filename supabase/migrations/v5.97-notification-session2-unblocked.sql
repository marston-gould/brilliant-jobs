-- v5.97 Migration: Quiet Hours Hold Queue + Resend Confirmation Support
-- Session 2 unblocked items
-- Date: 2026-03-01

-- ═══════════════════════════════════════════════════════════
-- 1. held_notifications table for quiet hours retry queue
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS held_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  notification_type text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  deliver_at timestamptz NOT NULL,
  payload jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'delivered', 'failed', 'expired')),
  attempts int DEFAULT 0,
  delivered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Indexes for the escalation-checker to efficiently find due notifications
CREATE INDEX IF NOT EXISTS idx_held_notifications_deliver 
  ON held_notifications (deliver_at, status) 
  WHERE status = 'held';

CREATE INDEX IF NOT EXISTS idx_held_notifications_user 
  ON held_notifications (user_id, status);

-- RLS: users can see their own held notifications
ALTER TABLE held_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own held notifications"
  ON held_notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Service role has full access (Edge Functions use service role)
CREATE POLICY "Service role full access on held_notifications"
  ON held_notifications FOR ALL
  USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════
-- 2. Add send_decision 'held' as valid option to notification_log
-- (notification_log already accepts any text, this is just documentation)
-- ═══════════════════════════════════════════════════════════
COMMENT ON COLUMN notification_log.send_decision IS 
  'Decision outcome: sent, blocked, held (quiet hours), send_failed';

