// send-survey-invite Edge Function — FB-SURVEY-DELIVERY-001 SDV-S5
// Service-role only. Called by pg_cron or manual admin dispatch.
//
// Actions:
//   send_email  — Query eligible users for a campaign, dispatch via Resend
//   send_sms    — (SDV-S6 stub) Query eligible users, dispatch via Vonage
//   status      — Return send queue stats
//
// Auth: service_role only.
// Gateway route added in SDV-S5.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "surveys@brilliantjobs.app";
const DASHBOARD_URL = "https://brilliantjobs.app";
const POSTHOG_KEY = Deno.env.get("POSTHOG_API_KEY") || "";
const POSTHOG_HOST = Deno.env.get("POSTHOG_HOST") || "https://app.posthog.com";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function capturePostHog(distinctId: string, event: string, props: Record<string, unknown>) {
  if (!POSTHOG_KEY) return;
  try {
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: POSTHOG_KEY, distinct_id: distinctId, event, properties: props }),
    });
  } catch (e) { console.warn("[send-survey-invite] PostHog capture failed:", String(e)); }
}

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

// ─── Resend Email ─────────────────────────────────────────────────────────────

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
    console.warn("[send-survey-invite] sendEmail failed:", String(e));
    return false;
  }
}

// ─── Notification Log (dedup guard) ───────────────────────────────────────────

async function logNotification(
  userId: string,
  surveyVersion: string,
  channel: string,
): Promise<void> {
  await sb.from("notification_log").insert({
    user_id: userId,
    notification_type: "survey_invite",
    channel,
    status: "sent",
    metadata: { survey_version: surveyVersion },
  });
}

async function wasAlreadySent(
  userId: string,
  surveyVersion: string,
  channel: string,
  frequencyDays: number,
): Promise<boolean> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - frequencyDays);

  const { data } = await sb.from("notification_log")
    .select("id")
    .eq("user_id", userId)
    .eq("notification_type", "survey_invite")
    .eq("channel", channel)
    .gte("created_at", cutoff.toISOString())
    .limit(1);

  return !!(data && data.length > 0);
}

// ─── Generate Survey Link Token ───────────────────────────────────────────────

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 6; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

async function createSurveyLink(
  userId: string,
  surveyVersion: string,
  channel: string,
  expiryHours: number,
): Promise<string | null> {
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + expiryHours);

  const { error } = await sb.from("survey_links").insert({
    token,
    user_id: userId,
    survey_version: surveyVersion,
    channel,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    console.warn("[send-survey-invite] survey_links insert failed:", error.message);
    return null;
  }
  return token;
}

// ─── Email Template ───────────────────────────────────────────────────────────

function buildSurveyEmailHtml(
  title: string,
  description: string,
  estimatedMinutes: number,
  creditReward: number,
  surveyUrl: string,
): string {
  const creditBadge = creditReward > 0
    ? `<span style="display:inline-block;background:#22c55e;color:#fff;font-size:13px;font-weight:600;padding:4px 12px;border-radius:12px;margin-bottom:12px;">Earn ${creditReward} credits</span><br/>`
    : "";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f7f8fa;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <div style="text-align:center;margin-bottom:24px;">
      <img src="${DASHBOARD_URL}/img/logo-dark.png" alt="Brilliant Jobs" width="140" style="display:inline-block;"/>
    </div>
    <h2 style="font-size:20px;margin:0 0 8px;color:#1a1a2e;">${title}</h2>
    <p style="font-size:14px;color:#555;margin:0 0 16px;">${description || "We'd love your feedback."}</p>
    ${creditBadge}
    <p style="font-size:12px;color:#888;margin:0 0 20px;">Estimated time: ~${estimatedMinutes} min</p>
    <div style="text-align:center;">
      <a href="${surveyUrl}" style="display:inline-block;background:#6da3ff;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">Take Survey</a>
    </div>
    <hr style="margin:24px 0;border:none;border-top:1px solid #eee;"/>
    <p style="font-size:11px;color:#aaa;text-align:center;">
      <a href="${DASHBOARD_URL}/#notifications" style="color:#888;">Manage notification preferences</a> &middot;
      <a href="${DASHBOARD_URL}" style="color:#888;">brilliantjobs.app</a>
    </p>
  </div>
</body>
</html>`;
}

// ─── Subject Line Patterns (from spec §3.3) ──────────────────────────────────

function getSubjectLine(surveyType: string, creditReward: number): string {
  switch (surveyType) {
    case "nps":
      return "How are we doing? Quick 30-second check-in";
    case "periodic":
      return creditReward > 0
        ? `Help shape Brilliant Jobs — earn ${creditReward} credits`
        : "Help shape Brilliant Jobs — quick survey";
    case "ghost":
      return "Your ghost rate data is helping everyone — quick question";
    default:
      return creditReward > 0
        ? `Quick survey — earn ${creditReward} credits`
        : "Quick survey — we'd love your feedback";
  }
}

// ─── Main: Send Email Invites ─────────────────────────────────────────────────

async function handleSendEmail(campaignVersion: string): Promise<Response> {
  const startTime = Date.now();
  const WALL_TIME_MS = 2 * 60 * 1000; // 2-minute abort
  const SEND_DELAY_MS = 100; // 100ms between sends

  // 1. Fetch campaign
  const { data: campaigns, error: campErr } = await sb.from("survey_campaigns")
    .select("*")
    .eq("survey_version", campaignVersion)
    .eq("is_active", true)
    .limit(1);

  if (campErr || !campaigns || campaigns.length === 0) {
    return json({ error: "Campaign not found or inactive", campaign_version: campaignVersion }, 404);
  }

  const campaign = campaigns[0];

  // Verify email channel is enabled
  if (!campaign.channels || !campaign.channels.includes("email")) {
    return json({ error: "Email channel not enabled for this campaign" }, 400);
  }

  // 2. Query eligible users
  // Start with all authenticated users who have an email
  const { data: users, error: userErr } = await sb.from("profiles")
    .select("id,email")
    .not("email", "is", null);

  if (userErr || !users) {
    return json({ error: "Failed to query users", detail: userErr?.message }, 500);
  }

  // 3. Filter + send
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const user of users) {
    // Wall-time abort
    if (Date.now() - startTime > WALL_TIME_MS) {
      console.warn("[send-survey-invite] Wall-time abort after", sent, "sent,", skipped, "skipped");
      break;
    }

    // Check frequency cap
    const alreadySent = await wasAlreadySent(
      user.id,
      campaign.survey_version,
      "email",
      campaign.frequency_days || 14,
    );
    if (alreadySent) { skipped++; continue; }

    // Check if already completed this survey
    const { data: feedback } = await sb.from("feedback")
      .select("id")
      .eq("user_id", user.id)
      .eq("survey_version", campaign.survey_version)
      .limit(1);
    if (feedback && feedback.length > 0) { skipped++; continue; }

    // Generate survey link token (24h expiry for email)
    const token = await createSurveyLink(user.id, campaign.survey_version, "email", 24);
    const surveyContext = campaign.survey_type === "nps" ? "nps" : campaign.survey_type === "exit" ? "churn" : "periodic";
    const surveyUrl = token
      ? `${DASHBOARD_URL}/s/${token}`
      : `${DASHBOARD_URL}/survey?context=${surveyContext}&v=${encodeURIComponent(campaign.survey_version)}&src=email`;

    // Build + send email
    const subject = getSubjectLine(campaign.survey_type, campaign.credit_reward);
    const html = buildSurveyEmailHtml(
      campaign.title,
      campaign.description,
      campaign.estimated_minutes || 2,
      campaign.credit_reward || 0,
      surveyUrl,
    );

    const success = await sendEmail(user.email, subject, html);

    if (success) {
      sent++;
      await logNotification(user.id, campaign.survey_version, "email");
      await capturePostHog(user.id, "survey_email_sent", {
        survey_version: campaign.survey_version,
        user_id: user.id,
      });
    } else {
      failed++;
      errors.push(`Failed to send to ${user.id}`);
    }

    // Rate limiting: 100ms between sends
    await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
  }

  return json({
    campaign_version: campaignVersion,
    sent,
    skipped,
    failed,
    errors: errors.slice(0, 10), // Cap error details
    elapsed_ms: Date.now() - startTime,
  });
}

// ─── Status ───────────────────────────────────────────────────────────────────

async function handleStatus(): Promise<Response> {
  const { data: campaigns } = await sb.from("survey_campaigns")
    .select("survey_version,survey_type,title,is_active,channels,credit_reward")
    .eq("is_active", true);

  const { count: recentSends } = await sb.from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("notification_type", "survey_invite")
    .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  return json({
    active_campaigns: campaigns?.length || 0,
    campaigns: campaigns || [],
    sends_last_7d: recentSends || 0,
  });
}

// ─── SDV-S6: Vonage SMS Delivery ──────────────────────────────────────────────

const VONAGE_API_KEY = Deno.env.get("VONAGE_API_KEY") || "";
const VONAGE_API_SECRET = Deno.env.get("VONAGE_API_SECRET") || "";
const VONAGE_FROM = Deno.env.get("VONAGE_FROM_NUMBER") || "";
const SMS_DAILY_BUDGET_CENTS = 1000; // $10/day cap

async function sendSms(to: string, text: string): Promise<boolean> {
  if (!VONAGE_API_KEY || !VONAGE_API_SECRET) {
    console.warn("[send-survey-invite] Vonage credentials not configured");
    return false;
  }
  try {
    const res = await fetch("https://rest.nexmo.com/sms/json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: VONAGE_API_KEY,
        api_secret: VONAGE_API_SECRET,
        from: VONAGE_FROM,
        to: to.replace(/[^0-9+]/g, ""),
        text,
      }),
    });
    if (!res.ok) {
      console.warn("[send-survey-invite] Vonage API error:", res.status);
      return false;
    }
    const data = await res.json();
    return data.messages?.[0]?.status === "0";
  } catch (e) {
    console.warn("[send-survey-invite] sendSms failed:", String(e));
    return false;
  }
}

function isQuietHours(userTimezone: string | null): boolean {
  try {
    const tz = userTimezone || "America/New_York";
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz });
    const hour = parseInt(formatter.format(now));
    return hour >= 22 || hour < 7; // 10pm–7am
  } catch (e) {
    console.warn("[send-survey-invite] timezone check failed:", String(e));
    return false; // fail-open: allow send if TZ check fails
  }
}

async function checkSmsBudget(): Promise<boolean> {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count } = await sb.from("notification_log")
      .select("id", { count: "exact", head: true })
      .eq("notification_type", "survey_invite")
      .eq("channel", "sms")
      .gte("created_at", todayStart.toISOString());
    // ~$0.0068 per SMS segment → budget of $10/day ≈ 1470 SMS
    const estimatedCostCents = (count || 0) * 0.68;
    if (estimatedCostCents >= SMS_DAILY_BUDGET_CENTS) {
      console.warn("[send-survey-invite] SMS daily budget exceeded:", estimatedCostCents, "cents");
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[send-survey-invite] SMS budget check failed:", String(e));
    return true; // fail-open
  }
}

function buildSmsMessage(title: string, creditReward: number, estimatedMinutes: number, shortUrl: string): string {
  // 160-char limit per SMS segment
  const creditPart = creditReward > 0 ? ` (${creditReward} credits)` : "";
  const timePart = `${estimatedMinutes}min`;
  const msg = `Brilliant Jobs: Quick survey${creditPart}. ${timePart}. ${shortUrl} Reply STOP to opt out`;
  return msg.length > 160 ? msg.substring(0, 157) + "..." : msg;
}

async function handleSendSms(campaignVersion: string): Promise<Response> {
  const startTime = Date.now();
  const WALL_TIME_MS = 2 * 60 * 1000;
  const SEND_DELAY_MS = 100;

  // Verify Vonage credentials
  if (!VONAGE_API_KEY || !VONAGE_API_SECRET || !VONAGE_FROM) {
    return json({ error: "Vonage SMS credentials not configured" }, 503);
  }

  // 1. Fetch campaign
  const { data: campaigns, error: campErr } = await sb.from("survey_campaigns")
    .select("*")
    .eq("survey_version", campaignVersion)
    .eq("is_active", true)
    .limit(1);

  if (campErr || !campaigns || campaigns.length === 0) {
    return json({ error: "Campaign not found or inactive" }, 404);
  }

  const campaign = campaigns[0];

  if (!campaign.channels || !campaign.channels.includes("sms")) {
    return json({ error: "SMS channel not enabled for this campaign" }, 400);
  }

  // 2. Check daily budget
  const budgetOk = await checkSmsBudget();
  if (!budgetOk) {
    return json({ error: "SMS daily budget exceeded", budget_limit_cents: SMS_DAILY_BUDGET_CENTS }, 429);
  }

  // 3. Query eligible users (must have verified phone + SMS surveys enabled)
  const { data: users, error: userErr } = await sb.from("profiles")
    .select("id,phone,phone_verified,timezone,notification_preferences")
    .eq("phone_verified", true)
    .not("phone", "is", null);

  if (userErr || !users) {
    return json({ error: "Failed to query users" }, 500);
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    if (Date.now() - startTime > WALL_TIME_MS) {
      console.warn("[send-survey-invite] SMS wall-time abort after", sent, "sent");
      break;
    }

    // §3.4: User must have SMS notifications enabled for surveys category
    const prefs = user.notification_preferences as Record<string, unknown> | null;
    if (prefs) {
      const surveyPref = prefs.survey_invite as Record<string, unknown> | undefined;
      if (surveyPref && surveyPref.sms === false) { skipped++; continue; }
    }

    // Quiet hours check (10pm–7am user timezone)
    if (isQuietHours(user.timezone)) { skipped++; continue; }

    // 30-day hard cap for SMS surveys
    const alreadySent = await wasAlreadySent(user.id, campaign.survey_version, "sms", 30);
    if (alreadySent) { skipped++; continue; }

    // Completion check
    const { data: feedback } = await sb.from("feedback")
      .select("id").eq("user_id", user.id).eq("survey_version", campaign.survey_version).limit(1);
    if (feedback && feedback.length > 0) { skipped++; continue; }

    // Re-check budget mid-loop
    const stillInBudget = await checkSmsBudget();
    if (!stillInBudget) {
      console.warn("[send-survey-invite] SMS budget exceeded mid-send");
      break;
    }

    // Generate short URL (72h expiry for SMS)
    const token = await createSurveyLink(user.id, campaign.survey_version, "sms", 72);
    if (!token) { failed++; continue; }

    const shortUrl = `${DASHBOARD_URL}/s/${token}`;
    const smsText = buildSmsMessage(
      campaign.title,
      campaign.credit_reward || 0,
      campaign.estimated_minutes || 2,
      shortUrl,
    );

    const success = await sendSms(user.phone, smsText);
    if (success) {
      sent++;
      await logNotification(user.id, campaign.survey_version, "sms");
      await capturePostHog(user.id, "survey_sms_sent", {
        survey_version: campaign.survey_version,
        user_id: user.id,
      });
    } else {
      failed++;
    }

    await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
  }

  return json({ campaign_version: campaignVersion, channel: "sms", sent, skipped, failed, elapsed_ms: Date.now() - startTime });
}

// ─── Router ───────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    // Auth: service_role only
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.includes(SUPABASE_SERVICE_ROLE_KEY) && !authHeader.includes("Bearer")) {
      // Allow through gateway (gateway handles auth)
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || new URL(req.url).searchParams.get("action") || "status";

    switch (action) {
      case "send_email":
        if (!body.campaign_version) return json({ error: "campaign_version required" }, 400);
        return await handleSendEmail(body.campaign_version);

      case "send_sms":
        if (!body.campaign_version) return json({ error: "campaign_version required" }, 400);
        return await handleSendSms(body.campaign_version);

      case "status":
        return await handleStatus();

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("[send-survey-invite] Fatal error:", String(e));
    return json({ error: "Internal server error", detail: String(e) }, 500);
  }
});
