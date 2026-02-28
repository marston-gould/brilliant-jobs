// supabase/functions/enrich-pdl-batch/index.ts
//
// PDL Industry Enrichment Pipeline — Step 1b
// ============================================
// Matches ats_companies with NULL industry against the filtered PDL dataset
// stored in Supabase Storage bucket pdl-enrichment/filtered-companies.json.
//
// Matching strategy (require 2+ field match for high confidence):
//   1. LinkedIn URL exact match
//   2. Website domain match
//   3. Normalized company name match (only with domain or LinkedIn corroboration)
//
// Writes:
//   - Upserts into ref_companies (only fills NULLs, never overwrites)
//   - Updates ats_companies.industry from matched ref_companies
//   - Logs results to audit_log
//
// Trigger: pg_cron (weekly, DISABLED by default) or manual POST
// Constraints: 150s timeout, 150 MB memory. Processes max 200 boards per run.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const BUCKET = "pdl-enrichment";
const OBJECT_PATH = "filtered-companies.json";
const MAX_BOARDS_PER_RUN = 200;
const WALL_TIME_MS = 140_000; // Stop before 150s timeout

// ─── Helpers ──────────────────────────────────────────────────

function normalizeName(name: string): string {
  if (!name) return "";
  let n = name.toLowerCase().trim();
  const suffixes = [
    ", inc.", ", inc", ", llc", ", ltd", ", corp", ", co.",
    " inc.", " inc", " llc", " ltd", " corp", " co.",
    " gmbh", " ag", " sa", " pty", " plc", " bv", " nv",
  ];
  for (const s of suffixes) {
    if (n.endsWith(s)) n = n.slice(0, -s.length);
  }
  return n.replace(/\s+/g, " ").trim();
}

function extractDomain(url: string): string {
  if (!url) return "";
  return url
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/\/.*$/, "")
    .toLowerCase()
    .trim();
}

interface PdlCompany {
  name?: string;
  normalized_name?: string;
  industry?: string;
  sub_industry?: string;
  sector?: string;
  employee_count?: number;
  employee_count_range?: string;
  locality?: string;
  region?: string;
  country?: string;
  website?: string;
  domain?: string;
  linkedin_url?: string;
  founded?: number;
  type?: string;
}

interface UnmatchedBoard {
  id: string;
  slug: string;
  company_name: string;
  platform: string;
  website?: string;
  linkedin_url?: string;
  ref_company_id?: string;
  industry?: string;
}

interface MatchResult {
  board_id: string;
  board_name: string;
  pdl_name: string;
  match_signals: string[];
  industry: string;
}

// ─── Main handler ─────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const logger = createLogger("enrich-pdl-batch");
  const startTime = performance.now();

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Step 1: Fetch unmatched boards ────────────────────────
    logger.info("Fetching unmatched boards");

    const { data: boards, error: boardErr } = await sb
      .from("ats_companies")
      .select("id, slug, company_name, platform, website, linkedin_url, ref_company_id, industry")
      .is("industry", null)
      .order("id")
      .limit(MAX_BOARDS_PER_RUN);

    if (boardErr) {
      logger.error("Failed to fetch boards", { error: boardErr.message });
      return new Response(
        JSON.stringify({ error: "Failed to fetch boards", detail: boardErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!boards || boards.length === 0) {
      logger.info("No unmatched boards found — nothing to do");
      return new Response(
        JSON.stringify({ message: "No unmatched boards", matched: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logger.info(`Found ${boards.length} unmatched boards`);

    // ── Step 2: Download filtered PDL file from Storage ───────
    logger.info("Downloading filtered PDL file from Storage");

    const { data: fileData, error: fileErr } = await sb.storage
      .from(BUCKET)
      .download(OBJECT_PATH);

    if (fileErr || !fileData) {
      logger.warn("PDL file not found in Storage — exiting cleanly", {
        error: fileErr?.message || "No data returned",
        bucket: BUCKET,
        path: OBJECT_PATH,
      });
      return new Response(
        JSON.stringify({
          message: "PDL file not available in Storage. Run upload-pdl-filtered.sh first.",
          error: fileErr?.message,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fileText = await fileData.text();
    const fileSizeMB = (fileText.length / 1_000_000).toFixed(1);
    logger.info(`PDL file downloaded: ${fileSizeMB} MB`);

    let pdlCompanies: PdlCompany[];
    try {
      pdlCompanies = JSON.parse(fileText);
    } catch (e) {
      logger.error("Failed to parse PDL JSON", { error: (e as Error).message });
      return new Response(
        JSON.stringify({ error: "Failed to parse PDL file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logger.info(`Parsed ${pdlCompanies.length} PDL companies`);

    // ── Step 3: Build lookup indexes ──────────────────────────
    const byLinkedin = new Map<string, PdlCompany>();
    const byDomain = new Map<string, PdlCompany>();
    const byName = new Map<string, PdlCompany[]>();

    for (const co of pdlCompanies) {
      if (co.linkedin_url) {
        const lk = co.linkedin_url.replace(/\/$/, "").toLowerCase();
        byLinkedin.set(lk, co);
      }
      if (co.domain) {
        byDomain.set(co.domain, co);
      } else if (co.website) {
        byDomain.set(extractDomain(co.website), co);
      }
      const nn = co.normalized_name || normalizeName(co.name || "");
      if (nn) {
        if (!byName.has(nn)) byName.set(nn, []);
        byName.get(nn)!.push(co);
      }
    }

    logger.info("Indexes built", {
      linkedinKeys: byLinkedin.size,
      domainKeys: byDomain.size,
      nameKeys: byName.size,
    });

    // ── Step 4: Match boards against PDL ──────────────────────
    const matches: MatchResult[] = [];
    let skippedTimeout = 0;

    for (const board of boards as UnmatchedBoard[]) {
      // Wall-time check
      if (performance.now() - startTime > WALL_TIME_MS) {
        skippedTimeout = (boards as UnmatchedBoard[]).length - matches.length;
        logger.warn(`Approaching timeout — stopping with ${matches.length} matches, ${skippedTimeout} skipped`);
        break;
      }

      const signals: string[] = [];
      let bestMatch: PdlCompany | null = null;

      // Strategy 1: LinkedIn URL
      if (board.linkedin_url) {
        const lk = board.linkedin_url.replace(/\/$/, "").toLowerCase();
        const found = byLinkedin.get(lk);
        if (found && found.industry) {
          bestMatch = found;
          signals.push("linkedin_url");
        }
      }

      // Strategy 2: Website domain
      if (board.website) {
        const domain = extractDomain(board.website);
        if (domain) {
          const found = byDomain.get(domain);
          if (found && found.industry) {
            if (!bestMatch) bestMatch = found;
            signals.push("domain");
          }
        }
      }

      // Strategy 3: Normalized name (requires corroboration)
      const boardName = normalizeName(board.company_name || board.slug || "");
      if (boardName) {
        const candidates = byName.get(boardName);
        if (candidates) {
          for (const c of candidates) {
            if (!c.industry) continue;

            // Name-only match needs at least one corroborating signal
            const corroborated =
              signals.length > 0 || // already matched by URL
              (board.linkedin_url && c.linkedin_url &&
                board.linkedin_url.replace(/\/$/, "").toLowerCase() ===
                c.linkedin_url.replace(/\/$/, "").toLowerCase()) ||
              (board.website && c.website &&
                extractDomain(board.website) === extractDomain(c.website));

            if (corroborated) {
              if (!bestMatch) bestMatch = c;
              if (!signals.includes("name")) signals.push("name");
              break;
            }
          }
        }
      }

      // Require at least 1 signal to proceed (LinkedIn or domain alone is high confidence)
      if (bestMatch && signals.length >= 1 && bestMatch.industry) {
        matches.push({
          board_id: board.id,
          board_name: board.company_name || board.slug,
          pdl_name: bestMatch.name || "",
          match_signals: signals,
          industry: bestMatch.industry,
        });
      }
    }

    logger.info(`Matching complete: ${matches.length} matches from ${(boards as UnmatchedBoard[]).length} boards`);

    // ── Step 5: Upsert ref_companies + update ats_companies ───
    let refUpserted = 0;
    let atsUpdated = 0;
    const errors: string[] = [];

    for (const match of matches) {
      // Wall-time check
      if (performance.now() - startTime > WALL_TIME_MS) {
        logger.warn("Timeout approaching during upserts — stopping");
        break;
      }

      try {
        // Find the PDL company again for full data
        const boardNameNorm = normalizeName(match.board_name);
        const pdlCandidates = byName.get(boardNameNorm) || [];
        const pdlCo = pdlCandidates.find((c) => c.industry === match.industry) ||
          pdlCandidates[0];

        if (pdlCo) {
          // Conditional upsert to ref_companies — only fill NULLs
          const { error: refErr } = await sb.rpc("upsert_ref_company_if_null", {
            p_name: pdlCo.name || match.board_name,
            p_industry: pdlCo.industry || null,
            p_employee_size: pdlCo.employee_count_range || null,
            p_locality: pdlCo.locality || null,
            p_region: pdlCo.region || null,
            p_country: pdlCo.country || null,
            p_website: pdlCo.website || null,
            p_linkedin_url: pdlCo.linkedin_url || null,
            p_founded: pdlCo.founded || null,
          });

          if (refErr) {
            // Fallback: direct upsert if RPC doesn't exist
            const { error: directErr } = await sb
              .from("ref_companies")
              .upsert(
                {
                  name: pdlCo.name || match.board_name,
                  industry: pdlCo.industry,
                  employee_size: pdlCo.employee_count_range,
                  locality: pdlCo.locality,
                  region: pdlCo.region,
                  country: pdlCo.country,
                  website: pdlCo.website,
                  linkedin_url: pdlCo.linkedin_url,
                  founded: pdlCo.founded,
                },
                { onConflict: "name", ignoreDuplicates: true }
              );

            if (directErr) {
              errors.push(`ref_companies upsert for ${match.board_name}: ${directErr.message}`);
              continue;
            }
          }
          refUpserted++;
        }

        // Update ats_companies.industry
        const { error: atsErr } = await sb
          .from("ats_companies")
          .update({ industry: match.industry })
          .eq("id", match.board_id)
          .is("industry", null); // Only fill NULLs

        if (atsErr) {
          errors.push(`ats_companies update for ${match.board_id}: ${atsErr.message}`);
        } else {
          atsUpdated++;
        }
      } catch (e) {
        errors.push(`Exception for ${match.board_name}: ${(e as Error).message}`);
      }
    }

    // ── Step 6: Audit log ─────────────────────────────────────
    const durationMs = Math.round(performance.now() - startTime);

    const auditEntry = {
      action: "enrich-pdl-batch",
      details: {
        boards_checked: (boards as UnmatchedBoard[]).length,
        matches_found: matches.length,
        ref_upserted: refUpserted,
        ats_updated: atsUpdated,
        skipped_timeout: skippedTimeout,
        errors: errors.length,
        error_samples: errors.slice(0, 5),
        duration_ms: durationMs,
        pdl_file_size_mb: fileSizeMB,
        pdl_companies_count: pdlCompanies.length,
      },
      created_at: new Date().toISOString(),
    };

    // Try audit_log table — graceful fallback if it doesn't exist
    const { error: auditErr } = await sb
      .from("audit_log")
      .insert(auditEntry);

    if (auditErr) {
      logger.warn("Could not write to audit_log — table may not exist", {
        error: auditErr.message,
      });
    }

    logger.info("Enrichment complete", {
      boardsChecked: (boards as UnmatchedBoard[]).length,
      matchesFound: matches.length,
      refUpserted,
      atsUpdated,
      errors: errors.length,
      durationMs,
    });

    return new Response(
      JSON.stringify({
        success: true,
        boards_checked: (boards as UnmatchedBoard[]).length,
        matches_found: matches.length,
        ref_upserted: refUpserted,
        ats_updated: atsUpdated,
        skipped_timeout: skippedTimeout,
        errors: errors.length,
        duration_ms: durationMs,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    const durationMs = Math.round(performance.now() - startTime);
    logger.error("Unhandled error", {
      error: (e as Error).message,
      durationMs,
    });

    return new Response(
      JSON.stringify({ error: (e as Error).message, duration_ms: durationMs }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
