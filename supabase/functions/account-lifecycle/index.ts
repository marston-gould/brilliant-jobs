// account-lifecycle Edge Function
// Handles: welcome, account_approved, password_reset, subscription_confirm,
// subscription_expiring, inactive_warning
// Called by: Supabase Auth hooks, pg_cron, or other Edge Functions.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  welcomeEmail,
  accountApprovedEmail,
  passwordResetEmail,
  subscriptionConfirmEmailLegacy as subscriptionConfirmEmail,
  subscriptionExpiringEmail,
  inactivityWarningEmail,
} from "../_shared/email-templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Call the send-notification function internally
async function callSendNotification(payload: Record<string, unknown>): Promise<Response> {
  return fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });
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
    const body = await req.json();

    // Detect Supabase Auth hook payload format:
    // { "user": { "id": "...", "email": "...", "user_metadata": {...} } }
    let type: string;
    let user_id: string;
    let data: Record<string, unknown> | undefined;

    if (body.user && body.user.id) {
      // Auth hook — this is a new signup
      type = "welcome";
      user_id = body.user.id;
      data = { email: body.user.email, user_metadata: body.user.user_metadata };
    } else {
      // Direct call — { type, user_id, data }
      type = body.type;
      user_id = body.user_id;
      data = body.data;
    }

    if (!type || !user_id) {
      return new Response(
        JSON.stringify({ error: "type and user_id required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get user info for personalization
    let userName: string | undefined;
    try {
      const { data: profile } = await sb
        .from("profiles")
        .select("full_name")
        .eq("id", user_id)
        .single();
      userName = profile?.full_name || undefined;
    } catch { /* use default */ }

    let emailContent: { subject: string; html: string } | null = null;

    switch (type) {
      case "welcome": {
        emailContent = welcomeEmail(userName);
        break;
      }
      case "account_approved": {
        emailContent = accountApprovedEmail(userName);
        break;
      }
      case "password_reset": {
        const resetLink = data?.reset_link as string;
        if (!resetLink) {
          return new Response(
            JSON.stringify({ error: "reset_link required for password_reset" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        emailContent = passwordResetEmail(resetLink);
        break;
      }
      case "subscription_confirm": {
        const plan = (data?.plan as string) || "Pro";
        const amount = (data?.amount as string) || "$29/mo";
        emailContent = subscriptionConfirmEmail(plan, amount);
        break;
      }
      case "subscription_expiring": {
        const daysLeft = (data?.days_left as number) || 7;
        const plan = (data?.plan as string) || "Pro";
        emailContent = subscriptionExpiringEmail(daysLeft, plan);
        break;
      }
      case "inactive_warning": {
        const daysSince = (data?.days_since as number) || 30;
        emailContent = inactivityWarningEmail(daysSince);
        break;
      }
      default:
        return new Response(
          JSON.stringify({ error: `Unknown lifecycle type: ${type}` }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    if (!emailContent) {
      return new Response(
        JSON.stringify({ error: "Failed to generate email content" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Send via the core send-notification function
    // Account lifecycle emails bypass channel preferences — always send via email
    const result = await callSendNotification({
      user_id,
      notification_type: type,
      subject: emailContent.subject,
      html: emailContent.html,
      force_channel: "email",
    });

    const resultData = await result.json();

    console.log(`[account-lifecycle] ${type} for ${user_id}:`, resultData);

    return new Response(JSON.stringify(resultData), {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[account-lifecycle] Error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
