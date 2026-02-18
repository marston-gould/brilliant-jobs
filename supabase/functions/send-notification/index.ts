// send-notification Edge Function
// Core notification sender: checks preferences, quiet hours, channel routing,
// calls Resend (email) or Vonage REST API (SMS), logs to notification_log.
// Called by other Edge Functions — not directly by the dashboard.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const VONAGE_API_KEY = Deno.env.get("VONAGE_API_KEY") || "";
const VONAGE_API_SECRET = Deno.env.get("VONAGE_API_SECRET") || "";
const VONAGE_FROM = Deno.env.get("VONAGE_FROM") || "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "notifications@brilliantjobs.app";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---- Types ----
interface NotificationRequest {
  user_id: string;
  notification_type: string;
  // Email fields
  subject?: string;
  html?: string;
  text?: string;
  // SMS fields
  sms_text?: string;
  // Metadata for logging
  job_id?: string;
  company_name?: string;
  job_title?: string;
  payload?: Record<string, unknown>;
  // Override channel (skip preference check)
  force_channel?: "email" | "sms" | "both";
}

interface NotificationResult {
  email_sent: boolean;
  sms_sent: boolean;
  email_error?: string;
  sms_error?: string;
  held_for_quiet_hours: boolean;
}

// ---- Quiet Hours Check ----
function isQuietHours(
  quietStart: string,   // "22:00:00"
  quietEnd: string,     // "07:00:00"
  timezone: string
): boolean {
  try {
    const now = new Date();
    // Get current time in user's timezone
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
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Handle overnight quiet hours (e.g. 22:00 - 07:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
    // Same-day quiet hours (e.g. 01:00 - 06:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch {
    return false; // If timezone parsing fails, don't block
  }
}

// ---- Send Email via Resend ----
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
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
    });

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

// ---- Send SMS via Vonage ----
async function sendSMS(
  to: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  if (!VONAGE_API_KEY || !VONAGE_API_SECRET || !VONAGE_FROM) {
    return { ok: false, error: "Vonage credentials not configured" };
  }
  try {
    const res = await fetch("https://rest.nexmo.com/sms/json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: VONAGE_API_KEY,
        api_secret: VONAGE_API_SECRET,
        from: VONAGE_FROM,
        to: to.replace(/\D/g, ""), // digits only
        text,
      }),
    });

    const data = await res.json();
    // Vonage returns messages array; check first message status
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

// ---- Log notification to notification_log ----
async function logNotification(
  userId: string,
  notificationType: string,
  channel: "email" | "sms",
  status: "sent" | "failed",
  req: NotificationRequest,
  error?: string
) {
  try {
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
    });
  } catch (e) {
    console.error("[send-notification] Failed to log notification:", e);
  }
}

// ---- Main Handler ----
serve(async (req: Request) => {
  // CORS preflight
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

    // 1. Get user's email from auth.users
    const { data: userData, error: userError } = await sb.auth.admin.getUserById(user_id);
    if (userError || !userData?.user?.email) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    const userEmail = userData.user.email;

    // 2. Get notification preferences
    const { data: prefs } = await sb
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user_id)
      .single();

    // 3. Get channel preferences for this notification type
    const { data: channelPref } = await sb
      .from("notification_channels")
      .select("*")
      .eq("user_id", user_id)
      .eq("notification_type", notification_type)
      .single();

    // Determine which channels to send on
    let sendEmail = body.force_channel === "email" || body.force_channel === "both";
    let sendSms = body.force_channel === "sms" || body.force_channel === "both";

    if (!body.force_channel) {
      // Use preferences (default: email on, sms off)
      sendEmail = channelPref?.email !== false && prefs?.email_enabled !== false;
      sendSms =
        channelPref?.sms === true &&
        prefs?.sms_enabled === true &&
        prefs?.phone_verified === true;
    }

    // 4. Check quiet hours
    const quietStart = prefs?.quiet_start || "22:00:00";
    const quietEnd = prefs?.quiet_end || "07:00:00";
    const timezone = prefs?.timezone || "America/New_York";

    const result: NotificationResult = {
      email_sent: false,
      sms_sent: false,
      held_for_quiet_hours: false,
    };

    if (isQuietHours(quietStart, quietEnd, timezone)) {
      // During quiet hours: hold the notification
      // Caller (e.g. escalation-checker) handles retry at quiet_end
      result.held_for_quiet_hours = true;
      console.log(
        `[send-notification] Held for quiet hours: ${notification_type} for user ${user_id}`
      );
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 5. Send email
    if (sendEmail && body.subject && body.html) {
      const emailResult = await sendEmailFn(userEmail, body.subject, body.html, body.text);
      result.email_sent = emailResult.ok;
      result.email_error = emailResult.error;

      await logNotification(
        user_id,
        notification_type,
        "email",
        emailResult.ok ? "sent" : "failed",
        body,
        emailResult.error
      );
    }

    // 6. Send SMS
    if (sendSms && body.sms_text && prefs?.phone_number) {
      const smsResult = await sendSMSFn(prefs.phone_number, body.sms_text);
      result.sms_sent = smsResult.ok;
      result.sms_error = smsResult.error;

      await logNotification(
        user_id,
        notification_type,
        "sms",
        smsResult.ok ? "sent" : "failed",
        body,
        smsResult.error
      );
    }

    console.log(
      `[send-notification] ${notification_type} for ${user_id}: email=${result.email_sent} sms=${result.sms_sent}`
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

// Aliases to avoid name collision with the boolean flags
const sendEmailFn = sendEmail;
const sendSMSFn = sendSMS;
