-- SA-011: CrewAI Agents 2–3 — Pipeline Health + Data Freshness
-- ADR-05: CrewAI Architecture
-- Depends on: v6.24-crewai-agent-framework.sql (SA-010)
--
-- Creates:
--   1. agent_config rows for pipeline-health and data-freshness
--   2. api_consumers entries for both agents
--   3. agent_credentials links
--   4. pg_cron schedules (pipeline-health every 30min, data-freshness every 6hr)

-- ============================================================
-- 1. AGENT 2: Pipeline Health
-- ============================================================
INSERT INTO agent_config (id, display_name, description, agent_type, trust_level, enabled, config, rate_limit, schedule_cron)
VALUES (
  'pipeline-health',
  'Pipeline Health Agent',
  'Monitors cron execution, detects failures and missed runs, tracks Edge Function error rates, and logs recommended remediation actions. Daily summary report.',
  'pipeline_health',
  'observe',
  true,
  jsonb_build_object(
    'checks', jsonb_build_array(
      'cron_execution',       -- pg_cron job_run_details: failed/missed runs
      'ef_error_rate',        -- Edge Function invocation errors
      'queue_depth',          -- enrichment_queue backlog
      'batch_stalls',         -- cc_batch_tracking stalled batches
      'alert_threshold_pct',  -- Alert if failure rate > this
      'daily_summary'         -- Compile 24h summary for admin panel
    ),
    'failure_threshold_pct', 5,        -- Alert if > 5% failure rate
    'stall_threshold_min', 60,         -- Batch stalled if no progress in 60min
    'queue_backlog_warn', 500,         -- Warn if enrichment_queue > 500 pending
    'queue_backlog_critical', 2000,    -- Critical if > 2000 pending
    'lookback_hours', 24               -- Default analysis window
  ),
  '{"requests_per_min": 5, "ai_calls_per_hour": 0}'::jsonb,
  '*/30 * * * *'  -- Every 30 minutes
)
ON CONFLICT (id) DO NOTHING;

-- Register as API consumer
INSERT INTO api_consumers (name, description, api_key_hash, rate_limit_override)
VALUES (
  'crewai-pipeline-health',
  'CrewAI Pipeline Health Agent — observe mode',
  encode(sha256('crewai-agent-pipeline-health-key-placeholder'::bytea), 'hex'),
  '{"requests_per_min": 5, "ai_calls_per_hour": 0}'::jsonb
)
ON CONFLICT (name) DO NOTHING;

-- Link agent to consumer credential
INSERT INTO agent_credentials (agent_id, api_key_hash, consumer_name, rate_tier)
VALUES (
  'pipeline-health',
  encode(sha256('crewai-agent-pipeline-health-key-placeholder'::bytea), 'hex'),
  'crewai-pipeline-health',
  'agent'
)
ON CONFLICT (agent_id) DO NOTHING;


-- ============================================================
-- 2. AGENT 3: Data Freshness
-- ============================================================
INSERT INTO agent_config (id, display_name, description, agent_type, trust_level, enabled, config, rate_limit, schedule_cron)
VALUES (
  'data-freshness',
  'Data Freshness Agent',
  'Monitors materialized view staleness, sync lag between source tables and MVs, ingestion pipeline progress, and data completeness. Weekly freshness report.',
  'data_freshness',
  'observe',
  true,
  jsonb_build_object(
    'checks', jsonb_build_array(
      'mv_staleness',         -- mv_refresh_log: time since last successful refresh
      'sync_lag',             -- Delta between ats_jobs max updated_at and MV refresh
      'ingestion_progress',   -- cc_batch_tracking completion rates
      'data_completeness',    -- Null rates in critical columns
      'dedup_health',         -- dedup_log success rate
      'weekly_report'         -- Compile 7-day trend for admin panel
    ),
    'mv_stale_warn_min', 60,           -- MV stale warning at 60min
    'mv_stale_critical_min', 360,      -- MV critical at 6 hours
    'sync_lag_warn_min', 30,           -- Sync lag warning at 30min
    'null_rate_warn_pct', 10,          -- Warn if > 10% nulls in critical columns
    'null_rate_critical_pct', 25,      -- Critical if > 25% nulls
    'lookback_days', 7                 -- Default trend analysis window
  ),
  '{"requests_per_min": 3, "ai_calls_per_hour": 0}'::jsonb,
  '0 */6 * * *'  -- Every 6 hours
)
ON CONFLICT (id) DO NOTHING;

-- Register as API consumer
INSERT INTO api_consumers (name, description, api_key_hash, rate_limit_override)
VALUES (
  'crewai-data-freshness',
  'CrewAI Data Freshness Agent — observe mode',
  encode(sha256('crewai-agent-data-freshness-key-placeholder'::bytea), 'hex'),
  '{"requests_per_min": 3, "ai_calls_per_hour": 0}'::jsonb
)
ON CONFLICT (name) DO NOTHING;

-- Link agent to consumer credential
INSERT INTO agent_credentials (agent_id, api_key_hash, consumer_name, rate_tier)
VALUES (
  'data-freshness',
  encode(sha256('crewai-agent-data-freshness-key-placeholder'::bytea), 'hex'),
  'crewai-data-freshness',
  'agent'
)
ON CONFLICT (agent_id) DO NOTHING;


-- ============================================================
-- 3. pg_cron schedules for both agents
-- ============================================================
-- Pipeline Health: every 30 minutes
SELECT cron.schedule(
  'crewai-pipeline-health',
  '*/30 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/api-gateway/crewai-pipeline-health',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"triggered_by": "cron"}'::jsonb
  )$$
);

-- Data Freshness: every 6 hours
SELECT cron.schedule(
  'crewai-data-freshness',
  '0 */6 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/api-gateway/crewai-data-freshness',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"triggered_by": "cron"}'::jsonb
  )$$
);


-- ============================================================
-- 4. HOOK: Daily summary email trigger (future: when agents graduate to 'suggest')
-- ============================================================
-- When pipeline-health reaches 'suggest' trust level, a daily
-- summary email can be sent to Marston via send-notification EF.
-- Pattern: Add a function that checks trust_level and sends
-- a digest of all observe-mode findings from the past 24h.
-- This is a SCAR point — ready when graduation happens.
