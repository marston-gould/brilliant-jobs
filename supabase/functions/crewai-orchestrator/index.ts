/**
 * crewai-orchestrator — Edge Function
 * SA-010: CrewAI Agent Framework — Lifecycle Management
 * ADR-05: CrewAI Architecture
 *
 * Actions:
 *   ?action=run&agent=content-qa    — Trigger a specific agent
 *   ?action=status                  — Return all agent statuses
 *   ?action=toggle&agent=content-qa — Toggle agent kill switch
 *   ?action=history&agent=content-qa — Return agent action log
 *   ?action=override                — POST: Override an agent decision
 *
 * This EF is the central coordination point for all CrewAI agents.
 * Individual agent logic lives in dedicated EFs (crewai-content-qa, etc.)
 * which the orchestrator calls via the gateway.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';
import { requireAdmin, authErrorResponse } from '../_shared/admin-auth.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SB_URL, SB_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResp(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const logger = createLogger('crewai-orchestrator', crypto.randomUUID());
  const url = new URL(req.url);

  // Support both query params (gateway calls) and body params (sb.functions.invoke)
  let bodyParams: Record<string, string> = {};
  if (req.method === 'POST') {
    try {
      const cloned = req.clone();
      bodyParams = await cloned.json();
    } catch { /* not JSON, that's fine */ }
  }

  const action = url.searchParams.get('action') || bodyParams.action || 'status';
  const agentId = url.searchParams.get('agent') || bodyParams.agent || null;

  try {
    // ── Status: all agents ──
    if (action === 'status') {
      const { data, error } = await sb.from('v_agent_dashboard').select('*');
      if (error) throw error;
      return jsonResp({ ok: true, agents: data });
    }

    // ── Run: trigger a specific agent ──
    if (action === 'run') {
      if (!agentId) return jsonResp({ ok: false, error: 'Missing ?agent= parameter' }, 400);

      // Check agent exists and is enabled
      const { data: agent, error: agentErr } = await sb
        .from('agent_config')
        .select('*')
        .eq('id', agentId)
        .single();

      if (agentErr || !agent) {
        return jsonResp({ ok: false, error: `Agent not found: ${agentId}` }, 404);
      }

      if (!agent.enabled) {
        logger.warn(`Agent ${agentId} is disabled (kill switch active)`);
        return jsonResp({
          ok: false,
          error: `Agent ${agentId} is disabled. Enable via kill switch before running.`,
          kill_switch: true
        }, 403);
      }

      // Dispatch to agent-specific EF via gateway
      const agentEfMap: Record<string, string> = {
        'content-qa': 'crewai-content-qa',
        'pipeline-health': 'crewai-pipeline-health',   // SA-011: Agent 2
        'data-freshness': 'crewai-data-freshness',     // SA-011: Agent 3
        // Future agents register here:
        // 'cost-guardian': 'crewai-cost-guardian',       // SA-020
        // 'user-support': 'crewai-user-support',         // SA-020
        // 'referral-pipeline': 'crewai-referral-pipeline', // SA-021
      };

      const targetEf = agentEfMap[agentId];
      if (!targetEf) {
        return jsonResp({ ok: false, error: `No EF mapped for agent: ${agentId}` }, 400);
      }

      // Call agent EF via internal function invocation
      const startTime = Date.now();
      const { data: result, error: runErr } = await sb.functions.invoke(targetEf, {
        body: { triggered_by: 'orchestrator', agent_config: agent },
      });

      const durationMs = Date.now() - startTime;

      // Update agent run stats
      if (runErr) {
        await sb
          .from('agent_config')
          .update({
            last_run_at: new Date().toISOString(),
            last_error: runErr.message || String(runErr),
            error_count: agent.error_count + 1,
          })
          .eq('id', agentId);
        throw runErr;
      }

      await sb
        .from('agent_config')
        .update({
          last_run_at: new Date().toISOString(),
          run_count: agent.run_count + 1,
          last_error: null,
        })
        .eq('id', agentId);

      logger.info(`Agent ${agentId} run complete in ${durationMs}ms`);
      return jsonResp({ ok: true, agent: agentId, duration_ms: durationMs, result });
    }

    // ── Toggle: kill switch ──
    if (action === 'toggle') {
      // Require admin auth for kill switch changes
      try {
        await requireAdmin(req);
      } catch {
        return authErrorResponse();
      }

      if (!agentId) return jsonResp({ ok: false, error: 'Missing ?agent= parameter' }, 400);

      const { data: agent, error: fetchErr } = await sb
        .from('agent_config')
        .select('enabled, display_name')
        .eq('id', agentId)
        .single();

      if (fetchErr || !agent) {
        return jsonResp({ ok: false, error: `Agent not found: ${agentId}` }, 404);
      }

      const newState = !agent.enabled;
      const { error: updateErr } = await sb
        .from('agent_config')
        .update({ enabled: newState })
        .eq('id', agentId);

      if (updateErr) throw updateErr;

      logger.info(`Agent ${agentId} kill switch: ${agent.enabled} → ${newState}`);

      // Log the toggle as an action
      await sb.from('agent_action_log').insert({
        agent_id: agentId,
        action_type: newState ? 'enable' : 'disable',
        trust_level: 'admin',
        target: agentId,
        target_type: 'agent_config',
        result: { previous: agent.enabled, current: newState },
        confidence: 1.0,
        executed: true,
      });

      return jsonResp({
        ok: true,
        agent: agentId,
        display_name: agent.display_name,
        enabled: newState,
        message: `${agent.display_name} ${newState ? 'enabled' : 'disabled'}`
      });
    }

    // ── History: agent action log ──
    if (action === 'history') {
      const limit = parseInt(url.searchParams.get('limit') || '50');

      let query = sb
        .from('agent_action_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(Math.min(limit, 200));

      if (agentId) {
        query = query.eq('agent_id', agentId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return jsonResp({ ok: true, entries: data, count: data?.length || 0 });
    }

    // ── Override: human overrides an agent decision ──
    if (action === 'override' && req.method === 'POST') {
      let authResult;
      try {
        authResult = await requireAdmin(req);
      } catch {
        return authErrorResponse();
      }

      const body = await req.json();
      const { action_log_id, override_reason } = body;

      if (!action_log_id) {
        return jsonResp({ ok: false, error: 'Missing action_log_id' }, 400);
      }

      const { error: updateErr } = await sb
        .from('agent_action_log')
        .update({
          override_by: authResult.userId || null,
          override_at: new Date().toISOString(),
          override_reason: override_reason || 'Manual override',
        })
        .eq('id', action_log_id);

      if (updateErr) throw updateErr;

      logger.info(`Action ${action_log_id} overridden by admin`);
      return jsonResp({ ok: true, action_log_id, overridden: true });
    }

    return jsonResp({
      ok: false,
      error: `Unknown action: ${action}. Use: status, run, toggle, history, override`
    }, 400);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Orchestrator error: ${msg}`);
    return jsonResp({ ok: false, error: msg }, 500);
  }
});
