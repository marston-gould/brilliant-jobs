// supabase/functions/score-resume/index.ts
// Edge Function: AI-powered resume scoring via Anthropic API
// Modes: 'corpus' (resume vs filter JDs) or 'single' (resume vs one JD)
// Pro users get full analysis; free users get score + summary only
// Rate limited: 20 AI calls per user per day

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

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
function estimateCost(resumeLen: number, jdLen: number): number {
  const inputTokens = Math.ceil((resumeLen + jdLen) / 4);
  const outputTokens = 800;
  // Haiku 4.5 pricing: $0.80/1M input, $4/1M output
  return Math.round((inputTokens * 0.80 / 1000000 + outputTokens * 4.0 / 1000000) * 10000) / 100;
}

// ─── System prompts ───
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

// ─── Main handler ───
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

    // Rate limit
    if (!checkDailyLimit(user.id)) {
      return new Response(JSON.stringify({ error: 'Daily AI scoring limit reached (20/day)' }), { status: 429, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Check entitlement (Pro vs Free)
    const { data: profile } = await sb.from('profiles').select('plan').eq('id', user.id).single();
    const isPro = profile?.plan === 'pro' || profile?.plan === 'enterprise';

    // Parse body
    const body = await req.json();
    const { resume_text, resume_keywords, mode, filter_name, job_ids, max_jds } = body;

    if (!resume_text || !mode) {
      return new Response(JSON.stringify({ error: 'Missing resume_text or mode' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    if (!['corpus', 'single'].includes(mode)) {
      return new Response(JSON.stringify({ error: 'Invalid mode. Use "corpus" or "single"' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Fetch JD content
    let jds: any[] = [];
    if (mode === 'corpus' && job_ids?.length > 0) {
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

    // Build prompt
    const systemPrompt = mode === 'corpus' ? SYSTEM_PROMPT_CORPUS : SYSTEM_PROMPT_SINGLE;

    const jdBlock = jds.map((j: any, i: number) =>
      `<jd index="${i + 1}" title="${j.title}" company="${j.company_name || 'Unknown'}" location="${j.location || 'Unspecified'}" salary_min="${j.salary_min || ''}" salary_max="${j.salary_max || ''}">\n${stripHtml(j.content).slice(0, 3000)}\n</jd>`
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
        max_tokens: 3000,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      console.error('[score-resume] Anthropic API error:', anthropicRes.status, errBody);
      return new Response(JSON.stringify({ error: 'AI scoring failed', status: anthropicRes.status }), { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const anthropicData = await anthropicRes.json();
    const responseText = anthropicData.content?.[0]?.text || '';

    // Parse JSON response
    let result: any;
    try {
      const cleaned = responseText.replace(/```json|```/g, '').trim();
      result = JSON.parse(cleaned);
    } catch (_e) {
      console.error('[score-resume] Failed to parse AI response:', responseText.slice(0, 200));
      return new Response(JSON.stringify({ error: 'Failed to parse AI response' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Add metadata
    result.model = 'claude-haiku-4-5-20251001';
    result.jds_analyzed = jds.length;
    result.cost_cents = estimateCost(resume_text.length, jdBlock.length);
    result.mode = mode;

    // Gate response for free users
    if (!isPro) {
      result = {
        match_score: result.match_score,
        fit_status: result.fit_status,
        analysis_summary: result.analysis_summary,
        jds_analyzed: result.jds_analyzed,
        mode: result.mode,
        upgrade_prompt: 'Upgrade to Pro for gap analysis, rewrite suggestions, and level-fit insights.'
      };
    }

    console.log(`[score-resume] user=${user.id} mode=${mode} jds=${jds.length} score=${result.match_score} pro=${isPro}`);

    return new Response(JSON.stringify(result), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[score-resume] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});
