-- Migration: v6.24-crewai-agent-framework.sql
-- SA-010: CrewAI Agent Framework + Content QA Agent (Observe Mode)
-- Creates: agent_config, agent_action_log, agent_credentials
-- Pair: Backend + Eng Lead | Reviewer: Forward-Looking Dev
-- ADR: ADR-05 (CrewAI)

-- ============================================================
-- 1. Agent Configuration Store
-- ============================================================
-- Central registry for all CrewAI agents. Controls trust level,
-- scheduling, and kill switch state per agent.

CREATE TABLE IF NOT EXISTS agent_config (
  id            text PRIMARY KEY,                   -- e.g., 'content-qa', 'pipeline-health'
  display_name  text NOT NULL,
  description   text,
  agent_type    text NOT NULL CHECK (agent_type IN (
    'content_qa', 'pipeline_health', 'data_freshness',
    'cost_guardian', 'user_support', 'referral_pipeline'
  )),
  trust_level   text NOT NULL DEFAULT 'observe' CHECK (trust_level IN (
    'observe',            -- Logs decisions only, zero actions
    'suggest',            -- Suggests actions, Marston approves
    'auto_with_approval', -- Auto-executes routine, flags edge cases
    'autonomous'          -- Fully autonomous (reserved for future)
  )),
  enabled       boolean NOT NULL DEFAULT true,      -- Kill switch (false = agent disabled)
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- Agent-specific configuration
  schedule_cron text,                                -- Optional cron schedule (e.g., '*/30 * * * *')
  rate_limit    jsonb DEFAULT '{"requests_per_min": 10, "ai_calls_per_hour": 100}'::jsonb,
  last_run_at   timestamptz,
  last_error    text,
  run_count     integer NOT NULL DEFAULT 0,
  error_count   integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE agent_config IS
  'SA-010: Central registry for CrewAI agents. Controls trust level, scheduling, and kill switch.';

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION fn_agent_config_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_config_updated_at ON agent_config;
CREATE TRIGGER trg_agent_config_updated_at
  BEFORE UPDATE ON agent_config
  FOR EACH ROW EXECUTE FUNCTION fn_agent_config_updated_at();

-- RLS: service_role for writes, authenticated for reads
ALTER TABLE agent_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_manage_agent_config"
  ON agent_config FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "admin_read_agent_config"
  ON agent_config FOR SELECT
  USING (auth.role() = 'authenticated');

GRANT SELECT ON agent_config TO authenticated;


-- ============================================================
-- 2. Agent Action Log
-- ============================================================
-- Every decision an agent makes is logged here, regardless of
-- trust level. In observe mode, the "result" is what the agent
-- WOULD have done. In suggest/auto modes, it's what was done.

CREATE TABLE IF NOT EXISTS agent_action_log (
  id            bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  agent_id      text NOT NULL REFERENCES agent_config(id),
  action_type   text NOT NULL,                      -- 'review', 'approve', 'reject', 'alert', 'restart'
  trust_level   text NOT NULL,                      -- Trust level at time of action
  target        text,                               -- What was acted on (e.g., content_story ID, cron job name)
  target_type   text,                               -- 'content_story', 'cron_job', 'mv_refresh', etc.
  payload       jsonb DEFAULT '{}'::jsonb,           -- Input data the agent evaluated
  result        jsonb DEFAULT '{}'::jsonb,           -- Agent's decision + reasoning
  confidence    numeric(5,4) CHECK (confidence >= 0 AND confidence <= 1),  -- 0.0000 to 1.0000
  executed      boolean NOT NULL DEFAULT false,      -- Was the action actually executed?
  override_by   uuid,                               -- User ID if overridden by human
  override_at   timestamptz,
  override_reason text,
  duration_ms   integer,                            -- How long the agent took
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_aal_agent_created ON agent_action_log (agent_id, created_at DESC);
CREATE INDEX idx_aal_target ON agent_action_log (target_type, target, created_at DESC);
CREATE INDEX idx_aal_confidence ON agent_action_log (agent_id, confidence DESC) WHERE confidence IS NOT NULL;
CREATE INDEX idx_aal_unexecuted ON agent_action_log (agent_id) WHERE executed = false;

COMMENT ON TABLE agent_action_log IS
  'SA-010: Every agent decision logged here. In observe mode = hypothetical. In suggest/auto = actual.';

-- RLS
ALTER TABLE agent_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_manage_agent_action_log"
  ON agent_action_log FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "admin_read_agent_action_log"
  ON agent_action_log FOR SELECT
  USING (auth.role() = 'authenticated');

-- Allow authenticated users to INSERT for override tracking
CREATE POLICY "admin_update_agent_action_log"
  ON agent_action_log FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT SELECT, UPDATE ON agent_action_log TO authenticated;


-- ============================================================
-- 3. Agent Credentials (Gateway API Keys)
-- ============================================================
-- Each agent gets its own API key for the gateway, enabling
-- per-agent rate limiting and audit trails.

CREATE TABLE IF NOT EXISTS agent_credentials (
  agent_id      text PRIMARY KEY REFERENCES agent_config(id),
  api_key_hash  text NOT NULL,                      -- SHA-256 hash of the API key
  consumer_name text NOT NULL,                      -- Matches api_consumers.name
  rate_tier     text NOT NULL DEFAULT 'agent',       -- Rate limit tier
  last_used_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE agent_credentials IS
  'SA-010: Per-agent gateway API keys for rate limiting and audit.';

ALTER TABLE agent_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_manage_agent_credentials"
  ON agent_credentials FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');


-- ============================================================
-- 4. Agent Summary View (for admin panel)
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
  -- Last 24h stats
  COALESCE(stats.actions_24h, 0) AS actions_24h,
  COALESCE(stats.avg_confidence_24h, 0) AS avg_confidence_24h,
  COALESCE(stats.errors_24h, 0) AS errors_24h,
  COALESCE(stats.overrides_24h, 0) AS overrides_24h,
  -- Last action
  last_action.action_type AS last_action_type,
  last_action.confidence AS last_action_confidence,
  last_action.created_at AS last_action_at
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
ORDER BY ac.display_name;

GRANT SELECT ON v_agent_dashboard TO authenticated;

COMMENT ON VIEW v_agent_dashboard IS
  'SA-010: Agent dashboard view for admin panel. Shows config, health, and 24h stats.';


-- ============================================================
-- 5. Seed Content QA Agent (Agent 1)
-- ============================================================

INSERT INTO agent_config (id, display_name, description, agent_type, trust_level, enabled, config, rate_limit)
VALUES (
  'content-qa',
  'Content QA Agent',
  'Reviews AI-generated editorial content for quality, accuracy, and brand voice. Logs approve/reject decisions with confidence scores.',
  'content_qa',
  'observe',
  true,
  jsonb_build_object(
    'review_criteria', jsonb_build_array(
      'factual_accuracy',     -- Numbers match data, no fabrication
      'brand_voice',          -- Follows editorial rules (no exclamation, no speculation)
      'data_completeness',    -- Required fields present (headline, body, source_data)
      'length_compliance',    -- 200-400 words
      'actionability'         -- Ends with actionable sentence
    ),
    'min_confidence_threshold', 0.7,
    'auto_approve_threshold', 0.95,
    'target_ef', 'generate-editorial-content',
    'approval_ef', 'approve-content'
  ),
  '{"requests_per_min": 10, "ai_calls_per_hour": 50}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Register agent as API consumer in gateway
INSERT INTO api_consumers (name, description, api_key_hash, rate_limit_override)
VALUES (
  'crewai-content-qa',
  'CrewAI Content QA Agent — observe mode',
  encode(sha256('crewai-agent-content-qa-key-placeholder'::bytea), 'hex'),
  '{"requests_per_min": 10, "ai_calls_per_hour": 50}'::jsonb
)
ON CONFLICT (name) DO NOTHING;

-- Link agent to consumer credential
INSERT INTO agent_credentials (agent_id, api_key_hash, consumer_name, rate_tier)
VALUES (
  'content-qa',
  encode(sha256('crewai-agent-content-qa-key-placeholder'::bytea), 'hex'),
  'crewai-content-qa',
  'agent'
)
ON CONFLICT (agent_id) DO NOTHING;


-- ============================================================
-- 6. HOOK: Agent-level pg_cron (future agents register here)
-- ============================================================
-- Content QA Agent runs on-demand (triggered when content is generated).
-- Future agents with schedules will get pg_cron entries here.
-- Pattern: SELECT cron.schedule('crewai-{agent_id}', schedule, $$...$$);
