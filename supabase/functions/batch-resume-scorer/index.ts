// batch-resume-scorer/index.ts
// FB-TRIAL-001-S6 — 5.2: Batch API for resume scoring queue
// Service-role only. pg_cron calls submit then poll every 5 minutes.
// Expired_free users who've consumed their score sample get queued here.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withAnthropicBreaker } from "../_shared/anthropic.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const POSTHOG_API_KEY = Deno.env.get('POSTHOG_API_KEY') || '';
const POSTHOG_HOST = 'https://app.posthog.com';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

const BATCH_API_URL = 'https://api.anthropic.com/v1/messages/batches';
const ANTHROPIC_HEADERS = {
  'x-api-key': ANTHROPIC_API_KEY,
  'anthropic-version': '2023-06-01',
  'anthropic-beta': 'message-batches-2024-09-24',
  'content-type': 'application/json',
};

const SYSTEM_PROMPT = `You are a Senior Career Strategist for Brilliant Jobs. Compare the resume against this specific job description with the depth of an experienced hiring manager. Return ONLY a JSON object, no markdown fences, no preamble. Required fields: match_score (0-100), fit_status ("strong_fit"|"good_fit"|"moderate_fit"|"weak_fit"), analysis_summary (2-3 sentences), key_gaps (string[]), strengths (string[]).`;

// ─── PostHog fire-and-forget ───
function capturePostHog(event: string, properties: Record<string, unknown>) {
  if (!POSTHOG_API_KEY) return;
  fetch(`${POSTHOG_HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: POSTHOG_API_KEY, event, properties, timestamp: new Date().toISOString() }),
  }).catch(() => {});
}

// ─── Build a batch request item for one queue row ───
function buildBatchItem(row: Record<string, unknown>): Record<string, unknown> {
  const resumeText = (row.resume_text as string || '').slice(0, 6000);
  const jobText = (row.job_description_text as string || '').slice(0, 3000);
  return {
    custom_id: row.id as string,
    params: {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: `<resume_text>\n${resumeText}\n</resume_text>\n\n<job_description>\n${jobText}\n</job_description>\n\nScore the resume against this job.`,
      }],
    },
  };
}

// ─── ACTION: submit ───
// Reads up to 50 pending rows, submits as single Anthropic Batch request, updates status+batch_id
async function handleSubmit(sb: ReturnType<typeof createClient>): Promise<Response> {
  const { data: rows, error } = await sb
    .from('resume_score_queue')
    .select('id, user_id, resume_id, resume_text, job_description_text')
    .eq('status', 'pending')
    .limit(50);

  if (error) {
    console.error('[batch-resume-scorer:submit] Query error:', error.message);
    return new Response(JSON.stringify({ error: 'query_failed', message: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ submitted: 0, message: 'No pending items' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const requests = rows.map(buildBatchItem);

  // BP-001: Circuit breaker on batch submission
  const _br = await withAnthropicBreaker(sb, 'batch-resume-scorer', async () => {
    const r = await fetch(BATCH_API_URL, {
      method: 'POST',
      headers: ANTHROPIC_HEADERS,
      body: JSON.stringify({ requests }),
    });
    if (!r.ok) throw new Error(`Batch API ${r.status}`);
    return r;
  });

  if (_br.circuitOpen) {
    return new Response(JSON.stringify({ error: 'AI service temporarily unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  const batchRes = _br.result;
  if (!batchRes) {
    console.error('[batch-resume-scorer:submit] Batch API error:', _br.error);
    return new Response(JSON.stringify({ error: 'batch_api_failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  const batch = await batchRes.json();
  const batchId = batch.id as string;

  const ids = rows.map((r) => r.id as string);
  const { error: updateErr } = await sb
    .from('resume_score_queue')
    .update({ status: 'submitted', batch_id: batchId })
    .in('id', ids);

  if (updateErr) {
    console.error('[batch-resume-scorer:submit] Update error:', updateErr.message);
  }

  console.log(`[batch-resume-scorer:submit] Submitted batch=${batchId} count=${rows.length}`);
  return new Response(JSON.stringify({ submitted: rows.length, batch_id: batchId }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// ─── ACTION: poll ───
// Finds submitted rows, checks Anthropic batch status, marks complete/failed
async function handlePoll(sb: ReturnType<typeof createClient>): Promise<Response> {
  const { data: rows, error } = await sb
    .from('resume_score_queue')
    .select('id, batch_id, user_id, created_at')
    .eq('status', 'submitted')
    .not('batch_id', 'is', null)
    .limit(200);

  if (error || !rows || rows.length === 0) {
    return new Response(JSON.stringify({ polled: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // Group by batch_id
  const byBatch: Record<string, string[]> = {};
  for (const row of rows) {
    const bid = row.batch_id as string;
    if (!byBatch[bid]) byBatch[bid] = [];
    byBatch[bid].push(row.id as string);
  }

  let completedTotal = 0;

  for (const [batchId, rowIds] of Object.entries(byBatch)) {
    // Check batch status
    const statusRes = await fetch(`${BATCH_API_URL}/${batchId}`, { headers: ANTHROPIC_HEADERS });
    if (!statusRes.ok) continue;
    const batchStatus = await statusRes.json();

    if (batchStatus.processing_status !== 'ended') continue; // still running

    // Fetch results
    const resultsUrl = batchStatus.results_url as string;
    if (!resultsUrl) continue;

    const resultsRes = await fetch(resultsUrl, { headers: ANTHROPIC_HEADERS });
    if (!resultsRes.ok) continue;

    const resultsText = await resultsRes.text();
    const lines = resultsText.trim().split('\n').filter(Boolean);

    let completed = 0;
    const startedAt = rows.find((r) => r.batch_id === batchId)?.created_at as string;
    const latencySec = startedAt ? Math.round((Date.now() - new Date(startedAt).getTime()) / 1000) : 0;

    for (const line of lines) {
      let item: Record<string, unknown>;
      try { item = JSON.parse(line); } catch { continue; }

      const customId = item.custom_id as string;
      if (!rowIds.includes(customId)) continue;

      if (item.result && (item.result as Record<string, unknown>).type === 'succeeded') {
        const resultContent = (item.result as Record<string, unknown>);
        const msgContent = ((resultContent.message as Record<string, unknown>)?.content as Array<Record<string, unknown>>)?.[0]?.text as string || '';
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(msgContent); } catch { parsed = { raw: msgContent }; }

        await sb.from('resume_score_queue').update({
          status: 'completed',
          result: parsed,
          completed_at: new Date().toISOString(),
        }).eq('id', customId);
        completed++;
      } else {
        const errMsg = JSON.stringify((item.result as Record<string, unknown>)?.error || 'unknown');
        await sb.from('resume_score_queue').update({
          status: 'failed',
          error: errMsg,
          completed_at: new Date().toISOString(),
        }).eq('id', customId);
      }
    }

    completedTotal += completed;

    if (completed > 0) {
      capturePostHog('batch_score_completed', {
        batch_id: batchId,
        scores_count: completed,
        latency_sec: latencySec,
        function_name: 'batch-resume-scorer',
      });
      console.log(`[batch-resume-scorer:poll] batch=${batchId} completed=${completed} latency=${latencySec}s`);
    }
  }

  return new Response(JSON.stringify({ polled: Object.keys(byBatch).length, completed: completedTotal }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// ─── ACTION: status ───
async function handleStatus(sb: ReturnType<typeof createClient>): Promise<Response> {
  const { data, error } = await sb
    .from('resume_score_queue')
    .select('status')
    .order('created_at', { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const counts: Record<string, number> = { pending: 0, submitted: 0, completed: 0, failed: 0 };
  for (const row of (data || [])) {
    counts[row.status as string] = (counts[row.status as string] || 0) + 1;
  }

  return new Response(JSON.stringify({ queue: counts, total: (data || []).length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// ─── Handler ───
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  const authHeader = req.headers.get('Authorization') || '';
  const isServiceRole = authHeader.includes(SERVICE_ROLE_KEY);
  // pg_cron calls without Bearer prefix; also accept direct service role
  const isCron = authHeader === SERVICE_ROLE_KEY || authHeader === `Bearer ${SERVICE_ROLE_KEY}`;
  if (!isServiceRole && !isCron) {
    return new Response(JSON.stringify({ error: 'Service role required' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || (await req.json().catch(() => ({}))).action || 'status';

  if (action === 'submit') return handleSubmit(sb);
  if (action === 'poll') return handlePoll(sb);
  if (action === 'status') return handleStatus(sb);

  return new Response(JSON.stringify({ error: 'Unknown action. Use: submit, poll, status' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
});
