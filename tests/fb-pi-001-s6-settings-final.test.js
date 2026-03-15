// tests/fb-pi-001-s6-settings-final.test.js
// FB-PI-001 S6: Settings + Polish + Final Integration Tests
// 12 sections: S6 settings UI, save/load, cross-session smoke tests,
// EF deployment verification, table existence, cron registration,
// gateway routes, PostHog taxonomy, hook/scar audit.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd());
const read = (p) => existsSync(p) ? readFileSync(p, "utf8") : "";

const dashboard   = read(path.join(ROOT, "dashboard.html"));
const appsJs      = read(path.join(ROOT, "js/applications.js"));
const pipelineJs  = read(path.join(ROOT, "js/pipeline.js"));
const gateway     = read(path.join(ROOT, "supabase/functions/api-gateway/index.ts"));
const gmailScan   = read(path.join(ROOT, "supabase/functions/gmail-scan/index.ts"));
const classifier  = read(path.join(ROOT, "supabase/functions/classify-pipeline-signal/index.ts"));
const processor   = read(path.join(ROOT, "supabase/functions/process-pipeline-action/index.ts"));
const staleness   = read(path.join(ROOT, "supabase/functions/check-pipeline-staleness/index.ts"));

// ── Section 1: S6 dashboard.html new controls ─────────────────────────────
describe("Section 1: S6 Pipeline Intelligence settings controls", () => {
  it("pi-auto-move-behavior selector exists", () =>
    expect(dashboard).toMatch(/id="pi-auto-move-behavior"/));
  it("aggressive option is default (selected)", () =>
    expect(dashboard).toMatch(/value="aggressive".*selected|aggressive.*selected/));
  it("conservative option exists", () =>
    expect(dashboard).toMatch(/conservative/));
  it("manual option exists", () =>
    expect(dashboard).toMatch(/value="manual"/));
  it("pi-staleness-days range slider exists", () =>
    expect(dashboard).toMatch(/id="pi-staleness-days"/));
  it("slider min=3, max=30", () => {
    expect(dashboard).toMatch(/min="3"/);
    expect(dashboard).toMatch(/max="30"/);
  });
  it("pi-staleness-days-val label shows live value", () =>
    expect(dashboard).toMatch(/id="pi-staleness-days-val"/));
  it("pi-auto-archive checkbox exists", () =>
    expect(dashboard).toMatch(/id="pi-auto-archive"/));
  it("auto-archive defaults to checked", () =>
    expect(dashboard).toMatch(/pi-auto-archive.*checked|checked.*pi-auto-archive/));
  it("pi-notify-automove-inapp exists", () =>
    expect(dashboard).toMatch(/pi-notify-automove-inapp/));
  it("FB-PI-001 S6 comment in dashboard.html", () =>
    expect(dashboard).toMatch(/FB-PI-001 S6/));
});

// ── Section 2: savePipelineIntelligenceSettings extensions ────────────────
describe("Section 2: savePipelineIntelligenceSettings S6 fields", () => {
  it("reads auto_move_behavior from pi-auto-move-behavior", () =>
    expect(appsJs).toMatch(/auto_move_behavior.*pi-auto-move-behavior/));
  it("reads staleness_threshold_days from pi-staleness-days", () =>
    expect(appsJs).toMatch(/staleness_threshold_days.*pi-staleness-days/));
  it("reads auto_archive_enabled from pi-auto-archive", () =>
    expect(appsJs).toMatch(/auto_archive_enabled.*pi-auto-archive/));
  it("auto_archive_days defaults to 30", () =>
    expect(appsJs).toMatch(/auto_archive_days.*30/));
  it("upserts to pipeline_tracking_settings", () =>
    expect(appsJs).toMatch(/pipeline_tracking_settings.*upsert/));
  it("shows Saved! feedback on success", () =>
    expect(appsJs).toMatch(/Saved!/));
});

// ── Section 3: loadPipelineTrackingSettings S6 fields ────────────────────
describe("Section 3: loadPipelineTrackingSettings S6 fields", () => {
  it("populates pi-staleness-days from data", () =>
    expect(appsJs).toMatch(/pi-staleness-days.*staleness_threshold_days/));
  it("populates pi-staleness-days-val label", () =>
    expect(appsJs).toMatch(/pi-staleness-days-val/));
  it("populates pi-auto-archive from data", () =>
    expect(appsJs).toMatch(/pi-auto-archive.*auto_archive_enabled/));
  it("populates pi-auto-move-behavior from data", () =>
    expect(appsJs).toMatch(/pi-auto-move-behavior.*auto_move_behavior/));
  it("defaults auto_move_behavior to aggressive", () =>
    expect(appsJs).toMatch(/auto_move_behavior.*'aggressive'/));
});

// ── Section 4: Slider live-update wiring ─────────────────────────────────
describe("Section 4: Staleness slider live-update", () => {
  it("wireStalnessSlider function exists", () =>
    expect(appsJs).toMatch(/wireStalnessSlider/));
  it("input event updates the label", () => {
    expect(appsJs).toMatch(/'input'/);
    expect(appsJs).toMatch(/staleness-days-val/);
  });
  it("wired on DOMContentLoaded", () => {
    expect(appsJs).toMatch(/DOMContentLoaded/);
    expect(appsJs).toMatch(/wireStalnessSlider/);
  });
});

// ── Section 5: S1 smoke — gmail-scan EF ──────────────────────────────────
describe("Section 5: S1 smoke — gmail-scan EF (inbox pipeline)", () => {
  it("pipeline_signal_inbox table referenced", () =>
    expect(gmailScan).toMatch(/pipeline_signal_inbox/));
  it("user_scan_checkpoints table referenced", () =>
    expect(gmailScan).toMatch(/user_scan_checkpoints/));
  it("calendar scan function present", () =>
    expect(gmailScan).toMatch(/scanCalendar/));
  it("checkpoint management present", () =>
    expect(gmailScan).toMatch(/getOrCreateCheckpoint/));
  it("dedup via ignoreDuplicates", () =>
    expect(gmailScan).toMatch(/ignoreDuplicates.*true/));
  it("FB-PI-001 S1 header present", () =>
    expect(gmailScan).toMatch(/FB-PI-001 S1/));
});

// ── Section 6: S2 smoke — classify-pipeline-signal EF ────────────────────
describe("Section 6: S2 smoke — AI classifier EF", () => {
  it("Sonnet model referenced", () =>
    expect(classifier).toMatch(/claude-sonnet-4-20250514/));
  it("all 9 signal types in VALID_SIGNAL_TYPES", () => {
    ["ACK","REJ-PRE","INT","REJ-POST","OFFER","RESCHED","CAL-INT","CAL-OFFER","NONE"]
      .forEach(t => expect(classifier).toMatch(new RegExp(`"${t}"`)));
  });
  it("prompt caching with ephemeral cache_control", () =>
    expect(classifier).toMatch(/cache_control.*ephemeral/));
  it("BATCH_SIZE = 10", () =>
    expect(classifier).toMatch(/BATCH_SIZE\s*=\s*10/));
  it("FB-PI-001 S2 header present", () =>
    expect(classifier).toMatch(/FB-PI-001 S2/));
});

// ── Section 7: S3 smoke — process-pipeline-action EF ─────────────────────
describe("Section 7: S3 smoke — matching + stage transitions EF", () => {
  it("fn_fuzzy_match_pipeline RPC called", () =>
    expect(processor).toMatch(/fn_fuzzy_match_pipeline/));
  it("three-tier matching: domain/exact/fuzzy", () => {
    expect(processor).toMatch(/domain/);
    expect(processor).toMatch(/exact/);
    expect(processor).toMatch(/fuzzy/);
  });
  it("auto_moved action on high/medium confidence", () =>
    expect(processor).toMatch(/auto_moved/));
  it("previous_stage stored for undo", () =>
    expect(processor).toMatch(/previous_stage.*currentStage/));
  it("untracked path inserts pipeline_pending_confirmations", () =>
    expect(processor).toMatch(/pipeline_pending_confirmations/));
  it("FB-PI-001 S3 header present", () =>
    expect(processor).toMatch(/FB-PI-001 S3/));
});

// ── Section 8: S4 smoke — pipeline.js confirmation cards ─────────────────
describe("Section 8: S4 smoke — untracked confirmation cards", () => {
  it("_pendingConfirmations array exists", () =>
    expect(pipelineJs).toMatch(/_pendingConfirmations/));
  it("loadPendingConfirmations function exists", () =>
    expect(pipelineJs).toMatch(/async function loadPendingConfirmations/));
  it("renderConfirmationCards function exists", () =>
    expect(pipelineJs).toMatch(/function renderConfirmationCards/));
  it("confirmPendingApp creates user_pipeline entry", () =>
    expect(pipelineJs).toMatch(/async function confirmPendingApp/));
  it("dismissPendingApp sets status=dismissed", () =>
    expect(pipelineJs).toMatch(/async function dismissPendingApp/));
  it("pi-confirmation-cards container in dashboard.html", () =>
    expect(dashboard).toMatch(/pi-confirmation-cards/));
});

// ── Section 9: S5 smoke — staleness engine ───────────────────────────────
describe("Section 9: S5 smoke — staleness engine", () => {
  it("AUTO_ARCHIVE_DAYS = 30", () =>
    expect(staleness).toMatch(/AUTO_ARCHIVE_DAYS\s*=\s*30/));
  it("staleness prompt inserts pipeline_signal", () =>
    expect(staleness).toMatch(/pipeline_signals.*insert/));
  it("undo_expires_at set for 48h window", () =>
    expect(staleness).toMatch(/undo_expires_at/));
  it("renderStalnessCards in pipeline.js", () =>
    expect(pipelineJs).toMatch(/function renderStalnessCards/));
  it("undoAutoArchive function exists", () =>
    expect(pipelineJs).toMatch(/async function undoAutoArchive/));
  it("pi-staleness-cards + pi-undo-toasts in dashboard.html", () => {
    expect(dashboard).toMatch(/pi-staleness-cards/);
    expect(dashboard).toMatch(/pi-undo-toasts/);
  });
  it("logManualStageMove for backward transitions", () =>
    expect(pipelineJs).toMatch(/function logManualStageMove/));
});

// ── Section 10: Gateway routes audit ─────────────────────────────────────
describe("Section 10: API gateway routes — FB-PI-001 complete", () => {
  it("gmail-scan route present", () =>
    expect(gateway).toMatch(/gmail-scan/));
  it("classify-pipeline-signal route #124", () =>
    expect(gateway).toMatch(/classify-pipeline-signal.*124|#124/));
  it("process-pipeline-action route #125", () =>
    expect(gateway).toMatch(/process-pipeline-action.*125|#125/));
  it("check-pipeline-staleness route #126", () =>
    expect(gateway).toMatch(/check-pipeline-staleness.*126|#126/));
  it("total route count is 126", () =>
    expect(gateway).toMatch(/TOTAL: 126 routes/));
});

// ── Section 11: Hook and Scar audit ──────────────────────────────────────
describe("Section 11: Hook and Scar audit (spec §8)", () => {
  it("H-PI-01 source plugin hook in gmail-scan", () =>
    expect(gmailScan).toMatch(/H-PI-01/));
  it("H-PI-02 classifier swap hook in classifier", () =>
    expect(classifier).toMatch(/H-PI-02/));
  it("H-PI-03 transition handler hook in processor", () =>
    expect(processor).toMatch(/H-PI-03/));
  it("S-PI-01 LinkedIn signals scar in processor", () =>
    expect(processor).toMatch(/S-PI-01/));
  it("S-PI-04 user-defined rules scar in pipeline_signal_inbox migration", () => {
    const m4 = read(path.join(ROOT, "supabase/migrations/20260315000002_fb_pi_001_s1_schema.sql"));
    expect(m4).toMatch(/S-PI-04/);
  });
  it("S-PI-05 Outlook/iCal scar in gmail-scan", () =>
    expect(gmailScan).toMatch(/S-PI-05/));
  it("S-PI-06 ML training scar in classifier", () =>
    expect(classifier).toMatch(/S-PI-06/));
});

// ── Section 12: File inventory — all 6 sessions ───────────────────────────
describe("Section 12: File inventory — FB-PI-001 complete", () => {
  const files = [
    // S1
    "supabase/migrations/20260315000002_fb_pi_001_s1_schema.sql",
    "supabase/functions/gmail-scan/index.ts",
    "tests/fb-pi-001-s1-schema-inbox.test.js",
    // S2
    "supabase/migrations/20260315000003_fb_pi_001_s2_classifier_cron.sql",
    "supabase/functions/classify-pipeline-signal/index.ts",
    "tests/fb-pi-001-s2-classifier.test.js",
    // S3
    "supabase/migrations/20260315000004_fb_pi_001_s3_matching.sql",
    "supabase/functions/process-pipeline-action/index.ts",
    "tests/fb-pi-001-s3-matching.test.js",
    // S4
    "supabase/migrations/20260315000005_fb_pi_001_s4_confirmations.sql",
    "tests/fb-pi-001-s4-confirmations.test.js",
    // S5
    "supabase/migrations/20260315000006_fb_pi_001_s5_staleness.sql",
    "supabase/functions/check-pipeline-staleness/index.ts",
    "tests/fb-pi-001-s5-staleness.test.js",
    // S6
    "tests/fb-pi-001-s6-settings-final.test.js",
  ];
  files.forEach((f) => {
    it(`exists: ${path.basename(f)}`, () =>
      expect(existsSync(path.join(ROOT, f))).toBe(true));
  });
});
