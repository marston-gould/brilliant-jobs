# Feature Brief: Job Feed Caching — Client-Side + Server-Side

**From:** Pod 1 (Growth) — CPO
**To:** Pod 2 (Engineering) — CTO + Data Architect + Performance Engineer
**Date:** March 2, 2026
**Priority:** Phase A — Pre-launch critical (A14 + A15)
**Replaces:** C10 from original Architecture Review roadmap
**References:** Architecture Review §27 (Caching Layer), §28 (Unbounded Datasets), §26 (Paginate Database Reads), §29 (Index Design)

---

## Strategic Context

### Why Now (Not Post-Launch)

The job feed is the core surface of Brilliant Jobs. Every logged-in session hits `ats_jobs` repeatedly — on load, on filter toggle, on pagination, on tab-back. With 350K+ jobs in the table and no caching layer, every interaction is a cold Supabase query. At launch, if 50 concurrent users are each triggering 10-15 queries per session, that's 500-750 unbuffered database reads per minute on a table that only changes every 10 minutes (the refresh cycle).

Caching isn't a scale optimization — it's a launch-day UX requirement. Without it, users will experience noticeable latency on filter switches and page returns, and the Supabase connection pool will be under unnecessary pressure from identical repeated queries.

### What We're Building

A two-layer caching system:

1. **A14 — Client-side in-memory query cache** that prevents redundant Supabase hits within a user session. Fast to build, zero infrastructure cost, immediate UX improvement.

2. **A15 — Server-side materialized views** for the heaviest aggregation queries (landing page stats, job feed counts, source breakdowns). Eliminates full table scans for data that only changes on the refresh cycle.

### What This Is NOT

- Not a CDN or edge cache (Vercel handles static asset caching already)
- Not a Redis/Memcached layer (overkill for current scale, would add infrastructure cost)
- Not a replacement for pagination (caching unbounded queries is an antipattern — pagination must land first or alongside)

---

## Phase A14: Client-Side In-Memory Query Cache + Pagination Fix

### What We're Building

Two things in one pass:

1. **Pagination fix** — Cap the job feed at 500 rows per request with "Load more", and bound all other unbounded queries. Caching unbounded queries is an antipattern, so this must land as part of the same work.

2. **In-memory cache wrapper** — A `Map`-based cache that intercepts Supabase query results and serves them from memory when the same query is repeated within the TTL window. No localStorage, no IndexedDB — pure in-memory, dies when the tab closes.

### Pagination

The Architecture Review identifies several unbounded dataset violations that must be fixed before caching is useful:

| Query | Risk | Required Fix |
|-------|------|-------------|
| Job feed "All" view | Could return entire `ats_jobs` table | Max 500 rows + "Load more" |
| `ats_companies` browser | No visible limit | Add `.limit(100)` + pagination |
| `company_slug` count | `.limit(2000)` just to count | Use `count: 'exact', head: true` |

**Hard rule:** No query should ever return more than 1,000 rows to the client in a single response. The job feed enforces a max of 500 rows per page with a "Load more" button for the next batch.

```javascript
// Standard cursor-based pagination for job feed
async function paginatedJobFeed(filters, { page = 0, pageSize = 50 } = {}) {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = sb
    .from('ats_jobs')
    .select('*', { count: 'exact' })
    .eq('status', 'open')
    .range(from, to)
    .order('first_seen_at', { ascending: false });

  query = applyJobFeedFilters(query, filters);

  const { data, count, error } = await query;
  return { data, total: count, page, pageSize, hasMore: (from + pageSize) < count };
}
```

### Cache

### Architecture

```
User action (filter toggle, page load, tab-back)
  │
  ▼
cachedQuery(cacheKey, queryFn)
  │
  ├── Cache HIT (within TTL) → return cached data instantly
  │
  └── Cache MISS (expired or first request) → execute queryFn()
        │
        ├── Store result + timestamp in Map
        └── Return fresh data
```

### Implementation

```javascript
// js/cache.js — new module

const queryCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Execute a query with in-memory caching.
 * @param {string} key - Unique cache key for this query
 * @param {Function} queryFn - Async function that returns { data, count, error }
 * @param {object} options - Optional overrides
 * @param {number} options.ttl - Custom TTL in ms (default: 5 min)
 * @param {boolean} options.bypass - Force cache miss (default: false)
 * @returns {Promise<{ data, count, error, cached: boolean }>}
 */
async function cachedQuery(key, queryFn, { ttl = CACHE_TTL, bypass = false } = {}) {
  if (!bypass) {
    const cached = queryCache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return { ...cached.result, cached: true };
    }
  }

  const result = await queryFn();

  if (!result.error) {
    queryCache.set(key, { result, timestamp: Date.now() });
  }

  return { ...result, cached: false };
}

/**
 * Invalidate cache entries matching a prefix.
 * Call after mutations (e.g., user saves a filter, pipeline stage change).
 * @param {string} prefix - Key prefix to invalidate (e.g., 'jobfeed:')
 */
function invalidateCache(prefix) {
  for (const key of queryCache.keys()) {
    if (key.startsWith(prefix)) {
      queryCache.delete(key);
    }
  }
}

/**
 * Clear the entire cache.
 * Call on logout or when refresh cycle completes.
 */
function clearCache() {
  queryCache.clear();
}

/**
 * Get cache stats for debugging.
 * Logged to console in dev mode.
 */
function getCacheStats() {
  let hits = 0, misses = 0, expired = 0;
  const now = Date.now();
  for (const [key, entry] of queryCache) {
    if (now - entry.timestamp < CACHE_TTL) hits++;
    else expired++;
  }
  return { entries: queryCache.size, active: hits, expired, ttl: CACHE_TTL };
}
```

### Cache Key Strategy

Cache keys must be deterministic and unique per query shape. The key is a composite of the query context:

```javascript
// Key generation for job feed queries
function jobFeedCacheKey(filters, page, pageSize) {
  const filterHash = JSON.stringify({
    what: filters.whatPills?.sort(),
    where: filters.wherePills?.sort(),
    who: filters.whoPills?.sort(),
    type: filters.typePills?.sort(),
    salaryMin: filters.salaryMin,
    salaryMax: filters.salaryMax,
    sources: filters.sources?.sort(),
    includeRemote: filters.includeRemote
  });
  return `jobfeed:${btoa(filterHash)}:p${page}:s${pageSize}`;
}

// Key generation for stats queries
function statsCacheKey(filterName) {
  return `stats:${filterName}`;
}

// Key generation for landing page
function landingCacheKey() {
  return `landing:stats`;
}
```

### Integration Points

The cache wraps existing Supabase queries — no changes to the query logic itself. The integration points are in the modules that fetch data:

| Module | Function | Cache Key Prefix | TTL |
|--------|----------|-----------------|-----|
| `job-feed.js` | Job feed load/filter/paginate | `jobfeed:` | 5 min |
| `browsers.js` | Company/Location/Industry browsers | `browser:` | 5 min |
| `app.js` | Landing page stats | `landing:` | 10 min |
| `stats.js` | Stats page aggregations | `stats:` | 5 min |
| `keywords.js` | Keyword extraction results | `keywords:` | 10 min |

### Cache Invalidation Rules

| Event | Action | Reason |
|-------|--------|--------|
| User changes filter pills | Invalidate `jobfeed:` prefix | New query shape |
| User saves/deletes a filter | Invalidate `jobfeed:` + `stats:` | Data context changed |
| User moves job in pipeline | Invalidate `jobfeed:` | Job status may change feed |
| User logs out | `clearCache()` | Security — don't leak data to next user |
| Tab becomes visible after >5 min | `clearCache()` | Stale data risk |
| Refresh cycle webhook (future) | `clearCache()` | New data available |

### Visibility Timeout Pattern

```javascript
// In js/app.js — clear cache when user returns to stale tab
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const lastActive = parseInt(sessionStorage.getItem('bj_last_active') || '0');
    if (Date.now() - lastActive > CACHE_TTL) {
      clearCache();
      console.log('[Cache] Cleared — tab was inactive > 5 min');
    }
  } else {
    sessionStorage.setItem('bj_last_active', Date.now().toString());
  }
});
```

### What NOT to Cache

| Query Type | Reason |
|------------|--------|
| Auth/session checks | Must always be fresh |
| Pipeline mutations (save, move, delete) | Write operations — invalidate, don't cache |
| Notification preference reads | Low frequency, must be accurate |
| Resume file operations | Binary data, not query results |
| Real-time counts for "X new jobs" badge | Must reflect latest state |

### Console Logging

In development mode, the cache should log hits and misses for debugging:

```javascript
// Controlled by console flag
if (window.BJ_DEBUG_CACHE) {
  console.log(`[Cache ${result.cached ? 'HIT' : 'MISS'}] ${key} (${queryCache.size} entries)`);
}
```

### Acceptance Criteria — A14

**Pagination:**
- [ ] Job feed "All" view capped at 500 rows per request
- [ ] "Load more" button appends next 500 rows (cursor-based, not offset re-fetch)
- [ ] Total count displayed: "Showing X of Y jobs"
- [ ] Filter changes reset to page 1
- [ ] `ats_companies` browser limited to 100 rows + pagination
- [ ] `company_slug` count uses `count: 'exact', head: true` (no row transfer)

**Cache:**
- [ ] `js/cache.js` module created with `cachedQuery()`, `invalidateCache()`, `clearCache()`, `getCacheStats()`
- [ ] Job feed queries routed through `cachedQuery()` with deterministic keys
- [ ] Stats page queries routed through `cachedQuery()`
- [ ] Landing page stats routed through `cachedQuery()` with 10-min TTL
- [ ] Browser pages (Company, Location, Industry) routed through `cachedQuery()`
- [ ] Cache invalidation fires on: filter change, pipeline mutation, logout
- [ ] Visibility timeout clears cache after 5+ min inactive
- [ ] `cached: true/false` flag returned with all cached query results
- [ ] Console logging available via `window.BJ_DEBUG_CACHE = true`
- [ ] No localStorage or IndexedDB usage (in-memory only)
- [ ] Repeated filter toggle within 5 min returns instant (< 50ms) cached result

### Effort Estimate — A14

| Work Unit | Effort |
|-----------|--------|
| Pagination: job feed 500-row cap + "Load more" UI | 1h |
| Pagination: browser limits + count optimization | 30 min |
| `js/cache.js` module (cachedQuery, invalidate, clear, stats) | 30 min |
| Cache key generation functions | 15 min |
| Integrate into `job-feed.js` | 15 min |
| Integrate into `stats.js`, `browsers.js`, `app.js` (landing) | 30 min |
| Invalidation wiring (filter change, logout, visibility) | 15 min |
| Console debug logging | 5 min |
| Testing: pagination + cache (filter toggle latency, tab-back, logout clear) | 45 min |
| **Total** | **~4.5h (1 dev day)** |

---

## Phase A15: Server-Side Materialized Views

### What We're Building

PostgreSQL materialized views for the heaviest aggregation queries, refreshed by pg_cron on a 10-minute cycle (matching the `refresh-jobs` schedule). These views pre-compute expensive `COUNT`, `COUNT(DISTINCT)`, and `FILTER` operations that would otherwise require full table scans on every request.

### Architecture

```
pg_cron (every 10 min)
  │
  ├── REFRESH MATERIALIZED VIEW CONCURRENTLY mv_landing_stats
  ├── REFRESH MATERIALIZED VIEW CONCURRENTLY mv_job_feed_counts
  └── REFRESH MATERIALIZED VIEW CONCURRENTLY mv_source_breakdown
  
Client query hits view (instant) instead of base table (full scan)
```

### Materialized View Definitions

#### MV1: Landing Page Stats

The landing page currently queries `ats_jobs` directly for hero stats. With 350K+ rows, `count(*)` with filters is expensive on every page load.

```sql
-- Landing page hero numbers
CREATE MATERIALIZED VIEW mv_landing_stats AS
SELECT
  count(*)                                              AS total_jobs,
  count(DISTINCT company_slug)                          AS total_companies,
  count(*) FILTER (WHERE salary_min IS NOT NULL)        AS jobs_with_salary,
  count(*) FILTER (WHERE loc_type = 'remote')           AS remote_jobs,
  count(DISTINCT ats_source)                            AS total_sources,
  max(first_seen_at)                                    AS latest_job_date,
  now()                                                 AS refreshed_at
FROM ats_jobs
WHERE status = 'open';

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_mv_landing_stats ON mv_landing_stats (refreshed_at);
```

#### MV2: Job Feed Aggregate Counts

Pre-computed counts per filter dimension so the UI can show "X jobs" next to filter pills without running a full query.

```sql
-- Per-source, per-location-type, per-country counts
CREATE MATERIALIZED VIEW mv_job_feed_counts AS
SELECT
  ats_source,
  loc_type,
  loc_country,
  count(*)                                         AS job_count,
  count(*) FILTER (WHERE salary_min IS NOT NULL)   AS with_salary,
  min(salary_min) FILTER (WHERE salary_min IS NOT NULL)  AS min_salary,
  max(salary_max) FILTER (WHERE salary_max IS NOT NULL)  AS max_salary,
  now()                                            AS refreshed_at
FROM ats_jobs
WHERE status = 'open'
GROUP BY ats_source, loc_type, loc_country;

-- Unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_mv_feed_counts
  ON mv_job_feed_counts (ats_source, COALESCE(loc_type, ''), COALESCE(loc_country, ''));
```

#### MV3: Source Breakdown (for Stats Page + Internal Analytics)

```sql
-- ATS source breakdown with time dimension
CREATE MATERIALIZED VIEW mv_source_breakdown AS
SELECT
  ats_source,
  date_trunc('week', first_seen_at)::date   AS week,
  count(*)                                    AS jobs_added,
  count(DISTINCT company_slug)                AS companies,
  now()                                       AS refreshed_at
FROM ats_jobs
WHERE status = 'open'
  AND first_seen_at >= now() - interval '6 months'
GROUP BY ats_source, date_trunc('week', first_seen_at);

-- Unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_mv_source_breakdown
  ON mv_source_breakdown (ats_source, week);
```

### pg_cron Schedule

```sql
-- Refresh all materialized views every 10 minutes
-- Matches the refresh-jobs cycle so data stays consistent
SELECT cron.schedule(
  'refresh-materialized-views',
  '*/10 * * * *',
  $$
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_landing_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_job_feed_counts;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_source_breakdown;
  $$
);
```

### CONCURRENTLY Requirement

`REFRESH MATERIALIZED VIEW CONCURRENTLY` allows reads to continue during refresh (no downtime). It requires:

1. A **unique index** on each materialized view (defined above)
2. The initial `CREATE` must run without `CONCURRENTLY` (first population)
3. All subsequent refreshes use `CONCURRENTLY`

Without `CONCURRENTLY`, a refresh locks the view and all queries block until completion. For a 350K row table, that could be 2-5 seconds of downtime every 10 minutes — unacceptable at launch.

### Client Integration

Replace direct `ats_jobs` queries with materialized view reads where applicable:

```javascript
// BEFORE: Landing page stats (full table scan)
const { data } = await sb
  .from('ats_jobs')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'open');

// AFTER: Landing page stats (materialized view, instant)
const { data } = await sb
  .from('mv_landing_stats')
  .select('*')
  .single();
// Returns: { total_jobs, total_companies, jobs_with_salary, remote_jobs, ... }
```

```javascript
// BEFORE: Count by source (full GROUP BY)
const { data } = await sb
  .from('ats_jobs')
  .select('ats_source')
  .eq('status', 'open');
// Then client-side: group and count

// AFTER: Source counts (pre-aggregated)
const { data } = await sb
  .from('mv_job_feed_counts')
  .select('ats_source, job_count');
// Already grouped, just sum
```

### RLS Considerations

Materialized views **do not inherit RLS policies** from their base tables. Since these views contain aggregate data (counts, not individual rows), this is acceptable — no PII is exposed. However:

- [ ] **Do NOT create materialized views that expose individual job details** — only aggregates
- [ ] **RLS on the views themselves**: Allow `SELECT` for all authenticated users, no write access

```sql
-- RLS on materialized views
ALTER MATERIALIZED VIEW mv_landing_stats OWNER TO postgres;
ALTER MATERIALIZED VIEW mv_job_feed_counts OWNER TO postgres;
ALTER MATERIALIZED VIEW mv_source_breakdown OWNER TO postgres;

-- Grant read access to authenticated users via anon/authenticated roles
GRANT SELECT ON mv_landing_stats TO anon, authenticated;
GRANT SELECT ON mv_job_feed_counts TO anon, authenticated;
GRANT SELECT ON mv_source_breakdown TO anon, authenticated;
```

**Note:** `mv_landing_stats` is granted to `anon` because the landing page is public (pre-auth). The other views could be restricted to `authenticated` if desired, but the data is aggregate and non-sensitive.

### Monitoring

Add a check to the health endpoint (A7) that verifies views are fresh:

```sql
-- Alert if any view is stale (> 15 min since last refresh)
SELECT
  'mv_landing_stats' AS view_name,
  refreshed_at,
  now() - refreshed_at AS age,
  CASE WHEN now() - refreshed_at > interval '15 minutes' THEN 'STALE' ELSE 'OK' END AS status
FROM mv_landing_stats
UNION ALL
SELECT
  'mv_job_feed_counts',
  max(refreshed_at),
  now() - max(refreshed_at),
  CASE WHEN now() - max(refreshed_at) > interval '15 minutes' THEN 'STALE' ELSE 'OK' END
FROM mv_job_feed_counts;
```

### Acceptance Criteria — A15

- [ ] `mv_landing_stats` materialized view created with unique index
- [ ] `mv_job_feed_counts` materialized view created with unique index
- [ ] `mv_source_breakdown` materialized view created with unique index
- [ ] pg_cron job `refresh-materialized-views` runs every 10 minutes
- [ ] All refreshes use `CONCURRENTLY` (no read locks)
- [ ] Landing page reads from `mv_landing_stats` instead of `ats_jobs` count
- [ ] Stats page source breakdown reads from `mv_source_breakdown`
- [ ] Filter pill counts read from `mv_job_feed_counts` where applicable
- [ ] `anon` role has `SELECT` on `mv_landing_stats` (public landing page)
- [ ] `authenticated` role has `SELECT` on all three views
- [ ] Health endpoint includes view staleness check (> 15 min = alert)
- [ ] Initial `CREATE` runs without `CONCURRENTLY`, subsequent refreshes use it
- [ ] `refreshed_at` column present on all views for staleness monitoring
- [ ] Landing page load time under 200ms (currently estimated 500ms+ on cold query)

### Effort Estimate — A15

| Work Unit | Effort |
|-----------|--------|
| Schema: 3 materialized views + unique indexes | 1h |
| pg_cron schedule for concurrent refresh | 30 min |
| RLS / grant configuration | 15 min |
| Client integration: landing page → `mv_landing_stats` | 30 min |
| Client integration: stats page → `mv_source_breakdown` | 30 min |
| Client integration: feed counts → `mv_job_feed_counts` | 30 min |
| Health endpoint staleness check | 15 min |
| Testing: refresh cycle, concurrent reads, data accuracy | 1h |
| **Total** | **~4.5h** |

**Note:** Original estimate was 3h (from C10). Revised to 4.5h because we're doing all three views + client integration + monitoring, not just the landing stats view originally scoped in C10.

---

## Deploy Order

This work spans database schema and frontend code. Follow the Deployment Process:

```
1. Database: CREATE MATERIALIZED VIEW (3 views + indexes)     — additive, safe
2. Database: GRANT SELECT + pg_cron schedule                   — additive, safe
3. Frontend: js/cache.js module (new file, no breaking changes)
4. Frontend: Integrate cache into job-feed.js, stats.js, etc.
5. Frontend: Switch landing page to mv_landing_stats
6. Frontend: Switch stats page to mv_source_breakdown
7. Build + Deploy + Version bump (dashboard + console + footers)
8. Verify: Console prints new version, cache debug works, landing stats instant
```

### Deploy Dependencies

```
## Deploy Dependencies
- [ ] Requires DB migration: CREATE MATERIALIZED VIEW (3 views)
- [ ] Requires DB migration: pg_cron schedule for refresh
- [ ] Requires DB migration: GRANT SELECT on views
- [ ] No Edge Function deploy required
- [ ] No env variable changes
- [ ] Frontend changes: new js/cache.js module + integration across 4 modules
- [ ] Version bump required: dashboard.html, js/app.js, index.html, data lab footers, SEO page footers
```

---

## Combined Effort Summary

| Phase | Scope | Effort | Timeline |
|-------|-------|--------|----------|
| A14 — Client-side cache + pagination | Pagination fix (500-row cap, Load More, browser limits) + js/cache.js, integration across 4 modules, invalidation, visibility timeout | 4.5h | 1 dev day |
| A15 — Server-side MVs | 3 materialized views, pg_cron, client integration, monitoring | 4.5h | 1 dev day (can run in parallel with A14) |
| **Total** | | **~9h (2 dev days)** | Before March 23 launch |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Stale cache serves outdated data after new jobs arrive | Medium | Low | 5-min TTL + visibility timeout + manual `clearCache()` available |
| Materialized view refresh blocks reads | Low | High | `CONCURRENTLY` refresh with unique indexes prevents this |
| pg_cron refresh fails silently | Medium | Medium | Health endpoint staleness check + alerting (A7/B11) |
| Cache key collisions | Low | Low | Deterministic key generation with JSON.stringify + btoa |
| Memory pressure from large cache | Low | Low | In-memory Map with TTL auto-expires; worst case: hundreds of entries at ~1KB each |

---

## Version Discipline Reminder

Per the Deployment Process, every deploy touching this work **must** version bump in:

1. `js/app.js` — `const BJ_VERSION = 'vX.XX';`
2. `dashboard.html` — footer + HTML comment
3. `index.html` — footer
4. Data lab page footers
5. SEO/content page footers
6. Browser console must print: `Dashboard vX.XX loaded`

Cache-busting query parameter on JS bundle reference must also update:
```html
<script src="/dist/dashboard.min.js?v=X.XX"></script>
```
