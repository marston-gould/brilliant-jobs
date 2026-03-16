// supabase/functions/interview-practice/index.ts
// AIS-F11: AI Interview Practice — generates questions, evaluates answers, provides feedback
// Actions: start_session, submit_answer, end_session
// Uses Claude Sonnet. Costs 3 credits per session.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { withAnthropicBreaker } from '../_shared/anthropic.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SONNET = 'claude-sonnet-4-20250514';
const SESSION_CREDITS = 3;

const CORS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function callSonnet(sb: ReturnType<typeof createClient>, systemPrompt: string, userMsg: string) {
  const _br = await withAnthropicBreaker(sb, 'interview-practice', async () => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01', 'content-type': 'application/json',
      },
      body: JSON.stringify({ model: SONNET, max_tokens: 2000, system: systemPrompt, messages: [{ role: 'user', content: userMsg }] }),
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, text: '', error: d.error?.message };
    return { ok: true, text: d.content?.[0]?.text || '' };
  });
  return _br.result || { ok: false, text: '', error: _br.error };
}

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
    const { action, session_id, session_type, job_id, resume_id, answer_text, question_index } = body;

    // ── Action: start_session ──────────────────────────────────────────────
    if (action === 'start_session') {
      // Deduct credits
      const { error: creditErr } = await sb.rpc('deduct_credits', {
        p_user_id: user.id, p_amount: SESSION_CREDITS, p_feature: 'interview_practice',
      });
      if (creditErr) return json({ error: 'Insufficient credits (3 required)' }, 402);

      // Fetch job context
      let jdText = '';
      if (job_id) {
        const { data: job } = await sb.from('ats_jobs').select('title, content, company_name').eq('greenhouse_id', job_id).maybeSingle();
        if (job) jdText = `Job Title: ${job.title}\nCompany: ${job.company_name}\n${(job.content || '').slice(0, 2000)}`;
      }

      // Fetch resume text
      let resumeText = '';
      if (resume_id) {
        const { data: rw } = await sb.from('resume_rewrites').select('rewritten_text').eq('user_id', user.id).eq('resume_id', resume_id).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (rw) resumeText = rw.rewritten_text || '';
      }

      const sysPrompt = `You are a senior interviewer conducting a ${session_type || 'behavioral'} interview. Generate 6 targeted interview questions.
- 50% based on JD requirements, 30% probing resume gaps, 20% industry/role patterns
- For behavioral: use STAR format prompts
- For technical: test specific skills from JD
- For company: ask about mission, product fit, culture alignment
Respond ONLY with JSON: { questions: [{id, text, type, focus_area}] }`;

      const userMsg = `Generate interview questions.\nSession type: ${session_type || 'behavioral'}\n${jdText ? '\n## Job Description\n' + jdText : ''}\n${resumeText ? '\n## Candidate Resume\n' + resumeText.slice(0, 1500) : ''}`;

      const result = await callSonnet(sb, sysPrompt, userMsg);
      if (!result.ok) {
        await sb.rpc('add_credits', { p_user_id: user.id, p_amount: SESSION_CREDITS, p_source: 'interview_refund' });
        return json({ error: 'AI unavailable' }, 503);
      }

      let questions = [];
      try {
        const parsed = JSON.parse(result.text.replace(/```json|```/g, '').trim());
        questions = parsed.questions || [];
      } catch { questions = [{ id: 'q1', text: 'Tell me about yourself.', type: 'behavioral', focus_area: 'general' }]; }

      const { data: session, error: sessErr } = await sb.from('interview_sessions').insert({
        user_id: user.id, job_id: job_id || null, resume_id: resume_id || null,
        session_type: session_type || 'behavioral',
        questions_json: questions,
        answers_json: [], feedback_json: [],
        credits_charged: SESSION_CREDITS, status: 'active',
      }).select('id').single();

      if (sessErr) return json({ error: 'Failed to create session' }, 500);
      return json({ success: true, session_id: session.id, questions, credits_charged: SESSION_CREDITS });
    }

    // ── Action: submit_answer ──────────────────────────────────────────────
    if (action === 'submit_answer') {
      if (!session_id || !answer_text) return json({ error: 'session_id and answer_text required' }, 400);

      const { data: sess } = await sb.from('interview_sessions').select('*').eq('id', session_id).eq('user_id', user.id).single();
      if (!sess) return json({ error: 'Session not found' }, 404);

      const questions = sess.questions_json as Array<{id:string;text:string;type?:string}>;
      const q = questions[question_index ?? 0] || questions[0];

      const sysPrompt = `You are an expert interview coach. Evaluate the candidate's answer and provide structured feedback.
Respond ONLY with JSON: {
  strength: string (1-2 sentences: what was good),
  gap: string (1-2 sentences: what was missing or weak),
  improved_answer: string (rewritten stronger answer, 3-4 sentences),
  star_check: { situation: boolean, task: boolean, action: boolean, result: boolean },
  scores: { relevance: 0-100, specificity: 0-100, structure: 0-100, jd_alignment: 0-100, communication: 0-100 }
}`;

      const userMsg = `Question: "${q?.text || 'Tell me about yourself'}"\nType: ${q?.type || 'behavioral'}\nCandidate Answer: "${answer_text}"`;

      const result = await callSonnet(sb, sysPrompt, userMsg);
      if (!result.ok) return json({ error: 'AI evaluation failed' }, 503);

      let feedback = {};
      try { feedback = JSON.parse(result.text.replace(/```json|```/g, '').trim()); } catch { feedback = { strength: '', gap: '', improved_answer: answer_text }; }

      // Update session
      const answers = [...(sess.answers_json as unknown[]), { question_index: question_index ?? 0, answer: answer_text }];
      const feedbacks = [...(sess.feedback_json as unknown[]), { question_index: question_index ?? 0, ...feedback }];
      await sb.from('interview_sessions').update({ answers_json: answers, feedback_json: feedbacks }).eq('id', session_id);

      // Generate follow-up question
      const followUp = await callSonnet(sb,
        `Generate one natural follow-up interview question based on the answer given. Respond with JSON: { follow_up: string }`,
        `Original question: "${q?.text}"\nAnswer: "${answer_text.slice(0, 500)}"`
      );
      let followUpQ = '';
      try { followUpQ = JSON.parse(followUp.text.replace(/```json|```/g, '').trim()).follow_up || ''; } catch {}

      return json({ success: true, feedback, follow_up_question: followUpQ });
    }

    // ── Action: end_session ────────────────────────────────────────────────
    if (action === 'end_session') {
      if (!session_id) return json({ error: 'session_id required' }, 400);
      const { data: sess } = await sb.from('interview_sessions').select('*').eq('id', session_id).eq('user_id', user.id).single();
      if (!sess) return json({ error: 'Session not found' }, 404);

      // Compute aggregate scores
      const feedbacks = (sess.feedback_json as Array<{scores?:{relevance?:number;specificity?:number;structure?:number;jd_alignment?:number;communication?:number}}>);
      const weights = { relevance: 0.25, specificity: 0.25, structure: 0.20, jd_alignment: 0.20, communication: 0.10 };
      let totalScore = 0, count = 0;
      for (const fb of feedbacks) {
        if (fb.scores) {
          const s = fb.scores;
          totalScore += (s.relevance||0)*weights.relevance + (s.specificity||0)*weights.specificity +
            (s.structure||0)*weights.structure + (s.jd_alignment||0)*weights.jd_alignment +
            (s.communication||0)*weights.communication;
          count++;
        }
      }
      const aggregateScore = count > 0 ? Math.round(totalScore / count) : null;

      await sb.from('interview_sessions').update({
        status: 'complete',
        aggregate_score: aggregateScore,
        completed_at: new Date().toISOString(),
      }).eq('id', session_id);

      return json({ success: true, session_id, aggregate_score: aggregateScore, questions_answered: (sess.answers_json as unknown[]).length });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('[interview-practice] Error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
