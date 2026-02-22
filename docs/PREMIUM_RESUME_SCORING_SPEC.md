# Premium Resume Scoring — Technical Spec

**Date:** February 21, 2026  
**Status:** Draft  
**Replaces:** RESUME_SCORE.md (original spec, partially implemented)  
**Depends on:** Entitlements system (`check_entitlement`), existing `score-resume` Edge Function

---

## 1. Product Summary

Resume scoring becomes a two-tier, credit-consuming feature:

| Tier | What the user gets | Architecture | Credits |
|------|-------------------|--------------|---------|
| **Basic** | Single-pass score + summary + top gaps | Current: 1 Haiku call | Low cost |
| **Premium** | Multi-agent deep analysis with structured extraction, career coaching, calibrated scoring | 3-pass pipeline with Sonnet | Higher cost |

Both tiers deduct credits on each use. The user chooses which tier to invoke (or the UI defaults based on context — e.g., "Analyze" button = basic, "Deep Analysis" button = premium).

---

## 2. Architecture

### Basic Tier (Existing — No Changes)

```
User clicks "Analyze"
        │
        ▼
┌─────────────────────────┐
│  Single Haiku Call       │
│                          │
│  Resume text + JDs       │
│  → Score + summary       │
│  → Top matches/gaps      │
│  → fit_status            │
└─────────────────────────┘
        │
        ▼
   Return JSON to frontend
```

This is exactly what's deployed today. Keep it as-is.

### Premium Tier (New — Multi-Pass Pipeline)

```
User clicks "Deep Analysis"
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  PASS 1: EXTRACTION (Haiku)                             │
│                                                         │
│  Agent: Resume Structurer                               │
│  Input: Raw resume text                                 │
│  Output: Structured JSON                                │
│    - contact info                                       │
│    - career timeline (titles, companies, dates, scope)  │
│    - skills inventory (tool, proficiency, evidence)     │
│    - quantified achievements                            │
│    - education & certs                                  │
│    - language/tone profile                              │
│                                                         │
│  Agent: JD Synthesizer                                  │
│  Input: Up to 20 JDs from filter                        │
│  Output: Structured JSON                                │
│    - core requirements (>60% prevalence)                │
│    - nice-to-haves (<60% prevalence)                    │
│    - seniority signals                                  │
│    - industry/domain classification                     │
│    - compensation benchmarks from JD data               │
│                                                         │
│  These two calls run IN PARALLEL (Promise.all)          │
└─────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  PASS 2: ANALYSIS & SCORING (Sonnet)                    │
│                                                         │
│  Agent: Match Analyst                                   │
│  Input: Both structured JSONs from Pass 1               │
│  Output:                                                │
│    - Dimensional scores (6 dimensions, weighted)        │
│    - Gap analysis with severity ratings                 │
│    - Strength mapping with evidence                     │
│    - Career trajectory assessment                       │
│    - Scope comparison                                   │
│    - Level fit analysis                                 │
│    - Industry calibration (anchored by Gold Standards)  │
│                                                         │
│  Key difference from basic: works on STRUCTURED data,   │
│  not raw text. Sonnet can focus entirely on analysis     │
│  instead of also parsing.                               │
└─────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  PASS 3: COACHING (Sonnet)                              │
│                                                         │
│  Agent: Career Coach                                    │
│  Input: Structured resume + gap analysis from Pass 2    │
│  Output:                                                │
│    - Specific rewrite suggestions (before → after)      │
│    - Missing keyword injection points                   │
│    - Title translation recommendations                  │
│    - Achievement quantification prompts                 │
│    - Format/structure improvements                      │
│    - Priority-ranked action items                       │
│    - "If you only change 3 things" summary              │
│                                                         │
│  This is the high-value deliverable that justifies      │
│  premium pricing — actionable, specific coaching.       │
└─────────────────────────────────────────────────────────┘
        │
        ▼
   Merge all outputs → Return to frontend
```

---

## 3. Agent Specifications

### Agent 1: Resume Structurer (Haiku)

**Purpose:** Parse raw resume text into machine-readable structured data. This is a mechanical extraction task — perfect for Haiku.

**System prompt:**
```
You are a Resume Parser. Extract structured data from the resume text below.
Do NOT evaluate, score, or judge the resume. Only extract and organize.

Output ONLY a JSON object with these fields:

- career_timeline: array of {title, company, start_date, end_date, scope_signals: [team_size, budget, geography, etc.], key_achievements: [string with metrics where available]}
- skills_inventory: array of {skill, category (technical|soft|domain|tool), proficiency_signal (built|architected|scaled|managed|used|familiar), evidence: string}
- quantified_achievements: array of {metric, value, context} — only items with actual numbers
- education: array of {degree, institution, year, relevance_notes}
- certifications: array of {name, issuer, year}
- tone_profile: {action_verb_quality: strong|mixed|weak, quantification_density: high|medium|low, seniority_language: executive|senior|mid|junior, industry_jargon: [notable terms used]}
- red_flags: array of string — gaps >6 months, job-hopping (<1yr tenures), title inconsistencies, scope decreases
- raw_stats: {total_years_experience, number_of_roles, longest_tenure_years, industries: [string]}
```

**Model:** `claude-haiku-4-5-20251001`  
**Temperature:** 0  
**Max tokens:** 2,000  
**Input limit:** Resume text, max 8,000 chars

### Agent 2: JD Synthesizer (Haiku)

**Purpose:** Analyze the cluster of JDs and extract the composite requirements profile. Mechanical extraction — Haiku.

**System prompt:**
```
You are a Job Description Analyst. Analyze the provided job descriptions as a group and extract the composite requirements profile.
Do NOT compare to any resume. Only analyze the JDs themselves.

Output ONLY a JSON object with these fields:

- core_requirements: array of {skill, prevalence_pct (what % of JDs mention this), category (technical|soft|domain|tool|certification)} — only items in >50% of JDs
- nice_to_haves: array of {skill, prevalence_pct, category} — items in 20-50% of JDs
- seniority_profile: {expected_level, years_experience_range, management_expected: bool, scope_signals: [string]}
- industry_classification: {primary_industry, sub_domain, adjacent_industries: [string]}
- compensation_data: {salary_min_median, salary_max_median, sample_size} — from JDs that include salary
- role_archetype: string — 1-2 sentence description of what this cluster of jobs is really asking for
- outlier_requirements: array of {skill, which_jds} — unusual requirements appearing in <20% of JDs
- language_patterns: {common_verbs: [string], common_nouns: [string], jargon: [string]} — the vocabulary these JDs share
```

**Model:** `claude-haiku-4-5-20251001`  
**Temperature:** 0  
**Max tokens:** 2,000  
**Input limit:** Up to 20 JDs, each truncated to 3,000 chars

### Agent 3: Match Analyst (Sonnet)

**Purpose:** Deep comparative analysis between the structured resume and structured JD profile. This is the intelligence layer — needs Sonnet's reasoning.

**System prompt:**
```
You are a Senior Hiring Analyst with 15 years of experience reviewing candidates for {industry_classification} roles. You have the structured profile of a candidate and the composite requirements of a job cluster.

Score and analyze using these weighted dimensions:

1. CAREER TRAJECTORY (25%): Does the timeline show progression toward this role? Title escalation, scope growth, tenure patterns, industry relevance.
2. EXPERIENCE & IMPACT (25%): Do quantified achievements match the scope these JDs expect? Revenue/team/budget scale comparison.
3. SKILLS & TOOLS (20%): Core requirements coverage — how many are present with strong evidence vs. missing entirely?
4. QUALITATIVE ALIGNMENT (15%): Industry language match, seniority signal alignment, cultural fit indicators.
5. EDUCATION & CREDENTIALS (5%): Requirements met or exceeded?
6. PRESENTATION & FORMAT (10%): Action verb quality, quantification density, redundancy.

{GOLD_STANDARD_REFERENCE}

Output ONLY a JSON object with:
- overall_score: int 0-100 (weighted across all dimensions)
- dimension_scores: {trajectory: int, impact: int, skills: int, alignment: int, education: int, presentation: int}
- fit_status: "Strong Match" | "Good Match" | "Partial Match" | "Weak Match"
- executive_summary: string — 3-4 sentences, the honest assessment a coach would give
- strength_map: array of {area, evidence, relevance_to_jds}
- gap_analysis: array of {requirement, severity (critical|important|minor), current_state, what_jds_expect}
- career_trajectory_assessment: string — 2-3 sentences on progression strength and trajectory toward this role
- scope_comparison: {candidate_scope, jd_expected_scope, delta: string}
- level_fit: {best_level, reasoning}
- calibration_note: string — how this score compares to your Gold Standard reference for this industry
```

**Model:** `claude-sonnet-4-5-20250929`  
**Temperature:** 0  
**Max tokens:** 3,000  
**Input:** Both structured JSONs from Pass 1

### Agent 4: Career Coach (Sonnet)

**Purpose:** Turn the gap analysis into actionable, specific coaching. This is the premium deliverable.

**System prompt:**
```
You are a Career Coach who specializes in resume optimization for {industry_classification} roles. You have the candidate's structured resume, the JD requirements, and the gap analysis.

Your job is to give SPECIFIC, ACTIONABLE recommendations — not generic advice. Every suggestion should reference a specific part of the resume and a specific requirement from the JDs.

Output ONLY a JSON object with:
- priority_actions: array (max 3) of {action, why, expected_score_impact} — "If you only change 3 things, do these"
- rewrite_suggestions: array of {original_text, suggested_text, rationale} — specific before/after rewrites for resume bullets
- missing_keyword_injections: array of {keyword, where_to_add, how_to_phrase} — specific placement suggestions
- title_translations: array of {current_title, suggested_title, reasoning} — market-standard equivalents
- achievement_prompts: array of {weak_bullet, questions_to_quantify: [string]} — help the user add metrics to vague bullets
- format_improvements: array of string — structural changes
- gap_bridging: array of {gap, bridge_strategy} — how to address missing requirements without lying
- competitive_positioning: string — 2-3 sentences on how to position against other candidates for this cluster
```

**Model:** `claude-sonnet-4-5-20250929`  
**Temperature:** 0.2 (slightly creative for coaching language)  
**Max tokens:** 3,000  
**Input:** Structured resume from Agent 1 + gap analysis from Agent 3

---

## 4. Gold Standard Calibration

To prevent score drift across industries, the Match Analyst receives a reference example injected into its system prompt. These are curated "anchor" analyses that define what an 85 looks like in each industry.

**Initial set (3 industries):**

| Industry | Anchor Score | Characteristics |
|----------|-------------|-----------------|
| Software Engineering | 85 | 5+ years, shipped production systems, specific tech stack match, quantified performance improvements |
| Marketing / Growth | 85 | 3+ years, campaign metrics (CAC, LTV, ROAS), tool proficiency (GA, Tableau, Marketo), content evidence |
| Sales | 85 | Quota attainment history, deal size progression, CRM proficiency, territory growth metrics |

These get stored as JSON files in the Edge Function bundle and selected based on Agent 2's `industry_classification` output.

Format for injection:
```
<reference_example industry="{industry}" score="85">
{gold_standard_json}
</reference_example>

Use this as your calibration anchor. An 85 in {industry} looks like the example above. Score the current candidate relative to this standard.
```

---

## 5. Edge Function Design

### Option A: Single Function, Mode Flag (Recommended)

Extend the existing `score-resume` Edge Function with a new `tier` parameter:

```typescript
// Request body
{
  resume_text: string,
  mode: 'corpus' | 'single',
  tier: 'basic' | 'premium',   // NEW
  filter_name: string,
  job_ids: string[],
  max_jds?: number
}
```

**Why single function:** Same auth, same rate limiting, same CORS, same JD fetching logic. The only fork is after JDs are fetched — basic goes to the single Haiku call, premium goes to the 3-pass pipeline.

### Flow

```typescript
// After auth, rate check, and JD fetch...

if (tier === 'premium') {
  // Pass 1: Parallel extraction
  const [resumeProfile, jdProfile] = await Promise.all([
    callAgent('resume-structurer', { resume_text }),
    callAgent('jd-synthesizer', { jds: jdBlock })
  ]);

  // Select Gold Standard based on industry
  const goldStandard = selectGoldStandard(jdProfile.industry_classification);

  // Pass 2: Analysis
  const analysis = await callAgent('match-analyst', {
    resume_profile: resumeProfile,
    jd_profile: jdProfile,
    gold_standard: goldStandard
  });

  // Pass 3: Coaching
  const coaching = await callAgent('career-coach', {
    resume_profile: resumeProfile,
    jd_profile: jdProfile,
    gap_analysis: analysis.gap_analysis
  });

  // Merge into single response
  result = {
    tier: 'premium',
    ...analysis,
    coaching,
    resume_profile: resumeProfile,  // Include so frontend can display
    jd_profile: jdProfile,
    agents_used: 4,
    passes: 3
  };
} else {
  // Existing basic flow — unchanged
  result = await callHaiku(systemPrompt, userPrompt);
}
```

### Error Handling

Each agent call can fail independently. Strategy:

| Failure | Behavior |
|---------|----------|
| Agent 1 (Resume Structurer) fails | Abort premium, fall back to basic. Refund premium credit delta. |
| Agent 2 (JD Synthesizer) fails | Abort premium, fall back to basic. Refund premium credit delta. |
| Agent 3 (Match Analyst) fails | Return Pass 1 results with partial analysis flag. Charge reduced credits. |
| Agent 4 (Career Coach) fails | Return Passes 1-2 results without coaching. Charge reduced credits. |
| Any JSON parse failure | Retry once with stricter prompt. If still fails, fall back to basic. |

**Key principle:** Never leave the user with nothing. Always degrade gracefully to the basic tier.

---

## 6. Response Schema — Premium Tier

```json
{
  "tier": "premium",
  "overall_score": 78,
  "fit_status": "Good Match",
  "dimension_scores": {
    "trajectory": 82,
    "impact": 75,
    "skills": 80,
    "alignment": 70,
    "education": 90,
    "presentation": 65
  },
  "executive_summary": "Strong technical background with clear upward trajectory...",
  
  "resume_profile": {
    "career_timeline": [...],
    "skills_inventory": [...],
    "quantified_achievements": [...],
    "tone_profile": {...},
    "red_flags": [...]
  },
  
  "jd_profile": {
    "core_requirements": [...],
    "nice_to_haves": [...],
    "seniority_profile": {...},
    "industry_classification": {...},
    "role_archetype": "..."
  },
  
  "gap_analysis": [
    {
      "requirement": "Kubernetes experience",
      "severity": "critical",
      "current_state": "No evidence in resume",
      "what_jds_expect": "70% of JDs require container orchestration"
    }
  ],
  
  "strength_map": [...],
  "career_trajectory_assessment": "...",
  "scope_comparison": {...},
  "level_fit": {...},
  "calibration_note": "...",
  
  "coaching": {
    "priority_actions": [
      {
        "action": "Add Kubernetes to your skills section with your Docker experience as evidence",
        "why": "70% of target JDs require it, and your Docker/container work is adjacent",
        "expected_score_impact": "+5-8 points"
      }
    ],
    "rewrite_suggestions": [
      {
        "original_text": "Helped team improve deployment process",
        "suggested_text": "Reduced deployment time from 45min to 8min by implementing CI/CD pipeline, eliminating 3 manual approval steps",
        "rationale": "Quantifies impact and uses strong action verbs that match JD language"
      }
    ],
    "missing_keyword_injections": [...],
    "title_translations": [...],
    "achievement_prompts": [...],
    "format_improvements": [...],
    "gap_bridging": [...],
    "competitive_positioning": "..."
  },
  
  "model": "multi-agent",
  "agents_used": 4,
  "passes": 3,
  "jds_analyzed": 18,
  "mode": "corpus"
}
```

---

## 7. Frontend Integration

### Resume Card Changes

Add a second button alongside the existing "Analyze" button:

```
┌─────────────────────────────────────┐
│  [Analyze]     [Deep Analysis ★]    │
│   basic              premium        │
└─────────────────────────────────────┘
```

"Deep Analysis" shows a credit cost indicator and triggers `tier: 'premium'`.

### Premium Results Display

The premium response is significantly richer. The side panel expands to show:

1. **Radar chart** — 6 dimension scores visualized
2. **Gap table** — severity-colored, sortable
3. **Coaching cards** — expandable priority actions with before/after rewrites
4. **"Top 3 Changes" callout** — the highest-impact coaching items, prominently displayed
5. **Structured resume view** — the parsed career timeline, showing what the AI "saw"

### Progressive Disclosure

Don't overwhelm. Default view shows:
- Score + radar chart
- Executive summary
- Top 3 priority actions
- "Show full analysis" expandable for everything else

---

## 8. Credit Gating

Both tiers consume credits via the entitlements system:

```javascript
// Before calling the Edge Function
const entitlement = await checkEntitlement(userId, 'resume_scoring_basic');
// or
const entitlement = await checkEntitlement(userId, 'resume_scoring_premium');
```

Two separate entitlement features in the catalog:

| Feature ID | Type | Description |
|-----------|------|-------------|
| `resume_scoring_basic` | quota | Basic single-pass resume analysis |
| `resume_scoring_premium` | quota | Premium multi-agent deep analysis |

Credit costs are set in the entitlements system, not hard-coded in the Edge Function. This lets you adjust pricing without redeploying.

---

## 9. Implementation Order

1. **Add `tier` parameter** to existing Edge Function (route basic/premium)
2. **Build Agent 1 & 2** (extraction — Haiku, parallel)
3. **Build Agent 3** (analysis — Sonnet)
4. **Build Agent 4** (coaching — Sonnet)
5. **Create 3 Gold Standard calibration files**
6. **Wire frontend** — second button, premium results display
7. **Add entitlement features** — `resume_scoring_basic`, `resume_scoring_premium`
8. **Test end-to-end** with real resumes against real filter JDs
9. **Deploy + version bump**

---

## 10. Success Metrics

| Metric | Basic Tier | Premium Tier Target |
|--------|-----------|-------------------|
| Score consistency (same resume, same JDs, 5 runs) | ±8 points | ±3 points |
| Actionable recommendations (user rates as useful) | — | >70% |
| Time to result | <5s | <15s |
| Fallback rate (premium → basic) | n/a | <5% |
| Credit conversion (users who try premium after basic) | — | >30% |
