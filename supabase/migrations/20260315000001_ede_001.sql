-- EDE-001: Event-Driven JD Enrichment with Eligibility Gate

-- 0. Add missing jd_enrich_retry_count column to ats_jobs
DO $guard$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ats_jobs' AND column_name = 'jd_enrich_retry_count'
  ) THEN
    ALTER TABLE ats_jobs ADD COLUMN jd_enrich_retry_count integer NOT NULL DEFAULT 0;
    CREATE INDEX idx_ats_jobs_retry ON ats_jobs (jd_enrich_retry_count) WHERE jd_enrich_retry_count > 0;
  END IF;
END $guard$;

-- 1. enrichment_requests table
CREATE TABLE IF NOT EXISTS enrichment_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filter_id       uuid REFERENCES user_filters(id) ON DELETE SET NULL,
  location_key    text NOT NULL,
  loc_display     text NOT NULL,
  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','processing','complete','no_jobs')),
  jobs_total      int,
  jobs_enriched   int NOT NULL DEFAULT 0,
  requested_at    timestamptz NOT NULL DEFAULT now(),
  estimated_at    timestamptz,
  completed_at    timestamptz,
  UNIQUE (user_id, location_key)
);
CREATE INDEX IF NOT EXISTS idx_er_status ON enrichment_requests (status) WHERE status != 'complete';
CREATE INDEX IF NOT EXISTS idx_er_user ON enrichment_requests (user_id);

ALTER TABLE enrichment_requests ENABLE ROW LEVEL SECURITY;

DO $pol$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='enrichment_requests' AND policyname='Users can manage own enrichment_requests') THEN
    CREATE POLICY "Users can manage own enrichment_requests"
      ON enrichment_requests FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='enrichment_requests' AND policyname='Service role full access to enrichment_requests') THEN
    CREATE POLICY "Service role full access to enrichment_requests"
      ON enrichment_requests FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $pol$;

-- 2. Update fn_mark_jobs_for_enrichment with optional location param
CREATE OR REPLACE FUNCTION fn_mark_jobs_for_enrichment(
  p_batch_size integer DEFAULT 200,
  p_location   text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_marked       integer := 0;
  v_queue_depth  integer := 0;
  v_state_abbr   text;
BEGIN
  IF p_location IS NOT NULL THEN
    v_state_abbr := CASE
      WHEN p_location LIKE 'us:_%' THEN split_part(p_location, ':', 2)
      ELSE NULL
    END;

    WITH batch AS (
      SELECT greenhouse_id
      FROM ats_jobs
      WHERE status = 'open'
        AND content IS NOT NULL
        AND length(content) > 200
        AND title IS NOT NULL
        AND jd_skills IS NULL
        AND jd_enrich_retry_count < 3
        AND jd_extracted_at IS NULL
        AND (
          (p_location = 'remote' AND (is_remote = true OR loc_type = 'remote'))
          OR (p_location = 'us' AND (loc_country = 'US' OR is_remote = true))
          OR (v_state_abbr IS NOT NULL AND (
            lower(coalesce(loc_state,'')) = v_state_abbr
            OR loc_country = 'US'
          ))
        )
      ORDER BY created_at DESC
      LIMIT p_batch_size
      FOR UPDATE SKIP LOCKED
    )
    UPDATE ats_jobs aj
    SET jd_extracted_at = now(), enrichment_priority = 1
    FROM batch b
    WHERE aj.greenhouse_id = b.greenhouse_id;

  ELSE
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
    SET jd_extracted_at = now(),
        enrichment_priority = COALESCE(aj.enrichment_priority, 2)
    FROM batch b
    WHERE aj.greenhouse_id = b.greenhouse_id;
  END IF;

  GET DIAGNOSTICS v_marked = ROW_COUNT;

  SELECT count(*) INTO v_queue_depth
  FROM ats_jobs
  WHERE jd_extracted_at IS NOT NULL
    AND jd_skills IS NULL
    AND status = 'open'
    AND enrichment_priority IN (1, 2);

  RETURN jsonb_build_object(
    'marked_for_enrichment', v_marked,
    'ai_enrichment_queue_depth', v_queue_depth,
    'location', p_location,
    'timestamp', now()
  );
END;
$fn$;

-- 3. Slow cron #49 from */5 to */10
SELECT cron.alter_job(49::bigint, schedule := '*/10 * * * *');

-- ─────────────────────────────────────────────────────────────────────
-- 4. fn_update_enrichment_progress — called by enrich-jd-ai after each batch
--    Increments jobs_enriched on all queued/processing rows,
--    marks complete when jobs_enriched >= jobs_total
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_update_enrichment_progress(p_increment integer DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
BEGIN
  UPDATE enrichment_requests
  SET
    jobs_enriched = LEAST(jobs_enriched + p_increment, COALESCE(jobs_total, jobs_enriched + p_increment)),
    status = CASE
      WHEN jobs_enriched + p_increment >= COALESCE(jobs_total, 1) THEN 'complete'
      ELSE 'processing'
    END,
    completed_at = CASE
      WHEN jobs_enriched + p_increment >= COALESCE(jobs_total, 1) THEN now()
      ELSE NULL
    END
  WHERE status IN ('queued', 'processing');
END;
$fn$;
