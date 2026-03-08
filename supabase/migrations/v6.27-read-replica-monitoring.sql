-- ============================================================================
-- v6.27: Read Replica Monitoring + Query Routing Infrastructure
-- SA-018: Read Replica Setup + Query Routing (Phase S4)
-- ADR: ADR-06 (Data Pipeline — read replica addendum)
-- Pair: DevOps + Backend Eng | Reviewer: System Architect—Scalability
-- ============================================================================
--
-- This migration creates the monitoring tables and functions needed to
-- track read replica health, replication lag, and query routing distribution.
-- The actual read replica is provisioned via Supabase dashboard (Pro plan).
-- Connection string stored in Vault as READ_REPLICA_URL.
--
-- Tables:
--   replica_health_log      — Time-series replication lag measurements
--   replica_routing_stats   — Aggregated read/write routing counts
--
-- Functions:
--   fn_log_replica_health() — Called by pg_cron every 30s, records lag
--   fn_replica_health_summary() — Returns current status for health endpoint
--   fn_cleanup_replica_logs() — Purges logs older than 7 days
--
-- Views:
--   v_replica_dashboard     — Real-time replica status for admin panel
--
-- pg_cron:
--   replica-health-check    — Every 30 seconds
--   replica-log-cleanup     — Daily at 3am ET
-- ============================================================================

-- ─── Table: replica_health_log ───────────────────────────────────────────────
-- Time-series log of replication lag measurements.
-- Sampled every 30s by pg_cron. Retained for 7 days.

CREATE TABLE IF NOT EXISTS replica_health_log (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  measured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  replica_lag_ms  NUMERIC(10, 2),           -- Replication lag in milliseconds
  replica_state   TEXT NOT NULL DEFAULT 'unknown',  -- streaming, catchup, disconnected, unknown
  primary_lsn     TEXT,                     -- Primary WAL position
  replica_lsn     TEXT,                     -- Replica WAL position
  is_healthy      BOOLEAN NOT NULL DEFAULT true,
  alert_fired     BOOLEAN NOT NULL DEFAULT false,
  notes           TEXT
);

-- Index for time-range queries (dashboard, cleanup)
CREATE INDEX IF NOT EXISTS idx_replica_health_log_measured_at
  ON replica_health_log (measured_at DESC);

-- Index for alert queries
CREATE INDEX IF NOT EXISTS idx_replica_health_log_unhealthy
  ON replica_health_log (is_healthy, measured_at DESC)
  WHERE is_healthy = false;

-- ─── Table: replica_routing_stats ────────────────────────────────────────────
-- Aggregated counters for read vs write query routing through the gateway.
-- Updated by the gateway read-replica middleware via fire-and-forget inserts.
-- Rolled up hourly for dashboard display.

CREATE TABLE IF NOT EXISTS replica_routing_stats (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  route_name      TEXT NOT NULL,           -- Gateway route (e.g., 'chat-job-search')
  route_type      TEXT NOT NULL CHECK (route_type IN ('read', 'write')),
  target          TEXT NOT NULL CHECK (target IN ('primary', 'replica', 'fallback')),
  count           INTEGER NOT NULL DEFAULT 1,
  avg_latency_ms  NUMERIC(10, 2)
);

-- Index for hourly rollup queries
CREATE INDEX IF NOT EXISTS idx_replica_routing_stats_recorded
  ON replica_routing_stats (recorded_at DESC);

-- Index for per-route analysis
CREATE INDEX IF NOT EXISTS idx_replica_routing_stats_route
  ON replica_routing_stats (route_name, recorded_at DESC);

-- ─── Function: fn_log_replica_health() ───────────────────────────────────────
-- Called by pg_cron every 30 seconds. Reads pg_stat_replication to determine
-- current replication lag. If lag exceeds 5 seconds, marks as unhealthy and
-- sets alert_fired = true. On the PRIMARY database, pg_stat_replication shows
-- connected replicas. If no rows, replica is disconnected.
--
-- NOTE: This function runs on the PRIMARY. pg_stat_replication only exists
-- on the primary and shows connected standby servers.

CREATE OR REPLACE FUNCTION fn_log_replica_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lag_ms        NUMERIC(10, 2);
  v_state         TEXT;
  v_primary_lsn   TEXT;
  v_replica_lsn   TEXT;
  v_is_healthy    BOOLEAN;
  v_alert_fired   BOOLEAN := false;
  v_lag_threshold  NUMERIC := 5000; -- 5 seconds in ms
BEGIN
  -- Query pg_stat_replication for the first connected replica
  SELECT
    CASE
      WHEN replay_lag IS NOT NULL THEN
        EXTRACT(EPOCH FROM replay_lag) * 1000
      ELSE NULL
    END,
    COALESCE(state, 'disconnected'),
    sent_lsn::TEXT,
    replay_lsn::TEXT
  INTO v_lag_ms, v_state, v_primary_lsn, v_replica_lsn
  FROM pg_stat_replication
  LIMIT 1;

  -- If no replication rows, replica is disconnected
  IF v_state IS NULL THEN
    v_state := 'disconnected';
    v_lag_ms := NULL;
    v_is_healthy := false;
    v_alert_fired := true;
  ELSE
    v_is_healthy := COALESCE(v_lag_ms, 0) < v_lag_threshold;
    v_alert_fired := NOT v_is_healthy;
  END IF;

  INSERT INTO replica_health_log (
    replica_lag_ms, replica_state, primary_lsn, replica_lsn,
    is_healthy, alert_fired,
    notes
  ) VALUES (
    v_lag_ms, v_state, v_primary_lsn, v_replica_lsn,
    v_is_healthy, v_alert_fired,
    CASE
      WHEN v_state = 'disconnected' THEN 'No replica connected to primary'
      WHEN NOT v_is_healthy THEN format('Lag %sms exceeds threshold %sms', v_lag_ms, v_lag_threshold)
      ELSE NULL
    END
  );

  -- If alert fired, also log to agent_action_log for CrewAI Pipeline Health agent
  IF v_alert_fired THEN
    INSERT INTO agent_action_log (agent_id, action_type, action_payload, result_status, result_payload)
    SELECT
      ac.id,
      'replica_lag_alert',
      jsonb_build_object(
        'lag_ms', v_lag_ms,
        'state', v_state,
        'threshold_ms', v_lag_threshold
      ),
      'alert',
      jsonb_build_object('message', format('Replica lag alert: %sms (state: %s)', COALESCE(v_lag_ms::TEXT, 'N/A'), v_state))
    FROM agent_config ac
    WHERE ac.agent_type = 'pipeline-health'
    LIMIT 1;
  END IF;
END;
$$;

-- ─── Function: fn_replica_health_summary() ───────────────────────────────────
-- Returns current replica health status for the health endpoint and admin panel.
-- Aggregates recent measurements into a summary object.

CREATE OR REPLACE FUNCTION fn_replica_health_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'current', (
      SELECT jsonb_build_object(
        'lag_ms', replica_lag_ms,
        'state', replica_state,
        'is_healthy', is_healthy,
        'measured_at', measured_at
      )
      FROM replica_health_log
      ORDER BY measured_at DESC
      LIMIT 1
    ),
    'last_hour', (
      SELECT jsonb_build_object(
        'avg_lag_ms', ROUND(AVG(replica_lag_ms), 2),
        'max_lag_ms', ROUND(MAX(replica_lag_ms), 2),
        'min_lag_ms', ROUND(MIN(replica_lag_ms), 2),
        'samples', COUNT(*),
        'unhealthy_count', COUNT(*) FILTER (WHERE NOT is_healthy),
        'alerts_fired', COUNT(*) FILTER (WHERE alert_fired)
      )
      FROM replica_health_log
      WHERE measured_at > now() - interval '1 hour'
    ),
    'routing', (
      SELECT jsonb_build_object(
        'total_read', COALESCE(SUM(count) FILTER (WHERE route_type = 'read'), 0),
        'total_write', COALESCE(SUM(count) FILTER (WHERE route_type = 'write'), 0),
        'replica_served', COALESCE(SUM(count) FILTER (WHERE target = 'replica'), 0),
        'primary_served', COALESCE(SUM(count) FILTER (WHERE target = 'primary'), 0),
        'fallback_count', COALESCE(SUM(count) FILTER (WHERE target = 'fallback'), 0)
      )
      FROM replica_routing_stats
      WHERE recorded_at > now() - interval '1 hour'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ─── Function: fn_cleanup_replica_logs() ─────────────────────────────────────
-- Purges health log entries older than 7 days and routing stats older than 30 days.

CREATE OR REPLACE FUNCTION fn_cleanup_replica_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM replica_health_log WHERE measured_at < now() - interval '7 days';
  DELETE FROM replica_routing_stats WHERE recorded_at < now() - interval '30 days';
END;
$$;

-- ─── View: v_replica_dashboard ───────────────────────────────────────────────
-- Real-time view for admin panel. Shows current status + hourly aggregates.

CREATE OR REPLACE VIEW v_replica_dashboard AS
SELECT
  -- Current state
  (SELECT replica_lag_ms FROM replica_health_log ORDER BY measured_at DESC LIMIT 1) AS current_lag_ms,
  (SELECT replica_state FROM replica_health_log ORDER BY measured_at DESC LIMIT 1) AS current_state,
  (SELECT is_healthy FROM replica_health_log ORDER BY measured_at DESC LIMIT 1) AS is_healthy,
  (SELECT measured_at FROM replica_health_log ORDER BY measured_at DESC LIMIT 1) AS last_check,
  -- 1-hour aggregates
  (SELECT ROUND(AVG(replica_lag_ms), 2) FROM replica_health_log WHERE measured_at > now() - interval '1 hour') AS avg_lag_1h,
  (SELECT ROUND(MAX(replica_lag_ms), 2) FROM replica_health_log WHERE measured_at > now() - interval '1 hour') AS max_lag_1h,
  (SELECT COUNT(*) FROM replica_health_log WHERE measured_at > now() - interval '1 hour' AND NOT is_healthy) AS unhealthy_checks_1h,
  -- Routing distribution (1 hour)
  (SELECT COALESCE(SUM(count), 0) FROM replica_routing_stats WHERE recorded_at > now() - interval '1 hour' AND target = 'replica') AS reads_via_replica_1h,
  (SELECT COALESCE(SUM(count), 0) FROM replica_routing_stats WHERE recorded_at > now() - interval '1 hour' AND target = 'primary') AS reads_via_primary_1h,
  (SELECT COALESCE(SUM(count), 0) FROM replica_routing_stats WHERE recorded_at > now() - interval '1 hour' AND target = 'fallback') AS fallbacks_1h;

-- ─── pg_cron: Replica health check every 30 seconds ─────────────────────────

SELECT cron.schedule(
  'replica-health-check',
  '30 seconds',
  $$SELECT fn_log_replica_health()$$
);

-- ─── pg_cron: Replica log cleanup daily at 3am ET ───────────────────────────

SELECT cron.schedule(
  'replica-log-cleanup',
  '0 7 * * *',  -- 3am ET = 7am UTC
  $$SELECT fn_cleanup_replica_logs()$$
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Both tables are infrastructure-only. No user access. Service role only.

ALTER TABLE replica_health_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE replica_routing_stats ENABLE ROW LEVEL SECURITY;

-- Service role bypass (implicit via SECURITY DEFINER functions)
-- No user-facing RLS policies needed — these tables are internal monitoring.

-- ============================================================================
-- END v6.27
-- ============================================================================
