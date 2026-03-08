/**
 * POC-05: Uptime Monitor Agent — H-07 Validation
 *
 * HOOK EXERCISED: H-07 (fn_agent_summary() RPC Pattern)
 * PURPOSE: Proves a new CrewAI agent can be added using the established
 *          agent framework (agent_config, agent_credentials, fn_summary RPC,
 *          observe-mode cron, admin panel integration) without modifying the
 *          orchestrator or any existing agent code.
 *
 * ACTIVATION: Deploy migration, create EF, add gateway route, update admin panel.
 *             All steps follow Template 1 from hook-scar-integration-templates.md.
 *
 * SESSION: SA-029 (Hook Prototyping + Evolvability Baseline)
 * STATUS: POC — not deployed. Validates H-07 + CrewAI agent contract.
 */

// ─── Migration: v6.34-crewai-uptime-monitor.sql ─────────────────────────────

const MIGRATION_SQL = `
-- Agent: uptime-monitor
-- Purpose: Monitors external endpoint availability and response times
-- Session: SA-029 POC-05

-- Agent config (observe mode — NEVER executed: true until Marston graduation)
INSERT INTO agent_config (agent_name, agent_type, status, schedule, executed, config)
VALUES (
  'uptime-monitor',
  'monitor',
  'active',
  '*/5 * * * *',  -- every 5 minutes
  false,           -- observe mode: report only, never act
  '{
    "endpoints": [
      {"name": "dashboard", "url": "https://brilliantjobs.app/dashboard", "timeout_ms": 5000},
      {"name": "landing", "url": "https://brilliantjobs.app", "timeout_ms": 3000},
      {"name": "api-gateway", "url": "https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/api-gateway?route=health-check", "timeout_ms": 3000},
      {"name": "extension-heartbeat", "url": "https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/api-gateway?route=extension-heartbeat", "timeout_ms": 3000}
    ],
    "alert_after_failures": 3,
    "check_window_hours": 1
  }'::JSONB
) ON CONFLICT (agent_name) DO NOTHING;

-- API consumer
INSERT INTO api_consumers (consumer_name, consumer_type, rate_limit_per_minute)
VALUES ('uptime-monitor', 'crewai_agent', 60)
ON CONFLICT (consumer_name) DO NOTHING;

-- Link credentials
INSERT INTO agent_credentials (agent_name, consumer_id)
SELECT 'uptime-monitor', id FROM api_consumers WHERE consumer_name = 'uptime-monitor'
ON CONFLICT DO NOTHING;

-- Summary RPC (H-07 pattern)
CREATE OR REPLACE FUNCTION fn_uptime_monitor_summary()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'agent', 'uptime-monitor',
    'checked_at', now(),
    'status', CASE
      WHEN (SELECT count(*) FROM agent_action_log
            WHERE agent_name = 'uptime-monitor'
            AND action_type = 'check'
            AND result->>'status' = 'down'
            AND created_at > now() - interval '1 hour') > 0
      THEN 'warning'
      ELSE 'ok'
    END,
    'endpoints', (
      SELECT jsonb_agg(jsonb_build_object(
        'name', result->>'endpoint_name',
        'status', result->>'status',
        'response_ms', (result->>'response_ms')::int,
        'checked_at', created_at
      ) ORDER BY created_at DESC)
      FROM (
        SELECT DISTINCT ON (result->>'endpoint_name')
          result, created_at
        FROM agent_action_log
        WHERE agent_name = 'uptime-monitor'
        AND action_type = 'check'
        ORDER BY result->>'endpoint_name', created_at DESC
      ) latest
    ),
    'uptime_1h', (
      SELECT round(
        (count(*) FILTER (WHERE result->>'status' = 'up')::numeric /
         NULLIF(count(*), 0)::numeric) * 100, 2
      )
      FROM agent_action_log
      WHERE agent_name = 'uptime-monitor'
      AND action_type = 'check'
      AND created_at > now() - interval '1 hour'
    )
  ) INTO result;
  RETURN result;
END;
$$;

-- pg_cron schedule
SELECT cron.schedule(
  'uptime-monitor-check',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/api-gateway',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-API-Key', (SELECT api_key FROM api_consumers WHERE consumer_name = 'uptime-monitor')
    ),
    body := '{"route":"crewai-uptime-monitor","action":"check"}'::jsonb
  )$$
);

-- Log migration event
INSERT INTO agent_action_log (agent_name, action_type, result)
VALUES ('uptime-monitor', 'migration', '{"event": "poc_created", "session": "SA-029"}'::JSONB);
`;

// ─── Edge Function: crewai-uptime-monitor/index.ts ───────────────────────────

const EDGE_FUNCTION_SKELETON = `
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getErrorMessage } from "../_shared/types.ts";

serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { action } = await req.json();

  // Load agent config
  const { data: config } = await supabase
    .from("agent_config")
    .select("*")
    .eq("agent_name", "uptime-monitor")
    .single();

  if (!config || config.status !== "active") {
    return new Response(JSON.stringify({ status: "inactive" }), { status: 200 });
  }

  const endpoints = config.config?.endpoints ?? [];

  if (action === "check") {
    const results = [];
    for (const ep of endpoints) {
      const start = performance.now();
      let status = "up";
      let responseMs = 0;
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), ep.timeout_ms);
        const res = await fetch(ep.url, { signal: ctrl.signal });
        clearTimeout(timeout);
        responseMs = Math.round(performance.now() - start);
        if (!res.ok) status = "degraded";
      } catch {
        status = "down";
        responseMs = Math.round(performance.now() - start);
      }

      // Log check result (observe mode — never takes action)
      await supabase.from("agent_action_log").insert({
        agent_name: "uptime-monitor",
        action_type: "check",
        result: {
          endpoint_name: ep.name,
          url: ep.url,
          status,
          response_ms: responseMs,
          threshold_ms: ep.timeout_ms,
        },
      });

      results.push({ name: ep.name, status, response_ms: responseMs });
    }

    // Publish event if any endpoint is down (H-02)
    const downEndpoints = results.filter(r => r.status === "down");
    if (downEndpoints.length > 0 && !config.executed) {
      // Observe mode: log but do NOT publish to event bus
      // When graduated (executed: true), this would call fn_publish_event()
    }

    return new Response(JSON.stringify({ action: "check", results }), { status: 200 });
  }

  if (action === "status") {
    const { data } = await supabase.rpc("fn_uptime_monitor_summary");
    return new Response(JSON.stringify(data), { status: 200 });
  }

  return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400 });
});
`;

// ─── Admin Panel Integration ─────────────────────────────────────────────────
//
// In js/admin-crewai.js, add:
//
//   async function refreshUptimeMonitor() {
//     const data = await callGateway('crewai-uptime-monitor', 'status');
//     // Render endpoint status cards with green/yellow/red indicators
//     // Show 1h uptime percentage
//     // Show per-endpoint response time trend
//   }
//
// The admin-crewai.js panel auto-discovers agents via the agent_config table.
// No orchestrator changes needed.

/**
 * HOOK VALIDATION CHECKLIST:
 * ✅ H-07: fn_uptime_monitor_summary() RPC follows the established pattern
 * ✅ Agent config row with observe mode (executed: false) — FF-05 guards this
 * ✅ API consumer + agent credentials registered
 * ✅ pg_cron schedule via gateway (standard agent pattern)
 * ✅ agent_action_log used for all check results
 * ✅ Admin panel integration via admin-crewai.js (existing pattern)
 * ✅ H-02 (fn_publish_event) ready for graduation — commented in observe mode
 * ✅ No orchestrator or existing agent code modified
 *
 * SCARS LEVERAGED:
 * - S-16 (GRADUATED_AGENTS) — when graduated, add to FF-05 list
 * - S-11 (agent_suggested_response) — could extend for alert notifications
 * - S-12 (custom_metrics JSONB) — uptime data could feed capacity_snapshots
 */

export { MIGRATION_SQL, EDGE_FUNCTION_SKELETON };

