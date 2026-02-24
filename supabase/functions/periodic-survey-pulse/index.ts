// periodic-survey-pulse Edge Function (M-R3)
// ROLE: scheduled-worker
// Trigger: pg_cron — 15th of each month, 10am ET (offset from NPS on 1st)
// Purpose: Identify active users who haven't done a periodic survey in 90+ days,
//          send them an email linking to /survey?context=periodic&v=periodic_v2
// De-dupe: profiles.user_data.last_periodic_date

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") || "https://brilliantjobs.app";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MAX_RUNTIME_MS = 120_000;
const startTime = Date.now();
function isOvertime(): boolean { return Date.now() - startTime > MAX_RUNTIME_MS; }

serve(async (req: Request) => {
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  console.log(`[periodic-survey-pulse] Starting. correlationId=${correlationId}`);

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Active users (seen in last 30 days)
    const { data: profiles, error } = await sb
      .from("profiles")
      .select("id, email, full_name, user_data")
      .gte("last_seen_at", thirtyDaysAgo);

    if (error) {
      console.error("[periodic-survey-pulse] Error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ sent: 0, skipped: 0 }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    let sent = 0, skipped = 0;

    for (const profile of profiles) {
      if (isOvertime()) {
        console.warn(`[periodic-survey-pulse] Wall-time safety. ${sent + skipped}/${profiles.length}`);
        break;
      }

      // De-dupe: skip if last periodic survey was < 90 days ago
      const lastPeriodic = profile.user_data?.last_periodic_date;
      if (lastPeriodic) {
        const daysSince = (Date.now() - new Date(lastPeriodic).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 90) { skipped++; continue; }
      }

      const surveyUrl = `${SITE_URL}/survey?context=periodic&v=periodic_v2`;
      const firstName = profile.full_name?.split(" ")[0] || "there";

      const emailHtml = `
        <div style="font-family: 'Outfit', Arial, sans-serif; background: #0f1117; color: #f0f1f3; padding: 32px; max-width: 560px; margin: 0 auto;">
          <div style="background: #181a20; border: 1px solid #2a2d35; border-radius: 12px; padding: 32px;">
            <p style="font-size: 16px; margin: 0 0 12px;">Hey ${firstName},</p>
            <p style="font-size: 14px; color: #94a3b8; margin: 0 0 20px;">
              Quarterly check-in time — 16 quick questions about your job search experience. Your feedback shapes our next features.
            </p>
            <a href="${surveyUrl}" style="display: inline-block; background: #3b82f6; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
              Share Your Feedback
            </a>
            <p style="font-size: 12px; color: #64748b; margin: 20px 0 0;">
              Complete it and we'll add 7 days of Pro features as a thank-you.
            </p>
          </div>
        </div>
      `;

      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "x-correlation-id": correlationId,
          },
          body: JSON.stringify({
            user_id: profile.id,
            notification_type: "periodic_survey",
            subject: "Quick quarterly check-in — how's the search going?",
            html: emailHtml,
            text: `Hey ${firstName}, quarterly check-in: ${surveyUrl}`,
            force_channel: "email",
            payload: { survey_url: surveyUrl, survey_version: "periodic_v2" },
          }),
        });

        if (resp.ok) { sent++; } else {
          console.warn(`[periodic-survey-pulse] Failed for ${profile.id}: ${await resp.text()}`);
          skipped++;
        }
      } catch (e) {
        console.warn(`[periodic-survey-pulse] Error for ${profile.id}:`, e);
        skipped++;
      }

      await new Promise((r) => setTimeout(r, 100));
    }

    console.log(`[periodic-survey-pulse] Done. sent=${sent} skipped=${skipped} total=${profiles.length}`);
    return new Response(JSON.stringify({ sent, skipped, total: profiles.length }), {
      status: 200, headers: { "Content-Type": "application/json", "x-correlation-id": correlationId },
    });
  } catch (err) {
    console.error("[periodic-survey-pulse] Unexpected:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
