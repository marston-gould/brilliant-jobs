// supabase/functions/resume-optimize/index.ts
// RESUME-BUILDER-001-S3: Keyword gap analysis
// Compares resume parsed_json against target job JD from ats_jobs.
// Returns match_score, keyword_gaps[], suggestions[].
//
// Input: { resume_id, target_job_id }
// Output: { match_score, keyword_gaps[], suggestions[], job_title, company_name, keywords_extracted }
//
// Credit cost: 1
// Keyword priority per ATS recruiter filter order (spec §3.5):
//   Skills (76.4%) > Education (59.7%) > Job Title (55.3%) >
//   Certs (50.6%) > Years Experience (44.3%) > Location (43.4%)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';
import { anthropicFetch } from '../_shared/anthropic.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const EXTRACT_SYSTEM = `You are a keyword extraction engine for ATS resume optimization. Extract keywords from a job description and return ONLY valid JSON. No preamble, no markdown.`;

function buildExtractPrompt(jd: string): string {
  return `Extract ATS keywords from this job description. Include BOTH acronym and long-form where applicable (e.g. "ERP" and "Enterprise Resource Planning").

Return ONLY this JSON structure:
{
  "title": string,
  "skills": string[],
  "tools": string[],
  "education": string[],
  "certifications": string[],
  "soft_skills": string[],
  "experience_years": string | null,
  "location": string | null
}

JOB DESCRIPTION:
${jd.slice(0, 8000)}`;
}

type KeywordStatus = 'present' | 'missing' | 'partial';
type KeywordCategory = 'skill' | 'tool' | 'education' | 'certification' | 'soft_skill' | 'experience' | 'location' | 'title';

interface KeywordGap {
  keyword: string;
  status: KeywordStatus;
  category: KeywordCategory;
  suggestion?: string;
}

interface ExtractedKeywords {
  title?: string;
  skills?: string[];
  tools?: string[];
  education?: string[];
  certifications?: string[];
  soft_skills?: string[];
  experience_years?: string | null;
  location?: string | null;
}

interface ResumeData {
  contact_info?: { name?: string; location?: string };
  summary?: string;
  work_experience?: Array<{ title?: string; company?: string; bullets?: string[] }>;
  education?: Array<{ institution?: string; degree?: string; field?: string }>;
  skills?: string[];
  certifications?: Array<{ name?: string }>;
}

function resumeFullText(r: ResumeData): string {
  const parts: string[] = [];
  if (r.summary) parts.push(r.summary);
  if (r.skills?.length) parts.push(r.skills.join(' '));
  for (const j of (r.work_experience || [])) {
    if (j.title) parts.push(j.title);
    for (const b of (j.bullets || [])) parts.push(b);
  }
  for (const e of (r.education || [])) {
    if (e.degree) parts.push(e.degree);
    if (e.field) parts.push(e.field);
  }
  for (const c of (r.certifications || [])) {
    if (c.name) parts.push(c.name);
  }
  return parts.join(' ').toLowerCase();
}

function checkKeyword(keyword: string, resumeText: string): KeywordStatus {
  const kw = keyword.toLowerCase().trim();
  if (!kw) return 'missing';
  if (resumeText.includes(kw)) return 'present';
  const words = kw.split(/\s+/);
  if (words.length > 1) {
    const acronym = words.map((w: string) => w[0]).join('');
    if (acronym.length >= 2 && resumeText.includes(acronym)) return 'partial';
    const sig = words.filter((w: string) => w.length > 3);
    if (sig.length > 0 && sig.some((w: string) => resumeText.includes(w))) return 'partial';
  }
  return 'missing';
}

function buildGaps(keywords: ExtractedKeywords, resume: ResumeData): KeywordGap[] {
  const resumeText = resumeFullText(resume);
  const gaps: KeywordGap[] = [];
  const seen = new Set<string>();

  const entries: Array<{ keys: string[]; category: KeywordCategory }> = [
    { keys: [...(keywords.skills || []), ...(keywords.tools || [])], category: 'skill' },
    { keys: keywords.education || [], category: 'education' },
    { keys: keywords.title ? [keywords.title] : [], category: 'title' },
    { keys: keywords.certifications || [], category: 'certification' },
    { keys: keywords.soft_skills || [], category: 'soft_skill' },
    { keys: keywords.experience_years ? [keywords.experience_years] : [], category: 'experience' },
    { keys: keywords.location ? [keywords.location] : [], category: 'location' },
  ];

  for (const { keys, category } of entries) {
    for (const kw of keys) {
      const k = kw.trim();
      if (!k || seen.has(k.toLowerCase())) continue;
      seen.add(k.toLowerCase());
      const status = checkKeyword(k, resumeText);
      let suggestion: string | undefined;
      if (status !== 'present') {
        if (category === 'skill') suggestion = `Add "${k}" to your Skills section`;
        else if (category === 'certification') suggestion = `Add "${k}" to your Certifications section`;
        else if (category === 'soft_skill') suggestion = `Include "${k}" in a work experience bullet`;
        else if (category === 'education') suggestion = `Ensure your Education section mentions "${k}"`;
        else if (category === 'title') suggestion = `Include "${k}" in your Professional Summary`;
      }
      gaps.push({ keyword: k, status, category, suggestion });
    }
  }
  return gaps;
}

function calcMatchScore(gaps: KeywordGap[]): number {
  if (gaps.length === 0) return 100;
  const weights: Record<KeywordCategory, number> = {
    skill: 3, tool: 3, education: 2, title: 2,
    certification: 1.5, soft_skill: 1, experience: 1, location: 0.5,
  };
  let total = 0, present = 0;
  for (const g of gaps) {
    const w = weights[g.category] ?? 1;
    total += w;
    if (g.status === 'present') present += w;
    else if (g.status === 'partial') present += w * 0.5;
  }
  return total === 0 ? 100 : Math.round((present / total) * 100);
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
    const { resume_id, target_job_id } = body;

    if (!resume_id || !target_job_id) {
      return new Response(JSON.stringify({ error: 'resume_id and target_job_id are required.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Credit check
    const { data: ent } = await sb.from('entitlements').select('credits_remaining').eq('user_id', userId).maybeSingle();
    if (!ent || (ent.credits_remaining ?? 0) < 1) {
      return new Response(JSON.stringify({
        error: 'Insufficient credits. This action costs 1 credit.',
        credits_required: 1,
        credits_remaining: ent?.credits_remaining ?? 0,
      }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch resume
    const { data: resume } = await sb.from('resumes').select('id, parsed_json').eq('id', resume_id).eq('user_id', userId).maybeSingle();
    if (!resume) {
      return new Response(JSON.stringify({ error: 'Resume not found.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch job
    const { data: job } = await sb.from('ats_jobs').select('greenhouse_id, title, company_name, description, location').eq('greenhouse_id', target_job_id).maybeSingle();
    if (!job) {
      return new Response(JSON.stringify({ error: 'Job not found.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const jdText = `${job.title || ''}\n${job.company_name || ''}\n${job.location || ''}\n\n${job.description || ''}`;
    if (jdText.trim().length < 50) {
      return new Response(JSON.stringify({ error: 'Job description is too short to analyze.' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract keywords
    const aiResult = await anthropicFetch(sb, {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: EXTRACT_SYSTEM,
      messages: [{ role: 'user', content: buildExtractPrompt(jdText) }],
      temperature: 0,
    }, { callerEf: 'resume-optimize', userId });

    if (!aiResult.ok) {
      console.error(JSON.stringify({ level: 'error', ef: 'resume-optimize', userId, error: aiResult.error }));
      return new Response(JSON.stringify({ error: 'Keyword extraction failed. Please try again.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawContent = (aiResult.data?.content as Array<{ type: string; text: string }>)?.[0]?.text ?? '';
    let keywords: ExtractedKeywords;
    try {
      keywords = JSON.parse(rawContent.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim());
    } catch {
      console.error(JSON.stringify({ level: 'error', ef: 'resume-optimize', userId, error: 'JSON parse failed', raw: rawContent.slice(0, 200) }));
      return new Response(JSON.stringify({ error: 'Failed to parse keyword extraction.' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resumeData = resume.parsed_json as ResumeData;
    const keyword_gaps = buildGaps(keywords, resumeData);
    const match_score = calcMatchScore(keyword_gaps);
    const suggestions = keyword_gaps.filter(g => g.status !== 'present' && g.suggestion).map(g => g.suggestion as string);

    // Deduct credit
    await sb.from('entitlements').update({ credits_remaining: ent.credits_remaining - 1 }).eq('user_id', userId);

    // Persist to resumes row
    await sb.from('resumes').update({
      target_job_id,
      match_score,
      keyword_gaps,
      updated_at: new Date().toISOString(),
    }).eq('id', resume_id).eq('user_id', userId);

    return new Response(JSON.stringify({
      match_score,
      keyword_gaps,
      suggestions,
      job_title: job.title,
      company_name: job.company_name,
      keywords_extracted: {
        skills_count: (keywords.skills?.length ?? 0) + (keywords.tools?.length ?? 0),
        total_count: keyword_gaps.length,
      },
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: 'error', ef: 'resume-optimize', userId, error: msg }));
    return new Response(JSON.stringify({ error: 'Unexpected error.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
