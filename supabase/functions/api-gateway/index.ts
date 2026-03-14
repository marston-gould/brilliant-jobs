/**
 * SA-004 + SA-005: API Gateway Edge Function
 * Single entry point for all /api/v1/* requests.
 *
 * Architecture:
 *   Client → Cloudflare → Vercel → [api-gateway EF]
 *              ↓ middleware pipeline
 *           [downstream EF]
 *
 * Plugin middleware pipeline (ordered, extensible via config):
 *   1. request-logger  — structured logging, correlation ID
 *   2. auth            — JWT + API key verification + role extraction
 *   3. rate-limiter    — sliding-window per tier
 *   4. response-cache  — Cache-Control headers for Cloudflare
 *
 * Route registry:
 *   Config-driven map of URL patterns → downstream EF names.
 *   SA-004: 10 routes. SA-005: All 93 EFs routed. Direct paths deprecated.
 *
 * API Consumer Management (SA-005 scar):
 *   api_consumers table tracks built-in + future third-party consumers.
 *   Auth middleware validates X-API-Key header for consumer identification.
 *   Self-service developer portal is future work — architecture ready now.
 *
 * ADR: docs/scaling/adr-03-gateway.md
 * Phase: S1 — Foundation
 * Pair: Backend + DevOps + Lead Platform Engineer
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
import { readReplicaRoutingMiddleware } from "../_shared/read-replica-middleware.ts";
import { eventBusMiddleware } from "../_shared/event-bus-middleware.ts";
import { featureFlagMiddleware } from "../_shared/feature-flag-middleware.ts";

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

  // ═══════════════════════════════════════════════════════════════════════════
  // SA-004: Initial 10 routes (highest traffic)
  // SA-005: All remaining 83 routes added — 93 total EFs through gateway
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Jobs: Search, Enrichment, Intelligence (14) ──────────────────────────
  "chat-job-search":          "chat-job-search",          // SA-004
  "enrich-jd-ai":             "enrich-jd-ai",             // SA-004
  "enrich-job":               "enrich-job",               // SA-005
  "enrich-job-ondemand":      "enrich-job-ondemand",      // SA-005
  "enrich-fcd-batch":         "enrich-fcd-batch",         // SA-005
  "preview-jobs":             "preview-jobs",             // SA-005
  "refresh-jobs":             "refresh-jobs",             // SA-005
  "refresh-usajobs":          "refresh-usajobs",          // SA-005
  "refresh-orchestrator":     "refresh-orchestrator",     // SA-005
  "refresh-city-stats":       "refresh-city-stats",       // SA-005
  "discover-boards":          "discover-boards",          // SA-005
  "job-intelligence":         "job-intelligence",         // SA-005
  "analyze-hidden-job":       "analyze-hidden-job",       // SA-005
  "score-ai-content":         "score-ai-content",         // SA-005

  // ── Pipeline & Applications (8) ──────────────────────────────────────────
  "submit-application":       "submit-application",       // SA-004
  "pipeline-write":           "pipeline-write",           // SA-005
  "confirm-pipeline-signal":  "confirm-pipeline-signal",  // SA-005
  "prompt-pipeline-updates":  "prompt-pipeline-updates",  // SA-005
  "scan-pipeline-signals":    "scan-pipeline-signals",    // SA-005
  "apply-on-notification":    "apply-on-notification",    // SA-005
  "auto-apply-trigger":       "auto-apply-trigger",       // SA-005
  "mock-ats-submit":          "mock-ats-submit",          // SA-005

  // ── Resume & Cover Letter (6) ────────────────────────────────────────────
  "score-resume":             "score-resume",             // SA-004
  "extract-resume-profile":   "extract-resume-profile",   // SA-005
  "rewrite-resume":           "rewrite-resume",           // SA-005
  "rewrite-resume-analyze":   "rewrite-resume-analyze",   // SA-005
  "rewrite-resume-execute":   "rewrite-resume-execute",   // SA-005
  "rewrite-resume-extension": "rewrite-resume-extension", // EXT-AS-5
  "generate-cover-letter":    "generate-cover-letter",    // SA-005

  // ── Scoring & Quality (3) ────────────────────────────────────────────────
  "score-job-fraud":          "score-job-fraud",          // SA-004
  "score-sequence":           "score-sequence",           // SA-005
  "analyze-application-gap":  "analyze-application-gap",  // SA-005

  // ── Keywords & Filters (4) ──────────────────────────────────────────────
  "filter-to-prompt":         "filter-to-prompt",         // SA-005
  "prompt-to-filter":         "prompt-to-filter",         // SA-005
  "generate-filter":          "generate-filter",          // SA-005
  "match-score-overlay":      "match-score-overlay",      // SA-005

  // ── User Auth & Lifecycle (5) ────────────────────────────────────────────
  "validate-signup":          "validate-signup",          // SA-004
  "account-lifecycle":        "account-lifecycle",        // SA-004
  "account-delete":           "account-delete",           // SA-005
  "confirm-email":            "confirm-email",            // SA-005
  "resend-confirmation":      "resend-confirmation",      // SA-005

  // ── Billing & Subscription (6) ──────────────────────────────────────────
  "billing-notifications":    "billing-notifications",    // SA-004
  "create-checkout":          "create-checkout",          // SA-005
  "manage-subscription":      "manage-subscription",      // SA-005
  "stripe-webhook":           "stripe-webhook",           // SA-005
  "hire-fee":                 "hire-fee",                 // SA-005
  "auto-refill":              "auto-refill",              // SA-005

  // ── Notifications & Communications (9) ──────────────────────────────────
  "send-notification":        "send-notification",        // SA-004
  "daily-digest":             "daily-digest",             // SA-004
  "weekly-summary":           "weekly-summary",           // SA-005
  "monthly-report":           "monthly-report",           // SA-005
  "handle-notification-response": "handle-notification-response", // SA-005
  "handle-sms-reply":         "handle-sms-reply",         // SA-005
  "push-subscribe":           "push-subscribe",           // SA-005
  "vonage-webhook":           "vonage-webhook",           // SA-005
  "resend-webhook":           "resend-webhook",           // SA-005

  // ── Gmail Integration (3) ───────────────────────────────────────────────
  "gmail-auth":               "gmail-auth",               // SA-005
  "gmail-disconnect":         "gmail-disconnect",         // SA-005
  "gmail-scan":               "gmail-scan",               // SA-005

  // ── Referral System (6) ─────────────────────────────────────────────────
  "check-referral-activation":    "check-referral-activation",    // SA-005
  "process-referral-reward":      "process-referral-reward",      // SA-005
  "referral-clawback":            "referral-clawback",            // SA-005
  "referral-fraud-scan":          "referral-fraud-scan",          // SA-005
  "referral-lifecycle":           "referral-lifecycle",           // SA-005
  "referral-reward-clawback":     "referral-reward-clawback",     // SA-005
  "distribute-leaderboard-rewards": "distribute-leaderboard-rewards", // SA-005

  // ── Admin & Content (7) ─────────────────────────────────────────────────
  "admin-analytics":          "admin-analytics",          // SA-005
  "admin-cron-management":    "admin-cron-management",    // SA-005
  "approve-content":          "approve-content",          // SA-005
  "seo-sync":                 "seo-sync",                 // SA-005
  "generate-editorial-content": "generate-editorial-content", // SA-005
  "detect-editorial-insights":  "detect-editorial-insights",  // SA-005
  "evaluate-alerts":          "evaluate-alerts",          // SA-005

  // ── Extension (4) ──────────────────────────────────────────────────────
  "extension-heartbeat":      "extension-heartbeat",      // SA-005
  "build-extension":          "build-extension",          // SA-005
  "answer-form-question":     "answer-form-question",     // SA-005
  "recruiter-lookup":         "recruiter-lookup",         // SA-005

  // ── Engagement & Sequences (9) ─────────────────────────────────────────
  "adoption-sequence":        "adoption-sequence",        // SA-005
  "interview-sequence":       "interview-sequence",       // SA-005
  "onboarding-sequence":      "onboarding-sequence",      // SA-005
  "re-engagement":            "re-engagement",            // SA-005
  "nps-pulse":                "nps-pulse",                // SA-005
  "periodic-survey-pulse":    "periodic-survey-pulse",    // SA-005
  "marketing-campaign":       "marketing-campaign",       // SA-005
  "community-feedback":       "community-feedback",       // SA-005
  "escalation-checker":       "escalation-checker",       // SA-005

  // ── Data & Maintenance (6) ─────────────────────────────────────────────
  "data-export":              "data-export",              // SA-005
  "cleanup-orphans":          "cleanup-orphans",          // SA-005
  "archive-inactive":         "archive-inactive",         // SA-005
  "queue-worker":             "queue-worker",             // SA-005
  "trend-anomaly-detector":   "trend-anomaly-detector",   // SA-005
  "health-check":             "health-check",             // SA-005

  // ── Common Crawl Pipeline (SA-007) ────────────────────────────────────
  "ingest-common-crawl":      "ingest-common-crawl",      // SA-007: CC ingestion worker
  "dedup-promote":            "dedup-promote",            // SA-008: Dedup engine + enrichment queue
  "refresh-mv-incremental":     "refresh-materialized-views",  // SA-009: Incremental MV refresh + staleness

  // ── CrewAI Agent Framework (SA-010, SA-011) ─────────────────────────────
  "crewai-orchestrator":        "crewai-orchestrator",        // SA-010: Agent lifecycle management
  "crewai-content-qa":          "crewai-content-qa",          // SA-010: Content QA Agent (Agent 1)
  "crewai-pipeline-health":     "crewai-pipeline-health",     // SA-011: Pipeline Health Agent (Agent 2)
  "crewai-data-freshness":      "crewai-data-freshness",      // SA-011: Data Freshness Agent (Agent 3)
  "crewai-graduation":         "crewai-graduation",         // SA-012: Agent Graduation Framework
  "crewai-agent-digest":       "crewai-agent-digest",       // SA-012: Daily Agent Digest Email
  "crewai-cost-guardian":      "crewai-cost-guardian",      // SA-020: Cost Guardian Agent (Agent 4)
  "crewai-user-support":       "crewai-user-support",       // SA-020: User Support Agent (Agent 5)
  "crewai-referral-pipeline":  "crewai-referral-pipeline",  // SA-021: Referral Pipeline Agent (Agent 6)

  // ── Search Infrastructure (deferred SA-001—003, routed for completeness) ─
  "typesense-search":         "typesense-search",         // SA-005 (deferred)
  "typesense-seed":           "typesense-seed",           // SA-005 (deferred)

  // ── Read Replica Health (SA-018) ──────────────────────────────────────────
  "replica-health":           "replica-health",           // SA-018: Replica lag monitoring + health

  // ── Event Bus + Webhook Delivery (SA-024) ─────────────────────────────────
  "event-bus":                "event-bus",                // SA-024: Platform event bus, webhook delivery, subscriptions

  // ── Feature Flags + Experimentation (SA-025) ──────────────────────────────
  "feature-flags":            "feature-flags",            // SA-025: evaluate/create/update/list/segments/override

  // ── Capacity Model + Scaling (SA-028) ──────────────────────────────────────
  "capacity-model":           "capacity-model",           // SA-028: snapshot/forecast/cost-model/triggers/summary/acknowledge
  "cost-monitor":             "cost-monitor",             // REM-003: summary/daily/weekly/monthly/budget-update

  // ── Build Instrumentation (BI-01) ─────────────────────────────────────────
  "deploy-tracker":           "deploy-tracker",           // BI-01: summary/list/record/complete/record-build-step/health

  // ── Pay After You Land (FB-PAYL-S1) ─────────────────────────────────────
  "parse-linkedin-pdf":       "parse-linkedin-pdf",       // FB-PAYL-S1: parse/validate/status — LinkedIn PDF upload + parsing
  "payl-referral-webhook":    "payl-referral-webhook",    // FB-PAYL-S1: signup/subscribed/qualify_check/revoke/status/anti_gaming_check
  "payl-expiry-check":        "payl-expiry-check",        // FB-PAYL-S1: check/nudge/convert/extend/summary

  // ── Activity Sync (AF-006) ────────────────────────────────────────────────
  "log-user-activity":          "log-user-activity",          // AF-006: batch/recent/summary — extension + dashboard activity sync

  // ── Referral Signup Attribution (FB-TRIAL-001-S4) ────────────────────────
  "handle-referral-signup":     "handle-referral-signup",     // FB-TRIAL-001-S4: signup attribution + status

  // ── Trial Notifications + Weekly Digest (FB-TRIAL-001-S5) ────────────────
  "send-trial-notifications":   "send-trial-notifications",   // FB-TRIAL-001-S5: trial lifecycle emails (service_role only)
  "weekly-digest-expired":      "weekly-digest-expired",      // FB-TRIAL-001-S5: weekly job digest for expired_free users

  // ── Batch Resume Scorer (FB-TRIAL-001-S6) ──────────────────────────────────
  "batch-resume-scorer":        "batch-resume-scorer",        // FB-TRIAL-001-S6: Anthropic Batch API queue (service_role only)

  // ═══════════════════════════════════════════════════════════════════════════
  // TOTAL: 119 routes (93 SA-005 + 1 SA-007 + 1 SA-008 + 1 SA-009 + 2 SA-010 + 2 SA-011 + 2 SA-012 + 1 SA-018 + 2 SA-020 + 1 SA-021 + 1 SA-024 + 1 SA-028 + 1 BI-01 + 3 FB-PAYL + 1 EXT-AS-5 + 1 AF-006 + 1 FB-TRIAL-S4 + 2 FB-TRIAL-S5 + 1 FB-TRIAL-S6). Direct paths deprecated.
  // HOOK: Future EFs register here. Future: load from DB table for
  //       runtime updates without redeploy (api_consumers integration).
  // ═══════════════════════════════════════════════════════════════════════════
};

// ─── Middleware Pipeline ──────────────────────────────────────────────────────
//
// Built-in middleware executes in this order for every request:
//   request-logger → auth → read-replica-routing → rate-limiter → response-cache → proxy
//
// HOOK: Insert future middleware between any step without editing gateway core.
// Example additions: analytics, A/B routing, webhook dispatch, transformation.

const pipeline = createMiddlewarePipeline([
  requestLoggerMiddleware,
  authMiddleware,
  readReplicaRoutingMiddleware,  // SA-018: Annotates read/write + logs routing stats
  rateLimiterMiddleware,
  responseCacheMiddleware,
  eventBusMiddleware(),          // SA-024: H-01 — post-response event dispatch (fire-and-forget)
  featureFlagMiddleware(),       // SA-025: H-03 — flag evaluation injection for flag-aware routes
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

  // Route resolution: handle multiple URL formats
  //   Path-based (extension):  /functions/v1/api-gateway/{route}/...
  //   Path-based (Vercel):     /api/v1/{route}/...
  //   Header-based (dashboard): /functions/v1/api-gateway + x-gateway-route header
  const cleanPath = url.pathname
    .replace(/^\/functions\/v1\/api-gateway\/?/, "")
    .replace(/^\/api-gateway\/?/, "")
    .replace(/^\/api\/v1\//, "")
    .replace(/^\//, "");
  const pathParts = cleanPath.split("/").filter(Boolean);
  // Path-based route takes priority; fall back to x-gateway-route header
  const routeKey = pathParts[0] || req.headers.get("x-gateway-route") || "";
  const upstreamFunction = ROUTE_REGISTRY[routeKey];
  // When route came from header, inject it as first pathPart for proxyToUpstream
  if (!pathParts[0] && routeKey) {
    pathParts.unshift(routeKey);
  }

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
  headers.set("x-gateway", "bj-api-gateway-v1.0.0");

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
  // SA-018: Inject database routing hint for downstream EFs
  upstreamHeaders.set("x-gateway-db-mode", (ctx.meta.dbMode as string) ?? "write");
  upstreamHeaders.set("x-gateway-db-target", (ctx.meta.dbTarget as string) ?? "primary");
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
