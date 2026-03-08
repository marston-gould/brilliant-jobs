/**
 * SA-028: Capacity Model + Scaling Triggers — Validation Tests
 * Phase S6 — Architecture Governance
 *
 * Tests validate:
 *   1. Migration file structure and completeness
 *   2. Table/function/view/cron definitions
 *   3. Edge Function structure and actions
 *   4. Gateway route registration
 *   5. Admin panel JS structure
 *   6. ADR documentation
 *   7. Integration with S-14 (partition stats) and S-15 (replica routing)
 *   8. Hook H-02 integration (event publishing for critical alerts)
 *   9. Scar S-12 (custom_metrics JSONB bucket)
 *   10. Pod team manifest updates
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readFile(relPath) {
  const full = path.join(ROOT, relPath);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf-8') : null;
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 1: Migration File Structure
// ═══════════════════════════════════════════════════════════════════════════

describe('SA-028 Migration — v6.33-capacity-model.sql', () => {
  const sql = readFile('supabase/migrations/v6.33-capacity-model.sql');

  test('migration file exists', () => {
    expect(sql).not.toBeNull();
  });

  test('migration contains SA-028 session reference', () => {
    expect(sql).toContain('SA-028');
  });

  // Tables
  test('creates capacity_snapshots table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.capacity_snapshots');
  });

  test('creates scaling_trigger_config table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.scaling_trigger_config');
  });

  test('creates scaling_trigger_log table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.scaling_trigger_log');
  });

  test('creates cost_projections table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.cost_projections');
  });

  // RLS
  test('enables RLS on capacity_snapshots', () => {
    expect(sql).toContain('ALTER TABLE public.capacity_snapshots ENABLE ROW LEVEL SECURITY');
  });

  test('enables RLS on scaling_trigger_config', () => {
    expect(sql).toContain('ALTER TABLE public.scaling_trigger_config ENABLE ROW LEVEL SECURITY');
  });

  test('enables RLS on scaling_trigger_log', () => {
    expect(sql).toContain('ALTER TABLE public.scaling_trigger_log ENABLE ROW LEVEL SECURITY');
  });

  test('enables RLS on cost_projections', () => {
    expect(sql).toContain('ALTER TABLE public.cost_projections ENABLE ROW LEVEL SECURITY');
  });

  // Functions
  test('creates fn_capture_capacity_snapshot', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION fn_capture_capacity_snapshot');
  });

  test('creates fn_evaluate_scaling_triggers', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION fn_evaluate_scaling_triggers');
  });

  test('creates fn_capacity_forecast', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION fn_capacity_forecast');
  });

  test('creates fn_cost_model', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION fn_cost_model');
  });

  test('creates fn_capacity_summary', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION fn_capacity_summary');
  });

  // View
  test('creates v_capacity_dashboard view', () => {
    expect(sql).toContain('CREATE OR REPLACE VIEW v_capacity_dashboard');
  });

  // Cron
  test('schedules capacity_snapshot cron (15min)', () => {
    expect(sql).toContain("'capacity_snapshot'");
    expect(sql).toContain('*/15 * * * *');
  });

  test('schedules scaling_trigger_check cron (5min)', () => {
    expect(sql).toContain("'scaling_trigger_check'");
    expect(sql).toContain('*/5 * * * *');
  });

  test('schedules capacity_cleanup cron (daily)', () => {
    expect(sql).toContain("'capacity_cleanup'");
    expect(sql).toContain('90 days');
  });

  // Indexes
  test('creates index on capacity_snapshots.captured_at', () => {
    expect(sql).toContain('idx_capacity_snapshots_captured');
  });

  test('creates index on scaling_trigger_log.created_at', () => {
    expect(sql).toContain('idx_scaling_trigger_log_created');
  });

  test('creates index on unacknowledged alerts', () => {
    expect(sql).toContain('idx_scaling_trigger_log_unacked');
  });

  // Seed data
  test('seeds 8 default scaling triggers', () => {
    expect(sql).toContain('db_connections_high');
    expect(sql).toContain('db_size_large');
    expect(sql).toContain('ats_jobs_volume');
    expect(sql).toContain('replica_lag_high');
    expect(sql).toContain('ef_error_rate_high');
    expect(sql).toContain('budget_utilization_high');
    expect(sql).toContain('active_users_growth');
    expect(sql).toContain('agent_cost_spike');
  });

  test('seeds 12 service cost projections', () => {
    expect(sql).toContain("'supabase'");
    expect(sql).toContain("'vercel'");
    expect(sql).toContain("'cloudflare'");
    expect(sql).toContain("'anthropic'");
    expect(sql).toContain("'resend'");
    expect(sql).toContain("'posthog'");
    expect(sql).toContain("'github'");
    expect(sql).toContain("'stripe'");
    expect(sql).toContain("'vonage'");
    expect(sql).toContain("'dataforseo'");
    expect(sql).toContain("'canny'");
    expect(sql).toContain("'typesense'");
  });

  // Agent action log
  test('logs migration in agent_action_log', () => {
    expect(sql).toContain('agent_action_log');
    expect(sql).toContain('v6.33-capacity-model');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 2: Integration Points
// ═══════════════════════════════════════════════════════════════════════════

describe('SA-028 Integration — S-14 Partition Stats + S-15 Replica Routing', () => {
  const sql = readFile('supabase/migrations/v6.33-capacity-model.sql');

  test('snapshot function queries v_partition_stats (S-14)', () => {
    expect(sql).toContain('v_partition_stats');
  });

  test('snapshot function queries replica_routing_stats (S-15)', () => {
    expect(sql).toContain('replica_routing_stats');
  });

  test('snapshot function queries replica_health_log', () => {
    expect(sql).toContain('replica_health_log');
  });

  test('snapshot captures partition_ats_rows', () => {
    expect(sql).toContain('partition_ats_rows');
  });

  test('snapshot captures partition_cc_rows', () => {
    expect(sql).toContain('partition_cc_rows');
  });

  test('snapshot captures replica_read_count', () => {
    expect(sql).toContain('replica_read_count');
  });

  test('trigger evaluation uses H-02 (fn_publish_event) for critical alerts', () => {
    expect(sql).toContain('fn_publish_event');
    expect(sql).toContain('capacity.trigger.critical');
  });

  test('capacity_snapshots has S-12 scar (custom_metrics JSONB)', () => {
    expect(sql).toContain('custom_metrics');
    expect(sql).toContain("jsonb DEFAULT '{}'::jsonb");
  });

  test('trigger function queries vendor_cost_budgets from SA-020', () => {
    expect(sql).toContain('vendor_cost_budgets');
  });

  test('snapshot function queries agent_action_log for agent metrics', () => {
    expect(sql).toContain('agent_action_log');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 3: Edge Function Structure
// ═══════════════════════════════════════════════════════════════════════════

describe('SA-028 Edge Function — capacity-model', () => {
  const ef = readFile('supabase/functions/capacity-model/index.ts');

  test('capacity-model EF exists', () => {
    expect(ef).not.toBeNull();
  });

  test('EF contains SA-028 session reference', () => {
    expect(ef).toContain('SA-028');
  });

  test('EF imports API_VERSION', () => {
    expect(ef).toContain('API_VERSION');
  });

  test('EF has CORS headers for brilliantjobs.app', () => {
    expect(ef).toContain('brilliantjobs.app');
  });

  test('EF enforces admin role check', () => {
    expect(ef).toContain('x-gateway-user-role');
    expect(ef).toContain('Admin access required');
  });

  // Actions
  test('EF supports snapshot action', () => {
    expect(ef).toContain("case \"snapshot\"");
    expect(ef).toContain('fn_capture_capacity_snapshot');
  });

  test('EF supports forecast action', () => {
    expect(ef).toContain("case \"forecast\"");
    expect(ef).toContain('fn_capacity_forecast');
  });

  test('EF supports cost-model action', () => {
    expect(ef).toContain("case \"cost-model\"");
    expect(ef).toContain('fn_cost_model');
  });

  test('EF supports triggers action', () => {
    expect(ef).toContain("case \"triggers\"");
    expect(ef).toContain('fn_evaluate_scaling_triggers');
  });

  test('EF supports summary action', () => {
    expect(ef).toContain("case \"summary\"");
    expect(ef).toContain('fn_capacity_summary');
  });

  test('EF supports acknowledge action', () => {
    expect(ef).toContain("case \"acknowledge\"");
    expect(ef).toContain('acknowledged_at');
  });

  test('EF returns snapshot history for trend charts', () => {
    expect(ef).toContain('snapshot_history_24h');
  });

  test('EF accepts configurable growth_rate_pct', () => {
    expect(ef).toContain('growth_rate_pct');
  });

  test('EF handles unknown actions gracefully', () => {
    expect(ef).toContain('Unknown action');
    expect(ef).toContain('valid_actions');
  });

  test('EF has typed error handling', () => {
    expect(ef).toContain('err instanceof Error');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 4: Gateway Route Registration
// ═══════════════════════════════════════════════════════════════════════════

describe('SA-028 Gateway — Route Registration', () => {
  const gw = readFile('supabase/functions/api-gateway/index.ts');

  test('gateway registers capacity-model route', () => {
    expect(gw).toContain('"capacity-model"');
  });

  test('gateway route comment references SA-028', () => {
    expect(gw).toContain('SA-028');
  });

  test('gateway total route count updated to 109', () => {
    expect(gw).toContain('109 routes');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 5: Admin Panel JS
// ═══════════════════════════════════════════════════════════════════════════

describe('SA-028 Admin Panel — admin-capacity.js', () => {
  const js = readFile('js/admin-capacity.js');

  test('admin-capacity.js exists', () => {
    expect(js).not.toBeNull();
  });

  test('JS contains SA-028 session reference', () => {
    expect(js).toContain('SA-028');
  });

  test('JS exposes refreshCapacityDashboard on window', () => {
    expect(js).toContain('window.refreshCapacityDashboard');
  });

  test('JS renders health overview with stat cards', () => {
    expect(js).toContain('System Health');
    expect(js).toContain('Total Users');
    expect(js).toContain('Database Size');
    expect(js).toContain('Connections');
    expect(js).toContain('Replica Lag');
    expect(js).toContain('Budget Used');
  });

  test('JS renders growth forecast table', () => {
    expect(js).toContain('Growth Forecast');
    expect(js).toContain('6 Months');
    expect(js).toContain('12 Months');
    expect(js).toContain('24 Months');
  });

  test('JS renders cost model table with tier badges', () => {
    expect(js).toContain('Cost Model by Service');
    expect(js).toContain('_tierBadge');
  });

  test('JS renders scaling trigger alerts with acknowledge', () => {
    expect(js).toContain('Scaling Triggers');
    expect(js).toContain('acknowledgeAlert');
  });

  test('JS renders 24h trend sparklines', () => {
    expect(js).toContain('24-Hour Trends');
    expect(js).toContain('_sparkline');
    expect(js).toContain('<polyline');
  });

  test('JS supports growth rate change', () => {
    expect(js).toContain('changeGrowthRate');
    expect(js).toContain('growth_rate_pct');
  });

  test('JS supports manual trigger evaluation', () => {
    expect(js).toContain('evaluateTriggersNow');
  });

  test('JS has error handling via reportError', () => {
    expect(js).toContain('reportError');
  });

  test('JS routes through api-gateway', () => {
    expect(js).toContain('api-gateway');
    expect(js).toContain('capacity-model');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 6: Pod Team Manifest
// ═══════════════════════════════════════════════════════════════════════════

describe('SA-028 Team Manifest Updates', () => {
  const manifest = readFile('docs/scaling/pod-team-manifest.md');

  test('pod-team-manifest.md exists', () => {
    expect(manifest).not.toBeNull();
  });

  test('manifest includes SA-028 pairing assignment', () => {
    expect(manifest).toContain('SA-028');
  });

  test('manifest includes SA-029 pairing assignment', () => {
    expect(manifest).toContain('SA-029');
  });

  test('manifest includes S5→S6 phase transition review', () => {
    expect(manifest).toContain('S5 → S6');
  });

  test('manifest includes S6 Final review', () => {
    expect(manifest).toContain('S6 Final');
  });

  test('SA-028 pair is System Architect + DevOps + Data Eng', () => {
    expect(manifest).toMatch(/SA-028.*System Architect/);
    expect(manifest).toMatch(/SA-028.*DevOps/);
    expect(manifest).toMatch(/SA-028.*Data Eng/);
  });

  test('SA-028 reviewer is Chief Architect', () => {
    expect(manifest).toMatch(/SA-028.*Chief Architect/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 7: ADR Documentation
// ═══════════════════════════════════════════════════════════════════════════

describe('SA-028 ADR Documentation', () => {
  // SA-028 docs should be in adr-06-pipeline.md (capacity is a pipeline/infra concern)
  // or in a dedicated capacity model doc
  const adr06 = readFile('docs/scaling/adr-06-pipeline.md');

  test('ADR-06 pipeline doc exists', () => {
    expect(adr06).not.toBeNull();
  });

  // Architecture blueprint should reference capacity model
  const blueprint = readFile('docs/scaling/architecture-blueprint.md');

  test('architecture blueprint exists', () => {
    expect(blueprint).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 8: Scaling Trigger Design
// ═══════════════════════════════════════════════════════════════════════════

describe('SA-028 Scaling Trigger Design', () => {
  const sql = readFile('supabase/migrations/v6.33-capacity-model.sql');

  test('triggers have configurable cooldown', () => {
    expect(sql).toContain('cooldown_mins');
  });

  test('triggers have warn and critical thresholds', () => {
    expect(sql).toContain('threshold_warn');
    expect(sql).toContain('threshold_crit');
  });

  test('triggers have action_type (alert, alert+recommend, auto-scale)', () => {
    expect(sql).toContain('alert');
    expect(sql).toContain('alert+recommend');
    expect(sql).toContain('auto-scale');
  });

  test('triggers are admin-toggleable via is_enabled', () => {
    expect(sql).toContain('is_enabled');
  });

  test('trigger log supports acknowledgment workflow', () => {
    expect(sql).toContain('acknowledged_at');
    expect(sql).toContain('acknowledged_by');
  });

  test('trigger evaluation respects cooldown period', () => {
    expect(sql).toContain('cooldown_mins');
    expect(sql).toContain('last_triggered');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 9: Cost Model Design
// ═══════════════════════════════════════════════════════════════════════════

describe('SA-028 Cost Model Design', () => {
  const sql = readFile('supabase/migrations/v6.33-capacity-model.sql');

  test('cost model supports tiered pricing for Supabase', () => {
    expect(sql).toContain("WHERE service_name = 'supabase'");
    expect(sql).toContain("'Team'");
    expect(sql).toContain("'Enterprise'");
  });

  test('cost model supports usage-based pricing for Anthropic', () => {
    expect(sql).toContain("WHERE service_name = 'anthropic'");
  });

  test('cost model tracks per-user cost', () => {
    expect(sql).toContain('cost_per_user');
  });

  test('cost model projects at 3 horizons (6/12/24 months)', () => {
    expect(sql).toContain('cost_6mo');
    expect(sql).toContain('cost_12mo');
    expect(sql).toContain('cost_24mo');
  });

  test('cost model tracks tier transitions', () => {
    expect(sql).toContain('tier_6mo');
    expect(sql).toContain('tier_12mo');
    expect(sql).toContain('tier_24mo');
  });

  test('growth rate is configurable per computation', () => {
    expect(sql).toContain('p_growth_rate_pct');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 10: Load Test Back-Testing
// ═══════════════════════════════════════════════════════════════════════════

describe('SA-028 Load Test Integration', () => {
  test('load test config exists (SA-023 prerequisite)', () => {
    expect(fileExists('load-tests/config.js')).toBe(true);
  });

  test('load test full-suite exists', () => {
    expect(fileExists('load-tests/full-suite.js')).toBe(true);
  });

  test('load test targets 1,200 concurrent users', () => {
    const config = readFile('load-tests/config.js');
    expect(config).toContain('1200');
  });

  test('load test includes spike scenario at 1,500', () => {
    const config = readFile('load-tests/config.js');
    expect(config).toContain('1500');
  });

  test('scaling triggers reference connection thresholds from load test', () => {
    const sql = readFile('supabase/migrations/v6.33-capacity-model.sql');
    // 270 critical connections aligns with Supavisor pool size from CS-009
    expect(sql).toContain('270');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 11: File Inventory
// ═══════════════════════════════════════════════════════════════════════════

describe('SA-028 File Inventory', () => {
  test('migration file exists', () => {
    expect(fileExists('supabase/migrations/v6.33-capacity-model.sql')).toBe(true);
  });

  test('capacity-model EF exists', () => {
    expect(fileExists('supabase/functions/capacity-model/index.ts')).toBe(true);
  });

  test('admin-capacity.js exists', () => {
    expect(fileExists('js/admin-capacity.js')).toBe(true);
  });

  test('tests file exists', () => {
    expect(fileExists('tests/sa-028-capacity-model.test.js')).toBe(true);
  });

  test('pod-team-manifest.md updated', () => {
    expect(fileExists('docs/scaling/pod-team-manifest.md')).toBe(true);
  });

  test('architecture-blueprint.md exists', () => {
    expect(fileExists('docs/scaling/architecture-blueprint.md')).toBe(true);
  });
});
