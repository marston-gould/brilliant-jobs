// supabase/functions/generate-cover-letter/index.ts
// Edge Function: AI-powered cover letter generation via Anthropic API
// Uses Claude Haiku for cost efficiency (~$0.001 per letter)
// Consumes 1 AI credit per generation via entitlements system
// Rate limited: 20 AI calls per user per day (shared with score-resume)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { withAnthropicBreaker } from "../_shared/anthropic.ts";

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

const DAILY_LIMIT = 20;

// ─── Rate limiting (shared in-memory counter) ───
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

// ─── HTML stripping ───
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─── Truncate to approximate token count ───
function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4; // rough 4 chars per token
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n[truncated]';
}

// ─── Cover letter generation via Anthropic ───
async function generateCoverLetter(params: {
  resumeText: string;
  jobDescription: string;
  jobTitle: string;
  companyName: string;
  userName: string;
  tone?: string;
  emphasis?: string[];
}): Promise<{ letter: string; model: string; inputTokens: number; outputTokens: number }> {

  const { resumeText, jobDescription, jobTitle, companyName, userName, tone, emphasis } = params;

  const toneInstruction = tone === 'formal'
    ? 'Use a formal, professional tone throughout.'
    : tone === 'conversational'
      ? 'Use a warm, conversational tone while remaining professional.'
      : 'Use a confident, professional tone that balances warmth and competence.';

  const emphasisBlock = emphasis && emphasis.length > 0
    ? `\nPay special attention to highlighting: ${emphasis.join(', ')}.`
    : '';

  const systemPrompt = `You are a professional cover letter writer. Write concise, compelling cover letters that:
- Open with a specific hook showing genuine interest in the company/role
- Connect the candidate's experience directly to the job requirements
- Use concrete examples and metrics from the resume where possible
- Close with clear enthusiasm and a forward-looking statement
- Stay under 350 words (3-4 short paragraphs)
- Never use generic filler phrases like "I am writing to express my interest"
- Never fabricate experience not present in the resume
${toneInstruction}${emphasisBlock}

Output ONLY the cover letter text. No greeting line (Dear Hiring Manager), no sign-off (Sincerely, Name) — the user will add those.`;

  const userMessage = `CANDIDATE NAME: ${userName}

RESUME:
${truncateToTokens(stripHtml(resumeText), 2000)}

JOB TITLE: ${jobTitle}
COMPANY: ${companyName}

JOB DESCRIPTION:
${truncateToTokens(stripHtml(jobDescription), 2000)}

Write a cover letter for this candidate applying to this specific role.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const letter = data.content?.[0]?.text || '';
  const inputTokens = data.usage?.input_tokens || 0;
  const outputTokens = data.usage?.output_tokens || 0;

  return { letter, model: HAIKU_MODEL, inputTokens, outputTokens };
}

// ─── Main handler ───
serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SB_URL, SB_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Rate limit
    if (!checkDailyLimit(user.id)) {
      return new Response(JSON.stringify({
        error: 'Daily AI limit reached (20/day). Resets at midnight UTC.',
        limit: DAILY_LIMIT,
      }), {
        status: 429,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Parse body
    const body = await req.json();
    const { resumeText, jobDescription, jobTitle, companyName, tone, emphasis } = body;

    if (!resumeText || !jobDescription) {
      return new Response(JSON.stringify({ error: 'Missing resumeText or jobDescription' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Get user name from profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .single();

    const userName = profile
      ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
      : 'the candidate';

    // Generate (BP-001: circuit breaker)
    const startMs = Date.now();
    const _br = await withAnthropicBreaker(supabase, 'generate-cover-letter', () =>
      generateCoverLetter({
        resumeText,
        jobDescription,
        jobTitle: jobTitle || 'the role',
        companyName: companyName || 'the company',
        userName,
        tone,
        emphasis,
      })
    );
    if (_br.circuitOpen) {
      return new Response(JSON.stringify({ error: 'AI service temporarily unavailable — please retry in a few minutes' }), { status: 503, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    if (!_br.result) {
      return new Response(JSON.stringify({ error: 'Cover letter generation failed', detail: _br.error }), { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    const result = _br.result;
    const elapsedMs = Date.now() - startMs;

    // Log to cover_letter_generations table (non-blocking)
    supabase.from('cover_letter_generations').insert({
      user_id: user.id,
      job_title: jobTitle || null,
      company_name: companyName || null,
      model: result.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      elapsed_ms: elapsedMs,
      tone: tone || 'default',
    }).then(() => {}).catch(() => {});

    return new Response(JSON.stringify({
      letter: result.letter,
      model: result.model,
      tokens: { input: result.inputTokens, output: result.outputTokens },
      elapsedMs,
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    console.error('[generate-cover-letter] Error:', err.message);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
