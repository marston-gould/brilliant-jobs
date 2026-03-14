// tests/fb-pi-001-s2-classifier.test.js
// FB-PI-001 S2: AI Classifier Edge Function validation
// 13 sections covering EF structure, system prompt, signal taxonomy,
// few-shot examples, output schema, confidence thresholds,
// cron migration, gateway route, PostHog events, hook/scar placement.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd());
const EF_PATH = path.join(ROOT, "supabase/functions/classify-pipeline-signal/index.ts");
const MIGRATION = path.join(ROOT, "supabase/migrations/20260315000003_fb_pi_001_s2_classifier_cron.sql");
const GATEWAY = path.join(ROOT, "supabase/functions/api-gateway/index.ts");

function read(p) { return existsSync(p) ? readFileSync(p, "utf8") : ""; }

const ef = read(EF_PATH);
const migration = read(MIGRATION);
const gateway = read(GATEWAY);

// ── Section 1: File existence ─────────────────────────────────────────────
describe("Section 1: File existence", () => {
  it("classify-pipeline-signal/index.ts exists", () => {
    expect(existsSync(EF_PATH)).toBe(true);
  });
  it("S2 migration file exists", () => {
    expect(existsSync(MIGRATION)).toBe(true);
  });
  it("migration has correct timestamp prefix", () => {
    expect(MIGRATION).toMatch(/20260315000003/);
  });
});

// ── Section 2: EF header and model ───────────────────────────────────────
describe("Section 2: EF header and model", () => {
  it("references FB-PI-001 S2 in header", () => {
    expect(ef).toMatch(/FB-PI-001 S2/);
  });
  it("uses claude-sonnet-4-20250514 as specified in spec §5.1", () => {
    expect(ef).toMatch(/claude-sonnet-4-20250514/);
  });
  it("imports createClient from supabase-js", () => {
    expect(ef).toMatch(/createClient.*supabase-js/);
  });
  it("BATCH_SIZE is 10 per spec §5.1", () => {
    expect(ef).toMatch(/BATCH_SIZE\s*=\s*10/);
  });
  it("HOOK H-PI-02 comment present (classifier swap point)", () => {
    expect(ef).toMatch(/H-PI-02/);
  });
  it("SCAR S-PI-06 comment present (ML training data)", () => {
    expect(ef).toMatch(/S-PI-06/);
  });
});

// ── Section 3: System prompt — all 8 signal types ────────────────────────
describe("Section 3: System prompt signal taxonomy", () => {
  it("defines ACK signal type", () => {
    expect(ef).toMatch(/ACK.*Application Acknowledged|ACK —/);
  });
  it("defines REJ-PRE signal type", () => {
    expect(ef).toMatch(/REJ-PRE.*Pre-Interview Rejection|REJ-PRE —/);
  });
  it("defines INT signal type", () => {
    expect(ef).toMatch(/INT.*Interview Invitation|INT —/);
  });
  it("defines REJ-POST signal type", () => {
    expect(ef).toMatch(/REJ-POST.*Post-Interview|REJ-POST —/);
  });
  it("defines OFFER signal type", () => {
    expect(ef).toMatch(/OFFER.*Job Offer|OFFER —/);
  });
  it("defines RESCHED signal type", () => {
    expect(ef).toMatch(/RESCHED.*Reschedule|RESCHED —/);
  });
  it("defines CAL-INT signal type", () => {
    expect(ef).toMatch(/CAL-INT.*Calendar.*Interview|CAL-INT —/);
  });
  it("defines CAL-OFFER signal type", () => {
    expect(ef).toMatch(/CAL-OFFER.*Calendar.*Offer|CAL-OFFER —/);
  });
  it("defines NONE as not-a-signal", () => {
    expect(ef).toMatch(/NONE.*Not a job application signal|NONE —/);
  });
  it("specifies VALID_SIGNAL_TYPES set covers all 9 values", () => {
    expect(ef).toMatch(/VALID_SIGNAL_TYPES/);
    expect(ef).toMatch(/"ACK"/);
    expect(ef).toMatch(/"OFFER"/);
    expect(ef).toMatch(/"NONE"/);
  });
});

// ── Section 4: System prompt — confidence thresholds ─────────────────────
describe("Section 4: Confidence thresholds", () => {
  it("CONFIDENCE_HIGH threshold is 0.85", () => {
    expect(ef).toMatch(/CONFIDENCE_HIGH\s*=\s*0\.85/);
  });
  it("CONFIDENCE_MEDIUM threshold is 0.50", () => {
    expect(ef).toMatch(/CONFIDENCE_MEDIUM\s*=\s*0\.50|CONFIDENCE_MEDIUM\s*=\s*0\.5/);
  });
  it("confidenceToLevel function maps scores to high/medium/low", () => {
    expect(ef).toMatch(/function confidenceToLevel/);
    expect(ef).toMatch(/"high"/);
    expect(ef).toMatch(/"medium"/);
    expect(ef).toMatch(/"low"/);
  });
  it("CAL-OFFER always treated as low confidence", () => {
    expect(ef).toMatch(/Always LOW/);
    expect(ef).toMatch(/CAL-OFFER/);
  });
});

// ── Section 5: System prompt — few-shot examples ─────────────────────────
describe("Section 5: Few-shot examples in system prompt", () => {
  it("has ACK example", () => {
    expect(ef).toMatch(/Example.*ACK|ACK.*gmail/);
  });
  it("has INT example with Calendly link", () => {
    expect(ef).toMatch(/calendly\.com/i);
  });
  it("has REJ-PRE example", () => {
    expect(ef).toMatch(/move forward with other candidates/i);
  });
  it("has OFFER example with salary", () => {
    expect(ef).toMatch(/\$280,000|\$280K|salary.*280/i);
  });
  it("has CAL-INT example with Zoom link", () => {
    expect(ef).toMatch(/zoom\.us/i);
  });
  it("has NONE example for noise filtering", () => {
    expect(ef).toMatch(/GitHub Actions|NONE.*noise|noise.*NONE/i);
  });
});

// ── Section 6: Prompt caching ─────────────────────────────────────────────
describe("Section 6: Prompt caching (FB-TRIAL-001-S6 infra)", () => {
  it("uses anthropic-beta prompt-caching header", () => {
    expect(ef).toMatch(/anthropic-beta.*prompt-caching-2024-07-31/);
  });
  it("system prompt has cache_control ephemeral", () => {
    expect(ef).toMatch(/cache_control.*ephemeral/);
  });
  it("logs cache hit rate via PostHog", () => {
    expect(ef).toMatch(/cache_read_input_tokens|classifier_cache_hit/);
  });
});

// ── Section 7: Output schema and parsing ─────────────────────────────────
describe("Section 7: Output schema and parsing", () => {
  it("output specifies signal_type field", () => {
    expect(ef).toMatch(/signal_type/);
  });
  it("output specifies confidence field", () => {
    expect(ef).toMatch(/confidence/);
  });
  it("output specifies extracted_fields with company, role, date", () => {
    expect(ef).toMatch(/extracted_fields/);
    expect(ef).toMatch(/company/);
    expect(ef).toMatch(/role/);
  });
  it("output specifies interviewer_names array", () => {
    expect(ef).toMatch(/interviewer_names/);
  });
  it("output specifies scheduling_link", () => {
    expect(ef).toMatch(/scheduling_link/);
  });
  it("output specifies salary_range", () => {
    expect(ef).toMatch(/salary_range/);
  });
  it("strips markdown fences before JSON parse", () => {
    expect(ef).toMatch(/replace.*```json|replace.*backtick|markdown.*fence/i);
  });
  it("validates signal_type against VALID_SIGNAL_TYPES", () => {
    expect(ef).toMatch(/VALID_SIGNAL_TYPES\.has/);
  });
  it("validates confidence is 0–1", () => {
    expect(ef).toMatch(/confidence.*<.*0|confidence.*>.*1/);
  });
  it("ensures interviewer_names is always an array", () => {
    expect(ef).toMatch(/Array\.isArray.*interviewer_names/);
  });
});

// ── Section 8: Anthropic API call ─────────────────────────────────────────
describe("Section 8: Anthropic API call", () => {
  it("calls /v1/messages endpoint", () => {
    expect(ef).toMatch(/api\.anthropic\.com\/v1\/messages/);
  });
  it("uses ANTHROPIC_API_KEY from env", () => {
    expect(ef).toMatch(/ANTHROPIC_API_KEY/);
    expect(ef).toMatch(/Deno\.env\.get.*ANTHROPIC_API_KEY/);
  });
  it("sets max_tokens to 400", () => {
    expect(ef).toMatch(/max_tokens.*400/);
  });
  it("handles non-ok Anthropic response", () => {
    expect(ef).toMatch(/!res\.ok|res\.status/);
  });
  it("throws descriptive error on Anthropic failure", () => {
    expect(ef).toMatch(/Anthropic API.*[0-9]/);
  });
  it("returns 503 when ANTHROPIC_API_KEY not configured", () => {
    expect(ef).toMatch(/503/);
    expect(ef).toMatch(/ANTHROPIC_API_KEY not configured/i);
  });
});

// ── Section 9: Inbox processing logic ────────────────────────────────────
describe("Section 9: Inbox processing logic", () => {
  it("processInboxItem function exists", () => {
    expect(ef).toMatch(/async function processInboxItem/);
  });
  it("fetches pending items with retry_count < 3", () => {
    expect(ef).toMatch(/classification_status.*pending/);
    expect(ef).toMatch(/retry_count.*3/);
  });
  it("limits query to BATCH_SIZE", () => {
    expect(ef).toMatch(/\.limit\(BATCH_SIZE\)/);
  });
  it("NONE signals mark inbox as skipped, no pipeline_signal insert", () => {
    expect(ef).toMatch(/classification_status.*skipped/);
  });
  it("marks inbox item as classified after success", () => {
    expect(ef).toMatch(/classification_status.*classified/);
    expect(ef).toMatch(/classified_at/);
  });
  it("increments retry_count on classification error", () => {
    expect(ef).toMatch(/retry_count.*\+.*1|retry_count.*increment/);
  });
  it("sets classification_status=error after retry_count >= 3", () => {
    expect(ef).toMatch(/newRetry >= 3|retry_count >= 3/i);
  });
});

// ── Section 10: pipeline_signals insert ──────────────────────────────────
describe("Section 10: pipeline_signals insert", () => {
  it("inserts into pipeline_signals table", () => {
    expect(ef).toMatch(/pipeline_signals.*insert/);
  });
  it("sets inbox_id FK column (S1)", () => {
    expect(ef).toMatch(/inbox_id.*item\.id/);
  });
  it("sets signal_type (S1)", () => {
    expect(ef).toMatch(/signal_type.*result\.signal_type/);
  });
  it("sets confidence_score (S1)", () => {
    expect(ef).toMatch(/confidence_score.*result\.confidence/);
  });
  it("sets confidence_level (S1)", () => {
    expect(ef).toMatch(/confidence_level.*confidenceLevel/);
  });
  it("sets extracted_fields (S1)", () => {
    expect(ef).toMatch(/extracted_fields.*result\.extracted_fields/);
  });
  it("sets proposed_stage via signalTypeToStage", () => {
    expect(ef).toMatch(/proposed_stage.*signalTypeToStage/);
  });
  it("signalTypeToStage maps INT → interview", () => {
    expect(ef).toMatch(/["']INT["'].*interview/);
  });
  it("signalTypeToStage maps OFFER → offer", () => {
    expect(ef).toMatch(/["']OFFER["'].*offer/);
  });
  it("signalTypeToStage maps REJ-PRE/REJ-POST → rejected", () => {
    expect(ef).toMatch(/["']REJ-PRE["'].*rejected/);
    expect(ef).toMatch(/["']REJ-POST["'].*rejected/);
  });
  it("sets status to pending_confirmation (S3 will update)", () => {
    expect(ef).toMatch(/status.*pending_confirmation/);
  });
  it("handles duplicate insert gracefully", () => {
    expect(ef).toMatch(/duplicate/);
  });
});

// ── Section 11: PostHog events ────────────────────────────────────────────
describe("Section 11: PostHog events", () => {
  it("capturePostHog helper defined", () => {
    expect(ef).toMatch(/function capturePostHog/);
  });
  it("emits pipeline_signal_classified event", () => {
    expect(ef).toMatch(/pipeline_signal_classified/);
  });
  it("emits classifier_batch_complete event", () => {
    expect(ef).toMatch(/classifier_batch_complete/);
  });
  it("emits classifier_error event on failure", () => {
    expect(ef).toMatch(/classifier_error/);
  });
  it("emits classifier_fatal_error on fatal failure", () => {
    expect(ef).toMatch(/classifier_fatal_error/);
  });
  it("classifier_batch_complete includes classified/skipped/errors counts", () => {
    expect(ef).toMatch(/classified.*skipped.*errors|errors.*classified/);
  });
});

// ── Section 12: pg_cron migration ─────────────────────────────────────────
describe("Section 12: pg_cron migration", () => {
  it("migration file exists", () => {
    expect(existsSync(MIGRATION)).toBe(true);
  });
  it("schedules classify-pipeline-signals cron", () => {
    expect(migration).toMatch(/classify-pipeline-signals/);
  });
  it("runs every 15 minutes", () => {
    expect(migration).toMatch(/\*\/15 \* \* \* \*/);
  });
  it("calls api-gateway classify-pipeline-signal route", () => {
    expect(migration).toMatch(/classify-pipeline-signal/);
  });
  it("uses idempotent unschedule+reschedule pattern", () => {
    expect(migration).toMatch(/cron\.unschedule/);
  });
});

// ── Section 13: Gateway route ─────────────────────────────────────────────
describe("Section 13: Gateway route #124", () => {
  it("classify-pipeline-signal route exists in gateway", () => {
    expect(gateway).toMatch(/classify-pipeline-signal/);
  });
  it("route count updated to 124", () => {
    expect(gateway).toMatch(/TOTAL: 124 routes/);
  });
  it("route comment references FB-PI-001-S2", () => {
    expect(gateway).toMatch(/FB-PI-001-S2.*124|#124.*FB-PI-001/);
  });
});
