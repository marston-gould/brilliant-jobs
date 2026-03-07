// admin-cron-management Edge Function
// CS-P1-016: Full cron management — enable/disable, edit schedule, run history, force-run
// Finding: 0.161, 0.162
//
// Deploy: supabase functions deploy admin-cron-management --no-verify-jwt
// Auth: Requires admin role (checked server-side via shared middleware)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { requireAdmin, authErrorResponse } from "../_shared/admin-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 500) {
  return jsonResponse({ error: message }, status);
}

// ─── Cron job toggle (enable/disable) ───
async function toggleCronJob(
  jobId: number,
  active: boolean,
  adminUserId: string | null
) {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Use raw SQL via rpc to update cron.job directly (cron schema not exposed via REST)
  const { data, error } = await sb.rpc("admin_toggle_cron_job", {
    p_job_id: jobId,
    p_active: active,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Audit trail
  await sb.from("audit_log").insert({
    user_id: adminUserId,
    action: active ? "cron_job_enabled" : "cron_job_disabled",
    resource_type: "cron_job",
    resource_id: String(jobId),
    details: { active },
  });

  return { success: true, active };
}

// ─── Cron job schedule update ───
async function updateCronSchedule(
  jobId: number,
  schedule: string,
  adminUserId: string | null
) {
  // Validate cron expression (basic 5-field check)
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) {
    return { success: false, error: "Invalid cron expression — must be 5 or 6 fields" };
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await sb.rpc("admin_update_cron_schedule", {
    p_job_id: jobId,
    p_schedule: schedule.trim(),
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Audit trail
  await sb.from("audit_log").insert({
    user_id: adminUserId,
    action: "cron_schedule_updated",
    resource_type: "cron_job",
    resource_id: String(jobId),
    details: { schedule },
  });

  return { success: true, schedule };
}

// ─── Cron job run history ───
async function getCronRunHistory(jobId: number, limit = 20) {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await sb.rpc("admin_cron_run_history", {
    p_job_id: jobId,
    p_limit: limit,
  });

  if (error) {
    return { runs: [], error: error.message };
  }

  return { runs: data || [] };
}

// ─── Force-run a cron job (executes the command immediately) ───
async function forceRunCronJob(
  jobId: number,
  adminUserId: string | null
) {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Get job command to show in response
  const { data: jobData, error: jobErr } = await sb.rpc(
    "admin_get_cron_job_command",
    { p_job_id: jobId }
  );

  if (jobErr || !jobData) {
    return { success: false, error: jobErr?.message || "Job not found" };
  }

  // Execute the job command
  const { data, error } = await sb.rpc("admin_force_run_cron_job", {
    p_job_id: jobId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Audit trail
  await sb.from("audit_log").insert({
    user_id: adminUserId,
    action: "cron_job_force_run",
    resource_type: "cron_job",
    resource_id: String(jobId),
    details: { triggered_at: new Date().toISOString() },
  });

  return { success: true, message: "Job triggered" };
}

// ─── Cron alert config CRUD (0.162) ───
async function getCronAlertConfig() {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await sb
    .from("cron_alert_config")
    .select("*")
    .order("job_name", { ascending: true });

  if (error) {
    return { configs: [], error: error.message };
  }
  return { configs: data || [] };
}

async function upsertCronAlertConfig(
  config: {
    job_name: string;
    max_consecutive_failures: number;
    stale_threshold_minutes: number;
    alert_enabled: boolean;
  },
  adminUserId: string | null
) {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await sb
    .from("cron_alert_config")
    .upsert(
      {
        job_name: config.job_name,
        max_consecutive_failures: config.max_consecutive_failures,
        stale_threshold_minutes: config.stale_threshold_minutes,
        alert_enabled: config.alert_enabled,
        updated_by: adminUserId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "job_name" }
    )
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  // Audit
  await sb.from("audit_log").insert({
    user_id: adminUserId,
    action: "cron_alert_config_updated",
    resource_type: "cron_alert_config",
    resource_id: config.job_name,
    details: config,
  });

  return { success: true, config: data };
}

// ═══════════════════════════════════════════════════════════
// Request Handler
// ═══════════════════════════════════════════════════════════

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user } = await requireAdmin(req);
    const adminUserId = user?.id || null;

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "";

    switch (action) {
      case "toggle": {
        const body = await req.json();
        const result = await toggleCronJob(body.job_id, body.active, adminUserId);
        return jsonResponse(result, result.success ? 200 : 400);
      }

      case "update-schedule": {
        const body = await req.json();
        const result = await updateCronSchedule(
          body.job_id,
          body.schedule,
          adminUserId
        );
        return jsonResponse(result, result.success ? 200 : 400);
      }

      case "run-history": {
        const jobId = parseInt(url.searchParams.get("job_id") || "0", 10);
        const limit = parseInt(url.searchParams.get("limit") || "20", 10);
        const result = await getCronRunHistory(jobId, limit);
        return jsonResponse(result);
      }

      case "force-run": {
        const body = await req.json();
        const result = await forceRunCronJob(body.job_id, adminUserId);
        return jsonResponse(result, result.success ? 200 : 400);
      }

      case "alert-config": {
        if (req.method === "GET") {
          const result = await getCronAlertConfig();
          return jsonResponse(result);
        } else {
          const body = await req.json();
          const result = await upsertCronAlertConfig(body, adminUserId);
          return jsonResponse(result, result.success ? 200 : 400);
        }
      }

      default:
        return errorResponse(
          "Unknown action. Use: toggle, update-schedule, run-history, force-run, alert-config",
          400
        );
    }
  } catch (err) {
    try {
      return authErrorResponse(err, corsHeaders);
    } catch {
      console.error("[admin-cron-management]", err);
      return errorResponse(
        err instanceof Error ? err.message : "Internal server error"
      );
    }
  }
});
