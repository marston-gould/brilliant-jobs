/**
 * SA-005: Direct EF Access Deprecation Helper
 *
 * EFs should import and call `warnIfDirectAccess()` at the top of their
 * handler to log a deprecation warning when invoked directly instead of
 * through the API gateway.
 *
 * Detection: Gateway sets `x-gateway` header on all proxied requests.
 * If this header is absent, the request bypassed the gateway.
 *
 * Usage in any EF:
 *   import { warnIfDirectAccess } from '../_shared/gateway-deprecation.ts';
 *   serve(async (req) => {
 *     warnIfDirectAccess(req, 'my-function-name');
 *     // ... rest of handler
 *   });
 *
 * SCAR: This is a soft deprecation (log-only, no blocking). Future SA
 * sessions will enforce gateway-only access by rejecting requests
 * without the x-gateway header.
 */

import { createLogger } from "./logger.ts";

/** Cache of already-warned function names to avoid log spam. */
const warnedFunctions = new Set<string>();

/**
 * Log a deprecation warning if the request came directly to the EF
 * instead of through the API gateway.
 *
 * @param req - The incoming Request
 * @param functionName - Name of the Edge Function for logging context
 * @returns true if the request is direct (deprecated path), false if via gateway
 */
export function warnIfDirectAccess(req: Request, functionName: string): boolean {
  const gatewayHeader = req.headers.get("x-gateway");
  if (gatewayHeader) return false; // came through gateway — all good

  // Only log once per function per EF cold start to avoid flooding
  if (!warnedFunctions.has(functionName)) {
    const logger = createLogger(functionName);
    logger.warn("deprecated:direct_ef_access", {
      function: functionName,
      message: `Direct access to ${functionName} is deprecated. Use /api/v1/${functionName} via the API gateway.`,
      referer: req.headers.get("referer") ?? "unknown",
      userAgent: (req.headers.get("user-agent") ?? "").slice(0, 100), // truncate UA
    });
    warnedFunctions.add(functionName);
  }
  return true;
}

/**
 * Generate a deprecation response header to include in direct-access responses.
 * Clients can detect this header and migrate to gateway paths.
 */
export function deprecationHeaders(functionName: string): Record<string, string> {
  return {
    "X-Deprecated": "true",
    "X-Deprecated-Message": `Direct access deprecated. Use /api/v1/${functionName}`,
    "X-Migration-Path": `/api/v1/${functionName}`,
  };
}
