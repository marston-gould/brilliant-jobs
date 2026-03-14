// process-pipeline-action Edge Function — FB-PI-001 S3
// Reads classified pipeline_signals and executes stage transitions.
// Fuzzy-matches signals to tracked applications via company/domain/role.
// High/medium confidence + matched app → auto-move.
// Low confidence OR no match → prompt user.
//
// Called by: pg_cron every 15 minutes (staggered 7min after classify cron)
// Auth: service role (internal cron, not user-facing)
//
// HOOK H-PI-03: TransitionHandler interface — auto-move, prompt, or webhook handlers.
// SCAR S-PI-01: LinkedIn/SMS signal sources will route through same matching logic.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Process up to 20 signals per cron invocation
const BATCH_SIZE = 20;
// Minimum pg_trgm similarity score for fuzzy company match (0–1)
const FUZZY_MATCH_THRESHOLD = 0.35;
// Stages that can receive incoming signals (not already terminal)
const MATCHABLE_STAGES = ["saved", "applied", "posting_closed", "responded", "interview"];
// Stage ordering for progression checks
const STAGE_ORDER = [
  "saved", "applied", "posting_closed", "responded",
  "interview", "offer", "hired", "rejected", "archived",
];

// ── PostHog ────────────────────────────────────────────────────────────────
const POSTHOG_HOST = Deno.env.get("POSTHOG_HOST") || "https://us.i.posthog.com";
const POSTHOG_KEY = Deno.env.get("POSTHOG_KEY") || "";

function capturePostHog(event: string, props: Record<string, unknown>): void {
  if (!POSTHOG_KEY) return;
  fetch(`${POSTHOG_HOST}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: POSTHOG_KEY, event, distinct_id: "system", properties: props }),
  }).catch(() => {});
}

// ── Company name normalisation ─────────────────────────────────────────────
// Strips legal suffixes, punctuation, extra whitespace for better fuzzy matching.
function normaliseCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|group|technologies|solutions|labs|studios|ai|io)\b\.?/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Extract root domain for domain-based matching (e.g. "recruiting@stripe.com" → "stripe")
function rootDomain(emailOrDomain: string): string | null {
  const domainMatch = emailOrDomain.match(/@?([^@.]+)\.[^.]+(\.[^.]+)?$/);
  if (!domainMatch) return null;
  // Skip generic email providers
  const generic = new Set(["gmail", "yahoo", "outlook", "hotmail", "icloud", "lever", "greenhouse", "workday", "ashby", "workable", "recruitee", "bamboohr", "taleo", "icims", "smartrecruiters", "jobvite", "paylocity", "adp", "noreply", "no-reply", "donotreply"]);
  const root = domainMatch[1].toLowerCase();
  return generic.has(root) ? null : root;
}

// ── Fuzzy match signal to user_pipeline entry ──────────────────────────────
interface PipelineEntry {
  id: string;
  company_name: string | null;
  company_slug: string | null;
  company_domain: string | null;
  job_title: string | null;
  stage: string;
}

interface MatchResult {
  entry: PipelineEntry | null;
  match_type: "domain" | "exact" | "fuzzy" | "none";
  match_score: number;
}

async function findMatchingApplication(
  userId: string,
  extractedCompany: string | null,
  extractedRole: string | null,
  rawFrom: string | null,
  rawMetadata: Record<string, unknown>,
): Promise<MatchResult> {
  // Fetch user's active pipeline entries
  const { data: entries } = await sb
    .from("user_pipeline")
    .select("id, company_name, company_slug, company_domain, job_title, stage")
    .eq("user_id", userId)
    .in("stage", MATCHABLE_STAGES);

  if (!entries?.length) return { entry: null, match_type: "none", match_score: 0 };

  // ── Strategy 1: Domain match ───────────────────────────────────────────
  // Extract sender root domain and match against company_domain
  const senderDomain = rawFrom ? rootDomain(rawFrom) : null;
  const metaDomain = (rawMetadata.organizer_domain as string | null)
    ? rootDomain(rawMetadata.organizer_domain as string)
    : null;
  const matchDomain = senderDomain || metaDomain;

  if (matchDomain) {
    const domainMatch = entries.find(
      (e) =>
        e.company_domain && rootDomain(e.company_domain) === matchDomain ||
        e.company_slug && e.company_slug.replace(/-/g, "") === matchDomain,
    );
    if (domainMatch) {
      return { entry: domainMatch as PipelineEntry, match_type: "domain", match_score: 1.0 };
    }
  }

  if (!extractedCompany) {
    return { entry: null, match_type: "none", match_score: 0 };
  }

  const normExtracted = normaliseCompany(extractedCompany);

  // ── Strategy 2: Exact normalised company name match ────────────────────
  const exactMatch = entries.find((e) => {
    const normStored = normaliseCompany(e.company_name || e.company_slug || "");
    return normStored === normExtracted && normStored.length > 0;
  });
  if (exactMatch) {
    return { entry: exactMatch as PipelineEntry, match_type: "exact", match_score: 1.0 };
  }

  // ── Strategy 3: pg_trgm fuzzy similarity via RPC ───────────────────────
  // Use PostgreSQL similarity() for fuzzy company name matching
  const { data: fuzzyResults } = await sb.rpc("fn_fuzzy_match_pipeline", {
    p_user_id: userId,
    p_company_name: normExtracted,
    p_threshold: FUZZY_MATCH_THRESHOLD,
    p_stages: MATCHABLE_STAGES,
  });

  if (fuzzyResults?.length) {
    const best = fuzzyResults[0] as { id: string; similarity: number };
    const matchedEntry = entries.find((e) => e.id === best.id);
    if (matchedEntry) {
      return {
        entry: matchedEntry as PipelineEntry,
        match_type: "fuzzy",
        match_score: best.similarity,
      };
    }
  }

  return { entry: null, match_type: "none", match_score: 0 };
}

// ── Stage transition logic ─────────────────────────────────────────────────
function isForwardTransition(currentStage: string, targetStage: string): boolean {
  const currentIdx = STAGE_ORDER.indexOf(currentStage);
  const targetIdx = STAGE_ORDER.indexOf(targetStage);
  return targetIdx > currentIdx;
}

// Timestamp column name for each target stage
function stageTimestampCol(stage: string): string | null {
  const cols: Record<string, string> = {
    applied: "applied_at",
    responded: "responded_at",
    interview: "interview_at",
    offer: "offer_at",
    hired: "hired_at",
    rejected: "rejected_at",
    archived: "archived_at",
  };
  return cols[stage] || null;
}

interface SignalRow {
  id: string;
  user_id: string;
  pipeline_entry_id: string | null;  // may be set from legacy path
  signal_source: string;
  signal_type: string;
  confidence_score: number;
  confidence_level: string;
  extracted_fields: Record<string, unknown>;
  evidence_preview: string | null;
  evidence_metadata: Record<string, unknown>;
  proposed_stage: string;
  inbox_id: string | null;
}

async function processSignal(signal: SignalRow): Promise<{
  action: string;
  match_type?: string;
  stage?: string;
}> {
  const extracted = signal.extracted_fields || {};
  const rawFrom = (signal.evidence_metadata?.raw_from as string) || null;
  const rawMetadata = (signal.evidence_metadata?.source_metadata as Record<string, unknown>) || {};

  // ── 1. Find matching application ─────────────────────────────────────
  let matchResult: MatchResult;

  // If legacy pipeline_entry_id is already set, use it directly
  if (signal.pipeline_entry_id) {
    const { data: entry } = await sb
      .from("user_pipeline")
      .select("id, company_name, company_slug, company_domain, job_title, stage")
      .eq("id", signal.pipeline_entry_id)
      .single();

    matchResult = entry
      ? { entry: entry as PipelineEntry, match_type: "exact", match_score: 1.0 }
      : { entry: null, match_type: "none", match_score: 0 };
  } else {
    matchResult = await findMatchingApplication(
      signal.user_id,
      extracted.company as string | null,
      extracted.role as string | null,
      rawFrom,
      rawMetadata,
    );
  }

  const { entry, match_type, match_score } = matchResult;

  // ── 2. Determine action based on confidence + match ──────────────────
  // Spec §5.3: high/medium + tracked → auto_move; low OR untracked → prompted
  const isHighOrMedium =
    signal.confidence_level === "high" || signal.confidence_level === "medium";

  if (!entry) {
    // Untracked application — always prompt (S4 will handle confirmation cards)
    await sb.from("pipeline_signals").update({
      action_taken: "prompted",
      matched_application_id: null,
      evidence_metadata: {
        ...signal.evidence_metadata,
        match_type: "none",
        match_score: 0,
        untracked: true,
      },
    }).eq("id", signal.id);

    capturePostHog("pipeline_signal_processed", {
      signal_type: signal.signal_type,
      confidence: signal.confidence_score,
      confidence_level: signal.confidence_level,
      action_taken: "prompted",
      source: signal.signal_source,
      match_type: "none",
      untracked: true,
    });

    return { action: "prompted", match_type: "none" };
  }

  const targetStage = signal.proposed_stage;
  const currentStage = entry.stage;

  // Don't process signals for terminal stages or non-forward transitions
  if (!isForwardTransition(currentStage, targetStage)) {
    await sb.from("pipeline_signals").update({
      action_taken: "dismissed",
      matched_application_id: entry.id,
      evidence_metadata: {
        ...signal.evidence_metadata,
        match_type,
        match_score,
        skip_reason: `no_forward_transition: ${currentStage} → ${targetStage}`,
      },
    }).eq("id", signal.id);

    return { action: "dismissed", match_type, stage: currentStage };
  }

  if (isHighOrMedium) {
    // ── Auto-move ──────────────────────────────────────────────────────
    const tsCol = stageTimestampCol(targetStage);
    const updatePayload: Record<string, unknown> = {
      stage: targetStage,
      stage_changed_at: new Date().toISOString(),
      auto_advanced: true,
      auto_advanced_source: `pi_${signal.signal_source}`,
    };
    if (tsCol) updatePayload[tsCol] = new Date().toISOString();

    const { error: moveError } = await sb
      .from("user_pipeline")
      .update(updatePayload)
      .eq("id", entry.id);

    if (moveError) throw new Error(`Stage move failed: ${moveError.message}`);

    // Update signal record
    await sb.from("pipeline_signals").update({
      action_taken: "auto_moved",
      matched_application_id: entry.id,
      target_stage: targetStage,
      previous_stage: currentStage,
      evidence_metadata: {
        ...signal.evidence_metadata,
        match_type,
        match_score,
      },
    }).eq("id", signal.id);

    capturePostHog("pipeline_signal_processed", {
      signal_type: signal.signal_type,
      confidence: signal.confidence_score,
      confidence_level: signal.confidence_level,
      action_taken: "auto_moved",
      source: signal.signal_source,
      match_type,
      from_stage: currentStage,
      to_stage: targetStage,
    });

    capturePostHog("pipeline_stage_auto_moved", {
      user_id: signal.user_id,
      signal_type: signal.signal_type,
      from_stage: currentStage,
      to_stage: targetStage,
      source: signal.signal_source,
      confidence: signal.confidence_score,
    });

    return { action: "auto_moved", match_type, stage: targetStage };

  } else {
    // ── Prompt user (low confidence) ────────────────────────────────────
    await sb.from("pipeline_signals").update({
      action_taken: "prompted",
      matched_application_id: entry.id,
      target_stage: targetStage,
      evidence_metadata: {
        ...signal.evidence_metadata,
        match_type,
        match_score,
      },
    }).eq("id", signal.id);

    capturePostHog("pipeline_signal_processed", {
      signal_type: signal.signal_type,
      confidence: signal.confidence_score,
      confidence_level: signal.confidence_level,
      action_taken: "prompted",
      source: signal.signal_source,
      match_type,
    });

    return { action: "prompted", match_type, stage: targetStage };
  }
}

// ── Main handler ───────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  const isInternalCron = !authHeader;
  if (!isInternalCron && token !== SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const startTime = Date.now();
  let autoMoved = 0, prompted = 0, dismissed = 0, errors = 0;

  try {
    // Fetch classified signals that haven't been acted on yet
    const { data: signals, error: fetchErr } = await sb
      .from("pipeline_signals")
      .select("id, user_id, pipeline_entry_id, signal_source, signal_type, confidence_score, confidence_level, extracted_fields, evidence_preview, evidence_metadata, proposed_stage, inbox_id")
      .is("action_taken", null)
      .not("signal_type", "is", null)  // only S2-classified signals (have signal_type set)
      .not("confidence_score", "is", null)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) throw fetchErr;

    if (!signals?.length) {
      return new Response(JSON.stringify({
        message: "No unprocessed signals",
        stats: { autoMoved: 0, prompted: 0, dismissed: 0, errors: 0, elapsed_ms: Date.now() - startTime },
      }), { headers: { "Content-Type": "application/json" } });
    }

    console.log(`[process-pipeline-action] Processing ${signals.length} classified signals`);

    for (const signal of signals as SignalRow[]) {
      try {
        const result = await processSignal(signal);
        if (result.action === "auto_moved") autoMoved++;
        else if (result.action === "prompted") prompted++;
        else if (result.action === "dismissed") dismissed++;
      } catch (e) {
        console.error(`[process-pipeline-action] Signal ${signal.id} failed:`, (e as Error).message);
        // Mark as error so it doesn't get reprocessed indefinitely
        await sb.from("pipeline_signals").update({
          action_taken: "error",
          evidence_metadata: {
            ...(signal.evidence_metadata || {}),
            process_error: (e as Error).message,
          },
        }).eq("id", signal.id);
        errors++;
      }
    }

    const stats = {
      signals_processed: signals.length,
      auto_moved: autoMoved,
      prompted,
      dismissed,
      errors,
      elapsed_ms: Date.now() - startTime,
    };

    console.log("[process-pipeline-action] Complete", stats);

    capturePostHog("pipeline_action_batch_complete", stats);

    return new Response(JSON.stringify({ message: "Processing complete", stats }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[process-pipeline-action] Fatal:", (e as Error).message);
    capturePostHog("pipeline_action_fatal_error", { error: (e as Error).message });
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
