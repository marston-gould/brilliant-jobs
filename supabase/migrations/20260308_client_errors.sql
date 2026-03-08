-- DO-001: Client Error Monitoring
-- Persistent error log for dashboard + extension + landing page

CREATE TABLE IF NOT EXISTS public.client_errors (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  surface     text NOT NULL DEFAULT 'dashboard',  -- dashboard | extension | landing
  label       text NOT NULL,                       -- module:submodule
  message     text NOT NULL,
  stack       text,
  url         text,
  page        text,                                -- active tab/route
  version     text,                                -- BJ_VERSION
  user_agent  text,
  metadata    jsonb DEFAULT '{}'::jsonb,           -- extra context
  severity    text NOT NULL DEFAULT 'error',       -- error | warning | fatal
  fingerprint text                                 -- deduplication key
);

-- Indexes for monitoring queries
CREATE INDEX idx_client_errors_created ON public.client_errors (created_at DESC);
CREATE INDEX idx_client_errors_label   ON public.client_errors (label, created_at DESC);
CREATE INDEX idx_client_errors_severity ON public.client_errors (severity, created_at DESC);
CREATE INDEX idx_client_errors_fingerprint ON public.client_errors (fingerprint, created_at DESC);

-- RLS: users can insert their own errors, admins can read all
ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own errors"
  ON public.client_errors FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Admins can read all errors"
  ON public.client_errors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Materialized view for error rate monitoring (refreshed by pg_cron)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_error_rates AS
SELECT
  date_trunc('hour', created_at) AS hour,
  surface,
  label,
  severity,
  count(*) AS error_count,
  count(DISTINCT user_id) AS affected_users,
  count(DISTINCT fingerprint) AS unique_errors
FROM public.client_errors
WHERE created_at > now() - interval '7 days'
GROUP BY 1, 2, 3, 4
ORDER BY 1 DESC;

CREATE UNIQUE INDEX ON public.mv_error_rates (hour, surface, label, severity);

-- Auto-cleanup: errors older than 30 days
-- (pg_cron job to be set up separately)

COMMENT ON TABLE public.client_errors IS 'DO-001: Client-side error monitoring. Receives batched errors from reportError() in the dashboard shell.';
