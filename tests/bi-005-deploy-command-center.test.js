/**
 * BI-05 Validation Tests — Deployment Command Center & Rollback Management
 *
 * Sections:
 *   1. Migration: v6.38-deploy-command-center.sql structure validation
 *   2. Edge Function: 4 new BI-05 actions (22 total)
 *   3. Admin Panel: admin-deploy-command-center.js structure
 *   4. Admin Integration: ADMIN_SUBPAGE_MAP entry, admin.html container + script
 *   5. Rollback Events: Table schema, indexes, RLS
 *   6. Deploy Approvals: Table schema, approval workflow, expiry
 *   7. Views & Functions: v_command_center_summary, v_rollback_history, fn_command_center_data, fn_initiate_rollback
 *   8. Pod Team Manifest: BI-05 pairing assignment
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

function fileExists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

// ── Section 1: Migration Structure ──────────────────────────────────────────

describe('BI-05 Migration: v6.38-deploy-command-center.sql', () => {
  let sql;
  beforeAll(() => { sql = readFile('supabase/migrations/v6.38-deploy-command-center.sql'); });

  test('migration file exists', () => {
    expect(fileExists('supabase/migrations/v6.38-deploy-command-center.sql')).toBe(true);
  });

  test('creates rollback_events table', () => {
    expect(sql).toMatch(/CREATE TABLE.*rollback_events/i);
  });

  test('rollback_events has required columns', () => {
    expect(sql).toMatch(/deploy_id.*UUID/i);
    expect(sql).toMatch(/surface.*TEXT.*NOT NULL/i);
    expect(sql).toMatch(/initiated_by.*TEXT/i);
    expect(sql).toMatch(/reason.*TEXT/i);
    expect(sql).toMatch(/rollback_to_sha.*TEXT/i);
    expect(sql).toMatch(/rollback_to_tag.*TEXT/i);
    expect(sql).toMatch(/status.*TEXT.*NOT NULL/i);
    expect(sql).toMatch(/started_at.*TIMESTAMPTZ/i);
    expect(sql).toMatch(/completed_at.*TIMESTAMPTZ/i);
  });

  test('rollback_events has status CHECK constraint', () => {
    expect(sql).toMatch(/CHECK.*status.*IN.*initiated.*in_progress.*completed.*failed.*cancelled/is);
  });

  test('rollback_events has surface CHECK constraint', () => {
    expect(sql).toMatch(/CHECK.*surface.*IN.*dashboard.*landing.*admin.*extension/is);
  });

  test('rollback_events has S-12 scar_meta JSONB', () => {
    expect(sql).toMatch(/scar_meta.*JSONB/i);
  });

  test('creates deploy_approvals table', () => {
    expect(sql).toMatch(/CREATE TABLE.*deploy_approvals/i);
  });

  test('deploy_approvals has required columns', () => {
    expect(sql).toMatch(/requested_by.*TEXT.*NOT NULL/i);
    expect(sql).toMatch(/approved_by.*TEXT/i);
    expect(sql).toMatch(/request_reason.*TEXT/i);
    expect(sql).toMatch(/reject_reason.*TEXT/i);
    expect(sql).toMatch(/expires_at.*TIMESTAMPTZ/i);
  });

  test('deploy_approvals has status CHECK constraint', () => {
    expect(sql).toMatch(/CHECK.*status.*IN.*pending.*approved.*rejected.*expired.*auto_approved/is);
  });

  test('deploy_approvals has S-12 scar_meta JSONB', () => {
    expect(sql).toMatch(/scar_meta.*JSONB/i);
  });
});

// ── Section 2: Indexes ──────────────────────────────────────────────────────

describe('BI-05 Indexes', () => {
  let sql;
  beforeAll(() => { sql = readFile('supabase/migrations/v6.38-deploy-command-center.sql'); });

  test('rollback_events surface index', () => {
    expect(sql).toMatch(/idx_rollback_events_surface/i);
  });

  test('rollback_events status index', () => {
    expect(sql).toMatch(/idx_rollback_events_status/i);
  });

  test('rollback_events started_at index', () => {
    expect(sql).toMatch(/idx_rollback_events_started_at/i);
  });

  test('rollback_events deploy_id index', () => {
    expect(sql).toMatch(/idx_rollback_events_deploy_id/i);
  });

  test('deploy_approvals status index', () => {
    expect(sql).toMatch(/idx_deploy_approvals_status/i);
  });

  test('deploy_approvals surface index', () => {
    expect(sql).toMatch(/idx_deploy_approvals_surface/i);
  });

  test('deploy_approvals requested_at index', () => {
    expect(sql).toMatch(/idx_deploy_approvals_requested_at/i);
  });
});

// ── Section 3: RLS ──────────────────────────────────────────────────────────

describe('BI-05 RLS Policies', () => {
  let sql;
  beforeAll(() => { sql = readFile('supabase/migrations/v6.38-deploy-command-center.sql'); });

  test('RLS enabled on rollback_events', () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY.*rollback_events|rollback_events.*ENABLE ROW LEVEL SECURITY/is);
  });

  test('RLS enabled on deploy_approvals', () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY.*deploy_approvals|deploy_approvals.*ENABLE ROW LEVEL SECURITY/is);
  });

  test('rollback_events admin read policy', () => {
    expect(sql).toMatch(/rollback_events_admin_read/i);
  });

  test('rollback_events service write policy', () => {
    expect(sql).toMatch(/rollback_events_service_write/i);
  });

  test('deploy_approvals admin read policy', () => {
    expect(sql).toMatch(/deploy_approvals_admin_read/i);
  });

  test('deploy_approvals service write policy', () => {
    expect(sql).toMatch(/deploy_approvals_service_write/i);
  });
});

// ── Section 4: Views ────────────────────────────────────────────────────────

describe('BI-05 Views', () => {
  let sql;
  beforeAll(() => { sql = readFile('supabase/migrations/v6.38-deploy-command-center.sql'); });

  test('v_command_center_summary view created', () => {
    expect(sql).toMatch(/CREATE OR REPLACE VIEW.*v_command_center_summary/i);
  });

  test('v_command_center_summary includes health score', () => {
    expect(sql).toMatch(/health_score/i);
  });

  test('v_command_center_summary includes active alerts', () => {
    expect(sql).toMatch(/active_alerts/i);
  });

  test('v_command_center_summary includes drift count', () => {
    expect(sql).toMatch(/drift_count/i);
  });

  test('v_command_center_summary includes pending approvals', () => {
    expect(sql).toMatch(/pending_approvals|pending_count/i);
  });

  test('v_command_center_summary includes rollback data', () => {
    expect(sql).toMatch(/rollback_count_7d/i);
  });

  test('v_rollback_history view created', () => {
    expect(sql).toMatch(/CREATE OR REPLACE VIEW.*v_rollback_history/i);
  });

  test('v_rollback_history joins deploy_events', () => {
    expect(sql).toMatch(/JOIN.*deploy_events/i);
  });
});

// ── Section 5: Functions ────────────────────────────────────────────────────

describe('BI-05 Functions', () => {
  let sql;
  beforeAll(() => { sql = readFile('supabase/migrations/v6.38-deploy-command-center.sql'); });

  test('fn_command_center_data function created', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION.*fn_command_center_data/i);
  });

  test('fn_command_center_data returns JSONB', () => {
    expect(sql).toMatch(/fn_command_center_data.*RETURNS JSONB/is);
  });

  test('fn_command_center_data aggregates summary', () => {
    expect(sql).toMatch(/v_command_center_summary/i);
  });

  test('fn_command_center_data includes rollbacks', () => {
    expect(sql).toMatch(/v_rollback_history/i);
  });

  test('fn_command_center_data includes approvals', () => {
    expect(sql).toMatch(/deploy_approvals/i);
  });

  test('fn_command_center_data includes activity stream', () => {
    expect(sql).toMatch(/activity/i);
  });

  test('fn_initiate_rollback function created', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION.*fn_initiate_rollback/i);
  });

  test('fn_initiate_rollback validates surface', () => {
    expect(sql).toMatch(/Invalid surface/i);
  });

  test('fn_initiate_rollback uses H-02 event bus', () => {
    expect(sql).toMatch(/fn_publish_event.*rollback\.initiated/is);
  });

  test('fn_initiate_rollback has non-fatal H-02 error handling', () => {
    expect(sql).toMatch(/EXCEPTION WHEN OTHERS/i);
  });
});

// ── Section 6: pg_cron ──────────────────────────────────────────────────────

describe('BI-05 pg_cron', () => {
  let sql;
  beforeAll(() => { sql = readFile('supabase/migrations/v6.38-deploy-command-center.sql'); });

  test('approval expiry cron scheduled', () => {
    expect(sql).toMatch(/bi05-expire-approvals/i);
  });

  test('rollback cleanup cron scheduled', () => {
    expect(sql).toMatch(/bi05-cleanup-rollbacks/i);
  });
});

// ── Section 7: Edge Function ────────────────────────────────────────────────

describe('BI-05 Edge Function Actions', () => {
  let ef;
  beforeAll(() => { ef = readFile('supabase/functions/deploy-tracker/index.ts'); });

  test('EF header mentions BI-05', () => {
    expect(ef).toMatch(/BI-05/);
  });

  test('command-center action exists', () => {
    expect(ef).toMatch(/action === "command-center"/);
  });

  test('command-center calls fn_command_center_data', () => {
    expect(ef).toMatch(/fn_command_center_data/);
  });

  test('initiate-rollback action exists', () => {
    expect(ef).toMatch(/action === "initiate-rollback"/);
  });

  test('initiate-rollback calls fn_initiate_rollback', () => {
    expect(ef).toMatch(/fn_initiate_rollback/);
  });

  test('initiate-rollback requires surface', () => {
    expect(ef).toMatch(/surface is required/);
  });

  test('rollback-history action exists', () => {
    expect(ef).toMatch(/action === "rollback-history"/);
  });

  test('rollback-history queries v_rollback_history', () => {
    expect(ef).toMatch(/v_rollback_history/);
  });

  test('manage-approvals action exists', () => {
    expect(ef).toMatch(/action === "manage-approvals"/);
  });

  test('manage-approvals has list sub-action', () => {
    expect(ef).toMatch(/subAction === "list".*deploy_approvals/s);
  });

  test('manage-approvals has approve sub-action', () => {
    expect(ef).toMatch(/subAction === "approve"/);
  });

  test('manage-approvals has reject sub-action', () => {
    expect(ef).toMatch(/subAction === "reject"/);
  });

  test('BI-05 actions in admin-only auth check', () => {
    expect(ef).toMatch(/command-center.*initiate-rollback.*rollback-history.*manage-approvals/s);
  });

  test('total action count is 22', () => {
    // BI-01: 6 + BI-02: 4 + BI-03: 4 + BI-04: 4 + BI-05: 4 = 22
    const actionMatches = ef.match(/action === "/g);
    expect(actionMatches.length).toBeGreaterThanOrEqual(22);
  });
});

// ── Section 8: Admin Panel ──────────────────────────────────────────────────

describe('BI-05 Admin Panel: admin-deploy-command-center.js', () => {
  let js;
  beforeAll(() => { js = readFile('js/admin-deploy-command-center.js'); });

  test('admin panel file exists', () => {
    expect(fileExists('js/admin-deploy-command-center.js')).toBe(true);
  });

  test('loadCommandCenterPanel function defined', () => {
    expect(js).toMatch(/function loadCommandCenterPanel/);
  });

  test('uses deploy-tracker gateway route', () => {
    expect(js).toMatch(/x-gateway-route.*deploy-tracker/);
  });

  test('renders health score', () => {
    expect(js).toMatch(/Health Score/);
  });

  test('renders active alerts', () => {
    expect(js).toMatch(/Active Alerts/);
  });

  test('renders environment drift', () => {
    expect(js).toMatch(/Environment Drift/);
  });

  test('renders pending approvals', () => {
    expect(js).toMatch(/Pending Approvals/);
  });

  test('renders rollback count', () => {
    expect(js).toMatch(/Rollbacks.*7d/);
  });

  test('renders deploys 24h', () => {
    expect(js).toMatch(/Deploys.*24h/);
  });

  test('has initiate rollback button', () => {
    expect(js).toMatch(/Initiate Rollback/);
  });

  test('has evaluate alerts button', () => {
    expect(js).toMatch(/Evaluate Alerts/);
  });

  test('renders approval queue', () => {
    expect(js).toMatch(/Deploy Approval Queue/);
  });

  test('renders rollback history table', () => {
    expect(js).toMatch(/Rollback History/);
  });

  test('renders activity stream', () => {
    expect(js).toMatch(/Activity Stream/);
  });

  test('has approve button handler', () => {
    expect(js).toMatch(/_ccApproveDeployment/);
  });

  test('has reject button handler', () => {
    expect(js).toMatch(/_ccRejectDeployment/);
  });

  test('has rollback prompt handler', () => {
    expect(js).toMatch(/_ccInitRollbackPrompt/);
  });

  test('has 2 minute auto-refresh', () => {
    expect(js).toMatch(/120000/);
  });

  test('listens for admin:subpage-changed', () => {
    expect(js).toMatch(/admin:subpage-changed/);
  });
});

// ── Section 9: Admin Integration ────────────────────────────────────────────

describe('BI-05 Admin Integration', () => {
  test('ADMIN_SUBPAGE_MAP has command-center entry', () => {
    const adminJs = readFile('js/admin.js');
    expect(adminJs).toMatch(/'command-center'.*section.*operations.*label.*Command Center/);
  });

  test('admin.html has command-center container', () => {
    const html = readFile('admin.html');
    expect(html).toMatch(/admin-panel-command-center/);
    expect(html).toMatch(/admin-page-command-center/);
  });

  test('admin.html has command-center script tag', () => {
    const html = readFile('admin.html');
    expect(html).toMatch(/admin-deploy-command-center\.js/);
  });
});

// ── Section 10: Pod Team Manifest ───────────────────────────────────────────

describe('BI-05 Pod Team Manifest', () => {
  test('BI-05 pairing assignment exists', () => {
    const manifest = readFile('docs/scaling/pod-team-manifest.md');
    expect(manifest).toMatch(/BI-05/);
  });

  test('BI-05 has primary pair assigned', () => {
    const manifest = readFile('docs/scaling/pod-team-manifest.md');
    const bi05Line = manifest.split('\n').find(l => l.includes('BI-05'));
    expect(bi05Line).toBeTruthy();
    expect(bi05Line).toMatch(/DevOps|Lead Platform|Chief Architect/);
  });
});
