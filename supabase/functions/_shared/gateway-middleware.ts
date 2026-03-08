/**
 * SA-004 + SA-005: API Gateway — Middleware Plugin Architecture
 *
 * This module defines the middleware interface contract and the four
 * built-in middleware plugins that ship with the gateway:
 *
 *   1. request-logger — sanitized structured logging (no PII)
 *   2. auth           — JWT verification + API key consumer identification
 *   3. rate-limiter   — sliding-window per tier using Supabase rate_limits table
 *   4. response-cache — Cache-Control headers for CDN edge caching
 *
 * SA-005 additions:
 *   - API consumer key validation in auth middleware (api_consumers table)
 *   - Consumer identification via X-API-Key header
 *   - Consumer rate limit overrides
 *
 * EXTENSION POINT (Hook):
 *   Future middleware — analytics, A/B routing, webhook dispatch,
 *   transformation, feature flags — slots into the registry without
 *   touching the gateway core. Register with `createMiddlewarePipeline`.
 *
 * ADR-03: docs/scaling/adr-03-gateway.md
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createLogger } from "./logger.ts";

// ─── Middleware Interface Contract ────────────────────────────────────────────

/** Context passed through the middleware pipeline. Middleware may read and
 *  write fields — downstream middleware and the handler see all mutations. */
export interface GatewayContext {
  /** Correlation ID for distributed tracing. Set by request-logger middleware. */
  correlationId: string;
  /** Authenticated user ID (null for anonymous requests). Set by auth middleware. */
  userId: string | null;
  /** User role from profiles table. Set by auth middleware. */
  userRole: string | null;
  /** Rate limit tier derived from user role. Set by auth middleware. */
  rateLimitTier: RateLimitTier;
  /** Downstream Edge Function name to proxy to. Set by gateway router. */
  upstreamFunction: string;
  /** Gateway-level logger instance. */
  logger: ReturnType<typeof createLogger>;
  /** Arbitrary key/value bag for middleware-to-middleware communication. */
  meta: Record<string, unknown>;
}

/** A middleware plugin. Must call `next()` to continue the pipeline or
 *  return a Response directly to short-circuit (e.g. 401, 429). */
export type MiddlewareFn = (
  req: Request,
  ctx: GatewayContext,
  next: () => Promise<Response>,
) => Promise<Response>;

/** Rate limit tier names, ordered from most to least permissive. */
export type RateLimitTier =
  | "admin"
  | "crewai"
  | "pro"
  | "free"
  | "anonymous";

// ─── Pipeline Builder ─────────────────────────────────────────────────────────

/**
 * Compose an ordered array of middleware into a single pipeline function.
 * Middleware executes left-to-right; the terminal function is the handler.
 *
 * Usage:
 *   const pipeline = createMiddlewarePipeline([
 *     requestLogger,
 *     authMiddleware,
 *     rateLimiterMiddleware,
 *     responseCacheMiddleware,
 *     // ← future middleware slots here without editing gateway core
 *   ]);
 *   const response = await pipeline(req, ctx, handler);
 */
export function createMiddlewarePipeline(
  middlewares: MiddlewareFn[],
): (req: Request, ctx: GatewayContext, terminal: () => Promise<Response>) => Promise<Response> {
  return (req, ctx, terminal) => {
    const dispatch = (index: number): Promise<Response> => {
      if (index >= middlewares.length) return terminal();
      return middlewares[index](req, ctx, () => dispatch(index + 1));
    };
    return dispatch(0);
  };
}

// ─── Middleware 1: Request Logger ─────────────────────────────────────────────

/** Sanitized structured request/response logging. No PII captured. */
export const requestLoggerMiddleware: MiddlewareFn = async (req, ctx, next) => {
  const url = new URL(req.url);
  ctx.logger.info("gateway:request", {
    method: req.method,
    path: url.pathname,
    // strip query string — may contain user-submitted search terms (PII risk)
    correlationId: ctx.correlationId,
  });
  const start = performance.now();
  const response = await next();
  const ms = Math.round(performance.now() - start);
  ctx.logger.info("gateway:response", {
    status: response.status,
    durationMs: ms,
    upstream: ctx.upstreamFunction,
    correlationId: ctx.correlationId,
  });
  return response;
};

// ─── Middleware 2: Auth ───────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Role → rate limit tier mapping. */
const ROLE_TO_TIER: Record<string, RateLimitTier> = {
  admin: "admin",
  crewai: "crewai",
  pro: "pro",
  starter: "free",
  free: "free",
};

/**
 * JWT verification + API key consumer identification middleware.
 * - Missing/invalid JWT → sets anonymous tier, allows request to continue
 *   (downstream EFs enforce their own auth if the endpoint requires login)
 * - Valid JWT → populates ctx.userId + ctx.userRole + ctx.rateLimitTier
 * - X-API-Key header → identifies API consumer, may override rate limit tier
 *
 * SA-005: Added API consumer key validation (scar for future third-party access)
 */
export const authMiddleware: MiddlewareFn = async (req, ctx, next) => {
  // ── Step 1: Identify API consumer via X-API-Key header ──
  const apiKey = req.headers.get("X-API-Key");
  if (apiKey) {
    try {
      const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      // Hash the key and look up consumer
      const keyHash = await hashApiKey(apiKey);
      const { data: consumer } = await adminClient
        .from("api_consumers")
        .select("consumer_id, tier, rate_limit_override, is_active")
        .eq("api_key_hash", keyHash)
        .eq("is_active", true)
        .single();

      if (consumer) {
        ctx.meta.consumerId = consumer.consumer_id;
        ctx.meta.consumerTier = consumer.tier;
        ctx.meta.consumerRateLimitOverride = consumer.rate_limit_override;
        // Update last_used_at (fire-and-forget)
        adminClient
          .from("api_consumers")
          .update({ last_used_at: new Date().toISOString() })
          .eq("consumer_id", consumer.consumer_id)
          .then(() => {})
          .catch(() => {}); // never fail request
      }
    } catch (e) { console.warn("[EF][gateway_middleware]", e?.message || String(e));
      // API key lookup failure is non-fatal — fall through to JWT auth
      ctx.logger.warn("gateway:auth:api_key_lookup_failed", {
        correlationId: ctx.correlationId,
      });
    }
  }

  // ── Step 2: JWT authentication (unchanged from SA-004) ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    // No token — anonymous
    ctx.userId = null;
    ctx.userRole = null;
    ctx.rateLimitTier = "anonymous";
    // If consumer has a tier override, apply it
    if (ctx.meta.consumerTier) {
      ctx.rateLimitTier = ctx.meta.consumerTier as RateLimitTier;
    }
    return next();
  }

  const token = authHeader.replace("Bearer ", "");

  // Service role passthrough (cron / server-to-server calls)
  if (token === SUPABASE_SERVICE_ROLE_KEY) {
    ctx.userId = null;
    ctx.userRole = "service_role";
    ctx.rateLimitTier = "admin";
    return next();
  }

  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) {
      ctx.userId = null;
      ctx.userRole = null;
      ctx.rateLimitTier = "anonymous";
      return next();
    }

    // Fetch role from profiles
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role ?? "free";
    ctx.userId = user.id;
    ctx.userRole = role;
    ctx.rateLimitTier = ROLE_TO_TIER[role] ?? "free";

    // Consumer rate_limit_override takes precedence over user tier
    if (ctx.meta.consumerRateLimitOverride) {
      // Override is a raw number — store in meta for rate limiter to use
      ctx.meta.rateLimitOverride = ctx.meta.consumerRateLimitOverride;
    }
  } catch (err) {
    ctx.logger.warn("gateway:auth:error", { error: String(err) });
    ctx.userId = null;
    ctx.userRole = null;
    ctx.rateLimitTier = "anonymous";
  }

  return next();
};

/**
 * Hash an API key using SHA-256 to match against api_consumers.api_key_hash.
 * Uses Web Crypto API (available in Deno).
 */
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Middleware 3: Rate Limiter ───────────────────────────────────────────────

/**
 * Sliding-window rate limiter backed by rate_limits table in Supabase.
 *
 * Rate limit tiers (seeds in v6.19 migration):
 *   anonymous  — 30 req/min
 *   free       — 120 req/min
 *   pro        — 300 req/min
 *   crewai     — 600 req/min
 *   admin      — unlimited
 *
 * Implementation: Supabase RPC call to enforce_rate_limit() which performs
 * a sliding-window count via gateway_request_log (written by this middleware).
 * Simple and serverless-compatible — no Redis dependency.
 */
export const rateLimiterMiddleware: MiddlewareFn = async (req, ctx, next) => {
  if (ctx.rateLimitTier === "admin") return next(); // unlimited

  const url = new URL(req.url);
  const endpointPattern = deriveEndpointPattern(url.pathname);
  const windowKey = ctx.userId ?? req.headers.get("CF-Connecting-IP") ?? "unknown";

  try {
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Look up limit for this tier + endpoint pattern
    const { data: limitRow } = await adminClient
      .from("rate_limits")
      .select("max_requests, window_seconds")
      .eq("tier", ctx.rateLimitTier)
      .or(`endpoint_pattern.eq.${endpointPattern},endpoint_pattern.eq.*`)
      .order("endpoint_pattern", { ascending: false }) // specific pattern wins over wildcard
      .limit(1)
      .single();

    if (!limitRow) return next(); // no limit configured — allow

    const { max_requests, window_seconds } = limitRow;
    const windowStart = new Date(Date.now() - window_seconds * 1000).toISOString();

    // Count recent requests from this key
    const { count } = await adminClient
      .from("gateway_request_log")
      .select("*", { count: "exact", head: true })
      .eq("window_key", windowKey)
      .eq("tier", ctx.rateLimitTier)
      .gte("created_at", windowStart);

    if ((count ?? 0) >= max_requests) {
      ctx.logger.warn("gateway:rate_limit:exceeded", {
        tier: ctx.rateLimitTier,
        windowKey,
        count,
        max: max_requests,
      });
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please slow down.", tier: ctx.rateLimitTier }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(window_seconds),
            "X-RateLimit-Limit": String(max_requests),
            "X-RateLimit-Window": String(window_seconds),
            "x-correlation-id": ctx.correlationId,
          },
        },
      );
    }

    // Log this request (non-blocking — fire and forget)
    adminClient
      .from("gateway_request_log")
      .insert({
        window_key: windowKey,
        tier: ctx.rateLimitTier,
        endpoint_pattern: endpointPattern,
        user_id: ctx.userId,
        created_at: new Date().toISOString(),
      })
      .then(() => {})
      .catch(() => {}); // never fail the request due to logging
  } catch (err) {
    // Rate limiter failure is non-fatal — prefer availability over strict limiting
    ctx.logger.warn("gateway:rate_limit:error", { error: String(err) });
  }

  return next();
};

/** Map a full pathname like /api/v1/chat-job-search to a pattern key. */
function deriveEndpointPattern(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  // /api/v1/{function-name} → function-name
  if (parts.length >= 3 && parts[0] === "api") return parts[2];
  return "*";
}

// ─── Middleware 4: Response Cache (CDN Cache-Control Headers) ─────────────────

/**
 * Sets Cache-Control headers on read-only endpoints for Cloudflare edge caching.
 * Write operations (POST, PUT, PATCH, DELETE) are never cached.
 *
 * TTL config:
 *   job search results — 60s
 *   job detail        — 300s
 *   stats / analytics — 600s
 *   other GET         — 0s (no-store, prevents accidental caching of auth responses)
 */
const CACHE_TTL_MAP: Record<string, number> = {
  // ── High-frequency user-facing reads (short TTL) ──
  "chat-job-search": 60,
  "preview-jobs": 60,
  "match-score-overlay": 60,
  "extension-heartbeat": 30,

  // ── Moderate-frequency reads (medium TTL) ──
  "job-intelligence": 300,
  "recruiter-lookup": 300,
  "health-check": 120,

  // ── Aggregate / stats reads (long TTL) ──
  "refresh-city-stats": 600,
  "admin-analytics": 600,
  "trend-anomaly-detector": 600,
};

export const responseCacheMiddleware: MiddlewareFn = async (req, ctx, next) => {
  const response = await next();
  const method = req.method.toUpperCase();

  // Never cache writes or non-2xx
  if (method !== "GET" || response.status >= 400) return response;

  const ttl = CACHE_TTL_MAP[ctx.upstreamFunction];
  if (!ttl) {
    // Non-cached GET — prevent accidental CDN caching (e.g. auth responses)
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, headers });
  }

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=30`);
  headers.set("Vary", "Authorization"); // separate cache per auth state
  return new Response(response.body, { status: response.status, headers });
};
