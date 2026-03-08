// supabase/functions/referral-lifecycle/index.ts
// Pod 2 Session 11 — Referral Notification Lifecycle
// Handles: referral_invite, referral_sent_confirmation, referral_status_update,
//   referral_nudge_referee, referral_conversion, referral_reward_earned,
//   referral_expiring_reward, referral_milestone, referral_periodic_summary
//
// Cron: referral_nudge_check — daily at 10:00 AM ET
//       referral_expiring_check — daily at 9:00 AM ET
//       referral_periodic_summary — 1st of month 9:00 AM ET

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL  = Deno.env.get('SUPABASE_URL')!;
const SB_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CORS    = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Types ──
interface ReferralEvent {
  type: 'invite_sent' | 'link_clicked' | 'referee_signup' | 'referee_activated'
      | 'nudge_check' | 'expiring_check' | 'periodic_summary'
      | 'milestone_check' | 'reward_applied';
  user_id?: string;
  referral_id?: string;
  referee_id?: string;
  metadata?: Record<string, unknown>;
}

// ── Milestone thresholds ──
const MILESTONES = [3, 5, 10, 25, 50];

// ── Nudge timing (hours after event) ──
const NUDGE_DELAYS = {
  signup_incomplete: 72,   // 72h after click w/o signup
  activation_incomplete: 48, // 48h after signup w/o activation
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const sb = createClient(SB_URL, SB_KEY);
    const event: ReferralEvent = await req.json();

    switch (event.type) {
      // ─── 1. Invite Sent ───
      case 'invite_sent':
        return await handleInviteSent(sb, event);

      // ─── 2. Link Clicked / Signup / Activation ───
      case 'link_clicked':
      case 'referee_signup':
      case 'referee_activated':
        return await handleStatusUpdate(sb, event);

      // ─── 3. Nudge Check (cron) ───
      case 'nudge_check':
        return await handleNudgeCheck(sb);

      // ─── 4. Expiring Reward Check (cron) ───
      case 'expiring_check':
        return await handleExpiringCheck(sb);

      // ─── 5. Monthly Summary (cron) ───
      case 'periodic_summary':
        return await handlePeriodicSummary(sb);

      // ─── 6. Milestone Check (called after conversion) ───
      case 'milestone_check':
        return await handleMilestoneCheck(sb, event);

      // ─── 7. Reward Applied ───
      case 'reward_applied':
        return await handleRewardApplied(sb, event);

      default:
        return json({ error: `Unknown event type: ${event.type}` }, 400);
    }
  } catch (err: unknown) {
    console.error('[referral-lifecycle] Error:', err.message);
    return json({ error: err.message }, 500);
  }
});

// ═══════════════════════════════════════════════
// HANDLERS
// ═══════════════════════════════════════════════

async function handleInviteSent(sb: SupabaseClient, event: ReferralEvent) {
  const { user_id, referral_id } = event;
  if (!user_id || !referral_id) return json({ error: 'user_id and referral_id required' }, 400);

  // Fire referral_sent_confirmation to referrer
  await fireNotification(sb, user_id, 'referral_sent_confirmation', {
    referral_id,
    ...event.metadata,
  });

  return json({ sent: true, type: 'referral_sent_confirmation' });
}

async function handleStatusUpdate(sb: SupabaseClient, event: ReferralEvent) {
  const { type } = event;
  let { referral_id } = event;

  // IX-DA-002: For referee_signup, allow lookup by referral_code when referral_id not provided
  if (!referral_id && type === 'referee_signup' && event.metadata?.referral_code) {
    const { data: found } = await sb
      .from('referral_invites')
      .select('id, referral_code')
      .eq('referral_code', event.metadata.referral_code)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (found) {
      // Create or update referral row linking referee to this invite
      const { data: existingRef } = await sb
        .from('referrals')
        .select('id')
        .eq('referral_code', event.metadata.referral_code)
        .is('referred_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (existingRef) {
        await sb
          .from('referrals')
          .update({ referred_id: event.referee_id, status: 'signed_up', signed_up_at: new Date().toISOString() })
          .eq('id', existingRef.id);
        referral_id = existingRef.id;
      } else {
        // No existing referral row — check referral_invites for referrer
        const { data: invite } = await sb
          .from('referral_invites')
          .select('user_id')
          .eq('referral_code', event.metadata.referral_code)
          .single();

        if (invite) {
          const { data: newRef } = await sb
            .from('referrals')
            .insert({
              referrer_id: invite.user_id,
              referred_id: event.referee_id,
              referral_code: event.metadata.referral_code,
              source: event.metadata?.source || 'direct',
              status: 'signed_up',
              signed_up_at: new Date().toISOString(),
            })
            .select('id')
            .single();
          if (newRef) referral_id = newRef.id;
        }
      }
    }
  }

  if (!referral_id) return json({ error: 'referral_id required (or valid referral_code for signup)' }, 400);

  // Get referral details
  const { data: referral } = await sb
    .from('referrals')
    .select('id, referrer_id, referred_id, status, referral_code')
    .eq('id', referral_id)
    .single();

  if (!referral) return json({ error: 'Referral not found' }, 404);

  // Map event to status
  const statusMap: Record<string, string> = {
    link_clicked: 'clicked',
    referee_signup: 'signed_up',
    referee_activated: 'activated',
  };

  const newStatus = statusMap[type];

  // Update referral status
  await sb
    .from('referrals')
    .update({ status: newStatus, [`${newStatus}_at`]: new Date().toISOString() })
    .eq('id', referral_id);

  // Notify referrer of status update
  await fireNotification(sb, referral.referrer_id, 'referral_status_update', {
    referral_id,
    new_status: newStatus,
    referee_name: event.metadata?.referee_name || 'Someone',
    ...event.metadata,
  });

  // If activated → fire conversion + milestone check
  if (type === 'referee_activated') {
    await fireNotification(sb, referral.referrer_id, 'referral_conversion', {
      referral_id,
      referee_name: event.metadata?.referee_name,
      reward: event.metadata?.reward,
    });

    // Trigger milestone check
    await handleMilestoneCheck(sb, { type: 'milestone_check', user_id: referral.referrer_id });
  }

  return json({ sent: true, type: 'referral_status_update', new_status: newStatus });
}

async function handleNudgeCheck(sb: SupabaseClient) {
  const now = new Date();
  let nudged = 0;

  // 1. Referrals where link was clicked but no signup after 72h
  const clickCutoff = new Date(now.getTime() - NUDGE_DELAYS.signup_incomplete * 3600_000);
  const { data: staleClicks } = await sb
    .from('referrals')
    .select('id, referrer_id, referred_email, referral_code')
    .eq('status', 'clicked')
    .lt('clicked_at', clickCutoff.toISOString())
    .is('nudge_sent_at', null);

  for (const ref of staleClicks || []) {
    // Check suppression: max 2 nudges per referral
    const { count } = await sb
      .from('notification_log')
      .select('id', { count: 'exact' })
      .eq('user_id', ref.referrer_id)
      .eq('notification_type', 'referral_nudge_referee')
      .eq('metadata->>referral_id', ref.id);

    if ((count || 0) < 2) {
      await fireNotification(sb, ref.referred_email, 'referral_nudge_referee', {
        referral_id: ref.id,
        referrer_name: ref.referrer_name,
        referral_code: ref.referral_code,
        nudge_reason: 'signup_incomplete',
      });
      await sb.from('referrals').update({ nudge_sent_at: now.toISOString() }).eq('id', ref.id);
      nudged++;
    }
  }

  // 2. Referrals where signed up but not activated after 48h
  const signupCutoff = new Date(now.getTime() - NUDGE_DELAYS.activation_incomplete * 3600_000);
  const { data: staleSignups } = await sb
    .from('referrals')
    .select('id, referrer_id, referred_id, referred_email, referral_code')
    .eq('status', 'signed_up')
    .lt('signed_up_at', signupCutoff.toISOString());

  for (const ref of staleSignups || []) {
    const { count } = await sb
      .from('notification_log')
      .select('id', { count: 'exact' })
      .eq('notification_type', 'referral_nudge_referee')
      .eq('metadata->>referral_id', ref.id)
      .eq('metadata->>nudge_reason', 'activation_incomplete');

    if ((count || 0) < 2) {
      await fireNotification(sb, ref.referred_id || ref.referred_email, 'referral_nudge_referee', {
        referral_id: ref.id,
        referrer_name: ref.referrer_name,
        referral_code: ref.referral_code,
        nudge_reason: 'activation_incomplete',
      });
      nudged++;
    }
  }

  return json({ nudged });
}

async function handleExpiringCheck(sb: SupabaseClient) {
  const now = new Date();
  let notified = 0;

  // Find rewards expiring within 7 days and 1 day
  for (const daysOut of [7, 1]) {
    const targetDate = new Date(now.getTime() + daysOut * 86400_000);
    const rangeStart = new Date(targetDate.getTime() - 3600_000); // 1h window
    const rangeEnd = new Date(targetDate.getTime() + 3600_000);

    const { data: expiring } = await sb
      .from('referral_rewards')
      .select('id, user_id, reward_type, reward_value, reward_name, expires_at')
      .eq('status', 'active')
      .gte('expires_at', rangeStart.toISOString())
      .lte('expires_at', rangeEnd.toISOString());

    for (const reward of expiring || []) {
      // Check suppression: don't re-send for same reward + days_out combo
      const { count } = await sb
        .from('notification_log')
        .select('id', { count: 'exact' })
        .eq('user_id', reward.user_id)
        .eq('notification_type', 'referral_expiring_reward')
        .eq('metadata->>reward_id', reward.id)
        .eq('metadata->>days_out', String(daysOut));

      if ((count || 0) === 0) {
        await fireNotification(sb, reward.user_id, 'referral_expiring_reward', {
          reward_id: reward.id,
          reward_name: reward.reward_name,
          reward_type: reward.reward_type,
          reward_value: reward.reward_value,
          days_remaining: daysOut,
          expires_at: reward.expires_at,
        });
        notified++;
      }
    }
  }

  return json({ notified });
}

async function handlePeriodicSummary(sb: SupabaseClient) {
  // Find all users with any referral activity
  const { data: referrers } = await sb
    .from('referrals')
    .select('referrer_id')
    .not('referrer_id', 'is', null);

  // Deduplicate
  const uniqueReferrers = [...new Set((referrers || []).map((r: Record<string, unknown>) => r.referrer_id))];
  let sent = 0;

  for (const userId of uniqueReferrers) {
    // Aggregate stats
    const { data: stats } = await sb.rpc('get_referral_stats', { p_user_id: userId });
    if (!stats || stats.total_sent === 0) continue;

    // Check notification prefs
    const shouldSend = await checkNotificationPrefs(sb, userId, 'referral_periodic_summary');
    if (!shouldSend) continue;

    await fireNotification(sb, userId, 'referral_periodic_summary', {
      total_sent: stats.total_sent,
      total_clicked: stats.total_clicked,
      total_signed_up: stats.total_signed_up,
      total_activated: stats.total_activated,
      total_earned: stats.total_earned,
      pending_count: stats.pending_count,
    });
    sent++;
  }

  return json({ sent });
}

async function handleMilestoneCheck(sb: SupabaseClient, event: ReferralEvent) {
  const userId = event.user_id;
  if (!userId) return json({ error: 'user_id required' }, 400);

  // Count activated referrals
  const { count: totalActivated } = await sb
    .from('referrals')
    .select('id', { count: 'exact' })
    .eq('referrer_id', userId)
    .eq('status', 'activated');

  const activatedCount = totalActivated || 0;

  // Check which milestones have been reached but not yet notified
  for (const milestone of MILESTONES) {
    if (activatedCount >= milestone) {
      // Check if already notified for this milestone
      const { count: alreadyNotified } = await sb
        .from('notification_log')
        .select('id', { count: 'exact' })
        .eq('user_id', userId)
        .eq('notification_type', 'referral_milestone')
        .eq('metadata->>milestone', String(milestone));

      if ((alreadyNotified || 0) === 0) {
        // Get reward config for this milestone
        const { data: milestoneConfig } = await sb
          .from('referral_milestone_rewards')
          .select('*')
          .eq('milestone_count', milestone)
          .single();

        await fireNotification(sb, userId, 'referral_milestone', {
          milestone,
          total_activated: activatedCount,
          reward: milestoneConfig?.reward_description || `${milestone} referrals!`,
          next_milestone: MILESTONES.find(m => m > milestone) || null,
        });
      }
    }
  }

  return json({ checked: true, activated: activatedCount });
}

async function handleRewardApplied(sb: SupabaseClient, event: ReferralEvent) {
  const { user_id } = event;
  if (!user_id) return json({ error: 'user_id required' }, 400);

  await fireNotification(sb, user_id, 'referral_reward_earned', {
    ...event.metadata,
  });

  return json({ sent: true });
}

// ═══════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════

async function fireNotification(
  sb: SupabaseClient,
  recipientIdOrEmail: string,
  notificationType: string,
  metadata: Record<string, unknown>
) {
  // Call the central send-notification Edge Function
  const res = await fetch(`${SB_URL}/functions/v1/send-notification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SB_KEY}`,
    },
    body: JSON.stringify({
      user_id: recipientIdOrEmail,
      notification_type: notificationType,
      metadata,
    }),
  });

  if (!res.ok) {
    console.warn(`[referral-lifecycle] send-notification failed for ${notificationType}:`, await res.text());
  }
}

async function checkNotificationPrefs(
  sb: SupabaseClient,
  userId: string,
  notificationType: string
): Promise<boolean> {
  const { data } = await sb
    .from('notification_preferences')
    .select('email_enabled')
    .eq('user_id', userId)
    .eq('notification_type', notificationType)
    .single();

  // Default to true if no preference set
  return data?.email_enabled !== false;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
