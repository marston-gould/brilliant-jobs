-- FB-PI-001 S3: Application Matching + Stage Transitions
-- fn_fuzzy_match_pipeline: pg_trgm similarity-based company name matching
-- process-pipeline-signals cron: runs every 15min, staggered 7min after classify

-- ── Ensure pg_trgm extension is available ─────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── fn_fuzzy_match_pipeline ────────────────────────────────────────────────
-- Returns user_pipeline entries matching a normalised company name above threshold.
-- Used by process-pipeline-action EF for fuzzy company matching.
-- SCAR S-PI-01: LinkedIn/SMS signal sources will call same function.

CREATE OR REPLACE FUNCTION fn_fuzzy_match_pipeline(
  p_user_id   uuid,
  p_company_name text,
  p_threshold float DEFAULT 0.35,
  p_stages    text[] DEFAULT ARRAY['saved','applied','posting_closed','responded','interview']
)
RETURNS TABLE (id uuid, similarity float)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    up.id,
    GREATEST(
      similarity(lower(regexp_replace(coalesce(up.company_name, ''), '\s*(inc|llc|ltd|corp|co|company|group|technologies|solutions|labs|studios|ai|io)\.?\s*', ' ', 'gi')), p_company_name),
      similarity(lower(replace(coalesce(up.company_slug, ''), '-', ' ')), p_company_name)
    )::float AS similarity
  FROM user_pipeline up
  WHERE
    up.user_id = p_user_id
    AND up.stage = ANY(p_stages)
    AND GREATEST(
      similarity(lower(regexp_replace(coalesce(up.company_name, ''), '\s*(inc|llc|ltd|corp|co|company|group|technologies|solutions|labs|studios|ai|io)\.?\s*', ' ', 'gi')), p_company_name),
      similarity(lower(replace(coalesce(up.company_slug, ''), '-', ' ')), p_company_name)
    ) >= p_threshold
  ORDER BY similarity DESC
  LIMIT 3;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_fuzzy_match_pipeline TO authenticated, service_role;

COMMENT ON FUNCTION fn_fuzzy_match_pipeline IS
  'FB-PI-001 S3: pg_trgm fuzzy company name matcher for pipeline signal → application linking. '
  'SCAR S-PI-01: LinkedIn/SMS signal sources will call this same RPC.';

-- ── process-pipeline-signals cron ─────────────────────────────────────────
-- Staggered 7 minutes after classify cron (*/15 offset by 7 = 7,22,37,52)
DO $guard$ BEGIN
  PERFORM cron.unschedule('process-pipeline-signals');
EXCEPTION WHEN OTHERS THEN NULL;
END $guard$;

SELECT cron.schedule(
  'process-pipeline-signals',
  '7,22,37,52 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/api-gateway/process-pipeline-action',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_action_log') THEN
    INSERT INTO agent_action_log (agent_id, action_type, result_summary)
    VALUES ('system', 'migration', 'FB-PI-001-S3: fn_fuzzy_match_pipeline + process-pipeline-signals cron (7,22,37,52 * * * *)')
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
