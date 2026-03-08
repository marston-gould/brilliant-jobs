# ADR-06: Data Pipeline Scaling — Implementation Log

> **Status:** IN PROGRESS (SA-007 done, SA-008/SA-009 pending)
> **Domain:** Data Infrastructure
> **ADR Proposed:** Scaling Architecture Design Plan v1.0

## SA-007: Common Crawl Ingestion Worker + Staging Table

**Completed:** 2026-03-07
**Pair:** Data Eng + Backend

### Architecture Decisions

1. **Athena for discovery, not raw WARC scanning.** The CC index (`ccindex.ccindex`) is queried via AWS Athena to find URLs matching job posting patterns. This is far more efficient than downloading and scanning raw WARC files — Athena processes the 300TB+ CC index in seconds, returning only relevant byte ranges.

2. **Three-table pipeline design:**
   - `cc_url_queue` — Athena-discovered URLs awaiting WARC fetch
   - `cc_staging_jobs` — Parsed job data before dedup/promotion
   - `cc_batch_tracking` — Batch progress, cost tracking, error metrics

3. **Three-phase extraction with priority fallback:**
   - Phase 1: schema.org JSON-LD `JobPosting` (highest quality, structured fields)
   - Phase 2: OpenGraph/meta tag extraction (medium quality)
   - Phase 3: HTML heuristic parsing (lowest quality, title-only often)
   - `extraction_method` field records which parser succeeded — useful for quality analysis.

4. **Typesense deferred.** Records remain in Postgres. The staging → ats_jobs promotion (SA-008) will insert directly. When Typesense is provisioned post-launch, the sync queue from SA-002 will pick up new ats_jobs rows automatically.

5. **Cost tracking built-in.** `cc_batch_tracking` records `athena_cost_usd` and `s3_bytes_read` per batch. This feeds into the Cost Guardian agent (SA-020) for budget enforcement.

6. **pg_cron placeholder only.** No automatic schedule — manual invocation via gateway endpoint until SA-008 validates the dedup pipeline. The cron SQL is commented out in the migration, ready to activate.

### WARC Parsing Strategy

Common Crawl stores web pages as gzip-compressed WARC records on S3. Each record is identified by:
- `warc_filename` — the WARC file (e.g., `crawl-data/CC-MAIN-2025-51/segments/.../warc/...`)
- `warc_record_offset` — byte offset within the file
- `warc_record_length` — compressed record size

The EF uses HTTP Range requests to fetch only the specific bytes for each record. CC data on S3 is publicly readable — no AWS auth needed for reads. Only the Athena API requires AWS credentials (SigV4 via `aws4fetch`).

WARC record format: WARC header → HTTP response header → HTML body. The EF strips both headers and processes only the HTML body.

### Batch Size Tuning Parameters

| Parameter | Default | Range | Notes |
|-----------|---------|-------|-------|
| Discovery limit | 10,000 URLs | 1–50,000 | Athena query LIMIT clause |
| Fetch batch size | 100 URLs/invocation | 1–500 | EF memory/timeout constraint |
| Max WARC record size | 5 MB | — | Skip oversized records |
| WARC fetch timeout | 15 seconds | — | Per-record abort signal |
| Athena poll interval | 2 seconds | — | Query completion check |
| Athena max polls | 60 (2 min) | — | Query timeout |

### URL Discovery Patterns

Default Athena WHERE clause filters:
```sql
url_path LIKE '%/jobs/%'
url_path LIKE '%/careers/%'
url_path LIKE '%/job/%'
url_path LIKE '%/position/%'
url_path LIKE '%/opening/%'
url_path LIKE '%/vacancy/%'
url_path LIKE '%/apply/%'
```

Exclusions: `.gov`, `.edu` domains; login/signin URLs.

### Gateway Integration

Route: `ingest-common-crawl` → gateway route #94
Auth: `requireAdmin()` — admin user or service_role JWT only
Rate limit: Default consumer tier rate (admin tier)

### Database Objects Created

| Object | Type | Purpose |
|--------|------|---------|
| `cc_staging_jobs` | Table | Parsed job data staging |
| `cc_batch_tracking` | Table | Batch progress + cost |
| `cc_url_queue` | Table | Athena-discovered URLs |
| `cc_batch_summary` | View | Admin dashboard view |
| `cc_job_id(url)` | Function | Stable CC job ID generator |
| `cc_update_batch_counters(...)` | Function | Atomic counter increment |
| RLS policies | Policy | Service role full access, admin read on batches |

### Secrets Required (Supabase Vault)

```
CC_AWS_ACCESS_KEY = <set via supabase secrets set — see CREDENTIALS_MASTER>
CC_AWS_SECRET_KEY = <set via supabase secrets set — see CREDENTIALS_MASTER>
```

### HOOK & SCAR Points

| Type | Location | Purpose |
|------|----------|---------|
| HOOK | `extraction_method` field | Future parsers register new methods |
| HOOK | `url_patterns` parameter | Discovery query is customizable per crawl |
| HOOK | Gateway route registry | Pipeline accessible via API consumer keys |
| SCAR | pg_cron schedule (commented) | Ready for SA-008 activation |
| SCAR | `cc_batch_tracking.estimated_cost` | Cost Guardian agent integration point |
| SCAR | PostHog events | Pipeline health monitoring (SA-011 agent) |

---

## SA-008: Deduplication Engine + Enrichment Queue (PENDING)

## SA-009: Incremental Materialized Views + Staleness Monitoring (PENDING)
