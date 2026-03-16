// supabase/functions/extract-resume-profile/index.ts
// Edge Function: Extract structured profile from resume text via Claude Haiku
// Returns JSON with titles, locations, seniority, skills, industries
// Used by Resume-First Onboarding (Q17-Q19)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { withAnthropicBreaker } from "../_shared/anthropic.ts";
import { creditGate, creditRefund } from '../_shared/creditGate.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    // Auth
    const authHeader = req.headers.get('Authorization') || '';
    const sb = createClient(SB_URL, SB_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await createClient(SB_URL, 
      Deno.env.get('SUPABASE_ANON_KEY')!
    ).auth.getUser(token);
    if (authErr || !user) return new Response
    // SPEC-COHORT-001-S2: Credit gate
    const credit_extract_resume_profile = await creditGate(sb, user.id, 'extract-resume-profile');
    if (!credit_extract_resume_profile.allowed) return credit_extract_resume_profile.response!;(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS_HEADERS });

    const { resume_text } = await req.json();
    if (!resume_text || resume_text.length < 50) {
      return new Response(JSON.stringify({ error: 'Resume text too short' }), { status: 400, headers: CORS_HEADERS });
    }

    // Call Claude Haiku
    const prompt = `Analyze this resume and extract a structured profile. Return ONLY valid JSON with no markdown or explanation.

{
  "titles": ["list of 3-5 job titles this person is qualified for, starting with most recent/primary"],
  "locations": ["city, state pairs where they've worked or are based"],
  "seniority": "one of: intern, entry, mid, senior, lead, director, vp, c-suite",
  "skills": ["top 10-15 technical and professional skills"],
  "industries": ["2-4 industries they have experience in"],
  "years_experience": number,
  "education_level": "one of: high_school, associate, bachelor, master, phd, other",
  "remote_preference": "one of: remote, hybrid, onsite, unknown",
  "salary_estimate_min": number or null,
  "salary_estimate_max": number or null
}

Resume:
${resume_text.slice(0, 8000)}`;

    // BP-001: Circuit breaker
    const _br = await withAnthropicBreaker(sb, 'extract-resume-profile', async () => {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: HAIKU_MODEL,
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!r.ok) throw new Error(`Anthropic ${r.status}`);
      return r;
    });
    if (_br.circuitOpen) {
      return new Response(JSON.stringify({ error: 'AI service temporarily unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    if (!_br.result) {
      return new Response(JSON.stringify({ error: 'AI extraction failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
    const aiResp = _br.result;

    const aiData = await aiResp.json();
    const text = aiData.content?.[0]?.text || '';

    // Parse JSON from response
    let profile;
    try {
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      profile = JSON.parse(cleaned);
    } catch (e) { console.warn("[EF][resume_profile_json_parse]", e?.message || String(e));
      return new Response(JSON.stringify({ error: 'Failed to parse AI response', raw: text }), { status: 500, headers: CORS_HEADERS });
    }

    // Store in profiles.user_data.resume_profile
    await sb.from('profiles').update({
      user_data: sb.rpc ? undefined : undefined, // We'll use raw SQL to merge
    }).eq('id', user.id);

    // Use raw update to merge into user_data JSONB
    const { error: updateErr } = await sb.rpc('update_user_data_field', {
      p_user_id: user.id,
      p_key: 'resume_profile',
      p_value: profile,
    });

    // If the RPC doesn't exist yet, just return the profile without storing
    if (updateErr) {
      console.warn('[extract-resume-profile] Could not store profile:', updateErr.message);
    }

    return new Response(JSON.stringify({ profile }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('[extract-resume-profile]', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS_HEADERS });
  }
});
