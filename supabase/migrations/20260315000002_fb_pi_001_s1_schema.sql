-- FB-PI-001 S1: Schema + Inbox Pipeline
-- pipeline_signal_inbox: staging table for raw signal candidates before classification
-- user_scan_checkpoints: per-user scan cursors for gmail + calendar
-- Modified gmail-scan EF handles calendar scanning via user_scan_checkpoints

-- ── pipeline_signal_inbox ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pipeline_signal_inbox (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source               text NOT NULL CHECK (source IN ('gmail', 'calendar')),
  source_message_id    text NOT NULL,
  raw_subject          text,
  raw_snippet          text,          -- first 500 chars of body or event description
  raw_from             text,          -- sender email/name (gmail) or organizer (calendar)
  raw_date             timestamptz,   -- email date or event start time
  raw_metadata         jsonb,         -- full headers, attendees, attachments, etc.
  classification_status text NOT NULL DEFAULT 'pending'
    CHECK (classification_status IN ('pending', 'classified', 'skipped', 'error')),
  classified_at        timestamptz,
  retry_count          integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Dedup: same user can't have duplicate source messages
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_dedup
  ON pipeline_signal_inbox (user_id, source, source_message_id);

-- Cron pickup index: only pending items that haven't exceeded retry limit
CREATE INDEX IF NOT EXISTS idx_inbox_pending
  ON pipeline_signal_inbox (created_at)
  WHERE classification_status = 'pending' AND retry_count < 3;

-- User + date for per-user query
CREATE INDEX IF NOT EXISTS idx_inbox_user_date
  ON pipeline_signal_inbox (user_id, raw_date DESC);

COMMENT ON TABLE pipeline_signal_inbox IS
  'FB-PI-001: Staging table for raw Gmail and Calendar signal candidates before AI classification. '
  'HOOK H-PI-01: source column is a signal-source plugin point — future sources (linkedin, sms) insert here. '
  'SCAR S-PI-04: raw_metadata jsonb holds arbitrary source-specific fields; user-defined rule engine will filter on these.';

-- ── user_scan_checkpoints ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_scan_checkpoints (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_gmail_scan_at      timestamptz,         -- cursor: only fetch gmail after this time
  last_gmail_history_id   text,                -- Gmail historyId for push-style incremental scanning
  last_calendar_scan_at   timestamptz,         -- cursor: only fetch calendar events after this time
  gmail_scan_status       text NOT NULL DEFAULT 'idle'
    CHECK (gmail_scan_status IN ('idle', 'scanning', 'error', 'token_error')),
  calendar_scan_status    text NOT NULL DEFAULT 'idle'
    CHECK (calendar_scan_status IN ('idle', 'scanning', 'error', 'token_error', 'not_connected')),
  gmail_error_message     text,
  calendar_error_message  text,
  consecutive_errors      integer NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_scan_checkpoints_user
  ON user_scan_checkpoints (user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION fn_scan_checkpoints_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scan_checkpoints_updated_at ON user_scan_checkpoints;
CREATE TRIGGER trg_scan_checkpoints_updated_at
  BEFORE UPDATE ON user_scan_checkpoints
  FOR EACH ROW EXECUTE FUNCTION fn_scan_checkpoints_updated_at();

COMMENT ON TABLE user_scan_checkpoints IS
  'FB-PI-001: Per-user scan cursors for Gmail and Calendar. '
  'Prevents re-processing already-scanned messages/events. '
  'token_error status surfaces reconnect prompt on dashboard. '
  'SCAR S-PI-05: calendar_scan_status will gain ''not_connected_outlook'' etc. for non-Google calendar providers.';

-- ── pipeline_signals schema extensions ─────────────────────────────────────
-- Add new columns to existing pipeline_signals table per spec §4.2.2

ALTER TABLE pipeline_signals
  ADD COLUMN IF NOT EXISTS inbox_id           uuid REFERENCES pipeline_signal_inbox(id),
  ADD COLUMN IF NOT EXISTS signal_type        text,  -- ACK, REJ-PRE, INT, REJ-POST, OFFER, RESCHED, CAL-INT, CAL-OFFER, MANUAL
  ADD COLUMN IF NOT EXISTS confidence_score   numeric(3,2),
  ADD COLUMN IF NOT EXISTS confidence_level   text CHECK (confidence_level IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS extracted_fields   jsonb,
  ADD COLUMN IF NOT EXISTS matched_application_id uuid,  -- FK resolved at app level; FK constraint deferred to S3
  ADD COLUMN IF NOT EXISTS action_taken       text CHECK (action_taken IN ('auto_moved', 'prompted', 'dismissed', 'confirmed', 'error')),
  ADD COLUMN IF NOT EXISTS target_stage       text,
  ADD COLUMN IF NOT EXISTS previous_stage     text,
  ADD COLUMN IF NOT EXISTS user_response      text CHECK (user_response IN ('confirmed', 'dismissed', 'modified')),
  ADD COLUMN IF NOT EXISTS user_responded_at  timestamptz;

COMMENT ON COLUMN pipeline_signals.signal_type IS
  'FB-PI-001: ACK=acknowledged, REJ-PRE=pre-interview rejection, INT=interview invite, '
  'REJ-POST=post-interview rejection, OFFER=job offer, RESCHED=reschedule, '
  'CAL-INT=calendar interview, CAL-OFFER=calendar offer meeting, MANUAL=user override. '
  'HOOK H-PI-01: new signal sources add their type strings here.';

COMMENT ON COLUMN pipeline_signals.extracted_fields IS
  'FB-PI-001: Structured AI-extracted data: company, role, date, interviewer_names, format, scheduling_link, salary_range. '
  'SCAR S-PI-04: user-defined signal rules will filter/override these fields.';

-- ── RLS policies ────────────────────────────────────────────────────────────

ALTER TABLE pipeline_signal_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_scan_checkpoints ENABLE ROW LEVEL SECURITY;

-- Users read their own inbox items (for debugging / future UI)
CREATE POLICY "users_read_own_inbox"
  ON pipeline_signal_inbox FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role has full access (cron writes, classification updates)
CREATE POLICY "service_role_inbox_all"
  ON pipeline_signal_inbox FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Users read/update their own checkpoints (for UI status display)
CREATE POLICY "users_own_checkpoints"
  ON user_scan_checkpoints FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "service_role_checkpoints_all"
  ON user_scan_checkpoints FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ── pg_cron: register new tables in mv_refresh_log if it exists ─────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_action_log') THEN
    INSERT INTO agent_action_log (agent_id, action_type, result_summary)
    VALUES ('system', 'migration', 'FB-PI-001-S1: pipeline_signal_inbox + user_scan_checkpoints + pipeline_signals extensions created')
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
