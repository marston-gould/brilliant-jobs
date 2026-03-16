// supabase/functions/resume-ab-assign/index.ts
// AIS-F12: Resume A/B Testing — assigns variant for a given job, logs results
// Actions: assign (select which variant to use), record_outcome, check_winner

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CORS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Chi-squared test for 2x2 table (simplified Fisher's exact approximation)
function pValue(aSuccess: number, aTotal: number, bSuccess: number, bTotal: number): number {
  if (aTotal < 10 || bTotal < 10) return 1; // Not enough data
  const n = aTotal + bTotal;
  const e_a = aTotal * (aSuccess + bSuccess) / n;
  const e_b = bTotal * (aSuccess + bSuccess) / n;
  if (e_a === 0 || e_b === 0) return 1;
  const chi2 = Math.pow(aSuccess - e_a, 2) / e_a + Math.pow(bSuccess - e_b, 2) / e_b;
  // Approximate p-value from chi-squared with 1 df
  return Math.exp(-chi2 / 2);
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
    const { action, filter_id, job_id, test_id, outcome, response_received } = body;

    // ── Action: assign — pick which variant to use for this job ──
    if (action === 'assign') {
      // Find active test for this user + filter
      const query = sb.from('resume_ab_tests')
        .select('*').eq('user_id', user.id).eq('status', 'active');
      if (filter_id) query.eq('filter_id', filter_id);
      const { data: tests } = await query.limit(1).maybeSingle();
      if (!tests) return json({ variant: null, resume_id: null }); // No active test

      // Count existing results to determine which variant is due (round-robin)
      const { count: aCount } = await sb.from('resume_ab_results').select('*', { count: 'exact', head: true }).eq('test_id', tests.id).eq('variant', 'a');
      const { count: bCount } = await sb.from('resume_ab_results').select('*', { count: 'exact', head: true }).eq('test_id', tests.id).eq('variant', 'b');

      // Assign variant that has fewer applications (round-robin)
      const variant = (aCount || 0) <= (bCount || 0) ? 'a' : 'b';
      const resumeId = variant === 'a' ? tests.variant_a_resume_id : tests.variant_b_resume_id;

      // Log assignment
      await sb.from('resume_ab_results').insert({
        test_id: tests.id, job_id: job_id || null,
        variant, resume_id: resumeId, applied_at: new Date().toISOString(),
      });

      return json({ test_id: tests.id, variant, resume_id: resumeId });
    }

    // ── Action: record_outcome — update result with response/outcome ──
    if (action === 'record_outcome') {
      if (!test_id || !job_id) return json({ error: 'test_id and job_id required' }, 400);
      const { data: result } = await sb.from('resume_ab_results')
        .select('id, applied_at').eq('test_id', test_id).eq('job_id', job_id)
        .order('applied_at', { ascending: false }).limit(1).maybeSingle();
      if (!result) return json({ error: 'No result record found' }, 404);

      const daysToResponse = response_received && result.applied_at
        ? Math.floor((Date.now() - new Date(result.applied_at).getTime()) / 86400000)
        : null;

      await sb.from('resume_ab_results').update({
        response_received: response_received ?? false,
        response_at: response_received ? new Date().toISOString() : null,
        outcome: outcome || null,
        days_to_response: daysToResponse,
      }).eq('id', result.id);

      // Check winner after each outcome update
      const winnerCheck = await checkAndDeclareWinner(sb, test_id, user.id);
      return json({ success: true, winner_declared: winnerCheck.declared, winner: winnerCheck.winner });
    }

    // ── Action: get_results — return metrics for a test ──
    if (action === 'get_results') {
      if (!test_id) return json({ error: 'test_id required' }, 400);
      const { data: results } = await sb.from('resume_ab_results').select('*').eq('test_id', test_id);
      if (!results) return json({ results: [], metrics: null });

      const aResults = results.filter(r => r.variant === 'a');
      const bResults = results.filter(r => r.variant === 'b');
      const aResponse = aResults.filter(r => r.response_received).length;
      const bResponse = bResults.filter(r => r.response_received).length;
      const aInterview = aResults.filter(r => r.outcome === 'interview').length;
      const bInterview = bResults.filter(r => r.outcome === 'interview').length;

      const p = pValue(aResponse, aResults.length, bResponse, bResults.length);
      const significant = p < 0.05 && aResults.length >= 20 && bResults.length >= 20;

      return json({
        metrics: {
          a: { total: aResults.length, responses: aResponse, interviews: aInterview, response_rate: aResults.length > 0 ? (aResponse / aResults.length) : 0 },
          b: { total: bResults.length, responses: bResponse, interviews: bInterview, response_rate: bResults.length > 0 ? (bResponse / bResults.length) : 0 },
          p_value: p,
          statistically_significant: significant,
          min_sample_reached: aResults.length >= 10 && bResults.length >= 10,
        },
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('[resume-ab-assign] Error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

async function checkAndDeclareWinner(sb: ReturnType<typeof createClient>, testId: string, userId: string) {
  const { data: test } = await sb.from('resume_ab_tests').select('*').eq('id', testId).single();
  if (!test || test.status !== 'active' || test.winner_id) return { declared: false, winner: null };

  const { data: results } = await sb.from('resume_ab_results').select('*').eq('test_id', testId);
  if (!results) return { declared: false, winner: null };

  const aR = results.filter(r => r.variant === 'a');
  const bR = results.filter(r => r.variant === 'b');
  if (aR.length < test.min_sample_size || bR.length < test.min_sample_size) return { declared: false, winner: null };

  const aResp = aR.filter(r => r.response_received).length;
  const bResp = bR.filter(r => r.response_received).length;
  const p = pValue(aResp, aR.length, bResp, bR.length);

  if (p >= 0.05) return { declared: false, winner: null };

  const winnerVariant = aResp / aR.length >= bResp / bR.length ? 'a' : 'b';
  const winnerId = winnerVariant === 'a' ? test.variant_a_resume_id : test.variant_b_resume_id;

  await sb.from('resume_ab_tests').update({
    status: 'completed', winner_id: winnerId, completed_at: new Date().toISOString(),
  }).eq('id', testId);

  return { declared: true, winner: winnerVariant, winner_id: winnerId, p_value: p };
}
