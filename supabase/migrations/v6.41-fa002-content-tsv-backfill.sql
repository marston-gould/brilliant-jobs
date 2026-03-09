-- FA-002: Backfill content_tsv + Enrichment Cron
-- Resolves FA-F08: content_tsv coverage gap (40% of open jobs) + no ongoing JD AI enrichment
--
-- What this migration does:
--   1. Adds content_tsv tsvector column to ats_jobs (propagates to all partitions)
--   2. Creates trigger to auto-populate content_tsv on INSERT/UPDATE of content or title
--   3. Creates GIN index for fast full-text search
--   4. Creates batch backfill function (processes 10K rows per call)
--   5. Creates pg_cron for continuous backfill until caught up
--   6. Creates enrichment gap fixer: marks new jobs for AI enrichment
--   7. Adds jd_enrich_retry_count for failure tracking
--   8. Creates monitoring view

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Add content_tsv column to partitioned ats_jobs table
-- ─────────────────────────────────────────────────────────────────────
-- This propagates to all partitions automatically (ats_jobs_ats, ats_jobs_common_crawl,
-- ats_jobs_amazon, ats_jobs_default)
ALTER TABLE ats_jobs ADD COLUMN IF NOT EXISTS content_tsv tsvector;

COMMENT ON COLUMN ats_jobs.content_tsv IS
  'FA-002: tsvector generated from title (weight A) + content (weight B). Used by FA-001 content search, JD CONTAINS pills. GIN-indexed.';

-- ─────────────────────────────────────────────────────────────────────
-- 2. Add jd_enrich_retry_count for failure tracking
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE ats_jobs ADD COLUMN IF NOT EXISTS jd_enrich_retry_count integer DEFAULT 0;

COMMENT ON COLUMN ats_jobs.jd_enrich_retry_count IS
  'FA-002: Tracks failed AI enrichment attempts. Jobs with retry_count >= 3 are skipped by the enrichment cron.';

-- ─────────────────────────────────────────────────────────────────────
-- 3. Trigger function: auto-populate content_tsv on content/title change
-- ─────────────────────────────────────────────────────────────────────
-- Weighted: title terms get rank A (highest), content terms get rank B
-- HTML tags stripped from content before tsvector generation
CREATE OR REPLACE FUNCTION fn_update_content_tsv()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  clean_content text;
BEGIN
  -- Strip HTML tags from content
  clean_content := regexp_replace(COALESCE(NEW.content, ''), '<[^>]+>', ' ', 'g');
  -- Strip HTML entities
  clean_content := regexp_replace(clean_content, '&[a-zA-Z]+;', ' ', 'g');
  -- Collapse whitespace
  clean_content := regexp_replace(clean_content, '\s+', ' ', 'g');

  -- Generate weighted tsvector: title=A, content=B
  NEW.content_tsv :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', clean_content), 'B');

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_update_content_tsv() IS
  'FA-002: Trigger function. Generates content_tsv tsvector from title (A weight) + HTML-stripped content (B weight).';

-- ─────────────────────────────────────────────────────────────────────
-- 4. Create trigger on ats_jobs (propagates to all partitions)
-- ─────────────────────────────────────────────────────────────────────
-- Fires BEFORE INSERT/UPDATE so the tsvector is written in the same operation
DROP TRIGGER IF EXISTS trg_content_tsv ON ats_jobs;
CREATE TRIGGER trg_content_tsv
  BEFORE INSERT OR UPDATE OF content, title ON ats_jobs
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_content_tsv();

COMMENT ON TRIGGER trg_content_tsv ON ats_jobs IS
  'FA-002: Auto-populates content_tsv when content or title changes.';

-- ─────────────────────────────────────────────────────────────────────
-- 5. GIN index for full-text search on content_tsv
-- ─────────────────────────────────────────────────────────────────────
-- Conditional: only index non-NULL rows to save space
CREATE INDEX IF NOT EXISTS idx_ats_jobs_content_tsv
  ON ats_jobs USING gin (content_tsv)
  WHERE content_tsv IS NOT NULL;

COMMENT ON INDEX idx_ats_jobs_content_tsv IS
  'FA-002: GIN index on content_tsv for O(log n) full-text search. Used by FA-001 What pills + JD CONTAINS pills.';

-- ─────────────────────────────────────────────────────────────────────
-- 6. Batch backfill function
-- ─────────────────────────────────────────────────────────────────────
-- Processes p_batch_size rows per call, targeting jobs with content but NULL content_tsv
-- Also handles title-only jobs (no content): generates tsvector from title alone
CREATE OR REPLACE FUNCTION fn_backfill_content_tsv(p_batch_size integer DEFAULT 10000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_content integer := 0;
  v_updated_title_only integer := 0;
  v_remaining integer := 0;
  v_start timestamptz := clock_timestamp();
BEGIN
  -- Batch 1: Jobs with content but NULL content_tsv
  WITH batch AS (
    SELECT greenhouse_id
    FROM ats_jobs
    WHERE content IS NOT NULL
      AND content_tsv IS NULL
      AND status = 'open'
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE ats_jobs aj
  SET content_tsv =
    setweight(to_tsvector('english', COALESCE(aj.title, '')), 'A') ||
    setweight(to_tsvector('english',
      regexp_replace(
        regexp_replace(
          regexp_replace(COALESCE(aj.content, ''), '<[^>]+>', ' ', 'g'),
          '&[a-zA-Z]+;', ' ', 'g'),
        '\s+', ' ', 'g')
    ), 'B')
  FROM batch b
  WHERE aj.greenhouse_id = b.greenhouse_id;

  GET DIAGNOSTICS v_updated_content = ROW_COUNT;

  -- Batch 2: Jobs with title but NO content and NULL content_tsv
  -- These get a title-only tsvector so they're at least title-searchable
  IF v_updated_content < p_batch_size THEN
    WITH batch AS (
      SELECT greenhouse_id
      FROM ats_jobs
      WHERE content IS NULL
        AND content_tsv IS NULL
        AND title IS NOT NULL
        AND status = 'open'
      LIMIT (p_batch_size - v_updated_content)
      FOR UPDATE SKIP LOCKED
    )
    UPDATE ats_jobs aj
    SET content_tsv = setweight(to_tsvector('english', COALESCE(aj.title, '')), 'A')
    FROM batch b
    WHERE aj.greenhouse_id = b.greenhouse_id;

    GET DIAGNOSTICS v_updated_title_only = ROW_COUNT;
  END IF;

  -- Count remaining
  SELECT count(*) INTO v_remaining
  FROM ats_jobs
  WHERE content_tsv IS NULL
    AND status = 'open'
    AND (content IS NOT NULL OR title IS NOT NULL);

  RETURN jsonb_build_object(
    'updated_with_content', v_updated_content,
    'updated_title_only', v_updated_title_only,
    'remaining', v_remaining,
    'duration_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start)::integer,
    'batch_size', p_batch_size,
    'complete', v_remaining = 0
  );
END;
$$;

COMMENT ON FUNCTION fn_backfill_content_tsv(integer) IS
  'FA-002: Batch backfill content_tsv for existing jobs. Processes content+title jobs first, then title-only. Returns progress JSON.';

-- ─────────────────────────────────────────────────────────────────────
-- 7. Enrichment gap fixer function
-- ─────────────────────────────────────────────────────────────────────
-- Marks new jobs for AI enrichment by setting jd_extracted_at + enrichment_priority
-- so the existing enrich-jd-ai cron picks them up
CREATE OR REPLACE FUNCTION fn_mark_jobs_for_enrichment(p_batch_size integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_marked integer := 0;
  v_queue_depth integer := 0;
  v_failed_skipped integer := 0;
BEGIN
  -- Mark jobs with content that haven't been AI-enriched yet
  -- These are "new" jobs from refresh pipeline that land without jd_extracted_at
  WITH batch AS (
    SELECT greenhouse_id
    FROM ats_jobs
    WHERE content IS NOT NULL
      AND length(content) > 50
      AND jd_extracted_at IS NULL
      AND status = 'open'
      AND jd_enrich_retry_count < 3
    ORDER BY created_at DESC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE ats_jobs aj
  SET
    jd_extracted_at = now(),
    enrichment_priority = COALESCE(aj.enrichment_priority, 2)
  FROM batch b
  WHERE aj.greenhouse_id = b.greenhouse_id;

  GET DIAGNOSTICS v_marked = ROW_COUNT;

  -- Queue depth: jobs marked but not yet AI-enriched
  SELECT count(*) INTO v_queue_depth
  FROM ats_jobs
  WHERE content IS NOT NULL
    AND jd_extracted_at IS NOT NULL
    AND jd_skills IS NULL
    AND status = 'open'
    AND enrichment_priority IN (1, 2);

  -- Count permanently skipped (3+ failures)
  SELECT count(*) INTO v_failed_skipped
  FROM ats_jobs
  WHERE jd_enrich_retry_count >= 3
    AND status = 'open';

  RETURN jsonb_build_object(
    'marked_for_enrichment', v_marked,
    'ai_enrichment_queue_depth', v_queue_depth,
    'permanently_skipped', v_failed_skipped,
    'timestamp', now()
  );
END;
$$;

COMMENT ON FUNCTION fn_mark_jobs_for_enrichment(integer) IS
  'FA-002: Marks new jobs (content present, jd_extracted_at NULL) for AI enrichment by setting jd_extracted_at + enrichment_priority=2. Skips jobs with 3+ retry failures.';

-- ─────────────────────────────────────────────────────────────────────
-- 8. Monitoring view
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_content_tsv_status AS
SELECT
  -- Overall content_tsv coverage
  count(*) FILTER (WHERE status = 'open') AS total_open_jobs,
  count(*) FILTER (WHERE status = 'open' AND content_tsv IS NOT NULL) AS has_content_tsv,
  count(*) FILTER (WHERE status = 'open' AND content_tsv IS NULL) AS missing_content_tsv,
  ROUND(
    count(*) FILTER (WHERE status = 'open' AND content_tsv IS NOT NULL)::numeric /
    NULLIF(count(*) FILTER (WHERE status = 'open'), 0) * 100, 1
  ) AS content_tsv_pct,

  -- Breakdown by content availability
  count(*) FILTER (WHERE status = 'open' AND content IS NOT NULL AND content_tsv IS NULL) AS has_content_missing_tsv,
  count(*) FILTER (WHERE status = 'open' AND content IS NULL AND content_tsv IS NULL AND title IS NOT NULL) AS title_only_missing_tsv,
  count(*) FILTER (WHERE status = 'open' AND content IS NULL AND title IS NULL) AS no_content_no_title,

  -- AI enrichment status
  count(*) FILTER (WHERE status = 'open' AND jd_skills IS NOT NULL) AS ai_enriched,
  count(*) FILTER (WHERE status = 'open' AND content IS NOT NULL AND jd_extracted_at IS NULL) AS unenriched_with_content,
  count(*) FILTER (WHERE status = 'open' AND jd_enrich_retry_count >= 3) AS permanently_failed,

  -- Enrichment queue depth (marked but not AI-enriched)
  count(*) FILTER (WHERE status = 'open' AND jd_extracted_at IS NOT NULL AND jd_skills IS NULL AND enrichment_priority IN (1, 2)) AS ai_queue_depth

FROM ats_jobs;

COMMENT ON VIEW v_content_tsv_status IS
  'FA-002: Real-time monitoring of content_tsv coverage and AI enrichment pipeline health.';

-- ─────────────────────────────────────────────────────────────────────
-- 9. pg_cron: Backfill content_tsv (every 30s, 10K batch)
-- ─────────────────────────────────────────────────────────────────────
-- Runs until all open jobs have content_tsv populated, then becomes a
-- lightweight no-op (finds 0 rows, returns immediately)
SELECT cron.schedule(
  'backfill-content-tsv',
  '*/1 * * * *',  -- Every minute (pg_cron minimum; function is fast enough for 10K batches)
  $$SELECT fn_backfill_content_tsv(10000);$$
);

-- ─────────────────────────────────────────────────────────────────────
-- 10. pg_cron: Mark new jobs for AI enrichment (every 15 min)
-- ─────────────────────────────────────────────────────────────────────
-- Picks up jobs from refresh pipeline that have content but no jd_extracted_at
-- Sets jd_extracted_at + enrichment_priority so enrich-jd-ai cron picks them up
SELECT cron.schedule(
  'mark-jobs-for-enrichment',
  '*/15 * * * *',
  $$SELECT fn_mark_jobs_for_enrichment(200);$$
);

-- ─────────────────────────────────────────────────────────────────────
-- 11. Log migration event
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO agent_action_log (agent_name, action_type, action_details)
VALUES (
  'system',
  'migration',
  jsonb_build_object(
    'migration', 'v6.41-fa002-content-tsv-backfill',
    'description', 'FA-002: Added content_tsv column, trigger, GIN index, backfill cron, enrichment gap fixer',
    'columns_added', ARRAY['content_tsv', 'jd_enrich_retry_count'],
    'triggers_created', ARRAY['trg_content_tsv'],
    'indexes_created', ARRAY['idx_ats_jobs_content_tsv'],
    'functions_created', ARRAY['fn_update_content_tsv', 'fn_backfill_content_tsv', 'fn_mark_jobs_for_enrichment'],
    'crons_created', ARRAY['backfill-content-tsv', 'mark-jobs-for-enrichment'],
    'views_created', ARRAY['v_content_tsv_status']
  )
);

COMMIT;
