// FB-INTPREP-001-S3: AI Interview Simulation — Edge Function
// Spec: FB-INTPREP-001_InterviewPrep.docx §4, §6.1, §10 Phase 3
//
// Handles multi-turn mock interview conversation. Stateless — accepts full
// message history on each request. Generates scorecard on final turn.
//
// Auth: Bearer token (user JWT)
// Model: claude-sonnet-4-20250514 (higher quality for realistic conversation)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withAnthropicBreaker } from '../_shared/anthropic.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 2048;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ════════════════════════════════════════════════════════════════
// System prompt template — XML-tagged context blocks per spec §4.3
// ════════════════════════════════════════════════════════════════

function buildSystemPrompt(
  config: SimulationConfig
): string {
  const feedbackInstruction = config.feedback_mode
    ? `After each candidate answer, provide a brief coaching note in [COACH] tags. Example: [COACH] Strong — you quantified the impact with metrics. Consider also mentioning the timeline. [/COACH]`
    : `Do NOT provide coaching feedback after answers. Conduct the interview realistically without commentary.`;

  return `You are an experienced interviewer conducting a mock interview. You are interviewing a candidate for the role described below.

<job_description>
${config.job_description || 'General interview practice — no specific job description provided.'}
</job_description>

<resume_text>
${config.resume_text || 'No resume provided.'}
</resume_text>

<match_analysis>
${config.match_analysis || 'No match analysis available.'}
</match_analysis>

<company_context>
${config.company_name ? `Company: ${config.company_name}` : 'Company not specified.'}
${config.company_industry ? `Industry: ${config.company_industry}` : ''}
</company_context>

<interview_config>
- Ask exactly ${config.question_count} questions total
- Mix behavioral and technical questions based on the job requirements
- If match_analysis identifies gaps, probe those areas
- Ask follow-up questions when the candidate's answer is vague or incomplete
- ${feedbackInstruction}
- When you have asked all ${config.question_count} questions and received answers, end the interview by saying "Thank you for your time" and then produce the scorecard
</interview_config>

SCORECARD INSTRUCTIONS:
When the interview is complete (all ${config.question_count} questions asked and answered), respond with ONLY a JSON object (no markdown fences) in this exact format:
{
  "is_complete": true,
  "reply": "Thank you for your time. Let me put together your scorecard.",
  "scorecard": {
    "overall_score": <0-100>,
    "per_question_scores": [{"question": "...", "answer_summary": "...", "score": <0-100>, "feedback": "..."}],
    "strengths": ["...", "..."],
    "improvements": ["...", "..."],
    "talking_points": ["...", "..."],
    "gap_coverage": "How well the candidate addressed identified gaps"
  }
}

CONVERSATION INSTRUCTIONS:
For each turn BEFORE the interview is complete, respond with ONLY a JSON object:
{
  "is_complete": false,
  "reply": "Your interviewer message here",
  "question_number": <current question number>
}

Always respond with valid JSON. No markdown, no backticks, no preamble.`;
}

// ════════════════════════════════════════════════════════════════
// Main handler
// ════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // Auth: user JWT required
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return jsonResponse({ error: 'Authorization required' }, 401);
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) {
      return jsonResponse({ error: 'Invalid token' }, 401);
    }

    if (!ANTHROPIC_API_KEY) {
      return jsonResponse({ error: 'ANTHROPIC_API_KEY not configured' }, 503);
    }

    const body = await req.json() as SimulationRequest;
    const action = body.action || 'message';

    switch (action) {
      case 'start':
        return await handleStart(sb, user.id, body);
      case 'message':
        return await handleMessage(sb, user.id, body);
      case 'abandon':
        return await handleAbandon(sb, user.id, body);
      case 'history':
        return await handleHistory(sb, user.id, body);
      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error('[interview-simulate] Fatal:', err);
    return jsonResponse({ error: 'Internal error', detail: String(err) }, 500);
  }
});

// ════════════════════════════════════════════════════════════════
// Action: start — Create a new session and get first interviewer message
// ════════════════════════════════════════════════════════════════

async function handleStart(
  sb: ReturnType<typeof createClient>,
  userId: string,
  body: SimulationRequest
) {
  const config = await assembleConfig(sb, userId, body);

  // Call Claude for opening message
  const systemPrompt = buildSystemPrompt(config);
  const openingMessages = [
    { role: 'user' as const, content: 'Please begin the interview.' },
  ];

  const claudeResponse = await callClaude(systemPrompt, openingMessages, createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY));

  // Create session
  const sessionMessages = [
    { role: 'system', content: 'Interview started', timestamp: new Date().toISOString() },
    { role: 'assistant', content: claudeResponse.reply, timestamp: new Date().toISOString() },
  ];

  const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: session, error: insertErr } = await sbAdmin
    .from('interview_sessions')
    .insert({
      user_id: userId,
      job_id: body.job_id || null,
      pipeline_entry_id: body.pipeline_entry_id || null,
      messages: sessionMessages,
      feedback_mode: config.feedback_mode,
      question_count: config.question_count,
      status: 'in_progress',
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error('[interview-simulate] Insert error:', insertErr.message);
    return jsonResponse({ error: 'Failed to create session' }, 500);
  }

  // PostHog
  captureEvent(userId, 'simulation_started', {
    session_id: session.id,
    job_id: body.job_id,
    source: body.source || 'standalone',
    feedback_mode: config.feedback_mode,
  });

  return jsonResponse({
    session_id: session.id,
    reply: claudeResponse.reply,
    is_complete: false,
    question_number: claudeResponse.question_number || 1,
  });
}

// ════════════════════════════════════════════════════════════════
// Action: message — Send candidate response, get interviewer reply
// ════════════════════════════════════════════════════════════════

async function handleMessage(
  sb: ReturnType<typeof createClient>,
  userId: string,
  body: SimulationRequest
) {
  if (!body.session_id) return jsonResponse({ error: 'session_id required' }, 400);
  if (!body.message) return jsonResponse({ error: 'message required' }, 400);

  const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Load session
  const { data: session, error: loadErr } = await sbAdmin
    .from('interview_sessions')
    .select('*')
    .eq('id', body.session_id)
    .eq('user_id', userId)
    .single();

  if (loadErr || !session) {
    return jsonResponse({ error: 'Session not found' }, 404);
  }

  if (session.status !== 'in_progress') {
    return jsonResponse({ error: 'Session is not in progress', status: session.status }, 400);
  }

  // Assemble config for system prompt
  const config = await assembleConfig(sb, userId, {
    job_id: session.job_id,
    feedback_mode: session.feedback_mode,
    question_count: session.question_count,
  });

  const systemPrompt = buildSystemPrompt(config);

  // Build Claude message history from session messages
  const claudeMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  const existingMessages = session.messages as Array<{ role: string; content: string }>;

  // Add opening prompt
  claudeMessages.push({ role: 'user', content: 'Please begin the interview.' });

  // Replay assistant/user turns
  for (const msg of existingMessages) {
    if (msg.role === 'assistant') {
      claudeMessages.push({ role: 'assistant', content: msg.content });
    } else if (msg.role === 'user') {
      claudeMessages.push({ role: 'user', content: msg.content });
    }
  }

  // Add new candidate message
  claudeMessages.push({ role: 'user', content: body.message });

  // Call Claude
  const claudeResponse = await callClaude(systemPrompt, claudeMessages, createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY));

  // Update session messages
  const updatedMessages = [
    ...existingMessages,
    { role: 'user', content: body.message, timestamp: new Date().toISOString() },
    { role: 'assistant', content: claudeResponse.reply, timestamp: new Date().toISOString() },
  ];

  const updatePayload: Record<string, unknown> = { messages: updatedMessages };

  // If interview is complete, store scorecard and mark completed
  if (claudeResponse.is_complete && claudeResponse.scorecard) {
    updatePayload.scorecard = claudeResponse.scorecard;
    updatePayload.overall_score = claudeResponse.scorecard.overall_score || null;
    updatePayload.status = 'completed';
    updatePayload.completed_at = new Date().toISOString();

    captureEvent(userId, 'simulation_completed', {
      session_id: body.session_id,
      overall_score: claudeResponse.scorecard.overall_score,
      question_count: session.question_count,
      duration_seconds: Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000),
    });
  } else {
    captureEvent(userId, 'simulation_message_sent', {
      session_id: body.session_id,
      turn_number: Math.floor(updatedMessages.filter(m => m.role === 'user').length),
      message_length: body.message.length,
    });
  }

  const { error: updateErr } = await sbAdmin
    .from('interview_sessions')
    .update(updatePayload)
    .eq('id', body.session_id);

  if (updateErr) {
    console.error('[interview-simulate] Update error:', updateErr.message);
    return jsonResponse({ error: 'Failed to update session' }, 500);
  }

  return jsonResponse({
    session_id: body.session_id,
    reply: claudeResponse.reply,
    is_complete: claudeResponse.is_complete,
    scorecard: claudeResponse.scorecard || undefined,
    question_number: claudeResponse.question_number,
  });
}

// ════════════════════════════════════════════════════════════════
// Action: abandon — Mark session as abandoned
// ════════════════════════════════════════════════════════════════

async function handleAbandon(
  sb: ReturnType<typeof createClient>,
  userId: string,
  body: SimulationRequest
) {
  if (!body.session_id) return jsonResponse({ error: 'session_id required' }, 400);

  const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { error } = await sbAdmin
    .from('interview_sessions')
    .update({ status: 'abandoned', completed_at: new Date().toISOString() })
    .eq('id', body.session_id)
    .eq('user_id', userId)
    .eq('status', 'in_progress');

  if (error) {
    console.error('[interview-simulate] Abandon error:', error.message);
    return jsonResponse({ error: 'Failed to abandon session' }, 500);
  }

  captureEvent(userId, 'simulation_abandoned', {
    session_id: body.session_id,
  });

  return jsonResponse({ session_id: body.session_id, status: 'abandoned' });
}

// ════════════════════════════════════════════════════════════════
// Action: history — List user's sessions
// ════════════════════════════════════════════════════════════════

async function handleHistory(
  sb: ReturnType<typeof createClient>,
  userId: string,
  body: SimulationRequest
) {
  const limit = Math.min(Number(body.limit) || 20, 50);

  const { data, error } = await sb
    .from('interview_sessions')
    .select('id, job_id, status, overall_score, feedback_mode, question_count, started_at, completed_at')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[interview-simulate] History error:', error.message);
    return jsonResponse({ error: 'Failed to load history' }, 500);
  }

  return jsonResponse({ sessions: data || [], count: (data || []).length });
}

// ════════════════════════════════════════════════════════════════
// Claude API call with prompt caching
// ════════════════════════════════════════════════════════════════

interface ClaudeResponse {
  reply: string;
  is_complete: boolean;
  scorecard?: Scorecard;
  question_number?: number;
}

interface Scorecard {
  overall_score: number;
  per_question_scores: Array<{ question: string; answer_summary: string; score: number; feedback: string }>;
  strengths: string[];
  improvements: string[];
  talking_points: string[];
  gap_coverage: string;
}

async function callClaude(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  sb?: ReturnType<typeof createClient>,
): Promise<ClaudeResponse> {
  const doFetch = async () => {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [{
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        }],
        messages,
      }),
    });

    if (!response.ok) {
      if (response.status === 402) throw new Error('402 credits exhausted');
      const errText = await response.text();
      throw new Error(`Anthropic API ${response.status}: ${errText.slice(0, 300)}`);
    }
    return await response.json();
  };

  let data: Record<string, unknown>;
  if (sb) {
    const _br = await withAnthropicBreaker(sb, 'interview-simulate', doFetch, { model: MODEL });
    if (_br.circuitOpen || _br.error) throw new Error(_br.error || 'Circuit breaker open');
    data = _br.result as Record<string, unknown>;
  } else {
    data = await doFetch();
  }

  const text = (data.content as Array<Record<string, string>>)?.[0]?.text || '';

  // Log cache performance
  const usage = data.usage || {};
  if (usage.cache_read_input_tokens > 0) {
    console.log(`[interview-simulate] Cache hit: ${usage.cache_read_input_tokens} tokens read from cache`);
  }

  // Parse JSON response
  const cleaned = text.replace(/```json\s*|```\s*/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      reply: parsed.reply || text,
      is_complete: parsed.is_complete === true,
      scorecard: parsed.scorecard || undefined,
      question_number: parsed.question_number,
    };
  } catch {
    // If JSON parse fails, treat as plain text reply (non-complete turn)
    console.warn('[interview-simulate] JSON parse failed, treating as plain reply. Text:', cleaned.slice(0, 100));
    return {
      reply: text,
      is_complete: false,
    };
  }
}

// ════════════════════════════════════════════════════════════════
// Context assembly — gather JD, resume, match data
// ════════════════════════════════════════════════════════════════

interface SimulationConfig {
  job_description: string;
  resume_text: string;
  match_analysis: string;
  company_name: string;
  company_industry: string;
  feedback_mode: boolean;
  question_count: number;
}

interface SimulationRequest {
  action?: string;
  session_id?: string;
  job_id?: string;
  pipeline_entry_id?: string;
  message?: string;
  feedback_mode?: boolean;
  question_count?: number;
  source?: string;
  focus_question?: string;
  limit?: number;
}

async function assembleConfig(
  sb: ReturnType<typeof createClient>,
  userId: string,
  body: Partial<SimulationRequest>
): Promise<SimulationConfig> {
  const config: SimulationConfig = {
    job_description: '',
    resume_text: '',
    match_analysis: '',
    company_name: '',
    company_industry: '',
    feedback_mode: body.feedback_mode !== false,
    question_count: Math.min(Math.max(Number(body.question_count) || 6, 3), 10),
  };

  // Get JD if job_id provided
  if (body.job_id) {
    try {
      const { data: job } = await sb
        .from('ats_jobs')
        .select('title, company_name, content, location, extracted_department, extracted_seniority')
        .eq('id', body.job_id)
        .single();

      if (job) {
        // Strip HTML from content
        const plainContent = (job.content || '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 8000); // Cap at 8K chars

        config.job_description = [
          `Title: ${job.title || 'Unknown'}`,
          `Company: ${job.company_name || 'Unknown'}`,
          `Location: ${job.location || 'Not specified'}`,
          `Department: ${job.extracted_department || 'Not specified'}`,
          `Level: ${job.extracted_seniority || 'Not specified'}`,
          '',
          plainContent,
        ].join('\n');

        config.company_name = job.company_name || '';
      }
    } catch (err) {
      console.warn('[interview-simulate] Failed to load job:', String(err));
    }
  }

  // Get resume text
  try {
    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: profile } = await sbAdmin
      .from('profiles')
      .select('user_data')
      .eq('id', userId)
      .single();

    const activeResumeId = profile?.user_data?.apply_settings?.active_resume_id;
    if (activeResumeId) {
      const { data: resume } = await sbAdmin
        .from('resume_archive')
        .select('extracted_text')
        .eq('id', activeResumeId)
        .single();

      if (resume?.extracted_text) {
        config.resume_text = resume.extracted_text.slice(0, 6000);
      }
    }
  } catch (err) {
    console.warn('[interview-simulate] Failed to load resume:', String(err));
  }

  // If there's a focus question (from Question Bank "Practice this"), prepend it
  if (body.focus_question) {
    config.job_description = `[Focus question from Question Bank: ${body.focus_question}]\n\n${config.job_description}`;
  }

  return config;
}

// ════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function captureEvent(userId: string, event: string, properties: Record<string, unknown>) {
  try {
    const phKey = Deno.env.get('POSTHOG_KEY');
    const phHost = Deno.env.get('POSTHOG_HOST') || 'https://us.i.posthog.com';
    if (!phKey) return;
    fetch(`${phHost}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: phKey, event, distinct_id: userId, properties }),
    }).catch(() => {});
  } catch { /* non-critical */ }
}
