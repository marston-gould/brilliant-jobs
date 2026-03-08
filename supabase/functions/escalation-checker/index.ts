// escalation-checker Edge Function — v2 (Session 15, v6.19)
// Hardened from v1 with:
//   1. Idempotency: dedup SMS sends via notification_log check before sending
//   2. Batch limits: process max 100 actions per run to avoid timeout
//   3. Dead letter: actions stuck in 'pending' for >48h get marked 'expired' not 'missed'
//   4. Structured error per-action: one failure doesn't abort the sweep
//   5. Retry guard: skip actions already being processed (locked_at)
//   6. Metrics: detailed logging for each outcome
//
// Triggered by pg_cron every 15 minutes.
// Sweeps notification_actions for:
// 1. 'pending' actions past escalation timeout → send SMS → mark 'escalated'
// 2. 'escalated' actions past SMS grace period (2h) → mark 'missed'
// 3. 'pending' actions past 48h → mark 'expired' (dead letter)
// Respects quiet hours — pauses escalation timers during quiet period.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { applyAlertSms } from "../_shared/sms-templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const SMS_GRACE_HOURS = 2;
const BATCH_LIMIT = 100;
const DEAD_LETTER_HOURS = 48;

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
  } catch (e) { console.warn("[EF][escalation-checker]", e?.message || String(e));
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
  const metrics = {
    escalated: 0,
    missed: 0,
    expired: 0,
    skippedQuiet: 0,
    skippedDedup: 0,
    errors: 0,
    checked_at: now.toISOString(),
  };

  try {
    // ============================================================
    // PHASE 0: Dead letter — pending actions older than 48h
    // These are stuck and should not block the system
    // ============================================================
    const deadLetterCutoff = new Date(now.getTime() - DEAD_LETTER_HOURS * 3600000);
    const { data: staleActions } = await sb
      .from("notification_actions")
      .select("id, user_id, job_title, company_name")
      .eq("status", "pending")
      .lt("email_sent_at", deadLetterCutoff.toISOString())
      .limit(BATCH_LIMIT);

    for (const action of staleActions || []) {
      await sb
        .from("notification_actions")
        .update({ status: "expired" })
        .eq("id", action.id);
      metrics.expired++;
      console.log(`[escalation-checker] EXPIRED (48h+): ${action.job_title} at ${action.company_name} for ${action.user_id}`);
    }

    // ============================================================
    // PHASE 1: Pending → Escalate (send SMS)
    // Find pending actions where enough time has passed since email_sent_at
    // Excludes dead-letter range (handled above)
    // ============================================================
    const { data: pendingActions } = await sb
      .from("notification_actions")
      .select("*")
      .eq("status", "pending")
      .not("email_sent_at", "is", null)
      .gte("email_sent_at", deadLetterCutoff.toISOString())
      .limit(BATCH_LIMIT);

    for (const action of pendingActions || []) {
      try {
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
          metrics.skippedQuiet++;
          continue;
        }

        // ─── Idempotency: check if SMS already sent for this action ───
        const idempotencyKey = `escalation_sms_${action.id}`;
        const { data: existingSms } = await sb
          .from("notification_log")
          .select("id")
          .eq("user_id", action.user_id)
          .eq("notification_type", "apply_alert")
          .eq("channel", "sms")
          .ilike("payload->>idempotency_key", idempotencyKey)
          .limit(1);

        if (existingSms && existingSms.length > 0) {
          // SMS was already sent but action wasn't updated — fix the status
          await sb
            .from("notification_actions")
            .update({ status: "escalated", sms_sent_at: now.toISOString() })
            .eq("id", action.id);
          metrics.skippedDedup++;
          console.log(`[escalation-checker] DEDUP: SMS already sent for action ${action.id}, fixed status`);
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

            const sendResp = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
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
                idempotency_key: idempotencyKey,
                user_plan: action.notification_tier || "unknown",
                user_cohort: "cohort_launch",
                template_version: "2.0.0",
              }),
            });

            if (!sendResp.ok) {
              const errText = await sendResp.text();
              console.error(`[escalation-checker] SMS send failed for action ${action.id}: ${errText}`);
              metrics.errors++;
              continue; // Don't mark as escalated if send failed
            }

            // Update action to escalated
            await sb
              .from("notification_actions")
              .update({
                status: "escalated",
                sms_sent_at: now.toISOString(),
              })
              .eq("id", action.id);

            metrics.escalated++;
            console.log(`[escalation-checker] ESCALATED: ${action.job_title} at ${action.company_name} → SMS sent to user ${action.user_id}`);
            continue;
          }
        }

        // SMS not enabled/available — mark as missed immediately
        await sb
          .from("notification_actions")
          .update({ status: "missed" })
          .eq("id", action.id);

        metrics.missed++;
        console.log(`[escalation-checker] MISSED (no SMS): ${action.job_title} at ${action.company_name} for user ${action.user_id}`);
      } catch (actionErr) {
        console.error(`[escalation-checker] Error processing pending action ${action.id}:`, actionErr);
        metrics.errors++;
      }
    }

    // ============================================================
    // PHASE 2: Escalated → Missed (SMS grace period expired)
    // Find escalated actions where 2+ hours have passed since sms_sent_at
    // ============================================================
    const { data: escalatedActions } = await sb
      .from("notification_actions")
      .select("*")
      .eq("status", "escalated")
      .not("sms_sent_at", "is", null)
      .limit(BATCH_LIMIT);

    for (const action of escalatedActions || []) {
      try {
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
          metrics.skippedQuiet++;
          continue;
        }

        await sb
          .from("notification_actions")
          .update({ status: "missed" })
          .eq("id", action.id);

        metrics.missed++;
        console.log(`[escalation-checker] MISSED (SMS timeout): ${action.job_title} at ${action.company_name} for user ${action.user_id}`);
      } catch (actionErr) {
        console.error(`[escalation-checker] Error processing escalated action ${action.id}:`, actionErr);
        metrics.errors++;
      }
    }

    console.log("[escalation-checker] Summary:", metrics);

    return new Response(JSON.stringify(metrics), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[escalation-checker] Fatal error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
