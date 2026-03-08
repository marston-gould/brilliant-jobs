// resend-webhook Edge Function — v1 (Phase 69, Cards 1+2)
// Receives Resend delivery events (delivered, bounced, complained, opened, clicked).
// Updates notification_log status via message_id lookup.
// Hard bounces + complaints auto-suppress via notification_suppressions.
// Webhook signature verification via svix.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_WEBHOOK_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET") || "";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Status priority: don't downgrade status
// sent < delivered < opened < clicked (only upgrade)
const STATUS_PRIORITY: Record<string, number> = {
  sent: 0,
  delivered: 1,
  opened: 2,
  clicked: 3,
  bounced: -1,    // terminal
  complained: -1, // terminal
  failed: -1,     // terminal
};

function shouldUpdateStatus(current: string, incoming: string): boolean {
  const currentPri = STATUS_PRIORITY[current] ?? 0;
  const incomingPri = STATUS_PRIORITY[incoming] ?? 0;
  // Terminal states can always be set; otherwise only upgrade
  if (incomingPri < 0) return true; // bounce/complaint always writes
  if (currentPri < 0) return false; // don't overwrite terminal with non-terminal
  return incomingPri > currentPri;
}

// Map Resend event types to our status values
function mapEventToStatus(eventType: string): string | null {
  switch (eventType) {
    case "email.delivered": return "delivered";
    case "email.opened": return "opened";
    case "email.clicked": return "clicked";
    case "email.bounced": return "bounced";
    case "email.complained": return "complained";
    default: return null;
  }
}

// Verify Resend webhook signature (svix-based)
async function verifyWebhookSignature(
  payload: string,
  headers: Headers
): Promise<boolean> {
  if (!RESEND_WEBHOOK_SECRET) {
    console.warn("[resend-webhook] No webhook secret configured, skipping verification");
    return true; // Allow in dev/staging
  }

  try {
    const svixId = headers.get("svix-id");
    const svixTimestamp = headers.get("svix-timestamp");
    const svixSignature = headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.error("[resend-webhook] Missing svix headers");
      return false;
    }

    // Timestamp tolerance: reject if older than 5 minutes
    const ts = parseInt(svixTimestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > 300) {
      console.error("[resend-webhook] Timestamp too old:", ts, "now:", now);
      return false;
    }

    // Verify HMAC signature
    const secret = RESEND_WEBHOOK_SECRET.startsWith("whsec_")
      ? RESEND_WEBHOOK_SECRET.slice(6)
      : RESEND_WEBHOOK_SECRET;
    const secretBytes = Uint8Array.from(atob(secret), c => c.charCodeAt(0));

    const toSign = `${svixId}.${svixTimestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
      "raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
    const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));

    // Svix sends multiple signatures separated by space, check each
    const signatures = svixSignature.split(" ");
    for (const s of signatures) {
      const sigValue = s.startsWith("v1,") ? s.slice(3) : s;
      if (sigValue === computed) return true;
    }

    console.error("[resend-webhook] Signature mismatch");
    return false;
  } catch (e) {
    console.error("[resend-webhook] Signature verification error:", e);
    return false;
  }
}

// Handle a single Resend event
async function processEvent(event: Record<string, unknown>): Promise<{ processed: boolean; reason?: string }> {
  const eventType = event.type;
  const data = event.data;
  const messageId = data?.email_id;

  if (!messageId) {
    return { processed: false, reason: "no_email_id" };
  }

  const newStatus = mapEventToStatus(eventType);
  if (!newStatus) {
    return { processed: false, reason: `unknown_event_type: ${eventType}` };
  }

  // Look up the notification_log entry by message_id
  const { data: logEntry, error: lookupErr } = await sb
    .from("notification_log")
    .select("id, status, user_id")
    .eq("message_id", messageId)
    .limit(1)
    .single();

  if (lookupErr || !logEntry) {
    console.warn(`[resend-webhook] No log entry for message_id=${messageId}`);
    return { processed: false, reason: "no_matching_log_entry" };
  }

  // Check if we should update status
  if (!shouldUpdateStatus(logEntry.status, newStatus)) {
    return { processed: true, reason: `status_not_upgraded: ${logEntry.status} → ${newStatus}` };
  }

  // Build update payload
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status: newStatus };

  switch (eventType) {
    case "email.delivered":
      update.delivered_at = now;
      break;
    case "email.opened":
      update.opened_at = now;
      break;
    case "email.clicked":
      update.clicked_at = now;
      update.click_url = data?.click?.url || data?.url || null;
      break;
    case "email.bounced":
      update.bounced_at = now;
      update.bounce_type = data?.bounce?.type || "unknown";
      break;
    case "email.complained":
      update.complained_at = now;
      break;
  }

  // Update notification_log
  const { error: updateErr } = await sb
    .from("notification_log")
    .update(update)
    .eq("id", logEntry.id);

  if (updateErr) {
    console.error("[resend-webhook] Update error:", updateErr);
    return { processed: false, reason: `update_error: ${updateErr.message}` };
  }

  // Auto-suppress on hard bounce or complaint
  if (eventType === "email.bounced" || eventType === "email.complained") {
    await handleSuppression(data, eventType, messageId);
  }

  console.log(`[resend-webhook] ${eventType} → ${logEntry.id} (${logEntry.status} → ${newStatus})`);
  return { processed: true };
}

// Handle bounce/complaint → suppression list
async function handleSuppression(data: unknown, eventType: string, messageId: string) {
  // Get the recipient email from the event data
  const email = data?.to?.[0] || data?.email || data?.created_by;
  if (!email) {
    console.warn("[resend-webhook] No email in event data for suppression");
    return;
  }

  if (eventType === "email.complained") {
    // Complaint → permanent suppress
    await sb.from("notification_suppressions").upsert({
      email,
      reason: "Spam complaint via Resend webhook",
      type: "complaint",
      source_message_id: messageId,
      updated_at: new Date().toISOString(),
      expires_at: null, // permanent
    }, { onConflict: "email,type" });

    // Also disable marketing opt-in in user_notification_state
    const { data: logEntry } = await sb
      .from("notification_log")
      .select("user_id")
      .eq("message_id", messageId)
      .limit(1)
      .single();
    if (logEntry?.user_id) {
      await sb.from("user_notification_state")
        .update({ marketing_opt_in: false })
        .eq("user_id", logEntry.user_id);
    }

    console.log(`[resend-webhook] Complaint suppression: ${email}`);
    return;
  }

  // Bounce handling
  const bounceType = data?.bounce?.type || "unknown";
  const isHardBounce = bounceType === "hard" ||
    (data?.bounce?.status_code && parseInt(data.bounce.status_code) >= 550);

  if (isHardBounce) {
    // Hard bounce → permanent suppress
    await sb.from("notification_suppressions").upsert({
      email,
      reason: `Hard bounce (${bounceType}): ${data?.bounce?.message || ""}`.slice(0, 500),
      type: "hard_bounce",
      source_message_id: messageId,
      updated_at: new Date().toISOString(),
      expires_at: null, // permanent
    }, { onConflict: "email,type" });

    console.log(`[resend-webhook] Hard bounce suppression: ${email}`);
  } else {
    // Soft bounce → increment counter, suppress after 2 in 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Check existing soft bounce record
    const { data: existing } = await sb
      .from("notification_suppressions")
      .select("id, bounce_count, created_at")
      .eq("email", email)
      .eq("type", "soft_bounce")
      .limit(1)
      .single();

    if (existing && existing.created_at > sevenDaysAgo) {
      const newCount = (existing.bounce_count || 1) + 1;
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      await sb.from("notification_suppressions")
        .update({
          bounce_count: newCount,
          updated_at: new Date().toISOString(),
          reason: `Soft bounce x${newCount} in 7 days`,
          source_message_id: messageId,
          // Suppress after 2 soft bounces in 7 days
          ...(newCount >= 2 ? { expires_at: thirtyDaysFromNow } : {}),
        })
        .eq("id", existing.id);

      if (newCount >= 2) {
        console.log(`[resend-webhook] Soft bounce threshold reached, temp suppress: ${email}`);
      }
    } else {
      // First soft bounce (or old record expired) — create/reset
      await sb.from("notification_suppressions").upsert({
        email,
        reason: `Soft bounce: ${data?.bounce?.message || ""}`.slice(0, 500),
        type: "soft_bounce",
        bounce_count: 1,
        source_message_id: messageId,
        updated_at: new Date().toISOString(),
        expires_at: null, // not yet suppressed, just tracking
      }, { onConflict: "email,type" });
    }
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, svix-id, svix-timestamp, svix-signature",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const rawBody = await req.text();

    // Verify webhook signature
    const isValid = await verifyWebhookSignature(rawBody, req.headers);
    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = JSON.parse(rawBody);

    // Resend can send single events or batches
    const events = Array.isArray(body) ? body : [body];
    const results: unknown[] = [];

    for (const event of events) {
      const result = await processEvent(event);
      results.push({ type: event.type, ...result });
    }

    const processed = results.filter(r => r.processed).length;
    console.log(`[resend-webhook] Processed ${processed}/${results.length} events`);

    return new Response(JSON.stringify({ processed, total: results.length, results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[resend-webhook] Unhandled error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
