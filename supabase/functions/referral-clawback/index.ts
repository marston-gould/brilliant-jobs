// Brilliant Jobs — Referral Reward Clawback Edge Function
// v5.10: Phase 4
// Handles automated clawback (from fraud scan) and manual admin clawback
// Reverses: credits, pro_time, extra_filters, priority_support, beta_access, badges

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { user_id, reward_id, referral_id, reason, mode } = body;
    // mode: 'single_reward' | 'all_user_rewards' | 'referral_chain'

    const results: unknown[] = [];

    // Collect reward IDs to clawback
    let rewardIds: string[] = [];

    if (mode === 'single_reward' && reward_id) {
      rewardIds = [reward_id];
    } else if (mode === 'all_user_rewards' && user_id) {
      const { data: userRewards } = await sb
        .from('referral_rewards')
        .select('id')
        .eq('user_id', user_id)
        .is('clawed_back_at', null);
      rewardIds = (userRewards || []).map((r: Record<string, unknown>) => r.id);
    } else if (mode === 'referral_chain' && referral_id) {
      // Clawback rewards tied to a specific referral
      const { data: ref } = await sb
        .from('referrals')
        .select('referrer_id, referred_id')
        .eq('id', referral_id)
        .single();
      if (ref) {
        const { data: chainRewards } = await sb
          .from('referral_rewards')
          .select('id')
          .or(`referral_id.eq.${referral_id}`)
          .is('clawed_back_at', null);
        rewardIds = (chainRewards || []).map((r: Record<string, unknown>) => r.id);
        // Also reject the referral itself
        await sb.from('referrals').update({
          status: 'clawed_back',
          rejected_at: new Date().toISOString()
        }).eq('id', referral_id);
      }
    }

    // Process each reward
    for (const rid of rewardIds) {
      const { data: reward } = await sb
        .from('referral_rewards')
        .select('*')
        .eq('id', rid)
        .single();

      if (!reward || reward.clawed_back_at) continue;

      const val = reward.reward_value || {};
      const uid = reward.user_id;

      // Mark clawed back
      await sb.from('referral_rewards').update({
        clawed_back_at: new Date().toISOString(),
        clawback_reason: reason || 'Automated clawback'
      }).eq('id', rid);

      // Reverse by type
      switch (reward.reward_type) {
        case 'credits': {
          if (val.credits) {
            const { data: latest } = await sb
              .from('credit_ledger')
              .select('balance_after')
              .eq('user_id', uid)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();
            const curBal = latest?.balance_after || 0;
            await sb.from('credit_ledger').insert({
              user_id: uid,
              type: 'referral_clawback',
              amount: -val.credits,
              balance_after: Math.max(0, curBal - val.credits),
              description: `Clawback: ${val.credits} referral credits — ${reason || 'fraud'}`,
              cost_category: 'referral'
            });
          }
          break;
        }
        case 'pro_time': {
          if (val.days && val.days > 0) {
            const { data: prof } = await sb
              .from('profiles')
              .select('pro_bonus_until')
              .eq('id', uid)
              .single();
            if (prof?.pro_bonus_until) {
              const newEnd = new Date(prof.pro_bonus_until);
              newEnd.setDate(newEnd.getDate() - val.days);
              await sb.from('profiles').update({
                pro_bonus_until: newEnd < new Date() ? null : newEnd.toISOString()
              }).eq('id', uid);
            }
          } else if (val.days === -1) {
            // Lifetime was granted — remove it
            await sb.from('profiles').update({ pro_bonus_until: null }).eq('id', uid);
          }
          break;
        }
        case 'extra_filter': {
          if (val.filters) {
            const { data: prof } = await sb
              .from('profiles')
              .select('extra_filters')
              .eq('id', uid)
              .single();
            const cur = prof?.extra_filters || 0;
            await sb.from('profiles').update({
              extra_filters: Math.max(0, cur - val.filters)
            }).eq('id', uid);
          }
          break;
        }
        case 'priority_support': {
          await sb.from('profiles').update({ priority_support: false }).eq('id', uid);
          break;
        }
        case 'beta_access': {
          await sb.from('profiles').update({ beta_access: false }).eq('id', uid);
          break;
        }
        case 'badge': {
          if (val.badge_id) {
            await sb.from('referral_badges').update({
              earned_at: null
            }).eq('user_id', uid).eq('badge_type', val.badge_id);
          }
          break;
        }
      }

      results.push({ reward_id: rid, type: reward.reward_type, reversed: true });
    }

    // Recalculate referrer tier if we clawed back from a specific user
    if (user_id || (mode === 'referral_chain' && referral_id)) {
      const targetUserId = user_id || (await sb.from('referrals').select('referrer_id').eq('id', referral_id).single()).data?.referrer_id;
      if (targetUserId) {
        const { count } = await sb
          .from('referrals')
          .select('*', { count: 'exact', head: true })
          .eq('referrer_id', targetUserId)
          .in('status', ['activated', 'rewarded']);
        const cnt = count || 0;
        let tier = 0;
        if (cnt >= 25) tier = 5;
        else if (cnt >= 10) tier = 4;
        else if (cnt >= 5) tier = 3;
        else if (cnt >= 3) tier = 2;
        else if (cnt >= 1) tier = 1;
        await sb.from('profiles').update({ referral_tier: tier, referral_count: cnt }).eq('id', targetUserId);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      clawed_back: results.length,
      results
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: unknown) {
    console.error('[referral-clawback] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
