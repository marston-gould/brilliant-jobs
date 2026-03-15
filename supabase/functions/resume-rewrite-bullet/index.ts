// supabase/functions/resume-rewrite-bullet/index.ts
// RESUME-BUILDER-001-S4: Rewrite a single work experience bullet
// incorporating target keywords naturally via Anthropic Sonnet.
//
// Input: { resume_id, bullet, target_keywords[], job_context? }
// Output: { alternatives: string[] }  (2-3 rewrites)
// Credit cost: 1 per request

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';
import { anthropicFetch } from '../_shared/anthropic.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const REWRITE_SYSTEM = `You are an expert resume writer specializing in ATS optimization.
Rewrite work experience bullets to naturally incorporate target keywords while:
- Preserving factual accuracy — never fabricate achievements or metrics
- Starting with a strong action verb
- Being concise (1-2 lines max)
- Sounding natural, not keyword-stuffed
- Maintaining first-person implied voice (no "I")
Return ONLY a JSON array of 2-3 rewritten strings. No preamble, no markdown fences.`;

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
    const { resume_id, bullet, target_keywords, job_context = '' } = body;

    if (!resume_id) {
      return new Response(JSON.stringify({ error: 'resume_id is required.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!bullet || typeof bullet !== 'string' || bullet.trim().length < 10) {
      return new Response(JSON.stringify({ error: 'bullet must be at least 10 characters.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!Array.isArray(target_keywords) || target_keywords.length === 0) {
      return new Response(JSON.stringify({ error: 'target_keywords must be a non-empty array.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify resume belongs to user
    const { data: resume } = await sb
      .from('resumes')
      .select('id')
      .eq('id', resume_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!resume) {
      return new Response(JSON.stringify({ error: 'Resume not found.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Credit check
    const { data: ent } = await sb
      .from('entitlements')
      .select('credits_remaining')
      .eq('user_id', userId)
      .maybeSingle();

    if (!ent || (ent.credits_remaining ?? 0) < 1) {
      return new Response(JSON.stringify({
        error: 'Insufficient credits. This action costs 1 credit.',
        credits_required: 1,
        credits_remaining: ent?.credits_remaining ?? 0,
      }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Call Anthropic
    const aiResult = await anthropicFetch(sb, {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: REWRITE_SYSTEM,
      messages: [{ role: 'user', content: buildRewritePrompt(bullet.trim(), target_keywords, job_context) }],
      temperature: 0.7,
    }, { callerEf: 'resume-rewrite-bullet', userId });

    if (!aiResult.ok) {
      console.error(JSON.stringify({ level: 'error', ef: 'resume-rewrite-bullet', userId, error: aiResult.error }));
      return new Response(JSON.stringify({ error: 'Rewrite failed. Please try again.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawContent = (aiResult.data?.content as Array<{ type: string; text: string }>)?.[0]?.text ?? '';
    let alternatives: string[];
    try {
      const cleaned = rawContent.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) throw new Error('Not an array');
      alternatives = parsed
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .slice(0, 3);
      if (alternatives.length === 0) throw new Error('Empty array');
    } catch {
      console.error(JSON.stringify({ level: 'error', ef: 'resume-rewrite-bullet', userId, error: 'Parse failed', raw: rawContent.slice(0, 200) }));
      return new Response(JSON.stringify({ error: 'Failed to parse rewrites. Please try again.' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Deduct credit
    await sb.from('entitlements')
      .update({ credits_remaining: ent.credits_remaining - 1 })
      .eq('user_id', userId);

    return new Response(JSON.stringify({ alternatives }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: 'error', ef: 'resume-rewrite-bullet', userId, error: msg }));
    return new Response(JSON.stringify({ error: 'Unexpected error.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
