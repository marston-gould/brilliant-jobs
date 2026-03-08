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

---

## SA-018: Read Replica Setup + Query Routing (IMPLEMENTED)

**Date:** 2026-03-07
**Status:** IMPLEMENTED
**Pair:** DevOps + Backend Eng
**Reviewer:** System Architect—Scalability

### Decision

Provision a Supabase read replica and route all read-only SELECT queries through the replica, keeping all writes on the primary. The gateway middleware classifies routes at the gateway layer and injects `x-gateway-db-mode` headers for downstream Edge Functions.

### Context

With 413K+ jobs in ats_jobs and growing (Common Crawl pipeline producing 50K+ records per batch), read load on the primary database is the dominant performance bottleneck. Dashboard search, job previews, analytics, and admin reads account for ~70% of total database queries. Offloading these to a read replica reduces primary CPU load and improves write performance for enrichment, pipeline mutations, and user actions.

### Architecture

```
Client → Cloudflare → Gateway
          │
          ├── auth middleware
          ├── read-replica-routing middleware (NEW)
          │     ├── GET + READ_ONLY_ROUTES → x-gateway-db-mode: read
          │     └── else → x-gateway-db-mode: write
          ├── rate-limiter
          ├── response-cache
          │
          └── downstream EF
                ├── getDbClient('read')  → replica (via _shared/db-client.ts)
                └── getDbClient('write') → primary
```

### Components

| Component | File | Purpose |
|-----------|------|---------|
| SQL migration | `v6.27-read-replica-monitoring.sql` | replica_health_log, replica_routing_stats, monitoring functions, pg_cron |
| Shared client | `_shared/db-client.ts` | Dual-mode client factory with automatic failover |
| Gateway middleware | `_shared/read-replica-middleware.ts` | Route classification + header injection + stats logging |
| Health EF | `replica-health/index.ts` | Replica lag monitoring, config, reset endpoint |
| Gateway update | `api-gateway/index.ts` | Pipeline integration, route #103, header forwarding |

### Read-Only Route Classification

17 routes classified as read-only (GET only): chat-job-search, preview-jobs, match-score-overlay, job-intelligence, recruiter-lookup, extension-heartbeat, health-check, admin-analytics, trend-anomaly-detector, refresh-city-stats, score-job-fraud, score-sequence, filter-to-prompt, crewai-orchestrator, refresh-mv-incremental, replica-health.

Classification criteria: route is confirmed to execute only SELECT queries with no side effects. Mixed-mode routes (read + conditional write) remain on primary.

### Failover Strategy

1. If `READ_REPLICA_URL` is not set → all reads go to primary (graceful degradation)
2. If replica client errors → automatic fallback to primary + cache "unavailable" for 60s
3. `readWithFallback()` utility retries on primary if replica query fails
4. Admin can POST `/replica-health/reset` to clear the availability cache
5. pg_cron health check every 30s detects disconnection + fires CrewAI Pipeline Health alert

### Monitoring

- `replica_health_log` — 30-second interval time-series of lag measurements
- `replica_routing_stats` — per-route read/write/fallback counts
- `v_replica_dashboard` — admin panel view with current state + 1h aggregates
- Alert threshold: lag > 5 seconds → `alert_fired = true` + agent_action_log entry
- PostHog: `gateway:replica_routing` structured log events

### HOOK & SCAR Points

| Type | Location | Purpose |
|------|----------|---------|
| HOOK | `READ_ONLY_ROUTES` set | New read-only routes register here without editing gateway core |
| HOOK | `db-client.ts` | Any EF can import getReadClient()/getWriteClient() for explicit routing |
| HOOK | `x-gateway-db-mode` header | Future EFs inspect this header to decide their own routing |
| SCAR | `readWithFallback()` | Ready for connection pool-aware routing (Supavisor integration) |
| SCAR | `replica_routing_stats.avg_latency_ms` | Data point for SA-023 load test validation |
| SCAR | PostHog routing events | Event bus (SA-024) will emit `db.query.routed` from this data |

---

## SA-019: Database Partitioning — ats_jobs by Source

**Status:** IMPLEMENTED  
**Date:** 2026-03-07  
**Migration:** `v6.28-ats-jobs-partitioning.sql`  
**Git tag:** `infra@partitioning-v1.0.0`

### Decision

Partition `ats_jobs` using PostgreSQL native declarative LIST partitioning on the `ats_source` column. This separates ATS platform records, Common Crawl ingested records, and Amazon records into independent physical storage.

### Rationale

With Common Crawl ingestion (SA-007/SA-008) producing records at scale, the single `ats_jobs` table will grow to 1M+ rows. Partitioning provides:

1. **Partition pruning** — queries filtering by `ats_source` scan only the relevant partition
2. **Independent maintenance** — VACUUM/ANALYZE schedules per partition based on write patterns
3. **Source isolation** — Common Crawl bulk operations don't create dead tuples in ATS partition
4. **Retention flexibility** — future per-source data retention policies without table-wide locks
5. **Operational clarity** — `v_partition_stats` view shows per-partition health at a glance

### Partition Layout

| Partition | Values | Expected Volume |
|-----------|--------|-----------------|
| `ats_jobs_ats` | greenhouse, lever, ashby, workable, recruitee, usajobs | ~400K (existing ATS data) |
| `ats_jobs_common_crawl` | common_crawl | 500K–1M (growing via SA-007) |
| `ats_jobs_amazon` | amazon | 0 (SCAR — ready for activation) |
| `ats_jobs_default` | any unlisted value | 0 (catches future sources) |

### Migration Strategy

PostgreSQL does not support `ALTER TABLE ... SET PARTITION BY`. Migration uses the rename-create-copy-drop pattern:

1. Drop dependent objects (trigger, RLS policies, indexes)
2. Rename `ats_jobs` → `ats_jobs_pre_partition`
3. Create partitioned `ats_jobs` with identical schema
4. Create 4 partitions (ats, common_crawl, amazon, default)
5. `INSERT INTO ats_jobs SELECT FROM ats_jobs_pre_partition` — rows auto-route to partitions
6. Verify row count matches (EXCEPTION on mismatch)
7. Recreate all indexes (auto-propagate to partitions)
8. Recreate RLS policies and change_log trigger
9. Drop `ats_jobs_pre_partition`

### Indexes (18 total, auto-propagated)

All existing indexes recreated on the parent table. PostgreSQL automatically creates matching indexes on each partition. New addition: `idx_ats_jobs_search_vector` GIN index for full-text search.

### Maintenance Schedules

| Partition | VACUUM Schedule | Rationale |
|-----------|----------------|-----------|
| `ats_jobs_ats` | Daily 4 AM UTC | Bulk crawler updates generate dead tuples |
| `ats_jobs_common_crawl` | Daily 6 AM UTC | After 2-6 AM ingestion window |
| `ats_jobs_amazon` | Weekly Sunday 4 AM | Low volume until activated |
| `ats_jobs_default` | Weekly Sunday 4 AM | Catch-all, minimal expected volume |

### Monitoring

- `v_partition_stats` view: per-partition rows, dead tuples, vacuum age, sizes
- `fn_partition_health()` function: returns vacuum-needed assessment per partition
- CrewAI data-freshness agent: receives `partition_migration` event in agent_action_log
- Future: partition health integrated into agent-digest daily email

### Transparent to Application Layer

Partitioning is transparent to all existing queries. The Supabase client queries `ats_jobs` as before — PostgreSQL automatically routes to the correct partition. No Edge Function or client-side code changes required.

### HOOK & SCAR Points

| Type | Location | Purpose |
|------|----------|---------|
| HOOK | `DEFAULT` partition | New ats_source values auto-handled without schema changes |
| HOOK | `fn_partition_health()` | CrewAI agents and admin monitoring can query partition health |
| HOOK | `v_partition_stats` view | Admin dashboard can display per-partition metrics |
| SCAR | `ats_jobs_amazon` partition | Empty partition ready for Amazon source activation |
| SCAR | Per-partition VACUUM cron | Each partition's maintenance is independently tunable |
| SCAR | Partition DETACH/ATTACH | Ready for archival workflows (detach old CC batches) |

---

## SA-028: Capacity Model + Scaling Triggers

**Status:** IMPLEMENTED  
**Date:** 2026-03-08  
**Pair:** System Architect—Scalability + DevOps + Data Eng  
**Reviewer:** Chief Architect  

### Decision

Build a comprehensive capacity monitoring and forecasting system that captures periodic system snapshots, evaluates configurable scaling triggers, projects growth at 6/12/24 month horizons, and models per-service costs with tier transitions. The system integrates with existing infrastructure (v_partition_stats, replica_routing_stats, vendor_cost_budgets, agent_action_log) and publishes critical alerts via the event bus (H-02).

### Architecture

**Data flow:** pg_cron (15min) → fn_capture_capacity_snapshot() → capacity_snapshots table → fn_evaluate_scaling_triggers() (5min) → scaling_trigger_log + fn_publish_event (H-02) for critical alerts.

**Forecasting:** fn_capacity_forecast() uses configurable growth rate (default 15% MoM) with actual 30-day growth rate when sufficient history exists. Projects users, database rows, database size, and active users.

**Cost modeling:** fn_cost_model() implements tiered pricing logic for 12 services. Supabase, Vercel, PostHog, and Resend have non-linear tier transitions. Anthropic and others use linear scaling.

**Admin dashboard:** admin-capacity.js renders health overview, growth forecast table, cost model per service with tier transition badges, scaling trigger alerts with acknowledgment workflow, and 24h trend sparklines via SVG polyline.

### Tables

| Table | Purpose | Retention |
|-------|---------|-----------|
| `capacity_snapshots` | Point-in-time system metrics | 90 days (pg_cron cleanup) |
| `scaling_trigger_config` | Configurable thresholds with cooldown | Persistent |
| `scaling_trigger_log` | Trigger activation audit trail | Persistent |
| `cost_projections` | Per-service cost forecasting | Persistent (upserted) |

### Functions

| Function | Purpose | Schedule |
|----------|---------|----------|
| `fn_capture_capacity_snapshot()` | Captures system metrics | Every 15 min |
| `fn_evaluate_scaling_triggers()` | Evaluates thresholds | Every 5 min |
| `fn_capacity_forecast(growth%)` | Growth projections | On-demand |
| `fn_cost_model(growth%)` | Cost tier projections | On-demand |
| `fn_capacity_summary()` | JSONB summary for admin/agent | On-demand |

### Default Scaling Triggers

| Trigger | Metric | Warn | Critical | Cooldown |
|---------|--------|------|----------|----------|
| db_connections_high | db_connections_active | 200 | 270 | 30min |
| db_size_large | db_size_bytes | 5GB | 8GB | 24h |
| ats_jobs_volume | db_ats_jobs_rows | 750K | 1M | 24h |
| replica_lag_high | replica_lag_ms | 3000 | 5000 | 15min |
| ef_error_rate_high | ef_error_rate_1h | 1% | 5% | 30min |
| budget_utilization_high | budget_utilization_pct | 80% | 95% | 24h |
| active_users_growth | active_users_24h | 500 | 1000 | 24h |
| agent_cost_spike | agent_cost_24h | $25 | $50 | 12h |

### Alternatives Rejected

1. **External monitoring (Datadog, Grafana Cloud):** Additional vendor cost and complexity. PostHog + internal monitoring sufficient for current scale. Can add via S-12 scar later.
2. **Real-time streaming metrics:** Over-engineered for current user count. 15-minute snapshots provide sufficient granularity for capacity planning. S-12 custom_metrics JSONB allows adding real-time streams later.
3. **Automated auto-scaling actions:** Premature — auto-scale action_type is reserved in scaling_trigger_config but not implemented. Manual review required for all scaling decisions at current stage.

### HOOK & SCAR Points

| Type | Location | Purpose |
|------|----------|---------|
| HOOK | H-02 (fn_publish_event) | Critical trigger alerts published to event bus for webhook delivery |
| HOOK | fn_capacity_summary() | CrewAI agents can query capacity status |
| HOOK | scaling_trigger_config | Admin-editable thresholds without code changes |
| SCAR | S-12 (custom_metrics JSONB) | Extensible metric dimensions in capacity_snapshots |
| SCAR | action_type 'auto-scale' | Reserved for future automated scaling responses |
| SCAR | cost_projections.scaling_notes | Per-service scaling guidance text |
| SCAR | capacity-model EF | Additional actions can be added without new EFs |

### Back-Test Alignment with SA-023

The scaling trigger thresholds are calibrated against the SA-023 load test data:
- Connection threshold (270 critical) aligns with Supavisor pool size from CS-009
- Active user threshold (1,000 critical) is below the 1,200 concurrent target from FIX-20/CS-020
- Replica lag threshold (5,000ms critical) exceeds the 5-second alert threshold from SA-018
