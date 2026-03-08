/**
 * crewai-pipeline-health — Edge Function
 * SA-011: Pipeline Health Agent (Agent 2) — Observe Mode
 * ADR-05: CrewAI Architecture
 *
 * Monitors:
 *   1. pg_cron execution — failed/missed runs in cron.job_run_details
 *   2. Enrichment queue depth — backlog in enrichment_queue
 *   3. Batch stalls — cc_batch_tracking stalled batches
 *   4. Dedup errors — dedup_log failure rates
 *
 * OBSERVE MODE: Logs findings and recommended actions. Zero remediation.
 * All decisions recorded in agent_action_log for Marston review.
 *
 * No AI calls — pure data monitoring. Zero Anthropic API cost.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SB_URL, SB_KEY);

const AGENT_ID = 'pipeline-health';

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

// ── Severity levels ──
type Severity = 'ok' | 'warn' | 'critical';

interface HealthCheck {
  check: string;
  severity: Severity;
  message: string;
  details: Record<string, unknown>;
  recommendation?: string;
}

// ── Check 1: Cron Execution Health ──
async function checkCronHealth(lookbackHours: number): Promise<HealthCheck> {
  // Query pg_cron job run details for failures in lookback window
  const { data, error } = await sb.rpc('exec_sql', {
    query: `
      SELECT
        j.jobname,
        COUNT(*) FILTER (WHERE r.status = 'succeeded') AS success_count,
        COUNT(*) FILTER (WHERE r.status = 'failed') AS fail_count,
        COUNT(*) AS total_runs,
        MAX(r.start_time) AS last_run,
        ROUND(
          COUNT(*) FILTER (WHERE r.status = 'failed')::numeric /
          NULLIF(COUNT(*), 0) * 100, 1
        ) AS failure_rate_pct
      FROM cron.job j
      LEFT JOIN cron.job_run_details r
        ON j.jobid = r.jobid
        AND r.start_time > NOW() - INTERVAL '${lookbackHours} hours'
      GROUP BY j.jobname
      ORDER BY fail_count DESC
    `
  });

  if (error) {
    return {
      check: 'cron_execution',
      severity: 'warn',
      message: `Failed to query cron health: ${error.message}`,
      details: { error: error.message },
    };
  }

  const rows = data || [];
  const failedJobs = rows.filter((r: Record<string, unknown>) =>
    Number(r.failure_rate_pct || 0) > 5
  );
  const noRecentRuns = rows.filter((r: Record<string, unknown>) =>
    Number(r.total_runs || 0) === 0
  );

  let severity: Severity = 'ok';
  let message = `${rows.length} cron jobs healthy. 0 failures in ${lookbackHours}h.`;

  if (failedJobs.length > 0) {
    severity = failedJobs.some((j: Record<string, unknown>) =>
      Number(j.failure_rate_pct) > 25
    ) ? 'critical' : 'warn';
    message = `${failedJobs.length} cron job(s) with elevated failure rate.`;
  }

  if (noRecentRuns.length > 0) {
    severity = severity === 'critical' ? 'critical' : 'warn';
    message += ` ${noRecentRuns.length} job(s) with no recent runs.`;
  }

  return {
    check: 'cron_execution',
    severity,
    message,
    details: {
      total_jobs: rows.length,
      failed_jobs: failedJobs.map((j: Record<string, unknown>) => ({
        name: j.jobname,
        failure_rate_pct: j.failure_rate_pct,
        fail_count: j.fail_count,
        total_runs: j.total_runs,
      })),
      no_recent_runs: noRecentRuns.map((j: Record<string, unknown>) => j.jobname),
      lookback_hours: lookbackHours,
    },
    recommendation: failedJobs.length > 0
      ? `Investigate failed cron jobs: ${failedJobs.map((j: Record<string, unknown>) => j.jobname).join(', ')}. Check Supabase logs for error details.`
      : undefined,
  };
}

// ── Check 2: Enrichment Queue Depth ──
async function checkQueueDepth(warnThreshold: number, criticalThreshold: number): Promise<HealthCheck> {
  const { data, error } = await sb.rpc('exec_sql', {
    query: `
      SELECT
        status,
        COUNT(*) AS count,
        MIN(created_at) AS oldest,
        AVG(EXTRACT(EPOCH FROM (NOW() - created_at))) AS avg_age_seconds
      FROM enrichment_queue
      GROUP BY status
    `
  });

  if (error) {
    return {
      check: 'queue_depth',
      severity: 'warn',
      message: `Failed to query enrichment queue: ${error.message}`,
      details: { error: error.message },
    };
  }

  const rows = data || [];
  const pending = rows.find((r: Record<string, unknown>) => r.status === 'pending');
  const pendingCount = Number(pending?.count || 0);
  const avgAgeSec = Number(pending?.avg_age_seconds || 0);

  let severity: Severity = 'ok';
  let message = `Enrichment queue: ${pendingCount} pending items.`;

  if (pendingCount > criticalThreshold) {
    severity = 'critical';
    message = `Enrichment queue CRITICAL: ${pendingCount} pending (threshold: ${criticalThreshold}).`;
  } else if (pendingCount > warnThreshold) {
    severity = 'warn';
    message = `Enrichment queue elevated: ${pendingCount} pending (threshold: ${warnThreshold}).`;
  }

  return {
    check: 'queue_depth',
    severity,
    message,
    details: {
      by_status: rows.map((r: Record<string, unknown>) => ({
        status: r.status,
        count: Number(r.count),
        avg_age_seconds: Math.round(Number(r.avg_age_seconds || 0)),
      })),
      pending_count: pendingCount,
      avg_pending_age_seconds: Math.round(avgAgeSec),
    },
    recommendation: pendingCount > warnThreshold
      ? `Queue backlog at ${pendingCount}. Consider increasing enrichment batch size or Anthropic call budget.`
      : undefined,
  };
}

// ── Check 3: Batch Stalls (Common Crawl) ──
async function checkBatchStalls(stallThresholdMin: number): Promise<HealthCheck> {
  const { data, error } = await sb.rpc('exec_sql', {
    query: `
      SELECT
        id,
        status,
        started_at,
        urls_discovered,
        urls_fetched,
        urls_parsed,
        urls_failed,
        EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 AS age_minutes
      FROM cc_batch_tracking
      WHERE status IN ('running', 'fetching', 'parsing')
        AND started_at < NOW() - INTERVAL '${stallThresholdMin} minutes'
      ORDER BY started_at ASC
      LIMIT 10
    `
  });

  if (error) {
    return {
      check: 'batch_stalls',
      severity: 'warn',
      message: `Failed to query batch tracking: ${error.message}`,
      details: { error: error.message },
    };
  }

  const stalledBatches = data || [];

  if (stalledBatches.length === 0) {
    return {
      check: 'batch_stalls',
      severity: 'ok',
      message: 'No stalled batches detected.',
      details: { stalled_count: 0, threshold_min: stallThresholdMin },
    };
  }

  return {
    check: 'batch_stalls',
    severity: stalledBatches.length > 3 ? 'critical' : 'warn',
    message: `${stalledBatches.length} batch(es) stalled (>${stallThresholdMin}min with no progress).`,
    details: {
      stalled_count: stalledBatches.length,
      threshold_min: stallThresholdMin,
      batches: stalledBatches.map((b: Record<string, unknown>) => ({
        id: b.id,
        status: b.status,
        age_minutes: Math.round(Number(b.age_minutes)),
        urls_discovered: b.urls_discovered,
        urls_fetched: b.urls_fetched,
        urls_parsed: b.urls_parsed,
        urls_failed: b.urls_failed,
      })),
    },
    recommendation: `${stalledBatches.length} batch(es) appear stalled. Consider marking as failed and re-queuing, or investigating EF timeout limits.`,
  };
}

// ── Check 4: Dedup Health ──
async function checkDedupHealth(lookbackHours: number): Promise<HealthCheck> {
  const { data, error } = await sb.rpc('exec_sql', {
    query: `
      SELECT
        action,
        COUNT(*) AS count,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '${lookbackHours} hours') AS recent_count
      FROM dedup_log
      GROUP BY action
    `
  });

  if (error) {
    return {
      check: 'dedup_health',
      severity: 'warn',
      message: `Failed to query dedup log: ${error.message}`,
      details: { error: error.message },
    };
  }

  const rows = data || [];
  const totalRecent = rows.reduce(
    (sum: number, r: Record<string, unknown>) => sum + Number(r.recent_count || 0), 0
  );

  return {
    check: 'dedup_health',
    severity: totalRecent === 0 ? 'warn' : 'ok',
    message: totalRecent === 0
      ? `No dedup activity in the last ${lookbackHours}h.`
      : `Dedup active: ${totalRecent} operations in ${lookbackHours}h.`,
    details: {
      by_action: rows.map((r: Record<string, unknown>) => ({
        action: r.action,
        total: Number(r.count),
        recent: Number(r.recent_count),
      })),
      lookback_hours: lookbackHours,
    },
    recommendation: totalRecent === 0
      ? 'No dedup runs detected. Verify dedup-promote cron is scheduled and active.'
      : undefined,
  };
}


// ── Main Handler ──
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const logger = createLogger('crewai-pipeline-health', crypto.randomUUID());
  const startTime = Date.now();

  try {
    // Check agent config and kill switch
    const { data: agentConfig, error: configErr } = await sb
      .from('agent_config')
      .select('*')
      .eq('id', AGENT_ID)
      .single();

    if (configErr || !agentConfig) {
      throw new Error(`Agent ${AGENT_ID} not found in agent_config`);
    }

    if (!agentConfig.enabled) {
      logger.warn('Pipeline Health Agent is disabled (kill switch active)');
      return jsonResp({ ok: false, error: 'Agent disabled via kill switch', agent: AGENT_ID }, 403);
    }

    // Extract config thresholds
    const config = agentConfig.config || {};
    const lookbackHours = config.lookback_hours ?? 24;
    const stallThresholdMin = config.stall_threshold_min ?? 60;
    const queueBacklogWarn = config.queue_backlog_warn ?? 500;
    const queueBacklogCritical = config.queue_backlog_critical ?? 2000;

    // Run all health checks
    const checks: HealthCheck[] = await Promise.all([
      checkCronHealth(lookbackHours),
      checkQueueDepth(queueBacklogWarn, queueBacklogCritical),
      checkBatchStalls(stallThresholdMin),
      checkDedupHealth(lookbackHours),
    ]);

    // Determine overall severity
    const hasCritical = checks.some(c => c.severity === 'critical');
    const hasWarn = checks.some(c => c.severity === 'warn');
    const overallSeverity: Severity = hasCritical ? 'critical' : hasWarn ? 'warn' : 'ok';

    // Calculate confidence (higher = more certainty about health status)
    // Lower confidence when we have errors querying data
    const queryErrors = checks.filter(c => c.details.error).length;
    const confidence = Math.max(0.5, 1 - (queryErrors * 0.15));

    // Log each finding to agent_action_log
    for (const check of checks) {
      if (check.severity !== 'ok') {
        await sb.from('agent_action_log').insert({
          agent_id: AGENT_ID,
          action_type: check.severity === 'critical' ? 'alert_critical' : 'alert_warn',
          trust_level: agentConfig.trust_level,
          target: check.check,
          target_type: 'pipeline_check',
          payload: { check: check.check, details: check.details },
          result: {
            severity: check.severity,
            message: check.message,
            recommendation: check.recommendation,
          },
          confidence,
          executed: false, // OBSERVE MODE: no remediation
          duration_ms: null,
        });
      }
    }

    // Always log a summary entry
    await sb.from('agent_action_log').insert({
      agent_id: AGENT_ID,
      action_type: overallSeverity === 'ok' ? 'health_ok' : 'health_degraded',
      trust_level: agentConfig.trust_level,
      target: 'pipeline_summary',
      target_type: 'pipeline_check',
      payload: {
        checks_run: checks.length,
        checks_ok: checks.filter(c => c.severity === 'ok').length,
        checks_warn: checks.filter(c => c.severity === 'warn').length,
        checks_critical: checks.filter(c => c.severity === 'critical').length,
      },
      result: {
        overall_severity: overallSeverity,
        summary: checks.map(c => `${c.check}: ${c.severity}`).join(', '),
      },
      confidence,
      executed: false,
      duration_ms: Date.now() - startTime,
    });

    // Update agent run stats
    await sb
      .from('agent_config')
      .update({
        last_run_at: new Date().toISOString(),
        run_count: agentConfig.run_count + 1,
        last_error: null,
      })
      .eq('id', AGENT_ID);

    const totalDuration = Date.now() - startTime;
    const summary = {
      ok: true,
      agent: AGENT_ID,
      trust_level: agentConfig.trust_level,
      observe_mode: agentConfig.trust_level === 'observe',
      overall_severity: overallSeverity,
      checks_run: checks.length,
      checks_ok: checks.filter(c => c.severity === 'ok').length,
      checks_warn: checks.filter(c => c.severity === 'warn').length,
      checks_critical: checks.filter(c => c.severity === 'critical').length,
      confidence,
      duration_ms: totalDuration,
      checks,
    };

    logger.info('Pipeline Health run complete', {
      severity: overallSeverity,
      duration_ms: totalDuration,
    });

    return jsonResp(summary);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Pipeline Health Agent error: ${msg}`);

    // Update error count
    await sb.rpc('exec_sql', {
      query: `UPDATE agent_config SET error_count = error_count + 1, last_error = '${msg.replace(/'/g, "''")}' WHERE id = '${AGENT_ID}'`,
    }).catch(() => {});

    return jsonResp({ ok: false, agent: AGENT_ID, error: msg }, 500);
  }
});
