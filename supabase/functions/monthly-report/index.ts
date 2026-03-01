// monthly-report Edge Function — v6.10
// Triggered by pg_cron on 1st of month at 8am ET.
// Session 10: New EF computing monthly data for Batch 6 dark theme templates.
// Sends per user:
//   1. Monthly Pipeline Report (MoM comparison + funnel)
//   2. Pipeline Benchmark (user vs community)
//   3. Upgrade ROI Summary (tier-gated: free=upsell, pro=value)
//   4. Credit Cost Comparison (usage + plan comparison)
//   5. Rewrite Batch Summary (if user had rewrites)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  monthlyPipelineReportEmail,
  pipelineBenchmarkEmail,
  upgradeRoiSummaryEmail,
  creditCostComparisonEmail,
  rewriteBatchSummaryEmail,
} from "../_shared/email-templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
    console.warn("[monthly-report] send-notification call failed:", e);
  }
}

async function isNotifEnabled(userId: string, notifType: string): Promise<boolean> {
  const { data } = await sb
    .from("notification_channels")
    .select("email")
    .eq("user_id", userId)
    .eq("notification_type", notifType)
    .single();
  return !data || data.email !== false;
}

async function getUserTier(userId: string): Promise<string> {
  const { data } = await sb
    .from("profiles")
    .select("subscription_tier")
    .eq("id", userId)
    .single();
  return data?.subscription_tier || "free";
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
  // "This month" = last full month (since cron runs on 1st)
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const lastMonthEnd = thisMonthStart;

  const monthName = thisMonthStart.toLocaleString("en-US", { month: "long", year: "numeric" });
  const lastMonthName = lastMonthStart.toLocaleString("en-US", { month: "long" });

  const thisMonthIso = thisMonthStart.toISOString();
  const thisMonthEndIso = thisMonthEnd.toISOString();
  const lastMonthIso = lastMonthStart.toISOString();
  const lastMonthEndIso = lastMonthEnd.toISOString();

  const counts = {
    pipelineSent: 0,
    benchmarkSent: 0,
    roiSent: 0,
    creditSent: 0,
    rewriteSent: 0,
    usersProcessed: 0,
    usersSkipped: 0,
  };

  try {
    // ================================================================
    // COMMUNITY-WIDE STATS (for benchmarks)
    // ================================================================

    // Community response rate
    const { count: communityApplied } = await sb
      .from("notification_actions")
      .select("*", { count: "exact", head: true })
      .eq("status", "accepted")
      .gte("responded_at", thisMonthIso)
      .lt("responded_at", thisMonthEndIso);

    const { count: communityResponses } = await sb
      .from("notification_log")
      .select("*", { count: "exact", head: true })
      .eq("notification_type", "pipeline_response")
      .gte("created_at", thisMonthIso)
      .lt("created_at", thisMonthEndIso);

    const { count: communityInterviews } = await sb
      .from("notification_log")
      .select("*", { count: "exact", head: true })
      .eq("notification_type", "pipeline_interview")
      .gte("created_at", thisMonthIso)
      .lt("created_at", thisMonthEndIso);

    const communityResponseAvg = (communityApplied || 0) > 0
      ? Math.round(((communityResponses || 0) / (communityApplied || 1)) * 100)
      : 0;
    const communityInterviewAvg = (communityApplied || 0) > 0
      ? Math.round(((communityInterviews || 0) / (communityApplied || 1)) * 100)
      : 0;

    // Count active users for benchmark context
    const { count: totalCommunityUsers } = await sb
      .from("notification_preferences")
      .select("*", { count: "exact", head: true })
      .eq("email_enabled", true);

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
        console.warn("[monthly-report] Wall time limit approaching, stopping.");
        break;
      }

      if (prefs.email_enabled === false) {
        counts.usersSkipped++;
        continue;
      }

      const userId = prefs.user_id;
      const tier = await getUserTier(userId);
      counts.usersProcessed++;

      // ============================================================
      // 1. MONTHLY PIPELINE REPORT
      // ============================================================
      if (await isNotifEnabled(userId, "monthly_pipeline_report")) {
        // This month stats
        const { count: applied } = await sb
          .from("notification_actions")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "accepted")
          .gte("responded_at", thisMonthIso)
          .lt("responded_at", thisMonthEndIso);

        const { count: userResponses } = await sb
          .from("notification_log")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("notification_type", "pipeline_response")
          .gte("created_at", thisMonthIso)
          .lt("created_at", thisMonthEndIso);

        const { count: userInterviews } = await sb
          .from("notification_log")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("notification_type", "pipeline_interview")
          .gte("created_at", thisMonthIso)
          .lt("created_at", thisMonthEndIso);

        const { count: userGhosted } = await sb
          .from("notification_actions")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "accepted")
          .gte("responded_at", thisMonthIso)
          .lt("responded_at", thisMonthEndIso)
          .is("escalated_at", null);

        // Last month stats
        const { count: lastApplied } = await sb
          .from("notification_actions")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "accepted")
          .gte("responded_at", lastMonthIso)
          .lt("responded_at", lastMonthEndIso);

        const { count: lastResponses } = await sb
          .from("notification_log")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("notification_type", "pipeline_response")
          .gte("created_at", lastMonthIso)
          .lt("created_at", lastMonthEndIso);

        const { count: lastInterviews } = await sb
          .from("notification_log")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("notification_type", "pipeline_interview")
          .gte("created_at", lastMonthIso)
          .lt("created_at", lastMonthEndIso);

        const { count: lastGhosted } = await sb
          .from("notification_actions")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "accepted")
          .gte("responded_at", lastMonthIso)
          .lt("responded_at", lastMonthEndIso)
          .is("escalated_at", null);

        const responseRate = (applied || 0) > 0
          ? Math.round(((userResponses || 0) / (applied || 1)) * 100)
          : 0;
        const lastResponseRate = (lastApplied || 0) > 0
          ? Math.round(((lastResponses || 0) / (lastApplied || 1)) * 100)
          : 0;
        const interviewConversion = (applied || 0) > 0
          ? Math.round(((userInterviews || 0) / (applied || 1)) * 100)
          : 0;
        const lastInterviewPct = (lastApplied || 0) > 0
          ? Math.round(((lastInterviews || 0) / (lastApplied || 1)) * 100)
          : 0;
        const ghostRate = (applied || 0) > 0
          ? Math.round(((userGhosted || 0) / (applied || 1)) * 100)
          : 0;
        const lastGhostRate = (lastApplied || 0) > 0
          ? Math.round(((lastGhosted || 0) / (lastApplied || 1)) * 100)
          : 0;

        // Top responders (companies that responded fastest)
        const { data: responders } = await sb
          .from("notification_log")
          .select("company_name, created_at")
          .eq("user_id", userId)
          .eq("notification_type", "pipeline_response")
          .gte("created_at", thisMonthIso)
          .lt("created_at", thisMonthEndIso)
          .order("created_at", { ascending: true })
          .limit(5);

        const topResponders = (responders || [])
          .filter((r: any) => r.company_name)
          .map((r: any) => ({
            company: r.company_name,
            days: Math.round(
              (new Date(r.created_at).getTime() - thisMonthStart.getTime()) / (1000 * 3600 * 24)
            ),
          }))
          .slice(0, 3);

        if ((applied || 0) > 0 || (lastApplied || 0) > 0) {
          const email = monthlyPipelineReportEmail({
            monthName,
            totalApplied: applied || 0,
            totalResponses: userResponses || 0,
            responseRate,
            avgDaysToResponse: 7, // placeholder — would need application timestamps
            interviewConversion,
            ghostRate,
            lastMonth: {
              applied: lastApplied || 0,
              responseRate: lastResponseRate,
              avgDays: 7,
              interviewPct: lastInterviewPct,
              ghostRate: lastGhostRate,
            },
            topResponders,
          });

          await sendNotification({
            user_id: userId,
            notification_type: "monthly_pipeline_report",
            subject: email.subject,
            html: email.html,
            force_channel: "email",
          });
          counts.pipelineSent++;
        }
      }

      // ============================================================
      // 2. PIPELINE BENCHMARK
      // ============================================================
      if (await isNotifEnabled(userId, "pipeline_benchmark")) {
        const { count: userApplied } = await sb
          .from("notification_actions")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "accepted")
          .gte("responded_at", thisMonthIso)
          .lt("responded_at", thisMonthEndIso);

        const { count: userResp } = await sb
          .from("notification_log")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("notification_type", "pipeline_response")
          .gte("created_at", thisMonthIso)
          .lt("created_at", thisMonthEndIso);

        const { count: userIntv } = await sb
          .from("notification_log")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("notification_type", "pipeline_interview")
          .gte("created_at", thisMonthIso)
          .lt("created_at", thisMonthEndIso);

        if ((userApplied || 0) >= 3) {
          const rr = Math.round(((userResp || 0) / (userApplied || 1)) * 100);
          const ir = Math.round(((userIntv || 0) / (userApplied || 1)) * 100);

          // Percentile calculation (simplified — top X%)
          const responsePercentile = rr > communityResponseAvg ? Math.max(5, Math.round(50 - (rr - communityResponseAvg))) : Math.min(95, Math.round(50 + (communityResponseAvg - rr)));
          const interviewPercentile = ir > communityInterviewAvg ? Math.max(5, Math.round(50 - (ir - communityInterviewAvg))) : Math.min(95, Math.round(50 + (communityInterviewAvg - ir)));

          const email = pipelineBenchmarkEmail({
            monthName,
            responseRate: rr,
            responsePercentile: Math.min(99, Math.max(1, responsePercentile)),
            avgDays: 7,
            speedPercentile: 50,
            interviewRate: ir,
            interviewPercentile: Math.min(99, Math.max(1, interviewPercentile)),
            communityResponseAvg,
            communityDaysAvg: 7,
            communityInterviewAvg,
            totalCommunityUsers: totalCommunityUsers || 0,
            insight: rr > communityResponseAvg
              ? "Your response rate is above average — your resume and targeting are working well."
              : "Consider tailoring your resume more closely to each role to improve response rates.",
          });

          await sendNotification({
            user_id: userId,
            notification_type: "pipeline_benchmark",
            subject: email.subject,
            html: email.html,
            force_channel: "email",
          });
          counts.benchmarkSent++;
        }
      }

      // ============================================================
      // 3. UPGRADE ROI SUMMARY (tier-gated)
      // ============================================================
      if (await isNotifEnabled(userId, "upgrade_roi_summary")) {
        if (tier === "free") {
          // Free tier: show missed opportunities
          const { count: matchesFound } = await sb
            .from("notification_log")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .in("notification_type", ["apply_alert", "auto_apply_confirm"])
            .gte("created_at", thisMonthIso)
            .lt("created_at", thisMonthEndIso);

          const { count: missed } = await sb
            .from("notification_actions")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("status", "missed")
            .gte("created_at", thisMonthIso)
            .lt("created_at", thisMonthEndIso);

          if ((matchesFound || 0) > 0 || (missed || 0) > 0) {
            const email = upgradeRoiSummaryEmail({
              monthName,
              isFreeTier: true,
              jobsTracked: matchesFound || 0,
              matchesFound: matchesFound || 0,
              missedCount: missed || 0,
              projectedAuto: Math.round((missed || 0) * 0.8),
              projectedHours: Math.round((missed || 0) * 0.5),
            });

            await sendNotification({
              user_id: userId,
              notification_type: "upgrade_roi_summary",
              subject: email.subject,
              html: email.html,
              force_channel: "email",
            });
            counts.roiSent++;
          }
        } else {
          // Pro tier: show value delivered
          const { count: autoApps } = await sb
            .from("notification_log")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("notification_type", "auto_apply_confirm")
            .gte("created_at", thisMonthIso)
            .lt("created_at", thisMonthEndIso);

          const { count: proResponses } = await sb
            .from("notification_log")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("notification_type", "pipeline_response")
            .gte("created_at", thisMonthIso)
            .lt("created_at", thisMonthEndIso);

          if ((autoApps || 0) > 0) {
            const rr = (autoApps || 0) > 0
              ? Math.round(((proResponses || 0) / (autoApps || 1)) * 100)
              : 0;

            const email = upgradeRoiSummaryEmail({
              monthName,
              isFreeTier: false,
              autoApplies: autoApps || 0,
              hoursSaved: Math.round((autoApps || 0) * 0.5),
              responseRate: rr,
              costPerApp: "0.50",
              planPrice: "29.99",
              manualCostPerApp: "2.50",
            });

            await sendNotification({
              user_id: userId,
              notification_type: "upgrade_roi_summary",
              subject: email.subject,
              html: email.html,
              force_channel: "email",
            });
            counts.roiSent++;
          }
        }
      }

      // ============================================================
      // 4. CREDIT COST COMPARISON
      // ============================================================
      if (await isNotifEnabled(userId, "credit_cost_comparison")) {
        const { data: creditData } = await sb
          .from("credit_transactions")
          .select("feature, credits_used")
          .eq("user_id", userId)
          .gte("created_at", thisMonthIso)
          .lt("created_at", thisMonthEndIso);

        if (creditData && creditData.length > 0) {
          // Aggregate by feature
          const featureMap: Record<string, { uses: number; credits: number }> = {};
          let totalCredits = 0;
          for (const tx of creditData) {
            const f = tx.feature || "other";
            if (!featureMap[f]) featureMap[f] = { uses: 0, credits: 0 };
            featureMap[f].uses++;
            featureMap[f].credits += tx.credits_used || 0;
            totalCredits += tx.credits_used || 0;
          }

          const usageRows = Object.entries(featureMap).map(([feature, data]) => ({
            feature: feature.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            uses: data.uses,
            credits: data.credits,
            unitCost: (data.credits * 0.01).toFixed(2), // Example unit cost
          }));

          // Get remaining credits
          const { data: profile } = await sb
            .from("profiles")
            .select("credits_remaining")
            .eq("id", userId)
            .single();

          const creditsRemaining = profile?.credits_remaining || 0;

          const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          const nextRefillDate = nextMonth.toLocaleDateString("en-US", { month: "short", day: "numeric" });

          // Projected usage at current pace
          const daysInMonth = (thisMonthEnd.getTime() - thisMonthStart.getTime()) / (1000 * 3600 * 24);
          const projectedCredits = Math.round(totalCredits * (30 / daysInMonth));

          const email = creditCostComparisonEmail({
            monthName,
            creditsUsed: totalCredits,
            creditsRemaining,
            nextRefillDate,
            usageRows,
            starterCredits: 100,
            proCredits: 500,
            starterPerCredit: "0.20",
            proPerCredit: "0.06",
            savingsPct: 70,
            projectedCredits,
            projectionContext: `Based on ${monthName} usage, you'll use ~${projectedCredits} credits next month.`,
          });

          await sendNotification({
            user_id: userId,
            notification_type: "credit_cost_comparison",
            subject: email.subject,
            html: email.html,
            force_channel: "email",
          });
          counts.creditSent++;
        }
      }

      // ============================================================
      // 5. REWRITE BATCH SUMMARY
      // ============================================================
      if (await isNotifEnabled(userId, "rewrite_batch_summary")) {
        const { data: rewrites } = await sb
          .from("resume_rewrites")
          .select("id, filter_name, original_score, rewritten_score, status, credits_used, resume_name, batch_id")
          .eq("user_id", userId)
          .gte("created_at", thisMonthIso)
          .lt("created_at", thisMonthEndIso)
          .order("created_at", { ascending: false });

        if (rewrites && rewrites.length > 0) {
          // Group by batch
          const batches: Record<string, typeof rewrites> = {};
          for (const r of rewrites) {
            const batchKey = r.batch_id || "default";
            if (!batches[batchKey]) batches[batchKey] = [];
            batches[batchKey].push(r);
          }

          // Send one summary per batch
          for (const [batchId, batchRewrites] of Object.entries(batches)) {
            const improved = batchRewrites.filter(
              (r: any) => r.rewritten_score > r.original_score
            );
            const totalCredits = batchRewrites.reduce(
              (sum: number, r: any) => sum + (r.credits_used || 0),
              0
            );
            const avgImprovement = improved.length > 0
              ? Math.round(
                  improved.reduce(
                    (sum: number, r: any) =>
                      sum + (r.rewritten_score - r.original_score),
                    0
                  ) / improved.length
                )
              : 0;

            const resumes = batchRewrites.slice(0, 10).map((r: any) => ({
              name: r.resume_name || `Resume ${r.id.slice(0, 6)}`,
              before: String(r.original_score || 0),
              after: String(r.rewritten_score || 0),
              delta: `+${(r.rewritten_score || 0) - (r.original_score || 0)}`,
              status: (r.rewritten_score || 0) > (r.original_score || 0)
                ? "improved" as const
                : r.status === "failed"
                ? "failed" as const
                : "unchanged" as const,
            }));

            const email = rewriteBatchSummaryEmail({
              totalCount: batchRewrites.length,
              improvedCount: improved.length,
              avgImprovement,
              creditsUsed: totalCredits,
              filterName: batchRewrites[0]?.filter_name || "All Filters",
              batchId,
              resumes,
            });

            await sendNotification({
              user_id: userId,
              notification_type: "rewrite_batch_summary",
              subject: email.subject,
              html: email.html,
              force_channel: "email",
            });
            counts.rewriteSent++;
          }
        }
      }
    }

    console.log("[monthly-report] Complete:", counts);

    return new Response(JSON.stringify({ ...counts, monthName }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[monthly-report] Error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
