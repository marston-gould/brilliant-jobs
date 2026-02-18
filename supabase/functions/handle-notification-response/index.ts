// handle-notification-response Edge Function
// Handles two entry points:
// 1. GET — Email button clicks: ?action_id=xxx&decision=apply|pass
// 2. POST — Vonage inbound SMS webhook: { msisdn, text } where text = "Y" or "N"
// Processes the decision, updates notification_actions, creates pipeline entry if applied.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { autoApplyConfirmEmail } from "../_shared/email-templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://brilliantjobs.app";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Redirect user to dashboard with a status message
function redirectResponse(message: string, success: boolean): Response {
  const status = success ? "success" : "error";
  const url = `${SITE_URL}/dashboard.html?notify_action=${status}&msg=${encodeURIComponent(message)}#applications`;
  return new Response(null, {
    status: 302,
    headers: { Location: url },
  });
}

// Process an apply decision
async function processApply(actionId: string): Promise<{ ok: boolean; error?: string }> {
  // Get the action record
  const { data: action, error: fetchErr } = await sb
    .from("notification_actions")
    .select("*")
    .eq("id", actionId)
    .single();

  if (fetchErr || !action) {
    return { ok: false, error: "Action not found" };
  }

  if (action.status === "accepted") {
    return { ok: true, error: "Already applied" };
  }

  if (action.status === "passed" || action.status === "missed") {
    return { ok: false, error: `Action already ${action.status}` };
  }

  // Update action to accepted
  const { error: updateErr } = await sb
    .from("notification_actions")
    .update({
      status: "accepted",
      responded_at: new Date().toISOString(),
    })
    .eq("id", actionId);

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  // Send confirmation email via send-notification
  const emailData = autoApplyConfirmEmail({
    title: action.job_title,
    company: action.company_name,
    job_id: action.job_id,
  });

  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        user_id: action.user_id,
        notification_type: "auto_apply_confirm",
        subject: emailData.subject,
        html: emailData.html,
        job_id: action.job_id,
        company_name: action.company_name,
        job_title: action.job_title,
        force_channel: "email",
      }),
    });
  } catch (e) {
    console.warn("[handle-response] Confirmation email failed:", e);
  }

  console.log(`[handle-response] APPLY: ${action.job_title} at ${action.company_name} for user ${action.user_id}`);
  return { ok: true };
}

// Process a pass decision
async function processPass(actionId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: action, error: fetchErr } = await sb
    .from("notification_actions")
    .select("*")
    .eq("id", actionId)
    .single();

  if (fetchErr || !action) {
    return { ok: false, error: "Action not found" };
  }

  if (action.status === "passed" || action.status === "accepted") {
    return { ok: true, error: `Already ${action.status}` };
  }

  const { error: updateErr } = await sb
    .from("notification_actions")
    .update({
      status: "passed",
      responded_at: new Date().toISOString(),
    })
    .eq("id", actionId);

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  console.log(`[handle-response] PASS: ${action.job_title} at ${action.company_name} for user ${action.user_id}`);
  return { ok: true };
}

serve(async (req: Request) => {
  const url = new URL(req.url);

  // ---- Entry Point 1: Email button clicks (GET) ----
  if (req.method === "GET") {
    const actionId = url.searchParams.get("action_id");
    const decision = url.searchParams.get("decision");

    if (!actionId || !decision) {
      return redirectResponse("Invalid link — missing parameters.", false);
    }

    if (decision === "apply") {
      const result = await processApply(actionId);
      if (result.ok) {
        return redirectResponse("Resume submitted! Check your pipeline.", true);
      }
      return redirectResponse(result.error || "Failed to apply.", false);
    }

    if (decision === "pass") {
      const result = await processPass(actionId);
      if (result.ok) {
        return redirectResponse("Noted — skipped this opportunity.", true);
      }
      return redirectResponse(result.error || "Failed to record pass.", false);
    }

    return redirectResponse("Unknown decision.", false);
  }

  // ---- Entry Point 2: Vonage inbound SMS webhook (POST) ----
  if (req.method === "POST") {
    try {
      // Vonage can send as JSON or form-encoded
      let from: string;
      let text: string;

      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const body = await req.json();
        from = body.msisdn || body.from || "";
        text = (body.text || "").trim().toUpperCase();
      } else {
        const formData = await req.formData();
        from = (formData.get("msisdn") as string) || (formData.get("from") as string) || "";
        text = ((formData.get("text") as string) || "").trim().toUpperCase();
      }

      if (!from) {
        return new Response(JSON.stringify({ error: "No sender phone number" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Normalize phone: strip + and spaces
      const normalizedPhone = from.replace(/\D/g, "");

      // Find the user by phone number
      const { data: prefRows } = await sb
        .from("notification_preferences")
        .select("user_id, phone_number")
        .eq("phone_verified", true);

      const userPref = (prefRows || []).find((p) => {
        const stored = (p.phone_number || "").replace(/\D/g, "");
        return stored === normalizedPhone || stored.endsWith(normalizedPhone) || normalizedPhone.endsWith(stored);
      });

      if (!userPref) {
        console.warn(`[handle-response] SMS from unknown number: ${from}`);
        return new Response(JSON.stringify({ error: "Unknown phone number" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Find the most recent escalated action for this user
      const { data: pendingActions } = await sb
        .from("notification_actions")
        .select("*")
        .eq("user_id", userPref.user_id)
        .eq("status", "escalated")
        .order("created_at", { ascending: false })
        .limit(1);

      if (!pendingActions || pendingActions.length === 0) {
        console.warn(`[handle-response] SMS reply but no escalated actions for user ${userPref.user_id}`);
        return new Response(JSON.stringify({ message: "No pending actions" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const action = pendingActions[0];

      if (text === "Y" || text === "YES") {
        const result = await processApply(action.id);
        console.log(`[handle-response] SMS APPLY from ${from}:`, result);
      } else if (text === "N" || text === "NO") {
        const result = await processPass(action.id);
        console.log(`[handle-response] SMS PASS from ${from}:`, result);
      } else {
        console.log(`[handle-response] Unrecognized SMS reply from ${from}: "${text}"`);
      }

      // Vonage expects 200 OK
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("[handle-response] SMS handler error:", e);
      return new Response(JSON.stringify({ error: String(e) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
});
