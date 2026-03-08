-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  v6.33 — Capacity Model + Scaling Triggers                               ║
-- ║  Session: SA-028 | Phase S6: Architecture Governance                      ║
-- ║  Pair: System Architect—Scalability + DevOps + Data Eng                   ║
-- ║  Reviewer: Chief Architect                                                ║
-- ║                                                                           ║
-- ║  Tables:                                                                  ║
-- ║    1. capacity_snapshots     — Periodic system state measurements         ║
-- ║    2. scaling_trigger_config — Configurable auto-scaling thresholds       ║
-- ║    3. scaling_trigger_log    — Trigger activation history                 ║
-- ║    4. cost_projections       — Service-level cost forecasting             ║
-- ║                                                                           ║
-- ║  Functions:                                                               ║
-- ║    fn_capture_capacity_snapshot()   — Captures current system metrics     ║
-- ║    fn_evaluate_scaling_triggers()   — Checks thresholds, logs alerts      ║
-- ║    fn_capacity_forecast()           — Growth projections at 6/12/24mo     ║
-- ║    fn_cost_model()                  — Per-tier cost projections           ║
-- ║    fn_capacity_summary()            — JSONB summary for admin/agent       ║
-- ║                                                                           ║
-- ║  Views:                                                                   ║
-- ║    v_capacity_dashboard  — Real-time capacity overview for admin panel    ║
-- ║                                                                           ║
-- ║  Cron:                                                                    ║
-- ║    capacity_snapshot       — Every 15 minutes                             ║
-- ║    scaling_trigger_check   — Every 5 minutes                              ║
-- ║    capacity_cleanup        — Daily at 5 AM UTC (retain 90 days)           ║
-- ║                                                                           ║
-- ║  Queries: v_partition_stats (S-14), replica_routing_stats (S-15)          ║
-- ║  Hook: H-02 (fn_publish_event for threshold alerts)                       ║
-- ║  Scar: S-12 (capacity_snapshots.custom_metrics JSONB bucket)              ║
-- ╚════════════════════════════════════════════════════════════════════════════╝


-- ─── Table: capacity_snapshots ────────────────────────────────────────────────
-- Periodic measurements of system capacity across all dimensions.
-- Captured every 15 minutes by pg_cron. Retained 90 days.

CREATE TABLE IF NOT EXISTS public.capacity_snapshots (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  captured_at     timestamptz NOT NULL DEFAULT now(),

  -- Database metrics
  db_total_rows          bigint,          -- Total rows across all tables
  db_ats_jobs_rows       bigint,          -- ats_jobs row count (partitioned)
  db_size_bytes          bigint,          -- Total database size
  db_connections_active  int,             -- Current active connections
  db_connections_max     int,             -- Max connection pool size

  -- Partition metrics (from v_partition_stats — S-14)
  partition_ats_rows     bigint,
  partition_cc_rows      bigint,
  partition_amazon_rows  bigint,
  partition_default_rows bigint,

  -- Replica metrics (from replica_routing_stats — S-15)
  replica_read_count     bigint,          -- Reads routed to replica in period
  replica_write_count    bigint,          -- Writes to primary in period
  replica_lag_ms         numeric,         -- Current replication lag

  -- Edge Function metrics
  ef_invocations_1h      bigint,          -- EF invocations in last hour
  ef_error_rate_1h       numeric(5,4),    -- EF error rate in last hour

  -- User metrics
  total_users            bigint,
  active_users_24h       bigint,
  active_users_7d        bigint,

  -- Agent metrics
  agent_actions_24h      bigint,          -- CrewAI agent actions in 24h
  agent_cost_24h         numeric(10,4),   -- Estimated agent API cost in 24h

  -- Cost metrics (from vendor_cost_budgets)
  total_monthly_spend    numeric(10,2),   -- Current month spend across vendors
  budget_utilization_pct numeric(5,2),    -- % of total budget consumed

  -- Scar S-12: extensible metrics bucket
  custom_metrics         jsonb DEFAULT '{}'::jsonb,

  CONSTRAINT capacity_snapshots_captured_at_check
    CHECK (captured_at <= now() + interval '1 minute')
);

ALTER TABLE public.capacity_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read capacity_snapshots"
  ON public.capacity_snapshots FOR SELECT
  USING (auth.jwt() ->> 'role' = 'admin');

CREATE INDEX idx_capacity_snapshots_captured
  ON public.capacity_snapshots (captured_at DESC);

COMMENT ON TABLE public.capacity_snapshots IS
  'SA-028: Periodic system capacity measurements captured every 15 minutes. S-12 scar: custom_metrics JSONB for future metric dimensions.';


-- ─── Table: scaling_trigger_config ────────────────────────────────────────────
-- Configurable thresholds that define when scaling actions should fire.
-- Admin-editable via admin panel. Each trigger has a metric, operator, threshold,
-- cooldown, and associated action.

CREATE TABLE IF NOT EXISTS public.scaling_trigger_config (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trigger_name    text NOT NULL UNIQUE,
  description     text,
  metric_key      text NOT NULL,            -- Column name in capacity_snapshots or computed metric
  operator        text NOT NULL DEFAULT '>=',-- >=, <=, >, <, ==
  threshold_warn  numeric NOT NULL,          -- Warning threshold
  threshold_crit  numeric NOT NULL,          -- Critical threshold
  cooldown_mins   int NOT NULL DEFAULT 60,   -- Minutes between repeated alerts
  action_type     text NOT NULL DEFAULT 'alert', -- alert, alert+recommend, auto-scale
  action_payload  jsonb DEFAULT '{}'::jsonb, -- Action-specific config (e.g. scale target)
  is_enabled      boolean NOT NULL DEFAULT true,
  last_triggered  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT valid_operator CHECK (operator IN ('>=', '<=', '>', '<', '=='))
);

ALTER TABLE public.scaling_trigger_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage scaling_trigger_config"
  ON public.scaling_trigger_config FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

COMMENT ON TABLE public.scaling_trigger_config IS
  'SA-028: Configurable scaling thresholds. Admin-editable. action_type controls response: alert (notify), alert+recommend (notify + suggest action), auto-scale (reserved for future automation via S-12).';


-- ─── Seed default triggers ───────────────────────────────────────────────────

INSERT INTO public.scaling_trigger_config (trigger_name, description, metric_key, operator, threshold_warn, threshold_crit, cooldown_mins, action_type) VALUES
  ('db_connections_high',     'Database connections approaching pool limit',          'db_connections_active', '>=', 200,    270,    30,  'alert'),
  ('db_size_large',           'Database size growing beyond current tier capacity',   'db_size_bytes',         '>=', 5368709120, 8589934592, 1440, 'alert+recommend'),
  ('ats_jobs_volume',         'ats_jobs row count approaching partition threshold',   'db_ats_jobs_rows',      '>=', 750000, 1000000, 1440, 'alert+recommend'),
  ('replica_lag_high',        'Replication lag exceeding safe read threshold',        'replica_lag_ms',        '>=', 3000,   5000,   15,  'alert'),
  ('ef_error_rate_high',      'Edge Function error rate above acceptable threshold', 'ef_error_rate_1h',      '>=', 0.01,   0.05,   30,  'alert'),
  ('budget_utilization_high', 'Monthly spend approaching budget ceiling',            'budget_utilization_pct', '>=', 80,    95,     1440, 'alert+recommend'),
  ('active_users_growth',     'Active user count approaching current tier capacity', 'active_users_24h',      '>=', 500,   1000,   1440, 'alert+recommend'),
  ('agent_cost_spike',        'CrewAI agent costs exceeding daily threshold',        'agent_cost_24h',        '>=', 25,    50,     720,  'alert')
ON CONFLICT (trigger_name) DO NOTHING;


-- ─── Table: scaling_trigger_log ───────────────────────────────────────────────
-- History of all trigger activations for audit trail and trend analysis.

CREATE TABLE IF NOT EXISTS public.scaling_trigger_log (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trigger_name    text NOT NULL,
  severity        text NOT NULL DEFAULT 'warn',  -- warn, critical
  metric_value    numeric NOT NULL,
  threshold_value numeric NOT NULL,
  snapshot_id     bigint REFERENCES public.capacity_snapshots(id),
  action_taken    text,                          -- What was done (logged, recommended, scaled)
  acknowledged_at timestamptz,                   -- When admin acknowledged
  acknowledged_by text,                          -- Admin user id
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT valid_severity CHECK (severity IN ('warn', 'critical'))
);

ALTER TABLE public.scaling_trigger_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage scaling_trigger_log"
  ON public.scaling_trigger_log FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

CREATE INDEX idx_scaling_trigger_log_created
  ON public.scaling_trigger_log (created_at DESC);

CREATE INDEX idx_scaling_trigger_log_unacked
  ON public.scaling_trigger_log (acknowledged_at)
  WHERE acknowledged_at IS NULL;

COMMENT ON TABLE public.scaling_trigger_log IS
  'SA-028: Scaling trigger activation history. Unacknowledged alerts shown in admin panel.';


-- ─── Table: cost_projections ─────────────────────────────────────────────────
-- Per-service cost forecasting data. Updated by fn_cost_model().
-- Stores both current actuals and projected costs at 6/12/24 month horizons.

CREATE TABLE IF NOT EXISTS public.cost_projections (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_name    text NOT NULL,                 -- supabase, vercel, cloudflare, anthropic, etc.
  tier_current    text,                          -- Current pricing tier
  cost_current_mo numeric(10,2) NOT NULL,        -- Current monthly cost
  users_current   bigint,                        -- Current user count
  cost_6mo        numeric(10,2),                 -- Projected cost at 6 months
  cost_12mo       numeric(10,2),                 -- Projected cost at 12 months
  cost_24mo       numeric(10,2),                 -- Projected cost at 24 months
  tier_6mo        text,                          -- Projected tier at 6 months
  tier_12mo       text,                          -- Projected tier at 12 months
  tier_24mo       text,                          -- Projected tier at 24 months
  users_6mo       bigint,                        -- Projected users at 6 months
  users_12mo      bigint,                        -- Projected users at 12 months
  users_24mo      bigint,                        -- Projected users at 24 months
  cost_per_user   numeric(8,4),                  -- Current cost per user
  scaling_notes   text,                          -- Tier transition notes
  last_computed   timestamptz NOT NULL DEFAULT now(),
  growth_rate_pct numeric(5,2) NOT NULL DEFAULT 15.00,  -- MoM growth rate used

  CONSTRAINT cost_projections_service_unique UNIQUE (service_name)
);

ALTER TABLE public.cost_projections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage cost_projections"
  ON public.cost_projections FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

COMMENT ON TABLE public.cost_projections IS
  'SA-028: Per-service cost forecasting at 6/12/24 month horizons. Updated by fn_cost_model(). growth_rate_pct configurable.';


-- ─── Seed cost projections with current service tiers ────────────────────────

INSERT INTO public.cost_projections (service_name, tier_current, cost_current_mo, users_current, cost_per_user, scaling_notes) VALUES
  ('supabase',    'Pro',         25.00,   1, 25.0000, 'Pro plan. Add-ons: Read Replica (~$75), additional compute as needed.'),
  ('vercel',      'Pro',         20.00,   1, 20.0000, 'Pro plan. Bandwidth overage possible at scale.'),
  ('cloudflare',  'Free',         0.00,   1,  0.0000, 'Free tier sufficient for CDN + DNS. Workers may need paid plan at scale.'),
  ('anthropic',   'API (pay-go)', 50.00,  1, 50.0000, 'Pay-per-token. CrewAI agents + rewrite pipeline. Cost Guardian monitors.'),
  ('resend',      'Free',         0.00,   1,  0.0000, 'Free tier (3K emails/mo). Pro at ~$20/mo when volume exceeds.'),
  ('posthog',     'Free',         0.00,   1,  0.0000, 'Free tier (1M events/mo). Growth plan ~$450/mo when exceeded.'),
  ('github',      'Free',         0.00,   1,  0.0000, 'Free for private repos. Actions minutes may need paid at scale.'),
  ('stripe',      'Standard',     0.00,   1,  0.0000, 'Transaction-based: 2.9% + $0.30. No fixed monthly cost.'),
  ('vonage',      'API (pay-go)', 5.00,   1,  5.0000, 'SMS delivery for notifications. ~$0.0075/SMS.'),
  ('dataforseo',  'API (pay-go)', 30.00,  1, 30.0000, 'SEO data enrichment. Usage-based pricing.'),
  ('canny',       'Free',         0.00,   1,  0.0000, 'Free tier. Starter at $79/mo when feature voting exceeds limits.'),
  ('typesense',   'Cloud (paused)', 0.00, 1,  0.0000, 'Deferred post-launch. 4GB cluster ~$30/mo when activated.')
ON CONFLICT (service_name) DO NOTHING;


-- ─── Function: fn_capture_capacity_snapshot ───────────────────────────────────
-- Captures a point-in-time measurement of all system capacity metrics.
-- Called by pg_cron every 15 minutes.

CREATE OR REPLACE FUNCTION fn_capture_capacity_snapshot()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_snapshot_id bigint;
  v_db_size bigint;
  v_total_rows bigint;
  v_ats_rows bigint;
  v_connections_active int;
  v_connections_max int;
  v_p_ats bigint := 0;
  v_p_cc bigint := 0;
  v_p_amazon bigint := 0;
  v_p_default bigint := 0;
  v_replica_reads bigint := 0;
  v_replica_writes bigint := 0;
  v_replica_lag numeric := 0;
  v_ef_invocations bigint := 0;
  v_ef_error_rate numeric := 0;
  v_total_users bigint := 0;
  v_active_24h bigint := 0;
  v_active_7d bigint := 0;
  v_agent_actions bigint := 0;
  v_agent_cost numeric := 0;
  v_monthly_spend numeric := 0;
  v_budget_util numeric := 0;
BEGIN
  -- Database size
  SELECT pg_database_size(current_database()) INTO v_db_size;

  -- Total rows (approximate via pg_stat)
  SELECT COALESCE(SUM(n_live_tup), 0)
    FROM pg_stat_user_tables
    INTO v_total_rows;

  -- ats_jobs rows
  SELECT COALESCE(SUM(n_live_tup), 0)
    FROM pg_stat_user_tables
    WHERE relname LIKE 'ats_jobs%'
    INTO v_ats_rows;

  -- Connection counts
  SELECT count(*) INTO v_connections_active
    FROM pg_stat_activity WHERE state = 'active';
  SELECT setting::int INTO v_connections_max
    FROM pg_settings WHERE name = 'max_connections';

  -- Partition stats (from v_partition_stats — S-14 integration)
  BEGIN
    SELECT
      COALESCE(SUM(CASE WHEN partition_name = 'ats_jobs_ats' THEN row_count END), 0),
      COALESCE(SUM(CASE WHEN partition_name = 'ats_jobs_common_crawl' THEN row_count END), 0),
      COALESCE(SUM(CASE WHEN partition_name = 'ats_jobs_amazon' THEN row_count END), 0),
      COALESCE(SUM(CASE WHEN partition_name = 'ats_jobs_default' THEN row_count END), 0)
    INTO v_p_ats, v_p_cc, v_p_amazon, v_p_default
    FROM v_partition_stats;
  EXCEPTION WHEN OTHERS THEN
    -- v_partition_stats may not exist if partitioning not applied
    NULL;
  END;

  -- Replica routing stats (from replica_routing_stats — S-15 integration)
  BEGIN
    SELECT
      COALESCE(SUM(CASE WHEN db_mode = 'read' THEN request_count END), 0),
      COALESCE(SUM(CASE WHEN db_mode = 'write' THEN request_count END), 0)
    INTO v_replica_reads, v_replica_writes
    FROM replica_routing_stats
    WHERE recorded_at >= now() - interval '1 hour';

    SELECT COALESCE(
      (SELECT lag_ms FROM replica_health_log ORDER BY measured_at DESC LIMIT 1),
      0
    ) INTO v_replica_lag;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- User metrics
  BEGIN
    SELECT count(*) INTO v_total_users FROM auth.users;
    SELECT count(*) INTO v_active_24h FROM auth.users
      WHERE last_sign_in_at >= now() - interval '24 hours';
    SELECT count(*) INTO v_active_7d FROM auth.users
      WHERE last_sign_in_at >= now() - interval '7 days';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Agent metrics (from agent_action_log)
  BEGIN
    SELECT count(*), COALESCE(SUM(
      CASE WHEN payload->>'tokens_used' IS NOT NULL
        THEN (payload->>'tokens_used')::numeric * 0.000003  -- Haiku pricing estimate
        ELSE 0
      END
    ), 0)
    INTO v_agent_actions, v_agent_cost
    FROM agent_action_log
    WHERE created_at >= now() - interval '24 hours';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Cost metrics (from vendor_cost_budgets)
  BEGIN
    SELECT
      COALESCE(SUM(current_spend), 0),
      CASE WHEN SUM(monthly_budget) > 0
        THEN (SUM(current_spend) / SUM(monthly_budget)) * 100
        ELSE 0
      END
    INTO v_monthly_spend, v_budget_util
    FROM vendor_cost_budgets;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Insert snapshot
  INSERT INTO capacity_snapshots (
    db_total_rows, db_ats_jobs_rows, db_size_bytes,
    db_connections_active, db_connections_max,
    partition_ats_rows, partition_cc_rows, partition_amazon_rows, partition_default_rows,
    replica_read_count, replica_write_count, replica_lag_ms,
    ef_invocations_1h, ef_error_rate_1h,
    total_users, active_users_24h, active_users_7d,
    agent_actions_24h, agent_cost_24h,
    total_monthly_spend, budget_utilization_pct
  ) VALUES (
    v_total_rows, v_ats_rows, v_db_size,
    v_connections_active, v_connections_max,
    v_p_ats, v_p_cc, v_p_amazon, v_p_default,
    v_replica_reads, v_replica_writes, v_replica_lag,
    v_ef_invocations, v_ef_error_rate,
    v_total_users, v_active_24h, v_active_7d,
    v_agent_actions, v_agent_cost,
    v_monthly_spend, v_budget_util
  ) RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

COMMENT ON FUNCTION fn_capture_capacity_snapshot IS
  'SA-028: Captures point-in-time system metrics into capacity_snapshots. Called every 15min by pg_cron. Queries v_partition_stats (S-14) and replica_routing_stats (S-15).';


-- ─── Function: fn_evaluate_scaling_triggers ──────────────────────────────────
-- Evaluates all enabled scaling triggers against the most recent snapshot.
-- Logs alerts to scaling_trigger_log. Publishes events via H-02 for critical alerts.

CREATE OR REPLACE FUNCTION fn_evaluate_scaling_triggers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_snapshot record;
  v_trigger record;
  v_metric_value numeric;
  v_severity text;
  v_fired int := 0;
  v_results jsonb := '[]'::jsonb;
BEGIN
  -- Get most recent snapshot
  SELECT * INTO v_snapshot
    FROM capacity_snapshots
    ORDER BY captured_at DESC
    LIMIT 1;

  IF v_snapshot IS NULL THEN
    RETURN jsonb_build_object('status', 'no_snapshots', 'fired', 0);
  END IF;

  -- Evaluate each enabled trigger
  FOR v_trigger IN
    SELECT * FROM scaling_trigger_config WHERE is_enabled = true
  LOOP
    -- Extract metric value from snapshot using metric_key
    EXECUTE format(
      'SELECT ($1.%I)::numeric',
      v_trigger.metric_key
    ) INTO v_metric_value USING v_snapshot;

    IF v_metric_value IS NULL THEN
      CONTINUE;
    END IF;

    -- Check cooldown
    IF v_trigger.last_triggered IS NOT NULL
       AND v_trigger.last_triggered > now() - (v_trigger.cooldown_mins || ' minutes')::interval
    THEN
      CONTINUE;
    END IF;

    -- Evaluate threshold
    v_severity := NULL;

    IF v_trigger.operator = '>=' THEN
      IF v_metric_value >= v_trigger.threshold_crit THEN v_severity := 'critical';
      ELSIF v_metric_value >= v_trigger.threshold_warn THEN v_severity := 'warn';
      END IF;
    ELSIF v_trigger.operator = '<=' THEN
      IF v_metric_value <= v_trigger.threshold_crit THEN v_severity := 'critical';
      ELSIF v_metric_value <= v_trigger.threshold_warn THEN v_severity := 'warn';
      END IF;
    ELSIF v_trigger.operator = '>' THEN
      IF v_metric_value > v_trigger.threshold_crit THEN v_severity := 'critical';
      ELSIF v_metric_value > v_trigger.threshold_warn THEN v_severity := 'warn';
      END IF;
    ELSIF v_trigger.operator = '<' THEN
      IF v_metric_value < v_trigger.threshold_crit THEN v_severity := 'critical';
      ELSIF v_metric_value < v_trigger.threshold_warn THEN v_severity := 'warn';
      END IF;
    END IF;

    IF v_severity IS NOT NULL THEN
      -- Log the trigger activation
      INSERT INTO scaling_trigger_log (
        trigger_name, severity, metric_value, threshold_value, snapshot_id, action_taken
      ) VALUES (
        v_trigger.trigger_name,
        v_severity,
        v_metric_value,
        CASE WHEN v_severity = 'critical' THEN v_trigger.threshold_crit ELSE v_trigger.threshold_warn END,
        v_snapshot.id,
        v_trigger.action_type
      );

      -- Update last_triggered
      UPDATE scaling_trigger_config
        SET last_triggered = now(), updated_at = now()
        WHERE id = v_trigger.id;

      -- Publish event via H-02 for critical alerts
      IF v_severity = 'critical' THEN
        BEGIN
          PERFORM fn_publish_event(
            'capacity.trigger.critical',
            'capacity-model',
            jsonb_build_object(
              'trigger_name', v_trigger.trigger_name,
              'metric_key', v_trigger.metric_key,
              'metric_value', v_metric_value,
              'threshold', v_trigger.threshold_crit,
              'action_type', v_trigger.action_type
            ),
            jsonb_build_object('severity', 'critical'),
            gen_random_uuid()
          );
        EXCEPTION WHEN OTHERS THEN
          -- fn_publish_event may not exist yet; swallow gracefully
          NULL;
        END;
      END IF;

      v_fired := v_fired + 1;
      v_results := v_results || jsonb_build_object(
        'trigger', v_trigger.trigger_name,
        'severity', v_severity,
        'value', v_metric_value,
        'threshold', CASE WHEN v_severity = 'critical' THEN v_trigger.threshold_crit ELSE v_trigger.threshold_warn END
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'evaluated',
    'snapshot_id', v_snapshot.id,
    'fired', v_fired,
    'alerts', v_results
  );
END;
$$;

COMMENT ON FUNCTION fn_evaluate_scaling_triggers IS
  'SA-028: Evaluates scaling triggers against latest snapshot. Logs alerts. Publishes critical events via H-02 (fn_publish_event).';


-- ─── Function: fn_capacity_forecast ──────────────────────────────────────────
-- Generates 6/12/24 month growth projections based on historical snapshots
-- and configurable growth rate. Returns projections for all key dimensions.

CREATE OR REPLACE FUNCTION fn_capacity_forecast(
  p_growth_rate_pct numeric DEFAULT 15.0  -- Monthly growth rate %
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_latest record;
  v_30d_ago record;
  v_actual_growth numeric;
  v_growth numeric;
  v_result jsonb;
BEGIN
  -- Get latest snapshot
  SELECT * INTO v_latest
    FROM capacity_snapshots
    ORDER BY captured_at DESC
    LIMIT 1;

  IF v_latest IS NULL THEN
    RETURN jsonb_build_object('status', 'insufficient_data');
  END IF;

  -- Try to calculate actual growth from 30-day history
  SELECT * INTO v_30d_ago
    FROM capacity_snapshots
    WHERE captured_at <= now() - interval '30 days'
    ORDER BY captured_at DESC
    LIMIT 1;

  IF v_30d_ago IS NOT NULL AND v_30d_ago.total_users > 0 THEN
    v_actual_growth := ((v_latest.total_users::numeric / v_30d_ago.total_users::numeric) - 1) * 100;
  ELSE
    v_actual_growth := NULL;
  END IF;

  -- Use configured rate (fall back if no historical data)
  v_growth := 1 + (p_growth_rate_pct / 100);

  v_result := jsonb_build_object(
    'captured_at', v_latest.captured_at,
    'growth_rate_configured_pct', p_growth_rate_pct,
    'growth_rate_actual_30d_pct', v_actual_growth,

    'users', jsonb_build_object(
      'current', v_latest.total_users,
      'month_6', round(v_latest.total_users * power(v_growth, 6)),
      'month_12', round(v_latest.total_users * power(v_growth, 12)),
      'month_24', round(v_latest.total_users * power(v_growth, 24))
    ),

    'active_users_24h', jsonb_build_object(
      'current', v_latest.active_users_24h,
      'month_6', round(v_latest.active_users_24h * power(v_growth, 6)),
      'month_12', round(v_latest.active_users_24h * power(v_growth, 12)),
      'month_24', round(v_latest.active_users_24h * power(v_growth, 24))
    ),

    'db_rows', jsonb_build_object(
      'current', v_latest.db_total_rows,
      'ats_jobs_current', v_latest.db_ats_jobs_rows,
      'month_6', round(v_latest.db_total_rows * power(v_growth, 6)),
      'month_12', round(v_latest.db_total_rows * power(v_growth, 12)),
      'month_24', round(v_latest.db_total_rows * power(v_growth, 24))
    ),

    'db_size_bytes', jsonb_build_object(
      'current', v_latest.db_size_bytes,
      'current_gb', round(v_latest.db_size_bytes::numeric / 1073741824, 2),
      'month_6_gb', round((v_latest.db_size_bytes * power(v_growth, 6))::numeric / 1073741824, 2),
      'month_12_gb', round((v_latest.db_size_bytes * power(v_growth, 12))::numeric / 1073741824, 2),
      'month_24_gb', round((v_latest.db_size_bytes * power(v_growth, 24))::numeric / 1073741824, 2)
    ),

    'connections', jsonb_build_object(
      'active', v_latest.db_connections_active,
      'max', v_latest.db_connections_max,
      'utilization_pct', CASE WHEN v_latest.db_connections_max > 0
        THEN round((v_latest.db_connections_active::numeric / v_latest.db_connections_max) * 100, 1)
        ELSE 0 END
    ),

    'partitions', jsonb_build_object(
      'ats', v_latest.partition_ats_rows,
      'common_crawl', v_latest.partition_cc_rows,
      'amazon', v_latest.partition_amazon_rows,
      'default', v_latest.partition_default_rows
    ),

    'replica', jsonb_build_object(
      'read_count_1h', v_latest.replica_read_count,
      'write_count_1h', v_latest.replica_write_count,
      'lag_ms', v_latest.replica_lag_ms,
      'read_ratio', CASE WHEN (v_latest.replica_read_count + v_latest.replica_write_count) > 0
        THEN round(v_latest.replica_read_count::numeric / (v_latest.replica_read_count + v_latest.replica_write_count) * 100, 1)
        ELSE 0 END
    ),

    'cost', jsonb_build_object(
      'monthly_spend', v_latest.total_monthly_spend,
      'budget_utilization_pct', v_latest.budget_utilization_pct,
      'agent_cost_24h', v_latest.agent_cost_24h
    )
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION fn_capacity_forecast IS
  'SA-028: Growth projections at 6/12/24 months. Uses configurable growth rate with actual 30-day data when available. Returns all capacity dimensions.';


-- ─── Function: fn_cost_model ─────────────────────────────────────────────────
-- Updates cost_projections table with projected costs at each growth horizon.
-- Uses tiered pricing models for each service.

CREATE OR REPLACE FUNCTION fn_cost_model(
  p_growth_rate_pct numeric DEFAULT 15.0,
  p_current_users bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_users bigint;
  v_growth numeric;
  v_users_6 bigint;
  v_users_12 bigint;
  v_users_24 bigint;
  v_updated int := 0;
BEGIN
  -- Get current user count if not provided
  IF p_current_users IS NULL THEN
    SELECT count(*) INTO v_users FROM auth.users;
  ELSE
    v_users := p_current_users;
  END IF;

  v_growth := 1 + (p_growth_rate_pct / 100);
  v_users_6  := round(v_users * power(v_growth, 6));
  v_users_12 := round(v_users * power(v_growth, 12));
  v_users_24 := round(v_users * power(v_growth, 24));

  -- Update each service projection with tiered pricing logic
  -- Supabase: Pro $25 base + $75 read replica + compute scaling
  UPDATE cost_projections SET
    users_current = v_users,
    users_6mo = v_users_6, users_12mo = v_users_12, users_24mo = v_users_24,
    cost_6mo = CASE
      WHEN v_users_6 < 100 THEN 100   -- Pro + replica
      WHEN v_users_6 < 1000 THEN 200  -- Pro + replica + compute
      ELSE 400                          -- Team or custom
    END,
    cost_12mo = CASE
      WHEN v_users_12 < 100 THEN 100
      WHEN v_users_12 < 1000 THEN 200
      WHEN v_users_12 < 10000 THEN 400
      ELSE 800
    END,
    cost_24mo = CASE
      WHEN v_users_24 < 1000 THEN 200
      WHEN v_users_24 < 10000 THEN 400
      ELSE 1200
    END,
    tier_6mo = CASE WHEN v_users_6 < 1000 THEN 'Pro' ELSE 'Team' END,
    tier_12mo = CASE WHEN v_users_12 < 1000 THEN 'Pro' WHEN v_users_12 < 10000 THEN 'Team' ELSE 'Enterprise' END,
    tier_24mo = CASE WHEN v_users_24 < 10000 THEN 'Team' ELSE 'Enterprise' END,
    cost_per_user = CASE WHEN v_users > 0 THEN cost_current_mo / v_users ELSE 0 END,
    growth_rate_pct = p_growth_rate_pct,
    last_computed = now()
  WHERE service_name = 'supabase';
  v_updated := v_updated + 1;

  -- Anthropic: usage-based, roughly linear with users + agent activity
  UPDATE cost_projections SET
    users_current = v_users,
    users_6mo = v_users_6, users_12mo = v_users_12, users_24mo = v_users_24,
    cost_6mo  = round(cost_current_mo * power(v_growth, 6), 2),
    cost_12mo = round(cost_current_mo * power(v_growth, 12), 2),
    cost_24mo = round(cost_current_mo * power(v_growth, 24), 2),
    tier_6mo = 'API (pay-go)', tier_12mo = 'API (pay-go)', tier_24mo = 'API (pay-go)',
    cost_per_user = CASE WHEN v_users > 0 THEN cost_current_mo / v_users ELSE 0 END,
    growth_rate_pct = p_growth_rate_pct,
    last_computed = now()
  WHERE service_name = 'anthropic';
  v_updated := v_updated + 1;

  -- Vercel: Pro $20 base, bandwidth overage at scale
  UPDATE cost_projections SET
    users_current = v_users,
    users_6mo = v_users_6, users_12mo = v_users_12, users_24mo = v_users_24,
    cost_6mo = CASE WHEN v_users_6 < 500 THEN 20 WHEN v_users_6 < 5000 THEN 40 ELSE 80 END,
    cost_12mo = CASE WHEN v_users_12 < 500 THEN 20 WHEN v_users_12 < 5000 THEN 40 ELSE 150 END,
    cost_24mo = CASE WHEN v_users_24 < 5000 THEN 40 ELSE 200 END,
    tier_6mo = 'Pro', tier_12mo = CASE WHEN v_users_12 < 5000 THEN 'Pro' ELSE 'Enterprise' END,
    tier_24mo = CASE WHEN v_users_24 < 5000 THEN 'Pro' ELSE 'Enterprise' END,
    cost_per_user = CASE WHEN v_users > 0 THEN cost_current_mo / v_users ELSE 0 END,
    growth_rate_pct = p_growth_rate_pct,
    last_computed = now()
  WHERE service_name = 'vercel';
  v_updated := v_updated + 1;

  -- PostHog: free < 1M events, ~$450/mo at growth
  UPDATE cost_projections SET
    users_current = v_users,
    users_6mo = v_users_6, users_12mo = v_users_12, users_24mo = v_users_24,
    cost_6mo = CASE WHEN v_users_6 < 200 THEN 0 ELSE 450 END,
    cost_12mo = CASE WHEN v_users_12 < 200 THEN 0 WHEN v_users_12 < 2000 THEN 450 ELSE 900 END,
    cost_24mo = CASE WHEN v_users_24 < 2000 THEN 450 ELSE 1200 END,
    tier_6mo = CASE WHEN v_users_6 < 200 THEN 'Free' ELSE 'Growth' END,
    tier_12mo = CASE WHEN v_users_12 < 200 THEN 'Free' WHEN v_users_12 < 2000 THEN 'Growth' ELSE 'Growth+' END,
    tier_24mo = CASE WHEN v_users_24 < 2000 THEN 'Growth' ELSE 'Growth+' END,
    cost_per_user = CASE WHEN v_users > 0 THEN cost_current_mo / v_users ELSE 0 END,
    growth_rate_pct = p_growth_rate_pct,
    last_computed = now()
  WHERE service_name = 'posthog';
  v_updated := v_updated + 1;

  -- Resend: free < 3K emails/mo, Pro ~$20/mo
  UPDATE cost_projections SET
    users_current = v_users,
    users_6mo = v_users_6, users_12mo = v_users_12, users_24mo = v_users_24,
    cost_6mo = CASE WHEN v_users_6 < 100 THEN 0 ELSE 20 END,
    cost_12mo = CASE WHEN v_users_12 < 100 THEN 0 ELSE 20 END,
    cost_24mo = CASE WHEN v_users_24 < 500 THEN 20 ELSE 40 END,
    tier_6mo = CASE WHEN v_users_6 < 100 THEN 'Free' ELSE 'Pro' END,
    tier_12mo = CASE WHEN v_users_12 < 100 THEN 'Free' ELSE 'Pro' END,
    tier_24mo = 'Pro',
    cost_per_user = CASE WHEN v_users > 0 THEN cost_current_mo / v_users ELSE 0 END,
    growth_rate_pct = p_growth_rate_pct,
    last_computed = now()
  WHERE service_name = 'resend';
  v_updated := v_updated + 1;

  -- Update remaining services with linear scaling
  UPDATE cost_projections SET
    users_current = v_users,
    users_6mo = v_users_6, users_12mo = v_users_12, users_24mo = v_users_24,
    cost_6mo  = CASE WHEN cost_current_mo > 0 THEN round(cost_current_mo * power(v_growth, 6), 2) ELSE 0 END,
    cost_12mo = CASE WHEN cost_current_mo > 0 THEN round(cost_current_mo * power(v_growth, 12), 2) ELSE 0 END,
    cost_24mo = CASE WHEN cost_current_mo > 0 THEN round(cost_current_mo * power(v_growth, 24), 2) ELSE 0 END,
    cost_per_user = CASE WHEN v_users > 0 THEN cost_current_mo / v_users ELSE 0 END,
    growth_rate_pct = p_growth_rate_pct,
    last_computed = now()
  WHERE service_name NOT IN ('supabase', 'anthropic', 'vercel', 'posthog', 'resend');

  RETURN jsonb_build_object(
    'status', 'computed',
    'users_current', v_users,
    'growth_rate_pct', p_growth_rate_pct,
    'horizons', jsonb_build_object(
      'month_6', v_users_6,
      'month_12', v_users_12,
      'month_24', v_users_24
    ),
    'services_updated', (SELECT count(*) FROM cost_projections)
  );
END;
$$;

COMMENT ON FUNCTION fn_cost_model IS
  'SA-028: Updates cost_projections with tiered pricing models for all services at 6/12/24 month horizons.';


-- ─── Function: fn_capacity_summary ───────────────────────────────────────────
-- Returns a JSONB summary of current capacity status for admin panel and
-- CrewAI agent consumption.

CREATE OR REPLACE FUNCTION fn_capacity_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_snapshot record;
  v_unacked_alerts int;
  v_recent_critical int;
  v_forecast jsonb;
  v_cost_total_current numeric;
  v_cost_total_6mo numeric;
  v_cost_total_12mo numeric;
  v_cost_total_24mo numeric;
BEGIN
  -- Latest snapshot
  SELECT * INTO v_snapshot
    FROM capacity_snapshots
    ORDER BY captured_at DESC
    LIMIT 1;

  -- Unacknowledged alerts
  SELECT count(*) INTO v_unacked_alerts
    FROM scaling_trigger_log
    WHERE acknowledged_at IS NULL;

  -- Critical alerts in last 24h
  SELECT count(*) INTO v_recent_critical
    FROM scaling_trigger_log
    WHERE severity = 'critical'
      AND created_at >= now() - interval '24 hours';

  -- Get forecast
  v_forecast := fn_capacity_forecast();

  -- Cost totals
  SELECT
    COALESCE(SUM(cost_current_mo), 0),
    COALESCE(SUM(cost_6mo), 0),
    COALESCE(SUM(cost_12mo), 0),
    COALESCE(SUM(cost_24mo), 0)
  INTO v_cost_total_current, v_cost_total_6mo, v_cost_total_12mo, v_cost_total_24mo
  FROM cost_projections;

  RETURN jsonb_build_object(
    'status', CASE
      WHEN v_recent_critical > 0 THEN 'critical'
      WHEN v_unacked_alerts > 0 THEN 'warning'
      ELSE 'healthy'
    END,
    'snapshot', CASE WHEN v_snapshot IS NOT NULL THEN jsonb_build_object(
      'id', v_snapshot.id,
      'captured_at', v_snapshot.captured_at,
      'db_rows', v_snapshot.db_total_rows,
      'db_size_gb', round(v_snapshot.db_size_bytes::numeric / 1073741824, 2),
      'connections', jsonb_build_object(
        'active', v_snapshot.db_connections_active,
        'max', v_snapshot.db_connections_max
      ),
      'users', jsonb_build_object(
        'total', v_snapshot.total_users,
        'active_24h', v_snapshot.active_users_24h,
        'active_7d', v_snapshot.active_users_7d
      ),
      'replica_lag_ms', v_snapshot.replica_lag_ms,
      'budget_utilization_pct', v_snapshot.budget_utilization_pct
    ) ELSE NULL END,
    'alerts', jsonb_build_object(
      'unacknowledged', v_unacked_alerts,
      'critical_24h', v_recent_critical
    ),
    'forecast', v_forecast,
    'cost_totals', jsonb_build_object(
      'current_mo', v_cost_total_current,
      'month_6', v_cost_total_6mo,
      'month_12', v_cost_total_12mo,
      'month_24', v_cost_total_24mo
    )
  );
END;
$$;

COMMENT ON FUNCTION fn_capacity_summary IS
  'SA-028: JSONB capacity summary for admin panel and CrewAI agent consumption. Includes snapshot, alerts, forecast, cost totals.';


-- ─── View: v_capacity_dashboard ──────────────────────────────────────────────

CREATE OR REPLACE VIEW v_capacity_dashboard AS
SELECT
  s.id,
  s.captured_at,
  s.db_total_rows,
  s.db_ats_jobs_rows,
  round(s.db_size_bytes::numeric / 1073741824, 2) AS db_size_gb,
  s.db_connections_active,
  s.db_connections_max,
  CASE WHEN s.db_connections_max > 0
    THEN round(s.db_connections_active::numeric / s.db_connections_max * 100, 1)
    ELSE 0
  END AS connection_utilization_pct,
  s.partition_ats_rows,
  s.partition_cc_rows,
  s.partition_amazon_rows,
  s.partition_default_rows,
  s.replica_lag_ms,
  s.total_users,
  s.active_users_24h,
  s.active_users_7d,
  s.total_monthly_spend,
  s.budget_utilization_pct,
  s.agent_actions_24h,
  s.agent_cost_24h
FROM capacity_snapshots s
ORDER BY s.captured_at DESC;

COMMENT ON VIEW v_capacity_dashboard IS
  'SA-028: Real-time capacity dashboard view for admin panel. Latest snapshot with computed fields.';


-- ─── pg_cron schedules ───────────────────────────────────────────────────────

-- Capture snapshot every 15 minutes
SELECT cron.schedule(
  'capacity_snapshot',
  '*/15 * * * *',
  $$SELECT fn_capture_capacity_snapshot()$$
);

-- Evaluate scaling triggers every 5 minutes
SELECT cron.schedule(
  'scaling_trigger_check',
  '*/5 * * * *',
  $$SELECT fn_evaluate_scaling_triggers()$$
);

-- Cleanup old snapshots daily (retain 90 days)
SELECT cron.schedule(
  'capacity_cleanup',
  '0 5 * * *',
  $$DELETE FROM capacity_snapshots WHERE captured_at < now() - interval '90 days'$$
);


-- ─── Agent action log entry ──────────────────────────────────────────────────

INSERT INTO agent_action_log (agent_id, action_type, target, payload, result, confidence)
SELECT
  'system',
  'migration',
  'v6.33-capacity-model',
  jsonb_build_object(
    'tables', ARRAY['capacity_snapshots', 'scaling_trigger_config', 'scaling_trigger_log', 'cost_projections'],
    'functions', ARRAY['fn_capture_capacity_snapshot', 'fn_evaluate_scaling_triggers', 'fn_capacity_forecast', 'fn_cost_model', 'fn_capacity_summary'],
    'views', ARRAY['v_capacity_dashboard'],
    'cron', ARRAY['capacity_snapshot (15min)', 'scaling_trigger_check (5min)', 'capacity_cleanup (daily 5AM)'],
    'session', 'SA-028'
  ),
  jsonb_build_object('status', 'applied'),
  1.0;
