// supabase/functions/hire-fee/index.ts
// Edge Function: Pay-when-hired SetupIntent + charge flow
//
// Endpoints (via action param):
//   POST { action: 'setup' }   → Create SetupIntent for saving payment method
//   POST { action: 'charge', amount_cents: N, job_id: '...' }  → Charge the stored method
//   POST { action: 'status' }  → Get current hire fee settings for the user

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createLogger } from '../_shared/logger.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;

const ALLOWED_ORIGINS = [
  'https://brilliantjobs.app',
  'https://dev.brilliantjobs.app',
  'https://staging.brilliantjobs.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  };
}

async function stripeRequest(method: string, endpoint: string, params?: Record<string, string>) {
  const url = `https://api.stripe.com/v1${endpoint}`;
  const opts: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
  if (params && (method === 'POST' || method === 'PUT')) {
    opts.body = new URLSearchParams(params).toString();
  }
  const res = await fetch(url, opts);
  return res.json();
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok', function: 'hire-fee' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const correlationId = crypto.randomUUID();
  const logger = createLogger('hire-fee', correlationId);

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const sb = createClient(SB_URL, SB_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await sb.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action } = body;

    // Get or create Stripe customer
    const { data: sub } = await sb
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    let stripeCustomerId = sub?.stripe_customer_id;

    if (!stripeCustomerId) {
      // Create Stripe customer
      const customer = await stripeRequest('POST', '/customers', {
        'email': user.email || '',
        'metadata[user_id]': user.id,
        'metadata[source]': 'hire_fee_setup',
      });
      stripeCustomerId = customer.id;

      // Upsert subscription row
      await sb.from('user_subscriptions').upsert({
        user_id: user.id,
        stripe_customer_id: stripeCustomerId,
        tier: sub?.tier || 'free',
        status: sub?.status || 'active',
      }, { onConflict: 'user_id' });
    }

    // ─── Action: Setup ───
    if (action === 'setup') {
      logger.info('Creating SetupIntent for hire fee', { userId: user.id });

      const si = await stripeRequest('POST', '/setup_intents', {
        'customer': stripeCustomerId,
        'usage': 'off_session',
        'metadata[type]': 'hire_fee',
        'metadata[user_id]': user.id,
      });

      if (si.error) {
        logger.error('SetupIntent creation failed', { error: si.error.message });
        return new Response(JSON.stringify({ error: si.error.message }), {
          status: 400,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        });
      }

      logger.info('SetupIntent created', { siId: si.id });

      return new Response(JSON.stringify({
        client_secret: si.client_secret,
        setup_intent_id: si.id,
      }), {
        status: 200,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // ─── Action: Charge ───
    if (action === 'charge') {
      const { amount_cents, job_id, description } = body;

      if (!amount_cents || amount_cents < 100) {
        return new Response(JSON.stringify({ error: 'amount_cents must be >= 100' }), {
          status: 400,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        });
      }

      // Get stored payment method
      const paymentMethodId = sub?.hire_fee_payment_method;
      if (!paymentMethodId) {
        return new Response(JSON.stringify({ error: 'no_payment_method', message: 'No payment method on file. Please set up hire fee authorization first.' }), {
          status: 400,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        });
      }

      logger.info('Charging hire fee', {
        userId: user.id,
        amount: amount_cents,
        jobId: job_id,
      });

      const pi = await stripeRequest('POST', '/payment_intents', {
        'amount': amount_cents.toString(),
        'currency': 'usd',
        'customer': stripeCustomerId,
        'payment_method': paymentMethodId,
        'confirm': 'true',
        'off_session': 'true',
        'description': description || `Brilliant Jobs hire fee — Job ${job_id || 'unknown'}`,
        'metadata[type]': 'hire_fee',
        'metadata[user_id]': user.id,
        'metadata[job_id]': job_id || '',
      });

      if (pi.error) {
        logger.error('Hire fee charge failed', {
          error: pi.error.message,
          code: pi.error.code,
        });

        return new Response(JSON.stringify({
          charged: false,
          error: pi.error.message,
          code: pi.error.code,
        }), {
          status: 200,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        });
      }

      // Update hire fee amount in subscription
      await sb
        .from('user_subscriptions')
        .update({ hire_fee_amount_cents: amount_cents })
        .eq('user_id', user.id);

      // Log to credit ledger for tracking
      await sb.from('credit_ledger').insert({
        user_id: user.id,
        amount: 0,
        balance_after: 0,
        type: 'usage',
        description: `Hire fee charged: $${(amount_cents / 100).toFixed(2)} for job ${job_id || 'unknown'}`,
        cost_category: 'hire_fee',
        stripe_payment_intent_id: pi.id,
      });

      logger.info('Hire fee charged successfully', {
        piId: pi.id,
        amount: amount_cents,
      });

      return new Response(JSON.stringify({
        charged: true,
        payment_intent_id: pi.id,
        amount_cents,
        status: pi.status,
      }), {
        status: 200,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // ─── Action: Status ───
    if (action === 'status') {
      const hasMethod = !!sub?.hire_fee_payment_method;
      let lastCharge = null;

      if (hasMethod) {
        // Get the last hire fee payment
        const { data: lastFee } = await sb
          .from('credit_ledger')
          .select('description,created_at,stripe_payment_intent_id')
          .eq('user_id', user.id)
          .eq('cost_category', 'hire_fee')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        lastCharge = lastFee;
      }

      return new Response(JSON.stringify({
        has_payment_method: hasMethod,
        hire_fee_amount_cents: sub?.hire_fee_amount_cents || null,
        last_charge: lastCharge,
      }), {
        status: 200,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'invalid action — use setup, charge, or status' }), {
      status: 400,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });

  } catch (err) {
    logger.error('Hire fee error', { error: (err as Error).message });
    return new Response(JSON.stringify({ error: 'internal' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
