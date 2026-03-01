// confirm-email Edge Function — v2 (Session 2+)
// Validates double opt-in token from confirmation link,
// sets email_verified=true, redirects to dashboard.
// v2 adds: IP-based rate limiting (5 attempts per 15 min per IP)
// Session 2, Deliverable 2 + Session 2 unblocked item (rate limiting)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DASHBOARD_URL = "https://brilliantjobs.app/dashboard.html";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ═══════════════════════════════════════════════════════════
// RATE LIMITING — in-memory sliding window (5 per 15 min per IP)
// Resets on function cold start, which is acceptable for
// brute-force prevention. Persistent rate limiting via DB
// would be overkill for this endpoint's traffic volume.
// ═══════════════════════════════════════════════════════════
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 5;
const rateLimitStore: Map<string, number[]> = new Map();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitStore.get(ip) || [];
  // Remove expired entries
  const valid = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  rateLimitStore.set(ip, valid);

  if (valid.length >= RATE_LIMIT_MAX) {
    return true;
  }
  valid.push(now);
  rateLimitStore.set(ip, valid);
  return false;
}

// Periodic cleanup to prevent memory leaks (every 10 min)
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of rateLimitStore.entries()) {
    const valid = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (valid.length === 0) {
      rateLimitStore.delete(ip);
    } else {
      rateLimitStore.set(ip, valid);
    }
  }
}, 10 * 60 * 1000);

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
    // Extract client IP for rate limiting
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    // Rate limit check
    if (isRateLimited(clientIp)) {
      console.warn(`[confirm-email] Rate limited: ${clientIp}`);
      return new Response(
        JSON.stringify({ error: "Too many attempts. Please try again in 15 minutes." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "900",
          },
        }
      );
    }

    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return redirectWithError("missing_token");
    }

    // Validate token format (UUID v4 expected)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(token)) {
      console.warn(`[confirm-email] Malformed token from ${clientIp}`);
      return redirectWithError("invalid_token");
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

    // 4. Set email_verified = true, clear token (single-use)
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
