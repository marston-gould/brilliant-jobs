// distribute-leaderboard-rewards Edge Function
// Called by pg_cron via HTTP or manually from admin console.
// 1. Calls distribute_leaderboard_rewards RPC
// 2. Sends admin alert with summary
// 3. Sends reward notification emails to winners

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { leaderboardRewardEmail } from "../_shared/email-templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "Brilliant Jobs <notifications@brilliantjobs.app>";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "admin@brilliantjobs.app";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  try {
    const { period_type = "weekly" } = await req.json().catch(() => ({}));
    if (!["weekly", "monthly"].includes(period_type)) {
      return new Response(JSON.stringify({ error: "Invalid period_type" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    console.log(`[Leaderboard] Distributing ${period_type} rewards...`);

    const { data: result, error: rpcErr } = await sb.rpc("distribute_leaderboard_rewards", { p_period_type: period_type });

    if (rpcErr) {
      console.error("[Leaderboard] RPC error:", rpcErr);
      await sendAdminAlert(period_type, null, rpcErr.message);
      return new Response(JSON.stringify({ error: rpcErr.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    console.log("[Leaderboard] Distribution result:", result);
    await sendAdminAlert(period_type, result, null);

    if (result?.status === "complete" && result.success > 0) {
      await notifyWinners(period_type, result);
    }

    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[Leaderboard] Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});

async function sendAdminAlert(periodType: string, result: Record<string, unknown> | null, error: string | null) {
  const status = error ? "FAILED" : result?.status === "complete" ? "SUCCESS" : String(result?.status || "unknown");
  const subject = `[BJ] Leaderboard ${periodType} distribution: ${status}`;
  let body: string;
  if (error) {
    body = `<h2>Distribution Failed</h2><p>Period: ${periodType}</p><p>Error: ${error}</p>`;
  } else if (result) {
    body = `<h2>Distribution Complete</h2>
      <table style="border-collapse:collapse;font-family:monospace;">
        <tr><td style="padding:4px 12px;">Period</td><td>${result.period_type}</td></tr>
        <tr><td style="padding:4px 12px;">Window</td><td>${result.period_start} → ${result.period_end}</td></tr>
        <tr><td style="padding:4px 12px;">Qualifying</td><td>${result.total_qualifying}</td></tr>
        <tr><td style="padding:4px 12px;">Rewarded</td><td>${result.success}</td></tr>
        <tr><td style="padding:4px 12px;">Failed</td><td>${result.fail}</td></tr>
        <tr><td style="padding:4px 12px;">Credits</td><td>${result.total_credits}</td></tr>
        <tr><td style="padding:4px 12px;">Pro days</td><td>${result.total_pro_days}</td></tr>
      </table>`;
  } else {
    body = `<p>Unknown result for ${periodType}.</p>`;
  }
  try {
  // EMAIL KILL SWITCH — set EMAIL_ENABLED=false in Supabase secrets to disable all outbound email
  if (Deno.env.get("EMAIL_ENABLED") === "false") {
    console.log("[email] EMAIL_ENABLED=false — email suppressed");
    return false;
  }
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: [ADMIN_EMAIL], subject, html: body }),
    });
  } catch (err) { console.error("[Leaderboard] Admin alert failed:", err); }
}

async function notifyWinners(periodType: string, result: Record<string, unknown>) {
  const { data: rewards } = await sb
    .from("leaderboard_rewards")
    .select("user_id, rank, credits_awarded, pro_days_awarded, reward_tier")
    .eq("period_type", periodType)
    .eq("period_start", result.period_start as string)
    .eq("notified", false)
    .order("rank", { ascending: true });

  if (!rewards?.length) return;

  for (const reward of rewards) {
    try {
      const { data: profile } = await sb.from("profiles").select("email, full_name, notification_preferences").eq("id", reward.user_id).single();
      if (!profile?.email) continue;
      if ((profile.notification_preferences || {}).referral_emails === false) continue;

      const periodLabel = periodType === "weekly" ? "this week" : "this month";
      const subject = `You ranked #${reward.rank} on the leaderboard ${periodLabel}`;
      const html = leaderboardRewardEmail({
        displayName: profile.full_name || "there",
        rank: reward.rank, credits: reward.credits_awarded,
        proDays: reward.pro_days_awarded, periodType, periodLabel,
      });

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_EMAIL, to: [profile.email], subject, html }),
      });

      await sb.from("leaderboard_rewards").update({ notified: true })
        .eq("user_id", reward.user_id).eq("period_type", periodType).eq("period_start", result.period_start as string);
    } catch (err) { console.error(`[Leaderboard] Notify error for ${reward.user_id}:`, err); }
  }
  console.log(`[Leaderboard] Notified ${rewards.length} winners.`);
}
