// resolve-survey-link Edge Function — FB-SURVEY-DELIVERY-001 SDV-S6
// Short URL resolution for email/SMS survey deep links.
// GET /s/{token} → lookup survey_links → validate → mark used → redirect to /survey
//
// Hook: channel-agnostic — any future channel needing authenticated deep links
//       (push notification, WhatsApp) reuses this EF.
// Gateway route #140 (pre-registered in SDV-S5).

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DASHBOARD_URL = "https://brilliantjobs.app";
const POSTHOG_KEY = Deno.env.get("POSTHOG_API_KEY") || "";
const POSTHOG_HOST = Deno.env.get("POSTHOG_HOST") || "https://app.posthog.com";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function capturePostHog(distinctId: string, event: string, props: Record<string, unknown>) {
  if (!POSTHOG_KEY) return;
  try {
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: POSTHOG_KEY, distinct_id: distinctId, event, properties: props }),
    });
  } catch (e) { console.warn("[resolve-survey-link] PostHog failed:", String(e)); }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function redirect(url: string) {
  return new Response(null, {
    status: 302,
    headers: { Location: url, ...CORS },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    // Extract token from URL path or query param
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const token = (body.token as string)
      || url.searchParams.get("token")
      || url.pathname.split("/").pop()
      || "";

    if (!token || token.length !== 6) {
      return jsonResponse({ error: "Invalid or missing token" }, 400);
    }

    // 1. Lookup token in survey_links
    const { data: link, error: lookupErr } = await sb.from("survey_links")
      .select("token,user_id,survey_version,channel,expires_at,used_at")
      .eq("token", token)
      .single();

    if (lookupErr || !link) {
      return jsonResponse({ error: "Link not found" }, 404);
    }

    // 2. Validate expiry
    if (new Date(link.expires_at) < new Date()) {
      return jsonResponse({ error: "Link expired", expired_at: link.expires_at }, 410);
    }

    // 3. Mark used_at (first click only — subsequent clicks still redirect but don't update)
    if (!link.used_at) {
      await sb.from("survey_links")
        .update({ used_at: new Date().toISOString() })
        .eq("token", token);
    }

    // 4. Determine survey context from version
    let surveyContext = "periodic";
    if (link.survey_version.startsWith("nps")) surveyContext = "nps";
    else if (link.survey_version.startsWith("exit")) surveyContext = "churn";
    else if (link.survey_version.startsWith("ghost")) surveyContext = "ghost";

    // 5. Generate short-lived auth session (§7.2)
    // Use Supabase admin API to get user email, then generate a magic link
    // that auto-authenticates when the user lands on the survey page.
    let authParam = `uid=${link.user_id}`;
    try {
      const { data: userData } = await sb.auth.admin.getUserById(link.user_id);
      if (userData?.user?.email) {
        const { data: magicLink } = await sb.auth.admin.generateLink({
          type: "magiclink",
          email: userData.user.email,
          options: { redirectTo: `${DASHBOARD_URL}/survey?context=${surveyContext}&v=${encodeURIComponent(link.survey_version)}&src=${link.channel}` },
        });
        if (magicLink?.properties?.hashed_token) {
          authParam = `token_hash=${magicLink.properties.hashed_token}&type=magiclink`;
        }
      }
    } catch (e) {
      // Non-fatal — fall back to uid param (survey page handles anonymous submission)
      console.warn("[resolve-survey-link] Auth session generation failed, using uid fallback:", String(e));
    }

    // 6. Build redirect URL
    const surveyUrl = `${DASHBOARD_URL}/survey?context=${surveyContext}&v=${encodeURIComponent(link.survey_version)}&src=${link.channel}&${authParam}`;

    // 7. PostHog: track click
    const clickEvent = link.channel === "sms" ? "survey_sms_clicked" : "survey_email_clicked";
    await capturePostHog(link.user_id, clickEvent, {
      survey_version: link.survey_version,
      user_id: link.user_id,
      channel: link.channel,
      token,
    });

    // 7. Redirect
    return redirect(surveyUrl);

  } catch (e) {
    console.error("[resolve-survey-link] Fatal error:", String(e));
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
