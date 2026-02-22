// escalation-checker Edge Function
// Triggered by pg_cron every 15 minutes.
// Sweeps notification_actions for:
// 1. 'pending' actions past escalation timeout → send SMS → mark 'escalated'
// 2. 'escalated' actions past SMS grace period (2h) → mark 'missed'
// Respects quiet hours — pauses escalation timers during quiet period.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { applyAlertSms } from "../_shared/sms-templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const SMS_GRACE_HOURS = 2;

function isQuietHours(quietStart: string, quietEnd: string, timezone: string): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0");
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0");
    const currentMinutes = hour * 60 + minute;

    const [startH, startM] = quietStart.split(":").map(Number);
    const [endH, endM] = quietEnd.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch {
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const now = new Date();
  let escalated = 0;
  let missed = 0;
  let skippedQuiet = 0;

  try {
    // ============================================================
    // PHASE 1: Pending → Escalate (send SMS)
    // Find pending actions where enough time has passed since email_sent_at
    // ============================================================
    const { data: pendingActions } = await sb
      .from("notification_actions")
      .select("*")
      .eq("status", "pending")
      .not("email_sent_at", "is", null);

    for (const action of pendingActions || []) {
      // Get user's escalation preferences
      const { data: prefs } = await sb
        .from("notification_preferences")
        .select("escalation_timeout_hours, quiet_start, quiet_end, timezone, phone_number, phone_verified, sms_enabled")
        .eq("user_id", action.user_id)
        .single();

      const timeoutHours = prefs?.escalation_timeout_hours || 4;
      const emailSentAt = new Date(action.email_sent_at);
      const hoursSinceEmail = (now.getTime() - emailSentAt.getTime()) / 3600000;

      // Not past timeout yet
      if (hoursSinceEmail < timeoutHours) continue;

      // Check quiet hours — skip if in quiet period
      const quietStart = prefs?.quiet_start || "22:00:00";
      const quietEnd = prefs?.quiet_end || "07:00:00";
      const timezone = prefs?.timezone || "America/New_York";

      if (isQuietHours(quietStart, quietEnd, timezone)) {
        skippedQuiet++;
        continue;
      }

      // Can we send SMS?
      if (prefs?.sms_enabled && prefs?.phone_verified && prefs?.phone_number) {
        // Check channel preferences for apply_alert
        const { data: channelPref } = await sb
          .from("notification_channels")
          .select("sms")
          .eq("user_id", action.user_id)
          .eq("notification_type", "apply_alert")
          .single();

        if (channelPref?.sms) {
          // Send SMS via send-notification
          const smsText = applyAlertSms(action.company_name, action.job_title);

          await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              user_id: action.user_id,
              notification_type: "apply_alert",
              sms_text: smsText,
              job_id: action.job_id,
              company_name: action.company_name,
              job_title: action.job_title,
              force_channel: "sms",
              // v2 tracking
              idempotency_key: `escalation_sms_${action.id}`,
              user_plan: action.notification_tier || "unknown",
              user_cohort: "cohort_launch",
              template_version: "2.0.0",
            }),
          });

          // Update action to escalated
          await sb
            .from("notification_actions")
            .update({
              status: "escalated",
              sms_sent_at: now.toISOString(),
            })
            .eq("id", action.id);

          escalated++;
          console.log(`[escalation-checker] ESCALATED: ${action.job_title} at ${action.company_name} → SMS sent to user ${action.user_id}`);
          continue;
        }
      }

      // SMS not enabled/available — mark as missed immediately
      await sb
        .from("notification_actions")
        .update({ status: "missed" })
        .eq("id", action.id);

      missed++;
      console.log(`[escalation-checker] MISSED (no SMS): ${action.job_title} at ${action.company_name} for user ${action.user_id}`);
    }

    // ============================================================
    // PHASE 2: Escalated → Missed (SMS grace period expired)
    // Find escalated actions where 2+ hours have passed since sms_sent_at
    // ============================================================
    const { data: escalatedActions } = await sb
      .from("notification_actions")
      .select("*")
      .eq("status", "escalated")
      .not("sms_sent_at", "is", null);

    for (const action of escalatedActions || []) {
      const smsSentAt = new Date(action.sms_sent_at);
      const hoursSinceSms = (now.getTime() - smsSentAt.getTime()) / 3600000;

      if (hoursSinceSms < SMS_GRACE_HOURS) continue;

      // Check quiet hours
      const { data: prefs } = await sb
        .from("notification_preferences")
        .select("quiet_start, quiet_end, timezone")
        .eq("user_id", action.user_id)
        .single();

      const quietStart = prefs?.quiet_start || "22:00:00";
      const quietEnd = prefs?.quiet_end || "07:00:00";
      const timezone = prefs?.timezone || "America/New_York";

      if (isQuietHours(quietStart, quietEnd, timezone)) {
        skippedQuiet++;
        continue;
      }

      await sb
        .from("notification_actions")
        .update({ status: "missed" })
        .eq("id", action.id);

      missed++;
      console.log(`[escalation-checker] MISSED (SMS timeout): ${action.job_title} at ${action.company_name} for user ${action.user_id}`);
    }

    const summary = { escalated, missed, skippedQuiet, checked_at: now.toISOString() };
    console.log("[escalation-checker] Summary:", summary);

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[escalation-checker] Error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
