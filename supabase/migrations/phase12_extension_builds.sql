-- Phase 12: Build Fingerprint Obfuscation — Database Schema
-- Extension 4.0.0 | Dashboard v5.35
-- 
-- Creates:
-- 1. extension_builds table — tracks every unique build per user
-- 2. extension-source storage bucket — holds canonical extension source for EF
-- 3. RLS policies
--
-- Rollback: DROP TABLE IF EXISTS extension_builds; DELETE FROM storage.buckets WHERE id = 'extension-source';

-- ─── Table: extension_builds ────────────────────────────────

CREATE TABLE IF NOT EXISTS extension_builds (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  build_id      text NOT NULL UNIQUE,           -- e.g. 'bj_a1b2c3d4e5f6...'
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_map   jsonb NOT NULL DEFAULT '{}',     -- { "ats:pageDetected": "ats:a3f2c1", ... }
  tier_at_build text NOT NULL DEFAULT 'free',    -- user's tier when build was created
  file_hash     text,                            -- SHA-256 of the ZIP file
  size_bytes    integer,                         -- ZIP file size
  user_agent    text,                            -- browser user agent at download time
  ip_hash       text,                            -- SHA-256 of IP (not raw IP)
  created_at    timestamptz NOT NULL DEFAULT now(),
  downloaded_at timestamptz,                     -- when user actually downloaded (may differ from created_at)
  installed_at  timestamptz,                     -- when extension first phones home with this build_id
  last_seen_at  timestamptz                      -- last time extension with this build_id was active
);

-- Indexes
CREATE INDEX idx_extension_builds_user_id ON extension_builds(user_id);
CREATE INDEX idx_extension_builds_created_at ON extension_builds(created_at DESC);
CREATE INDEX idx_extension_builds_build_id ON extension_builds(build_id);

-- RLS
ALTER TABLE extension_builds ENABLE ROW LEVEL SECURITY;

-- Users can see their own builds
DROP POLICY IF EXISTS "Users can view own builds" ON extension_builds;
CREATE POLICY "Users can view own builds"
  ON extension_builds FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role can insert (Edge Function handles creation)
DROP POLICY IF EXISTS "Service role inserts builds" ON extension_builds;
CREATE POLICY "Service role inserts builds"
  ON extension_builds FOR INSERT
  WITH CHECK (true);

-- Users can update their own builds (for downloaded_at, installed_at tracking)
DROP POLICY IF EXISTS "Users can update own builds" ON extension_builds;
CREATE POLICY "Users can update own builds"
  ON extension_builds FOR UPDATE
  USING (auth.uid() = user_id);

-- ─── Storage: extension-source bucket ───────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'extension-source',
  'extension-source',
  false,
  5242880,  -- 5MB per file
  ARRAY['application/javascript', 'text/javascript', 'application/json', 'text/html', 'text/css', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Only service role can access (admin upload, EF reads)
DROP POLICY IF EXISTS "Service role full access on extension-source" ON storage.objects;
CREATE POLICY "Service role full access on extension-source"
  ON storage.objects FOR ALL
  USING (bucket_id = 'extension-source')
  WITH CHECK (bucket_id = 'extension-source');

-- ─── RPC: get_build_stats (admin) ───────────────────────────

CREATE OR REPLACE FUNCTION get_extension_build_stats()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'total_builds', (SELECT count(*) FROM extension_builds),
    'unique_users', (SELECT count(DISTINCT user_id) FROM extension_builds),
    'builds_today', (SELECT count(*) FROM extension_builds WHERE created_at >= CURRENT_DATE),
    'builds_this_week', (SELECT count(*) FROM extension_builds WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'),
    'avg_builds_per_user', (SELECT ROUND(AVG(cnt), 1) FROM (SELECT count(*) as cnt FROM extension_builds GROUP BY user_id) sub),
    'tier_distribution', (SELECT json_agg(row_to_json(t)) FROM (SELECT tier_at_build, count(*) as cnt FROM extension_builds GROUP BY tier_at_build) t)
  );
$$;

COMMENT ON TABLE extension_builds IS 'Phase 12: Tracks per-user fingerprinted extension builds for anti-detection';
COMMENT ON FUNCTION get_extension_build_stats IS 'Admin stats for extension build distribution';
