/**
 * SA-004: API Gateway Edge Function
 * Single entry point for all /api/v1/* requests.
 *
 * Architecture:
 *   Client → Cloudflare → Vercel → [api-gateway EF]
 *              ↓ middleware pipeline
 *           [downstream EF]
 *
 * Plugin middleware pipeline (ordered, extensible via config):
 *   1. request-logger  — structured logging, correlation ID
 *   2. auth            — JWT verification + role extraction
 *   3. rate-limiter    — sliding-window per tier
 *   4. response-cache  — Cache-Control headers for Cloudflare
 *
 * Route registry:
 *   Config-driven map of URL patterns → downstream EF names.
 *   Adding a new route is a config change, not a code change.
 *
 * ADR: docs/scaling/adr-03-gateway.md
 * Phase: S1 — Foundation
 * Pair: Backend + Security + Lead Platform Engineer
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  GatewayContext,
  createMiddlewarePipeline,
  requestLoggerMiddleware,
  authMiddleware,
  rateLimiterMiddleware,
  responseCacheMiddleware,
} from "../_shared/gateway-middleware.ts";
import { API_VERSION } from "../_shared/api-version.ts";

// ─── Route Registry ───────────────────────────────────────────────────────────
//
// Config-driven. Adding a new route does not require editing gateway logic.
// Format: URL path segment → downstream Edge Function name.
//
// Phase SA-004: First 10 highest-traffic endpoints.
// Phase SA-005: All remaining 78 EFs added here.
//
// HOOK: This registry is the primary extension point for adding new endpoints.
// Future: load from Supabase config table for runtime updates without redeploy.

const ROUTE_REGISTRY: Record<string, string> = {
  // ── Job Search & Chat (highest traffic) ──
  "chat-job-search":       "chat-job-search",

  // ── Pipeline & Resume Processing ──
  "score-resume":          "score-resume",
  "score-job-fraud":       "score-job-fraud",
  "enrich-jd-ai":          "enrich-jd-ai",

  // ── User Auth & Lifecycle ──
  "validate-signup":       "validate-signup",
  "account-lifecycle":     "account-lifecycle",

  // ── Notifications & Communications ──
  "send-notification":     "send-notification",
  "daily-digest":          "daily-digest",

  // ── Application Flow ──
  "submit-application":    "submit-application",

  // ── Billing ──
  "billing-notifications": "billing-notifications",

  // ── More routes added in SA-005 ──
};

// ─── Middleware Pipeline ──────────────────────────────────────────────────────
//
// Built-in middleware executes in this order for every request:
//   request-logger → auth → rate-limiter → response-cache → proxy
//
// HOOK: Insert future middleware between any step without editing gateway core.
// Example additions: analytics, A/B routing, webhook dispatch, transformation.

const pipeline = createMiddlewarePipeline([
  requestLoggerMiddleware,
  authMiddleware,
  rateLimiterMiddleware,
  responseCacheMiddleware,
  // ← future middleware registered here
]);

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const EF_BASE_URL = `${SUPABASE_URL}/functions/v1`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://brilliantjobs.app",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-correlation-id",
  "Access-Control-Expose-Headers": "x-correlation-id, x-api-version, x-ratelimit-limit",
};

// ─── Main Handler ─────────────────────────────────────────────────────────────

serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const correlationId = req.headers.get("x-correlation-id") ?? crypto.randomUUID();
  const logger = createLogger("api-gateway", correlationId);

  // Route resolution: /api/v1/{function-name}/... → function-name
  const pathParts = url.pathname.replace(/^\/api\/v1\//, "").split("/");
  const routeKey = pathParts[0];
  const upstreamFunction = ROUTE_REGISTRY[routeKey];

  if (!upstreamFunction) {
    return jsonResponse(
      { error: `Unknown gateway route: /api/v1/${routeKey}`, code: "ROUTE_NOT_FOUND" },
      404,
      correlationId,
    );
  }

  // Build initial context
  const ctx: GatewayContext = {
    correlationId,
    userId: null,
    userRole: null,
    rateLimitTier: "anonymous",
    upstreamFunction,
    logger,
    meta: {},
  };

  // Run middleware pipeline → proxy to upstream EF
  const response = await pipeline(req, ctx, () => proxyToUpstream(req, ctx, url, pathParts));

  // Attach gateway headers to all responses
  const headers = new Headers(response.headers);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
  headers.set("x-correlation-id", correlationId);
  headers.set("x-api-version", API_VERSION);
  headers.set("x-gateway", "bj-api-gateway-v0.1.0");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});

// ─── Upstream Proxy ───────────────────────────────────────────────────────────

/**
 * Forward the request to the downstream Edge Function and return its response.
 * Preserves method, headers (minus hop-by-hop), and body.
 */
async function proxyToUpstream(
  req: Request,
  ctx: GatewayContext,
  originalUrl: URL,
  pathParts: string[],
): Promise<Response> {
  // Build upstream URL: preserve sub-path after function name + query string
  const subPath = pathParts.slice(1).join("/");
  const upstreamUrl = new URL(
    `${EF_BASE_URL}/${ctx.upstreamFunction}${subPath ? "/" + subPath : ""}`,
  );
  upstreamUrl.search = originalUrl.search;

  // Forward headers, injecting gateway-enriched context
  const upstreamHeaders = new Headers(req.headers);
  upstreamHeaders.set("apikey", SUPABASE_ANON_KEY);
  upstreamHeaders.set("x-correlation-id", ctx.correlationId);
  upstreamHeaders.set("x-gateway-user-id", ctx.userId ?? "");
  upstreamHeaders.set("x-gateway-user-role", ctx.userRole ?? "");
  upstreamHeaders.set("x-gateway-tier", ctx.rateLimitTier);
  // Remove hop-by-hop headers that shouldn't be forwarded
  upstreamHeaders.delete("host");
  upstreamHeaders.delete("connection");

  try {
    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      method: req.method,
      headers: upstreamHeaders,
      body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    });

    return upstreamResponse;
  } catch (err) {
    ctx.logger.error("gateway:proxy:error", {
      upstream: ctx.upstreamFunction,
      error: String(err),
      correlationId: ctx.correlationId,
    });
    return jsonResponse(
      { error: "Upstream function unavailable", upstream: ctx.upstreamFunction },
      502,
      ctx.correlationId,
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
