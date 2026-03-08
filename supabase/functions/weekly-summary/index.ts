// weekly-summary Edge Function — v6.10
// Triggered by pg_cron Monday at 8am (per user timezone).
// Session 10: Extended to aggregate data for dark theme Batch 6 templates.
// Compiles and sends:
//   1. Weekly summary (existing — now dark theme)
//   2. Market pulse (new jobs, trends, hiring surges)
//   3. Filter trends (per-filter performance)
//   4. Ghost report weekly (applications past expected response)
// Each template sent as a separate email via send-notification.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  weeklySummaryEmail,
  marketPulseEmail,
  filterTrendEmail,
  ghostReportWeeklyEmail,
} from "../_shared/email-templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const WALL_TIME_LIMIT_MS = 110_000; // 110s safety (Edge Function max ~120s)
const startTime = Date.now();

function wallTimeOk(): boolean {
  return Date.now() - startTime < WALL_TIME_LIMIT_MS;
}

async function sendNotification(payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn("[weekly-summary] send-notification call failed:", e);
  }
}

/** Check if user has a specific notification type enabled */
async function isNotifEnabled(userId: string, notifType: string): Promise<boolean> {
  const { data } = await sb
    .from("notification_channels")
    .select("email")
    .eq("user_id", userId)
    .eq("notification_type", notifType)
    .single();
  // Default to enabled if no preference set
  return !data || data.email !== false;
}

/** Get user's tier from profiles or subscriptions */
async function getUserTier(userId: string): Promise<string> {
  const { data } = await sb
    .from("profiles")
    .select("subscription_tier")
    .eq("id", userId)
    .single();
  return data?.subscription_tier || "free";
}

/** Get user's saved filters */
async function getUserFilters(userId: string): Promise<Array<{ name: string; config: Record<string, unknown> }>> {
  const { data } = await sb
    .from("saved_filters")
    .select("name, config")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return data || [];
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
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 3600000);
  const weekAgoIso = weekAgo.toISOString();
  const twoWeeksAgoIso = twoWeeksAgo.toISOString();
  const weekLabel = `${weekAgo.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const counts = {
    weeklySent: 0,
    marketPulseSent: 0,
    filterTrendSent: 0,
    ghostReportSent: 0,
    usersSkipped: 0,
    usersProcessed: 0,
  };

  try {
    // ================================================================
    // GLOBAL DATA (computed once, shared across users)
    // ================================================================

    // Total new jobs this week (platform-wide)
    const { count: totalNewJobs } = await sb
      .from("ats_jobs")
      .select("*", { count: "exact", head: true })
      .gte("first_seen_at", weekAgoIso)
      .eq("status", "open");

    // Total new jobs last week (for trend)
    const { count: lastWeekNewJobs } = await sb
      .from("ats_jobs")
      .select("*", { count: "exact", head: true })
      .gte("first_seen_at", twoWeeksAgoIso)
      .lt("first_seen_at", weekAgoIso)
      .eq("status", "open");

    // Total active boards
    const { count: totalBoards } = await sb
      .from("ats_companies")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    // Top hiring companies this week (top 5 by new job count)
    const { data: hiringRaw } = await sb
      .from("ats_jobs")
      .select("company_name")
      .gte("first_seen_at", weekAgoIso)
      .eq("status", "open");

    const companyCounts: Record<string, number> = {};
    for (const j of hiringRaw || []) {
      if (j.company_name) {
        companyCounts[j.company_name] = (companyCounts[j.company_name] || 0) + 1;
      }
    }
    const topHiringCompanies = Object.entries(companyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([company, count]) => ({ company, count }));

    // Remote vs on-site trend this week vs last
    const { count: remoteThisWeek } = await sb
      .from("ats_jobs")
      .select("*", { count: "exact", head: true })
      .gte("first_seen_at", weekAgoIso)
      .eq("status", "open")
      .eq("work_arrangement", "remote");

    const { count: remoteLastWeek } = await sb
      .from("ats_jobs")
      .select("*", { count: "exact", head: true })
      .gte("first_seen_at", twoWeeksAgoIso)
      .lt("first_seen_at", weekAgoIso)
      .eq("status", "open")
      .eq("work_arrangement", "remote");

    // C2: Fetch top 3 published stories from this week
    const { data: topStories } = await sb
      .from("content_stories")
      .select("id, headline, lede, category, published_slug, score, published_at")
      .eq("status", "published")
      .gte("published_at", weekAgoIso)
      .order("score", { ascending: false })
      .limit(3);

    const stories = (topStories || []).map((s: Record<string, unknown>) => ({
      headline: s.headline,
      lede: s.lede,
      category: s.category,
      slug: s.published_slug || `story-${s.id}`,
    }));

    // Community-wide ghost rate for benchmarking
    const { count: totalAppliedCommunity } = await sb
      .from("notification_actions")
      .select("*", { count: "exact", head: true })
      .eq("status", "accepted")
      .gte("responded_at", twoWeeksAgoIso);

    const { count: ghostedCommunity } = await sb
      .from("notification_actions")
      .select("*", { count: "exact", head: true })
      .eq("status", "accepted")
      .lt("responded_at", new Date(now.getTime() - 14 * 24 * 3600000).toISOString())
      .is("escalated_at", null);

    const marketGhostPct = (totalAppliedCommunity || 0) > 0
      ? Math.round(((ghostedCommunity || 0) / (totalAppliedCommunity || 1)) * 100)
      : 0;

    // ================================================================
    // PER-USER LOOP
    // ================================================================

    const { data: allPrefs } = await sb
      .from("notification_preferences")
      .select("user_id, email_enabled");

    if (!allPrefs || allPrefs.length === 0) {
      return new Response(
        JSON.stringify({ message: "No users", ...counts }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    for (const prefs of allPrefs) {
      if (!wallTimeOk()) {
        console.warn("[weekly-summary] Wall time limit approaching, stopping user loop.");
        break;
      }

      if (prefs.email_enabled === false) {
        counts.usersSkipped++;
        continue;
      }

      const userId = prefs.user_id;
      counts.usersProcessed++;

      // ============================================================
      // 1. WEEKLY SUMMARY (existing, refactored)
      // ============================================================
      if (await isNotifEnabled(userId, "weekly_summary")) {
        // Total accepted (applied via notification)
        const { count: notificationApplied } = await sb
          .from("notification_actions")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "accepted")
          .gte("responded_at", weekAgoIso);

        const { count: autoApplied } = await sb
          .from("notification_log")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("notification_type", "auto_apply_confirm")
          .gte("created_at", weekAgoIso);

        const { count: passed } = await sb
          .from("notification_actions")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "passed")
          .gte("responded_at", weekAgoIso);

        const { count: missed } = await sb
          .from("notification_actions")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "missed")
          .gte("created_at", weekAgoIso);

        const { count: responses } = await sb
          .from("notification_log")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("notification_type", "pipeline_response")
          .gte("created_at", weekAgoIso);

        const { count: interviews } = await sb
          .from("notification_log")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("notification_type", "pipeline_interview")
          .gte("created_at", weekAgoIso);

        const { count: offers } = await sb
          .from("notification_log")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("notification_type", "pipeline_offer")
          .gte("created_at", weekAgoIso);

        const { count: ghosted } = await sb
          .from("notification_actions")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "accepted")
          .lt("responded_at", new Date(now.getTime() - 14 * 24 * 3600000).toISOString());

        const totalApplied = (autoApplied || 0) + (notificationApplied || 0);

        // Skip if zero activity AND no new jobs AND no stories
        const hasActivity =
          totalApplied > 0 ||
          (passed || 0) > 0 ||
          (missed || 0) > 0 ||
          (responses || 0) > 0 ||
          (interviews || 0) > 0 ||
          (offers || 0) > 0;

        if (hasActivity || (totalNewJobs || 0) > 0 || stories.length > 0) {
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
            newJobs: totalNewJobs || 0,
            weekLabel,
            stories,
          });

          await sendNotification({
            user_id: userId,
            notification_type: "weekly_summary",
            subject: email.subject,
            html: email.html,
            force_channel: "email",
          });
          counts.weeklySent++;
        }
      }

      // ============================================================
      // 2. MARKET PULSE (dark theme — Batch 6)
      // ============================================================
      if (await isNotifEnabled(userId, "market_stats")) {
        const tier = await getUserTier(userId);

        const jobsDelta = (totalNewJobs || 0) - (lastWeekNewJobs || 0);
        const jobsDir = jobsDelta > 0 ? "up" : jobsDelta < 0 ? "down" : "flat";
        const remotePct = (totalNewJobs || 0) > 0
          ? Math.round(((remoteThisWeek || 0) / (totalNewJobs || 1)) * 100)
          : 0;
        const lastRemotePct = (lastWeekNewJobs || 0) > 0
          ? Math.round(((remoteLastWeek || 0) / (lastWeekNewJobs || 1)) * 100)
          : 0;
        const remoteDelta = remotePct - lastRemotePct;
        const remoteDir = remoteDelta > 0 ? "up" : remoteDelta < 0 ? "down" : "flat";

        const trendRows: Array<{ label: string; value: string; trend: "up" | "down" | "flat" }> = [
          {
            label: "New Listings",
            value: (totalNewJobs || 0).toLocaleString(),
            trend: jobsDir as "up" | "down" | "flat",
          },
          {
            label: "Remote %",
            value: `${remotePct}%`,
            trend: remoteDir as "up" | "down" | "flat",
          },
          {
            label: "Active Boards",
            value: (totalBoards || 0).toLocaleString(),
            trend: "flat",
          },
        ];

        const email = marketPulseEmail({
          weekLabel,
          totalNewJobs: totalNewJobs || 0,
          totalBoards: totalBoards || 0,
          trendRows,
          topHiringCompanies,
          isFreeTier: tier === "free",
        });

        await sendNotification({
          user_id: userId,
          notification_type: "market_stats",
          subject: email.subject,
          html: email.html,
          force_channel: "email",
        });
        counts.marketPulseSent++;
      }

      // ============================================================
      // 3. FILTER TRENDS (dark theme — Batch 6)
      // ============================================================
      if (await isNotifEnabled(userId, "filter_trend")) {
        const filters = await getUserFilters(userId);

        if (filters.length > 0) {
          const filterRows: Array<{
            name: string;
            newJobs: number;
            jobsDelta: string;
            jobsDir: "up" | "down" | "flat";
            medianSalary: string;
            salaryDelta: string;
            salaryDir: "up" | "down" | "flat";
          }> = [];

          for (const filter of filters.slice(0, 10)) {
            // Count jobs matching this filter this week
            // Build query from filter config
            let thisWeekQuery = sb
              .from("ats_jobs")
              .select("salary_min, salary_max", { count: "exact" })
              .gte("first_seen_at", weekAgoIso)
              .eq("status", "open");

            let lastWeekQuery = sb
              .from("ats_jobs")
              .select("salary_min", { count: "exact", head: true })
              .gte("first_seen_at", twoWeeksAgoIso)
              .lt("first_seen_at", weekAgoIso)
              .eq("status", "open");

            // Apply filter config fields
            const cfg = filter.config || {};
            if (cfg.keyword) {
              thisWeekQuery = thisWeekQuery.ilike("title", `%${cfg.keyword}%`);
              lastWeekQuery = lastWeekQuery.ilike("title", `%${cfg.keyword}%`);
            }
            if (cfg.location) {
              thisWeekQuery = thisWeekQuery.ilike("location", `%${cfg.location}%`);
              lastWeekQuery = lastWeekQuery.ilike("location", `%${cfg.location}%`);
            }
            if (cfg.work_arrangement) {
              thisWeekQuery = thisWeekQuery.eq("work_arrangement", cfg.work_arrangement);
              lastWeekQuery = lastWeekQuery.eq("work_arrangement", cfg.work_arrangement);
            }
            if (cfg.level) {
              thisWeekQuery = thisWeekQuery.eq("level", cfg.level);
              lastWeekQuery = lastWeekQuery.eq("level", cfg.level);
            }

            const { data: thisWeekJobs, count: thisWeekCount } = await thisWeekQuery.limit(500);
            const { count: lastWeekCount } = await lastWeekQuery;

            const delta = (thisWeekCount || 0) - (lastWeekCount || 0);
            const dir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

            // Compute median salary from this week's jobs
            const salaries = (thisWeekJobs || [])
              .filter((j: Record<string, unknown>) => j.salary_min && j.salary_min > 0)
              .map((j: Record<string, unknown>) => j.salary_max ? (j.salary_min + j.salary_max) / 2 : j.salary_min)
              .sort((a: number, b: number) => a - b);

            const median = salaries.length > 0
              ? salaries[Math.floor(salaries.length / 2)]
              : 0;

            filterRows.push({
              name: filter.name,
              newJobs: thisWeekCount || 0,
              jobsDelta: delta > 0 ? `+${delta}` : String(delta),
              jobsDir: dir as "up" | "down" | "flat",
              medianSalary: median > 0 ? `$${Math.round(median / 1000)}k` : "N/A",
              salaryDelta: "—",
              salaryDir: "flat",
            });
          }

          if (filterRows.length > 0 && filterRows.some((f) => f.newJobs > 0)) {
            const bestFilter = filterRows.reduce((best, f) =>
              f.newJobs > (best?.newJobs || 0) ? f : best
            , filterRows[0]);

            const email = filterTrendEmail({
              weekLabel,
              filters: filterRows,
              bestFilter: bestFilter?.name,
            });

            await sendNotification({
              user_id: userId,
              notification_type: "filter_trend",
              subject: email.subject,
              html: email.html,
              force_channel: "email",
            });
            counts.filterTrendSent++;
          }
        }
      }

      // ============================================================
      // 4. GHOST REPORT WEEKLY (dark theme — Batch 6)
      // ============================================================
      if (await isNotifEnabled(userId, "ghost_report")) {
        // Get user's ghosted applications (applied 14+ days ago, no advancement)
        const { data: ghostEntries } = await sb
          .rpc("get_pipeline_ghost_status", { p_user_id: userId });

        const ghostedApps = (ghostEntries || [])
          .filter((e: Record<string, unknown>) => e.ghost_status === "ghosted" || e.ghost_status === "likely_ghosted")
          .map((e: Record<string, unknown>) => ({
            company: e.company_name || e.company_slug || "Unknown",
            role: e.job_title || "Unknown Role",
            appliedDate: e.applied_at
              ? new Date(e.applied_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : "Unknown",
            daysWaiting: e.days_since_applied || 0,
            expectedDays: e.avg_response_days || 8,
          }))
          .sort((a: Record<string, unknown>, b: Record<string, unknown>) => b.daysWaiting - a.daysWaiting)
          .slice(0, 10); // Top 10 worst

        // Count resolved this week (ghosted apps that got a response)
        const { count: resolvedCount } = await sb
          .from("notification_log")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("notification_type", "pipeline_response")
          .gte("created_at", weekAgoIso);

        if (ghostedApps.length > 0) {
          const userTotalApplied = (await sb
            .from("notification_actions")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("status", "accepted")).count || 0;

          const ghostPct = userTotalApplied > 0
            ? Math.round((ghostedApps.length / userTotalApplied) * 100)
            : 0;

          const email = ghostReportWeeklyEmail({
            weekLabel,
            ghostCount: ghostedApps.length,
            worstDays: ghostedApps[0]?.daysWaiting || 0,
            resolvedCount: resolvedCount || 0,
            ghostedApps,
            ghostPct,
            marketGhostPct,
            contextSentence: ghostPct > marketGhostPct
              ? `Your ghost rate is above the platform average of ${marketGhostPct}%.`
              : ghostPct < marketGhostPct
              ? `You're below the platform average ghost rate of ${marketGhostPct}% — good!`
              : undefined,
          });

          await sendNotification({
            user_id: userId,
            notification_type: "ghost_report",
            subject: email.subject,
            html: email.html,
            force_channel: "email",
          });
          counts.ghostReportSent++;
        }
      }

      console.log(
        `[weekly-summary] User ${userId}: weekly=${counts.weeklySent > 0 ? "sent" : "skip"} market=${counts.marketPulseSent > 0 ? "sent" : "skip"} filters=${counts.filterTrendSent > 0 ? "sent" : "skip"} ghost=${counts.ghostReportSent > 0 ? "sent" : "skip"}`
      );
    }

    console.log("[weekly-summary] Complete:", counts);

    return new Response(JSON.stringify({ ...counts, weekLabel, storiesIncluded: stories.length }), {
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
