# Index Maintenance Runbook — v3.81

**Date:** 2026-02-22  
**Sprint Item:** 5 of 7 (Infrastructure Hardening)  
**PR:** [#38](https://github.com/marston-gould/brilliant-jobs/pull/38)

---

## Pre-Maintenance Audit Findings

### Table Sizes (311K+ rows in ats_jobs)

| Table | Rows | Table Size | Index Size | Total |
|-------|------|-----------|-----------|-------|
| ats_jobs | 311,656 | 220 MB | 564 MB → **465 MB** | 784 MB → **685 MB** |
| location_cache | 153,825 | 16 MB | 13 MB → **9 MB** | 28 MB → **24 MB** |
| ats_companies | 10,175 | 2 MB | 3 MB → **2 MB** | 5 MB → **4 MB** |

**Key finding:** ats_jobs had a 2.6:1 index-to-data ratio (564MB indexes on 220MB data). After cleanup: ~2.1:1.

### Dead Tuples

| Table | Live | Dead | Dead % | Last Autovacuum |
|-------|------|------|--------|-----------------|
| ats_jobs | 311,656 | 9,838 | 3.06% | **Never** |
| ats_companies | 10,175 | 300 | 2.86% | **Never** |

⚠️ **Autovacuum has never run** on these tables. This is unusual and may indicate Supabase Free tier limitations or misconfigured autovacuum settings.

---

## Completed Actions (via PostgREST RPC)

### 7 Unused Indexes Dropped (~104 MB reclaimed)

| Index | Table | Size | Scans | Reason |
|-------|-------|------|-------|--------|
| `idx_ats_jobs_search_vector` | ats_jobs | 55 MB | 0 | Redundant with `idx_ats_jobs_open_search` (partial, 624 scans) |
| `idx_ats_jobs_location_trgm` | ats_jobs | 18 MB | 0 | `idx_ats_jobs_location_structured` covers queries (45 scans) |
| `idx_ats_jobs_last_seen` | ats_jobs | 15 MB | 1 | `idx_ats_jobs_status_updated` covers similar patterns |
| `idx_ats_jobs_industry` | ats_jobs | 8 MB | 0 | Never queried by industry alone |
| `idx_ats_jobs_department` | ats_jobs | 3 MB | 0 | Never queried by department alone |
| `idx_location_cache_normalized` | location_cache | 4 MB | 0 | Normalized column never queried |
| `idx_companies_refresh_active` | ats_companies | 608 KB | 0 | Duplicate of `idx_ats_companies_refresh` |

### New Functions Created

- **`index_health_report()`** — Returns JSON summary of all index health metrics
- **`run_query(sql text)`** — Ad-hoc SQL execution returning JSON results

---

## Manual Steps Required (Supabase SQL Editor)

These commands cannot run through PostgREST because they require non-transactional execution. Run each in the **Supabase SQL Editor** (Dashboard → SQL Editor).

### Step 1: VACUUM ANALYZE (clean dead tuples, update planner stats)

```sql
-- Run each separately (VACUUM can't be batched)
VACUUM ANALYZE ats_jobs;
VACUUM ANALYZE ats_companies;
VACUUM ANALYZE location_cache;
```

### Step 2: REINDEX active indexes (defragment, reclaim space)

```sql
-- These are the most-used indexes, sized for 135K but now at 311K+
-- CONCURRENTLY = no table locks, safe in production
REINDEX INDEX CONCURRENTLY ats_jobs_source_id_unique;
REINDEX INDEX CONCURRENTLY idx_ats_jobs_title_trgm;
REINDEX INDEX CONCURRENTLY idx_ats_jobs_open_search;
REINDEX INDEX CONCURRENTLY idx_ats_jobs_first_seen_status;
REINDEX INDEX CONCURRENTLY idx_ats_jobs_slug_source_status;
REINDEX INDEX CONCURRENTLY idx_ats_jobs_source_status;
REINDEX INDEX CONCURRENTLY idx_ats_jobs_location_structured;
REINDEX INDEX CONCURRENTLY idx_ats_jobs_salary;
REINDEX INDEX CONCURRENTLY idx_ats_jobs_closed_at;
REINDEX INDEX CONCURRENTLY idx_ats_jobs_company_name;
REINDEX INDEX CONCURRENTLY idx_ats_jobs_status_updated;
```

### Step 3: Verify

```sql
SELECT index_health_report();
```

Expected outcome: total index size should drop further after VACUUM + REINDEX.

---

## Remaining Active Indexes (ats_jobs)

| Index | Type | Size | Scans | Purpose |
|-------|------|------|-------|---------|
| `ats_jobs_source_id_unique` | btree (greenhouse_id, ats_source) | 22 MB | 6,599 | Dedup composite key — **most used** |
| `idx_ats_jobs_title_trgm` | GIN trigram (title) WHERE open | 29 MB | 625 | Fuzzy title search |
| `idx_ats_jobs_open_search` | GIN (search_vector) WHERE open | 5.7 MB | 624 | Full-text search on open jobs |
| `idx_ats_jobs_slug_source_status` | btree (company_slug, ats_source, status) | 8.5 MB | 242 | Company + source filtering |
| `idx_ats_jobs_first_seen_status` | btree (first_seen_at, status) WHERE open | 9.4 MB | 115 | Job feed sorting by newness |
| `idx_ats_jobs_location_structured` | btree (loc_country, loc_state, loc_city) WHERE open | 6.7 MB | 45 | Location filtering |
| `idx_ats_jobs_source_status` | btree (ats_source, status) | 6.2 MB | 36 | Source + status queries |
| `idx_ats_jobs_salary` | btree (salary_min, salary_max) WHERE NOT NULL | 600 KB | 23 | Salary range queries |
| `idx_ats_jobs_closed_at` | btree (closed_at) WHERE NOT NULL | 552 KB | 18 | Closed job lookups |
| `idx_ats_jobs_status_updated` | btree (status, updated_at DESC) | 7.5 MB | 9 | Status change ordering |
| `idx_ats_jobs_company_name` | btree (company_name) | 5.7 MB | 2 | Company name lookups |

---

## Ongoing Monitoring

### Weekly Health Check

Run in SQL Editor or call via service role:

```sql
SELECT index_health_report();
```

This returns:
- **summary**: total indexes, total size, unused count/size
- **top_unused**: largest indexes with 0 scans (drop candidates)
- **top_used**: most frequently scanned indexes
- **table_stats**: row counts, dead tuples, dead tuple percentages

### Monthly Maintenance Schedule

1. Run `VACUUM ANALYZE` on ats_jobs, ats_companies, location_cache
2. Check `index_health_report()` for new unused indexes
3. If dead tuple % > 10%, run `VACUUM FULL` (requires brief lock)
4. If table has doubled in size since last REINDEX, run `REINDEX CONCURRENTLY`

### Alert Thresholds

| Metric | Warning | Action |
|--------|---------|--------|
| Dead tuple % | > 5% | Run VACUUM ANALYZE |
| Dead tuple % | > 15% | Run VACUUM FULL (brief downtime) |
| Index-to-data ratio | > 3:1 | Audit for redundant indexes |
| Unused index > 10MB | Any | Investigate, consider dropping |
| Total DB size | > 1 GB | Review data retention policies |

---

## Rollback

If any dropped index turns out to be needed, recreate with:

```sql
-- Only recreate if query performance degrades
CREATE INDEX CONCURRENTLY idx_ats_jobs_search_vector ON ats_jobs USING gin (search_vector);
CREATE INDEX CONCURRENTLY idx_ats_jobs_location_trgm ON ats_jobs USING gin (location gin_trgm_ops) WHERE (status = 'open');
CREATE INDEX CONCURRENTLY idx_ats_jobs_last_seen ON ats_jobs USING btree (last_seen);
CREATE INDEX CONCURRENTLY idx_ats_jobs_industry ON ats_jobs USING btree (industry);
CREATE INDEX CONCURRENTLY idx_ats_jobs_department ON ats_jobs USING btree (department) WHERE (department IS NOT NULL AND status <> 'closed');
CREATE INDEX CONCURRENTLY idx_location_cache_normalized ON location_cache USING btree (normalized);
CREATE INDEX CONCURRENTLY idx_companies_refresh_active ON ats_companies USING btree (last_checked ASC NULLS FIRST, source) WHERE (is_active = true);
```
