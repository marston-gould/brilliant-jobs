// tests/fb-pi-001-s1-schema-inbox.test.js
// FB-PI-001 S1: Schema + Inbox Pipeline validation
// Tests: pipeline_signal_inbox table, user_scan_checkpoints table,
//        pipeline_signals extensions, gmail-scan EF calendar support,
//        checkpoint management, dedup, hook/scar placement.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd());
const MIGRATION = path.join(ROOT, "supabase/migrations/20260315000002_fb_pi_001_s1_schema.sql");
const GMAIL_SCAN = path.join(ROOT, "supabase/functions/gmail-scan/index.ts");

function readFile(p) { return existsSync(p) ? readFileSync(p, "utf8") : ""; }

const migration = readFile(MIGRATION);
const gmailScan = readFile(GMAIL_SCAN);

// ── Section 1: Migration file existence ───────────────────────────────────
describe("Section 1: Migration file", () => {
  it("migration file exists", () => {
    expect(existsSync(MIGRATION)).toBe(true);
  });

  it("migration has correct filename prefix", () => {
    expect(MIGRATION).toMatch(/20260315000002_fb_pi_001_s1_schema\.sql$/);
  });
});

// ── Section 2: pipeline_signal_inbox table ────────────────────────────────
describe("Section 2: pipeline_signal_inbox", () => {
  it("creates pipeline_signal_inbox table", () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS pipeline_signal_inbox/);
  });

  it("has user_id FK to auth.users", () => {
    expect(migration).toMatch(/user_id.*uuid.*REFERENCES auth\.users/);
  });

  it("source column with gmail/calendar CHECK constraint", () => {
    expect(migration).toMatch(/source.*text.*NOT NULL/);
    expect(migration).toMatch(/CHECK.*source.*IN.*'gmail'.*'calendar'/);
  });

  it("has source_message_id for dedup", () => {
    expect(migration).toMatch(/source_message_id.*text.*NOT NULL/);
  });

  it("has all required raw_ columns", () => {
    expect(migration).toMatch(/raw_subject/);
    expect(migration).toMatch(/raw_snippet/);
    expect(migration).toMatch(/raw_from/);
    expect(migration).toMatch(/raw_date/);
    expect(migration).toMatch(/raw_metadata.*jsonb/);
  });

  it("classification_status with correct CHECK values", () => {
    expect(migration).toMatch(/classification_status.*text.*NOT NULL/);
    expect(migration).toMatch(/CHECK.*classification_status.*pending.*classified.*skipped.*error/);
  });

  it("has retry_count column with default 0", () => {
    expect(migration).toMatch(/retry_count.*integer.*NOT NULL.*DEFAULT 0/);
  });

  it("UNIQUE index on user_id,source,source_message_id for dedup", () => {
    expect(migration).toMatch(/UNIQUE INDEX.*idx_inbox_dedup/);
    expect(migration).toMatch(/user_id.*source.*source_message_id/);
  });

  it("pending index for cron pickup with retry < 3", () => {
    expect(migration).toMatch(/idx_inbox_pending/);
    expect(migration).toMatch(/classification_status.*=.*'pending'.*retry_count.*<.*3/);
  });

  it("user+date index for per-user queries", () => {
    expect(migration).toMatch(/idx_inbox_user_date/);
    expect(migration).toMatch(/user_id.*raw_date DESC/);
  });

  it("HOOK H-PI-01 comment on table", () => {
    expect(migration).toMatch(/H-PI-01/);
  });

  it("SCAR S-PI-04 comment on raw_metadata", () => {
    expect(migration).toMatch(/S-PI-04/);
  });

  it("RLS enabled", () => {
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });

  it("users_read_own_inbox policy", () => {
    expect(migration).toMatch(/users_read_own_inbox/);
  });

  it("service_role_inbox_all policy", () => {
    expect(migration).toMatch(/service_role_inbox_all/);
  });
});

// ── Section 3: user_scan_checkpoints table ────────────────────────────────
describe("Section 3: user_scan_checkpoints", () => {
  it("creates user_scan_checkpoints table", () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS user_scan_checkpoints/);
  });

  it("has last_gmail_scan_at checkpoint column", () => {
    expect(migration).toMatch(/last_gmail_scan_at.*timestamptz/);
  });

  it("has last_gmail_history_id for incremental scanning", () => {
    expect(migration).toMatch(/last_gmail_history_id.*text/);
  });

  it("has last_calendar_scan_at checkpoint column", () => {
    expect(migration).toMatch(/last_calendar_scan_at.*timestamptz/);
  });

  it("gmail_scan_status with correct CHECK values", () => {
    expect(migration).toMatch(/gmail_scan_status.*text.*NOT NULL.*DEFAULT.*'idle'/);
    expect(migration).toMatch(/CHECK.*gmail_scan_status.*idle.*scanning.*error.*token_error/);
  });

  it("calendar_scan_status includes not_connected", () => {
    expect(migration).toMatch(/CHECK.*calendar_scan_status.*not_connected/);
  });

  it("consecutive_errors for reconnect prompt detection", () => {
    expect(migration).toMatch(/consecutive_errors.*integer.*NOT NULL.*DEFAULT 0/);
  });

  it("UNIQUE constraint on user_id", () => {
    expect(migration).toMatch(/UNIQUE.*user_id/);
  });

  it("updated_at trigger", () => {
    expect(migration).toMatch(/fn_scan_checkpoints_updated_at/);
    expect(migration).toMatch(/trg_scan_checkpoints_updated_at/);
  });

  it("SCAR S-PI-05 comment", () => {
    expect(migration).toMatch(/S-PI-05/);
  });

  it("users_own_checkpoints RLS policy", () => {
    expect(migration).toMatch(/users_own_checkpoints/);
  });

  it("service_role_checkpoints_all policy", () => {
    expect(migration).toMatch(/service_role_checkpoints_all/);
  });
});

// ── Section 4: pipeline_signals schema extensions ─────────────────────────
describe("Section 4: pipeline_signals extensions", () => {
  it("adds inbox_id FK column", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS inbox_id.*uuid.*pipeline_signal_inbox/);
  });

  it("adds signal_type column", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS signal_type.*text/);
  });

  it("adds confidence_score numeric(3,2)", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS confidence_score.*numeric/);
  });

  it("adds confidence_level with CHECK", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS confidence_level.*text/);
    expect(migration).toMatch(/CHECK.*confidence_level.*high.*medium.*low/);
  });

  it("adds extracted_fields jsonb", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS extracted_fields.*jsonb/);
  });

  it("adds action_taken with CHECK constraint", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS action_taken.*text/);
    expect(migration).toMatch(/CHECK.*action_taken.*auto_moved.*prompted.*dismissed.*confirmed.*error/);
  });

  it("adds target_stage and previous_stage for undo", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS target_stage/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS previous_stage/);
  });

  it("adds user_response column", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS user_response/);
    expect(migration).toMatch(/CHECK.*user_response.*confirmed.*dismissed.*modified/);
  });

  it("adds user_responded_at timestamp", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS user_responded_at.*timestamptz/);
  });

  it("signal_type comment references all 8 types", () => {
    expect(migration).toMatch(/ACK.*REJ-PRE.*INT.*REJ-POST.*OFFER.*RESCHED.*CAL-INT.*CAL-OFFER/);
  });

  it("extracted_fields comment references SCAR S-PI-04", () => {
    expect(migration).toMatch(/S-PI-04/);
  });
});

// ── Section 5: gmail-scan EF existence and structure ─────────────────────
describe("Section 5: gmail-scan EF structure", () => {
  it("gmail-scan file exists", () => {
    expect(existsSync(GMAIL_SCAN)).toBe(true);
  });

  it("imports serve and createClient", () => {
    expect(gmailScan).toMatch(/import.*serve.*from.*deno\.land/);
    expect(gmailScan).toMatch(/import.*createClient.*from.*supabase-js/);
  });

  it("references FB-PI-001 S1 in header comment", () => {
    expect(gmailScan).toMatch(/FB-PI-001 S1/);
  });

  it("declares HOOK H-PI-01 comment", () => {
    expect(gmailScan).toMatch(/H-PI-01/);
  });

  it("declares SCAR S-PI-05 comment", () => {
    expect(gmailScan).toMatch(/S-PI-05/);
  });
});

// ── Section 6: Gmail scanning logic ──────────────────────────────────────
describe("Section 6: Gmail scan logic", () => {
  it("has GMAIL_APPLICATION_QUERY broad subject filter", () => {
    expect(gmailScan).toMatch(/GMAIL_APPLICATION_QUERY/);
    expect(gmailScan).toMatch(/subject:interview/);
    expect(gmailScan).toMatch(/subject:offer/);
    expect(gmailScan).toMatch(/subject:rejection/);
  });

  it("scanGmail function exists", () => {
    expect(gmailScan).toMatch(/async function scanGmail/);
  });

  it("uses after: filter from checkpoint", () => {
    expect(gmailScan).toMatch(/last_gmail_scan_at/);
    expect(gmailScan).toMatch(/after:/);
  });

  it("fetches message metadata with Subject, From, Date headers", () => {
    expect(gmailScan).toMatch(/metadataHeaders=Subject/);
    expect(gmailScan).toMatch(/metadataHeaders=From/);
    expect(gmailScan).toMatch(/metadataHeaders=Date/);
  });

  it("handles Gmail 429 rate limit gracefully", () => {
    expect(gmailScan).toMatch(/429/);
    expect(gmailScan).toMatch(/rate limit/i);
  });

  it("writes to pipeline_signal_inbox via writeToInbox", () => {
    expect(gmailScan).toMatch(/writeToInbox/);
    expect(gmailScan).toMatch(/pipeline_signal_inbox/);
  });

  it("returns new_history_id for incremental scanning", () => {
    expect(gmailScan).toMatch(/historyId/);
    expect(gmailScan).toMatch(/new_history_id/);
  });

  it("slices snippet to 500 chars", () => {
    expect(gmailScan).toMatch(/\.slice\(0,\s*500\)/);
  });
});

// ── Section 7: Calendar scanning logic ───────────────────────────────────
describe("Section 7: Calendar scan logic", () => {
  it("scanCalendar function exists", () => {
    expect(gmailScan).toMatch(/async function scanCalendar/);
  });

  it("calls Google Calendar API v3", () => {
    expect(gmailScan).toMatch(/googleapis\.com\/calendar\/v3\/calendars\/primary\/events/);
  });

  it("uses last_calendar_scan_at checkpoint as timeMin", () => {
    expect(gmailScan).toMatch(/last_calendar_scan_at/);
    expect(gmailScan).toMatch(/timeMin/);
  });

  it("has CALENDAR_INITIAL_LOOKBACK_DAYS fallback", () => {
    expect(gmailScan).toMatch(/CALENDAR_INITIAL_LOOKBACK_DAYS/);
    expect(gmailScan).toMatch(/30/);
  });

  it("has interview keyword list for event filtering", () => {
    expect(gmailScan).toMatch(/CALENDAR_KW|CALENDAR_INTERVIEW_KEYWORDS|matchesCalKW|interview.*phone screen/i);
  });

  it("filters events matching interview keywords", () => {
    expect(gmailScan).toMatch(/matchesCalKW|eventMatchesInterviewKeywords/);
  });

  it("extracts organizer email and domain", () => {
    expect(gmailScan).toMatch(/organizer/);
    expect(gmailScan).toMatch(/orgEmail|organizer_email/);
  });

  it("extracts video link from conferenceData", () => {
    expect(gmailScan).toMatch(/conferenceData|confData/);
    expect(gmailScan).toMatch(/video_link|videoLink/);
  });

  it("skips events with no external organizer", () => {
    expect(gmailScan).toMatch(/calendar\.google\.com/);
  });

  it("handles 403 insufficientPermissions gracefully", () => {
    expect(gmailScan).toMatch(/403/);
    expect(gmailScan).toMatch(/insufficientPermissions|not_connected|not.*granted/i);
  });

  it("handles Calendar 429 rate limit", () => {
    expect(gmailScan).toMatch(/429/);
  });

  it("looks 30 days forward for scheduled interviews", () => {
    expect(gmailScan).toMatch(/timeMax/);
    expect(gmailScan).toMatch(/30.*86400000|30.*24.*60.*60/);
  });

  it("writes calendar signals to inbox with source='calendar'", () => {
    expect(gmailScan).toMatch(/source.*calendar/);
  });
});

// ── Section 8: Checkpoint management ─────────────────────────────────────
describe("Section 8: Checkpoint management", () => {
  it("getOrCreateCheckpoint function exists", () => {
    expect(gmailScan).toMatch(/async function getOrCreateCheckpoint/);
  });

  it("creates checkpoint row if not exists via insert", () => {
    // insert may appear before or after user_scan_checkpoints in the same statement
    expect(gmailScan).toMatch(/user_scan_checkpoints/);
    expect(gmailScan).toMatch(/\.insert\(\s*\{?\s*user_id/);
  });

  it("updateCheckpoint function uses upsert with onConflict user_id", () => {
    expect(gmailScan).toMatch(/async function updateCheckpoint/);
    expect(gmailScan).toMatch(/onConflict.*user_id/);
  });

  it("sets gmail_scan_status = scanning before scan", () => {
    expect(gmailScan).toMatch(/gmail_scan_status.*scanning/);
  });

  it("sets gmail_scan_status = idle after success", () => {
    expect(gmailScan).toMatch(/gmail_scan_status.*idle/);
  });

  it("sets gmail_scan_status = token_error on refresh failure", () => {
    expect(gmailScan).toMatch(/token_error/);
  });

  it("sets calendar_scan_status = not_connected on 403", () => {
    expect(gmailScan).toMatch(/not_connected/);
  });

  it("updates last_gmail_scan_at after successful scan", () => {
    expect(gmailScan).toMatch(/last_gmail_scan_at.*new Date\(\)\.toISOString/);
  });

  it("updates last_calendar_scan_at after calendar scan", () => {
    expect(gmailScan).toMatch(/last_calendar_scan_at.*new Date\(\)\.toISOString/);
  });

  it("sets consecutive_errors = 99 on token failure to surface reconnect prompt", () => {
    expect(gmailScan).toMatch(/consecutive_errors.*99/);
  });
});

// ── Section 9: Inbox write dedup ──────────────────────────────────────────
describe("Section 9: Inbox write and dedup", () => {
  it("writeToInbox function exists", () => {
    expect(gmailScan).toMatch(/async function writeToInbox/);
  });

  it("uses upsert with ignoreDuplicates for dedup", () => {
    expect(gmailScan).toMatch(/ignoreDuplicates.*true/);
  });

  it("onConflict on user_id,source,source_message_id", () => {
    expect(gmailScan).toMatch(/onConflict.*user_id.*source.*source_message_id/);
  });

  it("handles write error without throwing", () => {
    expect(gmailScan).toMatch(/logger\.warn.*Inbox write error/);
  });

  it("returns count of written signals", () => {
    expect(gmailScan).toMatch(/data\?\.length.*0/);
  });
});

// ── Section 10: Legacy backward compat ───────────────────────────────────
describe("Section 10: Legacy email_signals backward compat", () => {
  it("scanUserEmailsLegacy function preserved", () => {
    expect(gmailScan).toMatch(/scanUserEmailsLegacy|function.*Legacy/);
  });

  it("classifyEmail function preserved", () => {
    expect(gmailScan).toMatch(/function classifyEmail/);
  });

  it("createPipelineSignals function preserved", () => {
    expect(gmailScan).toMatch(/async function createPipelineSignals/);
  });

  it("email_signals table still written to", () => {
    expect(gmailScan).toMatch(/email_signals.*upsert/);
  });

  it("legacy scan only runs if not overtime", () => {
    expect(gmailScan).toMatch(/isOvertime/);
  });
});

// ── Section 11: Wall-time and error safety ────────────────────────────────
describe("Section 11: Wall-time and error safety", () => {
  it("WALL_TIME_LIMIT_MS = 120000", () => {
    expect(gmailScan).toMatch(/WALL_TIME_LIMIT_MS.*120[_,]?000/);
  });

  it("isOvertime() helper used throughout", () => {
    const matches = gmailScan.match(/isOvertime\(\)/g);
    expect((matches || []).length).toBeGreaterThan(3);
  });

  it("wall-time limit triggers break in main loop", () => {
    expect(gmailScan).toMatch(/isOvertime.*Wall-time limit/);
  });

  it("per-user errors don't abort entire batch", () => {
    expect(gmailScan).toMatch(/errors\+\+/);
    expect(gmailScan).toMatch(/continue/);
  });

  it("gmail_connections error_message updated on failure", () => {
    expect(gmailScan).toMatch(/gmail_connections.*update.*error_message/);
  });
});

// ── Section 12: Stats and response ───────────────────────────────────────
describe("Section 12: Stats and response shape", () => {
  it("tracks totalGmailInbox count", () => {
    expect(gmailScan).toMatch(/totalGmailInbox/);
  });

  it("tracks totalCalendarInbox count", () => {
    expect(gmailScan).toMatch(/totalCalendarInbox/);
  });

  it("tracks usersProcessed", () => {
    expect(gmailScan).toMatch(/usersProcessed/);
  });

  it("tracks errors count", () => {
    expect(gmailScan).toMatch(/errors/);
  });

  it("returns elapsed_ms in stats", () => {
    expect(gmailScan).toMatch(/elapsed_ms/);
  });

  it("returns JSON response with stats", () => {
    expect(gmailScan).toMatch(/JSON\.stringify.*stats/);
  });

  it("handles no active connections gracefully", () => {
    expect(gmailScan).toMatch(/No active connections/);
  });
});

// ── Section 13: File inventory ────────────────────────────────────────────
describe("Section 13: File inventory", () => {
  const files = [
    "supabase/migrations/20260315000002_fb_pi_001_s1_schema.sql",
    "supabase/functions/gmail-scan/index.ts",
  ];

  files.forEach((f) => {
    it(`exists: ${f}`, () => {
      expect(existsSync(path.join(ROOT, f))).toBe(true);
    });
  });
});
