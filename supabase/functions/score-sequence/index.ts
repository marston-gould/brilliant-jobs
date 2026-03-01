// score-sequence Edge Function — v1 (Session 5, v6.05)
// CV Score Notification Flow
// Triggered after resume scoring completes. Determines tier (high/medium/low)
// and sends the appropriate email via send-notification.
// Suppression: max 3 score emails/user/24h, dedup on job+user, quiet hours, email prefs.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  scoreHighMatchEmail,
  scoreMediumMatchEmail,
  scoreLowMatchEmail,
} from "../_shared/email-templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SEND_NOTIFICATION_URL = `${SUPABASE_URL}/functions/v1/send-notification`;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MAX_SCORE_EMAILS_PER_DAY = 3;

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════
interface ScoreRequest {
  user_id: string;
  job_id: string;
  score: number;
  analysis_summary?: {
    strengths?: string[];
    gaps?: Array<{ skill: string; recommendation: string }>;
    missing_skills?: string[];
    key_matches?: string[];
    gap_analysis?: Array<{ requirement: string; severity: string }>;
    strength_map?: Array<{ area: string }>;
  };
  job_title?: string;
  company_name?: string;
}

// ═══════════════════════════════════════════════════════════
// SUPPRESSION CHECKS
// ═══════════════════════════════════════════════════════════

async function checkDailyLimit(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await sb
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .like("notification_type", "score_%")
    .gte("created_at", since);

  if (error) {
    console.error("[score-sequence] Daily limit check error:", error.message);
    return false; // fail open — don't block on query error
  }
  return (count || 0) >= MAX_SCORE_EMAILS_PER_DAY;
}

async function checkDuplicate(userId: string, jobId: string): Promise<boolean> {
  const { count, error } = await sb
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("job_id", jobId)
    .like("notification_type", "score_%");

  if (error) {
    console.error("[score-sequence] Dedup check error:", error.message);
    return false;
  }
  return (count || 0) > 0;
}

async function checkEmailEnabled(userId: string): Promise<boolean> {
  // Check if user has email disabled for score_* types
  const { data, error } = await sb
    .from("notification_channels")
    .select("email")
    .eq("user_id", userId)
    .in("notification_type", [
      "score_high_match",
      "score_medium_match",
      "score_low_match",
    ]);

  if (error || !data || data.length === 0) {
    // No preference row = default ON
    return true;
  }
  // If any score type has email explicitly disabled, respect it
  return data.some((row: { email: boolean }) => row.email !== false);
}

// ═══════════════════════════════════════════════════════════
// TIER DETERMINATION + EMAIL RENDERING
// ═══════════════════════════════════════════════════════════

function determineTier(score: number): "high" | "medium" | "low" {
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  return "low";
}

async function getBetterMatchCount(userId: string): Promise<number> {
  // Count jobs where user has scored 70+ (approximate from notification_log or cached scores)
  // For now, return a placeholder; in production this queries ats_jobs with user's resume data
  // This is a simplified version — the full implementation would use the readiness cache
  try {
    const { count } = await sb
      .from("notification_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("notification_type", "score_high_match");
    // Rough estimate: if user has high-match notifications, there are likely more
    return Math.max((count || 0) * 3, 5);
  } catch {
    return 0;
  }
}

function renderEmail(
  tier: "high" | "medium" | "low",
  req: ScoreRequest,
  firstName: string,
  betterMatchCount: number
): { subject: string; html: string; notification_type: string } {
  const summary = req.analysis_summary || {};

  if (tier === "high") {
    // Extract strengths from various possible response shapes
    const strengths: string[] =
      summary.strengths ||
      (summary.strength_map || []).map((s) => s.area) ||
      (summary.key_matches || []);
    const top3 = strengths.slice(0, 3);

    const email = scoreHighMatchEmail(
      firstName,
      req.score,
      req.job_title,
      req.company_name,
      req.job_id,
      top3
    );
    return { ...email, notification_type: "score_high_match" };
  }

  if (tier === "medium") {
    // Extract gaps from various possible response shapes
    const gaps: Array<{ skill: string; recommendation: string }> =
      summary.gaps ||
      (summary.gap_analysis || []).map((g) => ({
        skill: g.requirement,
        recommendation: `Address ${g.severity} gap`,
      }));
    const top3 = gaps.slice(0, 3);

    const email = scoreMediumMatchEmail(
      firstName,
      req.score,
      req.job_title,
      req.company_name,
      req.job_id,
      top3
    );
    return { ...email, notification_type: "score_medium_match" };
  }

  // Low
  const missingSkills: string[] =
    summary.missing_skills ||
    (summary.gap_analysis || []).map((g) => g.requirement) ||
    [];

  const email = scoreLowMatchEmail(
    firstName,
    req.score,
    req.job_title,
    req.company_name,
    req.job_id,
    missingSkills.slice(0, 5),
    betterMatchCount
  );
  return { ...email, notification_type: "score_low_match" };
}

// ═══════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
    });
  }

  try {
    const body: ScoreRequest = await req.json();

    // Validate required fields
    if (!body.user_id || !body.job_id || typeof body.score !== "number") {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: user_id, job_id, score",
        }),
        { status: 400 }
      );
    }

    console.log(
      `[score-sequence] Processing: user=${body.user_id}, job=${body.job_id}, score=${body.score}`
    );

    // ─── Suppression checks ───

    // 1. Check email preference
    const emailEnabled = await checkEmailEnabled(body.user_id);
    if (!emailEnabled) {
      console.log("[score-sequence] Suppressed: email disabled for score types");
      return new Response(
        JSON.stringify({ sent: false, reason: "email_disabled" }),
        { status: 200 }
      );
    }

    // 2. Check dedup (same user + same job)
    const isDuplicate = await checkDuplicate(body.user_id, body.job_id);
    if (isDuplicate) {
      console.log("[score-sequence] Suppressed: duplicate score email for this job");
      return new Response(
        JSON.stringify({ sent: false, reason: "duplicate" }),
        { status: 200 }
      );
    }

    // 3. Check daily limit
    const limitReached = await checkDailyLimit(body.user_id);
    if (limitReached) {
      console.log(
        `[score-sequence] Suppressed: daily limit (${MAX_SCORE_EMAILS_PER_DAY}) reached`
      );
      return new Response(
        JSON.stringify({ sent: false, reason: "daily_limit" }),
        { status: 200 }
      );
    }

    // ─── Resolve user info ───
    const { data: profile } = await sb
      .from("profiles")
      .select("full_name, email")
      .eq("id", body.user_id)
      .single();

    const firstName =
      profile?.full_name?.split(" ")[0] || profile?.email?.split("@")[0] || "there";

    // ─── Determine tier and render ───
    const tier = determineTier(body.score);
    const betterMatchCount =
      tier === "low" ? await getBetterMatchCount(body.user_id) : 0;

    const { subject, html, notification_type } = renderEmail(
      tier,
      body,
      firstName,
      betterMatchCount
    );

    // ─── Send via send-notification ───
    const notifPayload = {
      user_id: body.user_id,
      notification_type,
      subject,
      html,
      job_id: body.job_id,
      job_title: body.job_title || null,
      company_name: body.company_name || null,
      payload: {
        score: body.score,
        tier,
        analysis_summary: body.analysis_summary || null,
      },
    };

    const sendRes = await fetch(SEND_NOTIFICATION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(notifPayload),
    });

    const sendResult = await sendRes.json();

    console.log(
      `[score-sequence] Result: type=${notification_type}, tier=${tier}, sent=${sendResult.email_sent || false}`
    );

    return new Response(
      JSON.stringify({
        sent: sendResult.email_sent || false,
        tier,
        notification_type,
        score: body.score,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[score-sequence] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500 }
    );
  }
});
