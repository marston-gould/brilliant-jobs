// pipeline-write Edge Function — Overlay Pipeline S5
// v1.0.0 — Brilliant Jobs v6.99
//
// ROLE: Canonical server-side write path for all toolbar + autoTracker pipeline events.
// Replaces direct PostgREST REST calls from background.js (bj:toolbar:save) and
// autoTracker._writeToNewPipeline(). Both callers converge here.
//
// Conflict resolution: UPSERT on (user_id, source_url).
// Stage advance rule: only advance if new stage >= current stage in enum order.
// activity_log: always appends — never overwrites.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Canonical stage order for advancement logic
const STAGE_ORDER: string[] = [
  "saved",
  "applied",
  "phone_screen",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "posting_closed",
];

function stageRank(stage: string): number {
  const idx = STAGE_ORDER.indexOf(stage);
  return idx === -1 ? 0 : idx;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // ── Auth ─────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return jsonResponse({ error: "Unauthorized" }, 401);

  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

  // ── Parse body ───────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const {
    source_url,
    source_platform,
    job_title,
    company_name,
    stage = "saved",
    entry_source = "overlay",
    activity_log_entry,
    // optional enrichment fields
    job_id_ref,
    ats_source_ref,
    location,
    applied_at,
    confirmation_detected,
    confirmation_pattern,
    resume_id,
  } = body as Record<string, unknown>;

  if (!source_url || typeof source_url !== "string") {
    return jsonResponse({ error: "source_url is required" }, 400);
  }

  const now = new Date().toISOString();
  const newLogEntry = activity_log_entry || {
    action: stage as string,
    timestamp: now,
    detail: { source: entry_source, platform: source_platform },
  };

  // ── Lookup existing row ──────────────────────────────────────────
  const { data: existing, error: selectErr } = await sb
    .from("pipeline")
    .select("id, stage, activity_log")
    .eq("user_id", user.id)
    .eq("source_url", source_url)
    .maybeSingle();

  if (selectErr) {
    console.error("[pipeline-write] Select error:", selectErr.message);
    return jsonResponse({ error: "DB error" }, 500);
  }

  if (existing) {
    // ── UPDATE PATH ─────────────────────────────────────────────
    const existingLog: unknown[] = Array.isArray(existing.activity_log)
      ? existing.activity_log
      : [];
    const newLog = [...existingLog, newLogEntry];

    const updatePayload: Record<string, unknown> = {
      activity_log: newLog,
      updated_at: now,
    };

    // Advance stage only if new stage is strictly higher rank
    const incomingRank = stageRank(stage as string);
    const currentRank = stageRank(existing.stage);
    if (incomingRank > currentRank) {
      updatePayload.stage = stage;
      updatePayload.stage_changed_at = now;
      if (stage === "applied") {
        updatePayload.applied_at = applied_at || now;
      }
    }

    // Merge optional fields if provided
    if (confirmation_detected !== undefined) {
      updatePayload.confirmation_detected = confirmation_detected;
      updatePayload.confirmation_pattern = confirmation_pattern || null;
    }

    const { error: updateErr } = await sb
      .from("pipeline")
      .update(updatePayload)
      .eq("id", existing.id);

    if (updateErr) {
      console.error("[pipeline-write] Update error:", updateErr.message);
      return jsonResponse({ error: "DB error" }, 500);
    }

    console.log(`[pipeline-write] Updated: ${existing.id} | stage: ${existing.stage} → ${updatePayload.stage || existing.stage}`);
    return jsonResponse({ ok: true, action: "updated", id: existing.id });

  } else {
    // ── INSERT PATH ─────────────────────────────────────────────
    const insertPayload: Record<string, unknown> = {
      user_id: user.id,
      source_url,
      source_platform: source_platform || "unknown",
      job_title: job_title || "Unknown Title",
      company_name: company_name || "",
      stage,
      entry_source,
      stage_changed_at: now,
      activity_log: [newLogEntry],
      migration_version: 1,
    };

    // Optional fields
    if (job_id_ref) insertPayload.job_id_ref = job_id_ref;
    if (ats_source_ref) insertPayload.ats_source_ref = ats_source_ref;
    if (location) insertPayload.location = location;
    if (resume_id) insertPayload.resume_id = resume_id;
    if (stage === "applied") {
      insertPayload.applied_at = applied_at || now;
    }
    if (confirmation_detected !== undefined) {
      insertPayload.confirmation_detected = confirmation_detected;
      insertPayload.confirmation_pattern = confirmation_pattern || null;
    }

    const { data: inserted, error: insertErr } = await sb
      .from("pipeline")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertErr) {
      console.error("[pipeline-write] Insert error:", insertErr.message);
      return jsonResponse({ error: "DB error", detail: insertErr.message }, 500);
    }

    console.log(`[pipeline-write] Inserted: ${inserted.id} | source: ${entry_source} | stage: ${stage}`);
    return jsonResponse({ ok: true, action: "inserted", id: inserted.id });
  }
});
