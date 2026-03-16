// supabase/functions/replenish-credits/index.ts
// SPEC-COHORT-001-S2: Credits replenishment at billing period boundary.
// Called by: billing webhook (customer.subscription.updated) + admin manual trigger.
// Gateway route #131.
//
// Rollover logic:
//   rollover_cap = 0  → no rollover; full unused balance expires
//   rollover_cap = N  → carry forward min(unused, N)
//   rollover_cap = -1 → carry forward full unused balance

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    // ── Auth: service role or admin JWT ───────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const sb = createClient(SB_URL, SB_KEY);

    // Accept either service-role key (from cron/webhook) or admin JWT
    const token = authHeader.replace('Bearer ', '');
    let userId: string | null = null;

    if (token !== SB_KEY) {
      // Caller is a user JWT — must be admin
      const { data: { user }, error: authErr } = await sb.auth.getUser(token);
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      const { data: profile } = await sb
        .from('profiles').select('role').eq('id', user.id).single();
      if (!['admin', 'superadmin'].includes(profile?.role ?? '')) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    // If user_id provided: replenish just that user. Otherwise: replenish all due users.
    const targetUserId: string | null = body.user_id ?? null;

    const periodStart = new Date();
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);
    const newPeriodStart = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 1);

    let usersQuery = sb
      .from('profiles')
      .select('id, cohort_tier_id, rollover_cap_override, cohort_tiers(credits_monthly, rollover_cap)');

    if (targetUserId) {
      usersQuery = usersQuery.eq('id', targetUserId) as typeof usersQuery;
    } else {
      usersQuery = usersQuery.not('cohort_tier_id', 'is', null) as typeof usersQuery;
    }

    const { data: users, error: usersErr } = await usersQuery;
    if (usersErr) throw usersErr;

    let processed = 0;
    let errors = 0;
    const results: Array<{ user_id: string; rolled: number; new_base: number }> = [];

    for (const user of (users ?? [])) {
      try {
        const tier = user.cohort_tiers as { credits_monthly: number; rollover_cap: number } | null;
        if (!tier) continue;

        const newBase = tier.credits_monthly;
        const effectiveRolloverCap = user.rollover_cap_override ?? tier.rollover_cap;

        // Calculate current unused balance (base + rolled buckets only — awards handled separately)
        const { data: balData } = await sb.rpc('fn_get_user_credit_balance', { p_user_id: user.id });
        const bal = balData as Record<string, number> ?? { rolled: 0, base: 0, awards: 0, total: 0 };
        const unusedBase = Math.max(0, (bal.rolled ?? 0) + (bal.base ?? 0));

        // Expire current period entries by writing rollover_expire
        if (unusedBase > 0) {
          if (effectiveRolloverCap === 0) {
            // No rollover — expire all
            await sb.from('bj_credit_ledger').insert({
              user_id: user.id, bucket: 'base', event_type: 'rollover_expire',
              amount: -unusedBase, period_start: periodStart.toISOString(),
              notes: 'Period end: no rollover policy',
            });
          } else if (effectiveRolloverCap === -1) {
            // Full rollover
            await sb.from('bj_credit_ledger').insert({
              user_id: user.id, bucket: 'rolled', event_type: 'rollover_grant',
              amount: unusedBase, period_start: newPeriodStart.toISOString(),
              notes: 'Period end: full rollover',
            });
          } else {
            // Capped rollover
            const toRoll = Math.min(unusedBase, effectiveRolloverCap);
            const toExpire = unusedBase - toRoll;
            if (toExpire > 0) {
              await sb.from('bj_credit_ledger').insert({
                user_id: user.id, bucket: 'base', event_type: 'rollover_expire',
                amount: -toExpire, period_start: periodStart.toISOString(),
                notes: `Period end: cap=${effectiveRolloverCap}, expired ${toExpire}`,
              });
            }
            if (toRoll > 0) {
              await sb.from('bj_credit_ledger').insert({
                user_id: user.id, bucket: 'rolled', event_type: 'rollover_grant',
                amount: toRoll, period_start: newPeriodStart.toISOString(),
                notes: `Period end: cap=${effectiveRolloverCap}, rolled ${toRoll}`,
              });
            }
          }
        }

        // Grant new base allotment
        if (newBase > 0) {
          await sb.from('bj_credit_ledger').insert({
            user_id: user.id, bucket: 'base', event_type: 'cohort_grant',
            amount: newBase, period_start: newPeriodStart.toISOString(),
          });
        }

        results.push({ user_id: user.id, rolled: unusedBase, new_base: newBase });
        processed++;
      } catch (userErr) {
        console.error(`[replenish-credits] Error for user ${user.id}:`, userErr);
        errors++;
        // PostHog: credit_replenishment_failed — NO SILENT FAIL
        try {
          const phKey = Deno.env.get('POSTHOG_API_KEY');
          if (phKey) {
            await fetch(`https://app.posthog.com/capture/`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                api_key: phKey,
                distinct_id: user.id,
                event: 'credit_replenishment_failed',
                properties: { user_id: user.id, error: String(userErr) },
              }),
            });
          }
        } catch (_) {}
      }
    }

    return new Response(
      JSON.stringify({ processed, errors, results: targetUserId ? results : undefined }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[replenish-credits] Fatal error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
