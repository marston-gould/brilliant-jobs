/**
 * SA-028: Capacity Model + Scaling Triggers Edge Function
 *
 * Actions:
 *   POST { action: "snapshot" }        → Capture current capacity snapshot
 *   POST { action: "forecast" }        → Growth projections at 6/12/24 months
 *   POST { action: "cost-model" }      → Update cost projections per service
 *   POST { action: "triggers" }        → Evaluate scaling triggers now
 *   POST { action: "summary" }         → Full capacity summary (admin dashboard)
 *   POST { action: "acknowledge" }     → Acknowledge a scaling trigger alert
 *
 * Auth: All actions require admin role (via gateway x-gateway-user-role header).
 *
 * Phase: S6 — Architecture Governance
 * Pair: System Architect—Scalability + DevOps + Data Eng
 * Reviewer: Chief Architect
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { API_VERSION } from "../_shared/api-version.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://brilliantjobs.app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, apikey, x-correlation-id",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const correlationId =
    req.headers.get("x-correlation-id") ?? crypto.randomUUID();

  // Admin auth check (gateway sets this header after verifying JWT)
  const userRole = req.headers.get("x-gateway-user-role");
  if (userRole !== "admin") {
    return jsonResponse({ error: "Admin access required" }, 403, correlationId);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action as string;
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    switch (action) {
      // ── snapshot: Capture current capacity metrics ──
      case "snapshot": {
        const { data, error } = await adminClient.rpc(
          "fn_capture_capacity_snapshot",
        );
        if (error) {
          return jsonResponse(
            {
              action: "snapshot",
              status: "error",
              error: error.message,
            },
            500,
            correlationId,
          );
        }
        return jsonResponse(
          {
            action: "snapshot",
            status: "captured",
            snapshot_id: data,
            captured_at: new Date().toISOString(),
          },
          200,
          correlationId,
        );
      }

      // ── forecast: Growth projections at 6/12/24 months ──
      case "forecast": {
        const growthRate = body.growth_rate_pct ?? 15.0;
        const { data, error } = await adminClient.rpc("fn_capacity_forecast", {
          p_growth_rate_pct: growthRate,
        });
        if (error) {
          return jsonResponse(
            {
              action: "forecast",
              status: "error",
              error: error.message,
            },
            500,
            correlationId,
          );
        }
        return jsonResponse(
          {
            action: "forecast",
            status: "computed",
            growth_rate_pct: growthRate,
            forecast: data,
          },
          200,
          correlationId,
        );
      }

      // ── cost-model: Update cost projections per service ──
      case "cost-model": {
        const growthRate = body.growth_rate_pct ?? 15.0;
        const { data, error } = await adminClient.rpc("fn_cost_model", {
          p_growth_rate_pct: growthRate,
        });
        if (error) {
          return jsonResponse(
            {
              action: "cost-model",
              status: "error",
              error: error.message,
            },
            500,
            correlationId,
          );
        }

        // Fetch updated projections for response
        const { data: projections } = await adminClient
          .from("cost_projections")
          .select("*")
          .order("cost_current_mo", { ascending: false });

        return jsonResponse(
          {
            action: "cost-model",
            status: "updated",
            result: data,
            projections: projections ?? [],
          },
          200,
          correlationId,
        );
      }

      // ── triggers: Evaluate scaling triggers now ──
      case "triggers": {
        const { data, error } = await adminClient.rpc(
          "fn_evaluate_scaling_triggers",
        );
        if (error) {
          return jsonResponse(
            {
              action: "triggers",
              status: "error",
              error: error.message,
            },
            500,
            correlationId,
          );
        }

        // Fetch current trigger config for dashboard
        const { data: config } = await adminClient
          .from("scaling_trigger_config")
          .select("*")
          .order("trigger_name");

        return jsonResponse(
          {
            action: "triggers",
            status: "evaluated",
            result: data,
            config: config ?? [],
          },
          200,
          correlationId,
        );
      }

      // ── summary: Full capacity summary for admin dashboard ──
      case "summary": {
        const { data, error } = await adminClient.rpc("fn_capacity_summary");
        if (error) {
          return jsonResponse(
            {
              action: "summary",
              status: "error",
              error: error.message,
            },
            500,
            correlationId,
          );
        }

        // Also fetch recent alerts and cost projections
        const { data: alerts } = await adminClient
          .from("scaling_trigger_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20);

        const { data: costs } = await adminClient
          .from("cost_projections")
          .select("*")
          .order("cost_current_mo", { ascending: false });

        // Fetch snapshot history for trend charts (last 24h)
        const { data: history } = await adminClient
          .from("capacity_snapshots")
          .select(
            "id, captured_at, db_total_rows, db_connections_active, total_users, active_users_24h, replica_lag_ms, total_monthly_spend",
          )
          .gte(
            "captured_at",
            new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          )
          .order("captured_at", { ascending: true });

        return jsonResponse(
          {
            action: "summary",
            status: "ok",
            summary: data,
            recent_alerts: alerts ?? [],
            cost_projections: costs ?? [],
            snapshot_history_24h: history ?? [],
          },
          200,
          correlationId,
        );
      }

      // ── acknowledge: Mark a trigger alert as acknowledged ──
      case "acknowledge": {
        const alertId = body.alert_id;
        const userId = req.headers.get("x-gateway-user-id") ?? "admin";

        if (!alertId) {
          return jsonResponse(
            { error: "alert_id required" },
            400,
            correlationId,
          );
        }

        const { error } = await adminClient
          .from("scaling_trigger_log")
          .update({
            acknowledged_at: new Date().toISOString(),
            acknowledged_by: userId,
          })
          .eq("id", alertId);

        if (error) {
          return jsonResponse(
            {
              action: "acknowledge",
              status: "error",
              error: error.message,
            },
            500,
            correlationId,
          );
        }

        return jsonResponse(
          {
            action: "acknowledge",
            status: "acknowledged",
            alert_id: alertId,
            acknowledged_by: userId,
          },
          200,
          correlationId,
        );
      }

      default:
        return jsonResponse(
          {
            error: "Unknown action",
            valid_actions: [
              "snapshot",
              "forecast",
              "cost-model",
              "triggers",
              "summary",
              "acknowledge",
            ],
          },
          400,
          correlationId,
        );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: "Internal error", detail: message },
      500,
      correlationId ?? "",
    );
  }
});

function jsonResponse(
  body: unknown,
  status: number,
  correlationId?: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(correlationId ? { "x-correlation-id": correlationId } : {}),
      "x-api-version": API_VERSION,
      ...CORS_HEADERS,
    },
  });
}
