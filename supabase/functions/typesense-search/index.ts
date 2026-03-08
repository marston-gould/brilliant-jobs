/**
 * typesense-search
 * SA-003: Search Edge Function using Typesense with Postgres FTS fallback.
 *
 * Request:
 *   POST /functions/v1/typesense-search
 *   {
 *     "q": "software engineer",
 *     "filters": {
 *       "ats_source": ["greenhouse", "lever"],
 *       "loc_state": "CA",
 *       "is_remote": true,
 *       "salary_min": 80000
 *     },
 *     "sort_by": "created_at_ts:desc",   // or "relevance", "salary_max:desc"
 *     "page": 1,
 *     "per_page": 20,
 *     "facets": ["ats_source", "loc_state", "is_remote", "department", "industry", "job_cat"]
 *   }
 *
 * Response shape matches existing Supabase RPC for zero-friction swap.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TYPESENSE_HOST = Deno.env.get("TYPESENSE_HOST")!;
const TYPESENSE_API_KEY = Deno.env.get("TYPESENSE_API_KEY")!;
const TYPESENSE_COLLECTION = "ats_jobs";

interface SearchRequest {
  q?: string;
  filters?: {
    ats_source?: string | string[];
    loc_state?: string | string[];
    loc_city?: string | string[];
    is_remote?: boolean;
    salary_min?: number;
    salary_max?: number;
    status?: string;
    industry?: string | string[];
    job_cat?: string | string[];
    department?: string | string[];
  };
  sort_by?: string;
  page?: number;
  per_page?: number;
  facets?: string[];
}

function buildFilterString(filters: SearchRequest["filters"]): string {
  if (!filters) return "status:=open";
  const parts: string[] = ["status:=open"];

  const arrFilter = (field: string, val: string | string[]) => {
    const vals = Array.isArray(val) ? val : [val];
    return vals.map((v) => `${field}:=${v}`).join(" || ");
  };

  if (filters.ats_source) parts.push(`(${arrFilter("ats_source", filters.ats_source)})`);
  if (filters.loc_state) parts.push(`(${arrFilter("loc_state", filters.loc_state)})`);
  if (filters.loc_city) parts.push(`(${arrFilter("loc_city", filters.loc_city)})`);
  if (filters.industry) parts.push(`(${arrFilter("industry", filters.industry)})`);
  if (filters.job_cat) parts.push(`(${arrFilter("job_cat", filters.job_cat)})`);
  if (filters.department) parts.push(`(${arrFilter("department", filters.department)})`);
  if (filters.is_remote === true) parts.push("is_remote:=true");
  if (filters.is_remote === false) parts.push("is_remote:=false");
  if (filters.salary_min != null) parts.push(`salary_max:>=${filters.salary_min}`);
  if (filters.salary_max != null) parts.push(`salary_min:<=${filters.salary_max}`);

  return parts.join(" && ");
}

function buildSortString(sort_by?: string): string {
  switch (sort_by) {
    case "date":
    case "created_at_ts:desc":
      return "created_at_ts:desc";
    case "salary_max:desc":
    case "salary":
      return "salary_max:desc,created_at_ts:desc";
    case "salary_min:asc":
      return "salary_min:asc,created_at_ts:desc";
    case "relevance":
    default:
      return "_text_match:desc,created_at_ts:desc";
  }
}

async function searchTypesense(
  body: SearchRequest
): Promise<{ data: Record<string, unknown>[]; facets: Record<string, unknown>; total: number; engine: "typesense" }> {
  const q = body.q?.trim() || "*";
  const page = body.page ?? 1;
  const perPage = Math.min(body.per_page ?? 20, 100);
  const filterBy = buildFilterString(body.filters);
  const sortBy = buildSortString(body.sort_by);
  const facetBy = (body.facets ?? ["ats_source", "loc_state", "is_remote", "department", "industry", "job_cat"]).join(",");

  const params = new URLSearchParams({
    q,
    query_by: "title,company_name,department,content",
    query_by_weights: "5,3,2,1",
    filter_by: filterBy,
    sort_by: sortBy,
    facet_by: facetBy,
    max_facet_values: "30",
    page: String(page),
    per_page: String(perPage),
    typo_tokens_threshold: "1",
    num_typos: "2",
    highlight_full_fields: "title,company_name",
    include_fields: "id,greenhouse_id,ats_source,title,company_name,company_slug,location,loc_city,loc_state,loc_country,loc_type,loc_display,is_remote,department,industry,job_cat,status,salary_min,salary_max,salary_currency,salary_rate,url,created_at_ts,lat,lng",
  });

  const res = await fetch(
    `https://${TYPESENSE_HOST}/collections/${TYPESENSE_COLLECTION}/documents/search?${params}`,
    {
      headers: { "X-TYPESENSE-API-KEY": TYPESENSE_API_KEY },
    }
  );

  if (!res.ok) {
    throw new Error(`Typesense search failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();

  // Normalize hits to match existing Supabase RPC shape
  const data = (json.hits ?? []).map((hit: Record<string, unknown>) => {
    const doc = hit.document as Record<string, unknown>;
    return {
      ...doc,
      // Re-hydrate timestamps from epoch back to ISO for frontend compatibility
      created_at: doc.created_at_ts ? new Date(Number(doc.created_at_ts) * 1000).toISOString() : null,
      // Highlight snippets for UI
      _highlights: hit.highlights ?? [],
    };
  });

  // Normalize facets
  const facets: Record<string, unknown> = {};
  for (const fc of json.facet_counts ?? []) {
    facets[fc.field_name] = fc.counts?.map((c: Record<string, unknown>) => ({
      value: c.value,
      count: c.count,
    }));
  }

  return { data, facets, total: json.found ?? 0, engine: "typesense" };
}

async function fallbackPostgresFTS(
  supabase: ReturnType<typeof createClient>,
  body: SearchRequest
): Promise<{ data: Record<string, unknown>[]; facets: Record<string, unknown>; total: number; engine: "postgres" }> {
  const q = body.q?.trim() || "";
  const page = body.page ?? 1;
  const perPage = Math.min(body.per_page ?? 20, 100);
  const from = (page - 1) * perPage;

  let query = supabase
    .from("ats_jobs")
    .select("*", { count: "exact" })
    .eq("status", "open")
    .range(from, from + perPage - 1)
    .order("created_at", { ascending: false });

  if (q) {
    query = query.textSearch("search_vector", q, { type: "websearch" });
  }

  if (body.filters?.is_remote === true) query = query.eq("is_remote", true);
  if (body.filters?.loc_state) {
    const states = Array.isArray(body.filters.loc_state) ? body.filters.loc_state : [body.filters.loc_state];
    query = query.in("loc_state", states);
  }
  if (body.filters?.ats_source) {
    const sources = Array.isArray(body.filters.ats_source) ? body.filters.ats_source : [body.filters.ats_source];
    query = query.in("ats_source", sources);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(`Postgres FTS failed: ${error.message}`);

  return { data: (data as Record<string, unknown>[]) ?? [], facets: {}, total: count ?? 0, engine: "postgres" };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let body: SearchRequest = {};
  try {
    body = await req.json();
  } catch (e) { console.warn("[EF][typesense_search_json_parse]", e?.message || String(e));
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Try Typesense first
  if (TYPESENSE_HOST && TYPESENSE_API_KEY) {
    try {
      const result = await searchTypesense(body);
      return new Response(
        JSON.stringify({ ...result, degraded: false }),
        { headers: corsHeaders }
      );
    } catch (err) {
      console.error("[typesense-search] Typesense failed, falling back to Postgres FTS:", err);
      // Fall through to Postgres
    }
  }

  // Postgres FTS fallback (degraded mode)
  try {
    const result = await fallbackPostgresFTS(supabase, body);
    return new Response(
      JSON.stringify({ ...result, degraded: true, degraded_reason: "typesense_unavailable" }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("[typesense-search] Postgres FTS also failed:", err);
    return new Response(
      JSON.stringify({ error: "Search unavailable", details: String(err) }),
      { status: 503, headers: corsHeaders }
    );
  }
});
