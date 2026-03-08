-- ============================================================================
-- v6.39 — Deployment Performance Reports & DORA Metrics (BI-06)
-- ============================================================================
-- Tables:
--   - dora_metrics_snapshots: periodic DORA metric calculations
--   - deployment_reports: generated period summary reports
-- Views:
--   - v_dora_metrics_current: latest DORA metrics with classification
--   - v_deployment_performance_trends: 7d/30d/90d trend comparison
-- Functions:
--   - fn_calculate_dora_metrics: compute DORA from deploy_events + rollback_events
--   - fn_generate_deployment_report: create period report snapshot
-- RLS: admin read, service write on both tables
-- Hooks: H-02 event bus for report generation events
-- Scars: S-12 metadata JSONB on both tables for future extensibility
-- ============================================================================

-- ── Table: dora_metrics_snapshots ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dora_metrics_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type           TEXT NOT NULL CHECK (period_type IN ('daily','weekly','monthly')),
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  -- DORA Metric 1: Deployment Frequency (deploys per day in period)
  deploy_frequency      NUMERIC(10,4) NOT NULL DEFAULT 0,
  deploy_frequency_class TEXT NOT NULL DEFAULT 'low' CHECK (deploy_frequency_class IN ('elite','high','medium','low')),
  total_deploys         INTEGER NOT NULL DEFAULT 0,
  successful_deploys    INTEGER NOT NULL DEFAULT 0,
  -- DORA Metric 2: Lead Time for Changes (avg minutes from commit to deploy)
  lead_time_minutes     NUMERIC(10,2) NOT NULL DEFAULT 0,
  lead_time_class       TEXT NOT NULL DEFAULT 'low' CHECK (lead_time_class IN ('elite','high','medium','low')),
  -- DORA Metric 3: Mean Time to Recovery (avg minutes from failure to recovery)
  mttr_minutes          NUMERIC(10,2) NOT NULL DEFAULT 0,
  mttr_class            TEXT NOT NULL DEFAULT 'low' CHECK (mttr_class IN ('elite','high','medium','low')),
  total_incidents       INTEGER NOT NULL DEFAULT 0,
  total_rollbacks       INTEGER NOT NULL DEFAULT 0,
  -- DORA Metric 4: Change Failure Rate (% of deploys causing incidents)
  change_failure_rate   NUMERIC(5,2) NOT NULL DEFAULT 0,
  change_failure_class  TEXT NOT NULL DEFAULT 'low' CHECK (change_failure_class IN ('elite','high','medium','low')),
  -- Composite
  overall_class         TEXT NOT NULL DEFAULT 'low' CHECK (overall_class IN ('elite','high','medium','low')),
  health_score_avg      NUMERIC(5,2) DEFAULT 0,
  surfaces_deployed     TEXT[] DEFAULT '{}',
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  scar_meta             JSONB DEFAULT '{}'::JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_type, period_start)
);

COMMENT ON TABLE public.dora_metrics_snapshots IS 'BI-06: Periodic DORA metric calculations computed from deploy_events + rollback_events + deploy_alert_history';
COMMENT ON COLUMN public.dora_metrics_snapshots.scar_meta IS 'S-12: Reserved for future metric extension (per-surface breakdown, custom thresholds)';
COMMENT ON COLUMN public.dora_metrics_snapshots.deploy_frequency_class IS 'DORA: elite=on-demand/multi-day, high=daily-weekly, medium=weekly-monthly, low=monthly+';
COMMENT ON COLUMN public.dora_metrics_snapshots.lead_time_class IS 'DORA: elite=<1hr, high=1d-1wk, medium=1wk-1mo, low=1mo+';
COMMENT ON COLUMN public.dora_metrics_snapshots.mttr_class IS 'DORA: elite=<1hr, high=<1d, medium=<1wk, low=1wk+';
COMMENT ON COLUMN public.dora_metrics_snapshots.change_failure_class IS 'DORA: elite=0-5%, high=5-10%, medium=10-15%, low=15%+';

-- ── Table: deployment_reports ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.deployment_reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type           TEXT NOT NULL CHECK (report_type IN ('weekly','monthly','on_demand')),
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  title                 TEXT NOT NULL,
  summary               TEXT NOT NULL DEFAULT '',
  -- Snapshot data
  total_deploys         INTEGER NOT NULL DEFAULT 0,
  successful_deploys    INTEGER NOT NULL DEFAULT 0,
  failed_deploys        INTEGER NOT NULL DEFAULT 0,
  rollback_count        INTEGER NOT NULL DEFAULT 0,
  avg_health_score      NUMERIC(5,2) DEFAULT 0,
  surfaces_active       TEXT[] DEFAULT '{}',
  alert_count           INTEGER NOT NULL DEFAULT 0,
  critical_alert_count  INTEGER NOT NULL DEFAULT 0,
  drift_detected        BOOLEAN DEFAULT false,
  -- DORA reference
  dora_snapshot_id      UUID REFERENCES public.dora_metrics_snapshots(id) ON DELETE SET NULL,
  overall_dora_class    TEXT DEFAULT 'low',
  -- Generation metadata
  generated_by          TEXT NOT NULL DEFAULT 'system',
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at          TIMESTAMPTZ,
  scar_meta             JSONB DEFAULT '{}'::JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.deployment_reports IS 'BI-06: Generated deployment performance reports with period summary';
COMMENT ON COLUMN public.deployment_reports.scar_meta IS 'S-12: Reserved for future report format extensions (PDF export, email digest)';

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_dora_snapshots_period_type ON public.dora_metrics_snapshots(period_type);
CREATE INDEX IF NOT EXISTS idx_dora_snapshots_period_start ON public.dora_metrics_snapshots(period_start DESC);
CREATE INDEX IF NOT EXISTS idx_dora_snapshots_overall_class ON public.dora_metrics_snapshots(overall_class);
CREATE INDEX IF NOT EXISTS idx_dora_snapshots_generated_at ON public.dora_metrics_snapshots(generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_deploy_reports_type ON public.deployment_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_deploy_reports_period_start ON public.deployment_reports(period_start DESC);
CREATE INDEX IF NOT EXISTS idx_deploy_reports_status ON public.deployment_reports(status);
CREATE INDEX IF NOT EXISTS idx_deploy_reports_created_at ON public.deployment_reports(created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.dora_metrics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployment_reports ENABLE ROW LEVEL SECURITY;

-- Admin read
CREATE POLICY "dora_snapshots_admin_read" ON public.dora_metrics_snapshots
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "deploy_reports_admin_read" ON public.deployment_reports
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Service write (for EF + pg_cron)
CREATE POLICY "dora_snapshots_service_write" ON public.dora_metrics_snapshots
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "deploy_reports_service_write" ON public.deployment_reports
  FOR ALL USING (auth.role() = 'service_role');

-- ── View: v_dora_metrics_current ────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_dora_metrics_current AS
WITH latest_per_type AS (
  SELECT DISTINCT ON (period_type)
    id,
    period_type,
    period_start,
    period_end,
    deploy_frequency,
    deploy_frequency_class,
    total_deploys,
    successful_deploys,
    lead_time_minutes,
    lead_time_class,
    mttr_minutes,
    mttr_class,
    total_incidents,
    total_rollbacks,
    change_failure_rate,
    change_failure_class,
    overall_class,
    health_score_avg,
    surfaces_deployed,
    generated_at
  FROM public.dora_metrics_snapshots
  ORDER BY period_type, period_start DESC
),
previous_per_type AS (
  SELECT DISTINCT ON (period_type)
    period_type AS prev_period_type,
    deploy_frequency AS prev_deploy_frequency,
    lead_time_minutes AS prev_lead_time,
    mttr_minutes AS prev_mttr,
    change_failure_rate AS prev_change_failure_rate,
    overall_class AS prev_overall_class
  FROM public.dora_metrics_snapshots s
  WHERE EXISTS (
    SELECT 1 FROM latest_per_type l
    WHERE l.period_type = s.period_type AND l.period_start > s.period_start
  )
  ORDER BY period_type, period_start DESC
)
SELECT
  l.*,
  p.prev_deploy_frequency,
  p.prev_lead_time,
  p.prev_mttr,
  p.prev_change_failure_rate,
  p.prev_overall_class,
  CASE WHEN p.prev_deploy_frequency IS NOT NULL AND p.prev_deploy_frequency > 0
    THEN ROUND(((l.deploy_frequency - p.prev_deploy_frequency) / p.prev_deploy_frequency * 100)::NUMERIC, 1)
    ELSE NULL
  END AS frequency_change_pct,
  CASE WHEN p.prev_lead_time IS NOT NULL AND p.prev_lead_time > 0
    THEN ROUND(((l.lead_time_minutes - p.prev_lead_time) / p.prev_lead_time * 100)::NUMERIC, 1)
    ELSE NULL
  END AS lead_time_change_pct,
  CASE WHEN p.prev_mttr IS NOT NULL AND p.prev_mttr > 0
    THEN ROUND(((l.mttr_minutes - p.prev_mttr) / p.prev_mttr * 100)::NUMERIC, 1)
    ELSE NULL
  END AS mttr_change_pct,
  CASE WHEN p.prev_change_failure_rate IS NOT NULL AND p.prev_change_failure_rate > 0
    THEN ROUND(((l.change_failure_rate - p.prev_change_failure_rate) / p.prev_change_failure_rate * 100)::NUMERIC, 1)
    ELSE NULL
  END AS cfr_change_pct
FROM latest_per_type l
LEFT JOIN previous_per_type p ON p.prev_period_type = l.period_type
ORDER BY
  CASE l.period_type WHEN 'daily' THEN 1 WHEN 'weekly' THEN 2 WHEN 'monthly' THEN 3 END;

COMMENT ON VIEW public.v_dora_metrics_current IS 'BI-06: Latest DORA metrics per period type with previous-period comparison deltas';

-- ── View: v_deployment_performance_trends ────────────────────────────────────

CREATE OR REPLACE VIEW public.v_deployment_performance_trends AS
WITH periods AS (
  SELECT
    period_type,
    period_start,
    deploy_frequency,
    lead_time_minutes,
    mttr_minutes,
    change_failure_rate,
    overall_class,
    health_score_avg,
    total_deploys,
    total_rollbacks
  FROM public.dora_metrics_snapshots
  WHERE period_type = 'daily'
  ORDER BY period_start DESC
  LIMIT 90
)
SELECT
  period_start,
  deploy_frequency,
  lead_time_minutes,
  mttr_minutes,
  change_failure_rate,
  overall_class,
  health_score_avg,
  total_deploys,
  total_rollbacks,
  AVG(deploy_frequency) OVER (ORDER BY period_start ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS freq_7d_avg,
  AVG(deploy_frequency) OVER (ORDER BY period_start ROWS BETWEEN 29 PRECEDING AND CURRENT ROW) AS freq_30d_avg,
  AVG(lead_time_minutes) OVER (ORDER BY period_start ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS lead_7d_avg,
  AVG(lead_time_minutes) OVER (ORDER BY period_start ROWS BETWEEN 29 PRECEDING AND CURRENT ROW) AS lead_30d_avg,
  AVG(change_failure_rate) OVER (ORDER BY period_start ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS cfr_7d_avg,
  AVG(change_failure_rate) OVER (ORDER BY period_start ROWS BETWEEN 29 PRECEDING AND CURRENT ROW) AS cfr_30d_avg
FROM periods
ORDER BY period_start DESC;

COMMENT ON VIEW public.v_deployment_performance_trends IS 'BI-06: 90-day daily DORA trend data with 7d/30d moving averages';

-- ── Function: fn_calculate_dora_metrics ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_calculate_dora_metrics(
  p_period_type TEXT DEFAULT 'daily',
  p_period_start DATE DEFAULT CURRENT_DATE - INTERVAL '1 day',
  p_period_end DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_days NUMERIC;
  v_total_deploys INTEGER;
  v_successful INTEGER;
  v_failed INTEGER;
  v_frequency NUMERIC(10,4);
  v_freq_class TEXT;
  v_lead_time NUMERIC(10,2);
  v_lead_class TEXT;
  v_incidents INTEGER;
  v_rollbacks INTEGER;
  v_mttr NUMERIC(10,2);
  v_mttr_class TEXT;
  v_cfr NUMERIC(5,2);
  v_cfr_class TEXT;
  v_overall TEXT;
  v_health_avg NUMERIC(5,2);
  v_surfaces TEXT[];
  v_snapshot_id UUID;
  v_class_score INTEGER;
BEGIN
  v_days := GREATEST(1, p_period_end - p_period_start);

  -- Deployment counts from deploy_events
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'success'),
    COUNT(*) FILTER (WHERE status = 'failed')
  INTO v_total_deploys, v_successful, v_failed
  FROM public.deploy_events
  WHERE created_at >= p_period_start::TIMESTAMPTZ
    AND created_at < (p_period_end + INTERVAL '1 day')::TIMESTAMPTZ;

  -- Deploy frequency (deploys per day)
  v_frequency := ROUND((v_total_deploys::NUMERIC / v_days), 4);
  v_freq_class := CASE
    WHEN v_frequency >= 1.0 THEN 'elite'       -- on-demand / multiple per day
    WHEN v_frequency >= 0.14 THEN 'high'       -- ~daily to weekly
    WHEN v_frequency >= 0.033 THEN 'medium'    -- weekly to monthly
    ELSE 'low'                                  -- less than monthly
  END;

  -- Lead time: avg minutes from deploy start to completion (success only)
  SELECT COALESCE(
    AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 60.0),
    0
  )::NUMERIC(10,2)
  INTO v_lead_time
  FROM public.deploy_events
  WHERE created_at >= p_period_start::TIMESTAMPTZ
    AND created_at < (p_period_end + INTERVAL '1 day')::TIMESTAMPTZ
    AND status = 'success'
    AND completed_at IS NOT NULL;

  v_lead_class := CASE
    WHEN v_lead_time <= 60 THEN 'elite'        -- < 1 hour
    WHEN v_lead_time <= 1440 THEN 'high'       -- < 1 day
    WHEN v_lead_time <= 10080 THEN 'medium'    -- < 1 week
    ELSE 'low'                                  -- > 1 week
  END;

  -- Incidents: critical alerts + failed deploys
  SELECT COUNT(*)
  INTO v_incidents
  FROM public.deploy_alert_history
  WHERE triggered_at >= p_period_start::TIMESTAMPTZ
    AND triggered_at < (p_period_end + INTERVAL '1 day')::TIMESTAMPTZ
    AND severity = 'critical';

  v_incidents := v_incidents + v_failed;

  -- Rollbacks
  SELECT COUNT(*)
  INTO v_rollbacks
  FROM public.rollback_events
  WHERE started_at >= p_period_start::TIMESTAMPTZ
    AND started_at < (p_period_end + INTERVAL '1 day')::TIMESTAMPTZ;

  -- MTTR: avg time from incident to resolution (rollback completion or alert resolution)
  SELECT COALESCE(
    AVG(v_val),
    0
  )::NUMERIC(10,2)
  INTO v_mttr
  FROM (
    -- Rollback duration
    SELECT EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0 AS v_val
    FROM public.rollback_events
    WHERE started_at >= p_period_start::TIMESTAMPTZ
      AND started_at < (p_period_end + INTERVAL '1 day')::TIMESTAMPTZ
      AND status = 'completed'
      AND completed_at IS NOT NULL
    UNION ALL
    -- Alert resolution duration
    SELECT EXTRACT(EPOCH FROM (resolved_at - triggered_at)) / 60.0
    FROM public.deploy_alert_history
    WHERE triggered_at >= p_period_start::TIMESTAMPTZ
      AND triggered_at < (p_period_end + INTERVAL '1 day')::TIMESTAMPTZ
      AND status = 'resolved'
      AND resolved_at IS NOT NULL
  ) recovery_times;

  v_mttr_class := CASE
    WHEN v_mttr <= 60 THEN 'elite'             -- < 1 hour
    WHEN v_mttr <= 1440 THEN 'high'            -- < 1 day
    WHEN v_mttr <= 10080 THEN 'medium'         -- < 1 week
    ELSE 'low'                                  -- > 1 week
  END;

  -- Change Failure Rate: % of deploys that caused incidents
  v_cfr := CASE
    WHEN v_total_deploys > 0
      THEN ROUND(((v_failed + v_rollbacks)::NUMERIC / v_total_deploys * 100), 2)
    ELSE 0
  END;

  v_cfr_class := CASE
    WHEN v_cfr <= 5 THEN 'elite'
    WHEN v_cfr <= 10 THEN 'high'
    WHEN v_cfr <= 15 THEN 'medium'
    ELSE 'low'
  END;

  -- Overall classification: average of 4 metric scores
  v_class_score := (
    (CASE v_freq_class WHEN 'elite' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END) +
    (CASE v_lead_class WHEN 'elite' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END) +
    (CASE v_mttr_class WHEN 'elite' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END) +
    (CASE v_cfr_class WHEN 'elite' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END)
  );
  v_overall := CASE
    WHEN v_class_score >= 14 THEN 'elite'
    WHEN v_class_score >= 10 THEN 'high'
    WHEN v_class_score >= 6 THEN 'medium'
    ELSE 'low'
  END;

  -- Average health score from deploy_health_log
  SELECT COALESCE(AVG(health_score), 0)::NUMERIC(5,2)
  INTO v_health_avg
  FROM public.deploy_health_log
  WHERE checked_at >= p_period_start::TIMESTAMPTZ
    AND checked_at < (p_period_end + INTERVAL '1 day')::TIMESTAMPTZ;

  -- Unique surfaces deployed
  SELECT ARRAY_AGG(DISTINCT surface)
  INTO v_surfaces
  FROM public.deploy_events
  WHERE created_at >= p_period_start::TIMESTAMPTZ
    AND created_at < (p_period_end + INTERVAL '1 day')::TIMESTAMPTZ;

  v_surfaces := COALESCE(v_surfaces, '{}');

  -- Upsert snapshot
  INSERT INTO public.dora_metrics_snapshots (
    period_type, period_start, period_end,
    deploy_frequency, deploy_frequency_class, total_deploys, successful_deploys,
    lead_time_minutes, lead_time_class,
    mttr_minutes, mttr_class, total_incidents, total_rollbacks,
    change_failure_rate, change_failure_class,
    overall_class, health_score_avg, surfaces_deployed,
    generated_at
  ) VALUES (
    p_period_type, p_period_start, p_period_end,
    v_frequency, v_freq_class, v_total_deploys, v_successful,
    v_lead_time, v_lead_class,
    v_mttr, v_mttr_class, v_incidents, v_rollbacks,
    v_cfr, v_cfr_class,
    v_overall, v_health_avg, v_surfaces,
    now()
  )
  ON CONFLICT (period_type, period_start)
  DO UPDATE SET
    period_end = EXCLUDED.period_end,
    deploy_frequency = EXCLUDED.deploy_frequency,
    deploy_frequency_class = EXCLUDED.deploy_frequency_class,
    total_deploys = EXCLUDED.total_deploys,
    successful_deploys = EXCLUDED.successful_deploys,
    lead_time_minutes = EXCLUDED.lead_time_minutes,
    lead_time_class = EXCLUDED.lead_time_class,
    mttr_minutes = EXCLUDED.mttr_minutes,
    mttr_class = EXCLUDED.mttr_class,
    total_incidents = EXCLUDED.total_incidents,
    total_rollbacks = EXCLUDED.total_rollbacks,
    change_failure_rate = EXCLUDED.change_failure_rate,
    change_failure_class = EXCLUDED.change_failure_class,
    overall_class = EXCLUDED.overall_class,
    health_score_avg = EXCLUDED.health_score_avg,
    surfaces_deployed = EXCLUDED.surfaces_deployed,
    generated_at = now()
  RETURNING id INTO v_snapshot_id;

  -- H-02 event bus notification (non-fatal)
  BEGIN
    PERFORM public.fn_emit_event(
      'dora.metrics.calculated',
      jsonb_build_object(
        'snapshot_id', v_snapshot_id,
        'period_type', p_period_type,
        'period_start', p_period_start,
        'overall_class', v_overall,
        'deploy_frequency', v_frequency,
        'change_failure_rate', v_cfr
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'H-02 event bus notification failed (non-fatal): %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'snapshot_id', v_snapshot_id,
    'period_type', p_period_type,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'deploy_frequency', v_frequency,
    'deploy_frequency_class', v_freq_class,
    'total_deploys', v_total_deploys,
    'successful_deploys', v_successful,
    'lead_time_minutes', v_lead_time,
    'lead_time_class', v_lead_class,
    'mttr_minutes', v_mttr,
    'mttr_class', v_mttr_class,
    'total_incidents', v_incidents,
    'total_rollbacks', v_rollbacks,
    'change_failure_rate', v_cfr,
    'change_failure_class', v_cfr_class,
    'overall_class', v_overall,
    'health_score_avg', v_health_avg,
    'surfaces_deployed', to_jsonb(v_surfaces)
  );
END;
$$;

COMMENT ON FUNCTION public.fn_calculate_dora_metrics IS 'BI-06: Calculates DORA metrics from deploy_events, rollback_events, and deploy_alert_history. Upserts snapshot. Emits H-02 event.';

-- ── Function: fn_generate_deployment_report ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_generate_deployment_report(
  p_report_type TEXT DEFAULT 'weekly',
  p_period_start DATE DEFAULT NULL,
  p_period_end DATE DEFAULT NULL,
  p_generated_by TEXT DEFAULT 'system'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start DATE;
  v_end DATE;
  v_title TEXT;
  v_total INTEGER;
  v_success INTEGER;
  v_fail INTEGER;
  v_rollbacks INTEGER;
  v_health NUMERIC(5,2);
  v_surfaces TEXT[];
  v_alerts INTEGER;
  v_critical INTEGER;
  v_drift BOOLEAN;
  v_dora_id UUID;
  v_dora_class TEXT;
  v_report_id UUID;
  v_summary TEXT;
BEGIN
  -- Default period calculation
  IF p_period_start IS NULL THEN
    CASE p_report_type
      WHEN 'weekly' THEN
        v_start := CURRENT_DATE - INTERVAL '7 days';
        v_end := CURRENT_DATE;
      WHEN 'monthly' THEN
        v_start := date_trunc('month', CURRENT_DATE - INTERVAL '1 month')::DATE;
        v_end := (date_trunc('month', CURRENT_DATE) - INTERVAL '1 day')::DATE;
      ELSE -- on_demand
        v_start := CURRENT_DATE - INTERVAL '7 days';
        v_end := CURRENT_DATE;
    END CASE;
  ELSE
    v_start := p_period_start;
    v_end := COALESCE(p_period_end, CURRENT_DATE);
  END IF;

  v_title := initcap(p_report_type) || ' Deployment Report: ' || v_start::TEXT || ' to ' || v_end::TEXT;

  -- Deploy stats
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'success'),
    COUNT(*) FILTER (WHERE status = 'failed')
  INTO v_total, v_success, v_fail
  FROM public.deploy_events
  WHERE created_at >= v_start::TIMESTAMPTZ
    AND created_at < (v_end + INTERVAL '1 day')::TIMESTAMPTZ;

  -- Rollbacks
  SELECT COUNT(*) INTO v_rollbacks
  FROM public.rollback_events
  WHERE started_at >= v_start::TIMESTAMPTZ
    AND started_at < (v_end + INTERVAL '1 day')::TIMESTAMPTZ;

  -- Health score
  SELECT COALESCE(AVG(health_score), 0)::NUMERIC(5,2) INTO v_health
  FROM public.deploy_health_log
  WHERE checked_at >= v_start::TIMESTAMPTZ
    AND checked_at < (v_end + INTERVAL '1 day')::TIMESTAMPTZ;

  -- Surfaces
  SELECT COALESCE(ARRAY_AGG(DISTINCT surface), '{}') INTO v_surfaces
  FROM public.deploy_events
  WHERE created_at >= v_start::TIMESTAMPTZ
    AND created_at < (v_end + INTERVAL '1 day')::TIMESTAMPTZ;

  -- Alerts
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE severity = 'critical')
  INTO v_alerts, v_critical
  FROM public.deploy_alert_history
  WHERE triggered_at >= v_start::TIMESTAMPTZ
    AND triggered_at < (v_end + INTERVAL '1 day')::TIMESTAMPTZ;

  -- Drift check
  SELECT EXISTS (
    SELECT 1 FROM public.v_environment_drift WHERE has_drift = true
  ) INTO v_drift;

  -- DORA snapshot reference (latest for period type)
  SELECT id, overall_class
  INTO v_dora_id, v_dora_class
  FROM public.dora_metrics_snapshots
  WHERE period_type = CASE p_report_type WHEN 'on_demand' THEN 'weekly' ELSE p_report_type END
  ORDER BY period_start DESC
  LIMIT 1;

  -- Summary
  v_summary := v_total || ' deploys (' || v_success || ' success, ' || v_fail || ' failed). '
    || v_rollbacks || ' rollbacks. '
    || v_alerts || ' alerts (' || v_critical || ' critical). '
    || 'Health: ' || v_health || '/100. '
    || 'DORA: ' || COALESCE(v_dora_class, 'n/a') || '.';

  -- Insert report
  INSERT INTO public.deployment_reports (
    report_type, period_start, period_end, title, summary,
    total_deploys, successful_deploys, failed_deploys, rollback_count,
    avg_health_score, surfaces_active, alert_count, critical_alert_count,
    drift_detected, dora_snapshot_id, overall_dora_class,
    generated_by, status
  ) VALUES (
    p_report_type, v_start, v_end, v_title, v_summary,
    v_total, v_success, v_fail, v_rollbacks,
    v_health, v_surfaces, v_alerts, v_critical,
    v_drift, v_dora_id, COALESCE(v_dora_class, 'low'),
    p_generated_by, 'published'
  )
  RETURNING id INTO v_report_id;

  -- H-02 event bus (non-fatal)
  BEGIN
    PERFORM public.fn_emit_event(
      'deployment.report.generated',
      jsonb_build_object(
        'report_id', v_report_id,
        'report_type', p_report_type,
        'period', v_start || ' to ' || v_end,
        'overall_dora_class', COALESCE(v_dora_class, 'low')
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'H-02 event bus notification failed (non-fatal): %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'report_id', v_report_id,
    'title', v_title,
    'summary', v_summary,
    'total_deploys', v_total,
    'successful_deploys', v_success,
    'failed_deploys', v_fail,
    'rollback_count', v_rollbacks,
    'avg_health_score', v_health,
    'alert_count', v_alerts,
    'critical_alert_count', v_critical,
    'drift_detected', v_drift,
    'overall_dora_class', COALESCE(v_dora_class, 'low')
  );
END;
$$;

COMMENT ON FUNCTION public.fn_generate_deployment_report IS 'BI-06: Generates deployment performance report from all BI data. Emits H-02 event.';

-- ── pg_cron: Daily DORA calculation ─────────────────────────────────────────

SELECT cron.schedule(
  'bi06-daily-dora-metrics',
  '15 0 * * *',  -- 00:15 UTC daily (after BI-04 15min eval cycle)
  $$SELECT public.fn_calculate_dora_metrics('daily', CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE)$$
);

-- ── pg_cron: Weekly DORA calculation + report ───────────────────────────────

SELECT cron.schedule(
  'bi06-weekly-dora-report',
  '30 0 * * 1',  -- Monday 00:30 UTC
  $$
    SELECT public.fn_calculate_dora_metrics('weekly', CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE);
    SELECT public.fn_generate_deployment_report('weekly');
  $$
);

-- ── pg_cron: Monthly DORA calculation + report ──────────────────────────────

SELECT cron.schedule(
  'bi06-monthly-dora-report',
  '0 1 1 * *',  -- 1st of month, 01:00 UTC
  $$
    SELECT public.fn_calculate_dora_metrics('monthly', date_trunc('month', CURRENT_DATE - INTERVAL '1 month')::DATE, (date_trunc('month', CURRENT_DATE) - INTERVAL '1 day')::DATE);
    SELECT public.fn_generate_deployment_report('monthly');
  $$
);

-- ── pg_cron: Cleanup snapshots older than 365 days ──────────────────────────

SELECT cron.schedule(
  'bi06-cleanup-old-snapshots',
  '0 3 * * 0',  -- Sunday 03:00 UTC weekly
  $$DELETE FROM public.dora_metrics_snapshots WHERE created_at < now() - INTERVAL '365 days'$$
);
