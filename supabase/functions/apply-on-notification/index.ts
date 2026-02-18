// apply-on-notification Edge Function
// Triggered when a new job matches a filter with apply-on-notification enabled.
// Sends actionable email with Apply/Pass/View buttons.
// Creates notification_actions record for escalation tracking.
// The escalation-checker cron handles SMS follow-up for non-responses.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { applyAlertEmail } from "../_shared/email-templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://brilliantjobs.app";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface JobMatch {
  user_id: string;
  job_id: string;
  job_title: string;
  company_name: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  match_score?: number;
  filter_name?: string;
  resume_id?: string;
}

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
    const job: JobMatch = await req.json();

    if (!job.user_id || !job.job_id || !job.job_title || !job.company_name) {
      return new Response(
        JSON.stringify({ error: "user_id, job_id, job_title, company_name required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Check if there's already a pending action for this job + user
    const { data: existing } = await sb
      .from("notification_actions")
      .select("id")
      .eq("user_id", job.user_id)
      .eq("job_id", job.job_id)
      .in("status", ["pending", "escalated"])
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "Action already pending for this job" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Get user's escalation timeout
    const { data: prefs } = await sb
      .from("notification_preferences")
      .select("escalation_timeout_hours, quiet_start, quiet_end, timezone")
      .eq("user_id", job.user_id)
      .single();

    const timeoutHours = prefs?.escalation_timeout_hours || 4;

    // 3. Build action URLs
    // These point to the handle-notification-response Edge Function
    const baseActionUrl = `${SUPABASE_URL}/functions/v1/handle-notification-response`;
    // We'll create the action record first to get an ID
    const actionId = crypto.randomUUID();
    const actionUrl = `${baseActionUrl}?action_id=${actionId}&decision=apply`;
    const passUrl = `${baseActionUrl}?action_id=${actionId}&decision=pass`;
    const viewUrl = `${SITE_URL}/dashboard.html#jobs`; // deep-link to job feed

    // 4. Generate email content
    const emailData = applyAlertEmail(
      {
        title: job.job_title,
        company: job.company_name,
        location: job.location,
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        salary_currency: job.salary_currency,
        match_score: job.match_score,
        job_id: job.job_id,
        filter_name: job.filter_name,
      },
      actionUrl,
      passUrl,
      viewUrl
    );

    // 5. Create the notification_actions record
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + timeoutHours + 2); // timeout + SMS grace period

    const { error: insertError } = await sb.from("notification_actions").insert({
      id: actionId,
      user_id: job.user_id,
      job_id: job.job_id,
      company_name: job.company_name,
      job_title: job.job_title,
      filter_name: job.filter_name || null,
      resume_id: job.resume_id || null,
      action_type: "apply_decision",
      status: "pending",
      email_sent_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    });

    if (insertError) {
      console.error("[apply-on-notification] Insert action failed:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create action record", details: insertError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 6. Send the notification email via send-notification
    const sendResult = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        user_id: job.user_id,
        notification_type: "apply_alert",
        subject: emailData.subject,
        html: emailData.html,
        sms_text: emailData.sms_text,
        job_id: job.job_id,
        company_name: job.company_name,
        job_title: job.job_title,
        // Only send email now — SMS comes via escalation-checker if no response
        force_channel: "email",
      }),
    });

    const sendData = await sendResult.json();

    console.log(`[apply-on-notification] Sent for ${job.job_title} at ${job.company_name}, action_id=${actionId}:`, sendData);

    return new Response(
      JSON.stringify({
        action_id: actionId,
        email_sent: sendData.email_sent,
        held_for_quiet_hours: sendData.held_for_quiet_hours,
        escalation_timeout_hours: timeoutHours,
        expires_at: expiresAt.toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[apply-on-notification] Error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
