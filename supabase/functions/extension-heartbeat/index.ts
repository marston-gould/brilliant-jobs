// extension-heartbeat Edge Function — v6.08
// Handles two modes:
// 1. User heartbeat: POST from Chrome extension with user JWT (upsert heartbeat row)
// 2. Cron check: POST with action=cron_check from pg_cron (scan for silent/disconnected)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();

    // ── Mode 1: Cron check (service role) ──────────────────────
    if (body.action === "cron_check") {
      return await handleCronCheck();
    }

    // ── Mode 2: User heartbeat (user JWT) ──────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    const sbUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: authError } = await sbUser.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const extensionId = body.extension_id || null;
    const extensionVersion = body.extension_version || null;

    // Upsert heartbeat row
    const { error: upsertError } = await sb
      .from("extension_heartbeats")
      .upsert({
        user_id: user.id,
        extension_id: extensionId,
        extension_version: extensionVersion,
        last_heartbeat_at: new Date().toISOString(),
        status: "active",
        silent_since: null,
        // If was disconnected + notified, clear it so future disconnects can re-notify
        disconnect_notified_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (upsertError) {
      console.error("[heartbeat] Upsert error:", upsertError.message);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    console.log(`[heartbeat] Ping from user=${user.id.slice(0, 8)} ext=${extensionVersion}`);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[heartbeat] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});

// ═══════════════════════════════════════════════════════════
// CRON CHECK: Scan for silent/disconnected extensions
// ═══════════════════════════════════════════════════════════
async function handleCronCheck(): Promise<Response> {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Get configurable threshold (default 7 days)
  let thresholdDays = 7;
  const { data: config } = await sb
    .from("admin_notification_config")
    .select("payload")
    .eq("notification_type", "extension_disconnected")
    .eq("cohort_id", "all")
    .single();

  if (config?.payload?.heartbeat_threshold_days) {
    thresholdDays = config.payload.heartbeat_threshold_days;
  }

  const thresholdDate = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000).toISOString();

  // Step 1: Mark active users as silent if heartbeat exceeded threshold
  const { data: newlySilent, error: silentErr } = await sb
    .from("extension_heartbeats")
    .update({
      status: "silent",
      silent_since: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("status", "active")
    .lt("last_heartbeat_at", thresholdDate)
    .select("user_id");

  if (silentErr) {
    console.error("[heartbeat-cron] Silent update error:", silentErr.message);
  } else {
    console.log(`[heartbeat-cron] Marked ${newlySilent?.length || 0} users as silent`);
  }

  // Step 2: Find silent users past threshold who haven't been notified
  const { data: toNotify, error: notifyErr } = await sb
    .from("extension_heartbeats")
    .select("user_id, last_heartbeat_at, silent_since")
    .eq("status", "silent")
    .lt("silent_since", thresholdDate)
    .is("disconnect_notified_at", null);

  if (notifyErr) {
    console.error("[heartbeat-cron] Notify query error:", notifyErr.message);
    return new Response(JSON.stringify({ error: "Query error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let sentCount = 0;
  for (const row of toNotify || []) {
    const daysSilent = Math.floor(
      (Date.now() - new Date(row.last_heartbeat_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    try {
      // Get user profile for first_name
      const { data: profile } = await sb
        .from("profiles")
        .select("full_name, email")
        .eq("id", row.user_id)
        .single();

      const firstName = profile?.full_name?.split(" ")[0] || "there";

      // Call send-notification to dispatch the extension_disconnected email
      const notifPayload = {
        user_id: row.user_id,
        notification_type: "extension_disconnected",
        payload: {
          first_name: firstName,
          days_silent: daysSilent,
          last_sync_date: new Date(row.last_heartbeat_at).toLocaleDateString("en-US", {
            year: "numeric", month: "long", day: "numeric",
          }),
          reconnect_url: "https://brilliantjobs.app/dashboard?action=reconnect-extension",
          troubleshoot_url: "https://brilliantjobs.app/help/extension-troubleshooting",
        },
      };

      const sendRes = await fetch(
        `${SUPABASE_URL}/functions/v1/send-notification`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify(notifPayload),
        }
      );

      if (sendRes.ok) {
        // Mark as notified + disconnected
        await sb
          .from("extension_heartbeats")
          .update({
            disconnect_notified_at: new Date().toISOString(),
            status: "disconnected",
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", row.user_id);

        sentCount++;
        console.log(`[heartbeat-cron] Sent disconnect notification to user=${row.user_id.slice(0, 8)} (${daysSilent} days silent)`);
      }
    } catch (err) {
      console.error(`[heartbeat-cron] Error notifying user=${row.user_id.slice(0, 8)}:`, err);
    }
  }

  console.log(`[heartbeat-cron] Complete: ${sentCount} disconnect notifications sent`);

  return new Response(JSON.stringify({
    ok: true,
    newly_silent: newlySilent?.length || 0,
    notifications_sent: sentCount,
  }), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
