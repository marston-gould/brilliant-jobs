// supabase/functions/community-feedback/index.ts
// Pod 2 Session 13 — Community, Feedback + Canny Integration
// Handles: bug_report_thankyou, bug_resolved, feature_request_thankyou,
//   feature_request_accepted, feature_request_shipped, monthly_product_update
//
// Endpoints:
//   POST /canny-webhook  — Canny status change webhook
//   POST /monthly-update — Cron: 1st of month 9:00 AM ET
//   POST /grant-bounty   — Admin: manually grant bug bounty entitlement

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CANNY_WEBHOOK_SECRET = Deno.env.get('CANNY_WEBHOOK_SECRET') || '';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Bug Bounty Reward Tiers ──
const BOUNTY_TIERS: Record<string, { credits: number; trial_days: number; pro_months: number }> = {
  minor:    { credits: 10, trial_days: 0, pro_months: 0 },
  major:    { credits: 50, trial_days: 7, pro_months: 0 },
  critical: { credits: 0,  trial_days: 0, pro_months: 1 },
};

// ── Canny status → notification type map ──
const STATUS_MAP: Record<string, string> = {
  // Bug lifecycle
  'bug.status_change.open':      'bug_report_thankyou',
  'bug.status_change.under_review': 'bug_report_thankyou',
  'bug.status_change.planned':   'bug_report_thankyou',
  'bug.status_change.complete':  'bug_resolved',
  // Feature request lifecycle
  'post.created':                'feature_request_thankyou',
  'post.status_change.planned':  'feature_request_accepted',
  'post.status_change.complete': 'feature_request_shipped',
};

interface CommunityEvent {
  type: 'canny_webhook' | 'monthly_update' | 'grant_bounty';
  // canny_webhook fields
  webhook_event?: string;
  canny_data?: Record<string, unknown>;
  // grant_bounty fields
  user_id?: string;
  canny_post_id?: string;
  severity?: 'minor' | 'major' | 'critical';
  bug_title?: string;
  admin_id?: string;
  // monthly_update fields
  features_shipped?: Array<{ title: string; description: string }>;
  bugs_fixed?: number;
  coming_next?: Array<{ title: string; eta: string }>;
  platform_stats?: Record<string, unknown>;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const sb = createClient(SB_URL, SB_KEY);
    const event: CommunityEvent = await req.json();

    switch (event.type) {
      case 'canny_webhook':
        return await handleCannyWebhook(sb, event);

      case 'monthly_update':
        return await handleMonthlyUpdate(sb, event);

      case 'grant_bounty':
        return await handleGrantBounty(sb, event);

      default:
        return json({ error: `Unknown event type: ${event.type}` }, 400);
    }
  } catch (err) {
    console.error('[community-feedback] Error:', err);
    return json({ error: err.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════
// 1. CANNY WEBHOOK HANDLER
// ═══════════════════════════════════════════════════════════
async function handleCannyWebhook(sb: SupabaseClient, event: CommunityEvent) {
  const webhookEvent = event.webhook_event || '';
  const data = event.canny_data || {};

  // Map Canny event → notification type
  const notificationType = STATUS_MAP[webhookEvent];
  if (!notificationType) {
    return json({ skipped: true, reason: `Unmapped webhook event: ${webhookEvent}` });
  }

  // Extract user info from Canny data
  const cannyUser = data.author || data.user || {};
  const email = cannyUser.email;
  if (!email) {
    return json({ skipped: true, reason: 'No email in Canny payload' });
  }

  // Look up user by email
  const { data: profile } = await sb
    .from('profiles')
    .select('id, first_name, email')
    .eq('email', email)
    .single();

  if (!profile) {
    return json({ skipped: true, reason: `User not found: ${email}` });
  }

  // Build notification payload based on type
  const payload: Record<string, unknown> = {
    firstName: profile.first_name || 'there',
    cannyUrl: data.url || data.post?.url || '',
  };

  if (notificationType === 'bug_report_thankyou') {
    payload.bugTitle = data.title || data.post?.title || 'Your report';
    payload.bugId = data.id || '';
    payload.severity = data.tags?.includes('critical') ? 'critical'
      : data.tags?.includes('major') ? 'major' : 'minor';
    // Auto-grant bounty for confirmed bugs
    if (webhookEvent.includes('open') || webhookEvent.includes('under_review')) {
      await autoGrantBounty(sb, profile.id, payload.severity, data.id, payload.bugTitle);
      const tier = BOUNTY_TIERS[payload.severity] || BOUNTY_TIERS.minor;
      payload.rewardCredits = tier.credits;
      payload.rewardTrial = tier.trial_days > 0 ? `${tier.trial_days}-day Pro trial` : '';
    }
  } else if (notificationType === 'bug_resolved') {
    payload.bugTitle = data.title || data.post?.title || '';
    payload.bugId = data.id || '';
    payload.fixSummary = data.changeComment || 'This issue has been fixed.';
    payload.releasedIn = data.tags?.find((t: string) => t.startsWith('v')) || 'latest release';
  } else if (notificationType === 'feature_request_thankyou') {
    payload.featureTitle = data.title || '';
    payload.featureId = data.id || '';
  } else if (notificationType === 'feature_request_accepted') {
    payload.featureTitle = data.title || data.post?.title || '';
    payload.featureId = data.id || data.post?.id || '';
    payload.estimatedTimeline = data.eta || 'TBD';
  } else if (notificationType === 'feature_request_shipped') {
    payload.featureTitle = data.title || data.post?.title || '';
    payload.featureId = data.id || data.post?.id || '';
    payload.featureDescription = data.details || '';
    payload.howToAccess = data.changeComment || 'Check your dashboard for the latest update.';
  }

  // Dedup: check notification_log for recent same-type send
  const { data: recentSend } = await sb
    .from('notification_log')
    .select('id')
    .eq('user_id', profile.id)
    .eq('notification_type', notificationType)
    .gte('created_at', new Date(Date.now() - 3600000).toISOString()) // 1h dedup
    .limit(1);

  if (recentSend && recentSend.length > 0) {
    return json({ skipped: true, reason: 'Dedup: same notification sent within 1h' });
  }

  // Send via send-notification
  const sendResult = await callSendNotification(sb, {
    user_id: profile.id,
    notification_type: notificationType,
    payload,
  });

  return json({ sent: true, notification_type: notificationType, result: sendResult });
}

// ═══════════════════════════════════════════════════════════
// 2. MONTHLY PRODUCT UPDATE (cron: 1st of month)
// ═══════════════════════════════════════════════════════════
async function handleMonthlyUpdate(sb: SupabaseClient, event: CommunityEvent) {
  // Get all users with marketing opt-in (monthly_product_update is marketing classification)
  const { data: users, error } = await sb
    .from('profiles')
    .select('id, first_name, email')
    .eq('email_verified', true);

  if (error || !users) {
    return json({ error: 'Failed to fetch users', details: error?.message }, 500);
  }

  // Build the update payload from admin-curated content or auto-pull
  const now = new Date();
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const payload = {
    monthLabel,
    featuresShipped: event.features_shipped || [],
    bugsFixed: event.bugs_fixed || 0,
    comingNext: event.coming_next || [],
    platformStats: event.platform_stats || {},
    changelogUrl: 'https://brilliantjobs.app/changelog',
  };

  let sentCount = 0;
  let skippedCount = 0;

  for (const user of users) {
    try {
      const result = await callSendNotification(sb, {
        user_id: user.id,
        notification_type: 'monthly_product_update',
        payload: { ...payload, firstName: user.first_name || 'there' },
      });
      if (result?.email_sent) sentCount++;
      else skippedCount++;
    } catch (e) {
      skippedCount++;
      console.warn(`[monthly-update] Failed for ${user.id}:`, e.message);
    }
  }

  return json({ sent: sentCount, skipped: skippedCount, total: users.length });
}

// ═══════════════════════════════════════════════════════════
// 3. BUG BOUNTY GRANT (admin action)
// ═══════════════════════════════════════════════════════════
async function handleGrantBounty(sb: SupabaseClient, event: CommunityEvent) {
  const { user_id, severity, canny_post_id, bug_title, admin_id } = event;
  if (!user_id || !severity) {
    return json({ error: 'user_id and severity required' }, 400);
  }

  return await autoGrantBounty(sb, user_id, severity, canny_post_id || '', bug_title || '', admin_id);
}

// ── Shared: auto-grant bounty with dedup ──
async function autoGrantBounty(
  sb: SupabaseClient, userId: string, severity: string,
  cannyPostId: string, bugTitle: string, adminId?: string
) {
  const tier = BOUNTY_TIERS[severity] || BOUNTY_TIERS.minor;

  // Dedup: check for existing grant for this Canny post
  if (cannyPostId) {
    const { data: existing } = await sb
      .from('entitlement_grants')
      .select('id')
      .eq('canny_post_id', cannyPostId)
      .eq('user_id', userId)
      .limit(1);

    if (existing && existing.length > 0) {
      return { skipped: true, reason: 'Bounty already granted for this post' };
    }
  }

  // Insert entitlement grant
  const grantData: Record<string, unknown> = {
    user_id: userId,
    grant_type: 'bug_bounty',
    source_type: 'bug_report',
    source_id: cannyPostId || null,
    severity,
    credits_granted: tier.credits,
    trial_days_granted: tier.trial_days,
    pro_months_granted: tier.pro_months,
    canny_post_id: cannyPostId || null,
    status: adminId ? 'approved' : 'pending',
    admin_approved: !!adminId,
    admin_approved_by: adminId || null,
    admin_approved_at: adminId ? new Date().toISOString() : null,
    notes: `Bug bounty: ${severity} — ${bugTitle}`,
  };

  const { data: grant, error } = await sb
    .from('entitlement_grants')
    .insert(grantData)
    .select()
    .single();

  if (error) {
    console.error('[bounty] Insert error:', error);
    return { error: error.message };
  }

  // If admin-approved or auto-approved minor bugs, apply immediately
  if (adminId || severity === 'minor') {
    await applyEntitlement(sb, userId, grant.id, tier);
  }

  return { granted: true, grant_id: grant.id, tier, severity };
}

// ── Apply entitlement: credit balance + trial extension ──
async function applyEntitlement(sb: SupabaseClient, userId: string, grantId: string, tier: unknown) {
  // Add credits to user balance
  if (tier.credits > 0) {
    const { data: profile } = await sb
      .from('profiles')
      .select('credit_balance')
      .eq('id', userId)
      .single();

    const currentBalance = profile?.credit_balance || 0;
    await sb.from('profiles')
      .update({ credit_balance: currentBalance + tier.credits, updated_at: new Date().toISOString() })
      .eq('id', userId);
  }

  // Mark grant as applied
  await sb.from('entitlement_grants')
    .update({
      status: 'applied',
      applied_at: new Date().toISOString(),
      expires_at: tier.trial_days > 0
        ? new Date(Date.now() + tier.trial_days * 86400000).toISOString()
        : tier.pro_months > 0
          ? new Date(Date.now() + tier.pro_months * 30 * 86400000).toISOString()
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', grantId);
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
async function callSendNotification(sb: SupabaseClient, params: {
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
    console.error('[send-notification] Call failed:', e.message);
    return { error: e.message };
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
