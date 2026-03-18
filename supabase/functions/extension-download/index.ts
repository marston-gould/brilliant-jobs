// extension-download Edge Function
// Redirects to the latest extension build stored in Supabase Storage
// Route: GET /api/extension/download (via Vercel rewrite)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  }

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Try to get the latest extension ZIP from storage
    const { data: files } = await sb.storage
      .from("extension-builds")
      .list("", { limit: 1, sortBy: { column: "created_at", order: "desc" } });

    if (files && files.length > 0) {
      const { data: signedUrl } = await sb.storage
        .from("extension-builds")
        .createSignedUrl(files[0].name, 3600); // 1 hour expiry

      if (signedUrl?.signedUrl) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: signedUrl.signedUrl,
            "Content-Disposition": `attachment; filename="brilliant-jobs-extension.zip"`,
          },
        });
      }
    }

    // Fallback: redirect to GitHub releases
    return new Response(null, {
      status: 302,
      headers: {
        Location: "https://github.com/marston-gould/brilliant-jobs/releases/latest",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Extension download unavailable" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
