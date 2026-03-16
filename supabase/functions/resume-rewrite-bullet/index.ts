// supabase/functions/resume-rewrite-bullet/index.ts
// RESUME-BUILDER-001-S4: Rewrite a single work experience bullet
// SPEC-LPG-001-F1: Generate standalone bullet points from role + context
// SPEC-LPG-001-F2: Generate professional summary from profile data
//
// Actions:
//   rewrite: { resume_id, bullet, target_keywords[], job_context? } → { alternatives: string[] }
//   generate: { role_title, company?, context?, target_keywords[]? } → { bullets: string[] }
//   summary:  { resume_id?, target_job_id?, tone? } → { summaries: string[] }
//
// Credit cost: 1 per request (all actions)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';
import { anthropicFetch } from '../_shared/anthropic.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// --- System Prompts ---

const REWRITE_SYSTEM = `You are an expert resume writer specializing in ATS optimization.
Rewrite work experience bullets to naturally incorporate target keywords while:
- Preserving factual accuracy — never fabricate achievements or metrics
- Starting with a strong action verb
- Being concise (1-2 lines max)
- Sounding natural, not keyword-stuffed
- Maintaining first-person implied voice (no "I")
Return ONLY a JSON array of 2-3 rewritten strings. No preamble, no markdown fences.`;

const GENERATE_SYSTEM = `You are a senior resume writer specializing in ATS-optimized content.
Generate 3-5 resume bullet points for the given role.
Rules:
- Start each with a strong action verb (Led, Drove, Built, Scaled, Optimized, Launched, ...)
- Include quantified results where context allows
- 1-2 lines max per bullet
- Naturally incorporate target keywords without stuffing
- Never fabricate specific metrics the user didn't provide
- Vary sentence structure across bullets
Return ONLY a JSON array of strings. No preamble, no markdown fences.`;

const SUMMARY_SYSTEMS: Record<string, string> = {
  professional: `You are a resume summary expert. Write a professional summary for the top of a resume in 2-4 sentences.
Rules:
- Lead with years of experience and core expertise area
- Include 2-3 signature achievements or capabilities
- Incorporate target role keywords naturally
- Professional, authoritative tone
- Never use first person ("I")
- Avoid cliches: "passionate", "results-driven", "team player"
Return ONLY a JSON array of 2-3 summary strings. No preamble, no markdown fences.`,
  executive: `You are a resume summary expert. Write an executive-level summary for the top of a resume in 2-4 sentences.
Rules:
- Lead with scope of leadership and strategic impact
- Reference P&L ownership, team scale, or transformation results
- Use executive vocabulary: strategy, transformation, growth, portfolio
- Never use first person ("I")
- Avoid cliches: "visionary leader", "strategic thinker"
Return ONLY a JSON array of 2-3 summary strings. No preamble, no markdown fences.`,
  technical: `You are a resume summary expert. Write a technically-focused summary for the top of a resume in 2-4 sentences.
Rules:
- Lead with technical domain and years of specialization
- Reference specific technologies, architectures, or methodologies
- Include scale indicators (users, throughput, system complexity)
- Never use first person ("I")
- Avoid cliches: "passionate developer", "full-stack ninja"
Return ONLY a JSON array of 2-3 summary strings. No preamble, no markdown fences.`,
};

// --- Prompt Builders ---

function buildRewritePrompt(bullet: string, keywords: string[], jobContext: string): string {
  const kwList = keywords.slice(0, 10).join(', ');
  return `Rewrite this resume bullet to naturally incorporate as many of these keywords as possible without sounding forced.

ORIGINAL BULLET:
${bullet}

TARGET KEYWORDS: ${kwList}
${jobContext ? `\nJOB CONTEXT: ${jobContext}` : ''}

Return ONLY a JSON array of 2-3 rewritten alternatives. Example format:
["Rewrite 1 here", "Rewrite 2 here", "Rewrite 3 here"]`;
}

function buildGeneratePrompt(roleTitle: string, company: string, context: string, keywords: string[]): string {
  const kwSection = keywords.length > 0
    ? `\nTARGET KEYWORDS TO INCORPORATE: ${keywords.slice(0, 15).join(', ')}`
    : '';
  return `Generate 3-5 ATS-optimized resume bullet points for this role.

ROLE TITLE: ${roleTitle}
${company ? `COMPANY: ${company}` : ''}
${context ? `CONTEXT/ACHIEVEMENTS: ${context}` : ''}${kwSection}

Return ONLY a JSON array of 3-5 bullet point strings.`;
}

function buildSummaryPrompt(profileData: string, targetRole: string, tone: string): string {
  return `Generate 2-3 professional summary variants for the top of a resume.

${profileData}
${targetRole ? `\nTARGET ROLE: ${targetRole}` : ''}
TONE: ${tone}

Return ONLY a JSON array of 2-3 summary strings (each 2-4 sentences).`;
}

// --- Helpers ---

function parseJsonArray(raw: string, minLen: number, maxLen: number): string[] {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error('Not an array');
  const items = parsed
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .slice(0, maxLen);
  if (items.length < minLen) throw new Error(`Need at least ${minLen} items, got ${items.length}`);
  return items;
}

async function checkCredits(sb: ReturnType<typeof createClient>, userId: string): Promise<{ ok: boolean; remaining: number; response?: Response }> {
  const { data: ent } = await sb
    .from('entitlements')
    .select('credits_remaining')
    .eq('user_id', userId)
    .maybeSingle();
  if (!ent || (ent.credits_remaining ?? 0) < 1) {
    return {
      ok: false, remaining: ent?.credits_remaining ?? 0,
      response: new Response(JSON.stringify({
        error: 'Insufficient credits. This action costs 1 credit.',
        credits_required: 1, credits_remaining: ent?.credits_remaining ?? 0,
      }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }),
    };
  }
  return { ok: true, remaining: ent.credits_remaining };
}

async function deductCredit(sb: ReturnType<typeof createClient>, userId: string, remaining: number): Promise<void> {
  await sb.from('entitlements')
    .update({ credits_remaining: remaining - 1 })
    .eq('user_id', userId);
}

// --- Main Handler ---

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const sb = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } });

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userId = user.id;

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'rewrite';

    // --- ACTION: REWRITE (original) ---
    if (action === 'rewrite') {
      const { resume_id, bullet, target_keywords, job_context = '' } = body;
      if (!resume_id) return new Response(JSON.stringify({ error: 'resume_id is required.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (!bullet || typeof bullet !== 'string' || bullet.trim().length < 10) return new Response(JSON.stringify({ error: 'bullet must be at least 10 characters.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (!Array.isArray(target_keywords) || target_keywords.length === 0) return new Response(JSON.stringify({ error: 'target_keywords must be a non-empty array.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const { data: resume } = await sb.from('resumes').select('id').eq('id', resume_id).eq('user_id', userId).maybeSingle();
      if (!resume) return new Response(JSON.stringify({ error: 'Resume not found.' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const credits = await checkCredits(sb, userId);
      if (!credits.ok) return credits.response!;

      const aiResult = await anthropicFetch(sb, {
        model: 'claude-haiku-4-5-20251001', max_tokens: 512, system: REWRITE_SYSTEM,
        messages: [{ role: 'user', content: buildRewritePrompt(bullet.trim(), target_keywords, job_context) }],
        temperature: 0.7,
      }, { callerEf: 'resume-rewrite-bullet', userId });

      if (!aiResult.ok) {
        console.error(JSON.stringify({ level: 'error', ef: 'resume-rewrite-bullet', action: 'rewrite', userId, error: aiResult.error }));
        return new Response(JSON.stringify({ error: 'Rewrite failed. Please try again.' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const rawContent = (aiResult.data?.content as Array<{ type: string; text: string }>)?.[0]?.text ?? '';
      let alternatives: string[];
      try { alternatives = parseJsonArray(rawContent, 1, 3); } catch {
        console.error(JSON.stringify({ level: 'error', ef: 'resume-rewrite-bullet', action: 'rewrite', userId, error: 'Parse failed', raw: rawContent.slice(0, 200) }));
        return new Response(JSON.stringify({ error: 'Failed to parse rewrites. Please try again.' }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      await deductCredit(sb, userId, credits.remaining);
      return new Response(JSON.stringify({ alternatives }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- ACTION: GENERATE (F1 — AI Bullet Point Generator) ---
    if (action === 'generate') {
      const { role_title, company = '', context = '', target_keywords = [] } = body;
      if (!role_title || typeof role_title !== 'string' || role_title.trim().length < 2) {
        return new Response(JSON.stringify({ error: 'role_title is required (at least 2 characters).' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const credits = await checkCredits(sb, userId);
      if (!credits.ok) return credits.response!;

      const aiResult = await anthropicFetch(sb, {
        model: 'claude-haiku-4-5-20251001', max_tokens: 1024, system: GENERATE_SYSTEM,
        messages: [{ role: 'user', content: buildGeneratePrompt(role_title.trim(), company.trim(), context.trim(), target_keywords) }],
        temperature: 0.7,
      }, { callerEf: 'resume-rewrite-bullet', userId });

      if (!aiResult.ok) {
        console.error(JSON.stringify({ level: 'error', ef: 'resume-rewrite-bullet', action: 'generate', userId, error: aiResult.error }));
        return new Response(JSON.stringify({ error: 'Generation failed. Please try again.' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const rawContent = (aiResult.data?.content as Array<{ type: string; text: string }>)?.[0]?.text ?? '';
      let bullets: string[];
      try { bullets = parseJsonArray(rawContent, 3, 5); } catch {
        console.error(JSON.stringify({ level: 'error', ef: 'resume-rewrite-bullet', action: 'generate', userId, error: 'Parse failed', raw: rawContent.slice(0, 300) }));
        return new Response(JSON.stringify({ error: 'Failed to parse generated bullets. Please try again.' }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      await deductCredit(sb, userId, credits.remaining);
      return new Response(JSON.stringify({ bullets, role_title: role_title.trim(), has_target_keywords: target_keywords.length > 0 }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- ACTION: SUMMARY (F2 — AI Summary Generator) ---
    if (action === 'summary') {
      const { resume_id, target_job_id, tone = 'professional' } = body;
      if (!['professional', 'executive', 'technical'].includes(tone)) {
        return new Response(JSON.stringify({ error: 'tone must be professional, executive, or technical.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const credits = await checkCredits(sb, userId);
      if (!credits.ok) return credits.response!;

      // Build profile context from LinkedIn + resume
      const profileParts: string[] = [];

      const { data: linkedin } = await sb.from('linkedin_profiles').select('display_name, headline, skills_array, experience_json').eq('user_id', userId).maybeSingle();
      if (linkedin) {
        if (linkedin.headline) profileParts.push(`HEADLINE: ${linkedin.headline}`);
        if (linkedin.skills_array?.length) profileParts.push(`SKILLS: ${linkedin.skills_array.slice(0, 15).join(', ')}`);
        if (linkedin.experience_json?.length) {
          const recentExp = linkedin.experience_json.slice(0, 3).map((e: Record<string, unknown>) => `${e.title || ''} at ${e.company || ''} (${e.duration || ''})`).join('; ');
          profileParts.push(`RECENT EXPERIENCE: ${recentExp}`);
        }
      }

      if (resume_id) {
        const { data: archive } = await sb.from('resume_archive').select('extracted_text, parsed_json').eq('id', resume_id).eq('user_id', userId).maybeSingle();
        if (archive?.parsed_json) {
          const pj = archive.parsed_json;
          if (pj.work_experience?.length) {
            const recentWork = pj.work_experience.slice(0, 3).map((w: Record<string, unknown>) => `${w.title || ''} at ${w.company || ''}`).join('; ');
            profileParts.push(`RESUME WORK: ${recentWork}`);
          }
          if (pj.skills?.length) profileParts.push(`RESUME SKILLS: ${(pj.skills as string[]).slice(0, 15).join(', ')}`);
        } else if (archive?.extracted_text) {
          profileParts.push(`RESUME TEXT:\n${archive.extracted_text.slice(0, 2000)}`);
        }
      }

      if (profileParts.length === 0) {
        return new Response(JSON.stringify({ error: 'No profile data found. Upload a resume or LinkedIn profile first.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      let targetRole = '';
      if (target_job_id) {
        const { data: job } = await sb.from('ats_jobs').select('title, company_name').eq('id', target_job_id).maybeSingle();
        if (job) targetRole = `${job.title}${job.company_name ? ` at ${job.company_name}` : ''}`;
      }

      const systemPrompt = SUMMARY_SYSTEMS[tone] || SUMMARY_SYSTEMS.professional;
      const aiResult = await anthropicFetch(sb, {
        model: 'claude-haiku-4-5-20251001', max_tokens: 1024, system: systemPrompt,
        messages: [{ role: 'user', content: buildSummaryPrompt(profileParts.join('\n'), targetRole, tone) }],
        temperature: 0.7,
      }, { callerEf: 'resume-rewrite-bullet', userId });

      if (!aiResult.ok) {
        console.error(JSON.stringify({ level: 'error', ef: 'resume-rewrite-bullet', action: 'summary', userId, error: aiResult.error }));
        return new Response(JSON.stringify({ error: 'Summary generation failed. Please try again.' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const rawContent = (aiResult.data?.content as Array<{ type: string; text: string }>)?.[0]?.text ?? '';
      let summaries: string[];
      try { summaries = parseJsonArray(rawContent, 2, 3); } catch {
        console.error(JSON.stringify({ level: 'error', ef: 'resume-rewrite-bullet', action: 'summary', userId, error: 'Parse failed', raw: rawContent.slice(0, 300) }));
        return new Response(JSON.stringify({ error: 'Failed to parse summaries. Please try again.' }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      await deductCredit(sb, userId, credits.remaining);
      return new Response(JSON.stringify({ summaries, tone, has_linkedin: !!linkedin, has_target_job: !!target_job_id }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}. Valid: rewrite, generate, summary.` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: 'error', ef: 'resume-rewrite-bullet', userId, error: msg }));
    return new Response(JSON.stringify({ error: 'Unexpected error.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
