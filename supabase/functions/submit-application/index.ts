// supabase/functions/submit-application/index.ts
// Phase 3: Real ATS submission — Recruitee + Greenhouse + mock fallback
// v5.21 — February 26, 2026
//
// Routes by ats_source:
//   recruitee  → POST {slug}.recruitee.com/api/offers/{offer_slug}/candidates (zero-auth)
//   greenhouse → POST boards-api.greenhouse.io/v1/boards/{slug}/jobs/{jobId} (token from ats_companies)
//   lever      → Phase 4 (falls back to mock)
//   others     → mock (80/10/10)
//
// Deploy: supabase functions deploy submit-application --project-ref qojhagupdnbtomfoxnsf

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createLogger } from "../_shared/logger.ts";
import { checkFeatureAccess, buildDeniedResponse, buildSampleHeaders } from '../_shared/checkFeatureAccess.ts';

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
  job_title?: string;
  company_name?: string;
}

interface SubmitResult {
  status: "submitted" | "rejected" | "timeout" | "error" | "no_api_support";
  confirmation_id?: string;
  ats_source: string;
  submitted_at?: string;
  error?: string;
  detail?: string;
  submission_method: "api" | "mock" | "headless";
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
    let respData: unknown = {};
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
// GREENHOUSE SUBMISSION (Phase 3B — API token required)
// ═══════════════════════════════════════════════════════════

/**
 * Parse Greenhouse slug and job ID from the job URL.
 * Pattern: boards.greenhouse.io/{slug}/jobs/{jobId}
 * Also handles: {slug}.greenhouse.io/jobs/{jobId}
 */
function parseGreenhouseUrl(url: string): { slug: string | null; jobId: string | null } {
  // Standard: boards.greenhouse.io/{slug}/jobs/{jobId}
  const stdMatch = url.match(/boards\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/);
  if (stdMatch) return { slug: stdMatch[1], jobId: stdMatch[2] };

  // Alt: {slug}.greenhouse.io/...jobs/{jobId}
  const altMatch = url.match(/([^./]+)\.greenhouse\.io\/.*jobs\/(\d+)/);
  if (altMatch) return { slug: altMatch[1], jobId: altMatch[2] };

  return { slug: null, jobId: null };
}

/**
 * Split a full name into first and last name.
 * Handles "First Last", "First Middle Last", and single names.
 */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

async function submitToGreenhouse(
  body: SubmitRequest,
  resumeBlob: Blob,
  ghToken: string,
  logger: ReturnType<typeof createLogger>
): Promise<SubmitResult> {
  const { slug, jobId } = parseGreenhouseUrl(body.ats_job_url);

  if (!slug || !jobId) {
    return {
      status: "error",
      ats_source: "greenhouse",
      error: "parse_failed",
      detail: `Could not extract slug/jobId from URL: ${body.ats_job_url}`,
      submission_method: "api",
    };
  }

  // Greenhouse Job Board API endpoint
  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${jobId}`;
  logger.info("Submitting to Greenhouse", { apiUrl, slug, jobId, hasToken: !!ghToken });

  const { firstName, lastName } = splitName(body.applicant.name);

  // Build multipart form data per Greenhouse Job Board API spec
  const formData = new FormData();
  formData.append("first_name", firstName);
  formData.append("last_name", lastName);
  formData.append("email", body.applicant.email);
  if (body.applicant.phone) formData.append("phone", body.applicant.phone);
  if (body.applicant.linkedin) formData.append("urls[LinkedIn]", body.applicant.linkedin);
  formData.append("resume", resumeBlob, body.resume_filename);
  formData.append("mapped_url_token", ghToken);

  try {
    const resp = await fetch(apiUrl, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(25000), // 25s server-side (client has 30s)
    });

    const respText = await resp.text();
    let respData: unknown = {};
    try { respData = JSON.parse(respText); } catch { /* not JSON */ }

    if (resp.ok) {
      // Greenhouse returns { id, status, ... } on success
      const candidateId = respData?.id || null;
      return {
        status: "submitted",
        confirmation_id: candidateId ? `gh-${candidateId}` : `gh-${crypto.randomUUID().slice(0, 12)}`,
        ats_source: "greenhouse",
        submitted_at: new Date().toISOString(),
        submission_method: "api",
      };
    }

    // 422: validation error (missing required fields, etc.)
    if (resp.status === 422) {
      const errors = respData?.errors || respData?.message;
      const detail = typeof errors === "string"
        ? errors
        : Array.isArray(errors)
          ? errors.map((e: Record<string, unknown>) => typeof e === "string" ? e : e.message || JSON.stringify(e)).join("; ")
          : JSON.stringify(errors || "Unknown validation error");
      return {
        status: "rejected",
        ats_source: "greenhouse",
        error: "validation_error",
        detail,
        submission_method: "api",
      };
    }

    // 403: invalid/expired token
    if (resp.status === 403) {
      logger.warn("Greenhouse token rejected (403)", { slug, jobId });
      return {
        status: "error",
        ats_source: "greenhouse",
        error: "invalid_token",
        detail: "Greenhouse API returned 403 — token may be invalid or expired",
        submission_method: "api",
      };
    }

    return {
      status: "error",
      ats_source: "greenhouse",
      error: `http_${resp.status}`,
      detail: respText.slice(0, 200),
      submission_method: "api",
    };

  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return {
        status: "timeout",
        ats_source: "greenhouse",
        error: "timeout",
        detail: "Greenhouse API did not respond within 25s",
        submission_method: "api",
      };
    }
    return {
      status: "error",
      ats_source: "greenhouse",
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

    // ─── FB-TRIAL-001-S2: Feature access gate ───
    const access = await checkFeatureAccess(sb, userId, 'apply');
    if (!access.allowed) return buildDeniedResponse(access);
    const sampleHeaders = access.isSample ? buildSampleHeaders() : {};

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

    // ── Timing start ──
    const startTime = Date.now();

    // ── Route by ATS source ──
    let result: SubmitResult | undefined;

    // ── Shared: Fetch resume from Supabase Storage (needed for all API submissions) ──
    let resumeBlob: Blob | null = null;

    if (body.ats_source === "recruitee" || body.ats_source === "greenhouse") {
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
              status: "error", ats_source: body.ats_source,
              error: "resume_not_found", detail: "Could not download resume from storage",
              submission_method: "api",
            };
          } else {
            resumeBlob = retryData;
          }
        } else {
          result = {
            status: "error", ats_source: body.ats_source,
            error: "resume_not_found", detail: "Resume file not found in storage",
            submission_method: "api",
          };
        }
      } else {
        resumeBlob = resumeData;
      }
    }

    // ── Route: Recruitee (zero-auth) ──
    if (!result && body.ats_source === "recruitee" && resumeBlob) {
      const { data: jobRow } = await sb
        .from("ats_jobs")
        .select("company_slug")
        .eq("greenhouse_id", body.job_id)
        .eq("ats_source", "recruitee")
        .maybeSingle();

      result = await submitToRecruitee(body, resumeBlob, jobRow?.company_slug || "", logger);

    // ── Route: Greenhouse (Phase 3B — API token required) ──
    } else if (!result && body.ats_source === "greenhouse" && resumeBlob) {
      // Look up the company's API token from ats_companies
      const { slug: ghSlug } = parseGreenhouseUrl(body.ats_job_url);
      let ghToken: string | null = null;

      if (ghSlug) {
        const { data: companyRow } = await sb
          .from("ats_companies")
          .select("api_key_encrypted")
          .eq("slug", ghSlug)
          .eq("source", "greenhouse")
          .maybeSingle();

        ghToken = companyRow?.api_key_encrypted || null;
      }

      if (ghToken) {
        logger.info("Greenhouse token found, using API submission", { slug: ghSlug });
        result = await submitToGreenhouse(body, resumeBlob, ghToken, logger);
      } else {
        // No API token available — fall back to mock
        logger.info("No Greenhouse token found, falling back to mock", { slug: ghSlug, jobId: body.job_id });
        result = mockSubmit(body.ats_source);
        result.detail = "no_api_token";
      }

    // ── Route: All other platforms → mock ──
    } else if (!result) {
      // Phase 4: lever (API key)
      // Phase 8: ashby/workable (partnership)
      logger.info("Using mock submission", { atsSource: body.ats_source, jobId: body.job_id });

      const mockResult = mockSubmit(body.ats_source);
      if (mockResult.status === "timeout") {
        // Insert record first, then sleep (client will timeout at 30s)
        await sb.from("mock_ats_submissions").insert({
          user_id: userId, job_id: body.job_id, ats_source: body.ats_source,
          payload: body, response_type: "timeout",
          response_body: mockResult, idempotency_key: body.idempotency_key,
        });
        // Instrumentation for timeout path
        const timeoutDurationMs = Date.now() - startTime;
        await sb.from("submission_attempts").insert({
          user_id: userId, pending_app_id: body.pending_application_id,
          job_id: body.job_id, job_title: body.job_title || null,
          company_name: body.company_name || null, job_url: body.ats_job_url,
          ats_source: body.ats_source, resume_filename: body.resume_filename,
          submission_method: "mock", status: "timeout",
          error_type: "timeout", error_detail: "Mock timeout simulation",
          http_status: 504, duration_ms: timeoutDurationMs,
          response_body: mockResult,
        }).then(() => {}).catch(() => {});
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
    }

    // ── Safety: ensure result is always defined ──
    if (!result) {
      logger.error("No submission result — should not happen", { atsSource: body.ats_source });
      result = {
        status: "error",
        ats_source: body.ats_source,
        error: "routing_error",
        detail: "No submission handler matched for this ATS source",
        submission_method: "mock",
      };
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

    // ── Instrumentation: log to submission_attempts with timing ──
    const durationMs = Date.now() - startTime;
    const httpStatus = result.status === "submitted" ? 200
      : result.status === "rejected" ? 422
      : result.status === "timeout" ? 504 : 500;

    // Enrich job_title / company_name from pending_applications if not on request body
    let instrJobTitle = body.job_title || null;
    let instrCompanyName = body.company_name || null;
    if (!instrJobTitle || !instrCompanyName) {
      try {
        const { data: paRow } = await sb.from("pending_applications")
          .select("job_title, company_name")
          .eq("id", body.pending_application_id)
          .maybeSingle();
        if (paRow) {
          instrJobTitle = instrJobTitle || paRow.job_title || null;
          instrCompanyName = instrCompanyName || paRow.company_name || null;
        }
      } catch (_e) { /* non-fatal */ }
    }

    const { error: instrError } = await sb.from("submission_attempts").insert({
      user_id: userId,
      pending_app_id: body.pending_application_id,
      job_id: body.job_id,
      job_title: instrJobTitle,
      company_name: instrCompanyName,
      job_url: body.ats_job_url,
      ats_source: body.ats_source,
      resume_id: body.resume_file_id || null,
      resume_filename: body.resume_filename,
      resume_version: body.resume_version || null,
      submission_method: result.submission_method,
      status: result.status,
      error_type: result.error || null,
      error_detail: result.detail || null,
      http_status: httpStatus,
      duration_ms: durationMs,
      confirmation_id: result.confirmation_id || null,
      response_body: result,
    });

    if (instrError) {
      logger.warn("[Instrumentation] Failed to log submission attempt", { error: instrError.message });
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
      { status: statusCode, headers: { ...CORS_HEADERS, ...sampleHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    logger.error("Unhandled error", { error: err instanceof Error ? err.message : String(err) });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
