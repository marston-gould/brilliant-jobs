-- FB-PI-001 S4: Untracked Application Confirmations
-- pipeline_pending_confirmations: holds detected untracked apps waiting for user confirmation

CREATE TABLE IF NOT EXISTS pipeline_pending_confirmations (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id                  uuid NOT NULL REFERENCES pipeline_signals(id) ON DELETE CASCADE,
  detected_company           text NOT NULL,
  detected_role              text,
  detected_stage             text NOT NULL DEFAULT 'applied',
  source_email_subject       text,
  source_email_date          timestamptz,
  source                     text NOT NULL DEFAULT 'gmail' CHECK (source IN ('gmail', 'calendar')),
  status                     text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'dismissed')),
  confirmed_application_id   uuid,  -- FK to user_pipeline.id set on confirm
  created_at                 timestamptz NOT NULL DEFAULT now(),
  resolved_at                timestamptz
);

-- One active confirmation per signal (prevent duplication)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_conf_signal
  ON pipeline_pending_confirmations (signal_id)
  WHERE status = 'pending';

-- User lookup index
CREATE INDEX IF NOT EXISTS idx_pending_conf_user_status
  ON pipeline_pending_confirmations (user_id, status, created_at DESC);

ALTER TABLE pipeline_pending_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_confirmations"
  ON pipeline_pending_confirmations FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_role_confirmations_all"
  ON pipeline_pending_confirmations FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE pipeline_pending_confirmations IS
  'FB-PI-001 S4: Untracked job applications detected via Gmail/Calendar. '
  'User must confirm before adding to pipeline. '
  'SCAR S-PI-04: user-defined signal rules will auto-confirm matching confirmations.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_action_log') THEN
    INSERT INTO agent_action_log (agent_id, action_type, result_summary)
    VALUES ('system', 'migration', 'FB-PI-001-S4: pipeline_pending_confirmations table created')
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
