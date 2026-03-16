// supabase/functions/get-user-balance/index.ts
// SPEC-COHORT-001-S2: Returns user's 3-bucket credit balance.
// Gateway route #130.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const sb = createClient(SB_URL, SB_KEY);
    const { data: { user }, error: authErr } = await sb.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Balance query via RPC ─────────────────────────────────────────────
    const { data: balance, error: balErr } = await sb.rpc('fn_get_user_credit_balance', {
      p_user_id: user.id,
    });

    if (balErr) {
      console.error('[get-user-balance] RPC error:', balErr.message);
      return new Response(JSON.stringify({ error: 'Failed to fetch balance' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Fetch reset date from cohort tier ─────────────────────────────────
    const { data: profile } = await sb
      .from('profiles')
      .select('cohort_tier_id, cohort_tier_assigned_at, cohort_tiers(credits_monthly, rollover_cap, slug)')
      .eq('id', user.id)
      .single();

    // Reset date = start of next calendar month (proxy; billing date handled in S3)
    const now = new Date();
    const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

    // SPEC-COHORT-001-REM §7.1: earliest award expiry for tooltip
    const { data: nextExpiry } = await sb
      .from('bj_credit_ledger')
      .select('expires_at')
      .eq('user_id', user.id)
      .eq('bucket', 'award')
      .eq('event_type', 'award_grant')
      .eq('voided', false)
      .gt('amount', 0)
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: true })
      .limit(1)
      .single();

    // SPEC-COHORT-001-REM §7.1 §3.2: passive debits today for platform usage row
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const passiveFeatures = ['auto-apply-trigger', 'analyze-hidden-job', 'score-ai-content'];
    const { count: platformUsage } = await sb
      .from('bj_credit_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('event_type', 'feature_debit')
      .in('feature', passiveFeatures)
      .gte('created_at', todayStart.toISOString());

    return new Response(
      JSON.stringify({
        ...balance,
        reset_date: resetDate,
        cohort_slug: (profile?.cohort_tiers as Record<string, unknown>)?.slug ?? 'free',
        credits_monthly: (profile?.cohort_tiers as Record<string, unknown>)?.credits_monthly ?? 0,
        earliest_award_expiry: nextExpiry?.expires_at ?? null,
        platform_usage_today: platformUsage ?? 0,
      }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[get-user-balance] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
