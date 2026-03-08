/**
 * BI-01 Validation Tests — Build Instrumentation & Deployment Visibility
 *
 * Sections:
 *   1. Migration structure (tables, indexes, RLS, views, functions, cron)
 *   2. Edge Function structure (actions, auth, error handling)
 *   3. Gateway route (#110)
 *   4. Admin dashboard (container, script, rendering functions)
 *   5. Team manifest (pairing assignment)
 *   6. File inventory
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(f) {
  return fs.readFileSync(path.join(ROOT, f), 'utf8');
}

function exists(f) {
  return fs.existsSync(path.join(ROOT, f));
}

// ════════════════════════════════════════════════════════════════════════
// Section 1: Migration Structure
// ════════════════════════════════════════════════════════════════════════

describe('BI-01 Migration (v6.34-deploy-tracker.sql)', () => {
  const sql = read('supabase/migrations/v6.34-deploy-tracker.sql');

  test('creates deploy_events table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS deploy_events');
    expect(sql).toContain("surface");
    expect(sql).toContain("environment");
    expect(sql).toContain("status");
    expect(sql).toContain("git_sha");
    expect(sql).toContain("product_version");
    expect(sql).toContain("duration_ms");
    expect(sql).toContain("metadata");
  });

  test('creates build_events table with deploy_id FK', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS build_events');
    expect(sql).toContain('REFERENCES deploy_events(id) ON DELETE CASCADE');
    expect(sql).toContain("step_name");
    expect(sql).toContain("output_size_kb");
  });

  test('creates deploy_health_log table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS deploy_health_log');
    expect(sql).toContain("check_type");
    expect(sql).toContain("metric_value");
    expect(sql).toContain("threshold");
  });

  test('creates required indexes', () => {
    expect(sql).toContain('idx_deploy_events_surface_created');
    expect(sql).toContain('idx_deploy_events_status');
    expect(sql).toContain('idx_deploy_events_env_created');
    expect(sql).toContain('idx_build_events_deploy_id');
    expect(sql).toContain('idx_deploy_health_deploy_id');
    expect(sql).toContain('idx_deploy_events_git_sha');
  });

  test('enables RLS on all tables', () => {
    expect(sql).toContain('ALTER TABLE deploy_events ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE build_events ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE deploy_health_log ENABLE ROW LEVEL SECURITY');
  });

  test('creates admin read policies', () => {
    expect(sql).toContain('deploy_events_admin_read');
    expect(sql).toContain('build_events_admin_read');
    expect(sql).toContain('deploy_health_admin_read');
  });

  test('creates service role write policies', () => {
    expect(sql).toContain('deploy_events_service_write');
    expect(sql).toContain('build_events_service_write');
    expect(sql).toContain('deploy_health_service_write');
  });

  test('creates v_deploy_dashboard view', () => {
    expect(sql).toContain('CREATE OR REPLACE VIEW v_deploy_dashboard');
    expect(sql).toContain('build_step_count');
    expect(sql).toContain('failed_steps');
    expect(sql).toContain('critical_health_checks');
  });

  test('creates v_surface_deploy_health view', () => {
    expect(sql).toContain('CREATE OR REPLACE VIEW v_surface_deploy_health');
    expect(sql).toContain('success_rate_pct');
    expect(sql).toContain('avg_duration_ms');
    expect(sql).toContain('latest_version');
  });

  test('creates fn_deploy_summary function', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION fn_deploy_summary');
    expect(sql).toContain('p_days integer');
    expect(sql).toContain('daily_counts');
    expect(sql).toContain('surfaces');
  });

  test('creates fn_record_deploy function', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION fn_record_deploy');
    expect(sql).toContain('p_surface text');
    expect(sql).toContain('RETURNING id INTO v_id');
  });

  test('creates fn_complete_deploy function', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION fn_complete_deploy');
    expect(sql).toContain('p_deploy_id uuid');
    expect(sql).toContain('p_status text');
  });

  test('schedules weekly cleanup cron', () => {
    expect(sql).toContain('cleanup-deploy-events-90d');
    expect(sql).toContain("interval '90 days'");
  });

  test('seeds initial deploy event', () => {
    expect(sql).toContain("'BI-01: Deploy tracker migration'");
  });

  test('logs to agent_action_log', () => {
    expect(sql).toContain('deploy_tracker_migration');
    expect(sql).toContain('agent_action_log');
  });

  test('surface CHECK constraint includes all surfaces', () => {
    const surfaces = ['dashboard', 'admin', 'extension', 'landing', 'edge-functions', 'migrations', 'css', 'spa', 'infrastructure'];
    surfaces.forEach(s => {
      expect(sql).toContain("'" + s + "'");
    });
  });

  test('metadata column uses jsonb (S-12 scar pattern)', () => {
    const metadataCount = (sql.match(/metadata\s+jsonb/gi) || []).length;
    expect(metadataCount).toBeGreaterThanOrEqual(3); // deploy_events, build_events, deploy_health_log
  });
});

// ════════════════════════════════════════════════════════════════════════
// Section 2: Edge Function Structure
// ════════════════════════════════════════════════════════════════════════

describe('BI-01 Edge Function (deploy-tracker)', () => {
  const ef = read('supabase/functions/deploy-tracker/index.ts');

  test('file exists', () => {
    expect(exists('supabase/functions/deploy-tracker/index.ts')).toBe(true);
  });

  test('imports required modules', () => {
    expect(ef).toContain('import { serve }');
    expect(ef).toContain('import { createClient }');
    expect(ef).toContain('import { API_VERSION }');
    expect(ef).toContain('import { createLogger }');
  });

  test('handles CORS OPTIONS', () => {
    expect(ef).toContain('OPTIONS');
    expect(ef).toContain('CORS_HEADERS');
  });

  test('supports summary action', () => {
    expect(ef).toContain("action === \"summary\"");
    expect(ef).toContain('fn_deploy_summary');
  });

  test('supports list action', () => {
    expect(ef).toContain("action === \"list\"");
    expect(ef).toContain('v_deploy_dashboard');
  });

  test('supports record action', () => {
    expect(ef).toContain("action === \"record\"");
    expect(ef).toContain('fn_record_deploy');
  });

  test('supports complete action', () => {
    expect(ef).toContain("action === \"complete\"");
    expect(ef).toContain('fn_complete_deploy');
  });

  test('supports record-build-step action', () => {
    expect(ef).toContain("action === \"record-build-step\"");
    expect(ef).toContain('build_events');
  });

  test('supports health action', () => {
    expect(ef).toContain("action === \"health\"");
    expect(ef).toContain('deploy_health_log');
  });

  test('admin auth required for summary/list', () => {
    expect(ef).toContain("action === \"summary\" || action === \"list\"");
    expect(ef).toContain("Admin access required");
  });

  test('deploy key auth for CI webhook actions', () => {
    expect(ef).toContain('x-deploy-key');
    expect(ef).toContain('DEPLOY_TRACKER_KEY');
  });

  test('validates required fields on complete', () => {
    expect(ef).toContain("deploy_id required");
  });

  test('has error handling wrapper', () => {
    expect(ef).toContain('catch (err: unknown)');
    expect(ef).toContain('Internal server error');
  });
});

// ════════════════════════════════════════════════════════════════════════
// Section 3: Gateway Route
// ════════════════════════════════════════════════════════════════════════

describe('BI-01 Gateway Route', () => {
  const gw = read('supabase/functions/api-gateway/index.ts');

  test('deploy-tracker route registered', () => {
    expect(gw).toContain('"deploy-tracker"');
  });

  test('BI-01 comment present', () => {
    expect(gw).toContain('BI-01');
  });

  test('total routes updated to 110', () => {
    expect(gw).toContain('TOTAL: 110 routes');
  });
});

// ════════════════════════════════════════════════════════════════════════
// Section 4: Admin Dashboard
// ════════════════════════════════════════════════════════════════════════

describe('BI-01 Admin Dashboard (admin-deploy-tracker.js)', () => {
  const js = read('js/admin-deploy-tracker.js');

  test('file exists', () => {
    expect(exists('js/admin-deploy-tracker.js')).toBe(true);
  });

  test('has _deployAction API helper', () => {
    expect(js).toContain('function _deployAction');
    expect(js).toContain("'deploy-tracker'");
  });

  test('has refreshDeployTracker main render', () => {
    expect(js).toContain('async function refreshDeployTracker');
    expect(js).toContain("admin-page-deploy-tracker");
  });

  test('renders summary cards', () => {
    expect(js).toContain('Total (30d)');
    expect(js).toContain('Success Rate');
    expect(js).toContain('Avg Duration');
  });

  test('renders deploy frequency sparkline', () => {
    expect(js).toContain('function _deploySparkline');
    expect(js).toContain('polyline');
  });

  test('renders surface health table', () => {
    expect(js).toContain('Surface Health');
    expect(js).toContain('success_rate_pct');
  });

  test('renders recent deploys timeline', () => {
    expect(js).toContain('Recent Deploys');
    expect(js).toContain('_statusBadge');
  });

  test('has duration formatter', () => {
    expect(js).toContain('function _fmtDuration');
  });

  test('has time-ago formatter', () => {
    expect(js).toContain('function _fmtTimeAgo');
  });

  test('has status badge renderer', () => {
    expect(js).toContain('function _statusBadge');
    expect(js).toContain("'success'");
    expect(js).toContain("'failed'");
    expect(js).toContain("'rolled-back'");
  });

  test('has auto-refresh polling (120s)', () => {
    expect(js).toContain('120000');
  });

  test('calls reportError on failure', () => {
    expect(js).toContain("reportError('admin_deploy_tracker'");
  });
});

describe('BI-01 Admin HTML Integration', () => {
  const html = read('admin.html');

  test('deploy tracker container exists', () => {
    expect(html).toContain('id="admin-page-deploy-tracker"');
    expect(html).toContain('admin-panel-deploy-tracker');
  });

  test('deploy tracker script tag present', () => {
    expect(html).toContain('admin-deploy-tracker.js');
  });

  test('BI-01 comment in HTML', () => {
    expect(html).toContain('BI-01');
  });
});

// ════════════════════════════════════════════════════════════════════════
// Section 5: Team Manifest
// ════════════════════════════════════════════════════════════════════════

describe('BI-01 Team Manifest', () => {
  const manifest = read('docs/scaling/pod-team-manifest.md');

  test('BI-01 pairing assignment present', () => {
    expect(manifest).toContain('BI-01');
  });

  test('all 5 hook-and-scar roles present', () => {
    expect(manifest).toContain('Chief Architect');
    expect(manifest).toContain('Lead Platform Engineer');
    expect(manifest).toContain('System Architect');
    expect(manifest).toContain('Forward-Looking Developer');
    expect(manifest).toContain('Evolvability Strategist');
  });
});

// ════════════════════════════════════════════════════════════════════════
// Section 6: File Inventory
// ════════════════════════════════════════════════════════════════════════

describe('BI-01 File Inventory', () => {
  const expectedFiles = [
    'supabase/migrations/v6.34-deploy-tracker.sql',
    'supabase/functions/deploy-tracker/index.ts',
    'js/admin-deploy-tracker.js',
    'tests/bi-001-deploy-tracker.test.js',
  ];

  expectedFiles.forEach(f => {
    test(f + ' exists', () => {
      expect(exists(f)).toBe(true);
    });
  });
});
