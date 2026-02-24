// confirm-pipeline-signal Edge Function (Phase A/B)
// ROLE: user-action
// Called by frontend when user acts on a pipeline signal.
// Actions: confirm, correct (different stage), dismiss, snooze (no update yet)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST" },
    });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const body = await req.json();
    const { signal_id, action, corrected_stage } = body;
    // action: "confirm" | "correct" | "dismiss" | "snooze"

    if (!signal_id || !action) {
      return new Response(JSON.stringify({ error: "signal_id and action required" }), { status: 400 });
    }

    // Fetch the signal (verify ownership)
    const { data: signal, error: sigErr } = await sb
      .from("pipeline_signals")
      .select("*, user_pipeline!pipeline_signals_pipeline_entry_id_fkey(id, stage)")
      .eq("id", signal_id)
      .eq("user_id", user.id)
      .single();

    if (sigErr || !signal) {
      return new Response(JSON.stringify({ error: "Signal not found" }), { status: 404 });
    }

    const now = new Date().toISOString();

    if (action === "confirm") {
      // Move pipeline entry to proposed stage
      if (signal.proposed_stage && signal.pipeline_entry_id) {
        const stageTimestampCol = signal.proposed_stage + "_at";
        const updateData: Record<string, any> = {
          stage: signal.proposed_stage,
          stage_changed_at: now,
        };
        // Set the stage-specific timestamp if column exists
        if (["applied", "responded", "interview", "offer", "rejected", "hired", "archived"].includes(signal.proposed_stage)) {
          updateData[stageTimestampCol] = now;
        }
        await sb.from("user_pipeline").update(updateData).eq("id", signal.pipeline_entry_id);
      }

      await sb.from("pipeline_signals").update({
        status: "confirmed",
        resolved_at: now,
      }).eq("id", signal_id);

      // Update signal_patterns confidence (increment confirmations)
      await updatePatternConfidence(signal, true);

    } else if (action === "correct") {
      // User chose a different stage than proposed
      if (corrected_stage && signal.pipeline_entry_id) {
        const stageTimestampCol = corrected_stage + "_at";
        const updateData: Record<string, any> = {
          stage: corrected_stage,
          stage_changed_at: now,
        };
        if (["applied", "responded", "interview", "offer", "rejected", "hired", "archived"].includes(corrected_stage)) {
          updateData[stageTimestampCol] = now;
        }
        await sb.from("user_pipeline").update(updateData).eq("id", signal.pipeline_entry_id);
      }

      await sb.from("pipeline_signals").update({
        status: "confirmed",
        user_corrected_stage: corrected_stage,
        resolved_at: now,
      }).eq("id", signal_id);

      // Pattern still gets partial credit if it was in the right direction
      await updatePatternConfidence(signal, true);

    } else if (action === "dismiss") {
      await sb.from("pipeline_signals").update({
        status: "dismissed",
        resolved_at: now,
      }).eq("id", signal_id);

      // Decrease pattern confidence
      await updatePatternConfidence(signal, false);

    } else if (action === "snooze") {
      // "No update yet" — reset the prompt timer, mark signal expired
      await sb.from("pipeline_signals").update({
        status: "expired",
        resolved_at: now,
      }).eq("id", signal_id);

      if (signal.pipeline_entry_id) {
        await sb.from("user_pipeline").update({
          last_prompted_at: now,
        }).eq("id", signal.pipeline_entry_id);
      }
    }

    return new Response(JSON.stringify({ ok: true, action }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    console.error("[confirm-pipeline-signal] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

async function updatePatternConfidence(signal: any, confirmed: boolean) {
  if (!signal.evidence_metadata) return;
  const meta = signal.evidence_metadata;

  // Find matching patterns and update their scores
  const patterns = [];
  if (meta.sender_domain) patterns.push({ type: "sender_domain", value: meta.sender_domain });
  if (meta.subject_keywords) {
    for (const kw of meta.subject_keywords) {
      patterns.push({ type: "subject_keyword", value: kw });
    }
  }
  if (meta.calendar_title) patterns.push({ type: "calendar_format", value: meta.calendar_title });

  for (const p of patterns) {
    const col = confirmed ? "confirmations" : "dismissals";
    // Upsert pattern: increment the right counter, recalculate confidence
    await sb.rpc("exec_sql", {
      query: `INSERT INTO signal_patterns (pattern_type, pattern_value, associated_signal_type, ${col}, confidence_score, last_seen_at)
              VALUES ('${p.type}', '${p.value.replace(/'/g, "''")}', '${signal.signal_type}', 1, ${confirmed ? 0.6 : 0.4}, now())
              ON CONFLICT (pattern_type, pattern_value, associated_signal_type)
              DO UPDATE SET ${col} = signal_patterns.${col} + 1,
                           confidence_score = (signal_patterns.confirmations${confirmed ? ' + 1' : ''})::float / GREATEST(signal_patterns.confirmations${confirmed ? ' + 1' : ''} + signal_patterns.dismissals${confirmed ? '' : ' + 1'}, 1)::float,
                           last_seen_at = now();`
    });
  }
}
