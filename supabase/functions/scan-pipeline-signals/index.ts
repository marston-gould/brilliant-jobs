// scan-pipeline-signals Edge Function v2 (Phase C)
// Trigger: pg_cron every 15 min
// Purpose: For users with signal_detection_enabled=true,
//          scan Google Calendar for interview events matching pipeline companies.
//          Uses signal_patterns table for cross-user learned confidence scores.
// Gmail scanning is handled by gmail-scan EF separately.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GMAIL_CLIENT_ID = Deno.env.get("GMAIL_CLIENT_ID") || "";
const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET") || "";
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MAX_RUNTIME_MS = 120_000;
const startTime = Date.now();
function isOvertime(): boolean { return Date.now() - startTime > MAX_RUNTIME_MS; }

function decrypt(encoded: string): string {
  const key = SUPABASE_SERVICE_ROLE_KEY;
  const decoded = atob(encoded);
  let result = "";
  for (let i = 0; i < decoded.length; i++) {
    result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

async function refreshAccessToken(refreshTokenEnc: string): Promise<string | null> {
  const refreshToken = decrypt(refreshTokenEnc);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
    }),
  });
  const data = await res.json();
  return data.error ? null : data.access_token;
}

// ── Cross-user learned patterns ──────────────────────────────────
// Load calendar_format patterns from signal_patterns table.
// These are updated by confirm-pipeline-signal when users confirm/dismiss.
interface PatternEntry {
  pattern_value: string;
  confidence_score: number;
  confirmations: number;
  dismissals: number;
}
let _calendarPatterns: PatternEntry[] = [];

async function loadCalendarPatterns() {
  const { data } = await sb
    .from("signal_patterns")
    .select("pattern_value, confidence_score, confirmations, dismissals")
    .eq("pattern_type", "calendar_format")
    .eq("associated_signal_type", "interview_invite")
    .gt("confidence_score", 0.3);  // Skip patterns with very low confidence
  _calendarPatterns = data || [];
}

// ── Interview round detection ────────────────────────────────────
const ROUND_PATTERNS: { re: RegExp; round: string }[] = [
  { re: /final\s*round/i, round: "final" },
  { re: /(?:3rd|third|4th|fourth|5th|fifth)\s*(?:round|interview)/i, round: "late" },
  { re: /(?:2nd|second)\s*(?:round|interview)/i, round: "2" },
  { re: /(?:1st|first)\s*(?:round|interview)/i, round: "1" },
  { re: /on[- ]?site/i, round: "onsite" },
  { re: /panel/i, round: "panel" },
  { re: /technical\s*(?:screen|interview|assessment)/i, round: "technical" },
  { re: /hiring\s*manager/i, round: "hm" },
  { re: /phone\s*screen/i, round: "phone_screen" },
  { re: /(?:intro|introductory)\s*(?:call|chat)/i, round: "intro" },
];

function detectInterviewRound(title: string): string | null {
  for (const p of ROUND_PATTERNS) {
    if (p.re.test(title)) return p.round;
  }
  return null;
}

// ── Event matching with learned + hardcoded patterns ─────────────
function isInterviewEvent(title: string): { match: boolean; confidence: number; matchedPattern: string | null } {
  const t = title.toLowerCase();

  // 1. Check learned patterns from signal_patterns table (cross-user data)
  for (const pat of _calendarPatterns) {
    if (t.includes(pat.pattern_value.toLowerCase())) {
      return { match: true, confidence: pat.confidence_score, matchedPattern: pat.pattern_value };
    }
  }

  // 2. Fallback to hardcoded detection for patterns not yet in signal_patterns
  const highConf = ["interview", "on-site", "onsite", "final round", "technical screen", "hiring manager"];
  const medConf = ["phone screen", "intro call", "culture fit", "panel", "assessment"];
  const lowConf = ["chat", "catch up", "sync", "meet", "call with"];

  for (const kw of highConf) { if (t.includes(kw)) return { match: true, confidence: 0.90, matchedPattern: kw }; }
  for (const kw of medConf) { if (t.includes(kw)) return { match: true, confidence: 0.75, matchedPattern: kw }; }
  for (const kw of lowConf) { if (t.includes(kw)) return { match: true, confidence: 0.50, matchedPattern: kw }; }
  return { match: false, confidence: 0, matchedPattern: null };
}

serve(async (req: Request) => {
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  console.log(`[scan-pipeline-signals] v2 Starting. cid=${correlationId}`);

  try {
    // Load cross-user learned patterns
    await loadCalendarPatterns();
    console.log(`[scan-pipeline-signals] Loaded ${_calendarPatterns.length} calendar patterns from signal_patterns`);

    // Get users with signal_detection_enabled
    const { data: settings } = await sb
      .from("pipeline_tracking_settings")
      .select("user_id, calendar_lookahead_days, confidence_threshold")
      .eq("signal_detection_enabled", true);

    if (!settings?.length) {
      return new Response(JSON.stringify({ users: 0, signals: 0, patterns: _calendarPatterns.length }), { status: 200 });
    }

    let totalSignals = 0;
    let usersProcessed = 0;
    let calendarErrors = 0;

    for (const setting of settings) {
      if (isOvertime()) break;

      // Get user's Gmail connection for OAuth token (Calendar uses same Google OAuth)
      const { data: conn } = await sb
        .from("gmail_connections")
        .select("refresh_token_enc")
        .eq("user_id", setting.user_id)
        .eq("sync_status", "active")
        .single();

      if (!conn) continue;

      const accessToken = await refreshAccessToken(conn.refresh_token_enc);
      if (!accessToken) continue;

      // Get user's pipeline companies (non-terminal stages)
      const { data: entries } = await sb
        .from("user_pipeline")
        .select("id, company_name, company_domain, stage")
        .eq("user_id", setting.user_id)
        .not("stage", "in", "(offer,rejected,archived,hired)")
        .neq("tracking_mode", "muted");

      if (!entries?.length) { usersProcessed++; continue; }

      // Build company domain set for matching
      const companyDomains = new Map<string, { id: string; name: string }>(); // domain → {entry_id, name}
      const companyNames = new Map<string, string>(); // lowercase name → entry_id
      for (const e of entries) {
        if (e.company_domain) companyDomains.set(e.company_domain.toLowerCase(), { id: e.id, name: e.company_name || "" });
        if (e.company_name) companyNames.set(e.company_name.toLowerCase(), e.id);
      }

      // Scan Google Calendar
      const lookahead = setting.calendar_lookahead_days || 14;
      const now = new Date();
      const futureDate = new Date(now.getTime() + lookahead * 86400000);
      const pastDate = new Date(now.getTime() - 3 * 86400000); // Also check 3 days back

      try {
        const calRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
          `timeMin=${pastDate.toISOString()}&timeMax=${futureDate.toISOString()}&maxResults=50&singleEvents=true&orderBy=startTime`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!calRes.ok) {
          if (calRes.status === 403 || calRes.status === 401) {
            console.log(`[scan-pipeline-signals] Calendar not authorized for ${setting.user_id}`);
          }
          calendarErrors++;
          usersProcessed++;
          continue;
        }

        const calData = await calRes.json();
        const events = calData.items || [];

        for (const event of events) {
          const title = event.summary || "";
          const attendees = (event.attendees || []).map((a: Record<string, unknown>) => a.email?.toLowerCase() || "");

          // Try to match this event to a pipeline company
          let matchedEntryId: string | null = null;
          let matchedCompanyName: string | null = null;
          let matchMethod: string = "none";

          // Check attendee domains against pipeline company domains (high confidence)
          for (const email of attendees) {
            const domain = email.split("@")[1];
            if (domain && companyDomains.has(domain)) {
              const match = companyDomains.get(domain)!;
              matchedEntryId = match.id;
              matchedCompanyName = match.name;
              matchMethod = "attendee_domain";
              break;
            }
          }

          // Fallback: check event title for company names (lower confidence)
          if (!matchedEntryId) {
            const titleLower = title.toLowerCase();
            for (const [name, id] of companyNames) {
              if (name.length >= 3 && titleLower.includes(name)) {
                matchedEntryId = id;
                matchedCompanyName = name;
                matchMethod = "title_match";
                break;
              }
            }
          }

          if (!matchedEntryId) continue;

          // Check if this looks like an interview
          const interviewCheck = isInterviewEvent(title);
          if (!interviewCheck.match) continue;

          // Apply confidence threshold — attendee_domain matches get a confidence boost
          let finalConfidence = interviewCheck.confidence;
          if (matchMethod === "attendee_domain") {
            finalConfidence = Math.min(1, finalConfidence + 0.05);
          }
          if (finalConfidence < (setting.confidence_threshold || 0.6)) continue;

          // Detect interview round
          const round = detectInterviewRound(title);

          // Dedup: check for existing signal with this calendar event ID
          const eventId = event.id || "";
          const { data: existing } = await sb
            .from("pipeline_signals")
            .select("id")
            .eq("pipeline_entry_id", matchedEntryId)
            .eq("signal_source", "calendar")
            .in("status", ["pending_confirmation", "confirmed"])
            .limit(1);

          if (existing?.length) continue;

          // Create the signal
          const eventTime = event.start?.dateTime || event.start?.date || "";
          await sb.from("pipeline_signals").insert({
            user_id: setting.user_id,
            pipeline_entry_id: matchedEntryId,
            signal_source: "calendar",
            signal_type: "interview_invite",
            proposed_stage: "interview",
            confidence: finalConfidence,
            evidence_preview: `Calendar: "${title}" on ${new Date(eventTime).toLocaleDateString()}`,
            evidence_metadata: {
              calendar_event_id: eventId,
              calendar_title: title,
              event_time: eventTime,
              attendee_domains: attendees.map((e: string) => e.split("@")[1]).filter(Boolean),
              match_method: matchMethod,
              matched_company: matchedCompanyName,
              matched_pattern: interviewCheck.matchedPattern,
              interview_round: round,
            },
            status: "pending_confirmation",
          });

          totalSignals++;
        }
      } catch (e) {
        console.warn(`[scan-pipeline-signals] Calendar error for ${setting.user_id}:`, e);
        calendarErrors++;
      }

      usersProcessed++;
      await new Promise(r => setTimeout(r, 50));
    }

    console.log(`[scan-pipeline-signals] Done. users=${usersProcessed} signals=${totalSignals} errors=${calendarErrors} patterns=${_calendarPatterns.length}`);
    return new Response(JSON.stringify({
      users: usersProcessed,
      signals: totalSignals,
      calendar_errors: calendarErrors,
      patterns_loaded: _calendarPatterns.length,
    }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[scan-pipeline-signals] Fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
