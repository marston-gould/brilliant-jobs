// admin-analytics Edge Function
// CS-024: Admin Monitoring Part 2
// AD-FIX-13: PostHog error events with session replay links
// AD-FIX-14: Edge Function invocation health metrics
// AD-FIX-15: Database activity panel (pg_stat views)
//
// Deploy: supabase functions deploy admin-analytics --no-verify-jwt
// Auth: Requires admin role (checked server-side)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { requireAdmin, authErrorResponse } from "../_shared/admin-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const POSTHOG_PERSONAL_API_KEY = Deno.env.get("POSTHOG_PERSONAL_API_KEY") || "";
const POSTHOG_PROJECT_ID = Deno.env.get("POSTHOG_PROJECT_ID") || "318006";
const POSTHOG_HOST = "https://us.posthog.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 500) {
  return jsonResponse({ error: message }, status);
}

// ─── Auth: verified via shared admin-auth middleware (G11) ───

// ═══════════════════════════════════════════════════════════
// AD-FIX-13: PostHog Error Events with Session Replay Links
// ═══════════════════════════════════════════════════════════

async function getPosthogErrors(hours = 24, limit = 50) {
  if (!POSTHOG_PERSONAL_API_KEY) {
    return { errors: [], message: "PostHog API key not configured" };
  }

  const after = new Date(Date.now() - hours * 3600000).toISOString();

  // Query PostHog Events API for query_error events
  const url = new URL(
    `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/events`
  );
  url.searchParams.set("event", "query_error");
  url.searchParams.set("after", after);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("orderBy", "-timestamp");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${POSTHOG_PERSONAL_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[admin-analytics] PostHog API error:", res.status, text);
    return { errors: [], message: `PostHog API error: ${res.status}` };
  }

  const data = await res.json();
  const events = (data.results || []).map((evt: any) => ({
    id: evt.id,
    timestamp: evt.timestamp,
    label: evt.properties?.label || "unknown",
    error_message: evt.properties?.error_message || "",
    error_stack: evt.properties?.error_stack || "",
    page: evt.properties?.page || evt.properties?.$current_url || "",
    distinct_id: evt.distinct_id,
    session_id: evt.properties?.$session_id || null,
    replay_url: evt.properties?.$session_id
      ? `${POSTHOG_HOST}/project/${POSTHOG_PROJECT_ID}/replay/${evt.properties.$session_id}`
      : null,
  }));

  return { errors: events, count: events.length, hours };
}

// Also query $exception events for autocaptured JS errors
async function getPosthogExceptions(hours = 24, limit = 50) {
  if (!POSTHOG_PERSONAL_API_KEY) {
    return { exceptions: [], message: "PostHog API key not configured" };
  }

  const after = new Date(Date.now() - hours * 3600000).toISOString();

  const url = new URL(
    `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/events`
  );
  url.searchParams.set("event", "$exception");
  url.searchParams.set("after", after);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("orderBy", "-timestamp");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${POSTHOG_PERSONAL_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    return { exceptions: [], message: `PostHog API error: ${res.status}` };
  }

  const data = await res.json();
  const events = (data.results || []).map((evt: any) => ({
    id: evt.id,
    timestamp: evt.timestamp,
    type: evt.properties?.$exception_type || "Error",
    message:
      evt.properties?.$exception_message ||
      evt.properties?.error_message ||
      "",
    source: evt.properties?.$exception_source || "",
    page: evt.properties?.$current_url || "",
    distinct_id: evt.distinct_id,
    session_id: evt.properties?.$session_id || null,
    replay_url: evt.properties?.$session_id
      ? `${POSTHOG_HOST}/project/${POSTHOG_PROJECT_ID}/replay/${evt.properties.$session_id}`
      : null,
  }));

  return { exceptions: events, count: events.length, hours };
}

// ═══════════════════════════════════════════════════════════
// AD-FIX-14: Edge Function Health Metrics
// ═══════════════════════════════════════════════════════════

// List of all deployed Edge Functions
const EDGE_FUNCTIONS = [
  "health-check",
  "refresh-jobs",
  "refresh-orchestrator",
  "refresh-usajobs",
  "preview-jobs",
  "extension-heartbeat",
  "send-notification",
  "daily-digest",
  "weekly-summary",
  "monthly-report",
  "enrich-job",
  "enrich-jd-ai",
  "score-resume",
  "generate-cover-letter",
  "rewrite-resume",
  "rewrite-resume-analyze",
  "rewrite-resume-execute",
  "admin-analytics",
  "stripe-webhook",
  "create-checkout",
  "manage-subscription",
  "validate-signup",
  "confirm-email",
  "referral-lifecycle",
  "check-referral-activation",
  "process-referral-reward",
  "submit-application",
  "apply-on-notification",
  "auto-apply-trigger",
  "pipeline-write",
  "data-export",
  "account-delete",
  "account-lifecycle",
  "seo-sync",
];

async function getEfHealth() {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Query health_check_log for recent check results
  const { data: recentChecks, error: checkErr } = await sb
    .from("health_check_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (checkErr) {
    console.error("[admin-analytics] health_check_log error:", checkErr);
  }

  // Compute per-check-type stats from recent health checks
  const checkStats: Record<
    string,
    { total: number; passed: number; avgLatency: number; latencies: number[] }
  > = {};

  for (const row of recentChecks || []) {
    const checks = row.checks || {};
    for (const [name, detail] of Object.entries(checks) as [string, any][]) {
      if (!checkStats[name]) {
        checkStats[name] = { total: 0, passed: 0, avgLatency: 0, latencies: [] };
      }
      checkStats[name].total++;
      if (detail.status === "pass") checkStats[name].passed++;
      if (typeof detail.latencyMs === "number") {
        checkStats[name].latencies.push(detail.latencyMs);
      }
    }
  }

  // Compute percentiles
  function percentile(arr: number[], p: number): number {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  const efMetrics = Object.entries(checkStats).map(([name, stats]) => ({
    name,
    invocations: stats.total,
    passed: stats.passed,
    failed: stats.total - stats.passed,
    success_rate:
      stats.total > 0
        ? Math.round((stats.passed / stats.total) * 100 * 10) / 10
        : 0,
    latency_p50: percentile(stats.latencies, 50),
    latency_p95: percentile(stats.latencies, 95),
    latency_p99: percentile(stats.latencies, 99),
    latency_avg:
      stats.latencies.length > 0
        ? Math.round(
            stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length
          )
        : 0,
  }));

  // Overall stats
  const totalChecks = recentChecks?.length || 0;
  const healthyChecks =
    recentChecks?.filter((r: any) => r.overall === "healthy").length || 0;
  const degradedChecks =
    recentChecks?.filter((r: any) => r.overall === "degraded").length || 0;
  const unhealthyChecks =
    recentChecks?.filter((r: any) => r.overall === "unhealthy").length || 0;

  return {
    functions: EDGE_FUNCTIONS,
    function_count: EDGE_FUNCTIONS.length,
    health_checks: {
      total: totalChecks,
      healthy: healthyChecks,
      degraded: degradedChecks,
      unhealthy: unhealthyChecks,
    },
    check_metrics: efMetrics,
    last_check: recentChecks?.[0] || null,
  };
}

// ═══════════════════════════════════════════════════════════
// AD-FIX-15: Database Activity Panel
// ═══════════════════════════════════════════════════════════

async function getDbActivity() {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Active connections via pg_stat_activity
  const { data: connData, error: connErr } = await sb.rpc(
    "admin_db_connections"
  );

  // 2. Table sizes
  const { data: tableData, error: tableErr } = await sb.rpc(
    "admin_db_table_sizes"
  );

  // 3. Slow queries (if pg_stat_statements is available)
  const { data: queryData, error: queryErr } = await sb.rpc(
    "admin_db_slow_queries"
  );

  // 4. Database size
  const { data: sizeData, error: sizeErr } = await sb.rpc("admin_db_size");

  return {
    connections: connData || [],
    connections_error: connErr?.message || null,
    tables: tableData || [],
    tables_error: tableErr?.message || null,
    slow_queries: queryData || [],
    slow_queries_error: queryErr?.message || null,
    db_size: sizeData?.[0] || null,
    db_size_error: sizeErr?.message || null,
  };
}

// ═══════════════════════════════════════════════════════════
// Router
// ═══════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // G11: Auth via shared admin-auth middleware
  try {
    await requireAdmin(req);
  } catch (err) {
    return authErrorResponse(err, corsHeaders);
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "";

    switch (action) {
      case "posthog-errors": {
        const hours = parseInt(url.searchParams.get("hours") || "24", 10);
        const limit = parseInt(url.searchParams.get("limit") || "50", 10);
        const [errors, exceptions] = await Promise.all([
          getPosthogErrors(hours, limit),
          getPosthogExceptions(hours, limit),
        ]);
        return jsonResponse({ ...errors, exceptions: exceptions.exceptions });
      }

      case "ef-health": {
        const data = await getEfHealth();
        return jsonResponse(data);
      }

      case "db-activity": {
        const data = await getDbActivity();
        return jsonResponse(data);
      }

      default:
        return errorResponse(
          "Unknown action. Use: posthog-errors, ef-health, db-activity",
          400
        );
    }
  } catch (e) {
    console.error("[admin-analytics] Error:", e);
    return errorResponse(
      e instanceof Error ? e.message : "Internal server error"
    );
  }
});
