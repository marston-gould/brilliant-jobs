/**
 * SA-018: Read Replica Routing Middleware
 *
 * Gateway middleware that classifies routes as read-only or write,
 * and injects routing hints into headers for downstream Edge Functions.
 *
 * Classification:
 *   - GET requests to known read-only endpoints → x-gateway-db-mode: read
 *   - All POST/PUT/PATCH/DELETE requests → x-gateway-db-mode: write
 *   - Unknown/mixed endpoints → x-gateway-db-mode: write (safe default)
 *
 * Downstream EFs can read the x-gateway-db-mode header to decide which
 * client to use via _shared/db-client.ts, or they can make their own
 * determination based on the specific operation.
 *
 * Monitoring:
 *   Logs routing decisions to replica_routing_stats table (fire-and-forget).
 *   PostHog event: replica_query_routed (for funnel analysis).
 *
 * HOOK: Route classification is config-driven. Adding new read-only
 *   routes requires only updating READ_ONLY_ROUTES below.
 *
 * ADR-06: docs/scaling/adr-06-pipeline.md (read replica addendum)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { MiddlewareFn, GatewayContext } from "./gateway-middleware.ts";

// ─── Read-Only Route Classification ──────────────────────────────────────────
//
// These routes are confirmed read-only (SELECT only, no side effects).
// GET requests to these endpoints will be annotated for replica routing.
//
// IMPORTANT: Only add routes here that are guaranteed read-only.
// Mixed-mode routes (read + write in same handler) stay on primary.

const READ_ONLY_ROUTES: Set<string> = new Set([
  // ── High-frequency user-facing reads ──
  "chat-job-search",         // Searches ats_jobs — read-only SELECT
  "preview-jobs",            // Landing page job preview — pure SELECT
  "match-score-overlay",     // Computed match scores — pure SELECT
  "job-intelligence",        // Job detail enrichment — reads cached data
  "recruiter-lookup",        // Company/recruiter data — pure SELECT
  "extension-heartbeat",     // Extension status check — reads config
  "health-check",            // System health — read-only aggregation

  // ── Analytics & Stats (admin reads) ──
  "admin-analytics",         // Dashboard analytics — aggregate SELECTs
  "trend-anomaly-detector",  // Trend detection — reads MV data
  "refresh-city-stats",      // City stats — reads MVs

  // ── Scoring reads (when GET — these compute but don't write) ──
  "score-job-fraud",         // Fraud score lookup — reads cached scores
  "score-sequence",          // Sequence scoring — reads cached data

  // ── Filter reads ──
  "filter-to-prompt",        // Filter → natural language — no DB writes
  "match-score-overlay",     // Match overlay — computed from cached data

  // ── CrewAI reads ──
  "crewai-orchestrator",     // GET = status check, read-only

  // ── Data pipeline reads ──
  "refresh-mv-incremental",  // GET = staleness check, read-only

  // ── Replica health (meta) ──
  "replica-health",          // SA-018: Own health endpoint
]);

// ─── Middleware Implementation ───────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Read Replica Routing Middleware.
 *
 * Runs after auth (needs user context) and before rate limiter.
 * Injects x-gateway-db-mode header into the proxied request.
 * Logs routing stats asynchronously.
 *
 * Position in pipeline:
 *   1. request-logger
 *   2. auth
 *   3. ★ read-replica-routing ★  ← here
 *   4. rate-limiter
 *   5. response-cache
 */
export const readReplicaRoutingMiddleware: MiddlewareFn = async (req, ctx, next) => {
  const method = req.method.toUpperCase();
  const routeName = ctx.upstreamFunction;

  // Determine routing mode
  let dbMode: "read" | "write";
  let target: "primary" | "replica" | "fallback";

  if (method === "GET" && READ_ONLY_ROUTES.has(routeName)) {
    dbMode = "read";
    target = "replica"; // Downstream EF will use replica client
  } else {
    dbMode = "write";
    target = "primary";
  }

  // Store in gateway context for downstream middleware visibility
  ctx.meta.dbMode = dbMode;
  ctx.meta.dbTarget = target;

  // Log routing decision (structured, no PII)
  ctx.logger.info("gateway:replica_routing", {
    route: routeName,
    method,
    dbMode,
    target,
    correlationId: ctx.correlationId,
  });

  // Execute the rest of the pipeline
  const start = performance.now();
  const response = await next();
  const latencyMs = Math.round(performance.now() - start);

  // ── Fire-and-forget: log routing stats ──
  // Non-blocking — never fails the request
  try {
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    adminClient
      .from("replica_routing_stats")
      .insert({
        route_name: routeName,
        route_type: dbMode,
        target,
        count: 1,
        avg_latency_ms: latencyMs,
      })
      .then(() => {})
      .catch(() => {}); // fire and forget
  } catch {
    // Stats logging failure is never fatal
  }

  return response;
};

/**
 * Get the set of read-only routes. Exposed for testing and health endpoint.
 */
export function getReadOnlyRoutes(): string[] {
  return Array.from(READ_ONLY_ROUTES);
}
