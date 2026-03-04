// supabase/functions/match-score-overlay/index.ts
// Overlay Pipeline S6 — Match Score computation for toolbar badge
//
// POST /functions/v1/match-score-overlay
// Auth: Bearer JWT (user token)
// Body: { source_url: string }
//
// Flow:
//   1. Auth via sb.auth.getUser()
//   2. Check pipeline row for existing match_score → return immediately if present
//   3. Load user's active/default resume text from resume_texts
//   4. Attempt to find matching ats_jobs row via source_url → extract JD content
//   5. Call Claude Haiku to score 0-100 match
//   6. Store score in pipeline.match_score + pipeline.match_label
//   7. Return { score, label, source }
//
// Returns: { ok: true, score: number, label: string, source: 'cached'|'computed'|'unavailable' }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function scoreToLabel(score: number): string {
  if (score >= 75) return 'strong';
  if (score >= 50) return 'good';
  if (score >= 25) return 'fair';
  return 'low';
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '…';
}

async function scoreWithHaiku(resumeText: string, jdText: string): Promise<{ score: number; ok: boolean }> {
  const systemPrompt = `You are a resume-to-job-description match scorer. Given a resume and a job description, output ONLY a JSON object with one key: "score" (integer 0-100). No explanation, no markdown, no other keys. 0 = no match, 100 = perfect match. Be precise and realistic.`;

  const userPrompt = `RESUME:\n${truncate(resumeText, 3000)}\n\nJOB DESCRIPTION:\n${truncate(jdText, 2000)}\n\nRespond with JSON only: {"score": <0-100>}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 64,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      console.error('[match-score-overlay] Haiku error:', res.status, await res.text());
      return { score: 0, ok: false };
    }

    const data = await res.json();
    const text = (data.content?.[0]?.text || '').trim();
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score))));
    return { score, ok: true };
  } catch (e) {
    console.error('[match-score-overlay] Haiku exception:', e);
    return { score: 0, ok: false };
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // ── Auth ──────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const sbUser = createClient(SB_URL, SB_SERVICE_KEY);
  const { data: { user }, error: authErr } = await sbUser.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  // ── Parse body ────────────────────────────────────────────────
  let body: { source_url?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { source_url } = body;
  if (!source_url) return json({ error: 'source_url required' }, 400);

  const sb = createClient(SB_URL, SB_SERVICE_KEY);

  // ── Step 1: Check for cached score ───────────────────────────
  const { data: pipelineRow } = await sb
    .from('pipeline')
    .select('id, match_score, match_label')
    .eq('user_id', user.id)
    .eq('source_url', source_url)
    .maybeSingle();

  if (pipelineRow?.match_score !== null && pipelineRow?.match_score !== undefined) {
    return json({
      ok: true,
      score: pipelineRow.match_score,
      label: pipelineRow.match_label || scoreToLabel(pipelineRow.match_score),
      source: 'cached',
    });
  }

  // ── Step 2: Load user resume text ────────────────────────────
  // Try default resume first, then any resume with extracted_text
  const { data: defaultResume } = await sb
    .from('resumes')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_default', true)
    .is('deleted_at', null)
    .maybeSingle();

  let resumeText = '';
  if (defaultResume?.id) {
    const { data: rt } = await sb
      .from('resume_texts')
      .select('extracted_text')
      .eq('user_id', user.id)
      .eq('resume_id', defaultResume.id)
      .maybeSingle();
    resumeText = rt?.extracted_text || '';
  }

  if (!resumeText) {
    // Fallback: any resume text
    const { data: anyRt } = await sb
      .from('resume_texts')
      .select('extracted_text')
      .eq('user_id', user.id)
      .order('extracted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    resumeText = anyRt?.extracted_text || '';
  }

  if (!resumeText) {
    return json({ ok: true, score: null, label: null, source: 'unavailable', reason: 'no_resume' });
  }

  // ── Step 3: Load JD from ats_jobs (match by url) ─────────────
  let jdText = '';
  const { data: atsJob } = await sb
    .from('ats_jobs')
    .select('title, company_name, content, jd_skills, jd_requirements')
    .eq('url', source_url)
    .maybeSingle();

  if (atsJob) {
    const rawContent = stripHtml(atsJob.content || '');
    const skills = Array.isArray(atsJob.jd_skills) ? atsJob.jd_skills.join(', ') : '';
    const reqs = Array.isArray(atsJob.jd_requirements) ? atsJob.jd_requirements.join('\n') : '';
    jdText = [
      atsJob.title ? `Title: ${atsJob.title}` : '',
      atsJob.company_name ? `Company: ${atsJob.company_name}` : '',
      skills ? `Skills: ${skills}` : '',
      reqs ? `Requirements:\n${reqs}` : '',
      rawContent ? `Description:\n${rawContent}` : '',
    ].filter(Boolean).join('\n\n');
  }

  if (!jdText) {
    // No JD found in ats_jobs — return unavailable but don't error
    return json({ ok: true, score: null, label: null, source: 'unavailable', reason: 'no_jd' });
  }

  // ── Step 4: Score via Haiku ──────────────────────────────────
  const { score, ok: scored } = await scoreWithHaiku(resumeText, jdText);
  if (!scored) {
    return json({ ok: true, score: null, label: null, source: 'unavailable', reason: 'ai_error' });
  }

  const label = scoreToLabel(score);

  // ── Step 5: Persist to pipeline row (if exists) ──────────────
  if (pipelineRow?.id) {
    await sb
      .from('pipeline')
      .update({ match_score: score, match_label: label, updated_at: new Date().toISOString() })
      .eq('id', pipelineRow.id);
  }

  return json({ ok: true, score, label, source: 'computed' });
});
