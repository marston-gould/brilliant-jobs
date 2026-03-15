// supabase/functions/score-resume/index.ts
// Edge Function: AI-powered resume scoring via Anthropic API
// Tiers: 'basic' (single Haiku call) or 'premium' (multi-agent pipeline)
// Modes: 'corpus' (resume vs filter JDs) or 'single' (resume vs one JD)
// Both tiers consume credits via entitlements system
// Rate limited: 20 AI calls per user per day

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { checkFeatureAccess, buildDeniedResponse, buildSampleHeaders } from '../_shared/checkFeatureAccess.ts';
import { withAnthropicBreaker } from '../_shared/anthropic.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const SONNET_MODEL = 'claude-sonnet-4-5-20250929';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

const DAILY_LIMIT = 20;

// ─── Rate limiting ───
const dailyCounts = new Map<string, { count: number; date: string }>();

function checkDailyLimit(userId: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const entry = dailyCounts.get(userId);
  if (!entry || entry.date !== today) {
    dailyCounts.set(userId, { count: 1, date: today });
    return true;
  }
  if (entry.count >= DAILY_LIMIT) return false;
  entry.count++;
  return true;
}

// ─── HTML stripping ───
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─── Cost estimation ───
function estimateCost(tier: string, resumeLen: number, jdLen: number): number {
  const inputTokens = Math.ceil((resumeLen + jdLen) / 4);
  if (tier === 'premium') {
    // Pass 1: 2x Haiku calls (parallel), Pass 2-3: 2x Sonnet calls
    const haikuCost = (inputTokens * 0.80 / 1000000 + 2000 * 4.0 / 1000000) * 2;
    // Sonnet 4.5: $3/1M input, $15/1M output
    const sonnetInput = Math.ceil((4000 + jdLen) / 4); // structured data is smaller
    const sonnetCost = (sonnetInput * 3.0 / 1000000 + 3000 * 15.0 / 1000000) * 2;
    return Math.round((haikuCost + sonnetCost) * 10000) / 100;
  }
  // Basic: single Haiku call
  const outputTokens = 800;
  return Math.round((inputTokens * 0.80 / 1000000 + outputTokens * 4.0 / 1000000) * 10000) / 100;
}

// ─── Anthropic API caller ───
async function callAnthropic(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 3000,
  temperature: number = 0
): Promise<{ text: string; ok: boolean; error?: string; usage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } }> {
  const startMs = Date.now();
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[score-resume] Anthropic ${model} error:`, res.status, errBody);
      return { text: '', ok: false, error: `API error ${res.status}` };
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const usage = data.usage ? {
      input_tokens: data.usage.input_tokens || 0,
      output_tokens: data.usage.output_tokens || 0,
      cache_read_input_tokens: data.usage.cache_read_input_tokens || 0,
      cache_creation_input_tokens: data.usage.cache_creation_input_tokens || 0,
    } : undefined;
    // 5.1: Log cache hit rate
    if (usage) {
      const totalInput = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
      const hitRate = totalInput > 0 ? Math.round(((usage.cache_read_input_tokens || 0) / totalInput) * 100) / 100 : 0;
      if (hitRate > 0) console.log(`[score-resume] cache_hit_rate=${hitRate} tokens_saved=${usage.cache_read_input_tokens} model=${model}`);
    }
    return { text, ok: true, usage };
  } catch (e) {
    console.error(`[score-resume] Anthropic ${model} exception:`, e);
    return { text: '', ok: false, error: String(e) };
  }
}

// ─── AI usage logging (fire-and-forget) ───
async function logUsage(sb: SupabaseClient, userId: string, model: string, usage: { input_tokens: number; output_tokens: number } | undefined, durationMs: number) {
  if (!usage) return;
  try {
    const inputCostPer1k = model.includes('haiku') ? 0.00025 : model.includes('opus') ? 0.015 : 0.003;
    const outputCostPer1k = model.includes('haiku') ? 0.00125 : model.includes('opus') ? 0.075 : 0.015;
    const cost = (usage.input_tokens / 1000 * inputCostPer1k) + (usage.output_tokens / 1000 * outputCostPer1k);
    await sb.from('ai_usage_log').insert({
      function_name: 'score-resume',
      user_id: userId || null,
      model: model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      total_tokens: usage.input_tokens + usage.output_tokens,
      duration_ms: durationMs,
      estimated_cost_usd: Math.round(cost * 1000000) / 1000000,
      created_at: new Date().toISOString(),
    });
  } catch (e) { console.warn('[score-resume] Usage log failed:', e.message); }
}

// ─── JSON parser with retry ───
function parseJSON(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

// ════════════════════════════════════════════════════════════
// BASIC TIER — System Prompts (existing, unchanged)
// ════════════════════════════════════════════════════════════

const SYSTEM_PROMPT_CORPUS = `You are a Senior Career Strategist and Resume Analyst for Brilliant Jobs. You evaluate resumes with the depth of a hiring manager who has reviewed 10,000+ applications. Your analysis goes far beyond keyword matching.

SCORING FRAMEWORK (weight each dimension):

1. CAREER TRAJECTORY (25% of score)
- Job title progression: Is there a clear upward or lateral-strategic trajectory?
- Scope escalation: Did responsibilities grow (team size, budget, geography)?
- Tenure patterns: Appropriate time in each role, or red-flag job-hopping?
- Title translation: Do the candidate's titles map to what this filter's JDs expect? Flag internal titles that don't translate well to market-standard equivalents.
- Gap narrative: Note any career gaps or non-linear transitions that need explanation.

2. EXPERIENCE & IMPACT (25% of score)
- Impact quantification: Does the resume show measurable outcomes (revenue, %, $, users, efficiency) or just list tasks?
- Scope and scale: Compare the size of companies/budgets/teams managed against what JDs expect.
- Relevant vs. filler experience: How much of the resume is directly applicable vs. generic padding?

3. SKILLS & TOOLS (20% of score)
- Entity recognition: Specific tools, platforms, methodologies, and certifications that JDs explicitly require (e.g., "Google Search Console", "Tableau", "Kubernetes") — are they present or absent?
- Skill depth signals: Does the resume demonstrate depth (built, architected, scaled) or just familiarity (used, familiar with)?
- Keyword density: Which high-prevalence JD terms are underrepresented in the resume?

4. QUALITATIVE ALIGNMENT (15% of score)
- Industry/niche relevance: Semantic distance between candidate's past industries and the target industry.
- Tone and cultural language: Does the resume use the same vernacular as the JDs? (e.g., "Growth Hacking" vs "Performance Marketing", "IC" vs "Individual Contributor")
- Seniority signal alignment: Does the language match the expected level? (Director-level should show strategy, not execution details)

5. EDUCATION & CREDENTIALS (5% of score)
- Degree requirements met or exceeded?
- Certifications that JDs mention?

6. PRESENTATION & FORMAT (10% of score)
- Redundancy check: Repetitive phrases or filler words taking up space?
- Action verb quality: Strong verbs (drove, scaled, architected) vs weak (helped, assisted, participated)?
- Quantification density: What % of bullet points include a number or metric?

Handle synonyms intelligently. "SEO" = "search engine optimization". "PM" can be "product manager" or "project manager" — use context. Do NOT flag EEO/legal boilerplate terms as missing skills.

Output ONLY a JSON object with these fields:
- match_score (int 0-100, weighted across all 6 dimensions)
- fit_status ("Strong Match" | "Good Match" | "Partial Match" | "Weak Match")
- analysis_summary (string, 2-3 sentences — the honest executive summary a coach would give)
- core_requirements (array of {skill: string, prevalence: int (% of JDs), resume_evidence: "strong"|"partial"|"missing"} — top 8-12 requirements)
- recommendations object with ALL of these keys:
  - impact_quantification (string array, 2-3 tips on adding metrics/outcomes)
  - missing_tools (string array — specific tools/platforms/tech absent from resume but required by JDs)
  - title_translation (string array — suggestions for adjusting past titles to market-standard equivalents)
  - tone_alignment (string array — vernacular/jargon adjustments to match JD language)
  - redundancy_fixes (string array — repetitive phrases or filler to cut)
  - gap_narrative (string or null — how to bridge non-linear transitions if applicable)
  - format (string array — structural improvements)
- level_fit ({best_level: string, reasoning: string})
- career_trajectory_assessment (string — 1-2 sentences on progression strength)
- scope_comparison (string — how candidate's past scope compares to JD expectations)
- differential_insight (string — what makes this filter's JDs unusual vs typical roles)

No markdown, no code fences, no preamble. JSON only.`;

const SYSTEM_PROMPT_SINGLE = `You are a Senior Career Strategist for Brilliant Jobs. Compare the resume against this specific job description with the depth of an experienced hiring manager.

Analyze across these dimensions:
1. CAREER FIT: Does the candidate's trajectory align with this role's expectations? Title progression, scope, industry relevance.
2. IMPACT EVIDENCE: Does the resume demonstrate outcomes at the scale this JD expects?
3. SKILLS & TOOLS: Specific platforms, methodologies, certifications required — present or absent?
4. QUALITATIVE ALIGNMENT: Industry language, seniority signals, cultural fit indicators.
5. PRESENTATION: Is the resume optimized for this specific role, or generic?

Handle synonyms and contextual relevance. "Led a team of 5" counts toward "team leadership". Do NOT flag EEO boilerplate as gaps.

Output ONLY a JSON object with these fields:
- match_score (int 0-100)
- fit_status ("Strong Match" | "Good Match" | "Partial Match" | "Weak Match")
- analysis_summary (string, 2-3 sentences — honest assessment a coach would give)
- key_matches (string array, top 4-6 aligned skills/experiences with WHY they match)
- key_gaps (string array, top 3-5 missing requirements — only real requirements, not boilerplate)
- is_easy_win (boolean)
- outlier_reason (string, only if is_easy_win is false — what specifically needs tailoring)
- rewrite_tips (string array, 3-5 specific suggestions covering: impact metrics, missing tools, title/language adjustments, and any structural changes)
- scope_comparison (string — how candidate's past scale compares to this role's expectations)

No markdown, no code fences, no preamble. JSON only.`;


// ════════════════════════════════════════════════════════════
// PREMIUM TIER — Agent System Prompts
// ════════════════════════════════════════════════════════════

const AGENT_RESUME_STRUCTURER = `You are a Resume Parser. Extract structured data from the resume text below.
Do NOT evaluate, score, or judge the resume. Only extract and organize.

Output ONLY a JSON object with these fields:

- career_timeline: array of {title: string, company: string, start_date: string, end_date: string|"present", duration_months: int, scope_signals: [string], key_achievements: [string]}
- skills_inventory: array of {skill: string, category: "technical"|"soft"|"domain"|"tool"|"certification", proficiency_signal: "built"|"architected"|"scaled"|"managed"|"led"|"used"|"familiar", evidence: string}
- quantified_achievements: array of {metric: string, value: string, context: string} — ONLY items with actual numbers/percentages
- education: array of {degree: string, institution: string, year: string|null}
- certifications: array of {name: string, issuer: string|null, year: string|null}
- tone_profile: {action_verb_quality: "strong"|"mixed"|"weak", quantification_density: "high"|"medium"|"low", seniority_language: "executive"|"senior"|"mid"|"junior", notable_jargon: [string]}
- red_flags: [string] — gaps >6 months, tenures <1yr, title inconsistencies, scope decreases
- raw_stats: {total_years_experience: number, number_of_roles: int, longest_tenure_years: number, industries: [string]}

No markdown, no code fences, no preamble. JSON only.`;

const AGENT_JD_SYNTHESIZER = `You are a Job Description Analyst. Analyze the provided job descriptions as a group and extract the composite requirements profile.
Do NOT compare to any resume. Only analyze the JDs themselves.

Output ONLY a JSON object with these fields:

- core_requirements: array of {skill: string, prevalence_pct: int, category: "technical"|"soft"|"domain"|"tool"|"certification"} — items in >50% of JDs
- nice_to_haves: array of {skill: string, prevalence_pct: int, category: string} — items in 20-50% of JDs
- seniority_profile: {expected_level: string, years_experience_range: string, management_expected: boolean, scope_signals: [string]}
- industry_classification: {primary_industry: string, sub_domain: string, adjacent_industries: [string]}
- compensation_data: {salary_min_median: number|null, salary_max_median: number|null, sample_size: int}
- role_archetype: string — 1-2 sentence description of what this cluster really asks for
- outlier_requirements: array of {skill: string, prevalence_pct: int} — unusual items in <20% of JDs
- language_patterns: {common_verbs: [string], common_nouns: [string], jargon: [string]}

Ignore EEO/legal boilerplate entirely. Do NOT count diversity statements, equal opportunity language, or accommodation notices as requirements.

No markdown, no code fences, no preamble. JSON only.`;

function buildMatchAnalystPrompt(industryHint: string, goldStandard: string | null): string {
  const calibrationBlock = goldStandard
    ? `\n\n<reference_example industry="${industryHint}" score="85">\n${goldStandard}\n</reference_example>\n\nUse this as your calibration anchor. An 85 in ${industryHint} looks like the example above. Score the current candidate relative to this standard.`
    : `\n\nNo industry calibration reference is available. Score based on your general expertise, noting that scores should reflect: 90+ = exceptional match, 80-89 = strong, 70-79 = good with gaps, 60-69 = partial, below 60 = significant gaps.`;

  return `You are a Senior Hiring Analyst with 15 years of experience reviewing candidates for ${industryHint} roles. You receive the STRUCTURED profile of a candidate and the COMPOSITE requirements of a job cluster. Both have already been parsed — your job is pure analysis.

Score and analyze using these weighted dimensions:

1. CAREER TRAJECTORY (25%): Does the timeline show progression toward this role? Title escalation, scope growth, tenure patterns, industry relevance.
2. EXPERIENCE & IMPACT (25%): Do quantified achievements match the scope these JDs expect? Revenue/team/budget scale comparison.
3. SKILLS & TOOLS (20%): Core requirements coverage — how many are present with strong evidence vs. missing entirely?
4. QUALITATIVE ALIGNMENT (15%): Industry language match, seniority signal alignment, cultural fit indicators.
5. EDUCATION & CREDENTIALS (5%): Requirements met or exceeded?
6. PRESENTATION & FORMAT (10%): Action verb quality, quantification density, redundancy.
${calibrationBlock}

Output ONLY a JSON object with:
- overall_score: int 0-100 (weighted across all dimensions)
- dimension_scores: {trajectory: int, impact: int, skills: int, alignment: int, education: int, presentation: int}
- fit_status: "Strong Match" | "Good Match" | "Partial Match" | "Weak Match"
- executive_summary: string — 3-4 sentences, the honest assessment
- strength_map: array of {area: string, evidence: string, relevance: string}
- gap_analysis: array of {requirement: string, severity: "critical"|"important"|"minor", current_state: string, what_jds_expect: string}
- career_trajectory_assessment: string — 2-3 sentences
- scope_comparison: {candidate_scope: string, jd_expected_scope: string, delta: string}
- level_fit: {best_level: string, reasoning: string}
- calibration_note: string — contextual note on scoring confidence

No markdown, no code fences, no preamble. JSON only.`;
}

const AGENT_CAREER_COACH = `You are a Career Coach specializing in resume optimization. You receive the candidate's structured resume, the JD requirements profile, and the gap analysis from the scoring stage.

Your job is to give SPECIFIC, ACTIONABLE recommendations. Every suggestion must reference a specific part of the resume and a specific requirement. No generic advice.

Output ONLY a JSON object with:
- priority_actions: array (max 3) of {action: string, why: string, expected_impact: string} — "If you only change 3 things"
- rewrite_suggestions: array of {original_text: string, suggested_text: string, rationale: string} — specific before/after for resume bullets
- missing_keyword_injections: array of {keyword: string, where_to_add: string, how_to_phrase: string}
- title_translations: array of {current_title: string, suggested_title: string, reasoning: string}
- achievement_prompts: array of {weak_bullet: string, questions_to_quantify: [string]} — help add metrics to vague bullets
- format_improvements: [string] — structural changes
- gap_bridging: array of {gap: string, bridge_strategy: string} — how to address missing reqs without fabricating
- competitive_positioning: string — 2-3 sentences on positioning against other candidates

No markdown, no code fences, no preamble. JSON only.`;


// ════════════════════════════════════════════════════════════
// GOLD STANDARD CALIBRATION
// ════════════════════════════════════════════════════════════

const GOLD_STANDARDS: Record<string, string> = {
  'software_engineering': JSON.stringify({
    overall_score: 85,
    profile: "5+ years shipping production systems. Specific tech stack match to JD requirements. Quantified performance improvements (latency, uptime, throughput). Led team of 3-8 engineers. Progressed from IC to senior/lead. Evidence of system design and architecture decisions.",
    dimension_scores: { trajectory: 88, impact: 85, skills: 90, alignment: 80, education: 80, presentation: 82 }
  }),
  'marketing': JSON.stringify({
    overall_score: 85,
    profile: "3+ years with campaign ownership. Metrics include CAC, LTV, ROAS, conversion rates. Tool proficiency across analytics (GA4, Mixpanel), automation (HubSpot, Marketo), and visualization (Tableau, Looker). Content portfolio with measurable engagement. Progressed from specialist to manager/director.",
    dimension_scores: { trajectory: 82, impact: 88, skills: 85, alignment: 85, education: 75, presentation: 88 }
  }),
  'sales': JSON.stringify({
    overall_score: 85,
    profile: "3+ years with quota attainment history (>100% avg). Deal size progression visible. CRM proficiency (Salesforce, HubSpot). Territory or segment growth metrics. Client retention and expansion numbers. Progressed from SDR/BDR to AE to senior/enterprise.",
    dimension_scores: { trajectory: 85, impact: 90, skills: 82, alignment: 85, education: 70, presentation: 85 }
  }),
  'data_science': JSON.stringify({
    overall_score: 85,
    profile: "3+ years building ML models in production. Specific framework proficiency (PyTorch, TensorFlow, scikit-learn). Statistical methodology knowledge. Business impact of models quantified (revenue lift, cost reduction, accuracy improvements). Published or presented work. SQL and pipeline tool proficiency.",
    dimension_scores: { trajectory: 82, impact: 85, skills: 92, alignment: 80, education: 90, presentation: 78 }
  }),
  'product_management': JSON.stringify({
    overall_score: 85,
    profile: "4+ years owning product roadmap. Evidence of user research and data-driven decisions. Launched features with measurable adoption metrics. Cross-functional leadership (eng, design, marketing). Revenue or growth impact quantified. Strategic thinking visible in scope of initiatives.",
    dimension_scores: { trajectory: 88, impact: 85, skills: 80, alignment: 88, education: 78, presentation: 85 }
  })
};

function selectGoldStandard(industryClassification: Record<string, unknown>): { industry: string; standard: string | null } {
  if (!industryClassification?.primary_industry) return { industry: 'general', standard: null };

  const industry = industryClassification.primary_industry.toLowerCase();
  const subDomain = (industryClassification.sub_domain || '').toLowerCase();

  // Map to closest Gold Standard
  if (industry.includes('software') || industry.includes('engineer') || industry.includes('tech') || subDomain.includes('developer'))
    return { industry: 'Software Engineering', standard: GOLD_STANDARDS.software_engineering };
  if (industry.includes('marketing') || industry.includes('growth') || subDomain.includes('seo') || subDomain.includes('content'))
    return { industry: 'Marketing', standard: GOLD_STANDARDS.marketing };
  if (industry.includes('sales') || industry.includes('business development') || subDomain.includes('account'))
    return { industry: 'Sales', standard: GOLD_STANDARDS.sales };
  if (industry.includes('data') || industry.includes('machine learning') || industry.includes('analytics') || subDomain.includes('ml'))
    return { industry: 'Data Science', standard: GOLD_STANDARDS.data_science };
  if (industry.includes('product') || subDomain.includes('product manag'))
    return { industry: 'Product Management', standard: GOLD_STANDARDS.product_management };

  return { industry: industryClassification.primary_industry, standard: null };
}


// ════════════════════════════════════════════════════════════
// GAP INTERVIEW AGENT
// ════════════════════════════════════════════════════════════

const AGENT_GAP_INTERVIEWER = `You are a Career Interview Specialist. For each gap between a candidate's resume and job requirements, generate 2-3 targeted questions that could uncover relevant experience the candidate has but didn't include on their resume.

Think laterally:
- If the gap is "Kubernetes", ask about Docker, containers, cloud infrastructure, deployment tools
- If the gap is "team leadership of 10+", ask about cross-functional teams, dotted-line reports, contractor management, mentoring
- If the gap is "Python", ask about scripting, automation, data analysis, Jupyter, pandas, SQL
- If the gap is a specific industry, ask about adjacent industries and transferable domain knowledge

Each question should be conversational and non-intimidating. Help the user realize they may have relevant experience they forgot to mention.

Output ONLY a JSON object:
{
  "gap_questions": [
    {
      "gap": "the requirement that's missing",
      "severity": "critical" | "important" | "minor",
      "questions": ["question 1", "question 2"],
      "hint": "brief encouragement like: Even adjacent experience counts — Docker, ECS, cloud deployments all relate"
    }
  ]
}

Only generate questions for gaps where the candidate MIGHT have relevant experience. Skip gaps that are clearly unrecoverable (e.g., "PhD required" when candidate has no graduate education).

No markdown, no code fences, no preamble. JSON only.`;

async function runGapInterview(gapAnalysis: unknown[], resumeProfile: unknown): Promise<unknown> {
  const input = `<gap_analysis>\n${JSON.stringify(gapAnalysis)}\n</gap_analysis>\n\n<candidate_profile_summary>\nIndustries: ${(resumeProfile?.raw_stats?.industries || []).join(', ')}\nYears experience: ${resumeProfile?.raw_stats?.total_years_experience || 'unknown'}\nSkills: ${(resumeProfile?.skills_inventory || []).slice(0, 20).map((s: Record<string, unknown>) => s.skill).join(', ')}\n</candidate_profile_summary>\n\nGenerate targeted questions for each gap. Return ONLY JSON.`;

  const result = await callAnthropic(HAIKU_MODEL, AGENT_GAP_INTERVIEWER, input, 2000, 0);

  if (!result.ok) {
    console.error('[score-resume:gap-interview] Failed:', result.error);
    return { gap_questions: [], error: 'Gap interview generation failed' };
  }

  try {
    return parseJSON(result.text);
  } catch (e) {
    console.error('[score-resume:gap-interview] JSON parse failed');
    return { gap_questions: [], error: 'Failed to parse gap interview response' };
  }
}

async function runPremiumPipeline(resumeText: string, jdBlock: string, filterName: string, jdCount: number): Promise<unknown> {
  const startTime = Date.now();

  // ─── PASS 1: Parallel extraction (Haiku) ───
  console.log('[score-resume:premium] Pass 1: extraction starting...');

  const resumePrompt = `<resume_text>\n${resumeText.slice(0, 8000)}\n</resume_text>\n\nExtract structured data. Return ONLY JSON.`;
  const jdPrompt = `<filter_name>${filterName || 'General'}</filter_name>\n\n<job_descriptions count="${jdCount}">\n${jdBlock}\n</job_descriptions>\n\nAnalyze these JDs as a group. Return ONLY JSON.`;

  const [resumeResult, jdResult] = await Promise.all([
    callAnthropic(HAIKU_MODEL, AGENT_RESUME_STRUCTURER, resumePrompt, 2500, 0),
    callAnthropic(HAIKU_MODEL, AGENT_JD_SYNTHESIZER, jdPrompt, 2500, 0)
  ]);

  // If either extraction fails, signal fallback
  if (!resumeResult.ok || !jdResult.ok) {
    console.error('[score-resume:premium] Pass 1 failed:', resumeResult.error, jdResult.error);
    return { fallback: true, reason: 'extraction_failed' };
  }

  let resumeProfile: unknown;
  let jdProfile: unknown;
  try {
    resumeProfile = parseJSON(resumeResult.text);
    jdProfile = parseJSON(jdResult.text);
  } catch (e) {
    console.error('[score-resume:premium] Pass 1 JSON parse failed');
    return { fallback: true, reason: 'extraction_parse_failed' };
  }

  const pass1Ms = Date.now() - startTime;
  console.log(`[score-resume:premium] Pass 1 complete in ${pass1Ms}ms`);

  // ─── PASS 2: Analysis (Sonnet) ───
  console.log('[score-resume:premium] Pass 2: analysis starting...');

  const { industry, standard } = selectGoldStandard(jdProfile.industry_classification);
  const matchAnalystPrompt = buildMatchAnalystPrompt(industry, standard);

  const analysisInput = `<candidate_profile>\n${JSON.stringify(resumeProfile)}\n</candidate_profile>\n\n<job_requirements>\n${JSON.stringify(jdProfile)}\n</job_requirements>\n\nAnalyze and score. Return ONLY JSON.`;

  const analysisResult = await callAnthropic(SONNET_MODEL, matchAnalystPrompt, analysisInput, 3000, 0);

  let analysis: unknown;
  if (!analysisResult.ok) {
    console.error('[score-resume:premium] Pass 2 failed:', analysisResult.error);
    // Return partial result — Pass 1 data only
    return {
      tier: 'premium',
      partial: true,
      partial_reason: 'analysis_failed',
      resume_profile: resumeProfile,
      jd_profile: jdProfile,
      match_score: null,
      passes_completed: 1,
      timing_ms: Date.now() - startTime
    };
  }

  try {
    analysis = parseJSON(analysisResult.text);
  } catch (e) {
    console.error('[score-resume:premium] Pass 2 JSON parse failed');
    return {
      tier: 'premium',
      partial: true,
      partial_reason: 'analysis_parse_failed',
      resume_profile: resumeProfile,
      jd_profile: jdProfile,
      match_score: null,
      passes_completed: 1,
      timing_ms: Date.now() - startTime
    };
  }

  const pass2Ms = Date.now() - startTime;
  console.log(`[score-resume:premium] Pass 2 complete in ${pass2Ms}ms`);

  // ─── PASS 3: Coaching (Sonnet) ───
  console.log('[score-resume:premium] Pass 3: coaching starting...');

  const coachingInput = `<candidate_profile>\n${JSON.stringify(resumeProfile)}\n</candidate_profile>\n\n<job_requirements>\n${JSON.stringify(jdProfile)}\n</job_requirements>\n\n<gap_analysis>\n${JSON.stringify(analysis.gap_analysis || [])}\n</gap_analysis>\n\n<current_score>${analysis.overall_score || 'unknown'}</current_score>\n\nProvide specific, actionable coaching. Return ONLY JSON.`;

  const coachingResult = await callAnthropic(SONNET_MODEL, AGENT_CAREER_COACH, coachingInput, 3000, 0.2);

  let coaching: unknown = null;
  if (coachingResult.ok) {
    try {
      coaching = parseJSON(coachingResult.text);
    } catch (e) {
      console.error('[score-resume:premium] Pass 3 JSON parse failed — returning without coaching');
    }
  } else {
    console.error('[score-resume:premium] Pass 3 failed:', coachingResult.error);
  }

  const totalMs = Date.now() - startTime;
  console.log(`[score-resume:premium] Pipeline complete in ${totalMs}ms (p1:${pass1Ms}ms p2:${pass2Ms - pass1Ms}ms p3:${totalMs - pass2Ms}ms)`);

  // ─── Merge final output ───
  return {
    tier: 'premium',
    partial: coaching === null,
    partial_reason: coaching === null ? 'coaching_failed' : null,

    // Core scoring (from Pass 2)
    match_score: analysis.overall_score ?? null,
    overall_score: analysis.overall_score ?? null,
    dimension_scores: analysis.dimension_scores ?? null,
    fit_status: analysis.fit_status ?? null,
    executive_summary: analysis.executive_summary ?? analysis.analysis_summary ?? null,

    // Analysis detail (from Pass 2)
    strength_map: analysis.strength_map ?? [],
    gap_analysis: analysis.gap_analysis ?? [],
    career_trajectory_assessment: analysis.career_trajectory_assessment ?? null,
    scope_comparison: analysis.scope_comparison ?? null,
    level_fit: analysis.level_fit ?? null,
    calibration_note: analysis.calibration_note ?? null,

    // Structured data (from Pass 1)
    resume_profile: resumeProfile,
    jd_profile: jdProfile,

    // Coaching (from Pass 3)
    coaching: coaching,

    // Metadata
    agents_used: coaching ? 4 : 3,
    passes_completed: coaching ? 3 : 2,
    industry_detected: industry,
    gold_standard_used: standard !== null,
    timing_ms: totalMs,
  };
}


// ════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const sb = createClient(SB_URL, SB_KEY);
    const { data: { user }, error: authError } = await sb.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Rate limit (in-memory fast check)
    if (!checkDailyLimit(user.id)) {
      return new Response(JSON.stringify({ error: 'Daily AI scoring limit reached (20/day)' }), { status: 429, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // ─── FB-TRIAL-001-S2: Feature access gate ───
    const access = await checkFeatureAccess(sb, user.id, 'score');
    if (!access.allowed) {
      // 5.2: Queue for batch scoring if expired_free and score sample already consumed
      if (access.reason === 'upgrade_required' && resume_text && mode === 'single') {
        const jobDescText = body.job_description_text as string || '';
        const { data: queueRow, error: queueErr } = await sb
          .from('resume_score_queue')
          .insert({
            user_id: user.id,
            resume_id: body.resume_id || null,
            job_id: body.job_id || null,
            resume_text: resume_text.slice(0, 8000),
            job_description_text: jobDescText.slice(0, 3000),
            status: 'pending',
          })
          .select('id')
          .single();

        if (queueErr || !queueRow) {
          console.error('[score-resume] Queue insert error:', queueErr?.message);
          return buildDeniedResponse(access);
        }

        return new Response(JSON.stringify({ queued: true, queue_id: queueRow.id }), {
          status: 202,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'X-Score-Queued': 'true' },
        });
      }
      return buildDeniedResponse(access);
    }
    const sampleHeaders = access.isSample ? buildSampleHeaders() : {};

    // Rate limit (database-backed persistent check)
    try {
      const { data: allowed } = await sb.rpc('check_ef_rate_limit', {
        p_function_name: 'score-resume',
        p_caller_id: user.id.substring(0, 20),
        p_max_calls: 20,
        p_window_minutes: 60
      });
      if (allowed === false) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 20 calls per hour.' }), {
          status: 429,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Retry-After': '3600' },
        });
      }
    } catch (rlErr) { console.warn('[score-resume] DB rate limit check failed:', rlErr.message); }

    const _scoreStartMs = Date.now();

    // Check entitlement (Pro vs Free)
    const { data: profile } = await sb.from('profiles').select('plan').eq('id', user.id).single();
    const isPro = profile?.plan === 'pro' || profile?.plan === 'enterprise';

    // Parse body
    const body = await req.json();
    const { resume_text, resume_keywords, mode, tier: requestedTier, filter_name, job_ids, max_jds, job_description_text, job_title: directJobTitle, company_name: directCompanyName } = body;

    if (!mode) {
      return new Response(JSON.stringify({ error: 'Missing mode' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    if (mode !== 'gap-interview' && !resume_text) {
      return new Response(JSON.stringify({ error: 'Missing resume_text' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    if (!['corpus', 'single', 'gap-interview', 'revision-assess'].includes(mode)) {
      return new Response(JSON.stringify({ error: 'Invalid mode. Use "corpus", "single", "gap-interview", or "revision-assess"' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // ─── GAP INTERVIEW MODE ───
    if (mode === 'gap-interview') {
      const { gap_analysis, resume_profile } = body;
      if (!gap_analysis || !Array.isArray(gap_analysis)) {
        return new Response(JSON.stringify({ error: 'gap-interview mode requires gap_analysis array' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }

      console.log(`[score-resume] GAP INTERVIEW user=${user.id} gaps=${gap_analysis.length}`);
      const gapResult = await runGapInterview(gap_analysis, resume_profile || {});

      return new Response(JSON.stringify({
        mode: 'gap-interview',
        ...gapResult,
        model: HAIKU_MODEL
      }), {
        headers: { ...CORS_HEADERS, ...sampleHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ─── REVISION ASSESS MODE (G33) ───
    if (mode === 'revision-assess') {
      const { resume_sections, feedback } = body;
      if (!feedback) {
        return new Response(JSON.stringify({ error: 'revision-assess mode requires feedback object' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }

      console.log(`[score-resume] REVISION ASSESS user=${user.id}`);

      const assessPrompt = `You are a Revision Advisor. Evaluate user feedback on a resume rewrite and predict whether a revision will meaningfully improve the output.

You receive:
1. Star ratings (overall, accuracy, relevance, voice, formatting) — each 1-5
2. Qualitative feedback text

Assess:
- Is the feedback specific enough to act on? (references specific bullets, sections, concrete changes)
- What dimensions would improve most from a revision?
- Is another round worth the cost?

Be honest. If the resume is strong and feedback is minor, say so. If feedback suggests fundamental issues, say that too.

Output ONLY JSON:
{
  "revision_recommended": boolean,
  "confidence": "high" | "medium" | "low",
  "confidence_reason": "string",
  "estimated_improvements": [{ "area": "string", "current_rating": int, "estimated_after": int }],
  "feedback_quality": "specific" | "moderate" | "vague",
  "suggestion_to_user": "string — if feedback is vague, suggest how to make it more actionable"
}

No markdown, no code fences. JSON only.`;

      const assessInput = `<ratings>
Overall: ${feedback.overall || '?'}/5
Accuracy: ${feedback.accuracy || '?'}/5
Relevance: ${feedback.relevance || '?'}/5
Voice: ${feedback.voice || '?'}/5
Formatting: ${feedback.formatting || '?'}/5
</ratings>

<feedback_text>
${feedback.text || 'No specific feedback provided'}
</feedback_text>

${resume_sections ? '<resume_sections_summary>' + JSON.stringify(resume_sections).slice(0, 2000) + '</resume_sections_summary>' : ''}

Assess. Return ONLY JSON.`;

      const assessResult = await callAnthropic(HAIKU_MODEL, assessPrompt, assessInput, 1500, 0);

      let assessment = { revision_recommended: true, confidence: 'medium', confidence_reason: 'Unable to assess' };
      if (assessResult.ok) {
        try { assessment = parseJSON(assessResult.text); } catch (e) {}
      }

      return new Response(JSON.stringify({
        mode: 'revision-assess',
        ...assessment,
        model: HAIKU_MODEL
      }), {
        headers: { ...CORS_HEADERS, ...sampleHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Determine tier — default to 'basic', premium requires explicit request
    const tier = requestedTier === 'premium' ? 'premium' : 'basic';

    // Premium requires corpus mode with multiple JDs
    if (tier === 'premium' && mode === 'single') {
      return new Response(JSON.stringify({ error: 'Premium tier requires corpus mode (multiple JDs)' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Fetch JD content
    let jds: unknown[] = [];
    // EXT-AS-4: Direct JD text from extension (no ats_jobs lookup needed)
    if (job_description_text && mode === 'single') {
      jds = [{
        greenhouse_id: 'ext-direct',
        title: directJobTitle || 'Unknown Title',
        content: job_description_text,
        company_name: directCompanyName || 'Unknown',
        location: '',
        salary_min: null,
        salary_max: null,
      }];
    } else if (mode === 'corpus' && job_ids?.length > 0) {
      const limit = Math.min(max_jds || 20, 30);
      const { data } = await sb.from('ats_jobs')
        .select('greenhouse_id, title, content, company_name, location, salary_min, salary_max')
        .in('greenhouse_id', job_ids.slice(0, limit))
        .not('content', 'is', null);
      jds = data || [];
    } else if (mode === 'single' && job_ids?.length === 1) {
      const { data } = await sb.from('ats_jobs')
        .select('greenhouse_id, title, content, company_name, location, salary_min, salary_max')
        .eq('greenhouse_id', job_ids[0])
        .single();
      if (data) jds = [data];
    }

    if (jds.length === 0) {
      return new Response(JSON.stringify({ error: 'No JDs found with content' }), { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Build JD block (shared by both tiers)
    const jdBlock = jds.map((j: Record<string, unknown>, i: number) =>
      `<jd index="${i + 1}" title="${j.title}" company="${j.company_name || 'Unknown'}" location="${j.location || 'Unspecified'}" salary_min="${j.salary_min || ''}" salary_max="${j.salary_max || ''}">\n${stripHtml(j.content).slice(0, 3000)}\n</jd>`
    ).join('\n\n');

    let result: unknown;

    // ─── PREMIUM TIER ───
    if (tier === 'premium') {
      console.log(`[score-resume] PREMIUM pipeline user=${user.id} jds=${jds.length}`);

      result = await runPremiumPipeline(resume_text, jdBlock, filter_name, jds.length);

      // If premium failed, fall back to basic
      if (result.fallback) {
        console.log(`[score-resume] Premium fallback to basic: ${result.reason}`);
        // Fall through to basic below
        result = null;
      } else {
        // Add shared metadata
        result.jds_analyzed = jds.length;
        result.cost_cents = estimateCost('premium', resume_text.length, jdBlock.length);
        result.mode = mode;
        result.model = 'multi-agent';
      }
    }

    // ─── BASIC TIER (or premium fallback) ───
    if (!result) {
      const systemPrompt = mode === 'corpus' ? SYSTEM_PROMPT_CORPUS : SYSTEM_PROMPT_SINGLE;
      const userPrompt = `<resume_text>\n${resume_text.slice(0, 8000)}\n</resume_text>\n\n<filter_name>${filter_name || 'General'}</filter_name>\n\n<job_descriptions count="${jds.length}">\n${jdBlock}\n</job_descriptions>\n\n<instructions>\nScore the resume (0-100). Return ONLY a JSON object, no markdown fences, no preamble.\n</instructions>`;

      // BP-001: Circuit breaker wraps Anthropic call
      const breakerResult = await withAnthropicBreaker(sb, 'score-resume', () =>
        callAnthropic(HAIKU_MODEL, systemPrompt, userPrompt, 3000, 0)
      );

      if (breakerResult.circuitOpen) {
        return new Response(JSON.stringify({ error: 'AI service temporarily unavailable — please retry in a few minutes' }), { status: 503, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }

      const anthropicRes = breakerResult.result;
      if (!anthropicRes || !anthropicRes.ok) {
        return new Response(JSON.stringify({ error: 'AI scoring failed' }), { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }

      try {
        result = parseJSON(anthropicRes.text);
      } catch (_e) {
        console.error('[score-resume] Failed to parse AI response:', anthropicRes.text.slice(0, 200));
        return new Response(JSON.stringify({ error: 'Failed to parse AI response' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }

      result.tier = tier === 'premium' ? 'basic_fallback' : 'basic';
      result.model = HAIKU_MODEL;
      result.jds_analyzed = jds.length;
      result.cost_cents = estimateCost('basic', resume_text.length, jdBlock.length);
      result.mode = mode;
    }

    // Gate response for free users (basic tier only — premium already gated by credits)
    if (!isPro && result.tier === 'basic') {
      result = {
        match_score: result.match_score,
        fit_status: result.fit_status,
        analysis_summary: result.analysis_summary,
        jds_analyzed: result.jds_analyzed,
        mode: result.mode,
        tier: 'basic',
        upgrade_prompt: 'Upgrade to Pro for gap analysis, rewrite suggestions, and level-fit insights.'
      };
    }

    console.log(`[score-resume] user=${user.id} tier=${result.tier} mode=${mode} jds=${jds.length} score=${result.match_score || result.overall_score} pro=${isPro}`);

    // ─── Phase 5: Dual-write to resume_score_history ───
    try {
      // Determine score type and model
      const scoreType = (result.tier === 'premium' || result.tier === 'multi-agent') ? 'ai' : 'ai';
      const scoringModel = result.model || HAIKU_MODEL;
      const matchScore = result.match_score ?? result.overall_score ?? null;
      const fitStatus = result.fit_status ?? null;

      // Resolve resume_id from resume_archive if we can match by name
      let resumeId = body.resume_id || null;
      if (!resumeId && body.resume_name) {
        const { data: archiveMatch } = await sb
          .from('resume_archive')
          .select('resume_id')
          .eq('user_id', user.id)
          .eq('display_name', body.resume_name)
          .eq('is_active', true)
          .limit(1)
          .single();
        if (archiveMatch) resumeId = archiveMatch.resume_id;
      }

      // Determine level_fit from result
      const levelFit = result.level_fit?.best_level
        ? result.level_fit.best_level.toLowerCase().includes('entry') ? 'entry'
        : result.level_fit.best_level.toLowerCase().includes('mid') ? 'mid'
        : result.level_fit.best_level.toLowerCase().includes('senior') ? 'senior'
        : result.level_fit.best_level.toLowerCase().includes('lead') || result.level_fit.best_level.toLowerCase().includes('head') ? 'lead'
        : result.level_fit.best_level.toLowerCase().includes('executive') || result.level_fit.best_level.toLowerCase().includes('vp') || result.level_fit.best_level.toLowerCase().includes('director') ? 'executive'
        : null
        : null;

      if (matchScore !== null) {
        // Get first JD info for denormalization
        const firstJd = jds[0] || {};

        const { error: historyError } = await sb
          .from('resume_score_history')
          .insert({
            user_id: user.id,
            resume_id: resumeId,
            job_id: firstJd.greenhouse_id || null,
            job_title: firstJd.title || filter_name || null,
            company_name: firstJd.company_name || null,
            score_type: scoreType,
            match_score: matchScore,
            fit_status: fitStatus || 'Unknown',
            level_fit: levelFit,
            scoring_model: scoringModel,
            analysis_json: {
              tier: result.tier,
              mode: mode,
              jds_analyzed: jds.length,
              filter_name: filter_name || null,
              executive_summary: result.executive_summary || result.analysis_summary || null,
              dimension_scores: result.dimension_scores || null,
              gap_analysis: result.gap_analysis?.slice(0, 10) || null,
              recommendations: result.recommendations || result.coaching?.priority_actions || null,
              cost_cents: result.cost_cents || null,
              timing_ms: result.timing_ms || null
            }
          });

        if (historyError) {
          console.error('[score-resume] History write failed:', historyError.message);
        } else {
          console.log(`[score-resume] History written: score=${matchScore} resume=${resumeId || 'unlinked'}`);
        }
      }
    } catch (histErr) {
      // Non-blocking — don't fail the scoring response
      console.error('[score-resume] History dual-write error:', histErr);
    }

    // Log AI usage for cost tracking (fire-and-forget)
    logUsage(sb, user.id, result?.tier === 'premium' ? SONNET_MODEL : HAIKU_MODEL,
      result?._usage || { input_tokens: 0, output_tokens: 0 },
      Date.now() - _scoreStartMs
    ).catch(() => {});

    return new Response(JSON.stringify(result), {
      headers: { ...CORS_HEADERS, ...sampleHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[score-resume] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});
