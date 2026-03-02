// push-subscribe Edge Function — v1 (Phase 69 Session 4: Web Push Notifications, Card 7)
// Manages push subscription lifecycle: subscribe, unsubscribe, get VAPID public key
// Stores subscriptions in push_subscriptions table for send-notification v7 to use.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // GET /push-subscribe — return VAPID public key (no auth required)
    if (req.method === "GET") {
      return new Response(
        JSON.stringify({ vapid_public_key: VAPID_PUBLIC_KEY }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // POST and DELETE require auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Get user from JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await sb.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();

    // POST /push-subscribe — subscribe
    if (req.method === "POST" && body.action !== "unsubscribe") {
      const { endpoint, keys } = body.subscription || body;

      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return new Response(
          JSON.stringify({ error: "Invalid subscription: endpoint, keys.p256dh, keys.auth required" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Upsert subscription (unique on user_id + endpoint)
      const { error: upsertError } = await sb
        .from("push_subscriptions")
        .upsert({
          user_id: user.id,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          user_agent: req.headers.get("User-Agent") || null,
          last_used_at: new Date().toISOString(),
        }, { onConflict: "user_id,endpoint" });

      if (upsertError) {
        console.error("[push-subscribe] Upsert error:", upsertError);
        return new Response(
          JSON.stringify({ error: "Failed to save subscription" }),
          { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Update user_notification_state to mark push as enabled
      await sb
        .from("user_notification_state")
        .upsert({
          user_id: user.id,
          push_enabled: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      console.log(`[push-subscribe] Subscribed: ${user.id} → ${endpoint.slice(0, 60)}...`);
      return new Response(
        JSON.stringify({ ok: true, message: "Push subscription saved" }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // POST with action=unsubscribe or DELETE
    if (req.method === "DELETE" || body.action === "unsubscribe") {
      const endpoint = body.endpoint;
      if (!endpoint) {
        // Delete all subscriptions for this user
        await sb.from("push_subscriptions").delete().eq("user_id", user.id);
      } else {
        await sb.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
      }

      // Check if user has any remaining subscriptions
      const { data: remaining } = await sb
        .from("push_subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (!remaining || remaining.length === 0) {
        await sb
          .from("user_notification_state")
          .update({ push_enabled: false, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
      }

      console.log(`[push-subscribe] Unsubscribed: ${user.id}`);
      return new Response(
        JSON.stringify({ ok: true, message: "Push subscription removed" }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("[push-subscribe] Error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(e) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
