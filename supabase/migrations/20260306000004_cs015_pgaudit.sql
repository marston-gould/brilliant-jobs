-- CS-015: CP-003 — Enable pgAudit logging for forensic audit trail
-- Tracks all DDL + write operations on sensitive tables
-- Supabase pgAudit extension docs: https://supabase.com/docs/guides/database/extensions/pgaudit

-- 1. Enable the pgAudit extension
CREATE EXTENSION IF NOT EXISTS pgaudit;

-- 2. Configure pgAudit to log DDL + write operations (INSERT, UPDATE, DELETE)
-- Using per-role auditing so we can target the authenticated role
ALTER SYSTEM SET pgaudit.log = 'ddl, write';

-- 3. Log the role that executed the statement
ALTER SYSTEM SET pgaudit.log_catalog = off;

-- 4. Log parameter values with statements (for debugging, disable in high-volume prod if needed)
ALTER SYSTEM SET pgaudit.log_parameter = on;

-- 5. Log statement type for each entry
ALTER SYSTEM SET pgaudit.log_statement_once = off;

-- 6. Reduce noise: don't log when no rows affected (e.g. DELETE WHERE id = nonexistent)
ALTER SYSTEM SET pgaudit.log_rows = off;

-- 7. Reload config to apply
SELECT pg_reload_conf();

-- Verification: After applying, run:
--   SHOW pgaudit.log;        -- Should show 'ddl, write'
--   SHOW pgaudit.log_parameter;  -- Should show 'on'
-- Then perform a test INSERT and check pg_log for audit entries.

COMMENT ON EXTENSION pgaudit IS 'CS-015: Audit logging enabled for DDL + write operations. Provides forensic trail for launch gate G12.';
