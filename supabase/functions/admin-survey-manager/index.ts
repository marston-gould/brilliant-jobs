// admin-survey-manager Edge Function — FB-SURVEY-ADMIN-001 SVM-S1
// Admin CRUD for survey campaigns.
// Actions: list, get, create, update, delete (soft), duplicate
// Auth: service_role or admin JWT only.
// Gateway route #141.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "https://brilliantjobs.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", ...CORS },
  });
}

// ─── List ─────────────────────────────────────────────────────────────────────
async function handleList(includeInactive: boolean): Promise<Response> {
  let query = sb.from("survey_campaigns")
    .select("id,survey_version,survey_type,title,description,estimated_minutes,credit_reward,priority,is_active,channels,target_audience,frequency_days,created_at,expires_at,questions,audience_config,trigger_config,placement_config")
    .order("priority", { ascending: true });

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data: campaigns, error } = await query;
  if (error) return json({ error: "Failed to fetch campaigns", detail: error.message }, 500);

  // Get response counts per campaign
  const versions = (campaigns || []).map((c: { survey_version: string }) => c.survey_version);
  let responseCounts: Record<string, number> = {};

  if (versions.length > 0) {
    const { data: feedback } = await sb.from("feedback")
      .select("survey_version")
      .in("survey_version", versions);
    if (feedback) {
      for (const f of feedback) {
        responseCounts[f.survey_version] = (responseCounts[f.survey_version] || 0) + 1;
      }
    }
  }

  const enriched = (campaigns || []).map((c: Record<string, unknown>) => ({
    ...c,
    response_count: responseCounts[c.survey_version as string] || 0,
  }));

  return json({ campaigns: enriched, total: enriched.length });
}

// ─── Get ──────────────────────────────────────────────────────────────────────
async function handleGet(id: string): Promise<Response> {
  const { data, error } = await sb.from("survey_campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return json({ error: "Campaign not found" }, 404);

  // Get response count
  const { count } = await sb.from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("survey_version", data.survey_version);

  return json({ campaign: { ...data, response_count: count || 0 } });
}

// ─── Create ───────────────────────────────────────────────────────────────────
async function handleCreate(body: Record<string, unknown>): Promise<Response> {
  const required = ["survey_version", "survey_type", "title"];
  for (const field of required) {
    if (!body[field]) return json({ error: `Missing required field: ${field}` }, 400);
  }

  // Validate survey_type
  const validTypes = ["nps", "periodic", "micro", "exit"];
  if (!validTypes.includes(body.survey_type as string)) {
    return json({ error: `Invalid survey_type. Must be one of: ${validTypes.join(", ")}` }, 400);
  }

  // Build channels array from placement_config if provided
  const placement = body.placement_config as Record<string, Record<string, unknown>> | undefined;
  let channels: string[] = [];
  if (placement) {
    if (placement.overlay?.enabled) channels.push("overlay");
    if (placement.merch?.enabled) channels.push("merch");
    if (placement.email?.enabled) channels.push("email");
    if (placement.sms?.enabled) channels.push("sms");
  } else {
    channels = (body.channels as string[]) || ["overlay"];
  }

  const row = {
    survey_version: body.survey_version,
    survey_type: body.survey_type,
    title: body.title,
    description: body.description || null,
    estimated_minutes: body.estimated_minutes || 2,
    credit_reward: body.credit_reward || 0,
    priority: body.priority || 5,
    is_active: body.is_active !== false,
    channels,
    target_audience: body.target_audience || body.audience_config || {},
    frequency_days: body.frequency_days || 14,
    expires_at: body.expires_at || null,
    questions: body.questions || null,
    audience_config: body.audience_config || { type: "all" },
    trigger_config: body.trigger_config || { type: "page_navigation" },
    placement_config: body.placement_config || null,
  };

  const { data, error } = await sb.from("survey_campaigns").insert(row).select().single();
  if (error) {
    if (error.code === "23505") return json({ error: "survey_version already exists" }, 409);
    return json({ error: "Failed to create campaign", detail: error.message }, 500);
  }

  // Audit log
  await sb.from("admin_audit_log").insert({
    action: "survey_campaign_created",
    entity_type: "survey_campaign",
    entity_id: data.id,
    details: { survey_version: data.survey_version, title: data.title },
  }).catch(() => { /* non-fatal */ });

  return json({ campaign: data }, 201);
}

// ─── Update ───────────────────────────────────────────────────────────────────
async function handleUpdate(id: string, body: Record<string, unknown>): Promise<Response> {
  // Fetch current for audit diff
  const { data: before } = await sb.from("survey_campaigns").select("*").eq("id", id).single();
  if (!before) return json({ error: "Campaign not found" }, 404);

  // Build update payload (only include provided fields)
  const allowed = [
    "title", "description", "estimated_minutes", "credit_reward", "priority",
    "is_active", "channels", "target_audience", "frequency_days", "expires_at",
    "questions", "audience_config", "trigger_config", "placement_config", "survey_type"
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  // Sync channels array from placement_config if updated
  if (updates.placement_config) {
    const p = updates.placement_config as Record<string, Record<string, unknown>>;
    const ch: string[] = [];
    if (p.overlay?.enabled) ch.push("overlay");
    if (p.merch?.enabled) ch.push("merch");
    if (p.email?.enabled) ch.push("email");
    if (p.sms?.enabled) ch.push("sms");
    updates.channels = ch;
  }

  if (Object.keys(updates).length === 0) {
    return json({ error: "No fields to update" }, 400);
  }

  const { data, error } = await sb.from("survey_campaigns")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return json({ error: "Failed to update campaign", detail: error.message }, 500);

  // Audit log with diff
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of Object.keys(updates)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(updates[key])) {
      diff[key] = { before: before[key], after: updates[key] };
    }
  }
  await sb.from("admin_audit_log").insert({
    action: "survey_campaign_updated",
    entity_type: "survey_campaign",
    entity_id: id,
    details: { survey_version: data.survey_version, diff },
  }).catch(() => { /* non-fatal */ });

  return json({ campaign: data });
}

// ─── Delete (soft) ────────────────────────────────────────────────────────────
async function handleDelete(id: string): Promise<Response> {
  const { data, error } = await sb.from("survey_campaigns")
    .update({ is_active: false })
    .eq("id", id)
    .select("id,survey_version")
    .single();

  if (error || !data) return json({ error: "Campaign not found" }, 404);

  await sb.from("admin_audit_log").insert({
    action: "survey_campaign_deleted",
    entity_type: "survey_campaign",
    entity_id: id,
    details: { survey_version: data.survey_version },
  }).catch(() => { /* non-fatal */ });

  return json({ deleted: true, campaign: data });
}

// ─── Duplicate ────────────────────────────────────────────────────────────────
async function handleDuplicate(id: string): Promise<Response> {
  const { data: source, error } = await sb.from("survey_campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !source) return json({ error: "Campaign not found" }, 404);

  // Generate new version suffix
  const suffix = "_copy_" + Date.now().toString(36);
  const newVersion = source.survey_version + suffix;

  const clone = {
    survey_version: newVersion,
    survey_type: source.survey_type,
    title: source.title + " (Copy)",
    description: source.description,
    estimated_minutes: source.estimated_minutes,
    credit_reward: source.credit_reward,
    priority: source.priority,
    is_active: false, // copies start inactive
    channels: source.channels,
    target_audience: source.target_audience,
    frequency_days: source.frequency_days,
    expires_at: null,
    questions: source.questions,
    audience_config: source.audience_config,
    trigger_config: source.trigger_config,
    placement_config: source.placement_config,
  };

  const { data: created, error: createErr } = await sb.from("survey_campaigns")
    .insert(clone).select().single();

  if (createErr) return json({ error: "Failed to duplicate", detail: createErr.message }, 500);

  await sb.from("admin_audit_log").insert({
    action: "survey_campaign_duplicated",
    entity_type: "survey_campaign",
    entity_id: created.id,
    details: { source_id: id, source_version: source.survey_version, new_version: newVersion },
  }).catch(() => { /* non-fatal */ });

  return json({ campaign: created }, 201);
}

// ─── Router ───────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = (body.action as string) || new URL(req.url).searchParams.get("action") || "list";

    switch (action) {
      case "list":
        return await handleList(body.include_inactive === true);

      case "get":
        if (!body.id) return json({ error: "id required" }, 400);
        return await handleGet(body.id as string);

      case "create":
        return await handleCreate(body);

      case "update":
        if (!body.id) return json({ error: "id required" }, 400);
        return await handleUpdate(body.id as string, body);

      case "delete":
        if (!body.id) return json({ error: "id required" }, 400);
        return await handleDelete(body.id as string);

      case "duplicate":
        if (!body.id) return json({ error: "id required" }, 400);
        return await handleDuplicate(body.id as string);

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("[admin-survey-manager] Fatal error:", String(e));
    return json({ error: "Internal server error", detail: String(e) }, 500);
  }
});
