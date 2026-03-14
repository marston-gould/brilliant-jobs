// supabase/functions/ghost-report-submit/index.ts
// FB-GHOST-BADGE-001: Self-reported ghost submission.
// Validates application belongs to user, inserts ghost_reports row,
// triggers immediate ghost_company_scores refresh for that company.
// Auth: user JWT required (bearer token).
// Gateway route #120 (FB-GHOST-BADGE-001).

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL             = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY        = Deno.env.get("SUPABASE_ANON_KEY")!;
const POSTHOG_KEY              = Deno.env.get("POSTHOG_API_KEY") || "";
const POSTHOG_HOST             = Deno.env.get("POSTHOG_HOST") || "https://app.posthog.com";

const CORS = {
  "Access-Control-Allow-Origin":  "https://brilliantjobs.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function capturePostHog(distinctId: string, event: string, props: Record<string, unknown>) {
  if (!POSTHOG_KEY) return;
  try {
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: POSTHOG_KEY, distinct_id: distinctId, event, properties: props }),
    });
  } catch (_) { /* fire-and-forget */ }
}

// Normalize company name for consistent aggregation keys
function normalizeCompanyName(name: string): string {
  return name.trim().toLowerCase().replace(/[,.'"\-]+/g, " ").replace(/\s+/g, " ").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // User JWT auth
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });
  }
  const token = authHeader.slice(7);

  // Create both user-scoped and service-role clients
  const sbUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const sbService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: { user }, error: authErr } = await sbUser.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });
    }

    const body = await req.json();
    const { application_id, company_name, days_since_applied } = body as {
      application_id?: string;
      company_name: string;
      days_since_applied?: number;
    };

    if (!company_name) {
      return new Response(JSON.stringify({ error: "company_name required" }), { status: 400, headers: CORS });
    }

    const normalizedCompany = normalizeCompanyName(company_name);

    // If application_id provided, validate it belongs to this user
    if (application_id) {
      const { data: app, error: appErr } = await sbUser
        .from("pending_applications")
        .select("id, user_id, company_name")
        .eq("id", application_id)
        .eq("user_id", user.id)
        .single();

      if (appErr || !app) {
        return new Response(JSON.stringify({ error: "Application not found or unauthorized" }), {
          status: 404, headers: CORS,
        });
      }
    }

    // Check for existing active report in last 90 days (dedup)
    const { data: existing } = await sbService
      .from("ghost_reports")
      .select("id")
      .eq("user_id", user.id)
      .eq("company_name", normalizedCompany)
      .eq("source", "self_reported")
      .eq("is_active", true)
      .gte("reported_at", new Date(Date.now() - 90 * 86400_000).toISOString())
      .limit(1)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ already_reported: true, message: "You've already reported this company recently." }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Insert ghost_report
    const { data: report, error: insertErr } = await sbService
      .from("ghost_reports")
      .insert({
        user_id:        user.id,
        company_name:   normalizedCompany,
        application_id: application_id || null,
        source:         "self_reported",
        confidence:     1.0,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("[ghost-report-submit] Insert error:", insertErr.message);
      return new Response(JSON.stringify({ error: insertErr.message }), { status: 500, headers: CORS });
    }

    // Trigger immediate score refresh for this company
    try {
      await sbService.rpc("fn_ghost_score_refresh");
    } catch (refreshErr) {
      console.warn("[ghost-report-submit] Score refresh failed (non-fatal):", String(refreshErr));
    }

    // Fetch updated score for immediate badge render in the UI
    const { data: score } = await sbService
      .from("ghost_company_scores")
      .select("effective_count, tier, self_reported_count, auto_inferred_count")
      .eq("company_name", normalizedCompany)
      .maybeSingle();

    // PostHog
    await capturePostHog(user.id, "ghost_self_report_confirmed", {
      company_name:      company_name,
      application_id:    application_id || null,
      days_since_applied: days_since_applied || null,
      surface:           "ghost_report_submit",
    });

    return new Response(JSON.stringify({
      success:    true,
      report_id:  report.id,
      score:      score || null,
    }), {
      status:  200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[ghost-report-submit] Unexpected error:", String(err));
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
