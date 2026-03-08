-- Migration: v6.30-crewai-referral-pipeline.sql
-- SA-021: Referral Pipeline Agent (Agent 6)
-- ADR-05: CrewAI Architecture
--
-- Creates:
--   1. fn_referral_pipeline_summary()   — JSONB health snapshot for admin panel
--   2. agent_config row for referral-pipeline
--   3. api_consumers entry
--   4. agent_credentials link
--   5. pg_cron schedule (every 30min)
--
-- OBSERVE MODE: logs findings only. Never bans users, never claws back rewards.
-- All remediation requires explicit Marston action.

-- ── 1. fn_referral_pipeline_summary() ──────────────────────────────────────
-- Returns a JSONB snapshot of referral pipeline health for the admin panel.
-- Called by crewai-referral-pipeline action=status.
CREATE OR REPLACE FUNCTION fn_referral_pipeline_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_fraud   JSONB;
  v_rewards JSONB;
  v_attrib  JSONB;
BEGIN
  -- ── Fraud snapshot ──
  SELECT jsonb_build_object(
    'total_referrals',        COUNT(*),
    'active',                 COUNT(*) FILTER (WHERE status NOT IN ('rejected', 'expired')),
    'rejected',               COUNT(*) FILTER (WHERE status = 'rejected'),
    'high_fraud_score',       COUNT(*) FILTER (WHERE fraud_score >= 0.7),
    'medium_fraud_score',     COUNT(*) FILTER (WHERE fraud_score >= 0.4 AND fraud_score < 0.7),
    'avg_fraud_score',        ROUND(AVG(COALESCE(fraud_score, 0))::NUMERIC, 3),
    'recent_24h',             COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '24 hours')
  )
  INTO v_fraud
  FROM referrals;

  -- ── Reward snapshot ──
  SELECT jsonb_build_object(
    'total_rewards',          COUNT(*),
    'unclaimed',              COUNT(*) FILTER (WHERE claimed_at IS NULL AND expires_at > now()),
    'expired_unclaimed',      COUNT(*) FILTER (WHERE claimed_at IS NULL AND expires_at < now()),
    'claimed',                COUNT(*) FILTER (WHERE claimed_at IS NOT NULL),
    'expiring_7d',            COUNT(*) FILTER (WHERE claimed_at IS NULL AND expires_at BETWEEN now() AND now() + INTERVAL '7 days'),
    'total_value_usd',        ROUND(SUM(COALESCE(reward_value, 0))::NUMERIC, 2)
  )
  INTO v_rewards
  FROM referral_rewards;

  -- ── Attribution snapshot ──
  SELECT jsonb_build_object(
    'total_invites',          COUNT(*),
    'invites_with_referral',  COUNT(*) FILTER (WHERE EXISTS (
                                SELECT 1 FROM referrals r WHERE r.referrer_id = ri.user_id
                              )),
    'orphaned_invites',       COUNT(*) FILTER (WHERE NOT EXISTS (
                                SELECT 1 FROM referrals r WHERE r.referrer_id = ri.user_id
                              ) AND created_at < now() - INTERVAL '48 hours'),
    'conversion_rate_pct',    ROUND(
                                100.0 * COUNT(*) FILTER (WHERE EXISTS (
                                  SELECT 1 FROM referrals r WHERE r.referrer_id = ri.user_id
                                )) / NULLIF(COUNT(*), 0)
                              , 1)
  )
  INTO v_attrib
  FROM referral_invites ri;

  v_result := jsonb_build_object(
    'generated_at', now(),
    'fraud',   v_fraud,
    'rewards', v_rewards,
    'attribution', v_attrib
  );

  RETURN v_result;

EXCEPTION WHEN undefined_table THEN
  -- Graceful degradation if referral tables don't exist yet
  RETURN jsonb_build_object(
    'generated_at', now(),
    'error', 'referral tables not found — migration may be pending',
    'fraud', '{}'::JSONB,
    'rewards', '{}'::JSONB,
    'attribution', '{}'::JSONB
  );
END;
$$;

-- ── 2. agent_config ─────────────────────────────────────────────────────────
INSERT INTO agent_config (
  id, display_name, description, agent_type, trust_level, enabled, config, rate_limit, schedule_cron
)
VALUES (
  'referral-pipeline',
  'Referral Pipeline Agent',
  'Monitors the referral pipeline for fraud patterns, reward eligibility mismatches, and attribution gaps. Runs 3 checks every 30 minutes: fraud score monitoring, reward eligibility audit, and referral attribution validation. In observe mode: logs findings only, never bans users or claws back rewards automatically.',
  'referral_pipeline',
  'observe',
  true,
  jsonb_build_object(
    'observe_mode', true,
    'checks', jsonb_build_array('fraud_monitor', 'reward_eligibility', 'attribution_validation'),
    'thresholds', jsonb_build_object(
      'fraud_score_warn',      0.4,
      'fraud_score_critical',  0.7,
      'burst_window_hours',    24,
      'burst_max_referrals',   15,
      'reward_expiry_warn_days', 7,
      'attribution_gap_hours',   48
    ),
    'hook', 'referral_pipeline_agent_v1',
    'scar', 'future_auto_remediation_requires_trust_level_auto'
  ),
  30,
  '*/30 * * * *'
)
ON CONFLICT (id) DO UPDATE SET
  display_name  = EXCLUDED.display_name,
  description   = EXCLUDED.description,
  config        = EXCLUDED.config,
  schedule_cron = EXCLUDED.schedule_cron,
  updated_at    = now();

-- ── 3. api_consumers ─────────────────────────────────────────────────────────
INSERT INTO api_consumers (name, description, rate_limit_per_minute, is_active)
VALUES (
  'crewai-referral-pipeline',
  'CrewAI Referral Pipeline Agent — fraud monitoring, reward eligibility, attribution validation',
  30,
  true
)
ON CONFLICT (name) DO NOTHING;

-- ── 4. agent_credentials link ────────────────────────────────────────────────
INSERT INTO agent_credentials (agent_id, consumer_name)
VALUES ('referral-pipeline', 'crewai-referral-pipeline')
ON CONFLICT (agent_id) DO NOTHING;

-- ── 5. pg_cron schedule ──────────────────────────────────────────────────────
-- Run referral pipeline checks every 30 minutes
SELECT cron.schedule(
  'crewai-referral-pipeline-check',
  '*/30 * * * *',
  $$
    SELECT net.http_post(
      url    := current_setting('app.supabase_url') || '/functions/v1/api-gateway',
      headers := '{"Content-Type":"application/json","apikey":"' || current_setting('app.service_role_key') || '"}',
      body   := '{"route":"crewai-referral-pipeline","action":"check"}'
    );
  $$
)
ON CONFLICT (jobname) DO UPDATE SET
  schedule = '*/30 * * * *',
  command  = EXCLUDED.command;

-- ── 6. Log migration event ───────────────────────────────────────────────────
INSERT INTO agent_action_log (agent_id, action_type, action_data, severity, executed, notes)
VALUES (
  'referral-pipeline',
  'migration',
  jsonb_build_object(
    'migration', 'v6.30-crewai-referral-pipeline',
    'session',   'SA-021',
    'created',   jsonb_build_array(
      'fn_referral_pipeline_summary',
      'agent_config:referral-pipeline',
      'api_consumers:crewai-referral-pipeline',
      'pg_cron:crewai-referral-pipeline-check'
    )
  ),
  'ok',
  false,
  'SA-021: Referral Pipeline Agent (Agent 6) provisioned — observe mode'
);
