-- ============================================================
-- SA-005: API Consumer Management — api_consumers table
-- Migration: v6.20-api-consumers.sql
-- ============================================================
-- Creates the api_consumers table for tracking API consumers
-- (built-in surfaces + future third-party integrations).
--
-- SCAR (Architectural Seam):
--   This table and its validation logic exist NOW, but the
--   self-service developer portal and external API key
--   registration are FUTURE work. The architecture is ready
--   when the product decision comes.
--
-- Built-in consumers seeded:
--   dashboard, extension, landing-page, admin
--
-- Future consumers (SA-010+):
--   crewai-agent-* (per-agent keys)
--   Third-party integrations (developer portal)
--
-- ADR: docs/scaling/adr-03-gateway.md
-- ============================================================

-- ── api_consumers: tracks all API consumers ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.api_consumers (
  id               BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  consumer_id      TEXT          NOT NULL UNIQUE,
  name             TEXT          NOT NULL,
  description      TEXT,
  api_key_hash     TEXT          NOT NULL UNIQUE,
  tier             TEXT          NOT NULL DEFAULT 'free',
  rate_limit_override INTEGER   DEFAULT NULL,
  is_built_in      BOOLEAN       NOT NULL DEFAULT false,
  is_active        BOOLEAN       NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  revoked_at       TIMESTAMPTZ   DEFAULT NULL,
  last_used_at     TIMESTAMPTZ   DEFAULT NULL,
  metadata         JSONB         DEFAULT '{}',

  CONSTRAINT api_consumers_tier_valid CHECK (
    tier IN ('anonymous', 'free', 'pro', 'crewai', 'admin')
  ),
  CONSTRAINT api_consumers_revoked_check CHECK (
    (is_active = true AND revoked_at IS NULL) OR
    (is_active = false)
  )
);

COMMENT ON TABLE public.api_consumers IS
  'API consumer registry for gateway authentication. '
  'Built-in consumers (dashboard, extension, landing, admin) are seeded. '
  'Future: CrewAI agent keys (SA-010) and third-party developer portal. '
  'SCAR: Table + validation exist now; self-service portal is future work. SA-005.';

COMMENT ON COLUMN public.api_consumers.consumer_id IS
  'Unique identifier for the consumer (e.g. "dashboard", "extension", "crewai-agent-scraper").';

COMMENT ON COLUMN public.api_consumers.api_key_hash IS
  'SHA-256 hash of the API key. Raw key is never stored — issued once, hashed immediately.';

COMMENT ON COLUMN public.api_consumers.rate_limit_override IS
  'If set, overrides the tier-level rate limit for this specific consumer. '
  'NULL = use tier default from rate_limits table.';

COMMENT ON COLUMN public.api_consumers.is_built_in IS
  'Built-in consumers (dashboard, extension, landing, admin) cannot be revoked via API.';

COMMENT ON COLUMN public.api_consumers.metadata IS
  'Extensible JSON metadata. Future use: contact email, webhook URL, scopes, etc.';

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_api_consumers_api_key_hash
  ON public.api_consumers (api_key_hash) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_api_consumers_consumer_id
  ON public.api_consumers (consumer_id);

CREATE INDEX IF NOT EXISTS idx_api_consumers_tier
  ON public.api_consumers (tier) WHERE is_active = true;

-- ── RLS: service-role only (same as rate_limits) ────────────────────────────

ALTER TABLE public.api_consumers ENABLE ROW LEVEL SECURITY;

-- Admin read policy for admin dashboard visibility
CREATE POLICY admin_read_api_consumers ON public.api_consumers
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── Seed built-in consumers ─────────────────────────────────────────────────
-- API keys are SHA-256 hashes of: bj_{consumer_id}_{random_suffix}
-- Actual keys are set via Vault secrets (never in source code).
-- These placeholder hashes allow the table structure to exist before
-- key generation happens at deploy time.

INSERT INTO public.api_consumers (consumer_id, name, description, api_key_hash, tier, is_built_in) VALUES
  (
    'dashboard',
    'Brilliant Jobs Dashboard',
    'Primary web dashboard — authenticated user requests',
    encode(sha256('placeholder-dashboard-key-rotate-at-deploy'::bytea), 'hex'),
    'free',
    true
  ),
  (
    'extension',
    'Brilliant Jobs Chrome Extension',
    'Browser extension — authenticated user requests via background.js',
    encode(sha256('placeholder-extension-key-rotate-at-deploy'::bytea), 'hex'),
    'free',
    true
  ),
  (
    'landing-page',
    'Brilliant Jobs Landing Page',
    'Public landing page — mostly anonymous, some authenticated preview requests',
    encode(sha256('placeholder-landing-key-rotate-at-deploy'::bytea), 'hex'),
    'anonymous',
    true
  ),
  (
    'admin',
    'Brilliant Jobs Admin Panel',
    'Admin dashboard — admin-role requests only',
    encode(sha256('placeholder-admin-key-rotate-at-deploy'::bytea), 'hex'),
    'admin',
    true
  )
ON CONFLICT (consumer_id) DO NOTHING;

-- ── updated_at trigger ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_api_consumers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.last_used_at = COALESCE(NEW.last_used_at, OLD.last_used_at);
  RETURN NEW;
END;
$$;

-- ── Consumer request tracking view (for admin dashboard) ────────────────────
-- SCAR: This view joins gateway_request_log with api_consumers for
-- per-consumer usage analytics. Admin dashboard can query this directly.

CREATE OR REPLACE VIEW public.api_consumer_usage AS
SELECT
  ac.consumer_id,
  ac.name AS consumer_name,
  ac.tier,
  ac.is_active,
  ac.last_used_at,
  COUNT(grl.id) AS total_requests_24h,
  COUNT(grl.id) FILTER (WHERE grl.created_at > now() - interval '1 hour') AS requests_last_hour
FROM public.api_consumers ac
LEFT JOIN public.gateway_request_log grl
  ON grl.tier = ac.tier
  AND grl.created_at > now() - interval '24 hours'
GROUP BY ac.consumer_id, ac.name, ac.tier, ac.is_active, ac.last_used_at;

COMMENT ON VIEW public.api_consumer_usage IS
  'Admin-facing view: per-consumer request counts (24h + 1h windows). SA-005.';
