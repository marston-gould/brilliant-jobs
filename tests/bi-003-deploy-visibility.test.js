/**
 * bi-003-deploy-visibility.test.js
 * BI-03: Deployment Visibility System — Environment Status & Release Tracking
 *
 * Validates:
 *   1. Migration: environment_versions table, release_notes table, views, function, triggers
 *   2. Edge Function: 4 new BI-03 actions (deployment-visibility, release-history, update-environment, record-release)
 *   3. Admin Panel: admin-deploy-visibility.js structure and rendering
 *   4. Integration: admin.html wiring, ADMIN_SUBPAGE_MAP entry
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function fileExists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. Migration Tests (v6.36-deploy-visibility.sql)
// ══════════════════════════════════════════════════════════════════════════════

describe('BI-03 Migration — v6.36-deploy-visibility.sql', () => {
  const sql = readFile('supabase/migrations/v6.36-deploy-visibility.sql');

  test('migration file exists', () => {
    expect(fileExists('supabase/migrations/v6.36-deploy-visibility.sql')).toBe(true);
  });

  // ── environment_versions table ─────────────────────────────────────────
  describe('environment_versions table', () => {
    test('creates table', () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS environment_versions/i);
    });

    test('has uuid primary key', () => {
      expect(sql).toMatch(/id\s+uuid\s+DEFAULT\s+gen_random_uuid\(\)\s+PRIMARY KEY/i);
    });

    test('has surface column with CHECK constraint', () => {
      expect(sql).toMatch(/surface\s+text\s+NOT NULL\s+CHECK/i);
    });

    test('has environment column with CHECK constraint', () => {
      expect(sql).toMatch(/environment\s+text\s+NOT NULL/i);
    });

    test('has product_version column', () => {
      expect(sql).toMatch(/product_version\s+text/i);
    });

    test('has git_sha column', () => {
      expect(sql).toMatch(/git_sha\s+text/i);
    });

    test('has git_tag column', () => {
      expect(sql).toMatch(/git_tag\s+text/i);
    });

    test('has deploy_id FK to deploy_events', () => {
      expect(sql).toMatch(/deploy_id\s+uuid\s+REFERENCES\s+deploy_events/i);
    });

    test('has deployed_at timestamp', () => {
      expect(sql).toMatch(/deployed_at\s+timestamptz/i);
    });

    test('has deployed_by column', () => {
      expect(sql).toMatch(/deployed_by\s+text/i);
    });

    test('has metadata jsonb (S-12 scar)', () => {
      expect(sql).toMatch(/metadata\s+jsonb\s+DEFAULT/i);
    });

    test('has UNIQUE constraint on surface + environment', () => {
      expect(sql).toMatch(/UNIQUE\s*\(\s*surface\s*,\s*environment\s*\)/i);
    });
  });

  // ── release_notes table ────────────────────────────────────────────────
  describe('release_notes table', () => {
    test('creates table', () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS release_notes/i);
    });

    test('has uuid primary key', () => {
      // Check that release_notes has its own PK
      const rnSection = sql.substring(sql.indexOf('release_notes'));
      expect(rnSection).toMatch(/id\s+uuid\s+DEFAULT\s+gen_random_uuid\(\)\s+PRIMARY KEY/i);
    });

    test('has git_tag unique constraint', () => {
      expect(sql).toMatch(/git_tag\s+text\s+NOT NULL\s+UNIQUE/i);
    });

    test('has title column', () => {
      expect(sql).toMatch(/title\s+text\s+NOT NULL/i);
    });

    test('has summary column', () => {
      expect(sql).toMatch(/summary\s+text/i);
    });

    test('has surfaces array column', () => {
      expect(sql).toMatch(/surfaces\s+text\[\]/i);
    });

    test('has finding_ids array column', () => {
      expect(sql).toMatch(/finding_ids\s+text\[\]/i);
    });

    test('has deploy_ids array column', () => {
      expect(sql).toMatch(/deploy_ids\s+uuid\[\]/i);
    });

    test('has release_type with CHECK constraint', () => {
      expect(sql).toMatch(/release_type\s+text\s+NOT NULL\s+DEFAULT\s+'feature'\s+CHECK/i);
    });

    test('has is_rollback boolean', () => {
      expect(sql).toMatch(/is_rollback\s+boolean\s+DEFAULT\s+false/i);
    });

    test('has released_at timestamp', () => {
      expect(sql).toMatch(/released_at\s+timestamptz/i);
    });
  });

  // ── Indexes ────────────────────────────────────────────────────────────
  describe('indexes', () => {
    test('idx_env_versions_surface_env', () => {
      expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_env_versions_surface_env/i);
    });

    test('idx_env_versions_deployed_at', () => {
      expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_env_versions_deployed_at/i);
    });

    test('idx_env_versions_deploy_id', () => {
      expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_env_versions_deploy_id/i);
    });

    test('idx_release_notes_tag', () => {
      expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_release_notes_tag/i);
    });

    test('idx_release_notes_released_at', () => {
      expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_release_notes_released_at/i);
    });

    test('idx_release_notes_type', () => {
      expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_release_notes_type/i);
    });
  });

  // ── RLS ────────────────────────────────────────────────────────────────
  describe('RLS policies', () => {
    test('enables RLS on environment_versions', () => {
      expect(sql).toMatch(/ALTER TABLE environment_versions ENABLE ROW LEVEL SECURITY/i);
    });

    test('enables RLS on release_notes', () => {
      expect(sql).toMatch(/ALTER TABLE release_notes ENABLE ROW LEVEL SECURITY/i);
    });

    test('admin read policy on environment_versions', () => {
      expect(sql).toMatch(/CREATE POLICY env_versions_admin_read ON environment_versions/i);
    });

    test('service write policy on environment_versions', () => {
      expect(sql).toMatch(/CREATE POLICY env_versions_service_write ON environment_versions/i);
    });

    test('admin read policy on release_notes', () => {
      expect(sql).toMatch(/CREATE POLICY release_notes_admin_read ON release_notes/i);
    });

    test('service write policy on release_notes', () => {
      expect(sql).toMatch(/CREATE POLICY release_notes_service_write ON release_notes/i);
    });
  });

  // ── Views ──────────────────────────────────────────────────────────────
  describe('views', () => {
    test('v_environment_drift view exists', () => {
      expect(sql).toMatch(/CREATE OR REPLACE VIEW v_environment_drift/i);
    });

    test('drift view has has_drift column', () => {
      expect(sql).toMatch(/has_drift/i);
    });

    test('drift view groups by surface', () => {
      expect(sql).toMatch(/GROUP BY ev\.surface/i);
    });

    test('v_release_timeline view exists', () => {
      expect(sql).toMatch(/CREATE OR REPLACE VIEW v_release_timeline/i);
    });

    test('release timeline has surface_count', () => {
      expect(sql).toMatch(/surface_count/i);
    });

    test('release timeline has findings_resolved', () => {
      expect(sql).toMatch(/findings_resolved/i);
    });

    test('v_deploy_cadence view exists', () => {
      expect(sql).toMatch(/CREATE OR REPLACE VIEW v_deploy_cadence/i);
    });

    test('deploy cadence has 7d/30d/90d windows', () => {
      expect(sql).toMatch(/deploys_7d/i);
      expect(sql).toMatch(/deploys_30d/i);
      expect(sql).toMatch(/deploys_90d/i);
    });

    test('deploy cadence tracks success/failure/rollback', () => {
      expect(sql).toMatch(/successes_30d/i);
      expect(sql).toMatch(/failures_30d/i);
      expect(sql).toMatch(/rollbacks_30d/i);
    });
  });

  // ── Function ───────────────────────────────────────────────────────────
  describe('fn_deployment_visibility', () => {
    test('function exists', () => {
      expect(sql).toMatch(/CREATE OR REPLACE FUNCTION fn_deployment_visibility/i);
    });

    test('returns jsonb', () => {
      expect(sql).toMatch(/RETURNS jsonb/i);
    });

    test('includes environment_matrix', () => {
      expect(sql).toMatch(/environment_matrix/i);
    });

    test('includes drift_report', () => {
      expect(sql).toMatch(/drift_report/i);
    });

    test('includes release_timeline', () => {
      expect(sql).toMatch(/release_timeline/i);
    });

    test('includes deploy_cadence', () => {
      expect(sql).toMatch(/deploy_cadence/i);
    });

    test('includes summary', () => {
      expect(sql).toMatch(/total_surfaces/i);
      expect(sql).toMatch(/surfaces_with_drift/i);
    });
  });

  // ── Trigger ────────────────────────────────────────────────────────────
  describe('auto-update trigger', () => {
    test('fn_update_environment_version function exists', () => {
      expect(sql).toMatch(/CREATE OR REPLACE FUNCTION fn_update_environment_version/i);
    });

    test('trigger fires on UPDATE of deploy_events', () => {
      expect(sql).toMatch(/CREATE TRIGGER trg_deploy_events_update_env_version/i);
      expect(sql).toMatch(/AFTER UPDATE ON deploy_events/i);
    });

    test('trigger fires on INSERT of deploy_events with success', () => {
      expect(sql).toMatch(/CREATE TRIGGER trg_deploy_events_insert_env_version/i);
      expect(sql).toMatch(/AFTER INSERT ON deploy_events/i);
    });

    test('trigger uses UPSERT on surface+environment', () => {
      expect(sql).toMatch(/ON CONFLICT \(surface, environment\) DO UPDATE/i);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Edge Function Tests (deploy-tracker/index.ts BI-03 actions)
// ══════════════════════════════════════════════════════════════════════════════

describe('BI-03 Edge Function — deploy-tracker BI-03 actions', () => {
  const ef = readFile('supabase/functions/deploy-tracker/index.ts');

  test('EF file exists', () => {
    expect(fileExists('supabase/functions/deploy-tracker/index.ts')).toBe(true);
  });

  test('header mentions BI-03', () => {
    expect(ef).toMatch(/BI-03/);
  });

  // ── Admin auth ─────────────────────────────────────────────────────────
  test('deployment-visibility is admin-only', () => {
    expect(ef).toMatch(/deployment-visibility/);
    // Find the admin check line
    const adminLine = ef.split('\n').find(l => l.includes('deployment-visibility') && l.includes('admin'));
    expect(adminLine).toBeTruthy();
  });

  test('release-history is admin-only', () => {
    expect(ef).toMatch(/release-history/);
    const adminLine = ef.split('\n').find(l => l.includes('release-history') && l.includes('admin'));
    expect(adminLine).toBeTruthy();
  });

  // ── deployment-visibility action ───────────────────────────────────────
  test('deployment-visibility action calls fn_deployment_visibility', () => {
    expect(ef).toMatch(/action === "deployment-visibility"/);
    expect(ef).toMatch(/fn_deployment_visibility/);
  });

  // ── release-history action ─────────────────────────────────────────────
  test('release-history action queries v_release_timeline', () => {
    expect(ef).toMatch(/action === "release-history"/);
    expect(ef).toMatch(/v_release_timeline/);
  });

  test('release-history supports limit parameter', () => {
    expect(ef).toMatch(/Number\(body\.limit\)/);
  });

  test('release-history supports release_type filter', () => {
    expect(ef).toMatch(/body\.release_type/);
  });

  // ── update-environment action ──────────────────────────────────────────
  test('update-environment action exists', () => {
    expect(ef).toMatch(/action === "update-environment"/);
  });

  test('update-environment requires surface and environment', () => {
    expect(ef).toMatch(/!body\.surface.*!body\.environment|!body\.environment.*!body\.surface/);
  });

  test('update-environment upserts environment_versions', () => {
    expect(ef).toMatch(/environment_versions/);
    expect(ef).toMatch(/onConflict.*surface.*environment/);
  });

  // ── record-release action ──────────────────────────────────────────────
  test('record-release action exists', () => {
    expect(ef).toMatch(/action === "record-release"/);
  });

  test('record-release requires git_tag and title', () => {
    expect(ef).toMatch(/!body\.git_tag.*!body\.title|!body\.title.*!body\.git_tag/);
  });

  test('record-release upserts release_notes', () => {
    expect(ef).toMatch(/release_notes/);
    expect(ef).toMatch(/onConflict.*git_tag/);
  });

  // ── Total action count ─────────────────────────────────────────────────
  test('EF has 14 action handlers (6 BI-01 + 4 BI-02 + 4 BI-03)', () => {
    const actionMatches = ef.match(/if \(action === "/g);
    // 15 total: 1 admin check + 14 action handlers
    expect(actionMatches.length).toBe(15);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Admin Panel Tests (admin-deploy-visibility.js)
// ══════════════════════════════════════════════════════════════════════════════

describe('BI-03 Admin Panel — admin-deploy-visibility.js', () => {
  const js = readFile('js/admin-deploy-visibility.js');

  test('file exists', () => {
    expect(fileExists('js/admin-deploy-visibility.js')).toBe(true);
  });

  // ── API helper ─────────────────────────────────────────────────────────
  test('has _visibilityAction API helper', () => {
    expect(js).toMatch(/async function _visibilityAction/);
  });

  test('API helper uses deploy-tracker gateway route', () => {
    expect(js).toMatch(/x-gateway-route.*deploy-tracker/);
  });

  // ── Rendering functions ────────────────────────────────────────────────
  test('renders summary cards', () => {
    expect(js).toMatch(/function _renderVisibilityCards/);
  });

  test('summary cards include surfaces tracked', () => {
    expect(js).toMatch(/Surfaces Tracked/);
  });

  test('summary cards include drift alerts', () => {
    expect(js).toMatch(/Drift Alerts/);
  });

  test('summary cards include total releases', () => {
    expect(js).toMatch(/Total Releases/);
  });

  test('summary cards include latest release', () => {
    expect(js).toMatch(/Latest Release/);
  });

  test('renders environment matrix', () => {
    expect(js).toMatch(/function _renderEnvironmentMatrix/);
  });

  test('matrix has Production column', () => {
    expect(js).toMatch(/Production/);
  });

  test('matrix has Staging column', () => {
    expect(js).toMatch(/Staging/);
  });

  test('matrix shows drift status', () => {
    expect(js).toMatch(/_visDriftBadge/);
  });

  test('renders deploy cadence table', () => {
    expect(js).toMatch(/function _renderDeployCadence/);
  });

  test('cadence has 7d/30d/90d columns', () => {
    expect(js).toMatch(/7d/);
    expect(js).toMatch(/30d/);
    expect(js).toMatch(/90d/);
  });

  test('cadence shows success rate', () => {
    expect(js).toMatch(/successRate/);
  });

  test('renders release timeline', () => {
    expect(js).toMatch(/function _renderReleaseTimeline/);
  });

  test('timeline shows release type badges', () => {
    expect(js).toMatch(/_visTypeBadge/);
  });

  test('timeline shows rollback indicator', () => {
    expect(js).toMatch(/ROLLBACK/);
  });

  // ── Main refresh function ──────────────────────────────────────────────
  test('has refreshDeployVisibility main function', () => {
    expect(js).toMatch(/async function refreshDeployVisibility/);
  });

  test('calls deployment-visibility action', () => {
    expect(js).toMatch(/_visibilityAction\('deployment-visibility'\)/);
  });

  test('targets admin-page-deploy-visibility container', () => {
    expect(js).toMatch(/admin-page-deploy-visibility/);
  });

  // ── Global init ────────────────────────────────────────────────────────
  test('exposes loadDeployVisibilityPanel globally', () => {
    expect(js).toMatch(/window\.loadDeployVisibilityPanel/);
  });

  test('has 2-minute auto-refresh polling', () => {
    expect(js).toMatch(/120000/);
  });

  test('listens for admin-page-change events', () => {
    expect(js).toMatch(/admin-page-change/);
  });

  // ── Helper functions ───────────────────────────────────────────────────
  test('has timestamp formatter', () => {
    expect(js).toMatch(/function _visFmt/);
  });

  test('has SHA truncation helper', () => {
    expect(js).toMatch(/function _visSha/);
  });

  test('has release type badge helper', () => {
    expect(js).toMatch(/function _visTypeBadge/);
  });

  test('has drift badge helper', () => {
    expect(js).toMatch(/function _visDriftBadge/);
  });

  test('type badge covers all release types', () => {
    expect(js).toMatch(/feature/);
    expect(js).toMatch(/bugfix/);
    expect(js).toMatch(/security/);
    expect(js).toMatch(/hotfix/);
    expect(js).toMatch(/infrastructure/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Integration Tests (admin.html + admin.js wiring)
// ══════════════════════════════════════════════════════════════════════════════

describe('BI-03 Integration — admin.html + admin.js wiring', () => {
  const html = readFile('admin.html');
  const adminJs = readFile('js/admin.js');

  test('admin.html has deploy-visibility panel container', () => {
    expect(html).toMatch(/id="admin-panel-deploy-visibility"/);
  });

  test('admin.html has deploy-visibility page container', () => {
    expect(html).toMatch(/id="admin-page-deploy-visibility"/);
  });

  test('admin.html has deploy-visibility script tag', () => {
    expect(html).toMatch(/admin-deploy-visibility\.js/);
  });

  test('admin.html script tag has version cache buster', () => {
    expect(html).toMatch(/admin-deploy-visibility\.js\?v=/);
  });

  test('admin.js ADMIN_SUBPAGE_MAP has deploy-visibility entry', () => {
    expect(adminJs).toMatch(/'deploy-visibility'/);
  });

  test('ADMIN_SUBPAGE_MAP deploy-visibility is in operations section', () => {
    expect(adminJs).toMatch(/deploy-visibility.*section.*operations/);
  });

  test('ADMIN_SUBPAGE_MAP calls loadDeployVisibilityPanel', () => {
    expect(adminJs).toMatch(/loadDeployVisibilityPanel/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Pod Team Manifest Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('BI-03 Pod Team Manifest', () => {
  const manifest = readFile('docs/scaling/pod-team-manifest.md');

  test('BI-03 pairing entry exists', () => {
    expect(manifest).toMatch(/BI-03/);
  });
});
