# ADR-08: Incremental Materialized View Strategy

**Status:** Accepted  
**Date:** 2026-03-07  
**Session:** SA-009  
**Authors:** Data Eng + DevOps  
**Reviewer:** System Architect—Scalability

## Context

At 413K+ jobs (growing to 1M+ via Common Crawl ingestion), the dashboard and landing page perform expensive COUNT(*) and GROUP BY aggregation queries on every page load. The `refresh-city-stats` Edge Function runs full-table scans every 6 hours to populate `city_pages`. Weekly summary emails also aggregate the full table.

Current state:
- Dashboard stats page: 4-6 aggregation queries per load
- Landing page: 2-3 queries for hero stats
- `refresh-city-stats`: 5 sequential full-table scans of ats_jobs (245 lines)
- No change tracking — every refresh processes every row
- At 1M+ rows, these queries will take 10-30 seconds

## Decision

Implement **table-based materialized views** with **trigger-driven change tracking** and **incremental refresh**.

### Why not Postgres MATERIALIZED VIEW?

Postgres MVs require `REFRESH MATERIALIZED VIEW CONCURRENTLY` which:
1. Takes a full exclusive lock during non-concurrent refresh
2. Requires a unique index for concurrent refresh
3. Cannot be refreshed incrementally — always full rebuild
4. Cannot have RLS policies applied

Instead, we use regular tables populated by PL/pgSQL functions, giving us:
- Full control over incremental logic
- RLS compatibility (anon + authenticated can SELECT)
- Change log consumption pattern
- Automatic fallback to full refresh when delta exceeds threshold

### Architecture

```
ats_jobs (INSERT/UPDATE/DELETE)
    │
    ├── trg_ats_jobs_change_log (AFTER trigger)
    │       │
    │       └── ats_jobs_change_log (accumulates deltas)
    │
    └── pg_cron (every 3 min) → refresh-materialized-views EF
            │
            ├── mv_incremental_refresh()
            │     ├── Reads change log
            │     ├── If delta > 10% of table → falls back to full refresh
            │     ├── Refreshes mv_job_feed_counts (always full — tiny)
            │     ├── Refreshes mv_landing_stats (always full — single row)
            │     ├── Refreshes mv_source_breakdown (incremental by affected week)
            │     └── Truncates consumed changes
            │
            └── mv_full_refresh_all() (weekly Sunday 4 AM UTC)
```

### Tables Created

| Table | Purpose | Size | Refresh Strategy |
|-------|---------|------|-----------------|
| `mv_job_feed_counts` | Per-source totals | ~10 rows | Always full (tiny) |
| `mv_source_breakdown` | Weekly source breakdown | ~500 rows | Incremental by affected week |
| `mv_landing_stats` | Global dashboard stats | 1 row (singleton) | Always full (single row) |
| `ats_jobs_change_log` | Change tracking | Variable | Consumed and truncated after each refresh |
| `mv_refresh_log` | Refresh execution log | Grows slowly | Append-only |

### Performance Expectations

| Metric | Before (full scan) | After (incremental) | Improvement |
|--------|-------------------|--------------------|----|
| Refresh time (steady state) | 5-15s | <500ms | 10-30x |
| Refresh time (1M+ rows) | 30-60s | <1s | 30-60x |
| Dashboard page load | 2-4s (aggregation) | <100ms (pre-computed) | 20-40x |
| Change log overhead | N/A | ~1μs per row change | Negligible |

### Staleness Model

- **Fresh:** Data refreshed within 5 minutes (green)
- **Amber:** Data refreshed 5-15 minutes ago
- **Stale:** Data older than 15 minutes (red)
- Dashboard shows staleness badge from `mv_landing_stats.refreshed_at`
- Frontend code already in `js/stats.js` (`checkMVStaleness()`)

## Alternatives Considered

1. **Postgres MATERIALIZED VIEW** — Rejected: no incremental refresh, lock issues, no RLS
2. **Application-level caching only** — Rejected: still hits DB on cold cache, no staleness visibility
3. **Real-time streaming** — Overkill: 3-minute latency is acceptable for aggregated stats
4. **Redis/external cache** — Added complexity for marginal benefit over in-DB tables

## Consequences

- Dashboard and landing page read pre-computed aggregates (instant)
- Every ats_jobs mutation adds ~1 row to change_log (negligible overhead)
- Weekly full refresh ensures consistency even if incremental logic has edge cases
- `mv_refresh_log` provides operational visibility into refresh performance
- City stats refresh (`refresh-city-stats`) continues independently for `city_pages` table (future: migrate to same pattern)

## Hook Points

- `mv_refresh_log` → Future: alerting when refresh duration exceeds threshold
- `ats_jobs_change_log.op` column → Future: track specific field changes for smarter deltas
- `refresh_type` extensible → Future: add 'partial' type for targeted dimension refresh
- Change log pattern reusable for any table needing incremental refresh

## Migration

- `v6.23-incremental-materialized-views.sql`
- Edge Function: `refresh-materialized-views`
- Gateway: Route #96
- Cron: `mv-incremental-refresh` (*/3 * * * *), `mv-full-refresh-weekly` (0 4 * * 0)
