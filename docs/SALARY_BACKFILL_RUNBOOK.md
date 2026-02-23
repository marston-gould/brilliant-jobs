# Salary Backfill Runbook — v3.87

**Date:** 2026-02-23

## Problem
- 20,579 open jobs have parsed salary data
- 267,971 open jobs do NOT (102,797 have content, 165,174 have no content)
- Many jobs with content contain salary ranges in the text that weren't captured by the original parser

## Prerequisites

Run in **Supabase SQL Editor** (longer timeout than PostgREST API):

### Step 1: Create the backfill index
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ats_jobs_salary_backfill 
ON ats_jobs (greenhouse_id, ats_source) 
WHERE status = 'open' AND salary_min IS NULL AND content IS NOT NULL;
```

### Step 2: Run backfill in batches
The `backfill_salary_batch()` function is already deployed. Run it repeatedly:

```sql
-- Run in SQL Editor (not PostgREST) for longer timeout
SELECT backfill_salary_batch(2000);  -- Run this repeatedly until updated = 0
```

### Step 3: Verify
```sql
SELECT 
  CASE WHEN salary_min IS NOT NULL THEN 'has_salary' ELSE 'no_salary' END as cat,
  count(*) 
FROM ats_jobs WHERE status = 'open' GROUP BY 1;
```

### Step 4: Drop the temp index
```sql
DROP INDEX IF EXISTS idx_ats_jobs_salary_backfill;
```

## Salary Parsing Patterns Covered

| Pattern | Example | Action |
|---------|---------|--------|
| `$X,XXX - $Y,YYY` | $70,000 - $90,000 | Annual range |
| `$X,XXX–$Y,YYY` | $120,000–$125,000 (en-dash) | Annual range |
| `$X to $Y` | $80,000 to $130,000 | Annual range |
| `$XX-$YY` per hour | $25–$35 per hour | Hourly → annualized × 2080 |
| `$XXX-$YYY` (K notation) | $70-$100 | Multiplied × 1000 |

## Sanity Checks
- Min ≥ $15,000 and ≤ $1,000,000
- Max ≥ Min and ≤ $2,000,000
- Hourly detection: looks for "per hour", "/hr", "hourly" keywords
