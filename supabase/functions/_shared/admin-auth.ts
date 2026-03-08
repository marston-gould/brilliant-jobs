/**
 * Shared admin authentication middleware for Edge Functions.
 * G11: Replaces duplicated inline admin auth checks across all admin EFs.
 *
 * Usage:
 *   import { requireAdmin } from '../_shared/admin-auth.ts';
 *
 *   // In your handler:
 *   const { user, isServiceRole } = await requireAdmin(req);
 *
 * Behavior:
 *   - Extracts Bearer token from Authorization header
 *   - If token is a service_role JWT (cron/server calls), returns { user: null, isServiceRole: true }
 *   - Otherwise verifies user via Supabase auth + checks profiles.role === 'admin'
 *   - Returns { user, isServiceRole: false } on success
 *   - Throws an AdminAuthError (with status + message) on failure — caller must catch and return Response
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export class AdminAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
  }
}

export interface AdminAuthResult {
  user: { id: string; email?: string } | null;
  isServiceRole: boolean;
}

/**
 * Verify that the request comes from an admin user or a service_role JWT.
 *
 * @param req - The incoming Request object
 * @returns AdminAuthResult with user info
 * @throws AdminAuthError with status 401 (no/invalid token) or 403 (not admin)
 */
export async function requireAdmin(req: Request): Promise<AdminAuthResult> {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";

  if (!authHeader) {
    throw new AdminAuthError("Authorization required", 401);
  }

  if (!authHeader.startsWith("Bearer ")) {
    throw new AdminAuthError("Invalid authorization format", 401);
  }

  const token = authHeader.replace("Bearer ", "");

  // Check if this is a service_role JWT (used by cron jobs / server-side calls)
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.role === "service_role") {
      return { user: null, isServiceRole: true };
    }
  } catch (e) { console.warn("[EF][admin_auth_verify]", e?.message || String(e));
    // Not a parseable JWT — will try user auth below
  }

  // Verify user via Supabase auth
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const {
    data: { user },
    error,
  } = await sb.auth.getUser(token);

  if (error || !user) {
    throw new AdminAuthError("Invalid or expired token", 401);
  }

  // Check admin role in profiles table
  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    throw new AdminAuthError("Admin role required", 403);
  }

  return {
    user: { id: user.id, email: user.email },
    isServiceRole: false,
  };
}

/**
 * Helper to convert AdminAuthError to a JSON Response.
 * Use in catch blocks to return the appropriate HTTP error.
 */
export function authErrorResponse(
  err: unknown,
  corsHeaders: Record<string, string> = {}
): Response {
  if (err instanceof AdminAuthError) {
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: err.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
  // Re-throw non-auth errors
  throw err;
}
