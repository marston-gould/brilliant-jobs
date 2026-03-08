-- ============================================================================
-- v6.37 — BI-04: Deployment Alerting & Health Scoring
-- ============================================================================
-- Ties BI-01/02/03 instrumentation together with:
--   - Configurable alert rules (deploy failure, drift, bundle regression, CI)
--   - Alert history with acknowledgment workflow
--   - Composite deployment health score (0-100)
--   - H-02 event bus integration for critical alerts
--   - pg_cron evaluation every 15 minutes
-- ============================================================================

-- ── deploy_alert_rules ──────────────────────────────────────────────────────
-- Configurable thresholds that fire alerts when violated
CREATE TABLE IF NOT EXISTS deploy_alert_rules (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_name    TEXT NOT NULL UNIQUE,
  rule_type    TEXT NOT NULL CHECK (rule_type IN (
    'deploy_failure_rate',
    'bundle_size_regression',
    'environment_drift',
    'ci_failure_streak',
    'deploy_duration_spike',
    'deploy_frequency_drop',
    'health_score_threshold',
    'custom'
  )),
  description  TEXT,
  threshold    JSONB NOT NULL DEFAULT '{}',
  -- e.g. { "max_failure_rate_pct": 20, "window_hours": 24 }
  -- e.g. { "max_increase_pct": 10 }
  -- e.g. { "max_drift_count": 0 }
  -- e.g. { "max_consecutive_failures": 3 }
  severity     TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  is_enabled   BOOLEAN NOT NULL DEFAULT true,
  cooldown_minutes INTEGER NOT NULL DEFAULT 60,
  last_fired_at TIMESTAMPTZ,
  surfaces     TEXT[] DEFAULT '{}',  -- empty = all surfaces
  metadata     JSONB DEFAULT '{}',   -- S-12 scar: extensible config
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- ── deploy_alert_history ────────────────────────────────────────────────────
-- Fired alerts with acknowledgment workflow
CREATE TABLE IF NOT EXISTS deploy_alert_history (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id       UUID NOT NULL REFERENCES deploy_alert_rules(id) ON DELETE CASCADE,
  rule_name     TEXT NOT NULL,
  rule_type     TEXT NOT NULL,
  severity      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'expired')),
  message       TEXT NOT NULL,
  details       JSONB DEFAULT '{}',
  -- snapshot of the data that triggered the alert
  fired_at      TIMESTAMPTZ DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  resolved_at   TIMESTAMPTZ,
  resolved_by   TEXT,
  resolve_notes TEXT,
  metadata      JSONB DEFAULT '{}'
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_alert_rules_type ON deploy_alert_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON deploy_alert_rules(is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_alert_history_status ON deploy_alert_history(status);
CREATE INDEX IF NOT EXISTS idx_alert_history_fired ON deploy_alert_history(fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_rule ON deploy_alert_history(rule_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_severity ON deploy_alert_history(severity, status);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE deploy_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE deploy_alert_history ENABLE ROW LEVEL SECURITY;

-- Admin read
CREATE POLICY "admin_read_alert_rules" ON deploy_alert_rules
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_read_alert_history" ON deploy_alert_history
  FOR SELECT USING (auth.role() = 'authenticated');

-- Service write
CREATE POLICY "service_manage_alert_rules" ON deploy_alert_rules
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_manage_alert_history" ON deploy_alert_history
  FOR ALL USING (auth.role() = 'service_role');

-- ── v_active_alerts ─────────────────────────────────────────────────────────
-- Active + acknowledged alerts with rule context
CREATE OR REPLACE VIEW v_active_alerts AS
SELECT
  h.id,
  h.rule_id,
  h.rule_name,
  h.rule_type,
  h.severity,
  h.status,
  h.message,
  h.details,
  h.fired_at,
  h.acknowledged_at,
  h.acknowledged_by,
  r.threshold,
  r.cooldown_minutes,
  r.surfaces,
  EXTRACT(EPOCH FROM (now() - h.fired_at)) / 60 AS minutes_since_fired
FROM deploy_alert_history h
JOIN deploy_alert_rules r ON r.id = h.rule_id
WHERE h.status IN ('active', 'acknowledged')
ORDER BY
  CASE h.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
  h.fired_at DESC;

-- ── fn_deployment_health_score ──────────────────────────────────────────────
-- Composite health score (0-100) combining all BI metrics
CREATE OR REPLACE FUNCTION fn_deployment_health_score()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deploy_score NUMERIC := 100;
  v_drift_score NUMERIC := 100;
  v_bundle_score NUMERIC := 100;
  v_ci_score NUMERIC := 100;
  v_duration_score NUMERIC := 100;
  v_composite NUMERIC;
  v_deploy_stats JSONB;
  v_drift_count INTEGER;
  v_bundle_regressions INTEGER;
  v_ci_failures INTEGER;
  v_ci_total INTEGER;
  v_avg_duration NUMERIC;
  v_active_critical INTEGER;
  v_active_warning INTEGER;
BEGIN
  -- ── Deploy success rate (last 7d) ───────────────────────────────────
  SELECT
    COALESCE(
      ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'success') / NULLIF(COUNT(*), 0), 1),
      100
    ),
    jsonb_build_object(
      'total', COUNT(*),
      'success', COUNT(*) FILTER (WHERE status = 'success'),
      'failed', COUNT(*) FILTER (WHERE status = 'failed'),
      'success_rate_pct', COALESCE(
        ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'success') / NULLIF(COUNT(*), 0), 1),
        100
      )
    )
  INTO v_deploy_score, v_deploy_stats
  FROM deploy_events
  WHERE started_at > now() - interval '7 days';

  -- ── Environment drift ───────────────────────────────────────────────
  SELECT COUNT(*)
  INTO v_drift_count
  FROM v_environment_drift
  WHERE has_drift = true;

  IF v_drift_count > 0 THEN
    v_drift_score := GREATEST(0, 100 - (v_drift_count * 25));
  END IF;

  -- ── Bundle size regressions (last 7d, > 5% increase) ───────────────
  SELECT COUNT(*)
  INTO v_bundle_regressions
  FROM v_bundle_size_trends
  WHERE delta_pct > 5
    AND measured_at > now() - interval '7 days';

  IF v_bundle_regressions > 0 THEN
    v_bundle_score := GREATEST(0, 100 - (v_bundle_regressions * 15));
  END IF;

  -- ── CI health (last 7d) ────────────────────────────────────────────
  SELECT
    COUNT(*) FILTER (WHERE status = 'failure'),
    COUNT(*)
  INTO v_ci_failures, v_ci_total
  FROM ci_workflow_runs
  WHERE started_at > now() - interval '7 days';

  IF v_ci_total > 0 THEN
    v_ci_score := ROUND(100.0 * (v_ci_total - v_ci_failures) / v_ci_total, 1);
  END IF;

  -- ── Deploy duration (avg last 7d vs 30d baseline) ──────────────────
  SELECT COALESCE(AVG(duration_seconds), 0)
  INTO v_avg_duration
  FROM deploy_events
  WHERE started_at > now() - interval '7 days'
    AND status = 'success'
    AND duration_seconds IS NOT NULL;

  DECLARE
    v_baseline_duration NUMERIC;
  BEGIN
    SELECT COALESCE(AVG(duration_seconds), v_avg_duration)
    INTO v_baseline_duration
    FROM deploy_events
    WHERE started_at > now() - interval '30 days'
      AND started_at <= now() - interval '7 days'
      AND status = 'success'
      AND duration_seconds IS NOT NULL;

    IF v_baseline_duration > 0 AND v_avg_duration > v_baseline_duration * 1.5 THEN
      v_duration_score := GREATEST(0, 100 - ROUND((v_avg_duration / v_baseline_duration - 1) * 100));
    END IF;
  END;

  -- ── Active alerts ──────────────────────────────────────────────────
  SELECT
    COUNT(*) FILTER (WHERE severity = 'critical' AND status = 'active'),
    COUNT(*) FILTER (WHERE severity = 'warning' AND status = 'active')
  INTO v_active_critical, v_active_warning
  FROM deploy_alert_history
  WHERE status IN ('active', 'acknowledged');

  -- ── Composite (weighted average) ───────────────────────────────────
  -- Deploy success: 30%, CI health: 25%, Drift: 20%, Bundle: 15%, Duration: 10%
  v_composite := ROUND(
    (v_deploy_score * 0.30) +
    (v_ci_score * 0.25) +
    (v_drift_score * 0.20) +
    (v_bundle_score * 0.15) +
    (v_duration_score * 0.10),
    1
  );

  -- Penalty for active critical alerts
  IF v_active_critical > 0 THEN
    v_composite := GREATEST(0, v_composite - (v_active_critical * 10));
  END IF;

  RETURN jsonb_build_object(
    'composite_score', v_composite,
    'grade', CASE
      WHEN v_composite >= 90 THEN 'A'
      WHEN v_composite >= 75 THEN 'B'
      WHEN v_composite >= 60 THEN 'C'
      WHEN v_composite >= 40 THEN 'D'
      ELSE 'F'
    END,
    'dimensions', jsonb_build_object(
      'deploy_success', jsonb_build_object('score', v_deploy_score, 'weight', 0.30, 'stats', v_deploy_stats),
      'ci_health', jsonb_build_object('score', v_ci_score, 'weight', 0.25, 'failures', v_ci_failures, 'total', v_ci_total),
      'environment_drift', jsonb_build_object('score', v_drift_score, 'weight', 0.20, 'drift_count', v_drift_count),
      'bundle_health', jsonb_build_object('score', v_bundle_score, 'weight', 0.15, 'regressions', v_bundle_regressions),
      'deploy_duration', jsonb_build_object('score', v_duration_score, 'weight', 0.10, 'avg_seconds', v_avg_duration)
    ),
    'alerts', jsonb_build_object(
      'active_critical', v_active_critical,
      'active_warning', v_active_warning
    ),
    'evaluated_at', now()
  );
END;
$$;

-- ── fn_evaluate_deploy_alerts ───────────────────────────────────────────────
-- Checks all enabled rules against current state, fires alerts
CREATE OR REPLACE FUNCTION fn_evaluate_deploy_alerts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rule RECORD;
  v_fired INTEGER := 0;
  v_skipped INTEGER := 0;
  v_checked INTEGER := 0;
  v_alert_id UUID;
  v_message TEXT;
  v_details JSONB;
  v_should_fire BOOLEAN;
  v_val NUMERIC;
BEGIN
  FOR v_rule IN
    SELECT * FROM deploy_alert_rules
    WHERE is_enabled = true
    ORDER BY
      CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END
  LOOP
    v_checked := v_checked + 1;
    v_should_fire := false;
    v_message := '';
    v_details := '{}';

    -- Cooldown check
    IF v_rule.last_fired_at IS NOT NULL
       AND v_rule.last_fired_at > now() - (v_rule.cooldown_minutes || ' minutes')::interval THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- ── Rule type evaluation ────────────────────────────────────────
    CASE v_rule.rule_type
      WHEN 'deploy_failure_rate' THEN
        SELECT
          COALESCE(
            ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'failed') / NULLIF(COUNT(*), 0), 1),
            0
          )
        INTO v_val
        FROM deploy_events
        WHERE started_at > now() - ((v_rule.threshold->>'window_hours')::int || ' hours')::interval;

        IF v_val > (v_rule.threshold->>'max_failure_rate_pct')::numeric THEN
          v_should_fire := true;
          v_message := format('Deploy failure rate %.1f%% exceeds threshold %.1f%%',
            v_val, (v_rule.threshold->>'max_failure_rate_pct')::numeric);
          v_details := jsonb_build_object('current_rate', v_val,
            'threshold', (v_rule.threshold->>'max_failure_rate_pct')::numeric);
        END IF;

      WHEN 'environment_drift' THEN
        SELECT COUNT(*)
        INTO v_val
        FROM v_environment_drift
        WHERE has_drift = true;

        IF v_val > COALESCE((v_rule.threshold->>'max_drift_count')::int, 0) THEN
          v_should_fire := true;
          v_message := format('%s surfaces have environment drift', v_val::int);
          v_details := jsonb_build_object('drift_count', v_val::int);
        END IF;

      WHEN 'bundle_size_regression' THEN
        SELECT COUNT(*)
        INTO v_val
        FROM v_bundle_size_trends
        WHERE delta_pct > COALESCE((v_rule.threshold->>'max_increase_pct')::numeric, 10)
          AND measured_at > now() - interval '24 hours';

        IF v_val > 0 THEN
          v_should_fire := true;
          v_message := format('%s bundle(s) exceeded size threshold in last 24h', v_val::int);
          v_details := jsonb_build_object('regression_count', v_val::int);
        END IF;

      WHEN 'ci_failure_streak' THEN
        SELECT COUNT(*)
        INTO v_val
        FROM (
          SELECT status FROM ci_workflow_runs
          ORDER BY started_at DESC
          LIMIT COALESCE((v_rule.threshold->>'max_consecutive_failures')::int, 3)
        ) recent
        WHERE status = 'failure';

        IF v_val >= COALESCE((v_rule.threshold->>'max_consecutive_failures')::int, 3) THEN
          v_should_fire := true;
          v_message := format('%s consecutive CI failures', v_val::int);
          v_details := jsonb_build_object('consecutive_failures', v_val::int);
        END IF;

      WHEN 'deploy_duration_spike' THEN
        DECLARE
          v_recent NUMERIC;
          v_baseline NUMERIC;
        BEGIN
          SELECT COALESCE(AVG(duration_seconds), 0)
          INTO v_recent
          FROM deploy_events
          WHERE started_at > now() - interval '24 hours'
            AND status = 'success' AND duration_seconds IS NOT NULL;

          SELECT COALESCE(AVG(duration_seconds), v_recent)
          INTO v_baseline
          FROM deploy_events
          WHERE started_at > now() - interval '30 days'
            AND started_at <= now() - interval '24 hours'
            AND status = 'success' AND duration_seconds IS NOT NULL;

          IF v_baseline > 0 THEN
            v_val := ROUND((v_recent / v_baseline - 1) * 100, 1);
            IF v_val > COALESCE((v_rule.threshold->>'max_increase_pct')::numeric, 50) THEN
              v_should_fire := true;
              v_message := format('Deploy duration spike: %.1f%% above baseline', v_val);
              v_details := jsonb_build_object('recent_avg', v_recent, 'baseline_avg', v_baseline, 'increase_pct', v_val);
            END IF;
          END IF;
        END;

      WHEN 'health_score_threshold' THEN
        DECLARE
          v_health JSONB;
        BEGIN
          v_health := fn_deployment_health_score();
          v_val := (v_health->>'composite_score')::numeric;

          IF v_val < COALESCE((v_rule.threshold->>'min_score')::numeric, 50) THEN
            v_should_fire := true;
            v_message := format('Deployment health score %.1f below threshold %.1f',
              v_val, (v_rule.threshold->>'min_score')::numeric);
            v_details := v_health;
          END IF;
        END;

      ELSE
        -- custom rules: skip automatic evaluation
        CONTINUE;
    END CASE;

    -- ── Fire alert ──────────────────────────────────────────────────
    IF v_should_fire THEN
      INSERT INTO deploy_alert_history (
        rule_id, rule_name, rule_type, severity, message, details
      ) VALUES (
        v_rule.id, v_rule.rule_name, v_rule.rule_type,
        v_rule.severity, v_message, v_details
      ) RETURNING id INTO v_alert_id;

      -- Update last_fired_at
      UPDATE deploy_alert_rules SET last_fired_at = now(), updated_at = now()
      WHERE id = v_rule.id;

      -- H-02: Publish to event bus for critical alerts
      IF v_rule.severity = 'critical' THEN
        PERFORM fn_publish_event(
          'deploy.alert.critical',
          jsonb_build_object(
            'alert_id', v_alert_id,
            'rule_name', v_rule.rule_name,
            'rule_type', v_rule.rule_type,
            'message', v_message,
            'details', v_details
          ),
          'system'
        );
      END IF;

      v_fired := v_fired + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'checked', v_checked,
    'fired', v_fired,
    'skipped_cooldown', v_skipped,
    'evaluated_at', now()
  );
END;
$$;

-- ── Seed default alert rules ────────────────────────────────────────────────
INSERT INTO deploy_alert_rules (rule_name, rule_type, description, threshold, severity, cooldown_minutes) VALUES
  ('Deploy Failure Rate > 20%', 'deploy_failure_rate',
   'Fires when deploy failure rate exceeds 20% in a 24-hour window',
   '{"max_failure_rate_pct": 20, "window_hours": 24}', 'critical', 120),
  ('Environment Drift Detected', 'environment_drift',
   'Fires when any surface has prod/staging version mismatch',
   '{"max_drift_count": 0}', 'warning', 60),
  ('Bundle Size Regression > 10%', 'bundle_size_regression',
   'Fires when any bundle increases by more than 10% in 24 hours',
   '{"max_increase_pct": 10}', 'warning', 120),
  ('CI Failure Streak ≥ 3', 'ci_failure_streak',
   'Fires when 3 or more consecutive CI runs fail',
   '{"max_consecutive_failures": 3}', 'critical', 60),
  ('Deploy Duration Spike > 50%', 'deploy_duration_spike',
   'Fires when recent deploy duration exceeds 30-day baseline by 50%',
   '{"max_increase_pct": 50}', 'warning', 240),
  ('Health Score Below 50', 'health_score_threshold',
   'Fires when composite deployment health score drops below 50',
   '{"min_score": 50}', 'critical', 60)
ON CONFLICT (rule_name) DO NOTHING;

-- ── pg_cron: Evaluate alerts every 15 minutes ──────────────────────────────
SELECT cron.schedule(
  'evaluate-deploy-alerts',
  '*/15 * * * *',
  $$SELECT fn_evaluate_deploy_alerts()$$
);

-- ── pg_cron: Expire old resolved alerts (> 90 days) ────────────────────────
SELECT cron.schedule(
  'cleanup-deploy-alerts',
  '0 5 * * *',
  $$UPDATE deploy_alert_history
    SET status = 'expired'
    WHERE status = 'resolved'
      AND resolved_at < now() - interval '90 days'$$
);

-- ── Log migration ───────────────────────────────────────────────────────────
INSERT INTO agent_action_log (agent_name, action_type, action_data, executed)
VALUES ('system', 'migration', '{"migration": "v6.37-deploy-alerting", "session": "BI-04", "tables": ["deploy_alert_rules", "deploy_alert_history"], "functions": ["fn_deployment_health_score", "fn_evaluate_deploy_alerts"], "views": ["v_active_alerts"], "cron": ["evaluate-deploy-alerts", "cleanup-deploy-alerts"], "seed_rules": 6}'::jsonb, false);
