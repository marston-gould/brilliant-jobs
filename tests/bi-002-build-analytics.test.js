/**
 * BI-02 Build Analytics Validation Tests
 * Tests: migration, EF actions, admin panel, ADMIN_SUBPAGE_MAP entry
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    results.push(`  ❌ ${name}: ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ═══════════════════════════════════════════════════════════════════
// Section 1: Migration (v6.35-build-analytics.sql)
// ═══════════════════════════════════════════════════════════════════

const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', 'v6.35-build-analytics.sql'), 'utf-8');

test('Migration: file exists and is non-empty', () => {
  assert(migration.length > 100, 'Migration too short');
});

test('Migration: creates ci_workflow_runs table', () => {
  assert(migration.includes('CREATE TABLE IF NOT EXISTS ci_workflow_runs'), 'Missing ci_workflow_runs');
});

test('Migration: ci_workflow_runs has workflow_name column', () => {
  assert(migration.includes('workflow_name   text NOT NULL'), 'Missing workflow_name');
});

test('Migration: ci_workflow_runs has run_id column (GitHub Actions reference)', () => {
  assert(migration.includes('run_id          bigint'), 'Missing run_id');
});

test('Migration: ci_workflow_runs has status check constraint', () => {
  assert(migration.includes("('pending','in_progress','completed','cancelled','timed_out')"), 'Missing status constraint');
});

test('Migration: ci_workflow_runs has conclusion check constraint', () => {
  assert(migration.includes("('success','failure','cancelled','skipped','timed_out','action_required'"), 'Missing conclusion constraint');
});

test('Migration: ci_workflow_runs has deploy_id FK to deploy_events', () => {
  assert(migration.includes('deploy_id       uuid REFERENCES deploy_events(id)'), 'Missing deploy_id FK');
});

test('Migration: ci_workflow_runs has S-12 scar (metadata jsonb)', () => {
  assert(/ci_workflow_runs[\s\S]*metadata\s+jsonb/.test(migration), 'Missing metadata scar on ci_workflow_runs');
});

test('Migration: creates bundle_size_history table', () => {
  assert(migration.includes('CREATE TABLE IF NOT EXISTS bundle_size_history'), 'Missing bundle_size_history');
});

test('Migration: bundle_size_history has surface constraint (9 types)', () => {
  assert(migration.includes("surface         text NOT NULL CHECK"), 'Missing surface constraint');
});

test('Migration: bundle_size_history has bundle_name column', () => {
  assert(migration.includes('bundle_name     text NOT NULL'), 'Missing bundle_name');
});

test('Migration: bundle_size_history has size_bytes column', () => {
  assert(migration.includes('size_bytes      integer NOT NULL'), 'Missing size_bytes');
});

test('Migration: bundle_size_history has gzip_bytes column', () => {
  assert(migration.includes('gzip_bytes      integer'), 'Missing gzip_bytes');
});

test('Migration: bundle_size_history has S-12 scar (metadata jsonb)', () => {
  assert(/bundle_size_history[\s\S]*metadata\s+jsonb/.test(migration), 'Missing metadata scar on bundle_size_history');
});

// Indexes
test('Migration: idx_ci_workflow_runs_name_created', () => {
  assert(migration.includes('idx_ci_workflow_runs_name_created'), 'Missing workflow name+created index');
});

test('Migration: idx_ci_workflow_runs_status (partial)', () => {
  assert(migration.includes('idx_ci_workflow_runs_status'), 'Missing status index');
});

test('Migration: idx_ci_workflow_runs_conclusion', () => {
  assert(migration.includes('idx_ci_workflow_runs_conclusion'), 'Missing conclusion index');
});

test('Migration: idx_bundle_size_surface_created', () => {
  assert(migration.includes('idx_bundle_size_surface_created'), 'Missing bundle surface+created index');
});

test('Migration: idx_bundle_size_bundle_name', () => {
  assert(migration.includes('idx_bundle_size_bundle_name'), 'Missing bundle_name index');
});

// RLS
test('Migration: RLS enabled on ci_workflow_runs', () => {
  assert(migration.includes('ALTER TABLE ci_workflow_runs ENABLE ROW LEVEL SECURITY'), 'Missing ci_workflow_runs RLS');
});

test('Migration: RLS enabled on bundle_size_history', () => {
  assert(migration.includes('ALTER TABLE bundle_size_history ENABLE ROW LEVEL SECURITY'), 'Missing bundle_size_history RLS');
});

test('Migration: ci_workflow_runs admin read policy', () => {
  assert(migration.includes('ci_workflow_runs_admin_read'), 'Missing admin read policy');
});

test('Migration: bundle_size admin read policy', () => {
  assert(migration.includes('bundle_size_admin_read'), 'Missing admin read policy');
});

test('Migration: ci_workflow_runs service write policy', () => {
  assert(migration.includes('ci_workflow_runs_service_write'), 'Missing service write policy');
});

test('Migration: bundle_size service write policy', () => {
  assert(migration.includes('bundle_size_service_write'), 'Missing service write policy');
});

// Views
test('Migration: v_build_step_performance view', () => {
  assert(migration.includes('CREATE OR REPLACE VIEW v_build_step_performance'), 'Missing build step view');
});

test('Migration: v_build_step_performance has p95 percentile', () => {
  assert(migration.includes('percentile_cont(0.95)'), 'Missing p95 percentile');
});

test('Migration: v_bundle_size_trends view', () => {
  assert(migration.includes('CREATE OR REPLACE VIEW v_bundle_size_trends'), 'Missing bundle trends view');
});

test('Migration: v_bundle_size_trends calculates delta_bytes', () => {
  assert(migration.includes('delta_bytes'), 'Missing delta_bytes calculation');
});

test('Migration: v_ci_workflow_health view', () => {
  assert(migration.includes('CREATE OR REPLACE VIEW v_ci_workflow_health'), 'Missing CI workflow health view');
});

// Function
test('Migration: fn_build_analytics function', () => {
  assert(migration.includes('CREATE OR REPLACE FUNCTION fn_build_analytics'), 'Missing fn_build_analytics');
});

test('Migration: fn_build_analytics returns build_steps', () => {
  assert(migration.includes("'build_steps'"), 'Missing build_steps in function');
});

test('Migration: fn_build_analytics returns ci_workflows', () => {
  assert(migration.includes("'ci_workflows'"), 'Missing ci_workflows in function');
});

test('Migration: fn_build_analytics returns bundle_sizes', () => {
  assert(migration.includes("'bundle_sizes'"), 'Missing bundle_sizes in function');
});

test('Migration: fn_build_analytics returns bundle_trends', () => {
  assert(migration.includes("'bundle_trends'"), 'Missing bundle_trends in function');
});

test('Migration: fn_build_analytics returns bundle_regressions', () => {
  assert(migration.includes("'bundle_regressions'"), 'Missing bundle_regressions count');
});

// Cleanup cron
test('Migration: cleanup cron for build analytics', () => {
  assert(migration.includes('cleanup-build-analytics'), 'Missing cleanup cron');
});

test('Migration: cleanup retains 90 days', () => {
  assert(migration.includes("interval '90 days'"), 'Missing 90-day retention');
});

// ═══════════════════════════════════════════════════════════════════
// Section 2: Edge Function (deploy-tracker/index.ts)
// ═══════════════════════════════════════════════════════════════════

const ef = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'deploy-tracker', 'index.ts'), 'utf-8');

test('EF: header updated to include BI-02', () => {
  assert(ef.includes('BI-01 + BI-02'), 'Missing BI-02 header');
});

test('EF: build-analytics action documented', () => {
  assert(ef.includes('build-analytics'), 'Missing build-analytics action');
});

test('EF: build-analytics requires admin', () => {
  assert(ef.includes('"build-analytics"') && ef.includes('Admin access required'), 'build-analytics not admin-gated');
});

test('EF: build-analytics calls fn_build_analytics', () => {
  assert(ef.includes('fn_build_analytics'), 'Missing fn_build_analytics call');
});

test('EF: record-ci-run action handler exists', () => {
  assert(ef.includes('"record-ci-run"'), 'Missing record-ci-run handler');
});

test('EF: record-ci-run validates workflow_name', () => {
  assert(ef.includes('workflow_name required'), 'Missing workflow_name validation');
});

test('EF: record-ci-run inserts to ci_workflow_runs', () => {
  assert(ef.includes('"ci_workflow_runs"') && ef.includes('workflow_name'), 'Missing ci_workflow_runs insert');
});

test('EF: complete-ci-run action handler exists', () => {
  assert(ef.includes('"complete-ci-run"'), 'Missing complete-ci-run handler');
});

test('EF: complete-ci-run supports ci_run_id or run_id lookup', () => {
  assert(ef.includes('ci_run_id') && ef.includes('run_id'), 'Missing flexible lookup');
});

test('EF: record-bundle-size action handler exists', () => {
  assert(ef.includes('"record-bundle-size"'), 'Missing record-bundle-size handler');
});

test('EF: record-bundle-size validates required fields', () => {
  assert(ef.includes('surface required') && ef.includes('bundle_name required') && ef.includes('size_bytes required'), 'Missing field validation');
});

test('EF: record-bundle-size inserts to bundle_size_history', () => {
  assert(ef.includes('"bundle_size_history"'), 'Missing bundle_size_history insert');
});

test('EF: BI-02 write actions included in auth check', () => {
  assert(ef.includes('"record-ci-run"') && ef.includes('"complete-ci-run"') && ef.includes('"record-bundle-size"'), 'Missing BI-02 write actions in auth');
});

// ═══════════════════════════════════════════════════════════════════
// Section 3: Admin Panel (admin-build-analytics.js)
// ═══════════════════════════════════════════════════════════════════

const adminPanel = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin-build-analytics.js'), 'utf-8');

test('Admin panel: file exists and non-empty', () => {
  assert(adminPanel.length > 100, 'Panel too short');
});

test('Admin panel: calls build-analytics action via gateway', () => {
  assert(adminPanel.includes("'build-analytics'") && adminPanel.includes("'deploy-tracker'"), 'Missing gateway call');
});

test('Admin panel: refreshBuildAnalytics function exists', () => {
  assert(adminPanel.includes('function refreshBuildAnalytics'), 'Missing refresh function');
});

test('Admin panel: targets admin-page-build-analytics container', () => {
  assert(adminPanel.includes("'admin-page-build-analytics'"), 'Missing container target');
});

test('Admin panel: renders summary cards', () => {
  assert(adminPanel.includes('Build Steps') && adminPanel.includes('CI Runs') && adminPanel.includes('CI Success'), 'Missing summary cards');
});

test('Admin panel: renders build step performance table', () => {
  assert(adminPanel.includes('Build Step Performance'), 'Missing build step table');
});

test('Admin panel: shows step name, failure rate, avg, p95 columns', () => {
  assert(adminPanel.includes('step_name') && adminPanel.includes('failure_rate_pct') && adminPanel.includes('avg_duration_ms') && adminPanel.includes('p95_duration_ms'), 'Missing columns');
});

test('Admin panel: renders CI workflow health table', () => {
  assert(adminPanel.includes('CI Workflow Health'), 'Missing CI workflow table');
});

test('Admin panel: renders bundle sizes table', () => {
  assert(adminPanel.includes('Bundle Sizes'), 'Missing bundle sizes');
});

test('Admin panel: renders bundle size sparklines', () => {
  assert(adminPanel.includes('_baBundleSparkline'), 'Missing sparkline function');
});

test('Admin panel: shows bundle delta with color coding', () => {
  assert(adminPanel.includes('_baDelta'), 'Missing delta display');
});

test('Admin panel: renders recent CI runs timeline', () => {
  assert(adminPanel.includes('Recent CI Runs'), 'Missing CI runs timeline');
});

test('Admin panel: has empty state for no data', () => {
  assert(adminPanel.includes('No build data yet'), 'Missing empty state');
});

test('Admin panel: exports loadBuildAnalyticsPanel', () => {
  assert(adminPanel.includes('window.loadBuildAnalyticsPanel'), 'Missing global function export');
});

test('Admin panel: has 2-minute auto-refresh polling', () => {
  assert(adminPanel.includes('120000'), 'Missing 2min poll');
});

test('Admin panel: listens for admin-page-change events', () => {
  assert(adminPanel.includes("'admin-page-change'") && adminPanel.includes("'build-analytics'"), 'Missing page change listener');
});

test('Admin panel: size formatting helper handles bytes/KB/MB', () => {
  assert(adminPanel.includes('1024') && adminPanel.includes('1048576') && adminPanel.includes('KB') && adminPanel.includes('MB'), 'Missing size formatter');
});

test('Admin panel: conclusion badge with color coding', () => {
  assert(adminPanel.includes('_baConclusionBadge') && adminPanel.includes("'success': '#10b981'") && adminPanel.includes("'failure': '#ef4444'"), 'Missing conclusion badge');
});

// ═══════════════════════════════════════════════════════════════════
// Section 4: Admin Integration
// ═══════════════════════════════════════════════════════════════════

const adminJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin.js'), 'utf-8');
const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf-8');

test('Admin.js: build-analytics in ADMIN_SUBPAGE_MAP', () => {
  assert(adminJs.includes("'build-analytics'") && adminJs.includes('loadBuildAnalyticsPanel'), 'Missing subpage entry');
});

test('Admin.js: build-analytics in operations section', () => {
  assert(adminJs.includes("'build-analytics':{ section: 'operations'"), 'Not in operations section');
});

test('Admin.js: subpage count updated to 37', () => {
  assert(adminJs.includes('37 sub-pages'), 'Subpage count not updated');
});

test('Admin.html: build-analytics container exists', () => {
  assert(adminHtml.includes('admin-page-build-analytics'), 'Missing container div');
});

test('Admin.html: build-analytics panel exists', () => {
  assert(adminHtml.includes('admin-panel-build-analytics'), 'Missing panel div');
});

test('Admin.html: build-analytics script tag present', () => {
  assert(adminHtml.includes('admin-build-analytics.js'), 'Missing script tag');
});

// ═══════════════════════════════════════════════════════════════════
// Section 5: Pod Team Manifest
// ═══════════════════════════════════════════════════════════════════

const manifest = fs.readFileSync(path.join(__dirname, '..', 'docs', 'scaling', 'pod-team-manifest.md'), 'utf-8');

test('Manifest: BI-02 pairing assignment exists', () => {
  assert(manifest.includes('BI-02'), 'Missing BI-02 pairing');
});

test('Manifest: Chief Architect role present', () => {
  assert(manifest.includes('Chief Architect'), 'Missing Chief Architect');
});

test('Manifest: Lead Platform Engineer role present', () => {
  assert(manifest.includes('Lead Platform Engineer'), 'Missing Lead Platform Engineer');
});

test('Manifest: System Architect — Scalability role present', () => {
  assert(manifest.includes('System Architect'), 'Missing System Architect');
});

test('Manifest: Forward-Looking Developer(s) role present', () => {
  assert(manifest.includes('Forward-Looking Developer'), 'Missing Forward-Looking Dev');
});

test('Manifest: Evolvability Strategist role present', () => {
  assert(manifest.includes('Evolvability Strategist'), 'Missing Evolvability Strategist');
});

// ═══════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('BI-02 Build Analytics Validation Tests');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
results.forEach(r => console.log(r));
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

process.exit(failed > 0 ? 1 : 0);
