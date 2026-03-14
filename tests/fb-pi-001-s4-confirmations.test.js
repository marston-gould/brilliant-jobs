// tests/fb-pi-001-s4-confirmations.test.js
// FB-PI-001 S4: Untracked App Confirmations + Dashboard Prompt Cards
// 11 sections: migration, process-pipeline-action extension,
// pipeline.js functions, dashboard HTML, PostHog, error handling.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd());
const MIGRATION  = path.join(ROOT, "supabase/migrations/20260315000005_fb_pi_001_s4_confirmations.sql");
const PROCESS_EF = path.join(ROOT, "supabase/functions/process-pipeline-action/index.ts");
const PIPELINE_JS = path.join(ROOT, "js/pipeline.js");
const DASHBOARD  = path.join(ROOT, "dashboard.html");

const migration  = existsSync(MIGRATION)  ? readFileSync(MIGRATION,  "utf8") : "";
const processEf  = existsSync(PROCESS_EF) ? readFileSync(PROCESS_EF, "utf8") : "";
const pipelineJs = existsSync(PIPELINE_JS)? readFileSync(PIPELINE_JS,"utf8") : "";
const dashboard  = existsSync(DASHBOARD)  ? readFileSync(DASHBOARD,  "utf8") : "";

// ── Section 1: File existence ─────────────────────────────────────────────
describe("Section 1: File existence", () => {
  it("S4 migration exists", () => expect(existsSync(MIGRATION)).toBe(true));
  it("migration has correct timestamp", () => expect(MIGRATION).toMatch(/20260315000005/));
  it("process-pipeline-action EF exists", () => expect(existsSync(PROCESS_EF)).toBe(true));
  it("pipeline.js exists", () => expect(existsSync(PIPELINE_JS)).toBe(true));
  it("dashboard.html exists", () => expect(existsSync(DASHBOARD)).toBe(true));
});

// ── Section 2: pipeline_pending_confirmations migration ───────────────────
describe("Section 2: pipeline_pending_confirmations table", () => {
  it("creates pipeline_pending_confirmations table", () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS pipeline_pending_confirmations/);
  });
  it("has user_id FK to auth.users", () => {
    expect(migration).toMatch(/user_id.*uuid.*REFERENCES auth\.users/);
  });
  it("has signal_id FK to pipeline_signals", () => {
    expect(migration).toMatch(/signal_id.*uuid.*REFERENCES pipeline_signals/);
  });
  it("has detected_company NOT NULL", () => {
    expect(migration).toMatch(/detected_company.*text.*NOT NULL/);
  });
  it("has detected_role nullable", () => {
    expect(migration).toMatch(/detected_role.*text/);
  });
  it("has status CHECK constraint (pending/confirmed/dismissed)", () => {
    expect(migration).toMatch(/CHECK.*status.*pending.*confirmed.*dismissed/);
  });
  it("has source CHECK constraint (gmail/calendar)", () => {
    expect(migration).toMatch(/CHECK.*source.*gmail.*calendar/);
  });
  it("has confirmed_application_id for linking created entry", () => {
    expect(migration).toMatch(/confirmed_application_id.*uuid/);
  });
  it("UNIQUE index on signal_id WHERE pending (prevent duplicates)", () => {
    expect(migration).toMatch(/idx_pending_conf_signal/);
    expect(migration).toMatch(/status.*=.*'pending'/);
  });
  it("user+status index for dashboard query", () => {
    expect(migration).toMatch(/idx_pending_conf_user_status/);
  });
  it("RLS enabled", () => {
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });
  it("users_manage_own_confirmations policy", () => {
    expect(migration).toMatch(/users_manage_own_confirmations/);
  });
  it("SCAR S-PI-04 comment", () => {
    expect(migration).toMatch(/S-PI-04/);
  });
});

// ── Section 3: process-pipeline-action untracked extension ───────────────
describe("Section 3: process-pipeline-action untracked path (S4)", () => {
  it("inserts into pipeline_pending_confirmations on untracked", () => {
    expect(processEf).toMatch(/pipeline_pending_confirmations.*upsert|upsert.*pipeline_pending_confirmations/);
  });
  it("extracts detected_company from extracted.company", () => {
    expect(processEf).toMatch(/extracted\.company.*detectedCompany|detectedCompany.*extracted\.company/);
  });
  it("extracts detected_role from extracted.role", () => {
    expect(processEf).toMatch(/extracted\.role.*detectedRole|detectedRole.*extracted\.role/);
  });
  it("sets detected_stage from signal.proposed_stage", () => {
    expect(processEf).toMatch(/detected_stage.*proposed_stage/);
  });
  it("sets source from signal.signal_source", () => {
    expect(processEf).toMatch(/source.*signal\.signal_source/);
  });
  it("uses ignoreDuplicates for upsert (idempotent)", () => {
    expect(processEf).toMatch(/ignoreDuplicates.*true/);
  });
  it("emits untracked_app_detected PostHog event", () => {
    expect(processEf).toMatch(/untracked_app_detected/);
  });
  it("still sets action_taken=prompted on signal", () => {
    expect(processEf).toMatch(/action_taken.*prompted/);
  });
});

// ── Section 4: pipeline.js — _pendingConfirmations variable ──────────────
describe("Section 4: pipeline.js _pendingConfirmations state", () => {
  it("declares _pendingConfirmations array", () => {
    expect(pipelineJs).toMatch(/var _pendingConfirmations\s*=\s*\[\]/);
  });
  it("loadPendingConfirmations function defined", () => {
    expect(pipelineJs).toMatch(/async function loadPendingConfirmations/);
  });
  it("queries pipeline_pending_confirmations table", () => {
    expect(pipelineJs).toMatch(/pipeline_pending_confirmations/);
  });
  it("filters by user_id and status='pending'", () => {
    expect(pipelineJs).toMatch(/\.eq\('user_id'.*currentUser/);
    expect(pipelineJs).toMatch(/\.eq\('status',\s*'pending'\)/);
  });
  it("limits to 20 confirmations", () => {
    expect(pipelineJs).toMatch(/\.limit\(20\)/);
  });
  it("calls renderConfirmationCards after load", () => {
    expect(pipelineJs).toMatch(/renderConfirmationCards/);
  });
});

// ── Section 5: pipeline.js — renderConfirmationCards ─────────────────────
describe("Section 5: pipeline.js renderConfirmationCards", () => {
  it("renderConfirmationCards function defined", () => {
    expect(pipelineJs).toMatch(/function renderConfirmationCards/);
  });
  it("targets pi-confirmation-cards container", () => {
    expect(pipelineJs).toMatch(/pi-confirmation-cards/);
  });
  it("hides container when no confirmations", () => {
    expect(pipelineJs).toMatch(/display.*none/);
  });
  it("shows container when confirmations exist", () => {
    expect(pipelineJs).toMatch(/display.*block/);
  });
  it("renders detected_company boldly", () => {
    expect(pipelineJs).toMatch(/detected_company/);
  });
  it("renders detected_role when present", () => {
    expect(pipelineJs).toMatch(/detected_role/);
  });
  it("renders Add to Pipeline button", () => {
    expect(pipelineJs).toMatch(/Add to Pipeline/);
  });
  it("renders Dismiss button", () => {
    expect(pipelineJs).toMatch(/Dismiss/);
  });
  it("blue left border for untracked cards (#3B82F6)", () => {
    expect(pipelineJs).toMatch(/#3B82F6/);
  });
  it("renders source icon for gmail vs calendar", () => {
    expect(pipelineJs).toMatch(/calendar.*📅|📅.*calendar/);
  });
  it("escapes company/role with escHtml", () => {
    expect(pipelineJs).toMatch(/escHtml/);
  });
});

// ── Section 6: pipeline.js — confirmPendingApp ───────────────────────────
describe("Section 6: confirmPendingApp function", () => {
  it("confirmPendingApp function defined", () => {
    expect(pipelineJs).toMatch(/async function confirmPendingApp/);
  });
  it("inserts into user_pipeline with stage", () => {
    expect(pipelineJs).toMatch(/user_pipeline.*insert|insert.*user_pipeline/);
  });
  it("sets company_name from detected_company", () => {
    expect(pipelineJs).toMatch(/company_name.*company/);
  });
  it("sets stage and stage_changed_at", () => {
    expect(pipelineJs).toMatch(/stage_changed_at/);
  });
  it("updates pipeline_pending_confirmations status=confirmed", () => {
    expect(pipelineJs).toMatch(/status.*confirmed/);
  });
  it("stores confirmed_application_id", () => {
    expect(pipelineJs).toMatch(/confirmed_application_id/);
  });
  it("emits untracked_app_confirmed PostHog event", () => {
    expect(pipelineJs).toMatch(/untracked_app_confirmed/);
  });
  it("shows success toast", () => {
    expect(pipelineJs).toMatch(/toastSuccess/);
  });
  it("reloads confirmations and re-renders pipeline", () => {
    expect(pipelineJs).toMatch(/loadPendingConfirmations/);
    expect(pipelineJs).toMatch(/renderPipeline/);
  });
});

// ── Section 7: pipeline.js — dismissPendingApp ───────────────────────────
describe("Section 7: dismissPendingApp function", () => {
  it("dismissPendingApp function defined", () => {
    expect(pipelineJs).toMatch(/async function dismissPendingApp/);
  });
  it("updates status=dismissed", () => {
    expect(pipelineJs).toMatch(/status.*dismissed/);
  });
  it("sets resolved_at timestamp", () => {
    expect(pipelineJs).toMatch(/resolved_at/);
  });
  it("scopes update to current user (no cross-user)", () => {
    expect(pipelineJs).toMatch(/\.eq\('user_id',.*currentUser/);
  });
  it("removes from local _pendingConfirmations array", () => {
    expect(pipelineJs).toMatch(/_pendingConfirmations.*filter|filter.*_pendingConfirmations/);
  });
  it("emits untracked_app_dismissed PostHog event", () => {
    expect(pipelineJs).toMatch(/untracked_app_dismissed/);
  });
  it("re-renders cards after dismiss", () => {
    expect(pipelineJs).toMatch(/renderConfirmationCards/);
  });
});

// ── Section 8: pipeline.js — initPipeline integration ────────────────────
describe("Section 8: initPipeline wiring", () => {
  it("loadPendingConfirmations called in initPipeline", () => {
    expect(pipelineJs).toMatch(/await loadPendingConfirmations\(\)/);
  });
  it("called after loadPendingSignals in initPipeline", () => {
    // Find the initPipeline function body
    const initIdx = pipelineJs.indexOf("async function initPipeline()");
    expect(initIdx).toBeGreaterThan(0);
    const initBody = pipelineJs.slice(initIdx, initIdx + 500);
    const idx1 = initBody.indexOf("await loadPendingSignals()");
    const idx2 = initBody.indexOf("await loadPendingConfirmations()");
    expect(idx1).toBeGreaterThan(0);
    expect(idx2).toBeGreaterThan(idx1);
  });
});

// ── Section 9: pipeline.js — window exports ───────────────────────────────
describe("Section 9: window exports", () => {
  it("window.loadPendingConfirmations exported", () => {
    expect(pipelineJs).toMatch(/window\.loadPendingConfirmations/);
  });
  it("window.confirmPendingApp exported", () => {
    expect(pipelineJs).toMatch(/window\.confirmPendingApp/);
  });
  it("window.dismissPendingApp exported", () => {
    expect(pipelineJs).toMatch(/window\.dismissPendingApp/);
  });
  it("window.renderConfirmationCards exported", () => {
    expect(pipelineJs).toMatch(/window\.renderConfirmationCards/);
  });
});

// ── Section 10: dashboard.html container ─────────────────────────────────
describe("Section 10: dashboard.html confirmation container", () => {
  it("pi-confirmation-cards container exists", () => {
    expect(dashboard).toMatch(/id="pi-confirmation-cards"/);
  });
  it("container starts hidden", () => {
    expect(dashboard).toMatch(/pi-confirmation-cards.*display:none/);
  });
  it("container is inside app-tab-pipeline", () => {
    const tabIdx = dashboard.indexOf('id="app-tab-pipeline"');
    const cardIdx = dashboard.indexOf('id="pi-confirmation-cards"');
    expect(tabIdx).toBeGreaterThan(0);
    expect(cardIdx).toBeGreaterThan(tabIdx);
  });
  it("FB-PI-001 S4 comment above container", () => {
    expect(dashboard).toMatch(/FB-PI-001 S4/);
  });
});

// ── Section 11: error handling ────────────────────────────────────────────
describe("Section 11: Error handling", () => {
  it("loadPendingConfirmations uses reportError on failure", () => {
    expect(pipelineJs).toMatch(/reportError\('pipeline:confirmations'/);
  });
  it("confirmPendingApp uses reportError on failure", () => {
    expect(pipelineJs).toMatch(/reportError\('pipeline:confirm_app'/);
  });
  it("confirmPendingApp shows error toast on failure", () => {
    expect(pipelineJs).toMatch(/toastError.*Failed to add/);
  });
  it("dismissPendingApp uses reportError on failure", () => {
    expect(pipelineJs).toMatch(/reportError\('pipeline:dismiss_app'/);
  });
});
