# Content Engine — Multi-Model Template Validation

**From:** Pod 1 (Growth)
**Date:** February 28, 2026
**Roadmap:** Phase 11 (Content & SEO) — Item #14
**Purpose:** Define validation rules, quality gates, and model-agnostic checks for all Content Engine templates. Ensures editorial quality regardless of which model generates the content.
**References:** VERSION_METHODOLOGY.docx in the repository

---

## 1. Problem Statement

The Content Engine generates editorial content via LLM (currently Claude Sonnet via `generate-story` Edge Function). As we scale to multiple story types, evergreen pages, and potentially multiple models, we need a structured validation layer that:

- Catches hallucinations before publication
- Enforces brand voice constraints programmatically
- Validates structural compliance with volumetric specs
- Works identically regardless of which model produced the output
- Provides rejection reasons that feed back into retry logic

---

## 2. Validation Architecture

```
generate-story EF → raw output
        ↓
  ┌─────────────────┐
  │  VALIDATION GATE │  ← This spec defines these rules
  │                   │
  │  1. Structure     │  Pass/Fail + reasons
  │  2. Data fidelity │
  │  3. Voice         │
  │  4. Volumetrics   │
  │  5. Entity        │
  │  6. Dedup         │
  └─────────────────┘
        ↓
  Pass → content_stories (status: 'pending_review')
  Fail → content_stories (status: 'validation_failed', rejection_reasons: [...])
        ↓ retry (max 2)
  generate-story EF with rejection feedback appended to prompt
```

Pod 2 implements this as a `validate-content` helper function called by the `generate-story` Edge Function after receiving model output. All rules below are deterministic — no LLM-in-the-loop for validation.

---

## 3. Validation Rules

### 3.1 Structure Validation

Every generated piece must match its template's required sections. Validation is per-template.

**Daily Editorial Story (Templates 1–6):**

| Check | Rule | Fail Condition |
|-------|------|----------------|
| Headline present | Must start with `## ` or be returned in `headline` field | Missing or empty |
| Lede present | First paragraph after headline | Missing or < 20 words |
| Body paragraphs | 2–3 paragraphs in body section | < 2 or > 4 paragraphs |
| Chart placeholder | Must include `{{chart}}` token or `chart_config` JSON field | Missing |
| Footer attribution | Must include source line with `{total_jobs}` and `{total_companies}` tokens | Missing either token |
| Quotable statement | Must include exactly 1 `<blockquote>` or `quotable` field | Missing or > 1 |

**Weekly Deep Dive (Templates 7–8):**

| Check | Rule | Fail Condition |
|-------|------|----------------|
| Section count | 4–6 H2 sections | < 4 or > 6 |
| Comparison table | At least 1 HTML table or `table_data` JSON field | Missing |
| Multiple chart placeholders | 2–3 `{{chart}}` tokens | < 2 |
| Quotable statements | 2–3 quotables | < 2 |
| Cross-link | At least 1 internal link to existing Data Lab page | Missing |

**Evergreen Pages (Tier 1–4):**

| Check | Rule | Fail Condition |
|-------|------|----------------|
| FAQ section | 3–5 questions with `<script type="application/ld+json">` FAQPage schema | Missing or < 3 |
| Direct-answer H2s | Every H2 must begin with a statement, not a question phrasing | Any H2 starts with "What is" / "How does" without inline answer |
| Entity density | Minimum entity count per page type (see §3.5) | Below threshold |

---

### 3.2 Data Fidelity Validation

**Purpose:** Catch hallucinated statistics. This is the most critical validation layer.

**Rules:**

| # | Check | Implementation | Fail Condition |
|---|-------|----------------|----------------|
| DF-1 | Number cross-reference | Every number in output must trace to a value in the `story_data` context JSON | Any number not found in context (±2% tolerance for rounding) |
| DF-2 | Company name verification | Every company name mentioned must exist in `ats_companies` or `ref_companies` | Unknown company name |
| DF-3 | Date accuracy | Any date mentioned must match `date_generated` or be within the analysis window | Date outside valid range |
| DF-4 | Percentage math | If output says "X% of Y," validate that X/100 × Y ≈ stated absolute number | Math mismatch > 5% |
| DF-5 | Comparison direction | If output says "A is higher than B," validate A > B in source data | Reversed comparison |
| DF-6 | Superlative claims | "Highest," "lowest," "most," "fastest" must be verified against full dataset | Superlative not actually true |

**Implementation note:** DF-1 through DF-6 operate on the same `story_data` JSON blob injected into the generation prompt. Pod 2 should extract all numbers from the generated text (regex: integers, decimals, percentages, currency amounts) and cross-reference each against the source data.

**Tolerance matrix:**

| Data type | Acceptable variance |
|-----------|-------------------|
| Percentages | ±1 percentage point |
| Counts (jobs, companies) | ±2% (rounding) |
| Salary figures | ±$500 (rounding to nearest $1K) |
| Week-over-week changes | Exact match required |

---

### 3.3 Voice Validation

**Purpose:** Enforce brand voice brief constraints without an LLM judge.

| # | Check | Pattern | Fail Condition |
|---|-------|---------|----------------|
| V-1 | No meta-commentary | Regex: `/^(In this (article|analysis|report|piece)|This (article|story|report) (examines|explores|looks at))/im` | Match found in any paragraph |
| V-2 | No hedging without data | Regex: `/\b(might|could|possibly|perhaps|it seems|it appears)\b/gi` — flag if > 2 instances | > 2 hedge words without adjacent data citation |
| V-3 | Leads with number | First sentence of lede must contain at least one number (digit or spelled-out) | No number in first sentence |
| V-4 | Active voice check | Regex: `/\b(was|were|been|being) (seen|observed|noted|found|reported)\b/gi` | > 3 passive constructions |
| V-5 | Banned vocabulary | Match against Brand Voice Brief "Don't Use" column: "opportunities," "rate of hiring," "pay bump," "trend" (standalone), "we believe," "applicant tracking system" (after first use) | Any banned term found |
| V-6 | No emoji | Regex: emoji unicode ranges | Any emoji found |
| V-7 | Attribution present | Must include "Brilliant Jobs" in source/footer | Missing |

---

### 3.4 Volumetric Validation

**Purpose:** Enforce word budgets from `content-engine-volumetric-specs.md`.

| Template Type | Min Words | Max Words | Section Balance |
|---------------|-----------|-----------|----------------|
| Daily editorial | 300 | 500 | No section > 50% of total |
| Weekly deep dive | 800 | 1,200 | No section > 30% of total |
| Metro comparison | 800 | 1,200 | City A vs City B within ±10% |
| Company page | 600 | 900 | Ghost section omittable |
| Trend page | 500 | 800 | Analysis section ≥ 40% |
| Evergreen page | Per spec | Per spec | FAQ ≤ 20% |

**Word count method:** Split on whitespace, exclude HTML tags, exclude chart placeholder tokens.

**Section balance check:** Parse H2 sections, count words per section, verify no section exceeds its maximum share of total.

---

### 3.5 Entity Validation

**Purpose:** Ensure sufficient entity density for SEO and Knowledge Graph coverage.

| Page Type | Required Entities | Min Count |
|-----------|------------------|-----------|
| Daily editorial | Industry name, metric name, time period | 3 |
| Weekly deep dive | 2+ industry names, 3+ metric names, company names, time period | 8 |
| Metro comparison | Both city names, both state names, "cost of living," "job market" | 6 |
| Company page | Company name (3+ mentions), industry, department names | 5 |
| Role trend page | Role title (5+ mentions), industry, seniority levels | 7 |
| Remote page | "Remote work," role title, salary range, industry | 4 |

**Implementation:** Entity extraction via regex patterns for known entities (industry list from `jobs-by-industry` taxonomy, company names from `ats_companies`, role titles from level hierarchy). Count occurrences and validate against minimums.

---

### 3.6 Deduplication Validation

**Purpose:** Prevent publishing substantially similar stories.

| Check | Rule |
|-------|------|
| Headline similarity | Jaccard similarity of headline trigrams vs. last 30 published stories must be < 0.4 |
| Lede similarity | Cosine similarity of lede TF-IDF vector vs. last 30 stories must be < 0.6 |
| Same-topic cooldown | No two stories about the same `anomaly_rule_id` + `parameter_value` within 48 hours |
| Category balance | Reject if publishing would violate max 3 stories per category per week |

**Implementation:** Query `content_stories` table for recent published stories. Compute similarity scores client-side (no external API needed — trigram Jaccard is cheap).

---

## 4. Validation Response Schema

```json
{
  "valid": false,
  "score": 72,
  "checks": {
    "structure": { "pass": true, "details": [] },
    "data_fidelity": { "pass": false, "details": [
      { "rule": "DF-1", "message": "Number '4,850' not found in story_data context", "severity": "hard_fail" }
    ]},
    "voice": { "pass": true, "details": [
      { "rule": "V-2", "message": "2 hedge words found (within tolerance)", "severity": "warning" }
    ]},
    "volumetrics": { "pass": true, "details": [] },
    "entity": { "pass": true, "details": [] },
    "dedup": { "pass": true, "details": [] }
  },
  "retry_eligible": true,
  "retry_prompt_append": "VALIDATION FAILED: The number '4,850' does not appear in the provided data. Use only numbers from the story_data context. Regenerate with corrected statistics."
}
```

---

## 5. Severity Levels & Retry Logic

| Severity | Action | Retry? |
|----------|--------|--------|
| `hard_fail` | Block publication, log rejection | Yes (max 2 retries) |
| `soft_fail` | Flag for human review, allow publication with warning | No retry needed |
| `warning` | Log only, publish normally | No |

**Hard fail triggers (auto-block):**
- Any DF-1 through DF-6 failure (data fidelity)
- Missing required structure (no headline, no lede)
- Word count outside min/max bounds
- Dedup similarity above threshold

**Soft fail triggers (human review queue):**
- Voice violations (V-1 through V-5)
- Entity count below minimum
- Section balance outside tolerance

**Retry behavior:**
- Append `retry_prompt_append` to the original generation prompt
- Include the specific failure reasons
- Max 2 retries per story
- After 2 failed retries: status → `validation_failed`, requires manual intervention

---

## 6. Model-Agnostic Design

This validation layer is deliberately model-agnostic. All checks are:
- **Deterministic** — no LLM judgment calls
- **Regex and math-based** — runs in Edge Function runtime (Deno)
- **Data-driven** — thresholds from volumetric specs, not model-specific tuning

If we switch from Claude Sonnet to another model, or use multiple models for A/B testing:
- Same validation rules apply
- Same thresholds apply
- Model identifier logged in `content_stories.model_used` column for quality tracking
- Validation pass rate per model becomes a model selection metric

---

## 7. Database Requirements (Pod 2)

Add to `content_stories` table:

| Column | Type | Purpose |
|--------|------|---------|
| `validation_score` | integer | 0–100 composite score |
| `validation_result` | jsonb | Full validation response (§4 schema) |
| `retry_count` | integer | 0–2, tracks retry attempts |
| `model_used` | text | Model identifier (e.g., 'claude-sonnet-4-5-20250929') |
| `generation_latency_ms` | integer | Time from API call to response |

---

## 8. Success Criteria

- [ ] All 15 story templates have corresponding structure validation rules
- [ ] Data fidelity catches 100% of hallucinated numbers in test set
- [ ] Voice validation flags < 5% false positives on known-good content
- [ ] Validation adds < 500ms to generation pipeline
- [ ] Retry logic improves pass rate by ≥ 30% on first-attempt failures
- [ ] Dedup correctly prevents same-topic stories within cooldown window

---

## 9. Pod 2 Implementation Notes

1. Implement as a single `validateContent(output, template, storyData)` function
2. Call synchronously after `generate-story` receives model response
3. Log all validation results regardless of pass/fail (for threshold tuning)
4. Expose validation stats in admin console (pass rate, common failures, retry success rate)
5. Start with hard-fail rules only; add soft-fail rules after 1 week of production data

*All version increments follow VERSION_METHODOLOGY.docx in the repository.*
