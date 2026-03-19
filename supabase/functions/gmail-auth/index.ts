// gmail-auth Edge Function
// OAuth callback handler: exchanges auth code for tokens, stores encrypted refresh token
// Route: POST /api/auth/gmail/callback (via Vercel rewrite)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { withCorrelation } from "../_shared/middleware.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GMAIL_CLIENT_ID = Deno.env.get("GMAIL_CLIENT_ID") || "";
const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET") || "";
const GMAIL_REDIRECT_URI = Deno.env.get("GMAIL_REDIRECT_URI") || "https://brilliantjobs.app/api/auth/gmail/callback";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function encrypt(text: string): string {
  const key = SUPABASE_SERVICE_ROLE_KEY;
  let result = "";
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(result);
}

serve(withCorrelation("gmail-auth", async (req, logger) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const url = new URL(req.url);

  // === INITIATE FLOW (GET /gmail-auth?action=connect) ===
  if (url.searchParams.get("action") === "connect") {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }

    const csrf = crypto.randomUUID();
    const state = `${user.id}:${csrf}`;

    await sb.from("gmail_connections").upsert({
      user_id: user.id,
      gmail_address: "pending",
      refresh_token_enc: csrf,
      sync_status: "paused",
    }, { onConflict: "user_id" });

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GMAIL_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", GMAIL_REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/gmail.metadata https://www.googleapis.com/auth/calendar.events.readonly");
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);

    return new Response(JSON.stringify({ url: authUrl.toString() }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // === CALLBACK (GET with ?code=xxx&state=xxx) ===
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    logger.warn("Gmail OAuth denied", { error });
    return Response.redirect("https://brilliantjobs.app/app/get-started?gmail=denied", 302);
  }

  if (!code || !state) {
    return Response.redirect("https://brilliantjobs.app/app/get-started?gmail=error", 302);
  }

  const [userId, csrf] = state.split(":");
  if (!userId || !csrf) {
    return Response.redirect("https://brilliantjobs.app/app/get-started?gmail=error", 302);
  }

  const { data: pending } = await sb
    .from("gmail_connections")
    .select("refresh_token_enc")
    .eq("user_id", userId)
    .eq("sync_status", "paused")
    .single();

  if (!pending || pending.refresh_token_enc !== csrf) {
    logger.warn("CSRF mismatch");
    return Response.redirect("https://brilliantjobs.app/app/get-started?gmail=error", 302);
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: GMAIL_CLIENT_ID,
        client_secret: GMAIL_CLIENT_SECRET,
        redirect_uri: GMAIL_REDIRECT_URI,
      }),
    });

    const tokens = await tokenRes.json();
    if (tokens.error) {
      logger.error("Token exchange failed", { error: tokens.error });
      return Response.redirect("https://brilliantjobs.app/app/get-started?gmail=error", 302);
    }

    const profileRes = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();
    const gmailAddress = profile.emailAddress || "unknown";

    await sb.from("gmail_connections").upsert({
      user_id: userId,
      gmail_address: gmailAddress,
      refresh_token_enc: encrypt(tokens.refresh_token),
      token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
      sync_status: "active",
      error_message: null,
      last_sync_at: null,
    }, { onConflict: "user_id" });

    // v6.04: Mark Gmail connected in profiles for adoption suppression
    await sb.from("profiles").update({ gmail_connected_at: new Date().toISOString() }).eq("id", userId);

    logger.info("Gmail connected", { userId, gmailAddress });
    return Response.redirect("https://brilliantjobs.app/app/get-started?gmail=connected", 302);

  } catch (e) {
    logger.error("Gmail auth error", { error: (e as Error).message });
    return Response.redirect("https://brilliantjobs.app/app/get-started?gmail=error", 302);
  }
}));
