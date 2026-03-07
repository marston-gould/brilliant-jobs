-- ============================================================
-- SA-004: API Gateway — Rate Limits + Request Log Tables
-- Migration: v6.19-gateway-rate-limits.sql
-- ============================================================
-- Creates two tables:
--   rate_limits         — configures max requests per tier + endpoint
--   gateway_request_log — sliding-window count for rate limiting
--
-- Rate limit tiers (5):
--   anonymous  — unauthenticated, 30 req/min  (public endpoints)
--   free       — free tier users, 120 req/min
--   pro        — pro/starter tier users, 300 req/min
--   crewai     — CrewAI agents, 600 req/min
--   admin      — admin users, unlimited (not enforced by rate limiter)
--
-- ADR: docs/scaling/adr-03-gateway.md
-- ============================================================

-- ── rate_limits: per-tier per-endpoint configuration ──────────────────────────

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id               BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tier             TEXT          NOT NULL,
  endpoint_pattern TEXT          NOT NULL DEFAULT '*',
  max_requests     INTEGER       NOT NULL,
  window_seconds   INTEGER       NOT NULL DEFAULT 60,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT rate_limits_tier_endpoint_unique UNIQUE (tier, endpoint_pattern),
  CONSTRAINT rate_limits_max_requests_positive CHECK (max_requests > 0),
  CONSTRAINT rate_limits_window_positive CHECK (window_seconds > 0),
  CONSTRAINT rate_limits_tier_valid CHECK (
    tier IN ('anonymous', 'free', 'pro', 'crewai', 'admin')
  )
);

COMMENT ON TABLE public.rate_limits IS
  'Gateway rate limit configuration per tier and endpoint pattern. '
  'A wildcard pattern (*) applies to all endpoints not matched by a specific pattern. '
  'Specific patterns take precedence over wildcards. SA-004.';

COMMENT ON COLUMN public.rate_limits.endpoint_pattern IS
  'Endpoint name (e.g. chat-job-search) or wildcard (*). '
  'Matches against the function name segment of /api/v1/{function-name}.';

-- ── Seed default rate limit tiers ────────────────────────────────────────────

INSERT INTO public.rate_limits (tier, endpoint_pattern, max_requests, window_seconds) VALUES
  -- Anonymous: 30 req/min across all endpoints
  ('anonymous', '*',                30,  60),

  -- Free tier: 120 req/min (burst-friendly)
  ('free',      '*',               120,  60),

  -- Pro tier: 300 req/min
  ('pro',       '*',               300,  60),

  -- CrewAI agents: 600 req/min (automation workloads)
  ('crewai',    '*',               600,  60),

  -- Tighter limits on expensive AI endpoints for lower tiers
  -- (chat-job-search calls Claude — significantly higher compute cost)
  ('anonymous', 'chat-job-search',  10,  60),
  ('free',      'chat-job-search',  20,  60),
  ('pro',       'chat-job-search',  60,  60),
  ('crewai',    'chat-job-search', 120,  60),

  -- Score endpoints: medium cost, tighter anonymous limit
  ('anonymous', 'score-resume',      5,  60),
  ('anonymous', 'score-job-fraud',  15,  60)

ON CONFLICT (tier, endpoint_pattern) DO NOTHING;

-- ── gateway_request_log: sliding-window request log ──────────────────────────

CREATE TABLE IF NOT EXISTS public.gateway_request_log (
  id               BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  window_key       TEXT          NOT NULL, -- user_id or IP for anonymous
  tier             TEXT          NOT NULL,
  endpoint_pattern TEXT          NOT NULL,
  user_id          UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.gateway_request_log IS
  'Sliding-window request log for API gateway rate limiting. '
  'Rows older than the longest window_seconds in rate_limits are pruned by pg_cron. '
  'No PII stored beyond user_id (FK to profiles). SA-004.';

-- Index for fast sliding-window count queries
CREATE INDEX IF NOT EXISTS idx_gateway_request_log_window
  ON public.gateway_request_log (window_key, tier, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gateway_request_log_created_at
  ON public.gateway_request_log (created_at DESC);

-- ── RLS: gateway tables are service-role only ─────────────────────────────────
-- The gateway EF uses service role key. No direct user access needed.

ALTER TABLE public.rate_limits         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gateway_request_log ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS — no policies needed for service-role reads/writes.
-- If admin UI reads rate_limits directly, add a read policy for admin role here.

-- ── pg_cron: prune old gateway_request_log rows daily ────────────────────────
-- Keeps the log table small. Window = 60s for all current tiers; prune > 1h.
-- Registered here as a comment — actual pg_cron job created in admin-cron-management.

-- SELECT cron.schedule(
--   'gateway-request-log-prune',
--   '0 * * * *',   -- every hour
--   $$DELETE FROM public.gateway_request_log WHERE created_at < now() - interval '1 hour';$$
-- );

-- ── updated_at trigger on rate_limits ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_rate_limits_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_rate_limits_updated_at
  BEFORE UPDATE ON public.rate_limits
  FOR EACH ROW EXECUTE FUNCTION public.set_rate_limits_updated_at();
