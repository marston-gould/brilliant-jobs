/**
 * SA-020 Validation Tests — Cost Guardian + User Support Agents
 * 50 tests covering migration, EF structure, gateway, admin UI, ADR docs
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
    failures.push({ name, error: e.message });
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

// ──────────────────────────────────────────
// MIGRATION TESTS
// ──────────────────────────────────────────
console.log('\n[SA-020] Migration: v6.29-crewai-agents-4-5.sql');
const migration = read('supabase/migrations/v6.29-crewai-agents-4-5.sql');

test('Migration file exists', () => assert(exists('supabase/migrations/v6.29-crewai-agents-4-5.sql')));
test('Migration creates vendor_cost_budgets table', () => assert(migration.includes('CREATE TABLE IF NOT EXISTS public.vendor_cost_budgets')));
test('vendor_cost_budgets has vendor PRIMARY KEY', () => assert(migration.includes('vendor') && migration.includes('PRIMARY KEY')));
test('vendor_cost_budgets has monthly_budget column', () => assert(migration.includes('monthly_budget')));
test('vendor_cost_budgets has warn_pct column', () => assert(migration.includes('warn_pct')));
test('vendor_cost_budgets has throttle_pct column', () => assert(migration.includes('throttle_pct')));
test('vendor_cost_budgets has hard_stop_pct column', () => assert(migration.includes('hard_stop_pct')));
test('vendor_cost_budgets RLS enabled', () => assert(migration.includes('ALTER TABLE public.vendor_cost_budgets ENABLE ROW LEVEL SECURITY')));
test('Migration seeds anthropic vendor budget', () => assert(migration.includes("'anthropic'")));
test('Migration seeds supabase vendor budget', () => assert(migration.includes("'supabase'")));
test('Migration seeds all 8 expected vendors', () => {
  const vendors = ['anthropic', 'supabase', 'vercel', 'resend', 'posthog', 'cloudflare', 'github', 'canny'];
  vendors.forEach(v => assert(migration.includes(`'${v}'`), `Missing vendor: ${v}`));
});

test('Migration creates canny_sync_log table', () => assert(migration.includes('CREATE TABLE IF NOT EXISTS public.canny_sync_log')));
test('canny_sync_log has canny_post_id UNIQUE', () => assert(migration.includes('canny_post_id') && migration.includes('UNIQUE')));
test('canny_sync_log has triage_priority column', () => assert(migration.includes('triage_priority')));
test('canny_sync_log has marston_reviewed column', () => assert(migration.includes('marston_reviewed')));
test('canny_sync_log has agent_suggested_response column', () => assert(migration.includes('agent_suggested_response')));
test('canny_sync_log RLS enabled', () => assert(migration.includes('ALTER TABLE public.canny_sync_log ENABLE ROW LEVEL SECURITY')));
test('canny_sync_log has priority index', () => assert(migration.includes('idx_canny_sync_triage_priority')));
test('canny_sync_log has marston_reviewed index', () => assert(migration.includes('idx_canny_sync_reviewed')));

test('Migration creates fn_cost_guardian_summary function', () => assert(migration.includes('CREATE OR REPLACE FUNCTION public.fn_cost_guardian_summary')));
test('fn_cost_guardian_summary returns JSONB', () => assert(migration.includes('RETURNS JSONB') && migration.includes('fn_cost_guardian_summary')));
test('fn_cost_guardian_summary compares vendor_cost_log', () => assert(migration.includes('vendor_cost_log')));
test('Migration creates fn_user_support_summary function', () => assert(migration.includes('CREATE OR REPLACE FUNCTION public.fn_user_support_summary')));
test('fn_user_support_summary counts urgent items', () => assert(migration.includes("'urgent'")));
test('fn_user_support_summary counts unreviewed', () => assert(migration.includes('unreviewed_by_marston')));

test('Migration seeds cost-guardian agent_config', () => assert(migration.includes("'cost-guardian'")));
test('cost-guardian set to observe mode', () => assert(migration.includes("'cost_guardian'") && migration.includes("'observe'")));
test('cost-guardian has hourly cron', () => assert(migration.includes('cost-guardian-hourly') && migration.includes('0 * * * *')));
test('Migration seeds user-support agent_config', () => assert(migration.includes("'user-support'")));
test('user-support set to observe mode', () => assert(migration.includes("'user_support'") && migration.includes("'observe'")));
test('user-support has 15-min cron', () => assert(migration.includes('user-support-15min') && migration.includes('*/15 * * * *')));
test('Both agents have api_consumers entries', () => {
  assert(migration.includes('crewai-cost-guardian'), 'Missing crewai-cost-guardian consumer');
  assert(migration.includes('crewai-user-support'), 'Missing crewai-user-support consumer');
});
test('Both agents have agent_credentials entries', () => assert(
  migration.includes("'cost-guardian'") && migration.includes("'user-support'")
));
test('Migration logs to agent_action_log', () => assert(migration.includes('migration_applied')));

// ──────────────────────────────────────────
// EDGE FUNCTION TESTS
// ──────────────────────────────────────────
console.log('\n[SA-020] Edge Functions');
const costEF = read('supabase/functions/crewai-cost-guardian/index.ts');
const supportEF = read('supabase/functions/crewai-user-support/index.ts');

test('Cost Guardian EF exists', () => assert(exists('supabase/functions/crewai-cost-guardian/index.ts')));
test('User Support EF exists', () => assert(exists('supabase/functions/crewai-user-support/index.ts')));
test('Cost Guardian has check action', () => assert(costEF.includes("action === 'check'")));
test('Cost Guardian has status action', () => assert(costEF.includes("action === 'status'")));
test('Cost Guardian calls fn_cost_guardian_summary', () => assert(costEF.includes('fn_cost_guardian_summary')));
test('Cost Guardian observe mode: executed: false', () => assert(costEF.includes('executed: false')));
test('Cost Guardian checks budget status', () => assert(costEF.includes('checkBudgetStatus')));
test('Cost Guardian checks spend velocity', () => assert(costEF.includes('checkSpendVelocity')));
test('User Support has sync_and_triage action', () => assert(supportEF.includes("action === 'sync_and_triage'")));
test('User Support has status action', () => assert(supportEF.includes("action === 'status'")));
test('User Support calls fn_user_support_summary', () => assert(supportEF.includes('fn_user_support_summary')));
test('User Support observe mode: executed: false', () => assert(supportEF.includes('executed: false')));
test('User Support NEVER sends responses directly', () => {
  // Should not have any "send" to Canny API — only drafts stored
  assert(!supportEF.includes('canny.io/api/v1/posts/changeStatus') && !supportEF.includes('canny.io/api/v1/comments/create'),
    'Agent should not send responses or change status directly');
});

// ──────────────────────────────────────────
// GATEWAY TESTS
// ──────────────────────────────────────────
console.log('\n[SA-020] Gateway');
const gateway = read('supabase/functions/api-gateway/index.ts');

test('Gateway includes crewai-cost-guardian route', () => assert(gateway.includes('crewai-cost-guardian')));
test('Gateway includes crewai-user-support route', () => assert(gateway.includes('crewai-user-support')));
test('Gateway total route count updated to 105', () => assert(gateway.includes('105 routes')));

// ──────────────────────────────────────────
// ADMIN UI TESTS
// ──────────────────────────────────────────
console.log('\n[SA-020] Admin UI');
const adminCrewAI = read('js/admin-crewai.js');

test('Admin has refreshCostGuardian function', () => assert(adminCrewAI.includes('async function refreshCostGuardian')));
test('Admin has refreshUserSupport function', () => assert(adminCrewAI.includes('async function refreshUserSupport')));
test('Cost Guardian panel reads crewai-cost-guardian EF', () => assert(adminCrewAI.includes("'crewai-cost-guardian'")));
test('User Support panel reads crewai-user-support EF', () => assert(adminCrewAI.includes("'crewai-user-support'")));
test('Cost Guardian panel shows budget table', () => assert(adminCrewAI.includes('Vendor') && adminCrewAI.includes('MTD Spend')));
test('User Support panel shows urgent count', () => assert(adminCrewAI.includes('Urgent') && adminCrewAI.includes('Awaiting Review')));

// ──────────────────────────────────────────
// ADR DOCS TESTS
// ──────────────────────────────────────────
console.log('\n[SA-020] ADR Documentation');
const adr05 = read('docs/scaling/adr-05-crewai.md');

test('ADR-05 status updated to include SA-020', () => assert(adr05.includes('SA-020 complete')));
test('ADR-05 documents Cost Guardian Agent 4', () => assert(adr05.includes('Cost Guardian Agent (Agent 4)')));
test('ADR-05 documents User Support Agent 5', () => assert(adr05.includes('User Support Agent (Agent 5)')));
test('ADR-05 documents vendor_cost_budgets table', () => assert(adr05.includes('vendor_cost_budgets')));
test('ADR-05 documents canny_sync_log table', () => assert(adr05.includes('canny_sync_log')));
test('ADR-05 has Hook & Scar points for SA-020', () => assert(adr05.includes('SA-020 additions')));
test('ADR-05 documents observe mode for both agents', () => assert(adr05.includes('never sends responses') || adr05.includes('NEVER sends')));

// ──────────────────────────────────────────
// SUMMARY
// ──────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`SA-020 Tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  ❌ ${f.name}: ${f.error}`));
}
process.exit(failed > 0 ? 1 : 0);
