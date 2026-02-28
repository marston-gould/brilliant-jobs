// supabase/functions/discover-boards/index.ts
//
// Background Discovery Pipeline — Item #2 (v3)
// Two input sources:
//   A. companies table — company names from extension scanner, probe all 5 ATS platforms
//   B. board_discovery_queue — specific ATS URLs detected by extension, verify & add
//
// Called by pg_cron every 6 hours, or manually via POST.
//
// Flow A (companies):
//   1. Query companies with discovery_status IS NULL
//   2. For each, probe Greenhouse / Lever / Ashby / Workable / Recruitee / Workday APIs
//   3. If valid → insert into ats_companies
//   4. Mark company as checked
//
// Flow B (board_discovery_queue):
//   1. Query pending entries from board_discovery_queue
//   2. Check if slug+platform already in ats_companies
//   3. If not, probe the specific platform
//   4. If valid → insert into ats_companies, mark as 'found'

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const BATCH_SIZE = 50;
const QUEUE_BATCH_SIZE = 25;
const PROBE_TIMEOUT_MS = 8000;

// ─── Junk filter ───────────────────────────────────────────────
function isJunkCompanyName(name: string): boolean {
  const s = name.trim();
  if (s.length < 2 || s.length > 100) return true;
  if (/^[A-Z][a-z]+,\s*(([A-Z]{2})|([A-Z][a-z]+))/.test(s)) return true;
  if (/^Greater\s/.test(s)) return true;
  if (/,\s*(United States|Canada|UK|India|Spain|Germany|France|Australia)/i.test(s)) return true;
  if (/^\d[\d,]+\s*followers?$/i.test(s)) return true;
  if (s.length > 60 && s.split(" ").length > 10) return true;
  if (/^\d+$/.test(s)) return true;
  if (/^(full-time|part-time|contract|freelance|self-employed|internship|seasonal|temporary)$/i.test(s)) return true;
  if (/^[A-Z][a-z]{2,8}\s+\d{4}/.test(s)) return true;
  if (/^\d+\s+(yr|mo|day|week)/i.test(s)) return true;
  return false;
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").replace(/-+/g, "-");
}

function toSlugStripped(name: string): string {
  return toSlug(name).replace(/-(inc|llc|ltd|co|corp|corporation|group|international|intl|company)$/, "");
}

// ─── Platform-specific API probers ────────────────────────────

async function probeGreenhouse(slug: string): Promise<{ ok: boolean; jobCount: number }> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), PROBE_TIMEOUT_MS);
    const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`, { signal: c.signal });
    clearTimeout(t);
    if (r.status !== 200) return { ok: false, jobCount: 0 };
    const d = await r.json();
    return { ok: true, jobCount: d?.jobs?.length || 0 };
  } catch { return { ok: false, jobCount: 0 }; }
}

async function probeLever(slug: string): Promise<{ ok: boolean; jobCount: number }> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), PROBE_TIMEOUT_MS);
    const r = await fetch(`https://jobs.lever.co/${slug}`, { signal: c.signal, headers: { "User-Agent": "BrilliantJobs-Discovery/1.0" } });
    clearTimeout(t);
    if (r.status === 404) return { ok: false, jobCount: 0 };
    if (r.url === "https://www.lever.co/" || !r.url.includes("jobs.lever.co")) return { ok: false, jobCount: 0 };
    const body = await r.text();
    const jobCount = (body.match(/class="posting-title"/g) || []).length;
    const hasNoJobs = body.toLowerCase().includes("no open positions");
    return { ok: !hasNoJobs || jobCount > 0, jobCount };
  } catch { return { ok: false, jobCount: 0 }; }
}

async function probeAshby(slug: string): Promise<{ ok: boolean; jobCount: number }> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), PROBE_TIMEOUT_MS);
    const r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, { signal: c.signal });
    clearTimeout(t);
    if (r.status !== 200) return { ok: false, jobCount: 0 };
    const d = await r.json();
    return { ok: true, jobCount: d?.jobs?.length || 0 };
  } catch { return { ok: false, jobCount: 0 }; }
}

async function probeWorkable(slug: string): Promise<{ ok: boolean; jobCount: number }> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), PROBE_TIMEOUT_MS);
    const r = await fetch(`https://apply.workable.com/api/v1/widget/accounts/${slug}?details=true`, { signal: c.signal });
    clearTimeout(t);
    if (r.status !== 200) return { ok: false, jobCount: 0 };
    const d = await r.json();
    return { ok: true, jobCount: d?.jobs?.length || 0 };
  } catch { return { ok: false, jobCount: 0 }; }
}

async function probeRecruitee(slug: string): Promise<{ ok: boolean; jobCount: number }> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), PROBE_TIMEOUT_MS);
    const r = await fetch(`https://${slug}.recruitee.com/api/offers/`, { signal: c.signal });
    clearTimeout(t);
    if (r.status !== 200) return { ok: false, jobCount: 0 };
    const d = await r.json();
    return { ok: true, jobCount: d?.offers?.length || 0 };
  } catch { return { ok: false, jobCount: 0 }; }
}

async function probeWorkday(slug: string): Promise<{ ok: boolean; jobCount: number; wdNum?: number }> {
  // Workday career sites use {company}.wd{N}.myworkdayjobs.com where N is 1-5.
  // We probe each variant until we find one that returns jobs.
  for (const n of [1, 2, 3, 5]) {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), PROBE_TIMEOUT_MS);
      const url = `https://${slug}.wd${n}.myworkdayjobs.com/wday/cxs/${slug}/External/jobs`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0 }),
        signal: c.signal,
      });
      clearTimeout(t);
      if (r.status !== 200) continue;
      const d = await r.json();
      const total = d?.total || 0;
      if (total > 0) return { ok: true, jobCount: total, wdNum: n };
    } catch { /* try next variant */ }
  }
  return { ok: false, jobCount: 0 };
}

const PROBERS: Record<string, (slug: string) => Promise<{ ok: boolean; jobCount: number; wdNum?: number }>> = {
  greenhouse: probeGreenhouse, lever: probeLever, ashby: probeAshby,
  workable: probeWorkable, recruitee: probeRecruitee, workday: probeWorkday,
};

const PLATFORM_URLS: Record<string, (slug: string, wdNum?: number) => string> = {
  greenhouse: (s) => `https://boards.greenhouse.io/${s}`,
  lever: (s) => `https://jobs.lever.co/${s}`,
  ashby: (s) => `https://jobs.ashbyhq.com/${s}`,
  workable: (s) => `https://apply.workable.com/${s}/`,
  recruitee: (s) => `https://${s}.recruitee.com/`,
  workday: (s, n = 1) => `https://${s}.wd${n}.myworkdayjobs.com/en-US/External`,
};

// ─── Flow B: Process board_discovery_queue ─────────────────────
async function processDiscoveryQueue(logger: ReturnType<typeof createLogger>): Promise<{
  queueProcessed: number; queueFound: number; queueAlreadyTracked: number; queueNotFound: number; queueErrors: number;
}> {
  const stats = { queueProcessed: 0, queueFound: 0, queueAlreadyTracked: 0, queueNotFound: 0, queueErrors: 0 };

  const { data: pending, error: fetchErr } = await sb
    .from("board_discovery_queue")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(QUEUE_BATCH_SIZE);

  if (fetchErr || !pending || pending.length === 0) {
    if (fetchErr) logger.error("Failed to fetch discovery queue", { error: fetchErr.message });
    return stats;
  }

  logger.info(`Processing ${pending.length} board_discovery_queue entries`);

  for (const entry of pending) {
    stats.queueProcessed++;
    const platform = entry.platform?.toLowerCase();
    const slug = entry.board_slug;

    if (!platform || !slug || !PROBERS[platform]) {
      await sb.from("board_discovery_queue").update({
        status: "error", error_message: `Invalid platform: ${platform}`, processed_at: new Date().toISOString()
      }).eq("id", entry.id);
      stats.queueErrors++;
      continue;
    }

    // Check if already tracked in ats_companies
    const { count } = await sb
      .from("ats_companies")
      .select("slug", { count: "exact", head: true })
      .eq("slug", slug)
      .eq("source", platform);

    if ((count || 0) > 0) {
      await sb.from("board_discovery_queue").update({
        status: "already_tracked", result_slug: slug, result_source: platform, processed_at: new Date().toISOString()
      }).eq("id", entry.id);
      stats.queueAlreadyTracked++;
      continue;
    }

    // Probe the platform
    try {
      const result = await PROBERS[platform](slug);

      if (result.ok) {
        const { error: insertErr } = await sb.from("ats_companies").insert({
          slug, source: platform, name: slug,
          is_active: true, last_http_status: 200,
          job_count: result.jobCount,
          created_at: new Date().toISOString(),
          last_checked: new Date().toISOString(),
        });

        if (insertErr) {
          if (insertErr.message.includes("duplicate") || insertErr.message.includes("unique")) {
            await sb.from("board_discovery_queue").update({
              status: "already_tracked", result_slug: slug, result_source: platform, processed_at: new Date().toISOString()
            }).eq("id", entry.id);
            stats.queueAlreadyTracked++;
          } else {
            await sb.from("board_discovery_queue").update({
              status: "error", error_message: insertErr.message, processed_at: new Date().toISOString()
            }).eq("id", entry.id);
            stats.queueErrors++;
          }
        } else {
          await sb.from("board_discovery_queue").update({
            status: "found", result_slug: slug, result_source: platform, processed_at: new Date().toISOString()
          }).eq("id", entry.id);
          stats.queueFound++;
          logger.info(`Queue: discovered ${platform}/${slug} (${result.jobCount} jobs)`);
        }
      } else {
        await sb.from("board_discovery_queue").update({
          status: "not_found", processed_at: new Date().toISOString()
        }).eq("id", entry.id);
        stats.queueNotFound++;
      }
    } catch (e) {
      await sb.from("board_discovery_queue").update({
        status: "error", error_message: (e as Error).message, processed_at: new Date().toISOString()
      }).eq("id", entry.id);
      stats.queueErrors++;
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  return stats;
}

// ─── Main handler ─────────────────────────────────────────────
Deno.serve(async (_req) => {
  const logger = createLogger("discover-boards", crypto.randomUUID());
  const start = Date.now();

  try {
    // ═══ Flow B: Process board_discovery_queue first (faster, targeted) ═══
    const queueStats = await processDiscoveryQueue(logger);

    // ═══ Flow A: Process companies table (broader, exploratory) ═══
    const { data: companies, error: fetchErr } = await sb
      .from("companies")
      .select("company_name, company_id, company_url")
      .is("discovery_status", null)
      .not("company_name", "is", null)
      .not("company_name", "eq", "")
      .order("id", { ascending: false })
      .limit(BATCH_SIZE * 3);

    if (fetchErr) {
      logger.error("Failed to fetch companies", { error: fetchErr.message });
      return jsonResp({ error: fetchErr.message, queueStats }, 500);
    }

    if (!companies || companies.length === 0) {
      const elapsed = Date.now() - start;
      return jsonResp({ message: "No unchecked companies", discovered: 0, queueStats, elapsed_ms: elapsed });
    }

    // Deduplicate & filter junk
    const seen = new Set<string>();
    const unique: typeof companies = [];
    for (const c of companies) {
      const key = c.company_name.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      if (isJunkCompanyName(c.company_name)) {
        await markDiscoveryStatus(c.company_name, "skipped");
        continue;
      }
      unique.push(c);
      if (unique.length >= BATCH_SIZE) break;
    }

    logger.info(`Checking ${unique.length} companies for ATS boards`);

    let discovered = 0, checked = 0, alreadyExists = 0;
    const errors: string[] = [];
    const newBoards: { name: string; source: string; slug: string; url: string; jobs: number }[] = [];

    for (const company of unique) {
      const name = company.company_name.trim();
      const slugs = [toSlug(name)];
      const stripped = toSlugStripped(name);
      if (stripped !== slugs[0]) slugs.push(stripped);

      // v5.57: Add corporate suffix variants (catches 243+ GH boards like "cogstateinc")
      const base = stripped || slugs[0];
      for (const sfx of ["inc", "-inc", "llc", "co", "corp"]) {
        const variant = base + sfx;
        if (!slugs.includes(variant)) slugs.push(variant);
      }

      let found = false;

      for (const slug of slugs) {
        if (!slug || slug.length < 2) continue;

        for (const [platform, prober] of Object.entries(PROBERS)) {
          // Check if already tracked
          const { count } = await sb
            .from("ats_companies")
            .select("slug", { count: "exact", head: true })
            .eq("slug", slug)
            .eq("source", platform);

          if ((count || 0) > 0) { alreadyExists++; found = true; break; }

          const result = await prober(slug);

          if (result.ok) {
            const boardUrl = PLATFORM_URLS[platform](slug, result.wdNum);
            const { error: insertErr } = await sb.from("ats_companies").insert({
              slug, source: platform, name: name.toLowerCase(),
              is_active: true, last_http_status: 200,
              job_count: result.jobCount,
              created_at: new Date().toISOString(),
              last_checked: new Date().toISOString(),
            });

            if (insertErr) {
              if (insertErr.message.includes("duplicate") || insertErr.message.includes("unique")) {
                alreadyExists++;
              } else {
                errors.push(`Insert ${slug}@${platform}: ${insertErr.message}`);
              }
            } else {
              discovered++;
              newBoards.push({ name, source: platform, slug, url: boardUrl, jobs: result.jobCount });
              logger.info(`Discovered: ${name} → ${platform}/${slug} (${result.jobCount} jobs)`);
            }
            found = true; break;
          }
        }
        if (found) break;
      }

      await markDiscoveryStatus(name, found ? "found" : "none");
      checked++;
      await new Promise((r) => setTimeout(r, 300));
    }

    const elapsed = Date.now() - start;
    const summary = {
      companies: { checked, discovered, alreadyExists, errors: errors.length, errorDetails: errors.slice(0, 10), newBoards },
      queue: queueStats,
      elapsed_ms: elapsed,
    };
    logger.info("Discovery complete", summary);
    return jsonResp(summary);
  } catch (e) {
    logger.error("Unhandled error", { error: (e as Error).message });
    return jsonResp({ error: (e as Error).message }, 500);
  }
});

async function markDiscoveryStatus(companyName: string, status: string): Promise<void> {
  await sb.from("companies").update({ discovery_status: status }).ilike("company_name", companyName);
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
