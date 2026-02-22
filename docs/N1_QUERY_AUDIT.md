# N+1 Query Detection Audit — v3.82

**Date:** 2026-02-22  
**Sprint Item:** 1 of 7 (Infrastructure Hardening)

---

## Audit Results

### CRITICAL — Fixed in v3.82

| File | Pattern | Before | After | Impact |
|------|---------|--------|-------|--------|
| job-feed.js L45-58 | Radius search per-pill | N sequential RPC calls | Promise.allSettled parallel | 3 pills: 3→1 round-trip |
| job-feed.js L80-107 | State search per-pill | N sequential queries | Single `.in()` + parallel for ambiguous | 5 states: 5→1-2 round-trips |
| job-feed.js L731-758 | Stats triple-query per-filter | N×3 sequential queries | Promise.allSettled parallel | 5 filters: 15→1 round-trip |
| location.js L1206-1224 | Velocity counts per-filter | 3 sequential queries per filter | Promise.all parallel | Per filter: 3→1 round-trip |

### HIGH — Requires Edge Function refactor (future sprint)

| File | Pattern | Current | Fix Needed |
|------|---------|---------|------------|
| job-intelligence/index.ts | Per-user notification processing | N users × 5+ queries | Batch fetch all users + prefs, process in-memory |
| daily-digest/index.ts | Per-user digest generation | N users × multiple queries | Batch fetch all profiles + channels first |

### LOW — Acceptable Patterns (no fix needed)

| File | Pattern | Why Acceptable |
|------|---------|---------------|
| pipeline.js L188-196 | Batched job fetch (100/batch) | Correct batching, only on pipeline view |
| browsers.js L554-564 | Paginated company load (1000/page) | Only 10 calls for 10K companies, infrequent |
| refresh-jobs/index.ts L258-336 | Batched upsert + close (100/batch) | Server-side, already batching correctly |
| settings.js L147-153 | File upload per attachment | User-initiated, rarely >2 files |

### False Positives (not N+1)

| File | Line | Explanation |
|------|------|-------------|
| keywords.js L3066 | `Array.from($$('.sf-check:checked')).map(...)` | DOM iteration, not DB query |
| tuning.js L24 | Same DOM pattern | DOM iteration |
| pipeline.js L110 | Same DOM pattern | DOM iteration |
| resumes.js L717, L731 | `Array.from(inp.files).forEach(f => addResume(f))` | File processing, not DB query |
| job-feed.js L572-584 | `filtersToRun.map(sf => ...)` into `Promise.all` | Already parallelized correctly |

---

## Performance Impact Estimates

### Before (5 saved filters, user with 3 location pills):

- Page load stats: 5 filters × 3 queries = **15 sequential DB calls**
- Location resolution: 3 radius + 2 states = **5 sequential DB calls**  
- Velocity counts: 5 filters × 3 time ranges = **15 sequential DB calls**
- **Total: ~35 sequential round-trips**

### After v3.82:

- Page load stats: **1 parallel batch** (all 15 queries fire simultaneously)
- Location resolution: **1 parallel batch** for radius + **1 batched query** for states
- Velocity counts: **5 parallel batches** of 3 queries each (still per-filter due to location pre-fetch, but 3→1 within each)
- **Total: ~7 effective round-trips** (5× improvement)

---

## Recommendations for Future Sprints

1. **Create server-side RPC `filter_stats_batch(filters jsonb)`** — moves all count logic to PostgreSQL, reduces to 1 DB call total regardless of filter count
2. **Refactor job-intelligence/daily-digest** — batch fetch all user data upfront before per-user processing loops
3. **Consider increasing batch sizes** — pipeline.js (100→500), refresh-jobs (100→500) for fewer round-trips at scale
