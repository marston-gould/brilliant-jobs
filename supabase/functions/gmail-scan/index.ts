// gmail-scan Edge Function
// Scans Gmail for emails from companies users have applied to.
// Classifies emails and writes to email_signals table.
// Triggered by pg_cron every 6 hours. Wall-time safety at 120s.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { withCorrelation } from "../_shared/middleware.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GMAIL_CLIENT_ID = Deno.env.get("GMAIL_CLIENT_ID") || "";
const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET") || "";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const BATCH_SIZE = 50;
const WALL_TIME_LIMIT_MS = 120_000;
const startTime = Date.now();

function decrypt(encoded: string): string {
  const key = SUPABASE_SERVICE_ROLE_KEY;
  const decoded = atob(encoded);
  let result = "";
  for (let i = 0; i < decoded.length; i++) {
    result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

function encrypt(text: string): string {
  const key = SUPABASE_SERVICE_ROLE_KEY;
  let result = "";
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(result);
}

async function refreshAccessToken(refreshTokenEnc: string): Promise<{ access_token: string; new_refresh_enc?: string } | null> {
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
  if (data.error) return null;
  return {
    access_token: data.access_token,
    new_refresh_enc: data.refresh_token ? encrypt(data.refresh_token) : undefined,
  };
}

// ── Email classification ──
const REJECTION_KW = ["unfortunately", "not moving forward", "other candidates", "not a fit", "position has been filled", "decided not to", "will not be proceeding", "regret to inform", "not selected", "pursuing other", "gone with another"];
const INTERVIEW_KW = ["interview", "schedule a call", "calendly.com", "meet with", "phone screen", "next steps", "love to chat", "would like to speak", "technical assessment", "coding challenge", "take-home"];
const SCHEDULING_KW = ["calendly.com", "goodtime.io", "schedule.", "pick a time", "book a time", "availability", "time slot"];
const AUTO_REPLY_KW = ["we received your application", "thank you for applying", "do not reply", "noreply", "no-reply", "auto-reply", "has been received", "application confirmation"];

function classifyEmail(subject: string, snippet: string): string {
  const text = (subject + " " + snippet).toLowerCase();
  for (const kw of SCHEDULING_KW) { if (text.includes(kw)) return "scheduling"; }
  for (const kw of INTERVIEW_KW) { if (text.includes(kw)) return "interview"; }
  for (const kw of REJECTION_KW) { if (text.includes(kw)) return "rejection"; }
  for (const kw of AUTO_REPLY_KW) { if (text.includes(kw)) return "auto_reply"; }
  return "response";
}

function guessDomain(slug: string, domain: string | null): string | null {
  if (domain) return domain;
  const clean = slug.replace(/-/g, "");
  return clean ? `${clean}.com` : null;
}

async function scanUserEmails(
  userId: string, accessToken: string,
  entries: Array<{ id: string; company_slug: string; company_domain: string | null; applied_at: string }>,
  logger: Logger,
): Promise<{ scanned: number; signals: number }> {
  let signals = 0;

  for (const entry of entries) {
    if (Date.now() - startTime > WALL_TIME_LIMIT_MS) {
      logger.warn("Wall-time limit", { userId, signals });
      break;
    }

    const domain = guessDomain(entry.company_slug, entry.company_domain);
    if (!domain) continue;

    const query = `from:${domain} after:${entry.applied_at.split("T")[0].replace(/-/g, "/")}`;

    try {
      const listRes = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=5`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const listData = await listRes.json();

      if (listData.error) {
        if (listData.error.code === 429) {
          logger.warn("Gmail rate limit", { userId });
          return { scanned: entries.length, signals };
        }
        continue;
      }

      const messages = listData.messages || [];

      if (messages.length === 0) {
        await sb.from("email_signals").upsert({
          user_id: userId, pipeline_entry_id: entry.id,
          company_domain: domain, last_email_at: null,
          email_count: 0, classification: "silence", snippet: null,
        }, { onConflict: "user_id, pipeline_entry_id" });
        signals++;
        continue;
      }

      const msgRes = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${messages[0].id}?format=metadata&metadataHeaders=Subject`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const msgData = await msgRes.json();

      const subjectHeader = (msgData.payload?.headers || []).find((h: Record<string, unknown>) => (h as Record<string, unknown>).name.toLowerCase() === "subject");
      const subject = subjectHeader?.value || "";
      const snippet = (msgData.snippet || "").slice(0, 200);
      const classification = classifyEmail(subject, snippet);

      await sb.from("email_signals").upsert({
        user_id: userId, pipeline_entry_id: entry.id,
        company_domain: domain,
        last_email_at: new Date(parseInt(msgData.internalDate)).toISOString(),
        email_count: messages.length, classification, snippet: snippet.slice(0, 200),
      }, { onConflict: "user_id, pipeline_entry_id" });
      signals++;
    } catch (e) {
      logger.warn("Scan error", { entryId: entry.id, error: (e as Error).message });
    }
  }
  return { scanned: entries.length, signals };
}

// ── Pipeline signal creation from email signals (Phase B) ──
// Instead of auto-advancing, create pipeline_signals for user confirmation
async function createPipelineSignals(userId: string, logger: Logger): Promise<number> {
  let signalsCreated = 0;
  const stageOrder = ["saved", "applied", "posting_closed", "responded", "interview", "offer", "hired", "rejected", "archived"];

  const classToSignalType: Record<string, { signal_type: string; proposed_stage: string }> = {
    interview:  { signal_type: "interview_invite", proposed_stage: "interview" },
    scheduling: { signal_type: "interview_invite", proposed_stage: "interview" },
    rejection:  { signal_type: "rejection", proposed_stage: "rejected" },
    response:   { signal_type: "recruiter_reply", proposed_stage: "responded" },
    auto_reply: { signal_type: "ats_confirm", proposed_stage: "applied" },
  };

  // Get all email_signals for this user that might trigger pipeline actions
  const { data: emailSigs } = await sb
    .from("email_signals").select("pipeline_entry_id, classification, snippet, company_domain, last_email_at")
    .eq("user_id", userId)
    .not("classification", "in", "(silence)");

  for (const sig of emailSigs || []) {
    const mapping = classToSignalType[sig.classification];
    if (!mapping) continue;

    // Get current pipeline entry stage
    const { data: entry } = await sb.from("user_pipeline").select("id, stage").eq("id", sig.pipeline_entry_id).single();
    if (!entry) continue;

    // Only create signal if it would advance the pipeline
    if (stageOrder.indexOf(entry.stage) >= stageOrder.indexOf(mapping.proposed_stage)) continue;

    // Check for existing pending signal on this entry (dedup)
    const { data: existing } = await sb
      .from("pipeline_signals").select("id")
      .eq("pipeline_entry_id", entry.id)
      .eq("status", "pending_confirmation")
      .eq("signal_source", "gmail")
      .limit(1);
    if (existing?.length) continue;

    // Look up pattern confidence
    let confidence = 0.65;
    if (sig.company_domain) {
      const { data: pattern } = await sb
        .from("signal_patterns").select("confidence_score")
        .eq("pattern_type", "sender_domain")
        .ilike("pattern_value", `%${sig.company_domain.split('.')[0]}%`)
        .limit(1);
      if (pattern?.length) confidence = Math.max(confidence, pattern[0].confidence_score);
    }

    // Create pipeline_signal for user confirmation
    const { error } = await sb.from("pipeline_signals").insert({
      user_id: userId,
      pipeline_entry_id: entry.id,
      signal_source: "gmail",
      signal_type: mapping.signal_type,
      proposed_stage: mapping.proposed_stage,
      confidence,
      evidence_preview: sig.snippet ? sig.snippet.slice(0, 150) : `Email from ${sig.company_domain || 'company'}`,
      evidence_metadata: {
        sender_domain: sig.company_domain,
        classification: sig.classification,
        last_email_at: sig.last_email_at,
      },
      status: "pending_confirmation",
    });

    if (!error) {
      signalsCreated++;
      logger.info("Signal created", { entryId: entry.id, type: mapping.signal_type, proposed: mapping.proposed_stage });
    }
  }

  return signalsCreated;
}

serve(withCorrelation("gmail-scan", async (req, logger) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  let totalScanned = 0, totalSignals = 0, signalsCreated = 0, usersProcessed = 0, errors = 0;

  try {
    const { data: connections } = await sb
      .from("gmail_connections").select("user_id, refresh_token_enc")
      .eq("sync_status", "active")
      .order("last_sync_at", { ascending: true, nullsFirst: true })
      .limit(BATCH_SIZE);

    if (!connections?.length) {
      return new Response(JSON.stringify({ message: "No active connections", stats: { usersProcessed: 0 } }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    logger.info(`Processing ${connections.length} connections`);

    for (const conn of connections) {
      if (Date.now() - startTime > WALL_TIME_LIMIT_MS) {
        logger.warn("Wall-time limit", { usersProcessed });
        break;
      }

      try {
        const tokens = await refreshAccessToken(conn.refresh_token_enc);
        if (!tokens) {
          await sb.from("gmail_connections").update({ sync_status: "error", error_message: "Token refresh failed" }).eq("user_id", conn.user_id);
          errors++;
          continue;
        }

        if (tokens.new_refresh_enc) {
          await sb.from("gmail_connections").update({ refresh_token_enc: tokens.new_refresh_enc }).eq("user_id", conn.user_id);
        }

        const { data: pipeline } = await sb
          .from("user_pipeline").select("id, company_slug, company_domain, applied_at")
          .eq("user_id", conn.user_id).in("stage", ["applied", "posting_closed", "responded"]);

        if (!pipeline?.length) {
          await sb.from("gmail_connections").update({ last_sync_at: new Date().toISOString() }).eq("user_id", conn.user_id);
          usersProcessed++;
          continue;
        }

        const result = await scanUserEmails(conn.user_id, tokens.access_token, pipeline, logger);
        totalScanned += result.scanned;
        totalSignals += result.signals;

        const adv = await createPipelineSignals(conn.user_id, logger);
        signalsCreated += adv;

        await sb.from("gmail_connections").update({ last_sync_at: new Date().toISOString(), error_message: null }).eq("user_id", conn.user_id);
        usersProcessed++;
      } catch (e) {
        logger.error("User scan error", { userId: conn.user_id, error: (e as Error).message });
        await sb.from("gmail_connections").update({ error_message: (e as Error).message }).eq("user_id", conn.user_id);
        errors++;
      }
    }

    const stats = { usersProcessed, totalScanned, totalSignals, signalsCreated, errors, elapsed_ms: Date.now() - startTime };
    logger.info("Scan complete", stats);
    return new Response(JSON.stringify({ message: "Scan complete", stats }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    logger.error("Fatal error", { error: (e as Error).message });
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}));
