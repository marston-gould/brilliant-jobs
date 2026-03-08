// confirm-pipeline-signal Edge Function v2 (Phase C)
// ROLE: user-action
// Called by frontend when user acts on a pipeline signal.
// Actions: confirm, correct (different stage), dismiss, snooze (no update yet)
// Cross-user learning: updates signal_patterns table so all users benefit.

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
      .select("*")
      .eq("id", signal_id)
      .eq("user_id", user.id)
      .single();

    if (sigErr || !signal) {
      return new Response(JSON.stringify({ error: "Signal not found" }), { status: 404 });
    }

    const now = new Date().toISOString();
    const stageOrder = ["saved", "applied", "responded", "interview", "offer", "rejected", "hired", "archived"];

    if (action === "confirm") {
      // Move pipeline entry to proposed stage
      if (signal.proposed_stage && signal.pipeline_entry_id) {
        const updateData: Record<string, unknown> = {
          stage: signal.proposed_stage,
          stage_changed_at: now,
        };
        const stageTimestampCol = signal.proposed_stage + "_at";
        if (stageOrder.includes(signal.proposed_stage)) {
          updateData[stageTimestampCol] = now;
        }
        await sb.from("user_pipeline").update(updateData).eq("id", signal.pipeline_entry_id);
      }

      await sb.from("pipeline_signals").update({
        status: "confirmed",
        resolved_at: now,
      }).eq("id", signal_id);

      // Cross-user learning: increment confirmations on matching patterns
      await updatePatternConfidence(signal, true);

    } else if (action === "correct") {
      // User chose a different stage than proposed
      if (corrected_stage && signal.pipeline_entry_id) {
        const updateData: Record<string, unknown> = {
          stage: corrected_stage,
          stage_changed_at: now,
        };
        const stageTimestampCol = corrected_stage + "_at";
        if (stageOrder.includes(corrected_stage)) {
          updateData[stageTimestampCol] = now;
        }
        await sb.from("user_pipeline").update(updateData).eq("id", signal.pipeline_entry_id);
      }

      await sb.from("pipeline_signals").update({
        status: "confirmed",
        user_corrected_stage: corrected_stage,
        resolved_at: now,
      }).eq("id", signal_id);

      // Still counts as partial confirmation (right signal, just wrong stage)
      await updatePatternConfidence(signal, true);

    } else if (action === "dismiss") {
      await sb.from("pipeline_signals").update({
        status: "dismissed",
        resolved_at: now,
      }).eq("id", signal_id);

      // Cross-user learning: increment dismissals on matching patterns
      await updatePatternConfidence(signal, false);

    } else if (action === "snooze") {
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

// ── Cross-user learning ─────────────────────────────────────────
// When a user confirms or dismisses a signal, update the signal_patterns
// table so that future detection for ALL users improves.
async function updatePatternConfidence(signal: unknown, confirmed: boolean) {
  if (!signal.evidence_metadata) return;
  const meta = signal.evidence_metadata;

  const patternsToUpdate: { type: string; value: string }[] = [];

  // Calendar signals → update calendar_format patterns
  if (signal.signal_source === "calendar" && meta.matched_pattern) {
    patternsToUpdate.push({ type: "calendar_format", value: meta.matched_pattern });
  }
  if (signal.signal_source === "calendar" && meta.calendar_title) {
    // Also try to learn new calendar patterns from the full title
    patternsToUpdate.push({ type: "calendar_format", value: meta.calendar_title });
  }

  // Email signals → update sender_domain and subject_keyword patterns
  if (meta.sender_domain) {
    patternsToUpdate.push({ type: "sender_domain", value: meta.sender_domain });
  }
  if (meta.subject_keywords && Array.isArray(meta.subject_keywords)) {
    for (const kw of meta.subject_keywords) {
      patternsToUpdate.push({ type: "subject_keyword", value: kw });
    }
  }

  for (const p of patternsToUpdate) {
    try {
      // Try to find existing pattern
      const { data: existing } = await sb
        .from("signal_patterns")
        .select("id, confirmations, dismissals")
        .eq("pattern_type", p.type)
        .eq("pattern_value", p.value)
        .eq("associated_signal_type", signal.signal_type || "interview_invite")
        .single();

      if (existing) {
        // Update existing pattern
        const newConf = existing.confirmations + (confirmed ? 1 : 0);
        const newDis = existing.dismissals + (confirmed ? 0 : 1);
        const total = newConf + newDis;
        const newScore = total > 0 ? newConf / total : 0.5;

        await sb.from("signal_patterns").update({
          confirmations: newConf,
          dismissals: newDis,
          confidence_score: Math.round(newScore * 100) / 100,
          last_seen_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        // Insert new pattern (learned from user behavior)
        await sb.from("signal_patterns").insert({
          pattern_type: p.type,
          pattern_value: p.value,
          associated_signal_type: signal.signal_type || "interview_invite",
          confirmations: confirmed ? 1 : 0,
          dismissals: confirmed ? 0 : 1,
          confidence_score: confirmed ? 0.6 : 0.4,
          last_seen_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn(`[confirm-pipeline-signal] Pattern update failed for ${p.type}:${p.value}:`, e);
    }
  }
}
