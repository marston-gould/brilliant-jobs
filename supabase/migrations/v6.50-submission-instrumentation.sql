-- v6.50 — Submission Instrumentation
-- Tracks every auto-submit attempt with timing, ATS, customer, resume, company, job URL
-- Required by: admin-autosubmit.js dashboard panel

-- ══════════════════════════════════════════════════════════════
-- 1. submission_attempts — detailed per-attempt log
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.submission_attempts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pending_app_id      UUID REFERENCES public.pending_applications(id) ON DELETE SET NULL,
  job_id              TEXT NOT NULL,
  job_title           TEXT,
  company_name        TEXT,
  job_url             TEXT,
  ats_source          TEXT NOT NULL,
  resume_id           UUID,
  resume_filename     TEXT,
  resume_version      TEXT,               -- 'original' | 'rewritten'
  submission_method   TEXT NOT NULL,       -- 'api' | 'mock' | 'headless'
  status              TEXT NOT NULL,       -- 'submitted' | 'rejected' | 'timeout' | 'error' | 'no_api_support'
  error_type          TEXT,                -- e.g. 'validation_error', 'http_422', 'timeout', 'network_error', 'routing_error'
  error_detail        TEXT,                -- human-readable detail
  http_status         INTEGER,             -- ATS HTTP response code
  duration_ms         INTEGER,             -- wall-clock time from start to result
  confirmation_id     TEXT,                -- ATS confirmation ID on success
  request_payload     JSONB,               -- sanitized request (no PII beyond what's in other columns)
  response_body       JSONB,               -- ATS response body
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  scar_meta           JSONB                -- S-12 evolvability scar
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sub_attempts_user     ON public.submission_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_attempts_ats      ON public.submission_attempts(ats_source, status);
CREATE INDEX IF NOT EXISTS idx_sub_attempts_status   ON public.submission_attempts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_attempts_created  ON public.submission_attempts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_attempts_company  ON public.submission_attempts(company_name, created_at DESC);

-- RLS
ALTER TABLE public.submission_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own submission attempts"
  ON public.submission_attempts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access submission attempts"
  ON public.submission_attempts FOR ALL
  USING (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════
-- 2. v_submission_dashboard — admin view for failure analysis
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_submission_dashboard AS
WITH stats_24h AS (
  SELECT
    COUNT(*)                                                    AS total_24h,
    COUNT(*) FILTER (WHERE status = 'submitted')                AS success_24h,
    COUNT(*) FILTER (WHERE status != 'submitted')               AS failed_24h,
    ROUND(AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL))::int AS avg_duration_24h,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE duration_ms IS NOT NULL))::int AS p95_duration_24h
  FROM public.submission_attempts
  WHERE created_at > now() - interval '24 hours'
),
stats_7d AS (
  SELECT
    COUNT(*)                                                    AS total_7d,
    COUNT(*) FILTER (WHERE status = 'submitted')                AS success_7d,
    COUNT(*) FILTER (WHERE status != 'submitted')               AS failed_7d
  FROM public.submission_attempts
  WHERE created_at > now() - interval '7 days'
),
by_ats AS (
  SELECT
    ats_source,
    COUNT(*)                                            AS total,
    COUNT(*) FILTER (WHERE status = 'submitted')        AS successes,
    COUNT(*) FILTER (WHERE status != 'submitted')       AS failures,
    ROUND(100.0 * COUNT(*) FILTER (WHERE status != 'submitted') / NULLIF(COUNT(*), 0), 1) AS failure_rate_pct,
    ROUND(AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL))::int AS avg_duration_ms
  FROM public.submission_attempts
  WHERE created_at > now() - interval '7 days'
  GROUP BY ats_source
  ORDER BY failures DESC
),
by_error AS (
  SELECT
    error_type,
    COUNT(*) AS count,
    ROUND(100.0 * COUNT(*) / NULLIF((SELECT COUNT(*) FROM public.submission_attempts WHERE status != 'submitted' AND created_at > now() - interval '7 days'), 0), 1) AS pct
  FROM public.submission_attempts
  WHERE status != 'submitted'
    AND created_at > now() - interval '7 days'
  GROUP BY error_type
  ORDER BY count DESC
)
SELECT
  (SELECT row_to_json(s) FROM stats_24h s)   AS overview_24h,
  (SELECT row_to_json(s) FROM stats_7d s)    AS overview_7d,
  (SELECT json_agg(row_to_json(a)) FROM by_ats a)    AS by_ats,
  (SELECT json_agg(row_to_json(e)) FROM by_error e)  AS by_error;

-- ══════════════════════════════════════════════════════════════
-- 3. fn_submission_summary — admin RPC
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_submission_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT json_build_object(
    'overview', (SELECT row_to_json(v) FROM v_submission_dashboard v),
    'recent_failures', (
      SELECT json_agg(row_to_json(r))
      FROM (
        SELECT
          sa.id, sa.user_id, sa.job_title, sa.company_name, sa.job_url,
          sa.ats_source, sa.resume_filename, sa.resume_version,
          sa.submission_method, sa.status, sa.error_type, sa.error_detail,
          sa.http_status, sa.duration_ms, sa.created_at,
          p.email AS user_email
        FROM public.submission_attempts sa
        LEFT JOIN public.profiles p ON p.id = sa.user_id
        WHERE sa.status != 'submitted'
        ORDER BY sa.created_at DESC
        LIMIT 50
      ) r
    ),
    'recent_successes', (
      SELECT json_agg(row_to_json(r))
      FROM (
        SELECT
          sa.id, sa.user_id, sa.job_title, sa.company_name, sa.ats_source,
          sa.confirmation_id, sa.duration_ms, sa.created_at,
          p.email AS user_email
        FROM public.submission_attempts sa
        LEFT JOIN public.profiles p ON p.id = sa.user_id
        WHERE sa.status = 'submitted'
        ORDER BY sa.created_at DESC
        LIMIT 20
      ) r
    ),
    'daily_trend', (
      SELECT json_agg(row_to_json(d))
      FROM (
        SELECT
          date_trunc('day', created_at)::date AS day,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'submitted') AS successes,
          COUNT(*) FILTER (WHERE status != 'submitted') AS failures,
          ROUND(AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL))::int AS avg_duration_ms
        FROM public.submission_attempts
        WHERE created_at > now() - interval '30 days'
        GROUP BY 1
        ORDER BY 1 DESC
      ) d
    )
  )::jsonb INTO result;

  RETURN result;
END;
$$;

-- Grants
GRANT SELECT ON public.submission_attempts TO authenticated;
GRANT ALL ON public.submission_attempts TO service_role;
GRANT SELECT ON public.v_submission_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_submission_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_submission_summary() TO service_role;
