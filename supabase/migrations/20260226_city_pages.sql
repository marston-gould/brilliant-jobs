-- Migration: 20260226_city_pages.sql
-- Sprint: City Pages + Internal Linking
-- Creates: city_pages, city_popular_pills

-- ============================================================
-- city_pages — one row per city with aggregated job market stats
-- ============================================================
CREATE TABLE IF NOT EXISTS city_pages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text UNIQUE NOT NULL,          -- "san-francisco", "new-york", "remote"
  city_name       text NOT NULL,                 -- Display: "San Francisco", "New York"
  state           text,                          -- "CA", "NY" — null for "remote"
  country         text DEFAULT 'US',
  job_count       int NOT NULL DEFAULT 0,
  median_salary   int,
  top_companies   jsonb,                         -- [{name, count, slug}] top 15
  remote_pct      numeric(4,1),
  meta_title      text,                          -- SEO: auto-generated or manual override
  meta_description text,
  top_titles      jsonb,                         -- [{title, count}] top 15 normalized titles
  top_skills      jsonb,                         -- [{skill, count, pct}] top 15 from JD parsing
  top_industries  jsonb,                         -- [{industry, count}] top 10 from PDL data
  stats_updated_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE city_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "city_pages_anon_select" ON city_pages;
CREATE POLICY "city_pages_anon_select" ON city_pages
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "city_pages_auth_select" ON city_pages;
CREATE POLICY "city_pages_auth_select" ON city_pages
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_city_pages_slug ON city_pages(slug);
CREATE INDEX IF NOT EXISTS idx_city_pages_job_count ON city_pages(job_count DESC);

-- ============================================================
-- city_popular_pills — Phase 2 schema, populated later
-- Tracks user search pill popularity per city for demand-side hooks
-- ============================================================
CREATE TABLE IF NOT EXISTS city_popular_pills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_slug       text NOT NULL REFERENCES city_pages(slug),
  pill_text       text NOT NULL,
  pill_category   text NOT NULL CHECK (pill_category IN ('title', 'skill', 'industry', 'company')),
  user_count      int NOT NULL DEFAULT 0,
  user_count_7d_ago int,
  job_count       int,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(city_slug, pill_text, pill_category)
);

ALTER TABLE city_popular_pills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "city_popular_pills_anon_select" ON city_popular_pills;
CREATE POLICY "city_popular_pills_anon_select" ON city_popular_pills
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "city_popular_pills_auth_select" ON city_popular_pills;
CREATE POLICY "city_popular_pills_auth_select" ON city_popular_pills
  FOR SELECT TO authenticated USING (true);
