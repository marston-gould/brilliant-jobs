// supabase/functions/handle-sms-reply/index.ts
// Inbound SMS webhook handler for Vonage
// Receives Y/N replies from users for apply-on-notification escalation
// Vonage sends GET or POST with: msisdn (from), to, text, messageId, etc.
// Configure webhook URL on Vonage Dashboard → Numbers → Your number → Inbound Webhook

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { checkFeatureAccess } from '../_shared/checkFeatureAccess.ts';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface VonageInbound {
  msisdn: string;      // Sender's phone number
  to: string;          // Your Vonage number
  text: string;        // Message body
  messageId: string;   // Vonage message ID
  "message-timestamp"?: string;
}

serve(async (req: Request) => {
  // Vonage can send GET or POST depending on config
  let params: VonageInbound;

  if (req.method === "GET") {
    const url = new URL(req.url);
    params = {
      msisdn: url.searchParams.get("msisdn") || "",
      to: url.searchParams.get("to") || "",
      text: url.searchParams.get("text") || "",
      messageId: url.searchParams.get("messageId") || "",
    };
  } else if (req.method === "POST") {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      params = await req.json();
    } else {
      // URL-encoded form data
      const body = await req.text();
      const urlParams = new URLSearchParams(body);
      params = {
        msisdn: urlParams.get("msisdn") || "",
        to: urlParams.get("to") || "",
        text: urlParams.get("text") || "",
        messageId: urlParams.get("messageId") || "",
      };
    }
  } else if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } else {
    return new Response("OK", { status: 200 }); // Don't return errors to Vonage
  }

  const { msisdn, text, messageId } = params;

  console.log(`[handle-sms-reply] Inbound from ${msisdn}: "${text}" (msgId: ${messageId})`);

  // Vonage expects a 200 response quickly; do all processing after
  // But since Edge Functions are synchronous, we process inline

  if (!msisdn || !text) {
    console.log("[handle-sms-reply] Missing msisdn or text, ignoring");
    return new Response("OK", { status: 200 });
  }

  try {
    // 1. Normalize the reply
    const reply = text.trim().toUpperCase();
    let decision: "apply" | "pass" | null = null;

    if (["Y", "YES", "APPLY", "YEP", "YA", "YEAH", "SI"].includes(reply)) {
      decision = "apply";
    } else if (["N", "NO", "PASS", "SKIP", "NOPE", "NAH"].includes(reply)) {
      decision = "pass";
    }

    if (!decision) {
      console.log(`[handle-sms-reply] Unrecognized reply from ${msisdn}: "${text}"`);
      // Send a helper SMS back
      await sendReply(msisdn, "BrilliantJobs: Reply Y to apply or N to pass. Text STOP to opt out.");
      return new Response("OK", { status: 200 });
    }

    // 2. Look up the user by phone number
    const phone = "+" + msisdn.replace(/\D/g, "");
    const { data: prefs } = await sb
      .from("notification_preferences")
      .select("user_id, phone_number")
      .or(`phone_number.eq.${phone},phone_number.eq.${msisdn}`)
      .single();

    if (!prefs?.user_id) {
      console.log(`[handle-sms-reply] No user found for phone ${msisdn}`);
      return new Response("OK", { status: 200 });
    }

    const userId = prefs.user_id;

    // ─── FB-TRIAL-001-S2: Feature access gate ───
    // Gate SMS reply processing for expired users without samples
    const access = await checkFeatureAccess(sb, userId, 'sms');
    if (!access.allowed) {
      console.log(`[handle-sms-reply] Feature access denied for user ${userId} (sms)`);
      await sendReply(msisdn, "BrilliantJobs: Upgrade to Pro to continue receiving SMS job alerts. Visit brilliantjobs.app/upgrade");
      return new Response("OK", { status: 200 });
    }

    // 3. Find the most recent escalated action for this user
    const { data: action } = await sb
      .from("notification_actions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "escalated")
      .eq("action_type", "apply_decision")
      .order("sms_sent_at", { ascending: false })
      .limit(1)
      .single();

    if (!action) {
      console.log(`[handle-sms-reply] No escalated action for user ${userId}`);
      await sendReply(msisdn, "BrilliantJobs: No pending job matches found. Check your dashboard for latest opportunities.");
      return new Response("OK", { status: 200 });
    }

    // 4. Process the decision
    const respondedAt = new Date().toISOString();

    await sb
      .from("notification_actions")
      .update({
        status: decision === "apply" ? "applied" : "passed",
        decision,
        responded_at: respondedAt,
        response_channel: "sms",
      })
      .eq("id", action.id);

    console.log(`[handle-sms-reply] User ${userId} replied ${decision} for ${action.job_title} at ${action.company_name}`);

    // 5. Send confirmation SMS
    if (decision === "apply") {
      await sendReply(
        msisdn,
        `BrilliantJobs: Applying for ${truncate(action.job_title, 25)} at ${truncate(action.company_name, 20)}. We'll update your pipeline.`
      );

      // TODO: In future, trigger actual application submission here
      // For now, just move to "applied" status in notification_actions
    } else {
      await sendReply(
        msisdn,
        `BrilliantJobs: Passed on ${truncate(action.job_title, 25)} at ${truncate(action.company_name, 20)}. We'll keep looking!`
      );
    }

    // 6. Log the SMS interaction
    await sb.from("notification_log").insert({
      user_id: userId,
      notification_type: "sms_reply",
      channel: "sms",
      status: "sent",
      job_id: action.job_id,
      company_name: action.company_name,
      subject: `SMS reply: ${decision}`,
      payload: {
        job_title: action.job_title,
        decision,
        inbound_text: text,
        vonage_message_id: messageId,
        response_time_seconds: action.sms_sent_at
          ? Math.floor((new Date().getTime() - new Date(action.sms_sent_at).getTime()) / 1000)
          : null,
      },
    });

    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error("[handle-sms-reply] Error:", e);
    // Always return 200 to Vonage to prevent retries
    return new Response("OK", { status: 200 });
  }
});

// ---- Helpers ----

function truncate(str: string, max: number): string {
  if (!str) return "";
  return str.length > max ? str.slice(0, max - 3) + "..." : str;
}

async function sendReply(to: string, text: string): Promise<void> {
  const VONAGE_API_KEY = Deno.env.get("VONAGE_API_KEY");
  const VONAGE_API_SECRET = Deno.env.get("VONAGE_API_SECRET");
  const VONAGE_FROM = Deno.env.get("VONAGE_FROM");

  if (!VONAGE_API_KEY || !VONAGE_API_SECRET || !VONAGE_FROM) {
    console.error("[handle-sms-reply] Vonage credentials not configured");
    return;
  }

  try {
    const res = await fetch("https://rest.nexmo.com/sms/json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: VONAGE_API_KEY,
        api_secret: VONAGE_API_SECRET,
        from: VONAGE_FROM,
        to: to.replace(/\D/g, ""),
        text,
      }),
    });

    const data = await res.json();
    const msg = data?.messages?.[0];
    if (msg?.status !== "0") {
      console.error("[handle-sms-reply] Reply SMS failed:", msg?.["error-text"]);
    } else {
      console.log(`[handle-sms-reply] Reply sent to ${to}: "${text.slice(0, 50)}..."`);
    }
  } catch (e) {
    console.error("[handle-sms-reply] Failed to send reply:", e);
  }
}
