// data-export Edge Function
// B6: GDPR-compliant user data export
// Architecture Review §40
// Date: 2026-02-19
//
// Returns a JSON archive of all user data across all tables.
// Called by authenticated users for their own data, or by admin for any user.
//
// Deploy: supabase functions deploy data-export

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createLogger } from "../_shared/logger.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const USER_TABLES = [
  // Core identity
  { table: "profiles", fk: "id" },
  // Network & contacts
  { table: "connections", fk: "user_id" },
  { table: "recruiter_contacts", fk: "user_id" },
  // Resumes & applications
  { table: "resumes", fk: "user_id" },
  { table: "resume_rewrites", fk: "user_id" },
  { table: "application_profiles", fk: "user_id" },
  { table: "pending_applications", fk: "user_id" },
  { table: "mock_ats_submissions", fk: "user_id" },
  // Pipeline & tracking
  { table: "pipeline", fk: "user_id" },
  { table: "user_pipeline", fk: "user_id" },
  { table: "saved_filters", fk: "user_id" },
  // Notifications
  { table: "notification_log", fk: "user_id" },
  { table: "notification_actions", fk: "user_id" },
  { table: "user_notification_preferences", fk: "user_id" },
  { table: "user_notification_state", fk: "user_id" },
  { table: "held_notifications", fk: "user_id" },
  { table: "template_send_log", fk: "user_id" },
  // Billing & subscriptions
  { table: "subscriptions", fk: "user_id" },
  { table: "credit_transactions", fk: "user_id" },
  // Referrals
  { table: "referrals", fk: "referrer_id" },
  { table: "referral_invites", fk: "user_id" },
  { table: "referral_rewards", fk: "user_id" },
  { table: "referral_badges", fk: "user_id" },
  // Extension & telemetry
  { table: "extension_heartbeats", fk: "user_id" },
  { table: "extension_events", fk: "user_id" },
  { table: "overlay_analytics", fk: "user_id" },
  { table: "push_subscriptions", fk: "user_id" },
  // Engagement & feedback
  { table: "feedback", fk: "user_id" },
  { table: "onboarding_milestones", fk: "user_id" },
  { table: "ghost_alerts_sent", fk: "user_id" },
  { table: "marketing_campaign_log", fk: "user_id" },
  { table: "leaderboard_rewards", fk: "user_id" },
  // Sessions & experiments
  { table: "user_sessions", fk: "user_id" },
  { table: "ab_assignments", fk: "user_id" },
  // Audit trail (included in export but NOT deleted)
  { table: "audit_log", fk: "user_id" },
];

serve(async (req) => {
  const logger = createLogger("data-export");

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const anonSb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authErr } = await anonSb.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  // CS-015: CE-001 — Rate limit: 5 exports/hour per user
  try {
    const { data: allowed } = await sb.rpc('check_ef_rate_limit', {
      p_function_name: 'data-export',
      p_caller_id: user.id,
      p_max_calls: 5,
      p_window_minutes: 60,
    });
    if (allowed === false) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Max 5 exports per hour.' }),
        { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '3600' } }
      );
    }
  } catch (e) {
    console.warn('[data-export] Rate limit check failed:', e.message);
  }

  // Optional: admin can export another user's data
  let targetUserId = user.id;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.user_id && body.user_id !== user.id) {
      // Check if requester is admin
      const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).single();
      if (profile?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Admin required" }), { status: 403 });
      }
      targetUserId = body.user_id;
    }
  } catch { /* no body = self export */ }

  logger.info("Exporting user data", { userId: targetUserId, requestedBy: user.id });

  const exportData: Record<string, unknown> = {
    _meta: {
      exported_at: new Date().toISOString(),
      user_id: targetUserId,
      requested_by: user.id,
      version: "2.0",
      tables_exported: USER_TABLES.map((t) => t.table),
      pii_inventory_version: "1.0",
    },
  };

  // Include auth user metadata (email, phone, identities)
  if (targetUserId === user.id) {
    exportData["auth_user"] = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      created_at: user.created_at,
      updated_at: user.updated_at,
      user_metadata: user.user_metadata,
      identities: user.identities?.map((i: Record<string, unknown>) => ({
        provider: i.provider,
        identity_id: i.identity_id,
        created_at: i.created_at,
        updated_at: i.updated_at,
      })),
    };
  }

  for (const { table, fk } of USER_TABLES) {
    try {
      const { data, error } = await sb
        .from(table)
        .select("*")
        .eq(fk, targetUserId);

      if (error) {
        logger.warn(`Export failed for ${table}`, { error: error.message });
        exportData[table] = { error: error.message };
      } else {
        exportData[table] = data || [];
      }
    } catch (e) {
      exportData[table] = { error: String(e) };
    }
  }

  // Log the export event
  await sb.rpc("log_usage_event", {
    p_user_id: targetUserId,
    p_event_type: "data_export",
    p_event_data: { requested_by: user.id },
  });

  // Log to audit trail
  await sb.from("audit_log").insert({
    user_id: user.id,
    action: "data_export",
    resource_type: "user",
    resource_id: targetUserId,
    details: { tables: USER_TABLES.map((t) => t.table) },
  });

  return new Response(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="brilliant-jobs-export-${targetUserId.slice(0, 8)}.json"`,
    },
  });
});
