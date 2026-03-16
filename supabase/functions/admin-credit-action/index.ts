// supabase/functions/admin-credit-action/index.ts
// SPEC-ADMIN-002-S1: Admin credit grant / deduct with audit log
// Replaces award-grant for admin-initiated credit actions.
// Writes event_type='admin_adjustment' to bj_credit_ledger.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PH_KEY = Deno.env.get('POSTHOG_API_KEY');

const CORS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const sb = createClient(SB_URL, SB_KEY);

  // Auth: admin JWT only (§9 — no service_role bypass for credit actions)
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const { data: profile } = await sb.from('profiles').select('id, role').eq('id', user.id).single();
  if (!profile || !['admin', 'superadmin'].includes(profile.role))
    return json({ error: 'Forbidden — admin required' }, 403);

  try {
    const body = await req.json();
    const { user_id, amount, reason } = body;

    if (!user_id) return json({ error: 'user_id required' }, 400);
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount === 0)
      return json({ error: 'amount must be a non-zero integer' }, 400);
    if (!reason || reason.trim().length < 5)
      return json({ error: 'reason required (min 5 chars)' }, 400);

    // For deductions, guard against going below 0 unless override set
    if (amount < 0 && !body.allow_negative) {
      const { data: bal } = await sb.rpc('fn_get_user_credit_balance', { p_user_id: user_id });
      const total = (bal as Record<string, number>)?.total ?? 0;
      if (total + amount < 0)
        return json({
          error: 'Deduction would push balance below 0',
          current_balance: total, requested_deduct: Math.abs(amount),
          shortfall: Math.abs(total + amount),
        }, 409);
    }

    // Write ledger entry
    const { data: ledgerRow, error: ledgerErr } = await sb.from('bj_credit_ledger').insert({
      user_id, bucket: 'award', event_type: 'admin_adjustment',
      amount, notes: reason.trim(),
    }).select('id').single();

    if (ledgerErr) throw ledgerErr;

    // Write audit log
    await sb.from('admin_audit_log').insert({
      actor_id: profile.id, action: amount > 0 ? 'billing.credit.grant' : 'billing.credit.deduct',
      target_type: 'billing', target_id: user_id,
      after: { ledger_id: ledgerRow!.id, amount, reason: reason.trim() },
      reason: reason.trim(),
    });

    // PostHog
    if (PH_KEY) {
      await fetch('https://app.posthog.com/capture/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: PH_KEY, distinct_id: user_id,
          event: amount > 0 ? 'admin_credits_granted' : 'admin_credits_deducted',
          properties: { amount, reason: reason.trim(), actor_id: profile.id },
        }),
      }).catch(() => {});
    }

    // Return new balance
    const { data: newBal } = await sb.rpc('fn_get_user_credit_balance', { p_user_id: user_id });
    return json({ success: true, amount, balance: newBal });

  } catch (err) {
    console.error('[admin-credit-action]', err);
    // NO SILENT FAILS: PostHog on error
    if (PH_KEY) {
      await fetch('https://app.posthog.com/capture/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: PH_KEY, distinct_id: 'system',
          event: 'admin_credit_action_failed',
          properties: { error: (err as Error).message },
        }),
      }).catch(() => {});
    }
    return json({ error: 'Internal server error' }, 500);
  }
});
