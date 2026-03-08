/**
 * POC-04: Premium Search Feature Flag — H-03 + S-06 Validation
 *
 * HOOKS EXERCISED:
 *   H-03 (Feature Flag Gateway Injection) — flag evaluated per-request
 *   S-06 (FLAG_AWARE_ROUTES expansion) — new route added to flag-aware set
 *
 * PURPOSE: Proves a new feature can be flag-gated at the gateway level
 *          without changing the feature flag middleware itself. The EF
 *          receives the flag state via x-gateway-flags header and branches.
 *
 * ACTIVATION: Add route to FLAG_AWARE_ROUTES in feature-flag-middleware.ts,
 *             create flag in feature_flags table, deploy EF.
 *
 * SESSION: SA-029 (Hook Prototyping + Evolvability Baseline)
 * STATUS: POC — not deployed. Validates H-03 + S-06 interface contracts.
 */

// ─── Step 1: Create the feature flag (migration) ────────────────────────────

const MIGRATION_SQL = `
-- SA-029 POC-04: Premium search feature flag
INSERT INTO feature_flags (flag_key, flag_type, description, default_value, is_active, targeting_rules)
VALUES (
  'premium_search',
  'boolean',
  'Enables premium AI-powered search for paying users',
  'false',
  true,
  '{
    "rules": [
      {
        "conditions": [{ "attribute": "user_tier", "operator": "in", "values": ["premium", "enterprise"] }],
        "value": "true"
      }
    ],
    "default": "false"
  }'::JSONB
) ON CONFLICT (flag_key) DO NOTHING;
`;

// ─── Step 2: Add route to FLAG_AWARE_ROUTES (S-06 scar) ─────────────────────
//
// In supabase/functions/_shared/feature-flag-middleware.ts:
//
//   const FLAG_AWARE_ROUTES: Record<string, string[]> = {
//     "chat-job-search":    ["premium_search"],    // ← POC-04: add this line
//     "match-score-overlay": ["enhanced_matching"],
//     ...existing routes...
//   };
//
// S-06 contract: FLAG_AWARE_ROUTES is a plain object. Adding a key-value pair
// enables flag injection for that route. No middleware code changes needed.

// ─── Step 3: Read flag in the Edge Function ──────────────────────────────────

/**
 * Inside chat-job-search/index.ts, the flag is available via header:
 *
 *   const flagsHeader = req.headers.get("x-gateway-flags");
 *   const flags = flagsHeader ? JSON.parse(flagsHeader) : {};
 *   const isPremiumSearch = flags.premium_search === true;
 *
 *   if (isPremiumSearch) {
 *     // Use Anthropic Claude for semantic search reranking
 *     results = await semanticRerank(results, query);
 *   } else {
 *     // Standard Postgres FTS
 *     results = await postgresSearch(query);
 *   }
 *
 * H-03 contract: featureFlagMiddleware() evaluates all flags listed in
 * FLAG_AWARE_ROUTES for the matched route, then injects results as
 * x-gateway-flags JSON header. The EF reads it — zero coupling to the
 * flag evaluation engine.
 */

// ─── Step 4: Client-side flag awareness ──────────────────────────────────────
//
// The React SPA can also check flags via the flag-check EF:
//
//   const { data } = await supabase.functions.invoke('api-gateway', {
//     body: { route: 'flag-check', action: 'evaluate', flags: ['premium_search'] }
//   });
//   if (data.flags.premium_search) {
//     showPremiumSearchUI();
//   }
//
// This is separate from the gateway injection (H-03), which is server-side.
// Both paths use the same feature_flags table and targeting rules.

// ─── Step 5: Gradual rollout via targeting rules ─────────────────────────────
//
// To roll out to 10% of users:
//
//   UPDATE feature_flags SET targeting_rules = '{
//     "rules": [
//       { "conditions": [{ "attribute": "user_tier", "operator": "in", "values": ["premium"] }], "value": "true" },
//       { "conditions": [{ "attribute": "user_id", "operator": "percentage", "values": ["10"] }], "value": "true" }
//     ],
//     "default": "false"
//   }'::JSONB
//   WHERE flag_key = 'premium_search';

/**
 * HOOK VALIDATION CHECKLIST:
 * ✅ H-03: featureFlagMiddleware() evaluates flag for the route automatically
 * ✅ S-06: FLAG_AWARE_ROUTES expanded with one line — no middleware code changes
 * ✅ EF receives flag state via x-gateway-flags header (H-10 contract)
 * ✅ Targeting rules support user attributes (tier, percentage, custom)
 * ✅ Flag toggle via DB update — no deployment required
 * ✅ Client-side evaluation available via flag-check EF (separate path)
 *
 * SCARS LEVERAGED:
 * - S-06 (FLAG_AWARE_ROUTES) — route addition is the scar activation
 * - S-07 (PostHog Remote Flags) — when activated, replaces custom polling
 * - S-08 (posthog_synced) — experiment data sync ready
 * - S-09 (expires_at) — time-bounded experiment support ready
 */

export { MIGRATION_SQL };
