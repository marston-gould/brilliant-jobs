#!/usr/bin/env node
/**
 * refresh-workable-xml.mjs
 * ────────────────────────
 * Streaming pipeline to ingest Workable's global XML job feed.
 * 
 * Feed:  https://www.workable.com/boards/workable.xml
 * Size:  ~843 MB, ~151K jobs (as of 2026-03-02)
 * 
 * Architecture:
 *   1. Stream-download XML via fetch()
 *   2. SAX-parse <job> elements with sax-js (never holds full file in memory)
 *   3. Batch upsert to ats_jobs via Supabase REST API (500 jobs/batch)
 *   4. Discover new boards by resolving shortlink redirects (50/run cap)
 *   5. Mark jobs not seen in this cycle as closed
 * 
 * Runs via GitHub Actions hourly, or manually via:
 *   node scripts/refresh-workable-xml.mjs
 * 
 * Environment:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (required)
 */

import { createClient } from "@supabase/supabase-js";

// ─── Config ──────────────────────────────────────────────────────────
const WORKABLE_XML_URL = "https://www.workable.com/boards/workable.xml";
const BATCH_SIZE = 500;                // Jobs per upsert batch
const MAX_REDIRECT_RESOLVES = 100;     // Board discovery cap per run
const REDIRECT_CONCURRENCY = 5;        // Parallel redirect lookups
const DOWNLOAD_TIMEOUT_MS = 600_000;   // 10 min max download

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
  boardsDiscovered: 0,
  boardsAlreadyKnown: 0,
  redirectErrors: 0,
  jobsClosed: 0,
  xmlSizeBytes: 0,
  elapsedMs: 0,
};

// ─── XML Streaming Parser ────────────────────────────────────────────
// Lightweight regex-based streaming parser since we can't use native
// SAX in Node without extra deps. Processes chunks as they arrive.

function extractCdata(xml, tag) {
  // Handle both inline and multiline CDATA patterns
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

  // Map jobtype to employment_type
  let employmentType = null;
  if (jobtype) {
    const jt = jobtype.toLowerCase();
    if (jt.includes("full")) employmentType = "full_time";
    else if (jt.includes("part")) employmentType = "part_time";
    else if (jt.includes("contract")) employmentType = "contract";
    else if (jt.includes("intern")) employmentType = "internship";
    else if (jt.includes("temporary") || jt.includes("temp")) employmentType = "temporary";
  }

  // Parse salary if present (rare but possible)
  let salaryMin = null, salaryMax = null, salaryCurrency = null, salaryRate = null;
  if (salary) {
    // Try common patterns: "$80,000 - $120,000", "€50k-€70k", etc.
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
        salaryCurrency = salary.includes("€") ? "EUR" :
                         salary.includes("£") ? "GBP" : "USD";
        salaryRate = (min < 200) ? "hr" : "yr";
      }
    }
  }

  return {
    greenhouse_id: referencenumber,
    ats_source: "workable",
    company_slug: null, // filled during board discovery
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
    // Temp fields for board discovery (not upserted)
    _referencenumber: referencenumber,
    _company: company,
    _website: website,
  };
}

// ─── Batch Upsert ────────────────────────────────────────────────────

async function upsertBatch(jobs) {
  // Strip temp fields
  const cleaned = jobs.map(({ _referencenumber, _company, _website, ...rest }) => rest);

  const { error, count } = await sb
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
      // Relative: /techfirefly/j/F44ED9E40A  or  absolute URL
      const match = location.match(/\/([^\/]+)\/j\//);
      if (match && match[1] !== "j") return match[1];
    }
  } catch (e) {
    stats.redirectErrors++;
  }
  return null;
}

async function discoverBoards(newCompanies) {
  // newCompanies: Map<companyName, {ref, website}>
  const entries = Array.from(newCompanies.entries()).slice(0, MAX_REDIRECT_RESOLVES);
  let discovered = 0;

  // Check which companies we already have
  const companyNames = entries.map(([name]) => name);
  const { data: existing } = await sb
    .from("ats_companies")
    .select("company_name")
    .eq("source", "workable")
    .in("company_name", companyNames.slice(0, 200)); // PostgREST limit

  const knownNames = new Set((existing || []).map(e => e.company_name));

  // Filter to only unknown companies
  const toResolve = entries.filter(([name]) => !knownNames.has(name));
  stats.boardsAlreadyKnown += entries.length - toResolve.length;

  console.log(`  Board discovery: ${toResolve.length} new companies to resolve (${knownNames.size} already known)`);

  // Resolve in batches of REDIRECT_CONCURRENCY
  for (let i = 0; i < toResolve.length; i += REDIRECT_CONCURRENCY) {
    const batch = toResolve.slice(i, i + REDIRECT_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async ([name, { ref, website }]) => {
        const slug = await resolveSubdomain(ref);
        if (slug) {
          await sb.from("ats_companies").upsert({
            slug,
            source: "workable",
            company_name: name,
            board_url: `https://apply.workable.com/${slug}/`,
            website: website || null,
            last_checked: new Date().toISOString(),
            is_active: true,
          }, { onConflict: "slug,source" });
          discovered++;
          return slug;
        }
        return null;
      })
    );
  }

  stats.boardsDiscovered = discovered;
  return discovered;
}

// ─── Backfill company_slug on jobs ───────────────────────────────────

async function backfillSlugs() {
  // For jobs that have null company_slug, try to match via company_name
  // This is a DB-side operation for efficiency
  const { error } = await sb.rpc("exec_sql", {
    query: `
      UPDATE ats_jobs j
      SET company_slug = c.slug
      FROM ats_companies c
      WHERE j.ats_source = 'workable'
        AND j.company_slug IS NULL
        AND c.source = 'workable'
        AND c.company_name = j.company_name
    `
  });
  if (error) console.error(`  Slug backfill error: ${error.message}`);
}

// ─── Mark Closed ─────────────────────────────────────────────────────

async function markClosed(cycleStartedAt) {
  // Jobs that haven't been seen since cycle start are no longer in the feed
  const { error, count } = await sb.rpc("exec_sql", {
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
    return 0;
  }
  // Can't easily get count from exec_sql, so query it
  const { data } = await sb
    .from("ats_jobs")
    .select("greenhouse_id", { count: "exact", head: true })
    .eq("ats_source", "workable")
    .eq("status", "closed")
    .gte("closed_at", cycleStartedAt);
  return data?.length || 0;
}

// ─── Main Pipeline ───────────────────────────────────────────────────

async function main() {
  const cycleStartedAt = new Date().toISOString();
  console.log(`\n🔄 Workable XML Pipeline started at ${cycleStartedAt}`);
  console.log(`   Feed: ${WORKABLE_XML_URL}`);

  // 1. Stream-download and parse
  console.log("\n📥 Downloading XML feed...");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(WORKABLE_XML_URL, { signal: controller.signal });
  } catch (e) {
    clearTimeout(timeout);
    console.error(`Download failed: ${e.message}`);
    process.exit(1);
  }

  if (!response.ok || !response.body) {
    clearTimeout(timeout);
    console.error(`HTTP ${response.status}: ${response.statusText}`);
    process.exit(1);
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    stats.xmlSizeBytes = parseInt(contentLength);
    console.log(`   Size: ${(stats.xmlSizeBytes / 1024 / 1024).toFixed(1)} MB`);
  }

  // 2. Stream-parse
  console.log("\n⚙️  Parsing and upserting...");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let batch = [];
  let newCompanies = new Map(); // companyName → {ref, website}
  let bytesRead = 0;
  let lastLog = Date.now();

  const JOB_START = "<job>";
  const JOB_END = "</job>";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;
    bytesRead += value.byteLength;

    // Progress logging every 30s
    if (Date.now() - lastLog > 30_000) {
      const pct = contentLength ? ((bytesRead / parseInt(contentLength)) * 100).toFixed(1) : "?";
      console.log(`   Progress: ${pct}% | ${stats.jobsParsed} parsed | ${stats.jobsUpserted} upserted | ${stats.batchErrors} errors`);
      lastLog = Date.now();
    }

    // Extract complete <job>...</job> blocks
    let startIdx;
    while ((startIdx = buffer.indexOf(JOB_START)) !== -1) {
      const endIdx = buffer.indexOf(JOB_END, startIdx);
      if (endIdx === -1) break; // Incomplete job, wait for more data

      const jobXml = buffer.substring(startIdx + JOB_START.length, endIdx);
      buffer = buffer.substring(endIdx + JOB_END.length);

      const job = parseJobXml(jobXml);
      if (!job) continue;

      stats.jobsParsed++;

      // Track new companies for board discovery
      if (!newCompanies.has(job._company) && job._company) {
        newCompanies.set(job._company, {
          ref: job._referencenumber,
          website: job._website,
        });
      }

      batch.push(job);

      // Flush batch
      if (batch.length >= BATCH_SIZE) {
        const upserted = await upsertBatch(batch);
        stats.jobsUpserted += upserted;
        batch = [];
      }
    }

    // Prevent buffer from growing unbounded (keep last 50KB for partial jobs)
    if (buffer.length > 200_000 && buffer.indexOf(JOB_START) === -1) {
      buffer = buffer.substring(buffer.length - 50_000);
    }
  }

  clearTimeout(timeout);

  // Flush remaining batch
  if (batch.length > 0) {
    const upserted = await upsertBatch(batch);
    stats.jobsUpserted += upserted;
  }

  console.log(`\n✅ Parse complete: ${stats.jobsParsed} jobs parsed, ${stats.jobsUpserted} upserted`);
  console.log(`   Unique companies in feed: ${newCompanies.size}`);

  // 3. Board discovery
  console.log("\n🔍 Discovering new boards...");
  await discoverBoards(newCompanies);
  console.log(`   Discovered: ${stats.boardsDiscovered} new boards`);

  // 4. Backfill slugs
  console.log("\n🔗 Backfilling company slugs...");
  await backfillSlugs();

  // 5. Mark closed jobs
  console.log("\n🗑️  Marking closed jobs...");
  stats.jobsClosed = await markClosed(cycleStartedAt);
  console.log(`   Closed: ${stats.jobsClosed} jobs`);

  // 6. Summary
  stats.elapsedMs = Date.now() - new Date(cycleStartedAt).getTime();
  console.log("\n" + "─".repeat(60));
  console.log("📊 Pipeline Summary");
  console.log("─".repeat(60));
  console.log(`   XML Size:        ${(stats.xmlSizeBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`   Jobs Parsed:     ${stats.jobsParsed.toLocaleString()}`);
  console.log(`   Jobs Upserted:   ${stats.jobsUpserted.toLocaleString()}`);
  console.log(`   Batch Errors:    ${stats.batchErrors}`);
  console.log(`   Boards Found:    ${stats.boardsDiscovered} new (${stats.boardsAlreadyKnown} already known)`);
  console.log(`   Redirect Errors: ${stats.redirectErrors}`);
  console.log(`   Jobs Closed:     ${stats.jobsClosed}`);
  console.log(`   Elapsed:         ${(stats.elapsedMs / 1000).toFixed(1)}s`);
  console.log("─".repeat(60));

  // Output for GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import("fs");
    appendFileSync(process.env.GITHUB_OUTPUT, `jobs_parsed=${stats.jobsParsed}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `jobs_upserted=${stats.jobsUpserted}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `boards_discovered=${stats.boardsDiscovered}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `elapsed_ms=${stats.elapsedMs}\n`);
  }
}

main().catch(err => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
