/**
 * SA-018: Replica Health Monitoring Edge Function
 *
 * Endpoints:
 *   GET  /replica-health          → Current health summary (JSON)
 *   GET  /replica-health/config   → Routing configuration (admin only)
 *   POST /replica-health/reset    → Reset replica health cache (admin only)
 *
 * Returns:
 *   - Current replication lag (ms)
 *   - Replica state (streaming, catchup, disconnected)
 *   - 1-hour aggregates (avg/max/min lag, alert count)
 *   - Routing distribution (reads via replica vs primary vs fallback)
 *
 * Auth: GET health is public (for uptime monitoring).
 *       Config and reset require admin role.
 *
 * ADR-06: docs/scaling/adr-06-pipeline.md (read replica addendum)
 * Phase: S4 — Scale Validation
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { API_VERSION } from "../_shared/api-version.ts";
import {
  isReplicaAvailable,
  getRoutingConfig,
  resetReplicaHealth,
} from "../_shared/db-client.ts";
import { getReadOnlyRoutes } from "../_shared/read-replica-middleware.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://brilliantjobs.app",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-correlation-id",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const subPath = url.pathname.split("/").pop();
  const correlationId = req.headers.get("x-correlation-id") ?? crypto.randomUUID();

  try {
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── GET /replica-health — Public health summary ──
    if (req.method === "GET" && (!subPath || subPath === "replica-health")) {
      const { data, error } = await adminClient.rpc("fn_replica_health_summary");

      if (error) {
        return jsonResponse(
          {
            status: "error",
            error: "Failed to query replica health",
            detail: error.message,
          },
          500,
          correlationId,
        );
      }

      // Enrich with client-side replica availability check
      const replicaUp = await isReplicaAvailable();

      return jsonResponse(
        {
          status: data?.current?.is_healthy ? "healthy" : "degraded",
          replica_available: replicaUp,
          ...data,
          read_only_routes: getReadOnlyRoutes().length,
          checked_at: new Date().toISOString(),
        },
        200,
        correlationId,
      );
    }

    // ── GET /replica-health/config — Admin only ──
    if (req.method === "GET" && subPath === "config") {
      const userRole = req.headers.get("x-gateway-user-role");
      if (userRole !== "admin") {
        return jsonResponse({ error: "Admin access required" }, 403, correlationId);
      }

      const config = getRoutingConfig();
      const routes = getReadOnlyRoutes();

      return jsonResponse(
        {
          routing_config: config,
          read_only_routes: routes,
          total_routes: routes.length,
        },
        200,
        correlationId,
      );
    }

    // ── POST /replica-health/reset — Admin only ──
    if (req.method === "POST" && subPath === "reset") {
      const userRole = req.headers.get("x-gateway-user-role");
      if (userRole !== "admin") {
        return jsonResponse({ error: "Admin access required" }, 403, correlationId);
      }

      resetReplicaHealth();
      const replicaUp = await isReplicaAvailable();

      return jsonResponse(
        {
          message: "Replica health cache reset",
          replica_available: replicaUp,
          reset_at: new Date().toISOString(),
        },
        200,
        correlationId,
      );
    }

    return jsonResponse({ error: "Not found" }, 404, correlationId);
  } catch (err) {
    return jsonResponse(
      { error: "Internal error", detail: String(err) },
      500,
      correlationId,
    );
  }
});

function jsonResponse(body: unknown, status: number, correlationId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "x-correlation-id": correlationId,
      "x-api-version": API_VERSION,
      ...CORS_HEADERS,
    },
  });
}
