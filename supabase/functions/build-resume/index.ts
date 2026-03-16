// supabase/functions/build-resume/index.ts
// AIS-F7: AI Resume Builder — generates a complete resume from scratch
// Uses Claude Sonnet for quality. Costs 5 credits.
// Spec §9.2: input wizard → resume generation EF → structured sections → score preview

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { withAnthropicBreaker } from '../_shared/anthropic.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SONNET = 'claude-sonnet-4-20250514';
const CREDITS = 5;

const CORS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization' }, 401);

    const sb = createClient(SB_URL, SB_KEY);
    const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Invalid token' }, 401);

    const body = await req.json();
    const {
      target_role, target_industry, years_experience,
      accomplishments, skills, education,
      template = 'clean', linkedin_profile_id,
    } = body;

    if (!target_role) return json({ error: 'target_role required' }, 400);

    // Deduct credits
    const { error: creditErr } = await sb.rpc('deduct_credits', {
      p_user_id: user.id, p_amount: CREDITS, p_feature: 'resume_builder',
    });
    if (creditErr) return json({ error: 'Insufficient credits (5 required)' }, 402);

    // Fetch LinkedIn profile if available
    let liContext = '';
    if (linkedin_profile_id) {
      const { data: li } = await sb.from('linkedin_profiles')
        .select('display_name, headline, experience_json, skills_array, education_json')
        .eq('id', linkedin_profile_id).maybeSingle();
      if (li) {
        liContext = `\n## LinkedIn Profile\n` +
          (li.headline ? `Headline: ${li.headline}\n` : '') +
          (li.skills_array ? `Skills: ${(li.skills_array as string[]).slice(0,20).join(', ')}\n` : '');
      }
    }

    const systemPrompt = `You are an expert resume writer specializing in ATS-optimized resumes.
Generate a complete, professional resume in structured JSON format.
Rules:
1. ATS-friendly: no tables, graphics, or columns — plain sections only
2. Quantify every achievement with metrics where possible
3. Use strong action verbs (Led, Built, Increased, Reduced, etc.)
4. Match keywords to the target role and industry
5. Summary: 2-3 sentences, tailored to the target role
6. Experience: 3-4 bullet points per role, STAR format
7. Skills: group by category (Technical, Leadership, etc.)
Respond ONLY with valid JSON: { summary, experience: [{title,company,dates,bullets:[]}], skills: [{category,items:[]}], education: [{degree,institution,year}] }`;

    const userPrompt = `Generate a complete resume for:
Target Role: ${target_role}
Industry: ${target_industry || 'Technology'}
Years of Experience: ${years_experience || '5+'}
${liContext}
Key Accomplishments: ${accomplishments || 'Not provided'}
Skills: ${Array.isArray(skills) ? skills.join(', ') : (skills || 'Not provided')}
Education: ${education || 'Not provided'}

Return structured JSON resume sections as specified.`;

    const _br = await withAnthropicBreaker(sb, 'build-resume', async () => {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: SONNET,
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      const d = await r.json();
      if (!r.ok) return { ok: false, text: '', error: d.error?.message };
      return { ok: true, text: d.content?.[0]?.text || '' };
    });

    if (_br.circuitOpen || !_br.result?.ok) {
      // Refund on failure
      await sb.rpc('add_credits', { p_user_id: user.id, p_amount: CREDITS, p_source: 'resume_builder_refund' });
      return json({ error: 'AI service unavailable' }, 503);
    }

    let sections: Record<string, unknown> = {};
    try {
      const cleaned = _br.result.text.replace(/```json|```/g, '').trim();
      sections = JSON.parse(cleaned);
    } catch {
      await sb.rpc('add_credits', { p_user_id: user.id, p_amount: CREDITS, p_source: 'resume_builder_refund' });
      return json({ error: 'Failed to parse AI response' }, 502);
    }

    // Build full text for scoring
    const expText = (sections.experience as Array<{title?:string;company?:string;bullets?:string[]}>|| [])
      .map(e => `${e.title} at ${e.company}\n${(e.bullets||[]).join('\n')}`).join('\n\n');
    const skillsText = (sections.skills as Array<{category?:string;items?:string[]}> || [])
      .map(s => `${s.category}: ${(s.items||[]).join(', ')}`).join('\n');
    const fullText = [sections.summary, expText, skillsText].filter(Boolean).join('\n\n');

    // Persist
    const source = linkedin_profile_id ? 'linkedin' : 'manual';
    const { data: saved, error: saveErr } = await sb.from('ai_generated_resumes').insert({
      user_id: user.id,
      title: `${target_role} Resume`,
      target_role,
      target_industry,
      template,
      sections_json: sections,
      full_text: fullText,
      credits_charged: CREDITS,
      source,
      status: 'complete',
    }).select('id').single();

    if (saveErr) console.warn('[build-resume] Save error:', saveErr.message);

    return json({
      success: true,
      resume_id: saved?.id,
      sections,
      full_text: fullText,
      credits_charged: CREDITS,
      source,
    });

  } catch (err) {
    console.error('[build-resume] Error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
