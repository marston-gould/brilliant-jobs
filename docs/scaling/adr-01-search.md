# ADR-01 Implementation Log — Search: Typesense

**Status:** IN PROGRESS (SA-001 code complete; awaiting Typesense Cloud account)
**ADR Owner:** Chief Architect + Data Engineer + DevOps Engineer
**Sessions:** SA-001 (provisioning + initial index), SA-002 (sync layer), SA-003 (search swap)
**Last Updated:** 2026-03-07

---

## Decision Summary

Replace Postgres full-text search (`search_vector` tsvector column) with Typesense Cloud as the
primary search engine for the Brilliant Jobs dashboard. Postgres FTS remains as a graceful fallback.

**Why Typesense over Postgres FTS:**
- Typo tolerance (1–2 character Levenshtein distance) — critical for job title variations ("enginner", "Sr. vs Senior")
- Faceted search (source, state, remote, industry) with counts in a single round-trip
- p95 < 200ms at 1M+ documents vs Postgres FTS degradation at scale
- Hosted, auto-scaling infrastructure — no tuning burden on team
- ADR records that Elasticsearch/OpenSearch were considered and rejected: operational overhead + cost at our volume

**Architecture decision:** The `typesense-search` Edge Function returns the same response shape as the
existing Supabase RPC so the dashboard swap is a single call-site change. Typesense is never called
directly from the browser — all traffic routes through the EF (auth enforcement, rate limiting, logging).

---

## Collection Schema

See: `docs/scaling/typesense-schema.json`

**Key schema decisions:**
- `id` field: composite `{ats_source}_{greenhouse_id}` to ensure global uniqueness across 6 ATS sources
- `content` field: truncated to 8,000 chars on ingest to stay within Typesense index limits
- `created_at_ts` / `updated_at_ts` / `first_seen_at_ts`: stored as int64 Unix epoch (Typesense sorts/filters on int, not ISO string)
- Facet fields: `ats_source`, `loc_state`, `loc_city`, `loc_country`, `loc_type`, `is_remote`, `department`, `industry`, `job_cat`, `company_name`, `salary_min`, `salary_max`, `salary_currency`, `salary_rate`
- `default_sorting_field`: `created_at_ts` (newest first as default — aligns with user expectation)
- `query_by_weights` in search: title (5) > company_name (3) > department (2) > content (1)

---

## Index Sizing (Baseline — 2026-03-07)

| Metric | Value |
|--------|-------|
| Total ats_jobs rows (status=open) | 413,929 |
| ATS sources | 6 (greenhouse, lever, ashby, workday, icims, bamboohr) |
| Date range | 2026-02-14 → 2026-03-07 |
| Estimated Typesense index size | ~400MB (content truncated at 8KB) |
| Expected p50 latency at 400K docs | < 20ms |
| Expected p95 latency at 400K docs | < 80ms |
| Target at 1M+ docs (Common Crawl) | p95 < 200ms |

---

## Latency Baselines

*To be populated after SA-001 Step 4 (prod validation)*

| Query Type | p50 | p95 | Sample Query |
|-----------|-----|-----|--------------|
| Full-text (wildcard) | — | — | `q=*` |
| Keyword search | — | — | `q=software engineer` |
| Faceted search | — | — | `q=*&filters.loc_state=CA` |
| Typo tolerance | — | — | `q=enginner` |
| Facet + keyword | — | — | `q=product manager&filters.is_remote=true` |

---

## Hook Points (extensibility)

Per SA-001 Chief Architect review, the following hook points are embedded:

1. **Multi-collection hook:** `TYPESENSE_COLLECTION` is a constant in each EF — trivially overridable to add `common_crawl_jobs`, `amazon_jobs` as separate collections or aliases when SA-007/SA-008 land.
2. **Middleware hook:** `typesense-search` EF is designed to be proxied through the API Gateway (SA-004/SA-005) — auth, rate limiting, and cache headers will layer on without changing the EF.
3. **Facet expansion hook:** `facets` is a request parameter — frontend can request any subset; new facet fields can be added to the collection schema without breaking existing callers.
4. **Fallback hook:** Postgres FTS fallback is preserved indefinitely as the `degraded` code path — allows zero-downtime Typesense maintenance windows.

---

## Scar Points (planned future cuts)

1. **Developer search API:** When the API consumer management (SA-005) is live, `typesense-search` EF becomes the public search endpoint for third-party developers with per-consumer rate limits. The EF signature is already designed for this.
2. **Semantic search:** When embedding pipeline is added, `typesense-search` will add a `vector_query` parameter — the schema can add a `float[]` embedding field via collection `PATCH` without a full re-index.
3. **Multi-tenant collections:** Schema `name` field can be parameterized to `ats_jobs_{tenant_id}` when multi-employer accounts are added.

---

## Deployment Steps

### Step 1: Typesense Cloud Account (Marston action)

1. Go to https://cloud.typesense.org and sign in with Google
2. Create cluster: **Region** = us-east-1, **Size** = `2vcpu_4gb_64gb` (scales to 1M+ docs)
3. Note the **Cluster URL** (format: `xxx.a1.typesense.net`) and **Admin API Key**
4. Add to Supabase Vault:
   ```bash
   supabase secrets set TYPESENSE_HOST=xxx.a1.typesense.net
   supabase secrets set TYPESENSE_API_KEY=your-admin-api-key
   ```
5. Create a **Search-only API key** for future frontend use (read-only, no admin ops)

### Step 2: Create Collection

```bash
curl -X POST 'https://YOUR_TYPESENSE_HOST/collections' \
  -H 'X-TYPESENSE-API-KEY: YOUR_ADMIN_KEY' \
  -H 'Content-Type: application/json' \
  -d @docs/scaling/typesense-schema.json
```

Expected response: `{"name":"ats_jobs","num_documents":0,...}`

### Step 3: Deploy Seed Edge Function

```bash
supabase functions deploy typesense-seed
```

### Step 4: Run Dry Run First

```bash
curl -X POST https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/typesense-seed \
  -H "Authorization: Bearer YOUR_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true, "batch_size": 500}'
```

### Step 5: Full Seed (loop through all 414K rows)

Run the orchestration script:
```bash
node scripts/run-typesense-seed.js
```

Or manually call with increasing offsets:
- offset=0 → offset=500 → offset=1000 → ... until `status: "complete"`

### Step 6: Validate

```bash
# Check document count
curl 'https://YOUR_TYPESENSE_HOST/collections/ats_jobs' \
  -H 'X-TYPESENSE-API-KEY: YOUR_ADMIN_KEY'
# num_documents should be within 0.1% of Supabase count (413,929)
```

---

## Validation Queries (SA-001 Step 4)

20 representative production search queries to validate against Postgres FTS results:

| # | Query | Expected Top Result |
|---|-------|-------------------|
| 1 | `software engineer` | SWE roles from major tech companies |
| 2 | `product manager` | PM roles |
| 3 | `enginner` (typo) | Same as "engineer" — typo tolerance |
| 4 | `data scientist remote` | Remote DS roles |
| 5 | `marketing` + `loc_state=CA` | CA marketing roles |
| 6 | `*` (wildcard) | Latest jobs by created_at |
| 7 | `devops kubernetes` | DevOps/infra roles |
| 8 | `account executive sales` | AE roles |
| 9 | `nurse practitioner` | Healthcare roles |
| 10 | `frontend react` | Frontend eng roles |
| 11 | `*` + `is_remote=true` | All remote jobs |
| 12 | `*` + `salary_min=150000` | High-comp roles |
| 13 | `operations manager` | Ops roles |
| 14 | `ux designer` | Design roles |
| 15 | `business analyst` | BA roles |
| 16 | `*` + `ats_source=lever` | Lever-only jobs |
| 17 | `customer success` | CS roles |
| 18 | `machine learning` | ML roles |
| 19 | `clinical research` | Life sciences roles |
| 20 | `supply chain logistics` | Supply chain roles |

---

## Session Completion Checklist

### SA-001
- [x] Collection schema defined (`docs/scaling/typesense-schema.json`)
- [x] `typesense-seed` Edge Function written
- [x] `typesense-search` Edge Function written (preview — deployed in SA-003)
- [x] ADR-01 implementation log started
- [ ] **BLOCKED:** Typesense Cloud account not yet created (Marston action)
- [ ] Collection created in Typesense Cloud
- [ ] Vault secrets set: `TYPESENSE_HOST`, `TYPESENSE_API_KEY`
- [ ] Seed script run (all 413,929 rows)
- [ ] Validation: doc count within 0.1%
- [ ] Validation: p95 < 200ms on 50 queries
- [ ] Git tag: `infra@typesense-v0.1.0`
- [ ] ROADMAP.md + roadmap.html updated

### SA-002 (next session)
- [ ] `sync_queue` table + Postgres trigger deployed
- [ ] `typesense-sync` EF deployed + pg_cron active (30s interval)
- [ ] Weekly re-index pg_cron deployed
- [ ] Sync lag validated < 60s

### SA-003 (subsequent session)
- [ ] `typesense-search` EF deployed
- [ ] Dashboard search module updated (Typesense path + fallback)
- [ ] Feature flag `SEARCH_ENGINE=typesense` active
- [ ] p50 < 50ms, p95 < 200ms on prod
- [ ] ADR-01 marked IMPLEMENTED

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-07 | Typesense Cloud over self-hosted | Zero ops burden; auto-scaling; 14-day trial before commit |
| 2026-03-07 | 2vCPU/4GB cluster for initial index | Handles 400K–1M docs; upgrade path to 4vCPU available |
| 2026-03-07 | content truncated to 8,000 chars | Prevents single large job desc from dominating index size |
| 2026-03-07 | Composite `id` = `{source}_{greenhouse_id}` | Ensures uniqueness across 6 ATS sources without UUID generation |
| 2026-03-07 | EF-only access (no browser→Typesense) | Enforces auth, rate limiting, and future API consumer management |
| 2026-03-07 | Postgres FTS retained as fallback | Zero-downtime maintenance; no search outage if Typesense is unreachable |
