// supabase/functions/_shared/feature-flag-middleware.ts
// SA-025: Feature Flags + Experimentation — Gateway Middleware
// H-03 activation: injects evaluated flag state into gateway context.
// Flags are resolved once per request for the authenticated user and
// injected as x-gateway-flags header for downstream EFs that need them.
// ─────────────────────────────────────────────────────────────────────────────

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getReadClient } from "./db-client.ts";

// Routes that benefit from flag injection (opt-in to avoid unnecessary DB calls)
// Scar S-06: expand this list as new features need flag-gating.
// Scar S-07: when PostHog Remote Flags replace local evaluation, remove this set
//   and delegate to posthog.getAllFlags() — no changes needed to EF consumers.
const FLAG_AWARE_ROUTES = new Set([
  "chat-job-search",       // chat-mode-v2 flag
  "preview-jobs",          // new-feed-layout flag
  "match-score-overlay",   // pipeline-ai-signals flag
  "resume-rewrite",        // resume-rewrite-v2 variant flag
  "referral-track",        // referral-dashboard flag
]);

interface FlagMiddlewareContext {
  userId?: string;
  route: string;
}

/**
 * Evaluates all active flags for the current user and returns a compact
 * flag map: { [flagKey]: boolean | string } for injection into headers.
 *
 * Returns null if the route does not need flag evaluation (fast path).
 */
export async function resolveFlagsForRequest(
  ctx: FlagMiddlewareContext
): Promise<Record<string, boolean | string> | null> {
  if (!FLAG_AWARE_ROUTES.has(ctx.route)) return null;
  if (!ctx.userId) return null;

  const db = getReadClient();

  try {
    const { data, error } = await db.rpc("fn_evaluate_all_flags", {
      p_user_id: ctx.userId,
      p_attributes: {},
    });

    if (error || !data) return null;

    // Compact: only include flags that are enabled (reduce header size)
    const compact: Record<string, boolean | string> = {};
    for (const [key, evaluation] of Object.entries(data as Record<string, { enabled: boolean; variant: string | null }>)) {
      if (evaluation.enabled) {
        compact[key] = evaluation.variant ?? true;
      }
    }

    return compact;
  } catch {
    // Never block gateway request on flag evaluation failure
    return null;
  }
}

/**
 * Gateway middleware function. Call in the request pipeline after auth.
 * Injects x-gateway-flags header (base64 JSON) for flag-aware routes.
 *
 * H-03 hook point: this middleware is the activation of Hook H-03
 * (gateway-level feature flag evaluation). When flag payloads grow
 * beyond header limits, this hook becomes the insertion point for
 * edge-cache-based flag delivery.
 */
export function featureFlagMiddleware() {
  return async (
    req: Request,
    route: string,
    userId: string | undefined,
    next: (req: Request) => Promise<Response>
  ): Promise<Response> => {
    // Resolve flags asynchronously (only for flag-aware routes)
    const flags = await resolveFlagsForRequest({ route, userId });

    if (!flags || Object.keys(flags).length === 0) {
      return next(req);
    }

    // Inject flags as a base64-encoded JSON header
    const flagHeader = btoa(JSON.stringify(flags));
    const augmented = new Request(req, {
      headers: Object.fromEntries([
        ...req.headers.entries(),
        ["x-gateway-flags", flagHeader],
      ]),
    });

    return next(augmented);
  };
}

/**
 * Parse x-gateway-flags header injected by the middleware.
 * Call this inside any EF that needs to gate on feature flags.
 *
 * Usage in an EF:
 *   const flags = parseFlagHeader(req.headers.get('x-gateway-flags'));
 *   if (flags['chat-mode-v2']) { ... }
 */
export function parseFlagHeader(
  header: string | null
): Record<string, boolean | string> {
  if (!header) return {};
  try {
    return JSON.parse(atob(header));
  } catch {
    return {};
  }
}
