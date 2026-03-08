/**
 * SA-009: Incremental Materialized Views — Refresh Edge Function
 * ADR-08: Incremental MV Strategy
 *
 * Actions:
 *   incremental  — Delta-only refresh (reads ats_jobs_change_log)
 *   full         — Full refresh of all 3 MV tables
 *   status       — Return refresh log summary + staleness info
 *
 * Triggered by:
 *   - pg_cron every 3 minutes (incremental)
 *   - pg_cron weekly Sunday 4 AM UTC (full)
 *   - Admin manual trigger (either action)
 *
 * Architecture:
 *   ats_jobs → trg_ats_jobs_change_log → ats_jobs_change_log
 *   ats_jobs_change_log → mv_incremental_refresh() → mv_job_feed_counts + mv_source_breakdown + mv_landing_stats
 *
 * HOOK: refresh_type supports future MV targets without code changes.
 * SCAR: mv_refresh_log enables monitoring dashboards and alerting.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { withCorrelation } from "../_shared/middleware.ts";
import { requireAdmin, AdminAuthError } from "../_shared/admin-auth.ts";
import { warnIfDirectAccess } from "../_shared/gateway-deprecation.ts";

// ─── Environment ─────────────────────────────────────────────────────────────

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(withCorrelation("refresh-materialized-views", async (req: Request, logger: Logger) => {
  warnIfDirectAccess(req, "refresh-materialized-views", logger);

  try {
    await requireAdmin(req);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw e;
  }

  const sb = createClient(SB_URL, SB_KEY);
  const startTime = Date.now();

  try {
    let body: { action?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Default to incremental if no body
    }

    const action = body.action || "incremental";

    if (action === "status") {
      return handleStatus(sb, logger);
    }

    if (action !== "incremental" && action !== "full") {
      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    logger.info(`Starting ${action} MV refresh`);

    const fnName = action === "full" ? "mv_full_refresh_all" : "mv_incremental_refresh";
    const { data, error } = await sb.rpc(fnName);

    if (error) {
      logger.error(`MV refresh failed`, { error: error.message });
      return new Response(JSON.stringify({ status: "error", error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const elapsed = Date.now() - startTime;
    const result = typeof data === "string" ? JSON.parse(data) : data;

    logger.info(`MV refresh complete`, {
      type: result?.type,
      rows_processed: result?.rows_processed,
      duration_ms: elapsed,
      skipped: result?.skipped || false,
    });

    // PostHog event (if available)
    try {
      const phKey = Deno.env.get("POSTHOG_API_KEY");
      if (phKey) {
        await fetch("https://us.i.posthog.com/capture/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: phKey,
            event: "mv_refresh",
            distinct_id: "system",
            properties: {
              type: result?.type,
              rows_processed: result?.rows_processed,
              duration_ms: elapsed,
              skipped: result?.skipped || false,
            },
          }),
        }).catch(() => {}); // Fire-and-forget
      }
    } catch {
      // Non-critical
    }

    return new Response(JSON.stringify({
      status: "ok",
      ...result,
      elapsed_ms: elapsed,
    }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    const msg = (err as Error).message || "Unknown error";
    logger.error("Refresh failed", { error: msg });
    return new Response(JSON.stringify({ status: "error", error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}));


// ─── Status Handler ──────────────────────────────────────────────────────────

async function handleStatus(sb: SupabaseClient, logger: Logger) {
  try {
    // Last 10 refresh logs
    const { data: logs, error: logErr } = await sb
      .from("mv_refresh_log")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(10);

    if (logErr) throw logErr;

    // Current staleness
    const { data: stats, error: statsErr } = await sb
      .from("mv_landing_stats")
      .select("refreshed_at")
      .single();

    const refreshedAt = stats?.refreshed_at ? new Date(stats.refreshed_at) : null;
    const ageMs = refreshedAt ? Date.now() - refreshedAt.getTime() : null;
    const ageMins = ageMs != null ? Math.round(ageMs / 60000) : null;

    // Pending changes
    const { count: pendingChanges } = await sb
      .from("ats_jobs_change_log")
      .select("*", { count: "exact", head: true });

    return new Response(JSON.stringify({
      status: "ok",
      staleness: {
        refreshed_at: stats?.refreshed_at,
        age_minutes: ageMins,
        fresh: ageMins != null ? ageMins <= 5 : false,
        stale: ageMins != null ? ageMins > 15 : true,
      },
      pending_changes: pendingChanges || 0,
      recent_logs: logs || [],
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      status: "error",
      error: (err as Error).message,
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
