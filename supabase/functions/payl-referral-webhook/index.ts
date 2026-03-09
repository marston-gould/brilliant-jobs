/**
 * FB-PAYL-S1: PAYL Referral Webhook Edge Function
 *
 * Actions:
 *   POST { action: "signup", enrollment_referral_code, referred_user_id, ip, device_hash }
 *     → Record referral signup
 *   POST { action: "subscribed", referred_user_id }
 *     → Mark referral as subscribed (Stripe invoice.paid)
 *   POST { action: "qualify_check", referred_user_id }
 *     → Check if 30-day hold passed, promote to qualified
 *   POST { action: "revoke", referred_user_id, reason }
 *     → Revoke referral (cancellation/chargeback)
 *   POST { action: "status", enrollment_id }
 *     → Get referral progress for enrollment
 *   POST { action: "anti_gaming_check", enrollment_id, referred_user_id, ip, device_hash, payment_method_hash }
 *     → Check for self-referral / gaming signals
 *   POST { action: "setup_intent", pdf_path }
 *     → Create Stripe SetupIntent for card authorization (no charge)
 *
 * Auth: Service role (webhook) or authenticated user (status).
 *
 * Phase: FB-PAYL-S1 — Pay After You Land Foundation
 * Pair: Lead Platform Eng + System Architect—Scalability
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const STRIPE_PUBLISHABLE_KEY = Deno.env.get("STRIPE_PUBLISHABLE_KEY") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://brilliantjobs.app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, apikey, x-correlation-id",
};

interface AntiGamingResult {
  pass: boolean;
  signals: string[];
}

// ── Stripe API helper ───────────────────────────────────────────────────────
async function stripeRequest(method: string, endpoint: string, params?: Record<string, string>) {
  const url = `https://api.stripe.com/v1${endpoint}`;
  const opts: RequestInit = {
    method,
    headers: {
      "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };
  if (params && (method === "POST" || method === "PUT")) {
    opts.body = new URLSearchParams(params).toString();
  }
  const res = await fetch(url, opts);
  return res.json();
}

async function checkAntiGaming(
  sb: ReturnType<typeof createClient>,
  enrollmentId: string,
  referredUserId: string,
  ip: string | null,
  deviceHash: string | null,
  paymentMethodHash: string | null
): Promise<AntiGamingResult> {
  const signals: string[] = [];

  // Get the enrollment owner
  const { data: enrollment } = await sb
    .from("payl_enrollments")
    .select("user_id")
    .eq("id", enrollmentId)
    .single();

  if (!enrollment) return { pass: false, signals: ["enrollment_not_found"] };

  // Self-referral check
  if (enrollment.user_id === referredUserId) {
    signals.push("self_referral");
  }

  // Get existing referrals for this enrollment to check patterns
  const { data: existingRefs } = await sb
    .from("payl_referrals")
    .select("signup_ip, signup_device_hash, payment_method_hash")
    .eq("payl_enrollment_id", enrollmentId);

  if (existingRefs && ip) {
    // Same IP as enrollment owner or other referrals
    const ipMatches = existingRefs.filter((r: Record<string, unknown>) => r.signup_ip === ip).length;
    if (ipMatches >= 2) signals.push("repeated_ip");
  }

  if (existingRefs && deviceHash) {
    // Same device fingerprint
    const deviceMatches = existingRefs.filter((r: Record<string, unknown>) => r.signup_device_hash === deviceHash).length;
    if (deviceMatches >= 1) signals.push("same_device");
  }

  if (existingRefs && paymentMethodHash) {
    // Same payment method
    const pmMatches = existingRefs.filter((r: Record<string, unknown>) => r.payment_method_hash === paymentMethodHash).length;
    if (pmMatches >= 1) signals.push("same_payment_method");
  }

  // Check if referred user already has a PAYL enrollment themselves (circular)
  const { data: refUserEnrollment } = await sb
    .from("payl_enrollments")
    .select("id")
    .eq("user_id", referredUserId)
    .maybeSingle();

  if (refUserEnrollment) {
    signals.push("referred_user_is_payl");
  }

  return {
    pass: signals.length === 0,
    signals,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const { action } = body;

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Action: signup ────────────────────────────────────────────────
    if (action === "signup") {
      const { enrollment_referral_code, referred_user_id, ip, device_hash } = body;

      if (!enrollment_referral_code || !referred_user_id) {
        return new Response(
          JSON.stringify({ error: "enrollment_referral_code and referred_user_id required" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Find enrollment by referral code
      const { data: enrollment, error: lookupError } = await sb
        .from("payl_enrollments")
        .select("id, user_id")
        .eq("referral_code", enrollment_referral_code)
        .single();

      if (lookupError || !enrollment) {
        return new Response(
          JSON.stringify({ error: "Invalid referral code" }),
          { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Anti-gaming check
      const gaming = await checkAntiGaming(sb, enrollment.id, referred_user_id, ip, device_hash, null);
      if (!gaming.pass) {
        return new Response(
          JSON.stringify({
            error: "Referral flagged for review",
            fraud_signals: gaming.signals,
          }),
          { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Check for duplicate referral
      const { data: existing } = await sb
        .from("payl_referrals")
        .select("id")
        .eq("payl_enrollment_id", enrollment.id)
        .eq("referred_user_id", referred_user_id)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ error: "Referral already recorded", referral_id: existing.id }),
          { status: 409, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Insert referral
      const { data: newRef, error: insertError } = await sb
        .from("payl_referrals")
        .insert({
          payl_enrollment_id: enrollment.id,
          referred_user_id,
          status: "signed_up",
          signup_ip: ip || null,
          signup_device_hash: device_hash || null,
        })
        .select()
        .single();

      if (insertError) {
        return new Response(
          JSON.stringify({ error: insertError.message }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Event bus (H-02)
      try {
        await sb.rpc("fn_publish_event", {
          p_event_type: "payl.referral_signup",
          p_payload: { enrollment_id: enrollment.id, referral_id: newRef.id },
        });
      } catch (_e) {
        console.warn("[payl-referral-webhook] Event bus publish failed:", _e);
      }

      return new Response(
        JSON.stringify({ success: true, referral_id: newRef.id, status: "signed_up" }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // ── Action: subscribed ────────────────────────────────────────────
    if (action === "subscribed") {
      const { referred_user_id, payment_method_hash } = body;

      const { data: ref, error } = await sb
        .from("payl_referrals")
        .select("id, payl_enrollment_id, status")
        .eq("referred_user_id", referred_user_id)
        .eq("status", "signed_up")
        .maybeSingle();

      if (!ref) {
        return new Response(
          JSON.stringify({ error: "No pending referral found for this user" }),
          { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Check payment method for gaming
      if (payment_method_hash) {
        const gaming = await checkAntiGaming(sb, ref.payl_enrollment_id, referred_user_id, null, null, payment_method_hash);
        if (gaming.signals.includes("same_payment_method")) {
          return new Response(
            JSON.stringify({ error: "Payment method flagged", fraud_signals: gaming.signals }),
            { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
          );
        }
      }

      await sb
        .from("payl_referrals")
        .update({
          status: "subscribed",
          subscribed_at: new Date().toISOString(),
          payment_method_hash: payment_method_hash || null,
        })
        .eq("id", ref.id);

      return new Response(
        JSON.stringify({ success: true, referral_id: ref.id, status: "subscribed", qualify_after_days: 30 }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // ── Action: qualify_check ─────────────────────────────────────────
    if (action === "qualify_check") {
      const { referred_user_id } = body;

      // Find subscribed referrals where 30 days have passed
      const { data: refs } = await sb
        .from("payl_referrals")
        .select("id, subscribed_at")
        .eq("referred_user_id", referred_user_id)
        .eq("status", "subscribed");

      if (!refs || refs.length === 0) {
        return new Response(
          JSON.stringify({ qualified: false, reason: "No subscribed referrals found" }),
          { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      const results = [];
      for (const ref of refs) {
        const subscribedAt = new Date(ref.subscribed_at);
        const daysSince = (Date.now() - subscribedAt.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSince >= 30) {
          const { data: qualifyResult } = await sb.rpc("fn_payl_qualify_referral", {
            p_referral_id: ref.id,
          });
          results.push({ referral_id: ref.id, qualified: true, result: qualifyResult });

          // Event bus
          try {
            await sb.rpc("fn_publish_event", {
              p_event_type: "payl.referral_qualified",
              p_payload: { referral_id: ref.id },
            });
          } catch (_e) {
            console.warn("[payl-referral-webhook] Event bus publish failed:", _e);
          }
        } else {
          results.push({
            referral_id: ref.id,
            qualified: false,
            days_remaining: Math.ceil(30 - daysSince),
          });
        }
      }

      return new Response(
        JSON.stringify({ results }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // ── Action: revoke ────────────────────────────────────────────────
    if (action === "revoke") {
      const { referred_user_id, reason } = body;

      const { data: refs } = await sb
        .from("payl_referrals")
        .select("id")
        .eq("referred_user_id", referred_user_id)
        .in("status", ["signed_up", "subscribed", "qualified"]);

      if (!refs || refs.length === 0) {
        return new Response(
          JSON.stringify({ error: "No active referrals found" }),
          { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      const results = [];
      for (const ref of refs) {
        const { data: revokeResult } = await sb.rpc("fn_payl_revoke_referral", {
          p_referral_id: ref.id,
          p_reason: reason || "subscription_cancelled",
        });
        results.push({ referral_id: ref.id, result: revokeResult });
      }

      return new Response(
        JSON.stringify({ revoked: results.length, results }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // ── Action: status ────────────────────────────────────────────────
    if (action === "status") {
      const { enrollment_id } = body;

      const { data, error } = await sb
        .from("v_payl_dashboard")
        .select("*")
        .eq("enrollment_id", enrollment_id)
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify(data), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── Action: setup_intent ────────────────────────────────────────
    // Creates a Stripe SetupIntent for card authorization (no charge)
    if (action === "setup_intent") {
      const { pdf_path } = body;

      // Get auth user from JWT
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await sb.auth.getUser(token);

      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Verify user has a PAYL enrollment
      const { data: enrollment, error: enrollError } = await sb
        .from("payl_enrollments")
        .select("id, status, stripe_setup_intent_id")
        .eq("user_id", user.id)
        .in("status", ["pending_pdf", "pending_referrals"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (enrollError || !enrollment) {
        return new Response(
          JSON.stringify({ error: "No active PAYL enrollment found" }),
          { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // If already has a SetupIntent, return that
      if (enrollment.stripe_setup_intent_id) {
        const existing = await stripeRequest("GET", `/setup_intents/${enrollment.stripe_setup_intent_id}`);
        if (existing && existing.status !== "canceled") {
          return new Response(
            JSON.stringify({
              client_secret: existing.client_secret,
              publishable_key: STRIPE_PUBLISHABLE_KEY || "pk_live_51T3TKnPKzCZbw3KzvE3xlxz8Yt9Hx9PTIRewh21Pks8YQt6TgV5urss7w93Hd27vfnZQlMiAvMP9WAgRSHM3dFFz00ufrYmhyI",
              setup_intent_id: existing.id,
            }),
            { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
          );
        }
      }

      // Create new SetupIntent
      const si = await stripeRequest("POST", "/setup_intents", {
        "payment_method_types[]": "card",
        "metadata[user_id]": user.id,
        "metadata[enrollment_id]": enrollment.id,
        "metadata[tier]": "payl",
        "metadata[pdf_path]": pdf_path || "",
        "usage": "off_session",
      });

      if (si.error) {
        return new Response(
          JSON.stringify({ error: si.error.message || "Stripe error" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Store setup_intent_id on enrollment
      await sb
        .from("payl_enrollments")
        .update({ stripe_setup_intent_id: si.id })
        .eq("id", enrollment.id);

      return new Response(
        JSON.stringify({
          client_secret: si.client_secret,
          publishable_key: STRIPE_PUBLISHABLE_KEY || "pk_live_51T3TKnPKzCZbw3KzvE3xlxz8Yt9Hx9PTIRewh21Pks8YQt6TgV5urss7w93Hd27vfnZQlMiAvMP9WAgRSHM3dFFz00ufrYmhyI",
          setup_intent_id: si.id,
        }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // ── Action: anti_gaming_check ─────────────────────────────────────
    if (action === "anti_gaming_check") {
      const { enrollment_id, referred_user_id, ip, device_hash, payment_method_hash } = body;
      const result = await checkAntiGaming(sb, enrollment_id, referred_user_id, ip, device_hash, payment_method_hash);
      return new Response(JSON.stringify(result), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[payl-referral-webhook] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
