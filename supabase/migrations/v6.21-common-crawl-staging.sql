-- ============================================================
-- SA-007: Common Crawl Ingestion — Staging + Batch Tracking
-- ADR-06: Data Pipeline Scaling
-- ============================================================
-- Creates:
--   1. cc_staging_jobs  — mirrors ats_jobs schema + ingestion metadata
--   2. cc_batch_tracking — batch progress, segment URLs, record counts
--   3. cc_url_queue — Athena-discovered URLs awaiting WARC fetch
--   4. pg_cron job — initially manual trigger only (no auto schedule)
-- ============================================================

-- ── 1. Staging Table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cc_staging_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        uuid NOT NULL,
  ingestion_status text NOT NULL DEFAULT 'pending'
    CHECK (ingestion_status IN ('pending', 'validated', 'promoted', 'duplicate', 'rejected', 'error')),

  -- Mirror of ats_jobs core fields
  greenhouse_id   text,                      -- Will be generated: 'cc-' + hash of URL
  company_slug    text,
  company_name    text,
  title           text NOT NULL,
  location        text,
  department      text,
  url             text NOT NULL,
  content         text,
  salary_min      integer,
  salary_max      integer,
  salary_raw      text,
  salary_currency text DEFAULT 'USD',
  salary_rate     text DEFAULT 'yr',
  is_remote       boolean DEFAULT false,
  industry        text,
  job_cat         text,

  -- Location (parsed from page or schema.org)
  loc_city        text,
  loc_state       text,
  loc_country     text,
  loc_type        text,
  loc_display     text,

  -- CC-specific metadata
  source_url      text,                      -- Original Common Crawl WARC source URL
  warc_file       text,                      -- WARC filename on S3
  warc_offset     bigint,                    -- Byte offset in WARC file
  warc_length     bigint,                    -- Record length in bytes
  extraction_method text DEFAULT 'schema_org'
    CHECK (extraction_method IN ('schema_org', 'html_heuristic', 'meta_tags')),
  raw_html_hash   text,                      -- SHA-256 of source HTML (for dedup in SA-008)
  url_hash        text,                      -- SHA-256 of job URL (fast dedup)

  -- Timestamps
  discovered_at   timestamptz DEFAULT now(), -- When Athena found the URL
  fetched_at      timestamptz,               -- When WARC record was fetched
  parsed_at       timestamptz,               -- When HTML was parsed to job fields
  promoted_at     timestamptz,               -- When promoted to ats_jobs (SA-008)
  created_at      timestamptz DEFAULT now(),

  -- Error tracking
  error_message   text,
  retry_count     integer DEFAULT 0
);

-- Indexes for ingestion pipeline queries
CREATE INDEX IF NOT EXISTS idx_cc_staging_status ON cc_staging_jobs (ingestion_status);
CREATE INDEX IF NOT EXISTS idx_cc_staging_batch ON cc_staging_jobs (batch_id);
CREATE INDEX IF NOT EXISTS idx_cc_staging_url_hash ON cc_staging_jobs (url_hash);
CREATE INDEX IF NOT EXISTS idx_cc_staging_created ON cc_staging_jobs (created_at DESC);

-- Partial index: only pending records (the hot working set)
CREATE INDEX IF NOT EXISTS idx_cc_staging_pending ON cc_staging_jobs (created_at)
  WHERE ingestion_status = 'pending';

COMMENT ON TABLE cc_staging_jobs IS
  'SA-007: Common Crawl ingestion staging. Records land here before dedup (SA-008) promotes to ats_jobs.';

-- ── 2. Batch Tracking Table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cc_batch_tracking (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  segment_url     text,                      -- S3 path to WARC segment or Athena query ID
  crawl_id        text,                      -- Common Crawl crawl identifier (e.g., 'CC-MAIN-2026-09')
  batch_type      text NOT NULL DEFAULT 'athena_discovery'
    CHECK (batch_type IN ('athena_discovery', 'warc_fetch', 'html_parse', 'full_pipeline')),
  status          text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),

  -- Counts
  urls_discovered integer DEFAULT 0,         -- URLs found by Athena
  records_fetched integer DEFAULT 0,         -- WARC records successfully downloaded
  records_parsed  integer DEFAULT 0,         -- HTML successfully parsed to job fields
  records_inserted integer DEFAULT 0,        -- Records written to staging table
  records_rejected integer DEFAULT 0,        -- Records that failed validation
  records_duplicate integer DEFAULT 0,       -- Pre-insert URL hash duplicates

  -- Timing
  started_at      timestamptz,
  completed_at    timestamptz,
  duration_ms     integer,

  -- Cost tracking (S3 egress + Athena query cost)
  athena_query_id text,
  athena_cost_usd numeric(10,4),
  s3_bytes_read   bigint DEFAULT 0,
  estimated_cost  numeric(10,4),

  -- Config snapshot (what parameters were used)
  config_snapshot jsonb,

  -- Error details
  error_message   text,
  error_detail    jsonb,

  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cc_batch_status ON cc_batch_tracking (status);
CREATE INDEX IF NOT EXISTS idx_cc_batch_crawl ON cc_batch_tracking (crawl_id);
CREATE INDEX IF NOT EXISTS idx_cc_batch_created ON cc_batch_tracking (created_at DESC);

COMMENT ON TABLE cc_batch_tracking IS
  'SA-007: Tracks Common Crawl ingestion batches — discovery, fetch, parse, and cost.';

-- ── 3. URL Queue Table ──────────────────────────────────────────────────────
-- Athena discovers URLs → they land here → ingest-common-crawl fetches them

CREATE TABLE IF NOT EXISTS cc_url_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        uuid NOT NULL REFERENCES cc_batch_tracking(batch_id),
  url             text NOT NULL,
  url_hash        text NOT NULL,             -- SHA-256 for fast dedup
  warc_filename   text,                      -- Which WARC file contains this page
  warc_offset     bigint,                    -- Byte offset for range request
  warc_length     bigint,                    -- Record length
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'fetching', 'fetched', 'parsed', 'failed', 'skipped')),
  fetch_attempts  integer DEFAULT 0,
  last_error      text,
  created_at      timestamptz DEFAULT now(),
  processed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cc_queue_status ON cc_url_queue (status);
CREATE INDEX IF NOT EXISTS idx_cc_queue_batch ON cc_url_queue (batch_id);
CREATE INDEX IF NOT EXISTS idx_cc_queue_url_hash ON cc_url_queue (url_hash);

-- Partial index: pending items (the hot queue)
CREATE INDEX IF NOT EXISTS idx_cc_queue_pending ON cc_url_queue (created_at)
  WHERE status = 'pending';

-- Prevent duplicate URLs within same batch
CREATE UNIQUE INDEX IF NOT EXISTS idx_cc_queue_batch_url ON cc_url_queue (batch_id, url_hash);

COMMENT ON TABLE cc_url_queue IS
  'SA-007: URLs discovered by Athena awaiting WARC fetch. Consumed by ingest-common-crawl EF.';

-- ── 4. RLS Policies ─────────────────────────────────────────────────────────
-- These tables are backend-only (service_role access via Edge Functions).
-- No user-facing RLS needed, but enable RLS for defense-in-depth.

ALTER TABLE cc_staging_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_batch_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_url_queue ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "service_role_cc_staging" ON cc_staging_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_cc_batch" ON cc_batch_tracking
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_cc_queue" ON cc_url_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users: read-only on batch tracking (for admin dashboard)
CREATE POLICY "admin_read_cc_batch" ON cc_batch_tracking
  FOR SELECT TO authenticated USING (true);

-- ── 5. Helper Functions ─────────────────────────────────────────────────────

-- Generate a stable job ID from Common Crawl URL
CREATE OR REPLACE FUNCTION cc_job_id(job_url text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 'cc-' || encode(sha256(job_url::bytea), 'hex')
$$;

COMMENT ON FUNCTION cc_job_id IS
  'SA-007: Generates stable greenhouse_id for CC-sourced jobs. Format: cc-<sha256(url)>.';

-- Batch summary view for admin dashboard
CREATE OR REPLACE VIEW cc_batch_summary AS
SELECT
  bt.batch_id,
  bt.crawl_id,
  bt.status,
  bt.urls_discovered,
  bt.records_fetched,
  bt.records_parsed,
  bt.records_inserted,
  bt.records_duplicate,
  bt.records_rejected,
  bt.duration_ms,
  bt.estimated_cost,
  bt.started_at,
  bt.completed_at,
  (SELECT count(*) FROM cc_url_queue q WHERE q.batch_id = bt.batch_id AND q.status = 'pending') AS urls_pending,
  (SELECT count(*) FROM cc_url_queue q WHERE q.batch_id = bt.batch_id AND q.status = 'failed') AS urls_failed,
  (SELECT count(*) FROM cc_staging_jobs s WHERE s.batch_id = bt.batch_id) AS staging_count
FROM cc_batch_tracking bt
ORDER BY bt.created_at DESC;

COMMENT ON VIEW cc_batch_summary IS
  'SA-007: Admin-facing batch progress view. Shows discovery, fetch, parse, and cost metrics.';

-- ── 6. pg_cron Job (Manual Trigger Only) ────────────────────────────────────
-- Calls the ingest-common-crawl EF via gateway.
-- Initially: no cron schedule — manual invocation only.
-- SA-008 graduation: cron.schedule('0 2 * * *') for 2 AM UTC daily.

-- SCAR: This is intentionally not scheduled yet. When the pipeline is
-- validated (SA-008 dedup + SA-009 MV refresh), a cron schedule will be
-- added here. The infrastructure is ready.

-- ── 7. Batch Counter RPC ────────────────────────────────────────────────────
-- Called by ingest-common-crawl EF to atomically increment batch counters.

CREATE OR REPLACE FUNCTION cc_update_batch_counters(
  p_batch_id uuid,
  p_fetched integer DEFAULT 0,
  p_parsed integer DEFAULT 0,
  p_inserted integer DEFAULT 0,
  p_rejected integer DEFAULT 0
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE cc_batch_tracking
  SET
    records_fetched = records_fetched + p_fetched,
    records_parsed = records_parsed + p_parsed,
    records_inserted = records_inserted + p_inserted,
    records_rejected = records_rejected + p_rejected
  WHERE batch_id = p_batch_id;
END;
$$;

COMMENT ON FUNCTION cc_update_batch_counters IS
  'SA-007: Atomic batch counter increment. Called by ingest-common-crawl EF after each fetch iteration.';

-- Placeholder to document the intended cron pattern:
-- SELECT cron.schedule(
--   'cc-ingest-daily',
--   '0 2 * * *',
--   $$SELECT net.http_post(
--     'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/api-gateway/ingest-common-crawl',
--     '{"action": "run_batch", "batch_size": 10000}'::jsonb,
--     headers := '{"Authorization": "Bearer <service_role_key>", "X-API-Key": "<internal_consumer_key>"}'::jsonb
--   )$$
-- );
