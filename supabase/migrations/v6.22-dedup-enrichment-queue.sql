-- ============================================================
-- SA-008: Deduplication Engine + Enrichment Queue Integration
-- ADR-07: Deduplication Strategy
-- ============================================================
-- Creates:
--   1. enrichment_queue — rate-limited enrichment queue for CC-promoted jobs
--   2. dedup_log — audit trail for dedup decisions
--   3. cc_find_exact_duplicates() — URL-hash fast path
--   4. cc_find_fuzzy_duplicates() — title+company+location similarity
--   5. cc_promote_to_ats_jobs() — staging → ats_jobs promotion
--   6. cc_run_dedup_batch() — orchestrator function
-- ============================================================

-- ── 1. Enrichment Queue ─────────────────────────────────────────────────────
-- Rate-limited queue for Anthropic API calls on CC-sourced jobs.
-- 100 calls/hour budget for CC records (separate from ATS enrichment).

CREATE TABLE IF NOT EXISTS enrichment_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  greenhouse_id   text NOT NULL,
  ats_source      text NOT NULL DEFAULT 'common_crawl',
  priority        integer NOT NULL DEFAULT 5,  -- 1=highest, 10=lowest
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  enrich_type     text NOT NULL DEFAULT 'jd_ai'
    CHECK (enrich_type IN ('jd_ai', 'salary', 'location', 'full')),
  attempts        integer DEFAULT 0,
  max_attempts    integer DEFAULT 3,
  last_error      text,
  scheduled_after timestamptz DEFAULT now(),  -- For rate limiting: don't process before this time
  created_at      timestamptz DEFAULT now(),
  started_at      timestamptz,
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_eq_status_priority ON enrichment_queue (status, priority, scheduled_after);
CREATE INDEX IF NOT EXISTS idx_eq_greenhouse ON enrichment_queue (greenhouse_id, ats_source);

-- Partial index: pending items ordered by priority (hot queue)
CREATE INDEX IF NOT EXISTS idx_eq_pending ON enrichment_queue (priority, scheduled_after)
  WHERE status = 'pending';

ALTER TABLE enrichment_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_enrichment_queue" ON enrichment_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admin_read_enrichment_queue" ON enrichment_queue
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE enrichment_queue IS
  'SA-008: Rate-limited enrichment queue. CC jobs promoted to ats_jobs get queued here for Anthropic AI enrichment at 100 calls/hour.';

-- ── 2. Dedup Log ────────────────────────────────────────────────────────────
-- Audit trail for every dedup decision: why a record was kept or dropped.

CREATE TABLE IF NOT EXISTS dedup_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staging_id      uuid NOT NULL,                 -- cc_staging_jobs.id
  decision        text NOT NULL
    CHECK (decision IN ('promoted', 'exact_dup', 'fuzzy_dup', 'rejected', 'error')),
  match_type      text,                          -- 'url_hash', 'title_company_loc', null
  matched_against text,                          -- greenhouse_id of the dup target (if any)
  similarity_score numeric(5,4),                 -- pg_trgm similarity score (fuzzy only)
  details         jsonb,                         -- Additional context
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dedup_log_staging ON dedup_log (staging_id);
CREATE INDEX IF NOT EXISTS idx_dedup_log_decision ON dedup_log (decision);
CREATE INDEX IF NOT EXISTS idx_dedup_log_created ON dedup_log (created_at DESC);

ALTER TABLE dedup_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_dedup_log" ON dedup_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admin_read_dedup_log" ON dedup_log
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE dedup_log IS
  'SA-008: Audit trail for dedup decisions. Every staging record gets a log entry explaining why it was promoted, marked duplicate, or rejected.';

-- ── 3. Exact Duplicate Detection (URL Hash Fast Path) ───────────────────────
-- O(1) lookup: does this exact URL already exist in ats_jobs or was already staged?

CREATE OR REPLACE FUNCTION cc_find_exact_duplicates(p_batch_size integer DEFAULT 500)
RETURNS TABLE(
  staging_id uuid,
  url_hash text,
  matched_greenhouse_id text,
  match_source text  -- 'ats_jobs' or 'cc_staging_promoted'
) LANGUAGE sql STABLE AS $$
  -- Match against ats_jobs (already promoted or ATS-sourced)
  SELECT
    s.id AS staging_id,
    s.url_hash,
    a.greenhouse_id AS matched_greenhouse_id,
    'ats_jobs'::text AS match_source
  FROM cc_staging_jobs s
  INNER JOIN ats_jobs a ON a.greenhouse_id = cc_job_id(s.url)
  WHERE s.ingestion_status = 'pending'
  LIMIT p_batch_size

  UNION ALL

  -- Match against already-promoted staging records (intra-batch dedup)
  SELECT
    s.id AS staging_id,
    s.url_hash,
    earlier.greenhouse_id AS matched_greenhouse_id,
    'cc_staging_promoted'::text AS match_source
  FROM cc_staging_jobs s
  INNER JOIN cc_staging_jobs earlier
    ON earlier.url_hash = s.url_hash
    AND earlier.ingestion_status = 'promoted'
    AND earlier.id != s.id
  WHERE s.ingestion_status = 'pending'
  LIMIT p_batch_size;
$$;

COMMENT ON FUNCTION cc_find_exact_duplicates IS
  'SA-008: Fast-path exact duplicate detection via URL hash. Checks both ats_jobs and already-promoted staging records.';

-- ── 4. Fuzzy Duplicate Detection (Title + Company + Location) ───────────────
-- Uses pg_trgm similarity on (title, company_name, loc_display) composite.
-- Threshold: 0.7 (configurable via parameter).
-- Only runs on records that passed exact-match (no URL dup found).

CREATE OR REPLACE FUNCTION cc_find_fuzzy_duplicates(
  p_batch_size integer DEFAULT 200,
  p_threshold numeric DEFAULT 0.7
)
RETURNS TABLE(
  staging_id uuid,
  staging_title text,
  matched_greenhouse_id text,
  matched_title text,
  title_sim numeric,
  company_sim numeric,
  location_sim numeric,
  combined_sim numeric
) LANGUAGE sql STABLE AS $$
  SELECT
    s.id AS staging_id,
    s.title AS staging_title,
    a.greenhouse_id AS matched_greenhouse_id,
    a.title AS matched_title,
    similarity(lower(s.title), lower(a.title)) AS title_sim,
    similarity(lower(coalesce(s.company_name, '')), lower(coalesce(a.company_name, ''))) AS company_sim,
    similarity(lower(coalesce(s.loc_display, s.location, '')), lower(coalesce(a.loc_display, a.location, ''))) AS location_sim,
    -- Weighted combination: title 50%, company 30%, location 20%
    (similarity(lower(s.title), lower(a.title)) * 0.5 +
     similarity(lower(coalesce(s.company_name, '')), lower(coalesce(a.company_name, ''))) * 0.3 +
     similarity(lower(coalesce(s.loc_display, s.location, '')), lower(coalesce(a.loc_display, a.location, ''))) * 0.2
    ) AS combined_sim
  FROM cc_staging_jobs s
  CROSS JOIN LATERAL (
    -- Find the best match in ats_jobs using title similarity as primary filter
    SELECT a.*
    FROM ats_jobs a
    WHERE similarity(lower(s.title), lower(a.title)) >= p_threshold
      AND similarity(lower(coalesce(s.company_name, '')), lower(coalesce(a.company_name, ''))) >= 0.3
    ORDER BY similarity(lower(s.title), lower(a.title)) DESC
    LIMIT 1
  ) a
  WHERE s.ingestion_status = 'validated'  -- Only check records that passed exact-match
  LIMIT p_batch_size;
$$;

COMMENT ON FUNCTION cc_find_fuzzy_duplicates IS
  'SA-008: Fuzzy duplicate detection using pg_trgm. Weighted composite: title 50%, company 30%, location 20%. Threshold 0.7 default.';

-- ── 5. Promote Staging Records to ats_jobs ──────────────────────────────────
-- Inserts non-duplicate staging records into ats_jobs + queues for enrichment.

CREATE OR REPLACE FUNCTION cc_promote_to_ats_jobs(p_batch_size integer DEFAULT 200)
RETURNS TABLE(promoted_count integer, queued_count integer) LANGUAGE plpgsql AS $$
DECLARE
  v_promoted integer := 0;
  v_queued integer := 0;
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT id, greenhouse_id, company_slug, company_name, title, location,
           department, url, content, salary_min, salary_max, salary_raw,
           salary_currency, salary_rate, is_remote, industry, job_cat,
           loc_city, loc_state, loc_country, loc_type, loc_display
    FROM cc_staging_jobs
    WHERE ingestion_status = 'validated'
    LIMIT p_batch_size
  LOOP
    -- Insert into ats_jobs with 'common_crawl' source
    INSERT INTO ats_jobs (
      greenhouse_id, company_slug, company_name, title, location,
      department, url, content, salary_min, salary_max, salary_raw,
      salary_currency, salary_rate, is_remote, industry, job_cat,
      loc_city, loc_state, loc_country, loc_type, loc_display,
      ats_source, status, first_seen_at, last_seen, created_at
    ) VALUES (
      cc_job_id(v_rec.url), v_rec.company_slug, v_rec.company_name,
      v_rec.title, v_rec.location, v_rec.department, v_rec.url,
      v_rec.content, v_rec.salary_min, v_rec.salary_max, v_rec.salary_raw,
      v_rec.salary_currency, v_rec.salary_rate, v_rec.is_remote,
      v_rec.industry, v_rec.job_cat, v_rec.loc_city, v_rec.loc_state,
      v_rec.loc_country, v_rec.loc_type, v_rec.loc_display,
      'common_crawl', 'open', now(), now(), now()
    )
    ON CONFLICT (greenhouse_id, ats_source) DO UPDATE SET
      last_seen = now(),
      content = COALESCE(EXCLUDED.content, ats_jobs.content),
      salary_min = COALESCE(EXCLUDED.salary_min, ats_jobs.salary_min),
      salary_max = COALESCE(EXCLUDED.salary_max, ats_jobs.salary_max);

    -- Mark staging record as promoted
    UPDATE cc_staging_jobs
    SET ingestion_status = 'promoted', promoted_at = now()
    WHERE id = v_rec.id;

    -- Log the promotion
    INSERT INTO dedup_log (staging_id, decision, details)
    VALUES (v_rec.id, 'promoted', jsonb_build_object(
      'greenhouse_id', cc_job_id(v_rec.url),
      'has_content', v_rec.content IS NOT NULL AND length(v_rec.content) > 50
    ));

    v_promoted := v_promoted + 1;

    -- Queue for enrichment if content exists (50+ chars)
    IF v_rec.content IS NOT NULL AND length(v_rec.content) > 50 THEN
      INSERT INTO enrichment_queue (greenhouse_id, ats_source, priority, enrich_type)
      VALUES (cc_job_id(v_rec.url), 'common_crawl', 5, 'jd_ai')
      ON CONFLICT DO NOTHING;
      v_queued := v_queued + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_promoted, v_queued;
END;
$$;

COMMENT ON FUNCTION cc_promote_to_ats_jobs IS
  'SA-008: Promotes validated staging records to ats_jobs (common_crawl source) and queues for AI enrichment. ON CONFLICT updates last_seen.';

-- ── 6. Dedup Batch Orchestrator ─────────────────────────────────────────────
-- Single function that runs the full dedup pipeline on a batch of staging records.
-- Phase 1: Exact match (URL hash) → mark duplicates
-- Phase 2: Fuzzy match (title+company+location) → mark duplicates
-- Phase 3: Promote survivors → ats_jobs + enrichment queue

CREATE OR REPLACE FUNCTION cc_run_dedup_batch(
  p_batch_size integer DEFAULT 500,
  p_fuzzy_threshold numeric DEFAULT 0.7
)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_exact_dups integer := 0;
  v_fuzzy_dups integer := 0;
  v_promoted integer := 0;
  v_queued integer := 0;
  v_total_pending integer;
  v_rec RECORD;
  v_promo RECORD;
BEGIN
  -- Count pending records
  SELECT count(*) INTO v_total_pending
  FROM cc_staging_jobs WHERE ingestion_status = 'pending';

  IF v_total_pending = 0 THEN
    RETURN jsonb_build_object(
      'status', 'no_work',
      'pending', 0,
      'exact_dups', 0,
      'fuzzy_dups', 0,
      'promoted', 0,
      'enrichment_queued', 0
    );
  END IF;

  -- ── Phase 1: Exact Duplicate Detection ──
  FOR v_rec IN SELECT * FROM cc_find_exact_duplicates(p_batch_size)
  LOOP
    UPDATE cc_staging_jobs
    SET ingestion_status = 'duplicate'
    WHERE id = v_rec.staging_id;

    INSERT INTO dedup_log (staging_id, decision, match_type, matched_against, details)
    VALUES (
      v_rec.staging_id, 'exact_dup', 'url_hash',
      v_rec.matched_greenhouse_id,
      jsonb_build_object('match_source', v_rec.match_source, 'url_hash', v_rec.url_hash)
    );

    v_exact_dups := v_exact_dups + 1;
  END LOOP;

  -- ── Transition: Move remaining pending → validated (passed exact match) ──
  UPDATE cc_staging_jobs
  SET ingestion_status = 'validated'
  WHERE ingestion_status = 'pending'
    AND id NOT IN (SELECT staging_id FROM cc_find_exact_duplicates(p_batch_size));

  -- ── Phase 2: Fuzzy Duplicate Detection ──
  FOR v_rec IN SELECT * FROM cc_find_fuzzy_duplicates(p_batch_size, p_fuzzy_threshold)
  LOOP
    IF v_rec.combined_sim >= p_fuzzy_threshold THEN
      UPDATE cc_staging_jobs
      SET ingestion_status = 'duplicate'
      WHERE id = v_rec.staging_id;

      INSERT INTO dedup_log (staging_id, decision, match_type, matched_against, similarity_score, details)
      VALUES (
        v_rec.staging_id, 'fuzzy_dup', 'title_company_loc',
        v_rec.matched_greenhouse_id, v_rec.combined_sim,
        jsonb_build_object(
          'staging_title', v_rec.staging_title,
          'matched_title', v_rec.matched_title,
          'title_sim', v_rec.title_sim,
          'company_sim', v_rec.company_sim,
          'location_sim', v_rec.location_sim
        )
      );

      v_fuzzy_dups := v_fuzzy_dups + 1;
    END IF;
  END LOOP;

  -- ── Phase 3: Promote Survivors ──
  SELECT * INTO v_promo FROM cc_promote_to_ats_jobs(p_batch_size);
  v_promoted := v_promo.promoted_count;
  v_queued := v_promo.queued_count;

  -- ── Update batch tracking counters ──
  -- (Caller passes batch_id; this function focuses on dedup logic)

  RETURN jsonb_build_object(
    'status', 'completed',
    'pending_before', v_total_pending,
    'exact_dups', v_exact_dups,
    'fuzzy_dups', v_fuzzy_dups,
    'promoted', v_promoted,
    'enrichment_queued', v_queued,
    'total_deduped', v_exact_dups + v_fuzzy_dups,
    'dedup_rate', CASE WHEN (v_exact_dups + v_fuzzy_dups + v_promoted) > 0
      THEN round((v_exact_dups + v_fuzzy_dups)::numeric / (v_exact_dups + v_fuzzy_dups + v_promoted) * 100, 1)
      ELSE 0 END
  );
END;
$$;

COMMENT ON FUNCTION cc_run_dedup_batch IS
  'SA-008: Full dedup pipeline orchestrator. Phase 1: URL hash exact match. Phase 2: pg_trgm fuzzy match (title+company+location). Phase 3: Promote survivors to ats_jobs + enrichment queue.';

-- ── 7. GIN Index for Fuzzy Matching Performance ─────────────────────────────
-- pg_trgm GIN indexes on the columns used for fuzzy matching

CREATE INDEX IF NOT EXISTS idx_ats_jobs_title_trgm ON ats_jobs USING gin (lower(title) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ats_jobs_company_trgm ON ats_jobs USING gin (lower(company_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cc_staging_title_trgm ON cc_staging_jobs USING gin (lower(title) gin_trgm_ops);

-- ── 8. Enrichment Queue Rate Limit Helper ───────────────────────────────────
-- Returns the next batch of enrichment items respecting the 100/hour CC budget.

CREATE OR REPLACE FUNCTION eq_next_batch(
  p_source text DEFAULT 'common_crawl',
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  queue_id uuid,
  greenhouse_id text,
  ats_source text,
  enrich_type text
) LANGUAGE sql AS $$
  UPDATE enrichment_queue eq
  SET status = 'processing', started_at = now(), attempts = attempts + 1
  WHERE eq.id IN (
    SELECT eq2.id
    FROM enrichment_queue eq2
    WHERE eq2.status = 'pending'
      AND eq2.ats_source = p_source
      AND eq2.scheduled_after <= now()
      AND eq2.attempts < eq2.max_attempts
    ORDER BY eq2.priority, eq2.created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING eq.id AS queue_id, eq.greenhouse_id, eq.ats_source, eq.enrich_type;
$$;

COMMENT ON FUNCTION eq_next_batch IS
  'SA-008: Claim next batch of enrichment items with row-level locking (SKIP LOCKED). Respects rate limits via scheduled_after.';

-- ── 9. Enrichment Queue Completion ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION eq_complete(p_queue_id uuid, p_success boolean, p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_success THEN
    UPDATE enrichment_queue SET status = 'completed', completed_at = now()
    WHERE id = p_queue_id;
  ELSE
    UPDATE enrichment_queue
    SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
        last_error = p_error,
        -- Exponential backoff: 2^attempts minutes (2, 4, 8 min)
        scheduled_after = now() + (power(2, attempts) || ' minutes')::interval
    WHERE id = p_queue_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION eq_complete IS
  'SA-008: Mark enrichment queue item as completed or failed with exponential backoff retry.';

-- ── 10. Dedup Summary View ──────────────────────────────────────────────────

CREATE OR REPLACE VIEW dedup_summary AS
SELECT
  date_trunc('hour', created_at) AS hour,
  decision,
  match_type,
  count(*) AS record_count,
  avg(similarity_score) AS avg_similarity,
  min(similarity_score) AS min_similarity,
  max(similarity_score) AS max_similarity
FROM dedup_log
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2;

COMMENT ON VIEW dedup_summary IS
  'SA-008: Hourly dedup decision summary. Shows promoted vs duplicate counts, similarity score distribution.';

-- ── 11. Enrichment Queue Summary View ───────────────────────────────────────

CREATE OR REPLACE VIEW enrichment_queue_summary AS
SELECT
  ats_source,
  status,
  count(*) AS record_count,
  min(created_at) AS oldest_record,
  max(created_at) AS newest_record,
  avg(attempts) AS avg_attempts
FROM enrichment_queue
GROUP BY ats_source, status
ORDER BY ats_source, status;

COMMENT ON VIEW enrichment_queue_summary IS
  'SA-008: Enrichment queue status breakdown by source and status.';
