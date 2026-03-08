/**
 * BI-01 + BI-02: Deploy Tracker & Build Analytics Edge Function
 *
 * BI-01 Actions:
 *   POST { action: "summary", days: 30 }      → Deploy summary with daily counts, surface health, recent deploys
 *   POST { action: "list", limit: 25 }         → Recent deploy events with build steps
 *   POST { action: "record", surface, ... }    → Record a new deploy event (CI webhook)
 *   POST { action: "complete", deploy_id, ... }→ Mark deploy as success/failed
 *   POST { action: "record-build-step", ... }  → Record a build step within a deploy
 *   POST { action: "health", deploy_id, ... }  → Record a health check result
 *
 * BI-02 Actions:
 *   POST { action: "build-analytics", days: 30 }       → Build step performance, CI health, bundle sizes
 *   POST { action: "record-ci-run", workflow_name, ... }→ Record a GitHub Actions workflow run
 *   POST { action: "complete-ci-run", run_id, ... }     → Complete a CI workflow run
 *   POST { action: "record-bundle-size", surface, ... } → Record bundle size measurement
 *
 * Auth:
 *   - "summary", "list", "build-analytics" require admin role
 *   - Write actions require service role OR valid deploy API key
 *
 * Phase: BI-01 + BI-02 — Build Instrumentation & Deployment Visibility
 * Pair: DevOps + Lead Platform Engineer | Chief Architect reviewer
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { API_VERSION } from "../_shared/api-version.ts";
import { createLogger } from "../_shared/logger.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://brilliantjobs.app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, apikey, x-correlation-id, x-deploy-key",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", "x-api-version": API_VERSION },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const logger = createLogger("deploy-tracker");

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = (body.action as string) || "";

  try {
    // ── Admin-only actions ─────────────────────────────────────────────
    if (action === "summary" || action === "list" || action === "build-analytics") {
      const userRole = req.headers.get("x-gateway-user-role") || "";
      if (userRole !== "admin") {
        return json({ error: "Admin access required" }, 403);
      }
    }

    // ── CI/webhook actions — require service role or deploy key ───────
    if (["record", "complete", "record-build-step", "health", "record-ci-run", "complete-ci-run", "record-bundle-size"].includes(action)) {
      const authHeader = req.headers.get("authorization") || "";
      const deployKey = req.headers.get("x-deploy-key") || "";
      const gatewayRole = req.headers.get("x-gateway-user-role") || "";

      // Allow through if: admin, service_role auth, or valid deploy key from Vault
      const vaultDeployKey = Deno.env.get("DEPLOY_TRACKER_KEY") || "";
      const isAuthorized =
        gatewayRole === "admin" ||
        authHeader.includes("service_role") ||
        (vaultDeployKey && deployKey === vaultDeployKey);

      if (!isAuthorized) {
        return json({ error: "Deploy tracking requires admin or deploy key" }, 403);
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // ACTION: summary — overview stats for admin dashboard
    // ═══════════════════════════════════════════════════════════════════
    if (action === "summary") {
      const days = Number(body.days) || 30;
      const { data, error } = await sb.rpc("fn_deploy_summary", { p_days: days });
      if (error) {
        logger.warn("[deploy-tracker] fn_deploy_summary failed:", error.message);
        return json({ error: "Failed to fetch deploy summary" }, 500);
      }
      return json({ ok: true, summary: data });
    }

    // ═══════════════════════════════════════════════════════════════════
    // ACTION: list — recent deploys with build step counts
    // ═══════════════════════════════════════════════════════════════════
    if (action === "list") {
      const limit = Math.min(Number(body.limit) || 25, 100);
      const surface = body.surface as string | undefined;

      let query = sb
        .from("v_deploy_dashboard")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (surface) {
        query = query.eq("surface", surface);
      }

      const { data, error } = await query;
      if (error) {
        logger.warn("[deploy-tracker] list failed:", error.message);
        return json({ error: "Failed to list deploys" }, 500);
      }
      return json({ ok: true, deploys: data });
    }

    // ═══════════════════════════════════════════════════════════════════
    // ACTION: record — start tracking a new deploy
    // ═══════════════════════════════════════════════════════════════════
    if (action === "record") {
      const { data, error } = await sb.rpc("fn_record_deploy", {
        p_surface: body.surface || "dashboard",
        p_environment: body.environment || "production",
        p_trigger_type: body.trigger_type || "ci",
        p_git_sha: body.git_sha || null,
        p_git_branch: body.git_branch || "main",
        p_git_tag: body.git_tag || null,
        p_product_version: body.product_version || null,
        p_changed_files: Number(body.changed_files) || 0,
        p_changed_summary: body.changed_summary || null,
        p_triggered_by: body.triggered_by || "github-actions",
        p_metadata: body.metadata || {},
      });
      if (error) {
        logger.warn("[deploy-tracker] record failed:", error.message);
        return json({ error: "Failed to record deploy" }, 500);
      }
      return json({ ok: true, deploy_id: data });
    }

    // ═══════════════════════════════════════════════════════════════════
    // ACTION: complete — mark deploy as success/failed
    // ═══════════════════════════════════════════════════════════════════
    if (action === "complete") {
      if (!body.deploy_id) return json({ error: "deploy_id required" }, 400);

      const { error } = await sb.rpc("fn_complete_deploy", {
        p_deploy_id: body.deploy_id,
        p_status: body.status || "success",
        p_duration_ms: Number(body.duration_ms) || null,
        p_error_message: body.error_message || null,
      });
      if (error) {
        logger.warn("[deploy-tracker] complete failed:", error.message);
        return json({ error: "Failed to complete deploy" }, 500);
      }
      return json({ ok: true });
    }

    // ═══════════════════════════════════════════════════════════════════
    // ACTION: record-build-step — log a build step within a deploy
    // ═══════════════════════════════════════════════════════════════════
    if (action === "record-build-step") {
      if (!body.deploy_id) return json({ error: "deploy_id required" }, 400);
      if (!body.step_name) return json({ error: "step_name required" }, 400);

      const { data, error } = await sb.from("build_events").insert({
        deploy_id: body.deploy_id,
        step_name: body.step_name,
        status: body.status || "success",
        duration_ms: Number(body.duration_ms) || null,
        output_size_kb: Number(body.output_size_kb) || null,
        error_message: body.error_message || null,
        metadata: body.metadata || {},
        completed_at: (body.status === "success" || body.status === "failed") ? new Date().toISOString() : null,
      }).select("id").single();

      if (error) {
        logger.warn("[deploy-tracker] record-build-step failed:", error.message);
        return json({ error: "Failed to record build step" }, 500);
      }
      return json({ ok: true, build_event_id: data?.id });
    }

    // ═══════════════════════════════════════════════════════════════════
    // ACTION: health — record a post-deploy health check
    // ═══════════════════════════════════════════════════════════════════
    if (action === "health") {
      if (!body.deploy_id) return json({ error: "deploy_id required" }, 400);

      const { data, error } = await sb.from("deploy_health_log").insert({
        deploy_id: body.deploy_id,
        check_type: body.check_type || "smoke",
        status: body.health_status || "healthy",
        metric_value: body.metric_value || null,
        threshold: body.threshold || null,
        details: body.details || {},
      }).select("id").single();

      if (error) {
        logger.warn("[deploy-tracker] health failed:", error.message);
        return json({ error: "Failed to record health check" }, 500);
      }
      return json({ ok: true, health_check_id: data?.id });
    }

    // ═══════════════════════════════════════════════════════════════════
    // BI-02 ACTION: build-analytics — combined build, CI, and bundle stats
    // ═══════════════════════════════════════════════════════════════════
    if (action === "build-analytics") {
      const days = Number(body.days) || 30;
      const { data, error } = await sb.rpc("fn_build_analytics", { p_days: days });
      if (error) {
        logger.warn("[deploy-tracker] fn_build_analytics failed:", error.message);
        return json({ error: "Failed to fetch build analytics" }, 500);
      }
      return json({ ok: true, analytics: data });
    }

    // ═══════════════════════════════════════════════════════════════════
    // BI-02 ACTION: record-ci-run — start tracking a CI workflow run
    // ═══════════════════════════════════════════════════════════════════
    if (action === "record-ci-run") {
      if (!body.workflow_name) return json({ error: "workflow_name required" }, 400);

      const { data, error } = await sb.from("ci_workflow_runs").insert({
        workflow_name: body.workflow_name,
        run_id: body.run_id || null,
        run_number: body.run_number || null,
        status: body.status || "pending",
        conclusion: body.conclusion || null,
        trigger_event: body.trigger_event || "push",
        git_sha: body.git_sha || null,
        git_branch: body.git_branch || "main",
        actor: body.actor || null,
        runner_os: body.runner_os || "ubuntu-latest",
        duration_ms: Number(body.duration_ms) || null,
        total_jobs: Number(body.total_jobs) || 0,
        failed_jobs: Number(body.failed_jobs) || 0,
        deploy_id: body.deploy_id || null,
        metadata: body.metadata || {},
        completed_at: body.conclusion ? new Date().toISOString() : null,
      }).select("id").single();

      if (error) {
        logger.warn("[deploy-tracker] record-ci-run failed:", error.message);
        return json({ error: "Failed to record CI run" }, 500);
      }
      return json({ ok: true, ci_run_id: data?.id });
    }

    // ═══════════════════════════════════════════════════════════════════
    // BI-02 ACTION: complete-ci-run — update a CI workflow run status
    // ═══════════════════════════════════════════════════════════════════
    if (action === "complete-ci-run") {
      if (!body.ci_run_id && !body.run_id) return json({ error: "ci_run_id or run_id required" }, 400);

      let query;
      if (body.ci_run_id) {
        query = sb.from("ci_workflow_runs").update({
          status: "completed",
          conclusion: body.conclusion || "success",
          duration_ms: Number(body.duration_ms) || null,
          total_jobs: body.total_jobs != null ? Number(body.total_jobs) : undefined,
          failed_jobs: body.failed_jobs != null ? Number(body.failed_jobs) : undefined,
          completed_at: new Date().toISOString(),
        }).eq("id", body.ci_run_id);
      } else {
        query = sb.from("ci_workflow_runs").update({
          status: "completed",
          conclusion: body.conclusion || "success",
          duration_ms: Number(body.duration_ms) || null,
          total_jobs: body.total_jobs != null ? Number(body.total_jobs) : undefined,
          failed_jobs: body.failed_jobs != null ? Number(body.failed_jobs) : undefined,
          completed_at: new Date().toISOString(),
        }).eq("run_id", body.run_id);
      }

      const { error } = await query;
      if (error) {
        logger.warn("[deploy-tracker] complete-ci-run failed:", error.message);
        return json({ error: "Failed to complete CI run" }, 500);
      }
      return json({ ok: true });
    }

    // ═══════════════════════════════════════════════════════════════════
    // BI-02 ACTION: record-bundle-size — log a bundle size measurement
    // ═══════════════════════════════════════════════════════════════════
    if (action === "record-bundle-size") {
      if (!body.surface) return json({ error: "surface required" }, 400);
      if (!body.bundle_name) return json({ error: "bundle_name required" }, 400);
      if (!body.size_bytes) return json({ error: "size_bytes required" }, 400);

      const { data, error } = await sb.from("bundle_size_history").insert({
        surface: body.surface,
        bundle_name: body.bundle_name,
        size_bytes: Number(body.size_bytes),
        gzip_bytes: body.gzip_bytes ? Number(body.gzip_bytes) : null,
        product_version: body.product_version || null,
        git_sha: body.git_sha || null,
        deploy_id: body.deploy_id || null,
        metadata: body.metadata || {},
      }).select("id").single();

      if (error) {
        logger.warn("[deploy-tracker] record-bundle-size failed:", error.message);
        return json({ error: "Failed to record bundle size" }, 500);
      }
      return json({ ok: true, bundle_record_id: data?.id });
    }

    return json({ error: `Unknown action: ${action}` }, 400);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[deploy-tracker] Unhandled error:", msg);
    return json({ error: "Internal server error" }, 500);
  }
});
