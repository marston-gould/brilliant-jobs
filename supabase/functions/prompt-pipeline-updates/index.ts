// prompt-pipeline-updates Edge Function (Phase A)
// ROLE: scheduled-worker
// Trigger: pg_cron — every hour
// Purpose: Check pipeline entries past their prompt cadence, create
//          time_based signals in pipeline_signals, notify via send-notification.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") || "https://brilliantjobs.app";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MAX_RUNTIME_MS = 120_000;
const startTime = Date.now();
function isOvertime(): boolean { return Date.now() - startTime > MAX_RUNTIME_MS; }

const TERMINAL_STAGES = new Set(["offer", "rejected", "archived", "hired"]);

// Default cadences (days) — overridden per-user from pipeline_tracking_settings
const DEFAULT_CADENCE: Record<string, number> = {
  saved: 3,
  applied: 7,
  posting_closed: 5,
  responded: 5,
  interview: 3,
};

// Prompt messages by stage
const PROMPT_MSG: Record<string, (company: string, days: number) => string> = {
  saved: (c, d) => `You saved a role at ${c} ${d} days ago. Have you applied yet?`,
  applied: (c, d) => `It's been ${d} days since you applied to ${c}. Any response?`,
  posting_closed: (c, d) => `The posting at ${c} closed ${d} days ago. Did you hear back?`,
  responded: (c, d) => `You heard back from ${c} ${d} days ago. Has an interview been scheduled?`,
  interview: (c, d) => `Your interview with ${c} was ${d} days ago. Any follow-up yet?`,
};

serve(async (req: Request) => {
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  console.log(`[prompt-pipeline] Starting. cid=${correlationId}`);

  try {
    // Get all users with smart_prompts_enabled
    // Users without a settings row get defaults (smart_prompts ON)
    const { data: allEntries, error: entryErr } = await sb
      .from("user_pipeline")
      .select("id, user_id, stage, stage_changed_at, saved_at, applied_at, responded_at, interview_at, company_name, tracking_mode, last_prompted_at, prompt_count, custom_reminder_at")
      .not("stage", "in", `(${Array.from(TERMINAL_STAGES).join(",")})`)
      .neq("tracking_mode", "muted");

    if (entryErr) {
      console.error("[prompt-pipeline] Query error:", entryErr);
      return new Response(JSON.stringify({ error: entryErr.message }), { status: 500 });
    }

    if (!allEntries?.length) {
      return new Response(JSON.stringify({ checked: 0, prompted: 0 }), { status: 200 });
    }

    // Batch-load user settings
    const userIds = [...new Set(allEntries.map(e => e.user_id))];
    const { data: settingsRows } = await sb
      .from("pipeline_tracking_settings")
      .select("*")
      .in("user_id", userIds);

    const settingsMap: Record<string, unknown> = {};
    (settingsRows || []).forEach(s => { settingsMap[s.user_id] = s; });

    const now = Date.now();
    let prompted = 0;
    let skipped = 0;

    for (const entry of allEntries) {
      if (isOvertime()) {
        console.warn(`[prompt-pipeline] Wall-time safety at ${prompted + skipped}/${allEntries.length}`);
        break;
      }

      const settings = settingsMap[entry.user_id] || {};
      if (settings.smart_prompts_enabled === false) { skipped++; continue; }

      // Determine cadence for this stage
      const cadenceKey = `cadence_${entry.stage}_days`;
      const cadenceDays = (settings as any)[cadenceKey] || DEFAULT_CADENCE[entry.stage] || 7;

      // Check custom reminder override
      if (entry.custom_reminder_at) {
        const reminderTime = new Date(entry.custom_reminder_at).getTime();
        if (now < reminderTime) { skipped++; continue; }
      }

      // Calculate days since last stage change
      const stageDate = entry.stage_changed_at || entry.interview_at || entry.responded_at || entry.applied_at || entry.saved_at;
      if (!stageDate) { skipped++; continue; }
      const daysSinceChange = Math.floor((now - new Date(stageDate).getTime()) / 86400000);

      if (daysSinceChange < cadenceDays) { skipped++; continue; }

      // Check if already prompted recently (within cadence interval)
      if (entry.last_prompted_at) {
        const daysSincePrompt = Math.floor((now - new Date(entry.last_prompted_at).getTime()) / 86400000);
        if (daysSincePrompt < cadenceDays) { skipped++; continue; }
      }

      // Check for existing pending signal on this entry
      const { data: existingSignal } = await sb
        .from("pipeline_signals")
        .select("id")
        .eq("pipeline_entry_id", entry.id)
        .eq("status", "pending_confirmation")
        .eq("signal_source", "time_based")
        .limit(1);

      if (existingSignal?.length) { skipped++; continue; }

      // Create the time_based signal
      const company = entry.company_name || "this company";
      const msgFn = PROMPT_MSG[entry.stage];
      const preview = msgFn ? msgFn(company, daysSinceChange) : `${company}: ${daysSinceChange} days in ${entry.stage} stage`;

      const { error: insertErr } = await sb
        .from("pipeline_signals")
        .insert({
          user_id: entry.user_id,
          pipeline_entry_id: entry.id,
          signal_source: "time_based",
          signal_type: "prompt_due",
          proposed_stage: null,
          confidence: 1.0,
          evidence_preview: preview,
          evidence_metadata: { days_in_stage: daysSinceChange, cadence_days: cadenceDays, stage: entry.stage },
          status: "pending_confirmation",
        });

      if (insertErr) {
        console.warn(`[prompt-pipeline] Insert error for ${entry.id}:`, insertErr);
        skipped++;
        continue;
      }

      // Update last_prompted_at and increment prompt_count
      await sb.from("user_pipeline").update({
        last_prompted_at: new Date().toISOString(),
        prompt_count: (entry.prompt_count || 0) + 1,
      }).eq("id", entry.id);

      // Send notification if user has email or in_app in prompt_channels
      const channels = settings.prompt_channels || ["email", "in_app"];
      if (channels.includes("email") || channels.includes("in_app")) {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              user_id: entry.user_id,
              notification_type: "pipeline_prompt",
              subject: `Pipeline update: ${company}`,
              text: preview,
              html: `<p style="font-family:Outfit,sans-serif;color:#f0f1f3;">${preview}</p><a href="${SITE_URL}/dashboard#applications" style="color:#3b82f6;">Update your pipeline</a>`,
              force_channel: channels.includes("email") ? "email" : undefined,
              payload: { pipeline_entry_id: entry.id, stage: entry.stage },
            }),
          });
        } catch (e) {
          console.warn(`[prompt-pipeline] Notification failed for ${entry.user_id}:`, e);
        }
      }

      prompted++;
      await new Promise(r => setTimeout(r, 50));
    }

    console.log(`[prompt-pipeline] Done. prompted=${prompted} skipped=${skipped} total=${allEntries.length}`);
    return new Response(JSON.stringify({ checked: allEntries.length, prompted, skipped }), {
      status: 200,
      headers: { "Content-Type": "application/json", "x-correlation-id": correlationId },
    });
  } catch (err) {
    console.error("[prompt-pipeline] Unexpected:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
