/**
 * crewai-data-freshness — Edge Function
 * SA-011: Data Freshness Agent (Agent 3) — Observe Mode
 * ADR-05: CrewAI Architecture
 *
 * Monitors:
 *   1. Materialized view staleness — time since last successful refresh
 *   2. Sync lag — delta between source table writes and MV refresh
 *   3. Ingestion progress — Common Crawl batch completion rates
 *   4. Data completeness — null rates in critical columns of ats_jobs
 *   5. Dedup effectiveness — duplicate detection rates over time
 *
 * OBSERVE MODE: Logs findings only. Zero remediation actions.
 * All decisions recorded in agent_action_log for Marston review.
 *
 * No AI calls — pure data monitoring. Zero Anthropic API cost.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SB_URL, SB_KEY);

const AGENT_ID = 'data-freshness';

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

type Severity = 'ok' | 'warn' | 'critical';

interface FreshnessCheck {
  check: string;
  severity: Severity;
  message: string;
  details: Record<string, unknown>;
  recommendation?: string;
}

// ── Check 1: Materialized View Staleness ──
async function checkMvStaleness(warnMin: number, criticalMin: number): Promise<FreshnessCheck> {
  const { data, error } = await sb.rpc('exec_sql', {
    query: `
      SELECT
        refresh_type,
        started_at,
        completed_at,
        duration_ms,
        rows_affected,
        status,
        EXTRACT(EPOCH FROM (NOW() - completed_at)) / 60 AS age_minutes
      FROM mv_refresh_log
      WHERE completed_at IS NOT NULL
      ORDER BY completed_at DESC
      LIMIT 10
    `
  });

  if (error) {
    return {
      check: 'mv_staleness',
      severity: 'warn',
      message: `Failed to query mv_refresh_log: ${error.message}`,
      details: { error: error.message },
    };
  }

  const rows = data || [];
  if (rows.length === 0) {
    return {
      check: 'mv_staleness',
      severity: 'critical',
      message: 'No MV refresh records found. Views may never have been refreshed.',
      details: { records_found: 0 },
      recommendation: 'Run refresh-mv-incremental manually to establish baseline, then verify cron schedule.',
    };
  }

  const latest = rows[0];
  const ageMin = Number(latest.age_minutes || 0);

  let severity: Severity = 'ok';
  let message = `Last MV refresh: ${Math.round(ageMin)}min ago (${latest.refresh_type}).`;

  if (ageMin > criticalMin) {
    severity = 'critical';
    message = `MV STALE: Last refresh ${Math.round(ageMin)}min ago (critical threshold: ${criticalMin}min).`;
  } else if (ageMin > warnMin) {
    severity = 'warn';
    message = `MV aging: Last refresh ${Math.round(ageMin)}min ago (warn threshold: ${warnMin}min).`;
  }

  // Check for recent failures
  const recentFailures = rows.filter((r: Record<string, unknown>) => r.status === 'error');

  return {
    check: 'mv_staleness',
    severity: recentFailures.length > 2 ? 'critical' : severity,
    message: recentFailures.length > 0
      ? `${message} ${recentFailures.length} recent refresh failure(s).`
      : message,
    details: {
      last_refresh_age_min: Math.round(ageMin),
      last_refresh_type: latest.refresh_type,
      last_duration_ms: latest.duration_ms,
      last_rows_affected: latest.rows_affected,
      recent_failures: recentFailures.length,
      recent_refreshes: rows.map((r: Record<string, unknown>) => ({
        type: r.refresh_type,
        age_min: Math.round(Number(r.age_minutes)),
        status: r.status,
        rows: r.rows_affected,
      })),
    },
    recommendation: ageMin > warnMin
      ? 'MV refresh may be failing or cron disabled. Check refresh-mv-incremental EF logs and pg_cron status.'
      : undefined,
  };
}

// ── Check 2: Source-to-MV Sync Lag ──
async function checkSyncLag(warnMin: number): Promise<FreshnessCheck> {
  const { data, error } = await sb.rpc('exec_sql', {
    query: `
      SELECT
        (SELECT MAX(updated_at) FROM ats_jobs) AS source_latest,
        (SELECT MAX(completed_at) FROM mv_refresh_log WHERE completed_at IS NOT NULL) AS mv_latest,
        EXTRACT(EPOCH FROM (
          (SELECT MAX(updated_at) FROM ats_jobs) -
          (SELECT MAX(completed_at) FROM mv_refresh_log WHERE completed_at IS NOT NULL)
        )) / 60 AS lag_minutes,
        (SELECT COUNT(*) FROM ats_jobs_change_log
         WHERE changed_at > (SELECT MAX(completed_at) FROM mv_refresh_log WHERE completed_at IS NOT NULL)
        ) AS pending_changes
    `
  });

  if (error) {
    return {
      check: 'sync_lag',
      severity: 'warn',
      message: `Failed to query sync lag: ${error.message}`,
      details: { error: error.message },
    };
  }

  const row = (data || [])[0] || {};
  const lagMin = Math.abs(Number(row.lag_minutes || 0));
  const pendingChanges = Number(row.pending_changes || 0);

  let severity: Severity = 'ok';
  let message = `Sync lag: ${Math.round(lagMin)}min. ${pendingChanges} changes pending.`;

  if (lagMin > warnMin && pendingChanges > 100) {
    severity = 'warn';
    message = `Sync lag elevated: ${Math.round(lagMin)}min with ${pendingChanges} pending changes.`;
  }

  if (lagMin > warnMin * 3) {
    severity = 'critical';
    message = `Sync lag CRITICAL: ${Math.round(lagMin)}min (threshold: ${warnMin}min). ${pendingChanges} changes queued.`;
  }

  return {
    check: 'sync_lag',
    severity,
    message,
    details: {
      source_latest: row.source_latest,
      mv_latest: row.mv_latest,
      lag_minutes: Math.round(lagMin),
      pending_changes: pendingChanges,
    },
    recommendation: severity !== 'ok'
      ? `${pendingChanges} changes not yet reflected in MVs. Trigger incremental refresh or check cron schedule.`
      : undefined,
  };
}

// ── Check 3: Ingestion Progress (Common Crawl) ──
async function checkIngestionProgress(): Promise<FreshnessCheck> {
  const { data, error } = await sb.rpc('exec_sql', {
    query: `
      SELECT
        status,
        COUNT(*) AS batch_count,
        SUM(urls_discovered) AS total_discovered,
        SUM(urls_fetched) AS total_fetched,
        SUM(urls_parsed) AS total_parsed,
        SUM(urls_failed) AS total_failed,
        MAX(completed_at) AS latest_completion
      FROM cc_batch_tracking
      GROUP BY status
      ORDER BY batch_count DESC
    `
  });

  if (error) {
    return {
      check: 'ingestion_progress',
      severity: 'warn',
      message: `Failed to query ingestion progress: ${error.message}`,
      details: { error: error.message },
    };
  }

  const rows = data || [];
  const completedRow = rows.find((r: Record<string, unknown>) => r.status === 'completed');
  const failedRow = rows.find((r: Record<string, unknown>) => r.status === 'failed');
  const totalBatches = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.batch_count || 0), 0);
  const failedBatches = Number(failedRow?.batch_count || 0);
  const failRate = totalBatches > 0 ? (failedBatches / totalBatches * 100) : 0;

  let severity: Severity = 'ok';
  let message = `Ingestion: ${totalBatches} batches total.`;

  if (totalBatches === 0) {
    severity = 'warn';
    message = 'No ingestion batches recorded. Pipeline may not have started.';
  } else if (failRate > 25) {
    severity = 'critical';
    message = `Ingestion failure rate ${Math.round(failRate)}% (${failedBatches}/${totalBatches} batches).`;
  } else if (failRate > 10) {
    severity = 'warn';
    message = `Ingestion failure rate ${Math.round(failRate)}% (${failedBatches}/${totalBatches} batches).`;
  }

  return {
    check: 'ingestion_progress',
    severity,
    message,
    details: {
      total_batches: totalBatches,
      by_status: rows.map((r: Record<string, unknown>) => ({
        status: r.status,
        batches: Number(r.batch_count),
        urls_discovered: Number(r.total_discovered || 0),
        urls_fetched: Number(r.total_fetched || 0),
        urls_parsed: Number(r.total_parsed || 0),
        urls_failed: Number(r.total_failed || 0),
      })),
      failure_rate_pct: Math.round(failRate * 10) / 10,
      latest_completion: completedRow?.latest_completion,
    },
    recommendation: failRate > 10
      ? `High batch failure rate (${Math.round(failRate)}%). Review ingest-common-crawl logs for URL fetch errors or HTML parsing failures.`
      : undefined,
  };
}

// ── Check 4: Data Completeness ──
async function checkDataCompleteness(warnPct: number, criticalPct: number): Promise<FreshnessCheck> {
  const { data, error } = await sb.rpc('exec_sql', {
    query: `
      SELECT
        COUNT(*) AS total_jobs,
        ROUND(COUNT(*) FILTER (WHERE title IS NULL OR title = '') * 100.0 / NULLIF(COUNT(*), 0), 1) AS null_title_pct,
        ROUND(COUNT(*) FILTER (WHERE company_name IS NULL OR company_name = '') * 100.0 / NULLIF(COUNT(*), 0), 1) AS null_company_pct,
        ROUND(COUNT(*) FILTER (WHERE location IS NULL OR location = '') * 100.0 / NULLIF(COUNT(*), 0), 1) AS null_location_pct,
        ROUND(COUNT(*) FILTER (WHERE url IS NULL OR url = '') * 100.0 / NULLIF(COUNT(*), 0), 1) AS null_url_pct,
        ROUND(COUNT(*) FILTER (WHERE source IS NULL OR source = '') * 100.0 / NULLIF(COUNT(*), 0), 1) AS null_source_pct,
        MAX(created_at) AS newest_job,
        MIN(created_at) AS oldest_job
      FROM ats_jobs
    `
  });

  if (error) {
    return {
      check: 'data_completeness',
      severity: 'warn',
      message: `Failed to query data completeness: ${error.message}`,
      details: { error: error.message },
    };
  }

  const row = (data || [])[0] || {};
  const nullRates: Record<string, number> = {
    title: Number(row.null_title_pct || 0),
    company_name: Number(row.null_company_pct || 0),
    location: Number(row.null_location_pct || 0),
    url: Number(row.null_url_pct || 0),
    source: Number(row.null_source_pct || 0),
  };

  const criticalFields = Object.entries(nullRates).filter(([, pct]) => pct > criticalPct);
  const warnFields = Object.entries(nullRates).filter(([, pct]) => pct > warnPct && pct <= criticalPct);

  let severity: Severity = 'ok';
  let message = `Data completeness: ${row.total_jobs} jobs. All critical fields within thresholds.`;

  if (criticalFields.length > 0) {
    severity = 'critical';
    message = `Data completeness CRITICAL: ${criticalFields.map(([f, p]) => `${f} ${p}% null`).join(', ')}.`;
  } else if (warnFields.length > 0) {
    severity = 'warn';
    message = `Data completeness warning: ${warnFields.map(([f, p]) => `${f} ${p}% null`).join(', ')}.`;
  }

  return {
    check: 'data_completeness',
    severity,
    message,
    details: {
      total_jobs: Number(row.total_jobs || 0),
      null_rates: nullRates,
      newest_job: row.newest_job,
      oldest_job: row.oldest_job,
      critical_threshold_pct: criticalPct,
      warn_threshold_pct: warnPct,
    },
    recommendation: criticalFields.length > 0
      ? `Critical null rates in: ${criticalFields.map(([f]) => f).join(', ')}. Review ingestion pipeline data extraction and enrichment rules.`
      : undefined,
  };
}

// ── Check 5: Dedup Effectiveness ──
async function checkDedupEffectiveness(lookbackDays: number): Promise<FreshnessCheck> {
  const { data, error } = await sb.rpc('exec_sql', {
    query: `
      SELECT
        action,
        COUNT(*) AS count,
        MIN(created_at) AS earliest,
        MAX(created_at) AS latest
      FROM dedup_log
      WHERE created_at > NOW() - INTERVAL '${lookbackDays} days'
      GROUP BY action
    `
  });

  if (error) {
    return {
      check: 'dedup_effectiveness',
      severity: 'warn',
      message: `Failed to query dedup stats: ${error.message}`,
      details: { error: error.message },
    };
  }

  const rows = data || [];
  const totalOps = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.count || 0), 0);
  const promoted = rows.find((r: Record<string, unknown>) => r.action === 'promote');
  const deduplicated = rows.find((r: Record<string, unknown>) => r.action === 'deduplicate');
  const promotedCount = Number(promoted?.count || 0);
  const dedupCount = Number(deduplicated?.count || 0);
  const dedupRate = totalOps > 0 ? (dedupCount / totalOps * 100) : 0;

  return {
    check: 'dedup_effectiveness',
    severity: totalOps === 0 ? 'warn' : 'ok',
    message: totalOps === 0
      ? `No dedup activity in ${lookbackDays} days.`
      : `Dedup: ${dedupCount} duplicates found, ${promotedCount} promoted. ${Math.round(dedupRate)}% dedup rate.`,
    details: {
      total_operations: totalOps,
      promoted: promotedCount,
      deduplicated: dedupCount,
      dedup_rate_pct: Math.round(dedupRate * 10) / 10,
      lookback_days: lookbackDays,
      by_action: rows.map((r: Record<string, unknown>) => ({
        action: r.action,
        count: Number(r.count),
      })),
    },
    recommendation: totalOps === 0
      ? 'No dedup activity detected. Verify dedup-promote is being invoked regularly.'
      : undefined,
  };
}


// ── Main Handler ──
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const logger = createLogger('crewai-data-freshness', crypto.randomUUID());
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
      logger.warn('Data Freshness Agent is disabled (kill switch active)');
      return jsonResp({ ok: false, error: 'Agent disabled via kill switch', agent: AGENT_ID }, 403);
    }

    // Extract config thresholds
    const config = agentConfig.config || {};
    const mvStaleWarn = config.mv_stale_warn_min ?? 60;
    const mvStaleCritical = config.mv_stale_critical_min ?? 360;
    const syncLagWarn = config.sync_lag_warn_min ?? 30;
    const nullRateWarn = config.null_rate_warn_pct ?? 10;
    const nullRateCritical = config.null_rate_critical_pct ?? 25;
    const lookbackDays = config.lookback_days ?? 7;

    // Run all freshness checks
    const checks: FreshnessCheck[] = await Promise.all([
      checkMvStaleness(mvStaleWarn, mvStaleCritical),
      checkSyncLag(syncLagWarn),
      checkIngestionProgress(),
      checkDataCompleteness(nullRateWarn, nullRateCritical),
      checkDedupEffectiveness(lookbackDays),
    ]);

    // Determine overall severity
    const hasCritical = checks.some(c => c.severity === 'critical');
    const hasWarn = checks.some(c => c.severity === 'warn');
    const overallSeverity: Severity = hasCritical ? 'critical' : hasWarn ? 'warn' : 'ok';

    // Confidence: lower when queries errored
    const queryErrors = checks.filter(c => c.details.error).length;
    const confidence = Math.max(0.5, 1 - (queryErrors * 0.12));

    // Log each non-ok finding to agent_action_log
    for (const check of checks) {
      if (check.severity !== 'ok') {
        await sb.from('agent_action_log').insert({
          agent_id: AGENT_ID,
          action_type: check.severity === 'critical' ? 'alert_critical' : 'alert_warn',
          trust_level: agentConfig.trust_level,
          target: check.check,
          target_type: 'freshness_check',
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
      action_type: overallSeverity === 'ok' ? 'freshness_ok' : 'freshness_degraded',
      trust_level: agentConfig.trust_level,
      target: 'freshness_summary',
      target_type: 'freshness_check',
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

    logger.info('Data Freshness run complete', {
      severity: overallSeverity,
      duration_ms: totalDuration,
    });

    return jsonResp(summary);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Data Freshness Agent error: ${msg}`);

    await sb.rpc('exec_sql', {
      query: `UPDATE agent_config SET error_count = error_count + 1, last_error = '${msg.replace(/'/g, "''")}' WHERE id = '${AGENT_ID}'`,
    }).catch(() => {});

    return jsonResp({ ok: false, agent: AGENT_ID, error: msg }, 500);
  }
});
