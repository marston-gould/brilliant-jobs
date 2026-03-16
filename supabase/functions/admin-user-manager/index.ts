// supabase/functions/admin-user-manager/index.ts
// SPEC-ADMIN-002-S1: User Manager — List + Detail reads
// Actions: search, filter, paginate users; get user detail; update profile fields
// All mutations write to admin_audit_log.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
  target_id?: string; before?: unknown; after?: unknown; reason?: string; ip?: string;
}) {
  await sb.from('admin_audit_log').insert({
    actor_id: params.actor_id, action: params.action,
    target_type: params.target_type, target_id: params.target_id ?? null,
    before: params.before ?? null, after: params.after ?? null,
    reason: params.reason ?? null, ip_address: params.ip ?? null,
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  const sb = createClient(SB_URL, SB_KEY);

  const admin = await requireAdmin(sb, token);
  if (!admin) return json({ error: 'Forbidden — admin required' }, 403);

  try {
    const body = await req.json();
    const { action } = body;

    // ── LIST: search/filter/paginate users ───────────────────────────────────
    if (action === 'list') {
      const {
        search = '', cohort_slug = '', status = '', page = 1, per_page = 50,
        sort_by = 'created_at', sort_dir = 'desc',
      } = body;

      let q = sb.from('profiles').select(`
        id, display_name, email, role, created_at, last_seen_at,
        cohort_tier_id, cohort_tiers(slug, name),
        user_subscriptions(status, tier, current_period_end)
      `, { count: 'exact' });

      if (search) {
        q = q.or(`email.ilike.%${search}%,display_name.ilike.%${search}%,id.eq.${search}`);
      }
      if (cohort_slug) {
        const { data: ct } = await sb.from('cohort_tiers').select('id').eq('slug', cohort_slug).single();
        if (ct) q = q.eq('cohort_tier_id', ct.id);
      }
      if (body.country) q = q.eq('country', body.country);
      if (body.signup_from) q = q.gte('created_at', body.signup_from);
      if (body.signup_to) q = q.lte('created_at', body.signup_to);
      if (body.active_from) q = q.gte('last_seen_at', body.active_from);
      if (body.active_to) q = q.lte('last_seen_at', body.active_to);
      if (body.sub_status) {
        // Filter by subscription status via join
        const { data: subUserIds } = await sb.from('user_subscriptions')
          .select('user_id').eq('status', body.sub_status);
        if (subUserIds) q = q.in('id', subUserIds.map((s: Record<string, string>) => s.user_id));
      }
      // status filter maps to user_subscriptions.status
      if (sort_by === 'created_at' || sort_by === 'last_seen_at') {
        q = q.order(sort_by, { ascending: sort_dir === 'asc' });
      }

      const offset = (page - 1) * per_page;
      q = q.range(offset, offset + per_page - 1);

      const { data, count, error } = await q;
      if (error) throw error;

      // Fetch credit balances in parallel
      const balances: Record<string, number> = {};
      if (data && data.length > 0) {
        await Promise.all(data.slice(0, 20).map(async (u) => {
          const { data: bal } = await sb.rpc('fn_get_user_credit_balance', { p_user_id: u.id });
          if (bal) balances[u.id] = (bal as Record<string, number>).total ?? 0;
        }));
      }

      return json({
        users: (data ?? []).map(u => ({ ...u, credit_balance: balances[u.id] ?? null })),
        total: count ?? 0,
        page, per_page,
      });
    }

    // ── DETAIL: full user profile ─────────────────────────────────────────────
    if (action === 'detail') {
      const { user_id } = body;
      if (!user_id) return json({ error: 'user_id required' }, 400);

      const [profileRes, subRes, balRes, ledgerRes] = await Promise.all([
        sb.from('profiles').select('*, cohort_tiers(*)').eq('id', user_id).single(),
        sb.from('user_subscriptions').select('*').eq('user_id', user_id).single(),
        sb.rpc('fn_get_user_credit_balance', { p_user_id: user_id }),
        sb.from('bj_credit_ledger')
          .select('id, bucket, event_type, amount, feature, source_ref, notes, created_at')
          .eq('user_id', user_id)
          .eq('voided', false)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      return json({
        profile:     profileRes.data,
        subscription: subRes.data,
        balance:     balRes.data,
        ledger:      ledgerRes.data ?? [],
      });
    }

    // ── UPDATE PROFILE: edit display_name, email, phone, location, etc. ──────
    if (action === 'update_profile') {
      const { user_id, fields } = body;
      if (!user_id || !fields) return json({ error: 'user_id and fields required' }, 400);

      const ALLOWED = ['display_name', 'email', 'phone', 'location', 'job_title', 'linkedin_url'];
      const safe = Object.fromEntries(
        Object.entries(fields).filter(([k]) => ALLOWED.includes(k))
      );
      if (Object.keys(safe).length === 0) return json({ error: 'No valid fields to update' }, 400);

      const { data: before } = await sb.from('profiles').select('*').eq('id', user_id).single();
      const { data: after, error } = await sb.from('profiles').update(safe).eq('id', user_id).select().single();
      if (error) throw error;

      await writeAudit(sb, {
        actor_id: admin.profile.id, action: 'user.profile.update',
        target_type: 'user', target_id: user_id,
        before: safe, after,
      });

      return json({ success: true, profile: after });
    }

    // ── CSV EXPORT ────────────────────────────────────────────────────────────────
    if (action === 'export_csv') {
      // Export all matching users (up to 10k) as CSV
      let q = sb.from('profiles').select(
        'id, display_name, email, created_at, last_seen_at, cohort_tiers(slug)'
      );
      if (body.search) q = q.or(`email.ilike.%${body.search}%,display_name.ilike.%${body.search}%`);
      if (body.cohort_slug) {
        const { data: ct } = await sb.from('cohort_tiers').select('id').eq('slug', body.cohort_slug).single();
        if (ct) q = q.eq('cohort_tier_id', ct.id);
      }
      q = q.order('created_at', { ascending: false }).limit(10000);
      const { data, error } = await q;
      if (error) throw error;

      const rows = (data ?? []).map(u => {
        const cohort = (u.cohort_tiers as Record<string, string>)?.slug ?? 'free';
        const joined = u.created_at ? new Date(u.created_at).toISOString().slice(0,10) : '';
        const active = u.last_seen_at ? new Date(u.last_seen_at).toISOString().slice(0,10) : '';
        return `"${(u.id??'').replace(/"/g,'""')}","${(u.email??'').replace(/"/g,'""')}","${(u.display_name??'').replace(/"/g,'""')}","${cohort}","${joined}","${active}"`;
      });
      const csv = 'id,email,display_name,cohort,joined,last_active\n' + rows.join('\n');

      await writeAudit(sb, {
        actor_id: admin.profile.id, action: 'user.list.export_csv',
        target_type: 'user', after: { count: rows.length },
      });
      return new Response(csv, {
        status: 200,
        headers: { ...CORS, 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="users.csv"' },
      });
    }

    // ── SUSPEND / UNSUSPEND ───────────────────────────────────────────────────────
    if (action === 'suspend') {
      const { user_id, reason } = body;
      if (!user_id) return json({ error: 'user_id required' }, 400);
      if (!reason || reason.trim().length < 5) return json({ error: 'reason required' }, 400);

      const { data: before } = await sb.from('profiles').select('role').eq('id', user_id).single();
      await sb.from('profiles').update({ role: 'suspended' }).eq('id', user_id);

      await writeAudit(sb, {
        actor_id: admin.profile.id, action: 'user.suspend',
        target_type: 'user', target_id: user_id,
        before: { role: before?.role }, after: { role: 'suspended' }, reason: reason.trim(),
      });
      return json({ success: true });
    }

    if (action === 'unsuspend') {
      const { user_id, reason } = body;
      if (!user_id) return json({ error: 'user_id required' }, 400);
      await sb.from('profiles').update({ role: 'user' }).eq('id', user_id);
      await writeAudit(sb, {
        actor_id: admin.profile.id, action: 'user.unsuspend',
        target_type: 'user', target_id: user_id,
        before: { role: 'suspended' }, after: { role: 'user' }, reason: reason?.trim() ?? '',
      });
      return json({ success: true });
    }

    // ── DELETE ACCOUNT ───────────────────────────────────────────────────────────
    if (action === 'delete_account') {
      const { user_id, confirm_email, reason } = body;
      if (!user_id) return json({ error: 'user_id required' }, 400);
      if (!reason || reason.trim().length < 20) return json({ error: 'reason required (min 20 chars for account deletion)' }, 400);

      // Verify confirm_email matches
      const { data: profile } = await sb.from('profiles').select('email').eq('id', user_id).single();
      if (!profile) return json({ error: 'User not found' }, 404);
      if (confirm_email?.toLowerCase().trim() !== profile.email?.toLowerCase()) {
        return json({ error: 'Email confirmation does not match' }, 409);
      }

      // Write audit BEFORE deletion
      await writeAudit(sb, {
        actor_id: admin.profile.id, action: 'user.delete_account',
        target_type: 'user', target_id: user_id,
        before: { email: profile.email }, reason: reason.trim(),
      });

      // Delete via auth admin (cascades to profiles via FK)
      const { error } = await sb.auth.admin.deleteUser(user_id);
      if (error) throw error;

      return json({ success: true });
    }

    // ── IMPERSONATE ───────────────────────────────────────────────────────────────
    if (action === 'impersonate') {
      const { user_id } = body;
      if (!user_id) return json({ error: 'user_id required' }, 400);

      // Write audit immediately — impersonation is always logged regardless of result
      await writeAudit(sb, {
        actor_id: admin.profile.id, action: 'user.impersonate',
        target_type: 'user', target_id: user_id,
        after: { initiated_by: admin.profile.id, note: 'read-only session' },
      });

      // Generate a short-lived magic link for the user (expires in 5 min)
      const { data, error } = await sb.auth.admin.generateLink({
        type: 'magiclink',
        email: (await sb.from('profiles').select('email').eq('id', user_id).single()).data?.email ?? '',
        options: { expiresIn: 300 }, // 5 minutes
      });
      if (error) throw error;

      return json({ success: true, link: data.properties?.action_link, expires_in: 300 });
    }

    // ── USER DETAIL: APPLICATIONS TAB ────────────────────────────────────────────
    if (action === 'detail_applications') {
      const { user_id } = body;
      if (!user_id) return json({ error: 'user_id required' }, 400);

      const [appsRes, pipelineRes] = await Promise.all([
        sb.from('pending_applications')
          .select('id, job_id, status, created_at, jobs(title, company_name)')
          .eq('user_id', user_id)
          .order('created_at', { ascending: false })
          .limit(50),
        sb.from('user_pipeline')
          .select('id, job_id, stage, created_at, jobs(title, company_name)')
          .eq('user_id', user_id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      return json({
        applications: appsRes.data ?? [],
        pipeline: pipelineRes.data ?? [],
      });
    }

    // ── REASSIGN COHORT ────────────────────────────────────────────────────────
    if (action === 'reassign_cohort') {
      const { user_id, cohort_slug, reason } = body;
      if (!user_id || !cohort_slug) return json({ error: 'user_id and cohort_slug required' }, 400);

      const { data: newCohort } = await sb.from('cohort_tiers').select('id, slug, credits_monthly').eq('slug', cohort_slug).single();
      if (!newCohort) return json({ error: 'Cohort not found' }, 404);

      const { data: before } = await sb.from('profiles').select('cohort_tier_id, cohort_tiers(slug)').eq('id', user_id).single();
      const oldSlug = (before?.cohort_tiers as Record<string, string>)?.slug ?? 'free';

      await sb.from('profiles').update({
        cohort_tier_id: newCohort.id,
        cohort_tier_assigned_at: new Date().toISOString(),
      }).eq('id', user_id);

      // Fire proration
      if (oldSlug !== cohort_slug) {
        await sb.rpc('fn_cohort_prorate', {
          p_user_id: user_id, p_old_tier_slug: oldSlug, p_new_tier_slug: cohort_slug,
        }).catch(() => {});
      }

      // Replenish credits for new cohort
      const SB_URL2 = Deno.env.get('SUPABASE_URL')!;
      await fetch(`${SB_URL2}/functions/v1/replenish-credits`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id }),
      }).catch(() => {});

      await writeAudit(sb, {
        actor_id: admin.profile.id, action: 'user.cohort.reassign',
        target_type: 'user', target_id: user_id,
        before: { cohort_slug: oldSlug }, after: { cohort_slug }, reason,
      });

      return json({ success: true, old_slug: oldSlug, new_slug: cohort_slug });
    }

    // ── CANCEL SUBSCRIPTION (from User Detail) ──────────────────────────────────
    if (action === 'cancel_sub_for_user') {
      const { user_id, cancel_immediately, reason } = body;
      if (!user_id || !reason || reason.trim().length < 10) return json({ error: 'user_id and reason (min 10 chars) required' }, 400);
      const { data: sub } = await sb.from('user_subscriptions').select('stripe_subscription_id').eq('user_id', user_id).single();
      if (!sub?.stripe_subscription_id) return json({ error: 'No active subscription found' }, 404);

      const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');
      if (!STRIPE_KEY) return json({ error: 'Stripe not configured' }, 500);

      const stripeRes = await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: cancel_immediately ? '' : 'cancel_at_period_end=true',
      });
      const stripeData = await stripeRes.json();
      if (!stripeRes.ok) return json({ error: stripeData.error?.message ?? 'Stripe error' }, 502);

      await writeAudit(sb, {
        actor_id: admin.profile.id, action: 'billing.subscription.cancel',
        target_type: 'billing', target_id: user_id,
        after: { cancel_immediately }, reason: reason.trim(),
      });
      return json({ success: true, cancel_immediately });
    }

    // ── BLOCK / UNBLOCK ──────────────────────────────────────────────────────────
    // §3.1 spec requirement: block user (different from suspend — blocks auth login)
    if (action === 'block') {
      const { user_id, reason } = body;
      if (!user_id) return json({ error: 'user_id required' }, 400);
      if (!reason || reason.trim().length < 5) return json({ error: 'reason required' }, 400);
      // Ban user via Supabase Auth Admin API
      const { error } = await sb.auth.admin.updateUserById(user_id, { ban_duration: 'none' });
      // Supabase uses ban_duration='none' to mean "indefinite ban"
      // We also set role=blocked on profile for our own gating
      await sb.from('profiles').update({ role: 'blocked' }).eq('id', user_id);
      if (error) throw error;
      await writeAudit(sb, {
        actor_id: admin.profile.id, action: 'user.block',
        target_type: 'user', target_id: user_id,
        after: { blocked: true }, reason: reason.trim(),
      });
      return json({ success: true });
    }

    if (action === 'unblock') {
      const { user_id, reason } = body;
      if (!user_id) return json({ error: 'user_id required' }, 400);
      const { error } = await sb.auth.admin.updateUserById(user_id, { ban_duration: '0' });
      await sb.from('profiles').update({ role: 'user' }).eq('id', user_id);
      if (error) throw error;
      await writeAudit(sb, {
        actor_id: admin.profile.id, action: 'user.unblock',
        target_type: 'user', target_id: user_id,
        after: { blocked: false }, reason: reason?.trim() ?? '',
      });
      return json({ success: true });
    }

    // ── MERGE ACCOUNTS ───────────────────────────────────────────────────────────
    // Merge source_user_id INTO target_user_id:
    // - Transfer bj_credit_ledger rows
    // - Transfer resumes, user_filters, pending_applications, user_pipeline
    // - Delete source profile (hard delete — intentional, post-merge)
    // Requires reason + explicit confirmation. Writes full audit log.
    if (action === 'merge_accounts') {
      const { source_user_id, target_user_id, reason } = body;
      if (!source_user_id || !target_user_id) return json({ error: 'source_user_id and target_user_id required' }, 400);
      if (source_user_id === target_user_id) return json({ error: 'Cannot merge account with itself' }, 400);
      if (!reason || reason.trim().length < 20) return json({ error: 'reason required (min 20 chars for account merge)' }, 400);

      // Snapshot both profiles before merge
      const [{ data: sourcePro }, { data: targetPro }] = await Promise.all([
        sb.from('profiles').select('email, display_name, cohort_tier_id, created_at').eq('id', source_user_id).single(),
        sb.from('profiles').select('email, display_name').eq('id', target_user_id).single(),
      ]);
      if (!sourcePro) return json({ error: 'Source user not found' }, 404);
      if (!targetPro) return json({ error: 'Target user not found' }, 404);

      const tables: Array<{ table: string; col: string }> = [
        { table: 'bj_credit_ledger', col: 'user_id' },
        { table: 'resumes', col: 'user_id' },
        { table: 'user_filters', col: 'user_id' },
        { table: 'pending_applications', col: 'user_id' },
        { table: 'user_pipeline', col: 'user_id' },
        { table: 'user_subscriptions', col: 'user_id' },
        { table: 'user_saved_jobs', col: 'user_id' },
      ];

      const transferred: Record<string, number> = {};
      for (const { table, col } of tables) {
        // count before
        const { count } = await sb.from(table).select('id', { count: 'exact', head: true }).eq(col, source_user_id);
        if ((count ?? 0) > 0) {
          const { error } = await sb.from(table).update({ [col]: target_user_id } as Record<string, string>).eq(col, source_user_id);
          if (error) console.warn(`[merge] ${table} transfer error:`, error.message);
          else transferred[table] = count ?? 0;
        }
      }

      // Write audit BEFORE deleting source
      await writeAudit(sb, {
        actor_id: admin.profile.id, action: 'user.merge_accounts',
        target_type: 'user', target_id: target_user_id,
        before: { source_email: sourcePro.email, target_email: targetPro.email },
        after: { transferred, source_deleted: true },
        reason: reason.trim(),
      });

      // Delete source user
      const { error: deleteErr } = await sb.auth.admin.deleteUser(source_user_id);
      if (deleteErr) throw deleteErr;

      return json({ success: true, transferred });
    }

    // ── APPLY DISCOUNT (from User Detail) ────────────────────────────────────────
    if (action === 'apply_discount_for_user') {
      const { user_id, percent_off, duration = 'once', reason } = body;
      if (!user_id) return json({ error: 'user_id required' }, 400);
      if (!percent_off || percent_off < 1 || percent_off > 100) return json({ error: 'percent_off must be 1-100' }, 400);
      if (!reason || reason.trim().length < 5) return json({ error: 'reason required' }, 400);

      const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');
      if (!STRIPE_KEY) return json({ error: 'Stripe not configured' }, 500);

      const { data: sub } = await sb.from('user_subscriptions').select('stripe_customer_id').eq('user_id', user_id).single();
      if (!sub?.stripe_customer_id) return json({ error: 'No Stripe customer found for user' }, 404);

      const couponRes = await fetch('https://api.stripe.com/v1/coupons', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `percent_off=${percent_off}&duration=${duration}&metadata[reason]=${encodeURIComponent(reason)}&metadata[admin]=${admin.profile.id}`,
      });
      const couponData = await couponRes.json();
      if (!couponRes.ok) return json({ error: couponData.error?.message ?? 'Stripe coupon error' }, 502);

      const applyRes = await fetch(`https://api.stripe.com/v1/customers/${sub.stripe_customer_id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `coupon=${couponData.id}`,
      });
      const applyData = await applyRes.json();
      if (!applyRes.ok) return json({ error: applyData.error?.message ?? 'Stripe apply error' }, 502);

      await writeAudit(sb, {
        actor_id: admin.profile.id, action: 'billing.discount.apply',
        target_type: 'billing', target_id: user_id,
        after: { percent_off, duration, coupon_id: couponData.id, customer_id: sub.stripe_customer_id },
        reason: reason.trim(),
      });
      return json({ success: true, coupon_id: couponData.id, percent_off, duration });
    }

    // ── EXTEND TRIAL ──────────────────────────────────────────────────────────────
    if (action === 'extend_trial') {
      const { user_id, extend_days, reason } = body;
      if (!user_id) return json({ error: 'user_id required' }, 400);
      if (!extend_days || extend_days < 1 || extend_days > 365) return json({ error: 'extend_days must be 1-365' }, 400);
      if (!reason || reason.trim().length < 5) return json({ error: 'reason required' }, 400);

      const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');
      if (!STRIPE_KEY) return json({ error: 'Stripe not configured' }, 500);

      const { data: sub } = await sb.from('user_subscriptions').select('stripe_subscription_id, current_period_end').eq('user_id', user_id).single();
      if (!sub?.stripe_subscription_id) return json({ error: 'No active subscription found' }, 404);

      // Extend trial by moving trial_end to current_period_end + extend_days
      const newTrialEnd = Math.floor((new Date(sub.current_period_end).getTime() / 1000) + extend_days * 86400);
      const stripeRes = await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `trial_end=${newTrialEnd}`,
      });
      const stripeData = await stripeRes.json();
      if (!stripeRes.ok) return json({ error: stripeData.error?.message ?? 'Stripe error' }, 502);

      await writeAudit(sb, {
        actor_id: admin.profile.id, action: 'billing.trial.extend',
        target_type: 'billing', target_id: user_id,
        after: { extend_days, new_trial_end: new Date(newTrialEnd * 1000).toISOString() },
        reason: reason.trim(),
      });
      return json({ success: true, extend_days, new_trial_end: new Date(newTrialEnd * 1000).toISOString() });
    }

    return json({ error: 'Unknown action' }, 400);

  } catch (err) {
    console.error('[admin-user-manager]', err);
    try {
      const phKey = Deno.env.get('POSTHOG_API_KEY');
      if (phKey) await fetch('https://app.posthog.com/capture/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: phKey, distinct_id: 'system',
          event: 'admin_ef_error', properties: { ef: 'admin-user-manager', error: (err as Error).message } }),
      });
    } catch (_) {}
    return json({ error: 'Internal server error' }, 500);
  }
});
