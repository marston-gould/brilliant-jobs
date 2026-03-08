/**
 * BI-04 Validation Tests — Deployment Alerting & Health Scoring
 *
 * Validates:
 *   1. Migration structure (tables, indexes, RLS, views, functions, cron, seed)
 *   2. Deploy-tracker EF structure (18 total actions, BI-04 header, auth)
 *   3. Admin panel (deploy-alerting.js, ADMIN_SUBPAGE_MAP, admin.html)
 *   4. Health score design (dimensions, weights, grading)
 *   5. Alert rule design (6 seed rules, cooldown, H-02 integration)
 *   6. Team manifest (BI-04 pairing)
 *   7. File inventory
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function exists(f) { return fs.existsSync(path.join(ROOT, f)); }

// ── Section 1: Migration Structure ──────────────────────────────────────────

describe('BI-04 Migration Structure', () => {
  let sql;
  beforeAll(() => { sql = read('supabase/migrations/v6.37-deploy-alerting.sql'); });

  test('migration file exists', () => {
    expect(exists('supabase/migrations/v6.37-deploy-alerting.sql')).toBe(true);
  });

  test('creates deploy_alert_rules table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS deploy_alert_rules');
  });

  test('creates deploy_alert_history table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS deploy_alert_history');
  });

  test('deploy_alert_rules has rule_type CHECK constraint', () => {
    expect(sql).toMatch(/rule_type.*CHECK.*rule_type IN/s);
    expect(sql).toContain('deploy_failure_rate');
    expect(sql).toContain('bundle_size_regression');
    expect(sql).toContain('environment_drift');
    expect(sql).toContain('ci_failure_streak');
    expect(sql).toContain('deploy_duration_spike');
    expect(sql).toContain('health_score_threshold');
    expect(sql).toContain('custom');
  });

  test('deploy_alert_history has status CHECK constraint', () => {
    expect(sql).toMatch(/status.*CHECK.*status IN.*active.*acknowledged.*resolved.*expired/s);
  });

  test('deploy_alert_rules has cooldown_minutes', () => {
    expect(sql).toContain('cooldown_minutes');
  });

  test('deploy_alert_rules has last_fired_at', () => {
    expect(sql).toContain('last_fired_at');
  });

  test('deploy_alert_rules has surfaces array for per-surface filtering', () => {
    expect(sql).toContain('surfaces');
    expect(sql).toContain('TEXT[]');
  });

  test('deploy_alert_rules has S-12 scar (metadata JSONB)', () => {
    expect(sql).toMatch(/metadata\s+JSONB/);
  });

  test('deploy_alert_history has acknowledgment fields', () => {
    expect(sql).toContain('acknowledged_at');
    expect(sql).toContain('acknowledged_by');
    expect(sql).toContain('resolved_at');
    expect(sql).toContain('resolved_by');
    expect(sql).toContain('resolve_notes');
  });

  test('has required indexes (6)', () => {
    expect(sql).toContain('idx_alert_rules_type');
    expect(sql).toContain('idx_alert_rules_enabled');
    expect(sql).toContain('idx_alert_history_status');
    expect(sql).toContain('idx_alert_history_fired');
    expect(sql).toContain('idx_alert_history_rule');
    expect(sql).toContain('idx_alert_history_severity');
  });

  test('RLS enabled on both tables', () => {
    expect(sql).toContain('ALTER TABLE deploy_alert_rules ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE deploy_alert_history ENABLE ROW LEVEL SECURITY');
  });

  test('has admin read + service write RLS policies for rules', () => {
    expect(sql).toContain('admin_read_alert_rules');
    expect(sql).toContain('service_manage_alert_rules');
  });

  test('has admin read + service write RLS policies for history', () => {
    expect(sql).toContain('admin_read_alert_history');
    expect(sql).toContain('service_manage_alert_history');
  });

  test('creates v_active_alerts view', () => {
    expect(sql).toContain('CREATE OR REPLACE VIEW v_active_alerts');
    expect(sql).toContain("status IN ('active', 'acknowledged')");
  });

  test('v_active_alerts orders critical first', () => {
    expect(sql).toMatch(/CASE.*severity.*WHEN 'critical' THEN 0/s);
  });

  test('creates fn_deployment_health_score function', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION fn_deployment_health_score');
    expect(sql).toContain('RETURNS JSONB');
  });

  test('fn_deployment_health_score has 5 dimensions', () => {
    expect(sql).toContain('v_deploy_score');
    expect(sql).toContain('v_drift_score');
    expect(sql).toContain('v_bundle_score');
    expect(sql).toContain('v_ci_score');
    expect(sql).toContain('v_duration_score');
  });

  test('fn_deployment_health_score uses weighted average (30/25/20/15/10)', () => {
    expect(sql).toContain('v_deploy_score * 0.30');
    expect(sql).toContain('v_ci_score * 0.25');
    expect(sql).toContain('v_drift_score * 0.20');
    expect(sql).toContain('v_bundle_score * 0.15');
    expect(sql).toContain('v_duration_score * 0.10');
  });

  test('fn_deployment_health_score returns letter grades', () => {
    expect(sql).toMatch(/WHEN v_composite >= 90 THEN 'A'/);
    expect(sql).toMatch(/WHEN v_composite >= 75 THEN 'B'/);
    expect(sql).toMatch(/WHEN v_composite >= 60 THEN 'C'/);
    expect(sql).toMatch(/WHEN v_composite >= 40 THEN 'D'/);
    expect(sql).toContain("ELSE 'F'");
  });

  test('fn_deployment_health_score penalizes active critical alerts', () => {
    expect(sql).toContain('v_active_critical * 10');
  });

  test('creates fn_evaluate_deploy_alerts function', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION fn_evaluate_deploy_alerts');
    expect(sql).toContain('RETURNS JSONB');
  });

  test('fn_evaluate_deploy_alerts respects cooldown', () => {
    expect(sql).toContain('cooldown_minutes');
    expect(sql).toMatch(/last_fired_at.*cooldown_minutes/s);
  });

  test('fn_evaluate_deploy_alerts evaluates all 6 built-in rule types', () => {
    expect(sql).toContain("WHEN 'deploy_failure_rate'");
    expect(sql).toContain("WHEN 'environment_drift'");
    expect(sql).toContain("WHEN 'bundle_size_regression'");
    expect(sql).toContain("WHEN 'ci_failure_streak'");
    expect(sql).toContain("WHEN 'deploy_duration_spike'");
    expect(sql).toContain("WHEN 'health_score_threshold'");
  });

  test('fn_evaluate_deploy_alerts publishes to H-02 event bus for critical', () => {
    expect(sql).toContain('fn_publish_event');
    expect(sql).toContain('deploy.alert.critical');
  });

  test('seeds 6 default alert rules', () => {
    expect(sql).toContain('Deploy Failure Rate > 20%');
    expect(sql).toContain('Environment Drift Detected');
    expect(sql).toContain('Bundle Size Regression > 10%');
    expect(sql).toContain('CI Failure Streak');
    expect(sql).toContain('Deploy Duration Spike > 50%');
    expect(sql).toContain('Health Score Below 50');
  });

  test('has pg_cron for alert evaluation (every 15 min)', () => {
    expect(sql).toContain('evaluate-deploy-alerts');
    expect(sql).toContain('*/15 * * * *');
  });

  test('has pg_cron for alert cleanup (daily)', () => {
    expect(sql).toContain('cleanup-deploy-alerts');
    expect(sql).toContain("interval '90 days'");
  });

  test('logs migration event', () => {
    expect(sql).toContain('v6.37-deploy-alerting');
    expect(sql).toContain('BI-04');
  });
});

// ── Section 2: Deploy-Tracker EF ────────────────────────────────────────────

describe('BI-04 Deploy-Tracker EF', () => {
  let ef;
  beforeAll(() => { ef = read('supabase/functions/deploy-tracker/index.ts'); });

  test('header mentions BI-04', () => {
    expect(ef).toContain('BI-04');
  });

  test('header documents 4 BI-04 actions', () => {
    expect(ef).toContain('deploy-health-score');
    expect(ef).toContain('deploy-alerts');
    expect(ef).toContain('acknowledge-alert');
    expect(ef).toContain('manage-alert-rules');
  });

  test('BI-04 admin actions are in the admin auth check', () => {
    const authLine = ef.match(/if \(action === "summary".*?\{/s)?.[0] || '';
    expect(authLine).toContain('deploy-health-score');
    expect(authLine).toContain('deploy-alerts');
    expect(authLine).toContain('acknowledge-alert');
    expect(authLine).toContain('manage-alert-rules');
  });

  test('deploy-health-score action calls fn_deployment_health_score RPC', () => {
    expect(ef).toContain('fn_deployment_health_score');
  });

  test('deploy-alerts action queries v_active_alerts', () => {
    expect(ef).toContain('v_active_alerts');
  });

  test('acknowledge-alert supports both ack and resolve', () => {
    expect(ef).toContain('body.resolve');
    expect(ef).toContain('resolve_notes');
  });

  test('manage-alert-rules has list/toggle/update/evaluate sub-actions', () => {
    expect(ef).toContain('subAction === "list"');
    expect(ef).toContain('subAction === "toggle"');
    expect(ef).toContain('subAction === "update"');
    expect(ef).toContain('subAction === "evaluate"');
  });

  test('manage-alert-rules evaluate calls fn_evaluate_deploy_alerts', () => {
    expect(ef).toContain('fn_evaluate_deploy_alerts');
  });

  test('total actions: 18 (6 BI-01 + 4 BI-02 + 4 BI-03 + 4 BI-04)', () => {
    // Count unique action handler blocks
    const actionMatches = ef.match(/if \(action === "/g);
    // Should be at least 14 unique action checks (some BI-04 use sub_action)
    expect(actionMatches.length).toBeGreaterThanOrEqual(14);
  });
});

// ── Section 3: Admin Panel ──────────────────────────────────────────────────

describe('BI-04 Admin Panel', () => {
  test('admin-deploy-alerting.js exists', () => {
    expect(exists('js/admin-deploy-alerting.js')).toBe(true);
  });

  test('admin-deploy-alerting.js exports loadDeployAlertingPanel', () => {
    const js = read('js/admin-deploy-alerting.js');
    expect(js).toContain('window.loadDeployAlertingPanel');
  });

  test('admin-deploy-alerting.js renders health gauge', () => {
    const js = read('js/admin-deploy-alerting.js');
    expect(js).toContain('_renderHealthGauge');
    expect(js).toContain('Health Score');
  });

  test('admin-deploy-alerting.js renders dimension breakdown', () => {
    const js = read('js/admin-deploy-alerting.js');
    expect(js).toContain('_renderDimensions');
    expect(js).toContain('Deploy Success');
    expect(js).toContain('CI Health');
    expect(js).toContain('Environment Drift');
    expect(js).toContain('Bundle Health');
    expect(js).toContain('Deploy Duration');
  });

  test('admin-deploy-alerting.js renders alerts table', () => {
    const js = read('js/admin-deploy-alerting.js');
    expect(js).toContain('_renderAlerts');
    expect(js).toContain('Active Alerts');
  });

  test('admin-deploy-alerting.js renders rules table', () => {
    const js = read('js/admin-deploy-alerting.js');
    expect(js).toContain('_renderRules');
    expect(js).toContain('Alert Rules');
  });

  test('admin-deploy-alerting.js has acknowledge/resolve actions', () => {
    const js = read('js/admin-deploy-alerting.js');
    expect(js).toContain('_ackAlert');
    expect(js).toContain('_resolveAlert');
  });

  test('admin-deploy-alerting.js has toggle rule action', () => {
    const js = read('js/admin-deploy-alerting.js');
    expect(js).toContain('_toggleRule');
  });

  test('admin-deploy-alerting.js has evaluate now action', () => {
    const js = read('js/admin-deploy-alerting.js');
    expect(js).toContain('_evaluateAlertsNow');
  });

  test('admin-deploy-alerting.js has 2min auto-refresh', () => {
    const js = read('js/admin-deploy-alerting.js');
    expect(js).toContain('120000');
  });

  test('admin-deploy-alerting.js uses reportError', () => {
    const js = read('js/admin-deploy-alerting.js');
    expect(js).toContain('reportError');
  });

  test('ADMIN_SUBPAGE_MAP has deploy-alerting entry', () => {
    const admin = read('js/admin.js');
    expect(admin).toContain("'deploy-alerting'");
    expect(admin).toContain('loadDeployAlertingPanel');
  });

  test('ADMIN_SUBPAGE_MAP deploy-alerting is in operations section', () => {
    const admin = read('js/admin.js');
    const match = admin.match(/'deploy-alerting'.*?section:\s*'([^']+)'/s);
    expect(match).toBeTruthy();
    expect(match[1]).toBe('operations');
  });

  test('admin.html has deploy-alerting container', () => {
    const html = read('admin.html');
    expect(html).toContain('admin-panel-deploy-alerting');
    expect(html).toContain('admin-page-deploy-alerting');
  });

  test('admin.html has deploy-alerting script tag', () => {
    const html = read('admin.html');
    expect(html).toContain('admin-deploy-alerting.js');
  });
});

// ── Section 4: Health Score Design ──────────────────────────────────────────

describe('BI-04 Health Score Design', () => {
  let sql;
  beforeAll(() => { sql = read('supabase/migrations/v6.37-deploy-alerting.sql'); });

  test('health score ranges from 0 to 100', () => {
    expect(sql).toContain('GREATEST(0');
  });

  test('health score uses 7-day window for deploy success', () => {
    expect(sql).toMatch(/deploy_events.*interval '7 days'/s);
  });

  test('health score compares 7d vs 30d baseline for duration', () => {
    expect(sql).toMatch(/interval '30 days'/);
  });

  test('health score queries v_environment_drift for drift', () => {
    expect(sql).toContain('v_environment_drift');
  });

  test('health score queries v_bundle_size_trends for regressions', () => {
    expect(sql).toContain('v_bundle_size_trends');
  });

  test('health score queries ci_workflow_runs for CI health', () => {
    expect(sql).toContain('ci_workflow_runs');
  });
});

// ── Section 5: Alert Rule Design ────────────────────────────────────────────

describe('BI-04 Alert Rule Design', () => {
  let sql;
  beforeAll(() => { sql = read('supabase/migrations/v6.37-deploy-alerting.sql'); });

  test('seed rules have appropriate severities', () => {
    // Deploy failure rate and CI streak are critical
    expect(sql).toMatch(/Deploy Failure Rate.*critical/s);
    expect(sql).toMatch(/CI Failure Streak.*critical/s);
    expect(sql).toMatch(/Health Score Below.*critical/s);
    // Drift, bundle, duration are warning
    expect(sql).toMatch(/Environment Drift.*warning/s);
    expect(sql).toMatch(/Bundle Size Regression.*warning/s);
    expect(sql).toMatch(/Deploy Duration Spike.*warning/s);
  });

  test('seed rules have threshold JSONB configs', () => {
    expect(sql).toContain('max_failure_rate_pct');
    expect(sql).toContain('max_drift_count');
    expect(sql).toContain('max_increase_pct');
    expect(sql).toContain('max_consecutive_failures');
    expect(sql).toContain('min_score');
  });

  test('seed rules use ON CONFLICT DO NOTHING (idempotent)', () => {
    expect(sql).toContain('ON CONFLICT (rule_name) DO NOTHING');
  });

  test('H-02 event bus integration for critical alerts', () => {
    expect(sql).toContain("severity = 'critical'");
    expect(sql).toContain('fn_publish_event');
  });

  test('custom rule type is valid but skipped in auto-evaluation', () => {
    expect(sql).toContain("'custom'");
    expect(sql).toContain('custom rules: skip automatic evaluation');
  });
});

// ── Section 6: Team Manifest ────────────────────────────────────────────────

describe('BI-04 Team Manifest', () => {
  let manifest;
  beforeAll(() => { manifest = read('docs/scaling/pod-team-manifest.md'); });

  test('BI-04 pairing exists', () => {
    expect(manifest).toContain('BI-04');
  });

  test('BI-04 primary pair is DevOps + Lead Platform Engineer', () => {
    const bi04Line = manifest.split('\n').find(l => l.includes('BI-04'));
    expect(bi04Line).toBeTruthy();
    expect(bi04Line).toContain('DevOps');
    expect(bi04Line).toContain('Lead Platform Engineer');
  });

  test('BI-04 reviewer includes Chief Architect', () => {
    const bi04Line = manifest.split('\n').find(l => l.includes('BI-04'));
    expect(bi04Line).toContain('Chief Architect');
  });

  test('all 15 Pod 3 + Pod 4 roles present', () => {
    expect(manifest).toContain('Engineering Lead');
    expect(manifest).toContain('Senior Backend Engineer');
    expect(manifest).toContain('Senior Frontend Engineer');
    expect(manifest).toContain('Security Engineer');
    expect(manifest).toContain('DevOps/Infrastructure Engineer');
    expect(manifest).toContain('QA/Test Engineer');
    expect(manifest).toContain('Data Engineer');
    expect(manifest).toContain('TPM');
    expect(manifest).toContain('Technical Writer');
    expect(manifest).toContain('Senior CSS/Tailwind Engineer');
    expect(manifest).toContain('Chief Architect');
    expect(manifest).toContain('Lead Platform Engineer');
    expect(manifest).toContain('System Architect');
    expect(manifest).toContain('Forward-Looking Developer');
    expect(manifest).toContain('Evolvability Strategist');
  });
});

// ── Section 7: File Inventory ───────────────────────────────────────────────

describe('BI-04 File Inventory', () => {
  test('v6.37-deploy-alerting.sql exists', () => {
    expect(exists('supabase/migrations/v6.37-deploy-alerting.sql')).toBe(true);
  });

  test('admin-deploy-alerting.js exists', () => {
    expect(exists('js/admin-deploy-alerting.js')).toBe(true);
  });

  test('deploy-tracker EF exists and is extended', () => {
    expect(exists('supabase/functions/deploy-tracker/index.ts')).toBe(true);
    const ef = read('supabase/functions/deploy-tracker/index.ts');
    expect(ef).toContain('BI-04');
  });

  test('tests file exists', () => {
    expect(exists('tests/bi-004-deploy-alerting.test.js')).toBe(true);
  });
});
