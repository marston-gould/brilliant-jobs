# Task: AI-Powered Resume Scoring — Pod 2 Handoff

**From:** Pod 1 (Growth) — CPO
**To:** Pod 2 (Engineering) — CTO
**Date:** February 20, 2026
**Priority:** P2 — Post-launch (paid feature candidate)
**Effort:** ~4 dev days
**Depends on:** Nothing (existing scoring system continues as fallback)
**Ref:** `RESUME_SCORE.md` (project knowledge), roadmap Phase 7

---

## Why This Matters

The current ngram scoring system works but has five documented weaknesses:

1. **No synonym awareness** — "SEO" and "search engine optimization" score as different terms
2. **Single-word bias** — unigrams overweight common words vs. meaningful phrases
3. **Equal weighting** — "Python" and "team" count the same even when the JD repeats "Python" 8 times
4. **No negative signal** — irrelevant resume terms aren't penalized
5. **Level-fit is naive** — simple partition by title, not weighted by experience relevance

An LLM-powered scorer fixes all five. It understands context, synonyms, seniority alignment, and can provide actionable rewrite suggestions — turning the score from a number into a coaching tool.

This is also the strongest candidate for a **paid feature gate**. Free users get the ngram grade. Pro users get AI-powered scoring with gap analysis and rewrite recommendations.

---

## What Exists Today

### Current Scoring Architecture (`js/keywords.js`)

**Three scoring paths, all ngram-based:**

| Scorer | Function | Where | What It Does |
|--------|----------|-------|--------------|
| Corpus readiness | `scoreResumeVsJDs()` L213 | Resume cards | Scores resume against top 40 unigrams + 25 bigrams extracted from up to 80 JDs per filter |
| Per-job match | `computeJobMatchScore()` L291 | Feed Match % column | Frequency-ranks unigrams within single JD (top 40), checks against resume keywords |
| Level-fit | `scoreResumeByLevel()` L262 | Readiness panel | Partitions JDs by `getJobLevel(title)`, runs `scoreResumeVsJDs()` per level bucket |

**Supporting infrastructure:**
- `extractNgrams()` L78 — uni/bi/trigram extraction with stopword + generic filters, per-job dedup, 10% minimum threshold
- `scoreToGrade()` L153 — score → letter grade (A+ through F) with color
- `fetchFilterJDs()` L172 — fetches up to 80 JDs per saved filter from `ats_jobs`
- `batchFetchJDContent()` — fetches Greenhouse API specs for JDs missing `content`
- `readinessCache` — `localStorage('bj_readiness')` with 24h TTL auto-refresh
- `filterCorpusCache` — in-memory corpus per filter for feed scoring
- `jobMatchScores` — in-memory per-job scores for feed column

**Data flow:**
1. User uploads resume → PDF/DOCX text extracted → keywords stored in `localStorage`
2. Resumes page loads → `runReadinessAnalysis()` auto-runs if cache > 24h
3. For each resume × assigned filter: fetch 80 JDs → extract ngrams → compare → score
4. Level-fit: partition same JDs by seniority → score per level
5. Feed: each visible job → `computeJobMatchScore()` → Match column letter grade

**Current output per resume/filter:**
```javascript
{
  score: 72,           // 0-100 (% of top 40 corpus terms found in resume)
  matched: 29,         // count of matched terms
  total: 40,           // total terms compared
  topMissing: [{term: 'python', count: 12}, ...],   // missing from resume
  topMatched: [{term: 'marketing', count: 18}, ...], // found in resume
  bigramMatched: [...], bigramMissing: [...],
  jdsAnalyzed: 47
}
```

---

## Architecture: AI Scoring via Edge Function

### Why Edge Function (not client-side)

- Anthropic API key must stay server-side
- Resume text + JD content are large payloads — Edge Function handles assembly
- Prompt caching requires consistent system prompts from a single caller
- Cost metering and rate limiting happen server-side
- Entitlement check (`check_entitlement('data', 'ai_score')`) runs server-side

### Edge Function: `score-resume`

**POST** `/functions/v1/score-resume`

**Request:**
```json
{
  "resume_text": "Full extracted resume text...",
  "resume_keywords": [["marketing", 15], ["seo", 12], ...],
  "mode": "corpus",
  "filter_name": "SEO Director",
  "job_ids": ["gh_123", "gh_456", ...],
  "max_jds": 20
}
```

**Modes:**
- `corpus` — score resume against a cluster of JDs (replaces `scoreResumeVsJDs`)
- `single` — score resume against one specific JD (replaces `computeJobMatchScore`)

**Response (corpus mode):**
```json
{
  "match_score": 82,
  "fit_status": "Strong Match",
  "analysis_summary": "Resume covers 8 of 10 core requirements. Strong on strategy and team leadership. Gap in technical implementation (Python, SQL) requested in 65% of JDs.",
  "core_requirements": [
    {"skill": "SEO strategy", "prevalence": 85, "resume_evidence": "strong"},
    {"skill": "Python", "prevalence": 65, "resume_evidence": "missing"},
    {"skill": "cross-functional leadership", "prevalence": 60, "resume_evidence": "strong"}
  ],
  "recommendations": {
    "format": ["Move technical tools section above experience", "Add metrics to each role"],
    "word_usage": ["Replace 'helped grow' with 'drove' or 'scaled'", "Add 'LTV/CAC' and 'attribution modeling'"],
    "missing_skills": ["Python", "SQL", "Tableau", "Google Tag Manager"]
  },
  "level_fit": {
    "best_level": "Director",
    "reasoning": "Experience depth (8 years, team of 12) aligns with Director requirements. Senior roles would undervalue management experience."
  },
  "differential_insight": "This filter's JDs emphasize data-driven marketing more than typical SEO roles. Consider adding analytics certifications.",
  "jds_analyzed": 20,
  "model": "claude-haiku-4-5-20251001",
  "cost_cents": 2.1
}
```

**Response (single mode):**
```json
{
  "match_score": 76,
  "fit_status": "Good Match",
  "analysis_summary": "Strong alignment on SEO and content strategy. This role emphasizes programmatic SEO (Python scripts, API integrations) more than the average JD in your filter — that's the primary gap.",
  "key_matches": ["SEO strategy", "content marketing", "team leadership", "analytics"],
  "key_gaps": ["Python scripting", "API integration", "technical SEO implementation"],
  "is_easy_win": false,
  "outlier_reason": "Requires more technical implementation than typical roles in this filter",
  "rewrite_tips": ["Add a 'Technical Tools' section listing Python, APIs, and automation tools you've used", "Quantify SEO impact with specific traffic/revenue numbers"],
  "model": "claude-haiku-4-5-20251001",
  "cost_cents": 1.4
}
```

---

## Build Order (6 steps)

### Step 1: Edge Function `score-resume` (1.5 days)

```typescript
// supabase/functions/score-resume/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });

  // Verify auth + check entitlement
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: { user }, error: authError } = await sb.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authError || !user) return new Response('Unauthorized', { status: 401 });

  // Check entitlement (ai_score is a Pro feature)
  const { data: entitled } = await sb.rpc('check_entitlement', {
    p_feature: 'data',
    p_action: 'ai_score'
  });
  // If not entitled, return a limited response
  const isPro = entitled && entitled.allowed;

  const body = await req.json();
  const { resume_text, resume_keywords, mode, filter_name, job_ids, max_jds } = body;

  if (!resume_text || !mode) {
    return new Response(JSON.stringify({ error: 'Missing resume_text or mode' }), { status: 400 });
  }

  // Fetch JD content
  let jds = [];
  if (mode === 'corpus' && job_ids && job_ids.length > 0) {
    const limit = Math.min(max_jds || 20, 30); // Cap at 30 JDs to control cost
    const { data } = await sb.from('ats_jobs')
      .select('greenhouse_id, title, content, company_name, location, salary_min, salary_max')
      .in('greenhouse_id', job_ids.slice(0, limit))
      .not('content', 'is', null);
    jds = data || [];
  } else if (mode === 'single' && job_ids && job_ids.length === 1) {
    const { data } = await sb.from('ats_jobs')
      .select('greenhouse_id, title, content, company_name, location, salary_min, salary_max')
      .eq('greenhouse_id', job_ids[0])
      .single();
    if (data) jds = [data];
  }

  if (jds.length === 0) {
    return new Response(JSON.stringify({ error: 'No JDs found' }), { status: 404 });
  }

  // Strip HTML from JD content
  const stripHtml = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // Build prompt
  const systemPrompt = mode === 'corpus'
    ? SYSTEM_PROMPT_CORPUS
    : SYSTEM_PROMPT_SINGLE;

  const jdBlock = jds.map((j, i) =>
    `<jd index="${i+1}" title="${j.title}" company="${j.company_name || 'Unknown'}" location="${j.location || 'Unspecified'}" salary_min="${j.salary_min || ''}" salary_max="${j.salary_max || ''}">\n${stripHtml(j.content).slice(0, 3000)}\n</jd>`
  ).join('\n\n');

  const userPrompt = `<resume_text>\n${resume_text.slice(0, 8000)}\n</resume_text>\n\n<filter_name>${filter_name || 'General'}</filter_name>\n\n<job_descriptions count="${jds.length}">\n${jdBlock}\n</job_descriptions>\n\n<instructions>\nScore the resume (0-100). Return ONLY a JSON object, no markdown fences, no preamble.\n</instructions>`;

  // Call Anthropic API
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  const anthropicData = await anthropicRes.json();
  const responseText = anthropicData.content?.[0]?.text || '';

  // Parse JSON response
  let result;
  try {
    const cleaned = responseText.replace(/```json|```/g, '').trim();
    result = JSON.parse(cleaned);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to parse AI response', raw: responseText }), { status: 500 });
  }

  // Add metadata
  result.model = 'claude-haiku-4-5-20251001';
  result.jds_analyzed = jds.length;
  result.cost_cents = estimateCost(resume_text.length, jdBlock.length);

  // If free user, return score only (no recommendations or rewrite tips)
  if (!isPro) {
    result = {
      match_score: result.match_score,
      fit_status: result.fit_status,
      analysis_summary: result.analysis_summary,
      jds_analyzed: result.jds_analyzed,
      upgrade_prompt: 'Upgrade to Pro to see gap analysis, rewrite suggestions, and level-fit insights.'
    };
  }

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' }
  });
});

function estimateCost(resumeLen, jdLen) {
  // Rough estimate: ~750 tokens per 3000 chars
  const inputTokens = Math.ceil((resumeLen + jdLen) / 4);
  const outputTokens = 800; // typical response
  // Haiku pricing: $0.25/1M input, $1.25/1M output (as of late 2025)
  return Math.round((inputTokens * 0.25 / 1000000 + outputTokens * 1.25 / 1000000) * 10000) / 100;
}
```

### System Prompts

```typescript
const SYSTEM_PROMPT_CORPUS = `You are a Technical Recruitment Analyst for Brilliant Jobs, a job search intelligence platform. Evaluate the provided resume against a group of job descriptions from the user's saved filter.

Your analysis must:
1. Score the resume 0-100 based on how well it covers the aggregate requirements across all JDs
2. Identify Core Requirements — skills/experience appearing in >50% of the JDs
3. For each core requirement, assess whether the resume provides strong, partial, or missing evidence
4. Provide specific, actionable recommendations for format changes, word usage improvements, and missing skills
5. Assess level fit — which seniority level in this filter is the best match
6. Note any differential insights — ways this filter's JDs differ from typical roles

Handle synonyms intelligently (e.g., "SEO" = "search engine optimization", "PM" = "product manager" or "project manager" depending on context). Weight skills by their prevalence across JDs — a skill in 80% of JDs matters more than one in 20%.

Output ONLY a JSON object with these fields:
- match_score (int 0-100)
- fit_status ("Strong Match" | "Good Match" | "Partial Match" | "Weak Match")  
- analysis_summary (string, 1-2 sentences)
- core_requirements (array of {skill, prevalence (%), resume_evidence ("strong"|"partial"|"missing")})
- recommendations ({format: string[], word_usage: string[], missing_skills: string[]})
- level_fit ({best_level: string, reasoning: string})
- differential_insight (string)

No markdown, no code fences, no preamble. JSON only.`;

const SYSTEM_PROMPT_SINGLE = `You are a Precision Matching Engine for Brilliant Jobs. Compare the provided resume against a single job description. Focus on specific alignment and gaps.

Your analysis must:
1. Score the resume 0-100 for this specific job
2. Identify what matches well and what's missing
3. Determine if this is an "Easy Win" (strong alignment, apply immediately) or requires resume tailoring
4. Provide 2-3 specific rewrite tips to improve the match for this exact role

Handle synonyms and contextual relevance. "Led a team of 5" counts toward "team leadership" even if those exact words aren't used.

Output ONLY a JSON object with these fields:
- match_score (int 0-100)
- fit_status ("Strong Match" | "Good Match" | "Partial Match" | "Weak Match")
- analysis_summary (string, 1-2 sentences)
- key_matches (string array, top 4-6 aligned skills/experiences)
- key_gaps (string array, top 3-5 missing requirements)
- is_easy_win (boolean)
- outlier_reason (string, only if is_easy_win is false)
- rewrite_tips (string array, 2-3 specific suggestions)

No markdown, no code fences, no preamble. JSON only.`;
```

### Step 2: Entitlement setup (0.25 day)

Add the AI scoring entitlement to the cohort system:

```sql
-- Add ai_score entitlement for launch cohort
INSERT INTO cohort_plan_entitlements (cohort_id, plan, feature, behavior, limit_value)
SELECT id, 'free', 'data', 'fixed', 0
FROM cohorts WHERE slug = 'launch_2026';

INSERT INTO cohort_plan_entitlements (cohort_id, plan, feature, behavior, limit_value)
SELECT id, 'pro', 'data', 'unlimited', NULL
FROM cohorts WHERE slug = 'launch_2026';

-- Note: The feature='data', action='ai_score' path needs to be added to 
-- check_entitlement() RPC if not already covered by the existing 'data' category.
-- If data.ai_score is a distinct action, add a specific row:
-- INSERT INTO cohort_plan_entitlements (cohort_id, plan, feature, action, behavior, limit_value)
-- VALUES (..., 'pro', 'data', 'ai_score', 'unlimited', NULL);
```

**Free tier:** Gets ngram scoring (existing) + AI score number only (no recommendations)
**Pro tier:** Full AI scoring with gap analysis, rewrite tips, level-fit insights

### Step 3: Client integration — Corpus scoring (1 day)

Replace `scoreResumeVsJDs()` call path with AI scorer for Pro users.

**In `keywords.js`, modify `runReadinessAnalysis()`:**

```javascript
// Inside the filter loop (around L430), after fetching JDs:
var filterScore;
if (isPro && r.extractedText && jds.length >= 3) {
  // AI scoring for Pro users
  filterScore = await fetchAIScore({
    resume_text: r.extractedText,
    resume_keywords: r.keywords,
    mode: 'corpus',
    filter_name: filter.name,
    job_ids: jds.filter(j => j.content).map(j => j.greenhouse_id),
    max_jds: 20
  });
} else {
  // Fallback to ngram scoring
  filterScore = scoreResumeVsJDs(r, jds);
}
```

**New function:**
```javascript
async function fetchAIScore(params) {
  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) return null;

    var res = await fetch(SUPABASE_URL + '/functions/v1/score-resume', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.data.session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    if (!res.ok) return null;
    var data = await res.json();

    // Normalize to existing score format for backward compatibility
    return {
      score: data.match_score,
      matched: null, // AI doesn't count matched terms
      total: null,
      topMissing: (data.recommendations?.missing_skills || []).map(s => ({ term: s, count: null })),
      topMatched: (data.key_matches || []).map(s => ({ term: s, count: null })),
      bigramMatched: [],
      bigramMissing: [],
      jdsAnalyzed: data.jds_analyzed,
      // AI-specific fields
      ai: true,
      fitStatus: data.fit_status,
      summary: data.analysis_summary,
      coreRequirements: data.core_requirements,
      recommendations: data.recommendations,
      levelFit: data.level_fit,
      differentialInsight: data.differential_insight,
      upgradePrompt: data.upgrade_prompt
    };
  } catch (e) {
    console.error('[BJ] AI score error, falling back to ngram:', e);
    return null; // Caller falls back to ngram
  }
}
```

### Step 4: Client integration — Per-job scoring (0.5 day)

Add "AI Score" button to the job modal for Pro users. This is an on-demand action, not automatic (too expensive to run on every visible job).

**In the job detail modal (wherever the job content renders):**
```javascript
// Only show for Pro users with an assigned resume
if (isPro && assignedResume) {
  modalHtml += '<button class="btn btn-secondary" onclick="aiScoreJob(\'' + job.greenhouse_id + '\')" id="ai-score-btn-' + job.greenhouse_id + '" style="font-size:12px;margin-top:8px;">AI Score This Job</button>';
  modalHtml += '<div id="ai-score-result-' + job.greenhouse_id + '"></div>';
}
```

```javascript
async function aiScoreJob(jobId) {
  var btn = document.getElementById('ai-score-btn-' + jobId);
  var resultEl = document.getElementById('ai-score-result-' + jobId);
  if (btn) { btn.disabled = true; btn.textContent = 'Scoring…'; }

  var resume = findAssignedResume(jobId); // find resume via filter assignment
  if (!resume || !resume.extractedText) {
    if (resultEl) resultEl.innerHTML = '<span style="color:var(--red);font-size:12px">No resume text available</span>';
    return;
  }

  var result = await fetchAIScore({
    resume_text: resume.extractedText,
    resume_keywords: resume.keywords,
    mode: 'single',
    job_ids: [jobId],
    max_jds: 1
  });

  if (btn) { btn.disabled = false; btn.textContent = 'AI Score This Job'; }

  if (!result || !result.ai) {
    if (resultEl) resultEl.innerHTML = '<span style="color:var(--red);font-size:12px">Scoring failed — try again</span>';
    return;
  }

  // Render rich result
  var g = scoreToGrade(result.score);
  var html = '<div style="margin-top:12px;padding:12px;background:var(--bg-input);border-radius:8px;border:1px solid var(--border);">';
  html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">';
  html += '<span style="font-size:28px;font-weight:700;color:' + g.color + ';font-family:var(--mono)">' + g.grade + '</span>';
  html += '<span style="font-size:14px;color:var(--text)">' + result.fitStatus + '</span>';
  html += '</div>';
  html += '<p style="font-size:12px;color:var(--text-dim);margin-bottom:8px">' + result.summary + '</p>';

  if (result.recommendations && result.recommendations.missing_skills) {
    html += '<div style="font-size:11px;color:var(--text-faint);margin-bottom:4px">Missing skills:</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">';
    result.recommendations.missing_skills.forEach(function(s) {
      html += '<span style="font-size:10px;padding:2px 8px;border-radius:4px;background:rgba(239,68,68,0.15);color:var(--red);border:1px solid rgba(239,68,68,0.2)">' + s + '</span>';
    });
    html += '</div>';
  }

  if (result.recommendations && result.recommendations.word_usage) {
    html += '<div style="font-size:11px;color:var(--text-faint);margin-bottom:4px">Rewrite tips:</div>';
    result.recommendations.word_usage.forEach(function(tip) {
      html += '<div style="font-size:11px;color:var(--text-dim);padding-left:8px">→ ' + tip + '</div>';
    });
  }

  html += '</div>';
  if (resultEl) resultEl.innerHTML = html;
}
```

### Step 5: Readiness panel enhancements (0.5 day)

Update `buildReadinessSide()` and `buildInlineGrade()` to render AI-specific fields when `score.ai === true`:

- Show `fit_status` label instead of just letter grade
- Show `analysis_summary` as a subtitle
- `core_requirements` rendered as a mini table (skill, prevalence bar, evidence badge)
- `recommendations` shown in collapsible sections
- `level_fit` shown as a callout
- `upgrade_prompt` shown for free users with CTA to upgrade

### Step 6: Cost controls + PostHog tracking (0.25 day)

**Rate limiting in Edge Function:**
```typescript
// Per-user daily limit
const DAILY_LIMIT = 20; // corpus + single combined
// Check against a simple counter in profiles or a dedicated table
```

**PostHog events:**
```javascript
// On AI score request
posthog.capture('ai_score_requested', { mode: mode, filter: filterName, jd_count: jds.length });
// On AI score result
posthog.capture('ai_score_completed', { mode: mode, score: result.match_score, cost_cents: result.cost_cents });
// On upgrade prompt shown
posthog.capture('ai_score_upgrade_shown', { context: 'readiness_panel' });
```

---

## Cost Model

| Scenario | Input Tokens | Output Tokens | Cost per Call |
|----------|-------------|---------------|---------------|
| Corpus (20 JDs, ~2K chars each) | ~15,000 | ~800 | ~$0.005 |
| Single JD | ~3,000 | ~500 | ~$0.001 |
| Full readiness (3 filters × 20 JDs) | 3 calls × ~15K | 3 × ~800 | ~$0.015 |

**At scale (1,000 users, 3 filters each, weekly refresh):**
- 3,000 corpus calls/week × $0.005 = **$15/week**
- 5,000 single calls/week × $0.001 = **$5/week**
- **~$80/month** at 1K active Pro users

This is well within margin if Pro is $19.99/month.

---

## Acceptance Criteria

### Edge Function
- [ ] `score-resume` Edge Function deployed and accessible
- [ ] Auth required — returns 401 without valid JWT
- [ ] Entitlement check — free users get score-only response, Pro users get full analysis
- [ ] `ANTHROPIC_API_KEY` stored in Supabase secrets, never exposed to client
- [ ] Response parses as valid JSON matching documented schema
- [ ] Handles missing JD content gracefully (skips, doesn't error)
- [ ] Input truncation: resume capped at 8K chars, each JD at 3K chars
- [ ] Rate limit: max 20 AI scoring calls per user per day

### Client Integration
- [ ] Pro users see AI scores on readiness analysis (corpus mode)
- [ ] Free users see ngram scores (no regression) + upgrade prompt
- [ ] AI score failure falls back silently to ngram scoring
- [ ] Per-job AI scoring button in job modal (Pro only)
- [ ] Rich result rendering: grade, fit status, summary, missing skills, rewrite tips
- [ ] PostHog events fire on request, completion, and upgrade prompt

### Backward Compatibility
- [ ] Ngram scoring continues to work identically for all users
- [ ] Readiness cache structure backward-compatible (AI results have `ai: true` flag)
- [ ] Feed Match column still works with ngram scores
- [ ] No changes to `extractNgrams()`, `scoreToGrade()`, or any existing function signatures

---

## What NOT to Change

- `extractNgrams()` — still needed for feed scoring and as fallback
- `scoreToGrade()` — used by both ngram and AI paths
- `fetchFilterJDs()` — still fetches JDs, AI scorer just uses the IDs
- Resume extraction (pdf.js, mammoth.js) — still runs client-side
- `localStorage` resume/keyword storage — unchanged
- The readiness cache structure — AI results extend it, don't replace it
- Feed Match column rendering — `matchBadge()` works with both score types

---

## Pod 2 Judgment Calls

1. **Model choice:** Spec uses Haiku for cost. Sonnet would give better analysis at ~5x cost. Consider Haiku for corpus (high volume) and Sonnet for single-job (user-initiated, lower volume). Or let users choose.
2. **Prompt caching:** Anthropic's prompt caching caches the system prompt + resume text across calls. Since a user's resume doesn't change between JD comparisons, the resume portion can be cached for ~90% savings on subsequent calls within the same analysis run. This requires sending resume in the system prompt or as a prefix. Worth implementing if cost matters.
3. **Batch API:** For background readiness refresh (not user-facing), Anthropic's Batch API gives 50% discount but returns results asynchronously (up to 24h). Could be used for nightly readiness refresh instead of real-time.
4. **Entitlement granularity:** The spec uses `data.ai_score` as the entitlement key. If you want per-day limits that differ by plan (free = 0, pro = 20/day, enterprise = unlimited), that needs a `check_entitlement` enhancement or a separate rate limit table.

---

*Ngram scoring remains the default for all users. AI scoring is additive, Pro-gated, and degrades gracefully to ngram on any failure. Ship the Edge Function first, wire the corpus path, then add per-job scoring.*
