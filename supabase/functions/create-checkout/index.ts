// supabase/functions/create-checkout/index.ts
// Edge Function: Creates Stripe Checkout Sessions for subscriptions and credit purchases
// Called by frontend with user's auth token + desired product
// Returns Stripe Checkout URL for redirect

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createLogger } from '../_shared/logger.ts';
import { API_VERSION } from '../_shared/api-version.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

// Stripe Price IDs — mapped from products created in sandbox
const SUBSCRIPTION_PRICES: Record<string, string> = {
  starter: 'price_1T3lhQPKzCZbw3Kz9OoxONgx',
  pro: 'price_1T3lhRPKzCZbw3KzoLVOrwko',
};

// Credit pack prices by tier
const CREDIT_PACK_PRICES: Record<string, Record<number, string>> = {
  free: {
    10: 'price_1T3lhQPKzCZbw3KzKozfO54O',
    50: 'price_1T3lhVPKzCZbw3KzpVWouDwt',
    100: 'price_1T3lhRPKzCZbw3KzEQl741il',
  },
  starter: {
    10: 'price_1T3lhQPKzCZbw3KzDsxRAB2V',
    50: 'price_1T3lhVPKzCZbw3KzAgGq4Krd',
    100: 'price_1T3lhQPKzCZbw3KzWBBm6GLX',
  },
  pro: {
    10: 'price_1T3lhQPKzCZbw3KzH3Kbsroo',
    50: 'price_1T3lhVPKzCZbw3Kztihvrdpa',
    100: 'price_1T3lhQPKzCZbw3KzvmtrKqUy',
  },
};

// ─── Stripe API helper ───
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

async function stripeGet(endpoint: string) {
  const res = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
  });
  return res.json();
}

// ─── Get or create Stripe customer ───
async function getOrCreateStripeCustomer(
  sb: SupabaseClient,
  userId: string,
  email: string,
  logger: Logger
): Promise<string> {
  // Check if user already has a stripe customer
  const { data: sub } = await sb
    .from('user_subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .single();

  if (sub?.stripe_customer_id) {
    return sub.stripe_customer_id;
  }

  // Create Stripe customer
  const customer = await stripePost('/customers', {
    email,
    'metadata[user_id]': userId,
    'metadata[source]': 'brilliant_jobs',
  });

  if (customer.error) {
    logger.error('Failed to create Stripe customer', { error: customer.error.message });
    throw new Error('Failed to create Stripe customer');
  }

  // Create user_subscriptions row (free tier by default)
  await sb
    .from('user_subscriptions')
    .upsert({
      user_id: userId,
      stripe_customer_id: customer.id,
      tier: 'free',
      status: 'active',
    }, { onConflict: 'user_id' });

  logger.info('Stripe customer created', { userId, customerId: customer.id });
  return customer.id;
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  const correlationId = crypto.randomUUID();
  const logger = createLogger('create-checkout', correlationId);

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const sb = createClient(SB_URL, SB_KEY);
    const anonClient = createClient(SB_URL, Deno.env.get('SUPABASE_ANON_KEY') || SB_KEY);

    // Get user from JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // CS-015: CE-001 — Rate limit: 10 checkout sessions/hour per user
    try {
      const { data: allowed } = await sb.rpc('check_ef_rate_limit', {
        p_function_name: 'create-checkout',
        p_caller_id: user.id,
        p_max_calls: 10,
        p_window_minutes: 60,
      });
      if (allowed === false) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Max 10 checkout sessions per hour.' }),
          { status: 429, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json',
  'x-api-version': API_VERSION, 'Retry-After': '3600' } }
        );
      }
    } catch (e) {
      console.warn('[create-checkout] Rate limit check failed:', e.message);
    }

    const body = await req.json();
    const { mode, tier, pack_qty } = body;
    // mode: 'subscription' | 'credit_pack'
    // tier: 'starter' | 'pro' (for subscriptions)
    // pack_qty: 10 | 50 | 100 (for credit packs)

    const successUrl = 'https://brilliantjobs.app/dashboard.html?payment=success';
    const cancelUrl = 'https://brilliantjobs.app/dashboard.html?payment=canceled';

    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(sb, user.id, user.email!, logger);

    let sessionParams: Record<string, string>;

    if (mode === 'subscription') {
      // ─── Subscription checkout ───
      const priceId = SUBSCRIPTION_PRICES[tier];
      if (!priceId) {
        return new Response(JSON.stringify({ error: 'Invalid tier' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      sessionParams = {
        'customer': customerId,
        'mode': 'subscription',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'success_url': successUrl,
        'cancel_url': cancelUrl,
        'subscription_data[metadata][tier]': tier,
        'subscription_data[metadata][credits]': tier === 'starter' ? '100' : '300',
        'subscription_data[metadata][user_id]': user.id,
      };

      logger.info('Creating subscription checkout', { userId: user.id, tier });

    } else if (mode === 'credit_pack') {
      // ─── Credit pack checkout ───
      // Look up user's current tier for pricing
      const { data: userSub } = await sb
        .from('user_subscriptions')
        .select('tier')
        .eq('user_id', user.id)
        .single();

      const userTier = userSub?.tier || 'free';
      const tierPrices = CREDIT_PACK_PRICES[userTier];
      const priceId = tierPrices?.[pack_qty];

      if (!priceId) {
        return new Response(JSON.stringify({ error: 'Invalid pack size' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      sessionParams = {
        'customer': customerId,
        'mode': 'payment',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'success_url': successUrl,
        'cancel_url': cancelUrl,
        'payment_intent_data[metadata][type]': 'credit_pack',
        'payment_intent_data[metadata][qty]': pack_qty.toString(),
        'payment_intent_data[metadata][tier]': userTier,
        'payment_intent_data[metadata][user_id]': user.id,
      };

      logger.info('Creating credit pack checkout', { userId: user.id, qty: pack_qty, tier: userTier });

    } else {
      return new Response(JSON.stringify({ error: 'Invalid mode. Use "subscription" or "credit_pack"' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Create Stripe Checkout Session
    const session = await stripePost('/checkout/sessions', sessionParams);

    if (session.error) {
      logger.error('Stripe checkout session failed', { error: session.error.message });
      return new Response(JSON.stringify({ error: 'Failed to create checkout session' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    logger.info('Checkout session created', { sessionId: session.id, url: session.url });

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    logger.error('Checkout error', { error: (err as Error).message });
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
