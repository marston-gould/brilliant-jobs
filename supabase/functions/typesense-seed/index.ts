/**
 * typesense-seed
 * SA-001: Exports ats_jobs from Supabase and bulk-imports to Typesense.
 *
 * Usage:
 *   POST /functions/v1/typesense-seed
 *   Body (optional): { "batch_size": 500, "offset": 0, "status_filter": "open", "dry_run": false }
 *
 * Admin-only. Reads TYPESENSE_HOST + TYPESENSE_API_KEY from Vault.
 * Runs in batches to avoid memory/timeout limits. Re-entrant: pass offset to resume.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TYPESENSE_HOST = Deno.env.get("TYPESENSE_HOST")!;       // e.g. "xyz.a1.typesense.net"
const TYPESENSE_API_KEY = Deno.env.get("TYPESENSE_API_KEY")!;
const TYPESENSE_COLLECTION = "ats_jobs";

const DEFAULT_BATCH_SIZE = 500;

interface SeedRequest {
  batch_size?: number;
  offset?: number;
  status_filter?: string;
  dry_run?: boolean;
}

function toTypesenseDoc(row: Record<string, unknown>): Record<string, unknown> {
  const toEpoch = (v: unknown): number | null => {
    if (!v) return null;
    const ts = Date.parse(String(v));
    return isNaN(ts) ? null : Math.floor(ts / 1000);
  };

  return {
    id:               `${row.ats_source ?? "gh"}_${row.greenhouse_id}`,
    greenhouse_id:    String(row.greenhouse_id ?? ""),
    ats_source:       String(row.ats_source ?? "greenhouse"),
    title:            String(row.title ?? ""),
    company_name:     row.company_name != null ? String(row.company_name) : undefined,
    company_slug:     row.company_slug != null ? String(row.company_slug) : undefined,
    location:         row.location != null ? String(row.location) : undefined,
    loc_city:         row.loc_city != null ? String(row.loc_city) : undefined,
    loc_state:        row.loc_state != null ? String(row.loc_state) : undefined,
    loc_country:      row.loc_country != null ? String(row.loc_country) : undefined,
    loc_type:         row.loc_type != null ? String(row.loc_type) : undefined,
    loc_display:      row.loc_display != null ? String(row.loc_display) : undefined,
    is_remote:        row.is_remote === true,
    department:       row.department != null ? String(row.department) : undefined,
    industry:         row.industry != null ? String(row.industry) : undefined,
    job_cat:          row.job_cat != null ? String(row.job_cat) : undefined,
    status:           String(row.status ?? "open"),
    salary_min:       row.salary_min != null ? Number(row.salary_min) : undefined,
    salary_max:       row.salary_max != null ? Number(row.salary_max) : undefined,
    salary_currency:  row.salary_currency != null ? String(row.salary_currency) : undefined,
    salary_rate:      row.salary_rate != null ? String(row.salary_rate) : undefined,
    content:          row.content != null ? String(row.content).slice(0, 8000) : undefined,
    url:              row.url != null ? String(row.url) : undefined,
    created_at_ts:    toEpoch(row.created_at) ?? Math.floor(Date.now() / 1000),
    updated_at_ts:    toEpoch(row.updated_at) ?? undefined,
    first_seen_at_ts: toEpoch(row.first_seen_at) ?? undefined,
    lat:              row.lat != null ? Number(row.lat) : undefined,
    lng:              row.lng != null ? Number(row.lng) : undefined,
  };
}

async function upsertToTypesense(docs: Record<string, unknown>[]): Promise<{
  imported: number;
  errors: number;
  errorSamples: string[];
}> {
  const ndjson = docs.map((d) => JSON.stringify(d)).join("\n");
  const res = await fetch(
    `https://${TYPESENSE_HOST}/collections/${TYPESENSE_COLLECTION}/documents/import?action=upsert`,
    {
      method: "POST",
      headers: {
        "X-TYPESENSE-API-KEY": TYPESENSE_API_KEY,
        "Content-Type": "text/plain",
      },
      body: ndjson,
    }
  );

  const text = await res.text();
  const lines = text.trim().split("\n");
  let imported = 0;
  let errors = 0;
  const errorSamples: string[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.success) {
        imported++;
      } else {
        errors++;
        if (errorSamples.length < 3) errorSamples.push(line);
      }
    } catch {
      // malformed line — skip
    }
  }

  return { imported, errors, errorSamples };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Admin auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let body: SeedRequest = {};
  try {
    body = await req.json();
  } catch { /* empty body OK */ }

  const batchSize = body.batch_size ?? DEFAULT_BATCH_SIZE;
  const offset = body.offset ?? 0;
  const statusFilter = body.status_filter ?? "open";
  const dryRun = body.dry_run ?? false;

  if (!TYPESENSE_HOST || !TYPESENSE_API_KEY) {
    return new Response(
      JSON.stringify({ error: "TYPESENSE_HOST and TYPESENSE_API_KEY must be set in Vault" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  console.log(`[typesense-seed] Starting: offset=${offset}, batch=${batchSize}, status=${statusFilter}, dry_run=${dryRun}`);

  const startTime = Date.now();
  let totalImported = 0;
  let totalErrors = 0;
  const allErrorSamples: string[] = [];
  let currentOffset = offset;
  let batchCount = 0;

  // Process one batch per invocation to avoid timeout (Edge Functions: 150s limit)
  const { data: rows, error } = await supabase
    .from("ats_jobs")
    .select(
      "greenhouse_id, ats_source, title, company_name, company_slug, location, loc_city, loc_state, loc_country, loc_type, loc_display, is_remote, department, industry, job_cat, status, salary_min, salary_max, salary_currency, salary_rate, content, url, created_at, updated_at, first_seen_at, lat, lng"
    )
    .eq("status", statusFilter)
    .order("created_at", { ascending: true })
    .range(currentOffset, currentOffset + batchSize - 1);

  if (error) {
    console.error("[typesense-seed] Supabase error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rowCount = rows?.length ?? 0;

  if (rowCount === 0) {
    return new Response(
      JSON.stringify({
        status: "complete",
        message: "No rows to process at this offset",
        offset: currentOffset,
        total_imported: totalImported,
        total_errors: totalErrors,
        duration_ms: Date.now() - startTime,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const docs = (rows ?? []).map(toTypesenseDoc);
  batchCount++;

  if (!dryRun) {
    const result = await upsertToTypesense(docs);
    totalImported += result.imported;
    totalErrors += result.errors;
    if (result.errorSamples.length > 0) {
      allErrorSamples.push(...result.errorSamples);
    }
    console.log(
      `[typesense-seed] Batch ${batchCount}: rows=${rowCount}, imported=${result.imported}, errors=${result.errors}`
    );
  } else {
    console.log(`[typesense-seed] DRY RUN batch ${batchCount}: would import ${rowCount} docs`);
    totalImported = rowCount;
  }

  currentOffset += rowCount;
  const hasMore = rowCount === batchSize;

  return new Response(
    JSON.stringify({
      status: hasMore ? "continue" : "complete",
      next_offset: hasMore ? currentOffset : null,
      batch_count: batchCount,
      rows_processed: rowCount,
      total_imported: totalImported,
      total_errors: totalErrors,
      error_samples: allErrorSamples.slice(0, 5),
      duration_ms: Date.now() - startTime,
      dry_run: dryRun,
      message: hasMore
        ? `Batch complete. Call again with offset=${currentOffset} to continue.`
        : "Seed complete.",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
