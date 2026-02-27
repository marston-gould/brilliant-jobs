-- Migration: board_discovery_queue
-- Version: v5.49
-- Item #2: Background Discovery Pipeline + Item #20
-- Date: 2026-02-27
--
-- Creates the board_discovery_queue table for ATS URLs detected by the
-- extension, queued for processing by the discover-boards Edge Function.

CREATE TABLE IF NOT EXISTS board_discovery_queue (
  id bigserial PRIMARY KEY,
  platform text NOT NULL,
  board_slug text NOT NULL,
  source_url text,
  detected_by text DEFAULT 'extension',
  user_id uuid,
  status text DEFAULT 'pending',
  result_slug text,
  result_source text,
  error_message text,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(platform, board_slug)
);

CREATE INDEX IF NOT EXISTS idx_bdq_status ON board_discovery_queue(status);
CREATE INDEX IF NOT EXISTS idx_bdq_created ON board_discovery_queue(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_companies_discovery_status ON companies(discovery_status);

ALTER TABLE board_discovery_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY bdq_insert_own ON board_discovery_queue
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY bdq_select_own ON board_discovery_queue
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

COMMENT ON TABLE board_discovery_queue IS 'ATS board URLs detected by extension, queued for discover-boards processing';

-- pg_cron: discover-boards every 6 hours
SELECT cron.schedule(
  'discover-boards-6h',
  '0 */6 * * *',
  $$SELECT net.http_post(
    url := 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/discover-boards',
    headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id$$
);

-- Rollback:
-- DROP TABLE IF EXISTS board_discovery_queue CASCADE;
-- SELECT cron.unschedule('discover-boards-6h');
