// supabase/functions/enrich-fcd-batch/index.ts
//
// FCD Company Enrichment Pipeline — Automated Batch Enrichment
// =============================================================
// Matches ats_companies with NULL industry/locality against the filtered
// Free Company Dataset (FCD) stored in Supabase Storage bucket fcd-enrichment.
//
// Matching strategies (in order of confidence):
//   1. Exact normalized name match
//   2. LinkedIn slug → ATS slug match
//   3. Domain match (website)
//   4. Unsquished slug match (split concatenated ATS slugs into words)
//   5. Jaccard token overlap (≥0.85 similarity, 3+ word names)
//
// Writes (only to NULL fields, never overwrites):
//   industry, locality, region, country, employee_size,
//   founded, linkedin_url, website
//
// Trigger: pg_cron (weekly, DISABLED by default) or manual POST
// Constraints: 150s timeout, 150 MB memory. Processes max 200 boards per run.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const BUCKET = "fcd-enrichment";
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
    " limited", " corporation", " company",
  ];
  for (const s of suffixes) {
    if (n.endsWith(s)) n = n.slice(0, -s.length);
  }
  // Replace separators with spaces
  n = n.replace(/[-_.]/g, " ");
  // Remove non-alphanumeric except spaces
  n = n.replace(/[^a-z0-9 ]/g, "");
  return n.replace(/\s+/g, " ").trim();
}

function extractDomain(url: string): string {
  if (!url) return "";
  return url
    .replace(/^https?:\/\/(www\.)?/, "")
    .split("/")[0]
    .toLowerCase()
    .trim();
}

function extractLinkedinSlug(url: string): string {
  if (!url) return "";
  const m = url.match(/linkedin\.com\/company\/([^/?#]+)/i);
  return m ? m[1].toLowerCase().replace(/\/$/, "") : "";
}

function unsquishSlug(slug: string): string {
  if (!slug) return "";
  // Insert spaces at camelCase boundaries: "grahamCapitalManagement" → "graham Capital Management"
  let s = slug.replace(/([a-z])([A-Z])/g, "$1 $2");
  // Also split on hyphens and underscores
  s = s.replace(/[-_]/g, " ");
  return normalizeName(s);
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

interface FcdCompany {
  name?: string;
  normalized_name?: string;
  industry?: string;
  employee_count_range?: string;
  locality?: string;
  region?: string;
  country?: string;
  website?: string;
  domain?: string;
  linkedin_url?: string;
  linkedin_slug?: string;
  founded?: number;
}

interface AtsCompany {
  slug: string;
  name: string;
  source: string;
  website?: string;
  linkedin_url?: string;
  ref_company_id?: string;
  industry?: string;
  locality?: string;
  region?: string;
  country?: string;
  employee_size?: string;
  founded?: number;
}

interface MatchResult {
  board_slug: string;
  board_source: string;
  board_name: string;
  fcd_name: string;
  strategy: string;
  match_signals: string[];
  payload: Record<string, unknown>;
}

// ─── Main handler ─────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const logger = createLogger("enrich-fcd-batch");
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
    logger.info("Fetching unmatched boards (industry IS NULL OR locality IS NULL)");

    const { data: boards, error: boardErr } = await sb
      .from("ats_companies")
      .select("slug, name, source, website, linkedin_url, ref_company_id, industry, locality, region, country, employee_size, founded")
      .or("industry.is.null,locality.is.null")
      .order("slug")
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

    // ── Step 2: Download filtered FCD file from Storage ───────
    logger.info("Downloading filtered FCD file from Storage");

    const { data: fileData, error: fileErr } = await sb.storage
      .from(BUCKET)
      .download(OBJECT_PATH);

    if (fileErr || !fileData) {
      logger.warn("FCD file not found in Storage — exiting cleanly", {
        error: fileErr?.message || "No data returned",
        bucket: BUCKET,
        path: OBJECT_PATH,
      });
      return new Response(
        JSON.stringify({
          message: "FCD file not available in Storage. Run upload-fcd-filtered.sh first.",
          error: fileErr?.message,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fileText = await fileData.text();
    const fileSizeMB = (fileText.length / 1_000_000).toFixed(1);
    logger.info(`FCD file downloaded: ${fileSizeMB} MB`);

    let fcdCompanies: FcdCompany[];
    try {
      fcdCompanies = JSON.parse(fileText);
    } catch (e) {
      logger.error("Failed to parse FCD JSON", { error: (e as Error).message });
      return new Response(
        JSON.stringify({ error: "Failed to parse FCD file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logger.info(`Parsed ${fcdCompanies.length} FCD companies`);

    // ── Step 3: Build lookup indexes ──────────────────────────
    const byNormalizedName = new Map<string, FcdCompany[]>();
    const byLinkedinSlug = new Map<string, FcdCompany>();
    const byDomain = new Map<string, FcdCompany>();

    for (const co of fcdCompanies) {
      // Normalized name index
      const nn = co.normalized_name || normalizeName(co.name || "");
      if (nn && nn.length >= 2) {
        if (!byNormalizedName.has(nn)) byNormalizedName.set(nn, []);
        byNormalizedName.get(nn)!.push(co);
      }

      // LinkedIn slug index
      const slug = co.linkedin_slug || extractLinkedinSlug(co.linkedin_url || "");
      if (slug) {
        byLinkedinSlug.set(slug, co);
      }

      // Domain index
      const domain = co.domain || extractDomain(co.website || "");
      if (domain) {
        byDomain.set(domain, co);
      }
    }

    logger.info("Indexes built", {
      nameKeys: byNormalizedName.size,
      linkedinSlugKeys: byLinkedinSlug.size,
      domainKeys: byDomain.size,
    });

    // ── Step 4: Match boards against FCD (5 strategies) ───────
    const matches: MatchResult[] = [];
    const strategyStats = { s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 };
    let skippedTimeout = 0;

    for (const board of boards as AtsCompany[]) {
      // Wall-time check
      if (performance.now() - startTime > WALL_TIME_MS) {
        skippedTimeout = (boards as AtsCompany[]).length - matches.length;
        logger.warn(`Approaching timeout — stopping with ${matches.length} matches, ${skippedTimeout} skipped`);
        break;
      }

      let bestMatch: FcdCompany | null = null;
      let matchStrategy = "";
      const signals: string[] = [];

      const boardNorm = normalizeName(board.name || board.slug || "");

      // Strategy 1: Exact normalized name
      if (boardNorm && boardNorm.length >= 2) {
        const candidates = byNormalizedName.get(boardNorm);
        if (candidates) {
          const match = candidates.find(c => c.industry);
          if (match) {
            bestMatch = match;
            matchStrategy = "s1_exact_name";
            signals.push("exact_name");
            strategyStats.s1++;
          }
        }
      }

      // Strategy 2: LinkedIn slug → ATS slug
      if (!bestMatch) {
        // Check if any FCD company's linkedin_slug matches this board's slug
        const fcdBySlug = byLinkedinSlug.get(board.slug);
        if (fcdBySlug && fcdBySlug.industry) {
          bestMatch = fcdBySlug;
          matchStrategy = "s2_linkedin_slug";
          signals.push("linkedin_slug");
          strategyStats.s2++;
        }

        // Also: match FCD linkedin_slug against board's linkedin_url slug
        if (!bestMatch && board.linkedin_url) {
          const boardLinkedinSlug = extractLinkedinSlug(board.linkedin_url);
          if (boardLinkedinSlug) {
            const fcdByBoardLiSlug = byLinkedinSlug.get(boardLinkedinSlug);
            if (fcdByBoardLiSlug && fcdByBoardLiSlug.industry) {
              bestMatch = fcdByBoardLiSlug;
              matchStrategy = "s2_linkedin_slug";
              signals.push("linkedin_slug_url");
              strategyStats.s2++;
            }
          }
        }
      }

      // Strategy 3: Domain match
      if (!bestMatch && board.website) {
        const boardDomain = extractDomain(board.website);
        if (boardDomain) {
          const fcdByDomain = byDomain.get(boardDomain);
          if (fcdByDomain && fcdByDomain.industry) {
            bestMatch = fcdByDomain;
            matchStrategy = "s3_domain";
            signals.push("domain");
            strategyStats.s3++;
          }
        }
      }

      // Strategy 4: Unsquished slug match
      if (!bestMatch && board.slug) {
        const unsquished = unsquishSlug(board.slug);
        if (unsquished && unsquished.length >= 3) {
          const candidates = byNormalizedName.get(unsquished);
          if (candidates) {
            const match = candidates.find(c => c.industry);
            if (match) {
              bestMatch = match;
              matchStrategy = "s4_unsquished_slug";
              signals.push("unsquished_slug");
              strategyStats.s4++;
            }
          }
        }
      }

      // Strategy 5: Jaccard token overlap (≥0.85, both sides 3+ tokens)
      if (!bestMatch && boardNorm) {
        const boardTokens = boardNorm.split(" ").filter(Boolean);
        if (boardTokens.length >= 3) {
          // Search through name index for high-similarity matches
          for (const [nn, candidates] of byNormalizedName) {
            const nnTokens = nn.split(" ").filter(Boolean);
            if (nnTokens.length < 3) continue;

            const sim = jaccardSimilarity(boardNorm, nn);
            if (sim >= 0.85) {
              const match = candidates.find(c => c.industry);
              if (match) {
                bestMatch = match;
                matchStrategy = "s5_jaccard";
                signals.push(`jaccard_${sim.toFixed(2)}`);
                strategyStats.s5++;
                break;
              }
            }
          }
        }
      }

      // Build enrichment payload — only non-null FCD fields for NULL ats_companies fields
      if (bestMatch && signals.length >= 1) {
        const payload: Record<string, unknown> = {};

        if (!board.industry && bestMatch.industry)
          payload.industry = bestMatch.industry;
        if (!board.locality && bestMatch.locality)
          payload.locality = bestMatch.locality;
        if (!board.region && bestMatch.region)
          payload.region = bestMatch.region;
        if (!board.country && bestMatch.country)
          payload.country = bestMatch.country;
        if (!board.employee_size && bestMatch.employee_count_range)
          payload.employee_size = bestMatch.employee_count_range;
        if (!board.founded && bestMatch.founded)
          payload.founded = bestMatch.founded;
        if (!board.linkedin_url && bestMatch.linkedin_url)
          payload.linkedin_url = bestMatch.linkedin_url;
        if (!board.website && bestMatch.website)
          payload.website = bestMatch.website;

        // Only create a match if we have at least one field to write
        if (Object.keys(payload).length > 0) {
          matches.push({
            board_slug: board.slug,
            board_source: board.source,
            board_name: board.name || board.slug,
            fcd_name: bestMatch.name || "",
            strategy: matchStrategy,
            match_signals: signals,
            payload,
          });
        }
      }
    }

    logger.info(`Matching complete: ${matches.length} matches from ${(boards as AtsCompany[]).length} boards`, {
      strategies: strategyStats,
    });

    // ── Step 5: Update ats_companies ──────────────────────────
    let atsUpdated = 0;
    let refUpserted = 0;
    const errors: string[] = [];

    for (const match of matches) {
      // Wall-time check
      if (performance.now() - startTime > WALL_TIME_MS) {
        logger.warn("Timeout approaching during updates — stopping");
        break;
      }

      try {
        // Update ats_companies with enrichment payload
        const { error: atsErr } = await sb
          .from("ats_companies")
          .update(match.payload)
          .eq("slug", match.board_slug)
          .eq("source", match.board_source);

        if (atsErr) {
          errors.push(`ats_companies update for ${match.board_slug}: ${atsErr.message}`);
        } else {
          atsUpdated++;
        }

        // Also upsert into ref_companies if the RPC exists
        const fcdNorm = normalizeName(match.fcd_name);
        const candidates = byNormalizedName.get(fcdNorm);
        const fcdCo = candidates?.find(c => c.industry) || candidates?.[0];

        if (fcdCo) {
          const { error: refErr } = await sb.rpc("upsert_ref_company_if_null", {
            p_name: fcdCo.name || match.board_name,
            p_industry: fcdCo.industry || null,
            p_employee_size: fcdCo.employee_count_range || null,
            p_locality: fcdCo.locality || null,
            p_region: fcdCo.region || null,
            p_country: fcdCo.country || null,
            p_website: fcdCo.website || null,
            p_linkedin_url: fcdCo.linkedin_url || null,
            p_founded: fcdCo.founded || null,
          });

          if (refErr) {
            // Fallback: direct upsert if RPC doesn't exist
            const { error: directErr } = await sb
              .from("ref_companies")
              .upsert(
                {
                  name: fcdCo.name || match.board_name,
                  industry: fcdCo.industry,
                  employee_size: fcdCo.employee_count_range,
                  locality: fcdCo.locality,
                  region: fcdCo.region,
                  country: fcdCo.country,
                  website: fcdCo.website,
                  linkedin_url: fcdCo.linkedin_url,
                  founded: fcdCo.founded,
                },
                { onConflict: "name", ignoreDuplicates: true }
              );

            if (directErr) {
              // Non-fatal: ref_companies may not have all columns yet
              if (!directErr.message.includes("does not exist")) {
                errors.push(`ref_companies upsert for ${match.board_name}: ${directErr.message}`);
              }
              continue;
            }
          }
          refUpserted++;
        }
      } catch (e) {
        errors.push(`Exception for ${match.board_name}: ${(e as Error).message}`);
      }
    }

    // ── Step 6: Audit log ─────────────────────────────────────
    const durationMs = Math.round(performance.now() - startTime);

    const auditEntry = {
      action: "enrich-fcd-batch",
      details: {
        boards_checked: (boards as AtsCompany[]).length,
        matches_found: matches.length,
        ref_upserted: refUpserted,
        ats_updated: atsUpdated,
        skipped_timeout: skippedTimeout,
        errors: errors.length,
        error_samples: errors.slice(0, 5),
        duration_ms: durationMs,
        fcd_file_size_mb: fileSizeMB,
        fcd_companies_count: fcdCompanies.length,
        strategy_breakdown: strategyStats,
      },
      created_at: new Date().toISOString(),
    };

    const { error: auditErr } = await sb
      .from("audit_log")
      .insert(auditEntry);

    if (auditErr) {
      logger.warn("Could not write to audit_log — table may not exist", {
        error: auditErr.message,
      });
    }

    logger.info("Enrichment complete", {
      boardsChecked: (boards as AtsCompany[]).length,
      matchesFound: matches.length,
      refUpserted,
      atsUpdated,
      errors: errors.length,
      durationMs,
      strategies: strategyStats,
    });

    return new Response(
      JSON.stringify({
        success: true,
        boards_checked: (boards as AtsCompany[]).length,
        matches_found: matches.length,
        ref_upserted: refUpserted,
        ats_updated: atsUpdated,
        skipped_timeout: skippedTimeout,
        errors: errors.length,
        duration_ms: durationMs,
        strategy_breakdown: strategyStats,
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
