// interview-sequence Edge Function — v2 (Session 6, v6.07)
// v2: Added cron_24h / cron_1h batch mode for pg_cron triggers
// Interview Reminders + Resume Rewrite Ready Notification Flow
// Triggered by:
//   1. Pipeline stage change to "interview" (interviewScheduledWhiteEmail)
//   2. Cron: 24h before interview (interviewReminder24hEmail)
//   3. Cron: 1h before interview (interviewReminder1hEmail)
//   4. Rewrite EF callback (resumeRewriteReadyEmail)
// Suppression: dedup on pipeline_entry+type, quiet hours (1h overrides), email prefs.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  interviewScheduledWhiteEmail,
  interviewReminder24hEmail,
  interviewReminder1hEmail,
  resumeRewriteReadyEmail,
} from "../_shared/email-templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SEND_NOTIFICATION_URL = `${SUPABASE_URL}/functions/v1/send-notification`;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface InterviewPayload {
  type: "interview_scheduled" | "interview_reminder_24h" | "interview_reminder_1h" | "resume_rewrite_ready";
  userId: string;
  pipelineEntryId?: string;
  // Interview fields
  companyName?: string;
  jobTitle?: string;
  interviewDate?: string;
  interviewTime?: string;
  timezone?: string;
  interviewFormat?: string;
  interviewLocation?: string;
  matchScore?: number;
  activeListings?: number;
  topStrengths?: string;
  primaryGap?: string;
  // Resume rewrite fields
  originalResumeName?: string;
  originalScore?: number;
  newScore?: number;
  keywordsAdded?: number;
  sectionsChanged?: number;
  newResumeId?: string;
  rewriteJobId?: string;
}

serve(async (req: Request) => {
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  console.log(`[interview-sequence] Starting. cid=${correlationId}`);

  try {
    const payload: InterviewPayload = await req.json();
    const { type, userId } = payload;


    // ─── Cron mode (v6.07) ───
    // When called by pg_cron with type "cron_24h" or "cron_1h",
    // query user_pipeline for upcoming interviews and fire individual notifications.
    if (payload.type === "cron_24h" || payload.type === "cron_1h") {
      const is24h = payload.type === "cron_24h";
      const windowHours = is24h ? 24 : 1;
      const minHours = is24h ? 1 : 0; // 24h cron skips interviews <1h away (1h cron handles those)
      const notifType = is24h ? "interview_reminder_24h" : "interview_reminder_1h";

      console.log(`[interview-sequence] Cron mode: ${payload.type}`);

      const now = new Date();
      const windowEnd = new Date(now.getTime() + windowHours * 60 * 60 * 1000);
      const windowStart = new Date(now.getTime() + minHours * 60 * 60 * 1000);

      // Query upcoming interviews
      const { data: interviews, error: qErr } = await sb
        .from("user_pipeline")
        .select("id, user_id, company_name, job_title, interview_at, match_score")
        .eq("stage", "interview")
        .not("interview_at", "is", null)
        .gte("interview_at", windowStart.toISOString())
        .lte("interview_at", windowEnd.toISOString());

      if (qErr) {
        console.error(`[interview-sequence] Cron query error:`, qErr);
        return new Response(JSON.stringify({ error: "Query failed" }), { status: 500 });
      }

      console.log(`[interview-sequence] Cron found ${interviews?.length || 0} upcoming interviews in ${windowHours}h window`);
      let sent = 0, skipped = 0;

      for (const entry of (interviews || [])) {
        // Dedup check
        const { data: existing } = await sb
          .from("notification_log")
          .select("id")
          .eq("user_id", entry.user_id)
          .eq("notification_type", notifType)
          .eq("metadata->>dedup_key", entry.id)
          .limit(1);

        if (existing && existing.length > 0) {
          skipped++;
          continue;
        }

        // Format interview time
        const interviewDate = new Date(entry.interview_at);
        const dateStr = interviewDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
        const timeStr = interviewDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

        // Fire individual notification (reuse same function via internal call)
        const selfUrl = `${SUPABASE_URL}/functions/v1/interview-sequence`;
        try {
          const res = await fetch(selfUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": \`Bearer \${SUPABASE_SERVICE_ROLE_KEY}\`,
              "x-correlation-id": correlationId,
            },
            body: JSON.stringify({
              type: notifType,
              userId: entry.user_id,
              pipelineEntryId: entry.id,
              companyName: entry.company_name,
              jobTitle: entry.job_title,
              interviewDate: dateStr,
              interviewTime: timeStr,
              matchScore: entry.match_score,
            }),
          });
          const result = await res.json();
          if (result.sent) sent++;
          else skipped++;
        } catch (e) {
          console.warn(`[interview-sequence] Cron send error for ${entry.id}:`, e.message);
          skipped++;
        }
      }

      console.log(`[interview-sequence] Cron ${payload.type} complete: sent=${sent}, skipped=${skipped}`);
      return new Response(JSON.stringify({ mode: "cron", type: payload.type, sent, skipped }), { status: 200 });
    }

    if (!type || !userId) {
      return new Response(JSON.stringify({ error: "type and userId required" }), { status: 400 });
    }

    // 1. Load user profile
    const { data: profile, error: profileErr } = await sb
      .from("profiles")
      .select("first_name, email, timezone")
      .eq("id", userId)
      .single();

    if (profileErr || !profile?.email) {
      console.error(`[interview-sequence] Profile not found for ${userId}:`, profileErr);
      return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
    }

    const firstName = profile.first_name || undefined;
    const userTz = profile.timezone || "America/New_York";
    const dashboardUrl = "https://brilliantjobs.app/dashboard.html";

    // 2. Dedup check — one notification per pipeline_entry + type combo
    const dedupKey = type === "resume_rewrite_ready"
      ? `${payload.rewriteJobId || payload.newResumeId}`
      : `${payload.pipelineEntryId}`;

    const { data: existing } = await sb
      .from("notification_log")
      .select("id")
      .eq("user_id", userId)
      .eq("notification_type", type)
      .eq("metadata->>dedup_key", dedupKey)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`[interview-sequence] Dedup hit: ${type} for ${dedupKey}. Skipping.`);
      return new Response(JSON.stringify({ sent: false, reason: "dedup" }), { status: 200 });
    }

    // 3. Check email preference
    const { data: prefs } = await sb
      .from("notification_channels")
      .select("email_enabled")
      .eq("user_id", userId)
      .eq("notification_type", type)
      .single();

    if (prefs && prefs.email_enabled === false) {
      console.log(`[interview-sequence] User ${userId} has ${type} email disabled. Skipping.`);
      return new Response(JSON.stringify({ sent: false, reason: "prefs_disabled" }), { status: 200 });
    }

    // 4. Quiet hours check (1h reminder overrides quiet hours by design)
    if (type !== "interview_reminder_1h") {
      const now = new Date();
      // Simple quiet hours: 10pm-7am in user's timezone
      const userHour = parseInt(now.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: userTz }));
      if (userHour >= 22 || userHour < 7) {
        console.log(`[interview-sequence] Quiet hours for ${userId} (hour=${userHour}). Holding ${type}.`);
        // In production, we'd queue this for quiet_end. For now, skip.
        return new Response(JSON.stringify({ sent: false, reason: "quiet_hours" }), { status: 200 });
      }
    }

    // 5. Render template
    let rendered: { subject: string; html: string; sms_text?: string };

    switch (type) {
      case "interview_scheduled":
        rendered = interviewScheduledWhiteEmail(
          firstName, payload.companyName, payload.jobTitle,
          payload.interviewDate, payload.interviewTime, payload.timezone,
          payload.interviewFormat, payload.interviewLocation,
          payload.matchScore, dashboardUrl
        );
        break;

      case "interview_reminder_24h":
        rendered = interviewReminder24hEmail(
          firstName, payload.companyName, payload.jobTitle,
          payload.interviewDate, payload.interviewTime, payload.timezone,
          payload.interviewFormat, payload.matchScore,
          payload.activeListings, dashboardUrl
        );
        break;

      case "interview_reminder_1h":
        rendered = interviewReminder1hEmail(
          firstName, payload.companyName, payload.jobTitle,
          payload.interviewTime, payload.timezone,
          payload.interviewFormat, payload.interviewLocation,
          payload.matchScore, payload.topStrengths,
          payload.primaryGap, dashboardUrl
        );
        break;

      case "resume_rewrite_ready":
        const rr = resumeRewriteReadyEmail(
          firstName, payload.companyName, payload.jobTitle,
          payload.originalResumeName, payload.originalScore,
          payload.newScore, payload.keywordsAdded,
          payload.sectionsChanged, payload.newResumeId, dashboardUrl
        );
        rendered = { ...rr, sms_text: undefined };
        break;

      default:
        return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), { status: 400 });
    }

    // 6. Send via send-notification
    const sendPayload = {
      userId,
      email: profile.email,
      notification_type: type,
      subject: rendered.subject,
      html: rendered.html,
      sms_text: rendered.sms_text || null,
      metadata: { dedup_key: dedupKey, pipeline_entry_id: payload.pipelineEntryId || null },
    };

    const sendRes = await fetch(SEND_NOTIFICATION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "x-correlation-id": correlationId,
      },
      body: JSON.stringify(sendPayload),
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      console.error(`[interview-sequence] send-notification failed: ${sendRes.status} ${errText}`);
      return new Response(JSON.stringify({ sent: false, error: errText }), { status: 500 });
    }

    console.log(`[interview-sequence] Sent ${type} to ${userId}. cid=${correlationId}`);
    return new Response(JSON.stringify({ sent: true, type, userId }), { status: 200 });

  } catch (err) {
    console.error(`[interview-sequence] Error:`, err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
