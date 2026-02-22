# Backup & Disaster Recovery Plan — v3.86

**Date:** 2026-02-22  
**Sprint Item:** 4 of 7 (Infrastructure Hardening)

---

## 1. Current State

| Metric | Value |
|--------|-------|
| Total DB size | 745 MB |
| ats_jobs | 311,656 rows (685 MB) — 92% of DB |
| location_cache | 153,825 rows (24 MB) |
| ats_companies | 10,175 rows (4 MB) |
| profiles | 2 rows |
| Cron jobs | 10 active |
| Supabase plan | Free tier |

## 2. Backup Layers

### Layer 1: Supabase Auto-Backups (built-in)
- **Free tier:** Daily backups, 7-day retention
- **Pro tier:** Daily backups, 14-day retention, PITR (point-in-time recovery)
- **Restore:** Supabase Dashboard → Settings → Database → Backups
- **Limitation:** Free tier does not support PITR; restores are full-database only

### Layer 2: GitHub Version Control
- All frontend code, Edge Functions, and docs in `marston-gould/brilliant-jobs`
- Protected main branch with squash merges
- Every deployment is a versioned commit (v3.81+)

### Layer 3: User Data Cloud Sync
- User settings (filters, tuning, pipeline meta) sync to `profiles.user_data` JSONB
- State module (`state.js`) handles bidirectional sync with conflict resolution
- localStorage is the write-ahead log; Supabase is the backup

### Layer 4: DR Health Check Function
- `SELECT dr_health_check()` — returns full database inventory, row counts, sizes, cron status
- Run before any maintenance operation to snapshot current state

## 3. Recovery Procedures

### Scenario A: Accidental Data Deletion (user data)
```sql
-- Restore from Supabase backup via Dashboard
-- Or: Query audit_log for recent changes
SELECT * FROM audit_log WHERE created_at > now() - interval '1 hour' ORDER BY created_at DESC;
```

### Scenario B: Bad Code Deploy
```bash
# Revert to previous commit
git revert HEAD
git push origin main
# Vercel auto-deploys from main
```

### Scenario C: ats_jobs Data Corruption
```sql
-- Check status breakdown
SELECT status, count(*) FROM ats_jobs GROUP BY status;

-- Re-fetch from ATS sources (triggers refresh-jobs for all companies)
SELECT net.http_post(
  url := 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/refresh-orchestrator',
  body := '{}'::jsonb,
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer <service_role_key>'
  )
);
```
- ATS sources are the canonical data — jobs can be re-fetched entirely
- location_cache can be rebuilt from ats_jobs.location values

### Scenario D: Supabase Project Outage
- **Frontend:** Vercel-hosted, continues serving static content
- **Data:** Users see stale localStorage data with "offline" indicator
- **Recovery:** Wait for Supabase restoration, or migrate to new project using backup

### Scenario E: Complete Database Loss
1. Restore from latest Supabase backup
2. If backup unavailable: re-create schema from `supabase/migrations/`
3. Re-populate ats_jobs by triggering full refresh across all ATS sources
4. User data (profiles) would need restoration from backup — this is the critical non-recoverable data

## 4. Data Classification

| Tier | Tables | Recoverable? | Notes |
|------|--------|-------------|-------|
| **Critical** (user data) | profiles, user_subscriptions, credit_ledger, resumes | From backup only | Non-recoverable without backup |
| **Important** (config) | notification_preferences, notification_channels, saved filters, company_collections | From backup + localStorage | Partially recoverable from client |
| **Rebuildable** (job data) | ats_jobs, ats_companies, location_cache | From ATS sources | Full re-fetch takes ~4-6 hours |
| **Transient** | notification_log, user_sessions, audit_log, hygiene_log | Acceptable loss | Low-value logs |

## 5. Monitoring

### Daily Health Check (automated via pg_cron)
```sql
-- Already scheduled: weekly-data-hygiene runs Sundays 3 AM UTC
-- DR health check can be run anytime:
SELECT dr_health_check();
```

### Alerts to Watch
- DB size approaching 500MB (Free tier limit: theoretically unlimited but performance degrades)
- ats_jobs row count dropping unexpectedly (bad refresh)
- Cron job failures (check `cron.job_run_details`)

```sql
-- Check for cron failures in last 24h
SELECT jobid, job_pid, status, return_message, start_time
FROM cron.job_run_details
WHERE status = 'failed'
  AND start_time > now() - interval '24 hours'
ORDER BY start_time DESC;
```

## 6. Pre-Maintenance Checklist
Before any destructive database operation:
1. Run `SELECT dr_health_check()` and save output
2. Verify latest Supabase backup exists (Dashboard → Backups)
3. Note current version in console (`BJ_VERSION`)
4. Test rollback path (git revert target commit identified)
5. Schedule during low-traffic window (3-6 AM UTC)

## 7. Upgrade Path: Pro Tier Benefits
When upgrading to Supabase Pro ($25/mo):
- PITR (point-in-time recovery) — recover to any second
- 14-day backup retention (vs 7-day)
- Daily logical backups downloadable
- Dedicated compute for better performance during restores
