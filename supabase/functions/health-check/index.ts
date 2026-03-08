// health-check Edge Function
// A7: Health check endpoint for monitoring
// Phase A Sprint 4 - Architecture Hardening
// Date: 2026-02-19
//
// Returns structured JSON with system health status.
// Deploy: supabase functions deploy health-check --no-verify-jwt

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createLogger } from "../_shared/logger.ts";
import { API_VERSION } from '../_shared/api-version.ts';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HealthCheck {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  checks: Record<string, {
    status: "pass" | "fail";
    latencyMs: number;
    message?: string;
  }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createLogger("health-check");
  const health: HealthCheck = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "2.79",
    checks: {},
  };

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Check 1: Database connectivity
  try {
    const start = performance.now();
    const { count, error } = await sb
      .from("profiles")
      .select("*", { count: "exact", head: true });
    const ms = Math.round(performance.now() - start);
    
    if (error) throw error;
    health.checks.database = { status: "pass", latencyMs: ms, message: `${count} profiles` };
  } catch (e) {
    health.checks.database = {
      status: "fail",
      latencyMs: 0,
      message: e instanceof Error ? e.message : String(e),
    };
    health.status = "unhealthy";
  }

  // Check 2: Job refresh pipeline health
  // Primary: check max(last_seen) on ats_jobs — proves data is being updated
  // Fallback: check refresh_log table
  try {
    const start = performance.now();
    const { data: freshest, error: freshErr } = await sb
      .from("ats_jobs")
      .select("last_seen")
      .order("last_seen", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ms = Math.round(performance.now() - start);

    if (freshErr) throw freshErr;
    if (freshest) {
      const lastSeen = new Date(freshest.last_seen);
      const minutesAgo = Math.round((Date.now() - lastSeen.getTime()) / 60000);
      const stale = minutesAgo > 30; // Alert if no data update in 30 min
      health.checks.job_refresh = {
        status: stale ? "fail" : "pass",
        latencyMs: ms,
        message: `Last data update ${minutesAgo}min ago`,
      };
      if (stale) health.status = "degraded";
    } else {
      health.checks.job_refresh = { status: "fail", latencyMs: ms, message: "No jobs in database" };
      health.status = "degraded";
    }
  } catch (e) {
    health.checks.job_refresh = {
      status: "fail",
      latencyMs: 0,
      message: e instanceof Error ? e.message : String(e),
    };
    health.status = "degraded";
  }

  // Check 3: Job data freshness
  try {
    const start = performance.now();
    const { count, error } = await sb
      .from("ats_jobs")
      .select("*", { count: "exact", head: true })
      .eq("status", "open");
    const ms = Math.round(performance.now() - start);

    if (error) throw error;
    health.checks.job_data = {
      status: (count || 0) > 1000 ? "pass" : "fail",
      latencyMs: ms,
      message: `${(count || 0).toLocaleString()} live jobs`,
    };
  } catch (e) {
    health.checks.job_data = {
      status: "fail",
      latencyMs: 0,
      message: e instanceof Error ? e.message : String(e),
    };
  }

  // Check 4: Notification pipeline
  try {
    const start = performance.now();
    const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
    const { data, error } = await sb
      .from("notification_log")
      .select("status", { count: "exact" })
      .gte("created_at", oneDayAgo);
    const ms = Math.round(performance.now() - start);

    if (error) throw error;
    const total = data?.length || 0;
    const failed = data?.filter((n: Record<string, unknown>) => n.status === "failed").length || 0;
    health.checks.notifications = {
      status: failed > total * 0.2 ? "fail" : "pass",
      latencyMs: ms,
      message: `${total} sent last 24h, ${failed} failed`,
    };
    if (failed > total * 0.2) health.status = "degraded";
  } catch (e) {
    health.checks.notifications = {
      status: "fail",
      latencyMs: 0,
      message: e instanceof Error ? e.message : String(e),
    };
  }

  logger.info("Health check completed", { 
    status: health.status, 
    checks: Object.fromEntries(
      Object.entries(health.checks).map(([k, v]) => [k, v.status])
    ),
  });

  // AD-DO-004: Record availability data for uptime monitoring
  try {
    const body = req.method === "POST" ? await req.clone().json().catch(() => ({})) : {};
    // Always record to health_check_log (existing behavior)
    await sb.from("health_check_log").insert({
      overall: health.status,
      checks: health.checks,
      created_at: health.timestamp,
    });

    // Record per-surface availability (new for AD-DO-004)
    const surfaces = [
      { name: "database", status: health.checks.database?.status === "pass" ? "up" : "down", latency: health.checks.database?.latencyMs },
      { name: "edge_functions", status: health.checks.edge_functions?.status === "pass" ? "up" : "down", latency: health.checks.edge_functions?.latencyMs },
      { name: "notifications", status: health.checks.notifications?.status === "pass" ? "up" : "down", latency: health.checks.notifications?.latencyMs },
    ];

    const availRows = surfaces.map(s => ({
      surface: s.name,
      status: s.status,
      latency_ms: s.latency || null,
      checked_at: health.timestamp,
    }));

    await sb.from("availability_checks").insert(availRows);
  } catch (e) {
    logger.warn("Failed to record availability", { error: (e as Error).message });
  }

  const statusCode = health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;

  return new Response(JSON.stringify(health, null, 2), {
    status: statusCode,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "x-api-version": API_VERSION,
    },
  });
});
