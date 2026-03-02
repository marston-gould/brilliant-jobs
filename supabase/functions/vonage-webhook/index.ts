// vonage-webhook Edge Function — v1 (Phase 69 Session 2, Card 6)
// Receives Vonage Delivery Receipt (DLR) callbacks for outbound SMS.
// Updates notification_log with SMS delivery status.
// Tracks SMS failures per-user for auto-fallback to email-only.
// Queues retry for transient failures via held_notifications.
//
// Vonage DLR callback fields:
//   msisdn (recipient), to (your number), network-code, messageId,
//   price, status, scts (timestamp), err-code, message-timestamp

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Vonage SMS delivery status codes
// https://developer.vonage.com/en/messaging/sms/guides/delivery-receipts
const TERMINAL_SUCCESS = new Set(["delivered", "accepted"]);
const TERMINAL_FAILURE = new Set([
  "failed", "rejected", "expired", "impossible", "unknown",
]);
const RETRYABLE_FAILURES = new Set(["expired", "unknown"]);

interface VonageDLR {
  msisdn: string;         // Recipient phone number
  to: string;             // Your Vonage number
  "network-code"?: string;
  messageId: string;      // Vonage message ID
  price?: string;
  status: string;         // delivered, failed, rejected, expired, accepted, buffered, unknown
  scts?: string;          // Timestamp from carrier
  "err-code"?: string;    // Vonage error code (0 = success)
  "message-timestamp"?: string;
  "client-ref"?: string;  // Optional reference we set on send
}

// Parse DLR params from GET query string or POST body
async function parseDLR(req: Request): Promise<VonageDLR | null> {
  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      return {
        msisdn: url.searchParams.get("msisdn") || "",
        to: url.searchParams.get("to") || "",
        "network-code": url.searchParams.get("network-code") || "",
        messageId: url.searchParams.get("messageId") || "",
        price: url.searchParams.get("price") || "",
        status: url.searchParams.get("status") || "",
        scts: url.searchParams.get("scts") || "",
        "err-code": url.searchParams.get("err-code") || "",
        "message-timestamp": url.searchParams.get("message-timestamp") || "",
        "client-ref": url.searchParams.get("client-ref") || "",
      };
    }

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return await req.json();
    }

    // URL-encoded form data (Vonage default)
    const body = await req.text();
    const p = new URLSearchParams(body);
    return {
      msisdn: p.get("msisdn") || "",
      to: p.get("to") || "",
      "network-code": p.get("network-code") || "",
      messageId: p.get("messageId") || "",
      price: p.get("price") || "",
      status: p.get("status") || "",
      scts: p.get("scts") || "",
      "err-code": p.get("err-code") || "",
      "message-timestamp": p.get("message-timestamp") || "",
      "client-ref": p.get("client-ref") || "",
    };
  } catch (e) {
    console.error("[vonage-webhook] Failed to parse DLR:", e);
    return null;
  }
}

// Map Vonage status to our notification_log status
function mapVonageStatus(status: string): string {
  const s = status.toLowerCase();
  if (s === "delivered" || s === "accepted") return "delivered";
  if (s === "buffered") return "sent"; // Still in transit
  return "failed";
}

serve(async (req: Request) => {
  // Vonage always expects 200; non-200 triggers retries
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const dlr = await parseDLR(req);
  if (!dlr || !dlr.messageId || !dlr.status) {
    console.warn("[vonage-webhook] Invalid DLR payload");
    return new Response("OK", { status: 200 });
  }

  const status = dlr.status.toLowerCase();
  const errCode = dlr["err-code"] || "0";
  const now = new Date().toISOString();

  console.log(
    `[vonage-webhook] DLR: messageId=${dlr.messageId} status=${status} err=${errCode} to=${dlr.msisdn}`
  );

  try {
    // 1. Find matching notification_log entry by searching payload for vonage_message_id
    //    or by the sms_message_id column (we'll add this)
    //    Strategy: look in notification_log.payload->vonage_message_id first,
    //    then fall back to a broader search by phone + recent time window
    const { data: logEntry, error: lookupErr } = await sb
      .from("notification_log")
      .select("id, status, user_id, notification_type, channel, payload")
      .eq("sms_message_id", dlr.messageId)
      .limit(1)
      .single();

    if (lookupErr || !logEntry) {
      // Fallback: search in payload JSONB
      const { data: fallbackEntry } = await sb
        .from("notification_log")
        .select("id, status, user_id, notification_type, channel, payload")
        .eq("channel", "sms")
        .filter("payload->>vonage_message_id", "eq", dlr.messageId)
        .limit(1)
        .single();

      if (!fallbackEntry) {
        console.warn(`[vonage-webhook] No log entry for messageId=${dlr.messageId}`);
        return new Response("OK", { status: 200 });
      }

      // Process with fallback entry
      await processDeliveryReceipt(fallbackEntry, dlr, status, errCode, now);
      return new Response("OK", { status: 200 });
    }

    await processDeliveryReceipt(logEntry, dlr, status, errCode, now);
    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error("[vonage-webhook] Unhandled error:", e);
    return new Response("OK", { status: 200 }); // Always 200 to Vonage
  }
});

async function processDeliveryReceipt(
  logEntry: any,
  dlr: VonageDLR,
  status: string,
  errCode: string,
  now: string
) {
  const newStatus = mapVonageStatus(status);

  // Don't downgrade: delivered is terminal success
  if (logEntry.status === "delivered" && newStatus !== "delivered") {
    console.log(`[vonage-webhook] Skipping downgrade: ${logEntry.status} → ${newStatus}`);
    return;
  }

  // 2. Update notification_log with delivery status
  const update: Record<string, any> = {
    status: newStatus,
    sms_delivered_at: TERMINAL_SUCCESS.has(status) ? now : null,
    sms_failed_at: TERMINAL_FAILURE.has(status) ? now : null,
    sms_error_code: errCode !== "0" ? errCode : null,
    sms_carrier_code: dlr["network-code"] || null,
  };

  await sb.from("notification_log").update(update).eq("id", logEntry.id);

  console.log(
    `[vonage-webhook] Updated log ${logEntry.id}: ${logEntry.status} → ${newStatus}`
  );

  // 3. Handle failures
  if (TERMINAL_FAILURE.has(status)) {
    await handleSmsFailure(logEntry, dlr, status, errCode, now);
  }
}

async function handleSmsFailure(
  logEntry: any,
  dlr: VonageDLR,
  status: string,
  errCode: string,
  now: string
) {
  const userId = logEntry.user_id;

  // 3a. Increment user SMS failure counter
  const { data: userState } = await sb
    .from("user_notification_state")
    .select("sms_failure_count, sms_last_failure_at, sms_fallback_email_only")
    .eq("user_id", userId)
    .single();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let failureCount = 1;

  if (userState) {
    // Reset counter if last failure was >7 days ago
    if (userState.sms_last_failure_at && userState.sms_last_failure_at > sevenDaysAgo) {
      failureCount = (userState.sms_failure_count || 0) + 1;
    }
  }

  const shouldFallback = failureCount >= 3;

  await sb.from("user_notification_state").upsert({
    user_id: userId,
    sms_failure_count: failureCount,
    sms_last_failure_at: now,
    sms_fallback_email_only: shouldFallback || (userState?.sms_fallback_email_only ?? false),
    updated_at: now,
  }, { onConflict: "user_id" });

  if (shouldFallback) {
    console.log(
      `[vonage-webhook] Auto-fallback: user ${userId} switched to email-only after ${failureCount} SMS failures in 7 days`
    );
  }

  // 3b. Queue 1 retry for transient failures (5-min delay via held_notifications)
  if (RETRYABLE_FAILURES.has(status)) {
    // Only retry once — check if we already retried this notification type recently
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: existingRetry } = await sb
      .from("held_notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("notification_type", logEntry.notification_type)
      .eq("channel", "sms")
      .eq("status", "held")
      .gte("created_at", fiveMinAgo)
      .limit(1);

    if (!existingRetry || existingRetry.length === 0) {
      const deliverAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      try {
        await sb.from("held_notifications").insert({
          user_id: userId,
          notification_type: logEntry.notification_type,
          channel: "sms",
          deliver_at: deliverAt,
          payload: logEntry.payload || {},
          status: "held",
          retry_of: logEntry.id,
        });
        console.log(
          `[vonage-webhook] Queued SMS retry for user ${userId}, deliver at ${deliverAt}`
        );
      } catch (e) {
        console.warn("[vonage-webhook] Could not queue retry:", e);
      }
    }
  }

  // 3c. Check aggregate SMS failure rate for admin alert (>5%)
  await checkSmsFailureRate();
}

// Check overall SMS failure rate in last 24h; log alert if >5%
async function checkSmsFailureRate() {
  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count: totalSms } = await sb
      .from("notification_log")
      .select("id", { count: "exact", head: true })
      .eq("channel", "sms")
      .gte("created_at", dayAgo);

    const { count: failedSms } = await sb
      .from("notification_log")
      .select("id", { count: "exact", head: true })
      .eq("channel", "sms")
      .eq("status", "failed")
      .gte("created_at", dayAgo);

    if (!totalSms || totalSms < 20) return; // Not enough volume to be meaningful

    const failureRate = ((failedSms || 0) / totalSms) * 100;

    if (failureRate > 5) {
      console.error(
        `[vonage-webhook] ⚠ SMS FAILURE RATE ALERT: ${failureRate.toFixed(1)}% (${failedSms}/${totalSms}) in last 24h`
      );

      // Insert admin alert
      await sb.from("notification_log").insert({
        user_id: null,
        notification_type: "admin_sms_failure_alert",
        channel: "system",
        status: "sent",
        subject: `SMS failure rate ${failureRate.toFixed(1)}% exceeds 5% threshold`,
        payload: {
          failure_rate: failureRate,
          failed_count: failedSms,
          total_count: totalSms,
          window: "24h",
          alert_at: new Date().toISOString(),
        },
      });
    }
  } catch (e) {
    console.warn("[vonage-webhook] Failure rate check error:", e);
  }
}
