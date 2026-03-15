// ============================================================
// resolve-boards/index.ts
// Board Discovery Pipeline — Step B: Board Resolution
// Schedule: pg_cron every 15 minutes
// ============================================================
// Processes board_discovery_queue: for each pending company,
// attempts to find their ATS board URL via tiered resolution.
//
// Tier 1: URL probe (free, fast — HTTP HEAD against known ATS patterns)
// Tier 2: PDL domain lookup (free — check ref_companies for domain)
// Tier 3: DataForSEO SERP query ($0.01/query — fallback)
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DFS_LOGIN = Deno.env.get("DFS_LOGIN") || "";
const DFS_PASSWORD = Deno.env.get("DFS_PASSWORD") || "";

const BATCH_SIZE = 10; // 10 companies per invocation
const PROBE_TIMEOUT_MS = 5000;

// ATS URL patterns — platform → URL template ({slug} gets replaced)
const ATS_PATTERNS: Record<string, string[]> = {
  greenhouse: [
    "https://boards.greenhouse.io/{slug}",
    "https://boards.eu.greenhouse.io/{slug}",
  ],
  lever: ["https://jobs.lever.co/{slug}"],
  ashby: ["https://jobs.ashbyhq.com/{slug}"],
  workable: ["https://apply.workable.com/{slug}"],
  recruitee: ["https://{slug}.recruitee.com"],
};

// Generate slug variants from a company name
function generateSlugs(companyName: string): string[] {
  const name = companyName.trim().toLowerCase();
  const slugs = new Set<string>();

  // Full name hyphenated: "Acme Corp" → "acme-corp"
  slugs.add(name.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));

  // Full name concatenated: "Acme Corp" → "acmecorp"
  slugs.add(name.replace(/[^a-z0-9]/g, ""));

  // First word only: "Acme Corp" → "acme"
  const firstWord = name.split(/\s+/)[0].replace(/[^a-z0-9]/g, "");
  if (firstWord.length >= 2) slugs.add(firstWord);

  // Without common suffixes
  const stripped = name
    .replace(
      /\s+(inc|llc|ltd|corp|co|company|group|technologies|technology|tech|solutions|services|consulting|global|international)\s*$/i,
      ""
    )
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  if (stripped.length >= 2) slugs.add(stripped);

  // Filter out empties and tiny slugs
  return [...slugs].filter((s) => s.length >= 2);
}

// Tier 1: HTTP HEAD probe against known ATS URL patterns
async function probeAtsUrls(
  slug: string
): Promise<{ platform: string; url: string } | null> {
  for (const [platform, patterns] of Object.entries(ATS_PATTERNS)) {
    for (const pattern of patterns) {
      const url = pattern.replace("{slug}", slug);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          PROBE_TIMEOUT_MS
        );
        const resp = await fetch(url, {
          method: "HEAD",
          signal: controller.signal,
          headers: {
            "User-Agent": "BrilliantJobs/1.0 (board-discovery)",
          },
          redirect: "follow",
        });
        clearTimeout(timeout);

        if (resp.ok) {
          // Additional validation: fetch content to confirm real job board
          const getResp = await fetch(url, {
            method: "GET",
            headers: {
              "User-Agent": "BrilliantJobs/1.0 (board-discovery)",
            },
          });

          const body = await getResp.text();
          const lowerBody = body.toLowerCase();
          if (
            lowerBody.includes("job") ||
            lowerBody.includes("career") ||
            lowerBody.includes("position") ||
            lowerBody.includes("opening")
          ) {
            return { platform, url };
          }
        }
      } catch {
        // Timeout or network error — move to next pattern
        continue;
      }
    }
  }
  return null;
}

// Tier 2: PDL domain lookup — check ref_companies for a domain match
async function pdlLookup(
  sb: ReturnType<typeof createClient>,
  companyName: string
): Promise<string | null> {
  const { data } = await sb
    .from("ref_companies")
    .select("domain")
    .ilike("name", `%${companyName}%`)
    .limit(1)
    .single();

  if (data?.domain) {
    // Extract slug from domain: "acme.io" → "acme"
    const slug = data.domain.split(".")[0];
    if (slug && slug.length >= 2) return slug;
  }

  return null;
}

serve(async (req: Request) => {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 1. Fetch pending items from queue
    const { data: queue, error: fetchError } = await sb
      .from("board_discovery_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) throw fetchError;
    if (!queue || queue.length === 0) {
      return new Response(
        JSON.stringify({ message: "No pending items", processed: 0 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const results: Array<{
      company: string;
      status: string;
      platform?: string;
      slug?: string;
    }> = [];

    for (const item of queue) {
      // Mark as probing
      await sb
        .from("board_discovery_queue")
        .update({
          status: "probing",
          last_attempted_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      let found = false;

      // Generate slug candidates
      const slugs = generateSlugs(item.company_name);

      // Tier 1: URL probes
      for (const slug of slugs) {
        const result = await probeAtsUrls(slug);

        if (result) {
          // Found! Insert into ats_companies
          await sb.from("ats_companies").upsert(
            {
              slug,
              source: result.platform,
              job_count: 0,
              last_checked: null,
              discovered_via: "discovery_pipeline",
            },
            { onConflict: "slug,source", ignoreDuplicates: true }
          );

          // Update queue
          await sb
            .from("board_discovery_queue")
            .update({
              status: "found",
              resolved_slug: slug,
              resolved_source: result.platform,
              attempts: item.attempts + 1,
              last_attempted_at: new Date().toISOString(),
            })
            .eq("id", item.id);

          // Update companies table
          await sb
            .from("companies")
            .update({ discovery_status: "found" })
            .eq("company_id", item.company_id);

          results.push({
            company: item.company_name,
            status: "found",
            platform: result.platform,
            slug,
          });
          found = true;
          break;
        }
      }

      if (found) continue;

      // Tier 2: PDL domain lookup
      const pdlSlug = await pdlLookup(sb, item.company_name);
      if (pdlSlug && !slugs.includes(pdlSlug)) {
        const result = await probeAtsUrls(pdlSlug);

        if (result) {
          await sb.from("ats_companies").upsert(
            {
              slug: pdlSlug,
              source: result.platform,
              job_count: 0,
              last_checked: null,
              discovered_via: "discovery_pipeline",
            },
            { onConflict: "slug,source", ignoreDuplicates: true }
          );

          await sb
            .from("board_discovery_queue")
            .update({
              status: "found",
              resolved_slug: pdlSlug,
              resolved_source: result.platform,
              attempts: item.attempts + 1,
              last_attempted_at: new Date().toISOString(),
            })
            .eq("id", item.id);

          await sb
            .from("companies")
            .update({ discovery_status: "found" })
            .eq("company_id", item.company_id);

          results.push({
            company: item.company_name,
            status: "found",
            platform: result.platform,
            slug: pdlSlug,
          });
          continue;
        }
      }

      // Tier 3: DataForSEO fallback (skip if no credentials)
      // TODO: Implement DataForSEO SERP query when ready
      // For now, mark as not_found after Tier 1 + Tier 2 fail

      // Not found
      await sb
        .from("board_discovery_queue")
        .update({
          status: "not_found",
          attempts: item.attempts + 1,
          last_attempted_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      results.push({ company: item.company_name, status: "not_found" });
    }

    return new Response(
      JSON.stringify({
        processed: results.length,
        found: results.filter((r) => r.status === "found").length,
        not_found: results.filter((r) => r.status === "not_found").length,
        results,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
