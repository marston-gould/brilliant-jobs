/**
 * REM-003: Cost Monitor Edge Function
 *
 * Actions:
 *   POST { action: "summary", days: 30 }   → Cost summary with daily trend + per-function breakdown
 *   POST { action: "daily", days: 7 }      → Daily cost aggregation
 *   POST { action: "weekly" }               → Weekly cost aggregation
 *   POST { action: "monthly" }              → Monthly cost with budget comparison
 *   POST { action: "budget-update", vendor, monthly_budget } → Update budget threshold
 *
 * Auth: All actions require admin role.
 *
 * Phase: REM-003 — Edge Function Hardening + Cost Monitoring
 * Pair: Backend + DevOps
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
    "Authorization, Content-Type, apikey, x-correlation-id",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", "x-api-version": API_VERSION },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const logger = createLogger("cost-monitor");

  // Admin auth check via gateway header
  const userRole = req.headers.get("x-gateway-user-role") || "";
  if (userRole !== "admin") {
    return json({ error: "Admin access required" }, 403);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: { action?: string; days?: number; vendor?: string; monthly_budget?: number } = {};
  try { body = await req.json(); } catch (e) { console.warn("[EF][cost-monitor]", e?.message || String(e)); }

  const action = body.action || "summary";
  const days = Math.min(body.days || 30, 365);

  try {
    if (action === "summary") {
      const { data, error } = await sb.rpc("fn_ai_cost_summary", { p_days: days });
      if (error) throw error;
      logger.info("Cost summary retrieved", { days });
      return json({ ok: true, data });
    }

    if (action === "daily") {
      const { data, error } = await sb
        .from("v_ai_cost_daily")
        .select("*")
        .gte("day", new Date(Date.now() - days * 86400000).toISOString().slice(0, 10))
        .order("day", { ascending: false })
        .limit(100);
      if (error) throw error;
      return json({ ok: true, data });
    }

    if (action === "weekly") {
      const { data, error } = await sb
        .from("v_ai_cost_weekly")
        .select("*")
        .order("week_start", { ascending: false })
        .limit(52);
      if (error) throw error;
      return json({ ok: true, data });
    }

    if (action === "monthly") {
      const { data, error } = await sb
        .from("v_ai_cost_monthly")
        .select("*")
        .order("month_start", { ascending: false })
        .limit(12);
      if (error) throw error;
      return json({ ok: true, data });
    }

    if (action === "budget-update") {
      if (!body.vendor || body.monthly_budget === undefined) {
        return json({ error: "vendor and monthly_budget required" }, 400);
      }
      const { error } = await sb
        .from("vendor_cost_budgets")
        .upsert({
          vendor: body.vendor,
          monthly_budget: body.monthly_budget,
          updated_at: new Date().toISOString(),
        }, { onConflict: "vendor" });
      if (error) throw error;
      logger.info("Budget updated", { vendor: body.vendor, budget: body.monthly_budget });
      return json({ ok: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);

  } catch (e) {
    logger.error("Cost monitor error", { action, error: e.message });
    return json({ error: e.message }, 500);
  }
});
