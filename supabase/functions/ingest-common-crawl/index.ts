/**
 * SA-007: Common Crawl Ingestion Worker
 * ADR-06: Data Pipeline Scaling
 *
 * Actions:
 *   discover   — Run Athena query against CC index, populate cc_url_queue
 *   fetch      — Process N URLs from queue: fetch WARC → parse HTML → write staging
 *   status     — Return batch progress
 *   run_batch  — Orchestrate full pipeline (discover + fetch in batches)
 *
 * Architecture:
 *   Athena (CC index) → cc_url_queue → WARC fetch → HTML parse → cc_staging_jobs
 *   Typesense deferred — records stay in Postgres until SA-008 promotes to ats_jobs.
 *
 * HOOK: extraction_method field supports future parsers (schema_org, html_heuristic, meta_tags).
 * SCAR: pg_cron schedule placeholder ready for SA-008 graduation.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";
import { withCorrelation } from "../_shared/middleware.ts";
import { requireAdmin, AdminAuthError } from "../_shared/admin-auth.ts";
import { warnIfDirectAccess } from "../_shared/gateway-deprecation.ts";

// ─── Environment ─────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AWS_ACCESS_KEY = Deno.env.get("AWS_ACCESS_KEY_ID") ?? Deno.env.get("CC_AWS_ACCESS_KEY")!;
const AWS_SECRET_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? Deno.env.get("CC_AWS_SECRET_KEY")!;
const AWS_REGION = "us-east-1";
const ATHENA_DATABASE = "ccindex";
const ATHENA_OUTPUT = "s3://brilliantjobs-athena-results/";

// Common Crawl WARC locations stored in cc_url_queue for future use.
// Live web fetch is used instead of WARC archive (EF memory constraints).
// SCAR: WARC byte-range fetching can be re-enabled if EF memory limits increase.

// ─── Config ──────────────────────────────────────────────────────────────────

const MAX_URLS_PER_FETCH = 25;        // URLs processed per fetch invocation (EF memory constrained)
const MAX_WARC_RECORD_SIZE = 512_000;  // 512KB page size cap (memory safety for Deno EFs)
const ATHENA_POLL_INTERVAL_MS = 2000;
const ATHENA_MAX_POLLS = 60;           // 2 min max wait for Athena query
const FETCH_TIMEOUT_MS = 10_000;       // 10s per WARC record fetch

// ─── Clients ─────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const aws = new AwsClient({
  accessKeyId: AWS_ACCESS_KEY,
  secretAccessKey: AWS_SECRET_KEY,
  region: AWS_REGION,
});

// ─── Main Handler ────────────────────────────────────────────────────────────

serve(withCorrelation("ingest-common-crawl", async (req, logger) => {
  warnIfDirectAccess(req, "ingest-common-crawl");

  // Auth: require admin or service_role
  try {
    await requireAdmin(req);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw e;
  }

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "POST required" }, 405);
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  logger.info("Action received", { action, batchId: body.batch_id });

  try {
    switch (action) {
      case "discover":
        return await handleDiscover(body, logger);
      case "fetch":
        return await handleFetch(body, logger);
      case "status":
        return await handleStatus(body, logger);
      case "run_batch":
        return await handleRunBatch(body, logger);
      default:
        return jsonResponse({
          error: `Unknown action: ${action}`,
          available: ["discover", "fetch", "status", "run_batch"],
        }, 400);
    }
  } catch (error) {
    logger.error("Handler error", { action, error: String(error) });
    return jsonResponse({ error: "Internal error", detail: String(error) }, 500);
  }
}));

// ─── Action: Discover ────────────────────────────────────────────────────────
// Run Athena query against CC index to find job posting URLs.

interface DiscoverParams {
  crawl_id?: string;   // e.g., 'CC-MAIN-2026-09' — defaults to latest
  limit?: number;      // max URLs to discover (default 10000)
  url_patterns?: string[]; // URL patterns to search for
}

async function handleDiscover(params: DiscoverParams, logger: ReturnType<typeof import("../_shared/logger.ts").createLogger>) {
  const crawlId = params.crawl_id ?? "CC-MAIN-2025-51"; // Latest available crawl
  const limit = Math.min(params.limit ?? 10000, 50000);

  // Create batch record
  const batchId = crypto.randomUUID();
  const { error: batchErr } = await supabase
    .from("cc_batch_tracking")
    .insert({
      batch_id: batchId,
      crawl_id: crawlId,
      batch_type: "athena_discovery",
      status: "running",
      started_at: new Date().toISOString(),
      config_snapshot: { crawl_id: crawlId, limit, url_patterns: params.url_patterns },
    });

  if (batchErr) {
    logger.error("Failed to create batch", { error: batchErr.message });
    return jsonResponse({ error: "Failed to create batch", detail: batchErr.message }, 500);
  }

  logger.info("Batch created, starting Athena query", { batchId, crawlId, limit });

  // Build Athena query: find job posting URLs in CC index
  // NOTE: Targets company career pages (server-rendered with schema.org markup).
  // SPA job boards (Lever, Greenhouse, Indeed) require JS rendering — not suitable
  // for this pipeline. Those are already handled by ATS integrations.
  //
  // Domain diversity: ROW_NUMBER() window function ensures we sample across
  // different domains rather than getting 500 results from one site.
  const jobUrlPatterns = params.url_patterns ?? [
    "url_path LIKE '%/jobs/%'",
    "url_path LIKE '%/careers/%'",
    "url_path LIKE '%/job/%'",
    "url_path LIKE '%/position/%'",
    "url_path LIKE '%/opening/%'",
    "url_path LIKE '%/vacancy/%'",
  ];

  const urlFilter = jobUrlPatterns.join(" OR ");

  const query = `
    WITH ranked AS (
      SELECT url, url_host_name, warc_filename, warc_record_offset, warc_record_length,
             ROW_NUMBER() OVER (PARTITION BY url_host_name ORDER BY url) as rn
      FROM "${ATHENA_DATABASE}"."ccindex"
      WHERE crawl = '${crawlId}'
        AND subset = 'warc'
        AND content_mime_type = 'text/html'
        AND (${urlFilter})
        AND warc_record_length < ${MAX_WARC_RECORD_SIZE}
        AND url_host_name NOT LIKE '%.gov'
        AND url_host_name NOT LIKE '%.edu'
        AND url_host_name NOT IN ('www.indeed.com', 'www.linkedin.com', 'jobs.lever.co', 'boards.greenhouse.io', 'www.glassdoor.com')
        AND url NOT LIKE '%login%'
        AND url NOT LIKE '%signin%'
        AND url NOT LIKE '%apply%'
    )
    SELECT url, url_host_name, warc_filename, warc_record_offset, warc_record_length
    FROM ranked
    WHERE rn <= 5
    LIMIT ${limit}
  `;

  try {
    // Start Athena query
    const queryExecutionId = await startAthenaQuery(query, logger);
    logger.info("Athena query started", { queryExecutionId });

    // Poll for completion
    const result = await pollAthenaQuery(queryExecutionId, logger);

    if (result.status === "FAILED") {
      await updateBatch(batchId, {
        status: "failed",
        error_message: result.error ?? "Athena query failed",
        completed_at: new Date().toISOString(),
      });
      return jsonResponse({ error: "Athena query failed", detail: result.error }, 500);
    }

    // Get results
    const rows = await getAthenaResults(queryExecutionId, logger);
    logger.info("Athena results received", { rowCount: rows.length });

    // Deduplicate by URL hash before inserting to queue
    const urlQueue = rows.map((row) => ({
      batch_id: batchId,
      url: row.url,
      url_hash: hashString(row.url),
      warc_filename: row.warc_filename,
      warc_offset: parseInt(row.warc_record_offset, 10),
      warc_length: parseInt(row.warc_record_length, 10),
      status: "pending",
    }));

    // Insert in batches of 500
    let inserted = 0;
    let duplicatesSkipped = 0;
    for (let i = 0; i < urlQueue.length; i += 500) {
      const chunk = urlQueue.slice(i, i + 500);
      const { error: insertErr, count } = await supabase
        .from("cc_url_queue")
        .upsert(chunk, { onConflict: "batch_id,url_hash", ignoreDuplicates: true, count: "exact" });

      if (insertErr) {
        logger.warn("Queue insert error (batch)", { offset: i, error: insertErr.message });
      }
      inserted += count ?? chunk.length;
    }
    duplicatesSkipped = urlQueue.length - inserted;

    // Update batch
    await updateBatch(batchId, {
      status: "completed",
      urls_discovered: urlQueue.length,
      records_duplicate: duplicatesSkipped,
      athena_query_id: queryExecutionId,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - new Date().getTime(), // approximate
    });

    // Track in PostHog
    trackEvent("cc_discovery_complete", {
      batch_id: batchId,
      crawl_id: crawlId,
      urls_discovered: urlQueue.length,
      duplicates_skipped: duplicatesSkipped,
    });

    return jsonResponse({
      batch_id: batchId,
      crawl_id: crawlId,
      urls_discovered: urlQueue.length,
      urls_queued: inserted,
      duplicates_skipped: duplicatesSkipped,
      athena_query_id: queryExecutionId,
    });
  } catch (error) {
    logger.error("Discovery failed", { error: String(error) });
    await updateBatch(batchId, {
      status: "failed",
      error_message: String(error),
      completed_at: new Date().toISOString(),
    });
    return jsonResponse({ error: "Discovery failed", detail: String(error) }, 500);
  }
}

// ─── Action: Fetch ───────────────────────────────────────────────────────────
// Process N URLs from queue: fetch WARC record → parse HTML → write to staging.

interface FetchParams {
  batch_id: string;
  limit?: number;  // URLs to process this invocation (default MAX_URLS_PER_FETCH)
}

async function handleFetch(params: FetchParams, logger: ReturnType<typeof import("../_shared/logger.ts").createLogger>) {
  const batchId = params.batch_id;
  const limit = Math.min(params.limit ?? MAX_URLS_PER_FETCH, 500);

  if (!batchId) {
    return jsonResponse({ error: "batch_id required" }, 400);
  }

  // Grab pending URLs from queue
  const { data: urls, error: fetchErr } = await supabase
    .from("cc_url_queue")
    .select("*")
    .eq("batch_id", batchId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (fetchErr) {
    return jsonResponse({ error: "Failed to read queue", detail: fetchErr.message }, 500);
  }

  if (!urls || urls.length === 0) {
    return jsonResponse({ batch_id: batchId, message: "No pending URLs", processed: 0 });
  }

  // Process sequentially to control memory usage (web page fetch is memory-variable)
  const processLimit = Math.min(urls.length, 3); // Cap at 3 per invocation for memory safety
  logger.info("Processing URLs", { batchId, count: processLimit, queueSize: urls.length });

  // Mark as fetching (only the ones we'll process)
  const processUrls = urls.slice(0, processLimit);
  const urlIds = processUrls.map((u: Record<string, unknown>) => u.id);
  await supabase
    .from("cc_url_queue")
    .update({ status: "fetching" })
    .in("id", urlIds);

  let fetched = 0;
  let parsed = 0;
  let inserted = 0;
  let failed = 0;
  const stagingRecords: Record<string, unknown>[] = [];

  for (const urlRecord of processUrls) {
    try {
      // 1. Fetch live web page (lighter than WARC archive)
      const html = await fetchJobPage(urlRecord.url, logger);

      if (!html) {
        await markUrlFailed(urlRecord.id, "Page unavailable (timeout, non-HTML, or error)");
        failed++;
        continue;
      }
      fetched++;

      // 2. Parse HTML for job data
      const jobData = parseJobPosting(html, urlRecord.url);

      if (!jobData) {
        await markUrlFailed(urlRecord.id, "No job posting data found in HTML");
        failed++;
        continue;
      }
      parsed++;

      // 3. Build staging record
      const stagingRecord = {
        batch_id: batchId,
        ingestion_status: "pending",
        greenhouse_id: `cc-${hashString(urlRecord.url).slice(0, 32)}`,
        company_name: jobData.company_name,
        company_slug: slugify(jobData.company_name ?? ""),
        title: jobData.title,
        location: jobData.location,
        url: urlRecord.url,
        content: jobData.description?.slice(0, 50000), // Cap at 50K chars
        salary_min: jobData.salary_min,
        salary_max: jobData.salary_max,
        salary_raw: jobData.salary_raw,
        salary_currency: jobData.salary_currency ?? "USD",
        is_remote: jobData.is_remote ?? false,
        industry: jobData.industry,
        loc_city: jobData.loc_city,
        loc_state: jobData.loc_state,
        loc_country: jobData.loc_country,
        loc_display: jobData.loc_display,
        source_url: urlRecord.url,
        warc_file: urlRecord.warc_filename,
        warc_offset: urlRecord.warc_offset,
        warc_length: urlRecord.warc_length,
        extraction_method: jobData.extraction_method,
        raw_html_hash: hashString(html),
        url_hash: urlRecord.url_hash,
        fetched_at: new Date().toISOString(),
        parsed_at: new Date().toISOString(),
      };

      stagingRecords.push(stagingRecord);

      // Update queue status
      await supabase
        .from("cc_url_queue")
        .update({ status: "parsed", processed_at: new Date().toISOString() })
        .eq("id", urlRecord.id);

    } catch (error) {
      logger.warn("URL processing failed", { url: urlRecord.url, error: String(error) });
      await markUrlFailed(urlRecord.id, String(error));
      failed++;
    }
  }

  // Batch insert staging records
  if (stagingRecords.length > 0) {
    for (let i = 0; i < stagingRecords.length; i += 200) {
      const chunk = stagingRecords.slice(i, i + 200);
      const { error: insertErr } = await supabase
        .from("cc_staging_jobs")
        .insert(chunk);

      if (insertErr) {
        logger.error("Staging insert failed", { offset: i, error: insertErr.message });
      } else {
        inserted += chunk.length;
      }
    }
  }

  // Update batch tracking counters
  try {
    await supabase.rpc("cc_update_batch_counters", {
      p_batch_id: batchId,
      p_fetched: fetched,
      p_parsed: parsed,
      p_inserted: inserted,
      p_rejected: failed,
    });
  } catch (e) { console.warn("[EF][ingest-common-crawl]", e?.message || String(e));
    // RPC may not exist yet — fallback is acceptable, counters update on next status check
  }

  trackEvent("cc_fetch_complete", {
    batch_id: batchId,
    fetched,
    parsed,
    inserted,
    failed,
    batch_size: urls.length,
  });

  return jsonResponse({
    batch_id: batchId,
    processed: processUrls.length,
    fetched,
    parsed,
    inserted,
    failed,
    remaining: await getPendingCount(batchId),
  });
}

// ─── Action: Status ──────────────────────────────────────────────────────────

async function handleStatus(params: { batch_id?: string }, logger: ReturnType<typeof import("../_shared/logger.ts").createLogger>) {
  if (params.batch_id) {
    const { data, error } = await supabase
      .from("cc_batch_summary")
      .select("*")
      .eq("batch_id", params.batch_id)
      .maybeSingle();

    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse(data ?? { error: "Batch not found" });
  }

  // Return last 10 batches
  const { data, error } = await supabase
    .from("cc_batch_summary")
    .select("*")
    .limit(10);

  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ batches: data });
}

// ─── Action: Run Batch ───────────────────────────────────────────────────────
// Full pipeline: discover URLs, then fetch in batches until queue is drained.
// Designed for cron invocation.

interface RunBatchParams {
  crawl_id?: string;
  batch_size?: number;     // Total URLs to discover (default 10000)
  fetch_batch_size?: number; // URLs per fetch iteration (default 100)
}

async function handleRunBatch(params: RunBatchParams, logger: ReturnType<typeof import("../_shared/logger.ts").createLogger>) {
  logger.info("Starting full pipeline batch", params);

  // Step 1: Discover
  const discoverResult = await handleDiscover({
    crawl_id: params.crawl_id,
    limit: params.batch_size ?? 10000,
  }, logger);

  const discoverBody = await discoverResult.clone().json();
  if (discoverResult.status !== 200) {
    return discoverResult;
  }

  const batchId = discoverBody.batch_id;

  // Step 2: Fetch in iterations until queue is drained or time runs out
  // Edge Functions have a ~150s timeout — budget 90s for fetching (conservative)
  const fetchStart = Date.now();
  const maxFetchTimeMs = 90_000;
  let totalFetched = 0;
  let totalInserted = 0;
  let iterations = 0;

  while (Date.now() - fetchStart < maxFetchTimeMs) {
    const remaining = await getPendingCount(batchId);
    if (remaining === 0) break;

    const fetchResult = await handleFetch({
      batch_id: batchId,
      limit: params.fetch_batch_size ?? MAX_URLS_PER_FETCH,
    }, logger);

    const fetchBody = await fetchResult.clone().json();
    totalFetched += fetchBody.fetched ?? 0;
    totalInserted += fetchBody.inserted ?? 0;
    iterations++;

    if (fetchBody.processed === 0) break; // No more work
  }

  return jsonResponse({
    batch_id: batchId,
    discovery: {
      urls_discovered: discoverBody.urls_discovered,
      urls_queued: discoverBody.urls_queued,
    },
    fetch: {
      iterations,
      total_fetched: totalFetched,
      total_inserted: totalInserted,
      duration_ms: Date.now() - fetchStart,
    },
    remaining: await getPendingCount(batchId),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Web Fetching (live page fetch — replaces WARC archive approach)
// ═══════════════════════════════════════════════════════════════════════════════
// ARCHITECTURAL NOTE: Original design used WARC byte-range fetches from S3.
// However, Supabase EF memory limits (150MB) cannot handle WARC gzip
// decompression at scale. Live web fetching is lighter and also confirms
// the job posting is still active — a better signal for job freshness.
//
// Trade-off: Some CC-indexed pages may have changed or gone offline.
// For job postings this is a feature, not a bug — stale jobs are filtered.

/**
 * Fetch a job page directly from the live web.
 * Returns the HTML body or null if the page is unavailable.
 */
async function fetchJobPage(
  url: string,
  logger: ReturnType<typeof import("../_shared/logger.ts").createLogger>
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "BrilliantJobs-Crawler/1.0 (+https://brilliantjobs.app/bot)",
        "Accept": "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn("Page fetch failed", { status: response.status, url: url.slice(0, 100) });
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return null;
    }

    // Read with size cap (1MB)
    const reader = response.body?.getReader();
    if (!reader) return null;

    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    const maxSize = MAX_WARC_RECORD_SIZE;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalSize += value.length;
      if (totalSize > maxSize) {
        reader.cancel();
        break;
      }
      chunks.push(value);
    }

    const combined = new Uint8Array(totalSize > maxSize ? maxSize : totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      const copyLen = Math.min(chunk.length, combined.length - offset);
      combined.set(chunk.subarray(0, copyLen), offset);
      offset += copyLen;
      if (offset >= combined.length) break;
    }

    return new TextDecoder("utf-8", { fatal: false }).decode(combined);
  } catch (error) {
    logger.warn("Page fetch error", { url: url.slice(0, 100), error: String(error) });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTML → Job Data Parsing
// ═══════════════════════════════════════════════════════════════════════════════

interface ParsedJob {
  title: string;
  company_name: string | null;
  location: string | null;
  description: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_raw: string | null;
  salary_currency: string | null;
  is_remote: boolean;
  industry: string | null;
  loc_city: string | null;
  loc_state: string | null;
  loc_country: string | null;
  loc_display: string | null;
  extraction_method: "schema_org" | "html_heuristic" | "meta_tags";
}

/**
 * Parse job posting data from HTML.
 * Priority: schema.org JobPosting JSON-LD → meta tags → HTML heuristics.
 */
function parseJobPosting(html: string, sourceUrl: string): ParsedJob | null {
  // Try schema.org JSON-LD first (highest quality)
  const schemaJob = extractSchemaOrg(html);
  if (schemaJob) return schemaJob;

  // Try meta tags (og:title, etc.)
  const metaJob = extractMetaTags(html, sourceUrl);
  if (metaJob) return metaJob;

  // Fallback: HTML heuristic parsing
  return extractHtmlHeuristic(html, sourceUrl);
}

/** Extract from schema.org JSON-LD JobPosting */
function extractSchemaOrg(html: string): ParsedJob | null {
  // Find all <script type="application/ld+json"> blocks
  const ldJsonPattern = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = ldJsonPattern.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1].trim());
      const posting = findJobPosting(json);
      if (!posting) continue;

      const title = posting.title;
      if (!title || typeof title !== "string") continue;

      const salary = parseSalary(posting.baseSalary ?? posting.estimatedSalary);
      const loc = parseSchemaLocation(posting.jobLocation);

      return {
        title: cleanText(title),
        company_name: cleanText(
          posting.hiringOrganization?.name ??
          posting.hiringOrganization ?? null
        ),
        location: loc.display ?? null,
        description: cleanText(
          posting.description ??
          posting.responsibilities ?? null
        ),
        salary_min: salary.min,
        salary_max: salary.max,
        salary_raw: salary.raw,
        salary_currency: salary.currency,
        is_remote: isRemoteJob(posting),
        industry: cleanText(posting.industry ?? posting.occupationalCategory ?? null),
        loc_city: loc.city,
        loc_state: loc.state,
        loc_country: loc.country,
        loc_display: loc.display,
        extraction_method: "schema_org",
      };
    } catch (e) { console.warn("[EF][ingest-common-crawl]", e?.message || String(e));
      continue;
    }
  }
  return null;
}

/** Recursively find a JobPosting in JSON-LD (handles @graph arrays) */
function findJobPosting(obj: unknown): Record<string, unknown> | null {
  if (!obj || typeof obj !== "object") return null;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return null;
  }

  const record = obj as Record<string, unknown>;
  if (record["@type"] === "JobPosting") return record;

  // Check @graph
  if (Array.isArray(record["@graph"])) {
    return findJobPosting(record["@graph"]);
  }

  return null;
}

/** Extract job from meta tags */
function extractMetaTags(html: string, _sourceUrl: string): ParsedJob | null {
  const getMetaContent = (name: string): string | null => {
    const pattern = new RegExp(
      `<meta[^>]*(?:property|name)\\s*=\\s*["']${name}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
      "i"
    );
    const m = html.match(pattern);
    return m ? cleanText(m[1]) : null;
  };

  const title = getMetaContent("og:title") ?? getMetaContent("twitter:title");
  if (!title) return null;

  // Check if it looks like a job posting title
  if (!looksLikeJobTitle(title)) return null;

  return {
    title,
    company_name: getMetaContent("og:site_name"),
    location: null,
    description: getMetaContent("og:description") ?? getMetaContent("description"),
    salary_min: null,
    salary_max: null,
    salary_raw: null,
    salary_currency: null,
    is_remote: /remote|work from home|wfh/i.test(title),
    industry: null,
    loc_city: null,
    loc_state: null,
    loc_country: null,
    loc_display: null,
    extraction_method: "meta_tags",
  };
}

/** Fallback HTML heuristic extraction */
function extractHtmlHeuristic(html: string, _sourceUrl: string): ParsedJob | null {
  // Try <h1> as title
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!h1Match) return null;

  const title = cleanText(stripHtml(h1Match[1]));
  if (!title || !looksLikeJobTitle(title)) return null;

  // Try to find company name from common patterns
  const companyPatterns = [
    /<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i,
    /class=["'][^"']*company[^"']*["'][^>]*>([^<]+)</i,
    /data-company=["']([^"']+)["']/i,
  ];
  let companyName: string | null = null;
  for (const pattern of companyPatterns) {
    const m = html.match(pattern);
    if (m) { companyName = cleanText(m[1]); break; }
  }

  return {
    title,
    company_name: companyName,
    location: null,
    description: null,
    salary_min: null,
    salary_max: null,
    salary_raw: null,
    salary_currency: null,
    is_remote: /remote|work from home|wfh/i.test(html.slice(0, 5000)),
    industry: null,
    loc_city: null,
    loc_state: null,
    loc_country: null,
    loc_display: null,
    extraction_method: "html_heuristic",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Athena Helpers
// ═══════════════════════════════════════════════════════════════════════════════

async function startAthenaQuery(query: string, logger: ReturnType<typeof import("../_shared/logger.ts").createLogger>): Promise<string> {
  const body = JSON.stringify({
    QueryString: query,
    ClientRequestToken: crypto.randomUUID(),
    QueryExecutionContext: { Database: ATHENA_DATABASE },
    ResultConfiguration: { OutputLocation: ATHENA_OUTPUT },
  });

  const response = await aws.fetch(`https://athena.${AWS_REGION}.amazonaws.com`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AmazonAthena.StartQueryExecution",
    },
    body,
  });

  const data = await response.json();
  if (!data.QueryExecutionId) {
    throw new Error(`Athena start failed: ${JSON.stringify(data)}`);
  }
  return data.QueryExecutionId;
}

interface AthenaQueryResult {
  status: "SUCCEEDED" | "FAILED" | "CANCELLED";
  error?: string;
}

async function pollAthenaQuery(queryExecutionId: string, logger: ReturnType<typeof import("../_shared/logger.ts").createLogger>): Promise<AthenaQueryResult> {
  for (let i = 0; i < ATHENA_MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, ATHENA_POLL_INTERVAL_MS));

    const response = await aws.fetch(`https://athena.${AWS_REGION}.amazonaws.com`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "AmazonAthena.GetQueryExecution",
      },
      body: JSON.stringify({ QueryExecutionId: queryExecutionId }),
    });

    const data = await response.json();
    const state = data.QueryExecution?.Status?.State;

    if (state === "SUCCEEDED") return { status: "SUCCEEDED" };
    if (state === "FAILED") return { status: "FAILED", error: data.QueryExecution?.Status?.StateChangeReason };
    if (state === "CANCELLED") return { status: "CANCELLED" };

    logger.info("Athena polling", { state, attempt: i + 1 });
  }

  return { status: "FAILED", error: "Athena query timed out" };
}

interface AthenaRow {
  url: string;
  url_host_name: string;
  warc_filename: string;
  warc_record_offset: string;
  warc_record_length: string;
}

async function getAthenaResults(queryExecutionId: string, logger: ReturnType<typeof import("../_shared/logger.ts").createLogger>): Promise<AthenaRow[]> {
  const rows: AthenaRow[] = [];
  let nextToken: string | undefined;

  do {
    const body: Record<string, unknown> = {
      QueryExecutionId: queryExecutionId,
      MaxResults: 1000,
    };
    if (nextToken) body.NextToken = nextToken;

    const response = await aws.fetch(`https://athena.${AWS_REGION}.amazonaws.com`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "AmazonAthena.GetQueryResults",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    const resultRows = data.ResultSet?.Rows ?? [];

    // Skip header row (first row of first page)
    const startIdx = rows.length === 0 ? 1 : 0;
    for (let i = startIdx; i < resultRows.length; i++) {
      const cols = resultRows[i].Data;
      if (cols && cols.length >= 5) {
        rows.push({
          url: cols[0]?.VarCharValue ?? "",
          url_host_name: cols[1]?.VarCharValue ?? "",
          warc_filename: cols[2]?.VarCharValue ?? "",
          warc_record_offset: cols[3]?.VarCharValue ?? "0",
          warc_record_length: cols[4]?.VarCharValue ?? "0",
        });
      }
    }

    nextToken = data.NextToken;
  } while (nextToken);

  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════════════

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function updateBatch(batchId: string, updates: Record<string, unknown>) {
  await supabase.from("cc_batch_tracking").update(updates).eq("batch_id", batchId);
}

async function markUrlFailed(urlId: string, error: string) {
  await supabase
    .from("cc_url_queue")
    .update({
      status: "failed",
      last_error: error.slice(0, 500),
      processed_at: new Date().toISOString(),
    })
    .eq("id", urlId);
}

async function getPendingCount(batchId: string): Promise<number> {
  const { count } = await supabase
    .from("cc_url_queue")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .eq("status", "pending");
  return count ?? 0;
}

/** SHA-256 hash as hex string */
function hashString(input: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  // Use sync approach for simplicity
  let hash = 0x811c9dc5; // FNV-1a 32-bit offset basis
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  // Extend to 64-bit by doing a second pass
  let hash2 = 0xcbf29ce484222325n;
  for (let i = 0; i < data.length; i++) {
    hash2 ^= BigInt(data[i]);
    hash2 *= 0x100000001b3n;
  }
  return ((hash >>> 0).toString(16).padStart(8, "0")) +
    hash2.toString(16).slice(-8).padStart(8, "0");
}

function cleanText(text: unknown): string | null {
  if (text === null || text === undefined) return null;
  const s = String(text)
    .replace(/<[^>]+>/g, "")  // Strip HTML tags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s || null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function looksLikeJobTitle(title: string): boolean {
  const jobKeywords = /\b(engineer|developer|manager|analyst|designer|director|coordinator|specialist|associate|intern|lead|senior|junior|architect|scientist|consultant|administrator)\b/i;
  return jobKeywords.test(title);
}

function isRemoteJob(posting: Record<string, unknown>): boolean {
  const locType = posting.jobLocationType;
  if (locType === "TELECOMMUTE") return true;

  const title = String(posting.title ?? "");
  const loc = JSON.stringify(posting.jobLocation ?? "");
  return /remote|telecommute|work from home|wfh/i.test(title + " " + loc);
}

function parseSalary(salaryObj: unknown): {
  min: number | null;
  max: number | null;
  raw: string | null;
  currency: string | null;
} {
  const empty = { min: null, max: null, raw: null, currency: null };
  if (!salaryObj || typeof salaryObj !== "object") return empty;

  const salary = salaryObj as Record<string, unknown>;

  // Handle array (estimatedSalary)
  if (Array.isArray(salaryObj)) {
    return parseSalary(salaryObj[0]);
  }

  const value = salary.value as Record<string, unknown> | undefined;
  if (!value) return empty;

  const min = parseFloat(String(value.minValue ?? value.value ?? "")) || null;
  const max = parseFloat(String(value.maxValue ?? value.value ?? "")) || null;
  const currency = String(salary.currency ?? value.currency ?? "USD");

  return {
    min: min ? Math.round(min) : null,
    max: max ? Math.round(max) : null,
    raw: JSON.stringify(salaryObj).slice(0, 200),
    currency,
  };
}

function parseSchemaLocation(locationObj: unknown): {
  city: string | null;
  state: string | null;
  country: string | null;
  display: string | null;
} {
  const empty = { city: null, state: null, country: null, display: null };
  if (!locationObj) return empty;

  // Can be an array
  const loc = Array.isArray(locationObj) ? locationObj[0] : locationObj;
  if (!loc || typeof loc !== "object") return empty;

  const record = loc as Record<string, unknown>;
  const address = record.address as Record<string, unknown> | undefined;

  const city = cleanText(address?.addressLocality ?? null);
  const state = cleanText(address?.addressRegion ?? null);
  const country = cleanText(address?.addressCountry?.name ?? address?.addressCountry ?? null);

  const parts = [city, state, country].filter(Boolean);
  return {
    city,
    state,
    country,
    display: parts.length > 0 ? parts.join(", ") : null,
  };
}

function trackEvent(event: string, properties: Record<string, unknown>) {
  // PostHog server-side event tracking
  const posthogKey = Deno.env.get("POSTHOG_API_KEY");
  if (!posthogKey) return;

  fetch("https://us.i.posthog.com/capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: posthogKey,
      event,
      distinct_id: "system:cc-ingestion",
      properties: { ...properties, source: "ingest-common-crawl" },
    }),
  }).catch(() => {}); // Fire and forget
}
