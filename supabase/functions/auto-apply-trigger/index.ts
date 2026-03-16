// supabase/functions/auto-apply-trigger/index.ts
//
// Auto-Apply Trigger Engine — Item #1 (P0, Launch-Critical)
// ============================================================
// pg_cron: every 10 minutes
// 
// Flow:
//   1. Query new jobs inserted since last trigger run
//   2. For each user with auto_apply enabled + active filters:
//      a. Match new jobs against user's saved filter pills (keyword + location)
//      b. For matches, call score-resume internally
//      c. Score >= threshold → insert into pending_applications
//      d. Respect approval_mode from user settings
//   3. Log run stats
//
// Dependencies: score-resume EF (built), pending_applications (built),
//   user_filters (built), plans.auto_apply (built)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { withAnthropicBreaker } from "../_shared/anthropic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const RUN_INTERVAL_MS = 10 * 60 * 1000; // 10 min lookback
const MAX_JOBS_PER_RUN = 200;
const MAX_MATCHES_PER_USER = 10;
const DEFAULT_THRESHOLD = 70;
const MATCH_EXPIRES_HOURS = 72;

const log = createLogger("auto-apply-trigger");

// ─── Lightweight keyword matcher (server-side equivalent of buildFilterQuery) ───
function matchesFilter(job: unknown, filterData: unknown): boolean {
  const title = (job.title || "").toLowerCase();
  const location = (job.location || "").toLowerCase();
  const company = (job.company_name || "").toLowerCase();

  // WHAT pills — at least one keyword must match title
  const whatPills = filterData.whatPills || filterData.pills || [];
  if (whatPills.length > 0) {
    const anyMatch = whatPills.some((pill: unknown) =>
      (pill.values || []).some((v: string) => title.includes(v.toLowerCase().trim()))
    );
    if (!anyMatch) return false;
  }

  // WHAT NOT pills — exclude if any match
  const whatNotPills = filterData.whatNotPills || [];
  for (const pill of whatNotPills) {
    for (const v of pill.values || []) {
      if (title.includes(v.toLowerCase().trim())) return false;
    }
  }

  // WHERE pills — location matching (text-based, no radius on server)
  const wherePills = filterData.wherePills || [];
  if (wherePills.length > 0) {
    const includeRemote = filterData.includeRemote === true;
    const isRemote = (job.is_remote === true) || location.includes("remote");

    if (includeRemote && isRemote) {
      // Remote jobs match any location filter if includeRemote is on
    } else {
      const locMatch = wherePills.some((pill: unknown) =>
        (pill.values || []).some((v: string) => location.includes(v.toLowerCase().trim()))
      );
      if (!locMatch && !(includeRemote && isRemote)) return false;
    }
  }

  // WHERE NOT pills — exclude locations
  const whereNotPills = filterData.whereNotPills || [];
  for (const pill of whereNotPills) {
    for (const v of pill.values || []) {
      if (location.includes(v.toLowerCase().trim())) return false;
    }
  }

  // WHO pills — company name matching
  const whoPills = filterData.whoPills || [];
  if (whoPills.length > 0) {
    const whoMatch = whoPills.some((pill: unknown) =>
      (pill.values || []).some((v: string) => company.includes(v.toLowerCase().trim()))
    );
    if (!whoMatch) return false;
  }

  // WHO NOT pills
  const whoNotPills = filterData.whoNotPills || [];
  for (const pill of whoNotPills) {
    for (const v of pill.values || []) {
      if (company.includes(v.toLowerCase().trim())) return false;
    }
  }

  // PAY pills — salary range filtering
  const payPills = filterData.payPills || [];
  if (payPills.length > 0 && job.salary_max) {
    const includeNoSalary = filterData.includeNoSalary !== false;
    if (!job.salary_min && !job.salary_max && !includeNoSalary) return false;
    // If job has salary, check against pay pills
    if (job.salary_max) {
      const anyPayMatch = payPills.some((pill: unknown) => {
        for (const v of pill.values || []) {
          const num = parseInt(v.replace(/[^0-9]/g, ""), 10);
          if (!isNaN(num) && job.salary_max >= num) return true;
        }
        return false;
      });
      if (!anyPayMatch) return false;
    }
  }

  return true;
}

// ─── Inline score call (avoids HTTP round-trip, uses same Anthropic API) ───
async function quickScore(
  resumeText: string,
  jobTitle: string,
  jobContent: string,
  companyName: string
): Promise<{ score: number; fit_status: string; summary: string } | null> {
  const jdSnippet = (jobContent || "").slice(0, 2000);
  const resumeSnippet = resumeText.slice(0, 3000);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 500,
        temperature: 0,
        system: `You are a resume-job matching scorer. Given a resume and job description, return ONLY valid JSON with no markdown:
{"score": <0-100>, "fit_status": "strong"|"moderate"|"weak", "summary": "<1 sentence>"}
Score based on: skill overlap (40%), experience level match (30%), industry relevance (20%), location fit (10%).`,
        messages: [
          {
            role: "user",
            content: `RESUME:\n${resumeSnippet}\n\nJOB: ${jobTitle} at ${companyName}\n${jdSnippet}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      log.warn("Anthropic API error", { status: res.status });
      return null;
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    log.warn("Score failed", { error: (e as Error).message });
    return null;
  }
}

// ─── Main handler ───
Deno.serve(async (req) => {
  const startTime = Date.now();
  const stats = {
    new_jobs: 0,
    eligible_users: 0,
    matches_found: 0,
    scored: 0,
    queued: 0,
    errors: 0,
  };

  try {
    // 1. Get new jobs since last run (lookback = interval + 2 min buffer)
    const lookback = new Date(Date.now() - RUN_INTERVAL_MS - 2 * 60 * 1000).toISOString();
    const { data: newJobs, error: jobErr } = await sb
      .from("ats_jobs")
      .select("greenhouse_id, title, company_name, company_slug, location, content, is_remote, salary_min, salary_max, url")
      .eq("status", "open")
      .gte("first_seen_at", lookback)
      .not("content", "is", null)
      .limit(MAX_JOBS_PER_RUN);

    if (jobErr) throw new Error(`Job query failed: ${jobErr.message}`);
    if (!newJobs || newJobs.length === 0) {
      log.info("No new jobs since last run", { lookback });
      return new Response(JSON.stringify({ ok: true, stats, ms: Date.now() - startTime }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    stats.new_jobs = newJobs.length;
    log.info(`Found ${newJobs.length} new jobs since ${lookback}`);

    // 2. Get eligible users: have auto_apply plan feature + active filters + a resume
    const { data: eligibleUsers, error: userErr } = await sb.rpc("get_auto_apply_eligible_users");

    // If RPC doesn't exist yet, fallback to direct query
    let users: unknown[] = [];
    if (userErr || !eligibleUsers) {
      log.info("RPC not available, using direct query");
      // Get users on plans with auto_apply = true
      const { data: proPlans } = await sb
        .from("plans")
        .select("id")
        .eq("auto_apply", true);
      
      if (!proPlans || proPlans.length === 0) {
        log.info("No plans with auto_apply enabled");
        return new Response(JSON.stringify({ ok: true, stats, ms: Date.now() - startTime }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const planIds = proPlans.map((p: Record<string, unknown>) => p.id);

      // Get subscriptions on those plans
      const { data: subs } = await sb
        .from("subscriptions")
        .select("user_id, plan_id")
        .in("plan_id", planIds)
        .eq("status", "active");

      if (!subs || subs.length === 0) {
        log.info("No active auto_apply subscriptions");
        return new Response(JSON.stringify({ ok: true, stats, ms: Date.now() - startTime }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const userIds = subs.map((s: Record<string, unknown>) => s.user_id);

      // Get their filters + default resume
      for (const userId of userIds) {
        const [filtersRes, resumeRes] = await Promise.all([
          sb.from("user_filters").select("id, name, filter_data").eq("user_id", userId),
          sb.from("resumes").select("id, name, file_path").eq("user_id", userId).eq("is_default", true).is("deleted_at", null).limit(1),
        ]);

        if (filtersRes.data?.length && resumeRes.data?.length) {
          users.push({
            user_id: userId,
            filters: filtersRes.data,
            resume: resumeRes.data[0],
          });
        }
      }
    } else {
      users = eligibleUsers;
    }

    stats.eligible_users = users.length;
    if (users.length === 0) {
      log.info("No eligible users with filters + resume");
      return new Response(JSON.stringify({ ok: true, stats, ms: Date.now() - startTime }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    log.info(`Processing ${users.length} eligible users against ${newJobs.length} jobs`);

    // 3. For each user, match jobs against their filters, score, and queue
    for (const user of users) {
      try {
        // Get resume text (from resume_archive or resumes content)
        const { data: archive } = await sb
          .from("resume_archive")
          .select("extracted_text")
          .eq("user_id", user.user_id)
          .not("extracted_text", "is", null)
          .order("created_at", { ascending: false })
          .limit(1);

        const resumeText = archive?.[0]?.extracted_text;
        if (!resumeText) {
          log.info(`User ${user.user_id}: no resume text, skipping`);
          continue;
        }

        // Match new jobs against all user filters
        const matchedJobs: unknown[] = [];
        const seenJobIds = new Set<string>();

        for (const filter of user.filters) {
          for (const job of newJobs) {
            if (seenJobIds.has(job.greenhouse_id)) continue;
            if (matchesFilter(job, filter.filter_data)) {
              matchedJobs.push({ ...job, filter_id: filter.id });
              seenJobIds.add(job.greenhouse_id);
            }
          }
        }

        if (matchedJobs.length === 0) continue;
        stats.matches_found += matchedJobs.length;

        // Limit per user per run
        const toScore = matchedJobs.slice(0, MAX_MATCHES_PER_USER);

        // Check for existing pending_applications to avoid duplicates
        const jobIds = toScore.map((j: Record<string, unknown>) => j.greenhouse_id);
        const { data: existing } = await sb
          .from("pending_applications")
          .select("job_id")
          .eq("user_id", user.user_id)
          .in("job_id", jobIds);

        const existingIds = new Set((existing || []).map((e: Record<string, unknown>) => e.job_id));
        const newMatches = toScore.filter((j: Record<string, unknown>) => !existingIds.has(j.greenhouse_id));

        if (newMatches.length === 0) continue;

        // Score each match
        // TODO: Read user threshold from user_data; fallback to default
        const threshold = DEFAULT_THRESHOLD;

        for (const job of newMatches) {
          try {
            // SPEC-COHORT-001-S2: Passive cap check
            const cap = await passiveCap(sb, user.user_id, 'auto-apply-trigger');
            if (!cap.allowed) {
              logger.warn('auto-apply daily cap reached', { userId: user.user_id, cap: cap.dailyCap });
              break;
            }
            // BP-001: Circuit breaker
            const _br = await withAnthropicBreaker(sb, 'auto-apply-trigger', () =>
              quickScore(
                resumeText,
                job.title,
                job.content || "",
                job.company_name || ""
              )
            );
            if (_br.circuitOpen) {
              logger.warn("Circuit breaker open — skipping remaining scores", { userId: user.user_id, remaining: newMatches.length - stats.scored });
              break;
            }
            const scoreResult = _br.result || null;
            stats.scored++;

            if (!scoreResult) continue;

            if (scoreResult.score >= threshold) {
              const expiresAt = new Date(Date.now() + MATCH_EXPIRES_HOURS * 60 * 60 * 1000);

              const { error: insertErr } = await sb
                .from("pending_applications")
                .insert({
                  user_id: user.user_id,
                  job_id: job.greenhouse_id,
                  filter_id: job.filter_id,
                  resume_id: user.resume?.id || null,
                  original_score: scoreResult.score,
                  score_result: scoreResult,
                  status: "pending",
                  approval_mode: "auto_with_approval", // Safe default: user reviews before submit
                  job_title: job.title,
                  company_name: job.company_name || "",
                  job_url: job.url || "",
                  expires_at: expiresAt.toISOString(),
                  idempotency_key: `auto-${user.user_id}-${job.greenhouse_id}`,
                });

              if (insertErr) {
                // Idempotency key conflict = already queued, skip
                if (insertErr.code === "23505") continue;
                log.warn("Insert failed", { error: insertErr.message, job: job.greenhouse_id });
                stats.errors++;
              } else {
                stats.queued++;
                log.info(`Queued: ${job.title} (score ${scoreResult.score}) for user ${user.user_id.slice(0, 8)}`);
              }
            }
          } catch (e) {
            stats.errors++;
            log.warn("Score/queue error", { error: (e as Error).message });
          }

          // Rate limit: 200ms between AI calls
          await new Promise((r) => setTimeout(r, 200));
        }
      } catch (e) {
        stats.errors++;
        log.warn("User processing error", { user: user.user_id, error: (e as Error).message });
      }
    }

    // 4. Log run to audit
    await sb.from("audit_log").insert({
      action: "auto_apply_trigger",
      details: JSON.stringify(stats),
    });

    const ms = Date.now() - startTime;
    log.info("Auto-apply trigger complete", { ...stats, ms });

    return new Response(JSON.stringify({ ok: true, stats, ms }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error).message;
    log.error("Auto-apply trigger failed", { error: msg });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
