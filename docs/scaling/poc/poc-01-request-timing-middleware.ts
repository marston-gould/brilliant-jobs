/**
 * POC-01: Request Timing Middleware — H-01 Validation
 *
 * HOOK EXERCISED: H-01 (Gateway Middleware Pipeline)
 * PURPOSE: Proves a new middleware can be inserted into the gateway pipeline
 *          without editing existing middleware. Captures per-request timing,
 *          tags slow requests (>2s), and publishes slow-request events to the
 *          event bus (H-02) for alerting.
 *
 * ACTIVATION: To activate, add to the pipeline array in api-gateway/index.ts:
 *   import { requestTimingMiddleware } from "../_shared/request-timing-middleware.ts";
 *   const pipeline = createMiddlewarePipeline([
 *     requestLoggerMiddleware,
 *     requestTimingMiddleware(),   // ← POC-01: insert here
 *     authMiddleware,
 *     ...
 *   ]);
 *
 * SESSION: SA-029 (Hook Prototyping + Evolvability Baseline)
 * STATUS: POC — not deployed. Validates H-01 interface contract.
 */

import type { GatewayContext, MiddlewarePlugin, NextFunction } from "./types.ts";

const SLOW_REQUEST_THRESHOLD_MS = 2000;

/**
 * H-01 middleware contract:
 *   (req: Request, ctx: GatewayContext, next: NextFunction) => Promise<Response>
 *
 * This middleware:
 * 1. Records start time before calling next()
 * 2. Records end time after response
 * 3. Attaches x-response-time header
 * 4. Publishes slow-request events to event bus (H-02) when threshold exceeded
 */
export function requestTimingMiddleware(): MiddlewarePlugin {
  return async (req: Request, ctx: GatewayContext, next: NextFunction): Promise<Response> => {
    const start = performance.now();

    // Pass through to next middleware in pipeline
    const response = await next();

    const elapsed = Math.round(performance.now() - start);

    // Clone response to add timing header
    const timedResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    });
    timedResponse.headers.set("x-response-time", `${elapsed}ms`);

    // Publish slow-request event via H-02 (event bus) — fire-and-forget
    if (elapsed > SLOW_REQUEST_THRESHOLD_MS && ctx.eventBus) {
      // S-03 (GatewayContext.eventBus) provides typed access to the event bus
      ctx.eventBus.publish({
        event_type: "gateway.slow_request",
        source: "request-timing-middleware",
        payload: {
          route: ctx.route,
          method: req.method,
          elapsed_ms: elapsed,
          threshold_ms: SLOW_REQUEST_THRESHOLD_MS,
          consumer: ctx.consumer?.consumer_name ?? "anonymous",
        },
        metadata: { severity: elapsed > 5000 ? "critical" : "warning" },
      }).catch(() => {
        // Fire-and-forget — never block the response (H-01 contract)
      });
    }

    return timedResponse;
  };
}

/**
 * HOOK VALIDATION CHECKLIST:
 * ✅ Implements MiddlewarePlugin interface (H-01 contract)
 * ✅ Calls next() to pass control to the next middleware
 * ✅ Does not modify the request before passing to next (read-only timing)
 * ✅ Can be inserted at any position in the pipeline array
 * ✅ Uses S-03 (ctx.eventBus) for event publishing — typed, optional
 * ✅ Fire-and-forget: never blocks the response on event bus failure
 * ✅ No gateway core code changes required — just add to pipeline array
 *
 * SCARS LEVERAGED:
 * - S-03 (GatewayContext.eventBus) — typed context field
 * - S-04 (webhook event_filters) — subscribers could filter to slow_request events
 */
