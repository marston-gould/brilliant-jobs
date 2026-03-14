// gmail-scan Edge Function — FB-PI-001 S1
// Scans Gmail + Google Calendar for application-related signals.
// Writes raw signal candidates to pipeline_signal_inbox (new staging table).
// Manages per-user scan cursors via user_scan_checkpoints.
// Triggered by pg_cron every 6 hours. Wall-time safety at 120s.
//
// HOOK H-PI-01: source column is a plugin point — new signal sources extend this EF.
// SCAR S-PI-05: calendar scanning targets Google only; Outlook/iCal activation point.

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
const GMAIL_MAX_MESSAGES = 100;
const CALENDAR_INITIAL_LOOKBACK_DAYS = 30;
const CALENDAR_MAX_EVENTS = 50;

const startTime = Date.now();
function elapsed(): number { return Date.now() - startTime; }
function isOvertime(): boolean { return elapsed() > WALL_TIME_LIMIT_MS; }

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

async function refreshAccessToken(
  refreshTokenEnc: string,
): Promise<{ access_token: string; new_refresh_enc?: string } | null> {
  const refreshToken = decrypt(refreshTokenEnc);
  try {
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
  } catch {
    return null;
  }
}

// ── Checkpoint helpers ────────────────────────────────────────────────────
interface Checkpoint {
  last_gmail_scan_at: string | null;
  last_gmail_history_id: string | null;
  last_calendar_scan_at: string | null;
  gmail_scan_status: string;
  calendar_scan_status: string;
}

async function getOrCreateCheckpoint(userId: string): Promise<Checkpoint> {
  const { data } = await sb
    .from("user_scan_checkpoints")
    .select("last_gmail_scan_at,last_gmail_history_id,last_calendar_scan_at,gmail_scan_status,calendar_scan_status")
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return data as Checkpoint;
  const { data: created } = await sb
    .from("user_scan_checkpoints")
    .insert({ user_id: userId })
    .select("last_gmail_scan_at,last_gmail_history_id,last_calendar_scan_at,gmail_scan_status,calendar_scan_status")
    .single();
  return (created || { last_gmail_scan_at: null, last_gmail_history_id: null, last_calendar_scan_at: null, gmail_scan_status: "idle", calendar_scan_status: "idle" }) as Checkpoint;
}

async function updateCheckpoint(userId: string, updates: Record<string, unknown>): Promise<void> {
  await sb.from("user_scan_checkpoints").upsert({ user_id: userId, ...updates }, { onConflict: "user_id" });
}

// ── Inbox write ───────────────────────────────────────────────────────────
interface RawSignal {
  user_id: string;
  source: "gmail" | "calendar";
  source_message_id: string;
  raw_subject: string | null;
  raw_snippet: string | null;
  raw_from: string | null;
  raw_date: string | null;
  raw_metadata: Record<string, unknown>;
}

async function writeToInbox(signals: RawSignal[], logger: Logger): Promise<number> {
  if (!signals.length) return 0;
  const { data, error } = await sb
    .from("pipeline_signal_inbox")
    .upsert(signals, { onConflict: "user_id,source,source_message_id", ignoreDuplicates: true })
    .select("id");
  if (error) {
    logger.warn("Inbox write error", { error: error.message, count: signals.length });
    return 0;
  }
  return data?.length ?? 0;
}

// ── Gmail scan ────────────────────────────────────────────────────────────
const GMAIL_APPLICATION_QUERY =
  "(subject:interview OR subject:application OR subject:offer OR subject:rejection OR " +
  "subject:\"next steps\" OR subject:\"thank you for\" OR subject:\"we received\" OR " +
  "subject:\"moving forward\" OR subject:\"not moving\" OR subject:schedule OR subject:calendly)";

async function scanGmail(
  userId: string,
  accessToken: string,
  checkpoint: Checkpoint,
  logger: Logger,
): Promise<{ inbox_count: number; new_history_id: string | null }> {
  const signals: RawSignal[] = [];
  let newHistoryId: string | null = null;

  const afterDate = checkpoint.last_gmail_scan_at
    ? checkpoint.last_gmail_scan_at.split("T")[0].replace(/-/g, "/")
    : null;
  const query = afterDate
    ? `${GMAIL_APPLICATION_QUERY} after:${afterDate}`
    : GMAIL_APPLICATION_QUERY;

  const listRes = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${GMAIL_MAX_MESSAGES}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const listData = await listRes.json();

  if (listData.error) {
    if (listData.error.code === 429) { logger.warn("Gmail rate limit", { userId }); return { inbox_count: 0, new_history_id: null }; }
    throw new Error(`Gmail API: ${listData.error.message}`);
  }

  newHistoryId = listData.historyId || null;
  const messages: Array<{ id: string }> = listData.messages || [];

  for (const msg of messages) {
    if (isOvertime()) { logger.warn("Overtime in gmail scan", { userId }); break; }
    try {
      const msgRes = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const msgData = await msgRes.json();
      if (msgData.error) continue;
      const headers: Array<{ name: string; value: string }> = msgData.payload?.headers || [];
      const getH = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || null;
      const subject = getH("Subject");
      const from = getH("From");
      const dateStr = getH("Date");
      signals.push({
        user_id: userId, source: "gmail", source_message_id: msg.id,
        raw_subject: subject, raw_snippet: (msgData.snippet || "").slice(0, 500),
        raw_from: from, raw_date: dateStr ? new Date(dateStr).toISOString() : null,
        raw_metadata: { thread_id: msgData.threadId, label_ids: msgData.labelIds || [], internal_date: msgData.internalDate },
      });
    } catch (e) { logger.warn("Msg fetch error", { id: msg.id, error: (e as Error).message }); }
  }

  const written = await writeToInbox(signals, logger);
  return { inbox_count: written, new_history_id: newHistoryId };
}

// ── Calendar scan ─────────────────────────────────────────────────────────
const CALENDAR_KW = ["interview","phone screen","technical screen","take home","take-home","coding challenge","technical assessment","meet the team","hiring manager","recruiter","onsite","virtual interview","video interview","panel","technical interview","system design","behavioral","offer","offer review","offer discussion","compensation review","welcome call"];

function matchesCalKW(title: string, desc: string): boolean {
  const text = (title + " " + desc).toLowerCase();
  return CALENDAR_KW.some((kw) => text.includes(kw));
}

function domainFromEmail(email: string): string | null {
  const m = email.match(/@([^>]+)/);
  return m ? m[1].toLowerCase() : null;
}

async function scanCalendar(
  userId: string,
  accessToken: string,
  checkpoint: Checkpoint,
  logger: Logger,
): Promise<{ inbox_count: number }> {
  const signals: RawSignal[] = [];

  const timeMin = checkpoint.last_calendar_scan_at
    ? new Date(checkpoint.last_calendar_scan_at).toISOString()
    : new Date(Date.now() - CALENDAR_INITIAL_LOOKBACK_DAYS * 86400000).toISOString();
  const timeMax = new Date(Date.now() + 30 * 86400000).toISOString();

  const calRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
    `timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&` +
    `maxResults=${CALENDAR_MAX_EVENTS}&singleEvents=true&orderBy=startTime&` +
    `fields=items(id,summary,description,organizer,attendees,start,end,conferenceData,htmlLink)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const calData = await calRes.json();

  if (calData.error) {
    if (calData.error.code === 403) { logger.info("Calendar scope not granted", { userId }); return { inbox_count: 0 }; }
    if (calData.error.code === 429) { logger.warn("Calendar rate limit", { userId }); return { inbox_count: 0 }; }
    throw new Error(`Calendar API: ${calData.error.message}`);
  }

  for (const event of (calData.items || []) as Array<Record<string, unknown>>) {
    if (isOvertime()) { logger.warn("Overtime in calendar scan", { userId }); break; }
    const title = (event.summary as string) || "";
    const desc = (event.description as string) || "";
    if (!matchesCalKW(title, desc)) continue;
    const org = (event.organizer as Record<string, string>) || {};
    const orgEmail = org.email || "";
    if (!orgEmail || orgEmail.includes("calendar.google.com")) continue;
    const startObj = (event.start as Record<string, string>) || {};
    const eventStart = startObj.dateTime || startObj.date || null;
    const attendees = ((event.attendees as Array<Record<string, string>>) || []).map((a) => a.email).filter(Boolean);
    const confData = event.conferenceData as Record<string, unknown> | null;
    const videoLink = confData?.entryPoints
      ? (confData.entryPoints as Array<Record<string, string>>).find((ep) => ep.entryPointType === "video")?.uri || null
      : null;
    signals.push({
      user_id: userId, source: "calendar", source_message_id: event.id as string,
      raw_subject: title, raw_snippet: desc.slice(0, 500),
      raw_from: orgEmail, raw_date: eventStart,
      raw_metadata: {
        organizer_email: orgEmail, organizer_domain: domainFromEmail(orgEmail),
        attendees, video_link: videoLink,
        event_start: startObj.dateTime || null,
        event_end: ((event.end as Record<string, string>) || {}).dateTime || null,
        html_link: event.htmlLink || null,
      },
    });
  }

  const written = await writeToInbox(signals, logger);
  return { inbox_count: written };
}

// ── Legacy email_signals path (preserved for backward compat) ─────────────
function guessDomain(slug: string, domain: string | null): string | null {
  if (domain) return domain;
  const clean = slug.replace(/-/g, "");
  return clean ? `${clean}.com` : null;
}

const REJECTION_KW_L = ["unfortunately","not moving forward","other candidates","not a fit","position has been filled","decided not to","will not be proceeding","regret to inform","not selected","pursuing other","gone with another"];
const INTERVIEW_KW_L = ["interview","schedule a call","calendly.com","meet with","phone screen","next steps","love to chat","would like to speak","technical assessment","coding challenge","take-home"];
const SCHEDULING_KW_L = ["calendly.com","goodtime.io","schedule.","pick a time","book a time","availability","time slot"];
const AUTO_REPLY_KW_L = ["we received your application","thank you for applying","do not reply","noreply","no-reply","auto-reply","has been received","application confirmation"];

function classifyEmail(subject: string, snippet: string): string {
  const text = (subject + " " + snippet).toLowerCase();
  for (const kw of SCHEDULING_KW_L) { if (text.includes(kw)) return "scheduling"; }
  for (const kw of INTERVIEW_KW_L) { if (text.includes(kw)) return "interview"; }
  for (const kw of REJECTION_KW_L) { if (text.includes(kw)) return "rejection"; }
  for (const kw of AUTO_REPLY_KW_L) { if (text.includes(kw)) return "auto_reply"; }
  return "response";
}

async function scanUserEmailsLegacy(
  userId: string, accessToken: string,
  entries: Array<{ id: string; company_slug: string; company_domain: string | null; applied_at: string }>,
  logger: Logger,
): Promise<{ scanned: number; signals: number }> {
  let signals = 0;
  for (const entry of entries) {
    if (isOvertime()) break;
    const domain = guessDomain(entry.company_slug, entry.company_domain);
    if (!domain) continue;
    const query = `from:${domain} after:${entry.applied_at.split("T")[0].replace(/-/g, "/")}`;
    try {
      const listRes = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=5`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const listData = await listRes.json();
      if (listData.error) { if (listData.error.code === 429) return { scanned: entries.length, signals }; continue; }
      const messages = listData.messages || [];
      if (!messages.length) {
        await sb.from("email_signals").upsert({ user_id: userId, pipeline_entry_id: entry.id, company_domain: domain, last_email_at: null, email_count: 0, classification: "silence", snippet: null }, { onConflict: "user_id, pipeline_entry_id" });
        signals++; continue;
      }
      const msgRes = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${messages[0].id}?format=metadata&metadataHeaders=Subject`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const msgData = await msgRes.json();
      const subH = (msgData.payload?.headers || []).find((h: Record<string, string>) => h.name.toLowerCase() === "subject");
      const subject = (subH?.value as string) || "";
      const snippet = (msgData.snippet || "").slice(0, 200);
      await sb.from("email_signals").upsert({ user_id: userId, pipeline_entry_id: entry.id, company_domain: domain, last_email_at: new Date(parseInt(msgData.internalDate)).toISOString(), email_count: messages.length, classification: classifyEmail(subject, snippet), snippet: snippet.slice(0, 200) }, { onConflict: "user_id, pipeline_entry_id" });
      signals++;
    } catch (e) { logger.warn("Legacy scan error", { entryId: entry.id, error: (e as Error).message }); }
  }
  return { scanned: entries.length, signals };
}

async function createPipelineSignals(userId: string, logger: Logger): Promise<number> {
  let signalsCreated = 0;
  const stageOrder = ["saved","applied","posting_closed","responded","interview","offer","hired","rejected","archived"];
  const classToSignal: Record<string, { signal_type: string; proposed_stage: string }> = {
    interview: { signal_type: "interview_invite", proposed_stage: "interview" },
    scheduling: { signal_type: "interview_invite", proposed_stage: "interview" },
    rejection: { signal_type: "rejection", proposed_stage: "rejected" },
    response: { signal_type: "recruiter_reply", proposed_stage: "responded" },
    auto_reply: { signal_type: "ats_confirm", proposed_stage: "applied" },
  };
  const { data: emailSigs } = await sb.from("email_signals").select("pipeline_entry_id,classification,snippet,company_domain,last_email_at").eq("user_id", userId).not("classification", "in", "(silence)");
  for (const sig of emailSigs || []) {
    const mapping = classToSignal[sig.classification];
    if (!mapping) continue;
    const { data: entry } = await sb.from("user_pipeline").select("id,stage").eq("id", sig.pipeline_entry_id).single();
    if (!entry) continue;
    if (stageOrder.indexOf(entry.stage) >= stageOrder.indexOf(mapping.proposed_stage)) continue;
    const { data: existing } = await sb.from("pipeline_signals").select("id").eq("pipeline_entry_id", entry.id).eq("status", "pending_confirmation").eq("signal_source", "gmail").limit(1);
    if (existing?.length) continue;
    let confidence = 0.65;
    if (sig.company_domain) {
      const { data: pat } = await sb.from("signal_patterns").select("confidence_score").eq("pattern_type", "sender_domain").ilike("pattern_value", `%${sig.company_domain.split(".")[0]}%`).limit(1);
      if (pat?.length) confidence = Math.max(confidence, pat[0].confidence_score);
    }
    const { error } = await sb.from("pipeline_signals").insert({ user_id: userId, pipeline_entry_id: entry.id, signal_source: "gmail", signal_type: mapping.signal_type, proposed_stage: mapping.proposed_stage, confidence, evidence_preview: sig.snippet?.slice(0, 150) || `Email from ${sig.company_domain || "company"}`, evidence_metadata: { sender_domain: sig.company_domain, classification: sig.classification, last_email_at: sig.last_email_at }, status: "pending_confirmation" });
    if (!error) { signalsCreated++; logger.info("Signal created", { entryId: entry.id, type: mapping.signal_type }); }
  }
  return signalsCreated;
}

// ── Main ──────────────────────────────────────────────────────────────────
serve(withCorrelation("gmail-scan", async (req, logger) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
  }

  let totalGmailInbox = 0, totalCalendarInbox = 0, legacySignals = 0, pipelineSignalsCreated = 0, usersProcessed = 0, errors = 0;

  try {
    const { data: connections } = await sb.from("gmail_connections").select("user_id,refresh_token_enc").eq("sync_status", "active").order("last_sync_at", { ascending: true, nullsFirst: true }).limit(BATCH_SIZE);

    if (!connections?.length) {
      return new Response(JSON.stringify({ message: "No active connections", stats: { usersProcessed: 0 } }), { headers: { "Content-Type": "application/json" } });
    }

    logger.info(`Processing ${connections.length} connections`);

    for (const conn of connections) {
      if (isOvertime()) { logger.warn("Wall-time limit", { usersProcessed }); break; }
      try {
        const tokens = await refreshAccessToken(conn.refresh_token_enc);
        if (!tokens) {
          await sb.from("gmail_connections").update({ sync_status: "error", error_message: "Token refresh failed" }).eq("user_id", conn.user_id);
          await updateCheckpoint(conn.user_id, { gmail_scan_status: "token_error", calendar_scan_status: "token_error", gmail_error_message: "Token refresh failed", consecutive_errors: 99 });
          errors++; continue;
        }
        if (tokens.new_refresh_enc) {
          await sb.from("gmail_connections").update({ refresh_token_enc: tokens.new_refresh_enc }).eq("user_id", conn.user_id);
        }

        const checkpoint = await getOrCreateCheckpoint(conn.user_id);

        // 1. Gmail inbox scan
        try {
          await updateCheckpoint(conn.user_id, { gmail_scan_status: "scanning" });
          const { inbox_count, new_history_id } = await scanGmail(conn.user_id, tokens.access_token, checkpoint, logger);
          totalGmailInbox += inbox_count;
          await updateCheckpoint(conn.user_id, { gmail_scan_status: "idle", last_gmail_scan_at: new Date().toISOString(), ...(new_history_id ? { last_gmail_history_id: new_history_id } : {}), gmail_error_message: null });
        } catch (e) {
          const msg = (e as Error).message;
          logger.warn("Gmail scan error", { userId: conn.user_id, error: msg });
          await updateCheckpoint(conn.user_id, { gmail_scan_status: "error", gmail_error_message: msg });
        }

        // 2. Calendar scan
        if (!isOvertime()) {
          try {
            await updateCheckpoint(conn.user_id, { calendar_scan_status: "scanning" });
            const { inbox_count } = await scanCalendar(conn.user_id, tokens.access_token, checkpoint, logger);
            totalCalendarInbox += inbox_count;
            await updateCheckpoint(conn.user_id, { calendar_scan_status: inbox_count >= 0 ? "idle" : "idle", last_calendar_scan_at: new Date().toISOString(), calendar_error_message: null });
          } catch (e) {
            const msg = (e as Error).message;
            const isPerm = msg.includes("403") || msg.includes("insufficientPermissions");
            await updateCheckpoint(conn.user_id, { calendar_scan_status: isPerm ? "not_connected" : "error", calendar_error_message: isPerm ? null : msg });
          }
        }

        // 3. Legacy per-company email_signals (backward compat)
        if (!isOvertime()) {
          const { data: pipeline } = await sb.from("user_pipeline").select("id,company_slug,company_domain,applied_at").eq("user_id", conn.user_id).in("stage", ["applied", "posting_closed", "responded"]);
          if (pipeline?.length) {
            const { signals } = await scanUserEmailsLegacy(conn.user_id, tokens.access_token, pipeline, logger);
            legacySignals += signals;
            pipelineSignalsCreated += await createPipelineSignals(conn.user_id, logger);
          }
        }

        await sb.from("gmail_connections").update({ last_sync_at: new Date().toISOString(), error_message: null }).eq("user_id", conn.user_id);
        usersProcessed++;
      } catch (e) {
        const msg = (e as Error).message;
        logger.error("User scan error", { userId: conn.user_id, error: msg });
        await sb.from("gmail_connections").update({ error_message: msg }).eq("user_id", conn.user_id);
        errors++;
      }
    }

    const stats = { usersProcessed, totalGmailInbox, totalCalendarInbox, legacyEmailSignals: legacySignals, pipelineSignalsCreated, errors, elapsed_ms: elapsed() };
    logger.info("Scan complete", stats);
    return new Response(JSON.stringify({ message: "Scan complete", stats }), { headers: { "Content-Type": "application/json" } });

  } catch (e) {
    logger.error("Fatal error", { error: (e as Error).message });
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}));
