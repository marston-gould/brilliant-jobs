// nps-pulse Edge Function (P13-08)
// ROLE: scheduled-worker
// Trigger: pg_cron — 1st of each month, 10am ET
// Purpose: Identify active users who haven't completed NPS in 30+ days,
//          send them an email + in-app notification linking to /survey?context=nps&v=nps_v1
// Calls: send-notification Edge Function for email delivery

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") || "https://brilliantjobs.app";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Wall-time safety: abort if running too long
const MAX_RUNTIME_MS = 120_000; // 2 minutes
const startTime = Date.now();

function isOvertime(): boolean {
  return Date.now() - startTime > MAX_RUNTIME_MS;
}

serve(async (req: Request) => {
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  console.log(`[nps-pulse] Starting NPS pulse run. correlationId=${correlationId}`);

  try {
    // 1. Find active users (logged in within last 30 days) who haven't taken NPS in 30+ days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Query profiles for active users
    const { data: profiles, error: profileError } = await sb
      .from("profiles")
      .select("id, email, full_name, user_data")
      .gte("last_sign_in_at", thirtyDaysAgo);

    if (profileError) {
      console.error("[nps-pulse] Error fetching profiles:", profileError);
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", "x-correlation-id": correlationId },
      });
    }

    if (!profiles || profiles.length === 0) {
      console.log("[nps-pulse] No active users found. Exiting.");
      return new Response(JSON.stringify({ sent: 0, skipped: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json", "x-correlation-id": correlationId },
      });
    }

    let sent = 0;
    let skipped = 0;

    for (const profile of profiles) {
      if (isOvertime()) {
        console.warn(`[nps-pulse] Wall-time safety hit. Processed ${sent + skipped}/${profiles.length}`);
        break;
      }

      // Check last NPS date from user_data JSONB
      const lastNps = profile.user_data?.last_nps_date;
      if (lastNps) {
        const lastNpsDate = new Date(lastNps);
        const daysSinceNps = (Date.now() - lastNpsDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceNps < 30) {
          skipped++;
          continue;
        }
      }

      // Send NPS survey notification via send-notification
      const surveyUrl = `${SITE_URL}/survey?context=nps&v=nps_v1`;
      const firstName = profile.full_name?.split(" ")[0] || "there";

      const emailHtml = `
        <div style="font-family: 'Outfit', Arial, sans-serif; background: #0f1117; color: #f0f1f3; padding: 32px; max-width: 560px; margin: 0 auto;">
          <div style="background: #181a20; border: 1px solid #2a2d35; border-radius: 12px; padding: 32px;">
            <p style="font-size: 16px; margin: 0 0 12px;">Hey ${firstName},</p>
            <p style="font-size: 14px; color: #94a3b8; margin: 0 0 20px;">
              Quick monthly check-in: 3 questions, 30 seconds. Your answers directly shape what we build next.
            </p>
            <a href="${surveyUrl}" style="display: inline-block; background: #3b82f6; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
              Take the Quick Survey
            </a>
            <p style="font-size: 12px; color: #64748b; margin: 20px 0 0;">
              Complete it and we'll add 7 days of Pro features as a thank-you.
            </p>
          </div>
        </div>
      `;

      try {
        const notifResp = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "x-correlation-id": correlationId,
          },
          body: JSON.stringify({
            user_id: profile.id,
            notification_type: "nps_survey",
            subject: "Quick question — how are we doing?",
            html: emailHtml,
            text: `Hey ${firstName}, quick monthly check-in: ${surveyUrl}`,
            force_channel: "email",
            payload: { survey_url: surveyUrl, survey_version: "nps_v1" },
          }),
        });

        if (notifResp.ok) {
          sent++;
        } else {
          const errText = await notifResp.text();
          console.warn(`[nps-pulse] Failed to send to ${profile.id}: ${errText}`);
          skipped++;
        }
      } catch (e) {
        console.warn(`[nps-pulse] Error sending to ${profile.id}:`, e);
        skipped++;
      }

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 100));
    }

    console.log(`[nps-pulse] Complete. sent=${sent}, skipped=${skipped}, total=${profiles.length}`);

    return new Response(JSON.stringify({ sent, skipped, total: profiles.length }), {
      status: 200,
      headers: { "Content-Type": "application/json", "x-correlation-id": correlationId },
    });
  } catch (err) {
    console.error("[nps-pulse] Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", "x-correlation-id": correlationId },
    });
  }
});
