// evaluate-alerts Edge Function
// DO-004: Cron failure alerting
// AD-DO-003: Unified alerting pipeline
// CS-P1-005: Scheduled evaluation of alert rules against live metrics.
// Checks cron health, surface latency, error rates, feed freshness.
// Fires alerts to alert_history and optionally sends notifications.
//
// Deploy: supabase functions deploy evaluate-alerts --no-verify-jwt
// Schedule: pg_cron every 5 minutes

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createLogger } from "../_shared/logger.ts";
import { withCorrelation } from "../_shared/correlation.ts";
import { API_VERSION } from '../_shared/api-version.ts';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const ALERT_EMAIL = Deno.env.get("ALERT_EMAIL") || "marston@brilliantjobs.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://brilliantjobs.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AlertRule {
  id: string;
  name: string;
  category: string;
  condition: {
    metric: string;
    operator: string;
    threshold: number | string;
    window_minutes: number;
  };
  severity: string;
  cooldown_minutes: number;
  enabled: boolean;
}

interface MetricResult {
  value: number | string;
  details?: string;
}

serve((req) => withCorrelation(req, async (req, correlationId) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createLogger("evaluate-alerts");
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const results: { rule: string; fired: boolean; value: unknown; threshold: unknown }[] = [];

  try {
    // 1. Load active alert rules
    const { data: rules, error: rulesErr } = await sb
      .from('alert_rules')
      .select('*')
      .eq('enabled', true);

    if (rulesErr) throw rulesErr;
    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ evaluated: 0, fired: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "x-api-version": API_VERSION },
      });
    }

    // 2. Collect metrics
    const metrics = await _collectMetrics(sb, logger);

    // 3. Evaluate each rule
    for (const rule of rules as AlertRule[]) {
      const metric = metrics[rule.condition.metric];
      if (metric === undefined) {
        logger.info(`Metric not found: ${rule.condition.metric}`);
        continue;
      }

      const value = typeof metric === 'object' ? (metric as MetricResult).value : metric;
      const shouldFire = _evaluateCondition(value, rule.condition.operator, rule.condition.threshold);

      if (shouldFire) {
        // Check cooldown — don't fire if same rule fired recently
        const cooldownCutoff = new Date(Date.now() - rule.cooldown_minutes * 60 * 1000).toISOString();
        const { data: recentAlert } = await sb
          .from('alert_history')
          .select('id')
          .eq('rule_id', rule.id)
          .gte('created_at', cooldownCutoff)
          .limit(1);

        if (recentAlert && recentAlert.length > 0) {
          results.push({ rule: rule.name, fired: false, value, threshold: rule.condition.threshold });
          continue; // In cooldown
        }

        // Fire the alert
        const details = typeof metric === 'object' ? (metric as MetricResult).details || '' : '';
        const { error: insertErr } = await sb.from('alert_history').insert({
          rule_id: rule.id,
          severity: rule.severity,
          message: `[${rule.severity.toUpperCase()}] ${rule.name}: ${rule.condition.metric} = ${value} (threshold: ${rule.condition.threshold})`,
          metadata: { value, threshold: rule.condition.threshold, details, correlation_id: correlationId },
          status: 'fired'
        });

        if (insertErr) {
          logger.error(`Failed to insert alert: ${insertErr.message}`);
        } else {
          logger.warn(`Alert fired: ${rule.name} — ${rule.condition.metric}=${value}`);
          // Send email notification for critical alerts
          if (rule.severity === 'critical' && RESEND_API_KEY) {
            await _sendAlertEmail(rule, value, details);
          }
        }

        results.push({ rule: rule.name, fired: true, value, threshold: rule.condition.threshold });
      } else {
        results.push({ rule: rule.name, fired: false, value, threshold: rule.condition.threshold });
      }
    }

    const firedCount = results.filter(r => r.fired).length;
    logger.info(`Evaluated ${rules.length} rules, ${firedCount} alerts fired`);

    return new Response(JSON.stringify({
      evaluated: rules.length,
      fired: firedCount,
      results,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "x-api-version": API_VERSION },
    });

  } catch (err) {
    logger.error(`evaluate-alerts error: ${(err as Error).message}`);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json", "x-api-version": API_VERSION },
    });
  }
}));

// ── Collect all metrics from various sources ──
async function _collectMetrics(
  sb: ReturnType<typeof createClient>,
  logger: ReturnType<typeof createLogger>
): Promise<Record<string, number | string | MetricResult>> {
  const metrics: Record<string, number | string | MetricResult> = {};

  // Cron health (DO-004)
  try {
    const { data: cronRows } = await sb.from('v_cron_health').select('*');
    if (cronRows) {
      const failed = cronRows.filter((r: Record<string, unknown>) => r.status === 'red');
      const stale = cronRows.filter((r: Record<string, unknown>) => r.status === 'amber');
      metrics['cron_failed_count'] = failed.length;
      metrics['cron_stale_count'] = stale.length;
      metrics['cron_total'] = cronRows.length;
      if (failed.length > 0) {
        (metrics['cron_failed_count'] as any) = {
          value: failed.length,
          details: failed.map((r: Record<string, unknown>) => r.jobname || r.name).join(', ')
        };
      }
    }
  } catch (e) {
    logger.warn(`Failed to collect cron metrics: ${(e as Error).message}`);
  }

  // Health check status
  try {
    const { data: healthRow } = await sb
      .from('health_check_log')
      .select('overall, created_at, checks')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (healthRow) {
      metrics['health_status'] = healthRow.overall;
      // Check if health check is stale (>15 min)
      const checkAge = (Date.now() - new Date(healthRow.created_at).getTime()) / 60000;
      metrics['health_check_age_minutes'] = Math.round(checkAge);
    }
  } catch (e) {
    logger.warn(`Failed to collect health metrics: ${(e as Error).message}`);
  }

  // Feed freshness
  try {
    const { data: feedRow } = await sb
      .from('ats_jobs')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (feedRow) {
      const freshness = (Date.now() - new Date(feedRow.created_at).getTime()) / 60000;
      metrics['feed_freshness_minutes'] = Math.round(freshness);
    }
  } catch (e) {
    logger.warn(`Failed to collect feed metrics: ${(e as Error).message}`);
  }

  // Error count (from health_check_log)
  try {
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { count } = await sb
      .from('health_check_log')
      .select('*', { count: 'exact', head: true })
      .eq('overall', 'unhealthy')
      .gte('created_at', oneHourAgo);

    metrics['error_count_1h'] = count || 0;
  } catch (e) {
    logger.warn(`Failed to collect error metrics: ${(e as Error).message}`);
  }

  // Surface latency (from most recent health check)
  try {
    const { data: latestCheck } = await sb
      .from('health_check_log')
      .select('checks')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestCheck && latestCheck.checks) {
      const checks = typeof latestCheck.checks === 'string'
        ? JSON.parse(latestCheck.checks) : latestCheck.checks;
      let maxLatency = 0;
      for (const key of Object.keys(checks)) {
        if (checks[key].latencyMs && checks[key].latencyMs > maxLatency) {
          maxLatency = checks[key].latencyMs;
        }
      }
      metrics['surface_latency_ms'] = maxLatency;
    }
  } catch (e) {
    logger.warn(`Failed to collect latency metrics: ${(e as Error).message}`);
  }

  // DO-001: Client errors from client_errors table
  try {
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const fiveMinAgo = new Date(Date.now() - 300000).toISOString();

    // Errors in last hour
    const { count: errCount1h } = await sb
      .from('client_errors')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', oneHourAgo);
    metrics['client_errors_1h'] = errCount1h || 0;

    // Fatal errors in last hour
    const { count: fatalCount1h } = await sb
      .from('client_errors')
      .select('*', { count: 'exact', head: true })
      .eq('severity', 'fatal')
      .gte('created_at', oneHourAgo);
    metrics['client_errors_fatal_1h'] = fatalCount1h || 0;

    // Errors in last 5 minutes (spike detection)
    const { count: errCount5m } = await sb
      .from('client_errors')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', fiveMinAgo);
    metrics['client_errors_5m'] = errCount5m || 0;

    // Unique affected users in last hour
    const { data: affectedRows } = await sb
      .from('client_errors')
      .select('user_id')
      .gte('created_at', oneHourAgo)
      .not('user_id', 'is', null)
      .limit(1000);
    if (affectedRows) {
      const uniqueUsers = new Set(affectedRows.map((r: { user_id: string }) => r.user_id));
      metrics['client_errors_affected_users_1h'] = uniqueUsers.size;
    }

    // Top error fingerprint in last hour (for details in alert email)
    const { data: topErrors } = await sb
      .from('client_errors')
      .select('fingerprint, label, message')
      .gte('created_at', oneHourAgo)
      .order('created_at', { ascending: false })
      .limit(500);
    if (topErrors && topErrors.length > 0) {
      const fpCounts: Record<string, { count: number; label: string; message: string }> = {};
      for (const r of topErrors) {
        const fp = r.fingerprint || 'unknown';
        if (!fpCounts[fp]) fpCounts[fp] = { count: 0, label: r.label, message: r.message };
        fpCounts[fp].count++;
      }
      const sorted = Object.entries(fpCounts).sort((a, b) => b[1].count - a[1].count);
      if (sorted.length > 0) {
        const top = sorted[0];
        (metrics['client_errors_1h'] as any) = {
          value: errCount1h || 0,
          details: `Top error: ${top[1].label} — "${top[1].message?.substring(0, 80)}" (${top[1].count}x)`
        };
      }
    }
  } catch (e) {
    logger.warn(`Failed to collect client_errors metrics: ${(e as Error).message}`);
  }

  return metrics;
}

// ── Evaluate a condition ──
function _evaluateCondition(
  value: number | string,
  operator: string,
  threshold: number | string
): boolean {
  switch (operator) {
    case '>=': return Number(value) >= Number(threshold);
    case '>':  return Number(value) > Number(threshold);
    case '<=': return Number(value) <= Number(threshold);
    case '<':  return Number(value) < Number(threshold);
    case '==': return String(value) === String(threshold);
    case '!=': return String(value) !== String(threshold);
    default: return false;
  }
}

// ── Send alert email via Resend ──
async function _sendAlertEmail(
  rule: AlertRule,
  value: unknown,
  details: string
): Promise<void> {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'alerts@brilliantjobs.app',
        to: [ALERT_EMAIL],
        subject: `[${rule.severity.toUpperCase()}] ${rule.name} — Brilliant Jobs`,
        html: `
          <h2 style="color:#ef4444;">Alert: ${rule.name}</h2>
          <p><strong>Severity:</strong> ${rule.severity}</p>
          <p><strong>Metric:</strong> ${rule.condition.metric} = ${value} (threshold: ${rule.condition.threshold})</p>
          ${details ? `<p><strong>Details:</strong> ${details}</p>` : ''}
          <p><strong>Time:</strong> ${new Date().toISOString()}</p>
          <p><a href="https://brilliantjobs.app/admin.html#alerts">View in Admin →</a></p>
        `
      })
    });
  } catch (e) {
    // Swallow email errors — don't fail the alert pipeline
  }
}
