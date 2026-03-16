// supabase/functions/rewrite-resume-extension/index.ts
// Edge Function: Lightweight AI resume rewrite for extension quick-rewrite flow (EXT-AS-5)
// Accepts raw resume_text + JD text directly (no session, no job_id required).
// Uses Haiku for fast gap-targeted rewrite. Returns rewritten text + change summary.
// v1.0

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { withAnthropicBreaker } from "../_shared/anthropic.ts";
import { creditGate, creditRefund } from '../_shared/creditGate.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const HAIKU = 'claude-haiku-4-5-20251001';
const SONNET = 'claude-sonnet-4-5-20250929';

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
  maxTokens = 3000, temperature = 0.2
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
      console.error(`[ext-rewrite] Anthropic ${model} error:`, res.status, err);
      return { text: '', ok: false, error: `API ${res.status}` };
    }
    const data = await res.json();
    return { text: data.content?.[0]?.text || '', ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ext-rewrite] Anthropic call failed:', msg);
    return { text: '', ok: false, error: msg };
  }
}

function parseJSON(text: string): unknown {
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

// ════════════════════════════════════════════════════════════
// SYSTEM PROMPTS
// ════════════════════════════════════════════════════════════

const REWRITE_SYSTEM = `You are an expert resume rewriter specializing in quick, targeted improvements. You receive a resume and a job description, along with identified gaps. Your task is to rewrite the resume to better match the job requirements.

RULES:
1. ONLY modify content that addresses the identified gaps. Keep everything else as-is.
2. NEVER invent achievements, metrics, or experiences the candidate doesn't have.
3. Reframe existing experience to better align with JD requirements.
4. Add relevant keywords from the JD where they honestly apply.
5. Improve bullet points to emphasize transferable skills matching gaps.
6. Keep the same length — don't add sections the original doesn't have.
7. Use plain, strong verbs. Avoid: "leveraged", "spearheaded", "synergized", "cutting-edge".
8. PAGE CONSTRAINT: The rewritten resume MUST fit within the specified page limit. If the limit is 1 page, aggressively trim low-relevance content to stay under ~500 words / ~3000 characters. If 2 pages, stay under ~1000 words / ~6000 characters. Prioritize the most relevant experience for the target role.
9. ACRONYM RULE: For every technical term, tool, methodology, or certification that has a common acronym, include BOTH the full term and the acronym on first use (e.g. "Search Engine Optimization (SEO)", "Application Programming Interface (API)", "Continuous Integration/Continuous Deployment (CI/CD)", "Key Performance Indicators (KPIs)"). After first use, the acronym alone is acceptable. If the JD uses only the acronym, still expand it once. If the JD uses only the full form, still include the acronym once. Skip universally known abbreviations (AI, IT, HR, CEO, CTO, CFO, VP, MBA, PhD).
10. SECTION HEADERS: Replace any non-standard or creative section headers with ATS-standard equivalents. Use exactly: "Contact Information", "Professional Summary", "Work Experience", "Skills", "Education", "Certifications", "Projects", "Awards". Map variants like "Where I've Worked" → "Work Experience", "My Toolbox" → "Skills", "The Journey" → "Education", "About Me" → "Professional Summary", "Career History" → "Work Experience", "Core Competencies" → "Skills".

OUTPUT FORMAT: Return ONLY valid JSON with these fields:
{
  "rewritten_text": "The full rewritten resume text",
  "changes": [
    { "section": "Experience - Company Name", "original": "old bullet", "revised": "new bullet", "reason": "Why this change" }
  ],
  "skills_added": ["skill1", "skill2"],
  "keywords_integrated": ["keyword1", "keyword2"],
  "acronym_pairs_added": ["Search Engine Optimization (SEO)", "CI/CD"],
  "headers_standardized": ["Where I Worked → Work Experience"],
  "estimated_score_improvement": 8
}

Do NOT include markdown fences or commentary outside the JSON.`;


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
    // SPEC-COHORT-001-S2: Credit gate
    const credit_rewrite_resume_extension = await creditGate(sb, user.id, 'rewrite-resume-extension');
    if (!credit_rewrite_resume_extension.allowed) return credit_rewrite_resume_extension.response!;

    // ─── Parse request ───
    const body = await req.json();
    const {
      resume_text,
      job_description_text,
      job_title,
      company_name,
      gaps,
      current_score,
      preferences,
      page_limit,
    } = body;

    // B5: page_limit — 1 (default) or 2
    const effectivePageLimit = (page_limit === 2) ? 2 : 1;

    if (!resume_text || !job_description_text) {
      return json({ error: 'Missing required fields: resume_text, job_description_text' }, 400);
    }

    // ─── Credit check (1 credit for quick rewrite) ───
    const { data: profile } = await sb
      .from('profiles')
      .select('plan, credit_balance, role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin';
    const userPlan = profile?.plan || 'free';

    if (!isAdmin && userPlan === 'free') {
      return json({ error: 'Quick Resume Rewrite requires Starter or Pro plan', code: 'PLAN_REQUIRED' }, 403);
    }

    if (!isAdmin) {
      const { data: debitResult, error: debitErr } = await sb.rpc('debit_credits', {
        p_user_id: user.id,
        p_amount: 1,
        p_action: 'extension_quick_rewrite',
        p_reference_id: `ext-rewrite-${Date.now()}`,
      });
      if (debitErr || !debitResult?.success) {
        return json({
          error: 'Insufficient credits (1 credit required)',
          code: 'INSUFFICIENT_CREDITS',
          credits_required: 1,
          credits_available: profile?.credit_balance || 0,
        }, 402);
      }
    }

    console.log(`[ext-rewrite] Starting for user=${user.id} job="${job_title}" at "${company_name}"`);

    // ─── Build rewrite prompt ───
    const gapText = Array.isArray(gaps) && gaps.length > 0
      ? gaps.map((g: unknown) => {
          if (typeof g === 'string') return g;
          const gObj = g as Record<string, unknown>;
          return gObj.gap || gObj.skill || gObj.area || gObj.description || JSON.stringify(g);
        }).join('\n- ')
      : 'No specific gaps identified — optimize for overall JD match.';

    const prefText = preferences
      ? `User preferences: ${JSON.stringify(preferences)}`
      : '';

    const rewriteInput = `<resume>
${(resume_text as string).slice(0, 6000)}
</resume>

<job_description>
${(job_description_text as string).slice(0, 4000)}
</job_description>

<job_context>
Title: ${job_title || 'Unknown'}
Company: ${company_name || 'Unknown'}
Current Match Score: ${current_score || 'N/A'}/100
</job_context>

<identified_gaps>
- ${gapText}
</identified_gaps>

${prefText}

<page_constraint>
Page limit: ${effectivePageLimit} page(s). The rewritten resume MUST NOT exceed this length.
</page_constraint>

Rewrite the resume to address the identified gaps while keeping the candidate's authentic voice. Return ONLY the JSON object.`;

    // ─── Call AI ───
    // BP-001: Circuit breaker
    const _br = await withAnthropicBreaker(sb, 'rewrite-resume-extension', async () => {
      const r = await callAnthropic(SONNET, REWRITE_SYSTEM, rewriteInput, 4000, 0.25);
      if (!r.ok) throw new Error(r.error || 'AI call failed');
      return r;
    });
    if (_br.circuitOpen) {
      return new Response(JSON.stringify({ error: 'AI service temporarily unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    const result = _br.result || { ok: false, text: '', error: _br.error };

    if (!result.ok) {
      return json({ error: 'Rewrite failed', detail: result.error }, 502);
    }

    // ─── Parse result ───
    let parsed: Record<string, unknown>;
    try {
      parsed = parseJSON(result.text) as Record<string, unknown>;
    } catch (parseErr: unknown) {
      console.error('[ext-rewrite] JSON parse failed:', (parseErr as Error).message);
      // Try to extract rewritten text from raw response
      parsed = {
        rewritten_text: result.text,
        changes: [],
        skills_added: [],
        keywords_integrated: [],
        acronym_pairs_added: [],
        headers_standardized: [],
        estimated_score_improvement: 5,
      };
    }

    const durationMs = Date.now() - startTime;
    console.log(`[ext-rewrite] Complete in ${durationMs}ms for user=${user.id}`);

    // ─── Log to agent_action_log if table exists ───
    try {
      await sb.from('agent_action_log').insert({
        agent_id: 'extension-rewrite',
        action_type: 'quick_rewrite',
        payload: {
          user_id: user.id,
          job_title,
          company_name,
          current_score,
          gap_count: Array.isArray(gaps) ? gaps.length : 0,
          changes_count: Array.isArray(parsed.changes) ? (parsed.changes as unknown[]).length : 0,
          estimated_improvement: parsed.estimated_score_improvement,
          duration_ms: durationMs,
        },
      });
    } catch (_logErr: unknown) {
      // Non-fatal — don't fail the rewrite if logging fails
    }

    return json({
      rewritten_text: parsed.rewritten_text || '',
      changes: parsed.changes || [],
      skills_added: parsed.skills_added || [],
      keywords_integrated: parsed.keywords_integrated || [],
      acronym_pairs_added: parsed.acronym_pairs_added || [],
      headers_standardized: parsed.headers_standardized || [],
      estimated_score_improvement: parsed.estimated_score_improvement || 0,
      original_score: current_score || null,
      estimated_new_score: current_score
        ? Math.min(100, (current_score as number) + ((parsed.estimated_score_improvement as number) || 5))
        : null,
      duration_ms: durationMs,
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ext-rewrite] Unhandled error:', msg);
    return json({ error: 'Internal error', detail: msg }, 500);
  }
});
