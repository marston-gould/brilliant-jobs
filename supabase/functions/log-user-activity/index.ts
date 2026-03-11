// log-user-activity Edge Function — AF-006
// v1.0.0 — Extension + Dashboard activity sync to Supabase
//
// Accepts batch of activity items. Deduplicates by client_id.
// Fire-and-forget from extension — failures do not block UX.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_TYPES = new Set([
  "saved", "applied", "rewrite-offered", "rewrite-submitted",
  "auto-submitted", "score-check", "setup-complete",
  "pipeline-approved", "pipeline-queued",
]);

const VALID_SOURCES = new Set(["extension", "dashboard"]);

const MAX_BATCH_SIZE = 50;

interface ActivityPayload {
  client_id: string;
  activity_type: string;
  source?: string;
  job_title?: string;
  company?: string;
  job_url?: string;
  score?: number;
  mode?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await sb.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;

    // ── Parse body ───────────────────────────────────────────────────────
    const body = await req.json();
    const action = body.action || "batch";

    if (action === "batch") {
      const items: ActivityPayload[] = Array.isArray(body.items) ? body.items : [];

      if (items.length === 0) {
        return new Response(
          JSON.stringify({ inserted: 0, skipped: 0 }),
          { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      if (items.length > MAX_BATCH_SIZE) {
        return new Response(
          JSON.stringify({ error: `Batch size exceeds max ${MAX_BATCH_SIZE}` }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Validate and build rows
      const rows = [];
      const skipped: string[] = [];

      for (const item of items) {
        if (!item.client_id || typeof item.client_id !== "string") {
          skipped.push("missing_client_id");
          continue;
        }
        if (!item.activity_type || !VALID_TYPES.has(item.activity_type)) {
          skipped.push(item.client_id);
          continue;
        }
        const source = item.source && VALID_SOURCES.has(item.source) ? item.source : "extension";

        rows.push({
          user_id: userId,
          client_id: item.client_id,
          activity_type: item.activity_type,
          source,
          job_title: item.job_title || null,
          company: item.company || null,
          job_url: item.job_url || null,
          score: typeof item.score === "number" ? item.score : null,
          mode: item.mode || null,
          metadata: item.metadata || {},
          created_at: item.created_at || new Date().toISOString(),
        });
      }

      let inserted = 0;
      if (rows.length > 0) {
        // ON CONFLICT client_id DO NOTHING — dedup
        const { data, error: insertError } = await sb
          .from("user_activity_log")
          .upsert(rows, { onConflict: "client_id", ignoreDuplicates: true });

        if (insertError) {
          console.warn("[log-user-activity] Insert error:", insertError.message);
          return new Response(
            JSON.stringify({ error: "Insert failed", detail: insertError.message }),
            { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
          );
        }
        inserted = rows.length; // upsert with ignoreDuplicates doesn't return count easily
      }

      return new Response(
        JSON.stringify({ inserted, skipped: skipped.length }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    if (action === "recent") {
      // Dashboard widget: fetch recent activity for current user
      const limit = Math.min(body.limit || 50, 100);
      const { data, error: fetchError } = await sb
        .from("user_activity_log")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (fetchError) {
        console.warn("[log-user-activity] Fetch error:", fetchError.message);
        return new Response(
          JSON.stringify({ error: "Fetch failed" }),
          { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ items: data || [] }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    if (action === "summary") {
      const { data, error: summaryError } = await sb
        .from("v_user_activity_summary")
        .select("*")
        .eq("user_id", userId)
        .single();

      return new Response(
        JSON.stringify(data || { count_24h: 0, count_7d: 0, applied_24h: 0, auto_submitted_24h: 0, saved_24h: 0, from_extension: 0, from_dashboard: 0 }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.warn("[log-user-activity] Unhandled error:", (e as Error).message);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
