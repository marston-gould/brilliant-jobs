// extension-version Edge Function — EXT-BUILD-001 S2.2
// Lightweight GET endpoint. No auth required. Cached 1 hour.
// Returns latest version, minimum supported version, and download URL.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Current version constants — update these on each extension release
const LATEST_VERSION = "3.0.0";
const MIN_SUPPORTED_VERSION = "2.21.0";
const DOWNLOAD_URL = "https://brilliantjobs.app/#get-started";
const CHANGELOG_URL = "https://brilliantjobs.app/roadmap";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const body = JSON.stringify({
    latest: LATEST_VERSION,
    min_supported: MIN_SUPPORTED_VERSION,
    download_url: DOWNLOAD_URL,
    changelog_url: CHANGELOG_URL,
    updated_at: "2026-03-15T00:00:00Z",
  });

  return new Response(body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
});
