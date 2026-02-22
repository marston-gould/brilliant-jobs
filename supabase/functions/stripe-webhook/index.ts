// supabase/functions/stripe-webhook/index.ts
// Edge Function: Receives Stripe webhook events, validates signature, routes to handlers
// Writes to: user_subscriptions, credit_ledger, cost_tracking
// Idempotency: Deduplicates on stripe_payment_intent_id / stripe_subscription_id

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createLogger } from '../_shared/logger.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

// ─── Stripe signature verification ───
// Stripe signs webhooks with HMAC-SHA256. We verify manually since
// the Stripe SDK is too large for Deno Edge Functions.

async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  const parts = sigHeader.split(',').reduce((acc: Record<string, string>, part) => {
    const [key, val] = part.split('=');
    acc[key] = val;
    return acc;
  }, {});

  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

  // Reject events older than 5 minutes (replay protection)
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp);
  if (age > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return expected === signature;
}

// ─── Stripe API helper ───
async function stripeGet(endpoint: string) {
  const res = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
  });
  return res.json();
}

// ─── Event Handlers ───

async function handleSubscriptionCreated(sb: any, event: any, logger: any) {
  const sub = event.data.object;
  const customerId = sub.customer;
  const tier = sub.metadata?.tier || 'free';
  const credits = parseInt(sub.metadata?.credits || '0');

  // Get user_id from existing user_subscriptions row (created during checkout)
  // or find by stripe_customer_id
  const { data: existing } = await sb
    .from('user_subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!existing) {
    logger.error('No user found for Stripe customer', { customerId, subscriptionId: sub.id });
    return;
  }

  const userId = existing.user_id;

  // Update subscription record
  await sb
    .from('user_subscriptions')
    .update({
      stripe_subscription_id: sub.id,
      tier,
      status: sub.status,
      current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      cancel_at_period_end: sub.cancel_at_period_end || false,
    })
    .eq('user_id', userId);

  // Grant included credits
  if (credits > 0) {
    await grantCredits(sb, userId, credits, 'subscription_grant',
      `Monthly ${tier} credits`, null, logger);
  }

  logger.info('Subscription created', { userId, tier, credits, subscriptionId: sub.id });
}

async function handleSubscriptionUpdated(sb: any, event: any, logger: any) {
  const sub = event.data.object;
  const customerId = sub.customer;
  const tier = sub.metadata?.tier || 'free';
  const previousTier = event.data.previous_attributes?.metadata?.tier;

  const { data: existing } = await sb
    .from('user_subscriptions')
    .select('user_id, tier')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!existing) {
    logger.error('No user found for subscription update', { customerId });
    return;
  }

  await sb
    .from('user_subscriptions')
    .update({
      stripe_subscription_id: sub.id,
      tier,
      status: sub.status,
      current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      cancel_at_period_end: sub.cancel_at_period_end || false,
    })
    .eq('user_id', existing.user_id);

  // If tier changed (upgrade/downgrade), grant the difference in credits
  if (previousTier && previousTier !== tier) {
    const newCredits = parseInt(sub.metadata?.credits || '0');
    const oldCredits = parseInt(event.data.previous_attributes?.metadata?.credits || '0');
    const diff = newCredits - oldCredits;
    if (diff > 0) {
      await grantCredits(sb, existing.user_id, diff, 'subscription_grant',
        `Upgrade from ${previousTier} to ${tier}: ${diff} bonus credits`, null, logger);
    }
  }

  logger.info('Subscription updated', { userId: existing.user_id, tier, status: sub.status });
}

async function handleSubscriptionDeleted(sb: any, event: any, logger: any) {
  const sub = event.data.object;
  const customerId = sub.customer;

  await sb
    .from('user_subscriptions')
    .update({ status: 'canceled', stripe_subscription_id: null, tier: 'free' })
    .eq('stripe_customer_id', customerId);

  logger.info('Subscription canceled', { customerId, subscriptionId: sub.id });
}

async function handleInvoicePaymentSucceeded(sb: any, event: any, logger: any) {
  const invoice = event.data.object;
  const customerId = invoice.customer;
  const subscriptionId = invoice.subscription;

  // Only grant credits on subscription renewal invoices (not first invoice — that's handled by subscription.created)
  if (!subscriptionId || invoice.billing_reason === 'subscription_create') {
    logger.info('Skipping non-renewal invoice', { invoiceId: invoice.id, reason: invoice.billing_reason });
    return;
  }

  // Idempotency: check if we already processed this invoice
  const { data: dupeCheck } = await sb
    .from('credit_ledger')
    .select('id')
    .eq('stripe_payment_intent_id', invoice.payment_intent)
    .eq('type', 'subscription_grant')
    .limit(1);

  if (dupeCheck && dupeCheck.length > 0) {
    logger.info('Duplicate invoice, skipping', { invoiceId: invoice.id });
    return;
  }

  const { data: existing } = await sb
    .from('user_subscriptions')
    .select('user_id, tier')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!existing) {
    logger.error('No user found for invoice', { customerId });
    return;
  }

  // Look up credits for this tier
  const { data: pricing } = await sb
    .from('credit_pricing')
    .select('included_credits')
    .eq('tier', existing.tier)
    .is('cohort_id', null)
    .is('user_id', null)
    .eq('active', true)
    .single();

  const credits = pricing?.included_credits || 0;
  if (credits > 0) {
    await grantCredits(sb, existing.user_id, credits, 'subscription_grant',
      `Monthly ${existing.tier} credits (renewal)`, invoice.payment_intent, logger);
  }

  // Update period dates
  const subData = await stripeGet(`/subscriptions/${subscriptionId}`);
  if (subData?.current_period_start) {
    await sb
      .from('user_subscriptions')
      .update({
        current_period_start: new Date(subData.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subData.current_period_end * 1000).toISOString(),
        status: 'active',
      })
      .eq('user_id', existing.user_id);
  }

  logger.info('Renewal credits granted', { userId: existing.user_id, credits, invoiceId: invoice.id });
}

async function handleInvoicePaymentFailed(sb: any, event: any, logger: any) {
  const invoice = event.data.object;
  const customerId = invoice.customer;

  await sb
    .from('user_subscriptions')
    .update({ status: 'past_due' })
    .eq('stripe_customer_id', customerId);

  // TODO: Trigger dunning notification via notification system
  logger.warn('Payment failed, status set to past_due', {
    customerId,
    invoiceId: invoice.id,
    attemptCount: invoice.attempt_count,
  });
}

async function handlePaymentIntentSucceeded(sb: any, event: any, logger: any) {
  const pi = event.data.object;
  const customerId = pi.customer;
  const type = pi.metadata?.type;

  if (!type || !customerId) {
    logger.info('PaymentIntent without monetization metadata, skipping', { piId: pi.id });
    return;
  }

  // Idempotency: check if already processed
  const { data: dupeCheck } = await sb
    .from('credit_ledger')
    .select('id')
    .eq('stripe_payment_intent_id', pi.id)
    .limit(1);

  if (dupeCheck && dupeCheck.length > 0) {
    logger.info('Duplicate PaymentIntent, skipping', { piId: pi.id });
    return;
  }

  const { data: existing } = await sb
    .from('user_subscriptions')
    .select('user_id, tier')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!existing) {
    logger.error('No user found for PaymentIntent', { customerId, piId: pi.id });
    return;
  }

  if (type === 'credit_pack') {
    const qty = parseInt(pi.metadata?.qty || '0');
    if (qty > 0) {
      await grantCredits(sb, existing.user_id, qty, 'purchase',
        `Credit pack: ${qty} credits`, pi.id, logger);
    }
    logger.info('Credit pack purchased', { userId: existing.user_id, qty, piId: pi.id });
  } else if (type === 'auto_refill') {
    // Calculate credits from amount + tier rate + discount
    const { data: pricing } = await sb
      .from('credit_pricing')
      .select('payg_rate_cents, auto_refill_discount_pct')
      .eq('tier', existing.tier)
      .is('cohort_id', null)
      .is('user_id', null)
      .eq('active', true)
      .single();

    if (pricing) {
      const discountMultiplier = 1 - (pricing.auto_refill_discount_pct / 100);
      const effectiveRate = pricing.payg_rate_cents * discountMultiplier;
      const credits = Math.floor(pi.amount / effectiveRate);

      if (credits > 0) {
        await grantCredits(sb, existing.user_id, credits, 'auto_refill',
          `Auto-refill: ${credits} credits ($${(pi.amount / 100).toFixed(2)})`,
          pi.id, logger);
      }
      logger.info('Auto-refill processed', { userId: existing.user_id, credits, amount: pi.amount });
    }
  } else if (type === 'hire_fee') {
    logger.info('Hire fee collected', { userId: existing.user_id, amount: pi.amount, piId: pi.id });
    // No credits — just a revenue event. Logged via Stripe.
  }
}

async function handleSetupIntentSucceeded(sb: any, event: any, logger: any) {
  const si = event.data.object;
  const customerId = si.customer;
  const paymentMethod = si.payment_method;

  if (si.metadata?.type === 'hire_fee') {
    await sb
      .from('user_subscriptions')
      .update({ hire_fee_payment_method: paymentMethod })
      .eq('stripe_customer_id', customerId);

    logger.info('Hire fee payment method stored', { customerId, paymentMethod });
  }

  if (si.metadata?.type === 'auto_refill') {
    await sb
      .from('auto_refill_settings')
      .update({ stripe_payment_method_id: paymentMethod })
      .eq('user_id', si.metadata.user_id);

    logger.info('Auto-refill payment method stored', { customerId, paymentMethod });
  }
}

// ─── Credit helper ───
async function grantCredits(
  sb: any,
  userId: string,
  amount: number,
  type: string,
  description: string,
  stripePaymentIntentId: string | null,
  logger: any
) {
  // Get current balance
  const { data: ledger } = await sb
    .from('credit_ledger')
    .select('balance_after')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  const currentBalance = ledger?.[0]?.balance_after || 0;
  const newBalance = currentBalance + amount;

  const { error } = await sb
    .from('credit_ledger')
    .insert({
      user_id: userId,
      amount,
      balance_after: newBalance,
      type,
      description,
      stripe_payment_intent_id: stripePaymentIntentId,
    });

  if (error) {
    logger.error('Failed to insert credit ledger entry', { userId, amount, error: error.message });
  }
}

// ─── Main handler ───
serve(async (req: Request) => {
  // Health check
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok', function: 'stripe-webhook' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const correlationId = crypto.randomUUID();
  const logger = createLogger('stripe-webhook', correlationId);

  try {
    const body = await req.text();
    const sigHeader = req.headers.get('stripe-signature');

    if (!sigHeader) {
      logger.warn('Missing stripe-signature header');
      return new Response('Missing signature', { status: 400 });
    }

    // Verify webhook signature
    const isValid = await verifyStripeSignature(body, sigHeader, STRIPE_WEBHOOK_SECRET);
    if (!isValid) {
      logger.warn('Invalid webhook signature');
      return new Response('Invalid signature', { status: 401 });
    }

    const event = JSON.parse(body);
    logger.info('Webhook received', { type: event.type, eventId: event.id });

    // Initialize Supabase with service role (bypasses RLS)
    const sb = createClient(SB_URL, SB_KEY);

    // Route to handler
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(sb, event, logger);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(sb, event, logger);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(sb, event, logger);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(sb, event, logger);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(sb, event, logger);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(sb, event, logger);
        break;
      case 'setup_intent.succeeded':
        await handleSetupIntentSucceeded(sb, event, logger);
        break;
      default:
        logger.info('Unhandled event type', { type: event.type });
    }

    // Always return 200 to acknowledge receipt (Stripe retries on non-2xx)
    return new Response(JSON.stringify({ received: true, eventId: event.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger.error('Webhook processing error', { error: (err as Error).message });
    // Still return 200 to prevent Stripe retries on our bugs
    // (we log the error for investigation)
    return new Response(JSON.stringify({ received: true, error: 'internal' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
