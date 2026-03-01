// onboarding-sequence Edge Function — v1 (Session 3)
// Cron-triggered: checks onboarding milestones per user, sends contextual drip emails.
// 4-email sequence: welcome → resume nudge (24h) → filter nudge (48h) → extension nudge (72h)
// Each email suppresses if user has already completed the action.
// Pod 1 copy injection pending — uses placeholder templates until Batch 1-2 delivered.
//
// Trigger: pg_cron hourly OR called directly for a specific user
// Roadmap: Session 3 of 15, Phase 2

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { fetchWithRetry, TIMEOUT_CONFIGS } from "../_shared/resilience.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ═══════════════════════════════════════════════════════════
// ONBOARDING SEQUENCE CONFIGURATION
// Delays are in hours from signup. Each step has a minimum delay
// and a suppression check. Admin-configurable per cohort.
// ═══════════════════════════════════════════════════════════

interface OnboardingStep {
  type: string;
  delayHours: number;
  sentField: string;
  completedField: string;
  checkFn: (userId: string) => Promise<boolean>;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    type: "welcome",
    delayHours: 0, // Immediate on signup
    sentField: "welcome_sent_at",
    completedField: "welcome_sent_at", // Welcome is always "completed" once sent
    checkFn: async () => true, // Always eligible
  },
  {
    type: "onboard_resume",
    delayHours: 24,
    sentField: "resume_nudge_sent_at",
    completedField: "resume_completed_at",
    checkFn: async (userId: string): Promise<boolean> => {
      // Check if user has uploaded a resume
      const { count } = await sb
        .from("resumes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      return (count ?? 0) === 0; // Eligible if NO resume uploaded
    },
  },
  {
    type: "onboard_filter",
    delayHours: 48,
    sentField: "filter_nudge_sent_at",
    completedField: "filter_completed_at",
    checkFn: async (userId: string): Promise<boolean> => {
      // Check if user has created a filter
      const { count } = await sb
        .from("user_filters")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      return (count ?? 0) === 0; // Eligible if NO filter created
    },
  },
  {
    type: "onboard_extension",
    delayHours: 72,
    sentField: "extension_nudge_sent_at",
    completedField: "extension_completed_at",
    checkFn: async (userId: string): Promise<boolean> => {
      // Check if user has connected the extension
      const { data: profile } = await sb
        .from("profiles")
        .select("extension_id")
        .eq("id", userId)
        .single();
      return !profile?.extension_id; // Eligible if NO extension connected
    },
  },
];

// ═══════════════════════════════════════════════════════════
// ADMIN CONFIG LOOKUP — respects per-cohort overrides
// ═══════════════════════════════════════════════════════════

interface AdminConfig {
  enabled: boolean;
  delay_hours?: number;
}

async function getAdminConfig(
  notificationType: string,
  cohortId?: string
): Promise<AdminConfig> {
  // Check cohort-specific config first, then default
  const queries = cohortId
    ? [
        sb
          .from("admin_notification_config")
          .select("enabled, config")
          .eq("notification_type", notificationType)
          .eq("cohort_id", cohortId)
          .single(),
        sb
          .from("admin_notification_config")
          .select("enabled, config")
          .eq("notification_type", notificationType)
          .is("cohort_id", null)
          .single(),
      ]
    : [
        sb
          .from("admin_notification_config")
          .select("enabled, config")
          .eq("notification_type", notificationType)
          .is("cohort_id", null)
          .single(),
      ];

  for (const query of queries) {
    const { data, error } = await query;
    if (data && !error) {
      return {
        enabled: data.enabled !== false,
        delay_hours: data.config?.delay_hours,
      };
    }
  }

  // Default: enabled with standard delays
  return { enabled: true };
}

// ═══════════════════════════════════════════════════════════
// CORE: Process onboarding for a single user
// ═══════════════════════════════════════════════════════════

async function processUserOnboarding(userId: string): Promise<{
  sent: string[];
  suppressed: string[];
  skipped: string[];
}> {
  const result = { sent: [] as string[], suppressed: [] as string[], skipped: [] as string[] };

  // Get user's milestone record
  const { data: milestone, error: mErr } = await sb
    .from("onboarding_milestones")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (mErr || !milestone) {
    // No milestone record — create one
    const { error: insertErr } = await sb
      .from("onboarding_milestones")
      .insert({ user_id: userId });
    if (insertErr) {
      console.error(`[onboarding] Failed to create milestone for ${userId}:`, insertErr);
      return result;
    }
    // Re-fetch
    const { data: newMilestone } = await sb
      .from("onboarding_milestones")
      .select("*")
      .eq("user_id", userId)
      .single();
    if (!newMilestone) return result;
    return processUserOnboarding(userId); // Recurse once with fresh record
  }

  // If sequence is already complete, skip
  if (milestone.sequence_completed) {
    result.skipped.push("sequence_already_complete");
    return result;
  }

  // Get user signup time and cohort
  const { data: profile } = await sb
    .from("profiles")
    .select("created_at, cohort_id")
    .eq("id", userId)
    .single();

  if (!profile) {
    result.skipped.push("no_profile");
    return result;
  }

  const signupTime = new Date(profile.created_at).getTime();
  const now = Date.now();
  const hoursSinceSignup = (now - signupTime) / (1000 * 60 * 60);

  // Check double opt-in status
  const { data: notifState } = await sb
    .from("user_notification_state")
    .select("email_verified")
    .eq("user_id", userId)
    .single();

  // Welcome email can go before double opt-in (it IS the first touch)
  // All others require email verification
  const emailVerified = notifState?.email_verified === true;

  for (const step of ONBOARDING_STEPS) {
    const alreadySent = milestone[step.sentField] !== null;
    const alreadyCompleted = milestone[step.completedField] !== null;

    // Skip if already sent
    if (alreadySent) {
      continue;
    }

    // Skip welcome if type is not "welcome" and email not verified
    if (step.type !== "welcome" && !emailVerified) {
      result.skipped.push(`${step.type}:not_verified`);
      continue;
    }

    // Check admin config
    const config = await getAdminConfig(step.type, profile.cohort_id);
    if (!config.enabled) {
      result.skipped.push(`${step.type}:admin_disabled`);
      continue;
    }

    // Check delay
    const requiredDelay = config.delay_hours ?? step.delayHours;
    if (hoursSinceSignup < requiredDelay) {
      result.skipped.push(`${step.type}:too_early`);
      continue;
    }

    // Check if action already completed (suppress)
    if (step.type !== "welcome") {
      const actionNeeded = await step.checkFn(userId);
      if (!actionNeeded) {
        // User already did the thing — mark as completed, skip email
        await sb
          .from("onboarding_milestones")
          .update({ [step.completedField]: new Date().toISOString() })
          .eq("user_id", userId);
        result.suppressed.push(step.type);
        continue;
      }
    }

    // Send the notification via send-notification
    try {
      const sendResult = await fetch(
        `${SUPABASE_URL}/functions/v1/send-notification`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            user_id: userId,
            notification_type: step.type,
            force_channel: "email",
            // Template will be resolved by send-notification from notification_templates
            // If no production template exists, send-notification will use fallback from email-templates.ts
          }),
        }
      );

      if (sendResult.ok) {
        // Mark milestone as sent
        await sb
          .from("onboarding_milestones")
          .update({ [step.sentField]: new Date().toISOString() })
          .eq("user_id", userId);
        result.sent.push(step.type);
      } else {
        const errBody = await sendResult.text();
        console.error(`[onboarding] send-notification failed for ${step.type}:`, errBody);
        result.skipped.push(`${step.type}:send_failed`);
      }
    } catch (e) {
      console.error(`[onboarding] Error sending ${step.type}:`, e);
      result.skipped.push(`${step.type}:error`);
    }

    // Only send one email per cron run per user (don't blast all 4 at once)
    break;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════
// HANDLER: Cron mode (process all incomplete users) or
// Direct mode (process a specific user_id)
// ═══════════════════════════════════════════════════════════

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
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // Empty body = cron mode
    }

    const specificUserId = body.user_id as string | undefined;

    if (specificUserId) {
      // Direct mode: process single user
      const result = await processUserOnboarding(specificUserId);
      return new Response(JSON.stringify({ user_id: specificUserId, ...result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Cron mode: process all users with incomplete onboarding
    const { data: incomplete, error } = await sb
      .from("onboarding_milestones")
      .select("user_id")
      .eq("sequence_completed", false)
      .limit(100); // Process in batches of 100

    if (error || !incomplete) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch incomplete milestones", details: error }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const results: Record<string, unknown>[] = [];
    for (const row of incomplete) {
      const result = await processUserOnboarding(row.user_id);
      if (result.sent.length > 0 || result.suppressed.length > 0) {
        results.push({ user_id: row.user_id, ...result });
      }
    }

    console.log(
      `[onboarding] Processed ${incomplete.length} users, ${results.length} had actions`
    );

    return new Response(
      JSON.stringify({
        processed: incomplete.length,
        actions: results.length,
        details: results,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[onboarding] Error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
