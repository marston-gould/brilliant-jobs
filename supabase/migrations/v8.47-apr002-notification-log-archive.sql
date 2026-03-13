-- ============================================================
-- APR-002: Notification Log Archive — archived_at column
-- Adds soft-delete archive capability to notification_log
-- ============================================================

-- 1. Add archived_at column (NULL = active, timestamp = archived)
ALTER TABLE notification_log
  ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL;

-- 2. Index for efficient filtering by archive status
CREATE INDEX IF NOT EXISTS idx_notif_log_archived
  ON notification_log(user_id, archived_at);

-- 3. Verify RLS is already in place (users can only archive their own rows)
-- Existing RLS policies on notification_log enforce user_id = auth.uid()
-- No additional policies needed — UPDATE is already covered by service role
-- and the JS functions pass .eq('user_id', currentUser.id) for safety
