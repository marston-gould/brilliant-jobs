// supabase/functions/generate-filter/index.ts
// AI-powered filter generation from resume text
// Uses Claude Haiku to extract job search criteria from a resume

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DAILY_LIMIT = 20;
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

const SYSTEM_PROMPT = `You are a job search strategist for Brilliant Jobs, a platform that scans ATS systems (Greenhouse, Lever, Ashby, Workable, Recruitee) to find jobs. You analyze resumes to generate optimal search filter criteria.

Given a resume, extract structured search parameters. Think like an experienced recruiter reverse-engineering what jobs this person should target.

EXTRACTION RULES:

1. WHAT (job title keywords) — 3-6 terms
   - Extract the most likely job titles this person would search for
   - Use market-standard titles, not internal ones (e.g. "Product Manager" not "Innovation Lead")
   - Include current role title AND reasonable next-step titles
   - Include both specific and broader variants (e.g. "data engineer" AND "backend engineer")

2. WHERE (locations) — 1-4 locations
   - Extract from resume address, work history locations, or education locations
   - Format as "City, ST" (e.g. "New York, NY", "San Francisco, CA")
   - If resume shows multiple cities, include the most recent 2-3
   - If resume shows remote work history, note that separately

3. WHAT NOT (negative keywords) — 2-5 terms
   - Titles clearly below the person's level (e.g. "intern", "junior" for a senior person)
   - Roles in adjacent but wrong fields based on their trajectory
   - Common false-positive search terms for their field

4. WHO NOT (company exclusions) — 0-3 companies
   - Only suggest if resume shows they JUST LEFT a company (unlikely to return)
   - Their current/most recent employer is the primary candidate

5. SALARY (expected range) — min only
   - Estimate based on: seniority level, location, industry, years of experience
   - Be conservative — suggest a floor, not a target
   - Use annual USD figures

6. SENIORITY LEVEL — one of: intern, entry, mid, senior, lead, manager, director, vp, c-suite
   - Based on their most recent role and trajectory

7. REMOTE PREFERENCE — boolean
   - true if resume shows remote work history or locations suggest distributed work

8. FILTER NAME — short descriptive name
   - Based on their primary target role, e.g. "Senior Product Manager" or "Data Engineer"

Output ONLY a JSON object with these fields:
{
  "filter_name": "string",
  "what": ["title1", "title2", ...],
  "where": ["City, ST", ...],
  "what_not": ["term1", "term2", ...],
  "who_not": ["Company Name", ...],
  "salary_min": number or null,
  "level": "string",
  "include_remote": boolean,
  "reasoning": {
    "what": "why these titles",
    "where": "why these locations",
    "what_not": "why exclude these",
    "salary": "how estimated",
    "level": "how determined"
  }
}

No markdown, no code fences, no preamble. JSON only.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const sb = createClient(SB_URL, SB_KEY);
    const { data: { user }, error: authError } = await sb.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    if (!checkDailyLimit(user.id)) {
      return new Response(JSON.stringify({ error: 'Daily AI limit reached (20/day)' }),
        { status: 429, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const { resume_text } = body;

    if (!resume_text || typeof resume_text !== 'string' || resume_text.length < 100) {
      return new Response(JSON.stringify({ error: 'Resume text too short or missing' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `<resume>\n${resume_text.slice(0, 8000)}\n</resume>\n\nAnalyze this resume and generate optimal job search filter criteria. Return ONLY JSON.` }]
      })
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      console.error('[generate-filter] Anthropic error:', anthropicRes.status, errBody);
      return new Response(JSON.stringify({ error: 'AI generation failed' }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const data = await anthropicRes.json();
    const text = data.content?.[0]?.text || '';

    let result: unknown;
    try {
      result = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      console.error('[generate-filter] Parse failed:', text.slice(0, 200));
      return new Response(JSON.stringify({ error: 'Failed to parse AI response' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    console.log(`[generate-filter] user=${user.id} name="${result.filter_name}" what=${result.what?.length} where=${result.where?.length}`);

    return new Response(JSON.stringify(result), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[generate-filter] Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});
