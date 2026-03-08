/**
 * SA-024: Event Bus Gateway Middleware
 *
 * Activates Hook H-01: post-response event dispatch slot in the gateway pipeline.
 * Fires platform events after specific route completions (fire-and-forget).
 *
 * This middleware sits AFTER the terminal handler returns — it does not block
 * the response. Events are dispatched asynchronously (no await in pipeline).
 *
 * Routes mapped to event types:
 *   pipeline-write         → pipeline.stage_changed
 *   validate-signup        → user.signup
 *   create-checkout        → billing.checkout_initiated
 *   account-delete         → user.deleted
 *   crewai-graduation      → agent.graduated
 *   dedup-promote          → job.dedup_complete
 *   ingest-common-crawl    → job.batch_ingested
 *
 * Scar S-03: GatewayContext.eventBus field activated here.
 * Previous sessions typed the field; this session provides the implementation.
 *
 * Phase: S5 | Session: SA-024 | 2026-03-07
 */

import { GatewayContext } from "./gateway-middleware.ts";
import { createLogger } from "./logger.ts";

const logger = createLogger("event-bus-middleware");

// ── Event route map ───────────────────────────────────────────────────────────
// Maps gateway route names to event types emitted on 2xx responses.
// HOOK: Extend this map to add new event emissions without editing gateway logic.

const ROUTE_EVENT_MAP: Record<string, string> = {
  "pipeline-write":        "pipeline.stage_changed",
  "validate-signup":       "user.signup",
  "create-checkout":       "billing.checkout_initiated",
  "account-delete":        "user.deleted",
  "crewai-graduation":     "agent.graduated",
  "dedup-promote":         "job.dedup_complete",
  "ingest-common-crawl":   "job.batch_ingested",
  "approve-content":       "content.approved",
  "send-notification":     "notification.sent",
  "referral-validate":     "referral.converted",
  // SCAR: add more route→event mappings here as features grow
};

// ── eventBusMiddleware ────────────────────────────────────────────────────────
// Returns a middleware factory compatible with createMiddlewarePipeline.
// Must be the LAST middleware before the terminal handler.

export function eventBusMiddleware() {
  return async (
    req: Request,
    ctx: GatewayContext,
    next: () => Promise<Response>,
  ): Promise<Response> => {
    const response = await next();

    // Fire-and-forget: do not await event dispatch
    const routeName = ctx.routeName;
    const eventType = routeName ? ROUTE_EVENT_MAP[routeName] : undefined;

    if (eventType && response.status >= 200 && response.status < 300) {
      dispatchEvent(ctx, eventType, req).catch((err: unknown) => {
        // Never let event dispatch errors surface to the caller
        logger.error("event_dispatch_failed", {
          eventType,
          route: routeName,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return response;
  };
}

// ── dispatchEvent ─────────────────────────────────────────────────────────────
async function dispatchEvent(
  ctx: GatewayContext,
  eventType: string,
  req: Request,
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) return;

  const metadata: Record<string, unknown> = {
    correlation_id: ctx.correlationId,
    route: ctx.routeName,
    consumer_id: ctx.consumerId ?? null,
    user_id: ctx.userId ?? null,
    ip: req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? null,
  };

  // Call fn_publish_event via RPC
  await fetch(`${supabaseUrl}/rest/v1/rpc/fn_publish_event`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
      "apikey": serviceRoleKey,
    },
    body: JSON.stringify({
      p_event_type: eventType,
      p_source: "api-gateway",
      p_payload: {},
      p_metadata: metadata,
    }),
    signal: AbortSignal.timeout(5000),
  });

  logger.info("event_dispatched", { eventType, correlationId: ctx.correlationId });
}
