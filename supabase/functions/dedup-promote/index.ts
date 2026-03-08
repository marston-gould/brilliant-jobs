/**
 * SA-008: Deduplication Engine + Enrichment Queue Integration
 * ADR-07: Deduplication Strategy
 *
 * Actions:
 *   dedup       — Run full dedup batch (exact → fuzzy → promote → enqueue)
 *   enrich      — Process enrichment queue batch (calls enrich-jd-ai pattern)
 *   status      — Return dedup + enrichment queue stats
 *
 * Architecture:
 *   cc_staging_jobs (pending) → exact dedup → fuzzy dedup → ats_jobs + enrichment_queue
 *   enrichment_queue → rate-limited Anthropic API calls (100/hour for CC source)
 *
 * HOOK: enrich_type field supports future enrichment types beyond jd_ai.
 * SCAR: scheduled_after enables dynamic rate adjustment without code changes.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { withCorrelation } from "../_shared/middleware.ts";
import { requireAdmin, AdminAuthError } from "../_shared/admin-auth.ts";
import { warnIfDirectAccess } from "../_shared/gateway-deprecation.ts";

// ─── Environment ─────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

// ─── Constants ───────────────────────────────────────────────────────────────

const DEDUP_BATCH_SIZE = 500;
const FUZZY_THRESHOLD = 0.7;
const ENRICH_BATCH_SIZE = 10;        // Items per enrichment run
const CC_HOURLY_BUDGET = 100;        // Max Anthropic calls/hour for CC records
const WALL_TIME_MS = 55_000;         // EF timeout safety margin (60s limit)
const MODEL = "claude-haiku-4-5-20251001";
const MAX_CONTENT_CHARS = 6000;

const ENRICH_SYSTEM_PROMPT = `Extract structured data from this job description. Return ONLY a JSON object:
{
  "skills": ["lowercase","skill","names"], // max 15, specific technical/professional skills only
  "requirements": ["short qualification phrases"], // max 8
  "education": "bachelors", // one of: high_school, associates, bachelors, masters, phd, professional, or null
  "seniority": "mid", // one of: intern, entry, junior, mid, senior, lead, principal, director, vp, executive, or null
  "years_min": 3, // integer or null
  "years_max": 5, // integer or null
  "ai_content_score": 0.35, // float 0.0-1.0: probability this JD was AI-generated
  "ai_label": "human" // one of: human (<0.3), mixed (0.3-0.7), ai_generated (>0.7)
}
No markdown. No explanation. JSON only.`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}

// ─── Main Handler ────────────────────────────────────────────────────────────

serve(withCorrelation("dedup-promote", async (req: Request, logger: Logger) => {
  warnIfDirectAccess(req, "dedup-promote", logger);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Auth: admin only
  try {
    await requireAdmin(req);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.statusCode,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw e;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: { action?: string; batch_size?: number; fuzzy_threshold?: number } = {};
  try {
    body = await req.json();
  } catch (e) { console.warn("[EF][dedup_promote_json_parse]", e?.message || String(e));
    // Default action
  }

  const action = body.action || "status";
  const startTime = Date.now();

  logger.info(`SA-008 dedup-promote: action=${action}`);

  try {
    switch (action) {
      // ─── DEDUP: Run full dedup pipeline ─────────────────────────────────
      case "dedup": {
        const batchSize = body.batch_size || DEDUP_BATCH_SIZE;
        const threshold = body.fuzzy_threshold || FUZZY_THRESHOLD;

        const { data, error } = await supabase.rpc("cc_run_dedup_batch", {
          p_batch_size: batchSize,
          p_fuzzy_threshold: threshold,
        });

        if (error) {
          logger.error(`Dedup RPC failed: ${error.message}`);
          return new Response(JSON.stringify({ error: "Dedup failed", detail: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        logger.info(`Dedup complete: ${JSON.stringify(data)}`);
        return new Response(JSON.stringify({
          action: "dedup",
          result: data,
          duration_ms: Date.now() - startTime,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // ─── ENRICH: Process enrichment queue batch ─────────────────────────
      case "enrich": {
        // Check hourly budget
        const { data: hourlyCount } = await supabase
          .from("enrichment_queue")
          .select("id", { count: "exact", head: true })
          .eq("ats_source", "common_crawl")
          .eq("status", "completed")
          .gte("completed_at", new Date(Date.now() - 3600_000).toISOString());

        const usedThisHour = hourlyCount || 0;
        const remaining = CC_HOURLY_BUDGET - usedThisHour;

        if (remaining <= 0) {
          return new Response(JSON.stringify({
            action: "enrich",
            status: "rate_limited",
            hourly_budget: CC_HOURLY_BUDGET,
            used_this_hour: usedThisHour,
            next_window: new Date(Date.now() + 3600_000).toISOString(),
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const batchLimit = Math.min(ENRICH_BATCH_SIZE, remaining);

        // Claim batch from queue
        const { data: batch, error: claimErr } = await supabase.rpc("eq_next_batch", {
          p_source: "common_crawl",
          p_limit: batchLimit,
        });

        if (claimErr || !batch || batch.length === 0) {
          return new Response(JSON.stringify({
            action: "enrich",
            status: "no_work",
            queue_empty: !batch || batch.length === 0,
            error: claimErr?.message || null,
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        logger.info(`Enriching ${batch.length} CC jobs`);

        let enriched = 0;
        let failed = 0;

        for (const item of batch) {
          // Wall-time safety check
          if (Date.now() - startTime > WALL_TIME_MS) {
            logger.warn("Wall time limit approaching, stopping enrichment");
            // Release unclaimed items back to pending
            await supabase.rpc("eq_complete", { p_queue_id: item.queue_id, p_success: false, p_error: "wall_time_limit" });
            continue;
          }

          try {
            // Fetch job content from ats_jobs
            const { data: job } = await supabase
              .from("ats_jobs")
              .select("greenhouse_id, title, content")
              .eq("greenhouse_id", item.greenhouse_id)
              .eq("ats_source", item.ats_source)
              .single();

            if (!job || !job.content || job.content.length < 50) {
              await supabase.rpc("eq_complete", { p_queue_id: item.queue_id, p_success: false, p_error: "insufficient_content" });
              failed++;
              continue;
            }

            const plainText = stripHtml(job.content).substring(0, MAX_CONTENT_CHARS);

            // Call Anthropic API
            const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
              },
              body: JSON.stringify({
                model: MODEL,
                max_tokens: 400,
                system: ENRICH_SYSTEM_PROMPT,
                messages: [{ role: "user", content: `Job title: ${job.title}\n\n${plainText}` }],
              }),
            });

            if (!aiResp.ok) {
              const errText = await aiResp.text();
              logger.error(`Anthropic error for ${item.greenhouse_id}: ${aiResp.status} ${errText}`);
              await supabase.rpc("eq_complete", { p_queue_id: item.queue_id, p_success: false, p_error: `anthropic_${aiResp.status}` });
              failed++;
              continue;
            }

            const aiData = await aiResp.json();
            const rawText = aiData.content?.[0]?.text || "";
            const parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());

            // Write enrichment data to ats_jobs
            const { error: updateErr } = await supabase
              .from("ats_jobs")
              .update({
                jd_skills: parsed.skills || [],
                jd_requirements: parsed.requirements || [],
                jd_education: parsed.education || null,
                jd_seniority: parsed.seniority || null,
                jd_years_min: parsed.years_min || null,
                jd_years_max: parsed.years_max || null,
                ai_content_score: parsed.ai_content_score || null,
                ai_label: parsed.ai_label || "unknown",
              })
              .eq("greenhouse_id", item.greenhouse_id)
              .eq("ats_source", item.ats_source);

            if (updateErr) {
              logger.error(`Update failed for ${item.greenhouse_id}: ${updateErr.message}`);
              await supabase.rpc("eq_complete", { p_queue_id: item.queue_id, p_success: false, p_error: updateErr.message });
              failed++;
            } else {
              await supabase.rpc("eq_complete", { p_queue_id: item.queue_id, p_success: true });
              enriched++;
            }
          } catch (e) {
            logger.error(`Enrichment error for ${item.greenhouse_id}: ${e.message}`);
            await supabase.rpc("eq_complete", { p_queue_id: item.queue_id, p_success: false, p_error: e.message });
            failed++;
          }
        }

        return new Response(JSON.stringify({
          action: "enrich",
          status: "completed",
          enriched,
          failed,
          batch_size: batch.length,
          hourly_budget_remaining: remaining - enriched,
          duration_ms: Date.now() - startTime,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // ─── STATUS: Pipeline stats ─────────────────────────────────────────
      case "status": {
        // Staging counts
        const { data: stagingStats } = await supabase
          .from("cc_staging_jobs")
          .select("ingestion_status")
          .then((r: { data: unknown; error: unknown }) => {
            if (!r.data) return { data: null };
            const counts: Record<string, number> = {};
            r.data.forEach((row: Record<string, unknown>) => {
              counts[row.ingestion_status] = (counts[row.ingestion_status] || 0) + 1;
            });
            return { data: counts };
          });

        // Enrichment queue counts
        const { data: eqStats } = await supabase
          .from("enrichment_queue")
          .select("status, ats_source")
          .then((r: { data: unknown; error: unknown }) => {
            if (!r.data) return { data: null };
            const counts: Record<string, number> = {};
            r.data.forEach((row: Record<string, unknown>) => {
              const key = `${row.ats_source}:${row.status}`;
              counts[key] = (counts[key] || 0) + 1;
            });
            return { data: counts };
          });

        // Dedup summary (last 24h)
        const { data: dedupRecent } = await supabase
          .from("dedup_log")
          .select("decision")
          .gte("created_at", new Date(Date.now() - 86400_000).toISOString())
          .then((r: { data: unknown; error: unknown }) => {
            if (!r.data) return { data: null };
            const counts: Record<string, number> = {};
            r.data.forEach((row: Record<string, unknown>) => {
              counts[row.decision] = (counts[row.decision] || 0) + 1;
            });
            return { data: counts };
          });

        return new Response(JSON.stringify({
          action: "status",
          staging: stagingStats,
          enrichment_queue: eqStats,
          dedup_last_24h: dedupRecent,
          duration_ms: Date.now() - startTime,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({
          error: `Unknown action: ${action}`,
          valid_actions: ["dedup", "enrich", "status"],
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
    }
  } catch (e) {
    logger.error(`SA-008 dedup-promote error: ${e.message}`);
    return new Response(JSON.stringify({
      error: "Internal server error",
      detail: e.message,
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}));
