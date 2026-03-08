-- Migration: v6.26-agent-graduation.sql
-- SA-012: Agent Graduation Framework + Daily Digest
-- Creates: agent_graduation_log, fn_evaluate_agent_graduation(), v_agent_graduation_readiness
-- Updates: v_agent_dashboard (adds graduation metrics)
-- Pair: Backend + Eng Lead | Reviewer: Forward-Looking Dev
-- ADR: ADR-05 (CrewAI)

-- ============================================================
-- 1. Graduation Log — tracks every trust level transition
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_graduation_log (
  id            bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  agent_id      text NOT NULL REFERENCES agent_config(id),
  from_level    text NOT NULL,
  to_level      text NOT NULL,
  reason        text NOT NULL,               -- 'auto_graduation', 'manual_graduation', 'rollback', 'emergency_rollback'
  evaluation    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- Snapshot of metrics at graduation time
  initiated_by  text NOT NULL DEFAULT 'system',       -- 'system', 'admin', user_id
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agl_agent_created ON agent_graduation_log (agent_id, created_at DESC);

COMMENT ON TABLE agent_graduation_log IS
  'SA-012: Records every agent trust level transition with metrics snapshot.';

ALTER TABLE agent_graduation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_manage_graduation_log"
  ON agent_graduation_log FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "admin_read_graduation_log"
  ON agent_graduation_log FOR SELECT
  USING (auth.role() = 'authenticated');

GRANT SELECT ON agent_graduation_log TO authenticated;


-- ============================================================
-- 2. Add graduation metadata columns to agent_config
-- ============================================================

ALTER TABLE agent_config
  ADD COLUMN IF NOT EXISTS graduated_at timestamptz,          -- When last graduation happened
  ADD COLUMN IF NOT EXISTS graduation_criteria jsonb NOT NULL DEFAULT '{
    "observe_to_suggest": {
      "min_days_in_level": 14,
      "min_actions": 50,
      "max_false_positive_rate": 0.05,
      "max_error_rate": 0.02
    },
    "suggest_to_auto": {
      "min_days_in_level": 28,
      "min_actions": 200,
      "max_override_rate": 0.10,
      "max_error_rate": 0.01
    },
    "auto_to_autonomous": {
      "requires_explicit_approval": true
    }
  }'::jsonb;

COMMENT ON COLUMN agent_config.graduated_at IS
  'SA-012: Timestamp of most recent trust level graduation.';
COMMENT ON COLUMN agent_config.graduation_criteria IS
  'SA-012: Per-agent graduation thresholds. Can be customized per agent via admin panel.';


-- ============================================================
-- 3. Graduation Evaluation Function
-- ============================================================
-- Returns a row per agent with current metrics vs. criteria,
-- whether the agent is eligible to graduate, and detailed reasons.

CREATE OR REPLACE FUNCTION fn_evaluate_agent_graduation(p_agent_id text DEFAULT NULL)
RETURNS TABLE (
  agent_id          text,
  display_name      text,
  current_level     text,
  next_level        text,
  eligible          boolean,
  days_in_level     integer,
  total_actions     bigint,
  false_positive_rate numeric,
  override_rate     numeric,
  error_rate        numeric,
  criteria          jsonb,
  blockers          text[],
  recommendation    text
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      ac.id,
      ac.display_name AS dname,
      ac.trust_level,
      ac.graduated_at,
      ac.graduation_criteria,
      ac.created_at AS config_created,
      ac.updated_at AS config_updated
    FROM agent_config ac
    WHERE (p_agent_id IS NULL OR ac.id = p_agent_id)
      AND ac.enabled = true
      AND ac.id != 'system'
    ORDER BY ac.display_name
  LOOP
    agent_id := r.id;
    display_name := r.dname;
    current_level := r.trust_level;

    -- Determine next level
    CASE r.trust_level
      WHEN 'observe' THEN next_level := 'suggest';
      WHEN 'suggest' THEN next_level := 'auto_with_approval';
      WHEN 'auto_with_approval' THEN next_level := 'autonomous';
      WHEN 'autonomous' THEN next_level := NULL;
      ELSE next_level := NULL;
    END CASE;

    -- Skip if already at max level
    IF next_level IS NULL THEN
      eligible := false;
      days_in_level := EXTRACT(EPOCH FROM now() - COALESCE(r.graduated_at, r.config_created))::integer / 86400;
      total_actions := 0;
      false_positive_rate := 0;
      override_rate := 0;
      error_rate := 0;
      criteria := r.graduation_criteria;
      blockers := ARRAY['Already at maximum trust level'];
      recommendation := 'No graduation possible — agent is at autonomous level.';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Calculate days in current trust level
    days_in_level := EXTRACT(EPOCH FROM now() - COALESCE(r.graduated_at, r.config_created))::integer / 86400;

    -- Calculate metrics from action log (since last graduation or creation)
    SELECT INTO total_actions, false_positive_rate, override_rate, error_rate
      COUNT(*),
      -- False positive: overridden actions / total non-error actions
      CASE WHEN COUNT(*) FILTER (WHERE aal.error IS NULL) > 0
        THEN ROUND(COUNT(*) FILTER (WHERE aal.override_by IS NOT NULL)::numeric
             / COUNT(*) FILTER (WHERE aal.error IS NULL), 4)
        ELSE 0 END,
      -- Override rate: overridden / total (for suggest+ modes)
      CASE WHEN COUNT(*) > 0
        THEN ROUND(COUNT(*) FILTER (WHERE aal.override_by IS NOT NULL)::numeric / COUNT(*), 4)
        ELSE 0 END,
      -- Error rate: errors / total
      CASE WHEN COUNT(*) > 0
        THEN ROUND(COUNT(*) FILTER (WHERE aal.error IS NOT NULL)::numeric / COUNT(*), 4)
        ELSE 0 END
    FROM agent_action_log aal
    WHERE aal.agent_id = r.id
      AND aal.created_at > COALESCE(r.graduated_at, r.config_created)
      AND aal.action_type NOT IN ('enable', 'disable');  -- Exclude admin toggles

    criteria := r.graduation_criteria;
    blockers := ARRAY[]::text[];

    -- Evaluate against criteria for the current transition
    IF r.trust_level = 'observe' THEN
      DECLARE
        c jsonb := r.graduation_criteria -> 'observe_to_suggest';
        min_days integer := COALESCE((c ->> 'min_days_in_level')::integer, 14);
        min_acts integer := COALESCE((c ->> 'min_actions')::integer, 50);
        max_fp numeric := COALESCE((c ->> 'max_false_positive_rate')::numeric, 0.05);
        max_err numeric := COALESCE((c ->> 'max_error_rate')::numeric, 0.02);
      BEGIN
        IF days_in_level < min_days THEN
          blockers := array_append(blockers,
            format('Needs %s more days in observe (at %s of %s)', min_days - days_in_level, days_in_level, min_days));
        END IF;
        IF total_actions < min_acts THEN
          blockers := array_append(blockers,
            format('Needs %s more actions (at %s of %s)', min_acts - total_actions, total_actions, min_acts));
        END IF;
        IF false_positive_rate > max_fp THEN
          blockers := array_append(blockers,
            format('False positive rate too high: %s%% (max %s%%)', (false_positive_rate * 100)::text, (max_fp * 100)::text));
        END IF;
        IF error_rate > max_err THEN
          blockers := array_append(blockers,
            format('Error rate too high: %s%% (max %s%%)', (error_rate * 100)::text, (max_err * 100)::text));
        END IF;
      END;

    ELSIF r.trust_level = 'suggest' THEN
      DECLARE
        c jsonb := r.graduation_criteria -> 'suggest_to_auto';
        min_days integer := COALESCE((c ->> 'min_days_in_level')::integer, 28);
        min_acts integer := COALESCE((c ->> 'min_actions')::integer, 200);
        max_or numeric := COALESCE((c ->> 'max_override_rate')::numeric, 0.10);
        max_err numeric := COALESCE((c ->> 'max_error_rate')::numeric, 0.01);
      BEGIN
        IF days_in_level < min_days THEN
          blockers := array_append(blockers,
            format('Needs %s more days in suggest (at %s of %s)', min_days - days_in_level, days_in_level, min_days));
        END IF;
        IF total_actions < min_acts THEN
          blockers := array_append(blockers,
            format('Needs %s more actions (at %s of %s)', min_acts - total_actions, total_actions, min_acts));
        END IF;
        IF override_rate > max_or THEN
          blockers := array_append(blockers,
            format('Override rate too high: %s%% (max %s%%)', (override_rate * 100)::text, (max_or * 100)::text));
        END IF;
        IF error_rate > max_err THEN
          blockers := array_append(blockers,
            format('Error rate too high: %s%% (max %s%%)', (error_rate * 100)::text, (max_err * 100)::text));
        END IF;
      END;

    ELSIF r.trust_level = 'auto_with_approval' THEN
      -- Autonomous requires explicit Marston approval — never auto-eligible
      blockers := array_append(blockers, 'Autonomous level requires explicit Marston approval');
    END IF;

    eligible := cardinality(blockers) = 0;

    -- Build recommendation
    IF eligible THEN
      recommendation := format('Agent meets all criteria for graduation to %s. Ready for promotion.', next_level);
    ELSE
      recommendation := format('Agent has %s blocker(s) preventing graduation to %s.', cardinality(blockers), next_level);
    END IF;

    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION fn_evaluate_agent_graduation IS
  'SA-012: Evaluates agent graduation readiness against configurable criteria.';


-- ============================================================
-- 4. Graduation Readiness View (materialized for dashboard)
-- ============================================================

CREATE OR REPLACE VIEW v_agent_graduation_readiness AS
SELECT * FROM fn_evaluate_agent_graduation(NULL);

GRANT SELECT ON v_agent_graduation_readiness TO authenticated;

COMMENT ON VIEW v_agent_graduation_readiness IS
  'SA-012: Wraps fn_evaluate_agent_graduation for easy querying from admin panel.';


-- ============================================================
-- 5. Update v_agent_dashboard with graduation columns
-- ============================================================

CREATE OR REPLACE VIEW v_agent_dashboard AS
SELECT
  ac.id,
  ac.display_name,
  ac.agent_type,
  ac.trust_level,
  ac.enabled,
  ac.last_run_at,
  ac.run_count,
  ac.error_count,
  ac.last_error,
  ac.rate_limit,
  ac.graduated_at,
  ac.graduation_criteria,
  -- Last 24h stats
  COALESCE(stats.actions_24h, 0) AS actions_24h,
  COALESCE(stats.avg_confidence_24h, 0) AS avg_confidence_24h,
  COALESCE(stats.errors_24h, 0) AS errors_24h,
  COALESCE(stats.overrides_24h, 0) AS overrides_24h,
  -- Last action
  last_action.action_type AS last_action_type,
  last_action.confidence AS last_action_confidence,
  last_action.created_at AS last_action_at,
  -- Last graduation
  last_grad.from_level AS last_grad_from,
  last_grad.to_level AS last_grad_to,
  last_grad.reason AS last_grad_reason,
  last_grad.created_at AS last_grad_at
FROM agent_config ac
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS actions_24h,
    ROUND(AVG(confidence), 4) AS avg_confidence_24h,
    COUNT(*) FILTER (WHERE error IS NOT NULL) AS errors_24h,
    COUNT(*) FILTER (WHERE override_by IS NOT NULL) AS overrides_24h
  FROM agent_action_log
  WHERE agent_id = ac.id AND created_at > now() - interval '24 hours'
) stats ON true
LEFT JOIN LATERAL (
  SELECT action_type, confidence, created_at
  FROM agent_action_log
  WHERE agent_id = ac.id
  ORDER BY created_at DESC
  LIMIT 1
) last_action ON true
LEFT JOIN LATERAL (
  SELECT from_level, to_level, reason, created_at
  FROM agent_graduation_log
  WHERE agent_id = ac.id
  ORDER BY created_at DESC
  LIMIT 1
) last_grad ON true
WHERE ac.id != 'system'
ORDER BY ac.display_name;

GRANT SELECT ON v_agent_dashboard TO authenticated;

COMMENT ON VIEW v_agent_dashboard IS
  'SA-012: Agent dashboard view — now includes graduation history columns.';


-- ============================================================
-- 6. Daily Digest Aggregation Function
-- ============================================================
-- Returns structured JSON summary for email rendering.

CREATE OR REPLACE FUNCTION fn_agent_daily_digest()
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  digest jsonb;
  agent_summaries jsonb;
  graduation_updates jsonb;
  alert_count integer;
BEGIN
  -- Agent-level summaries for past 24h
  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb)
  INTO agent_summaries
  FROM (
    SELECT
      ac.id AS agent_id,
      ac.display_name,
      ac.trust_level,
      ac.enabled,
      ac.last_run_at,
      ac.last_error,
      COALESCE(stats.actions_24h, 0) AS actions_24h,
      COALESCE(stats.errors_24h, 0) AS errors_24h,
      COALESCE(stats.overrides_24h, 0) AS overrides_24h,
      COALESCE(stats.avg_confidence, 0) AS avg_confidence,
      COALESCE(stats.critical_findings, 0) AS critical_findings
    FROM agent_config ac
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) AS actions_24h,
        COUNT(*) FILTER (WHERE error IS NOT NULL) AS errors_24h,
        COUNT(*) FILTER (WHERE override_by IS NOT NULL) AS overrides_24h,
        ROUND(AVG(confidence), 4) AS avg_confidence,
        COUNT(*) FILTER (
          WHERE result ->> 'severity' = 'critical'
             OR result ->> 'overall_severity' = 'critical'
        ) AS critical_findings
      FROM agent_action_log
      WHERE agent_id = ac.id
        AND created_at > now() - interval '24 hours'
    ) stats ON true
    ORDER BY ac.display_name
  ) s;

  -- Graduation events in past 24h
  SELECT COALESCE(jsonb_agg(row_to_json(g)), '[]'::jsonb)
  INTO graduation_updates
  FROM (
    SELECT
      gl.agent_id,
      ac.display_name,
      gl.from_level,
      gl.to_level,
      gl.reason,
      gl.created_at
    FROM agent_graduation_log gl
    JOIN agent_config ac ON ac.id = gl.agent_id
    WHERE gl.created_at > now() - interval '24 hours'
    ORDER BY gl.created_at DESC
  ) g;

  -- Count critical-severity findings across all agents in 24h
  SELECT COUNT(*)
  INTO alert_count
  FROM agent_action_log
  WHERE created_at > now() - interval '24 hours'
    AND (result ->> 'severity' = 'critical'
         OR result ->> 'overall_severity' = 'critical');

  digest := jsonb_build_object(
    'generated_at', now(),
    'period_hours', 24,
    'total_agents', (SELECT COUNT(*) FROM agent_config),
    'active_agents', (SELECT COUNT(*) FROM agent_config WHERE enabled = true),
    'alert_count', alert_count,
    'agents', agent_summaries,
    'graduation_events', graduation_updates
  );

  RETURN digest;
END;
$$;

COMMENT ON FUNCTION fn_agent_daily_digest IS
  'SA-012: Generates structured JSON for daily agent digest email.';


-- ============================================================
-- 7. pg_cron: daily digest at 8am ET (12:00 UTC)
-- ============================================================
-- Note: The actual email send is handled by the crewai-agent-digest EF.
-- This cron triggers the EF via the gateway.

-- HOOK: pg_cron registration point for agent-digest
-- Schedule will be registered after EF deployment via:
-- SELECT cron.schedule('crewai-agent-digest', '0 12 * * *',
--   $$SELECT net.http_post(
--     url := current_setting('app.settings.supabase_url') || '/functions/v1/api-gateway/crewai-agent-digest',
--     headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
--                                    'Content-Type', 'application/json'),
--     body := '{}'::jsonb
--   )$$
-- );


-- ============================================================
-- 8. System pseudo-agent for digest/framework logging
-- ============================================================
-- The digest EF logs actions with agent_id = 'system'. We need a row
-- to satisfy the FK on agent_action_log.

-- First, expand the agent_type CHECK to include 'system'
ALTER TABLE agent_config DROP CONSTRAINT IF EXISTS agent_config_agent_type_check;
ALTER TABLE agent_config ADD CONSTRAINT agent_config_agent_type_check CHECK (
  agent_type IN (
    'content_qa', 'pipeline_health', 'data_freshness',
    'cost_guardian', 'user_support', 'referral_pipeline',
    'system'
  )
);

INSERT INTO agent_config (id, display_name, description, agent_type, trust_level, enabled, config, rate_limit)
VALUES (
  'system',
  'System Agent',
  'Pseudo-agent for framework-level actions (digest emails, graduation events, etc.)',
  'system',
  'autonomous',
  true,
  '{"internal": true, "hidden_from_dashboard": true}'::jsonb,
  '{"requests_per_min": 100, "ai_calls_per_hour": 0}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
