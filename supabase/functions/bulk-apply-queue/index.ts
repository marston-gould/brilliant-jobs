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

    // Insert queue rows
    const rows = jobIds.map(jid => {
      const j = jobMap.get(jid) || {};
      return {
        user_id: user.id,
        job_id: jid,
        job_title: (j as Record<string,string>).title || '',
        company_name: (j as Record<string,string>).company_name || '',
        job_url: (j as Record<string,string>).url || '',
        resume_id: body.resume_id || null,
        status: 'queued',
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
