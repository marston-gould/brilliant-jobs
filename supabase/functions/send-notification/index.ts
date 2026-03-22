// send-notification Edge Function — v10 (Phase 16 Session 4: Passive high-bar alert send path) (Phase 69 Session 4: Web Push channel)
// Core notification sender with classification-based send gates.
// Checks: admin config → classification → double opt-in → override cascade → frequency cap → quiet hours
// Override cascade: notification_filter_overrides → notification_channels → notification_preferences → default
// Then routes to Resend (email), Vonage REST API (SMS), or Web Push API, logs to notification_log with decision.
// v3 adds: quiet hours hold queue (held_notifications table), per-type SMS enforcement
// v7 adds: Web Push notification channel via VAPID + Web Push Protocol

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { fetchWithRetry, TIMEOUT_CONFIGS } from "../_shared/resilience.ts";
import { passiveHighBarAlertEmail } from "../_shared/email-templates.ts";
import { safeSms } from "../_shared/sms-templates.ts";
import { checkFeatureAccess, buildDeniedResponse, buildSampleHeaders } from '../_shared/checkFeatureAccess.ts';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const VONAGE_API_KEY = Deno.env.get("VONAGE_API_KEY") || "";
const VONAGE_API_SECRET = Deno.env.get("VONAGE_API_SECRET") || "";
const VONAGE_FROM = Deno.env.get("VONAGE_FROM") || "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "Brilliant Jobs <notifications@brilliantjobs.app>";

// Web Push VAPID credentials (Card 7)
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:notifications@brilliantjobs.app";

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
  filter_name?: string;
  // CS-P1-012 (TS1-4): A/B experiment tracking
  ab_experiment_id?: string;
  ab_variant_id?: string;
}

interface SendDecision {
  send: boolean;
  reason?: string;
}

interface NotificationResult {
  email_sent: boolean;
  sms_sent: boolean;
  push_sent: boolean;
  email_error?: string;
  sms_error?: string;
  push_error?: string;
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
  channel: "email" | "sms",
  filterName?: string
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

  // 7. Channel preference cascade: override → channel_pref → default
  // Step 7a: Check per-filter override (highest priority)
  let channelEnabled: boolean | null = null;
  let freqOverride: string | null = null;

  if (filterName) {
    const { data: override } = await sb
      .from("notification_filter_overrides")
      .select("email, sms, frequency")
      .eq("user_id", userId)
      .eq("filter_name", filterName)
      .eq("notification_type", notificationType)
      .single();

    if (override) {
      channelEnabled = channel === "email" ? override.email : override.sms;
      freqOverride = override.frequency;
      console.log(`[send-notification] Override found: filter=${filterName}, type=${notificationType}, ${channel}=${channelEnabled}`);
    }
  }

  // Step 7b: Fall back to notification_channels (per-type channel prefs)
  if (channelEnabled === null) {
    const { data: chanPref } = await sb
      .from("notification_channels")
      .select("email, sms, frequency")
      .eq("user_id", userId)
      .eq("notification_type", notificationType)
      .single();

    if (chanPref) {
      channelEnabled = channel === "email" ? chanPref.email : chanPref.sms;
      if (!freqOverride) freqOverride = chanPref.frequency;
    }
  }

  // Step 7c: Fall back to user_notification_preferences (legacy per-type prefs)
  if (channelEnabled === null) {
    const { data: pref } = await sb
      .from("user_notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .eq("notification_type", notificationType)
      .single();

    if (pref) {
      channelEnabled = channel === "email" ? (pref.email_enabled ?? true) : (pref.sms_enabled ?? false);
    }
  }

  // Step 7d: Default — email ON, sms OFF
  if (channelEnabled === null) {
    channelEnabled = channel === "email" ? true : false;
  }

  if (channel === "email" && !channelEnabled) {
    return { send: false, reason: "user_disabled_email" };
  }

  if (channel === "sms") {
    if (!SMS_ALLOWED_TYPES.has(notificationType)) {
      return { send: false, reason: "sms_not_allowed_for_type" };
    }
    if (!channelEnabled || !state?.sms_verified) {
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
// CS-P1-012 (TS1-4): A/B EXPERIMENT VARIANT ASSIGNMENT
// ═══════════════════════════════════════════════════════════

interface ABVariant {
  variant_id: string;
  weight: number;
  subject_override?: string;
  template_version?: string;
}

/**
 * Assign user to an experiment variant (or return existing assignment).
 * Uses weighted random selection. Sticky: once assigned, same variant returned.
 */
async function assignVariant(
  experimentId: string,
  userId: string,
  variants: ABVariant[]
): Promise<ABVariant | null> {
  if (!variants.length) return null;

  // Check for existing sticky assignment
  const { data: existing } = await sb
    .from("ab_assignments")
    .select("variant_id")
    .eq("experiment_id", experimentId)
    .eq("user_id", userId)
    .single();

  if (existing) {
    return variants.find(v => v.variant_id === existing.variant_id) || variants[0];
  }

  // Weighted random selection
  const totalWeight = variants.reduce((s, v) => s + (v.weight || 1), 0);
  let roll = Math.random() * totalWeight;
  let selected = variants[0];
  for (const v of variants) {
    roll -= (v.weight || 1);
    if (roll <= 0) { selected = v; break; }
  }

  // Persist sticky assignment
  await sb.from("ab_assignments").insert({
    experiment_id: experimentId,
    user_id: userId,
    variant_id: selected.variant_id,
  }).single();

  return selected;
}

// ═══════════════════════════════════════════════════════════
async function resolveTemplate(
  notificationType: string,
  channel: string,
  cohortId?: string,
  userId?: string
): Promise<{ subject?: string; html?: string; sms_body?: string; version?: string; ab_experiment_id?: string; ab_variant_id?: string } | null> {
  // CS-P1-012 (TS1-4): Check for active A/B experiment on this notification type
  let abOverride: { subject?: string; experimentId?: string; variantId?: string } = {};
  if (userId) {
    const { data: experiment } = await sb
      .from("ab_experiments")
      .select("id, variants")
      .eq("notification_type", notificationType)
      .eq("channel", channel)
      .eq("status", "active")
      .limit(1)
      .single();

    if (experiment) {
      const variant = await assignVariant(experiment.id, userId, experiment.variants as ABVariant[]);
      if (variant) {
        abOverride = {
          subject: variant.subject_override,
          experimentId: experiment.id,
          variantId: variant.variant_id,
        };
      }
    }
  }

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
    if (tmpl) return {
      subject: abOverride.subject || tmpl.subject_line,
      html: tmpl.html_body,
      sms_body: tmpl.sms_body,
      version: tmpl.version,
      ab_experiment_id: abOverride.experimentId,
      ab_variant_id: abOverride.variantId,
    };
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
  if (fallback) return {
    subject: abOverride.subject || fallback.subject_line,
    html: fallback.html_body,
    sms_body: fallback.sms_body,
    version: fallback.version,
    ab_experiment_id: abOverride.experimentId,
    ab_variant_id: abOverride.variantId,
  };

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
): Promise<{ ok: boolean; error?: string; message_id?: string }> {
  try {
  // EMAIL KILL SWITCH — set EMAIL_ENABLED=false in Supabase secrets to disable all outbound email
  if (Deno.env.get("EMAIL_ENABLED") === "false") {
    console.log("[email] EMAIL_ENABLED=false — email suppressed");
    return false;
  }
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
    // Capture Resend message ID for webhook correlation (Phase 69)
    const resData = await res.json();
    return { ok: true, message_id: resData?.id || undefined };
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
): Promise<{ ok: boolean; error?: string; message_id?: string }> {
  if (!VONAGE_API_KEY || !VONAGE_API_SECRET || !VONAGE_FROM) {
    return { ok: false, error: "Vonage credentials not configured" };
  }
  // CS-P1-012 (TS1-5): Safety net — enforce 160-char single-segment limit
  const safeText = safeSms(text);
  try {
    const res = await fetchWithRetry("https://rest.nexmo.com/sms/json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: VONAGE_API_KEY,
        api_secret: VONAGE_API_SECRET,
        from: VONAGE_FROM,
        to: to.replace(/\D/g, ""),
        text: safeText,
      }),
    }, TIMEOUT_CONFIGS.vonage);

    const data = await res.json();
    const msg = data?.messages?.[0];
    if (msg?.status !== "0") {
      const errText = msg?.["error-text"] || "Unknown Vonage error";
      console.error("[send-notification] Vonage error:", errText);
      return { ok: false, error: errText };
    }
    // Capture Vonage message-id for DLR webhook correlation
    return { ok: true, message_id: msg?.["message-id"] || undefined };
  } catch (e) {
    console.error("[send-notification] SMS send failed:", e);
    return { ok: false, error: String(e) };
  }
}

// ═══════════════════════════════════════════════════════════
// SEND WEB PUSH (Card 7 — Phase 69 Session 4)
// ═══════════════════════════════════════════════════════════
async function sendWebPush(
  userId: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; sent: number; failed: number; error?: string }> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return { ok: false, sent: 0, failed: 0, error: "VAPID keys not configured" };
  }

  // Get all push subscriptions for this user
  const { data: subscriptions, error } = await sb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error || !subscriptions || subscriptions.length === 0) {
    return { ok: false, sent: 0, failed: 0, error: "No push subscriptions found" };
  }

  let sent = 0;
  let failed = 0;
  const staleIds: string[] = [];

  for (const sub of subscriptions) {
    try {
      // Build the JWT for VAPID auth
      const jwt = await buildVapidJwt(sub.endpoint);
      const encrypted = await encryptPayload(
        JSON.stringify(payload),
        sub.p256dh,
        sub.auth
      );

      const pushRes = await fetch(sub.endpoint, {
        method: "POST",
        headers: {
          "Authorization": `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
          "Content-Encoding": "aes128gcm",
          "Content-Type": "application/octet-stream",
          "TTL": "86400",
          "Urgency": "normal",
        },
        body: encrypted,
      });

      if (pushRes.status === 201 || pushRes.status === 200) {
        sent++;
        // Update last_used_at
        await sb.from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", sub.id);
      } else if (pushRes.status === 404 || pushRes.status === 410) {
        // Subscription expired — remove it
        staleIds.push(sub.id);
        failed++;
      } else {
        console.error(`[send-notification] Push failed for ${sub.endpoint.slice(0, 40)}...: ${pushRes.status}`);
        failed++;
      }
    } catch (e) {
      console.error("[send-notification] Push error:", e);
      failed++;
    }
  }

  // Clean up stale subscriptions
  if (staleIds.length > 0) {
    await sb.from("push_subscriptions").delete().in("id", staleIds);
    console.log(`[send-notification] Cleaned ${staleIds.length} stale push subscriptions`);
  }

  return { ok: sent > 0, sent, failed };
}

// ── VAPID JWT builder ────────────────────────────────────────
async function buildVapidJwt(endpoint: string): Promise<string> {
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);

  const header = { typ: "JWT", alg: "ES256" };
  const claims = {
    aud: audience,
    exp: now + 43200, // 12 hours
    sub: VAPID_SUBJECT,
  };

  const headerB64 = b64url(new TextEncoder().encode(JSON.stringify(header)));
  const claimsB64 = b64url(new TextEncoder().encode(JSON.stringify(claims)));
  const unsigned = `${headerB64}.${claimsB64}`;

  // Import VAPID private key for signing
  const keyData = b64urlDecode(VAPID_PRIVATE_KEY);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: VAPID_PRIVATE_KEY,
    x: VAPID_PUBLIC_KEY.slice(0, 43), // first 32 bytes base64url
    y: VAPID_PUBLIC_KEY.slice(43),    // last 32 bytes base64url
  };

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(unsigned)
  );

  // Convert DER signature to raw r||s format if needed
  const sigBytes = new Uint8Array(signature);
  const rawSig = sigBytes.length === 64 ? sigBytes : derToRaw(sigBytes);

  return `${unsigned}.${b64url(rawSig)}`;
}

// ── Payload encryption (aes128gcm / RFC 8291) ──────────────
async function encryptPayload(
  plaintext: string,
  p256dhB64: string,
  authB64: string
): Promise<Uint8Array> {
  const clientPublicKey = b64urlDecode(p256dhB64);
  const clientAuth = b64urlDecode(authB64);

  // Generate ephemeral ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  // Import client public key
  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientKey },
    localKeyPair.privateKey,
    256
  );

  // Export local public key (raw, 65 bytes uncompressed)
  const localPublicKeyRaw = await crypto.subtle.exportKey("raw", localKeyPair.publicKey);
  const localPubBytes = new Uint8Array(localPublicKeyRaw);

  // Generate salt (16 bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF: auth_secret → IKM
  const prkInfoBuf = concatBytes(
    new TextEncoder().encode("WebPush: info\0"),
    new Uint8Array(clientPublicKey),
    localPubBytes
  );

  const ikmKey = await crypto.subtle.importKey(
    "raw", clientAuth, "HKDF", false, ["deriveBits"]
  );
  // PRK from auth secret + shared secret
  const authInfo = concatBytes(new TextEncoder().encode("Content-Encoding: auth\0"));
  
  // Simplified: use HKDF with shared secret as input key material
  const sharedKey = await crypto.subtle.importKey(
    "raw", new Uint8Array(sharedSecret), "HKDF", false, ["deriveBits"]
  );

  // Derive IKM
  const ikmBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: clientAuth, info: prkInfoBuf },
    sharedKey,
    256
  );

  // Derive CEK and nonce from IKM
  const ikmImport = await crypto.subtle.importKey(
    "raw", new Uint8Array(ikmBits), "HKDF", false, ["deriveBits"]
  );

  const cekInfo = concatBytes(new TextEncoder().encode("Content-Encoding: aes128gcm\0"));
  const cekBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: cekInfo },
    ikmImport,
    128
  );

  const nonceInfo = concatBytes(new TextEncoder().encode("Content-Encoding: nonce\0"));
  const nonceBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: nonceInfo },
    ikmImport,
    96
  );

  // Encrypt with AES-128-GCM
  const aesKey = await crypto.subtle.importKey(
    "raw", new Uint8Array(cekBits), "AES-GCM", false, ["encrypt"]
  );

  // Pad plaintext with delimiter (0x02) per RFC 8291
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const padded = new Uint8Array(plaintextBytes.length + 1);
  padded.set(plaintextBytes);
  padded[plaintextBytes.length] = 0x02; // delimiter

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: new Uint8Array(nonceBits), tagLength: 128 },
    aesKey,
    padded
  );

  // Build aes128gcm header: salt(16) + rs(4) + idlen(1) + keyid(65) + ciphertext
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);

  return concatBytes(salt, rs, new Uint8Array([65]), localPubBytes, new Uint8Array(encrypted));
}

// ── Utility functions ────────────────────────────────────────
function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  const b = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const arr = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) arr[i] = b.charCodeAt(i);
  return arr;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { result.set(a, offset); offset += a.length; }
  return result;
}

function derToRaw(der: Uint8Array): Uint8Array {
  // DER signature is SEQUENCE { INTEGER r, INTEGER s }
  // We need raw r || s (32 bytes each)
  if (der.length === 64) return der;
  const raw = new Uint8Array(64);
  let offset = 2; // skip SEQUENCE tag + length
  // r
  const rLen = der[offset + 1];
  const rStart = offset + 2 + (rLen > 32 ? 1 : 0);
  const rBytes = der.slice(rStart, rStart + 32);
  raw.set(rBytes, 32 - rBytes.length);
  offset = offset + 2 + rLen;
  // s
  const sLen = der[offset + 1];
  const sStart = offset + 2 + (sLen > 32 ? 1 : 0);
  const sBytes = der.slice(sStart, sStart + 32);
  raw.set(sBytes, 64 - sBytes.length);
  return raw;
}

// ═══════════════════════════════════════════════════════════
// LOG NOTIFICATION WITH DECISION
// ═══════════════════════════════════════════════════════════
async function logNotification(
  userId: string,
  notificationType: string,
  channel: "email" | "sms" | "push",
  status: "sent" | "failed" | "blocked",
  req: NotificationRequest,
  classification: string,
  sendDecision: string,
  sendReason?: string,
  error?: string,
  messageId?: string,
  smsMessageId?: string
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
        filter_name: req.filter_name || null,
        // CS-P1-012 (TS1-4): A/B experiment tracking
        ...(req.ab_experiment_id ? { ab_experiment_id: req.ab_experiment_id, ab_variant_id: req.ab_variant_id } : {}),
      },
      idempotency_key: req.idempotency_key || null,
      user_plan: req.user_plan || null,
      user_cohort: req.user_cohort || null,
      template_version: req.template_version || null,
      // Session 2 fields
      classification,
      send_decision: sendDecision,
      send_reason: sendReason || null,
      // Phase 69: Resend message_id for webhook correlation
      message_id: messageId || null,
      // Phase 69 Session 2: Vonage message_id for DLR correlation
      sms_message_id: smsMessageId || null,
    });
  } catch (e) {
    console.error("[send-notification] Failed to log notification:", e);
  }
}


// ═══════════════════════════════════════════════════════════
// PASSIVE MODE GATE (Phase 16 Session 2)
// Checks if a new_jobs notification should be suppressed by passive mode rules.
// Returns { skip: true, reason: string } to suppress, { skip: false } to allow.
// ═══════════════════════════════════════════════════════════
async function checkPassiveGate(
  userId: string,
  notificationType: string,
  payload: Record<string, unknown>
): Promise<{ skip: boolean; reason?: string }> {
  // Only gate job notification types
  const PASSIVE_GATED_TYPES = new Set([
    "new_jobs_daily", "new_jobs_realtime", "apply_alert", "passive_high_bar_alert"
  ]);
  if (!PASSIVE_GATED_TYPES.has(notificationType)) {
    return { skip: false };
  }

  try {
    // Load user passive config
    const { data: profile } = await sb
      .from("profiles")
      .select("passive_mode, passive_config, passive_notifications_sent_today, passive_notifications_sent_week, passive_notifications_sent_month, passive_snoozed_until")
      .eq("id", userId)
      .single();

    if (!profile?.passive_mode) {
      return { skip: false }; // Not in passive mode, allow all
    }
    // Snooze gate: if passive_snoozed_until is in the future, skip all passive notifications
    if (profile.passive_snoozed_until && new Date(profile.passive_snoozed_until) > new Date()) {
      console.log(`[passive-gate] Skipping: snoozed until ${profile.passive_snoozed_until}`);
      return { skip: true, reason: `snoozed_until:${profile.passive_snoozed_until}` };
    }



    const cfg = profile.passive_config || {};
    const scoreFloor = cfg.score_floor || cfg.match_score_floor || 85;
    const preset = cfg.frequency_preset || "high_bar";

    // Check match score from payload
    const matchScore = typeof payload?.match_score === "number" ? payload.match_score : 100;
    if (matchScore < scoreFloor) {
      console.log(`[passive-gate] Skipping: match_score ${matchScore} < floor ${scoreFloor} (preset: ${preset})`);
      return { skip: true, reason: `match_score_below_floor:${scoreFloor}` };
    }

    // AI JD quality gate: skip if ai_generated AND ai_jd_rate < 0.5
    if (payload?.ai_generated === true || payload?.is_ai_generated === true) {
      const aiJdRate = typeof payload?.ai_jd_rate === "number" ? payload.ai_jd_rate : 1.0;
      if (aiJdRate < 0.5) {
        console.log(`[passive-gate] Skipping: AI-generated JD with quality ${aiJdRate} < 0.5`);
        return { skip: true, reason: `ai_jd_quality_gate:${aiJdRate}` };
      }
    }

    // Frequency cap enforcement by preset
    const sentToday = profile.passive_notifications_sent_today || 0;
    const sentWeek = profile.passive_notifications_sent_week || 0;
    const sentMonth = profile.passive_notifications_sent_month || 0;

    if (preset === "slam_dunk" && sentMonth >= 2) {
      return { skip: true, reason: "frequency_cap:slam_dunk:monthly_2" };
    }
    if (preset === "high_bar" && sentWeek >= 2) {
      return { skip: true, reason: "frequency_cap:high_bar:weekly_2" };
    }
    // curated_daily: no cap beyond daily — handled by normal daily digest flow

    // Track send — increment counters
    const now = new Date().toISOString();
    await sb.from("profiles").update({
      passive_notifications_sent_today: sentToday + 1,
      passive_notifications_sent_week: sentWeek + 1,
      passive_notifications_sent_month: sentMonth + 1,
    }).eq("id", userId);

    return { skip: false };
  } catch (e) {
    // Fail open — do not suppress if gate errors
    console.warn("[passive-gate] Error in passive gate check, failing open:", e);
    return { skip: false };
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

    // ─── FB-TRIAL-001-S2: Gate product notifications (match alerts) ───
    // Transactional and marketing notifications are NOT gated — only product (match alerts)
    if (classification === 'product') {
      const access = await checkFeatureAccess(sb, user_id, 'email');
      if (!access.allowed) return buildDeniedResponse(access);
      // Note: sampleHeaders not needed here — send-notification is server-to-server,
      // client sees X-Is-Sample on the originating user-facing EF response
    }

    const result: NotificationResult = {
      email_sent: false,
      sms_sent: false,
      push_sent: false,
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

    // Passive high-bar alert: build email from template function
    if (notification_type === "passive_high_bar_alert" && (!subject || !html)) {
      const p = body.payload || {};
      const builtEmail = passiveHighBarAlertEmail(
        p.first_name as string | undefined,
        (p.job_title as string) || "A matching role",
        (p.company_name as string) || "A company",
        typeof p.match_score === "number" ? p.match_score : 85,
        p.salary_display as string | undefined,
        typeof p.ghost_score === "number" ? p.ghost_score : undefined,
      );
      subject = subject || builtEmail.subject;
      html = html || builtEmail.html;
    }

    if (!subject || !html) {
      const tmpl = await resolveTemplate(notification_type, "email", body.user_cohort, user_id);
      if (tmpl) {
        subject = subject || tmpl.subject;
        html = html || tmpl.html;
        body.template_version = tmpl.version;
        // CS-P1-012 (TS1-4): Track A/B variant for notification_log
        if (tmpl.ab_experiment_id) {
          body.ab_experiment_id = tmpl.ab_experiment_id;
          body.ab_variant_id = tmpl.ab_variant_id;
        }
      }
    }
    if (!smsText) {
      const smsTmpl = await resolveTemplate(notification_type, "sms", body.user_cohort, user_id);
      if (smsTmpl) smsText = smsTmpl.sms_body;
    }

    // 3. Check suppression list (Phase 69)
    const { data: suppression } = await sb
      .from("notification_suppressions")
      .select("type, expires_at")
      .eq("email", userEmail)
      .limit(1);
    const activeSuppression = suppression?.find(s =>
      s.type === "hard_bounce" || s.type === "complaint" ||
      (s.expires_at && new Date(s.expires_at) > new Date())
    );
    if (activeSuppression) {
      await logNotification(
        user_id, notification_type, "email",
        "blocked", body, classification,
        "blocked", `suppressed: ${activeSuppression.type}`
      );
      return new Response(JSON.stringify({
        email_sent: false, sms_sent: false, held_for_quiet_hours: false,
        classification, decision: "blocked",
        decision_reason: `suppressed: ${activeSuppression.type}`
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // 3a. Passive mode gate (Phase 16 Session 2)
    const passiveCheck = await checkPassiveGate(user_id, notification_type, body.payload || {});
    if (passiveCheck.skip) {
      console.log(`[send-notification] Passive gate blocked ${notification_type} for ${user_id}: ${passiveCheck.reason}`);
      await logNotification(
        user_id, notification_type, "email",
        "blocked", body, classification,
        "blocked", `passive_gate:${passiveCheck.reason}`
      );
      return new Response(JSON.stringify({
        email_sent: false, sms_sent: false, push_sent: false,
        held_for_quiet_hours: false, classification,
        decision: "blocked", decision_reason: passiveCheck.reason
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // 3b. Check email send gate
    const emailDecision = await canSendNotification(user_id, notification_type, "email", body.filter_name);
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

      // CS-P1-012 (TS1-4): Mark A/B assignment as sent for experiment tracking
      if (emailResult.ok && body.ab_experiment_id) {
        await sb.from("ab_assignments")
          .update({ email_sent: true })
          .eq("experiment_id", body.ab_experiment_id)
          .eq("user_id", user_id);
      }

      await logNotification(
        user_id, notification_type, "email",
        emailResult.ok ? "sent" : "failed",
        body, classification, emailResult.ok ? "sent" : "send_failed",
        undefined, emailResult.error, emailResult.message_id
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

    // 4. Check SMS send gate (with auto-fallback for users with repeated failures)
    if (smsText) {
      // Check auto-fallback flag: skip SMS for users with 3+ failures in 7 days
      const { data: fallbackState } = await sb
        .from("user_notification_state")
        .select("sms_fallback_email_only")
        .eq("user_id", user_id)
        .single();
      if (fallbackState?.sms_fallback_email_only) {
        console.log(`[send-notification] SMS auto-fallback active for ${user_id}, skipping SMS`);
        await logNotification(
          user_id, notification_type, "sms",
          "blocked", body, classification,
          "blocked", "sms_auto_fallback"
        );
      } else {
      const smsDecision = await canSendNotification(user_id, notification_type, "sms", body.filter_name);
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
            undefined, smsResult.error, undefined, smsResult.message_id
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
      } // close auto-fallback else
    }

    // 5. Web Push channel (Card 7 — Phase 69 Session 4)
    // Push is sent for product + configurable_transactional types when user has push enabled
    if (classification !== "marketing" && VAPID_PUBLIC_KEY) {
      const { data: pushState } = await sb
        .from("user_notification_state")
        .select("push_enabled")
        .eq("user_id", user_id)
        .single();

      if (pushState?.push_enabled) {
        // Check push preference in cascade (same as email/sms)
        let pushEnabled: boolean | null = null;

        // Override check
        if (body.filter_name) {
          const { data: override } = await sb
            .from("notification_filter_overrides")
            .select("push")
            .eq("user_id", user_id)
            .eq("filter_name", body.filter_name)
            .eq("notification_type", notification_type)
            .single();
          if (override && override.push !== null) pushEnabled = override.push;
        }

        // Channel pref check
        if (pushEnabled === null) {
          const { data: chanPref } = await sb
            .from("notification_channels")
            .select("push")
            .eq("user_id", user_id)
            .eq("notification_type", notification_type)
            .single();
          if (chanPref && chanPref.push !== null) pushEnabled = chanPref.push;
        }

        // Default: push ON for product, OFF for others
        if (pushEnabled === null) {
          pushEnabled = classification === "product" || classification === "configurable_transactional";
        }

        if (pushEnabled) {
          const pushPayload = {
            title: body.subject || notification_type.replace(/_/g, " "),
            body: body.text || body.company_name
              ? `${body.job_title || "New notification"} at ${body.company_name || "a company"}`
              : notification_type.replace(/_/g, " "),
            notification_type,
            job_id: body.job_id || null,
            url: "/dashboard.html",
            tag: `bj-${notification_type}-${Date.now()}`,
          };

          const pushResult = await sendWebPush(user_id, pushPayload);
          result.push_sent = pushResult.ok;
          result.push_error = pushResult.error;

          if (pushResult.ok) {
            await logNotification(
              user_id, notification_type, "push" as "email" | "sms",
              "sent", body, classification, "sent",
              undefined, undefined, undefined
            );
          }
        }
      }
    }

    console.log(
      `[send-notification] ${notification_type} (${classification}) for ${user_id}: email=${result.email_sent} sms=${result.sms_sent} push=${result.push_sent} decision=${result.decision || "sent"}`
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

