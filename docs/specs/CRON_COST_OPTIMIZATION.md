# Cron Cost Optimization Spec

> **Goal:** Reduce daily Anthropic API spend from ~$12–22 to ~$3–5 without losing enrichment quality for user-facing jobs.
> **Owner:** Pod 2  
> **Priority:** Pre-launch (affects operating cost from day one)  
> **Last updated:** 2026-03-03

---

## Current State

| Job | Cron | Anthropic calls/day | Est. cost/day |
|:---|:---|:---|:---|
| `enrich-jd-ai-batch` (#49) | `*/2` | ~36K JDs (50/batch × 720 runs) | $5–10 |
| `backfill-fraud-scores` (#74) | `*/1` | ~1,440 batches (temporary) | $3–5 |
| `score-new-jobs` (#75) | `*/5` | ~288 batches | $0.50–1 |
| `backfill-ai-content-scores` (#86) | `*/1` | ~1,440 batches (temporary) | $3–5 |
| `score-new-jds-ai` (#87) | `*/5` | ~288 batches | $0.50–1 |
| **Total** | | | **$12–22/day** |

### Key findings from code review

- `enrich-jd-ai` processes ALL open jobs with `content` and `jd_extracted_at` set but `jd_skills IS NULL`. No filtering by relevance. Batch of 50, concurrency of 5, every 2 minutes.
- `score-job-fraud` is **heuristic-only** — keyword matching, ATS trust scores, content length signals. **No Anthropic API calls.** Cost = $0.
- `score-ai-content` **does call Anthropic** — sends each JD to Claude Haiku for AI-authorship detection. ~$0.0003/JD per the function comments.
- Backfill jobs (#74, #86) auto-disable at 99% completion via checker jobs (#76/#77, #88).

### Revised cost attribution

| Job | Uses Anthropic? | Real cost/day |
|:---|:---|:---|
| `enrich-jd-ai-batch` (#49) | **Yes** — Haiku for structured extraction | **$5–10** |
| `score-job-fraud` (#74, #75) | **No** — pure heuristic | **$0** |
| `score-ai-content` (#86, #87) | **Yes** — Haiku for AI detection | **$3–6** |
| **Actual total** | | **$8–16/day** |

---

## Optimization 1: Filter Enrichment to User-Matched Jobs

### Problem

288K open jobs have no enrichment yet. We're enriching all of them at 50/batch every 2 minutes. Most will never match any user's saved filters.

### Current user_filters structure

```json
{
  "whatPills": [{"type": "keyword", "values": ["seo"]}],
  "whatNotPills": [{"type": "not", "values": ["paid"]}],
  "wherePills": [{"type": "where", "values": ["united states"]}],
  "payPills": [{"max": "", "min": "130000", "type": "pay"}],
  "includeRemote": true
}
```

Filters operate on: keywords (title/content text match), location (country/state/city), salary range, remote flag, and recency.

### Solution: Tiered enrichment priority

Instead of enriching everything, create an `enrichment_priority` system:

**Tier 1 — Enrich immediately (within 10 min of arrival):**
- Jobs that match ANY user's saved filter keywords (text search against `whatPills`)
- Jobs from companies a user has in their pipeline
- Jobs explicitly viewed/bookmarked by a user

**Tier 2 — Enrich within 24 hours:**
- Jobs in top-50 metro areas by user concentration
- Jobs with salary data (higher quality, more likely to convert)
- Jobs from companies with >10 active listings (legitimate employers)

**Tier 3 — Enrich on-demand only:**
- Everything else. Enrich lazily when a user actually views the job detail page

### Implementation

#### Step 1: Create materialized view of active filter keywords

```sql
-- Refreshed hourly by mv-refresh-reduced (#14)
CREATE MATERIALIZED VIEW mv_active_filter_keywords AS
SELECT DISTINCT lower(kw) AS keyword
FROM user_filters,
     jsonb_array_elements(filter_data->'whatPills') AS pill,
     jsonb_array_elements_text(pill->'values') AS kw
WHERE filter_data->'whatPills' IS NOT NULL
UNION
SELECT DISTINCT lower(kw) AS keyword
FROM user_filters,
     jsonb_array_elements(filter_data->'whatNotPills') AS pill,
     jsonb_array_elements_text(pill->'values') AS kw
WHERE filter_data->'whatNotPills' IS NOT NULL;

CREATE INDEX idx_mv_afk_keyword ON mv_active_filter_keywords(keyword);
```

#### Step 2: Add `enrichment_priority` column to ats_jobs

```sql
ALTER TABLE ats_jobs ADD COLUMN IF NOT EXISTS enrichment_priority smallint DEFAULT 3;
-- 1 = immediate, 2 = daily, 3 = on-demand

CREATE INDEX idx_ats_jobs_enrich_priority
ON ats_jobs (enrichment_priority, jd_extracted_at)
WHERE status = 'open' AND jd_skills IS NULL AND content IS NOT NULL AND jd_extracted_at IS NOT NULL;
```

#### Step 3: Create priority assignment function

```sql
CREATE OR REPLACE FUNCTION assign_enrichment_priority()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Tier 1: Title matches any active filter keyword
  UPDATE ats_jobs j
  SET enrichment_priority = 1
  FROM mv_active_filter_keywords k
  WHERE j.enrichment_priority > 1
    AND j.status = 'open'
    AND j.jd_skills IS NULL
    AND j.search_vector @@ plainto_tsquery('english', k.keyword);

  -- Tier 2: Has salary, or from large employers, or in top metros
  UPDATE ats_jobs
  SET enrichment_priority = 2
  WHERE enrichment_priority > 2
    AND status = 'open'
    AND jd_skills IS NULL
    AND (
      salary_min IS NOT NULL
      OR company_slug IN (
        SELECT company_slug FROM ats_jobs
        WHERE status = 'open'
        GROUP BY company_slug HAVING count(*) > 10
      )
    );
END;
$$;
```

#### Step 4: Modify `enrich-jd-ai` query to prioritize

Change the fetch query from:

```typescript
// BEFORE
.is('jd_skills', null)
.eq('status', 'open')
.not('jd_extracted_at', 'is', null)
.order('jd_extracted_at', { ascending: true })
.limit(BATCH_SIZE)
```

To:

```typescript
// AFTER — prioritize Tier 1, then Tier 2. Skip Tier 3 entirely.
.is('jd_skills', null)
.eq('status', 'open')
.not('jd_extracted_at', 'is', null)
.not('content', 'is', null)
.in('enrichment_priority', [1, 2])
.order('enrichment_priority', { ascending: true })
.order('jd_extracted_at', { ascending: true })
.limit(BATCH_SIZE)
```

#### Step 5: On-demand enrichment for Tier 3

When a user opens a job detail page and `jd_skills IS NULL`, trigger a single synchronous enrichment call from the client (or via a lightweight Edge Function `enrich-jd-single`).

### Expected impact

With 1 active user filter matching ~22 jobs/week, Tier 1 is tiny. Tier 2 (salary + large employers) is ~30–40% of the corpus. **This cuts enrichment volume by 60–70%.**

| Scenario | Jobs enriched/day | Est. cost/day |
|:---|:---|:---|
| Current (all jobs) | ~36,000 | $5–10 |
| Tier 1 + 2 only | ~12,000 | $1.50–3.50 |
| Post-launch (more user filters) | ~18,000 | $2.50–5.00 |

---

## Optimization 2: Combine Fraud + AI-Content into Single Call

### Problem

`score-ai-content` sends each JD to Anthropic for AI-authorship detection at ~$0.0003/JD. This is a separate call from JD enrichment, doubling API costs for every job that gets both treatments.

### Solution: Merge AI-content detection into the `enrich-jd-ai` prompt

Add two fields to the existing enrichment prompt:

```
{
  "skills": [...],
  "requirements": [...],
  "education": "bachelors",
  "seniority": "mid",
  "years_min": 3,
  "years_max": 5,
  "ai_written_score": 0.72,      // NEW: 0.0–1.0 probability AI-authored
  "ai_written_signals": ["uniform sentence length", "lacks specific metrics"]  // NEW
}
```

Update the system prompt to include:

```
Also assess whether this job description was written by an AI language model.
Return ai_written_score (0.0 = clearly human, 1.0 = clearly AI) and
ai_written_signals (2-4 short phrases explaining your assessment).
```

### Token impact

Current enrichment prompt: ~500 input + ~150 output tokens per job.
With AI detection added: ~550 input + ~200 output tokens per job.
Extra cost: ~10% increase per call. But eliminates the entire separate `score-ai-content` pipeline.

### Implementation

1. Update `enrich-jd-ai/index.ts` system prompt and JSON schema
2. Write `ai_written_score` → `ats_jobs.ai_scored_at` + new `ai_content_score` column
3. Disable cron jobs #86, #87, #88 (`backfill-ai-content-scores`, `score-new-jds-ai`, `check-ai-backfill-done`)
4. Keep `score-job-fraud` as-is (it's free — pure heuristic)

### Expected impact

| Before | After |
|:---|:---|
| Enrichment: $5–10/day | Enrichment + AI detection: $5.50–11/day |
| AI detection: $3–6/day | $0 (eliminated) |
| **Total: $8–16** | **Total: $5.50–11** |

Saves **$2.50–5/day** by eliminating redundant API calls.

---

## Optimization 3: Reduce DataForSEO Discovery to Once Daily

### Current

`discover-boards-6h` (#55) runs every 6 hours = 4 SERP queries/day.

### Change

```sql
-- From:
SELECT cron.alter_job(55, '0 4 * * *');  -- once daily at 4 AM UTC
```

With 39K+ boards already discovered and manual batch discovery sessions supplementing, daily is plenty. Saves ~$0.50–1.50/day in DataForSEO credits.

---

## Optimization 4: Throttle Enrichment from 2min to 10min

### Current

`enrich-jd-ai-batch` (#49) runs `*/2` (every 2 minutes) = 720 invocations/day.

### Change

```sql
SELECT cron.alter_job(49, '*/10 * * * *');  -- every 10 minutes
```

At 50 jobs/batch, this still processes 7,200 jobs/day (144 invocations × 50). Combined with priority filtering, this is more than enough for Tier 1 + 2 volume.

---

## Combined Savings Summary

| Optimization | Daily savings |
|:---|:---|
| 1. Priority filtering (60–70% fewer enrichments) | $3–7 |
| 2. Merge AI detection into enrichment | $2.50–5 |
| 3. DataForSEO once daily | $0.50–1.50 |
| 4. Throttle to 10min (amplifies #1) | Included in #1 |
| **Total reduction** | **$6–13.50/day** |

| | Before | After |
|:---|:---|:---|
| Daily Anthropic | $8–16 | $2–5 |
| Daily DataForSEO | $1–3 | $0.25–0.50 |
| **Total** | **$9–19/day** | **$2.25–5.50/day** |
| **Monthly** | **$270–570** | **$68–165** |

---

## Implementation Order

| Step | What | Effort | Blocked by |
|:---|:---|:---|:---|
| 1 | Add `enrichment_priority` column + index | 15 min | — |
| 2 | Create `mv_active_filter_keywords` materialized view | 15 min | — |
| 3 | Create `assign_enrichment_priority()` function | 30 min | Steps 1–2 |
| 4 | Hook priority assignment into `refresh-jobs` post-upsert | 30 min | Step 3 |
| 5 | Modify `enrich-jd-ai` query to filter by priority | 15 min | Step 1 |
| 6 | Merge AI-content detection into enrichment prompt | 45 min | — |
| 7 | Disable AI-content cron jobs (#86, #87, #88) | 5 min | Step 6 |
| 8 | `cron.alter_job(55, '0 4 * * *')` for DataForSEO | 2 min | — |
| 9 | `cron.alter_job(49, '*/10 * * * *')` for enrichment | 2 min | — |
| 10 | Add on-demand enrichment endpoint for Tier 3 jobs | 1 hr | — |
| **Total** | | **~3.5 hours** | |
