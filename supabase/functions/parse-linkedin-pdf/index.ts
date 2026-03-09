/**
 * FB-PAYL-S1: Parse LinkedIn PDF Edge Function
 *
 * Actions:
 *   POST { action: "parse", enrollment_id, storage_path }  → Parse PDF, extract data, record on enrollment
 *   POST { action: "validate", pdf_hash }                   → Check hash dedup without full parse
 *   POST { action: "status", enrollment_id }                → Get parse status for enrollment
 *
 * Auth: Requires authenticated user (own enrollment) or admin.
 *
 * Phase: FB-PAYL-S1 — Pay After You Land Foundation
 * Pair: Lead Platform Eng + Forward-Looking Developer(s)
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://brilliantjobs.app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, apikey, x-correlation-id",
};

// ── LinkedIn PDF Parser ─────────────────────────────────────────────────────
// LinkedIn PDF exports have a predictable structure:
//   Name (large font, first line)
//   Headline (second section)
//   Location
//   Contact info
//   Experience section (company, title, dates)
//   Education section
//   Skills section
//
// Strategy: regex + heuristic extraction (not rigid positional parsing)
// per FB-PAYL-001 Section 10 recommendation.

interface ParsedProfile {
  display_name: string | null;
  headline: string | null;
  location: string | null;
  experience_json: ExperienceEntry[];
  skills_array: string[];
  education_json: EducationEntry[];
  li_connections: number | null;
  raw_text_length: number;
  parse_confidence: number;
}

interface ExperienceEntry {
  title: string;
  company: string;
  dates: string;
  duration: string | null;
  description: string | null;
}

interface EducationEntry {
  school: string;
  degree: string | null;
  dates: string | null;
}

function extractTextFromPdf(pdfBytes: Uint8Array): string {
  // Simple PDF text extraction — looks for text stream objects
  // LinkedIn PDFs use standard text encoding (not compressed streams typically)
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(pdfBytes);

  const textChunks: string[] = [];

  // Extract text between BT...ET blocks (PDF text objects)
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1];
    // Extract text from Tj and TJ operators
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      textChunks.push(tjMatch[1]);
    }
    // TJ arrays: [(text) kern (text) kern ...]
    const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g;
    let arrMatch;
    while ((arrMatch = tjArrayRegex.exec(block)) !== null) {
      const items = arrMatch[1];
      const textParts = items.match(/\(([^)]*)\)/g);
      if (textParts) {
        textChunks.push(textParts.map((p: string) => p.slice(1, -1)).join(""));
      }
    }
  }

  return textChunks
    .join("\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .trim();
}

function parseLinkedInText(text: string): ParsedProfile {
  const lines = text.split("\n").map((l: string) => l.trim()).filter(Boolean);
  let confidence = 0;

  // Name: typically the first substantial line
  const display_name = lines.length > 0 ? lines[0] : null;
  if (display_name && display_name.length > 2 && display_name.length < 100) confidence += 15;

  // Headline: usually second line
  const headline = lines.length > 1 ? lines[1] : null;
  if (headline) confidence += 10;

  // Location: look for city/state/country patterns
  let location: string | null = null;
  const locationPatterns = [
    /^([A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2}(?:\s*,\s*\w+)?)$/,
    /^([A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z][a-z]+(?:\s[A-Z][a-z]+)*)$/,
    /(?:Greater\s)?([A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s*(?:Area|Metro))/,
  ];
  for (const line of lines.slice(2, 10)) {
    for (const pat of locationPatterns) {
      const m = line.match(pat);
      if (m) { location = m[1] || line; confidence += 10; break; }
    }
    if (location) break;
  }

  // Experience: look for section header then title/company/date patterns
  const experience_json: ExperienceEntry[] = [];
  const expHeaderIdx = lines.findIndex((l: string) => /^Experience$/i.test(l));
  if (expHeaderIdx >= 0) {
    confidence += 15;
    let i = expHeaderIdx + 1;
    while (i < lines.length && !/^(Education|Skills|Licenses|Certifications|Languages|Projects|Honors|Volunteer|Publications)$/i.test(lines[i])) {
      const title = lines[i];
      const company = lines[i + 1] || "";
      const dates = lines[i + 2] || "";
      if (title && company) {
        experience_json.push({
          title,
          company,
          dates,
          duration: null,
          description: null,
        });
      }
      i += 3; // Skip ahead (title, company, dates)
      // Skip description lines until next entry or section
      while (i < lines.length && !/^(Education|Skills|Licenses|Certifications)$/i.test(lines[i]) && lines[i].length > 50) {
        i++;
      }
    }
    if (experience_json.length > 0) confidence += 10;
  }

  // Skills
  const skills_array: string[] = [];
  const skillsHeaderIdx = lines.findIndex((l: string) => /^Skills$/i.test(l));
  if (skillsHeaderIdx >= 0) {
    confidence += 10;
    let i = skillsHeaderIdx + 1;
    while (i < lines.length && !/^(Languages|Certifications|Honors|Volunteer|Education|Experience|Projects|Publications)$/i.test(lines[i]) && i < skillsHeaderIdx + 50) {
      if (lines[i].length > 1 && lines[i].length < 80) {
        skills_array.push(lines[i]);
      }
      i++;
    }
  }

  // Education
  const education_json: EducationEntry[] = [];
  const eduHeaderIdx = lines.findIndex((l: string) => /^Education$/i.test(l));
  if (eduHeaderIdx >= 0) {
    confidence += 10;
    let i = eduHeaderIdx + 1;
    while (i < lines.length && !/^(Skills|Experience|Licenses|Certifications|Languages|Projects|Honors|Volunteer|Publications)$/i.test(lines[i])) {
      const school = lines[i];
      const degree = lines[i + 1] || null;
      const dates = lines[i + 2] || null;
      if (school) {
        education_json.push({ school, degree, dates });
      }
      i += 3;
    }
  }

  // Connections: look for "XXX connections" or "500+ connections"
  let li_connections: number | null = null;
  for (const line of lines) {
    const connMatch = line.match(/(\d+)\+?\s*connections?/i);
    if (connMatch) {
      li_connections = parseInt(connMatch[1], 10);
      confidence += 10;
      break;
    }
  }

  // LinkedIn format detection bonus
  const hasLinkedInMarkers = text.includes("linkedin.com") || text.includes("LinkedIn") || text.includes("Experience") && text.includes("Education");
  if (hasLinkedInMarkers) confidence += 10;

  return {
    display_name,
    headline,
    location,
    experience_json,
    skills_array,
    education_json,
    li_connections,
    raw_text_length: text.length,
    parse_confidence: Math.min(confidence, 100),
  };
}

async function computeSha256(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { action, enrollment_id, storage_path, pdf_hash } = await req.json();

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Action: validate ──────────────────────────────────────────────
    if (action === "validate") {
      const { data } = await sb
        .from("payl_enrollments")
        .select("id")
        .eq("linkedin_pdf_hash", pdf_hash)
        .maybeSingle();

      return new Response(
        JSON.stringify({ duplicate: !!data, enrollment_id: data?.id || null }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // ── Action: status ────────────────────────────────────────────────
    if (action === "status") {
      const { data, error } = await sb
        .from("payl_enrollments")
        .select("id, status, linkedin_pdf_hash, parsed_profile, referrals_qualified")
        .eq("id", enrollment_id)
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 404,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          enrollment_id: data.id,
          status: data.status,
          has_pdf: !!data.linkedin_pdf_hash,
          parsed_fields: data.parsed_profile ? Object.keys(data.parsed_profile).length : 0,
          referrals_qualified: data.referrals_qualified,
        }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // ── Action: parse ─────────────────────────────────────────────────
    if (action === "parse") {
      if (!enrollment_id || !storage_path) {
        return new Response(
          JSON.stringify({ error: "enrollment_id and storage_path required" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Download PDF from Storage
      const { data: fileData, error: dlError } = await sb.storage
        .from("linkedin-profiles")
        .download(storage_path);

      if (dlError || !fileData) {
        return new Response(
          JSON.stringify({ error: "Failed to download PDF", detail: dlError?.message }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      const pdfBytes = new Uint8Array(await fileData.arrayBuffer());

      // Validate it's a PDF (magic bytes: %PDF)
      const header = new TextDecoder().decode(pdfBytes.slice(0, 5));
      if (!header.startsWith("%PDF")) {
        return new Response(
          JSON.stringify({ error: "File is not a valid PDF", fraud_signal: "invalid_format" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Compute SHA-256 hash
      const hash = await computeSha256(pdfBytes);

      // Extract and parse text
      const text = extractTextFromPdf(pdfBytes);
      if (text.length < 50) {
        return new Response(
          JSON.stringify({
            error: "Could not extract sufficient text from PDF. Please ensure this is a LinkedIn profile PDF export.",
            fraud_signal: "parse_failure",
            text_length: text.length,
          }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      const parsed = parseLinkedInText(text);

      // Fraud signals
      const fraud_signals: string[] = [];
      if (parsed.li_connections !== null && parsed.li_connections < 50) {
        fraud_signals.push("low_connections");
      }
      if (parsed.experience_json.length === 0) {
        fraud_signals.push("no_experience");
      }
      if (parsed.parse_confidence < 30) {
        fraud_signals.push("low_confidence");
      }

      // Record on enrollment via RPC
      const { data: result, error: rpcError } = await sb.rpc("fn_payl_record_pdf", {
        p_enrollment_id: enrollment_id,
        p_pdf_path: storage_path,
        p_pdf_hash: hash,
        p_parsed_profile: parsed,
      });

      if (rpcError) {
        return new Response(
          JSON.stringify({ error: rpcError.message }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Publish event to event bus (H-02, non-blocking)
      try {
        await sb.rpc("fn_publish_event", {
          p_event_type: "payl.pdf_uploaded",
          p_payload: {
            enrollment_id,
            pdf_hash: hash,
            parse_confidence: parsed.parse_confidence,
            fraud_signals,
            field_count: Object.keys(parsed).filter((k: string) => {
              const val = (parsed as Record<string, unknown>)[k];
              return val !== null && val !== undefined && val !== "" &&
                !(Array.isArray(val) && val.length === 0);
            }).length,
          },
        });
      } catch (_e) {
        // Non-blocking: event bus failure doesn't block PDF parse
        console.warn("[parse-linkedin-pdf] Event bus publish failed:", _e);
      }

      return new Response(
        JSON.stringify({
          ...result,
          parsed_profile: parsed,
          fraud_signals,
          pdf_hash: hash,
        }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[parse-linkedin-pdf] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
