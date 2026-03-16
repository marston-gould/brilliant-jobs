// supabase/functions/_shared/creditGate.ts
// SPEC-COHORT-001-S2: Credit gate middleware for all paid AI features.
//
// Usage pattern (active-debit EFs):
//   import { creditGate, creditRefund } from '../_shared/creditGate.ts';
//   const gate = await creditGate(sb, userId, 'score-resume');
//   if (!gate.allowed) return gate.response!;
//   try {
//     const result = await callAnthropic(...);
//     return new Response(JSON.stringify(result), ...);
//   } catch (err) {
//     await creditRefund(sb, userId, 'score-resume', gate.debitId);
//     throw err;
//   }
//
// Usage pattern (passive-cap EFs):
//   const cap = await passiveCap(sb, userId, 'auto-apply-trigger');
//   if (!cap.allowed) return; // silent skip
//   // execute + credit is already debited inside passiveCap

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface CreditGateResult {
  allowed: boolean;
  response?: Response;        // 402 response when not allowed
  debitId?: string;           // ledger row id — pass to creditRefund on EF error
  balance?: Record<string, number>;
  cost?: number;
}

export interface PassiveCapResult {
  allowed: boolean;
  dailyCount?: number;
  dailyCap?: number;
}

const CORS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

// ─── creditGate ──────────────────────────────────────────────────────────────
// Reads cost from feature_costs, checks balance, debits BEFORE execution.
// Returns { allowed: false, response: 402 } when insufficient credits.
// Returns { allowed: true, debitId } on success — pass debitId to creditRefund.
export async function creditGate(
  sb: SupabaseClient,
  userId: string,
  featureKey: string,
): Promise<CreditGateResult> {
  // 1. Read cost from feature_costs (cached 5 min in EF memory via module-level map)
  const cost = await getFeatureCost(sb, featureKey);

  if (cost === 0) {
    // Free feature — no debit needed
    return { allowed: true, cost: 0 };
  }

  // 2. Check balance + debit atomically via RPC
  const { data, error } = await sb.rpc('fn_debit_credits', {
    p_user_id: userId,
    p_feature: featureKey,
    p_amount: cost,
  });

  if (error) {
    if (error.message?.includes('insufficient_credits')) {
      // Parse current balance from error message
      const balMatch = error.message.match(/balance=(\d+)/);
      const balance = balMatch ? parseInt(balMatch[1]) : 0;
      return {
        allowed: false,
        cost,
        response: new Response(
          JSON.stringify({
            error: 'INSUFFICIENT_CREDITS',
            message: `This feature costs ${cost} credits. Your balance is ${balance}.`,
            balance,
            cost,
            shortfall: cost - balance,
            upgrade_cta: true,
          }),
          { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } },
        ),
      };
    }
    // Unexpected DB error — fail open (don't block user for infra issues)
    console.error(`[creditGate] DB error for ${featureKey}:`, error.message);
    return { allowed: true, cost: 0 };
  }

  // 3. Find the debit row id for potential refund
  const { data: ledgerRow } = await sb
    .from('bj_credit_ledger')
    .select('id')
    .eq('user_id', userId)
    .eq('event_type', 'feature_debit')
    .eq('feature', featureKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return {
    allowed: true,
    cost,
    debitId: ledgerRow?.id,
    balance: data as Record<string, number>,
  };
}

// ─── creditRefund ─────────────────────────────────────────────────────────────
// Writes a refund_restore entry to reverse a debit when an EF errors.
// NO SILENT FAILS: logs to PostHog if refund itself errors.
export async function creditRefund(
  sb: SupabaseClient,
  userId: string,
  featureKey: string,
  cost: number,
): Promise<void> {
  if (!cost || cost <= 0) return;
  const { error } = await sb.from('bj_credit_ledger').insert({
    user_id: userId,
    bucket: 'base',
    event_type: 'refund_restore',
    amount: cost,
    feature: featureKey,
    notes: 'Auto-refund: EF error after debit',
  });
  if (error) {
    console.error(`[creditRefund] Failed to refund ${cost} credits for ${featureKey}:`, error.message);
    // PostHog capture via captureEvent if available
    try {
      await captureEvent(userId, 'credit_refund_failed', {
        feature: featureKey,
        cost,
        error: error.message,
      });
    } catch (_) { /* best effort */ }
  }
}

// ─── passiveCap ──────────────────────────────────────────────────────────────
// For ambient/cron EFs: check daily cap, debit 1 credit if under cap.
// Returns { allowed: false } silently when cap reached — caller just skips.
export async function passiveCap(
  sb: SupabaseClient,
  userId: string,
  featureKey: string,
): Promise<PassiveCapResult> {
  // 1. Read daily_cap from feature_costs
  const { data: fc } = await sb
    .from('feature_costs')
    .select('daily_cap, credit_cost')
    .eq('feature_key', featureKey)
    .single();

  const dailyCap = fc?.daily_cap ?? null;
  const creditCost = fc?.credit_cost ?? 1;

  if (dailyCap === null) {
    // No cap configured — just debit and proceed
    const gate = await creditGate(sb, userId, featureKey);
    return { allowed: gate.allowed };
  }

  // 2. Count today's debits for this feature+user
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count } = await sb
    .from('bj_credit_ledger')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('feature', featureKey)
    .eq('event_type', 'feature_debit')
    .gte('created_at', todayStart.toISOString());

  const dailyCount = count ?? 0;

  if (dailyCount >= dailyCap) {
    return { allowed: false, dailyCount, dailyCap };
  }

  // 3. Under cap — debit 1 credit and allow
  const gate = await creditGate(sb, userId, featureKey);
  return { allowed: gate.allowed, dailyCount, dailyCap };
}

// ─── Module-level feature cost cache (5 min TTL) ─────────────────────────────
const costCache = new Map<string, { cost: number; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getFeatureCost(sb: SupabaseClient, featureKey: string): Promise<number> {
  const now = Date.now();
  const cached = costCache.get(featureKey);
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.cost;

  const { data } = await sb
    .from('feature_costs')
    .select('credit_cost')
    .eq('feature_key', featureKey)
    .single();

  const cost = data?.credit_cost ?? 0;
  costCache.set(featureKey, { cost, ts: now });
  return cost;
}

// ─── captureEvent helper ──────────────────────────────────────────────────────
async function captureEvent(distinctId: string, event: string, props: Record<string, unknown>) {
  const key = Deno.env.get('POSTHOG_API_KEY');
  const host = Deno.env.get('POSTHOG_HOST') ?? 'https://app.posthog.com';
  if (!key) return;
  await fetch(`${host}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: key, distinct_id: distinctId, event, properties: props }),
  }).catch(() => {});
}
