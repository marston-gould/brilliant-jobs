-- ═══════════════════════════════════════════════════════════
-- CS-023: Admin Monitoring & Alerts Infrastructure
-- AD-FIX-11: Monitoring dashboard data (health_check_log)
-- AD-FIX-12: Alert rules + alert history
-- ═══════════════════════════════════════════════════════════

-- ─── Health Check Log — stores results from periodic health checks ───
CREATE TABLE IF NOT EXISTS public.health_check_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id      TEXT NOT NULL,
  overall     TEXT NOT NULL CHECK (overall IN ('healthy', 'degraded', 'unhealthy')),
  checks      JSONB NOT NULL DEFAULT '{}',
  total       INTEGER NOT NULL DEFAULT 0,
  passed      INTEGER NOT NULL DEFAULT 0,
  warned      INTEGER NOT NULL DEFAULT 0,
  failed      INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.health_check_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admin read health_check_log"
    ON public.health_check_log FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service insert health_check_log"
    ON public.health_check_log FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_health_check_log_created ON public.health_check_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_check_log_overall ON public.health_check_log(overall, created_at DESC);

-- Auto-cleanup: keep only 30 days of health check logs
-- (To be wired into a pg_cron job)

-- ─── Alert Rules — configurable monitoring thresholds ───
CREATE TABLE IF NOT EXISTS public.alert_rules (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('cron', 'health', 'feed', 'error', 'latency', 'custom')),
  condition   JSONB NOT NULL DEFAULT '{}',
  -- condition schema: { metric, operator, threshold, window_minutes }
  severity    TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  enabled     BOOLEAN NOT NULL DEFAULT true,
  notify_email BOOLEAN NOT NULL DEFAULT true,
  notify_posthog BOOLEAN NOT NULL DEFAULT true,
  cooldown_minutes INTEGER NOT NULL DEFAULT 60,
  last_triggered_at TIMESTAMPTZ,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admin manage alert_rules"
    ON public.alert_rules FOR ALL
    USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Alert History — records of fired alerts ───
CREATE TABLE IF NOT EXISTS public.alert_history (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id     UUID REFERENCES public.alert_rules(id) ON DELETE SET NULL,
  rule_name   TEXT NOT NULL,
  severity    TEXT NOT NULL,
  message     TEXT NOT NULL,
  details     JSONB DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'fired' CHECK (status IN ('fired', 'acknowledged', 'resolved')),
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.alert_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admin manage alert_history"
    ON public.alert_history FOR ALL
    USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_alert_history_created ON public.alert_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_status ON public.alert_history(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_rule ON public.alert_history(rule_id, created_at DESC);

-- ─── Seed default alert rules ───
INSERT INTO public.alert_rules (name, category, condition, severity, cooldown_minutes)
VALUES
  ('Cron job failure', 'cron', '{"metric": "cron_failed_count", "operator": ">=", "threshold": 1, "window_minutes": 60}', 'critical', 30),
  ('Health check degraded', 'health', '{"metric": "health_status", "operator": "==", "threshold": "degraded", "window_minutes": 15}', 'warning', 60),
  ('Health check unhealthy', 'health', '{"metric": "health_status", "operator": "==", "threshold": "unhealthy", "window_minutes": 5}', 'critical', 15),
  ('Feed stale > 2 hours', 'feed', '{"metric": "feed_freshness_minutes", "operator": ">=", "threshold": 120, "window_minutes": 30}', 'warning', 120),
  ('High error rate', 'error', '{"metric": "error_count_1h", "operator": ">=", "threshold": 50, "window_minutes": 60}', 'critical', 60),
  ('Surface latency > 5s', 'latency', '{"metric": "surface_latency_ms", "operator": ">=", "threshold": 5000, "window_minutes": 15}', 'warning', 30)
ON CONFLICT DO NOTHING;

-- ─── Monitoring summary view ───
CREATE OR REPLACE VIEW public.v_monitoring_summary AS
SELECT
  (SELECT COUNT(*) FROM public.health_check_log WHERE created_at > NOW() - INTERVAL '24 hours') AS checks_24h,
  (SELECT COUNT(*) FROM public.health_check_log WHERE overall = 'unhealthy' AND created_at > NOW() - INTERVAL '24 hours') AS unhealthy_24h,
  (SELECT COUNT(*) FROM public.health_check_log WHERE overall = 'degraded' AND created_at > NOW() - INTERVAL '24 hours') AS degraded_24h,
  (SELECT COUNT(*) FROM public.alert_history WHERE created_at > NOW() - INTERVAL '24 hours') AS alerts_24h,
  (SELECT COUNT(*) FROM public.alert_history WHERE status = 'fired' AND created_at > NOW() - INTERVAL '24 hours') AS unresolved_24h,
  (SELECT overall FROM public.health_check_log ORDER BY created_at DESC LIMIT 1) AS latest_status,
  (SELECT created_at FROM public.health_check_log ORDER BY created_at DESC LIMIT 1) AS latest_check_at;

GRANT SELECT ON public.v_monitoring_summary TO authenticated;
GRANT SELECT ON public.health_check_log TO authenticated;
GRANT SELECT ON public.alert_rules TO authenticated;
GRANT SELECT ON public.alert_history TO authenticated;
