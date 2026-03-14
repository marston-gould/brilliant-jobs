// send-trial-notifications Edge Function — FB-TRIAL-001-S5
// Service-role only. Called by pg_cron or other EFs.
//
// Actions:
//   trial_expiring      — Countdown emails at 5d, 3d, 1d marks for user_state='trialing'
//   expired_nudge       — "Your trial has expired" email for users expired within last 24h
//   expired_nudge_30d   — 30-day post-expiry re-engagement email
//   sample_reminder     — "X free samples left" after first sample used (day 10 post-expiry)
//   referral_signup     — Fires to referrer when referred user signs up
//   referral_converted  — Fires to both parties on referred user conversion
//
// Auth: service_role only (SUPABASE_SERVICE_ROLE_KEY). No user JWT accepted.
//
// Gateway route #117 (FB-TRIAL-001-S5).

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "notifications@brilliantjobs.app";
const DASHBOARD_URL = "https://brilliantjobs.app";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "https://brilliantjobs.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// ─── Resend send helper ───
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
    return res.ok;
  } catch (e) {
    console.warn("[send-trial-notifications] sendEmail failed:", String(e));
    return false;
  }
}

// ─── Log to notification_log (dedup guard) ───
async function logNotification(
  userId: string,
  notificationType: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await sb.from("notification_log").insert({
    user_id: userId,
    notification_type: notificationType,
    channel: "email",
    status: "sent",
    metadata,
  });
}

// ─── Check if notification already sent ───
async function alreadySent(
  userId: string,
  notificationType: string,
  since?: string
): Promise<boolean> {
  let q = sb
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("notification_type", notificationType);
  if (since) q = q.gte("created_at", since);
  const { count } = await q;
  return (count || 0) > 0;
}

// ─── Fetch template from notification_templates ───
async function getTemplate(
  templateId: string
): Promise<{ subject_line: string; html_body: string; sms_body?: string } | null> {
  const { data } = await sb
    .from("notification_templates")
    .select("subject_line, html_body, sms_body")
    .eq("notification_type", templateId)
    .eq("channel", "email")
    .eq("active", true)
    .single();
  return data || null;
}

// ─── Template variable interpolation ───
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ─── Inline fallback HTML builder ───
function buildEmailHtml(
  headline: string,
  body: string,
  ctaLabel: string,
  ctaUrl: string
): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#0e1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e2e8f0;}
  .wrap{max-width:520px;margin:40px auto;padding:0 20px;}
  .card{background:#1a1d27;border:1px solid #2a2d35;border-radius:12px;padding:32px;}
  h2{margin:0 0 12px;font-size:20px;color:#f0f1f3;font-weight:600;}
  p{margin:0 0 16px;font-size:14px;line-height:1.6;color:#94a3b8;}
  .cta{display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-top:8px;}
  .footer{margin-top:24px;font-size:11px;color:#475569;text-align:center;}
  @media(prefers-color-scheme:dark){body{background:#0e1117;}}
</style></head><body>
<div class="wrap">
  <div class="card">
    <h2>${headline}</h2>
    ${body}
    <a href="${ctaUrl}" class="cta">${ctaLabel}</a>
  </div>
  <div class="footer">Brilliant Jobs · <a href="${DASHBOARD_URL}/unsubscribe" style="color:#475569;">Unsubscribe</a></div>
</div>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════
// ACTION: trial_expiring — sends at 5d, 3d, 1d marks
// ═══════════════════════════════════════════════════════════
async function handleTrialExpiring(): Promise<{ sent: number; skipped: number }> {
  const now = new Date();
  let sent = 0;
  let skipped = 0;

  // Windows: [daysOut, templateId, windowHours]
  const windows: Array<[number, string, number]> = [
    [5, "trial_expiring_5d", 12],
    [3, "trial_expiring_3d", 12],
    [1, "trial_expiring_1d", 12],
  ];

  for (const [daysOut, templateId, windowHours] of windows) {
    const windowStart = new Date(now.getTime() + (daysOut - 0.5) * 86400_000).toISOString();
    const windowEnd = new Date(now.getTime() + (daysOut + 0.5) * 86400_000).toISOString();

    const { data: users } = await sb
      .from("profiles")
      .select("id, trial_expires_at")
      .eq("user_state", "trialing")
      .gte("trial_expires_at", windowStart)
      .lte("trial_expires_at", windowEnd);

    for (const user of users || []) {
      const dedupeWindow = new Date(now.getTime() - windowHours * 3600_000).toISOString();
      const dup = await alreadySent(user.id, templateId, dedupeWindow);
      if (dup) { skipped++; continue; }

      // Get user email
      const { data: authUser } = await sb.auth.admin.getUserById(user.id);
      if (!authUser?.user?.email) { skipped++; continue; }

      const expiresAt = new Date(user.trial_expires_at);
      const expiresStr = expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric" });

      const tpl = await getTemplate(templateId);
      let subject: string;
      let html: string;

      if (tpl) {
        const vars = { days: String(daysOut), expires_date: expiresStr, upgrade_url: `${DASHBOARD_URL}/upgrade` };
        subject = interpolate(tpl.subject_line, vars);
        html = interpolate(tpl.html_body, vars);
      } else {
        subject = `Your trial ends in ${daysOut} day${daysOut > 1 ? "s" : ""}`;
        const body = `<p>Your Brilliant Jobs trial expires on <strong>${expiresStr}</strong>.</p><p>Upgrade now to keep access to AI job matching, resume scoring, auto-apply, and more.</p>`;
        html = buildEmailHtml(
          `${daysOut} day${daysOut > 1 ? "s" : ""} left in your trial`,
          body,
          "Upgrade Now",
          `${DASHBOARD_URL}/upgrade`
        );
      }

      const ok = await sendEmail(authUser.user.email, subject, html);
      if (ok) {
        await logNotification(user.id, templateId, { days_out: daysOut, expires_at: user.trial_expires_at });
        sent++;
      } else {
        skipped++;
      }
    }
  }

  return { sent, skipped };
}

// ═══════════════════════════════════════════════════════════
// ACTION: expired_nudge — fires to users expired within last 24h
// ═══════════════════════════════════════════════════════════
async function handleExpiredNudge(): Promise<{ sent: number; skipped: number }> {
  const now = new Date();
  const window24hAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
  let sent = 0;
  let skipped = 0;

  const { data: users } = await sb
    .from("profiles")
    .select("id, trial_expires_at, feature_samples_used")
    .eq("user_state", "expired_free")
    .gte("trial_expires_at", window24hAgo)
    .lte("trial_expires_at", now.toISOString());

  for (const user of users || []) {
    const dup = await alreadySent(user.id, "trial_expired");
    if (dup) { skipped++; continue; }

    const { data: authUser } = await sb.auth.admin.getUserById(user.id);
    if (!authUser?.user?.email) { skipped++; continue; }

    const samplesUsed = user.feature_samples_used || {};
    const samplesLeft = Object.values(samplesUsed).filter((v: unknown) => !v).length;

    const tpl = await getTemplate("trial_expired");
    let subject: string;
    let html: string;

    if (tpl) {
      const vars = { samples_left: String(samplesLeft), upgrade_url: `${DASHBOARD_URL}/upgrade` };
      subject = interpolate(tpl.subject_line, vars);
      html = interpolate(tpl.html_body, vars);
    } else {
      subject = "Your Brilliant Jobs trial has ended";
      const body = `<p>Your free trial has ended. You still have <strong>1 free use of each Pro feature</strong> waiting for you.</p><p>Browse jobs anytime, and use your free samples to try AI chat, resume scoring, and more before deciding to upgrade.</p>`;
      html = buildEmailHtml(
        "Your trial has ended",
        body,
        "Upgrade to Pro",
        `${DASHBOARD_URL}/upgrade`
      );
    }

    const ok = await sendEmail(authUser.user.email, subject, html);
    if (ok) {
      await logNotification(user.id, "trial_expired", { expired_at: user.trial_expires_at });
      sent++;
    } else {
      skipped++;
    }
  }

  return { sent, skipped };
}

// ═══════════════════════════════════════════════════════════
// ACTION: expired_nudge_30d — 30-day post-expiry re-engagement
// ═══════════════════════════════════════════════════════════
async function handleExpiredNudge30d(): Promise<{ sent: number; skipped: number }> {
  const now = new Date();
  const window30dAgo = new Date(now.getTime() - 31 * 86400_000).toISOString();
  const window29dAgo = new Date(now.getTime() - 29 * 86400_000).toISOString();
  let sent = 0;
  let skipped = 0;

  const { data: users } = await sb
    .from("profiles")
    .select("id, trial_expires_at")
    .eq("user_state", "expired_free")
    .gte("trial_expires_at", window30dAgo)
    .lte("trial_expires_at", window29dAgo);

  for (const user of users || []) {
    const dup = await alreadySent(user.id, "trial_expired_30d");
    if (dup) { skipped++; continue; }

    const { data: authUser } = await sb.auth.admin.getUserById(user.id);
    if (!authUser?.user?.email) { skipped++; continue; }

    // Count saved filters for personalization
    const { count: filterCount } = await sb
      .from("user_filters")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    const tpl = await getTemplate("trial_expired_30d");
    let subject: string;
    let html: string;

    if (tpl) {
      const vars = {
        filter_count: String(filterCount || 0),
        upgrade_url: `${DASHBOARD_URL}/upgrade`,
      };
      subject = interpolate(tpl.subject_line, vars);
      html = interpolate(tpl.html_body, vars);
    } else {
      subject = "Jobs are still waiting for you";
      const filterLine = filterCount && filterCount > 0
        ? `<p>You have <strong>${filterCount} saved filter${filterCount > 1 ? "s" : ""}</strong> still tracking matching jobs.</p>`
        : "";
      const body = `${filterLine}<p>It's been 30 days since your trial ended. Upgrade to Pro to unlock AI job matching, resume scoring, and auto-apply.</p>`;
      html = buildEmailHtml(
        "Still tracking jobs for you",
        body,
        "Upgrade to Pro",
        `${DASHBOARD_URL}/upgrade`
      );
    }

    const ok = await sendEmail(authUser.user.email, subject, html);
    if (ok) {
      await logNotification(user.id, "trial_expired_30d", { expires_at: user.trial_expires_at });
      sent++;
    } else {
      skipped++;
    }
  }

  return { sent, skipped };
}

// ═══════════════════════════════════════════════════════════
// ACTION: sample_reminder — day 10 post-expiry, if no samples used
// ═══════════════════════════════════════════════════════════
async function handleSampleReminder(): Promise<{ sent: number; skipped: number }> {
  const now = new Date();
  const window10dAgo = new Date(now.getTime() - 11 * 86400_000).toISOString();
  const window9dAgo = new Date(now.getTime() - 9 * 86400_000).toISOString();
  let sent = 0;
  let skipped = 0;

  const { data: users } = await sb
    .from("profiles")
    .select("id, trial_expires_at, feature_samples_used")
    .eq("user_state", "expired_free")
    .gte("trial_expires_at", window10dAgo)
    .lte("trial_expires_at", window9dAgo);

  for (const user of users || []) {
    // Only send if no samples consumed
    const samplesUsed = user.feature_samples_used || {};
    const anyConsumed = Object.values(samplesUsed).some(Boolean);
    if (anyConsumed) { skipped++; continue; }

    const dup = await alreadySent(user.id, "sample_used_reminder");
    if (dup) { skipped++; continue; }

    const { data: authUser } = await sb.auth.admin.getUserById(user.id);
    if (!authUser?.user?.email) { skipped++; continue; }

    const tpl = await getTemplate("sample_used_reminder");
    let subject: string;
    let html: string;

    if (tpl) {
      const vars = { upgrade_url: `${DASHBOARD_URL}/upgrade`, dashboard_url: DASHBOARD_URL };
      subject = interpolate(tpl.subject_line, vars);
      html = interpolate(tpl.html_body, vars);
    } else {
      subject = "Your free samples are waiting";
      const body = `<p>You haven't used your free Pro samples yet. Each one gives you a full AI-powered experience:</p><ul style="color:#94a3b8;font-size:14px;line-height:2;"><li>AI job chat</li><li>Resume scoring</li><li>Auto-apply</li></ul><p>Try one — no subscription needed.</p>`;
      html = buildEmailHtml(
        "1 free try on every Pro feature",
        body,
        "Try It Now",
        DASHBOARD_URL
      );
    }

    const ok = await sendEmail(authUser.user.email, subject, html);
    if (ok) {
      await logNotification(user.id, "sample_used_reminder", { expires_at: user.trial_expires_at });
      sent++;
    } else {
      skipped++;
    }
  }

  return { sent, skipped };
}

// ═══════════════════════════════════════════════════════════
// ACTION: referral_signup — fires to referrer when referred user signs up
// Callable from handle-referral-signup EF
// ═══════════════════════════════════════════════════════════
async function handleReferralSignup(body: Record<string, unknown>): Promise<{ sent: number }> {
  const referrerId = body.referrer_id as string;
  const referredId = body.referred_id as string;
  if (!referrerId || !referredId) return { sent: 0 };

  // Dedup: one referral_signup_notify per referred user per referrer
  const { count } = await sb
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", referrerId)
    .eq("notification_type", "referral_signup_notify")
    .eq("metadata->>referred_id", referredId);
  if ((count || 0) > 0) return { sent: 0 };

  const { data: referrerAuth } = await sb.auth.admin.getUserById(referrerId);
  if (!referrerAuth?.user?.email) return { sent: 0 };

  // Get referred user display name
  const { data: referredProfile } = await sb
    .from("profiles")
    .select("display_name")
    .eq("id", referredId)
    .single();
  const referredName = referredProfile?.display_name || "Someone";

  const tpl = await getTemplate("referral_signup_notify");
  let subject: string;
  let html: string;

  if (tpl) {
    const vars = { referred_name: referredName, upgrade_url: `${DASHBOARD_URL}/upgrade` };
    subject = interpolate(tpl.subject_line, vars);
    html = interpolate(tpl.html_body, vars);
  } else {
    subject = `${referredName} signed up via your link`;
    const body = `<p><strong>${referredName}</strong> just signed up using your referral link.</p><p>You'll both get a free week when they subscribe to Pro.</p>`;
    html = buildEmailHtml(
      "Your referral signed up! 🎉",
      body,
      "View Referral Status",
      `${DASHBOARD_URL}/referrals`
    );
  }

  const ok = await sendEmail(referrerAuth.user.email, subject, html);
  if (ok) {
    await logNotification(referrerId, "referral_signup_notify", { referred_id: referredId });
    return { sent: 1 };
  }
  return { sent: 0 };
}

// ═══════════════════════════════════════════════════════════
// ACTION: referral_converted — fires to both parties on conversion
// Callable from stripe-webhook after process-referral-reward
// ═══════════════════════════════════════════════════════════
async function handleReferralConverted(body: Record<string, unknown>): Promise<{ sent: number }> {
  const referrerId = body.referrer_id as string;
  const referredId = body.referred_id as string;
  if (!referrerId || !referredId) return { sent: 0 };

  let sent = 0;

  // ── Fire to referrer ──
  const { count: referrerDup } = await sb
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", referrerId)
    .eq("notification_type", "referral_converted_referrer")
    .eq("metadata->>referred_id", referredId);

  if ((referrerDup || 0) === 0) {
    const { data: referrerAuth } = await sb.auth.admin.getUserById(referrerId);
    if (referrerAuth?.user?.email) {
      const { data: referredProfile } = await sb
        .from("profiles")
        .select("display_name")
        .eq("id", referredId)
        .single();
      const referredName = referredProfile?.display_name || "Your referral";

      const tpl = await getTemplate("referral_converted_referrer");
      let subject: string;
      let html: string;

      if (tpl) {
        const vars = { referred_name: referredName, reward_url: `${DASHBOARD_URL}/billing` };
        subject = interpolate(tpl.subject_line, vars);
        html = interpolate(tpl.html_body, vars);
      } else {
        subject = `${referredName} subscribed — your free week is applied`;
        const body = `<p><strong>${referredName}</strong> just subscribed to Brilliant Jobs Pro.</p><p>Your referral reward (1 free week) has been applied to your account.</p>`;
        html = buildEmailHtml(
          "Referral reward earned! 🎉",
          body,
          "View Your Account",
          `${DASHBOARD_URL}/billing`
        );
      }

      const ok = await sendEmail(referrerAuth.user.email, subject, html);
      if (ok) {
        await logNotification(referrerId, "referral_converted_referrer", { referred_id: referredId });
        sent++;
      }
    }
  }

  // ── Fire to referred (welcome + bonus week) ──
  const { count: referredDup } = await sb
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", referredId)
    .eq("notification_type", "referral_converted_referred");

  if ((referredDup || 0) === 0) {
    const { data: referredAuth } = await sb.auth.admin.getUserById(referredId);
    if (referredAuth?.user?.email) {
      const tpl = await getTemplate("referral_converted_referred");
      let subject: string;
      let html: string;

      if (tpl) {
        const vars = { upgrade_url: `${DASHBOARD_URL}/upgrade`, dashboard_url: DASHBOARD_URL };
        subject = interpolate(tpl.subject_line, vars);
        html = interpolate(tpl.html_body, vars);
      } else {
        subject = "Welcome to Pro — your bonus week is active";
        const body = `<p>You subscribed via a referral link. As a thank you, your first week is on us.</p><p>All Pro features are now unlocked.</p>`;
        html = buildEmailHtml(
          "Welcome to Brilliant Jobs Pro!",
          body,
          "Go to Dashboard",
          DASHBOARD_URL
        );
      }

      const ok = await sendEmail(referredAuth.user.email, subject, html);
      if (ok) {
        await logNotification(referredId, "referral_converted_referred", { referrer_id: referrerId });
        sent++;
      }
    }
  }

  return { sent };
}

// ═══════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  // ── Service-role auth only ──
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (token !== SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "service_role_required" }, 401);
  }

  let body: Record<string, unknown> = {};
  try {
    if (req.method === "POST") {
      body = await req.json();
    }
  } catch (_) {
    // no body
  }

  const url = new URL(req.url);
  const action = (body.action as string) || url.searchParams.get("action") || "";

  try {
    switch (action) {
      case "trial_expiring": {
        const result = await handleTrialExpiring();
        return json({ ok: true, action, ...result });
      }
      case "expired_nudge": {
        const result = await handleExpiredNudge();
        return json({ ok: true, action, ...result });
      }
      case "expired_nudge_30d": {
        const result = await handleExpiredNudge30d();
        return json({ ok: true, action, ...result });
      }
      case "sample_reminder": {
        const result = await handleSampleReminder();
        return json({ ok: true, action, ...result });
      }
      case "referral_signup": {
        const result = await handleReferralSignup(body);
        return json({ ok: true, action, ...result });
      }
      case "referral_converted": {
        const result = await handleReferralConverted(body);
        return json({ ok: true, action, ...result });
      }
      default:
        return json({
          error: "unknown_action",
          valid_actions: [
            "trial_expiring", "expired_nudge", "expired_nudge_30d",
            "sample_reminder", "referral_signup", "referral_converted",
          ],
        }, 400);
    }
  } catch (err) {
    console.error("[send-trial-notifications] unhandled error:", String(err));
    return json({ error: "internal_error", detail: String(err) }, 500);
  }
});
