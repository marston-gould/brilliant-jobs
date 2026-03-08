-- ════════════════════════════════════════════════════════════════════════
-- SA-019: Database Partitioning — ats_jobs by ats_source
-- ════════════════════════════════════════════════════════════════════════
-- Pair: Data Eng + DevOps
-- Reviewer: System Architect — Scalability
--
-- Strategy: LIST partitioning on ats_source column.
--   Partition 1: ats_jobs_ats         — ATS platform records (greenhouse, lever, ashby, workable, recruitee, usajobs)
--   Partition 2: ats_jobs_common_crawl — Common Crawl ingested records
--   Partition 3: ats_jobs_amazon      — Amazon job records (future)
--   Partition 4: ats_jobs_default     — DEFAULT partition for any new sources
--
-- PostgreSQL does not support ALTER TABLE ... SET PARTITION BY on existing tables.
-- Migration approach: rename old → create partitioned → copy data → recreate objects → drop old.
--
-- HOOK: Default partition ensures new ats_source values are automatically handled.
-- SCAR: Partition detach/attach interface ready for future per-source retention policies.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 0. Pre-flight: capture row count for post-migration verification
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT COUNT(*) INTO v_count FROM ats_jobs;
  RAISE NOTICE 'SA-019 PRE-FLIGHT: ats_jobs row count = %', v_count;
  -- Store in a temp table for post-migration comparison
  CREATE TEMP TABLE _sa019_preflight (row_count bigint);
  INSERT INTO _sa019_preflight VALUES (v_count);
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Drop dependent objects that reference ats_jobs directly
-- ─────────────────────────────────────────────────────────────────────

-- 1a. Drop trigger (will be recreated on partitioned table)
DROP TRIGGER IF EXISTS trg_ats_jobs_change_log ON ats_jobs;

-- 1b. Drop RLS policies (will be recreated)
DROP POLICY IF EXISTS "public_read_ats_jobs" ON ats_jobs;
DROP POLICY IF EXISTS "admin_manage_ats_jobs" ON ats_jobs;

-- 1c. Drop indexes that will be recreated
-- (Indexes are dropped implicitly when we rename, but we drop explicitly for clarity)
DROP INDEX IF EXISTS ats_jobs_source_id_unique;
DROP INDEX IF EXISTS idx_ats_jobs_source_status;
DROP INDEX IF EXISTS idx_ats_jobs_slug_source_status;
DROP INDEX IF EXISTS idx_ats_jobs_location_structured;
DROP INDEX IF EXISTS idx_ats_jobs_status_updated;
DROP INDEX IF EXISTS idx_ats_jobs_company_name;
DROP INDEX IF EXISTS idx_ats_jobs_first_seen_status;
DROP INDEX IF EXISTS idx_ats_jobs_salary;
DROP INDEX IF EXISTS idx_ats_jobs_closed_at;
DROP INDEX IF EXISTS idx_ats_jobs_status;
DROP INDEX IF EXISTS idx_ats_jobs_loc_state;
DROP INDEX IF EXISTS idx_ats_jobs_geospatial;
DROP INDEX IF EXISTS idx_ats_jobs_updated_at;
DROP INDEX IF EXISTS idx_ats_jobs_company_slug;
DROP INDEX IF EXISTS idx_ats_jobs_remote;
DROP INDEX IF EXISTS idx_ats_jobs_title_trgm;
DROP INDEX IF EXISTS idx_ats_jobs_company_trgm;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Rename existing table
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE ats_jobs RENAME TO ats_jobs_pre_partition;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Create partitioned table with identical schema
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE ats_jobs (
  greenhouse_id       text NOT NULL,
  company_slug        text,
  company_name        text,
  title               text NOT NULL,
  location            text,
  department          text,
  url                 text,
  updated_at          timestamptz,
  last_seen           timestamptz DEFAULT now(),
  created_at          timestamptz DEFAULT now(),
  content             text,
  first_seen_at       timestamptz DEFAULT now(),
  lat                 double precision,
  lng                 double precision,
  location_normalized text,
  is_remote           boolean DEFAULT false,
  status              text DEFAULT 'open'::text,
  closed_at           timestamptz,
  salary_min          integer,
  salary_max          integer,
  salary_raw          text,
  loc_city            text,
  loc_state           text,
  loc_country         text,
  loc_type            text,
  loc_display         text,
  loc_multi           boolean DEFAULT false,
  search_vector       tsvector,
  job_lat             double precision,
  job_lng             double precision,
  salary_currency     text DEFAULT 'USD'::text,
  salary_rate         text DEFAULT 'yr'::text,
  industry            text,
  ats_source          text DEFAULT 'greenhouse'::text NOT NULL,
  job_cat             text
) PARTITION BY LIST (ats_source);

COMMENT ON TABLE ats_jobs IS
  'SA-019: LIST-partitioned by ats_source. Partitions: ats (6 ATS platforms), common_crawl, amazon, default.';

-- ─────────────────────────────────────────────────────────────────────
-- 4. Create partitions
-- ─────────────────────────────────────────────────────────────────────

-- Partition 1: ATS platform records
CREATE TABLE ats_jobs_ats PARTITION OF ats_jobs
  FOR VALUES IN ('greenhouse', 'lever', 'ashby', 'workable', 'recruitee', 'usajobs');
COMMENT ON TABLE ats_jobs_ats IS 'SA-019: ATS platform records (greenhouse, lever, ashby, workable, recruitee, usajobs).';

-- Partition 2: Common Crawl ingested records
CREATE TABLE ats_jobs_common_crawl PARTITION OF ats_jobs
  FOR VALUES IN ('common_crawl');
COMMENT ON TABLE ats_jobs_common_crawl IS 'SA-019: Common Crawl ingested records. Independent retention + vacuum schedule.';

-- Partition 3: Amazon job records (future)
CREATE TABLE ats_jobs_amazon PARTITION OF ats_jobs
  FOR VALUES IN ('amazon');
COMMENT ON TABLE ats_jobs_amazon IS 'SA-019: Amazon job records. SCAR — partition ready for when Amazon source is activated.';

-- Partition 4: Default for future sources
CREATE TABLE ats_jobs_default PARTITION OF ats_jobs DEFAULT;
COMMENT ON TABLE ats_jobs_default IS 'SA-019: Default partition. Catches any new ats_source values not yet assigned a dedicated partition.';

-- ─────────────────────────────────────────────────────────────────────
-- 5. Migrate data from old table into partitioned table
-- ─────────────────────────────────────────────────────────────────────
-- Rows route automatically to correct partition based on ats_source value.
-- Any ats_source value not matching ats/common_crawl/amazon goes to default.

INSERT INTO ats_jobs (
  greenhouse_id, company_slug, company_name, title, location, department,
  url, updated_at, last_seen, created_at, content, first_seen_at,
  lat, lng, location_normalized, is_remote, status, closed_at,
  salary_min, salary_max, salary_raw, loc_city, loc_state, loc_country,
  loc_type, loc_display, loc_multi, search_vector, job_lat, job_lng,
  salary_currency, salary_rate, industry, ats_source, job_cat
)
SELECT
  greenhouse_id, company_slug, company_name, title, location, department,
  url, updated_at, last_seen, created_at, content, first_seen_at,
  lat, lng, location_normalized, is_remote, status, closed_at,
  salary_min, salary_max, salary_raw, loc_city, loc_state, loc_country,
  loc_type, loc_display, loc_multi, search_vector, job_lat, job_lng,
  salary_currency, salary_rate, industry, COALESCE(ats_source, 'greenhouse'), job_cat
FROM ats_jobs_pre_partition;

-- ─────────────────────────────────────────────────────────────────────
-- 6. Verify row counts match
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_before bigint;
  v_after  bigint;
BEGIN
  SELECT row_count INTO v_before FROM _sa019_preflight;
  SELECT COUNT(*) INTO v_after FROM ats_jobs;
  IF v_before != v_after THEN
    RAISE EXCEPTION 'SA-019 DATA LOSS DETECTED: before=%, after=%', v_before, v_after;
  END IF;
  RAISE NOTICE 'SA-019 VERIFIED: % rows migrated successfully (before=%, after=%)', v_after, v_before, v_after;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 7. Recreate indexes on partitioned table
--    PostgreSQL automatically creates matching indexes on each partition.
-- ─────────────────────────────────────────────────────────────────────

-- Unique constraint (partition key ats_source is already included)
CREATE UNIQUE INDEX ats_jobs_source_id_unique
  ON ats_jobs (greenhouse_id, ats_source);

-- Existing indexes from baseline
CREATE INDEX idx_ats_jobs_location_structured
  ON ats_jobs (loc_country, loc_state, loc_city) WHERE status = 'open';

CREATE INDEX idx_ats_jobs_source_status
  ON ats_jobs (ats_source, status);

CREATE INDEX idx_ats_jobs_status_updated
  ON ats_jobs (status, updated_at DESC);

CREATE INDEX idx_ats_jobs_company_name
  ON ats_jobs (company_name);

CREATE INDEX idx_ats_jobs_slug_source_status
  ON ats_jobs (company_slug, ats_source, status);

CREATE INDEX idx_ats_jobs_first_seen_status
  ON ats_jobs (first_seen_at, status) WHERE status = 'open';

CREATE INDEX idx_ats_jobs_salary
  ON ats_jobs (salary_min, salary_max) WHERE salary_min IS NOT NULL;

CREATE INDEX idx_ats_jobs_closed_at
  ON ats_jobs (closed_at) WHERE closed_at IS NOT NULL;

-- Performance indexes from cs015
CREATE INDEX idx_ats_jobs_status
  ON ats_jobs (status);

CREATE INDEX idx_ats_jobs_loc_state
  ON ats_jobs (loc_state) WHERE status = 'open';

CREATE INDEX idx_ats_jobs_geospatial
  ON ats_jobs (job_lat, job_lng) WHERE job_lat IS NOT NULL AND job_lng IS NOT NULL;

CREATE INDEX idx_ats_jobs_updated_at
  ON ats_jobs (updated_at DESC);

CREATE INDEX idx_ats_jobs_company_slug
  ON ats_jobs (company_slug);

CREATE INDEX idx_ats_jobs_remote
  ON ats_jobs (is_remote) WHERE is_remote = true;

-- GIN trgm indexes from SA-008 (dedup engine)
CREATE INDEX idx_ats_jobs_title_trgm
  ON ats_jobs USING gin (lower(title) gin_trgm_ops);

CREATE INDEX idx_ats_jobs_company_trgm
  ON ats_jobs USING gin (lower(company_name) gin_trgm_ops);

-- Full-text search index (if search_vector is populated)
CREATE INDEX idx_ats_jobs_search_vector
  ON ats_jobs USING gin (search_vector) WHERE search_vector IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 8. Recreate RLS policies
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE ats_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_ats_jobs"
  ON ats_jobs FOR SELECT
  USING (true);

CREATE POLICY "admin_manage_ats_jobs"
  ON ats_jobs FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ─────────────────────────────────────────────────────────────────────
-- 9. Recreate change_log trigger
-- ─────────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_ats_jobs_change_log
  AFTER INSERT OR UPDATE OR DELETE ON ats_jobs
  FOR EACH ROW EXECUTE FUNCTION fn_ats_jobs_change_log();

-- ─────────────────────────────────────────────────────────────────────
-- 10. Drop old table
-- ─────────────────────────────────────────────────────────────────────
DROP TABLE ats_jobs_pre_partition;

-- ─────────────────────────────────────────────────────────────────────
-- 11. Partition maintenance: per-partition vacuum + analyze schedules
-- ─────────────────────────────────────────────────────────────────────

-- ATS partition: vacuum nightly (bulk data, updated by crawlers)
SELECT cron.schedule(
  'vacuum-ats-jobs-ats',
  '0 4 * * *',  -- 4 AM UTC daily
  $$VACUUM ANALYZE ats_jobs_ats$$
);

-- Common Crawl partition: vacuum after ingestion windows (6 AM UTC, after 2-6 AM ingestion)
SELECT cron.schedule(
  'vacuum-ats-jobs-common-crawl',
  '0 6 * * *',  -- 6 AM UTC daily
  $$VACUUM ANALYZE ats_jobs_common_crawl$$
);

-- Amazon partition: weekly (low volume until activated)
SELECT cron.schedule(
  'vacuum-ats-jobs-amazon',
  '0 4 * * 0',  -- 4 AM UTC Sunday
  $$VACUUM ANALYZE ats_jobs_amazon$$
);

-- Default partition: weekly
SELECT cron.schedule(
  'vacuum-ats-jobs-default',
  '0 4 * * 0',  -- 4 AM UTC Sunday
  $$VACUUM ANALYZE ats_jobs_default$$
);

-- ─────────────────────────────────────────────────────────────────────
-- 12. Partition monitoring: summary view
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_partition_stats AS
SELECT
  schemaname,
  relname AS partition_name,
  n_live_tup AS estimated_rows,
  n_dead_tup AS dead_tuples,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze,
  pg_size_pretty(pg_relation_size(relid)) AS partition_size,
  pg_size_pretty(pg_indexes_size(relid)) AS index_size,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
WHERE relname LIKE 'ats_jobs_%'
  AND relname != 'ats_jobs_change_log'
ORDER BY n_live_tup DESC;

COMMENT ON VIEW v_partition_stats IS
  'SA-019: Per-partition size, row count, vacuum status, and dead tuple monitoring.';

-- ─────────────────────────────────────────────────────────────────────
-- 13. Partition health function (for CrewAI data freshness agent)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_partition_health()
RETURNS TABLE (
  partition_name text,
  estimated_rows bigint,
  dead_tuple_ratio numeric,
  last_vacuum_age interval,
  needs_vacuum boolean,
  partition_size text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.relname::text,
    s.n_live_tup,
    CASE WHEN s.n_live_tup > 0
      THEN ROUND(s.n_dead_tup::numeric / s.n_live_tup, 4)
      ELSE 0
    END,
    COALESCE(now() - s.last_vacuum, now() - s.last_autovacuum, '999 days'::interval),
    COALESCE(s.n_dead_tup > s.n_live_tup * 0.1, true),
    pg_size_pretty(pg_total_relation_size(s.relid))
  FROM pg_stat_user_tables s
  WHERE s.relname LIKE 'ats_jobs_%'
    AND s.relname != 'ats_jobs_change_log'
  ORDER BY s.n_live_tup DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_partition_health IS
  'SA-019: Partition health check for monitoring and CrewAI data freshness agent. Returns dead tuple ratio, vacuum age, and size per partition.';

-- ─────────────────────────────────────────────────────────────────────
-- 14. Log to agent_action_log (CrewAI integration)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO agent_action_log (agent_id, action_type, details, executed)
SELECT
  id,
  'partition_migration',
  jsonb_build_object(
    'event', 'SA-019: ats_jobs partitioned by ats_source',
    'partitions', jsonb_build_array('ats_jobs_ats', 'ats_jobs_common_crawl', 'ats_jobs_amazon', 'ats_jobs_default'),
    'timestamp', now()
  ),
  false
FROM agent_config
WHERE agent_name = 'data-freshness'
LIMIT 1;

-- Clean up temp table
DROP TABLE IF EXISTS _sa019_preflight;

COMMIT;
