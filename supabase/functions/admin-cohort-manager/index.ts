// supabase/functions/admin-cohort-manager/index.ts
// SPEC-ADMIN-002-S1: Cohort Manager — List, Create, Update, Archive
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

    // ── LIST cohorts ──────────────────────────────────────────────────────────
    if (action === 'list') {
      const { include_archived = false } = body;

      let q = sb.from('cohort_tiers').select(`
        id, name, slug, price_monthly_cents, price_annual_cents,
        credits_monthly, rollover_cap, is_public, is_archived, sort_order,
        stripe_monthly_price_id, stripe_annual_price_id,
        max_auto_apply_daily, max_saved_jobs, max_pipeline_items,
        max_recruiter_lookups_daily, csv_export_enabled, api_access_enabled,
        created_at, updated_at
      `).order('sort_order');

      if (!include_archived) q = q.eq('is_archived', false);

      const { data, error } = await q;
      if (error) throw error;

      // Member counts
      const counts: Record<string, number> = {};
      if (data && data.length > 0) {
        for (const cohort of data) {
          const { count } = await sb.from('profiles').select('id', { count: 'exact', head: true })
            .eq('cohort_tier_id', cohort.id);
          counts[cohort.id] = count ?? 0;
        }
      }

      return json({ cohorts: (data ?? []).map(c => ({ ...c, member_count: counts[c.id] ?? 0 })) });
    }

    // ── GET one cohort ────────────────────────────────────────────────────────
    if (action === 'get') {
      const { cohort_id } = body;
      if (!cohort_id) return json({ error: 'cohort_id required' }, 400);
      const { data, error } = await sb.from('cohort_tiers').select('*').eq('id', cohort_id).single();
      if (error || !data) return json({ error: 'Cohort not found' }, 404);
      return json({ cohort: data });
    }

    // ── CREATE cohort ─────────────────────────────────────────────────────────
    if (action === 'create') {
      const { cohort } = body;
      if (!cohort?.name || !cohort?.slug) return json({ error: 'name and slug required' }, 400);
      if (typeof cohort.credits_monthly !== 'number' || cohort.credits_monthly < 0)
        return json({ error: 'credits_monthly must be >= 0' }, 400);

      // Auto-generate slug if not provided
      const slug = cohort.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');

      const { data, error } = await sb.from('cohort_tiers').insert({
        name: cohort.name, slug,
        price_monthly_cents: cohort.price_monthly_cents ?? 0,
        price_annual_cents:  cohort.price_annual_cents ?? 0,
        credits_monthly:     cohort.credits_monthly,
        rollover_cap:        cohort.rollover_cap ?? 0,
        is_public:           cohort.is_public ?? true,
        sort_order:          cohort.sort_order ?? 0,
        stripe_monthly_price_id: cohort.stripe_monthly_price_id ?? null,
        stripe_annual_price_id:  cohort.stripe_annual_price_id ?? null,
        max_auto_apply_daily:          cohort.max_auto_apply_daily ?? null,
        max_saved_jobs:                cohort.max_saved_jobs ?? null,
        max_pipeline_items:            cohort.max_pipeline_items ?? null,
        max_recruiter_lookups_daily:   cohort.max_recruiter_lookups_daily ?? null,
        csv_export_enabled:            cohort.csv_export_enabled ?? false,
        api_access_enabled:            cohort.api_access_enabled ?? false,
        created_by: admin.profile.id,
      }).select().single();

      if (error) throw error;

      await writeAudit(sb, {
        actor_id: admin.profile.id, action: 'cohort.create',
        target_type: 'cohort', target_id: data!.id,
        before: null, after: data,
      });

      return json({ success: true, cohort: data });
    }

    // ── UPDATE cohort ─────────────────────────────────────────────────────────
    if (action === 'update') {
      const { cohort_id, fields } = body;
      if (!cohort_id) return json({ error: 'cohort_id required' }, 400);

      const ALLOWED = [
        'name','price_monthly_cents','price_annual_cents','credits_monthly',
        'rollover_cap','is_public','sort_order','stripe_monthly_price_id',
        'stripe_annual_price_id','max_auto_apply_daily','max_saved_jobs',
        'max_pipeline_items','max_recruiter_lookups_daily','csv_export_enabled',
        'api_access_enabled',
      ];
      const safe = Object.fromEntries(Object.entries(fields ?? {}).filter(([k]) => ALLOWED.includes(k)));

      const { data: before } = await sb.from('cohort_tiers').select('*').eq('id', cohort_id).single();
      const { data: after, error } = await sb.from('cohort_tiers').update(safe).eq('id', cohort_id).select().single();
      if (error) throw error;

      await writeAudit(sb, {
        actor_id: admin.profile.id, action: 'cohort.update',
        target_type: 'cohort', target_id: cohort_id,
        before: Object.fromEntries(Object.entries(before ?? {}).filter(([k]) => k in safe)),
        after: safe,
      });

      // Warn if price changed — Stripe subscriptions not auto-updated
      const priceChanged = safe.price_monthly_cents !== undefined || safe.price_annual_cents !== undefined;

      return json({ success: true, cohort: after, price_change_warning: priceChanged });
    }

    // ── ARCHIVE cohort ────────────────────────────────────────────────────────
    if (action === 'archive') {
      const { cohort_id, reason } = body;
      if (!cohort_id) return json({ error: 'cohort_id required' }, 400);

      // Block archive if active members
      const { count } = await sb.from('profiles').select('id', { count: 'exact', head: true })
        .eq('cohort_tier_id', cohort_id);
      if ((count ?? 0) > 0)
        return json({ error: `Cannot archive cohort with ${count} active members. Reassign users first.` }, 409);

      await sb.from('cohort_tiers').update({ is_archived: true }).eq('id', cohort_id);

      await writeAudit(sb, {
        actor_id: admin.profile.id, action: 'cohort.archive',
        target_type: 'cohort', target_id: cohort_id,
        before: { is_archived: false }, after: { is_archived: true }, reason,
      });

      return json({ success: true });
    }

    return json({ error: 'Unknown action' }, 400);

  } catch (err) {
    console.error('[admin-cohort-manager]', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
