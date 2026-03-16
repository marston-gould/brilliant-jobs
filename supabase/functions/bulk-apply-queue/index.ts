// supabase/functions/bulk-apply-queue/index.ts
// AIS-F9-S2: Bulk Apply Queue Edge Function
// Accepts a list of job_ids, inserts queued rows into bulk_apply_jobs,
// then triggers the Fly.io worker sequentially for each.
// Safety: max 25 jobs per queue call, 1-3s jitter between submissions.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SB_URL  = Deno.env.get('SUPABASE_URL')!;
const SB_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WORKER_URL = Deno.env.get('FLY_WORKER_URL') || 'https://brilliant-jobs-worker.fly.dev';

const CORS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MAX_BULK = 25;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    // Auth
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'Authorization required' }, 401);
    const sb = createClient(SB_URL, SB_KEY);
    const { data: { user }, error: authErr } = await sb.auth.getUser(auth.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Invalid token' }, 401);

    const body = await req.json();
    const jobIds: string[] = (body.job_ids || []).slice(0, MAX_BULK);
    if (!jobIds.length) return json({ error: 'job_ids required' }, 400);

    // Fetch job metadata for each job_id
    const { data: jobs } = await sb
      .from('ats_jobs')
      .select('greenhouse_id, title, company_name, url')
      .in('greenhouse_id', jobIds);

    const jobMap = new Map((jobs || []).map((j: Record<string,string>) => [j.greenhouse_id, j]));

    // AIS-F9-S3 item 49: Score gate integration — fetch user's mode + threshold
    const { data: applySettings } = await sb.from('profiles')
      .select('user_data')
      .eq('id', user.id)
      .single()
      .catch(() => ({ data: null }));
    const userSettings = (applySettings?.user_data as Record<string, Record<string, unknown>>)?.apply_settings || {};
    const applicationMode = (userSettings.applicationMode as string) || 'manual';
    const scoreThreshold = (userSettings.scoreThreshold as number) || 75;
    const useScoreGate = applicationMode === 'score-gated' || applicationMode === 'auto-score-gate';

    // Fetch match scores for jobs if score gate is active
    const scoreMap = new Map<string, number>();
    if (useScoreGate && body.resume_id) {
      // Bulk score check via score-resume EF for each job
      for (const jid of jobIds.slice(0, 10)) { // Cap to 10 to avoid timeout
        try {
          const job = jobMap.get(jid);
          if (!job) continue;
          const scoreRes = await fetch(`${SB_URL}/functions/v1/score-resume`, {
            method: 'POST',
            headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: jid, resumeId: body.resume_id }),
          });
          const scoreData = await scoreRes.json();
          if (scoreData.score) scoreMap.set(jid, scoreData.score);
        } catch { /* non-fatal */ }
      }
    }

    // Insert queue rows — flag below-threshold for review
    const rows = jobIds.map(jid => {
      const j = jobMap.get(jid) || {};
      const score = scoreMap.get(jid);
      // If score gate active and score is below threshold, flag for review
      const isBelowThreshold = useScoreGate && score !== undefined && score < scoreThreshold;
      return {
        user_id: user.id,
        job_id: jid,
        job_title: (j as Record<string,string>).title || '',
        company_name: (j as Record<string,string>).company_name || '',
        job_url: (j as Record<string,string>).url || '',
        resume_id: body.resume_id || null,
        status: isBelowThreshold ? 'review_required' : 'queued',
        match_score: score || null,
      };
    });

    const { data: inserted, error: insertErr } = await sb
      .from('bulk_apply_jobs')
      .insert(rows)
      .select('id, job_id');

    if (insertErr) return json({ error: 'Queue insert failed', detail: insertErr.message }, 500);

    // Trigger worker for each queued job (fire-and-forget, non-blocking response)
    const queueIds = (inserted || []).map((r: Record<string,string>) => r.id);

    // Async trigger — don't await, return immediately so UI isn't blocked
    (async () => {
      for (const queueId of queueIds) {
        try {
          await fetch(`${WORKER_URL}/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': SB_KEY },
            body: JSON.stringify({ bulk_queue_id: queueId, user_id: user.id }),
          });
          // AIS-F9-S2: jitter between submissions (anti-detection)
          await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
        } catch (e) {
          console.warn('[bulk-apply-queue] Worker trigger failed for', queueId, (e as Error).message);
        }
      }
    })();

    return json({ queued: queueIds.length, queue_ids: queueIds });

  } catch (err) {
    console.error('[bulk-apply-queue] Error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
