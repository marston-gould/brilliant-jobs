// supabase/functions/ghost-auto-detect/index.ts
// FB-GHOST-BADGE-001: Scheduled auto-detection of stale applications.
// Scans user_pipeline for entries in waiting states past stale thresholds:
//   - "applied" stage: 30+ days no status change
//   - "screening"/"interview" stages: 21+ days no status change
// Inserts auto_inferred ghost_reports (confidence=0.5) with dedup.
// Auth: service_role only.
// Gateway route #121 (FB-GHOST-BADGE-001).

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const POSTHOG_KEY               = Deno.env.get("POSTHOG_API_KEY") || "";
const POSTHOG_HOST              = Deno.env.get("POSTHOG_HOST") || "https://app.posthog.com";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Waiting states that qualify for ghost auto-detection
const WAITING_STAGES = ["applied", "screening", "interview"];
// Days threshold per stage
const STAGE_THRESHOLDS: Record<string, number> = {
  applied:   30,
  screening: 21,
  interview: 21,
};

function normalizeCompanyName(name: string): string {
  return name.trim().toLowerCase().replace(/[,.'"\-]+/g, " ").replace(/\s+/g, " ").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  // Service role only
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.includes(SUPABASE_SERVICE_ROLE_KEY)) {
    return new Response(JSON.stringify({ error: "Service role required" }), { status: 401 });
  }

  let totalFlagged = 0;
  let totalSkipped = 0;
  const byStatus: Record<string, number> = {};

  try {
    const now = new Date();

    // Query user_pipeline entries in waiting stages
    // We look at entries where updated_at is stale by threshold
    const { data: staleEntries, error: queryErr } = await sb
      .from("user_pipeline")
      .select("id, user_id, company_name, job_title, stage, updated_at, applied_at")
      .in("stage", WAITING_STAGES);

    if (queryErr) {
      console.error("[ghost-auto-detect] Query error:", queryErr.message);
      return new Response(JSON.stringify({ error: queryErr.message }), { status: 500 });
    }

    for (const entry of staleEntries || []) {
      const stage = entry.stage as string;
      const threshold = STAGE_THRESHOLDS[stage] || 30;

      // Use applied_at if available, else updated_at
      const referenceDate = entry.applied_at || entry.updated_at;
      if (!referenceDate) { totalSkipped++; continue; }

      const daysSince = Math.floor((now.getTime() - new Date(referenceDate).getTime()) / 86400_000);
      if (daysSince < threshold) { totalSkipped++; continue; }

      const companyName = normalizeCompanyName(entry.company_name || "unknown");

      // Check for existing active auto_inferred report in last 90 days
      const { data: existing } = await sb
        .from("ghost_reports")
        .select("id")
        .eq("user_id", entry.user_id)
        .eq("company_name", companyName)
        .eq("source", "auto_inferred")
        .eq("is_active", true)
        .gte("reported_at", new Date(Date.now() - 90 * 86400_000).toISOString())
        .limit(1)
        .maybeSingle();

      if (existing) { totalSkipped++; continue; }

      // Insert auto_inferred report
      const { error: insertErr } = await sb
        .from("ghost_reports")
        .insert({
          user_id:        entry.user_id,
          company_name:   companyName,
          application_id: null, // pipeline entries don't always have pending_application link
          source:         "auto_inferred",
          confidence:     0.5,
        });

      if (insertErr) {
        console.warn("[ghost-auto-detect] Insert failed for entry", entry.id, ":", insertErr.message);
        totalSkipped++;
        continue;
      }

      totalFlagged++;
      byStatus[stage] = (byStatus[stage] || 0) + 1;
    }

    // Trigger full score refresh after batch insert
    if (totalFlagged > 0) {
      try {
        await sb.rpc("fn_ghost_score_refresh");
      } catch (refreshErr) {
        console.warn("[ghost-auto-detect] Score refresh failed (non-fatal):", String(refreshErr));
      }
    }

    // PostHog
    if (POSTHOG_KEY && (totalFlagged > 0 || totalSkipped > 0)) {
      try {
        await fetch(`${POSTHOG_HOST}/capture/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key:     POSTHOG_KEY,
            distinct_id: "system",
            event:       "ghost_auto_detect_batch",
            properties:  { total_flagged: totalFlagged, total_skipped: totalSkipped, by_status: byStatus },
          }),
        });
      } catch (_) { /* fire-and-forget */ }
    }

    // SDV-S7: Ghost rate feedback survey trigger (§3.3 event-driven)
    // After ghost patterns detected, dispatch survey invite to affected users
    if (totalFlagged > 0) {
      try {
        await sb.functions.invoke("send-survey-invite", {
          body: { action: "send_email", campaign_version: "ghost_rate_feedback_v1" },
        });
      } catch (e) { console.warn("[ghost-auto-detect] Survey invite dispatch failed (non-fatal):", String(e)); }
    }

    return new Response(JSON.stringify({
      success:       true,
      total_flagged: totalFlagged,
      total_skipped: totalSkipped,
      by_status:     byStatus,
    }), {
      status:  200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[ghost-auto-detect] Unexpected error:", String(err));
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
