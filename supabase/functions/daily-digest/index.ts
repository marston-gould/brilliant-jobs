// daily-digest Edge Function
// Triggered by pg_cron once daily (per user's preferred time, or default 8am).
// Batches: new job matches, stale application reminders, company hiring surges,
// ghost alerts, salary changes, closed jobs, excluded company matches.
// Sends a single combined digest email via send-notification.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { dailyDigestEmail } from "../_shared/email-templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Digest notification types and their channel keys
const DIGEST_TYPES = [
  "new_jobs_daily",
  "pipeline_stale",
  "company_hiring_surge",
  "ghost_alert",
  "salary_change",
  "closed_jobs_daily",
  "exclusion_override",
];

interface DigestSection {
  title: string;
  count: number;
  items: string[];
}

function formatJobItem(title: string, company: string, extra?: string): string {
  return `<div style="padding:6px 0;border-bottom:1px solid #2a2d35;font-size:13px;">
    <strong style="color:#f0f1f3;">${title}</strong>
    <span style="color:#64748b;"> at </span>
    <span style="color:#94a3b8;">${company}</span>
    ${extra ? `<span style="color:#64748b;font-size:11px;margin-left:8px;">${extra}</span>` : ""}
  </div>`;
}

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
  const todayStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  let usersSent = 0;
  let usersSkipped = 0;

  try {
    // Get all users with notification preferences who have email enabled
    const { data: allPrefs } = await sb
      .from("notification_preferences")
      .select("user_id, email_enabled, timezone");

    if (!allPrefs || allPrefs.length === 0) {
      return new Response(
        JSON.stringify({ message: "No users with notification preferences", sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    for (const prefs of allPrefs) {
      if (prefs.email_enabled === false) {
        usersSkipped++;
        continue;
      }

      const userId = prefs.user_id;

      // Check which digest types this user has enabled
      const { data: channels } = await sb
        .from("notification_channels")
        .select("notification_type, email, frequency")
        .eq("user_id", userId)
        .in("notification_type", DIGEST_TYPES);

      const enabledTypes = new Set<string>();
      (channels || []).forEach((ch) => {
        if (ch.email !== false && (ch.frequency === "daily" || ch.frequency === "realtime")) {
          enabledTypes.add(ch.notification_type);
        }
      });

      // If user has no digest types enabled, use defaults
      if (enabledTypes.size === 0 && (!channels || channels.length === 0)) {
        DIGEST_TYPES.forEach((t) => enabledTypes.add(t));
      }

      if (enabledTypes.size === 0) {
        usersSkipped++;
        continue;
      }

      // Get user's last_seen_at for "new since" calculations
      const { data: profile } = await sb
        .from("profiles")
        .select("last_seen_at")
        .eq("id", userId)
        .single();

      const yesterday = new Date(now.getTime() - 24 * 3600000).toISOString();
      const sinceDate = profile?.last_seen_at || yesterday;

      const sections: DigestSection[] = [];

      // ---- New job matches ----
      if (enabledTypes.has("new_jobs_daily")) {
        const { data: newJobs, count } = await sb
          .from("ats_jobs")
          .select("title, company_name, loc_city, loc_state", { count: "exact" })
          .gt("first_seen_at", yesterday)
          .eq("status", "open")
          .limit(10);

        if (count && count > 0) {
          sections.push({
            title: "New jobs posted today",
            count: count,
            items: (newJobs || []).map((j) =>
              formatJobItem(
                j.title,
                j.company_name || "Unknown",
                j.loc_city ? `${j.loc_city}${j.loc_state ? ", " + j.loc_state : ""}` : undefined
              )
            ),
          });
        }
      }

      // ---- Stale applications ----
      if (enabledTypes.has("pipeline_stale")) {
        // Check notification_actions for items that might indicate stale pipeline
        // This is a simplified check — full staleness logic lives client-side
        const { data: staleActions, count: staleCount } = await sb
          .from("notification_actions")
          .select("job_title, company_name, created_at", { count: "exact" })
          .eq("user_id", userId)
          .eq("status", "accepted")
          .lt("created_at", new Date(now.getTime() - 7 * 24 * 3600000).toISOString())
          .limit(5);

        if (staleCount && staleCount > 0) {
          sections.push({
            title: "Applications needing follow-up",
            count: staleCount,
            items: (staleActions || []).map((a) => {
              const days = Math.floor(
                (now.getTime() - new Date(a.created_at).getTime()) / 86400000
              );
              return formatJobItem(a.job_title, a.company_name || "Unknown", `${days}d ago`);
            }),
          });
        }
      }

      // ---- Ghost alerts ----
      if (enabledTypes.has("ghost_alert")) {
        const { data: ghosted, count: ghostCount } = await sb
          .from("notification_actions")
          .select("job_title, company_name, created_at", { count: "exact" })
          .eq("user_id", userId)
          .eq("status", "accepted")
          .lt("created_at", new Date(now.getTime() - 14 * 24 * 3600000).toISOString())
          .limit(5);

        if (ghostCount && ghostCount > 0) {
          sections.push({
            title: "Possible ghosting (14+ days, no response)",
            count: ghostCount,
            items: (ghosted || []).map((g) => {
              const days = Math.floor(
                (now.getTime() - new Date(g.created_at).getTime()) / 86400000
              );
              return formatJobItem(
                g.job_title,
                g.company_name || "Unknown",
                `<span style="color:#ef4444;">${days}d waiting</span>`
              );
            }),
          });
        }
      }

      // ---- Closed jobs in filters ----
      if (enabledTypes.has("closed_jobs_daily")) {
        const { data: closedJobs, count: closedCount } = await sb
          .from("ats_jobs")
          .select("title, company_name", { count: "exact" })
          .eq("status", "closed")
          .gt("updated_at", yesterday)
          .limit(5);

        if (closedCount && closedCount > 0) {
          sections.push({
            title: "Listings closed today",
            count: closedCount,
            items: (closedJobs || []).map((j) =>
              formatJobItem(j.title, j.company_name || "Unknown")
            ),
          });
        }
      }

      // Skip if nothing to report
      if (sections.length === 0) {
        usersSkipped++;
        continue;
      }

      // Build and send digest
      const email = dailyDigestEmail(sections, todayStr);

      await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          user_id: userId,
          notification_type: "new_jobs_daily",
          subject: email.subject,
          html: email.html,
          force_channel: "email",
        }),
      });

      usersSent++;
      console.log(
        `[daily-digest] Sent to ${userId}: ${sections.map((s) => `${s.title}(${s.count})`).join(", ")}`
      );
    }

    const summary = { usersSent, usersSkipped, date: todayStr };
    console.log("[daily-digest] Complete:", summary);

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[daily-digest] Error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
