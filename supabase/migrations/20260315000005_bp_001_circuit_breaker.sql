-- BP-001: Anthropic circuit breaker — persistent state table
-- Shared across EF invocations. Single row per service.

CREATE TABLE IF NOT EXISTS ai_circuit_breaker (
  service          text PRIMARY KEY,
  is_open          boolean NOT NULL DEFAULT false,
  failure_count    integer NOT NULL DEFAULT 0,
  last_failure_at  timestamptz,
  opened_at        timestamptz,
  half_open_after  timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- RLS: service_role only (EFs use service role)
ALTER TABLE ai_circuit_breaker ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages ai_circuit_breaker"
  ON ai_circuit_breaker FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed initial row
INSERT INTO ai_circuit_breaker (service, is_open, failure_count)
VALUES ('anthropic', false, 0)
ON CONFLICT (service) DO NOTHING;

-- ai_usage_log for spend tracking per EF call
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_ef     text NOT NULL,
  model         text NOT NULL,
  input_tokens  integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  user_id       uuid,
  duration_ms   integer,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_ef ON ai_usage_log (caller_ef);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_created ON ai_usage_log (created_at);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages ai_usage_log"
  ON ai_usage_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Daily cleanup: keep 30 days of usage logs
SELECT cron.schedule(
  'ai-usage-log-cleanup',
  '0 3 * * *',
  $$DELETE FROM ai_usage_log WHERE created_at < now() - INTERVAL '30 days'$$
);
