// re-engagement Edge Function — v2 (v6.77, archive status feature)
// Cron-triggered daily at 11:00 AM ET (16:00 UTC).
// Checks profiles.last_sign_in_at for inactive users at four thresholds:
//   14 days → reengagement_14d (gentle check-in + $5/yr storage mention)
//   30 days → reengagement_30d (urgency + FOMO + $5/yr storage mention)
//   60 days → reengagement_60d (final check-in + archive countdown warning)
//   90 days → reengagement_90d (FINAL NOTICE — account archives tomorrow)
// Sends via send-notification pipeline (marketing classification).
// Dedup: checks notification_log for recent sends within each tier window.
// Respects: admin config, user opt-in (marketing), frequency caps, quiet hours.
// Does NOT send to: unverified emails, users who unsubscribed from marketing.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  reengagement14dEmail,
  reengagement30dEmail,
  reengagement60dEmail,
  reengagement90dEmail,
} from "../_shared/email-templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const DASHBOARD_URL = "https://brilliantjobs.app/dashboard";

// Tier windows define the inactivity range (inclusive lower, exclusive upper)
// and the dedup window (don't re-send within this period)
const TIERS = [
  { name: "reengagement_14d", daysMin: 13, daysMax: 16, dedupDays: 14, buildEmail: reengagement14dEmail },
  { name: "reengagement_30d", daysMin: 28, daysMax: 33, dedupDays: 30, buildEmail: reengagement30dEmail },
  { name: "reengagement_60d", daysMin: 58, daysMax: 65, dedupDays: 60, buildEmail: reengagement60dEmail },
  { name: "reengagement_90d", daysMin: 89, daysMax: 91, dedupDays: 30, buildEmail: reengagement90dEmail },
] as const;

interface UserRow {
  id: string;
  email: string;
  raw_user_meta_data: Record<string, unknown>;
  last_sign_in_at: string | null;
  created_at: string;
}

function daysSince(dateStr: string): number {
  const then = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - then.getTime()) / 86400000);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

  const results = { sent_14d: 0, sent_30d: 0, sent_60d: 0, sent_90d: 0, skipped_dedup: 0, skipped_nofilter: 0, errors: 0 };

  try {
    // ─────────────────────────────────────────────────────────────
    // For each tier, find users whose last_sign_in_at falls in range
    // ─────────────────────────────────────────────────────────────
    for (const tier of TIERS) {
      const now = new Date();
      const rangeStart = new Date(now.getTime() - tier.daysMax * 86400000);
      const rangeEnd = new Date(now.getTime() - tier.daysMin * 86400000);

      // Get eligible users (last signed in within the tier window)
      // Using auth.users via service role
      const { data: users, error: usersErr } = await sb.rpc("get_inactive_users", {
        range_start: rangeStart.toISOString(),
        range_end: rangeEnd.toISOString(),
      });

      if (usersErr) {
        console.error(`[re-engagement] Error fetching users for ${tier.name}:`, usersErr);
        results.errors++;
        continue;
      }

      if (!users || users.length === 0) {
        console.log(`[re-engagement] No users in ${tier.name} window (${tier.daysMin}-${tier.daysMax}d)`);
        continue;
      }

      console.log(`[re-engagement] ${tier.name}: ${users.length} candidates`);

      for (const user of users) {
        try {
          // ─── Dedup check: already sent this tier within window? ───
          const dedupCutoff = new Date(now.getTime() - tier.dedupDays * 86400000);
          const { data: existing } = await sb
            .from("notification_log")
            .select("id")
            .eq("user_id", user.id)
            .eq("notification_type", tier.name)
            .gte("created_at", dedupCutoff.toISOString())
            .limit(1);

          if (existing && existing.length > 0) {
            results.skipped_dedup++;
            continue;
          }

          // ─── Also check higher tiers: don't send 14d if 30d/60d already sent ───
          if (tier.name === "reengagement_14d") {
            const { data: higher } = await sb
              .from("notification_log")
              .select("id")
              .eq("user_id", user.id)
              .in("notification_type", ["reengagement_30d", "reengagement_60d"])
              .gte("created_at", dedupCutoff.toISOString())
              .limit(1);

            if (higher && higher.length > 0) {
              results.skipped_dedup++;
              continue;
            }
          }

          // ─── Gather context data for the email ───
          const lastLogin = user.last_sign_in_at || user.created_at;
          const inactiveDays = daysSince(lastLogin);
          const firstName = (user.raw_user_meta_data?.full_name as string)?.split(" ")[0]
            || (user.raw_user_meta_data?.name as string)?.split(" ")[0]
            || undefined;

          // Get user's saved filters
          const { data: filters } = await sb
            .from("user_filters")
            .select("name")
            .eq("user_id", user.id)
            .limit(5);

          const filterNames = (filters || []).map((f: { name: string }) => f.name);

          // If user has no filters and no pipeline entries, skip (they never set up)
          if (filterNames.length === 0) {
            const { count } = await sb
              .from("user_pipeline")
              .select("id", { count: "exact", head: true })
              .eq("user_id", user.id);

            if (!count || count === 0) {
              results.skipped_nofilter++;
              continue;
            }
          }

          // Count jobs that matched their filters since last login
          const { count: matchedCount } = await sb
            .from("notification_log")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .in("notification_type", ["apply_alert", "new_jobs_daily", "new_jobs_realtime"])
            .gte("created_at", lastLogin);

          // Count closed jobs in their pipeline
          const { count: closedCount } = await sb
            .from("user_pipeline")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("status", "closed")
            .gte("updated_at", lastLogin);

          // Get top companies that matched
          const { data: topCompanyRows } = await sb
            .from("notification_log")
            .select("company_name")
            .eq("user_id", user.id)
            .in("notification_type", ["apply_alert", "new_jobs_daily", "new_jobs_realtime"])
            .gte("created_at", lastLogin)
            .not("company_name", "is", null)
            .limit(50);

          // Deduplicate and rank top companies
          const companyCounts: Record<string, number> = {};
          for (const row of topCompanyRows || []) {
            if (row.company_name) {
              companyCounts[row.company_name] = (companyCounts[row.company_name] || 0) + 1;
            }
          }
          const topCompanies = Object.entries(companyCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name]) => name);

          // ─── Build email content ───
          let emailContent: { subject: string; html: string };
          const lastLoginFormatted = formatDate(lastLogin);

          if (tier.name === "reengagement_14d") {
            emailContent = tier.buildEmail(
              firstName,
              matchedCount ?? 0,
              topCompanies,
              filterNames,
              lastLoginFormatted,
              DASHBOARD_URL
            );
          } else if (tier.name === "reengagement_30d") {
            emailContent = (reengagement30dEmail as Function)(
              firstName,
              matchedCount ?? 0,
              closedCount ?? 0,
              topCompanies,
              filterNames,
              undefined, // avgSalaryRange — not computed yet
              lastLoginFormatted,
              DASHBOARD_URL
            );
          } else if (tier.name === "reengagement_60d") {
            // 60d — get new companies count
            const { count: newCompaniesCount } = await sb
              .from("ats_companies")
              .select("id", { count: "exact", head: true })
              .gte("created_at", lastLogin);

            emailContent = (reengagement60dEmail as Function)(
              firstName,
              matchedCount ?? 0,
              closedCount ?? 0,
              newCompaniesCount ?? 0,
              undefined, // marketTrend
              filterNames,
              lastLoginFormatted,
              DASHBOARD_URL
            );
          }

          // 90d — final archive warning
          if (tier.name === "reengagement_90d") {
            emailContent = (reengagement90dEmail as Function)(
              firstName,
              matchedCount ?? 0,
              closedCount ?? 0,
              filterNames,
              lastLoginFormatted,
              DASHBOARD_URL
            );
          }

          // ─── Send via send-notification pipeline ───
          const notifPayload = {
            user_id: user.id,
            notification_type: tier.name,
            subject: emailContent.subject,
            html: emailContent.html,
            payload: {
              inactive_days: inactiveDays,
              matched_jobs: matchedCount ?? 0,
              closed_jobs: closedCount ?? 0,
              top_companies: topCompanies,
              filter_names: filterNames,
              tier: tier.name,
            },
            idempotency_key: `${tier.name}_${user.id}_${new Date().toISOString().slice(0, 10)}`,
            user_plan: user.plan || "free",
            user_cohort: user.cohort_id || "cohort_launch",
            template_version: "1.0.0",
          };

          const sendResp = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify(notifPayload),
          });

          if (sendResp.ok) {
            const key = `sent_${tier.name.replace("reengagement_", "")}` as keyof typeof results;
            (results as Record<string, number>)[key]++;
            console.log(`[re-engagement] SENT ${tier.name} to ${user.id} (${inactiveDays}d inactive)`);
          } else {
            const err = await sendResp.text();
            console.error(`[re-engagement] send-notification failed for ${user.id}: ${err}`);
            results.errors++;
          }
        } catch (userErr) {
          console.error(`[re-engagement] Error processing user ${user.id}:`, userErr);
          results.errors++;
        }
      }
    }

    console.log("[re-engagement] Summary:", results);
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[re-engagement] Fatal error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

