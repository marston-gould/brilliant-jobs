/**
 * crewai-graduation — Edge Function
 * SA-012: Agent Graduation Framework
 * ADR-05: CrewAI Architecture
 *
 * Actions:
 *   ?action=evaluate                — Evaluate all agents' graduation readiness
 *   ?action=evaluate&agent=X        — Evaluate a specific agent
 *   ?action=graduate&agent=X        — Graduate agent to next trust level (admin only)
 *   ?action=rollback&agent=X        — Rollback agent to previous trust level (admin only)
 *   ?action=rollback&agent=X&to=observe — Rollback to a specific level
 *   ?action=history                 — Graduation history log
 *   ?action=criteria&agent=X        — View/update graduation criteria (admin only)
 *
 * Graduation is NEVER automatic — agents become eligible, but Marston must
 * explicitly approve via the admin panel or this EF. The only exception
 * is emergency rollback, which the orchestrator can trigger on repeated errors.
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

const TRUST_LEVELS = ['observe', 'suggest', 'auto_with_approval', 'autonomous'] as const;
type TrustLevel = typeof TRUST_LEVELS[number];

function nextLevel(current: TrustLevel): TrustLevel | null {
  const idx = TRUST_LEVELS.indexOf(current);
  return idx >= 0 && idx < TRUST_LEVELS.length - 1 ? TRUST_LEVELS[idx + 1] : null;
}

function prevLevel(current: TrustLevel): TrustLevel | null {
  const idx = TRUST_LEVELS.indexOf(current);
  return idx > 0 ? TRUST_LEVELS[idx - 1] : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const logger = createLogger('crewai-graduation', crypto.randomUUID());
  const url = new URL(req.url);

  // Support both query params (gateway) and body params (sb.functions.invoke)
  let bodyParams: Record<string, string> = {};
  if (req.method === 'POST') {
    try {
      const cloned = req.clone();
      bodyParams = await cloned.json();
    } catch { /* not JSON */ }
  }

  const action = url.searchParams.get('action') || bodyParams.action || 'evaluate';
  const agentId = url.searchParams.get('agent') || bodyParams.agent || null;

  try {
    // ── Evaluate: check graduation readiness ──
    if (action === 'evaluate') {
      const { data, error } = agentId
        ? await sb.rpc('fn_evaluate_agent_graduation', { p_agent_id: agentId })
        : await sb.rpc('fn_evaluate_agent_graduation', { p_agent_id: null });

      if (error) throw error;
      return jsonResp({ ok: true, evaluations: data });
    }

    // ── Graduate: promote agent to next trust level ──
    if (action === 'graduate') {
      try { await requireAdmin(req); } catch { return authErrorResponse(); }

      if (!agentId) return jsonResp({ ok: false, error: 'Missing ?agent= parameter' }, 400);

      // Fetch current agent state
      const { data: agent, error: agentErr } = await sb
        .from('agent_config')
        .select('*')
        .eq('id', agentId)
        .single();

      if (agentErr || !agent) {
        return jsonResp({ ok: false, error: `Agent not found: ${agentId}` }, 404);
      }

      const currentLevel = agent.trust_level as TrustLevel;
      const targetLevel = nextLevel(currentLevel);

      if (!targetLevel) {
        return jsonResp({
          ok: false,
          error: `Agent ${agentId} is already at maximum trust level (${currentLevel})`,
        }, 400);
      }

      // Evaluate readiness first
      const { data: evalData, error: evalErr } = await sb.rpc(
        'fn_evaluate_agent_graduation', { p_agent_id: agentId }
      );
      if (evalErr) throw evalErr;

      const evaluation = evalData?.[0];
      const forceGraduate = bodyParams.force === 'true' || url.searchParams.get('force') === 'true';

      // Warn if not eligible (but allow force-graduate for Marston)
      if (evaluation && !evaluation.eligible && !forceGraduate) {
        return jsonResp({
          ok: false,
          error: 'Agent does not meet graduation criteria',
          blockers: evaluation.blockers,
          hint: 'Add ?force=true to override (requires Marston approval)',
        }, 422);
      }

      // Perform graduation
      const { error: updateErr } = await sb
        .from('agent_config')
        .update({
          trust_level: targetLevel,
          graduated_at: new Date().toISOString(),
        })
        .eq('id', agentId);

      if (updateErr) throw updateErr;

      // Log the graduation event
      const gradEntry = {
        agent_id: agentId,
        from_level: currentLevel,
        to_level: targetLevel,
        reason: forceGraduate ? 'manual_graduation_forced' : 'manual_graduation',
        evaluation: evaluation || {},
        initiated_by: 'admin',
      };

      await sb.from('agent_graduation_log').insert(gradEntry);

      // Also log to agent_action_log for unified timeline
      await sb.from('agent_action_log').insert({
        agent_id: agentId,
        action_type: 'graduation',
        trust_level: targetLevel,
        target: agentId,
        target_type: 'agent_config',
        result: {
          from: currentLevel,
          to: targetLevel,
          forced: forceGraduate,
          evaluation: evaluation || {},
        },
        confidence: 1.0,
        executed: true,
      });

      logger.info(`Agent ${agentId} graduated: ${currentLevel} → ${targetLevel}`);

      return jsonResp({
        ok: true,
        agent: agentId,
        from_level: currentLevel,
        to_level: targetLevel,
        forced: forceGraduate,
        message: `${agent.display_name} graduated from ${currentLevel} to ${targetLevel}`,
      });
    }

    // ── Rollback: demote agent trust level ──
    if (action === 'rollback') {
      try { await requireAdmin(req); } catch { return authErrorResponse(); }

      if (!agentId) return jsonResp({ ok: false, error: 'Missing ?agent= parameter' }, 400);

      const { data: agent, error: agentErr } = await sb
        .from('agent_config')
        .select('*')
        .eq('id', agentId)
        .single();

      if (agentErr || !agent) {
        return jsonResp({ ok: false, error: `Agent not found: ${agentId}` }, 404);
      }

      const currentLevel = agent.trust_level as TrustLevel;
      const requestedTarget = (url.searchParams.get('to') || bodyParams.to || null) as TrustLevel | null;

      // If a specific target level is specified, validate it
      let targetLevel: TrustLevel;
      if (requestedTarget) {
        if (!TRUST_LEVELS.includes(requestedTarget)) {
          return jsonResp({ ok: false, error: `Invalid trust level: ${requestedTarget}` }, 400);
        }
        if (TRUST_LEVELS.indexOf(requestedTarget) >= TRUST_LEVELS.indexOf(currentLevel)) {
          return jsonResp({
            ok: false,
            error: `Rollback target (${requestedTarget}) must be lower than current level (${currentLevel})`,
          }, 400);
        }
        targetLevel = requestedTarget;
      } else {
        const prev = prevLevel(currentLevel);
        if (!prev) {
          return jsonResp({
            ok: false,
            error: `Agent ${agentId} is already at minimum trust level (observe)`,
          }, 400);
        }
        targetLevel = prev;
      }

      const reason = bodyParams.reason || url.searchParams.get('reason') || 'manual_rollback';

      // Perform rollback
      const { error: updateErr } = await sb
        .from('agent_config')
        .update({
          trust_level: targetLevel,
          graduated_at: new Date().toISOString(), // Reset graduation clock
        })
        .eq('id', agentId);

      if (updateErr) throw updateErr;

      // Log rollback
      await sb.from('agent_graduation_log').insert({
        agent_id: agentId,
        from_level: currentLevel,
        to_level: targetLevel,
        reason: reason,
        evaluation: { rollback: true, original_request: bodyParams },
        initiated_by: 'admin',
      });

      await sb.from('agent_action_log').insert({
        agent_id: agentId,
        action_type: 'rollback',
        trust_level: targetLevel,
        target: agentId,
        target_type: 'agent_config',
        result: { from: currentLevel, to: targetLevel, reason },
        confidence: 1.0,
        executed: true,
      });

      logger.info(`Agent ${agentId} rolled back: ${currentLevel} → ${targetLevel}`);

      return jsonResp({
        ok: true,
        agent: agentId,
        from_level: currentLevel,
        to_level: targetLevel,
        reason,
        message: `${agent.display_name} rolled back from ${currentLevel} to ${targetLevel}`,
      });
    }

    // ── History: graduation log ──
    if (action === 'history') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);

      let query = sb
        .from('agent_graduation_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (agentId) query = query.eq('agent_id', agentId);

      const { data, error } = await query;
      if (error) throw error;
      return jsonResp({ ok: true, entries: data, count: data?.length || 0 });
    }

    // ── Criteria: view/update graduation criteria ──
    if (action === 'criteria') {
      if (!agentId) return jsonResp({ ok: false, error: 'Missing ?agent= parameter' }, 400);

      // GET: return current criteria
      if (req.method === 'GET' || !bodyParams.criteria) {
        const { data, error } = await sb
          .from('agent_config')
          .select('id, display_name, trust_level, graduation_criteria')
          .eq('id', agentId)
          .single();

        if (error) throw error;
        return jsonResp({ ok: true, agent: data });
      }

      // POST: update criteria (admin only)
      try { await requireAdmin(req); } catch { return authErrorResponse(); }

      const { error: updateErr } = await sb
        .from('agent_config')
        .update({ graduation_criteria: bodyParams.criteria })
        .eq('id', agentId);

      if (updateErr) throw updateErr;

      logger.info(`Graduation criteria updated for ${agentId}`);
      return jsonResp({ ok: true, agent: agentId, message: 'Graduation criteria updated' });
    }

    return jsonResp({
      ok: false,
      error: `Unknown action: ${action}. Use: evaluate, graduate, rollback, history, criteria`,
    }, 400);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Graduation error: ${msg}`);
    return jsonResp({ ok: false, error: msg }, 500);
  }
});
