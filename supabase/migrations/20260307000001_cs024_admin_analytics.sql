-- ═══════════════════════════════════════════════════════════
-- CS-024: Admin Analytics Infrastructure
-- AD-FIX-15: Database activity panel — SQL functions for
-- connections, table sizes, slow queries via pg_stat views
-- ═══════════════════════════════════════════════════════════

-- ─── Active connections summary ───
CREATE OR REPLACE FUNCTION public.admin_db_connections()
RETURNS TABLE (
  state TEXT,
  count BIGINT,
  max_duration_seconds NUMERIC,
  waiting BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COALESCE(state, 'unknown') AS state,
    COUNT(*) AS count,
    ROUND(EXTRACT(EPOCH FROM MAX(NOW() - state_change))::NUMERIC, 1) AS max_duration_seconds,
    COUNT(*) FILTER (WHERE wait_event IS NOT NULL) AS waiting
  FROM pg_stat_activity
  WHERE pid <> pg_backend_pid()
    AND datname = current_database()
  GROUP BY state
  ORDER BY count DESC;
$$;

-- RLS bypass: function runs as definer (service role)
-- Grant to authenticated so admin panel can call via RPC
GRANT EXECUTE ON FUNCTION public.admin_db_connections() TO authenticated;

-- ─── Table sizes (top 50 by size) ───
CREATE OR REPLACE FUNCTION public.admin_db_table_sizes()
RETURNS TABLE (
  schema_name TEXT,
  table_name TEXT,
  row_estimate BIGINT,
  total_bytes BIGINT,
  total_size TEXT,
  index_bytes BIGINT,
  index_size TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    schemaname::TEXT AS schema_name,
    relname::TEXT AS table_name,
    n_live_tup AS row_estimate,
    pg_total_relation_size(relid) AS total_bytes,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
    pg_indexes_size(relid) AS index_bytes,
    pg_size_pretty(pg_indexes_size(relid)) AS index_size
  FROM pg_stat_user_tables
  ORDER BY pg_total_relation_size(relid) DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.admin_db_table_sizes() TO authenticated;

-- ─── Slow queries (from pg_stat_statements if available) ───
CREATE OR REPLACE FUNCTION public.admin_db_slow_queries()
RETURNS TABLE (
  query_text TEXT,
  calls BIGINT,
  total_time_ms NUMERIC,
  mean_time_ms NUMERIC,
  max_time_ms NUMERIC,
  rows_returned BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Check if pg_stat_statements extension is available
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
  ) THEN
    RETURN QUERY
    SELECT
      SUBSTRING(s.query FROM 1 FOR 200) AS query_text,
      s.calls,
      ROUND(s.total_exec_time::NUMERIC, 2) AS total_time_ms,
      ROUND(s.mean_exec_time::NUMERIC, 2) AS mean_time_ms,
      ROUND(s.max_exec_time::NUMERIC, 2) AS max_time_ms,
      s.rows AS rows_returned
    FROM pg_stat_statements s
    WHERE s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
      AND s.calls > 1
    ORDER BY s.mean_exec_time DESC
    LIMIT 25;
  ELSE
    -- Fallback: return empty result with a note
    RETURN QUERY
    SELECT
      'pg_stat_statements extension not enabled'::TEXT AS query_text,
      0::BIGINT AS calls,
      0::NUMERIC AS total_time_ms,
      0::NUMERIC AS mean_time_ms,
      0::NUMERIC AS max_time_ms,
      0::BIGINT AS rows_returned;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_db_slow_queries() TO authenticated;

-- ─── Database size summary ───
CREATE OR REPLACE FUNCTION public.admin_db_size()
RETURNS TABLE (
  db_name TEXT,
  db_size TEXT,
  db_size_bytes BIGINT,
  active_connections BIGINT,
  max_connections INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    current_database()::TEXT AS db_name,
    pg_size_pretty(pg_database_size(current_database())) AS db_size,
    pg_database_size(current_database()) AS db_size_bytes,
    (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database()) AS active_connections,
    current_setting('max_connections')::INTEGER AS max_connections;
$$;

GRANT EXECUTE ON FUNCTION public.admin_db_size() TO authenticated;
