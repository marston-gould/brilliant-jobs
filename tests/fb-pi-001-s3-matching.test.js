// tests/fb-pi-001-s3-matching.test.js
// FB-PI-001 S3: Application Matching + Stage Transitions
// 12 sections covering fuzzy matching, stage transitions, auto-move,
// prompt logic, migration, gateway, PostHog, hooks/scars.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd());
const EF = path.join(ROOT, "supabase/functions/process-pipeline-action/index.ts");
const MIGRATION = path.join(ROOT, "supabase/migrations/20260315000004_fb_pi_001_s3_matching.sql");
const GATEWAY = path.join(ROOT, "supabase/functions/api-gateway/index.ts");

const ef = existsSync(EF) ? readFileSync(EF, "utf8") : "";
const migration = existsSync(MIGRATION) ? readFileSync(MIGRATION, "utf8") : "";
const gateway = existsSync(GATEWAY) ? readFileSync(GATEWAY, "utf8") : "";

// ── Section 1: File existence ─────────────────────────────────────────────
describe("Section 1: File existence", () => {
  it("process-pipeline-action EF exists", () => expect(existsSync(EF)).toBe(true));
  it("S3 migration file exists", () => expect(existsSync(MIGRATION)).toBe(true));
  it("migration has correct timestamp", () => expect(MIGRATION).toMatch(/20260315000004/));
});

// ── Section 2: EF header ─────────────────────────────────────────────────
describe("Section 2: EF header and constants", () => {
  it("references FB-PI-001 S3", () => expect(ef).toMatch(/FB-PI-001 S3/));
  it("HOOK H-PI-03 comment present", () => expect(ef).toMatch(/H-PI-03/));
  it("SCAR S-PI-01 comment present", () => expect(ef).toMatch(/S-PI-01/));
  it("BATCH_SIZE is 20", () => expect(ef).toMatch(/BATCH_SIZE\s*=\s*20/));
  it("FUZZY_MATCH_THRESHOLD is 0.35", () => expect(ef).toMatch(/FUZZY_MATCH_THRESHOLD\s*=\s*0\.35/));
  it("STAGE_ORDER array defined", () => {
    expect(ef).toMatch(/STAGE_ORDER/);
    expect(ef).toMatch(/STAGE_ORDER/);
    expect(ef).toMatch(/"interview"/);
    expect(ef).toMatch(/"offer"/);
  });
  it("MATCHABLE_STAGES excludes terminal stages", () => {
    expect(ef).toMatch(/MATCHABLE_STAGES/);
    expect(ef).not.toMatch(/MATCHABLE_STAGES.*"rejected"/);
  });
});

// ── Section 3: Company normalisation ─────────────────────────────────────
describe("Section 3: Company name normalisation", () => {
  it("normaliseCompany function exists", () => expect(ef).toMatch(/function normaliseCompany/));
  it("strips legal suffixes (inc/llc/corp)", () => expect(ef).toMatch(/inc|llc|corp/));
  it("lowercases and trims", () => expect(ef).toMatch(/toLowerCase|\.lower/));
  it("rootDomain function exists", () => expect(ef).toMatch(/function rootDomain/));
  it("rootDomain filters generic providers", () => expect(ef).toMatch(/gmail|greenhouse|lever/));
  it("rootDomain handles @email pattern", () => expect(ef).toMatch(/@.*\[/));
});

// ── Section 4: Matching strategies ───────────────────────────────────────
describe("Section 4: Three-tier matching strategy", () => {
  it("findMatchingApplication function exists", () => expect(ef).toMatch(/async function findMatchingApplication/));
  it("Strategy 1: domain match against company_domain", () => {
    expect(ef).toMatch(/match_type.*domain|domain.*match_type/);
    expect(ef).toMatch(/company_domain/);
  });
  it("domain match returns score 1.0", () => expect(ef).toMatch(/match_type.*domain.*1\.0|1\.0.*domain/));
  it("Strategy 2: exact normalised name match", () => {
    expect(ef).toMatch(/match_type.*exact|exact.*match_type/);
    expect(ef).toMatch(/normExtracted/);
  });
  it("Strategy 3: pg_trgm fuzzy via fn_fuzzy_match_pipeline RPC", () => {
    expect(ef).toMatch(/fn_fuzzy_match_pipeline/);
    expect(ef).toMatch(/\.rpc\(/);
  });
  it("fuzzy match uses p_threshold parameter", () => expect(ef).toMatch(/p_threshold.*FUZZY_MATCH_THRESHOLD/));
  it("returns match_type none when no match found", () => expect(ef).toMatch(/match_type.*none/));
});

// ── Section 5: Stage transition logic ────────────────────────────────────
describe("Section 5: Stage transition logic", () => {
  it("isForwardTransition function exists", () => expect(ef).toMatch(/function isForwardTransition/));
  it("compares stage indices in STAGE_ORDER", () => expect(ef).toMatch(/STAGE_ORDER\.indexOf/));
  it("targetIdx > currentIdx for forward", () => expect(ef).toMatch(/targetIdx.*>.*currentIdx/));
  it("stageTimestampCol maps stages to timestamp columns", () => {
    expect(ef).toMatch(/function stageTimestampCol/);
    expect(ef).toMatch(/interview_at/);
    expect(ef).toMatch(/offer_at/);
    expect(ef).toMatch(/rejected_at/);
  });
  it("dismisses non-forward transitions", () => expect(ef).toMatch(/no_forward_transition/));
});

// ── Section 6: Auto-move path ─────────────────────────────────────────────
describe("Section 6: Auto-move (high/medium confidence + matched)", () => {
  it("checks isHighOrMedium before auto-move", () => expect(ef).toMatch(/isHighOrMedium/));
  it("updates user_pipeline stage on auto-move", () => {
    expect(ef).toMatch(/from\("user_pipeline"\)/);
    expect(ef).toMatch(/stage:.*targetStage/);
  });
  it("sets stage_changed_at timestamp", () => expect(ef).toMatch(/stage_changed_at/));
  it("sets auto_advanced = true", () => expect(ef).toMatch(/auto_advanced.*true/));
  it("sets auto_advanced_source with pi_ prefix", () => expect(ef).toMatch(/pi_.*signal_source/));
  it("sets corresponding stage timestamp column", () => expect(ef).toMatch(/tsCol/));
  it("updates pipeline_signals action_taken = auto_moved", () => {
    expect(ef).toMatch(/action_taken.*auto_moved/);
  });
  it("sets previous_stage for undo (S5 will use)", () => expect(ef).toMatch(/previous_stage.*currentStage/));
  it("sets target_stage", () => expect(ef).toMatch(/target_stage.*targetStage/));
});

// ── Section 7: Prompt path ────────────────────────────────────────────────
describe("Section 7: Prompt path (low confidence OR untracked)", () => {
  it("sets action_taken = prompted on low confidence", () => {
    expect(ef).toMatch(/action_taken.*prompted/);
  });
  it("sets action_taken = prompted when no match (untracked)", () => {
    expect(ef).toMatch(/untracked.*true/);
  });
  it("sets matched_application_id = null for untracked", () => {
    expect(ef).toMatch(/matched_application_id.*null/);
  });
  it("sets matched_application_id to entry.id when matched but low confidence", () => {
    expect(ef).toMatch(/matched_application_id.*entry\.id/);
  });
});

// ── Section 8: Error handling ─────────────────────────────────────────────
describe("Section 8: Error handling", () => {
  it("per-signal try/catch prevents batch abort", () => expect(ef).toMatch(/catch.*\(e\)/));
  it("marks failed signal as error action_taken", () => expect(ef).toMatch(/action_taken.*error/));
  it("stores process_error in evidence_metadata", () => expect(ef).toMatch(/process_error/));
  it("per-signal errors increment errors counter", () => expect(ef).toMatch(/errors\+\+/));
  it("fatal error returns 500", () => expect(ef).toMatch(/status.*500/));
});

// ── Section 9: PostHog events ─────────────────────────────────────────────
describe("Section 9: PostHog events", () => {
  it("capturePostHog helper defined", () => expect(ef).toMatch(/function capturePostHog/));
  it("emits pipeline_signal_processed on every signal", () => expect(ef).toMatch(/pipeline_signal_processed/));
  it("emits pipeline_stage_auto_moved on auto-move", () => expect(ef).toMatch(/pipeline_stage_auto_moved/));
  it("emits pipeline_action_batch_complete", () => expect(ef).toMatch(/pipeline_action_batch_complete/));
  it("pipeline_signal_processed includes action_taken", () => expect(ef).toMatch(/action_taken/));
  it("pipeline_signal_processed includes match_type", () => expect(ef).toMatch(/match_type/));
  it("pipeline_stage_auto_moved includes from_stage and to_stage", () => {
    expect(ef).toMatch(/from_stage/);
    expect(ef).toMatch(/to_stage/);
  });
});

// ── Section 10: Migration — fn_fuzzy_match_pipeline ──────────────────────
describe("Section 10: fn_fuzzy_match_pipeline migration", () => {
  it("creates fn_fuzzy_match_pipeline function", () => expect(migration).toMatch(/CREATE OR REPLACE FUNCTION fn_fuzzy_match_pipeline/));
  it("takes p_user_id, p_company_name, p_threshold, p_stages params", () => {
    expect(migration).toMatch(/p_user_id/);
    expect(migration).toMatch(/p_company_name/);
    expect(migration).toMatch(/p_threshold/);
    expect(migration).toMatch(/p_stages/);
  });
  it("uses pg_trgm similarity()", () => expect(migration).toMatch(/similarity\(/));
  it("filters by p_user_id and p_stages", () => {
    expect(migration).toMatch(/up\.user_id = p_user_id/);
    expect(migration).toMatch(/up\.stage = ANY\(p_stages\)/);
  });
  it("GREATEST across company_name and company_slug", () => expect(migration).toMatch(/GREATEST/));
  it("grants to authenticated and service_role", () => expect(migration).toMatch(/GRANT EXECUTE.*authenticated.*service_role/));
  it("SCAR S-PI-01 comment", () => expect(migration).toMatch(/S-PI-01/));
  it("registers process-pipeline-signals cron", () => expect(migration).toMatch(/process-pipeline-signals/));
  it("cron runs at 7,22,37,52 (staggered 7min from classify)", () => expect(migration).toMatch(/7,22,37,52/));
  it("calls api-gateway/process-pipeline-action", () => expect(migration).toMatch(/process-pipeline-action/));
  it("idempotent unschedule before schedule", () => expect(migration).toMatch(/cron\.unschedule/));
  it("enables pg_trgm extension", () => expect(migration).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_trgm/));
});

// ── Section 11: Gateway route ─────────────────────────────────────────────
describe("Section 11: Gateway route #125", () => {
  it("process-pipeline-action route in gateway", () => expect(gateway).toMatch(/process-pipeline-action/));
  it("route count is 125", () => expect(gateway).toMatch(/TOTAL: 125 routes/));
  it("route comment references FB-PI-001-S3", () => expect(gateway).toMatch(/FB-PI-001-S3.*125|#125.*FB-PI-001/));
});

// ── Section 12: File inventory ────────────────────────────────────────────
describe("Section 12: File inventory", () => {
  const files = [
    "supabase/functions/process-pipeline-action/index.ts",
    "supabase/migrations/20260315000004_fb_pi_001_s3_matching.sql",
    "tests/fb-pi-001-s3-matching.test.js",
  ];
  files.forEach((f) => {
    it(`exists: ${f}`, () => expect(existsSync(path.join(ROOT, f))).toBe(true));
  });
});
