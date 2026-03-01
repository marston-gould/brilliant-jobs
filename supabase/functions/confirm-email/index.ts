// confirm-email Edge Function
// Validates double opt-in token from confirmation link,
// sets email_verified=true, redirects to dashboard.
// Session 2, Deliverable 2

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DASHBOARD_URL = "https://brilliantjobs.app/dashboard.html";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return redirectWithError("missing_token");
    }

    // 1. Look up token in user_notification_state
    const { data: state, error: lookupError } = await sb
      .from("user_notification_state")
      .select("user_id, email_verified, double_opt_in_expires_at")
      .eq("double_opt_in_token", token)
      .single();

    if (lookupError || !state) {
      console.error("[confirm-email] Token not found:", token.substring(0, 8) + "...");
      return redirectWithError("invalid_token");
    }

    // 2. Check if already verified
    if (state.email_verified) {
      console.log(`[confirm-email] Already verified: ${state.user_id}`);
      return redirect(`${DASHBOARD_URL}?email_confirmed=already`);
    }

    // 3. Validate expiry (24h window)
    if (state.double_opt_in_expires_at) {
      const expiresAt = new Date(state.double_opt_in_expires_at);
      if (new Date() > expiresAt) {
        console.warn(`[confirm-email] Token expired for user: ${state.user_id}`);
        return redirectWithError("token_expired");
      }
    }

    // 4. Set email_verified = true, clear token
    const { error: updateError } = await sb
      .from("user_notification_state")
      .update({
        email_verified: true,
        email_verified_at: new Date().toISOString(),
        double_opt_in_token: null,
        double_opt_in_expires_at: null,
      })
      .eq("user_id", state.user_id);

    if (updateError) {
      console.error("[confirm-email] Update failed:", updateError);
      return redirectWithError("update_failed");
    }

    console.log(`[confirm-email] Email verified for user: ${state.user_id}`);

    // 5. Redirect to dashboard with success flag
    return redirect(`${DASHBOARD_URL}?email_confirmed=true`);

  } catch (e) {
    console.error("[confirm-email] Unhandled error:", e);
    return redirectWithError("server_error");
  }
});

function redirect(url: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: url },
  });
}

function redirectWithError(reason: string): Response {
  return redirect(`${DASHBOARD_URL}?email_error=${reason}`);
}
