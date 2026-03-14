-- CS-015: CP-003 — Enable pgAudit logging for forensic audit trail
-- Tracks all DDL + write operations on sensitive tables
-- Wrapped in exception handlers: pgaudit/ALTER SYSTEM may not be available on all Supabase tiers

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pgaudit;
  ALTER SYSTEM SET pgaudit.log = 'ddl, write';
  ALTER SYSTEM SET pgaudit.log_catalog = off;
  ALTER SYSTEM SET pgaudit.log_parameter = on;
  ALTER SYSTEM SET pgaudit.log_statement_once = off;
  ALTER SYSTEM SET pgaudit.log_rows = off;
  PERFORM pg_reload_conf();
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgaudit setup skipped: %', SQLERRM;
END $$;
