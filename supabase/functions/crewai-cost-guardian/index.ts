/**
 * crewai-cost-guardian — Edge Function
 * SA-020: Cost Guardian Agent (Agent 4) — Observe Mode
 * ADR-05: CrewAI Architecture
 *
 * Monitors vendor spend across all services against monthly budgets.
 * Compares vendor_cost_log actuals against vendor_cost_budgets thresholds.
 *
 * Actions:
 *   check — Run all cost checks and log findings
 *   status — Return current budget status summary (admin panel)
 *
 * OBSERVE MODE: Logs findings and recommended actions. Zero remediation.
 * Agent never throttles or kills switches automatically. All decisions require Marston.
 *
 * No AI calls in observe mode — pure data comparison. Zero Anthropic cost.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SB_URL, SB_KEY);

const AGENT_ID = 'cost-guardian';

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

interface CostCheck {
  check: string;
  severity: Severity;
  message: string;
  details: Record<string, unknown>;
  recommendation?: string;
}

// ── Check 1: Budget Status — compare actuals vs budgets ──
async function checkBudgetStatus(): Promise<CostCheck[]> {
  const { data, error } = await sb.rpc('fn_cost_guardian_summary');
  if (error) {
    return [{
      check: 'budget_status',
      severity: 'warn',
      message: `Failed to retrieve cost summary: ${error.message}`,
      details: { error: error.message },
    }];
  }

  const summary = data as {
    vendor_status: Array<{
      vendor: string;
      display_name: string;
      budget: number;
      spent: number;
      spent_pct: number;
      warn_pct: number;
      throttle_pct: number;
      hard_stop_pct: number;
      status: string;
    }>;
    total_budget: number;
    total_spent: number;
    alerts: Array<{ vendor: string; spent_pct: number }> | null;
  };

  const checks: CostCheck[] = [];

  for (const v of summary.vendor_status ?? []) {
    if (v.status === 'hard_stop') {
      checks.push({
        check: `budget_${v.vendor}`,
        severity: 'critical',
        message: `${v.display_name} at ${v.spent_pct}% of monthly budget ($${v.spent}/$${v.budget}) — HARD STOP threshold reached`,
        details: { vendor: v.vendor, spent: v.spent, budget: v.budget, spent_pct: v.spent_pct },
        recommendation: `Immediately review ${v.display_name} usage. Consider pausing non-critical operations that use this service.`,
      });
    } else if (v.status === 'throttle') {
      checks.push({
        check: `budget_${v.vendor}`,
        severity: 'critical',
        message: `${v.display_name} at ${v.spent_pct}% of monthly budget — THROTTLE threshold reached`,
        details: { vendor: v.vendor, spent: v.spent, budget: v.budget, spent_pct: v.spent_pct },
        recommendation: `Review ${v.display_name} usage and reduce non-essential calls. Consider enabling throttle mode.`,
      });
    } else if (v.status === 'warn') {
      checks.push({
        check: `budget_${v.vendor}`,
        severity: 'warn',
        message: `${v.display_name} at ${v.spent_pct}% of monthly budget — approaching limit`,
        details: { vendor: v.vendor, spent: v.spent, budget: v.budget, spent_pct: v.spent_pct },
        recommendation: `Monitor ${v.display_name} usage closely. No action required yet.`,
      });
    }
  }

  if (checks.length === 0) {
    checks.push({
      check: 'budget_status',
      severity: 'ok',
      message: `All vendors within budget. Total: $${summary.total_spent?.toFixed(2) ?? 0} of $${summary.total_budget?.toFixed(2) ?? 0}`,
      details: {
        total_spent: summary.total_spent,
        total_budget: summary.total_budget,
        vendor_count: summary.vendor_status?.length ?? 0,
      },
    });
  }

  return checks;
}

// ── Check 2: Spend Velocity — project full-month cost from MTD ──
async function checkSpendVelocity(): Promise<CostCheck> {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const monthStr = now.toISOString().slice(0, 7); // YYYY-MM

  const { data, error } = await sb
    .from('vendor_cost_log')
    .select('vendor, amount')
    .eq('month', monthStr);

  if (error) {
    return {
      check: 'spend_velocity',
      severity: 'warn',
      message: `Failed to query spend velocity: ${error.message}`,
      details: { error: error.message },
    };
  }

  const totalMTD = (data ?? []).reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const projectedFullMonth = dayOfMonth > 0
    ? (totalMTD / dayOfMonth) * daysInMonth
    : 0;

  const { data: budgetData } = await sb
    .from('vendor_cost_budgets')
    .select('monthly_budget');
  const totalBudget = (budgetData ?? []).reduce((sum, b) => sum + (b.monthly_budget ?? 0), 0);

  const projectedPct = totalBudget > 0 ? (projectedFullMonth / totalBudget) * 100 : 0;

  if (projectedPct >= 100) {
    return {
      check: 'spend_velocity',
      severity: 'critical',
      message: `Projected full-month spend $${projectedFullMonth.toFixed(2)} exceeds total budget $${totalBudget.toFixed(2)} (${projectedPct.toFixed(0)}%)`,
      details: { total_mtd: totalMTD, projected: projectedFullMonth, budget: totalBudget, day_of_month: dayOfMonth, days_in_month: daysInMonth },
      recommendation: 'Immediate spend review required. Identify highest-cost operations and defer non-critical tasks.',
    };
  } else if (projectedPct >= 85) {
    return {
      check: 'spend_velocity',
      severity: 'warn',
      message: `Projected full-month spend $${projectedFullMonth.toFixed(2)} is ${projectedPct.toFixed(0)}% of budget`,
      details: { total_mtd: totalMTD, projected: projectedFullMonth, budget: totalBudget, day_of_month: dayOfMonth },
      recommendation: 'Watch spend trajectory closely. Consider deferring expensive batch operations.',
    };
  }

  return {
    check: 'spend_velocity',
    severity: 'ok',
    message: `MTD spend $${totalMTD.toFixed(2)}, projected $${projectedFullMonth.toFixed(2)} of $${totalBudget.toFixed(2)} budget (${projectedPct.toFixed(0)}%)`,
    details: { total_mtd: totalMTD, projected: projectedFullMonth, budget: totalBudget, projected_pct: projectedPct },
  };
}

// ── Check 3: Anthropic Token Rate ──
async function checkAnthropicRate(): Promise<CostCheck> {
  // Look at agent_action_log for AI call frequency as a proxy for Anthropic spend
  const { data, error } = await sb
    .from('agent_action_log')
    .select('created_at, action_data')
    .eq('action_type', 'ai_call')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error || !data) {
    return {
      check: 'anthropic_rate',
      severity: 'ok',
      message: 'No AI call log entries found in last 24h',
      details: { calls_24h: 0 },
    };
  }

  const calls24h = data.length;
  const callsPerHour = calls24h / 24;

  // Get Anthropic budget config
  const { data: budget } = await sb
    .from('vendor_cost_budgets')
    .select('monthly_budget')
    .eq('vendor', 'anthropic')
    .single();

  const dailyBudget = budget ? budget.monthly_budget / 30 : 5;
  // Rough estimate: $0.015 per call (mix of claude-haiku and sonnet)
  const estimatedDailySpend = calls24h * 0.015;
  const estimatedSpendPct = dailyBudget > 0 ? (estimatedDailySpend / dailyBudget) * 100 : 0;

  if (estimatedSpendPct >= 100) {
    return {
      check: 'anthropic_rate',
      severity: 'critical',
      message: `Anthropic usage: ${calls24h} calls in 24h, estimated $${estimatedDailySpend.toFixed(2)} vs $${dailyBudget.toFixed(2)} daily budget`,
      details: { calls_24h: calls24h, calls_per_hour: callsPerHour, est_daily_spend: estimatedDailySpend, daily_budget: dailyBudget },
      recommendation: 'Throttle CC enrichment batch size. Skip AI scoring for low-priority job records.',
    };
  } else if (estimatedSpendPct >= 80) {
    return {
      check: 'anthropic_rate',
      severity: 'warn',
      message: `Anthropic usage trending high: ${calls24h} calls in 24h (est. $${estimatedDailySpend.toFixed(2)})`,
      details: { calls_24h: calls24h, calls_per_hour: callsPerHour, est_daily_spend: estimatedDailySpend },
      recommendation: 'Monitor. Consider reducing enrichment batch sizes.',
    };
  }

  return {
    check: 'anthropic_rate',
    severity: 'ok',
    message: `Anthropic usage normal: ${calls24h} calls in 24h (est. $${estimatedDailySpend.toFixed(2)})`,
    details: { calls_24h: calls24h, calls_per_hour: callsPerHour, est_daily_spend: estimatedDailySpend },
  };
}

// ── Log findings to agent_action_log ──
async function logFindings(checks: CostCheck[]): Promise<void> {
  const critical = checks.filter(c => c.severity === 'critical');
  const warnings = checks.filter(c => c.severity === 'warn');
  const overallSeverity: Severity = critical.length > 0 ? 'critical' : warnings.length > 0 ? 'warn' : 'ok';

  await sb.from('agent_action_log').insert({
    agent_id: AGENT_ID,
    action_type: 'cost_check',
    action_data: {
      checks,
      summary: {
        total_checks: checks.length,
        critical: critical.length,
        warnings: warnings.length,
        ok: checks.filter(c => c.severity === 'ok').length,
      },
    },
    severity: overallSeverity,
    executed: false,  // Observe mode — never executes remediation
    notes: overallSeverity === 'ok'
      ? 'All cost checks passed'
      : `${critical.length} critical, ${warnings.length} warnings found`,
  });
}

// ── Main handler ──
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const bodyText = req.method === 'POST' ? await req.text().catch(() => '{}') : '{}';
    const body = JSON.parse(bodyText || '{}');
    const action = body.action ?? url.searchParams.get('action') ?? 'check';

    if (action === 'status') {
      const { data, error } = await sb.rpc('fn_cost_guardian_summary');
      if (error) return jsonResp({ error: error.message }, 500);
      return jsonResp({ summary: data });
    }

    if (action === 'check') {
      // Check if agent is enabled
      const { data: agentConfig } = await sb
        .from('agent_config')
        .select('enabled, trust_level')
        .eq('id', AGENT_ID)
        .single();

      if (!agentConfig?.enabled) {
        return jsonResp({ skipped: true, reason: 'agent disabled' });
      }

      const [budgetChecks, velocityCheck, anthropicCheck] = await Promise.all([
        checkBudgetStatus(),
        checkSpendVelocity(),
        checkAnthropicRate(),
      ]);

      const allChecks: CostCheck[] = [...budgetChecks, velocityCheck, anthropicCheck];
      await logFindings(allChecks);

      const criticalCount = allChecks.filter(c => c.severity === 'critical').length;
      const warnCount = allChecks.filter(c => c.severity === 'warn').length;

      return jsonResp({
        agent: AGENT_ID,
        mode: agentConfig.trust_level,
        checks_run: allChecks.length,
        critical: criticalCount,
        warnings: warnCount,
        status: criticalCount > 0 ? 'critical' : warnCount > 0 ? 'warn' : 'ok',
        checks: allChecks,
      });
    }

    return jsonResp({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('[cost-guardian] Unhandled error:', err);
    return jsonResp({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
