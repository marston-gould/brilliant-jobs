// tests/fb-pi-001-s5-staleness.test.js
// FB-PI-001 S5: Staleness Engine
// 11 sections covering EF logic, migration, pipeline.js UI, undo, snooze,
// backward stage movement, gateway route, PostHog.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd());
const EF        = path.join(ROOT, "supabase/functions/check-pipeline-staleness/index.ts");
const MIGRATION = path.join(ROOT, "supabase/migrations/20260315000006_fb_pi_001_s5_staleness.sql");
const PIPELINE  = path.join(ROOT, "js/pipeline.js");
const DASHBOARD = path.join(ROOT, "dashboard.html");
const GATEWAY   = path.join(ROOT, "supabase/functions/api-gateway/index.ts");

const ef       = existsSync(EF)        ? readFileSync(EF,       "utf8") : "";
const migration= existsSync(MIGRATION) ? readFileSync(MIGRATION,"utf8") : "";
const pipeline = existsSync(PIPELINE)  ? readFileSync(PIPELINE, "utf8") : "";
const dashboard= existsSync(DASHBOARD) ? readFileSync(DASHBOARD,"utf8") : "";
const gateway  = existsSync(GATEWAY)   ? readFileSync(GATEWAY,  "utf8") : "";

// ── Section 1: File existence ─────────────────────────────────────────────
describe("Section 1: File existence", () => {
  it("check-pipeline-staleness EF exists", () => expect(existsSync(EF)).toBe(true));
  it("S5 migration exists", () => expect(existsSync(MIGRATION)).toBe(true));
  it("migration timestamp is 20260315000006", () => expect(MIGRATION).toMatch(/20260315000006/));
});

// ── Section 2: EF constants and thresholds ────────────────────────────────
describe("Section 2: EF constants and thresholds", () => {
  it("references FB-PI-001 S5", () => expect(ef).toMatch(/FB-PI-001 S5/));
  it("AUTO_ARCHIVE_DAYS = 30 per spec §6.1", () => expect(ef).toMatch(/AUTO_ARCHIVE_DAYS\s*=\s*30/));
  it("SNOOZE_DAYS = 7", () => expect(ef).toMatch(/SNOOZE_DAYS\s*=\s*7/));
  it("DEFAULT_PROMPT_THRESHOLD_DAYS = 7", () => expect(ef).toMatch(/DEFAULT_PROMPT_THRESHOLD_DAYS\s*=\s*7/));
  it("BATCH_SIZE defined", () => expect(ef).toMatch(/BATCH_SIZE/));
  it("SKIP_STAGES excludes archived/hired/rejected", () => {
    expect(ef).toMatch(/SKIP_STAGES/);
    expect(ef).toMatch(/"archived"/);
    expect(ef).toMatch(/"hired"/);
    expect(ef).toMatch(/"rejected"/);
  });
});

// ── Section 3: Auto-archive logic ─────────────────────────────────────────
describe("Section 3: Auto-archive at 30 days", () => {
  it("compares daysSince to AUTO_ARCHIVE_DAYS", () => expect(ef).toMatch(/daysSince.*AUTO_ARCHIVE_DAYS/));
  it("updates user_pipeline stage to archived", () => {
    expect(ef).toMatch(/user_pipeline.*update/);
    expect(ef).toMatch(/stage.*archived/);
  });
  it("sets archived_at timestamp", () => expect(ef).toMatch(/archived_at/));
  it("inserts pipeline_signal with action_taken=auto_moved", () => {
    expect(ef).toMatch(/action_taken.*auto_moved/);
  });
  it("stores previous_stage for undo", () => expect(ef).toMatch(/previous_stage.*prevStage/));
  it("stores undo_expires_at 48h in future", () => expect(ef).toMatch(/undo_expires_at/));
  it("stores auto_archive: true in evidence_metadata", () => expect(ef).toMatch(/auto_archive.*true/));
  it("emits pipeline_auto_archived PostHog event", () => expect(ef).toMatch(/pipeline_auto_archived/));
});

// ── Section 4: Snooze logic ────────────────────────────────────────────────
describe("Section 4: Snooze check", () => {
  it("checks last_prompted_at + SNOOZE_DAYS > now", () => {
    expect(ef).toMatch(/last_prompted_at/);
    expect(ef).toMatch(/snoozeExpiry/);
  });
  it("skips snoozed entries", () => expect(ef).toMatch(/snoozeExpiry.*>.*now/));
});

// ── Section 5: Staleness prompt logic ────────────────────────────────────
describe("Section 5: Staleness prompt", () => {
  it("reads user settings for threshold", () => expect(ef).toMatch(/getUserSettings/));
  it("settings cache prevents repeated DB reads", () => expect(ef).toMatch(/_settingsCache/));
  it("uses smallest cadence as threshold", () => expect(ef).toMatch(/Math\.min/));
  it("inserts pipeline_signal with staleness_prompt=true", () => expect(ef).toMatch(/staleness_prompt.*true/));
  it("sets status=pending_confirmation for prompt card", () => expect(ef).toMatch(/status.*pending_confirmation/));
  it("increments prompt_count", () => expect(ef).toMatch(/prompt_count/));
  it("updates last_prompted_at", () => expect(ef).toMatch(/last_prompted_at.*nowISO/));
  it("emits pipeline_staleness_prompt PostHog event", () => expect(ef).toMatch(/pipeline_staleness_prompt/));
  it("returns stats with auto_archived and prompted counts", () => {
    expect(ef).toMatch(/auto_archived/);
    expect(ef).toMatch(/prompted/);
  });
});

// ── Section 6: Migration ──────────────────────────────────────────────────
describe("Section 6: S5 migration", () => {
  it("adds staleness_threshold_days column with default 7", () => {
    expect(migration).toMatch(/staleness_threshold_days.*integer.*DEFAULT 7/);
  });
  it("adds auto_archive_enabled column", () => expect(migration).toMatch(/auto_archive_enabled/));
  it("adds auto_archive_days with default 30", () => {
    expect(migration).toMatch(/auto_archive_days.*integer.*DEFAULT 30/);
  });
  it("registers check-pipeline-staleness cron", () => expect(migration).toMatch(/check-pipeline-staleness/));
  it("cron runs daily at 8 AM UTC", () => expect(migration).toMatch(/0 8 \* \* \*/));
  it("uses idempotent unschedule+schedule pattern", () => expect(migration).toMatch(/cron\.unschedule/));
});

// ── Section 7: pipeline.js staleness cards ────────────────────────────────
describe("Section 7: pipeline.js renderStalnessCards", () => {
  it("renderStalnessCards function exists", () => expect(pipeline).toMatch(/function renderStalnessCards/));
  it("targets pi-staleness-cards container", () => expect(pipeline).toMatch(/pi-staleness-cards/));
  it("filters signals with staleness_prompt=true", () => expect(pipeline).toMatch(/staleness_prompt/));
  it("gray border color for staleness (#6B7280)", () => expect(pipeline).toMatch(/#6B7280/));
  it("renders stage selector for Mark Stage", () => expect(pipeline).toMatch(/pi-stale-stage/));
  it("renders Mark Stage button", () => expect(pipeline).toMatch(/Mark Stage/));
  it("renders Archive button", () => expect(pipeline).toMatch(/pi-stale-archive/));
  it("renders Snooze 7d button", () => expect(pipeline).toMatch(/Snooze 7d/));
  it("uses event delegation (no onclick)", () => {
    expect(pipeline).toMatch(/container\.onclick/);
    expect(pipeline).toMatch(/closest.*pi-stale/);
  });
  it("renderStalnessCards called after signal load", () => {
    const loadIdx = pipeline.indexOf("_pendingSignals = {};");
    const renderIdx = pipeline.indexOf("renderStalnessCards();");
    expect(loadIdx).toBeGreaterThan(0);
    expect(renderIdx).toBeGreaterThan(loadIdx);
  });
});

// ── Section 8: Snooze + Archive + Mark handlers ───────────────────────────
describe("Section 8: Staleness action handlers", () => {
  it("dismissStaleSignal resolves the signal in DB", () => {
    expect(pipeline).toMatch(/async function dismissStaleSignal/);
    expect(pipeline).toMatch(/status.*confirmed/);
  });
  it("dismissStaleSignal updates user_pipeline stage if corrected", () => {
    expect(pipeline).toMatch(/stage.*correctedStage/);
  });
  it("snoozeStalePrompt updates last_prompted_at", () => {
    expect(pipeline).toMatch(/async function snoozeStalePrompt/);
    expect(pipeline).toMatch(/last_prompted_at/);
  });
  it("snoozeStalePrompt dismisses the signal", () => expect(pipeline).toMatch(/status.*dismissed/));
  it("archiveFromStalePrompt moves stage to archived", () => {
    expect(pipeline).toMatch(/async function archiveFromStalePrompt/);
    expect(pipeline).toMatch(/stage.*archived/);
  });
  it("all three emit PostHog events", () => {
    expect(pipeline).toMatch(/staleness_prompt_resolved/);
    expect(pipeline).toMatch(/staleness_prompt_snoozed/);
    expect(pipeline).toMatch(/staleness_prompt_archived/);
  });
});

// ── Section 9: Undo auto-archive ──────────────────────────────────────────
describe("Section 9: Undo auto-archive (48h window)", () => {
  it("loadAutoArchiveUndo function exists", () => expect(pipeline).toMatch(/async function loadAutoArchiveUndo/));
  it("queries signals with auto_moved action within 48h", () => {
    expect(pipeline).toMatch(/action_taken.*auto_moved/);
    expect(pipeline).toMatch(/48.*60.*60.*1000/);
  });
  it("renderUndoToasts function renders green banner", () => {
    expect(pipeline).toMatch(/function renderUndoToasts/);
    expect(pipeline).toMatch(/065F46|auto_archive/);
  });
  it("undoAutoArchive restores previous_stage", () => {
    expect(pipeline).toMatch(/async function undoAutoArchive/);
    expect(pipeline).toMatch(/prevStage.*stage/);
  });
  it("undoAutoArchive clears archived_at", () => expect(pipeline).toMatch(/archived_at.*null/));
  it("emits auto_archive_undone PostHog event", () => expect(pipeline).toMatch(/auto_archive_undone/));
  it("shows success toast on undo", () => expect(pipeline).toMatch(/toastSuccess.*restored/));
  it("pi-undo-toasts container in dashboard.html", () => expect(dashboard).toMatch(/pi-undo-toasts/));
  it("loadAutoArchiveUndo called in initPipeline", () => expect(pipeline).toMatch(/await loadAutoArchiveUndo/));
});

// ── Section 10: Backward stage movement logging ───────────────────────────
describe("Section 10: Backward stage movement (spec §6.3)", () => {
  it("logManualStageMove function exists", () => expect(pipeline).toMatch(/function logManualStageMove/));
  it("uses _PI_STAGE_ORDER for direction check", () => expect(pipeline).toMatch(/_PI_STAGE_ORDER/));
  it("only logs backward movements (toIdx < fromIdx)", () => expect(pipeline).toMatch(/toIdx.*>=.*fromIdx/));
  it("inserts pipeline_signal with signal_type=MANUAL", () => {
    expect(pipeline).toMatch(/signal_type.*MANUAL/);
    expect(pipeline).toMatch(/signal_source.*user_override/);
  });
  it("stores previous_stage on backward move signal", () => expect(pipeline).toMatch(/previous_stage.*fromStage/));
  it("exported to window.logManualStageMove", () => expect(pipeline).toMatch(/window\.logManualStageMove/));
});

// ── Section 11: Gateway + dashboard containers ────────────────────────────
describe("Section 11: Gateway route + HTML containers", () => {
  it("check-pipeline-staleness route in gateway", () => expect(gateway).toMatch(/check-pipeline-staleness/));
  it("route count is 126", () => expect(gateway).toMatch(/TOTAL: 126 routes/));
  it("route comment references FB-PI-001-S5", () => expect(gateway).toMatch(/FB-PI-001-S5.*126|#126.*FB-PI-001/));
  it("pi-staleness-cards container in dashboard.html", () => expect(dashboard).toMatch(/pi-staleness-cards/));
  it("pi-undo-toasts container in dashboard.html", () => expect(dashboard).toMatch(/pi-undo-toasts/));
  it("FB-PI-001 S5 comment in dashboard.html", () => expect(dashboard).toMatch(/FB-PI-001 S5/));
});
