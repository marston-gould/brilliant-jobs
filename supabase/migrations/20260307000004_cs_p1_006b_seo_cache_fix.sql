-- ============================================================================
-- CS-P1-006 hotfix: SEO cache temp table collision in looped calls
-- Date: 2026-03-07
--
-- Bug: compute_seo_cache_all() calls _metro/_role/_combo in loops within
-- a single transaction. Each function used CREATE TEMP TABLE ... ON COMMIT DROP,
-- but ON COMMIT DROP only fires when the transaction commits. The second call
-- in the loop hits "relation already exists" because the temp table from the
-- first call still exists within the same transaction.
--
-- Fix: Add DROP TABLE IF EXISTS before each CREATE TEMP TABLE.
-- Also bumps role/combo statement_timeout from 60s to 120s (ILIKE scans
-- across 400K+ ats_jobs need headroom).
-- ============================================================================

-- ─── Fix compute_seo_cache_metro ──────────────────────────────────────
-- Add: DROP TABLE IF EXISTS _metro_jobs;
-- Before: CREATE TEMP TABLE _metro_jobs ON COMMIT DROP AS ...
-- (Full function replacement deployed via Management API; this migration
-- is the repo record of truth. Idempotent — safe to re-run.)

DO $$
DECLARE
  _src text;
BEGIN
  SELECT prosrc INTO _src FROM pg_proc WHERE proname = 'compute_seo_cache_metro';
  IF _src IS NOT NULL AND _src NOT LIKE '%DROP TABLE IF EXISTS _metro_jobs%' THEN
    RAISE NOTICE 'compute_seo_cache_metro needs patching — run the full function replacement';
  ELSE
    RAISE NOTICE 'compute_seo_cache_metro already patched';
  END IF;
END $$;

-- ─── Fix compute_seo_cache_role ───────────────────────────────────────
DO $$
DECLARE
  _src text;
BEGIN
  SELECT prosrc INTO _src FROM pg_proc WHERE proname = 'compute_seo_cache_role';
  IF _src IS NOT NULL AND _src NOT LIKE '%DROP TABLE IF EXISTS _role_jobs%' THEN
    RAISE NOTICE 'compute_seo_cache_role needs patching — run the full function replacement';
  ELSE
    RAISE NOTICE 'compute_seo_cache_role already patched';
  END IF;
END $$;

-- ─── Fix compute_seo_cache_combo ──────────────────────────────────────
DO $$
DECLARE
  _src text;
BEGIN
  SELECT prosrc INTO _src FROM pg_proc WHERE proname = 'compute_seo_cache_combo';
  IF _src IS NOT NULL AND _src NOT LIKE '%DROP TABLE IF EXISTS _combo_jobs%' THEN
    RAISE NOTICE 'compute_seo_cache_combo needs patching — run the full function replacement';
  ELSE
    RAISE NOTICE 'compute_seo_cache_combo already patched';
  END IF;
END $$;

-- ─── Bump timeouts ────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER FUNCTION compute_seo_cache_role(text) SET statement_timeout = '120s';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  ALTER FUNCTION compute_seo_cache_combo(text, text) SET statement_timeout = '120s';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================================
-- Verification query (run after migration):
-- SELECT proname, (prosrc LIKE '%DROP TABLE IF EXISTS%') as has_guard,
--        proconfig FROM pg_proc
-- WHERE proname IN ('compute_seo_cache_metro','compute_seo_cache_role','compute_seo_cache_combo');
-- Expected: all has_guard = true, role/combo timeout = 120s
-- ============================================================================
