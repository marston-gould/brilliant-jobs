-- CS-P1-005: Observability Completion + Feature Flags
-- DO-003: Feature flags infrastructure
-- DO-004: Cron failure alerting (evaluate-alerts schedule)
-- AD-DO-003: Unified alerting pipeline
-- AD-DO-004: Admin availability monitoring

-- ─── 1. Extend feature_flags table for advanced targeting ───
ALTER TABLE public.feature_flags
  ADD COLUMN IF NOT EXISTS rollout_pct   INTEGER DEFAULT NULL CHECK (rollout_pct IS NULL OR (rollout_pct >= 0 AND rollout_pct <= 100)),
  ADD COLUMN IF NOT EXISTS plan_gate     JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS user_targets  JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS metadata      JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS category      TEXT DEFAULT 'general';

COMMENT ON COLUMN public.feature_flags.rollout_pct IS 'Percentage of users who see this flag (0-100, NULL = all)';
COMMENT ON COLUMN public.feature_flags.plan_gate IS 'JSON array of plan names that can see this flag (null = all plans)';
COMMENT ON COLUMN public.feature_flags.user_targets IS 'JSON array of user IDs explicitly targeted';
COMMENT ON COLUMN public.feature_flags.metadata IS 'Arbitrary metadata (variant config, experiment IDs, etc)';
COMMENT ON COLUMN public.feature_flags.category IS 'Flag category: general, experiment, killswitch, ops';

-- ─── 2. is_feature_enabled() SQL function ───
CREATE OR REPLACE FUNCTION public.is_feature_enabled(
  flag_key TEXT,
  user_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  flag RECORD;
  bucket INT;
BEGIN
  SELECT enabled, rollout_pct, plan_gate, user_targets
  INTO flag
  FROM public.feature_flags
  WHERE id = flag_key;

  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF NOT flag.enabled THEN RETURN FALSE; END IF;

  -- Per-user targeting (if targets exist and user_id provided)
  IF flag.user_targets IS NOT NULL AND user_id IS NOT NULL THEN
    IF flag.user_targets ? user_id::TEXT THEN RETURN TRUE; END IF;
  END IF;

  -- Percentage rollout (deterministic hash)
  IF flag.rollout_pct IS NOT NULL AND flag.rollout_pct < 100 THEN
    IF user_id IS NULL THEN RETURN FALSE; END IF;
    bucket := abs(hashtext(flag_key || ':' || user_id::TEXT)) % 100;
    RETURN bucket < flag.rollout_pct;
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_feature_enabled TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_feature_enabled TO anon;

-- ─── 3. Seed operational feature flags ───
INSERT INTO public.feature_flags (id, enabled, description, category, updated_at)
VALUES
  ('dark_mode', false, 'Enable dark mode UI across dashboard', 'general', NOW()),
  ('ai_chat_v2', false, 'New AI chat interface with context awareness', 'experiment', NOW()),
  ('passive_mode', true, 'Enable passive job monitoring mode', 'general', NOW()),
  ('email_digest_v2', false, 'New email digest template with improved CTR', 'experiment', NOW())
ON CONFLICT (id) DO NOTHING;

-- Update existing kill-switch with category
UPDATE public.feature_flags
SET category = 'killswitch'
WHERE id = 'extension_kill_switch' AND (category IS NULL OR category = 'general');

-- ─── 4. Availability monitoring table (AD-DO-004) ───
CREATE TABLE IF NOT EXISTS public.availability_checks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  surface TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('up', 'degraded', 'down')),
  latency_ms INTEGER,
  status_code INTEGER,
  error_message TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_availability_surface ON public.availability_checks(surface, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_availability_status ON public.availability_checks(status, checked_at DESC);

ALTER TABLE public.availability_checks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admin read availability"
    ON public.availability_checks FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
      )
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Grant service role full access for EF writes
GRANT ALL ON public.availability_checks TO service_role;
GRANT SELECT ON public.availability_checks TO authenticated;

-- ─── 5. Availability summary view ───
CREATE OR REPLACE VIEW public.v_availability_summary AS
SELECT
  surface,
  COUNT(*) FILTER (WHERE checked_at > NOW() - INTERVAL '24 hours') AS checks_24h,
  COUNT(*) FILTER (WHERE status = 'up' AND checked_at > NOW() - INTERVAL '24 hours') AS up_24h,
  COUNT(*) FILTER (WHERE status = 'down' AND checked_at > NOW() - INTERVAL '24 hours') AS down_24h,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'up' AND checked_at > NOW() - INTERVAL '24 hours') /
    GREATEST(COUNT(*) FILTER (WHERE checked_at > NOW() - INTERVAL '24 hours'), 1),
    2
  ) AS uptime_pct_24h,
  ROUND(AVG(latency_ms) FILTER (WHERE checked_at > NOW() - INTERVAL '1 hour'), 0) AS avg_latency_1h,
  MAX(checked_at) AS last_check
FROM public.availability_checks
GROUP BY surface;

GRANT SELECT ON public.v_availability_summary TO authenticated;

-- ─── 6. Schedule evaluate-alerts via pg_cron (every 5 minutes) ───
-- Note: Requires pg_cron extension enabled in Supabase project settings
SELECT cron.schedule(
  'evaluate-alerts-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/evaluate-alerts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ─── 7. Schedule availability checks via pg_cron (every 10 minutes) ───
SELECT cron.schedule(
  'availability-check-10min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/health-check',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"record_availability": true}'::jsonb
  );
  $$
);

-- ─── 8. Add alert rules for availability (AD-DO-004) ───
INSERT INTO public.alert_rules (name, category, condition, severity, cooldown_minutes)
VALUES
  ('Admin surface down', 'availability', '{"metric": "admin_surface_status", "operator": "==", "threshold": "down", "window_minutes": 5}', 'critical', 15),
  ('Dashboard surface down', 'availability', '{"metric": "dashboard_surface_status", "operator": "==", "threshold": "down", "window_minutes": 5}', 'critical', 15),
  ('Landing surface down', 'availability', '{"metric": "landing_surface_status", "operator": "==", "threshold": "down", "window_minutes": 5}', 'critical', 15),
  ('Health check stale (>15m)', 'health', '{"metric": "health_check_age_minutes", "operator": ">=", "threshold": 15, "window_minutes": 20}', 'warning', 30)
ON CONFLICT DO NOTHING;
