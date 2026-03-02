// send-notification Edge Function — v3 (Session 2+)
// Core notification sender with classification-based send gates.
// Checks: admin config → classification → double opt-in → preferences → frequency cap → quiet hours
// Then routes to Resend (email) or Vonage REST API (SMS), logs to notification_log with decision.
// v3 adds: quiet hours hold queue (held_notifications table), per-type SMS enforcement

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { fetchWithRetry, TIMEOUT_CONFIGS } from "../_shared/resilience.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const VONAGE_API_KEY = Deno.env.get("VONAGE_API_KEY") || "";
const VONAGE_API_SECRET = Deno.env.get("VONAGE_API_SECRET") || "";
const VONAGE_FROM = Deno.env.get("VONAGE_FROM") || "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "notifications@brilliantjobs.app";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ═══════════════════════════════════════════════════════════
// MESSAGE CLASSIFICATION MAP (79 types → 4 classifications)
// Authoritative reference — mirrors js/admin-notifications.js
// ═══════════════════════════════════════════════════════════
const CLASSIFICATION_MAP: Record<string, string> = {};

// Required transactional: always send, user cannot disable
const REQUIRED_TRANSACTIONAL = [
  "subscription_confirm", "credit_purchase_receipt", "payment_failed",
  "payment_recovered", "plan_change_confirm", "subscription_cancelled",
  "invoice_generated", "refund_processed", "double_opt_in"
];
REQUIRED_TRANSACTIONAL.forEach(t => CLASSIFICATION_MAP[t] = "required_transactional");

// Configurable transactional: default ON, user can adjust cadence
const CONFIGURABLE_TRANSACTIONAL = ["subscription_expiring", "notification_opt_in"];
CONFIGURABLE_TRANSACTIONAL.forEach(t => CLASSIFICATION_MAP[t] = "configurable_transactional");

// Marketing: requires explicit marketing opt-in
const MARKETING = [
  "usage_upgrade_prompt", "credit_cost_comparison", "credit_burn_rate_alert",
  "credit_low_balance", "credit_exhausted", "upgrade_roi_summary",
  "price_lock_warning", "promo_trial", "promo_feature_preview",
  "referral_invite", "referral_sent_confirmation", "referral_status_update",
  "referral_nudge_referee", "referral_conversion", "referral_reward_earned",
  "referral_expiring_reward", "referral_milestone", "referral_periodic_summary",
  "inactive_reengagement",
  "reengagement_14d", "reengagement_30d", "reengagement_60d",
  "monthly_product_update"
];
MARKETING.forEach(t => CLASSIFICATION_MAP[t] = "marketing");

// Everything else is "product"
function getClassification(notificationType: string): string {
  return CLASSIFICATION_MAP[notificationType] || "product";
}

// SMS-allowed types (time-sensitive application process only)
const SMS_ALLOWED_TYPES = new Set([
  "apply_alert", "cv_score_approval", "auth_pending_reminder", "auth_pre_rewrite",
  "pipeline_interview", "interview_reminder", "new_jobs_realtime"
]);

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════
interface NotificationRequest {
  user_id: string;
  notification_type: string;
  subject?: string;
  html?: string;
  text?: string;
  sms_text?: string;
  job_id?: string;
  company_name?: string;
  job_title?: string;
  payload?: Record<string, unknown>;
  force_channel?: "email" | "sms" | "both";
  idempotency_key?: string;
  user_plan?: string;
  user_cohort?: string;
  template_version?: string;
}

interface SendDecision {
  send: boolean;
  reason?: string;
}

interface NotificationResult {
  email_sent: boolean;
  sms_sent: boolean;
  email_error?: string;
  sms_error?: string;
  held_for_quiet_hours: boolean;
  classification: string;
  decision?: string;
  decision_reason?: string;
}

// ═══════════════════════════════════════════════════════════
// CLASSIFICATION-BASED SEND GATE (Deliverable 3)
// ═══════════════════════════════════════════════════════════
async function canSendNotification(
  userId: string,
  notificationType: string,
  channel: "email" | "sms"
): Promise<SendDecision> {
  const classification = getClassification(notificationType);

  // 1. Admin kill switch
  const { data: adminConfig } = await sb
    .from("admin_notification_config")
    .select("enabled")
    .eq("notification_type", notificationType)
    .in("cohort_id", ["all"])
    .limit(1)
    .single();

  if (adminConfig && !adminConfig.enabled) {
    return { send: false, reason: "admin_disabled" };
  }

  // 2. Required transactional always sends
  if (classification === "required_transactional") {
    return { send: true };
  }

  // 3. Get user notification state
  const { data: state } = await sb
    .from("user_notification_state")
    .select("*")
    .eq("user_id", userId)
    .single();

  // 4. All non-required types require email verification
  if (!state?.email_verified) {
    return { send: false, reason: "not_verified" };
  }

  // 5. Product + marketing require preferences completed
  if (
    ["product", "marketing"].includes(classification) &&
    !state?.preferences_completed
  ) {
    return { send: false, reason: "preferences_incomplete" };
  }

  // 6. Marketing requires explicit marketing opt-in
  if (classification === "marketing" && !state?.marketing_opt_in) {
    return { send: false, reason: "no_marketing_consent" };
  }

  // 7. Check user preference for this type + channel
  const { data: pref } = await sb
    .from("user_notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .eq("notification_type", notificationType)
    .single();

  if (channel === "email" && pref && !pref.email_enabled) {
    return { send: false, reason: "user_disabled_email" };
  }

  if (channel === "sms") {
    // SMS restricted to allowed types only
    if (!SMS_ALLOWED_TYPES.has(notificationType)) {
      return { send: false, reason: "sms_not_allowed_for_type" };
    }
    if (!pref?.sms_enabled || !state?.sms_verified) {
      return { send: false, reason: "sms_not_enabled_or_verified" };
    }
  }

  // 8. Frequency cap check (daily email cap)
  if (channel === "email" && state?.daily_email_cap) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count } = await sb
      .from("notification_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("channel", "email")
      .eq("send_decision", "sent")
      .gte("created_at", todayStart.toISOString());

    if ((count || 0) >= state.daily_email_cap) {
      return { send: false, reason: "frequency_capped" };
    }
  }

  // 9. Quiet hours check (SMS only)
  if (channel === "sms" && state) {
    const quietStart = state.quiet_hours_start || "22:00";
    const quietEnd = state.quiet_hours_end || "07:00";
    const tz = state.timezone || "America/New_York";
    if (isQuietHours(quietStart, quietEnd, tz)) {
      return { send: false, reason: "quiet_hours" };
    }
  }

  return { send: true };
}

// ═══════════════════════════════════════════════════════════
// TEMPLATE RESOLUTION (Deliverable 6)
// ═══════════════════════════════════════════════════════════
async function resolveTemplate(
  notificationType: string,
  channel: string,
  cohortId?: string
): Promise<{ subject?: string; html?: string; sms_body?: string; version?: string } | null> {
  // 1. Try cohort-specific production template
  if (cohortId) {
    const { data: tmpl } = await sb
      .from("notification_templates")
      .select("*")
      .eq("notification_type", notificationType)
      .eq("channel", channel)
      .eq("cohort_id", cohortId)
      .eq("is_production", true)
      .limit(1)
      .single();
    if (tmpl) return { subject: tmpl.subject_line, html: tmpl.html_body, sms_body: tmpl.sms_body, version: tmpl.version };
  }

  // 2. Fall back to default cohort
  const { data: fallback } = await sb
    .from("notification_templates")
    .select("*")
    .eq("notification_type", notificationType)
    .eq("channel", channel)
    .eq("cohort_id", "default")
    .eq("is_production", true)
    .limit(1)
    .single();
  if (fallback) return { subject: fallback.subject_line, html: fallback.html_body, sms_body: fallback.sms_body, version: fallback.version };

  // 3. No template found
  return null;
}

// ═══════════════════════════════════════════════════════════
// QUIET HOURS CHECK
// ═══════════════════════════════════════════════════════════
function isQuietHours(quietStart: string, quietEnd: string, timezone: string): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0");
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0");
    const currentMinutes = hour * 60 + minute;

    const [startH, startM] = quietStart.split(":").map(Number);
    const [endH, endM] = quietEnd.split(":").map(Number);
    const startMinutes = startH * 60 + (startM || 0);
    const endMinutes = endH * 60 + (endM || 0);

    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch {
    return false;
  }
}

// Calculate when quiet hours end (for hold queue scheduling)
function getQuietEndDatetime(quietEnd: string, timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0");
    const [endH, endM] = quietEnd.split(":").map(Number);

    // If current hour is past midnight but before quiet end, quiet ends today
    // If current hour is before midnight but after quiet start, quiet ends tomorrow
    const endDate = new Date(now);
    if (hour >= (parseInt(quietEnd.split(":")[0]) || 7)) {
      // We're past quiet end time today, so quiet ends tomorrow morning
      endDate.setDate(endDate.getDate() + 1);
    }
    endDate.setHours(endH, endM || 0, 0, 0);
    return endDate.toISOString();
  } catch {
    // Fallback: 7 hours from now
    return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString();
  }
}

// Hold notification for delivery after quiet hours
async function holdForQuietEnd(
  userId: string,
  notificationType: string,
  channel: "email" | "sms",
  reqBody: NotificationRequest,
  quietEnd: string,
  timezone: string
): Promise<void> {
  const deliverAt = getQuietEndDatetime(quietEnd, timezone);
  try {
    await sb.from("held_notifications").insert({
      user_id: userId,
      notification_type: notificationType,
      channel,
      deliver_at: deliverAt,
      payload: {
        subject: reqBody.subject,
        html: reqBody.html,
        text: reqBody.text,
        sms_text: reqBody.sms_text,
        job_id: reqBody.job_id,
        company_name: reqBody.company_name,
        job_title: reqBody.job_title,
        payload: reqBody.payload,
        template_version: reqBody.template_version,
      },
      status: "held",
    });
    console.log(
      `[send-notification] Held ${notificationType} (${channel}) for ${userId} until ${deliverAt}`
    );
  } catch (e) {
    // If held_notifications table doesn't exist yet, log but don't fail
    // The table will be created as part of Session 3 DB migration
    console.warn("[send-notification] Could not hold notification (table may not exist):", e);
  }
}

// ═══════════════════════════════════════════════════════════
// SEND EMAIL VIA RESEND
// ═══════════════════════════════════════════════════════════
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchWithRetry("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject,
        html,
        text: text || undefined,
      }),
    }, TIMEOUT_CONFIGS.resend);

    if (!res.ok) {
      const err = await res.text();
      console.error("[send-notification] Resend error:", res.status, err);
      return { ok: false, error: `Resend ${res.status}: ${err}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[send-notification] Email send failed:", e);
    return { ok: false, error: String(e) };
  }
}

// ═══════════════════════════════════════════════════════════
// SEND SMS VIA VONAGE
// ═══════════════════════════════════════════════════════════
async function sendSMS(
  to: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  if (!VONAGE_API_KEY || !VONAGE_API_SECRET || !VONAGE_FROM) {
    return { ok: false, error: "Vonage credentials not configured" };
  }
  try {
    const res = await fetchWithRetry("https://rest.nexmo.com/sms/json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: VONAGE_API_KEY,
        api_secret: VONAGE_API_SECRET,
        from: VONAGE_FROM,
        to: to.replace(/\D/g, ""),
        text,
      }),
    }, TIMEOUT_CONFIGS.vonage);

    const data = await res.json();
    const msg = data?.messages?.[0];
    if (msg?.status !== "0") {
      const errText = msg?.["error-text"] || "Unknown Vonage error";
      console.error("[send-notification] Vonage error:", errText);
      return { ok: false, error: errText };
    }
    return { ok: true };
  } catch (e) {
    console.error("[send-notification] SMS send failed:", e);
    return { ok: false, error: String(e) };
  }
}

// ═══════════════════════════════════════════════════════════
// LOG NOTIFICATION WITH DECISION
// ═══════════════════════════════════════════════════════════
async function logNotification(
  userId: string,
  notificationType: string,
  channel: "email" | "sms",
  status: "sent" | "failed" | "blocked",
  req: NotificationRequest,
  classification: string,
  sendDecision: string,
  sendReason?: string,
  error?: string
) {
  try {
    if (req.idempotency_key) {
      const { data: existing } = await sb
        .from("notification_log")
        .select("id")
        .eq("idempotency_key", req.idempotency_key)
        .limit(1);
      if (existing && existing.length > 0) {
        console.log(`[send-notification] Duplicate detected: ${req.idempotency_key}`);
        return;
      }
    }

    await sb.from("notification_log").insert({
      user_id: userId,
      notification_type: notificationType,
      channel,
      status,
      job_id: req.job_id || null,
      company_name: req.company_name || null,
      subject: req.subject || null,
      payload: {
        ...(req.payload || {}),
        ...(error ? { error } : {}),
        job_title: req.job_title || null,
      },
      idempotency_key: req.idempotency_key || null,
      user_plan: req.user_plan || null,
      user_cohort: req.user_cohort || null,
      template_version: req.template_version || null,
      // Session 2 fields
      classification,
      send_decision: sendDecision,
      send_reason: sendReason || null,
    });
  } catch (e) {
    console.error("[send-notification] Failed to log notification:", e);
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body: NotificationRequest = await req.json();
    const { user_id, notification_type } = body;

    if (!user_id || !notification_type) {
      return new Response(
        JSON.stringify({ error: "user_id and notification_type required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const classification = getClassification(notification_type);
    const result: NotificationResult = {
      email_sent: false,
      sms_sent: false,
      held_for_quiet_hours: false,
      classification,
    };

    // 1. Get user's email from auth.users
    const { data: userData, error: userError } = await sb.auth.admin.getUserById(user_id);
    if (userError || !userData?.user?.email) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    const userEmail = userData.user.email;

    // 2. Resolve template (if caller didn't provide content)
    let subject = body.subject;
    let html = body.html;
    let smsText = body.sms_text;

    if (!subject || !html) {
      const tmpl = await resolveTemplate(notification_type, "email", body.user_cohort);
      if (tmpl) {
        subject = subject || tmpl.subject;
        html = html || tmpl.html;
        body.template_version = tmpl.version;
      }
    }
    if (!smsText) {
      const smsTmpl = await resolveTemplate(notification_type, "sms", body.user_cohort);
      if (smsTmpl) smsText = smsTmpl.sms_body;
    }

    // 3. Check email send gate
    const emailDecision = await canSendNotification(user_id, notification_type, "email");
    if (body.force_channel === "email" || body.force_channel === "both") {
      // Force channel bypasses classification for required transactional sends from other functions
      if (classification === "required_transactional") {
        // Always allow forced required transactional
      } else {
        // Still enforce gates even with force_channel (except for required_transactional)
        if (!emailDecision.send) {
          result.decision = "blocked";
          result.decision_reason = emailDecision.reason;
        }
      }
    }

    // Email send path
    const shouldSendEmail = body.force_channel === "email" || body.force_channel === "both"
      ? classification === "required_transactional" || emailDecision.send
      : emailDecision.send;

    if (shouldSendEmail && subject && html) {
      const emailResult = await sendEmail(userEmail, subject, html, body.text);
      result.email_sent = emailResult.ok;
      result.email_error = emailResult.error;

      await logNotification(
        user_id, notification_type, "email",
        emailResult.ok ? "sent" : "failed",
        body, classification, emailResult.ok ? "sent" : "send_failed",
        undefined, emailResult.error
      );
    } else if (!shouldSendEmail) {
      await logNotification(
        user_id, notification_type, "email",
        "blocked", body, classification,
        "blocked", emailDecision.reason
      );
      result.decision = "blocked";
      result.decision_reason = emailDecision.reason;
    }

    // 4. Check SMS send gate
    if (smsText) {
      const smsDecision = await canSendNotification(user_id, notification_type, "sms");
      const shouldSendSms = body.force_channel === "sms" || body.force_channel === "both"
        ? classification === "required_transactional" || smsDecision.send
        : smsDecision.send;

      if (shouldSendSms) {
        // Get phone number from user_notification_state
        const { data: state } = await sb
          .from("user_notification_state")
          .select("phone_number")
          .eq("user_id", user_id)
          .single();

        if (state?.phone_number) {
          const smsResult = await sendSMS(state.phone_number, smsText);
          result.sms_sent = smsResult.ok;
          result.sms_error = smsResult.error;

          await logNotification(
            user_id, notification_type, "sms",
            smsResult.ok ? "sent" : "failed",
            body, classification, smsResult.ok ? "sent" : "send_failed",
            undefined, smsResult.error
          );
        }
      } else {
        if (smsDecision.reason === "quiet_hours") {
          result.held_for_quiet_hours = true;
          // Queue for delivery after quiet hours end
          const { data: userState } = await sb
            .from("user_notification_state")
            .select("quiet_hours_end, timezone")
            .eq("user_id", user_id)
            .single();
          await holdForQuietEnd(
            user_id,
            notification_type,
            "sms",
            body,
            userState?.quiet_hours_end || "07:00",
            userState?.timezone || "America/New_York"
          );
        }
        await logNotification(
          user_id, notification_type, "sms",
          "blocked", body, classification,
          smsDecision.reason === "quiet_hours" ? "held" : "blocked",
          smsDecision.reason
        );
      }
    }

    console.log(
      `[send-notification] ${notification_type} (${classification}) for ${user_id}: email=${result.email_sent} sms=${result.sms_sent} decision=${result.decision || "sent"}`
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[send-notification] Unhandled error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
