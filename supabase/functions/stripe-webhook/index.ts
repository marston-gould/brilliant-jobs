// supabase/functions/stripe-webhook/index.ts
// Edge Function: Receives Stripe webhook events, validates signature, routes to handlers
// Writes to: user_subscriptions, credit_ledger, cost_tracking
// Idempotency: Deduplicates on stripe_payment_intent_id / stripe_subscription_id
// v2 (v6.18): Wires billing notifications through send-notification for all 9 billing types

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createLogger } from '../_shared/logger.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

// ─── Notification helper ───
// Calls send-notification Edge Function to route billing notifications
// through the standard pipeline (admin config, classification, opt-in, prefs, quiet hours)
async function callSendNotification(params: {
  user_id: string;
  notification_type: string;
  payload: Record<string, unknown>;
}) {
  try {
    const res = await fetch(`${SB_URL}/functions/v1/send-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SB_KEY}`,
      },
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch (e) {
    console.error('[billing-notif] send-notification call failed:', (e as Error).message);
    return { error: (e as Error).message };
  }
}

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

async function handleSubscriptionCreated(sb: SupabaseClient, event: unknown, logger: Logger) {
  const sub = event.data.object;
  const customerId = sub.customer;
  const tier = sub.metadata?.tier || 'free';
  const credits = parseInt(sub.metadata?.credits || '0');

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

  // ─── FB-TRIAL-001-S2: Set user_state to active_pro on subscription ───
  // Covers mid-trial subscription (user upgrades before trial expires)
  await sb
    .from('profiles')
    .update({ user_state: 'active_pro' })
    .eq('id', userId);
  logger.info('Set user_state to active_pro', { userId });

  // Grant included credits
  if (credits > 0) {
    await grantCredits(sb, userId, credits, 'subscription_grant',
      `Monthly ${tier} credits`, null, logger);
  }

  // ── NOTIFICATION: subscription_confirm ──
  // Required transactional — always sends (user cannot disable)
  const periodEnd = new Date(sub.current_period_end * 1000);
  await callSendNotification({
    user_id: userId,
    notification_type: 'subscription_confirm',
    payload: {
      tier,
      credits_granted: credits,
      payment_method_last4: sub.default_payment_method ? '****' : null,
      billing_period_start: new Date(sub.current_period_start * 1000).toISOString(),
      billing_period_end: periodEnd.toISOString(),
      next_renewal_date: periodEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      is_new_subscription: true,
      stripe_receipt_url: null, // Populated from invoice if available
    },
  });

  logger.info('Subscription created + notification sent', { userId, tier, credits, subscriptionId: sub.id });
}

async function handleSubscriptionUpdated(sb: SupabaseClient, event: unknown, logger: Logger) {
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

  // ─── FB-TRIAL-001-S2: Sync user_state with subscription status ───
  if (sub.status === 'active' || sub.status === 'trialing') {
    await sb
      .from('profiles')
      .update({ user_state: 'active_pro' })
      .eq('id', existing.user_id);
  }

  // ─── SPEC-COHORT-001-S3: Sync cohort_tier_id and replenish credits ───
  try {
    const newSlug = tier === 'pro' ? 'pro' : tier === 'starter' ? 'starter' : 'free';
    const { data: cohortTier } = await sb
      .from('cohort_tiers')
      .select('id')
      .eq('slug', newSlug)
      .single();

    if (cohortTier?.id) {
      const { data: currentProfile } = await sb
        .from('profiles')
        .select('cohort_tier_id')
        .eq('id', existing.user_id)
        .single();

      const tierChanged = currentProfile?.cohort_tier_id !== cohortTier.id;

      await sb
        .from('profiles')
        .update({ cohort_tier_id: cohortTier.id, cohort_tier_assigned_at: new Date().toISOString() })
        .eq('id', existing.user_id);

      // Replenish credits when tier changes or subscription renews
      if (tierChanged || sub.status === 'active') {
        const SB_URL = Deno.env.get('SUPABASE_URL')!;
        const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        await fetch(`${SB_URL}/functions/v1/replenish-credits`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SB_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ user_id: existing.user_id }),
        }).catch(e => logger.warn('replenish-credits call failed', { error: e.message }));
      }
    }
  } catch (cohortErr) {
    logger.error('cohort_tier_id sync failed', { error: (cohortErr as Error).message });
    // Non-fatal — subscription update itself succeeded
  }

  // If tier changed (upgrade/downgrade), grant the difference in credits
  if (previousTier && previousTier !== tier) {
    const newCredits = parseInt(sub.metadata?.credits || '0');
    const oldCredits = parseInt(event.data.previous_attributes?.metadata?.credits || '0');
    const diff = newCredits - oldCredits;
    if (diff > 0) {
      await grantCredits(sb, existing.user_id, diff, 'subscription_grant',
        `Upgrade from ${previousTier} to ${tier}: ${diff} bonus credits`, null, logger);
    }

    // ── NOTIFICATION: plan_change_confirm ──
    // Required transactional — always sends
    await callSendNotification({
      user_id: existing.user_id,
      notification_type: 'plan_change_confirm',
      payload: {
        old_tier: previousTier,
        new_tier: tier,
        effective_date: new Date().toISOString(),
        prorated_credit: diff > 0 ? diff : 0,
        features_gained: tier === 'pro' ? ['Unlimited applications', 'AI resume rewriting', 'Priority support'] : [],
        features_lost: tier === 'free' ? ['AI resume rewriting', 'Priority support'] : [],
      },
    });

    logger.info('Plan change notification sent', { userId: existing.user_id, from: previousTier, to: tier });
  }

  // ── Handle cancellation notification ──
  if (sub.cancel_at_period_end && !event.data.previous_attributes?.cancel_at_period_end) {
    const periodEnd = new Date(sub.current_period_end * 1000);
    await callSendNotification({
      user_id: existing.user_id,
      notification_type: 'subscription_cancelled',
      payload: {
        tier,
        access_until: periodEnd.toISOString(),
        access_until_display: periodEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        win_back_discount_pct: 0, // Configurable per cohort in admin
      },
    });

    logger.info('Cancellation notification sent', { userId: existing.user_id, accessUntil: periodEnd.toISOString() });
  }

  logger.info('Subscription updated', { userId: existing.user_id, tier, status: sub.status });
}

async function handleSubscriptionDeleted(sb: SupabaseClient, event: unknown, logger: Logger) {
  const sub = event.data.object;
  const customerId = sub.customer;

  const { data: existing } = await sb
    .from('user_subscriptions')
    .select('user_id, tier')
    .eq('stripe_customer_id', customerId)
    .single();

  await sb
    .from('user_subscriptions')
    .update({ status: 'canceled', stripe_subscription_id: null, tier: 'free' })
    .eq('stripe_customer_id', customerId);

  // ─── FB-TRIAL-001-S2: Set user_state to expired_free + reset samples ───
  // Churned users get fresh samples as a re-engagement hook (spec 3.5 item 9)
  if (existing) {
    await sb
      .from('profiles')
      .update({ user_state: 'expired_free', feature_samples_used: '{}' })
      .eq('id', existing.user_id);
    logger.info('Set user_state to expired_free + reset samples', { userId: existing.user_id });
  }

  // ── NOTIFICATION: subscription_cancelled (if not already sent on cancel_at_period_end) ──
  if (existing) {
    await callSendNotification({
      user_id: existing.user_id,
      notification_type: 'subscription_cancelled',
      payload: {
        tier: existing.tier || 'free',
        access_until: new Date().toISOString(),
        access_until_display: 'now',
        win_back_discount_pct: 0,
        is_immediate: true,
      },
    });
  }

  logger.info('Subscription canceled', { customerId, subscriptionId: sub.id });
}

async function handleInvoicePaymentSucceeded(sb: SupabaseClient, event: unknown, logger: Logger) {
  const invoice = event.data.object;
  const customerId = invoice.customer;
  const subscriptionId = invoice.subscription;

  // Only grant credits on subscription renewal invoices (not first invoice — that's handled by subscription.created)
  if (!subscriptionId || invoice.billing_reason === 'subscription_create') {
    // ── NOTIFICATION: invoice_generated (for first invoice) ──
    if (invoice.billing_reason === 'subscription_create') {
      const { data: user } = await sb
        .from('user_subscriptions')
        .select('user_id, tier')
        .eq('stripe_customer_id', customerId)
        .single();

      if (user) {
        await callSendNotification({
          user_id: user.user_id,
          notification_type: 'invoice_generated',
          payload: {
            invoice_id: invoice.id,
            amount_paid: (invoice.amount_paid / 100).toFixed(2),
            currency: (invoice.currency || 'usd').toUpperCase(),
            billing_reason: 'new_subscription',
            tier: user.tier,
            invoice_pdf_url: invoice.invoice_pdf || null,
            hosted_invoice_url: invoice.hosted_invoice_url || null,
          },
        });
      }
    }

    logger.info('Skipping non-renewal invoice credit grant', { invoiceId: invoice.id, reason: invoice.billing_reason });
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

  // ── NOTIFICATION: subscription_confirm (renewal) + invoice_generated ──
  const periodEnd = subData?.current_period_end
    ? new Date(subData.current_period_end * 1000)
    : new Date();

  await callSendNotification({
    user_id: existing.user_id,
    notification_type: 'subscription_confirm',
    payload: {
      tier: existing.tier,
      credits_granted: credits,
      billing_period_end: periodEnd.toISOString(),
      next_renewal_date: periodEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      is_new_subscription: false,
      stripe_receipt_url: invoice.hosted_invoice_url || null,
    },
  });

  await callSendNotification({
    user_id: existing.user_id,
    notification_type: 'invoice_generated',
    payload: {
      invoice_id: invoice.id,
      amount_paid: (invoice.amount_paid / 100).toFixed(2),
      currency: (invoice.currency || 'usd').toUpperCase(),
      billing_reason: 'renewal',
      tier: existing.tier,
      credits_granted: credits,
      invoice_pdf_url: invoice.invoice_pdf || null,
      hosted_invoice_url: invoice.hosted_invoice_url || null,
    },
  });

  logger.info('Renewal credits granted + notifications sent', { userId: existing.user_id, credits, invoiceId: invoice.id });
}

async function handleInvoicePaymentFailed(sb: SupabaseClient, event: unknown, logger: Logger) {
  const invoice = event.data.object;
  const customerId = invoice.customer;

  await sb
    .from('user_subscriptions')
    .update({ status: 'past_due' })
    .eq('stripe_customer_id', customerId);

  // ── NOTIFICATION: payment_failed (dunning sequence) ──
  // Required transactional — always sends. Dunning step determined by attempt_count.
  const { data: existing } = await sb
    .from('user_subscriptions')
    .select('user_id, tier')
    .eq('stripe_customer_id', customerId)
    .single();

  if (existing) {
    const attemptCount = invoice.attempt_count || 1;

    // Dunning sequence: Day 1 (update payment), Day 3 (access warning), Day 7 (last chance), Day 14 (downgrade)
    let dunning_step = 'update_payment';
    if (attemptCount >= 4) dunning_step = 'downgraded';
    else if (attemptCount >= 3) dunning_step = 'last_chance';
    else if (attemptCount >= 2) dunning_step = 'access_warning';

    await callSendNotification({
      user_id: existing.user_id,
      notification_type: 'payment_failed',
      payload: {
        tier: existing.tier,
        amount_due: (invoice.amount_due / 100).toFixed(2),
        currency: (invoice.currency || 'usd').toUpperCase(),
        attempt_count: attemptCount,
        dunning_step,
        next_attempt_date: invoice.next_payment_attempt
          ? new Date(invoice.next_payment_attempt * 1000).toISOString()
          : null,
        update_payment_url: invoice.hosted_invoice_url || null,
      },
    });

    // If final dunning step, downgrade to free
    if (dunning_step === 'downgraded') {
      await sb
        .from('user_subscriptions')
        .update({ tier: 'free', status: 'canceled' })
        .eq('user_id', existing.user_id);

      logger.warn('User downgraded to free after failed payments', { userId: existing.user_id });
    }
  }

  logger.warn('Payment failed, notification sent', {
    customerId,
    invoiceId: invoice.id,
    attemptCount: invoice.attempt_count,
  });
}

async function handlePaymentIntentSucceeded(sb: SupabaseClient, event: unknown, logger: Logger) {
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

    // ── NOTIFICATION: credit_purchase_receipt ──
    // Required transactional — always sends
    const { data: ledger } = await sb
      .from('credit_ledger')
      .select('balance_after')
      .eq('user_id', existing.user_id)
      .order('created_at', { ascending: false })
      .limit(1);

    await callSendNotification({
      user_id: existing.user_id,
      notification_type: 'credit_purchase_receipt',
      payload: {
        credits_purchased: qty,
        amount_paid: (pi.amount / 100).toFixed(2),
        currency: (pi.currency || 'usd').toUpperCase(),
        per_credit_cost: qty > 0 ? ((pi.amount / 100) / qty).toFixed(3) : '0',
        new_balance: ledger?.[0]?.balance_after || qty,
        payment_method_last4: pi.payment_method_types?.[0] || 'card',
      },
    });

    logger.info('Credit pack purchased + notification sent', { userId: existing.user_id, qty, piId: pi.id });
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

      // ── NOTIFICATION: credit_purchase_receipt (auto-refill variant) ──
      const { data: ledger } = await sb
        .from('credit_ledger')
        .select('balance_after')
        .eq('user_id', existing.user_id)
        .order('created_at', { ascending: false })
        .limit(1);

      await callSendNotification({
        user_id: existing.user_id,
        notification_type: 'credit_purchase_receipt',
        payload: {
          credits_purchased: credits,
          amount_paid: (pi.amount / 100).toFixed(2),
          currency: (pi.currency || 'usd').toUpperCase(),
          per_credit_cost: credits > 0 ? ((pi.amount / 100) / credits).toFixed(3) : '0',
          new_balance: ledger?.[0]?.balance_after || credits,
          is_auto_refill: true,
          discount_pct: pricing.auto_refill_discount_pct,
        },
      });

      logger.info('Auto-refill processed + notification sent', { userId: existing.user_id, credits, amount: pi.amount });
    }
  } else if (type === 'hire_fee') {
    logger.info('Hire fee collected', { userId: existing.user_id, amount: pi.amount, piId: pi.id });
    // No credits — just a revenue event. Logged via Stripe.
  }
}

async function handleSetupIntentSucceeded(sb: SupabaseClient, event: unknown, logger: Logger) {
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

// ─── Charge refunded handler (NEW v6.18) ───
async function handleChargeRefunded(sb: SupabaseClient, event: unknown, logger: Logger) {
  const charge = event.data.object;
  const customerId = charge.customer;
  const refundAmount = charge.amount_refunded;

  const { data: existing } = await sb
    .from('user_subscriptions')
    .select('user_id, tier')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!existing) {
    logger.error('No user found for refund', { customerId });
    return;
  }

  // ── NOTIFICATION: refund_processed ──
  // Required transactional — always sends
  await callSendNotification({
    user_id: existing.user_id,
    notification_type: 'refund_processed',
    payload: {
      refund_amount: (refundAmount / 100).toFixed(2),
      currency: (charge.currency || 'usd').toUpperCase(),
      processing_time: '5-10 business days',
      charge_id: charge.id,
    },
  });

  logger.info('Refund processed + notification sent', {
    userId: existing.user_id,
    amount: refundAmount,
    chargeId: charge.id,
  });
}

// ─── Payment recovered handler (NEW v6.18) ───
// Fires when a past_due subscription gets a successful payment
async function handlePaymentRecovered(sb: SupabaseClient, userId: string, tier: string, amount: number, logger: Logger) {
  await sb
    .from('user_subscriptions')
    .update({ status: 'active' })
    .eq('user_id', userId);

  await callSendNotification({
    user_id: userId,
    notification_type: 'payment_recovered',
    payload: {
      tier,
      amount_recovered: (amount / 100).toFixed(2),
      account_status: 'active',
    },
  });

  logger.info('Payment recovered + notification sent', { userId, amount });
}

// ─── Credit helper ───
async function grantCredits(
  sb: SupabaseClient,
  userId: string,
  amount: number,
  type: string,
  description: string,
  stripePaymentIntentId: string | null,
  logger: Logger
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
      case 'checkout.session.completed': {
        // ─── FB-TRIAL-001-S2: Set user_state to active_pro on checkout ───
        // ─── FB-TRIAL-001-S4: Referral reward on conversion ───
        const session = event.data.object;
        const sessionCustomerId = session.customer;
        if (sessionCustomerId) {
          const { data: subUser } = await sb
            .from('user_subscriptions')
            .select('user_id')
            .eq('stripe_customer_id', sessionCustomerId)
            .single();
          if (subUser) {
            const convertedUserId = subUser.user_id;

            // S7: Read old state BEFORE overwriting — needed for expired_reactivated event
            const { data: oldProfile } = await sb
              .from('profiles')
              .select('user_state, trial_expires_at')
              .eq('id', convertedUserId)
              .single();

            // S2: Set user_state to active_pro
            await sb
              .from('profiles')
              .update({ user_state: 'active_pro' })
              .eq('id', convertedUserId);
            logger.info('checkout.session.completed → active_pro', { userId: convertedUserId });

            // spec §11: expired_reactivated — fires when expired_free user subscribes
            if (oldProfile?.user_state === 'expired_free') {
              try {
                const phKey = Deno.env.get('POSTHOG_API_KEY');
                const phHost = Deno.env.get('POSTHOG_HOST') || 'https://app.posthog.com';
                if (phKey) {
                  const daysSinceExpiry = oldProfile.trial_expires_at
                    ? Math.max(0, Math.floor((Date.now() - new Date(oldProfile.trial_expires_at).getTime()) / 86400000))
                    : 0;
                  await fetch(`${phHost}/capture/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      api_key: phKey,
                      distinct_id: convertedUserId,
                      event: 'expired_reactivated',
                      properties: { user_id: convertedUserId, days_since_expiry: daysSinceExpiry, trigger: 'checkout' },
                    }),
                  });
                }
              } catch (_) { /* fire-and-forget */ }
            }

            // S4: Check if user has referred_by set → trigger referral reward
            const { data: profile } = await sb
              .from('profiles')
              .select('referred_by')
              .eq('id', convertedUserId)
              .single();

            if (profile?.referred_by) {
              const referrerId = profile.referred_by;

              // Update trial_referrals row: signed_up → converted
              await sb
                .from('trial_referrals')
                .update({
                  status: 'converted',
                  referred_converted_at: new Date().toISOString(),
                })
                .eq('referred_id', convertedUserId)
                .eq('status', 'signed_up');

              // Invoke process-referral-reward EF (Stripe coupon logic)
              try {
                const { data: trialRef } = await sb
                  .from('trial_referrals')
                  .select('id')
                  .eq('referred_id', convertedUserId)
                  .eq('referrer_id', referrerId)
                  .single();

                if (trialRef?.id) {
                  await sb.functions.invoke('process-referral-reward', {
                    body: { referral_id: trialRef.id, referrer_id: referrerId, referred_id: convertedUserId },
                  });
                  logger.info('checkout.session.completed → referral reward triggered', {
                    referrerId,
                    referredId: convertedUserId,
                    referralId: trialRef.id,
                  });

                  // ─── FB-TRIAL-001-S5: Fire referral_converted notifications to both parties ───
                  try {
                    await sb.functions.invoke('send-trial-notifications', {
                      body: {
                        action: 'referral_converted',
                        referrer_id: referrerId,
                        referred_id: convertedUserId,
                      },
                    });
                    logger.info('checkout.session.completed → referral_converted notifications fired', {
                      referrerId, referredId: convertedUserId,
                    });
                  } catch (notifyErr) {
                    // Non-fatal — reward already applied
                    logger.error('checkout.session.completed → referral_converted notification failed', {
                      error: String(notifyErr),
                    });
                  }
                }
              } catch (refErr) {
                logger.error('checkout.session.completed → referral reward failed', { error: String(refErr) });
              }

              // PostHog: trial_converted with referred_by property
              try {
                const phKey = Deno.env.get('POSTHOG_API_KEY');
                const phHost = Deno.env.get('POSTHOG_HOST') || 'https://app.posthog.com';
                if (phKey) {
                  await fetch(`${phHost}/capture/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      api_key: phKey,
                      distinct_id: convertedUserId,
                      event: 'trial_converted',
                      properties: { referred_by: referrerId, surface: 'stripe_webhook' },
                    }),
                  });
                }
              } catch (_) { /* fire-and-forget */ }
            }
          }
        }
        break;
      }
      case 'customer.subscription.created':
        await handleSubscriptionCreated(sb, event, logger);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(sb, event, logger);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(sb, event, logger);
        break;
      case 'invoice.payment_succeeded': {
        // Check if this is a recovery (was past_due)
        const inv = event.data.object;
        const { data: subCheck } = await sb
          .from('user_subscriptions')
          .select('user_id, tier, status')
          .eq('stripe_customer_id', inv.customer)
          .single();
        if (subCheck?.status === 'past_due') {
          await handlePaymentRecovered(sb, subCheck.user_id, subCheck.tier, inv.amount_paid, logger);
        }
        await handleInvoicePaymentSucceeded(sb, event, logger);
        break;
      }
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(sb, event, logger);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(sb, event, logger);
        break;
      case 'setup_intent.succeeded':
        await handleSetupIntentSucceeded(sb, event, logger);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(sb, event, logger);
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
