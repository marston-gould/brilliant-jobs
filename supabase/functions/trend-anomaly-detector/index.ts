// trend-anomaly-detector Edge Function — v6.10
// Triggered by pg_cron daily at 6am UTC.
// Session 10: Compares current week's job volume per saved filter
// against a 4-week rolling average. Fires trendAnomalyEmail if
// deviation exceeds 25%.
//
// Algorithm:
//   1. For each user with saved filters:
//   2. Count jobs matching each filter for current week
//   3. Count jobs matching each filter for each of the 4 prior weeks
//   4. Compute rolling average
//   5. If |current - avg| / avg > 0.25, fire anomaly notification
//   6. Dedup: max 1 anomaly per filter per week

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { trendAnomalyEmail } from "../_shared/email-templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const DEVIATION_THRESHOLD = 0.25; // 25%
const WALL_TIME_LIMIT_MS = 110_000;
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
    console.warn("[trend-anomaly] send-notification call failed:", e);
  }
}

/** Count jobs matching a filter config within a date range */
async function countFilterJobs(
  config: unknown,
  afterIso: string,
  beforeIso: string
): Promise<number> {
  let query = sb
    .from("ats_jobs")
    .select("*", { count: "exact", head: true })
    .gte("first_seen_at", afterIso)
    .lt("first_seen_at", beforeIso)
    .eq("status", "open");

  if (config.keyword) {
    query = query.ilike("title", `%${config.keyword}%`);
  }
  if (config.location) {
    query = query.ilike("location", `%${config.location}%`);
  }
  if (config.work_arrangement) {
    query = query.eq("work_arrangement", config.work_arrangement);
  }
  if (config.level) {
    query = query.eq("level", config.level);
  }
  if (config.company_name) {
    query = query.ilike("company_name", `%${config.company_name}%`);
  }

  const { count } = await query;
  return count || 0;
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
  // Current week: last 7 days
  const weekBoundaries: Array<{ start: Date; end: Date }> = [];
  for (let i = 0; i < 5; i++) {
    const end = new Date(now.getTime() - i * 7 * 24 * 3600000);
    const start = new Date(end.getTime() - 7 * 24 * 3600000);
    weekBoundaries.push({ start, end });
  }
  // weekBoundaries[0] = current week, [1..4] = prior 4 weeks

  let anomaliesSent = 0;
  let usersProcessed = 0;
  let filtersChecked = 0;

  try {
    // Get all users with email enabled
    const { data: allPrefs } = await sb
      .from("notification_preferences")
      .select("user_id, email_enabled");

    if (!allPrefs || allPrefs.length === 0) {
      return new Response(
        JSON.stringify({ message: "No users", anomaliesSent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    for (const prefs of allPrefs) {
      if (!wallTimeOk()) {
        console.warn("[trend-anomaly] Wall time limit approaching, stopping.");
        break;
      }

      if (prefs.email_enabled === false) continue;
      const userId = prefs.user_id;

      // Check if trend_anomaly notifications are enabled
      const { data: channelPref } = await sb
        .from("notification_channels")
        .select("email")
        .eq("user_id", userId)
        .eq("notification_type", "trend_anomaly")
        .single();

      if (channelPref && channelPref.email === false) continue;

      // Get user's saved filters
      const { data: filters } = await sb
        .from("saved_filters")
        .select("id, name, config")
        .eq("user_id", userId);

      if (!filters || filters.length === 0) continue;
      usersProcessed++;

      for (const filter of filters.slice(0, 10)) {
        if (!wallTimeOk()) break;
        filtersChecked++;

        const cfg = filter.config || {};

        // Count current week
        const currentCount = await countFilterJobs(
          cfg,
          weekBoundaries[0].start.toISOString(),
          weekBoundaries[0].end.toISOString()
        );

        // Count prior 4 weeks
        const priorCounts: number[] = [];
        for (let w = 1; w <= 4; w++) {
          if (!wallTimeOk()) break;
          const count = await countFilterJobs(
            cfg,
            weekBoundaries[w].start.toISOString(),
            weekBoundaries[w].end.toISOString()
          );
          priorCounts.push(count);
        }

        if (priorCounts.length < 4) continue;

        const rollingAvg = priorCounts.reduce((sum, c) => sum + c, 0) / priorCounts.length;

        // Skip if baseline is too low (avoid noise from low-volume filters)
        if (rollingAvg < 5) continue;

        const deviation = Math.abs(currentCount - rollingAvg) / rollingAvg;

        if (deviation > DEVIATION_THRESHOLD) {
          // Dedup: check if we already sent this anomaly this week
          const weekStartIso = weekBoundaries[0].start.toISOString();
          const { count: alreadySent } = await sb
            .from("notification_log")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("notification_type", "trend_anomaly")
            .gte("created_at", weekStartIso)
            .ilike("subject", `%${filter.name}%`);

          if ((alreadySent || 0) > 0) continue;

          const isSurge = currentCount > rollingAvg;
          const anomalyType = isSurge ? "Hiring Surge" : "Market Cooldown";
          const urgency: "high" | "medium" | "low" =
            deviation > 0.5 ? "high" : deviation > 0.35 ? "medium" : "low";

          const email = trendAnomalyEmail({
            filterName: filter.name,
            anomalyType,
            description: isSurge
              ? `Job postings matching "${filter.name}" jumped ${Math.round(deviation * 100)}% above the 4-week average. This could indicate increased hiring activity in this space.`
              : `Job postings matching "${filter.name}" dropped ${Math.round(deviation * 100)}% below the 4-week average. Companies may be pulling back on hiring for these roles.`,
            metricName: "New listings this week",
            currentValue: String(currentCount),
            avgValue: String(Math.round(rollingAvg)),
            deviationPct: Math.round(deviation * 100),
            urgency,
            filterId: filter.id,
          });

          await sendNotification({
            user_id: userId,
            notification_type: "trend_anomaly",
            subject: email.subject,
            html: email.html,
            force_channel: "email",
          });

          anomaliesSent++;
          console.log(
            `[trend-anomaly] ALERT: user=${userId} filter="${filter.name}" current=${currentCount} avg=${Math.round(rollingAvg)} deviation=${Math.round(deviation * 100)}% type=${anomalyType}`
          );
        }
      }
    }

    const summary = {
      anomaliesSent,
      usersProcessed,
      filtersChecked,
      checked_at: now.toISOString(),
    };
    console.log("[trend-anomaly] Complete:", summary);

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[trend-anomaly] Error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
