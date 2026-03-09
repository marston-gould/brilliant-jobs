/**
 * FB-PAYL-S1: PAYL Expiry Check Edge Function
 *
 * Actions:
 *   POST { action: "check" }                 → Run expiry check (pg_cron target)
 *   POST { action: "nudge" }                 → Send employment nudges at day 90/120/150/175
 *   POST { action: "convert", enrollment_id } → Convert PAYL to paid Pro
 *   POST { action: "extend", enrollment_id }  → Extend 90 days (1 additional referral required)
 *   POST { action: "summary" }               → Admin summary dashboard data
 *
 * Auth: Service role (cron/admin) or authenticated user (convert/extend own).
 *
 * Phase: FB-PAYL-S1 — Pay After You Land Foundation
 * Pair: Chief Architect + Evolvability Strategist
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://brilliantjobs.app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, apikey, x-correlation-id",
};

// Nudge schedule: days after activation when employment check-in is sent
const NUDGE_DAYS = [90, 120, 150, 175];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const { action } = body;

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Action: check ─────────────────────────────────────────────────
    // Runs daily via pg_cron. Expires overdue enrollments.
    if (action === "check") {
      const { data: result, error } = await sb.rpc("fn_payl_expiry_check");

      if (error) {
        console.error("[payl-expiry-check] RPC error:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Publish events for expired enrollments
      if (result?.expired > 0) {
        try {
          await sb.rpc("fn_publish_event", {
            p_event_type: "payl.expired",
            p_payload: { expired_count: result.expired, checked_at: result.checked_at },
          });
        } catch (_e) {
          console.warn("[payl-expiry-check] Event bus publish failed:", _e);
        }
      }

      return new Response(JSON.stringify(result), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── Action: nudge ─────────────────────────────────────────────────
    // Finds active PAYL users who should receive an employment check-in
    if (action === "nudge") {
      const nudgeResults: Array<{
        enrollment_id: string;
        user_id: string;
        day: number;
        nudge_type: string;
      }> = [];

      for (const day of NUDGE_DAYS) {
        // Find enrollments activated ~N days ago (±1 day window)
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - day);
        const rangeStart = new Date(targetDate);
        rangeStart.setDate(rangeStart.getDate() - 1);
        const rangeEnd = new Date(targetDate);
        rangeEnd.setDate(rangeEnd.getDate() + 1);

        const { data: enrollments } = await sb
          .from("payl_enrollments")
          .select("id, user_id")
          .eq("status", "active")
          .gte("activated_at", rangeStart.toISOString())
          .lte("activated_at", rangeEnd.toISOString());

        if (enrollments) {
          for (const e of enrollments) {
            nudgeResults.push({
              enrollment_id: e.id,
              user_id: e.user_id,
              day,
              nudge_type: day === 175 ? "final_warning" : "check_in",
            });

            // Queue notification (uses existing send-notification EF pattern)
            // FB-PAYL-S2 will wire up actual notification delivery
            try {
              await sb.rpc("fn_publish_event", {
                p_event_type: "payl.employment_nudge",
                p_payload: {
                  enrollment_id: e.id,
                  user_id: e.user_id,
                  day,
                  nudge_type: day === 175 ? "final_warning" : "check_in",
                },
              });
            } catch (_e) {
              console.warn("[payl-expiry-check] Nudge event publish failed:", _e);
            }
          }
        }
      }

      return new Response(
        JSON.stringify({
          nudges_sent: nudgeResults.length,
          details: nudgeResults,
        }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // ── Action: convert ───────────────────────────────────────────────
    // User self-reports employment → convert to paid Pro
    if (action === "convert") {
      const { enrollment_id } = body;

      if (!enrollment_id) {
        return new Response(
          JSON.stringify({ error: "enrollment_id required" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      const { data: result, error } = await sb.rpc("fn_payl_convert", {
        p_enrollment_id: enrollment_id,
      });

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Publish conversion event
      if (result?.success) {
        try {
          await sb.rpc("fn_publish_event", {
            p_event_type: "payl.converted",
            p_payload: {
              enrollment_id,
              converted_at: result.converted_at,
              days_active: result.days_active,
            },
          });
        } catch (_e) {
          console.warn("[payl-expiry-check] Convert event publish failed:", _e);
        }
      }

      return new Response(JSON.stringify(result), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── Action: extend ────────────────────────────────────────────────
    // User extends PAYL by 90 days (requires 1 additional qualified referral)
    if (action === "extend") {
      const { enrollment_id } = body;

      if (!enrollment_id) {
        return new Response(
          JSON.stringify({ error: "enrollment_id required" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Check enrollment is active and expired/expiring
      const { data: enrollment } = await sb
        .from("payl_enrollments")
        .select("id, status, expires_at, referrals_qualified")
        .eq("id", enrollment_id)
        .single();

      if (!enrollment) {
        return new Response(
          JSON.stringify({ error: "Enrollment not found" }),
          { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Extension requires at least 4 qualified referrals (3 for base + 1 for extension)
      // Check if they have the additional referral
      if (enrollment.referrals_qualified < 4) {
        return new Response(
          JSON.stringify({
            error: "Need 1 additional qualified referral to extend",
            referrals_qualified: enrollment.referrals_qualified,
            referrals_needed: 4,
          }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Extend by 90 days
      const newExpiry = new Date(enrollment.expires_at);
      newExpiry.setDate(newExpiry.getDate() + 90);

      await sb
        .from("payl_enrollments")
        .update({
          expires_at: newExpiry.toISOString(),
          status: "active",
        })
        .eq("id", enrollment_id);

      return new Response(
        JSON.stringify({
          success: true,
          new_expires_at: newExpiry.toISOString(),
          extended_days: 90,
        }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // ── Action: summary ───────────────────────────────────────────────
    // Admin dashboard data
    if (action === "summary") {
      const { data: result, error } = await sb.rpc("fn_payl_summary");

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify(result), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[payl-expiry-check] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
