// refresh-usajobs/index.ts
// Fetches all public USAJOBS listings and upserts into ats_jobs table
// Runs every 6 hours via pg_cron
// v3.53 — USAJOBS Integration

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const USAJOBS_BASE = "https://data.usajobs.gov/api/Search";
const API_KEY = Deno.env.get("USAJOBS_API_KEY")!;
const USER_AGENT = Deno.env.get("USAJOBS_USER_AGENT")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RESULTS_PER_PAGE = 500;
const BATCH_SIZE = 200; // Upsert in smaller batches for reliability

// ── Mapping helpers ──────────────────────────────────────────────

function mapLocType(telework: boolean | undefined, remote: boolean | undefined): string | null {
  if (remote) return "remote";
  if (telework) return "hybrid";
  return "onsite";
}

function mapSalaryRate(code: string | undefined): string {
  const map: Record<string, string> = {
    PA: "yr", PH: "hr", PD: "day", PW: "wk", PM: "mo", BW: "biwk",
  };
  return map[code || "PA"] || "yr";
}

function mapEmploymentType(scheduleCode: string | undefined): string | null {
  const map: Record<string, string> = {
    "1": "full_time", "2": "part_time", "3": "shift_work", "4": "intermittent",
  };
  return map[scheduleCode || ""] || null;
}

function mapPayGrade(low: string | undefined, high: string | undefined): string | null {
  if (!low) return null;
  if (high && high !== low) return `GS-${low} to GS-${high}`;
  return `GS-${low}`;
}

function buildDescriptionHtml(details: unknown, quals: string | null): string {
  let html = "";
  if (details?.JobSummary) {
    html += `<h3>Summary</h3><p>${details.JobSummary}</p>`;
  }
  if (details?.MajorDuties?.length) {
    html += `<h3>Major Duties</h3><ul>${details.MajorDuties.map((d: string) => `<li>${d}</li>`).join("")}</ul>`;
  }
  if (quals) {
    html += `<h3>Qualifications</h3><p>${quals}</p>`;
  }
  if (details?.Education) {
    html += `<h3>Education</h3><p>${details.Education}</p>`;
  }
  return html;
}

function parseCountryCode(code: string | undefined): string | null {
  if (!code) return null;
  if (code === "United States" || code === "US") return "US";
  return code;
}

function parseCityName(cityName: string | undefined): string | null {
  if (!cityName) return null;
  // CityName often comes as "Dahlgren, Virginia" — extract just the city
  return cityName.split(",")[0]?.trim() || null;
}

// ── Map a single USAJOBS result to ats_jobs row ─────────────────

function mapToAtsJob(item: unknown) {
  const d = item.MatchedObjectDescriptor;
  const loc = d.PositionLocation?.[0];
  const pay = d.PositionRemuneration?.[0];
  const details = d.UserArea?.Details;
  const scheduleCode = d.PositionSchedule?.[0]?.Code;

  return {
    greenhouse_id: String(item.MatchedObjectId),
    ats_source: "usajobs",
    title: d.PositionTitle || "Untitled",
    company_name: d.OrganizationName || d.DepartmentName || "Federal Government",
    company_slug: (d.OrganizationName || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    department: d.DepartmentName || null,
    location: d.PositionLocationDisplay || null,
    loc_city: parseCityName(loc?.CityName),
    loc_state: loc?.CountrySubDivisionCode || null,
    loc_country: parseCountryCode(loc?.CountryCode),
    loc_type: mapLocType(details?.TeleworkEligible, details?.RemoteIndicator),
    lat: loc?.Latitude ? parseFloat(loc.Latitude) : null,
    lng: loc?.Longitude ? parseFloat(loc.Longitude) : null,
    is_remote: details?.RemoteIndicator === true,
    salary_min: pay?.MinimumRange ? parseInt(pay.MinimumRange) : null,
    salary_max: pay?.MaximumRange ? parseInt(pay.MaximumRange) : null,
    salary_currency: "USD",
    salary_rate: mapSalaryRate(pay?.RateIntervalCode),
    content: buildDescriptionHtml(details, d.QualificationSummary),
    url: d.PositionURI || null,
    apply_url: d.ApplyURI?.[0] || d.PositionURI || null,
    first_seen_at: d.PublicationStartDate || new Date().toISOString(),
    closes_at: d.ApplicationCloseDate || null,
    // NOTE: status omitted — defaults to 'open' on INSERT, not overwritten on UPDATE
    // Prevents re-opening jobs confirmed as dead/closed by users
    employment_type: mapEmploymentType(scheduleCode),
    security_clearance: details?.SecurityClearance || null,
    pay_grade: mapPayGrade(details?.LowGrade, details?.HighGrade),
    total_openings: details?.TotalOpenings ? parseInt(details.TotalOpenings) : null,
    hiring_path: details?.HiringPath || null,
    updated_at: new Date().toISOString(),
  };
}

// ── Main handler ────────────────────────────────────────────────

serve(async (_req) => {
  const startTime = Date.now();
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  let page = 1;
  let totalPages = 1;
  let totalFetched = 0;
  let totalUpserted = 0;
  const seenIds: string[] = [];
  const errors: string[] = [];

  try {
    // ── Phase 1: Fetch all pages from USAJOBS API ──
    while (page <= totalPages && page <= 40) { // Safety cap at 40 pages (20K jobs)
      const url = `${USAJOBS_BASE}?ResultsPerPage=${RESULTS_PER_PAGE}&Page=${page}&WhoMayApply=public&Fields=Full&SortField=opendate&SortDirection=Desc`;

      const res = await fetch(url, {
        headers: {
          "Host": "data.usajobs.gov",
          "User-Agent": USER_AGENT,
          "Authorization-Key": API_KEY,
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`USAJOBS API error ${res.status}: ${errText}`);
      }

      const data = await res.json();
      const results = data.SearchResult;

      if (page === 1) {
        totalPages = Math.ceil(results.SearchResultCountAll / RESULTS_PER_PAGE);
        console.log(`USAJOBS total: ${results.SearchResultCountAll} jobs across ${totalPages} pages`);
      }

      const items = results.SearchResultItems || [];
      if (items.length === 0) break;

      const jobs = items.map((item: Record<string, unknown>) => mapToAtsJob(item));
      totalFetched += jobs.length;

      // Track all seen IDs for close detection
      jobs.forEach((j: Record<string, unknown>) => (seenIds as Record<string, unknown>).push(j.greenhouse_id));

      // Upsert in batches
      for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
        const batch = jobs.slice(i, i + BATCH_SIZE);
        const { error } = await sb
          .from("ats_jobs")
          .upsert(batch, { onConflict: "greenhouse_id,ats_source" });

        if (error) {
          console.error(`Upsert error page ${page}, batch ${i}: ${error.message}`);
          errors.push(`p${page}b${i}: ${error.message}`);
        } else {
          totalUpserted += batch.length;
        }
      }

      console.log(`Page ${page}/${totalPages}: ${items.length} jobs fetched, ${totalUpserted} total upserted`);
      page++;

      // Respect API rate limits — 500ms between pages
      await new Promise((r) => setTimeout(r, 500));
    }

    // ── Phase 2: Close jobs no longer in API ──
    // Only close if we successfully fetched a meaningful number
    let closedCount = 0;
    if (seenIds.length > 100) {
      // Use exec_sql for the NOT IN query since PostgREST has URL length limits
      // Instead, fetch all currently open usajobs IDs and diff
      const { data: openJobs, error: fetchErr } = await sb
        .from("ats_jobs")
        .select("greenhouse_id")
        .eq("ats_source", "usajobs")
        .eq("status", "open");

      if (!fetchErr && openJobs) {
        const seenSet = new Set(seenIds);
        const toClose = openJobs
          .filter((j: Record<string, unknown>) => !seenSet.has(j.greenhouse_id))
          .map((j: Record<string, unknown>) => j.greenhouse_id);

        if (toClose.length > 0) {
          // Close in batches
          for (let i = 0; i < toClose.length; i += BATCH_SIZE) {
            const batch = toClose.slice(i, i + BATCH_SIZE);
            const { error: closeErr } = await sb
              .from("ats_jobs")
              .update({ status: "closed", closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
              .eq("ats_source", "usajobs")
              .in("greenhouse_id", batch);

            if (closeErr) {
              errors.push(`close batch ${i}: ${closeErr.message}`);
            } else {
              closedCount += batch.length;
            }
          }
        }
      }
    }

    // ── Phase 3: Update ats_companies board row ──
    const openCount = seenIds.length - closedCount;
    const { error: compErr } = await sb
      .from("ats_companies")
      .update({
        job_count: openCount,
        last_http_status: 200,
        last_refresh_at: new Date().toISOString(),
        last_checked: new Date().toISOString(),
        is_active: true,
      })
      .eq("slug", "usajobs-federal-government")
      .eq("source", "usajobs");

    if (compErr) errors.push(`ats_companies update: ${compErr.message}`);

    // ── Phase 4: Upsert feed_health_daily snapshot ──
    const today = new Date().toISOString().slice(0, 10);
    const { error: fhErr } = await sb
      .from("feed_health_daily")
      .upsert({
        platform: "usajobs",
        snapshot_date: today,
        total_boards: 1,
        active_boards: 1,
        total_jobs: openCount,
      }, { onConflict: "platform,snapshot_date" });

    if (fhErr) errors.push(`feed_health_daily upsert: ${fhErr.message}`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    return new Response(
      JSON.stringify({
        success: true,
        totalFetched,
        totalUpserted,
        totalPages,
        closedCount,
        seenCount: seenIds.length,
        errors: errors.length > 0 ? errors : undefined,
        elapsedSeconds: elapsed,
        version: "4.09",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error("Fatal error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: String(err),
        totalFetched,
        totalUpserted,
        errors,
        elapsedSeconds: elapsed,
        version: "4.09",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
