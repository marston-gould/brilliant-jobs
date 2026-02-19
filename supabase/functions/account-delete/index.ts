// account-delete Edge Function
// B7: Account deletion with 30-day grace period
// Architecture Review §40
// Date: 2026-02-19
//
// Flow:
// 1. User requests deletion → soft-delete (profiles.deleted_at = now())
// 2. Export user data to audit storage
// 3. Schedule hard delete in 30 days via job_queue
// 4. User can cancel within 30 days (DELETE to this endpoint with cancel=true)
//
// Deploy: supabase functions deploy account-delete

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createLogger } from "../_shared/logger.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRACE_PERIOD_DAYS = 30;

serve(async (req) => {
  const logger = createLogger("account-delete");

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

  const body = await req.json().catch(() => ({}));

  // Cancel deletion
  if (body.cancel === true) {
    logger.info("Cancelling account deletion", { userId: user.id });

    // Remove soft delete
    await sb.from("profiles").update({ deleted_at: null }).eq("id", user.id);

    // Cancel pending hard-delete queue job
    await sb.from("job_queue")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("queue_name", "account_deletion")
      .eq("status", "pending")
      .contains("payload", { user_id: user.id });

    await sb.from("audit_log").insert({
      user_id: user.id,
      action: "account_deletion_cancelled",
      resource_type: "user",
      resource_id: user.id,
    });

    return new Response(JSON.stringify({
      status: "cancelled",
      message: "Account deletion cancelled. Your account is fully restored.",
    }), { headers: { "Content-Type": "application/json" } });
  }

  // Initiate deletion
  logger.info("Initiating account deletion", { userId: user.id });

  // Check if already pending deletion
  const { data: profile } = await sb.from("profiles")
    .select("deleted_at")
    .eq("id", user.id)
    .single();

  if (profile?.deleted_at) {
    return new Response(JSON.stringify({
      status: "already_pending",
      deleted_at: profile.deleted_at,
      hard_delete_at: new Date(
        new Date(profile.deleted_at).getTime() + GRACE_PERIOD_DAYS * 86400000
      ).toISOString(),
      message: `Account deletion already pending. Hard delete in ${GRACE_PERIOD_DAYS} days. Send {cancel: true} to restore.`,
    }), { headers: { "Content-Type": "application/json" } });
  }

  // Step 1: Soft-delete profile
  const now = new Date().toISOString();
  await sb.from("profiles").update({ deleted_at: now }).eq("id", user.id);

  // Step 2: Schedule hard delete via job_queue
  const hardDeleteAt = new Date(Date.now() + GRACE_PERIOD_DAYS * 86400000).toISOString();
  await sb.from("job_queue").insert({
    queue_name: "account_deletion",
    payload: { user_id: user.id, requested_at: now },
    scheduled_for: hardDeleteAt,
    max_attempts: 1,
  });

  // Step 3: Audit trail
  await sb.from("audit_log").insert({
    user_id: user.id,
    action: "account_deletion_requested",
    resource_type: "user",
    resource_id: user.id,
    details: { grace_period_days: GRACE_PERIOD_DAYS, hard_delete_at: hardDeleteAt },
  });

  // Step 4: Usage event
  await sb.rpc("log_usage_event", {
    p_user_id: user.id,
    p_event_type: "account_deletion_requested",
  });

  return new Response(JSON.stringify({
    status: "pending",
    deleted_at: now,
    hard_delete_at: hardDeleteAt,
    grace_period_days: GRACE_PERIOD_DAYS,
    message: `Account scheduled for deletion. You have ${GRACE_PERIOD_DAYS} days to cancel. Send {cancel: true} to restore.`,
  }), { headers: { "Content-Type": "application/json" } });
});
