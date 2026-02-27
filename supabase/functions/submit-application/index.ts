// supabase/functions/submit-application/index.ts
// Phase 2: Real ATS submission — Recruitee zero-auth + mock fallback
// v5.18 — February 26, 2026
//
// Routes by ats_source:
//   recruitee → POST {slug}.recruitee.com/api/offers/{offer_slug}/candidates (zero-auth)
//   greenhouse → Phase 3 (falls back to mock)
//   lever     → Phase 4 (falls back to mock)
//   others    → mock (80/10/10)
//
// Deploy: supabase functions deploy submit-application --project-ref qojhagupdnbtomfoxnsf

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

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface SubmitRequest {
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

interface SubmitResult {
  status: "submitted" | "rejected" | "timeout" | "error" | "no_api_support";
  confirmation_id?: string;
  ats_source: string;
  submitted_at?: string;
  error?: string;
  detail?: string;
  submission_method: "api" | "mock";
}

// ═══════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════

const REQUIRED_FIELDS = [
  "job_id", "ats_source", "ats_job_url", "resume_file_id",
  "resume_filename", "resume_version", "apply_mode",
  "pending_application_id", "idempotency_key"
];

const VALID_ATS = ["greenhouse", "lever", "ashby", "workable", "recruitee", "usajobs"];
const VALID_VERSIONS = ["original", "rewritten"];

function validateRequest(body: any): { valid: boolean; error?: string } {
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

// ═══════════════════════════════════════════════════════════
// RECRUITEE SUBMISSION (ZERO-AUTH)
// ═══════════════════════════════════════════════════════════

/**
 * Parse Recruitee slug and offer slug from the job URL.
 * Patterns:
 *   {slug}.recruitee.com/o/{offer_slug}
 *   custom-domain.com/o/{offer_slug} → needs company_slug from ats_jobs
 */
function parseRecruiteeUrl(url: string): { slug: string | null; offerSlug: string | null } {
  // Standard: {slug}.recruitee.com/o/{offer_slug}
  const stdMatch = url.match(/^https?:\/\/([^.]+)\.recruitee\.com\/o\/([^/?#]+)/);
  if (stdMatch) return { slug: stdMatch[1], offerSlug: stdMatch[2] };

  // Custom domain: anything/o/{offer_slug}
  const customMatch = url.match(/\/o\/([^/?#]+)/);
  if (customMatch) return { slug: null, offerSlug: customMatch[1] };

  return { slug: null, offerSlug: null };
}

async function submitToRecruitee(
  body: SubmitRequest,
  resumeBlob: Blob,
  companySlug: string,
  logger: ReturnType<typeof createLogger>
): Promise<SubmitResult> {
  const { slug: urlSlug, offerSlug } = parseRecruiteeUrl(body.ats_job_url);

  if (!offerSlug) {
    return {
      status: "error",
      ats_source: "recruitee",
      error: "parse_failed",
      detail: `Could not extract offer slug from URL: ${body.ats_job_url}`,
      submission_method: "api",
    };
  }

  // Prefer slug from URL, fall back to company_slug from ats_jobs
  const slug = urlSlug || companySlug;
  if (!slug) {
    return {
      status: "error",
      ats_source: "recruitee",
      error: "no_slug",
      detail: "Could not determine Recruitee company slug",
      submission_method: "api",
    };
  }

  const apiUrl = `https://${slug}.recruitee.com/api/offers/${offerSlug}/candidates`;
  logger.info("Submitting to Recruitee", { apiUrl, offerSlug, slug });

  // Build multipart form data
  const formData = new FormData();
  formData.append("candidate[name]", body.applicant.name);
  formData.append("candidate[email]", body.applicant.email);
  if (body.applicant.phone) formData.append("candidate[phone]", body.applicant.phone);
  formData.append("candidate[cv]", resumeBlob, body.resume_filename);

  try {
    const resp = await fetch(apiUrl, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(25000), // 25s server-side timeout (client has 30s)
    });

    const respText = await resp.text();
    let respData: any = {};
    try { respData = JSON.parse(respText); } catch { /* not JSON */ }

    if (resp.ok) {
      // Recruitee returns candidate object on success
      const candidateId = respData?.candidate?.id || respData?.id || null;
      return {
        status: "submitted",
        confirmation_id: candidateId ? `rec-${candidateId}` : `rec-${crypto.randomUUID().slice(0, 12)}`,
        ats_source: "recruitee",
        submitted_at: new Date().toISOString(),
        submission_method: "api",
      };
    }

    // Recruitee returns 422 with {error: [...], error_fields: {...}}
    if (resp.status === 422) {
      const errors = respData?.error;
      const detail = Array.isArray(errors) ? errors.join("; ") : String(errors || "Unknown validation error");
      return {
        status: "rejected",
        ats_source: "recruitee",
        error: "validation_error",
        detail,
        submission_method: "api",
      };
    }

    // Other errors
    return {
      status: "error",
      ats_source: "recruitee",
      error: `http_${resp.status}`,
      detail: respText.slice(0, 200),
      submission_method: "api",
    };

  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return {
        status: "timeout",
        ats_source: "recruitee",
        error: "timeout",
        detail: "Recruitee API did not respond within 25s",
        submission_method: "api",
      };
    }
    return {
      status: "error",
      ats_source: "recruitee",
      error: "network_error",
      detail: err instanceof Error ? err.message : String(err),
      submission_method: "api",
    };
  }
}

// ═══════════════════════════════════════════════════════════
// MOCK FALLBACK (for platforms without real API support yet)
// ═══════════════════════════════════════════════════════════

function mockSubmit(atsSource: string): SubmitResult {
  const roll = Math.random();
  if (roll < 0.80) {
    return {
      status: "submitted",
      confirmation_id: `mock-conf-${crypto.randomUUID().slice(0, 12)}`,
      ats_source: atsSource,
      submitted_at: new Date().toISOString(),
      submission_method: "mock",
    };
  }
  if (roll < 0.90) {
    const reasons = [
      "Phone number required",
      "Cover letter required for this position",
      "Resume file format not supported",
      "This position is no longer accepting applications",
      "An application from this email already exists",
    ];
    return {
      status: "rejected",
      ats_source: atsSource,
      error: "validation_error",
      detail: reasons[Math.floor(Math.random() * reasons.length)],
      submission_method: "mock",
    };
  }
  return {
    status: "timeout",
    ats_source: atsSource,
    error: "timeout",
    detail: "ATS did not respond within 30s",
    submission_method: "mock",
  };
}

// ═══════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════

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

  const logger = createLogger("submit-application");

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
    const body: SubmitRequest = await req.json();
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
        userId, idempotencyKey: body.idempotency_key, cachedId: existing.id,
      });
      const statusCode = existing.response_type === "success" ? 200
        : existing.response_type === "rejected" ? 422 : 504;
      return new Response(
        JSON.stringify(existing.response_body),
        { status: statusCode, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // ── Route by ATS source ──
    let result: SubmitResult;

    if (body.ats_source === "recruitee") {
      // Fetch resume from Supabase Storage
      const resumePath = `${userId}/${body.resume_filename}`;
      logger.info("Fetching resume", { resumePath, fileId: body.resume_file_id });

      const { data: resumeData, error: resumeError } = await sb
        .storage
        .from("resumes")
        .download(resumePath);

      if (resumeError || !resumeData) {
        // Fallback: try by file ID pattern (timestamp_filename)
        logger.warn("Resume download failed, trying file listing", {
          error: resumeError?.message, resumePath
        });

        // List user's files and find the matching one
        const { data: files } = await sb.storage.from("resumes").list(userId);
        const match = files?.find(f =>
          f.name === body.resume_filename ||
          f.name.endsWith(body.resume_filename) ||
          f.id === body.resume_file_id
        );

        if (match) {
          const { data: retryData, error: retryError } = await sb
            .storage.from("resumes").download(`${userId}/${match.name}`);
          if (retryError || !retryData) {
            logger.error("Resume download failed on retry", { error: retryError?.message });
            result = {
              status: "error", ats_source: "recruitee",
              error: "resume_not_found", detail: "Could not download resume from storage",
              submission_method: "api",
            };
          } else {
            // Look up company_slug for custom domain fallback
            const { data: jobRow } = await sb
              .from("ats_jobs")
              .select("company_slug")
              .eq("greenhouse_id", body.job_id)
              .eq("ats_source", "recruitee")
              .maybeSingle();

            result = await submitToRecruitee(body, retryData, jobRow?.company_slug || "", logger);
          }
        } else {
          result = {
            status: "error", ats_source: "recruitee",
            error: "resume_not_found", detail: "Resume file not found in storage",
            submission_method: "api",
          };
        }
      } else {
        // Look up company_slug
        const { data: jobRow } = await sb
          .from("ats_jobs")
          .select("company_slug")
          .eq("greenhouse_id", body.job_id)
          .eq("ats_source", "recruitee")
          .maybeSingle();

        result = await submitToRecruitee(body, resumeData, jobRow?.company_slug || "", logger);
      }
    } else {
      // ── All other platforms: mock for now ──
      // Phase 3: greenhouse (API key)
      // Phase 4: lever (API key)
      // Phase 8: ashby/workable (partnership)
      logger.info("Using mock submission", { atsSource: body.ats_source, jobId: body.job_id });

      if (body.ats_source !== "recruitee") {
        // Simulate timeout delay for mock timeouts
        const mockResult = mockSubmit(body.ats_source);
        if (mockResult.status === "timeout") {
          // Insert record first, then sleep (client will timeout at 30s)
          await sb.from("mock_ats_submissions").insert({
            user_id: userId, job_id: body.job_id, ats_source: body.ats_source,
            payload: body, response_type: "timeout",
            response_body: mockResult, idempotency_key: body.idempotency_key,
          });
          await sb.from("pending_applications")
            .update({ status: "failed", submitted_at: new Date().toISOString() })
            .eq("id", body.pending_application_id);

          await new Promise((r) => setTimeout(r, 35000));
          return new Response(
            JSON.stringify(mockResult),
            { status: 504, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
          );
        }
        result = mockResult;
      } else {
        result = mockSubmit(body.ats_source);
      }
    }

    // ── Store submission record ──
    const responseType = result.status === "submitted" ? "success"
      : result.status === "rejected" ? "rejected" : "error";

    const { error: insertError } = await sb.from("mock_ats_submissions").insert({
      user_id: userId,
      job_id: body.job_id,
      ats_source: body.ats_source,
      payload: body,
      response_type: responseType,
      response_body: result,
      idempotency_key: body.idempotency_key,
    });

    if (insertError) {
      logger.error("Failed to insert submission record", { error: insertError.message, userId });
    }

    // ── Update pending_application status ──
    const newStatus = result.status === "submitted" ? "submitted" : "failed";
    const updatePayload: Record<string, unknown> = { status: newStatus };
    if (result.status === "submitted") {
      updatePayload.submitted_at = new Date().toISOString();
    }

    await sb.from("pending_applications")
      .update(updatePayload)
      .eq("id", body.pending_application_id);

    logger.info("Submission complete", {
      userId, outcome: result.status, method: result.submission_method,
      jobId: body.job_id, atsSource: body.ats_source,
      pendingAppId: body.pending_application_id, newStatus,
    });

    // ── Return response ──
    const statusCode = result.status === "submitted" ? 200
      : result.status === "rejected" ? 422
      : result.status === "timeout" ? 504 : 500;

    return new Response(
      JSON.stringify(result),
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
