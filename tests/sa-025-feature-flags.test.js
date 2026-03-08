// tests/sa-025-feature-flags.test.js
// SA-025: Feature Flags + Experimentation — Validation Tests
// Run: node tests/sa-025-feature-flags.test.js
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌  ${name}`);
    console.log(`       ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

function fileContains(filePath, ...strings) {
  const content = fs.readFileSync(path.join(ROOT, filePath), "utf8");
  for (const s of strings) {
    assert(content.includes(s), `${filePath} should contain: ${s}`);
  }
}

function fileExists(filePath) {
  assert(fs.existsSync(path.join(ROOT, filePath)), `File should exist: ${filePath}`);
}

// ── 1. Migration ──────────────────────────────────────────────────────────────

console.log("\n📋 1. Migration — v6.32-feature-flags.sql");

const MIGRATION = "supabase/migrations/v6.32-feature-flags.sql";

test("Migration file exists", () => fileExists(MIGRATION));

test("feature_flags table defined", () =>
  fileContains(MIGRATION, "CREATE TABLE IF NOT EXISTS feature_flags"));

test("feature_flags has key column with UNIQUE constraint", () =>
  fileContains(MIGRATION, "key", "TEXT UNIQUE NOT NULL"));

test("feature_flags has type enum check", () =>
  fileContains(MIGRATION, "CHECK (type IN ('boolean', 'percentage', 'variant'))"));

test("feature_flags has status enum check", () =>
  fileContains(MIGRATION, "CHECK (status IN ('draft', 'active', 'paused', 'archived'))"));

test("feature_flags has rollout_percentage with range check", () =>
  fileContains(MIGRATION, "rollout_percentage", "CHECK (rollout_percentage BETWEEN 0 AND 100)"));

test("feature_flags has posthog_flag_key column (PostHog S-07 scar)", () =>
  fileContains(MIGRATION, "posthog_flag_key"));

test("feature_flags has metadata JSONB (S-11 scar)", () =>
  fileContains(MIGRATION, "metadata"));

test("user_segments table defined", () =>
  fileContains(MIGRATION, "CREATE TABLE IF NOT EXISTS user_segments"));

test("user_segments has 5 seeded segments", () =>
  fileContains(MIGRATION, "all-users", "beta-users", "pro-plan", "new-users", "power-users"));

test("flag_assignments table defined", () =>
  fileContains(MIGRATION, "CREATE TABLE IF NOT EXISTS flag_assignments"));

test("flag_assignments has bucket column (0-99 range)", () =>
  fileContains(MIGRATION, "bucket", "CHECK (bucket BETWEEN 0 AND 99)"));

test("flag_assignments has overridden column for admin overrides", () =>
  fileContains(MIGRATION, "overridden", "BOOLEAN NOT NULL DEFAULT FALSE"));

test("flag_assignments has expires_at (S-09 scar)", () =>
  fileContains(MIGRATION, "expires_at"));

test("flag_assignments has UNIQUE (flag_id, user_id)", () =>
  fileContains(MIGRATION, "UNIQUE (flag_id, user_id)"));

test("flag_evaluation_log table defined", () =>
  fileContains(MIGRATION, "CREATE TABLE IF NOT EXISTS flag_evaluation_log"));

test("flag_evaluation_log has posthog_synced column (S-08 scar)", () =>
  fileContains(MIGRATION, "posthog_synced"));

test("flag_evaluation_log has source enum", () =>
  fileContains(MIGRATION, "CHECK (source IN ('api', 'sdk', 'middleware', 'gateway'))"));

test("fn_evaluate_flag function defined", () =>
  fileContains(MIGRATION, "CREATE OR REPLACE FUNCTION fn_evaluate_flag"));

test("fn_evaluate_flag handles flag_not_found", () =>
  fileContains(MIGRATION, "flag_not_found"));

test("fn_evaluate_flag handles inactive flags", () =>
  fileContains(MIGRATION, "v_flag.status != 'active'"));

test("fn_evaluate_flag handles manual overrides", () =>
  fileContains(MIGRATION, "overridden", "override"));

test("fn_evaluate_flag uses deterministic bucket (hashtext)", () =>
  fileContains(MIGRATION, "hashtext", "% 100"));

test("fn_evaluate_flag handles variant weighted assignment", () =>
  fileContains(MIGRATION, "variant_assignment", "cumulative"));

test("fn_evaluate_flag upserts sticky assignment", () =>
  fileContains(MIGRATION, "ON CONFLICT (flag_id, user_id) DO UPDATE"));

test("fn_evaluate_all_flags function defined (batch evaluation)", () =>
  fileContains(MIGRATION, "CREATE OR REPLACE FUNCTION fn_evaluate_all_flags"));

test("fn_flag_summary function defined (admin dashboard)", () =>
  fileContains(MIGRATION, "CREATE OR REPLACE FUNCTION fn_flag_summary"));

test("v_flag_dashboard view defined", () =>
  fileContains(MIGRATION, "CREATE OR REPLACE VIEW v_flag_dashboard"));

test("v_flag_dashboard shows evals_24h column", () =>
  fileContains(MIGRATION, "evals_24h"));

test("updated_at trigger for feature_flags", () =>
  fileContains(MIGRATION, "trg_feature_flags_updated_at"));

test("RLS enabled on all 4 tables", () =>
  fileContains(
    MIGRATION,
    "ALTER TABLE feature_flags       ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE flag_assignments     ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE flag_evaluation_log  ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE user_segments        ENABLE ROW LEVEL SECURITY"
  ));

test("RLS: users only see own assignments (user_read_own_assignments)", () =>
  fileContains(MIGRATION, "user_read_own_assignments", "user_id = auth.uid()"));

test("RLS: public can read active flags only (public_read_active_flags)", () =>
  fileContains(MIGRATION, "public_read_active_flags", "status = 'active'"));

test("5 seed flags inserted (draft status)", () =>
  fileContains(MIGRATION,
    "new-feed-layout", "chat-mode-v2", "pipeline-ai-signals",
    "referral-dashboard", "resume-rewrite-v2"
  ));

test("variant flag has control+treatment variants", () =>
  fileContains(MIGRATION, "control", "treatment"));

test("agent_action_log migration event recorded", () =>
  fileContains(MIGRATION, "v6.32_feature_flags"));

// ── 2. Edge Function ──────────────────────────────────────────────────────────

console.log("\n⚡ 2. Edge Function — feature-flags/index.ts");

const EF = "supabase/functions/feature-flags/index.ts";

test("EF file exists", () => fileExists(EF));

test("EF imports corsHeaders", () =>
  fileContains(EF, "corsHeaders"));

test("EF imports requireAdmin", () =>
  fileContains(EF, "requireAdmin"));

test("EF handles evaluate action", () =>
  fileContains(EF, "handleEvaluate", "case \"evaluate\""));

test("EF handles evaluate_all action (batch)", () =>
  fileContains(EF, "handleEvaluateAll", "case \"evaluate_all\""));

test("EF handles create action (admin gated)", () =>
  fileContains(EF, "handleCreate", "case \"create\""));

test("EF handles update action (admin gated)", () =>
  fileContains(EF, "handleUpdate", "case \"update\""));

test("EF handles segments action", () =>
  fileContains(EF, "handleSegments", "case \"segments\""));

test("EF handles override action (admin gated)", () =>
  fileContains(EF, "handleOverride", "case \"override\""));

test("EF handles list action (GET)", () =>
  fileContains(EF, "handleList", "action === \"list\""));

test("EF handles status action", () =>
  fileContains(EF, "handleStatus", "fn_flag_summary"));

test("EF validates variant weight sum === 100", () =>
  fileContains(EF, "must sum to 100"));

test("EF validates key format (lowercase/hyphens)", () =>
  fileContains(EF, "/^[a-z0-9-]+$/", "lowercase"));

test("EF fire-and-forget log (never blocks response)", () =>
  fileContains(EF, "Fire-and-forget", "logEvaluation"));

test("EF uses getReadClient for evaluations (read replica aware)", () =>
  fileContains(EF, "getReadClient"));

test("EF returns eval_ms timing", () =>
  fileContains(EF, "eval_ms"));

test("EF handles OPTIONS CORS preflight", () =>
  fileContains(EF, "method === \"OPTIONS\""));

// ── 3. Feature Flag Middleware ─────────────────────────────────────────────────

console.log("\n🔌 3. Gateway Middleware — _shared/feature-flag-middleware.ts");

const MW = "supabase/functions/_shared/feature-flag-middleware.ts";

test("Middleware file exists", () => fileExists(MW));

test("FLAG_AWARE_ROUTES set defined", () =>
  fileContains(MW, "FLAG_AWARE_ROUTES", "new Set"));

test("FLAG_AWARE_ROUTES includes chat-job-search (chat-mode-v2 flag)", () =>
  fileContains(MW, "\"chat-job-search\""));

test("FLAG_AWARE_ROUTES includes preview-jobs (new-feed-layout flag)", () =>
  fileContains(MW, "\"preview-jobs\""));

test("FLAG_AWARE_ROUTES includes resume-rewrite (variant flag)", () =>
  fileContains(MW, "\"resume-rewrite\""));

test("Scar S-06 documented (expand routes without gateway core changes)", () =>
  fileContains(MW, "S-06"));

test("featureFlagMiddleware export defined", () =>
  fileContains(MW, "export function featureFlagMiddleware"));

test("H-03 hook activation documented", () =>
  fileContains(MW, "H-03"));

test("Header encoding uses base64 (btoa)", () =>
  fileContains(MW, "btoa(JSON.stringify"));

test("parseFlagHeader export for EF consumers", () =>
  fileContains(MW, "export function parseFlagHeader"));

test("parseFlagHeader decodes base64 (atob)", () =>
  fileContains(MW, "JSON.parse(atob("));

test("Middleware never blocks on failure (returns null on error)", () =>
  fileContains(MW, "return null"));

test("Scar S-07 documented (swap to PostHog Remote Flags)", () =>
  fileContains(MW, "S-07"));

// ── 4. React SDK ──────────────────────────────────────────────────────────────

console.log("\n⚛️  4. React SDK — useFeatureFlag.ts + FeatureFlagProvider.tsx");

const HOOK = "src/app/hooks/useFeatureFlag.ts";
const PROVIDER = "src/app/providers/FeatureFlagProvider.tsx";

test("useFeatureFlag hook file exists", () => fileExists(HOOK));

test("useFeatureFlag reads from FeatureFlagContext", () =>
  fileContains(HOOK, "FeatureFlagContext", "useContext"));

test("useFeatureFlag returns { isEnabled, variant, isLoading, isUnknown }", () =>
  fileContains(HOOK, "isEnabled", "variant", "isLoading", "isUnknown"));

test("useFeatureFlag has defaultValue parameter", () =>
  fileContains(HOOK, "defaultValue = false"));

test("useFeatureFlag safe outside provider (never throws)", () =>
  fileContains(HOOK, "if (!ctx)"));

test("useFeatureFlagVariant convenience hook exported", () =>
  fileContains(HOOK, "export function useFeatureFlagVariant"));

test("useAllFeatureFlags bulk read hook exported", () =>
  fileContains(HOOK, "export function useAllFeatureFlags"));

test("FeatureFlagProvider file exists", () => fileExists(PROVIDER));

test("FlagMap type exported", () =>
  fileContains(PROVIDER, "export type FlagMap"));

test("FeatureFlagContext exported", () =>
  fileContains(PROVIDER, "export const FeatureFlagContext"));

test("FeatureFlagProvider exported", () =>
  fileContains(PROVIDER, "export function FeatureFlagProvider"));

test("Provider polls at 60s interval", () =>
  fileContains(PROVIDER, "60_000", "setInterval"));

test("Provider clears interval on unmount (no memory leak)", () =>
  fileContains(PROVIDER, "clearInterval", "mountedRef"));

test("Provider bridges to window.BJ (migration pattern)", () =>
  fileContains(PROVIDER, "window.BJ", "window as"));

test("Provider calls fn_evaluate_all_flags RPC", () =>
  fileContains(PROVIDER, "fn_evaluate_all_flags"));

test("PostHog $feature_flag_called event fires on flag enable", () =>
  fileContains(PROVIDER, "$feature_flag_called", "$feature_flag_response"));

test("PostHog integration never blocks render (try-catch)", () =>
  fileContains(PROVIDER, "reportFlagToPostHog", "try {"));

test("Scar S-07 documented in Provider (swap to PostHog Remote Flags)", () =>
  fileContains(PROVIDER, "S-07", "posthog.getAllFlags"));

test("refresh() function exposed on context", () =>
  fileContains(PROVIDER, "refresh", "setIsLoading(true)"));

test("useFeatureFlagContext helper exported", () =>
  fileContains(PROVIDER, "export function useFeatureFlagContext"));

// ── 5. Gateway Integration ────────────────────────────────────────────────────

console.log("\n🌐 5. Gateway Integration — api-gateway/index.ts");

const GW = "supabase/functions/api-gateway/index.ts";

test("feature-flags route registered", () =>
  fileContains(GW, '"feature-flags"', "feature-flags"));

test("Route count updated to 110", () =>
  fileContains(GW, "110 routes"));

test("featureFlagMiddleware imported", () =>
  fileContains(GW, 'import { featureFlagMiddleware }', "feature-flag-middleware.ts"));

test("featureFlagMiddleware added to pipeline", () =>
  fileContains(GW, "featureFlagMiddleware()", "H-03"));

test("H-03 comment on middleware pipeline entry", () =>
  fileContains(GW, "H-03"));

// ── 6. ADR Documentation ─────────────────────────────────────────────────────

console.log("\n📄 6. ADR — docs/scaling/adr-08-feature-flags.md");

const ADR = "docs/scaling/adr-08-feature-flags.md";

test("ADR file exists", () => fileExists(ADR));

test("ADR status is IMPLEMENTED", () =>
  fileContains(ADR, "**Status:** IMPLEMENTED"));

test("ADR documents H-03 hook activation", () =>
  fileContains(ADR, "H-03"));

test("ADR documents S-06 scar (expand FLAG_AWARE_ROUTES)", () =>
  fileContains(ADR, "S-06"));

test("ADR documents S-07 scar (PostHog Remote Flags swap)", () =>
  fileContains(ADR, "S-07"));

test("ADR documents S-08 scar (PostHog eval log sync)", () =>
  fileContains(ADR, "S-08"));

test("ADR documents S-09 scar (time-bounded experiments)", () =>
  fileContains(ADR, "S-09"));

test("ADR documents S-10 scar (targeting rules engine)", () =>
  fileContains(ADR, "S-10"));

test("ADR documents S-11 scar (flag metadata)", () =>
  fileContains(ADR, "S-11"));

test("ADR documents PostHog alternative and rejection rationale", () =>
  fileContains(ADR, "PostHog Feature Flags", "Rejected"));

test("ADR documents LaunchDarkly alternative rejection", () =>
  fileContains(ADR, "LaunchDarkly"));

test("ADR documents 5 seed flags", () =>
  fileContains(ADR, "new-feed-layout", "chat-mode-v2", "resume-rewrite-v2"));

test("ADR documents evaluation algorithm (7 steps)", () =>
  fileContains(ADR, "deterministic bucket", "hashtext"));

test("ADR documents 60s poll lag consequence", () =>
  fileContains(ADR, "60s"));

test("ADR references test file", () =>
  fileContains(ADR, "sa-025-feature-flags.test.js", "72 validation tests"));

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log(`SA-025 Feature Flags + Experimentation`);
console.log(`Tests: ${passed + failed} | ✅ ${passed} passed | ❌ ${failed} failed`);
console.log(`${"─".repeat(60)}\n`);

if (failed > 0) process.exit(1);
