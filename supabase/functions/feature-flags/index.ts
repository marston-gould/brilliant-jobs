// supabase/functions/feature-flags/index.ts
// SA-025: Feature Flags + Experimentation (Phase S5)
// Actions: evaluate, evaluate_all, create, update, list, status, segments, override
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/admin-auth.ts";
import { getWriteClient, getReadClient } from "../_shared/db-client.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FlagEvalContext {
  flag_key: string;
  user_id?: string;
  session_id?: string;
  attributes?: Record<string, unknown>;
  log_evaluation?: boolean;
}

interface CreateFlagPayload {
  key: string;
  name: string;
  description?: string;
  type: "boolean" | "percentage" | "variant";
  rollout_percentage?: number;
  variants?: Array<{ name: string; weight: number; payload?: Record<string, unknown> }>;
  posthog_flag_key?: string;
  posthog_experiment_id?: string;
  owner_email?: string;
}

interface UpdateFlagPayload {
  flag_key: string;
  status?: "draft" | "active" | "paused" | "archived";
  rollout_percentage?: number;
  variants?: Array<{ name: string; weight: number; payload?: Record<string, unknown> }>;
  posthog_flag_key?: string;
  posthog_experiment_id?: string;
  owner_email?: string;
  name?: string;
  description?: string;
}

interface OverridePayload {
  flag_key: string;
  user_id: string;
  is_enabled: boolean;
  variant?: string;
  admin_email: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function logEvaluation(
  db: SupabaseClient,
  flagId: string,
  flagKey: string,
  isEnabled: boolean,
  variant: string | null,
  userId: string | undefined,
  sessionId: string | undefined,
  source: string,
  evalMs: number
): Promise<void> {
  try {
    await db.from("flag_evaluation_log").insert({
      flag_id: flagId,
      flag_key: flagKey,
      user_id: userId ?? null,
      session_id: sessionId ?? null,
      is_enabled: isEnabled,
      variant: variant ?? null,
      evaluation_ms: evalMs,
      source,
    });
  } catch (e) { console.warn("[EF][feature_flags_service]", e?.message || String(e));
    // Fire-and-forget: never block the response on logging
  }
}

// ── Action: evaluate ─────────────────────────────────────────────────────────

async function handleEvaluate(body: FlagEvalContext): Promise<Response> {
  if (!body.flag_key) return err("flag_key is required");

  const db = getReadClient();
  const start = Date.now();

  const userId = body.user_id ?? undefined;
  const attributes = body.attributes ?? {};

  const { data, error } = await db.rpc("fn_evaluate_flag", {
    p_flag_key: body.flag_key,
    p_user_id: userId ?? null,
    p_attributes: attributes,
  });

  if (error) return err(`Evaluation failed: ${error.message}`, 500);

  const evalMs = Date.now() - start;
  const result = data as { enabled: boolean; variant: string | null; bucket: number; reason: string };

  // Async log (fire-and-forget)
  if (body.log_evaluation !== false) {
    const writeDb = getWriteClient();
    // Fetch flag ID for logging
    const { data: flag } = await writeDb
      .from("feature_flags")
      .select("id")
      .ilike("key", body.flag_key)
      .single();

    if (flag) {
      logEvaluation(
        writeDb,
        flag.id,
        body.flag_key,
        result.enabled,
        result.variant,
        userId,
        body.session_id,
        "api",
        evalMs
      );
    }
  }

  return ok({ ...result, flag_key: body.flag_key, eval_ms: evalMs });
}

// ── Action: evaluate_all ─────────────────────────────────────────────────────

async function handleEvaluateAll(body: {
  user_id?: string;
  attributes?: Record<string, unknown>;
}): Promise<Response> {
  const db = getReadClient();

  const { data, error } = await db.rpc("fn_evaluate_all_flags", {
    p_user_id: body.user_id ?? null,
    p_attributes: body.attributes ?? {},
  });

  if (error) return err(`Batch evaluation failed: ${error.message}`, 500);

  return ok({ flags: data, evaluated_at: new Date().toISOString() });
}

// ── Action: list ──────────────────────────────────────────────────────────────

async function handleList(url: URL): Promise<Response> {
  const db = getReadClient();
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");

  let query = db
    .from("v_flag_dashboard")
    .select("*")
    .order("updated_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (type) query = query.eq("type", type);

  const { data, error } = await query;
  if (error) return err(`List failed: ${error.message}`, 500);

  return ok({ flags: data, count: data?.length ?? 0 });
}

// ── Action: status ────────────────────────────────────────────────────────────

async function handleStatus(): Promise<Response> {
  const db = getReadClient();
  const { data, error } = await db.rpc("fn_flag_summary");
  if (error) return err(`Status failed: ${error.message}`, 500);
  return ok({ summary: data });
}

// ── Action: create ────────────────────────────────────────────────────────────

async function handleCreate(body: CreateFlagPayload, req: Request): Promise<Response> {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  if (!body.key || !body.name || !body.type) {
    return err("key, name, and type are required");
  }

  // Validate key format: lowercase, hyphens only
  if (!/^[a-z0-9-]+$/.test(body.key)) {
    return err("key must be lowercase letters, numbers, and hyphens only");
  }

  // Validate variant weights sum to 100
  if (body.type === "variant" && body.variants) {
    const totalWeight = body.variants.reduce((s, v) => s + (v.weight ?? 0), 0);
    if (totalWeight !== 100) {
      return err(`Variant weights must sum to 100 (got ${totalWeight})`);
    }
  }

  const db = getWriteClient();
  const { data, error } = await db
    .from("feature_flags")
    .insert({
      key: body.key,
      name: body.name,
      description: body.description ?? null,
      type: body.type,
      rollout_percentage: body.rollout_percentage ?? 100,
      variants: body.variants ?? [],
      posthog_flag_key: body.posthog_flag_key ?? null,
      posthog_experiment_id: body.posthog_experiment_id ?? null,
      owner_email: body.owner_email ?? null,
    })
    .select()
    .single();

  if (error) return err(`Create failed: ${error.message}`, 500);
  return ok({ flag: data, created: true }, 201);
}

// ── Action: update ────────────────────────────────────────────────────────────

async function handleUpdate(body: UpdateFlagPayload, req: Request): Promise<Response> {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  if (!body.flag_key) return err("flag_key is required");

  const db = getWriteClient();
  const updates: Record<string, unknown> = {};

  if (body.status !== undefined) updates.status = body.status;
  if (body.rollout_percentage !== undefined) updates.rollout_percentage = body.rollout_percentage;
  if (body.variants !== undefined) updates.variants = body.variants;
  if (body.posthog_flag_key !== undefined) updates.posthog_flag_key = body.posthog_flag_key;
  if (body.posthog_experiment_id !== undefined) updates.posthog_experiment_id = body.posthog_experiment_id;
  if (body.owner_email !== undefined) updates.owner_email = body.owner_email;
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;

  if (Object.keys(updates).length === 0) return err("No fields to update");

  // Validate variant weights if updating
  if (updates.variants) {
    const variants = updates.variants as Array<{ weight: number }>;
    const totalWeight = variants.reduce((s, v) => s + (v.weight ?? 0), 0);
    if (totalWeight !== 100) {
      return err(`Variant weights must sum to 100 (got ${totalWeight})`);
    }
  }

  const { data, error } = await db
    .from("feature_flags")
    .update(updates)
    .ilike("key", body.flag_key)
    .select()
    .single();

  if (error) return err(`Update failed: ${error.message}`, 500);

  // If archiving, also set archived_at
  if (body.status === "archived") {
    await db
      .from("feature_flags")
      .update({ archived_at: new Date().toISOString() })
      .ilike("key", body.flag_key);
  }

  return ok({ flag: data, updated: true });
}

// ── Action: segments ─────────────────────────────────────────────────────────

async function handleSegments(): Promise<Response> {
  const db = getReadClient();
  const { data, error } = await db
    .from("user_segments")
    .select("*")
    .order("name");

  if (error) return err(`Segments fetch failed: ${error.message}`, 500);
  return ok({ segments: data });
}

// ── Action: override ─────────────────────────────────────────────────────────

async function handleOverride(body: OverridePayload, req: Request): Promise<Response> {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  if (!body.flag_key || !body.user_id || !body.admin_email) {
    return err("flag_key, user_id, and admin_email are required");
  }

  const db = getWriteClient();

  // Fetch flag ID
  const { data: flag, error: flagErr } = await db
    .from("feature_flags")
    .select("id")
    .ilike("key", body.flag_key)
    .single();

  if (flagErr || !flag) return err(`Flag '${body.flag_key}' not found`, 404);

  // Compute a stable bucket for this user (0 = always visible)
  const bucket = Math.abs(
    (body.user_id.charCodeAt(0) * 31 + body.flag_key.charCodeAt(0)) % 100
  );

  const { error } = await db.from("flag_assignments").upsert(
    {
      flag_id: flag.id,
      user_id: body.user_id,
      bucket,
      variant: body.variant ?? null,
      is_enabled: body.is_enabled,
      overridden: true,
      override_by: body.admin_email,
    },
    { onConflict: "flag_id,user_id" }
  );

  if (error) return err(`Override failed: ${error.message}`, 500);

  return ok({
    overridden: true,
    flag_key: body.flag_key,
    user_id: body.user_id,
    is_enabled: body.is_enabled,
    variant: body.variant ?? null,
  });
}

// ── Router ────────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "";

    if (req.method === "GET") {
      if (action === "list" || action === "") return handleList(url);
      if (action === "status") return handleStatus();
      if (action === "segments") return handleSegments();
      return err("Unknown action", 404);
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const act = body.action ?? action;

      switch (act) {
        case "evaluate":      return handleEvaluate(body as FlagEvalContext);
        case "evaluate_all":  return handleEvaluateAll(body);
        case "create":        return handleCreate(body as CreateFlagPayload, req);
        case "update":        return handleUpdate(body as UpdateFlagPayload, req);
        case "override":      return handleOverride(body as OverridePayload, req);
        case "status":        return handleStatus();
        case "segments":      return handleSegments();
        default:              return err(`Unknown action: ${act}`, 404);
      }
    }

    return err("Method not allowed", 405);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return err(`Internal error: ${msg}`, 500);
  }
});
