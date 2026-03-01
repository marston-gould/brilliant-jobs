-- Migration: extension_events table (Tier 3 — B9/D7)
-- Date: 2026-02-27
-- Description: Centralized event logging for Chrome extension interactions

CREATE TABLE IF NOT EXISTS public.extension_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb,
  ats_platform text,
  job_url text,
  extension_version text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ext_events_user ON public.extension_events(user_id);
CREATE INDEX IF NOT EXISTS idx_ext_events_type ON public.extension_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ext_events_created ON public.extension_events(created_at DESC);

ALTER TABLE public.extension_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "extension_events_insert" ON public.extension_events;
CREATE POLICY extension_events_insert ON public.extension_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "extension_events_select" ON public.extension_events;
CREATE POLICY extension_events_select ON public.extension_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

COMMENT ON TABLE public.extension_events IS 'Centralized event log for Chrome extension actions: installs, fills, detections, errors';

-- Rollback:
-- DROP TABLE IF EXISTS public.extension_events CASCADE;
