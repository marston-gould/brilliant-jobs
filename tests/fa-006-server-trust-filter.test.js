/**
 * FA-006: Server-Side Trust/AI Filter — Validation Tests
 * 
 * Validates that:
 * 1. Migration creates feature flag and updates search_jobs_multi
 * 2. Trust filter labels map correctly to fraud_label WHERE clauses
 * 3. AI filter labels map correctly to ai_label WHERE clauses  
 * 4. NULL handling: unscored jobs (no AI row) included when 'unscored' selected
 * 5. NULL handling: unknown jobs (no fraud row) included when 'unknown' selected
 * 6. Badge data (fraud/AI columns) returned in results for rendering
 * 7. Client-side applyTrustFilter/applyAiContentFilter skipped when flag on
 * 8. Client-side fetchFraudScores/fetchAiJdScores skipped when flag on  
 * 9. Single-filter routes through RPC when trust/AI filters active
 * 10. Feature flag fallback: client-side path works when flag off
 * 11. content_type bug fix: 'jd' instead of 'job_description'
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.error(`  ❌ ${msg}`);
  }
}

// ── Section 1: Migration file structure ──────────────────

console.log('\n══ Section 1: Migration Structure ══');

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', 'v6.43-fa006-server-trust-filter.sql');
const migration = fs.readFileSync(migrationPath, 'utf-8');

assert(migration.includes("'feed_server_trust_filter'"), 'Feature flag ID is feed_server_trust_filter');
assert(migration.includes('enabled = true'), 'Feature flag enabled by default');
assert(migration.includes('rollout_pct'), 'Feature flag has rollout percentage');
assert(migration.includes('ON CONFLICT (id) DO UPDATE'), 'Feature flag uses upsert pattern');

// ── Section 2: search_jobs_multi signature ──────────────

console.log('\n══ Section 2: Function Signature ══');

assert(migration.includes('p_trust_labels text[] DEFAULT NULL'), 'Function accepts p_trust_labels with NULL default');
assert(migration.includes('p_ai_labels text[] DEFAULT NULL'), 'Function accepts p_ai_labels with NULL default');
assert(migration.includes('SECURITY INVOKER'), 'Function uses SECURITY INVOKER');
assert(migration.includes("statement_timeout = '10s'"), 'Statement timeout preserved at 10s');

// ── Section 3: Trust filter WHERE clause ────────────────

console.log('\n══ Section 3: Trust Filter SQL ══');

assert(migration.includes('job_fraud_scores jfs'), 'References job_fraud_scores table');
assert(migration.includes('jfs.job_id = a.greenhouse_id'), 'Joins on job_id = greenhouse_id');
assert(migration.includes("jfs.fraud_label = ANY"), 'Filters by fraud_label array membership');
assert(
  migration.includes("'unknown' = ANY(p_trust_labels)") && 
  migration.includes('NOT EXISTS'),
  'Unknown label includes jobs without fraud scores (NULL handling)'
);

// ── Section 4: AI content filter WHERE clause ───────────

console.log('\n══ Section 4: AI Filter SQL ══');

assert(migration.includes('content_ai_scores cas'), 'References content_ai_scores table');
assert(migration.includes("cas.content_type = ''jd''"), 'Filters by content_type = jd (not job_description)');
assert(migration.includes('cas.content_id = a.greenhouse_id'), 'Joins on content_id = greenhouse_id');
assert(migration.includes("cas.ai_label = ANY"), 'Filters by ai_label array membership');
assert(
  migration.includes("'unscored' = ANY(p_ai_labels)"),
  'Handles unscored → unknown/NULL mapping'
);
assert(migration.includes("'human_written'"), 'Handles legacy human_written label');
assert(migration.includes("'mixed_content'"), 'Handles legacy mixed_content label');

// ── Section 5: Badge data in results ────────────────────

console.log('\n══ Section 5: Badge Data Return ══');

assert(migration.includes('_fraud_score'), 'Returns fraud_score in results');
assert(migration.includes('_fraud_label'), 'Returns fraud_label in results');
assert(migration.includes('_fraud_confidence'), 'Returns fraud confidence in results');
assert(migration.includes('_fraud_signals'), 'Returns fraud signals in results');
assert(migration.includes('_ai_label'), 'Returns ai_label in results');
assert(migration.includes('_ai_score'), 'Returns ai_generated_score in results');
assert(migration.includes('_ai_confidence'), 'Returns ai confidence in results');
assert(migration.includes('_ai_summary'), 'Returns ai summary in results');
assert(migration.includes('_ai_perplexity'), 'Returns perplexity score in results');
assert(migration.includes('_ai_burstiness'), 'Returns burstiness score in results');
assert(migration.includes('LEFT JOIN LATERAL'), 'Uses LEFT JOIN LATERAL for most recent score');
assert(migration.includes('ORDER BY scored_at DESC LIMIT 1'), 'Takes most recent score per job');

// ── Section 6: GRANT and backwards compatibility ────────

console.log('\n══ Section 6: Permissions & Compatibility ══');

assert(migration.includes('GRANT EXECUTE'), 'Grants execute to authenticated');
assert(migration.includes("text[], text[])"), 'Grant includes new parameter types');
assert(migration.includes('DEFAULT NULL'), 'New params have NULL defaults for backwards compat');

// ── Section 7: job-feed.js client changes ───────────────

console.log('\n══ Section 7: job-feed.js Changes ══');

const feedPath = path.join(__dirname, '..', 'js', 'job-feed.js');
const feed = fs.readFileSync(feedPath, 'utf-8');

assert(feed.includes('_serverTrustFilterEnabled = false'), 'Declares _serverTrustFilterEnabled flag');
assert(feed.includes("feed_server_trust_filter"), 'Checks feed_server_trust_filter feature flag');
assert(feed.includes('_needsServerTrustFilter'), 'Computes _needsServerTrustFilter from trust+AI active state');
assert(feed.includes('_rpcTrustLabels'), 'Builds trust label array for RPC');
assert(feed.includes('_rpcAiLabels'), 'Builds AI label array for RPC');

// Single-filter routing
assert(
  feed.includes('filtersToRun.length === 1 && !_needsServerTrustFilter'),
  'Single-filter routes through RPC when trust/AI filter active'
);
assert(
  feed.includes('_serverMergeEnabled || _needsServerTrustFilter'),
  'RPC path triggers for server merge OR server trust filter'
);

// RPC params
assert(feed.includes('p_trust_labels: _rpcTrustLabels'), 'Passes trust labels to RPC');
assert(feed.includes('p_ai_labels: _rpcAiLabels'), 'Passes AI labels to RPC');

// Cache population
assert(feed.includes('_fraudScoreCache[job.greenhouse_id] = {'), 'Populates fraud cache from RPC results');
assert(feed.includes('_aiJdScoreCache[job.greenhouse_id] = {'), 'Populates AI cache from RPC results');

// Skip client-side
assert(
  feed.includes('if (!_serverTrustFilterEnabled) {\n      await fetchFraudScores'),
  'Skips fetchFraudScores when server filter on'
);
assert(
  feed.includes('if (!_serverTrustFilterEnabled) {\n      await fetchAiJdScores'),
  'Skips fetchAiJdScores when server filter on'
);
assert(
  feed.includes('!_serverTrustFilterEnabled && isTrustFilterActive()'),
  'Skips client-side applyTrustFilter when server filter on'
);
assert(
  feed.includes('!_serverTrustFilterEnabled && isAiFilterActive()'),
  'Skips client-side applyAiContentFilter when server filter on'
);

// PostHog
assert(
  feed.includes('server_trust_filter_enabled: _serverTrustFilterEnabled'),
  'PostHog event includes server_trust_filter_enabled property'
);

// content_type bug fix
assert(
  !feed.includes(".eq('content_type', 'job_description')"),
  'content_type bug fixed: no longer uses job_description'
);
assert(
  feed.includes(".eq('content_type', 'jd')"),
  'content_type correctly uses jd'
);

// Cleanup of internal fields
assert(feed.includes('delete job._fraud_score'), 'Cleans up _fraud_score from job objects');
assert(feed.includes('delete job._ai_label'), 'Cleans up _ai_label from job objects');

// ── Section 8: useFeedSearch.ts SPA parity ──────────────

console.log('\n══ Section 8: SPA Parity ══');

const spaPath = path.join(__dirname, '..', 'src', 'app', 'pages', 'dashboard', 'feed', 'hooks', 'useFeedSearch.ts');
const spa = fs.readFileSync(spaPath, 'utf-8');

assert(spa.includes("feed_server_trust_filter"), 'SPA checks feed_server_trust_filter flag');
assert(spa.includes('needsServerTrustFilter'), 'SPA computes needsServerTrustFilter');
assert(spa.includes('rpcTrustLabels'), 'SPA builds trust label array');
assert(spa.includes('rpcAiLabels'), 'SPA builds AI label array');
assert(spa.includes('p_trust_labels: rpcTrustLabels'), 'SPA passes trust labels to RPC');
assert(spa.includes('p_ai_labels: rpcAiLabels'), 'SPA passes AI labels to RPC');
assert(
  spa.includes('!needsServerTrustFilter'),
  'SPA single-filter routes through RPC when trust filter active'
);
assert(
  spa.includes('serverMergeEnabled || needsServerTrustFilter'),
  'SPA RPC path triggers for merge OR trust filter'
);
assert(
  spa.includes('!serverTrustEnabled && state.trustFilters.size < ALL_TRUST.size'),
  'SPA skips client-side trust filter when server flag on'
);
assert(
  spa.includes('!serverTrustEnabled && state.aiFilters.size < ALL_AI.size'),
  'SPA skips client-side AI filter when server flag on'
);
assert(spa.includes('fraudCache[job.greenhouse_id]'), 'SPA populates fraud cache from results');
assert(spa.includes('aiCache[job.greenhouse_id]'), 'SPA populates AI cache from results');

// ── Section 9: SQL injection prevention ─────────────────

console.log('\n══ Section 9: SQL Injection Prevention ══');

assert(migration.includes("format("), 'Uses format() for parameterized SQL');
assert(migration.includes("%L"), 'Uses %L (literal) quoting for user input');
assert(migration.includes('v_allowed_sorts'), 'Sort column whitelist preserved');
assert(!migration.includes("' || v_val"), 'No raw user input concatenation in WHERE clauses');

// ── Section 10: Performance considerations ──────────────

console.log('\n══ Section 10: Performance ══');

assert(migration.includes('EXISTS (SELECT 1'), 'Uses EXISTS for filtering (no JOIN duplication)');
assert(migration.includes('_enriched'), 'Uses enrichment CTE for badge data after dedup');
assert(
  migration.includes('LEFT JOIN LATERAL') && migration.includes('LIMIT 1'),
  'LATERAL JOIN with LIMIT 1 for single fraud/AI row per job'
);
assert(migration.includes('idx_fraud_scores_label') || migration.includes('fraud_label'), 
  'Trust filter can use fraud_label index');

// ── Section 11: Feature flag rollback ───────────────────

console.log('\n══ Section 11: Rollback Safety ══');

assert(feed.includes('_serverTrustFilterEnabled = false'), 'Flag defaults to false (safe fallback)');
assert(
  feed.includes("_serverTrustFilterEnabled = false;\n        // Re-run"),
  'RPC error disables flag and falls back to client-side'
);

// ══ Summary ═════════════════════════════════════════════

console.log('\n══════════════════════════════════════');
console.log(`FA-006 Validation: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
console.log('══════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
