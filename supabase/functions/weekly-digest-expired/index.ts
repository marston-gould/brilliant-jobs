// weekly-digest-expired Edge Function — FB-TRIAL-001-S5
// Sends a weekly digest to expired_free users summarizing new jobs matching their saved filters.
// Shows up to 5 job titles + companies. "Upgrade to see all X new jobs" CTA.
// Skips: users not logged in 60+ days, users with no active saved filter, unsubscribed users.
// Schedule: Mondays at 8AM UTC via pg_cron.
// Auth: service_role only.
// Gateway route #118 (FB-TRIAL-001-S5).

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "Brilliant Jobs <notifications@brilliantjobs.app>";
const DASHBOARD_URL = "https://brilliantjobs.app";
const POSTHOG_KEY = Deno.env.get("POSTHOG_API_KEY") || "";
const POSTHOG_HOST = Deno.env.get("POSTHOG_HOST") || "https://app.posthog.com";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function capturePostHog(distinctId: string, event: string, props: Record<string, unknown>) {
  if (!POSTHOG_KEY) return;
  try {
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: POSTHOG_KEY, distinct_id: distinctId, event, properties: props }),
    });
  } catch (_) { /* fire-and-forget */ }
}

const CORS = {
  "Access-Control-Allow-Origin": "https://brilliantjobs.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

interface FilterData {
  whatPills?: Array<{ values?: string[] }>;
  whatNotPills?: Array<{ values?: string[] }>;
  wherePills?: Array<{ values?: string[] }>;
  includeRemote?: boolean;
  [key: string]: unknown;
}

interface AtsJob {
  title: string;
  company_name: string;
  location?: string;
  is_remote?: boolean;
}

// ─── Lightweight keyword matcher (mirrors auto-apply-trigger pattern) ───
function matchesFilter(job: AtsJob, filterData: FilterData): boolean {
  const title = (job.title || "").toLowerCase();
  const location = (job.location || "").toLowerCase();

  const whatPills = filterData.whatPills || filterData.pills || [];
  if (whatPills.length > 0) {
    const anyMatch = whatPills.some((pill) =>
      (pill.values || []).some((v: string) => title.includes(v.toLowerCase().trim()))
    );
    if (!anyMatch) return false;
  }

  const whatNotPills = filterData.whatNotPills || [];
  for (const pill of whatNotPills) {
    for (const v of (pill.values || [])) {
      if (title.includes(v.toLowerCase().trim())) return false;
    }
  }

  const wherePills = filterData.wherePills || [];
  if (wherePills.length > 0) {
    const includeRemote = filterData.includeRemote === true;
    const isRemote = (job.is_remote === true) || location.includes("remote");
    if (includeRemote && isRemote) {
      // pass
    } else {
      const locMatch = wherePills.some((pill) =>
        (pill.values || []).some((v: string) => location.includes(v.toLowerCase().trim()))
      );
      if (!locMatch) return false;
    }
  }

  return true;
}

// ─── Send email via Resend ───
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
  // EMAIL KILL SWITCH — set EMAIL_ENABLED=false in Supabase secrets to disable all outbound email
  if (Deno.env.get("EMAIL_ENABLED") === "false") {
    console.log("[email] EMAIL_ENABLED=false — email suppressed");
    return false;
  }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
    return res.ok;
  } catch (e) {
    console.warn("[weekly-digest-expired] sendEmail failed:", String(e));
    return false;
  }
}

// ─── Build digest HTML ───
function buildDigestHtml(
  jobRows: Array<{ title: string; company: string }>,
  totalCount: number,
  filterName: string
): string {
  const jobListHtml = jobRows
    .map(
      (j) =>
        `<div style="padding:10px 0;border-bottom:1px solid #2a2d35;">
          <div style="font-size:14px;font-weight:600;color:#f0f1f3;">${escHtml(j.title)}</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px;">${escHtml(j.company)}</div>
        </div>`
    )
    .join("");

  const moreJobs = totalCount > 5 ? totalCount - 5 : 0;
  const moreHtml = moreJobs > 0
    ? `<p style="font-size:13px;color:#6366f1;margin:16px 0 0;">+${moreJobs} more matching jobs this week</p>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#0e1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e2e8f0;}
  .wrap{max-width:520px;margin:40px auto;padding:0 20px;}
  .card{background:#1a1d27;border:1px solid #2a2d35;border-radius:12px;padding:32px;}
  h2{margin:0 0 8px;font-size:20px;color:#f0f1f3;font-weight:600;}
  .subtitle{font-size:13px;color:#64748b;margin:0 0 20px;}
  .cta{display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-top:20px;}
  .footer{margin-top:24px;font-size:11px;color:#475569;text-align:center;}
  @media(prefers-color-scheme:dark){body{background:#0e1117;}}
</style></head><body>
<div class="wrap">
  <div class="card">
    <h2>${totalCount} new jobs this week</h2>
    <p class="subtitle">Matching your "${escHtml(filterName)}" filter</p>
    ${jobListHtml}
    ${moreHtml}
    <a href="${DASHBOARD_URL}/upgrade" class="cta">Upgrade to see all ${totalCount} jobs</a>
    <p style="font-size:11px;color:#475569;margin-top:16px;">Upgrade to Pro to unlock full job access, AI chat, resume scoring, and auto-apply.</p>
  </div>
  <div class="footer">
    Brilliant Jobs · <a href="${DASHBOARD_URL}/unsubscribe" style="color:#475569;">Unsubscribe</a>
  </div>
</div>
</body></html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ═══════════════════════════════════════════════════════════
// MAIN DIGEST LOGIC
// ═══════════════════════════════════════════════════════════
async function runWeeklyDigest(): Promise<{ sent: number; skipped: number; errors: number }> {
  const now = new Date();
  const sinceStr = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const lastActiveThreshold = new Date(now.getTime() - 60 * 86400_000).toISOString();
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  // 1. Get all expired_free users
  const { data: expiredUsers } = await sb
    .from("profiles")
    .select("id, last_seen_at")
    .eq("user_state", "expired_free");

  if (!expiredUsers || expiredUsers.length === 0) {
    return { sent: 0, skipped: 0, errors: 0 };
  }

  // 2. Get new jobs posted in last 7 days (status=open)
  const { data: newJobs } = await sb
    .from("ats_jobs")
    .select("greenhouse_id, title, company_name, location, is_remote")
    .eq("status", "open")
    .gte("created_at", sinceStr)
    .limit(2000); // cap to avoid huge payloads

  if (!newJobs || newJobs.length === 0) {
    return { sent: 0, skipped: expiredUsers.length, errors: 0 };
  }

  // 3. Process each expired user
  for (const user of expiredUsers) {
    try {
      // Skip: not logged in 60+ days
      if (user.last_seen_at && user.last_seen_at < lastActiveThreshold) {
        skipped++;
        continue;
      }

      // Skip: already received digest this week
      const weekAgo = new Date(now.getTime() - 6 * 86400_000).toISOString();
      const { count: recentDigest } = await sb
        .from("notification_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("notification_type", "weekly_digest_expired")
        .gte("created_at", weekAgo);
      if ((recentDigest || 0) > 0) { skipped++; continue; }

      // Check notification_preferences unsubscribe
      const { data: prefs } = await sb
        .from("notification_preferences")
        .select("email_enabled")
        .eq("user_id", user.id)
        .single();
      if (prefs?.email_enabled === false) { skipped++; continue; }

      // Require at least one active saved filter
      const { data: filters } = await sb
        .from("user_filters")
        .select("id, name, filter_data")
        .eq("user_id", user.id)
        .limit(5);

      if (!filters || filters.length === 0) { skipped++; continue; }

      // Match new jobs against user filters
      const matchedJobs: AtsJob[] = [];
      const seenIds = new Set<string>();
      let bestFilterName = filters[0].name || "Saved Filter";

      for (const filter of filters) {
        for (const job of newJobs) {
          if (seenIds.has(job.greenhouse_id)) continue;
          if (matchesFilter(job as AtsJob, filter.filter_data as FilterData)) {
            matchedJobs.push(job as AtsJob);
            seenIds.add(job.greenhouse_id);
            bestFilterName = filter.name || bestFilterName;
          }
        }
      }

      if (matchedJobs.length === 0) { skipped++; continue; }

      // Get user email
      const { data: authUser } = await sb.auth.admin.getUserById(user.id);
      if (!authUser?.user?.email) { skipped++; continue; }

      const totalCount = matchedJobs.length;
      const preview = matchedJobs.slice(0, 5).map((j) => ({
        title: j.title,
        company: j.company_name,
      }));

      const subject = `${totalCount} new job${totalCount > 1 ? "s" : ""} matching your filters this week`;
      const html = buildDigestHtml(preview, totalCount, bestFilterName);

      const ok = await sendEmail(authUser.user.email, subject, html);
      if (ok) {
        await sb.from("notification_log").insert({
          user_id: user.id,
          notification_type: "weekly_digest_expired",
          channel: "email",
          status: "sent",
          metadata: { total_matches: totalCount, filter_count: filters.length },
        });
        // spec §11: expired_digest_sent PostHog event
        await capturePostHog(user.id, "expired_digest_sent", {
          user_id: user.id,
          jobs_matched: totalCount,
          surface: "weekly_digest_expired",
        });
        sent++;
      } else {
        errors++;
      }
    } catch (err) {
      console.warn("[weekly-digest-expired] user error:", String(err));
      errors++;
    }
  }

  return { sent, skipped, errors };
}

// ═══════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (token !== SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "service_role_required" }, 401);
  }

  try {
    const result = await runWeeklyDigest();
    return json({ ok: true, ...result });
  } catch (err) {
    console.error("[weekly-digest-expired] unhandled error:", String(err));
    return json({ error: "internal_error", detail: String(err) }, 500);
  }
});
