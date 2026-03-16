// supabase/functions/optimize-linkedin-profile/index.ts
// SPEC-LPG-001-F3: LinkedIn Profile Optimizer
//
// Actions:
//   analyze:  { force?: boolean } → { overall_score, sections, top_3_actions, cached }
//   linkedin_summary: { tone?, target_roles? } → { summaries: string[] }  (F4 placeholder)
//
// Credit cost: 2 per fresh analysis (cached = free)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';
import { anthropicFetch } from '../_shared/anthropic.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const OPTIMIZER_SYSTEM = `You are a LinkedIn profile optimization expert who works with recruiters daily. Score and critique this LinkedIn profile.

For each section, score 0-100 and give 2-4 specific, actionable recommendations.

Score based on: completeness, keyword density, quantified achievements, recruiter-friendly formatting, and ATS visibility.

Headline: Does it include target role + key skill + value prop?
  Bad: "Marketing Professional"
  Good: "VP Growth Marketing | SEO & Paid | 10x Pipeline at Scale"

Summary: 3+ paragraphs? Keywords? Call to action?

Experience: Quantified bullets? Action verbs? Keyword-rich?

Skills: 20+ skills? Relevant to target roles? Endorsements mentioned?

Education: Complete? Relevant certifications listed?

Return ONLY valid JSON matching this structure (no preamble, no markdown fences):
{
  "overall_score": 72,
  "sections": {
    "headline": { "score": 45, "recommendations": ["Add your target role title", "Include 1-2 key skills"] },
    "summary": { "score": 60, "recommendations": ["Add a third paragraph with a call to action"] },
    "experience": { "score": 85, "recommendations": ["Quantify your second bullet point"] },
    "skills": { "score": 70, "recommendations": ["Add 10 more relevant skills"] },
    "education": { "score": 90, "recommendations": ["Add any certifications"] }
  },
  "top_3_actions": ["Rewrite headline to include target role", "Add 10 more skills", "Quantify 3 experience bullets"]
}`;

// Section weights for overall score
const SECTION_WEIGHTS: Record<string, number> = {
  headline: 0.20,
  summary: 0.25,
  experience: 0.30,
  skills: 0.15,
  education: 0.10,
};

function buildProfilePrompt(profile: Record<string, unknown>): string {
  const parts: string[] = [];

  if (profile.display_name) parts.push(`NAME: ${profile.display_name}`);
  if (profile.headline) parts.push(`HEADLINE: ${profile.headline}`);
  if (profile.summary) parts.push(`SUMMARY:\n${profile.summary}`);

  if (profile.experience_json && Array.isArray(profile.experience_json)) {
    const expLines = profile.experience_json.slice(0, 8).map((e: Record<string, unknown>) => {
      const bullets = Array.isArray(e.bullets) ? e.bullets.slice(0, 4).join('\n  - ') : '';
      return `${e.title || ''} at ${e.company || ''} (${e.duration || ''})\n  - ${bullets}`;
    });
    parts.push(`EXPERIENCE:\n${expLines.join('\n')}`);
  }

  if (profile.skills_array && Array.isArray(profile.skills_array)) {
    parts.push(`SKILLS (${profile.skills_array.length} total): ${profile.skills_array.slice(0, 30).join(', ')}`);
  }

  if (profile.education_json && Array.isArray(profile.education_json)) {
    const eduLines = profile.education_json.map((e: Record<string, unknown>) =>
      `${e.degree || ''} — ${e.school || ''} (${e.dates || ''})`
    );
    parts.push(`EDUCATION:\n${eduLines.join('\n')}`);
  }

  if (profile.certifications_json && Array.isArray(profile.certifications_json)) {
    parts.push(`CERTIFICATIONS: ${profile.certifications_json.map((c: Record<string, unknown>) => c.name || '').join(', ')}`);
  }

  if (profile.connections_count) parts.push(`CONNECTIONS: ${profile.connections_count}`);

  if (parts.length === 0) return 'EMPTY PROFILE — no data available.';
  return parts.join('\n\n');
}

function computeWeightedScore(sections: Record<string, { score: number }>): number {
  let total = 0;
  let weightSum = 0;
  for (const [key, weight] of Object.entries(SECTION_WEIGHTS)) {
    if (sections[key]?.score != null) {
      total += sections[key].score * weight;
      weightSum += weight;
    }
  }
  return weightSum > 0 ? Math.round(total / weightSum) : 0;
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
    const action = body.action || 'analyze';

    if (action === 'analyze') {
      const force = body.force === true;

      // Check cache (7-day TTL)
      if (!force) {
        const { data: cached } = await sb
          .from('linkedin_optimizations')
          .select('*')
          .eq('user_id', userId)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cached) {
          return new Response(JSON.stringify({
            overall_score: cached.overall_score,
            sections: cached.sections_json,
            top_3_actions: cached.top_actions,
            cached: true,
            expires_at: cached.expires_at,
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      // Load LinkedIn profile
      const { data: profile } = await sb
        .from('linkedin_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (!profile) {
        return new Response(JSON.stringify({ error: 'No LinkedIn profile found. Upload your LinkedIn PDF first.' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Credit check (2 credits for analysis)
      const { data: ent } = await sb
        .from('entitlements')
        .select('credits_remaining')
        .eq('user_id', userId)
        .maybeSingle();

      if (!ent || (ent.credits_remaining ?? 0) < 2) {
        return new Response(JSON.stringify({
          error: 'Insufficient credits. Analysis costs 2 credits.',
          credits_required: 2,
          credits_remaining: ent?.credits_remaining ?? 0,
        }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Call Anthropic
      const profileText = buildProfilePrompt(profile);
      const aiResult = await anthropicFetch(sb, {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: OPTIMIZER_SYSTEM,
        messages: [{ role: 'user', content: `Analyze this LinkedIn profile:\n\n${profileText}` }],
        temperature: 0.3,
      }, { callerEf: 'optimize-linkedin-profile', userId });

      if (!aiResult.ok) {
        console.error(JSON.stringify({ level: 'error', ef: 'optimize-linkedin-profile', userId, error: aiResult.error }));
        return new Response(JSON.stringify({ error: 'Analysis failed. Please try again.' }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const rawContent = (aiResult.data?.content as Array<{ type: string; text: string }>)?.[0]?.text ?? '';
      let result: { overall_score: number; sections: Record<string, { score: number; recommendations: string[] }>; top_3_actions: string[] };
      try {
        const cleaned = rawContent.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        result = JSON.parse(cleaned);
        if (!result.sections || !result.top_3_actions) throw new Error('Missing required fields');
      } catch {
        console.error(JSON.stringify({ level: 'error', ef: 'optimize-linkedin-profile', userId, error: 'Parse failed', raw: rawContent.slice(0, 300) }));
        return new Response(JSON.stringify({ error: 'Failed to parse analysis. Please try again.' }), {
          status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Recalculate weighted score (don't trust LLM math)
      const overallScore = computeWeightedScore(result.sections);

      // Score empty sections as 0
      for (const key of Object.keys(SECTION_WEIGHTS)) {
        if (!result.sections[key]) {
          result.sections[key] = { score: 0, recommendations: [`Add a ${key} section to your profile`] };
        }
      }

      // Deduct 2 credits
      await sb.from('entitlements')
        .update({ credits_remaining: ent.credits_remaining - 2 })
        .eq('user_id', userId);

      // Cache result
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await sb.from('linkedin_optimizations').insert({
        user_id: userId,
        linkedin_profile_id: profile.id,
        overall_score: overallScore,
        sections_json: result.sections,
        recommendations_json: result.sections, // same structure, kept for backwards compat
        top_actions: result.top_3_actions.slice(0, 3),
        expires_at: expiresAt,
      });

      return new Response(JSON.stringify({
        overall_score: overallScore,
        sections: result.sections,
        top_3_actions: result.top_3_actions.slice(0, 3),
        cached: false,
        expires_at: expiresAt,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- ACTION: LINKEDIN_SUMMARY (F4 — LinkedIn Summary Generator) ---
    if (action === 'linkedin_summary') {
      const { tone = 'professional', target_roles = [] } = body;
      if (!['professional', 'conversational', 'executive'].includes(tone)) {
        return new Response(JSON.stringify({ error: 'tone must be professional, conversational, or executive.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Load LinkedIn profile
      const { data: profile } = await sb
        .from('linkedin_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (!profile) {
        return new Response(JSON.stringify({ error: 'No LinkedIn profile found. Upload your LinkedIn PDF first.' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Also pull resume data for richer context
      const { data: resumes } = await sb
        .from('resume_archive')
        .select('extracted_text, parsed_json')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);

      // Credit check (1 credit)
      const { data: ent } = await sb
        .from('entitlements')
        .select('credits_remaining')
        .eq('user_id', userId)
        .maybeSingle();

      if (!ent || (ent.credits_remaining ?? 0) < 1) {
        return new Response(JSON.stringify({
          error: 'Insufficient credits. Generation costs 1 credit.',
          credits_required: 1, credits_remaining: ent?.credits_remaining ?? 0,
        }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Build context
      const contextParts: string[] = [];
      if (profile.display_name) contextParts.push(`NAME: ${profile.display_name}`);
      if (profile.headline) contextParts.push(`CURRENT HEADLINE: ${profile.headline}`);
      if (profile.experience_json?.length) {
        const exp = profile.experience_json.slice(0, 5).map((e: Record<string, unknown>) => {
          const bullets = Array.isArray(e.bullets) ? e.bullets.slice(0, 3).join('; ') : '';
          return `${e.title || ''} at ${e.company || ''} (${e.duration || ''})${bullets ? ': ' + bullets : ''}`;
        });
        contextParts.push(`EXPERIENCE:\n${exp.join('\n')}`);
      }
      if (profile.skills_array?.length) contextParts.push(`SKILLS: ${profile.skills_array.slice(0, 20).join(', ')}`);
      if (profile.education_json?.length) {
        contextParts.push(`EDUCATION: ${profile.education_json.map((e: Record<string, unknown>) => `${e.degree || ''} — ${e.school || ''}`).join('; ')}`);
      }

      // Resume enrichment
      if (resumes?.[0]?.parsed_json?.work_experience) {
        const resumeAchievements = resumes[0].parsed_json.work_experience.slice(0, 3)
          .flatMap((w: Record<string, unknown>) => Array.isArray(w.bullets) ? w.bullets.slice(0, 2) : [])
          .join('; ');
        if (resumeAchievements) contextParts.push(`KEY ACHIEVEMENTS FROM RESUME: ${resumeAchievements}`);
      }

      const targetRoleStr = target_roles.length > 0 ? target_roles.slice(0, 3).join(', ') : '';

      const LINKEDIN_SUMMARY_SYSTEM = `Write a LinkedIn About section (3-5 paragraphs, max 2600 chars).
Structure:
P1: Hook - what you do + your signature result
P2: Career narrative - trajectory + domain expertise
P3: What sets you apart - unique skills/approach
P4: What you're looking for (if job searching)
P5: CTA - how to reach you

Rules:
- First person voice ("I")
- ${tone === 'conversational' ? 'Warm, approachable, conversational tone' : tone === 'executive' ? 'Authoritative, strategic, executive tone' : 'Professional but personable tone'}
- Include 8-12 target keywords naturally
- Lead with outcomes, not responsibilities
- Avoid: "passionate", "guru", "ninja", "rockstar"
- MUST be under 2600 characters

Return ONLY a JSON array of 2 summary strings. No preamble, no markdown fences.`;

      const userPrompt = `Generate 2 LinkedIn About section variants.

${contextParts.join('\n\n')}
${targetRoleStr ? `\nTARGET ROLES: ${targetRoleStr}` : ''}
TONE: ${tone}

Return ONLY a JSON array of 2 strings (each 3-5 paragraphs, max 2600 chars).`;

      const aiResult = await anthropicFetch(sb, {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: LINKEDIN_SUMMARY_SYSTEM,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.7,
      }, { callerEf: 'optimize-linkedin-profile', userId });

      if (!aiResult.ok) {
        console.error(JSON.stringify({ level: 'error', ef: 'optimize-linkedin-profile', action: 'linkedin_summary', userId, error: aiResult.error }));
        return new Response(JSON.stringify({ error: 'Summary generation failed. Please try again.' }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const rawContent = (aiResult.data?.content as Array<{ type: string; text: string }>)?.[0]?.text ?? '';
      let summaries: string[];
      try {
        const cleaned = rawContent.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        const parsed = JSON.parse(cleaned);
        if (!Array.isArray(parsed)) throw new Error('Not an array');
        summaries = parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 2);
        if (summaries.length < 2) throw new Error('Need 2 variants');
      } catch {
        console.error(JSON.stringify({ level: 'error', ef: 'optimize-linkedin-profile', action: 'linkedin_summary', userId, error: 'Parse failed', raw: rawContent.slice(0, 300) }));
        return new Response(JSON.stringify({ error: 'Failed to parse summaries. Please try again.' }), {
          status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Deduct 1 credit
      await sb.from('entitlements')
        .update({ credits_remaining: ent.credits_remaining - 1 })
        .eq('user_id', userId);

      return new Response(JSON.stringify({
        summaries,
        tone,
        char_counts: summaries.map(s => s.length),
        has_target_roles: target_roles.length > 0,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}. Valid: analyze, linkedin_summary.` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: 'error', ef: 'optimize-linkedin-profile', userId, error: msg }));
    return new Response(JSON.stringify({ error: 'Unexpected error.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
