/**
 * crewai-referral-pipeline — Edge Function
 * SA-021: Referral Pipeline Agent (Agent 6) — Observe Mode
 * ADR-05: CrewAI Architecture
 *
 * Monitors the referral pipeline for three categories of issues:
 *   1. Fraud Patterns   — elevated fraud scores, burst referral activity, suspicious clusters
 *   2. Reward Eligibility — unclaimed/expiring rewards, eligibility mismatches, expired backlogs
 *   3. Attribution Validity — orphaned invites, conversion gap anomalies, chain integrity
 *
 * Actions:
 *   check  — Run all 3 checks and log findings (called by pg_cron every 30min)
 *   status — Return current pipeline health snapshot (admin panel)
 *
 * OBSERVE MODE: Logs findings and recommended actions. Zero remediation.
 * Agent NEVER bans users, claws back rewards, or modifies referral records.
 * All decisions require explicit Marston action.
 *
 * No AI calls in observe mode — pure data analysis. Zero Anthropic cost.
 *
 * HOOK POINT: When trust_level graduates to 'auto', inject remediation actions here:
 *   - auto-ban high-fraud-score referrers (score >= 0.9 + multiple signals)
 *   - expire stale unclaimed rewards past grace period
 *   - flag orphaned invites for cleanup
 * SCAR: fn_referral_pipeline_summary() is the stable contract for admin panel reads.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SB_URL, SB_KEY);

const AGENT_ID = 'referral-pipeline';

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

interface PipelineCheck {
  check: string;
  severity: Severity;
  message: string;
  details: Record<string, unknown>;
  recommendation?: string;
}

// ── Get agent thresholds from config ──────────────────────────────────────────
async function getThresholds() {
  const { data } = await sb
    .from('agent_config')
    .select('config')
    .eq('id', AGENT_ID)
    .single();

  return (data?.config?.thresholds as Record<string, number>) ?? {
    fraud_score_warn:        0.4,
    fraud_score_critical:    0.7,
    burst_window_hours:      24,
    burst_max_referrals:     15,
    reward_expiry_warn_days: 7,
    attribution_gap_hours:   48,
  };
}

// ── Check 1: Fraud Pattern Monitor ───────────────────────────────────────────
// Looks for elevated fraud scores and burst activity since the last check window.
async function checkFraudPatterns(thresholds: Record<string, number>): Promise<PipelineCheck[]> {
  const checks: PipelineCheck[] = [];

  // 1a: High fraud score volume (last 24h)
  const windowStart = new Date(Date.now() - thresholds.burst_window_hours * 3600 * 1000).toISOString();
  const { data: recentReferrals, error: fraudErr } = await sb
    .from('referrals')
    .select('id, referrer_id, fraud_score, fraud_signals, status, created_at')
    .gte('created_at', windowStart)
    .order('fraud_score', { ascending: false });

  if (fraudErr) {
    checks.push({
      check: 'fraud_query_error',
      severity: 'warn',
      message: `Failed to query referral fraud data: ${fraudErr.message}`,
      details: { error: fraudErr.message },
    });
    return checks;
  }

  const all = recentReferrals ?? [];
  const critical = all.filter(r => (r.fraud_score ?? 0) >= thresholds.fraud_score_critical);
  const warned   = all.filter(r =>
    (r.fraud_score ?? 0) >= thresholds.fraud_score_warn &&
    (r.fraud_score ?? 0) <  thresholds.fraud_score_critical
  );
  const rejected = all.filter(r => r.status === 'rejected');

  if (critical.length > 0) {
    checks.push({
      check: 'fraud_critical_scores',
      severity: 'critical',
      message: `${critical.length} referral(s) with fraud_score ≥ ${thresholds.fraud_score_critical} in last ${thresholds.burst_window_hours}h`,
      details: {
        count: critical.length,
        sample_ids: critical.slice(0, 5).map(r => r.id),
        top_score: critical[0]?.fraud_score,
        top_signals: critical[0]?.fraud_signals,
      },
      recommendation: `Review fraud signals on high-score referrals. Consider banning referrer_ids with score ≥ 0.9 + multiple confirmed signals.`,
    });
  } else if (warned.length > 5) {
    checks.push({
      check: 'fraud_score_elevation',
      severity: 'warn',
      message: `${warned.length} referral(s) with elevated fraud_score (${thresholds.fraud_score_warn}–${thresholds.fraud_score_critical}) in last ${thresholds.burst_window_hours}h`,
      details: { count: warned.length, threshold_warn: thresholds.fraud_score_warn },
      recommendation: 'Monitor trend. No action required yet — watch for escalation to critical range.',
    });
  } else {
    checks.push({
      check: 'fraud_critical_scores',
      severity: 'ok',
      message: `Fraud scores normal: ${all.length} referrals checked, ${critical.length} critical, ${warned.length} warned, ${rejected.length} rejected`,
      details: { total: all.length, critical: critical.length, warned: warned.length, rejected: rejected.length },
    });
  }

  // 1b: Burst detection — single referrer with unusually high volume
  const referrerCounts: Record<string, number> = {};
  for (const r of all) {
    referrerCounts[r.referrer_id] = (referrerCounts[r.referrer_id] ?? 0) + 1;
  }
  const burstReferrers = Object.entries(referrerCounts)
    .filter(([, count]) => count > thresholds.burst_max_referrals)
    .sort((a, b) => b[1] - a[1]);

  if (burstReferrers.length > 0) {
    checks.push({
      check: 'fraud_burst_activity',
      severity: 'critical',
      message: `${burstReferrers.length} referrer(s) exceeded ${thresholds.burst_max_referrals} referrals in ${thresholds.burst_window_hours}h`,
      details: {
        burst_referrers: burstReferrers.slice(0, 5).map(([id, count]) => ({ referrer_id: id, count })),
      },
      recommendation: `Investigate high-volume referrers for bot/self-referral patterns. Top offender: ${burstReferrers[0]?.[0]} (${burstReferrers[0]?.[1]} referrals).`,
    });
  }

  return checks;
}

// ── Check 2: Reward Eligibility Audit ────────────────────────────────────────
// Finds unclaimed rewards nearing expiry, large expired backlogs, and
// rewards issued to referrals that were subsequently rejected.
async function checkRewardEligibility(thresholds: Record<string, number>): Promise<PipelineCheck[]> {
  const checks: PipelineCheck[] = [];

  // 2a: Rewards expiring soon
  const expiryWarn = new Date(Date.now() + thresholds.reward_expiry_warn_days * 86400 * 1000).toISOString();
  const { data: expiringRewards, error: expErr } = await sb
    .from('referral_rewards')
    .select('id, user_id, reward_type, reward_value, expires_at')
    .is('claimed_at', null)
    .lt('expires_at', expiryWarn)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true });

  if (!expErr && expiringRewards && expiringRewards.length > 0) {
    const totalValue = expiringRewards.reduce((s, r) => s + (r.reward_value ?? 0), 0);
    checks.push({
      check: 'reward_expiring_soon',
      severity: expiringRewards.length > 20 ? 'critical' : 'warn',
      message: `${expiringRewards.length} unclaimed reward(s) expiring within ${thresholds.reward_expiry_warn_days} days (total value: $${totalValue.toFixed(2)})`,
      details: {
        count: expiringRewards.length,
        total_value_usd: totalValue,
        soonest_expiry: expiringRewards[0]?.expires_at,
        sample_user_ids: [...new Set(expiringRewards.slice(0, 5).map(r => r.user_id))],
      },
      recommendation: `Consider triggering expiry reminder emails for ${expiringRewards.length} users. referral-lifecycle EF handles referral_expiring_reward notifications.`,
    });
  } else {
    checks.push({
      check: 'reward_expiring_soon',
      severity: 'ok',
      message: `No unclaimed rewards expiring within ${thresholds.reward_expiry_warn_days} days`,
      details: { expiry_window_days: thresholds.reward_expiry_warn_days },
    });
  }

  // 2b: Expired unclaimed backlog
  const { data: expiredBacklog } = await sb
    .from('referral_rewards')
    .select('id, reward_value', { count: 'exact', head: false })
    .is('claimed_at', null)
    .lt('expires_at', new Date().toISOString());

  const expiredCount = expiredBacklog?.length ?? 0;
  const expiredValue = (expiredBacklog ?? []).reduce((s, r) => s + (r.reward_value ?? 0), 0);

  if (expiredCount > 50) {
    checks.push({
      check: 'reward_expired_backlog',
      severity: 'warn',
      message: `${expiredCount} unclaimed expired rewards in backlog (total value: $${expiredValue.toFixed(2)})`,
      details: { count: expiredCount, total_value_usd: expiredValue },
      recommendation: 'Consider archiving or tombstoning expired rewards to keep reward table clean.',
    });
  } else {
    checks.push({
      check: 'reward_expired_backlog',
      severity: 'ok',
      message: `Expired reward backlog nominal: ${expiredCount} records`,
      details: { count: expiredCount },
    });
  }

  // 2c: Rewards issued to subsequently rejected referrals (eligibility mismatch)
  const { data: mismatchedRewards, error: mmErr } = await sb
    .from('referral_rewards')
    .select('id, user_id, reward_type, reward_value')
    .is('claimed_at', null)
    .gt('expires_at', new Date().toISOString());

  if (!mmErr && mismatchedRewards && mismatchedRewards.length > 0) {
    // Cross-reference: find users who have active rewards but ALL their referrals are rejected
    // Note: this is a heuristic — a definitive check would require a DB join
    // We log as warn for manual review rather than auto-claw-back (observe mode)
    const userIds = [...new Set(mismatchedRewards.map(r => r.user_id))];

    if (userIds.length > 0) {
      const { data: rejectedReferrers } = await sb
        .from('referrals')
        .select('referrer_id')
        .in('referrer_id', userIds)
        .eq('status', 'rejected');

      // Users with ONLY rejected referrals but active rewards
      const rejectedUserSet = new Set((rejectedReferrers ?? []).map(r => r.referrer_id));
      const { data: anyNonRejected } = await sb
        .from('referrals')
        .select('referrer_id')
        .in('referrer_id', [...rejectedUserSet])
        .neq('status', 'rejected');

      const nonRejectedSet = new Set((anyNonRejected ?? []).map(r => r.referrer_id));
      const eligibilityMismatch = [...rejectedUserSet].filter(uid => !nonRejectedSet.has(uid));

      if (eligibilityMismatch.length > 0) {
        const mismatchedValue = mismatchedRewards
          .filter(r => eligibilityMismatch.includes(r.user_id))
          .reduce((s, r) => s + (r.reward_value ?? 0), 0);

        checks.push({
          check: 'reward_eligibility_mismatch',
          severity: 'critical',
          message: `${eligibilityMismatch.length} user(s) have active rewards but only rejected referrals (potential mismatch: $${mismatchedValue.toFixed(2)})`,
          details: {
            user_count: eligibilityMismatch.length,
            sample_user_ids: eligibilityMismatch.slice(0, 5),
            estimated_value_at_risk_usd: mismatchedValue,
          },
          recommendation: 'Manual review required. If fraud confirmed, consider expiring rewards via referral-lifecycle EF reward_applied event. Never auto-claw-back without Marston review.',
        });
      }
    }
  }

  // Add ok check if no mismatch found and not already added
  if (!checks.find(c => c.check === 'reward_eligibility_mismatch')) {
    checks.push({
      check: 'reward_eligibility_mismatch',
      severity: 'ok',
      message: 'No reward eligibility mismatches detected',
      details: {},
    });
  }

  return checks;
}

// ── Check 3: Attribution Validation ──────────────────────────────────────────
// Validates referral chain integrity: orphaned invites, conversion gaps, and
// referral codes that exist in referral_invites but never produced a referrals row.
async function checkAttributionValidity(thresholds: Record<string, number>): Promise<PipelineCheck[]> {
  const checks: PipelineCheck[] = [];

  // 3a: Orphaned invites (sent > 48h ago, no corresponding referral row)
  const gapCutoff = new Date(Date.now() - thresholds.attribution_gap_hours * 3600 * 1000).toISOString();

  const { data: invites, error: invErr } = await sb
    .from('referral_invites')
    .select('id, user_id, created_at, referral_code')
    .lt('created_at', gapCutoff);

  if (invErr) {
    checks.push({
      check: 'attribution_query_error',
      severity: 'warn',
      message: `Failed to query referral_invites: ${invErr.message}`,
      details: { error: invErr.message },
    });
    return checks;
  }

  const allInvites = invites ?? [];

  if (allInvites.length > 0) {
    const inviterIds = allInvites.map(i => i.user_id);
    const { data: matched } = await sb
      .from('referrals')
      .select('referrer_id')
      .in('referrer_id', inviterIds);

    const matchedSet = new Set((matched ?? []).map(r => r.referrer_id));
    const orphaned = allInvites.filter(i => !matchedSet.has(i.user_id));

    if (orphaned.length > 0) {
      const orphanedPct = Math.round((orphaned.length / allInvites.length) * 100);
      checks.push({
        check: 'attribution_orphaned_invites',
        severity: orphanedPct > 40 ? 'warn' : 'ok',
        message: `${orphaned.length} of ${allInvites.length} invites (${orphanedPct}%) sent > ${thresholds.attribution_gap_hours}h ago have no referral conversion`,
        details: {
          orphaned_count: orphaned.length,
          total_invites: allInvites.length,
          orphaned_pct: orphanedPct,
          sample_invite_ids: orphaned.slice(0, 5).map(i => i.id),
        },
        recommendation: orphanedPct > 40
          ? 'High orphan rate may indicate tracking gap in referral attribution. Verify referral_code capture on signup flow.'
          : 'Normal attrition — invite-to-conversion rates vary. No action required.',
      });
    } else {
      checks.push({
        check: 'attribution_orphaned_invites',
        severity: 'ok',
        message: `Attribution healthy: all ${allInvites.length} aged invites have corresponding referral rows`,
        details: { total_invites: allInvites.length },
      });
    }
  } else {
    checks.push({
      check: 'attribution_orphaned_invites',
      severity: 'ok',
      message: `No aged invites to validate (< ${thresholds.attribution_gap_hours}h old)`,
      details: { attribution_gap_hours: thresholds.attribution_gap_hours },
    });
  }

  // 3b: Conversion velocity anomaly — 0 new referrals in last 48h (platform health signal)
  const { data: recentConversions } = await sb
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', new Date(Date.now() - 48 * 3600 * 1000).toISOString());

  // recentConversions is null when using head:true; check count via rpc instead
  const { count: conversionCount } = await sb
    .from('referrals')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', new Date(Date.now() - 48 * 3600 * 1000).toISOString());

  if (conversionCount === 0) {
    checks.push({
      check: 'attribution_conversion_velocity',
      severity: 'warn',
      message: 'Zero referral conversions in the last 48 hours — may indicate referral pipeline stall',
      details: { window_hours: 48, conversions: 0 },
      recommendation: 'Verify referral tracking on signup flow. Check check-referral-activation EF health.',
    });
  } else {
    checks.push({
      check: 'attribution_conversion_velocity',
      severity: 'ok',
      message: `${conversionCount ?? 0} referral conversion(s) in last 48h — pipeline active`,
      details: { window_hours: 48, conversions: conversionCount ?? 0 },
    });
  }

  return checks;
}

// ── Log findings to agent_action_log ─────────────────────────────────────────
async function logFindings(checks: PipelineCheck[]): Promise<void> {
  const critical = checks.filter(c => c.severity === 'critical');
  const warnings = checks.filter(c => c.severity === 'warn');
  const overallSeverity: Severity = critical.length > 0 ? 'critical' : warnings.length > 0 ? 'warn' : 'ok';

  await sb.from('agent_action_log').insert({
    agent_id: AGENT_ID,
    action_type: 'referral_pipeline_check',
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
    executed: false, // Observe mode — never executes remediation
    notes: overallSeverity === 'ok'
      ? 'All referral pipeline checks passed'
      : `${critical.length} critical, ${warnings.length} warnings found`,
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────
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
      const { data, error } = await sb.rpc('fn_referral_pipeline_summary');
      if (error) return jsonResp({ error: error.message }, 500);
      return jsonResp({ summary: data });
    }

    if (action === 'check') {
      // Verify agent is enabled
      const { data: agentConfig } = await sb
        .from('agent_config')
        .select('enabled, trust_level, config')
        .eq('id', AGENT_ID)
        .single();

      if (!agentConfig?.enabled) {
        return jsonResp({ skipped: true, reason: 'agent disabled' });
      }

      const thresholds = await getThresholds();

      const [fraudChecks, rewardChecks, attributionChecks] = await Promise.all([
        checkFraudPatterns(thresholds),
        checkRewardEligibility(thresholds),
        checkAttributionValidity(thresholds),
      ]);

      const allChecks: PipelineCheck[] = [...fraudChecks, ...rewardChecks, ...attributionChecks];
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
    console.error('[referral-pipeline] Unhandled error:', err);
    return jsonResp({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
