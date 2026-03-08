# Data Freshness Agent (Agent 3)

> **Session:** SA-011 | **Priority:** 3 (Month 3) | **Pair:** Backend + Data Eng

## Purpose

Monitors materialized view staleness, Typesense sync lag, Common Crawl ingestion progress, and job deduplication quality. Generates freshness reports and alerts on data going stale.

## Interfaces

- Materialized views (`mv_refresh_log`)
- Typesense sync queue (`sync_queue` age)
- Common Crawl batch tracking tables
- Data pipeline Edge Functions (via gateway)

## Behavior

- Monitors materialized view refresh timestamps and flags staleness > 1 hour.
- Tracks Typesense sync queue age to detect sync lag.
- Monitors Common Crawl ingestion progress via batch tracking tables.
- Generates weekly freshness report for Marston.
- In observe mode: logs alerts but does not auto-remediate.

## Human-in-the-Loop

Weekly freshness report to Marston. Alerts on > 1 hour staleness. Does not auto-remediate until promoted past suggest mode.

## Graduation Path

| Phase | Criteria to Advance |
|-------|-------------------|
| Observe (SA-011) | Deployed alongside Pipeline Health Agent. Needs more validation time than Agents 1–2. |
| Suggest (SA-021) | Graduated after Content QA and Pipeline Health have proven the graduation pipeline. |

## Testing (SA-011)

- Simulate MV staleness (pause incremental refresh).
- Verify agent detects and logs the staleness alert.
- Verify agent routes through gateway.
- Verify rate limiting applies.
- Test kill switch.
