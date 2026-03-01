// resend-confirmation Edge Function
// Regenerates double opt-in token and sends new confirmation email.
// Called when user's original token has expired (24h window).
// Session 2 unblocked item: Token regeneration flow
//
// Security: requires valid auth JWT (user must be logged in).
// Rate limit: 3 resends per hour per user via notification_log count.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { fetchWithRetry, TIMEOUT_CONFIGS } from "../_shared/resilience.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "notifications@brilliantjobs.app";
const CONFIRM_BASE_URL = `${SUPABASE_URL}/functions/v1/confirm-email`;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Resend limits
const RESEND_LIMIT = 3;
const RESEND_WINDOW_HOURS = 1;

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
    // Extract user from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await sb.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check current notification state
    const { data: state } = await sb
      .from("user_notification_state")
      .select("email_verified, double_opt_in_token")
      .eq("user_id", user.id)
      .single();

    if (!state) {
      return new Response(JSON.stringify({ error: "Notification state not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Already verified — no need to resend
    if (state.email_verified) {
      return new Response(JSON.stringify({ ok: true, already_verified: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Rate limit: check resend count in last hour
    const windowStart = new Date(Date.now() - RESEND_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const { count } = await sb
      .from("notification_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("notification_type", "double_opt_in")
      .gte("created_at", windowStart);

    if ((count || 0) >= RESEND_LIMIT) {
      return new Response(
        JSON.stringify({ error: "Too many resend attempts. Please wait an hour." }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "3600" } }
      );
    }

    // Generate new token + 24h expiry
    const newToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: updateError } = await sb
      .from("user_notification_state")
      .update({
        double_opt_in_token: newToken,
        double_opt_in_expires_at: expiresAt,
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[resend-confirmation] Token update failed:", updateError);
      return new Response(JSON.stringify({ error: "Failed to generate token" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Send confirmation email
    const confirmUrl = `${CONFIRM_BASE_URL}?token=${newToken}`;
    const html = `
      <div style="font-family:Outfit,system-ui,sans-serif;background:#0b1121;color:#e2e8f0;padding:40px;max-width:560px;margin:0 auto;">
        <h2 style="color:#f8fafc;margin:0 0 16px;">Confirm your email</h2>
        <p style="color:#94a3b8;line-height:1.6;">Click the button below to verify your email address and activate your notification preferences.</p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${confirmUrl}" style="background:#3b82f6;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Confirm Email</a>
        </div>
        <p style="color:#64748b;font-size:12px;">This link expires in 24 hours. If you didn't request this, you can safely ignore it.</p>
      </div>
    `;

    const emailRes = await fetchWithRetry("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [user.email],
        subject: "Confirm your email — Brilliant Jobs",
        html,
      }),
    }, TIMEOUT_CONFIGS.resend);

    const emailOk = emailRes.ok;

    // Log the send attempt
    await sb.from("notification_log").insert({
      user_id: user.id,
      notification_type: "double_opt_in",
      channel: "email",
      status: emailOk ? "sent" : "failed",
      subject: "Confirm your email — Brilliant Jobs",
      classification: "required_transactional",
      send_decision: emailOk ? "sent" : "send_failed",
      payload: { resend: true, token_prefix: newToken.substring(0, 8) },
    });

    if (!emailOk) {
      const errText = await emailRes.text();
      console.error("[resend-confirmation] Email send failed:", errText);
      return new Response(JSON.stringify({ error: "Failed to send email" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[resend-confirmation] New token sent to ${user.id}`);
    return new Response(JSON.stringify({ ok: true, resent: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[resend-confirmation] Unhandled error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
