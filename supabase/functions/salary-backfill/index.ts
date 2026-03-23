// supabase/functions/salary-backfill/index.ts
// Runs regex salary extraction on open jobs with null salary_min.
// Processes in batches of 500 to stay within timeouts.
// Called on-demand or by cron until all jobs are processed.
// No AI — uses extract_salary_from_text() SQL function (zero cost).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Verify service role or admin call
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') || '';
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) {
    // Allow service role calls (no user)
    const payload = JSON.parse(atob(token.split('.')[1] || 'e30='));
    if (payload.role !== 'service_role') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }
  }

  const BATCH = 500;
  let totalUpdated = 0;
  let remaining = 0;

  try {
    // Count remaining
    const { count } = await sb
      .from('ats_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open')
      .is('salary_min', null)
      .not('content', 'is', null);
    remaining = count || 0;

    // Fetch a batch of candidates
    const { data: jobs } = await sb
      .from('ats_jobs')
      .select('greenhouse_id, content')
      .eq('status', 'open')
      .is('salary_min', null)
      .not('content', 'is', null)
      .like('content', '%$%')
      .limit(BATCH);

    if (!jobs?.length) {
      return new Response(JSON.stringify({ updated: 0, remaining: 0, done: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    // Extract salary via SQL function for each job
    for (const job of jobs) {
      const { data: extracted } = await sb
        .rpc('extract_salary_from_text', { raw_text: job.content })
        .limit(1)
        .single();

      if (extracted?.salary_min) {
        await sb.from('ats_jobs')
          .update({
            salary_min: extracted.salary_min,
            salary_max: extracted.salary_max,
            salary_rate: extracted.salary_rate,
            salary_currency: extracted.salary_currency,
          })
          .eq('greenhouse_id', job.greenhouse_id)
          .is('salary_min', null); // never overwrite
        totalUpdated++;
      }
    }

    return new Response(JSON.stringify({
      updated: totalUpdated,
      remaining: Math.max(0, remaining - jobs.length),
      done: jobs.length < BATCH,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[salary-backfill]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
});
