// supabase/functions/billing-notifications/index.ts
// Edge Function: Cron-triggered billing notification checks
// Handles: subscription_expiring (7-day + 1-day reminders)
// Triggered by pg_cron daily at 10:00 AM ET (15:00 UTC)
// v6.18 — Session 14: Billing + Payments Notifications

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createLogger } from "../_shared/logger.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ─── Notification helper ───
async function callSendNotification(params: {
  user_id: string;
  notification_type: string;
  payload: Record<string, unknown>;
}) {
  try {
    const res = await fetch(`${SB_URL}/functions/v1/send-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SB_KEY}`,
      },
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch (e) {
    console.error("[billing-notif] send-notification call failed:", (e as Error).message);
    return { error: (e as Error).message };
  }
}

// ═══════════════════════════════════════════════════════════
// SUBSCRIPTION EXPIRING REMINDERS
// Sends at 7 days and 1 day before current_period_end
// Only for subscriptions with cancel_at_period_end = true
// (i.e., user has cancelled but still has access until period end)
// ═══════════════════════════════════════════════════════════
async function checkSubscriptionExpiring(sb: SupabaseClient, logger: Logger) {
  const now = new Date();

  // 7-day window: period_end between 6.5 and 7.5 days from now
  const sevenDayStart = new Date(now.getTime() + 6.5 * 24 * 60 * 60 * 1000);
  const sevenDayEnd = new Date(now.getTime() + 7.5 * 24 * 60 * 60 * 1000);

  // 1-day window: period_end between 0.5 and 1.5 days from now
  const oneDayStart = new Date(now.getTime() + 0.5 * 24 * 60 * 60 * 1000);
  const oneDayEnd = new Date(now.getTime() + 1.5 * 24 * 60 * 60 * 1000);

  let sent7d = 0;
  let sent1d = 0;
  let skipped = 0;

  // ── 7-day reminders ──
  const { data: expiring7d } = await sb
    .from("user_subscriptions")
    .select("user_id, tier, current_period_end, stripe_subscription_id")
    .eq("cancel_at_period_end", true)
    .neq("status", "canceled")
    .gte("current_period_end", sevenDayStart.toISOString())
    .lte("current_period_end", sevenDayEnd.toISOString());

  for (const sub of expiring7d || []) {
    // Dedup: check if we already sent a 7-day reminder for this period_end
    const { data: existing } = await sb
      .from("notification_log")
      .select("id")
      .eq("user_id", sub.user_id)
      .eq("notification_type", "subscription_expiring")
      .gte("created_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1);

    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    const periodEnd = new Date(sub.current_period_end);
    const result = await callSendNotification({
      user_id: sub.user_id,
      notification_type: "subscription_expiring",
      payload: {
        tier: sub.tier,
        days_remaining: 7,
        renewal_date: periodEnd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        renewal_date_iso: periodEnd.toISOString(),
        reminder_type: "7_day",
      },
    });

    if (result?.email_sent) sent7d++;
    else skipped++;
  }

  // ── 1-day reminders ──
  const { data: expiring1d } = await sb
    .from("user_subscriptions")
    .select("user_id, tier, current_period_end, stripe_subscription_id")
    .eq("cancel_at_period_end", true)
    .neq("status", "canceled")
    .gte("current_period_end", oneDayStart.toISOString())
    .lte("current_period_end", oneDayEnd.toISOString());

  for (const sub of expiring1d || []) {
    const { data: existing } = await sb
      .from("notification_log")
      .select("id")
      .eq("user_id", sub.user_id)
      .eq("notification_type", "subscription_expiring")
      .gte("created_at", new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString())
      .limit(1);

    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    const periodEnd = new Date(sub.current_period_end);
    const result = await callSendNotification({
      user_id: sub.user_id,
      notification_type: "subscription_expiring",
      payload: {
        tier: sub.tier,
        days_remaining: 1,
        renewal_date: periodEnd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        renewal_date_iso: periodEnd.toISOString(),
        reminder_type: "1_day",
      },
    });

    if (result?.email_sent) sent1d++;
    else skipped++;
  }

  return { sent_7d: sent7d, sent_1d: sent1d, skipped };
}

// ═══════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  // Health check
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ status: "ok", function: "billing-notifications" }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }

  const correlationId = crypto.randomUUID();
  const logger = createLogger("billing-notifications", correlationId);

  try {
    const sb = createClient(SB_URL, SB_KEY);

    // Run subscription expiring checks
    const result = await checkSubscriptionExpiring(sb, logger);

    logger.info("Billing notification cron completed", result);

    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    logger.error("Billing notification cron error", { error: (err as Error).message });
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
