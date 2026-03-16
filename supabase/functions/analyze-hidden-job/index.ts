// supabase/functions/analyze-hidden-job/index.ts
// AI analysis of why a hidden job was a poor match
// Compares hidden job against user's resume to suggest negative filter pills

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { withAnthropicBreaker } from "../_shared/anthropic.ts";
import { passiveCap } from "../_shared/creditGate.ts";

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

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

const SYSTEM_PROMPT = `You are a job search filter optimizer for Brilliant Jobs. A user hid a job from their feed because it was a poor match. Your job is to analyze WHY it was a poor match compared to their resume, and suggest specific negative filter terms to prevent similar mismatches.

Given the hidden job details and the user's resume, determine what filter exclusions would have prevented this job from appearing.

Think about:
- WHAT NOT: Title keywords that attracted this wrong result (e.g. the job title contains "sales" but the person is in "marketing")
- WHERE NOT: Location mismatches (e.g. job is in a city they don't want)
- WHO NOT: Company to exclude (if it's a type of company that's systematically wrong)
- WHY it matched: What about their current filter caused this to appear?

Be SPECIFIC and ACTIONABLE. Only suggest exclusions that would genuinely help without over-filtering.

Output ONLY a JSON object:
{
  "mismatch_summary": "1-2 sentence explanation of why this was a poor match",
  "what_not": [{"term": "string", "reason": "why exclude this"}],
  "where_not": [{"term": "City, ST", "reason": "why exclude this"}],
  "who_not": [{"term": "Company Name", "reason": "why exclude this"}],
  "confidence": "high" | "medium" | "low"
}

Only include categories where you have genuine suggestions. Empty arrays are fine.
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

    // SPEC-COHORT-001-S2: Passive daily cap (DB-backed, replaces in-memory limit)
    const cap = await passiveCap(sb, user.id, 'analyze-hidden-job');
    if (!cap.allowed) {
      return new Response(JSON.stringify({ error: 'Daily cap reached', daily_cap: cap.dailyCap }),
        { status: 429, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    if (!checkDailyLimit(user.id)) {
      return new Response(JSON.stringify({ error: 'Daily AI limit reached (20/day)' }),
        { status: 429, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const { job_id, resume_text, filter_pills } = body;

    if (!job_id) {
      return new Response(JSON.stringify({ error: 'Missing job_id' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Fetch the hidden job's details
    const { data: job } = await sb.from('ats_jobs')
      .select('title, company_name, location, content, salary_min, salary_max, industry, department')
      .eq('greenhouse_id', job_id)
      .single();

    if (!job) {
      return new Response(JSON.stringify({ error: 'Job not found' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const jobContent = job.content ? stripHtml(job.content).slice(0, 3000) : 'No description available';

    const userPrompt = `<hidden_job>
Title: ${job.title || 'Unknown'}
Company: ${job.company_name || 'Unknown'}
Location: ${job.location || 'Unknown'}
Industry: ${job.industry || 'Unknown'}
Salary: ${job.salary_min ? '$' + job.salary_min + '-$' + job.salary_max : 'Not listed'}
Description: ${jobContent}
</hidden_job>

<current_filter_pills>
${filter_pills ? JSON.stringify(filter_pills) : 'No filter context available'}
</current_filter_pills>

<resume>
${resume_text ? resume_text.slice(0, 6000) : 'No resume provided — analyze based on job content and filter context only'}
</resume>

Analyze why this job was a poor match for this person and suggest specific negative filter terms. Return ONLY JSON.`;

        // BP-001: Circuit breaker
    const _br = await withAnthropicBreaker(sb, 'analyze-hidden-job', async () => {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });
      if (!r.ok) throw new Error(`Anthropic ${r.status}`);
      return r;
    });
    if (_br.circuitOpen) {
      return new Response(JSON.stringify({ error: 'AI service temporarily unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    if (!_br.result) {
      throw new Error(_br.error || 'Anthropic call failed');
    }
    const anthropicRes = _br.result;

    if (!anthropicRes.ok) {
      console.error('[analyze-hidden] Anthropic error:', anthropicRes.status);
      return new Response(JSON.stringify({ error: 'AI analysis failed' }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const data = await anthropicRes.json();
    const text = data.content?.[0]?.text || '';

    let result: unknown;
    try {
      result = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (e) { console.warn("[EF][analyze_hidden_job_json_parse]", e?.message || String(e));
      console.error('[analyze-hidden] Parse failed:', text.slice(0, 200));
      return new Response(JSON.stringify({ error: 'Failed to parse AI response' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    result.job_title = job.title;
    result.job_company = job.company_name;

    console.log(`[analyze-hidden] user=${user.id} job=${job_id} suggestions=${(result.what_not?.length||0)+(result.where_not?.length||0)+(result.who_not?.length||0)}`);

    return new Response(JSON.stringify(result), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[analyze-hidden] Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});
