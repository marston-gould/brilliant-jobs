// refresh-jobs Edge Function v15
// Multi-ATS job scraper with TIERED REFRESH.
// Boards are prioritized by activity:
//   HOT  (job_count > 0):              ~9K boards — refresh every 6h
//   WARM (job_count = 0, not dead):   ~29K boards — refresh every 3 days
//   COLD (404/inactive):              ~1.3K boards — refresh weekly
//
// Board selection query picks stalest boards within the tier that's
// due for refresh, weighted so HOT boards always get priority.
//
// pg_cron fires every 3 minutes, batch=150 → full HOT cycle in ~6h,
// WARM in ~3 days, COLD weekly. ~310 invocations/day.
//
// v15 changes:
//   - Salary extraction for Lever (salaryRange: min/max/currency/interval)
//   - Salary extraction for Recruitee (salary: min/max/period/currency)
//   - Salary fields conditionally included in upsert (don't null-out existing)
//   - Workable widget API confirmed: no salary data available
//
// v14 changes:
//   - Phase 3A: Greenhouse API token scraping during refresh
//   - Scrapes gh_token from career page (iframe embed, JS variable)
//   - Stores in ats_companies.api_key_encrypted for Phase 3B submission
//   - Token scraping is non-blocking (fire-and-forget, bounded 10s timeout)
//
// v13 changes:
//   - Tiered refresh (HOT/WARM/COLD) based on job_count + last_http_status
//   - Default batch increased from 50 to 150
//   - Concurrency bumped from 5 to 10
//   - Skip dead boards (404) unless stale > 7 days
//
// v12 changes:
//   - Records last_http_status + last_refresh_at on every board fetch
//   - Timeout/network errors → status 0
//   - 4xx/5xx → actual status code
//   - 200 → success
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

const CONCURRENCY = 10;
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
  apply_url: string;
  location: string | null;
  department: string | null;
  content: string | null;
  loc_city: string | null;
  loc_state: string | null;
  loc_country: string | null;
  is_remote: boolean;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_rate: string | null;
}

// ============ ATS SCRAPERS ============

// A6: Now uses shared resilience module with retry + exponential backoff
async function fetchBoard(url: string): Promise<Response> {
  return fetchWithRetry(url, {
    headers: { Accept: "application/json" },
  }, TIMEOUT_CONFIGS.ats);
}

// --- Greenhouse ---
function parseGreenhouseJobs(data: Record<string, unknown>, slug: string, companyName: string): ParsedJob[] {
  const jobs = data?.jobs;
  if (!jobs || !Array.isArray(jobs)) return [];
  return (jobs as Record<string, unknown>[]).map((j) => {
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
      apply_url: `https://boards.greenhouse.io/${slug}/jobs/${j.id}#app`,
      location: loc,
      department: dept,
      content: null,
      loc_city: null,
      loc_state: null,
      loc_country: null,
      is_remote: isRemote,
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      salary_rate: null,
    };
  });
}

// --- Lever ---
function parseLeverJobs(data: Record<string, unknown>, slug: string, companyName: string): ParsedJob[] {
  if (!Array.isArray(data)) return [];
  return data.map((j: Record<string, unknown>) => {
    const loc = j.categories?.location || null;
    const dept = j.categories?.team || j.categories?.department || null;
    const isRemote = !!(loc && /remote/i.test(loc)) ||
      !!(j.workplaceType && /remote/i.test(j.workplaceType));
    // Lever salary: { min, max, currency, interval }
    const sr = j.salaryRange || null;
    let salaryMin: number | null = null;
    let salaryMax: number | null = null;
    let salaryCurrency: string | null = null;
    let salaryRate: string | null = null;
    if (sr && (sr.min || sr.max)) {
      salaryMin = typeof sr.min === "number" ? sr.min : null;
      salaryMax = typeof sr.max === "number" ? sr.max : null;
      salaryCurrency = sr.currency || "USD";
      // Normalize Lever interval to our rate format
      const interval = (sr.interval || "").toLowerCase();
      if (interval.includes("year") || interval.includes("salary")) salaryRate = "yr";
      else if (interval.includes("hour")) salaryRate = "hr";
      else if (interval.includes("month")) salaryRate = "mo";
      else if (interval.includes("week")) salaryRate = "wk";
      else salaryRate = "yr"; // default assumption for Lever
    }
    return {
      greenhouse_id: String(j.id),
      ats_source: "lever",
      company_slug: slug,
      company_name: companyName || slug,
      title: j.text || "Untitled",
      url: j.hostedUrl || `https://jobs.lever.co/${slug}/${j.id}`,
      apply_url: (j.hostedUrl || `https://jobs.lever.co/${slug}/${j.id}`) + '/apply',
      location: loc,
      department: dept,
      content: j.descriptionPlain || j.description || null,
      loc_city: null,
      loc_state: null,
      loc_country: null,
      is_remote: isRemote,
      salary_min: salaryMin,
      salary_max: salaryMax,
      salary_currency: salaryCurrency,
      salary_rate: salaryRate,
    };
  });
}

// --- Ashby ---
function parseAshbyJobs(data: Record<string, unknown>, slug: string, companyName: string): ParsedJob[] {
  if (!data?.jobs || !Array.isArray(data.jobs)) return [];
  return (data.jobs as Record<string, unknown>[]).map((j) => {
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
      apply_url: j.jobUrl || `https://jobs.ashbyhq.com/${slug}/${j.id}`,
      location: loc,
      department: dept,
      content: j.descriptionHtml || j.descriptionPlain || null,
      loc_city: null,
      loc_state: null,
      loc_country: null,
      is_remote: isRemote,
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      salary_rate: null,
    };
  });
}

// --- Workable ---
function parseWorkableJobs(data: Record<string, unknown>, slug: string, companyName: string): ParsedJob[] {
  if (!data?.jobs || !Array.isArray(data.jobs)) return [];
  return (data.jobs as Record<string, unknown>[]).map((j) => {
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
      apply_url: j.url || `https://apply.workable.com/${slug}/j/${j.shortcode}/`,
      location: loc,
      department: dept,
      content: j.description || null,
      loc_city: j.city || null,
      loc_state: j.state || null,
      loc_country: j.country || null,
      is_remote: isRemote,
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      salary_rate: null,
    };
  });
}

// --- Recruitee ---
function parseRecruiteeJobs(data: Record<string, unknown>, slug: string, companyName: string): ParsedJob[] {
  if (!data?.offers || !Array.isArray(data.offers)) return [];
  return (data.offers as Record<string, unknown>[]).map((j) => {
    const loc = j.location || j.city || null;
    const dept = j.department || null;
    const isRemote = j.remote === true || !!(loc && /remote/i.test(loc));
    // Recruitee salary: { min, max, period, currency }
    const sal = j.salary || null;
    let salaryMin: number | null = null;
    let salaryMax: number | null = null;
    let salaryCurrency: string | null = null;
    let salaryRate: string | null = null;
    if (sal && (sal.min || sal.max)) {
      salaryMin = sal.min ? Number(sal.min) : null;
      salaryMax = sal.max ? Number(sal.max) : null;
      if (salaryMin !== null && isNaN(salaryMin)) salaryMin = null;
      if (salaryMax !== null && isNaN(salaryMax)) salaryMax = null;
      salaryCurrency = sal.currency || "USD";
      // Normalize Recruitee period to our rate format
      const period = (sal.period || "").toLowerCase();
      if (period.includes("year") || period === "annual") salaryRate = "yr";
      else if (period.includes("hour")) salaryRate = "hr";
      else if (period.includes("month")) salaryRate = "mo";
      else if (period.includes("week")) salaryRate = "wk";
      else salaryRate = "yr"; // default
    }
    return {
      greenhouse_id: String(j.id),
      ats_source: "recruitee",
      company_slug: slug,
      company_name: companyName || slug,
      title: j.title || "Untitled",
      url: j.careers_url || j.url || `https://${slug}.recruitee.com/o/${j.slug || j.id}`,
      apply_url: j.careers_url || j.url || `https://${slug}.recruitee.com/o/${j.slug || j.id}`,
      location: loc,
      department: dept,
      content: j.description || j.body || null,
      loc_city: j.city || null,
      loc_state: j.state_code || null,
      loc_country: j.country_code || null,
      is_remote: isRemote,
      salary_min: salaryMin,
      salary_max: salaryMax,
      salary_currency: salaryCurrency,
      salary_rate: salaryRate,
    };
  });
}

// ============ GREENHOUSE TOKEN SCRAPING (Phase 3A) ============

/**
 * Scrape the Greenhouse Job Board API token (gh_token / mapped_url_token)
 * from the employer's career page. These tokens are public — embedded in
 * the iframe src or JS variable on the career page.
 *
 * Two known patterns:
 *   1. iframe: <iframe src="...?token=XXXX...">
 *   2. JS var: Grnhse.Settings = { ... boardToken: "XXXX" ... }
 *      or:     gh_token = "XXXX"
 *
 * Returns { token, source } or null if not found.
 */
async function scrapeGreenhouseToken(slug: string): Promise<{ token: string; source: string } | null> {
  try {
    // Fetch the Greenhouse-hosted career page (not the API)
    const pageUrl = `https://boards.greenhouse.io/${slug}`;
    const resp = await fetch(pageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BrilliantJobs/1.0)" },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) return null;
    const html = await resp.text();

    // Pattern 1: iframe embed with token param
    // e.g. <iframe ... src="https://boards.greenhouse.io/embed/job_board?for=slug&token=ABCDEF123">
    const iframeMatch = html.match(/[?&]token=([a-zA-Z0-9_-]{6,})/);
    if (iframeMatch) {
      return { token: iframeMatch[1], source: "scraped_iframe" };
    }

    // Pattern 2: JS variable — Grnhse.Settings boardToken
    // e.g. Grnhse.Settings = { ... boardToken: "ABCDEF123" ... }
    const boardTokenMatch = html.match(/boardToken\s*:\s*["']([a-zA-Z0-9_-]{6,})["']/);
    if (boardTokenMatch) {
      return { token: boardTokenMatch[1], source: "scraped_js" };
    }

    // Pattern 3: gh_token variable
    // e.g. var gh_token = "ABCDEF123";
    const ghTokenMatch = html.match(/gh_token\s*[=:]\s*["']([a-zA-Z0-9_-]{6,})["']/);
    if (ghTokenMatch) {
      return { token: ghTokenMatch[1], source: "scraped_js" };
    }

    // Pattern 4: mapped_url_token in any context
    const mappedMatch = html.match(/mapped_url_token\s*[=:]\s*["']([a-zA-Z0-9_-]{6,})["']/);
    if (mappedMatch) {
      return { token: mappedMatch[1], source: "scraped_js" };
    }

    return null;
  } catch {
    // Timeout or network error — don't block refresh
    return null;
  }
}

/**
 * Store a scraped token in ats_companies. Only overwrites if:
 * - No existing token, OR
 * - Existing token was scraped (not manual/partner) and is stale (> 7 days)
 */
async function storeGreenhouseToken(slug: string, token: string, source: string) {
  const now = new Date().toISOString();

  // Check existing token — don't overwrite manual/partner keys
  const { data: existing } = await sb
    .from("ats_companies")
    .select("api_key_encrypted, api_key_source")
    .eq("slug", slug)
    .eq("source", "greenhouse")
    .maybeSingle();

  if (existing?.api_key_source === "manual" || existing?.api_key_source === "partner") {
    return; // Don't overwrite manually set or partner keys
  }

  await sb
    .from("ats_companies")
    .update({
      api_key_encrypted: token,
      api_key_source: source,
      api_key_scraped_at: now,
    })
    .eq("slug", slug)
    .eq("source", "greenhouse");
}

// ============ ATS CONFIG ============

const ATS_CONFIG: Record<string, {
  url: (slug: string) => string;
  parse: (data: Record<string, unknown>, slug: string, name: string) => ParsedJob[];
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
  httpStatus?: number;
}> {
  const config = ATS_CONFIG[board.source];
  if (!config) return { slug: board.slug, source: board.source, jobs: [], error: "unknown_ats", httpStatus: 0 };

  try {
    const resp = await fetchBoard(config.url(board.slug));

    if (resp.status === 404 || resp.status === 410) {
      return { slug: board.slug, source: board.source, jobs: [], error: `http_${resp.status}`, httpStatus: resp.status };
    }
    if (resp.status === 429) {
      return { slug: board.slug, source: board.source, jobs: [], error: "rate_limited", httpStatus: 429 };
    }
    if (!resp.ok) {
      return { slug: board.slug, source: board.source, jobs: [], error: `http_${resp.status}`, httpStatus: resp.status };
    }

    const data = await resp.json();
    const jobs = config.parse(data, board.slug, board.name || board.slug);
    return { slug: board.slug, source: board.source, jobs, httpStatus: 200 };
  } catch (e: unknown) {
    const msg = e.name === "AbortError" ? "timeout" : (e.message || "unknown").slice(0, 80);
    return { slug: board.slug, source: board.source, jobs: [], error: msg, httpStatus: 0 };
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
      apply_url: j.apply_url,
      location: j.location,
      department: j.department,
      content: j.content,
      loc_city: j.loc_city,
      loc_state: j.loc_state,
      loc_country: j.loc_country,
      is_remote: j.is_remote,
      // Salary: only set if parser found salary data (don't overwrite existing with null)
      ...(j.salary_min !== null || j.salary_max !== null ? {
        salary_min: j.salary_min,
        salary_max: j.salary_max,
        salary_currency: j.salary_currency,
        salary_rate: j.salary_rate,
      } : {}),
      // NOTE: status intentionally omitted — defaults to 'open' on INSERT,
      // but not overwritten on UPDATE. This prevents re-opening jobs that
      // users have confirmed as dead/closed via the UI (404/410 detection).
      updated_at: now,
      last_seen: now,
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
    .filter((j: ParsedJob) => !liveSet.has(j.greenhouse_id))
    .map((j: ParsedJob) => j.greenhouse_id);

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
      .in("greenhouse_id", batch)
      .is("closed_at", null);

    if (!error) closed += batch.length;
  }

  return closed;
}

// ============ UPDATE COMPANY ============

async function updateCompany(
  slug: string, source: string, jobCount: number,
  httpStatus: number, companyName?: string
) {
  const now = new Date().toISOString();
  const update: Partial<JobRow> = {
    job_count: jobCount,
    last_checked: now,
    last_http_status: httpStatus,
    last_refresh_at: now,
  };
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

// Tier thresholds (how long since last_checked before a tier is "due")
const TIER_THRESHOLDS = {
  hot:  6 * 60 * 60 * 1000,       // 6 hours
  warm: 3 * 24 * 60 * 60 * 1000,  // 3 days
  cold: 7 * 24 * 60 * 60 * 1000,  // 7 days
};

Deno.serve(async (req: Request) => {
  const startTime = Date.now();
  const url = new URL(req.url);
  const sourceFilter = url.searchParams.get("source") || null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "150") || 150, 300);
  const forceTier = url.searchParams.get("tier") || null; // override: hot|warm|cold|all

  console.log(`[refresh-jobs] v15 Starting: source=${sourceFilter || "all"}, limit=${limit}, tier=${forceTier || "auto"}`);

  // ── Tiered board selection ──
  // Priority: HOT boards due for refresh > WARM boards due > COLD boards due
  // Within each tier, stalest first (last_checked ASC NULLS FIRST)
  let boards: Board[] = [];

  if (forceTier === "all") {
    // Legacy mode: just grab stalest regardless of tier
    let query = sb
      .from("ats_companies")
      .select("slug, source, name")
      .order("last_checked", { ascending: true, nullsFirst: true })
      .limit(limit);
    if (sourceFilter) query = query.eq("source", sourceFilter);
    const { data } = await query;
    boards = data || [];
  } else {
    const now = Date.now();
    let remaining = limit;

    // HOT: boards with jobs (job_count > 0) that haven't been checked in 6h
    if (remaining > 0 && (!forceTier || forceTier === "hot")) {
      const hotCutoff = new Date(now - TIER_THRESHOLDS.hot).toISOString();
      let q = sb
        .from("ats_companies")
        .select("slug, source, name")
        .gt("job_count", 0)
        .or(`last_checked.is.null,last_checked.lt.${hotCutoff}`)
        .order("last_checked", { ascending: true, nullsFirst: true })
        .limit(remaining);
      if (sourceFilter) q = q.eq("source", sourceFilter);
      const { data } = await q;
      const hotBoards = data || [];
      boards.push(...hotBoards);
      remaining -= hotBoards.length;
      if (hotBoards.length > 0) {
        console.log(`[refresh-jobs] HOT: ${hotBoards.length} boards queued`);
      }
    }

    // WARM: boards with no jobs, active, not 404 — stale > 3 days
    if (remaining > 0 && (!forceTier || forceTier === "warm")) {
      const warmCutoff = new Date(now - TIER_THRESHOLDS.warm).toISOString();
      let q = sb
        .from("ats_companies")
        .select("slug, source, name")
        .eq("job_count", 0)
        .eq("is_active", true)
        .neq("last_http_status", 404)
        .or(`last_checked.is.null,last_checked.lt.${warmCutoff}`)
        .order("last_checked", { ascending: true, nullsFirst: true })
        .limit(remaining);
      if (sourceFilter) q = q.eq("source", sourceFilter);
      const { data } = await q;
      const warmBoards = data || [];
      boards.push(...warmBoards);
      remaining -= warmBoards.length;
      if (warmBoards.length > 0) {
        console.log(`[refresh-jobs] WARM: ${warmBoards.length} boards queued`);
      }
    }

    // COLD: dead/inactive boards — stale > 7 days
    if (remaining > 0 && (!forceTier || forceTier === "cold")) {
      const coldCutoff = new Date(now - TIER_THRESHOLDS.cold).toISOString();
      let q = sb
        .from("ats_companies")
        .select("slug, source, name")
        .or("last_http_status.eq.404,is_active.eq.false")
        .or(`last_checked.is.null,last_checked.lt.${coldCutoff}`)
        .order("last_checked", { ascending: true, nullsFirst: true })
        .limit(remaining);
      if (sourceFilter) q = q.eq("source", sourceFilter);
      const { data } = await q;
      const coldBoards = data || [];
      boards.push(...coldBoards);
      if (coldBoards.length > 0) {
        console.log(`[refresh-jobs] COLD: ${coldBoards.length} boards queued`);
      }
    }
  }

  if (!boards.length) {
    console.log(`[refresh-jobs] No boards due for refresh`);
    return new Response(
      JSON.stringify({ boards_processed: 0, jobs_upserted: 0, elapsed_seconds: 0, message: "All boards up to date" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  console.log(`[refresh-jobs] Processing ${boards.length} boards`);

  let totalJobs = 0;
  let totalClosed = 0;
  let errors = 0;
  let boardsProcessed = 0;
  let tokensScraped = 0;

  for (let i = 0; i < boards.length; i += CONCURRENCY) {
    if (Date.now() - startTime > 120_000) {
      console.log(`[refresh-jobs] Wall time limit at board ${i}/${boards.length}, stopping`);
      break;
    }

    const batch = boards.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((b: Board) => scrapeBoard(b)));

    // Phase 3A: Collect Greenhouse boards from this batch for token scraping
    // Run token scraping in parallel with job processing (non-blocking)
    const ghBoardsToScrape = batch.filter(
      (b) => b.source === "greenhouse" && results.find(
        (r) => r.slug === b.slug && r.source === "greenhouse" && !r.error
      )
    );

    // Fire-and-forget token scraping for Greenhouse boards (don't block refresh)
    const tokenPromises = ghBoardsToScrape.map(async (b) => {
      try {
        const tokenResult = await scrapeGreenhouseToken(b.slug);
        if (tokenResult) {
          await storeGreenhouseToken(b.slug, tokenResult.token, tokenResult.source);
          tokensScraped++;
          console.log(`[refresh-jobs] Token scraped: ${b.slug} (${tokenResult.source})`);
        }
      } catch {
        // Token scraping failures must never block the refresh cycle
      }
    });

    for (const result of results) {
      boardsProcessed++;
      const status = result.httpStatus ?? 0;

      if (result.error) {
        errors++;
        await updateCompany(result.slug, result.source, 0, status);
        continue;
      }

      if (result.jobs.length > 0) {
        const upserted = await upsertJobs(result.jobs);
        totalJobs += upserted;

        const liveIds = result.jobs.map((j) => j.greenhouse_id);
        const closed = await markClosedJobs(result.slug, result.source, liveIds);
        totalClosed += closed;

        const apiName = result.jobs[0]?.company_name;
        await updateCompany(result.slug, result.source, result.jobs.length, status, apiName);
      } else {
        await updateCompany(result.slug, result.source, 0, status);
      }
    }

    // Wait for token scraping to finish before next batch (bounded by 10s timeout each)
    await Promise.allSettled(tokenPromises);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const summary = {
    boards_processed: boardsProcessed,
    boards_total: boards.length,
    jobs_upserted: totalJobs,
    jobs_closed: totalClosed,
    tokens_scraped: tokensScraped,
    errors,
    elapsed_seconds: parseFloat(elapsed),
    source_filter: sourceFilter,
    tier: forceTier || "auto",
  };

  console.log(`[refresh-jobs] Done:`, JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});

