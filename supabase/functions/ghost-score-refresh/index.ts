// supabase/functions/ghost-score-refresh/index.ts
// FB-GHOST-BADGE-001: On-demand ghost score recalculation.
// Also scheduled via pg_cron every 6 hours.
// Calls fn_ghost_score_refresh() RPC + reports PostHog.
// Auth: service_role only.
// Gateway route #122 (FB-GHOST-BADGE-001).

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const POSTHOG_KEY               = Deno.env.get("POSTHOG_API_KEY") || "";
const POSTHOG_HOST              = Deno.env.get("POSTHOG_HOST") || "https://app.posthog.com";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  // Service role only
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.includes(SUPABASE_SERVICE_ROLE_KEY)) {
    return new Response(JSON.stringify({ error: "Service role required" }), { status: 401 });
  }

  try {
    // REM-S04: Snapshot tiers before refresh to detect escalation/de-escalation
    let oldTiers: Record<string, string> = {};
    try {
      const { data: oldScores } = await sb.from("ghost_company_scores")
        .select("company_name, tier");
      if (oldScores) {
        for (const row of oldScores) {
          oldTiers[row.company_name] = row.tier;
        }
      }
    } catch (_) { /* non-fatal — skip tier change detection */ }

    // Run recalculation
    const { data: result, error: rpcErr } = await sb.rpc("fn_ghost_score_refresh");

    if (rpcErr) {
      console.error("[ghost-score-refresh] RPC error:", rpcErr.message);
      return new Response(JSON.stringify({ error: rpcErr.message }), { status: 500 });
    }

    const row = Array.isArray(result) ? result[0] : result;
    const companiesUpdated = row?.companies_updated ?? 0;
    const tierDistribution = {
      low:    row?.tier_low    ?? 0,
      medium: row?.tier_medium ?? 0,
      high:   row?.tier_high   ?? 0,
    };

    // REM-S04: Detect tier changes and fire ghost_badge_tier_escalation
    let tierChanges: Array<{ company_name: string; old_tier: string; new_tier: string }> = [];
    try {
      const { data: newScores } = await sb.from("ghost_company_scores")
        .select("company_name, tier, effective_count");
      if (newScores) {
        for (const row of newScores) {
          const oldTier = oldTiers[row.company_name];
          if (oldTier && oldTier !== row.tier) {
            tierChanges.push({
              company_name: row.company_name,
              old_tier: oldTier,
              new_tier: row.tier,
            });
          }
        }
      }
    } catch (_) { /* non-fatal */ }

    // PostHog
    if (POSTHOG_KEY) {
      try {
        await fetch(`${POSTHOG_HOST}/capture/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key:     POSTHOG_KEY,
            distinct_id: "system",
            event:       "ghost_score_refresh",
            properties:  { companies_updated: companiesUpdated, tier_distribution: tierDistribution, tier_changes_count: tierChanges.length },
          }),
        });
      } catch (_) { /* fire-and-forget */ }

      // REM-S04: Fire individual tier escalation events
      for (const change of tierChanges) {
        try {
          await fetch(`${POSTHOG_HOST}/capture/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key:     POSTHOG_KEY,
              distinct_id: "system",
              event:       "ghost_badge_tier_escalation",
              properties:  {
                company_name: change.company_name,
                old_tier:     change.old_tier,
                new_tier:     change.new_tier,
              },
            }),
          });
        } catch (_) { /* fire-and-forget */ }
      }
    }

    return new Response(JSON.stringify({
      success:            true,
      companies_updated:  companiesUpdated,
      tier_distribution:  tierDistribution,
      tier_changes:       tierChanges.length,
    }), {
      status:  200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[ghost-score-refresh] Unexpected error:", String(err));
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
