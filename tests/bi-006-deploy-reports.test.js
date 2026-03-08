/**
 * BI-06 Validation Tests — Deployment Performance Reports & DORA Metrics
 *
 * Sections:
 *   1. Migration: v6.39-deploy-reports.sql structure validation
 *   2. Edge Function: 4 new BI-06 actions (26 total)
 *   3. Admin Panel: admin-deploy-reports.js structure
 *   4. Admin Integration: ADMIN_SUBPAGE_MAP entry, admin.html container + script
 *   5. DORA Metrics Snapshots: Table schema, indexes, RLS, UNIQUE constraint
 *   6. Deployment Reports: Table schema, report types, status workflow
 *   7. Views: v_dora_metrics_current, v_deployment_performance_trends
 *   8. Functions: fn_calculate_dora_metrics, fn_generate_deployment_report
 *   9. pg_cron: Daily/weekly/monthly schedules + cleanup
 *   10. Pod Team Manifest: BI-06 pairing assignment
 *   11. Hook & Scar: H-02 event bus, S-12 scar_meta
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

describe('BI-06 Migration: v6.39-deploy-reports.sql', () => {
  let sql;
  beforeAll(() => { sql = readFile('supabase/migrations/v6.39-deploy-reports.sql'); });

  test('migration file exists', () => {
    expect(fileExists('supabase/migrations/v6.39-deploy-reports.sql')).toBe(true);
  });

  test('creates dora_metrics_snapshots table', () => {
    expect(sql).toMatch(/CREATE TABLE.*dora_metrics_snapshots/i);
  });

  test('creates deployment_reports table', () => {
    expect(sql).toMatch(/CREATE TABLE.*deployment_reports/i);
  });

  test('dora_metrics_snapshots has required columns', () => {
    expect(sql).toMatch(/period_type.*TEXT.*NOT NULL/i);
    expect(sql).toMatch(/period_start.*DATE.*NOT NULL/i);
    expect(sql).toMatch(/period_end.*DATE.*NOT NULL/i);
    expect(sql).toMatch(/deploy_frequency.*NUMERIC/i);
    expect(sql).toMatch(/deploy_frequency_class.*TEXT/i);
    expect(sql).toMatch(/lead_time_minutes.*NUMERIC/i);
    expect(sql).toMatch(/lead_time_class.*TEXT/i);
    expect(sql).toMatch(/mttr_minutes.*NUMERIC/i);
    expect(sql).toMatch(/mttr_class.*TEXT/i);
    expect(sql).toMatch(/change_failure_rate.*NUMERIC/i);
    expect(sql).toMatch(/change_failure_class.*TEXT/i);
    expect(sql).toMatch(/overall_class.*TEXT/i);
    expect(sql).toMatch(/health_score_avg.*NUMERIC/i);
    expect(sql).toMatch(/surfaces_deployed.*TEXT\[\]/i);
    expect(sql).toMatch(/scar_meta.*JSONB/i);
  });

  test('deployment_reports has required columns', () => {
    expect(sql).toMatch(/report_type.*TEXT.*NOT NULL/i);
    expect(sql).toMatch(/title.*TEXT.*NOT NULL/i);
    expect(sql).toMatch(/summary.*TEXT/i);
    expect(sql).toMatch(/total_deploys.*INTEGER/i);
    expect(sql).toMatch(/successful_deploys.*INTEGER/i);
    expect(sql).toMatch(/failed_deploys.*INTEGER/i);
    expect(sql).toMatch(/rollback_count.*INTEGER/i);
    expect(sql).toMatch(/avg_health_score.*NUMERIC/i);
    expect(sql).toMatch(/surfaces_active.*TEXT\[\]/i);
    expect(sql).toMatch(/alert_count.*INTEGER/i);
    expect(sql).toMatch(/critical_alert_count.*INTEGER/i);
    expect(sql).toMatch(/drift_detected.*BOOLEAN/i);
    expect(sql).toMatch(/dora_snapshot_id.*UUID/i);
    expect(sql).toMatch(/overall_dora_class/i);
    expect(sql).toMatch(/generated_by.*TEXT/i);
    expect(sql).toMatch(/status.*TEXT/i);
  });

  test('period_type CHECK constraint on dora_metrics_snapshots', () => {
    expect(sql).toMatch(/period_type.*CHECK.*daily.*weekly.*monthly/i);
  });

  test('report_type CHECK constraint on deployment_reports', () => {
    expect(sql).toMatch(/report_type.*CHECK.*weekly.*monthly.*on_demand/i);
  });

  test('DORA class CHECK constraints (elite/high/medium/low)', () => {
    expect(sql).toMatch(/deploy_frequency_class.*CHECK.*elite.*high.*medium.*low/i);
    expect(sql).toMatch(/lead_time_class.*CHECK.*elite.*high.*medium.*low/i);
    expect(sql).toMatch(/mttr_class.*CHECK.*elite.*high.*medium.*low/i);
    expect(sql).toMatch(/change_failure_class.*CHECK.*elite.*high.*medium.*low/i);
  });

  test('UNIQUE constraint on (period_type, period_start)', () => {
    expect(sql).toMatch(/UNIQUE.*period_type.*period_start/i);
  });

  test('deployment_reports status CHECK constraint', () => {
    expect(sql).toMatch(/status.*CHECK.*draft.*published.*archived/i);
  });

  test('dora_snapshot_id FK to dora_metrics_snapshots', () => {
    expect(sql).toMatch(/dora_snapshot_id.*UUID.*REFERENCES.*dora_metrics_snapshots/i);
  });
});

// ── Section 2: Indexes ──────────────────────────────────────────────────────

describe('BI-06 Migration: Indexes', () => {
  let sql;
  beforeAll(() => { sql = readFile('supabase/migrations/v6.39-deploy-reports.sql'); });

  test('index on dora_snapshots period_type', () => {
    expect(sql).toMatch(/CREATE INDEX.*idx_dora_snapshots_period_type.*dora_metrics_snapshots.*period_type/i);
  });

  test('index on dora_snapshots period_start DESC', () => {
    expect(sql).toMatch(/CREATE INDEX.*idx_dora_snapshots_period_start.*dora_metrics_snapshots.*period_start.*DESC/i);
  });

  test('index on dora_snapshots overall_class', () => {
    expect(sql).toMatch(/CREATE INDEX.*idx_dora_snapshots_overall_class.*dora_metrics_snapshots.*overall_class/i);
  });

  test('index on dora_snapshots generated_at DESC', () => {
    expect(sql).toMatch(/CREATE INDEX.*idx_dora_snapshots_generated_at.*dora_metrics_snapshots.*generated_at.*DESC/i);
  });

  test('index on deploy_reports type', () => {
    expect(sql).toMatch(/CREATE INDEX.*idx_deploy_reports_type.*deployment_reports.*report_type/i);
  });

  test('index on deploy_reports period_start DESC', () => {
    expect(sql).toMatch(/CREATE INDEX.*idx_deploy_reports_period_start.*deployment_reports.*period_start.*DESC/i);
  });

  test('index on deploy_reports status', () => {
    expect(sql).toMatch(/CREATE INDEX.*idx_deploy_reports_status.*deployment_reports.*status/i);
  });

  test('index on deploy_reports created_at DESC', () => {
    expect(sql).toMatch(/CREATE INDEX.*idx_deploy_reports_created_at.*deployment_reports.*created_at.*DESC/i);
  });

  test('total of 8 indexes created', () => {
    var matches = sql.match(/CREATE INDEX IF NOT EXISTS/gi);
    expect(matches).not.toBeNull();
    expect(matches.length).toBe(8);
  });
});

// ── Section 3: RLS ──────────────────────────────────────────────────────────

describe('BI-06 Migration: RLS', () => {
  let sql;
  beforeAll(() => { sql = readFile('supabase/migrations/v6.39-deploy-reports.sql'); });

  test('RLS enabled on dora_metrics_snapshots', () => {
    expect(sql).toMatch(/ALTER TABLE.*dora_metrics_snapshots.*ENABLE ROW LEVEL SECURITY/i);
  });

  test('RLS enabled on deployment_reports', () => {
    expect(sql).toMatch(/ALTER TABLE.*deployment_reports.*ENABLE ROW LEVEL SECURITY/i);
  });

  test('admin read policy on dora_metrics_snapshots', () => {
    expect(sql).toMatch(/CREATE POLICY.*dora_snapshots_admin_read/i);
    expect(sql).toMatch(/admin.*dora_metrics_snapshots/i);
  });

  test('admin read policy on deployment_reports', () => {
    expect(sql).toMatch(/CREATE POLICY.*deploy_reports_admin_read/i);
  });

  test('service write policy on dora_metrics_snapshots', () => {
    expect(sql).toMatch(/CREATE POLICY.*dora_snapshots_service_write/i);
    expect(sql).toMatch(/service_role[\s\S]*dora_metrics_snapshots/i);
  });

  test('service write policy on deployment_reports', () => {
    expect(sql).toMatch(/CREATE POLICY.*deploy_reports_service_write/i);
  });
});

// ── Section 4: Views ────────────────────────────────────────────────────────

describe('BI-06 Migration: Views', () => {
  let sql;
  beforeAll(() => { sql = readFile('supabase/migrations/v6.39-deploy-reports.sql'); });

  test('creates v_dora_metrics_current view', () => {
    expect(sql).toMatch(/CREATE OR REPLACE VIEW.*v_dora_metrics_current/i);
  });

  test('v_dora_metrics_current includes previous-period comparison', () => {
    expect(sql).toMatch(/prev_deploy_frequency/i);
    expect(sql).toMatch(/prev_lead_time/i);
    expect(sql).toMatch(/prev_mttr/i);
    expect(sql).toMatch(/prev_change_failure_rate/i);
    expect(sql).toMatch(/frequency_change_pct/i);
    expect(sql).toMatch(/lead_time_change_pct/i);
    expect(sql).toMatch(/mttr_change_pct/i);
    expect(sql).toMatch(/cfr_change_pct/i);
  });

  test('creates v_deployment_performance_trends view', () => {
    expect(sql).toMatch(/CREATE OR REPLACE VIEW.*v_deployment_performance_trends/i);
  });

  test('v_deployment_performance_trends includes moving averages', () => {
    expect(sql).toMatch(/freq_7d_avg/i);
    expect(sql).toMatch(/freq_30d_avg/i);
    expect(sql).toMatch(/lead_7d_avg/i);
    expect(sql).toMatch(/lead_30d_avg/i);
    expect(sql).toMatch(/cfr_7d_avg/i);
    expect(sql).toMatch(/cfr_30d_avg/i);
  });

  test('v_deployment_performance_trends limited to 90 days', () => {
    expect(sql).toMatch(/LIMIT 90/i);
  });
});

// ── Section 5: Functions ────────────────────────────────────────────────────

describe('BI-06 Migration: Functions', () => {
  let sql;
  beforeAll(() => { sql = readFile('supabase/migrations/v6.39-deploy-reports.sql'); });

  test('creates fn_calculate_dora_metrics function', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION.*fn_calculate_dora_metrics/i);
  });

  test('fn_calculate_dora_metrics has correct parameters', () => {
    expect(sql).toMatch(/p_period_type\s+TEXT/i);
    expect(sql).toMatch(/p_period_start\s+DATE/i);
    expect(sql).toMatch(/p_period_end\s+DATE/i);
  });

  test('fn_calculate_dora_metrics returns JSONB', () => {
    expect(sql).toMatch(/fn_calculate_dora_metrics[\s\S]*RETURNS JSONB/i);
  });

  test('fn_calculate_dora_metrics reads from deploy_events', () => {
    expect(sql).toMatch(/FROM public\.deploy_events/i);
  });

  test('fn_calculate_dora_metrics reads from rollback_events', () => {
    expect(sql).toMatch(/FROM public\.rollback_events/i);
  });

  test('fn_calculate_dora_metrics reads from deploy_alert_history', () => {
    expect(sql).toMatch(/FROM public\.deploy_alert_history/i);
  });

  test('fn_calculate_dora_metrics reads from deploy_health_log', () => {
    expect(sql).toMatch(/FROM public\.deploy_health_log/i);
  });

  test('fn_calculate_dora_metrics does upsert on UNIQUE conflict', () => {
    expect(sql).toMatch(/ON CONFLICT.*period_type.*period_start/i);
    expect(sql).toMatch(/DO UPDATE SET/i);
  });

  test('DORA classification thresholds for deploy frequency', () => {
    expect(sql).toMatch(/WHEN v_frequency >= 1\.0 THEN 'elite'/i);
  });

  test('DORA classification thresholds for lead time', () => {
    expect(sql).toMatch(/WHEN v_lead_time <= 60 THEN 'elite'/i);
  });

  test('DORA classification thresholds for MTTR', () => {
    expect(sql).toMatch(/WHEN v_mttr <= 60 THEN 'elite'/i);
  });

  test('DORA classification thresholds for change failure rate', () => {
    expect(sql).toMatch(/WHEN v_cfr <= 5 THEN 'elite'/i);
  });

  test('creates fn_generate_deployment_report function', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION.*fn_generate_deployment_report/i);
  });

  test('fn_generate_deployment_report returns JSONB', () => {
    expect(sql).toMatch(/fn_generate_deployment_report[\s\S]*RETURNS JSONB/i);
  });

  test('fn_generate_deployment_report reads from deploy_events', () => {
    var fnBody = sql.slice(sql.indexOf('fn_generate_deployment_report'));
    expect(fnBody).toMatch(/FROM public\.deploy_events/i);
  });

  test('fn_generate_deployment_report reads from rollback_events', () => {
    var fnBody = sql.slice(sql.indexOf('fn_generate_deployment_report'));
    expect(fnBody).toMatch(/FROM public\.rollback_events/i);
  });

  test('fn_generate_deployment_report checks drift', () => {
    var fnBody = sql.slice(sql.indexOf('fn_generate_deployment_report'));
    expect(fnBody).toMatch(/v_environment_drift/i);
  });

  test('fn_generate_deployment_report links to DORA snapshot', () => {
    var fnBody = sql.slice(sql.indexOf('fn_generate_deployment_report'));
    expect(fnBody).toMatch(/dora_metrics_snapshots/i);
  });
});

// ── Section 6: H-02 Event Bus Integration ───────────────────────────────────

describe('BI-06 Migration: Event Bus (H-02)', () => {
  let sql;
  beforeAll(() => { sql = readFile('supabase/migrations/v6.39-deploy-reports.sql'); });

  test('fn_calculate_dora_metrics emits dora.metrics.calculated event', () => {
    expect(sql).toMatch(/fn_emit_event[\s\S]*dora\.metrics\.calculated/i);
  });

  test('fn_generate_deployment_report emits deployment.report.generated event', () => {
    expect(sql).toMatch(/fn_emit_event[\s\S]*deployment\.report\.generated/i);
  });

  test('event bus calls are wrapped in non-fatal exception handlers', () => {
    var count = (sql.match(/EXCEPTION WHEN OTHERS THEN[\s\S]*?H-02 event bus notification failed/gi) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ── Section 7: S-12 Scar Meta ───────────────────────────────────────────────

describe('BI-06 Migration: Scar Meta (S-12)', () => {
  let sql;
  beforeAll(() => { sql = readFile('supabase/migrations/v6.39-deploy-reports.sql'); });

  test('dora_metrics_snapshots has scar_meta JSONB', () => {
    expect(sql).toMatch(/dora_metrics_snapshots[\s\S]*scar_meta\s+JSONB/i);
  });

  test('deployment_reports has scar_meta JSONB', () => {
    expect(sql).toMatch(/deployment_reports[\s\S]*scar_meta\s+JSONB/i);
  });

  test('scar_meta comments reference S-12', () => {
    var s12Comments = (sql.match(/COMMENT ON COLUMN.*scar_meta.*S-12/gi) || []).length;
    expect(s12Comments).toBeGreaterThanOrEqual(2);
  });
});

// ── Section 8: pg_cron ──────────────────────────────────────────────────────

describe('BI-06 Migration: pg_cron schedules', () => {
  let sql;
  beforeAll(() => { sql = readFile('supabase/migrations/v6.39-deploy-reports.sql'); });

  test('daily DORA calculation cron', () => {
    expect(sql).toMatch(/cron\.schedule[\s\S]*bi06-daily-dora-metrics/i);
    expect(sql).toMatch(/15 0 \* \* \*/);
  });

  test('weekly DORA + report cron', () => {
    expect(sql).toMatch(/cron\.schedule[\s\S]*bi06-weekly-dora-report/i);
    expect(sql).toMatch(/30 0 \* \* 1/);
  });

  test('monthly DORA + report cron', () => {
    expect(sql).toMatch(/cron\.schedule[\s\S]*bi06-monthly-dora-report/i);
    expect(sql).toMatch(/0 1 1 \* \*/);
  });

  test('cleanup cron for old snapshots (365d)', () => {
    expect(sql).toMatch(/cron\.schedule[\s\S]*bi06-cleanup-old-snapshots/i);
    expect(sql).toMatch(/365 days/i);
  });

  test('total of 4 pg_cron schedules', () => {
    var matches = sql.match(/cron\.schedule/gi);
    expect(matches).not.toBeNull();
    expect(matches.length).toBe(4);
  });
});

// ── Section 9: Edge Function ────────────────────────────────────────────────

describe('BI-06 Edge Function: deploy-tracker actions', () => {
  let ef;
  beforeAll(() => { ef = readFile('supabase/functions/deploy-tracker/index.ts'); });

  test('dora-metrics action exists', () => {
    expect(ef).toMatch(/action === "dora-metrics"/);
  });

  test('performance-trends action exists', () => {
    expect(ef).toMatch(/action === "performance-trends"/);
  });

  test('deployment-reports action exists', () => {
    expect(ef).toMatch(/action === "deployment-reports"/);
  });

  test('generate-report action exists', () => {
    expect(ef).toMatch(/action === "generate-report"/);
  });

  test('all 4 BI-06 actions in admin auth check', () => {
    expect(ef).toMatch(/dora-metrics.*deployment-reports.*generate-report.*performance-trends|dora-metrics.*performance-trends.*deployment-reports.*generate-report/);
  });

  test('dora-metrics calls fn_calculate_dora_metrics RPC', () => {
    expect(ef).toMatch(/rpc\("fn_calculate_dora_metrics"/);
  });

  test('dora-metrics queries v_dora_metrics_current', () => {
    expect(ef).toMatch(/from\("v_dora_metrics_current"\)/);
  });

  test('performance-trends queries v_deployment_performance_trends', () => {
    expect(ef).toMatch(/from\("v_deployment_performance_trends"\)/);
  });

  test('deployment-reports queries deployment_reports table', () => {
    expect(ef).toMatch(/from\("deployment_reports"\)/);
  });

  test('generate-report calls fn_generate_deployment_report RPC', () => {
    expect(ef).toMatch(/rpc\("fn_generate_deployment_report"/);
  });

  test('generate-report calculates DORA metrics first', () => {
    // generate-report should call fn_calculate_dora_metrics before fn_generate_deployment_report
    var genBlock = ef.slice(ef.indexOf('action === "generate-report"'));
    var doraPos = genBlock.indexOf('fn_calculate_dora_metrics');
    var reportPos = genBlock.indexOf('fn_generate_deployment_report');
    expect(doraPos).toBeLessThan(reportPos);
  });

  test('total actions: 26 (6 BI-01 + 4 BI-02 + 4 BI-03 + 4 BI-04 + 4 BI-05 + 4 BI-06)', () => {
    // Count unique action === "xxx" patterns
    var actionMatches = ef.match(/action === "[a-z\-]+"/g);
    var unique = [...new Set(actionMatches)];
    expect(unique.length).toBeGreaterThanOrEqual(26);
  });
});

// ── Section 10: Admin Panel ─────────────────────────────────────────────────

describe('BI-06 Admin Panel: admin-deploy-reports.js', () => {
  let js;
  beforeAll(() => { js = readFile('js/admin-deploy-reports.js'); });

  test('admin panel file exists', () => {
    expect(fileExists('js/admin-deploy-reports.js')).toBe(true);
  });

  test('defines loadDeployReportsPanel function', () => {
    expect(js).toMatch(/function loadDeployReportsPanel/);
  });

  test('calls dora-metrics action', () => {
    expect(js).toMatch(/_doraAction\('dora-metrics'\)/);
  });

  test('calls performance-trends action', () => {
    expect(js).toMatch(/_doraAction\('performance-trends'/);
  });

  test('calls deployment-reports action', () => {
    expect(js).toMatch(/_doraAction\('deployment-reports'/);
  });

  test('generate-report buttons exist', () => {
    expect(js).toMatch(/dr-gen-weekly/);
    expect(js).toMatch(/dr-gen-monthly/);
    expect(js).toMatch(/dr-gen-ondemand/);
  });

  test('generates weekly report on button click', () => {
    expect(js).toMatch(/_doraAction\('generate-report'.*report_type.*weekly/);
  });

  test('generates monthly report on button click', () => {
    expect(js).toMatch(/_doraAction\('generate-report'.*report_type.*monthly/);
  });

  test('generates on-demand report on button click', () => {
    expect(js).toMatch(/_doraAction\('generate-report'.*report_type.*on_demand/);
  });

  test('renders 4 DORA metric cards', () => {
    expect(js).toMatch(/Deploy Frequency/);
    expect(js).toMatch(/Lead Time/);
    expect(js).toMatch(/Mean Time to Recovery/);
    expect(js).toMatch(/Change Failure Rate/);
  });

  test('renders DORA classification badges (elite/high/medium/low)', () => {
    expect(js).toMatch(/_drClassColor/);
    expect(js).toMatch(/_drClassBg/);
    expect(js).toMatch(/_drClassLabel/);
  });

  test('renders sparkline trends', () => {
    expect(js).toMatch(/_drSparkline/);
    expect(js).toMatch(/Performance Trends/);
  });

  test('renders report history table', () => {
    expect(js).toMatch(/Report History/);
  });

  test('auto-refresh every 2 minutes', () => {
    expect(js).toMatch(/120000/);
    expect(js).toMatch(/_drRefreshTimer/);
  });

  test('refresh button exists', () => {
    expect(js).toMatch(/dr-refresh/);
  });

  test('uses api-gateway with deploy-tracker route', () => {
    expect(js).toMatch(/api-gateway/);
    expect(js).toMatch(/x-gateway-route.*deploy-tracker/);
  });

  test('delta badges for period-over-period comparison', () => {
    expect(js).toMatch(/_drDeltaBadge/);
    expect(js).toMatch(/frequency_change_pct/);
  });
});

// ── Section 11: Admin Integration ───────────────────────────────────────────

describe('BI-06 Admin Integration', () => {
  test('ADMIN_SUBPAGE_MAP has deploy-reports entry', () => {
    var adminJs = readFile('js/admin.js');
    expect(adminJs).toMatch(/'deploy-reports'.*operations.*DORA Reports.*loadDeployReportsPanel/);
  });

  test('admin.html has deploy-reports container', () => {
    var html = readFile('admin.html');
    expect(html).toMatch(/id="admin-panel-deploy-reports"/);
    expect(html).toMatch(/id="admin-page-deploy-reports"/);
  });

  test('admin.html has deploy-reports script tag', () => {
    var html = readFile('admin.html');
    expect(html).toMatch(/admin-deploy-reports\.js/);
  });

  test('admin.html script tag has cache buster', () => {
    var html = readFile('admin.html');
    expect(html).toMatch(/admin-deploy-reports\.js\?v=/);
  });
});

// ── Section 12: Pod Team Manifest ───────────────────────────────────────────

describe('BI-06 Pod Team Manifest', () => {
  let manifest;
  beforeAll(() => { manifest = readFile('docs/scaling/pod-team-manifest.md'); });

  test('BI-06 pairing assignment exists', () => {
    expect(manifest).toMatch(/BI-06/);
  });

  test('BI-06 primary pair is DevOps + Lead Platform Engineer', () => {
    expect(manifest).toMatch(/BI-06.*DevOps.*Lead Platform Engineer/);
  });

  test('BI-06 reviewers include Chief Architect', () => {
    expect(manifest).toMatch(/BI-06.*Chief Architect/);
  });

  test('BI-06 reviewers include Evolvability Strategist', () => {
    expect(manifest).toMatch(/BI-06.*Evolvability Strategist/);
  });

  test('BI-06 reviewers include System Architect—Scalability', () => {
    expect(manifest).toMatch(/BI-06.*System Architect/);
  });
});
