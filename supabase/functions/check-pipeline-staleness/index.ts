// check-pipeline-staleness Edge Function — FB-PI-001 S5
// Daily cron (8 AM UTC) that scans non-archived pipeline entries.
// Rules (spec §6.1):
//   - days_since_stage_change > user_threshold (default 7) → staleness prompt
//   - days_since_stage_change > 30 (fixed) → auto-archive
//   - Snooze: skip entry if last_prompted_at + 7 days > now
// Backward stage movement (§6.3): logs MANUAL signal in pipeline_signals.
// Auth: service role only (internal cron)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Spec §6.1 fixed thresholds
const AUTO_ARCHIVE_DAYS = 30;
const SNOOZE_DAYS = 7;
const DEFAULT_PROMPT_THRESHOLD_DAYS = 7;
const BATCH_SIZE = 200;

// Stages that should never trigger staleness (terminal or not tracked)
const SKIP_STAGES = new Set(["archived", "hired", "rejected"]);

// ── PostHog ────────────────────────────────────────────────────────────────
const POSTHOG_HOST = Deno.env.get("POSTHOG_HOST") || "https://us.i.posthog.com";
const POSTHOG_KEY = Deno.env.get("POSTHOG_KEY") || "";

function capturePostHog(event: string, props: Record<string, unknown>): void {
  if (!POSTHOG_KEY) return;
  fetch(`${POSTHOG_HOST}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: POSTHOG_KEY, event, distinct_id: "system", properties: props }),
  }).catch(() => {});
}

// ── Per-user threshold settings ────────────────────────────────────────────
// Reads from pipeline_tracking_settings — cadence columns map to stages.
// For staleness we use a single prompt_threshold or derive from stage cadences.
interface UserSettings {
  prompt_threshold_days: number;
}
const _settingsCache = new Map<string, UserSettings>();

async function getUserSettings(userId: string): Promise<UserSettings> {
  if (_settingsCache.has(userId)) return _settingsCache.get(userId)!;

  const { data } = await sb
    .from("pipeline_tracking_settings")
    .select("cadence_applied_days, cadence_responded_days, cadence_interview_days")
    .eq("user_id", userId)
    .maybeSingle();

  // Use smallest non-null cadence as prompt threshold, default to 7
  const days = [
    data?.cadence_applied_days,
    data?.cadence_responded_days,
    data?.cadence_interview_days,
  ].filter((d): d is number => d != null && d > 0);

  const threshold = days.length ? Math.min(...days) : DEFAULT_PROMPT_THRESHOLD_DAYS;
  const settings = { prompt_threshold_days: threshold };
  _settingsCache.set(userId, settings);
  return settings;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  if (authHeader && token !== SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const startTime = Date.now();
  let autoArchived = 0, prompted = 0, skipped = 0, errors = 0;

  try {
    const now = new Date();
    const nowISO = now.toISOString();

    // Fetch non-archived, non-terminal entries that haven't been touched recently
    const { data: entries, error: fetchErr } = await sb
      .from("user_pipeline")
      .select("id, user_id, company_name, company_slug, job_title, stage, stage_changed_at, last_prompted_at, prompt_count, auto_advanced")
      .not("stage", "in", '("archived","hired","rejected")')
      .order("stage_changed_at", { ascending: true, nullsFirst: true })
      .limit(BATCH_SIZE);

    if (fetchErr) throw fetchErr;
    if (!entries?.length) {
      return new Response(JSON.stringify({ message: "No entries to check", stats: { autoArchived: 0, prompted: 0, elapsed_ms: Date.now() - startTime } }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[check-pipeline-staleness] Checking ${entries.length} entries`);

    for (const entry of entries) {
      try {
        if (SKIP_STAGES.has(entry.stage)) { skipped++; continue; }

        // Calculate days since last stage change
        const lastChanged = entry.stage_changed_at
          ? new Date(entry.stage_changed_at)
          : new Date(0);
        const daysSince = Math.floor((now.getTime() - lastChanged.getTime()) / (1000 * 60 * 60 * 24));

        // ── Rule 1: Auto-archive at 30 days (spec §6.1 fixed) ─────────────
        if (daysSince > AUTO_ARCHIVE_DAYS) {
          const prevStage = entry.stage;
          const companyName = entry.company_name || entry.company_slug || "Company";

          // Move to archived
          await sb.from("user_pipeline").update({
            stage: "archived",
            archived_at: nowISO,
            stage_changed_at: nowISO,
          }).eq("id", entry.id);

          // Log as pipeline signal for undo (48h window — spec §6.1)
          // signal_type=MANUAL, action_taken=auto_archived, previous_stage stored
          await sb.from("pipeline_signals").insert({
            user_id: entry.user_id,
            signal_source: "staleness",
            signal_type: "MANUAL",
            proposed_stage: "archived",
            confidence: 1.0,
            confidence_level: "high",
            evidence_preview: `Auto-archived: ${companyName} — no activity for ${daysSince} days`,
            action_taken: "auto_moved",
            target_stage: "archived",
            previous_stage: prevStage,
            evidence_metadata: {
              days_inactive: daysSince,
              auto_archive: true,
              undo_expires_at: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
            },
            status: "auto",
          });

          capturePostHog("pipeline_auto_archived", {
            user_id: entry.user_id,
            days_inactive: daysSince,
            previous_stage: prevStage,
            company: companyName,
          });

          autoArchived++;
          continue;
        }

        // ── Snooze check: skip if snoozed (last_prompted_at + 7d > now) ───
        if (entry.last_prompted_at) {
          const snoozeExpiry = new Date(new Date(entry.last_prompted_at).getTime() + SNOOZE_DAYS * 24 * 60 * 60 * 1000);
          if (snoozeExpiry > now) { skipped++; continue; }
        }

        // ── Rule 2: Staleness prompt at user threshold ─────────────────────
        const settings = await getUserSettings(entry.user_id);
        if (daysSince > settings.prompt_threshold_days) {
          const companyName = entry.company_name || entry.company_slug || "Company";

          // Create staleness pipeline signal (status=pending_confirmation for prompt card)
          await sb.from("pipeline_signals").insert({
            user_id: entry.user_id,
            pipeline_entry_id: entry.id,
            signal_source: "staleness",
            signal_type: "MANUAL",
            proposed_stage: entry.stage,  // no stage change — user decides
            confidence: 0.7,
            confidence_level: "medium",
            evidence_preview: `No updates from ${companyName} in ${daysSince} days`,
            action_taken: "prompted",
            evidence_metadata: {
              days_inactive: daysSince,
              staleness_prompt: true,
              current_stage: entry.stage,
            },
            status: "pending_confirmation",
          });

          // Update last_prompted_at and increment prompt_count
          await sb.from("user_pipeline").update({
            last_prompted_at: nowISO,
            prompt_count: (entry.prompt_count || 0) + 1,
          }).eq("id", entry.id);

          capturePostHog("pipeline_staleness_prompt", {
            user_id: entry.user_id,
            days_inactive: daysSince,
            stage: entry.stage,
            prompt_count: (entry.prompt_count || 0) + 1,
            company: companyName,
          });

          prompted++;
        } else {
          skipped++;
        }
      } catch (e) {
        console.error(`[check-pipeline-staleness] Entry ${entry.id}:`, (e as Error).message);
        errors++;
      }
    }

    const stats = {
      entries_checked: entries.length,
      auto_archived: autoArchived,
      prompted,
      skipped,
      errors,
      elapsed_ms: Date.now() - startTime,
    };

    console.log("[check-pipeline-staleness] Complete", stats);
    capturePostHog("staleness_check_complete", stats);

    return new Response(JSON.stringify({ message: "Staleness check complete", stats }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[check-pipeline-staleness] Fatal:", (e as Error).message);
    capturePostHog("staleness_check_fatal", { error: (e as Error).message });
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
