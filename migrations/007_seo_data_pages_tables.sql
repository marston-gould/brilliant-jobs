-- Migration 004: SEO Data Pages Tables
-- Applied: 2026-02-23
-- Purpose: Create mapping and cache tables for public SEO data pages (P11)
-- Brief: seo-data-pages-handoff-v2.md

-- =============================================================================
-- 1. seo_metro_map — Maps URL slugs to city/state matching logic
-- =============================================================================
CREATE TABLE IF NOT EXISTS seo_metro_map (
  slug TEXT PRIMARY KEY,                -- 'new-york', 'austin', etc.
  display_name TEXT NOT NULL,           -- 'New York City', 'Austin, TX'
  city_variants TEXT[] NOT NULL,        -- ARRAY['New York', 'NYC', 'Manhattan', 'Brooklyn']
  state_code TEXT,                      -- 'NY', 'TX', etc.
  exclude_cities TEXT[],                -- Cities to exclude when matching by state
  loc_type_override TEXT,               -- For 'remote' pseudo-metro: 'remote'
  min_job_threshold INTEGER DEFAULT 200,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0          -- For controlling display order in leaderboards
);

-- =============================================================================
-- 2. seo_role_map — Maps URL slugs to title keyword matching logic
-- =============================================================================
CREATE TABLE IF NOT EXISTS seo_role_map (
  slug TEXT PRIMARY KEY,                -- 'product-manager', 'software-engineer'
  display_name TEXT NOT NULL,           -- 'Product Manager', 'Software Engineer'
  keywords TEXT[] NOT NULL,             -- ARRAY['product manager', 'product lead']
  exclude_keywords TEXT[],              -- ARRAY['product marketing']
  min_job_threshold INTEGER DEFAULT 300,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0
);

-- =============================================================================
-- 3. seo_page_cache — Pre-computed aggregates for public pages
-- =============================================================================
CREATE TABLE IF NOT EXISTS seo_page_cache (
  cache_key TEXT PRIMARY KEY,           -- e.g., 'metro:new-york' or 'metro:new-york:product-manager'
  page_type TEXT NOT NULL,              -- 'market', 'metro', 'trends'
  data JSONB NOT NULL,                  -- pre-computed chart data + stat values + comparison rankings
  job_count INTEGER NOT NULL,           -- for threshold checks
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_seo_cache_type ON seo_page_cache(page_type);
CREATE INDEX IF NOT EXISTS idx_seo_cache_expiry ON seo_page_cache(expires_at);

-- =============================================================================
-- 4. RLS — Public read, service-role write
-- =============================================================================
ALTER TABLE seo_metro_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_role_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_page_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_seo_metro_map" ON seo_metro_map FOR SELECT USING (true);
CREATE POLICY "public_read_seo_role_map" ON seo_role_map FOR SELECT USING (true);
CREATE POLICY "public_read_seo_page_cache" ON seo_page_cache FOR SELECT USING (true);

-- =============================================================================
-- Seed: 15 metros (see seo-data-pages-handoff-v2.md for full list)
-- Seed: 20 roles (see seo-data-pages-handoff-v2.md for full list)
-- Seeded via PostgREST INSERT in deployment script, not inline SQL,
-- to keep migration idempotent (IF NOT EXISTS on tables).
-- =============================================================================

-- =============================================================================
-- ROLLBACK (uncomment to revert)
-- =============================================================================
-- DROP POLICY IF EXISTS "public_read_seo_page_cache" ON seo_page_cache;
-- DROP POLICY IF EXISTS "public_read_seo_role_map" ON seo_role_map;
-- DROP POLICY IF EXISTS "public_read_seo_metro_map" ON seo_metro_map;
-- DROP TABLE IF EXISTS seo_page_cache;
-- DROP TABLE IF EXISTS seo_role_map;
-- DROP TABLE IF EXISTS seo_metro_map;
