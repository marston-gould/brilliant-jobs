// gmail-disconnect Edge Function
// Revokes Gmail tokens, deletes connection + email signals

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { withCorrelation } from "../_shared/middleware.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function decrypt(encoded: string): string {
  const key = SUPABASE_SERVICE_ROLE_KEY;
  const decoded = atob(encoded);
  let result = "";
  for (let i = 0; i < decoded.length; i++) {
    result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

serve(withCorrelation("gmail-disconnect", async (req, logger) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
  }

  try {
    const { data: conn } = await sb
      .from("gmail_connections")
      .select("refresh_token_enc")
      .eq("user_id", user.id)
      .single();

    if (conn?.refresh_token_enc && conn.refresh_token_enc !== "pending") {
      try {
        const refreshToken = decrypt(conn.refresh_token_enc);
        await fetch(`https://oauth2.googleapis.com/revoke?token=${refreshToken}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        logger.info("Google token revoked", { userId: user.id });
      } catch (e) {
        logger.warn("Token revoke failed (non-blocking)", { error: (e as Error).message });
      }
    }

    await sb.from("email_signals").delete().eq("user_id", user.id);
    await sb.from("gmail_connections").delete().eq("user_id", user.id);

    logger.info("Gmail disconnected", { userId: user.id });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e) {
    logger.error("Disconnect error", { error: (e as Error).message });
    return new Response(JSON.stringify({ error: "Failed to disconnect" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}));
