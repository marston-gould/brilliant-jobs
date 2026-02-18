// weekly-summary Edge Function
// Triggered by pg_cron Monday at 8am (per user timezone).
// Compiles: applications sent, auto-applies, notification applies, passes,
// misses, responses, interviews, offers, ghosted, new jobs, market stats.
// Sends via send-notification.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { weeklySummaryEmail } from "../_shared/email-templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600000);
  const weekLabel = `${weekAgo.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  let usersSent = 0;
  let usersSkipped = 0;

  try {
    // Get all users who have weekly_summary enabled (or default)
    const { data: allPrefs } = await sb
      .from("notification_preferences")
      .select("user_id, email_enabled");

    if (!allPrefs || allPrefs.length === 0) {
      return new Response(
        JSON.stringify({ message: "No users", sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    for (const prefs of allPrefs) {
      if (prefs.email_enabled === false) {
        usersSkipped++;
        continue;
      }

      const userId = prefs.user_id;

      // Check if user has weekly_summary enabled
      const { data: channelPref } = await sb
        .from("notification_channels")
        .select("email")
        .eq("user_id", userId)
        .eq("notification_type", "weekly_summary")
        .single();

      // Default to enabled if no preference set
      if (channelPref && channelPref.email === false) {
        usersSkipped++;
        continue;
      }

      const weekAgoIso = weekAgo.toISOString();

      // ---- Gather stats ----

      // Total accepted (applied via notification)
      const { count: notificationApplied } = await sb
        .from("notification_actions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "accepted")
        .gte("responded_at", weekAgoIso);

      // Auto-applied (auto_apply_confirm logs this week)
      const { count: autoApplied } = await sb
        .from("notification_log")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("notification_type", "auto_apply_confirm")
        .gte("created_at", weekAgoIso);

      // Passed
      const { count: passed } = await sb
        .from("notification_actions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "passed")
        .gte("responded_at", weekAgoIso);

      // Missed
      const { count: missed } = await sb
        .from("notification_actions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "missed")
        .gte("created_at", weekAgoIso);

      // Responses received (pipeline_response notifications)
      const { count: responses } = await sb
        .from("notification_log")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("notification_type", "pipeline_response")
        .gte("created_at", weekAgoIso);

      // Interviews
      const { count: interviews } = await sb
        .from("notification_log")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("notification_type", "pipeline_interview")
        .gte("created_at", weekAgoIso);

      // Offers
      const { count: offers } = await sb
        .from("notification_log")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("notification_type", "pipeline_offer")
        .gte("created_at", weekAgoIso);

      // Ghosted (applied 14+ days ago, no further status)
      const { count: ghosted } = await sb
        .from("notification_actions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "accepted")
        .lt("responded_at", new Date(now.getTime() - 14 * 24 * 3600000).toISOString());

      // New jobs this week
      const { count: newJobs } = await sb
        .from("ats_jobs")
        .select("*", { count: "exact", head: true })
        .gte("first_seen_at", weekAgoIso)
        .eq("status", "open");

      const totalApplied = (autoApplied || 0) + (notificationApplied || 0);

      // Skip if zero activity across the board
      if (
        totalApplied === 0 &&
        (passed || 0) === 0 &&
        (missed || 0) === 0 &&
        (responses || 0) === 0 &&
        (interviews || 0) === 0 &&
        (offers || 0) === 0
      ) {
        // Still send if there are new jobs to report
        if ((newJobs || 0) === 0) {
          usersSkipped++;
          continue;
        }
      }

      // ---- Build and send ----
      const email = weeklySummaryEmail({
        applied: totalApplied,
        autoApplied: autoApplied || 0,
        notificationApplied: notificationApplied || 0,
        passed: passed || 0,
        missed: missed || 0,
        responses: responses || 0,
        interviews: interviews || 0,
        offers: offers || 0,
        ghosted: ghosted || 0,
        newJobs: newJobs || 0,
        weekLabel,
      });

      await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          user_id: userId,
          notification_type: "weekly_summary",
          subject: email.subject,
          html: email.html,
          force_channel: "email",
        }),
      });

      usersSent++;
      console.log(
        `[weekly-summary] Sent to ${userId}: applied=${totalApplied} responses=${responses || 0} interviews=${interviews || 0} offers=${offers || 0} newJobs=${newJobs || 0}`
      );
    }

    const summary = { usersSent, usersSkipped, weekLabel };
    console.log("[weekly-summary] Complete:", summary);

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[weekly-summary] Error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
