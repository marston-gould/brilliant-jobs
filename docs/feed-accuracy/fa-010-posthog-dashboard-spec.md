# FA-010: PostHog Feed Health Dashboard Specification

> **Status:** DEPLOYED — awaiting 48-hour soak before Phase 1 begins
>
> **Created:** 2026-03-08 | **Sprint:** Feed Accuracy & Pagination

## Events Instrumented

| Event | Trigger | Purpose |
|-------|---------|---------|
| `feed_search_completed` | End of every `searchJobs()` call | Core metric — every property needed for accuracy analysis |
| `feed_zero_results` | When `totalCount === 0` | Alert trigger for broken searches |
| `feed_page_turn` | When `page > 0` (Load More / Back to Top) | Pagination usage and latency |
| `feed_search_error` | `searchJobs()` catch block | Error rate tracking |

## Dashboard Panels (Create in PostHog UI)

### Panel 1: Jobs Per Search Distribution
- **Type:** Histogram
- **Event:** `feed_search_completed`
- **Property:** `total_count`
- **Buckets:** 0, 1-10, 11-50, 51-200, 201-500, 500+
- **Purpose:** Shows what users actually see. Pre-FA-001, skills searches will cluster in the low buckets.

### Panel 2: Zero-Result Rate Over Time
- **Type:** Line chart (trend)
- **Event:** `feed_zero_results` as % of `feed_search_completed`
- **Period:** Daily for 30 days
- **Purpose:** Should decrease after FA-001 (content search) and FA-009 (US-Only fix). Alert if >5%.

### Panel 3: US-Only Adoption & Leakage
- **Type:** Dual-axis line chart
- **Event:** `feed_search_completed`
- **Metric 1:** % of events where `us_only = true`
- **Metric 2:** Average `null_loc_country_count` over time
- **Purpose:** Track how many users use US-Only and how many null-country jobs leak through. FA-009 should reduce leakage.

### Panel 4: Median Search Latency
- **Type:** Line chart (trend)
- **Event:** `feed_search_completed`
- **Property:** `latency_ms` (p50, p95)
- **Period:** Daily
- **Alert:** p95 > 2000ms
- **Purpose:** Performance regression detection. Must stay <500ms p95 per sprint constraints.

### Panel 5: Filter Combination Heatmap
- **Type:** Table or heatmap
- **Event:** `feed_search_completed`
- **Properties:** `what_pills_count`, `where_pills_count`, `who_pills_count`, `when_pills_count`, `pay_pills_count`
- **Purpose:** Understand which filter combos users actually use. Prioritizes optimization effort.

### Panel 6: Content Match Count Trend
- **Type:** Line chart (trend)
- **Event:** `feed_search_completed`
- **Property:** `content_match_count` (average per event)
- **Purpose:** Will show 0 pre-FA-001 (title-only search). Should spike after FA-001 (content search enabled). This is the primary before/after proof that FA-001 works.

## Cohort: Active Feed Users

**Definition:** Users with 3+ `feed_search_completed` events in the last 7 days.

**Purpose:** This is the population measured for sprint impact. Filter all dashboard panels by this cohort for the "engaged user" view.

## Property Reference

| Property | Type | Values | Notes |
|----------|------|--------|-------|
| `total_count` | number | 0+ | DB total (may exceed page size) |
| `page_jobs_count` | number | 0-50 | Jobs shown on this page after client filters |
| `page_number` | number | 0+ | 0 = first page |
| `filters_active_count` | number | 1+ | Count of checked saved filters |
| `filter_names` | string[] | filter names | Array of active filter names |
| `us_only` | boolean | true/false | From tuning settings |
| `include_remote` | boolean | true/false | From filter toggle |
| `include_no_salary` | boolean | true/false | From filter toggle |
| `trust_filter_active` | boolean | true/false | Trust score filter on |
| `ai_filter_active` | boolean | true/false | AI content filter on |
| `what_pills_count` | number | 0+ | What keyword pills |
| `where_pills_count` | number | 0+ | Where location pills |
| `when_pills_count` | number | 0+ | When date pills |
| `who_pills_count` | number | 0+ | Who company pills |
| `pay_pills_count` | number | 0+ | Pay salary pills |
| `client_side_filtered_out` | number | 0+ | Jobs removed by trust/AI post-filters |
| `search_mode` | string | builder, saved_filter, prompt, saved_filter+prompt | What drove the search |
| `latency_ms` | number | 0+ | End-to-end search time in ms |
| `is_zero_results` | boolean | true/false | Shortcut for total_count === 0 |
| `null_loc_country_count` | number | 0+ | US-Only leakage metric |
| `content_match_count` | number | 0+ | Jobs matching content but not title (0 pre-FA-001) |

## Baseline Expectations (Pre-Sprint)

Before any accuracy fixes ship, the baseline data should show:
- `content_match_count` = 0 for all searches (title-only search means no content-only matches appear)
- `total_count` capped at 500 for broad searches (MAX_FEED_ROWS limit)
- `null_loc_country_count` > 0 for US-Only searches (leakage present)
- `client_side_filtered_out` > 0 when trust/AI filters active

## 48-Hour Soak Criteria

Before Phase 1 (FA-001) begins:
1. ✅ `feed_search_completed` events flowing in PostHog
2. ✅ Dashboard live with all 6 panels rendering data
3. ✅ Baseline shows: median total_count, zero-result rate, US-Only %, null_loc_country_count
4. ✅ At least 48 hours of data collected from real user traffic
