# ADR-07: Deduplication Strategy

**Status:** Accepted
**Date:** 2026-03-07
**Session:** SA-008
**Decision makers:** Data Engineer, Senior Backend Engineer, System Architect—Scalability

## Context

Common Crawl ingestion (SA-007) lands job records in `cc_staging_jobs`. Before promoting to the production `ats_jobs` table, we must detect and eliminate duplicates that already exist from ATS-sourced jobs (Greenhouse, Lever, etc.) or from prior CC batches. At projected scale (1–2M total records), dedup must be fast and accurate.

## Decision

**Two-tier dedup: URL-hash exact match (fast path) + pg_trgm fuzzy match (slow path).**

### Tier 1: Exact Match (URL Hash)

- SHA-256 hash of the job URL (`url_hash` column, computed during SA-007 ingestion)
- `cc_job_id()` function generates a deterministic `greenhouse_id` from URL for ats_jobs lookup
- O(1) index lookup via `idx_cc_staging_url_hash` and `ats_jobs_source_id_unique`
- Expected to catch ~60–70% of duplicates (same job page, different crawl dates)

### Tier 2: Fuzzy Match (Title + Company + Location)

- pg_trgm `similarity()` on three fields with weighted composite:
  - Title: 50% weight (most discriminative)
  - Company name: 30% weight
  - Location: 20% weight
- Threshold: 0.7 combined similarity (configurable per-batch)
- GIN trigram indexes on `ats_jobs.title` and `ats_jobs.company_name` for sub-second queries
- CROSS JOIN LATERAL pattern limits fuzzy scan to title-similar candidates first

### Enrichment Queue

- Promoted records with sufficient content (>50 chars) are automatically queued
- Rate limited to 100 Anthropic API calls/hour for CC source (separate from ATS enrichment budget)
- Exponential backoff on failures (2, 4, 8 minutes)
- FOR UPDATE SKIP LOCKED prevents concurrent workers from double-processing

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| MinHash / LSH | Sub-linear scaling, good for very large datasets | Complex to implement, requires external service or extension | Rejected: overkill at current scale (<2M records) |
| Embedding-based similarity | Semantic understanding, catches paraphrased listings | Requires vector storage, expensive API calls for embedding | Rejected: adds cost and latency with marginal accuracy gain over trigram |
| URL-only dedup (no fuzzy) | Simple, fast | Misses same job posted on different URLs (aggregator vs. company site) | Rejected: would leave 10–15% duplicates |
| External dedup service (Dedupe.io) | ML-based, self-improving | External dependency, cost, latency | Rejected: pg_trgm is built-in and sufficient |

## Consequences

### Positive
- Entire dedup pipeline runs inside Postgres (no external dependencies)
- pg_trgm already enabled in baseline migration
- Audit trail in `dedup_log` enables threshold tuning with real data
- Enrichment queue decouples promotion from API rate limits

### Negative
- Fuzzy matching at 1M+ records may slow down; monitor CROSS JOIN LATERAL performance
- 0.7 threshold is a guess; will need calibration with real dedup rates

### Risks
- **False positives** (good jobs marked as duplicates): Mitigated by logging all decisions with similarity scores for review
- **False negatives** (duplicates slip through): Acceptable — a few duplicates in production are better than dropping unique jobs

## Hook Points

- `enrichment_queue.enrich_type`: Supports future enrichment types (salary normalization, location geocoding)
- `enrichment_queue.scheduled_after`: Dynamic rate adjustment without code changes
- `cc_run_dedup_batch()` threshold parameter: Per-batch tuning from EF caller

## Scar Points

- Dedup log similarity scores enable future ML-based threshold optimization
- `match_type` field in dedup_log supports adding new dedup strategies (embedding, MinHash)
- Enrichment queue is source-agnostic: can serve ATS, CC, or future Amazon-sourced jobs

## Metrics to Track

- Dedup rate per batch (target: 30–40%)
- Fuzzy match similarity score distribution (calibrate threshold)
- Enrichment queue throughput vs. hourly budget utilization
- False positive rate (manual review of fuzzy dups with scores 0.7–0.8)
