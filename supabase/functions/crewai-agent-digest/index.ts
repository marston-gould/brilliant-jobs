/**
 * crewai-agent-digest — Edge Function
 * SA-012: Daily Agent Digest Email
 * ADR-05: CrewAI Architecture
 *
 * Scheduled via pg_cron at 8am ET (12:00 UTC) daily.
 * Gathers 24h agent metrics via fn_agent_daily_digest(),
 * graduation readiness via fn_evaluate_agent_graduation(),
 * and sends a formatted digest email via send-notification.
 *
 * Also callable manually from admin panel for on-demand digest.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALERT_EMAIL = Deno.env.get('ALERT_EMAIL') || 'marston@brilliantjobs.app';
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

// ── Email HTML Builder ──
function buildDigestHtml(digest: Record<string, unknown>, graduations: Record<string, unknown>[]): string {
  const agents = (digest.agents || []) as Record<string, unknown>[];
  const gradEvents = (digest.graduation_events || []) as Record<string, unknown>[];
  const alertCount = (digest.alert_count || 0) as number;
  const generatedAt = new Date(digest.generated_at as string).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const alertBanner = alertCount > 0
    ? `<div style="background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;padding:16px;margin-bottom:24px">
        <strong style="color:#DC2626">⚠ ${alertCount} critical finding${alertCount > 1 ? 's' : ''} in the last 24 hours</strong>
        <p style="color:#7F1D1D;margin:4px 0 0">Review the admin panel for details.</p>
      </div>`
    : '';

  // Agent summary rows
  const agentRows = agents.map((a) => {
    const trustBadgeColor: Record<string, string> = {
      observe: '#6B7280',
      suggest: '#3B82F6',
      auto_with_approval: '#F59E0B',
      autonomous: '#10B981',
    };
    const badgeColor = trustBadgeColor[(a.trust_level as string) || 'observe'] || '#6B7280';
    const statusDot = a.enabled
      ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10B981;margin-right:6px"></span>'
      : '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#EF4444;margin-right:6px"></span>';

    const errorNote = (a.errors_24h as number) > 0
      ? `<span style="color:#DC2626;font-weight:600">${a.errors_24h} errors</span>`
      : '<span style="color:#10B981">0 errors</span>';

    const confPct = a.avg_confidence
      ? ((a.avg_confidence as number) * 100).toFixed(1) + '%'
      : '—';

    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB">
        ${statusDot}<strong>${a.display_name}</strong>
        <span style="display:inline-block;background:${badgeColor}20;color:${badgeColor};font-size:11px;padding:2px 8px;border-radius:12px;margin-left:6px">${(a.trust_level as string || '').replace(/_/g, ' ')}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;text-align:center">${a.actions_24h}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;text-align:center">${confPct}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;text-align:center">${errorNote}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;text-align:center">${a.overrides_24h}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;text-align:center">${a.critical_findings || 0}</td>
    </tr>`;
  }).join('');

  // Graduation readiness section
  const gradRows = graduations.map((g) => {
    const eligible = g.eligible as boolean;
    const icon = eligible ? '✅' : '⏳';
    const blockerText = (g.blockers as string[])?.length > 0
      ? (g.blockers as string[]).map(b => `<li style="color:#6B7280;font-size:12px">${b}</li>`).join('')
      : '<li style="color:#10B981;font-size:12px">All criteria met</li>';

    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB">
        ${icon} <strong>${g.display_name}</strong>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB">${g.current_level} → ${g.next_level || '—'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB">${g.days_in_level}d</td>
      <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB">${g.total_actions}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB"><ul style="margin:0;padding-left:16px">${blockerText}</ul></td>
    </tr>`;
  }).join('');

  // Graduation events in the past 24h
  const gradEventRows = gradEvents.length > 0
    ? gradEvents.map((e) => `<li style="margin:4px 0">
        <strong>${e.display_name}</strong>: ${e.from_level} → ${e.to_level} (${e.reason})
      </li>`).join('')
    : '<li style="color:#6B7280">No graduations in the last 24 hours.</li>';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1F2937;max-width:700px;margin:0 auto;padding:20px">

<div style="background:linear-gradient(135deg,#1E293B,#334155);border-radius:12px;padding:24px;margin-bottom:24px">
  <h1 style="color:#F8FAFC;margin:0;font-size:22px">🤖 CrewAI Daily Digest</h1>
  <p style="color:#94A3B8;margin:4px 0 0;font-size:13px">${generatedAt} • ${digest.active_agents} of ${digest.total_agents} agents active</p>
</div>

${alertBanner}

<h2 style="font-size:16px;color:#1E293B;border-bottom:2px solid #E5E7EB;padding-bottom:8px">Agent Performance (24h)</h2>
<table style="width:100%;border-collapse:collapse;font-size:13px">
  <thead>
    <tr style="background:#F9FAFB">
      <th style="padding:10px 12px;text-align:left;font-weight:600">Agent</th>
      <th style="padding:10px 12px;text-align:center;font-weight:600">Actions</th>
      <th style="padding:10px 12px;text-align:center;font-weight:600">Avg Conf.</th>
      <th style="padding:10px 12px;text-align:center;font-weight:600">Errors</th>
      <th style="padding:10px 12px;text-align:center;font-weight:600">Overrides</th>
      <th style="padding:10px 12px;text-align:center;font-weight:600">Critical</th>
    </tr>
  </thead>
  <tbody>${agentRows}</tbody>
</table>

<h2 style="font-size:16px;color:#1E293B;border-bottom:2px solid #E5E7EB;padding-bottom:8px;margin-top:32px">Graduation Readiness</h2>
<table style="width:100%;border-collapse:collapse;font-size:13px">
  <thead>
    <tr style="background:#F9FAFB">
      <th style="padding:10px 12px;text-align:left;font-weight:600">Agent</th>
      <th style="padding:10px 12px;text-align:left;font-weight:600">Transition</th>
      <th style="padding:10px 12px;text-align:left;font-weight:600">Days</th>
      <th style="padding:10px 12px;text-align:left;font-weight:600">Actions</th>
      <th style="padding:10px 12px;text-align:left;font-weight:600">Status</th>
    </tr>
  </thead>
  <tbody>${gradRows}</tbody>
</table>

<h2 style="font-size:16px;color:#1E293B;border-bottom:2px solid #E5E7EB;padding-bottom:8px;margin-top:32px">Graduation Events (24h)</h2>
<ul style="padding-left:20px;font-size:13px">${gradEventRows}</ul>

<div style="margin-top:32px;padding:16px;background:#F9FAFB;border-radius:8px;text-align:center">
  <a href="https://brilliantjobs.app/admin#crewai" style="color:#3B82F6;text-decoration:none;font-weight:600">Open CrewAI Admin Panel →</a>
</div>

<p style="color:#9CA3AF;font-size:11px;text-align:center;margin-top:24px">
  Brilliant Jobs • CrewAI Agent Framework • SA-012
</p>

</body>
</html>`;
}

Deno.serve(async (req) => {
  // EMAIL KILL SWITCH — set EMAIL_ENABLED=false in Supabase secrets to disable all outbound email
  if (Deno.env.get("EMAIL_ENABLED") === "false") {
    console.log("[email] EMAIL_ENABLED=false — email suppressed");
    return false;
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const logger = createLogger('crewai-agent-digest', crypto.randomUUID());

  try {
    // 1. Gather digest data
    const { data: digestData, error: digestErr } = await sb.rpc('fn_agent_daily_digest');
    if (digestErr) throw digestErr;

    const digest = digestData as Record<string, unknown>;

    // 2. Gather graduation readiness
    const { data: gradData, error: gradErr } = await sb.rpc('fn_evaluate_agent_graduation', { p_agent_id: null });
    if (gradErr) throw gradErr;

    const graduations = (gradData || []) as Record<string, unknown>[];

    // 3. Build HTML
    const html = buildDigestHtml(digest, graduations);
    const alertCount = (digest.alert_count || 0) as number;
    const subject = alertCount > 0
      ? `🚨 CrewAI Digest: ${alertCount} critical finding${alertCount > 1 ? 's' : ''}`
      : `🤖 CrewAI Daily Digest — ${(digest.active_agents || 0)} agents active`;

    // 4. Find admin user(s) — send to anyone with admin role
    const { data: adminUsers, error: adminErr } = await sb
      .from('profiles')
      .select('id')
      .eq('role', 'admin');

    if (adminErr) {
      logger.warn(`Could not fetch admin users: ${adminErr.message}. Falling back to email.`);
    }

    const recipients = (adminUsers || []).map((u: { id: string }) => u.id);

    if (recipients.length === 0) {
      // Fallback: send directly via Resend if no admin users found
      logger.warn('No admin users found — sending digest via direct email');

      const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
      if (RESEND_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${RESEND_KEY}`,
          },
          body: JSON.stringify({
            from: 'Brilliant Jobs <notifications@brilliantjobs.app>',
            to: [ALERT_EMAIL],
            subject,
            html,
          }),
        });
        logger.info(`Digest sent directly to ${ALERT_EMAIL}`);
      }
    } else {
      // Send via send-notification for each admin
      for (const userId of recipients) {
        try {
          await fetch(`${SB_URL}/functions/v1/send-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${SB_KEY}`,
            },
            body: JSON.stringify({
              user_id: userId,
              notification_type: 'crewai_daily_digest',
              subject,
              html,
              force_channel: 'email',
            }),
          });
          logger.info(`Digest sent to admin ${userId}`);
        } catch (e) {
          logger.warn(`Failed to send digest to ${userId}: ${e}`);
        }
      }
    }

    // 5. Log the digest send
    await sb.from('agent_action_log').insert({
      agent_id: 'system',
      action_type: 'daily_digest',
      trust_level: 'system',
      target_type: 'email',
      target: ALERT_EMAIL,
      result: {
        recipients: recipients.length || 1,
        alert_count: alertCount,
        agents_reported: (digest.agents as unknown[])?.length || 0,
      },
      confidence: 1.0,
      executed: true,
    });

    return jsonResp({
      ok: true,
      message: 'Digest sent',
      recipients: recipients.length || 1,
      alert_count: alertCount,
      subject,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Digest error: ${msg}`);
    return jsonResp({ ok: false, error: msg }, 500);
  }
});
