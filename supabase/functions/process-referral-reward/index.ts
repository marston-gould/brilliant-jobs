// supabase/functions/process-referral-reward/index.ts
// Edge Function: Processes referral rewards after activation
// - Calls process_referral_reward RPC (tier calculation + DB rewards)
// - Grants credits via credit_ledger
// - For paying users: extends Stripe subscription billing period
// - Fires PostHog events for conversion analytics

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;

// ─── Stripe API helper ───
async function stripePost(endpoint: string, body: Record<string, string>) {
  const params = new URLSearchParams(body);
  const res = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  return res.json();
}

async function stripeGet(endpoint: string) {
  const res = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
  });
  return res.json();
}

// ─── Grant credits to credit_ledger ───
async function grantCredits(
  sb: SupabaseClient,
  userId: string,
  amount: number,
  description: string
) {
  // Get current balance
  const { data: latest } = await sb
    .from('credit_ledger')
    .select('balance_after')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const currentBalance = latest?.balance_after || 0;

  await sb.from('credit_ledger').insert({
    user_id: userId,
    type: 'referral_bonus',
    amount: amount,
    balance_after: currentBalance + amount,
    description: description,
    cost_category: 'referral',
    metadata: { source: 'referral_reward' },
  });

  return currentBalance + amount;
}

// ─── Extend Stripe subscription (Pro time reward) ───
async function extendStripeSubscription(
  sb: SupabaseClient,
  userId: string,
  days: number
) {
  // Get user's Stripe subscription
  const { data: sub } = await sb
    .from('user_subscriptions')
    .select('stripe_subscription_id, stripe_customer_id, tier, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (!sub?.stripe_subscription_id) {
    // No active Stripe subscription — Pro time is handled via profiles.pro_bonus_until
    // The RPC already set this. Nothing to do with Stripe.
    return { method: 'profile_bonus', days };
  }

  // User has an active Stripe subscription — extend the billing period
  // by adding a trial extension (moves next billing date forward)
  try {
    const subscription = await stripeGet(`/subscriptions/${sub.stripe_subscription_id}`);
    if (!subscription?.id) {
      return { method: 'profile_bonus', days, error: 'Stripe subscription not found' };
    }

    const currentEnd = subscription.current_period_end;
    const newEnd = currentEnd + (days * 86400); // Add days in seconds

    // Update subscription to extend the trial/billing period
    const updated = await stripePost(`/subscriptions/${sub.stripe_subscription_id}`, {
      'trial_end': newEnd.toString(),
      'proration_behavior': 'none',
    });

    if (updated.error) {
      // If trial_end fails (e.g., sub already has a trial), 
      // fall back to creating an invoice credit
      const creditAmount = Math.round((days / 30) * (sub.tier === 'pro' ? 4000 : 2000)); // cents
      if (creditAmount > 0 && sub.stripe_customer_id) {
        await stripePost('/invoiceitems', {
          'customer': sub.stripe_customer_id,
          'amount': (-creditAmount).toString(),
          'currency': 'usd',
          'description': `Referral reward: ${days} days Pro credit`,
        });
        return { method: 'invoice_credit', days, creditCents: creditAmount };
      }
      return { method: 'profile_bonus', days, stripeError: updated.error.message };
    }

    // Update local subscription record
    await sb
      .from('user_subscriptions')
      .update({
        current_period_end: new Date(newEnd * 1000).toISOString(),
      })
      .eq('user_id', userId);

    return { method: 'trial_extension', days, newEnd };
  } catch (err) {
    return { method: 'profile_bonus', days, error: String(err) };
  }
}

// ─── Main handler ───
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const sb = createClient(SB_URL, SB_KEY);
    const { referral_id } = await req.json();

    if (!referral_id) {
      return new Response(JSON.stringify({ error: 'referral_id required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Call the RPC to process tier calculation + DB rewards
    const { data: result, error: rpcError } = await sb.rpc('process_referral_reward', {
      p_referral_id: referral_id,
    });

    if (rpcError) {
      return new Response(JSON.stringify({ error: rpcError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (result?.error) {
      return new Response(JSON.stringify(result), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Get the referral to find both user IDs
    const { data: referral } = await sb
      .from('referrals')
      .select('referrer_id, referred_id')
      .eq('id', referral_id)
      .single();

    if (!referral) {
      return new Response(JSON.stringify({ ...result, warning: 'Referral not found for post-processing' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Grant credits via credit_ledger (for both parties)
    const rewardsGranted = result.rewards_granted || [];
    const stripeResults: unknown[] = [];

    for (const reward of rewardsGranted) {
      if (reward.type === 'credits' && reward.amount > 0) {
        await grantCredits(
          sb,
          referral.referrer_id,
          reward.amount,
          `Referral reward: Tier ${result.referrer_new_tier} — ${reward.amount} credits`
        );
      }

      if (reward.type === 'pro_time' && reward.days !== 0) {
        // Extend Stripe subscription if applicable
        const stripeResult = await extendStripeSubscription(
          sb,
          referral.referrer_id,
          Math.abs(reward.days)
        );
        stripeResults.push(stripeResult);
      }
    }

    // 4. Grant referred user credits
    const { data: refConfig } = await sb
      .from('referral_config')
      .select('value')
      .eq('key', 'referred_user_reward')
      .single();

    if (refConfig?.value?.credits && referral.referred_id) {
      await grantCredits(
        sb,
        referral.referred_id,
        refConfig.value.credits,
        `Welcome bonus: ${refConfig.value.credits} credits (referral reward)`
      );
    }

    // 5. Handle referred user Pro time via Stripe if applicable
    if (refConfig?.value?.pro_days && referral.referred_id) {
      const refStripe = await extendStripeSubscription(
        sb,
        referral.referred_id,
        refConfig.value.pro_days
      );
      stripeResults.push({ ...refStripe, party: 'referred' });
    }

    return new Response(JSON.stringify({
      ...result,
      stripe: stripeResults,
      credits_granted: true,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
