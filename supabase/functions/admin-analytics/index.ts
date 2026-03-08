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
  const events = (data.results || []).map((evt: Record<string, unknown>) => ({
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
  const events = (data.results || []).map((evt: Record<string, unknown>) => ({
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
    recentChecks?.filter((r: Record<string, unknown>) => r.overall === "healthy").length || 0;
  const degradedChecks =
    recentChecks?.filter((r: Record<string, unknown>) => r.overall === "degraded").length || 0;
  const unhealthyChecks =
    recentChecks?.filter((r: Record<string, unknown>) => r.overall === "unhealthy").length || 0;

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
// POST-REM: Chat Analytics — PostHog event aggregation
// ═══════════════════════════════════════════════════════════

const CHAT_EVENTS = [
  'chat_mode_toggled', 'chat_message_sent', 'chat_filters_extracted',
  'chat_filters_applied', 'chat_to_filter_sync', 'chat_prompt_auto_generated',
  'chat_prompt_modified', 'chat_prompt_saved', 'chat_prompt_loaded',
  'chat_prompt_deleted', 'chat_prompt_resume_assigned', 'chat_edge_function_latency',
  'chat_rate_limited', 'chat_onboarding_tooltip_shown',
  'chat_onboarding_tooltip_dismissed', 'chat_prompt_scrapped'
];

async function getChatAnalytics() {
  if (!POSTHOG_PERSONAL_API_KEY) {
    return { error: 'PostHog API key not configured' };
  }

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 3600000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600000).toISOString();

  // Fetch events from PostHog for all 16 chat events (last 7d)
  const eventVolumes: Record<string, { day: number; week: number; trend: string }> = {};
  const allEvents: Array<{ event: string; timestamp: string; properties: Record<string, unknown> }> = [];

  // Batch query — PostHog Events API with each event type
  for (const evt of CHAT_EVENTS) {
    try {
      const url = new URL(`${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/events`);
      url.searchParams.set('event', evt);
      url.searchParams.set('after', sevenDaysAgo);
      url.searchParams.set('limit', '500');
      url.searchParams.set('orderBy', '-timestamp');

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${POSTHOG_PERSONAL_API_KEY}` }
      });

      if (res.ok) {
        const data = await res.json();
        const results = data.results || [];
        const dayCount = results.filter((r: { timestamp: string }) => r.timestamp >= oneDayAgo).length;
        const weekCount = results.length;
        // Simple trend: compare first half to second half of week
        const midpoint = new Date(now.getTime() - 3.5 * 24 * 3600000).toISOString();
        const firstHalf = results.filter((r: { timestamp: string }) => r.timestamp < midpoint).length;
        const secondHalf = results.filter((r: { timestamp: string }) => r.timestamp >= midpoint).length;
        const trend = secondHalf > firstHalf * 1.2 ? 'up' : secondHalf < firstHalf * 0.8 ? 'down' : 'flat';

        eventVolumes[evt] = { day: dayCount, week: weekCount, trend };
        results.forEach((r: { event: string; timestamp: string; properties: Record<string, unknown> }) => allEvents.push(r));
      } else {
        eventVolumes[evt] = { day: 0, week: 0, trend: 'flat' };
      }
    } catch {
      eventVolumes[evt] = { day: 0, week: 0, trend: 'flat' };
    }
  }

  // ─── Summary cards (24h counts) ───
  const toggles_24h = eventVolumes['chat_mode_toggled']?.day || 0;
  const messages_24h = eventVolumes['chat_message_sent']?.day || 0;
  const filters_applied_24h = eventVolumes['chat_filters_applied']?.day || 0;
  const rate_limited_24h = eventVolumes['chat_rate_limited']?.day || 0;
  const prompts_saved_24h = eventVolumes['chat_prompt_saved']?.day || 0;
  const tooltip_shown_24h = eventVolumes['chat_onboarding_tooltip_shown']?.day || 0;

  // ─── Funnel: toggle → message → filters (7d) ───
  const funnel_toggle = eventVolumes['chat_mode_toggled']?.week || 0;
  const funnel_message = eventVolumes['chat_message_sent']?.week || 0;
  const funnel_filters = eventVolumes['chat_filters_applied']?.week || 0;

  // ─── Saved prompt adoption (7d) ───
  const prompt_saved_total = eventVolumes['chat_prompt_saved']?.week || 0;
  const prompt_loaded_total = eventVolumes['chat_prompt_loaded']?.week || 0;
  const prompt_resume_assigned_total = eventVolumes['chat_prompt_resume_assigned']?.week || 0;

  // ─── Tooltip conversion ───
  const tooltip_shown_total = eventVolumes['chat_onboarding_tooltip_shown']?.week || 0;
  const tooltipDismissed = allEvents.filter(e => e.event === 'chat_onboarding_tooltip_dismissed');
  const tooltip_dismissed_button = tooltipDismissed.filter(e => e.properties?.method === 'button').length;
  const tooltip_dismissed_toggle = tooltipDismissed.filter(e => e.properties?.method !== 'button').length;

  // ─── Rate limits by tier ───
  const rateLimitEvents = allEvents.filter(e => e.event === 'chat_rate_limited');
  const rate_limits_by_tier: Record<string, { count: number; primary_type: string }> = {};
  for (const tier of ['free', 'starter', 'pro', 'admin']) {
    const tierEvents = rateLimitEvents.filter(e => e.properties?.tier === tier);
    const types = tierEvents.map(e => String(e.properties?.limit_type || 'daily'));
    const typeCount: Record<string, number> = {};
    types.forEach(t => { typeCount[t] = (typeCount[t] || 0) + 1; });
    const primaryType = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'daily';
    rate_limits_by_tier[tier] = { count: tierEvents.length, primary_type: primaryType };
  }

  // ─── Latency percentiles ───
  const latencyEvents = allEvents
    .filter(e => e.event === 'chat_edge_function_latency' && typeof e.properties?.latency_ms === 'number')
    .map(e => e.properties.latency_ms as number)
    .sort((a, b) => a - b);

  const latency = {
    p50: latencyEvents.length > 0 ? latencyEvents[Math.floor(latencyEvents.length * 0.5)] : null,
    p95: latencyEvents.length > 0 ? latencyEvents[Math.floor(latencyEvents.length * 0.95)] : null,
    p99: latencyEvents.length > 0 ? latencyEvents[Math.floor(latencyEvents.length * 0.99)] : null,
    total_samples: latencyEvents.length
  };

  // ─── Latency trend (daily buckets) ───
  const latencyTrend: Array<{ ts: string; p50: number; p95: number; p99: number }> = [];
  const latencyByDay: Record<string, number[]> = {};
  allEvents
    .filter(e => e.event === 'chat_edge_function_latency' && typeof e.properties?.latency_ms === 'number')
    .forEach(e => {
      const day = e.timestamp.slice(0, 10);
      if (!latencyByDay[day]) latencyByDay[day] = [];
      latencyByDay[day].push(e.properties.latency_ms as number);
    });
  Object.keys(latencyByDay).sort().forEach(day => {
    const vals = latencyByDay[day].sort((a, b) => a - b);
    latencyTrend.push({
      ts: day,
      p50: vals[Math.floor(vals.length * 0.5)] || 0,
      p95: vals[Math.floor(vals.length * 0.95)] || 0,
      p99: vals[Math.floor(vals.length * 0.99)] || 0
    });
  });

  // ─── Cache stats (from chat_edge_function_latency properties if available) ───
  const cacheEvents = allEvents.filter(
    e => e.event === 'chat_edge_function_latency' && e.timestamp >= oneDayAgo
  );
  const cacheHits = cacheEvents.filter(e => e.properties?.cache_hit === true).length;
  const cacheMisses = cacheEvents.filter(e => e.properties?.cache_hit !== true).length;
  const cacheHitRate = cacheEvents.length > 0 ? ((cacheHits / cacheEvents.length) * 100).toFixed(1) : '0.0';
  // Estimated savings: ~$0.0005 per Haiku call avoided
  const estimatedSavings = (cacheHits * 0.0005).toFixed(2);

  return {
    toggles_24h, messages_24h, filters_applied_24h, rate_limited_24h,
    prompts_saved_24h, tooltip_shown_24h,
    funnel_toggle, funnel_message, funnel_filters,
    prompt_saved_total, prompt_loaded_total, prompt_resume_assigned_total,
    tooltip_shown_total, tooltip_dismissed_button, tooltip_dismissed_toggle,
    rate_limits_by_tier, latency, latency_trend: latencyTrend,
    event_volumes: eventVolumes,
    cache: { hit_rate: cacheHitRate, hits: cacheHits, misses: cacheMisses, estimated_savings: estimatedSavings }
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

      case "get_posthog_key": {
        // AD-DO-002: Provide PostHog Personal API key to admin frontend
        if (!POSTHOG_PERSONAL_API_KEY) {
          return jsonResponse({ key: null, error: "PostHog API key not configured" });
        }
        return jsonResponse({ key: POSTHOG_PERSONAL_API_KEY });
      }

      case "chat_analytics": {
        // POST-REM: Chat mode PostHog dashboard data
        const data = await getChatAnalytics();
        return jsonResponse(data);
      }

      default:
        return errorResponse(
          "Unknown action. Use: posthog-errors, ef-health, db-activity, get_posthog_key, chat_analytics",
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
