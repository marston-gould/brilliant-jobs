-- AF-006: user_activity_log — Extension + Dashboard activity sync
-- Unified activity timeline across all surfaces

-- ── Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_activity_log (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id     text NOT NULL,                            -- client-generated dedup key
  activity_type text NOT NULL CHECK (activity_type IN (
    'saved', 'applied', 'rewrite-offered', 'rewrite-submitted',
    'auto-submitted', 'score-check', 'setup-complete',
    'pipeline-approved', 'pipeline-queued'
  )),
  source        text NOT NULL DEFAULT 'extension' CHECK (source IN ('extension', 'dashboard')),
  job_title     text,
  company       text,
  job_url       text,
  score         integer,
  mode          text,
  metadata      jsonb DEFAULT '{}'::jsonb,                -- S-12 scar: extensible metadata
  created_at    timestamptz DEFAULT now() NOT NULL
);

-- Unique constraint for dedup (ON CONFLICT client_id DO NOTHING)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ual_client_id ON user_activity_log(client_id);

-- Query patterns
CREATE INDEX IF NOT EXISTS idx_ual_user_created ON user_activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ual_activity_type ON user_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_ual_source ON user_activity_log(source);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE user_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own activity"
  ON user_activity_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access"
  ON user_activity_log FOR ALL
  USING (auth.role() = 'service_role');

-- ── Grants ─────────────────────────────────────────────────────────────────
GRANT SELECT ON user_activity_log TO authenticated;
GRANT ALL ON user_activity_log TO service_role;

-- ── Cleanup cron: retain 90 days ───────────────────────────────────────────
SELECT cron.schedule(
  'cleanup-user-activity-log',
  '0 5 * * *',  -- daily at 5 AM UTC
  $$DELETE FROM user_activity_log WHERE created_at < now() - interval '90 days'$$
);

-- ── Summary view for dashboard widget ──────────────────────────────────────
CREATE OR REPLACE VIEW v_user_activity_summary AS
SELECT
  user_id,
  count(*) FILTER (WHERE created_at > now() - interval '24 hours') AS count_24h,
  count(*) FILTER (WHERE created_at > now() - interval '7 days') AS count_7d,
  count(*) FILTER (WHERE activity_type = 'applied' AND created_at > now() - interval '24 hours') AS applied_24h,
  count(*) FILTER (WHERE activity_type = 'auto-submitted' AND created_at > now() - interval '24 hours') AS auto_submitted_24h,
  count(*) FILTER (WHERE activity_type = 'saved' AND created_at > now() - interval '24 hours') AS saved_24h,
  count(*) FILTER (WHERE source = 'extension') AS from_extension,
  count(*) FILTER (WHERE source = 'dashboard') AS from_dashboard
FROM user_activity_log
GROUP BY user_id;

GRANT SELECT ON v_user_activity_summary TO authenticated;
GRANT SELECT ON v_user_activity_summary TO service_role;
