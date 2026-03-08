// supabase/functions/mock-ats-submit/index.ts
// D2: Mock ATS submission endpoint for Apply Workflow testing
// Simulates ATS submission with 80/10/10 success/rejected/timeout distribution
// v4.84 — February 25, 2026
//
// Deploy: supabase functions deploy mock-ats-submit --project-ref qojhagupdnbtomfoxnsf

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createLogger } from "../_shared/logger.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://brilliantjobs.app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Outcome Distribution ───────────────────────────────────
// 80% success, 10% rejected, 10% timeout
function rollOutcome(): "success" | "rejected" | "timeout" {
  const roll = Math.random();
  if (roll < 0.80) return "success";
  if (roll < 0.90) return "rejected";
  return "timeout";
}

// ─── Response Generators ────────────────────────────────────
function makeSuccessResponse(atsSource: string) {
  return {
    status: "submitted",
    confirmation_id: `mock-conf-${crypto.randomUUID().slice(0, 12)}`,
    ats_source: atsSource,
    submitted_at: new Date().toISOString(),
  };
}

function makeRejectedResponse() {
  const reasons = [
    { error: "missing_field", detail: "Phone number required" },
    { error: "missing_field", detail: "Cover letter required for this position" },
    { error: "invalid_resume", detail: "Resume file format not supported" },
    { error: "position_closed", detail: "This position is no longer accepting applications" },
    { error: "duplicate_application", detail: "An application from this email already exists" },
  ];
  const reason = reasons[Math.floor(Math.random() * reasons.length)];
  return { status: "rejected", ...reason };
}

// ─── Request Validation ─────────────────────────────────────
interface MockAtsRequest {
  job_id: string;
  ats_source: string;
  ats_job_url: string;
  resume_file_id: string;
  resume_filename: string;
  resume_version: string;
  rewrite_id?: string | null;
  applicant: {
    name: string;
    email: string;
    phone?: string;
    linkedin?: string;
  };
  apply_mode: string;
  score?: number | null;
  was_rewritten: boolean;
  filter_id?: number | null;
  pending_application_id: string;
  idempotency_key: string;
}

const REQUIRED_FIELDS = [
  "job_id", "ats_source", "ats_job_url", "resume_file_id",
  "resume_filename", "resume_version", "apply_mode",
  "pending_application_id", "idempotency_key"
];

const VALID_ATS = ["greenhouse", "lever", "ashby", "workable", "recruitee", "usajobs"];
const VALID_VERSIONS = ["original", "rewritten"];

function validateRequest(body: Record<string, unknown>): { valid: boolean; error?: string } {
  for (const field of REQUIRED_FIELDS) {
    if (!body[field]) return { valid: false, error: `Missing required field: ${field}` };
  }
  if (!VALID_ATS.includes(body.ats_source)) {
    return { valid: false, error: `Invalid ats_source: ${body.ats_source}` };
  }
  if (!VALID_VERSIONS.includes(body.resume_version)) {
    return { valid: false, error: `Invalid resume_version: ${body.resume_version}` };
  }
  if (!body.applicant?.name || !body.applicant?.email) {
    return { valid: false, error: "Missing applicant.name or applicant.email" };
  }
  return { valid: true };
}

// ─── Main Handler ───────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  const logger = createLogger("mock-ats-submit");

  try {
    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await sb.auth.getUser(token);

    if (authError || !user) {
      logger.warn("Auth failed", { error: authError?.message });
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    logger.info("Authenticated user", { userId });

    // ── Parse & Validate ──
    const body: MockAtsRequest = await req.json();
    const validation = validateRequest(body);
    if (!validation.valid) {
      logger.warn("Validation failed", { error: validation.error, userId });
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // ── Idempotency Check ──
    const { data: existing } = await sb
      .from("mock_ats_submissions")
      .select("id, response_type, response_body")
      .eq("idempotency_key", body.idempotency_key)
      .maybeSingle();

    if (existing) {
      logger.info("Idempotency hit — returning cached response", {
        userId,
        idempotencyKey: body.idempotency_key,
        cachedId: existing.id,
      });

      const statusCode = existing.response_type === "success" ? 200
        : existing.response_type === "rejected" ? 422 : 504;

      return new Response(
        JSON.stringify(existing.response_body),
        { status: statusCode, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // ── Roll Outcome ──
    const outcome = rollOutcome();
    logger.info("Outcome rolled", { userId, outcome, jobId: body.job_id, atsSource: body.ats_source });

    // ── Handle Timeout (simulate 35s delay — caller should timeout at 30s) ──
    if (outcome === "timeout") {
      // Insert the record first so retries hit idempotency
      await sb.from("mock_ats_submissions").insert({
        user_id: userId,
        job_id: body.job_id,
        ats_source: body.ats_source,
        payload: body,
        response_type: "timeout",
        response_body: { status: "timeout", detail: "ATS did not respond within 30s" },
        idempotency_key: body.idempotency_key,
      });

      // Update pending_applications status to failed
      await sb
        .from("pending_applications")
        .update({ status: "failed", submitted_at: new Date().toISOString() })
        .eq("id", body.pending_application_id);

      logger.info("Simulating timeout (35s sleep)", { userId, jobId: body.job_id });
      await new Promise((resolve) => setTimeout(resolve, 35000));

      return new Response(
        JSON.stringify({ status: "timeout", detail: "Gateway timeout" }),
        { status: 504, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // ── Generate Response ──
    let responseBody: Record<string, unknown>;
    let statusCode: number;

    if (outcome === "success") {
      responseBody = makeSuccessResponse(body.ats_source);
      statusCode = 200;
    } else {
      responseBody = makeRejectedResponse();
      statusCode = 422;
    }

    // ── Store Submission ──
    const { error: insertError } = await sb.from("mock_ats_submissions").insert({
      user_id: userId,
      job_id: body.job_id,
      ats_source: body.ats_source,
      payload: body,
      response_type: outcome,
      response_body: responseBody,
      idempotency_key: body.idempotency_key,
    });

    if (insertError) {
      logger.error("Failed to insert mock_ats_submission", { error: insertError.message, userId });
      return new Response(
        JSON.stringify({ error: "Internal error recording submission" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // ── Update pending_application status ──
    const newStatus = outcome === "success" ? "submitted" : "failed";
    const updatePayload: Record<string, unknown> = { status: newStatus };
    if (outcome === "success") {
      updatePayload.submitted_at = new Date().toISOString();
    }

    await sb
      .from("pending_applications")
      .update(updatePayload)
      .eq("id", body.pending_application_id);

    logger.info("Submission complete", {
      userId,
      outcome,
      jobId: body.job_id,
      pendingAppId: body.pending_application_id,
      newStatus,
    });

    return new Response(
      JSON.stringify(responseBody),
      { status: statusCode, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    logger.error("Unhandled error", { error: err instanceof Error ? err.message : String(err) });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
