// supabase/functions/admin-billing-manager/index.ts
// SPEC-ADMIN-002-S2: Billing Manager
// Actions: list_subscriptions, global_ledger, cancel_subscription, apply_discount

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

async function requireAdmin(sb: ReturnType<typeof createClient>, token: string) {
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await sb.from('profiles').select('id, role').eq('id', user.id).single();
  if (!profile || !['admin', 'superadmin'].includes(profile.role)) return null;
  return { user, profile };
}

async function writeAudit(sb: ReturnType<typeof createClient>, params: {
  actor_id: string; action: string; target_type: string;
  target_id?: string; before?: unknown; after?: unknown; reason?: string;
}) {
  await sb.from('admin_audit_log').insert({
    actor_id: params.actor_id, action: params.action,
    target_type: params.target_type, target_id: params.target_id ?? null,
    before: params.before ?? null, after: params.after ?? null,
    reason: params.reason ?? null,
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const sb = createClient(SB_URL, SB_KEY);

  const admin = await requireAdmin(sb, token);
  if (!admin) return json({ error: 'Forbidden — admin required' }, 403);

  try {
    const body = await req.json();
    const { action } = body;

    // ── LIST SUBSCRIPTIONS ────────────────────────────────────────────────────
    if (action === 'list_subscriptions') {
      const { status_filter = '', cohort_slug = '', page = 1, per_page = 50 } = body;

      let q = sb.from('user_subscriptions').select(`
        id, user_id, status, tier, stripe_subscription_id, stripe_customer_id,
        current_period_start, current_period_end, cancel_at_period_end, created_at,
        profiles(id, email, display_name, cohort_tier_id, cohort_tiers(slug, name))
      `, { count: 'exact' });

      if (status_filter) q = q.eq('status', status_filter);
      if (cohort_slug) {
        const { data: ct } = await sb.from('cohort_tiers').select('id').eq('slug', cohort_slug).single();
        if (ct) q = q.eq('profiles.cohort_tier_id', ct.id);
      }

      q = q.order('created_at', { ascending: false })
           .range((page - 1) * per_page, page * per_page - 1);

      const { data, count, error } = await q;
      if (error) throw error;
      return json({ subscriptions: data ?? [], total: count ?? 0, page, per_page });
    }

    // ── GLOBAL CREDIT LEDGER ──────────────────────────────────────────────────
    if (action === 'global_ledger') {
      const { user_id = '', event_type = '', page = 1, per_page = 50 } = body;

      let q = sb.from('bj_credit_ledger').select(`
        id, user_id, bucket, event_type, amount, feature, source_ref, notes, created_at,
        profiles(email, display_name)
      `, { count: 'exact' }).eq('voided', false);

      if (user_id) q = q.eq('user_id', user_id);
      if (event_type) q = q.eq('event_type', event_type);

      q = q.order('created_at', { ascending: false })
           .range((page - 1) * per_page, page * per_page - 1);

      const { data, count, error } = await q;
      if (error) throw error;
      return json({ entries: data ?? [], total: count ?? 0, page, per_page });
    }

    // ── CANCEL SUBSCRIPTION ────────────────────────────────────────────────────
    if (action === 'cancel_subscription') {
      const { subscription_id, user_id, cancel_immediately = false, reason } = body;
      if (!subscription_id || !user_id) return json({ error: 'subscription_id and user_id required' }, 400);
      if (!reason || reason.trim().length < 10) return json({ error: 'reason required (min 10 chars)' }, 400);

      const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');
      if (!STRIPE_KEY) return json({ error: 'Stripe not configured' }, 500);

      const stripeRes = await fetch(
        `https://api.stripe.com/v1/subscriptions/${subscription_id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${STRIPE_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: cancel_immediately ? '' : 'cancel_at_period_end=true',
        }
      );
      const stripeData = await stripeRes.json();
      if (!stripeRes.ok) return json({ error: stripeData.error?.message ?? 'Stripe error' }, 502);

      await writeAudit(sb, {
        actor_id: admin.profile.id, action: 'billing.subscription.cancel',
        target_type: 'billing', target_id: user_id,
        after: { subscription_id, cancel_immediately }, reason: reason.trim(),
      });

      if (PH_KEY) await fetch('https://app.posthog.com/capture/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: PH_KEY, distinct_id: user_id,
          event: 'admin_subscription_cancelled',
          properties: { subscription_id, cancel_immediately, actor: admin.profile.id } }),
      }).catch(() => {});

      return json({ success: true, cancel_immediately, subscription: stripeData });
    }

    // ── APPLY DISCOUNT ────────────────────────────────────────────────────────
    if (action === 'apply_discount') {
      const { customer_id, percent_off, duration = 'once', reason } = body;
      if (!customer_id) return json({ error: 'customer_id required' }, 400);
      if (!percent_off || percent_off < 1 || percent_off > 100) return json({ error: 'percent_off must be 1-100' }, 400);
      if (!reason || reason.trim().length < 5) return json({ error: 'reason required' }, 400);

      const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');
      if (!STRIPE_KEY) return json({ error: 'Stripe not configured' }, 500);

      // Create coupon then apply to customer
      const couponRes = await fetch('https://api.stripe.com/v1/coupons', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `percent_off=${percent_off}&duration=${duration}&metadata[reason]=${encodeURIComponent(reason)}&metadata[admin]=${admin.profile.id}`,
      });
      const couponData = await couponRes.json();
      if (!couponRes.ok) return json({ error: couponData.error?.message ?? 'Stripe coupon error' }, 502);

      const applyRes = await fetch(`https://api.stripe.com/v1/customers/${customer_id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `coupon=${couponData.id}`,
      });
      const applyData = await applyRes.json();
      if (!applyRes.ok) return json({ error: applyData.error?.message ?? 'Stripe apply error' }, 502);

      await writeAudit(sb, {
        actor_id: admin.profile.id, action: 'billing.discount.apply',
        target_type: 'billing',
        after: { customer_id, percent_off, duration, coupon_id: couponData.id },
        reason: reason.trim(),
      });

      return json({ success: true, coupon_id: couponData.id, percent_off, duration });
    }

    return json({ error: 'Unknown action' }, 400);

  } catch (err) {
    console.error('[admin-billing-manager]', err);
    if (PH_KEY) await fetch('https://app.posthog.com/capture/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: PH_KEY, distinct_id: 'system',
        event: 'admin_ef_error', properties: { ef: 'admin-billing-manager', error: (err as Error).message } }),
    }).catch(() => {});
    return json({ error: 'Internal server error' }, 500);
  }
});
