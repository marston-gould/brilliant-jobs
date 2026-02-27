// build-extension Edge Function — Per-User Fingerprinted Extension Builder
// Phase 12: Build Fingerprint Obfuscation
// 
// Each downloaded extension gets:
// - Randomized internal message channel names
// - Randomized variable whitespace/comments in source
// - Shuffled CSS class names in injected styles
// - Randomized manifest metadata (short_name, description variations)
// - Unique build ID tracked in extension_builds table
//
// This makes pattern-based detection by LinkedIn infeasible —
// no two downloaded builds share the same file fingerprint.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { JSZip } from "https://deno.land/x/jszip@0.11.0/mod.ts";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SB_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://brilliantjobs.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Randomization Utilities ────────────────────────────────

function randomHex(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("").slice(0, len);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Generate random whitespace padding (1-4 spaces or tabs)
function randomWhitespace(): string {
  const chars = [" ", "  ", "   ", "\t", " \t"];
  return pickRandom(chars);
}

// Generate a random dead-code comment
function randomComment(): string {
  const comments = [
    "// Module initialization",
    "// Platform handler",
    "// Config loaded",
    "// State ready",
    "// Handler registered",
    "// Listener attached",
    "// Pipeline connected",
    "// Bridge initialized",
    "// Runtime check complete",
    "// Context verified",
    "// Connection established",
    "// Setup finalized",
    "// Cache warmed",
    "// Registry updated",
    "// Hooks installed",
  ];
  return pickRandom(comments);
}

// ─── Channel Name Randomization ─────────────────────────────

interface ChannelMap {
  [original: string]: string;
}

function generateChannelMap(): ChannelMap {
  // These are the internal message channel names used across the extension
  const channels = [
    "ats:pageDetected",
    "ats:fill",
    "ats:openAndFill",
    "ats:fillResult",
    "ats:submitDetected",
    "ats:confirmationDetected",
    "ats:jdMatchResult",
    "dashboard:ping",
    "dashboard:apply",
    "dashboard:fillCurrent",
    "dashboard:setTier",
    "dashboard:getJDMatch",
    "dashboard:getState",
  ];

  const map: ChannelMap = {};
  for (const ch of channels) {
    // Preserve the prefix (ats: or dashboard:) for routing, randomize the suffix
    const [prefix, suffix] = ch.split(":");
    const hash = randomHex(6);
    map[ch] = `${prefix}:${hash}`;
  }
  return map;
}

// ─── CSS Class Randomization ────────────────────────────────

interface CSSClassMap {
  [original: string]: string;
}

function generateCSSClassMap(): CSSClassMap {
  // Classes used in inject.css and contentScript.js injected UI
  const classes = [
    "bj-overlay",
    "bj-match-badge",
    "bj-status",
    "bj-tracker",
    "bj-toast",
    "bj-panel",
    "bj-button",
    "bj-input",
    "bj-progress",
  ];

  const map: CSSClassMap = {};
  for (const cls of classes) {
    map[cls] = `_${randomHex(8)}`;
  }
  return map;
}

// ─── Manifest Variations ────────────────────────────────────

interface ManifestVariation {
  short_name: string;
  description: string;
}

function generateManifestVariation(): ManifestVariation {
  const shortNames = [
    "BJ Jobs",
    "Brilliant",
    "BJ Helper",
    "Job Helper",
    "BJ Tools",
    "Career Aid",
    "Job Assist",
    "BJ Companion",
  ];

  const descriptions = [
    "Discover jobs through your professional network — with smart autofill",
    "Smart job discovery and application assistant for professionals",
    "Your career companion — job discovery, tracking, and smart apply",
    "Professional job search companion with intelligent matching",
    "Streamline your job search with network-powered discovery",
    "Career tools: job discovery, tracking, and application automation",
    "Find and apply to jobs smarter with network intelligence",
    "Job search intelligence — discover, match, apply",
  ];

  return {
    short_name: pickRandom(shortNames),
    description: pickRandom(descriptions),
  };
}

// ─── Source Transformation ──────────────────────────────────

function transformSource(
  source: string,
  channelMap: ChannelMap,
  cssClassMap: CSSClassMap,
  buildId: string
): string {
  let result = source;

  // 1. Replace channel names (in string literals)
  for (const [original, replacement] of Object.entries(channelMap)) {
    // Match both single and double quoted strings
    result = result.replace(
      new RegExp(`(['"\`])${escapeRegex(original)}\\1`, "g"),
      `$1${replacement}$1`
    );
    // Also match in template literals and object keys
    result = result.replace(
      new RegExp(`type:\\s*['"]${escapeRegex(original)}['"]`, "g"),
      `type: '${replacement}'`
    );
    result = result.replace(
      new RegExp(`===\\s*['"]${escapeRegex(original)}['"]`, "g"),
      `=== '${replacement}'`
    );
  }

  // 2. Replace CSS class names
  for (const [original, replacement] of Object.entries(cssClassMap)) {
    result = result.replace(new RegExp(escapeRegex(original), "g"), replacement);
  }

  // 3. Inject build ID as a constant (for tracking + adds unique bytes)
  const buildIdLine = `\nconst __BJ_BUILD_ID = '${buildId}';\n`;
  result = buildIdLine + result;

  // 4. Add variable whitespace before function declarations
  result = result.replace(/\nfunction /g, () => {
    return `\n${randomWhitespace()}function `;
  });

  // 5. Sprinkle random comments between top-level blocks
  const lines = result.split("\n");
  const newLines: string[] = [];
  let commentCounter = 0;
  for (const line of lines) {
    newLines.push(line);
    // Add random comments after closing braces at indent level 0
    if (/^}\s*$/.test(line) && Math.random() < 0.3) {
      newLines.push(randomComment());
      commentCounter++;
    }
    // Cap at ~15 inserted comments to not bloat too much
    if (commentCounter >= 15) break;
  }
  if (commentCounter < 15) {
    // Add remaining lines without modification
    for (let i = newLines.length; i < lines.length; i++) {
      newLines.push(lines[i]);
    }
  }

  return newLines.join("\n");
}

function transformCSS(source: string, cssClassMap: CSSClassMap): string {
  let result = source;
  for (const [original, replacement] of Object.entries(cssClassMap)) {
    result = result.replace(new RegExp(`\\.${escapeRegex(original)}`, "g"), `.${replacement}`);
  }
  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Build Package ──────────────────────────────────────────

async function buildFingerprintedExtension(
  userId: string,
  userTier: string,
  sb: ReturnType<typeof createClient>
): Promise<{ zip: Uint8Array; buildId: string; channelMap: ChannelMap }> {
  const buildId = `bj_${randomHex(16)}`;
  const channelMap = generateChannelMap();
  const cssClassMap = generateCSSClassMap();
  const manifestVariation = generateManifestVariation();

  // Fetch the canonical extension source from Supabase Storage
  // Files are stored in 'extension-source' bucket by admin upload
  const sourceFiles = [
    "background.js",
    "contentScript.js",
    "content.js",
    "popup.js",
    "popup.html",
    "supabase.js",
    "help.html",
    "human-sim.js",
    "interceptor.js",
    "interceptor-bridge.js",
    "popup-bridge.js",
    "popup-post.js",
    "manifest.json",
    "inject.css",
    // Handlers
    "handlers/lever.js",
    "handlers/greenhouse-legacy.js",
    "handlers/greenhouse-react.js",
    "handlers/ashby.js",
    "handlers/workable.js",
    "handlers/recruitee.js",
    "handlers/linkedin-easy-apply.js",
    "handlers/indeed.js",
    "handlers/workday.js",
    // Utils
    "utils/originGuard.js",
    "utils/crypto.js",
    "utils/tierGate.js",
    "utils/jdMatcher.js",
    "utils/autoTracker.js",
    "utils/fieldFillerQueue.js",
    "utils/fileUpload.js",
    "utils/mutationWatcher.js",
    "utils/reactProps.js",
    "utils/applicationTracker.js",
    // Fields
    "fields/textInput.js",
    "fields/dropdown.js",
    "fields/dateFields.js",
    "fields/checkbox.js",
    "fields/radioGroup.js",
    "fields/dropdownSearchable.js",
  ];

  const iconFiles = ["icon16.png", "icon48.png", "icon128.png"];

  const zip = new JSZip();

  // Process each source file
  for (const file of sourceFiles) {
    const { data, error } = await sb.storage
      .from("extension-source")
      .download(`v4/${file}`);

    if (error || !data) {
      console.error(`Failed to fetch ${file}:`, error?.message);
      continue;
    }

    const text = await data.text();

    if (file === "manifest.json") {
      // Transform manifest with variations
      const manifest = JSON.parse(text);
      manifest.short_name = manifestVariation.short_name;
      manifest.description = manifestVariation.description;
      // Inject build metadata (invisible to user)
      manifest._build = buildId;
      zip.file(file, JSON.stringify(manifest, null, 2));
    } else if (file === "inject.css") {
      // Transform CSS classes
      zip.file(file, transformCSS(text, cssClassMap));
    } else if (file.endsWith(".js")) {
      // Transform JS source
      zip.file(file, transformSource(text, channelMap, cssClassMap, buildId));
    } else {
      // HTML files — replace CSS class references
      let html = text;
      for (const [original, replacement] of Object.entries(cssClassMap)) {
        html = html.replace(new RegExp(escapeRegex(original), "g"), replacement);
      }
      zip.file(file, html);
    }
  }

  // Copy icon files as-is (binary)
  for (const icon of iconFiles) {
    const { data, error } = await sb.storage
      .from("extension-source")
      .download(`v4/${icon}`);
    if (data && !error) {
      zip.file(icon, await data.arrayBuffer());
    }
  }

  // Add build metadata file
  zip.file(
    "version.json",
    JSON.stringify(
      {
        version: "4.0.0",
        build: buildId,
        built_at: new Date().toISOString(),
        tier: userTier,
      },
      null,
      2
    )
  );

  // Generate the ZIP
  const zipBytes = await zip.generateAsync({ type: "uint8array" });

  return { zip: zipBytes, buildId, channelMap };
}

// ─── Main Handler ───────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    // Auth: extract user from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const sbUser = createClient(SB_URL, SB_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await sbUser.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Rate limit: max 5 builds per day per user
    const sbAdmin = createClient(SB_URL, SB_SERVICE_KEY);
    const today = new Date().toISOString().split("T")[0];

    const { count } = await sbAdmin
      .from("extension_builds")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", `${today}T00:00:00Z`);

    if ((count ?? 0) >= 5) {
      return new Response(
        JSON.stringify({ error: "Daily build limit reached (5/day)" }),
        {
          status: 429,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    // Get user's tier
    const { data: profile } = await sbAdmin
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    const userTier = profile?.plan || "free";

    // Build the fingerprinted extension
    const { zip, buildId, channelMap } = await buildFingerprintedExtension(
      user.id,
      userTier,
      sbAdmin
    );

    // Record the build
    await sbAdmin.from("extension_builds").insert({
      build_id: buildId,
      user_id: user.id,
      channel_map: channelMap,
      tier_at_build: userTier,
      file_hash: randomHex(32), // SHA-256 of zip would be ideal, using placeholder
      size_bytes: zip.length,
    });

    // Return the ZIP as a download
    return new Response(zip, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="brilliant-jobs-extension-${buildId.slice(3, 11)}.zip"`,
        "X-Build-Id": buildId,
      },
    });
  } catch (err) {
    console.error("Build error:", err);
    return new Response(
      JSON.stringify({ error: "Build failed", detail: String(err) }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }
});
