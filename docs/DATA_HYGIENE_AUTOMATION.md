# Data Hygiene Automation — v3.83

**Date:** 2026-02-22  
**Sprint Item:** 3 of 7 (Infrastructure Hardening)

---

## What It Does

`data_hygiene_cleanup()` runs weekly (Sundays 3 AM UTC) via pg_cron job #16 and performs:

| # | Action | Threshold | Type |
|---|--------|-----------|------|
| 1 | Archive closed jobs | >90 days since closed_at | UPDATE status → 'archived' |
| 2 | Clean stale location_cache | >90 days, not referenced by open jobs | DELETE |
| 3 | Clean notification_log | >90 days | DELETE |
| 4 | Clean expired notification_actions | >30 days, status expired/dismissed | DELETE |
| 5 | Clean old user_sessions | >90 days | DELETE |
| 6 | Clean old audit_log | >180 days | DELETE |

Results are logged to `hygiene_log` table with timing and row counts.

## Manual Execution

```sql
-- Run cleanup and see results
SELECT data_hygiene_cleanup();

-- Run cleanup and log results
SELECT run_data_hygiene();

-- Check past runs
SELECT * FROM hygiene_log ORDER BY ran_at DESC LIMIT 10;
```

## Cron Schedule

```sql
-- Verify the cron job
SELECT jobid, jobname, schedule, command, active 
FROM cron.job WHERE jobname = 'weekly-data-hygiene';

-- Disable temporarily
SELECT cron.alter_job(16, active := false);

-- Re-enable
SELECT cron.alter_job(16, active := true);

-- Change schedule (e.g. daily at 3 AM)
SELECT cron.alter_job(16, schedule := '0 3 * * *');
```

## Current Data Profile (2026-02-22)

| Table | Total Rows | Cleanup Candidates | Notes |
|-------|-----------|-------------------|-------|
| ats_jobs | 311,656 (288K open, 23K closed) | 0 (all <30 days) | Will grow as jobs age out |
| location_cache | 153,825 | 0 (all <30 days) | Geocoded entries from job locations |
| notification_log | 13 | 0 | Low volume pre-launch |
| notification_actions | 0 | 0 | Empty pre-launch |
| user_sessions | 35 | 0 | Low volume pre-launch |
| audit_log | 3 | 0 | Low volume pre-launch |
