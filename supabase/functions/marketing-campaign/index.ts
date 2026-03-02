// supabase/functions/marketing-campaign/index.ts
// Pod 2 Session 12 — Marketing, Upgrade Prompts + Credit Intelligence
// Handles: usage_upgrade_prompt, credit_cost_comparison, credit_burn_rate_alert,
//   credit_low_balance, credit_exhausted, upgrade_roi_summary,
//   price_lock_warning, promo_trial, promo_feature_preview
//
// Modes:
//   - admin_trigger: Admin fires a campaign manually (promo_trial, promo_feature_preview, price_lock)
//   - cron: Monthly upgrade_roi_summary, credit_cost_comparison
//   - event: credit_burn_rate_alert, credit_low_balance, credit_exhausted, usage_upgrade_prompt
//
// Cron: marketing_roi_summary — 1st of month 10:00 AM ET
//       marketing_credit_comparison — 1st of month 11:00 AM ET

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL  = Deno.env.get('SUPABASE_URL')!;
const SB_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CORS    = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CampaignEvent {
  type: 'admin_campaign' | 'usage_limit_hit' | 'credit_event' | 'cron_roi_summary'
      | 'cron_credit_comparison' | 'credit_burn_check' | 'price_lock_sequence';
  user_id?: string;
  metadata?: Record<string, any>;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const sb = createClient(SB_URL, SB_KEY);
    const event: CampaignEvent = await req.json();

    switch (event.type) {
      // ─── Admin-triggered campaigns ───
      case 'admin_campaign':
        return await handleAdminCampaign(sb, event);

      // ─── Usage limit threshold hit ───
      case 'usage_limit_hit':
        return await handleUsageLimitHit(sb, event);

      // ─── Credit events (low, exhausted, burn rate) ───
      case 'credit_event':
        return await handleCreditEvent(sb, event);

      // ─── Credit burn rate check (cron) ───
      case 'credit_burn_check':
        return await handleCreditBurnCheck(sb);

      // ─── Monthly ROI summary (cron) ───
      case 'cron_roi_summary':
        return await handleRoiSummary(sb);

      // ─── Monthly credit cost comparison (cron) ───
      case 'cron_credit_comparison':
        return await handleCreditCostComparison(sb);

      // ─── Price lock warning sequence ───
      case 'price_lock_sequence':
        return await handlePriceLockSequence(sb, event);

      default:
        return json({ error: `Unknown event type: ${event.type}` }, 400);
    }
  } catch (err: any) {
    console.error('[marketing-campaign] Error:', err.message);
    return json({ error: err.message }, 500);
  }
});

// ═══════════════════════════════════════════════
// HANDLERS
// ═══════════════════════════════════════════════

async function handleAdminCampaign(sb: any, event: CampaignEvent) {
  const { metadata } = event;
  if (!metadata?.campaign_type) return json({ error: 'campaign_type required' }, 400);

  const campaignType = metadata.campaign_type; // promo_trial | promo_feature_preview
  const cohortId = metadata.cohort_id || 'default';
  const maxRecipients = metadata.max_recipients || 1000;

  // Get eligible users based on campaign targeting
  let query = sb
    .from('profiles')
    .select('id, email, first_name, plan, cohort_id')
    .eq('email_verified', true);

  // Tier targeting
  if (metadata.target_tier) {
    query = query.eq('plan', metadata.target_tier);
  }

  // Cohort targeting
  if (cohortId !== 'all') {
    query = query.eq('cohort_id', cohortId);
  }

  // Account age filter (for promo trials)
  if (metadata.min_account_age_days) {
    const cutoff = new Date(Date.now() - metadata.min_account_age_days * 86400_000);
    query = query.lt('created_at', cutoff.toISOString());
  }

  query = query.limit(maxRecipients);
  const { data: users } = await query;

  let sent = 0;
  let suppressed = 0;

  for (const user of users || []) {
    // Check marketing opt-in
    const hasOptIn = await checkMarketingOptIn(sb, user.id);
    if (!hasOptIn) { suppressed++; continue; }

    // Check frequency cap: max 1 promo per 7 days
    const recentPromo = await hasRecentNotification(sb, user.id, campaignType, 7);
    if (recentPromo) { suppressed++; continue; }

    await fireNotification(sb, user.id, campaignType, {
      user_name: user.first_name,
      promo_code: metadata.promo_code,
      trial_days: metadata.trial_days,
      feature_name: metadata.feature_name,
      feature_duration: metadata.feature_duration,
      ...metadata,
    });
    sent++;
  }

  // Log campaign execution
  await sb.from('marketing_campaign_log').insert({
    campaign_type: campaignType,
    cohort_id: cohortId,
    total_eligible: (users || []).length,
    total_sent: sent,
    total_suppressed: suppressed,
    metadata,
    executed_by: metadata.admin_id || 'system',
  });

  return json({ sent, suppressed, total_eligible: (users || []).length });
}

async function handleUsageLimitHit(sb: any, event: CampaignEvent) {
  const { user_id, metadata } = event;
  if (!user_id) return json({ error: 'user_id required' }, 400);

  const percentUsed = metadata?.percent_used || 80;
  const featureName = metadata?.feature_name || 'feature limit';

  // Only send for free tier users
  const { data: profile } = await sb
    .from('profiles')
    .select('plan, first_name')
    .eq('id', user_id)
    .single();

  if (!profile || profile.plan !== 'free') {
    return json({ skipped: true, reason: 'not_free_tier' });
  }

  // Frequency cap: max 1/week for upgrade prompts
  const recent = await hasRecentNotification(sb, user_id, 'usage_upgrade_prompt', 7);
  if (recent) return json({ skipped: true, reason: 'frequency_cap' });

  await fireNotification(sb, user_id, 'usage_upgrade_prompt', {
    user_name: profile.first_name,
    percent_used: percentUsed,
    feature_name: featureName,
    ...metadata,
  });

  return json({ sent: true, type: 'usage_upgrade_prompt' });
}

async function handleCreditEvent(sb: any, event: CampaignEvent) {
  const { user_id, metadata } = event;
  if (!user_id) return json({ error: 'user_id required' }, 400);

  const creditEventType = metadata?.credit_event_type;
  // credit_low_balance | credit_exhausted

  if (!creditEventType) return json({ error: 'credit_event_type required' }, 400);

  const { data: profile } = await sb
    .from('profiles')
    .select('first_name, plan')
    .eq('id', user_id)
    .single();

  await fireNotification(sb, user_id, creditEventType, {
    user_name: profile?.first_name,
    remaining_credits: metadata?.remaining_credits,
    ...metadata,
  });

  return json({ sent: true, type: creditEventType });
}

async function handleCreditBurnCheck(sb: any) {
  // Find users whose credit burn rate projects exhaustion before next billing cycle
  const { data: users } = await sb.rpc('get_credit_burn_rate_alerts');
  let sent = 0;

  for (const user of users || []) {
    // Max 1 per billing cycle
    const recent = await hasRecentNotification(sb, user.user_id, 'credit_burn_rate_alert', 30);
    if (recent) continue;

    await fireNotification(sb, user.user_id, 'credit_burn_rate_alert', {
      user_name: user.first_name,
      remaining_credits: user.remaining_credits,
      avg_daily_burn: user.avg_daily_burn,
      projected_exhaustion_date: user.projected_exhaustion_date,
      days_remaining: user.days_remaining,
      top_consumers: user.top_consumers, // [{type, credits}]
      current_plan: user.plan,
    });
    sent++;
  }

  return json({ sent });
}

async function handleRoiSummary(sb: any) {
  // Monthly ROI summary for free/starter users with 60+ day accounts
  const cutoff = new Date(Date.now() - 60 * 86400_000);
  const { data: users } = await sb
    .from('profiles')
    .select('id, first_name, plan, created_at')
    .in('plan', ['free', 'starter'])
    .lt('created_at', cutoff.toISOString())
    .eq('email_verified', true);

  let sent = 0;

  for (const user of users || []) {
    // Check marketing opt-in
    const hasOptIn = await checkMarketingOptIn(sb, user.id);
    if (!hasOptIn) continue;

    // Check suppression: skip if recently dismissed or upgraded
    const recentDismiss = await hasRecentNotification(sb, user.id, 'upgrade_roi_summary', 30);
    if (recentDismiss) continue;

    // Get usage stats
    const { data: stats } = await sb.rpc('get_user_monthly_stats', { p_user_id: user.id });
    if (!stats) continue;

    await fireNotification(sb, user.id, 'upgrade_roi_summary', {
      user_name: user.first_name,
      current_plan: user.plan,
      applications_count: stats.applications_count,
      matches_found: stats.matches_found,
      interviews_detected: stats.interviews_detected,
      ghost_alerts: stats.ghost_alerts,
      missed_auto_apply_count: stats.missed_auto_apply_count,
      missed_ai_scores: stats.missed_ai_scores,
    });
    sent++;
  }

  return json({ sent });
}

async function handleCreditCostComparison(sb: any) {
  // Monthly for free/starter users where credit spend > next tier cost
  const { data: users } = await sb.rpc('get_credit_cost_comparison_eligible');
  let sent = 0;

  for (const user of users || []) {
    const hasOptIn = await checkMarketingOptIn(sb, user.user_id);
    if (!hasOptIn) continue;

    const recent = await hasRecentNotification(sb, user.user_id, 'credit_cost_comparison', 30);
    if (recent) continue;

    await fireNotification(sb, user.user_id, 'credit_cost_comparison', {
      user_name: user.first_name,
      current_plan: user.current_plan,
      current_spend: user.monthly_credit_spend,
      next_plan: user.next_plan,
      next_plan_cost: user.next_plan_cost,
      savings: user.savings,
      credit_breakdown: user.credit_breakdown,
    });
    sent++;
  }

  return json({ sent });
}

async function handlePriceLockSequence(sb: any, event: CampaignEvent) {
  const { metadata } = event;
  if (!metadata?.price_increase_date) return json({ error: 'price_increase_date required' }, 400);

  const increaseDate = new Date(metadata.price_increase_date);
  const now = new Date();
  const daysUntil = Math.ceil((increaseDate.getTime() - now.getTime()) / 86400_000);

  // Only send at 14, 7, 1 day marks
  const validDays = [14, 7, 1];
  if (!validDays.includes(daysUntil)) {
    return json({ skipped: true, reason: `Not a send day (${daysUntil} days out)` });
  }

  // Get free tier users
  const { data: users } = await sb
    .from('profiles')
    .select('id, first_name, email')
    .eq('plan', 'free')
    .eq('email_verified', true);

  let sent = 0;

  for (const user of users || []) {
    const hasOptIn = await checkMarketingOptIn(sb, user.id);
    if (!hasOptIn) continue;

    // Check: haven't already sent for this days_until
    const already = await hasRecentNotification(sb, user.id, 'price_lock_warning', 1);
    if (already) continue;

    await fireNotification(sb, user.id, 'price_lock_warning', {
      user_name: user.first_name,
      current_price: metadata.current_price,
      new_price: metadata.new_price,
      increase_date: metadata.price_increase_date,
      days_until: daysUntil,
      annual_savings: metadata.annual_savings,
    });
    sent++;
  }

  return json({ sent, days_until: daysUntil });
}

// ═══════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════

async function fireNotification(
  sb: any,
  userId: string,
  notificationType: string,
  metadata: Record<string, any>
) {
  const res = await fetch(`${SB_URL}/functions/v1/send-notification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SB_KEY}`,
    },
    body: JSON.stringify({
      user_id: userId,
      notification_type: notificationType,
      metadata,
    }),
  });

  if (!res.ok) {
    console.warn(`[marketing-campaign] send-notification failed for ${notificationType}:`, await res.text());
  }
}

async function checkMarketingOptIn(sb: any, userId: string): Promise<boolean> {
  const { data } = await sb
    .from('notification_preferences')
    .select('marketing_opt_in')
    .eq('user_id', userId)
    .single();

  return data?.marketing_opt_in === true;
}

async function hasRecentNotification(
  sb: any,
  userId: string,
  notificationType: string,
  withinDays: number
): Promise<boolean> {
  const cutoff = new Date(Date.now() - withinDays * 86400_000);
  const { count } = await sb
    .from('notification_log')
    .select('id', { count: 'exact' })
    .eq('user_id', userId)
    .eq('notification_type', notificationType)
    .gte('sent_at', cutoff.toISOString());

  return (count || 0) > 0;
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
