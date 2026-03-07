/**
 * CS-P1-004 BE-007: API Version Management
 * 
 * Date-based versioning (YYYY-MM-DD) for Brilliant Jobs Edge Functions.
 * All EF responses include x-api-version header via middleware.ts.
 * 
 * Version history:
 *   2026-03-07  Initial version (CS-P1-004). Adds version header to all EF responses.
 *               No breaking changes from prior unversioned API.
 * 
 * Future: Clients can send x-api-version in request headers to negotiate
 *         behavior for backward-incompatible changes.
 */

/** Current API version — update when making breaking changes */
export const API_VERSION = '2026-03-07';

/** Set to a date string when this version will be deprecated (null = active) */
export const API_DEPRECATION_DATE: string | null = null;

/**
 * Validate client-requested API version.
 * Returns the effective version to use for this request.
 * Currently always returns the latest version (no backward compat needed yet).
 */
export function resolveApiVersion(req: Request): string {
  const requested = req.headers.get('x-api-version');
  if (requested && requested !== API_VERSION) {
    console.warn(`Client requested API version ${requested}, serving ${API_VERSION}`);
  }
  return API_VERSION;
}

/**
 * Add API version headers to a Response.
 * Use this for EFs that don't use withCorrelation() middleware.
 * 
 * Usage:
 *   return withVersionHeaders(new Response(JSON.stringify(data), { headers: corsHeaders }));
 */
export function withVersionHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('x-api-version', API_VERSION);
  if (API_DEPRECATION_DATE) headers.set('x-api-deprecation', API_DEPRECATION_DATE);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Create standard JSON response with version headers.
 * Convenience for the most common EF response pattern.
 * 
 * Usage:
 *   return versionedJsonResponse({ jobs: [...] }, corsHeaders);
 *   return versionedJsonResponse({ error: 'Not found' }, corsHeaders, 404);
 */
export function versionedJsonResponse(
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'x-api-version': API_VERSION,
      ...extraHeaders,
    },
  });
}
