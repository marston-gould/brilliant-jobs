// account-delete Edge Function
// CS-P1-014: GDPR-compliant account deletion with 30-day grace period
// Findings: AD-CP-002
//
// Endpoints:
//   POST (no body or {})        → Initiate soft-delete
//   POST { cancel: true }       → Cancel pending deletion
//   POST { hard_delete: true }  → Process hard delete (admin or cron only)
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

  // ─── CANCEL DELETION ──────────────────────────────────────
  if (body.cancel === true) {
    logger.info("Cancelling account deletion", { userId: user.id });
    await sb.from("profiles").update({ deleted_at: null }).eq("id", user.id);
    await sb.from("deletion_requests")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("status", "pending");
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

  // ─── HARD DELETE (admin triggered) ─────────────────────────
  if (body.hard_delete === true) {
    const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin required" }), { status: 403 });
    }
    const targetUserId = body.user_id;
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "user_id required" }), { status: 400 });
    }
    logger.info("Processing hard delete", { targetUserId, adminId: user.id });
    try {
      const { data: cascadeResult, error: cascadeErr } = await sb.rpc(
        "hard_delete_user_cascade", { p_user_id: targetUserId }
      );
      if (cascadeErr) {
        return new Response(JSON.stringify({ error: "Cascade failed", details: cascadeErr.message }), { status: 500 });
      }
      let storageDeleted = false;
      try {
        const { data: files } = await sb.storage.from("resumes").list(targetUserId);
        if (files && files.length > 0) {
          await sb.storage.from("resumes").remove(files.map((f: { name: string }) => `${targetUserId}/${f.name}`));
        }
        storageDeleted = true;
      } catch (e) { logger.warn("Storage cleanup non-fatal", { error: String(e) }); }

      const { error: deleteAuthErr } = await sb.auth.admin.deleteUser(targetUserId);
      if (deleteAuthErr) {
        await sb.from("deletion_requests").update({ error_log: { auth_error: deleteAuthErr.message } })
          .eq("user_id", targetUserId).eq("status", "pending");
        return new Response(JSON.stringify({ error: "Auth deletion failed", cascade: cascadeResult }), { status: 500 });
      }

      await sb.from("deletion_requests").update({
        status: "completed", hard_deleted_at: new Date().toISOString(),
        storage_deleted: storageDeleted, third_party_notified: false,
      }).eq("user_id", targetUserId).eq("status", "pending");

      await sb.from("audit_log").insert({
        user_id: user.id, action: "account_hard_deleted",
        resource_type: "user", resource_id: targetUserId,
        details: { cascade_result: cascadeResult, storage_deleted: storageDeleted },
      });

      return new Response(JSON.stringify({
        status: "deleted", user_id: targetUserId, cascade_result: cascadeResult, storage_deleted: storageDeleted,
      }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
    }
  }

  // ─── INITIATE SOFT DELETE ──────────────────────────────────
  logger.info("Initiating account deletion", { userId: user.id });

  const { data: existing } = await sb.from("deletion_requests")
    .select("*").eq("user_id", user.id).eq("status", "pending").maybeSingle();

  if (existing) {
    return new Response(JSON.stringify({
      status: "already_pending", requested_at: existing.requested_at,
      grace_expires_at: existing.grace_expires_at,
      message: `Deletion already pending. Expires ${existing.grace_expires_at}. Send {cancel:true} to restore.`,
    }), { headers: { "Content-Type": "application/json" } });
  }

  const now = new Date().toISOString();
  const graceExpiresAt = new Date(Date.now() + GRACE_PERIOD_DAYS * 86400000).toISOString();

  await sb.from("profiles").update({ deleted_at: now }).eq("id", user.id);
  await sb.from("deletion_requests").insert({
    user_id: user.id, requested_at: now, grace_expires_at: graceExpiresAt, status: "pending",
  });
  await sb.from("audit_log").insert({
    user_id: user.id, action: "account_deletion_requested",
    resource_type: "user", resource_id: user.id,
    details: { grace_period_days: GRACE_PERIOD_DAYS, grace_expires_at: graceExpiresAt },
  });

  try { await sb.auth.admin.signOut(user.id, "global"); } catch (_) {}

  return new Response(JSON.stringify({
    status: "pending", requested_at: now, grace_expires_at: graceExpiresAt,
    grace_period_days: GRACE_PERIOD_DAYS,
    message: `Account scheduled for deletion. ${GRACE_PERIOD_DAYS} days to cancel. All data removed after ${graceExpiresAt}.`,
  }), { headers: { "Content-Type": "application/json" } });
});
