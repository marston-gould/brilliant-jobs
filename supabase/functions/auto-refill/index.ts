// supabase/functions/auto-refill/index.ts
// Edge Function: Checks if a user needs auto-refill after a credit debit
// Called by: debit_credits RPC via pg_net (or directly by other Edge Functions)
// Flow: check balance → check settings → charge Stripe → grant credits via webhook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createLogger } from '../_shared/logger.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

// Auto-refill price IDs (from Stripe product setup)
const REFILL_PRICES: Record<string, { price_id: string; amount_cents: number }> = {
  low:    { price_id: 'price_1T3iJVAUKPQHZOPaDJ6HjrNC', amount_cents: 100 },
  medium: { price_id: 'price_1T3iJVAUKPQHZOPanDBwEDhg', amount_cents: 500 },
  high:   { price_id: 'price_1T3iJWAUKPQHZOPamNB6VXdl', amount_cents: 1000 },
};

async function stripePost(endpoint: string, params: Record<string, string>) {
  const body = new URLSearchParams(params);
  const res = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  return res.json();
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Health check
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok', function: 'auto-refill' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const correlationId = crypto.randomUUID();
  const logger = createLogger('auto-refill', correlationId);

  try {
    const body = await req.json();
    const { user_id } = body;

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const sb = createClient(SB_URL, SB_KEY);

    // 1. Check current balance
    const { data: balance } = await sb.rpc('get_credit_balance', { p_user_id: user_id });
    logger.info('Balance check', { userId: user_id, balance });

    // 2. Check auto-refill settings
    const { data: settings } = await sb
      .from('auto_refill_settings')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (!settings?.enabled) {
      logger.info('Auto-refill not enabled', { userId: user_id });
      return new Response(JSON.stringify({ refilled: false, reason: 'not_enabled' }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 3. Check if balance is at or below threshold
    const threshold = settings.threshold_credits || 0;
    if (balance > threshold) {
      logger.info('Balance above threshold', { userId: user_id, balance, threshold });
      return new Response(JSON.stringify({ refilled: false, reason: 'above_threshold' }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 4. Get user's Stripe customer + payment method
    const { data: sub } = await sb
      .from('user_subscriptions')
      .select('stripe_customer_id, tier')
      .eq('user_id', user_id)
      .single();

    if (!sub?.stripe_customer_id) {
      logger.warn('No Stripe customer for auto-refill', { userId: user_id });
      return new Response(JSON.stringify({ refilled: false, reason: 'no_customer' }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 5. Get default payment method
    const paymentMethodId = settings.stripe_payment_method_id;
    if (!paymentMethodId) {
      // Try to get default from Stripe customer
      const customer = await stripePost(`/customers/${sub.stripe_customer_id}`, {});
      // Fall through — Stripe will use the default payment method
    }

    // 6. Create PaymentIntent for auto-refill
    const refillConfig = REFILL_PRICES[settings.refill_level] || REFILL_PRICES.low;

    const piParams: Record<string, string> = {
      'amount': refillConfig.amount_cents.toString(),
      'currency': 'usd',
      'customer': sub.stripe_customer_id,
      'confirm': 'true',
      'off_session': 'true',
      'metadata[type]': 'auto_refill',
      'metadata[user_id]': user_id,
      'metadata[refill_level]': settings.refill_level,
      'metadata[tier]': sub.tier || 'free',
    };

    if (paymentMethodId) {
      piParams['payment_method'] = paymentMethodId;
    }

    logger.info('Creating auto-refill PaymentIntent', {
      userId: user_id,
      level: settings.refill_level,
      amount: refillConfig.amount_cents,
    });

    const pi = await stripePost('/payment_intents', piParams);

    if (pi.error) {
      logger.error('Auto-refill payment failed', {
        userId: user_id,
        error: pi.error.message,
        code: pi.error.code,
      });

      // If payment fails, disable auto-refill to prevent retry loops
      if (pi.error.code === 'card_declined' || pi.error.code === 'expired_card') {
        await sb
          .from('auto_refill_settings')
          .update({ enabled: false })
          .eq('user_id', user_id);
        logger.warn('Auto-refill disabled due to payment failure', { userId: user_id });
      }

      return new Response(JSON.stringify({ refilled: false, reason: 'payment_failed', error: pi.error.message }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Success — credits will be granted by the stripe-webhook when payment_intent.succeeded fires
    logger.info('Auto-refill payment succeeded', {
      userId: user_id,
      piId: pi.id,
      amount: refillConfig.amount_cents,
      status: pi.status,
    });

    return new Response(JSON.stringify({
      refilled: true,
      payment_intent_id: pi.id,
      amount_cents: refillConfig.amount_cents,
      level: settings.refill_level,
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    logger.error('Auto-refill error', { error: (err as Error).message });
    return new Response(JSON.stringify({ error: 'internal' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
