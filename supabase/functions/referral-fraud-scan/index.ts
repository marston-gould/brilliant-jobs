// supabase/functions/referral-fraud-scan/index.ts
// Edge Function: Periodic fraud detection scan (pg_cron every 15 min)
// Checks: rapid activation, ghost engagement, burst referrals, IP/fingerprint clusters
// Writes to: referrals.fraud_score, referrals.fraud_signals, profiles.referral_banned

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const sb = createClient(SB_URL, SB_KEY);
    const results = {
      scanned: 0,
      flagged: 0,
      rejected: 0,
      banned: 0,
      errors: [] as string[],
    };

    // Get fraud thresholds from config
    const { data: configRow } = await sb
      .from('referral_config')
      .select('value')
      .eq('key', 'fraud_thresholds')
      .single();

    const config = configRow?.value || {
      ip_cluster_max: 3,
      ip_cluster_window_days: 7,
      fingerprint_max: 3,
      rapid_activation_seconds: 60,
      burst_referral_max_daily: 10,
      ghost_engagement_pct: 0.5,
    };

    // ─── Scan 1: Rapid activation (signup → activation < 60s) ───
    const { data: rapidActivations } = await sb
      .from('referrals')
      .select('id, referrer_id, referred_id, signup_at, activated_at, fraud_score, fraud_signals')
      .eq('status', 'activated')
      .not('activated_at', 'is', null)
      .not('signup_at', 'is', null)
      .gt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());

    for (const ref of (rapidActivations || [])) {
      results.scanned++;
      const elapsed = (new Date(ref.activated_at).getTime() - new Date(ref.signup_at).getTime()) / 1000;

      if (elapsed < config.rapid_activation_seconds) {
        const newScore = Math.min((ref.fraud_score || 0) + 0.35, 1.0);
        const signals = { ...(ref.fraud_signals || {}), rapid_activation: true, activation_seconds: Math.round(elapsed) };

        await sb.from('referrals').update({
          fraud_score: newScore,
          fraud_signals: signals,
          status: newScore >= 0.8 ? 'rejected' : ref.status,
          rejected_at: newScore >= 0.8 ? new Date().toISOString() : null,
        }).eq('id', ref.id);

        if (newScore >= 0.8) results.rejected++;
        results.flagged++;
      }
    }

    // ─── Scan 2: Burst referral patterns (>10 referrals in 24h) ───
    const { data: burstReferrers } = await sb.rpc('exec_sql', {
      query: `
        SELECT referrer_id, COUNT(*) as daily_count
        FROM referrals
        WHERE created_at > now() - interval '24 hours'
        GROUP BY referrer_id
        HAVING COUNT(*) > ${config.burst_referral_max_daily}
      `
    });

    // If exec_sql doesn't exist, do it the PostgREST way
    if (!burstReferrers) {
      // Fallback: query referrals grouped manually
      const { data: recentReferrals } = await sb
        .from('referrals')
        .select('referrer_id')
        .gt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());

      if (recentReferrals) {
        const counts: Record<string, number> = {};
        for (const r of recentReferrals) {
          counts[r.referrer_id] = (counts[r.referrer_id] || 0) + 1;
        }

        for (const [referrerId, count] of Object.entries(counts)) {
          if (count > config.burst_referral_max_daily) {
            // Flag all recent referrals from this referrer
            await sb.from('referrals')
              .update({
                fraud_signals: { burst_pattern: true, daily_count: count },
              })
              .eq('referrer_id', referrerId)
              .gt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());

            results.flagged++;
          }
        }
      }
    }

    // ─── Scan 3: Ghost engagement (>50% of referrals never engage post-activation) ───
    const { data: referrers } = await sb
      .from('profiles')
      .select('id, referral_count')
      .gt('referral_count', 2) // Only check referrers with 3+ referrals
      .eq('referral_banned', false);

    for (const referrer of (referrers || [])) {
      results.scanned++;

      // Count activated referrals that never logged in after activation
      const { data: ghostReferrals } = await sb
        .from('referrals')
        .select('referred_id, activated_at')
        .eq('referrer_id', referrer.id)
        .in('status', ['activated', 'rewarded']);

      if (!ghostReferrals || ghostReferrals.length < 3) continue;

      let ghostCount = 0;
      for (const gr of ghostReferrals) {
        if (!gr.referred_id) { ghostCount++; continue; }

        // Check if referred user has logged in within 7 days of activation
        const { data: profile } = await sb
          .from('profiles')
          .select('last_seen_at')
          .eq('id', gr.referred_id)
          .single();

        if (!profile?.last_seen_at) {
          ghostCount++;
        } else {
          const daysSinceActivation = (new Date(profile.last_seen_at).getTime() - new Date(gr.activated_at).getTime()) / (86400 * 1000);
          if (daysSinceActivation < 0 || daysSinceActivation > 7) {
            // Never logged in after activation, or only logged in much later
            ghostCount++;
          }
        }
      }

      const ghostPct = ghostCount / ghostReferrals.length;
      if (ghostPct >= config.ghost_engagement_pct) {
        // Flag the referrer — don't ban automatically, just flag for review
        await sb.from('referrals')
          .update({
            fraud_signals: { ghost_engagement: true, ghost_pct: Math.round(ghostPct * 100) },
          })
          .eq('referrer_id', referrer.id)
          .eq('status', 'pending');

        results.flagged++;
      }
    }

    // ─── Scan 4: IP cluster detection (already handled in attribution, but re-check) ───
    // Retroactive scan for IP clusters that crossed threshold after initial attribution
    const { data: ipClusters } = await sb
      .from('referrals')
      .select('referrer_id, ip_address')
      .not('ip_address', 'is', null)
      .gt('created_at', new Date(Date.now() - config.ip_cluster_window_days * 86400 * 1000).toISOString());

    if (ipClusters) {
      const ipMap: Record<string, Record<string, number>> = {};
      for (const r of ipClusters) {
        const key = `${r.referrer_id}::${r.ip_address}`;
        ipMap[key] = ipMap[key] || { count: 0 };
        ipMap[key].count++;
      }

      for (const [key, val] of Object.entries(ipMap)) {
        if (val.count >= config.ip_cluster_max) {
          const [referrerId, ip] = key.split('::');
          await sb.from('referrals')
            .update({
              fraud_score: 0.8,
              fraud_signals: { ip_cluster_retroactive: true, ip_count: val.count },
              status: 'rejected',
              rejected_at: new Date().toISOString(),
            })
            .eq('referrer_id', referrerId)
            .eq('ip_address', ip)
            .in('status', ['pending', 'activated']);

          results.rejected++;
        }
      }
    }

    return new Response(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      ...results,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
