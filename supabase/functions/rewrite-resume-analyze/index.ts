// supabase/functions/rewrite-resume-analyze/index.ts
// Edge Function: JD-specific gap analysis + question generation
// Part 1 of the "Boost Match" pipeline (analyze → [Q&A] → execute)
// Agents: Gap Analyzer (Haiku), Question Generator (Haiku)
// v1.0

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL  = Deno.env.get('SUPABASE_URL')!;
const SB_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const HAIKU = 'claude-haiku-4-5-20251001';

const CORS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// ─── Anthropic caller ───
async function callAnthropic(
  model: string, system: string, user: string,
  maxTokens = 2000, temperature = 0
): Promise<{ text: string; ok: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model, max_tokens: maxTokens, temperature,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[analyze] Anthropic ${model} error:`, res.status, err);
      return { text: '', ok: false, error: `API ${res.status}` };
    }
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    return { text, ok: true };
  } catch (e) {
    console.error('[analyze] Anthropic call failed:', e.message);
    return { text: '', ok: false, error: e.message };
  }
}

function parseJSON(text: string): unknown {
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

// ════════════════════════════════════════════════════════════
// AGENT 1: GAP ANALYZER
// ════════════════════════════════════════════════════════════

const GAP_ANALYZER_SYSTEM = `You are an expert resume-to-job-description gap analyst. You identify exactly what is missing or weak in a resume relative to a specific job description.

You receive:
1. The candidate's resume text
2. The target job description
3. The current match score (if available)

Your task: Compare the resume against every requirement, skill, and qualification in the JD. Classify each gap.

OUTPUT RULES:
- Return ONLY valid JSON. No markdown, no code fences, no commentary.
- Every gap must reference specific JD language.
- "rewritable" means the resume has evidence that can be re-emphasized or reworded.
- "needs_input" means the resume has NO evidence and the user must confirm if they have the experience.

JSON STRUCTURE:
{
  "matched_skills": [
    { "skill": "string", "jd_reference": "string", "resume_evidence": "string" }
  ],
  "rewritable_gaps": [
    { "skill": "string", "jd_reference": "string", "resume_evidence": "string", "suggestion": "string" }
  ],
  "needs_input": [
    { "skill": "string", "jd_reference": "string", "why_missing": "string", "question_hint": "string" }
  ],
  "weak_areas": [
    { "section": "string", "issue": "string", "suggestion": "string" }
  ],
  "summary": "string (2-3 sentence overview of the gap analysis)"
}

Keep needs_input to a maximum of 5 items — prioritize by importance to the role.
If the resume is already a strong match, needs_input can be empty.`;

// ════════════════════════════════════════════════════════════
// AGENT 2: QUESTION GENERATOR
// ════════════════════════════════════════════════════════════

const QUESTION_GENERATOR_SYSTEM = `You are a career coach helping a job applicant fill gaps in their resume. You generate clear, conversational questions based on a gap analysis.

You receive a list of skills/experiences the resume is missing relative to a target job description. For each gap, generate a question the user can answer to provide missing information.

RULES:
- Maximum 5 questions. Prioritize by impact on the role.
- Each question must include context: what the JD requires and what the resume currently says.
- Questions should be open-ended (free text), not yes/no.
- Use plain, encouraging language. Not "Do you possess expertise in..." but "Have you worked with..."
- Every question must have a skip option — the system will handle gaps that are skipped.
- If the gap_items list is empty, return an empty questions array.

OUTPUT JSON (no markdown, no fences):
{
  "questions": [
    {
      "id": "q1",
      "skill": "string (the JD requirement)",
      "jd_context": "string (what the JD says)",
      "resume_context": "string (what the resume currently shows)",
      "question": "string (the user-facing question)",
      "placeholder": "string (example answer text for the input field)"
    }
  ]
}`;

// ════════════════════════════════════════════════════════════
// HANDLER
// ════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const startTime = Date.now();

  try {
    // ─── Auth ───
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const sb = createClient(SB_URL, SB_KEY);
    const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    // ─── Parse request ───
    const body = await req.json();
    const { resume_id, job_id, original_score } = body;

    if (!resume_id || !job_id) {
      return json({ error: 'Missing required fields: resume_id, job_id' }, 400);
    }

    // ─── Init session (credit check + fetch context) ───
    const { data: initResult, error: initErr } = await sb.rpc('init_rewrite_session', {
      p_user_id: user.id,
      p_resume_id: resume_id,
      p_job_id: job_id,
      p_original_score: original_score || null,
    });

    if (initErr) {
      console.error('[analyze] init_rewrite_session error:', initErr.message);
      return json({ error: 'Session init failed', detail: initErr.message }, 500);
    }

    if (!initResult?.success) {
      const errCode = initResult?.error || 'unknown';
      const statusMap: Record<string, number> = {
        insufficient_credits: 402,
        resume_text_not_found: 404,
        job_not_found: 404,
        jd_too_brief: 422,
      };
      return json({
        error: errCode,
        balance: initResult?.balance,
        session_id: null,
      }, statusMap[errCode] || 400);
    }

    const { session_id, resume_text, jd_text, job_title, company } = initResult;

    console.log(`[analyze] Session ${session_id} for user=${user.id} job="${job_title}" at "${company}"`);

    // ─── Agent 1: Gap Analyzer ───
    const gapInput = `<resume>
${resume_text.slice(0, 6000)}
</resume>

<job_description>
${jd_text.slice(0, 4000)}
</job_description>

<job_title>${job_title || 'Unknown'}</job_title>
<company>${company || 'Unknown'}</company>
${original_score != null ? `<current_match_score>${original_score}%</current_match_score>` : ''}

Analyze the gaps between this resume and this specific job description. Return ONLY JSON.`;

    const gapResult = await callAnthropic(HAIKU, GAP_ANALYZER_SYSTEM, gapInput, 2500, 0);

    if (!gapResult.ok) {
      await sb.from('rewrite_sessions').update({ status: 'failed' }).eq('id', session_id);
      return json({ error: 'Gap analysis failed', detail: gapResult.error }, 502);
    }

    let gapAnalysis: unknown;
    try {
      gapAnalysis = parseJSON(gapResult.text);
    } catch (e) {
      console.error('[analyze] Gap JSON parse failed:', gapResult.text.slice(0, 300));
      await sb.from('rewrite_sessions').update({ status: 'failed' }).eq('id', session_id);
      return json({ error: 'Failed to parse gap analysis' }, 500);
    }

    const gapMs = Date.now() - startTime;
    console.log(`[analyze] Gap analysis complete in ${gapMs}ms — ${gapAnalysis.matched_skills?.length || 0} matched, ${gapAnalysis.needs_input?.length || 0} need input, ${gapAnalysis.rewritable_gaps?.length || 0} rewritable`);

    // ─── Agent 2: Question Generator (skip if no input needed) ───
    let questions: unknown[] = [];
    const needsInput = gapAnalysis.needs_input || [];

    if (needsInput.length > 0) {
      const qInput = `<gap_items>
${JSON.stringify(needsInput)}
</gap_items>

<job_title>${job_title || 'Unknown'}</job_title>
<company>${company || 'Unknown'}</company>

Generate up to 5 conversational questions for these gaps. Return ONLY JSON.`;

      const qResult = await callAnthropic(HAIKU, QUESTION_GENERATOR_SYSTEM, qInput, 1500, 0.1);

      if (qResult.ok) {
        try {
          const parsed = parseJSON(qResult.text);
          questions = parsed.questions || [];
        } catch (e) {
          console.error('[analyze] Question JSON parse failed:', qResult.text.slice(0, 300));
          // Non-fatal — proceed without questions
        }
      } else {
        console.error('[analyze] Question generation failed:', qResult.error);
        // Non-fatal — proceed without questions
      }
    }

    const totalMs = Date.now() - startTime;
    console.log(`[analyze] Questions generated: ${questions.length} in ${totalMs}ms total`);

    // ─── Persist gap analysis ───
    const nextStatus = questions.length > 0 ? 'questions' : 'ready_to_rewrite';

    await sb.from('rewrite_sessions').update({
      gap_analysis: gapAnalysis,
      status: nextStatus,
    }).eq('id', session_id);

    // ─── Response ───
    return json({
      success: true,
      session_id,
      status: nextStatus,
      job_title,
      company,
      gap_analysis: {
        matched_count: gapAnalysis.matched_skills?.length || 0,
        rewritable_count: gapAnalysis.rewritable_gaps?.length || 0,
        needs_input_count: needsInput.length,
        weak_areas_count: gapAnalysis.weak_areas?.length || 0,
        summary: gapAnalysis.summary || '',
        rewritable_gaps: gapAnalysis.rewritable_gaps || [],
        weak_areas: gapAnalysis.weak_areas || [],
      },
      questions,
      timing_ms: totalMs,
    });

  } catch (e) {
    console.error('[analyze] Unhandled error:', e);
    return json({ error: 'Internal error', detail: e.message }, 500);
  }
});
