# Resume Scoring Audit: Spec vs. Implementation

**Date:** February 21, 2026  
**Purpose:** Gap analysis between RESUME_SCORE.md spec and the deployed `score-resume` Edge Function

---

## What the Spec Describes (RESUME_SCORE.md)

The spec outlines a **multi-scenario, multi-pass system** with four distinct modes:

| Scenario | Description | Status |
|----------|-------------|--------|
| **Group Analysis** | Resume vs. a cluster of related JDs — aggregate scoring with "Core Requirements" (skills in >60% of JDs) | ✅ Implemented as `corpus` mode |
| **Scenario 1: In-Set 1:1** | Resume vs. a specific JD *from* the group — identifies "Easy Win" vs. "Niche Outlier" | ✅ Implemented as `single` mode |
| **Scenario 2: Out-of-Set 1:1** | Resume vs. a *new, unseen* JD — "Transferable Fit Score" + "Surprise Requirements" | ❌ Not implemented |
| **Dynamic Few-Shotting** | "Gold Standard" analyses for 3-5 industries injected as reference examples to prevent score drift | ❌ Not implemented |

The spec also calls for:

- **Prompt Caching** on the resume (90% cost savings) — ❌ Not implemented
- **Batch API** for high-volume runs (50% cost savings) — ❌ Not implemented
- **Claude 3.5 Sonnet** as the primary model — ⚠️ Using Haiku 4.5 instead (cost decision, but quality tradeoff)

---

## What Was Actually Built

### Edge Function: `score-resume/index.ts`

**Architecture:** Single-call, single-model. One request to Claude Haiku, one JSON response back.

**Two modes implemented:**

1. **`corpus` mode** — Resume vs. up to 20 JDs from a saved filter. Uses `SYSTEM_PROMPT_CORPUS`.
2. **`single` mode** — Resume vs. 1 JD. Uses `SYSTEM_PROMPT_SINGLE`.

**What works well:**

- The system prompts are actually excellent — sophisticated 6-dimension scoring framework (Career Trajectory 25%, Experience & Impact 25%, Skills & Tools 20%, Qualitative Alignment 15%, Education 5%, Presentation 10%)
- Synonym handling, EEO boilerplate filtering, seniority signal detection
- Pro vs. Free gating (free users get score + summary only)
- Rate limiting (20 calls/day, in-memory)
- Cost estimation baked into response
- HTML stripping for JD content
- Resume text truncated to 8,000 chars, JDs to 3,000 chars each

**What's missing from the spec:**

| Gap | Impact | Difficulty |
|-----|--------|------------|
| No Out-of-Set scoring (Scenario 2) | Users can't test resume generalizability against new roles | Medium — new mode + prompt |
| No Gold Standard calibration | Score drift across industries — a Marketing 75 ≠ an Engineering 75 | Medium — needs curated examples |
| No Prompt Caching | Every call re-sends the full resume as new tokens | Low — API flag |
| No Batch API usage | No bulk processing option | Low — API change |
| Single-call architecture | One model doing extraction + analysis + scoring + recommendations in one pass | High — requires orchestration |
| No structured data extraction pass | Resume is sent as raw text, not pre-parsed | Medium — adds a first pass |
| In-memory rate limiting only | Resets on Edge Function cold start — users could exceed 20/day | Medium — move to DB |

### Frontend: `keywords.js` — `runReadinessAnalysis()`

**What the frontend actually does:**

1. For each resume with assigned filters, fetches up to 80 JDs per filter from Supabase
2. If JDs are missing content, batch-fetches from Greenhouse API (up to 30)
3. **For Pro users:** Calls `fetchAIScore()` → hits the Edge Function with `corpus` mode
4. **For Free users (or AI fallback):** Runs local n-gram keyword matching (`scoreResumeVsJDs()`)
5. Also does per-level scoring breakdown using title hierarchy

**The n-gram fallback is doing heavy lifting.** It extracts unigrams, bigrams, and trigrams from JDs, then checks which appear in the resume. This is the "basic term matching" that users found insufficient — but it's still the fallback for free users and error cases.

**Key observation:** The frontend also runs `computeJobMatchScore()` per-job in the feed, which is *always* n-gram based (never AI). So even Pro users see n-gram scores in the job feed, and only get AI scores on the Resumes page.

---

## The Real Quality Bottleneck

The single biggest issue isn't missing spec features — it's the **single-call architecture**. Right now:

1. Raw resume text (up to 8K chars) + raw JD text (up to 20 JDs × 3K chars = 60K chars) gets sent in one prompt
2. Haiku has to simultaneously: parse the resume, parse all JDs, identify patterns across JDs, score across 6 dimensions, generate specific recommendations, assess career trajectory, compare scope, and produce structured JSON
3. All in one inference pass with `temperature: 0`

That's asking a lot of Haiku in a single shot. The quality ceiling is fundamentally limited by cramming everything into one call.

---

## Recommended Upgrade Path

### Phase 1: Quick Wins (no architecture change)
- Enable Prompt Caching on resume content
- Switch corpus scoring model to Sonnet for Pro users (keep Haiku for single-JD)
- Move rate limiting to Supabase DB table
- Add Gold Standard few-shot examples for top 3-5 industries

### Phase 2: Two-Pass Architecture
- **Pass 1 (Extraction):** Haiku parses resume into structured JSON (skills, experience, metrics, trajectory)
- **Pass 2 (Analysis):** Sonnet scores structured resume data against JDs with full context

### Phase 3: Agentic Pipeline
- Skills Extractor → JD Analyst → Match Scorer → Career Coach → Calibration QA
- Each agent with a focused prompt and clear success criteria
- Aligned with Team Brilliant multi-agent framework

---

## Cost Implications

| Architecture | Est. Cost Per Analysis | Quality |
|-------------|----------------------|---------|
| Current (single Haiku call) | ~$0.01-0.02 | Baseline |
| Two-pass (Haiku extract + Sonnet score) | ~$0.05-0.08 | Significant improvement |
| Full agentic (5 agents, mixed models) | ~$0.15-0.25 | Maximum quality |

At 20 calls/day/user, even the full agentic approach is ~$5/user/day max — well within Pro pricing viability.
