// adoption-sequence Edge Function — v1 (Session 4)
// Cron-triggered: checks integration adoption state per user, sends contextual adoption emails.
// 5 adoption emails: extension reminder → Gmail → Calendar → Drive → combo recap (30-day)
// Each email suppresses if user already connected the integration or permanently suppressed.
// Frequency cap: max 1 adoption email per integration per 7 days, max 3 total per integration.
// Auto-suppress: when user connects an integration, that integration's nudges stop permanently.
//
// Trigger: pg_cron hourly OR called directly for a specific user
// Dependencies: send-notification EF, email-templates.ts (adoptXxxEmail functions)
// Roadmap: Session 4 of 15

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { fetchWithRetry, TIMEOUT_CONFIGS } from "../_shared/resilience.ts";
import {
  adoptExtensionReminderEmail,
  adoptGmailEmail,
  adoptCalendarEmail,
  adoptDriveEmail,
  adoptIntegrationComboEmail,
} from "../_shared/email-templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

const ADOPTION_CONFIG = {
  // Minimum days since signup before first adoption nudge
  minDaysAfterSignup: 3,
  // Minimum days between nudges for the same integration
  cooldownDays: 7,
  // Max nudges per integration before permanent suppress
  maxNudgesPerIntegration: 3,
  // Days since signup for combo recap email
  comboRecapDays: 30,
  // Max 1 adoption email per user per cron run
  maxEmailsPerRun: 1,
};

// Integration definitions — order matters (priority)
interface IntegrationDef {
  key: string;
  nudgeSentField: string;
  nudgeCountField: string;
  connectedField: string;
  suppressedField: string;
  profileConnectedField: string | null; // null = check differently
  templateFn: (userName?: string, context?: string) => { subject: string; html: string };
  notificationType: string;
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    key: "extension",
    nudgeSentField: "extension_nudge_sent_at",
    nudgeCountField: "extension_nudge_count",
    connectedField: "extension_connected_at",
    suppressedField: "extension_suppressed",
    profileConnectedField: null, // Check profiles.extension_id instead
    templateFn: (name) => adoptExtensionReminderEmail(name),
    notificationType: "adopt_extension",
  },
  {
    key: "gmail",
    nudgeSentField: "gmail_nudge_sent_at",
    nudgeCountField: "gmail_nudge_count",
    connectedField: "gmail_connected_at",
    suppressedField: "gmail_suppressed",
    profileConnectedField: "gmail_connected_at",
    templateFn: (name) => adoptGmailEmail(name),
    notificationType: "adopt_gmail",
  },
  {
    key: "calendar",
    nudgeSentField: "calendar_nudge_sent_at",
    nudgeCountField: "calendar_nudge_count",
    connectedField: "calendar_connected_at",
    suppressedField: "calendar_suppressed",
    profileConnectedField: "calendar_connected_at",
    templateFn: (name) => adoptCalendarEmail(name),
    notificationType: "adopt_calendar",
  },
  {
    key: "drive",
    nudgeSentField: "drive_nudge_sent_at",
    nudgeCountField: "drive_nudge_count",
    connectedField: "drive_connected_at",
    suppressedField: "drive_suppressed",
    profileConnectedField: "drive_connected_at",
    templateFn: (name) => adoptDriveEmail(name),
    notificationType: "adopt_drive",
  },
];

// ═══════════════════════════════════════════════════════════
// CORE: Process a single user's adoption state
// ═══════════════════════════════════════════════════════════

interface AdoptionResult {
  sent: string[];
  suppressed: string[];
  skipped: string[];
  autoSuppressed: string[];
}

async function processUserAdoption(userId: string): Promise<AdoptionResult> {
  const result: AdoptionResult = { sent: [], suppressed: [], skipped: [], autoSuppressed: [] };

  // 1. Get or create adoption state
  let { data: state } = await sb
    .from("integration_adoption_state")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!state) {
    // Create state row on first encounter
    const { data: newState, error } = await sb
      .from("integration_adoption_state")
      .insert({ user_id: userId })
      .select()
      .single();
    if (error || !newState) {
      console.error(`[adoption] Failed to create state for ${userId}:`, error);
      return result;
    }
    state = newState;
  }

  // 2. Global suppress check
  if (state.global_adoption_suppressed) {
    result.skipped.push("global_suppressed");
    return result;
  }

  // 3. Get user profile for connection status + signup date + name
  const { data: profile } = await sb
    .from("profiles")
    .select("id, full_name, extension_id, gmail_connected_at, calendar_connected_at, drive_connected_at, created_at")
    .eq("id", userId)
    .single();

  if (!profile) {
    result.skipped.push("no_profile");
    return result;
  }

  // 4. Check minimum days since signup
  const signupDate = new Date(profile.created_at);
  const daysSinceSignup = (Date.now() - signupDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceSignup < ADOPTION_CONFIG.minDaysAfterSignup) {
    result.skipped.push(`too_early:${daysSinceSignup.toFixed(1)}d`);
    return result;
  }

  // 5. Check onboarding sequence completion first
  const { data: milestones } = await sb
    .from("onboarding_milestones")
    .select("sequence_completed")
    .eq("user_id", userId)
    .single();

  if (!milestones?.sequence_completed) {
    // Don't start adoption nudges until onboarding is done
    result.skipped.push("onboarding_incomplete");
    return result;
  }

  const userName = profile.full_name?.split(" ")[0] || undefined;

  // 6. Auto-suppress: detect newly connected integrations
  await autoSuppressConnected(userId, state, profile, result);

  // Re-fetch state after potential auto-suppress updates
  const { data: freshState } = await sb
    .from("integration_adoption_state")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (!freshState) return result;
  state = freshState;

  // 7. Check combo recap eligibility (30-day mark)
  if (daysSinceSignup >= ADOPTION_CONFIG.comboRecapDays && !state.combo_suppressed) {
    const comboResult = await tryComboRecap(userId, userName, state, profile);
    if (comboResult === "sent") {
      result.sent.push("combo_recap");
      return result; // One email per run
    } else if (comboResult === "suppressed") {
      result.suppressed.push("combo_recap");
    }
  }

  // 8. Process individual integrations (priority order)
  for (const integration of INTEGRATIONS) {
    if (result.sent.length >= ADOPTION_CONFIG.maxEmailsPerRun) break;

    const nudgeResult = await tryIntegrationNudge(userId, userName, state, profile, integration);
    if (nudgeResult === "sent") {
      result.sent.push(integration.key);
      break; // One email per run
    } else if (nudgeResult === "suppressed") {
      result.suppressed.push(integration.key);
    } else if (nudgeResult === "cooldown") {
      result.skipped.push(`${integration.key}:cooldown`);
    } else if (nudgeResult === "max_reached") {
      result.skipped.push(`${integration.key}:max_reached`);
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════
// AUTO-SUPPRESS: Mark integrations as connected when detected
// ═══════════════════════════════════════════════════════════

async function autoSuppressConnected(
  userId: string,
  state: Record<string, unknown>,
  profile: Record<string, unknown>,
  result: AdoptionResult
): Promise<void> {
  const updates: Record<string, unknown> = {};

  // Extension: check profiles.extension_id
  if (profile.extension_id && !state.extension_connected_at) {
    updates.extension_connected_at = new Date().toISOString();
    updates.extension_suppressed = true;
    result.autoSuppressed.push("extension");
  }

  // Gmail: check profiles.gmail_connected_at
  if (profile.gmail_connected_at && !state.gmail_connected_at) {
    updates.gmail_connected_at = profile.gmail_connected_at;
    updates.gmail_suppressed = true;
    result.autoSuppressed.push("gmail");
  }

  // Calendar: check profiles.calendar_connected_at
  if (profile.calendar_connected_at && !state.calendar_connected_at) {
    updates.calendar_connected_at = profile.calendar_connected_at;
    updates.calendar_suppressed = true;
    result.autoSuppressed.push("calendar");
  }

  // Drive: check profiles.drive_connected_at
  if (profile.drive_connected_at && !state.drive_connected_at) {
    updates.drive_connected_at = profile.drive_connected_at;
    updates.drive_suppressed = true;
    result.autoSuppressed.push("drive");
  }

  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();

    // Check if ALL integrations now connected → global suppress
    const allConnected =
      (profile.extension_id || state.extension_connected_at || updates.extension_connected_at) &&
      (profile.gmail_connected_at || state.gmail_connected_at || updates.gmail_connected_at) &&
      (profile.calendar_connected_at || state.calendar_connected_at || updates.calendar_connected_at) &&
      (profile.drive_connected_at || state.drive_connected_at || updates.drive_connected_at);

    if (allConnected) {
      updates.global_adoption_suppressed = true;
      updates.combo_suppressed = true;
      result.autoSuppressed.push("global");
    }

    await sb
      .from("integration_adoption_state")
      .update(updates)
      .eq("user_id", userId);

    console.log(`[adoption] Auto-suppressed for ${userId}:`, result.autoSuppressed);
  }
}

// ═══════════════════════════════════════════════════════════
// INDIVIDUAL INTEGRATION NUDGE
// ═══════════════════════════════════════════════════════════

async function tryIntegrationNudge(
  userId: string,
  userName: string | undefined,
  state: Record<string, unknown>,
  profile: Record<string, unknown>,
  integration: IntegrationDef
): Promise<"sent" | "suppressed" | "cooldown" | "max_reached" | "connected"> {
  // Already connected or permanently suppressed?
  if (state[integration.suppressedField]) return "suppressed";
  if (state[integration.connectedField]) return "connected";

  // For extension, check profile directly
  if (integration.key === "extension" && profile.extension_id) return "connected";
  // For others, check profile connected_at
  if (integration.profileConnectedField && profile[integration.profileConnectedField]) return "connected";

  // Max nudges reached?
  const nudgeCount = (state[integration.nudgeCountField] as number) || 0;
  if (nudgeCount >= ADOPTION_CONFIG.maxNudgesPerIntegration) {
    // Auto-suppress after max nudges
    await sb
      .from("integration_adoption_state")
      .update({
        [integration.suppressedField]: true,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    return "max_reached";
  }

  // Cooldown check
  const lastSent = state[integration.nudgeSentField] as string | null;
  if (lastSent) {
    const daysSinceLastNudge =
      (Date.now() - new Date(lastSent).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastNudge < ADOPTION_CONFIG.cooldownDays) {
      return "cooldown";
    }
  }

  // Generate email content
  const template = integration.templateFn(userName);

  // Send via send-notification
  try {
    const sendResult = await fetchWithRetry(
      `${SUPABASE_URL}/functions/v1/send-notification`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          notification_type: integration.notificationType,
          force_channel: "email",
          subject: template.subject,
          html: template.html,
        }),
      }
    );

    if (sendResult.ok) {
      // Update adoption state
      await sb
        .from("integration_adoption_state")
        .update({
          [integration.nudgeSentField]: new Date().toISOString(),
          [integration.nudgeCountField]: nudgeCount + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      return "sent";
    } else {
      const errBody = await sendResult.text();
      console.error(`[adoption] send-notification failed for ${integration.key}:`, errBody);
      return "suppressed";
    }
  } catch (e) {
    console.error(`[adoption] Error sending ${integration.key}:`, e);
    return "suppressed";
  }
}

// ═══════════════════════════════════════════════════════════
// COMBO RECAP (30-day)
// ═══════════════════════════════════════════════════════════

async function tryComboRecap(
  userId: string,
  userName: string | undefined,
  state: Record<string, unknown>,
  profile: Record<string, unknown>
): Promise<"sent" | "suppressed" | "not_eligible"> {
  // Already sent combo or suppressed?
  if (state.combo_suppressed) return "suppressed";
  if (state.combo_nudge_sent_at) return "suppressed"; // Only send once

  // Build connected/missing arrays
  const connected: string[] = [];
  const missing: string[] = [];

  if (profile.extension_id || state.extension_connected_at) connected.push("Chrome Extension");
  else missing.push("Chrome Extension");

  if (profile.gmail_connected_at || state.gmail_connected_at) connected.push("Gmail");
  else missing.push("Gmail");

  if (profile.calendar_connected_at || state.calendar_connected_at) connected.push("Google Calendar");
  else missing.push("Google Calendar");

  if (profile.drive_connected_at || state.drive_connected_at) connected.push("Google Drive");
  else missing.push("Google Drive");

  // If nothing missing, suppress permanently
  if (missing.length === 0) {
    await sb
      .from("integration_adoption_state")
      .update({
        combo_suppressed: true,
        global_adoption_suppressed: true,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    return "suppressed";
  }

  // Generate combo email
  const template = adoptIntegrationComboEmail(userName, connected, missing);

  try {
    const sendResult = await fetchWithRetry(
      `${SUPABASE_URL}/functions/v1/send-notification`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          notification_type: "adopt_combo",
          force_channel: "email",
          subject: template.subject,
          html: template.html,
        }),
      }
    );

    if (sendResult.ok) {
      await sb
        .from("integration_adoption_state")
        .update({
          combo_nudge_sent_at: new Date().toISOString(),
          combo_nudge_count: 1,
          combo_suppressed: true, // Only send once
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      return "sent";
    } else {
      const errBody = await sendResult.text();
      console.error(`[adoption] send-notification failed for combo:`, errBody);
      return "suppressed";
    }
  } catch (e) {
    console.error(`[adoption] Error sending combo:`, e);
    return "suppressed";
  }
}

// ═══════════════════════════════════════════════════════════
// HANDLER: Cron mode (all eligible users) or Direct mode (specific user)
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
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch (e) { console.warn("[EF][adoption_sequence_json_parse]", e?.message || String(e));
      // Empty body = cron mode
    }

    const specificUserId = body.user_id as string | undefined;

    if (specificUserId) {
      // Direct mode: process single user
      const result = await processUserAdoption(specificUserId);
      return new Response(JSON.stringify({ user_id: specificUserId, ...result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Cron mode: process all users who have completed onboarding
    // and haven't been globally suppressed
    const { data: eligible, error } = await sb
      .from("onboarding_milestones")
      .select("user_id")
      .eq("sequence_completed", true)
      .limit(200);

    if (error || !eligible) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch eligible users", details: error }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Filter out globally suppressed users
    const userIds = eligible.map((r) => r.user_id);
    const { data: suppressed } = await sb
      .from("integration_adoption_state")
      .select("user_id")
      .in("user_id", userIds)
      .eq("global_adoption_suppressed", true);

    const suppressedIds = new Set((suppressed || []).map((r) => r.user_id));
    const toProcess = userIds.filter((id) => !suppressedIds.has(id));

    const results: Record<string, unknown>[] = [];
    for (const userId of toProcess) {
      const result = await processUserAdoption(userId);
      if (result.sent.length > 0 || result.autoSuppressed.length > 0) {
        results.push({ user_id: userId, ...result });
      }
    }

    console.log(
      `[adoption] Processed ${toProcess.length} users (${suppressedIds.size} suppressed), ${results.length} had actions`
    );

    return new Response(
      JSON.stringify({
        processed: toProcess.length,
        suppressed: suppressedIds.size,
        actions: results.length,
        details: results,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[adoption] Error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
