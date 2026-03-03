#!/usr/bin/env node
/**
 * refresh-workable-xml.mjs  v3
 * ────────────────────────────
 * Streaming pipeline to ingest Workable's global XML job feed.
 * 
 * Feed:  https://www.workable.com/boards/workable.xml
 * Size:  ~843 MB, ~151K jobs (as of 2026-03-02)
 * 
 * v3 changes:
 *   - Bump MAX_REDIRECT_RESOLVES to 3000, concurrency to 15
 *   - Fix board discovery to check existing slugs (not just company_name)
 *   - Progress logging during redirect resolution
 *
 * v2 fixes:
 *   - Download via curl to local file first (Cloudflare drops long streams)
 *   - Dedup within batches to avoid "cannot affect row a second time"
 *   - Graceful error handling on socket close
 *   - Use readline for line-by-line processing of local file
 * 
 * Runs via GitHub Actions hourly, or manually via:
 *   node scripts/refresh-workable-xml.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { createReadStream } from "fs";
import { execSync } from "child_process";
import { stat, unlink } from "fs/promises";

// ─── Config ──────────────────────────────────────────────────────────
const WORKABLE_XML_URL = "https://www.workable.com/boards/workable.xml";
const LOCAL_XML_PATH = "/tmp/workable-feed.xml";
const BATCH_SIZE = 500;
const MAX_REDIRECT_RESOLVES = 3000;
const REDIRECT_CONCURRENCY = 15;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Stats ───────────────────────────────────────────────────────────
const stats = {
  startedAt: new Date().toISOString(),
  jobsParsed: 0,
  jobsUpserted: 0,
  batchErrors: 0,
  dedupSkipped: 0,
  boardsDiscovered: 0,
  boardsAlreadyKnown: 0,
  redirectErrors: 0,
  jobsClosed: 0,
  xmlSizeBytes: 0,
  elapsedMs: 0,
};

// ─── XML Parser Helpers ──────────────────────────────────────────────

function extractCdata(xml, tag) {
  const patterns = [
    new RegExp(`<${tag}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i"),
    new RegExp(`<${tag}>([^<]*)</${tag}>`, "i"),
  ];
  for (const re of patterns) {
    const m = xml.match(re);
    if (m) return m[1].trim();
  }
  return "";
}

function parseJobXml(xml) {
  const title = extractCdata(xml, "title");
  const referencenumber = extractCdata(xml, "referencenumber");
  if (!title || !referencenumber) return null;

  const company = extractCdata(xml, "company");
  const city = extractCdata(xml, "city");
  const state = extractCdata(xml, "state");
  const country = extractCdata(xml, "country");
  const remote = extractCdata(xml, "remote");
  const description = extractCdata(xml, "description");
  const dateStr = extractCdata(xml, "date");
  const salary = extractCdata(xml, "salary");
  const jobtype = extractCdata(xml, "jobtype");
  const category = extractCdata(xml, "category");
  const education = extractCdata(xml, "education");
  const experience = extractCdata(xml, "experience");
  const website = extractCdata(xml, "website");

  const locationParts = [city, state, country].filter(Boolean);
  const isRemote = remote === "true";

  // Map experience to seniority
  let seniority = null;
  if (experience) {
    const exp = experience.toLowerCase();
    if (exp.includes("entry") || exp.includes("junior")) seniority = "entry";
    else if (exp.includes("mid")) seniority = "mid";
    else if (exp.includes("senior")) seniority = "senior";
    else if (exp.includes("director") || exp.includes("executive")) seniority = "director";
    else if (exp.includes("intern")) seniority = "intern";
  }

  // Map jobtype
  let employmentType = null;
  if (jobtype) {
    const jt = jobtype.toLowerCase();
    if (jt.includes("full")) employmentType = "full_time";
    else if (jt.includes("part")) employmentType = "part_time";
    else if (jt.includes("contract")) employmentType = "contract";
    else if (jt.includes("intern")) employmentType = "internship";
    else if (jt.includes("temp")) employmentType = "temporary";
  }

  // Parse salary if present
  let salaryMin = null, salaryMax = null, salaryCurrency = null, salaryRate = null;
  if (salary) {
    const salaryMatch = salary.match(
      /[\$€£]?\s*([\d,]+\.?\d*)\s*[kK]?\s*[-–to]+\s*[\$€£]?\s*([\d,]+\.?\d*)\s*[kK]?/
    );
    if (salaryMatch) {
      let min = parseFloat(salaryMatch[1].replace(/,/g, ""));
      let max = parseFloat(salaryMatch[2].replace(/,/g, ""));
      if (salary.toLowerCase().includes("k")) { min *= 1000; max *= 1000; }
      if (min > 0 && max > 0) {
        salaryMin = min;
        salaryMax = max;
        salaryCurrency = salary.includes("€") ? "EUR" : salary.includes("£") ? "GBP" : "USD";
        salaryRate = (min < 200) ? "hr" : "yr";
      }
    }
  }

  return {
    greenhouse_id: referencenumber,
    ats_source: "workable",
    company_slug: null,
    company_name: company,
    title,
    url: `https://apply.workable.com/j/${referencenumber}`,
    apply_url: `https://apply.workable.com/j/${referencenumber}`,
    location: locationParts.join(", ") || null,
    department: category || null,
    content: description || null,
    loc_city: city || null,
    loc_state: state || null,
    loc_country: country || null,
    loc_type: isRemote ? "remote" : "onsite",
    is_remote: isRemote,
    status: "open",
    first_seen_at: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
    salary_min: salaryMin,
    salary_max: salaryMax,
    salary_currency: salaryCurrency,
    salary_rate: salaryRate,
    salary_raw: salary || null,
    employment_type: employmentType,
    extracted_seniority: seniority,
    jd_education: education || null,
    _referencenumber: referencenumber,
    _company: company,
    _website: website,
  };
}

// ─── Batch Upsert (with dedup) ──────────────────────────────────────

async function upsertBatch(jobs) {
  // DEDUP: Keep only last occurrence per greenhouse_id within this batch
  const seen = new Map();
  for (const job of jobs) {
    seen.set(job.greenhouse_id, job);
  }
  const deduped = Array.from(seen.values());
  const skipped = jobs.length - deduped.length;
  if (skipped > 0) stats.dedupSkipped += skipped;

  // Strip temp fields
  const cleaned = deduped.map(({ _referencenumber, _company, _website, ...rest }) => rest);

  try {
    const { error } = await sb
      .from("ats_jobs")
      .upsert(cleaned, {
        onConflict: "greenhouse_id,ats_source",
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`  Upsert error: ${error.message}`);
      stats.batchErrors++;
      return 0;
    }
    return cleaned.length;
  } catch (e) {
    console.error(`  Upsert exception: ${e.message}`);
    stats.batchErrors++;
    return 0;
  }
}

// ─── Board Discovery ─────────────────────────────────────────────────

async function resolveSubdomain(referencenumber) {
  try {
    const url = `https://apply.workable.com/j/${referencenumber}`;
    const resp = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    const location = resp.headers.get("location");
    if (location) {
      const match = location.match(/\/([^\/]+)\/j\//);
      if (match && match[1] !== "j") return match[1];
    }
  } catch (e) {
    stats.redirectErrors++;
  }
  return null;
}

async function discoverBoards(newCompanies) {
  const entries = Array.from(newCompanies.entries()).slice(0, MAX_REDIRECT_RESOLVES);
  let discovered = 0;

  // Load ALL known Workable slugs upfront (fast — just slugs)
  const knownSlugs = new Set();
  const knownNames = new Set();
  let offset = 0;
  while (true) {
    const { data } = await sb
      .from("ats_companies")
      .select("slug,company_name")
      .eq("source", "workable")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    data.forEach(r => {
      knownSlugs.add(r.slug);
      if (r.company_name) knownNames.add(r.company_name);
    });
    offset += data.length;
    if (data.length < 1000) break;
  }
  console.log(`  Loaded ${knownSlugs.size} known slugs, ${knownNames.size} known company names`);

  // Filter out companies we already know by name
  const toResolve = entries.filter(([name]) => !knownNames.has(name));
  stats.boardsAlreadyKnown = entries.length - toResolve.length;

  console.log(`  Board discovery: ${toResolve.length} new companies to resolve (${stats.boardsAlreadyKnown} already known by name)`);

  let resolved = 0;
  let skippedKnownSlug = 0;
  for (let i = 0; i < toResolve.length; i += REDIRECT_CONCURRENCY) {
    const batch = toResolve.slice(i, i + REDIRECT_CONCURRENCY);
    await Promise.allSettled(
      batch.map(async ([name, { ref, website }]) => {
        const slug = await resolveSubdomain(ref);
        if (!slug) return;
        resolved++;
        if (knownSlugs.has(slug)) { skippedKnownSlug++; return; }
        await sb.from("ats_companies").upsert({
          slug,
          source: "workable",
          company_name: name,
          board_url: `https://apply.workable.com/${slug}/`,
          website: website || null,
          last_checked: new Date().toISOString(),
          is_active: true,
        }, { onConflict: "slug,source" });
        knownSlugs.add(slug);
        discovered++;
      })
    );
    if ((i + REDIRECT_CONCURRENCY) % 150 === 0) {
      console.log(`    Resolving... ${resolved}/${toResolve.length} done, ${discovered} new, ${skippedKnownSlug} already had slug`);
    }
  }

  stats.boardsDiscovered = discovered;
  return discovered;
}

// ─── Mark Closed ─────────────────────────────────────────────────────

async function markClosed(cycleStartedAt) {
  try {
    const { error } = await sb.rpc("exec_sql", {
      query: `
        UPDATE ats_jobs
        SET status = 'closed', closed_at = now()
        WHERE ats_source = 'workable'
          AND status = 'open'
          AND updated_at < '${cycleStartedAt}'
      `
    });
    if (error) {
      console.error(`  Mark closed error: ${error.message}`);
    }
  } catch (e) {
    console.error(`  Mark closed exception: ${e.message}`);
  }
}

// ─── Main Pipeline ───────────────────────────────────────────────────

async function main() {
  const cycleStartedAt = new Date().toISOString();
  console.log(`\n🔄 Workable XML Pipeline v2 started at ${cycleStartedAt}`);

  // ── Step 1: Download XML via curl (handles Cloudflare better than fetch) ──
  console.log("\n📥 Downloading XML feed via curl...");
  try {
    execSync(
      `curl -sS --max-time 600 --retry 2 --retry-delay 10 -o ${LOCAL_XML_PATH} "${WORKABLE_XML_URL}"`,
      { stdio: "inherit", timeout: 660_000 }
    );
  } catch (e) {
    console.error(`Download failed: ${e.message}`);
    process.exit(1);
  }

  const fileStat = await stat(LOCAL_XML_PATH);
  stats.xmlSizeBytes = fileStat.size;
  console.log(`   Downloaded: ${(stats.xmlSizeBytes / 1024 / 1024).toFixed(1)} MB`);

  // ── Step 2: Stream-parse local file ──
  console.log("\n⚙️  Parsing and upserting...");

  const stream = createReadStream(LOCAL_XML_PATH, { encoding: "utf8", highWaterMark: 1024 * 256 });
  let buffer = "";
  let batch = [];
  let newCompanies = new Map();
  let lastLog = Date.now();

  const JOB_START = "<job>";
  const JOB_END = "</job>";

  for await (const chunk of stream) {
    buffer += chunk;

    // Progress logging every 30s
    if (Date.now() - lastLog > 30_000) {
      console.log(`   Progress: ${stats.jobsParsed.toLocaleString()} parsed | ${stats.jobsUpserted.toLocaleString()} upserted | ${stats.batchErrors} errors | ${stats.dedupSkipped} dedup-skipped`);
      lastLog = Date.now();
    }

    // Extract complete <job>...</job> blocks
    let startIdx;
    while ((startIdx = buffer.indexOf(JOB_START)) !== -1) {
      const endIdx = buffer.indexOf(JOB_END, startIdx);
      if (endIdx === -1) break;

      const jobXml = buffer.substring(startIdx + JOB_START.length, endIdx);
      buffer = buffer.substring(endIdx + JOB_END.length);

      const job = parseJobXml(jobXml);
      if (!job) continue;

      stats.jobsParsed++;

      if (!newCompanies.has(job._company) && job._company) {
        newCompanies.set(job._company, {
          ref: job._referencenumber,
          website: job._website,
        });
      }

      batch.push(job);

      if (batch.length >= BATCH_SIZE) {
        const upserted = await upsertBatch(batch);
        stats.jobsUpserted += upserted;
        batch = [];
      }
    }

    // Prevent unbounded buffer growth
    if (buffer.length > 500_000 && buffer.indexOf(JOB_START) === -1) {
      buffer = buffer.substring(buffer.length - 100_000);
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    const upserted = await upsertBatch(batch);
    stats.jobsUpserted += upserted;
  }

  console.log(`\n✅ Parse complete: ${stats.jobsParsed.toLocaleString()} jobs parsed, ${stats.jobsUpserted.toLocaleString()} upserted`);
  console.log(`   Unique companies in feed: ${newCompanies.size}`);

  // ── Step 3: Board discovery ──
  console.log("\n🔍 Discovering new boards...");
  await discoverBoards(newCompanies);
  console.log(`   Discovered: ${stats.boardsDiscovered} new boards`);

  // ── Step 4: Mark closed jobs ──
  console.log("\n🗑️  Marking closed jobs...");
  await markClosed(cycleStartedAt);

  // ── Step 5: Cleanup ──
  try { await unlink(LOCAL_XML_PATH); } catch {}

  // ── Summary ──
  stats.elapsedMs = Date.now() - new Date(cycleStartedAt).getTime();
  console.log("\n" + "─".repeat(60));
  console.log("📊 Pipeline Summary");
  console.log("─".repeat(60));
  console.log(`   XML Size:         ${(stats.xmlSizeBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`   Jobs Parsed:      ${stats.jobsParsed.toLocaleString()}`);
  console.log(`   Jobs Upserted:    ${stats.jobsUpserted.toLocaleString()}`);
  console.log(`   Dedup Skipped:    ${stats.dedupSkipped.toLocaleString()}`);
  console.log(`   Batch Errors:     ${stats.batchErrors}`);
  console.log(`   Boards Found:     ${stats.boardsDiscovered} new (${stats.boardsAlreadyKnown} already known)`);
  console.log(`   Redirect Errors:  ${stats.redirectErrors}`);
  console.log(`   Elapsed:          ${(stats.elapsedMs / 1000).toFixed(1)}s`);
  console.log("─".repeat(60));

  // GitHub Actions outputs
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import("fs");
    appendFileSync(process.env.GITHUB_OUTPUT, `jobs_parsed=${stats.jobsParsed}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `jobs_upserted=${stats.jobsUpserted}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `boards_discovered=${stats.boardsDiscovered}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `elapsed_ms=${stats.elapsedMs}\n`);
  }

  // Exit with error code if too many batch errors
  if (stats.batchErrors > stats.jobsParsed * 0.1) {
    console.error("\n⚠️  Too many batch errors (>10%), exiting with error");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});

