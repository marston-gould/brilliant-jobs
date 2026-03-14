import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const { reward_id, reason } = await req.json();
    if (!reward_id) throw new Error("reward_id required");

    // Get reward details
    const { data: reward, error: rErr } = await sb
      .from("referral_rewards")
      .select("*")
      .eq("id", reward_id)
      .single();

    if (rErr || !reward) throw new Error("Reward not found: " + (rErr?.message || ""));
    if (reward.clawed_back_at) throw new Error("Already clawed back");

    const userId = reward.user_id;
    const val = reward.reward_value || {};
    const reversals: string[] = [];

    // 1. Reverse credits
    if (reward.reward_type === "credits" && val.credits) {
      const { data: latest } = await sb
        .from("credit_ledger")
        .select("balance_after")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const curBal = latest?.balance_after || 0;
      await sb.from("credit_ledger").insert({
        user_id: userId,
        type: "referral_clawback",
        amount: -val.credits,
        balance_after: Math.max(0, curBal - val.credits),
        description: `Referral reward clawback: ${val.credits} credits — ${reason || "admin action"}`,
        cost_category: "referral",
      });
      reversals.push(`credits: -${val.credits}`);
    }

    // 2. Reverse Pro time
    if (reward.reward_type === "pro_time" && val.days && val.days !== -1) {
      const { data: prof } = await sb
        .from("profiles")
        .select("pro_bonus_until")
        .eq("id", userId)
        .single();

      if (prof?.pro_bonus_until) {
        const newEnd = new Date(prof.pro_bonus_until);
        newEnd.setDate(newEnd.getDate() - val.days);
        const update = newEnd < new Date() ? null : newEnd.toISOString();
        await sb.from("profiles").update({ pro_bonus_until: update }).eq("id", userId);
        reversals.push(`pro_time: -${val.days}d`);
      }
    }

    // 3. Reverse extra filters
    if (reward.reward_type === "extra_filter" && val.filters) {
      await sb.rpc("exec_sql", {
        query: `UPDATE profiles SET extra_filters = GREATEST(0, extra_filters - ${val.filters}) WHERE id = '${userId}'`,
      });
      reversals.push(`filters: -${val.filters}`);
    }

    // 4. Reverse priority support
    if (reward.reward_type === "priority_support") {
      await sb.from("profiles").update({ priority_support: false }).eq("id", userId);
      reversals.push("priority_support: revoked");
    }

    // 5. Reverse beta access
    if (reward.reward_type === "beta_access") {
      await sb.from("profiles").update({ beta_access: false }).eq("id", userId);
      reversals.push("beta_access: revoked");
    }

    // 6. Reverse Stripe if applicable
    if (reward.stripe_action) {
      // If we extended a trial or gave credits, we log it but Stripe
      // credit notes need manual handling for safety
      reversals.push("stripe: manual review needed");
    }

    // Mark reward clawed back
    await sb.from("referral_rewards").update({
      clawed_back_at: new Date().toISOString(),
      clawback_reason: reason || "admin action",
    }).eq("id", reward_id);

    // If the referral that triggered this exists, update its status
    if (reward.referral_id) {
      await sb.from("referrals").update({ status: "clawed_back" }).eq("id", reward.referral_id);
    }

    // spec §11: referral_clawback PostHog event
    try {
      const phKey = Deno.env.get("POSTHOG_API_KEY");
      const phHost = Deno.env.get("POSTHOG_HOST") || "https://app.posthog.com";
      if (phKey && userId) {
        await fetch(`${phHost}/capture/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: phKey,
            distinct_id: userId,
            event: "referral_clawback",
            properties: {
              referrer_id: userId,
              referred_id: reward.referred_id || null,
              surface: "referral_reward_clawback",
            },
          }),
        });
      }
    } catch (_) { /* fire-and-forget */ }

    return new Response(JSON.stringify({ 
      success: true, 
      reward_id, 
      reversals,
      user_id: userId,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
