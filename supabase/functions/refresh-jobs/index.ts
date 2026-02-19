// refresh-jobs Edge Function v11
// Multi-ATS job scraper — processes 50 boards per invocation (stalest first).
// pg_cron fires every 10 minutes → full cycle of ~10K boards in ~33 hours.
//
// v11 changes:
//   - Removed ?content=true from Greenhouse (OOM fix)
//   - Default limit 50 (was 200, caused memory limit exceeded)
//
// Supports: Greenhouse, Lever, Ashby, Workable, Recruitee

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { fetchWithRetry, TIMEOUT_CONFIGS } from "../_shared/resilience.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CONCURRENCY = 5;
// A6: Timeout config now in _shared/resilience.ts (TIMEOUT_CONFIGS.ats = 15s)

// ============ TYPES ============

interface Board {
  slug: string;
  source: string;
  name: string | null;
}

interface ParsedJob {
  greenhouse_id: string;
  ats_source: string;
  company_slug: string;
  company_name: string;
  title: string;
  url: string;
  location: string | null;
  department: string | null;
  content: string | null;
  loc_city: string | null;
  loc_state: string | null;
  loc_country: string | null;
  is_remote: boolean;
}

// ============ ATS SCRAPERS ============

// A6: Now uses shared resilience module with retry + exponential backoff
async function fetchBoard(url: string): Promise<Response> {
  return fetchWithRetry(url, {
    headers: { Accept: "application/json" },
  }, TIMEOUT_CONFIGS.ats);
}

// --- Greenhouse ---
function parseGreenhouseJobs(data: any, slug: string, companyName: string): ParsedJob[] {
  if (!data?.jobs || !Array.isArray(data.jobs)) return [];
  return data.jobs.map((j: any) => {
    const loc = j.location?.name || null;
    const dept = j.departments?.[0]?.name || null;
    const isRemote = !!(loc && /remote/i.test(loc));
    return {
      greenhouse_id: String(j.id),
      ats_source: "greenhouse",
      company_slug: slug,
      company_name: companyName || slug,
      title: j.title || "Untitled",
      url: `https://boards.greenhouse.io/${slug}/jobs/${j.id}`,
      location: loc,
      department: dept,
      content: null,
      loc_city: null,
      loc_state: null,
      loc_country: null,
      is_remote: isRemote,
    };
  });
}

// --- Lever ---
function parseLeverJobs(data: any, slug: string, companyName: string): ParsedJob[] {
  if (!Array.isArray(data)) return [];
  return data.map((j: any) => {
    const loc = j.categories?.location || null;
    const dept = j.categories?.team || j.categories?.department || null;
    const isRemote = !!(loc && /remote/i.test(loc)) ||
      !!(j.workplaceType && /remote/i.test(j.workplaceType));
    return {
      greenhouse_id: String(j.id),
      ats_source: "lever",
      company_slug: slug,
      company_name: companyName || slug,
      title: j.text || "Untitled",
      url: j.hostedUrl || `https://jobs.lever.co/${slug}/${j.id}`,
      location: loc,
      department: dept,
      content: j.descriptionPlain || j.description || null,
      loc_city: null,
      loc_state: null,
      loc_country: null,
      is_remote: isRemote,
    };
  });
}

// --- Ashby ---
function parseAshbyJobs(data: any, slug: string, companyName: string): ParsedJob[] {
  if (!data?.jobs || !Array.isArray(data.jobs)) return [];
  return data.jobs.map((j: any) => {
    const loc = j.location || j.locationName || null;
    const dept = j.departmentName || j.department || null;
    const isRemote = j.isRemote === true || !!(loc && /remote/i.test(loc));
    return {
      greenhouse_id: String(j.id),
      ats_source: "ashby",
      company_slug: slug,
      company_name: companyName || slug,
      title: j.title || "Untitled",
      url: j.jobUrl || `https://jobs.ashbyhq.com/${slug}/${j.id}`,
      location: loc,
      department: dept,
      content: j.descriptionHtml || j.descriptionPlain || null,
      loc_city: null,
      loc_state: null,
      loc_country: null,
      is_remote: isRemote,
    };
  });
}

// --- Workable ---
function parseWorkableJobs(data: any, slug: string, companyName: string): ParsedJob[] {
  if (!data?.jobs || !Array.isArray(data.jobs)) return [];
  return data.jobs.map((j: any) => {
    const parts = [j.city, j.state, j.country].filter(Boolean);
    const loc = parts.length ? parts.join(", ") : null;
    const dept = j.department || null;
    const isRemote = j.telecommuting === true || !!(loc && /remote/i.test(loc));
    return {
      greenhouse_id: String(j.shortcode || j.id),
      ats_source: "workable",
      company_slug: slug,
      company_name: companyName || slug,
      title: j.title || "Untitled",
      url: j.url || `https://apply.workable.com/${slug}/j/${j.shortcode}/`,
      location: loc,
      department: dept,
      content: j.description || null,
      loc_city: j.city || null,
      loc_state: j.state || null,
      loc_country: j.country || null,
      is_remote: isRemote,
    };
  });
}

// --- Recruitee ---
function parseRecruiteeJobs(data: any, slug: string, companyName: string): ParsedJob[] {
  if (!data?.offers || !Array.isArray(data.offers)) return [];
  return data.offers.map((j: any) => {
    const loc = j.location || j.city || null;
    const dept = j.department || null;
    const isRemote = j.remote === true || !!(loc && /remote/i.test(loc));
    return {
      greenhouse_id: String(j.id),
      ats_source: "recruitee",
      company_slug: slug,
      company_name: companyName || slug,
      title: j.title || "Untitled",
      url: j.careers_url || j.url || `https://${slug}.recruitee.com/o/${j.slug || j.id}`,
      location: loc,
      department: dept,
      content: j.description || j.body || null,
      loc_city: j.city || null,
      loc_state: j.state_code || null,
      loc_country: j.country_code || null,
      is_remote: isRemote,
    };
  });
}

// ============ ATS CONFIG ============

const ATS_CONFIG: Record<string, {
  url: (slug: string) => string;
  parse: (data: any, slug: string, name: string) => ParsedJob[];
}> = {
  greenhouse: {
    url: (slug) => `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
    parse: parseGreenhouseJobs,
  },
  lever: {
    url: (slug) => `https://api.lever.co/v0/postings/${slug}?mode=json`,
    parse: parseLeverJobs,
  },
  ashby: {
    url: (slug) => `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
    parse: parseAshbyJobs,
  },
  workable: {
    url: (slug) => `https://apply.workable.com/api/v1/widget/accounts/${slug}`,
    parse: parseWorkableJobs,
  },
  recruitee: {
    url: (slug) => `https://${slug}.recruitee.com/api/offers`,
    parse: parseRecruiteeJobs,
  },
};

// ============ SCRAPE ONE BOARD ============

async function scrapeBoard(board: Board): Promise<{
  slug: string;
  source: string;
  jobs: ParsedJob[];
  error?: string;
}> {
  const config = ATS_CONFIG[board.source];
  if (!config) return { slug: board.slug, source: board.source, jobs: [], error: "unknown_ats" };

  try {
    const resp = await fetchBoard(config.url(board.slug));

    if (resp.status === 404 || resp.status === 410) {
      return { slug: board.slug, source: board.source, jobs: [], error: `http_${resp.status}` };
    }
    if (resp.status === 429) {
      return { slug: board.slug, source: board.source, jobs: [], error: "rate_limited" };
    }
    if (!resp.ok) {
      return { slug: board.slug, source: board.source, jobs: [], error: `http_${resp.status}` };
    }

    const data = await resp.json();
    const jobs = config.parse(data, board.slug, board.name || board.slug);
    return { slug: board.slug, source: board.source, jobs };
  } catch (e: any) {
    const msg = e.name === "AbortError" ? "timeout" : (e.message || "unknown").slice(0, 80);
    return { slug: board.slug, source: board.source, jobs: [], error: msg };
  }
}

// ============ UPSERT JOBS ============

async function upsertJobs(jobs: ParsedJob[]): Promise<number> {
  if (!jobs.length) return 0;

  let total = 0;
  const BATCH = 100;
  const now = new Date().toISOString();

  for (let i = 0; i < jobs.length; i += BATCH) {
    const batch = jobs.slice(i, i + BATCH);
    const rows = batch.map((j) => ({
      greenhouse_id: j.greenhouse_id,
      ats_source: j.ats_source,
      company_slug: j.company_slug,
      company_name: j.company_name,
      title: j.title,
      url: j.url,
      location: j.location,
      department: j.department,
      content: j.content,
      loc_city: j.loc_city,
      loc_state: j.loc_state,
      loc_country: j.loc_country,
      is_remote: j.is_remote,
      status: "open",
      last_seen: now,
      updated_at: now,
    }));

    const { error } = await sb
      .from("ats_jobs")
      .upsert(rows, {
        onConflict: "greenhouse_id,ats_source",
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`[refresh-jobs] Upsert error (batch ${i}):`, error.message);
    } else {
      total += batch.length;
    }
  }

  return total;
}

// ============ MARK CLOSED JOBS ============

async function markClosedJobs(
  slug: string,
  source: string,
  liveJobIds: string[]
): Promise<number> {
  if (!liveJobIds.length) return 0;

  const { data: openJobs } = await sb
    .from("ats_jobs")
    .select("greenhouse_id")
    .eq("company_slug", slug)
    .eq("ats_source", source)
    .eq("status", "open");

  if (!openJobs?.length) return 0;

  const liveSet = new Set(liveJobIds);
  const toClose = openJobs
    .filter((j: any) => !liveSet.has(j.greenhouse_id))
    .map((j: any) => j.greenhouse_id);

  if (!toClose.length) return 0;

  let closed = 0;
  const BATCH = 100;
  const now = new Date().toISOString();

  for (let i = 0; i < toClose.length; i += BATCH) {
    const batch = toClose.slice(i, i + BATCH);
    const { error } = await sb
      .from("ats_jobs")
      .update({ status: "closed", closed_at: now, updated_at: now })
      .eq("company_slug", slug)
      .eq("ats_source", source)
      .in("greenhouse_id", batch);

    if (!error) closed += batch.length;
  }

  return closed;
}

// ============ UPDATE COMPANY ============

async function updateCompany(slug: string, source: string, jobCount: number, companyName?: string) {
  const update: any = { job_count: jobCount, last_checked: new Date().toISOString() };
  if (companyName && companyName !== slug) {
    update.name = companyName;
  }
  await sb
    .from("ats_companies")
    .update(update)
    .eq("slug", slug)
    .eq("source", source);
}

// ============ MAIN HANDLER ============

Deno.serve(async (req: Request) => {
  const startTime = Date.now();
  const url = new URL(req.url);
  const sourceFilter = url.searchParams.get("source") || null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50") || 50, 200);

  console.log(`[refresh-jobs] v11 Starting: source=${sourceFilter || "all"}, limit=${limit}`);

  let query = sb
    .from("ats_companies")
    .select("slug, source, name")
    .order("last_checked", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (sourceFilter) {
    query = query.eq("source", sourceFilter);
  }

  const { data: boards, error: boardError } = await query;

  if (boardError || !boards?.length) {
    console.log(`[refresh-jobs] No boards: ${boardError?.message || "empty"}`);
    return new Response(
      JSON.stringify({ boards_processed: 0, jobs_upserted: 0, elapsed_seconds: 0 }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  console.log(`[refresh-jobs] Processing ${boards.length} boards`);

  let totalJobs = 0;
  let totalClosed = 0;
  let errors = 0;
  let boardsProcessed = 0;

  for (let i = 0; i < boards.length; i += CONCURRENCY) {
    if (Date.now() - startTime > 120_000) {
      console.log(`[refresh-jobs] Wall time limit at board ${i}/${boards.length}, stopping`);
      break;
    }

    const batch = boards.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((b: Board) => scrapeBoard(b)));

    for (const result of results) {
      boardsProcessed++;

      if (result.error) {
        errors++;
        await updateCompany(result.slug, result.source, 0);
        continue;
      }

      if (result.jobs.length > 0) {
        const upserted = await upsertJobs(result.jobs);
        totalJobs += upserted;

        const liveIds = result.jobs.map((j) => j.greenhouse_id);
        const closed = await markClosedJobs(result.slug, result.source, liveIds);
        totalClosed += closed;

        const apiName = result.jobs[0]?.company_name;
        await updateCompany(result.slug, result.source, result.jobs.length, apiName);
      } else {
        await updateCompany(result.slug, result.source, 0);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const summary = {
    boards_processed: boardsProcessed,
    boards_total: boards.length,
    jobs_upserted: totalJobs,
    jobs_closed: totalClosed,
    errors,
    elapsed_seconds: parseFloat(elapsed),
    source_filter: sourceFilter,
  };

  console.log(`[refresh-jobs] Done:`, JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});
