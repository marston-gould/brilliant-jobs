/**
 * CS-024: Admin Monitoring Dashboards Part 2 Tests
 * 
 * Tests the error replay integration (AD-FIX-13),
 * Edge Function health dashboard (AD-FIX-14),
 * and database activity panel (AD-FIX-15).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');

// ─── AD-FIX-13: Error Replay Integration ───

describe('CS-024: AD-FIX-13 — Error Replay Integration', () => {

  it('admin-error-replay.js exists and exports loadErrorReplayPanel', () => {
    const path = join(ROOT, 'js/admin-error-replay.js');
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('function loadErrorReplayPanel');
    expect(content).toContain('window.loadErrorReplayPanel');
  });

  it('error replay panel includes PostHog session replay URL construction', () => {
    const content = readFileSync(join(ROOT, 'js/admin-error-replay.js'), 'utf8');
    expect(content).toContain('replay_url');
    expect(content).toContain('Replay');
    expect(content).toContain('posthog-errors');
  });

  it('error replay panel includes both query errors and exceptions', () => {
    const content = readFileSync(join(ROOT, 'js/admin-error-replay.js'), 'utf8');
    expect(content).toContain('_renderErrorEvents');
    expect(content).toContain('_renderExceptionEvents');
    expect(content).toContain('Query Errors');
    expect(content).toContain('Autocaptured Exceptions');
  });

  it('error replay panel has time range filter', () => {
    const content = readFileSync(join(ROOT, 'js/admin-error-replay.js'), 'utf8');
    expect(content).toContain('er-hours-filter');
    expect(content).toContain('_errorReplayHoursFilter');
    expect(content).toContain('Last 1h');
    expect(content).toContain('Last 24h');
    expect(content).toContain('Last 7d');
  });

  it('error replay panel has summary cards', () => {
    const content = readFileSync(join(ROOT, 'js/admin-error-replay.js'), 'utf8');
    expect(content).toContain('er-total-errors');
    expect(content).toContain('er-total-exceptions');
    expect(content).toContain('er-with-replay');
    expect(content).toContain('er-unique-labels');
  });

  it('error replay panel has auto-refresh and cleanup', () => {
    const content = readFileSync(join(ROOT, 'js/admin-error-replay.js'), 'utf8');
    expect(content).toContain('_errorReplayRefreshTimer');
    expect(content).toContain('setInterval');
    expect(content).toContain('_cleanupErrorReplayPanel');
    expect(content).toContain('window._cleanupErrorReplayPanel');
  });

  it('error replay panel escapes HTML output', () => {
    const content = readFileSync(join(ROOT, 'js/admin-error-replay.js'), 'utf8');
    expect(content).toContain('_erEsc');
    expect(content).toContain('&amp;');
    expect(content).toContain('&lt;');
  });

  it('error replay uses auth token for API calls', () => {
    const content = readFileSync(join(ROOT, 'js/admin-error-replay.js'), 'utf8');
    expect(content).toContain('sb.auth.getSession');
    expect(content).toContain('Authorization');
    expect(content).toContain('Bearer');
  });
});

// ─── AD-FIX-14: Edge Function Health Dashboard ───

describe('CS-024: AD-FIX-14 — Edge Function Health Dashboard', () => {

  it('admin-ef-health.js exists and exports loadEfHealthPanel', () => {
    const path = join(ROOT, 'js/admin-ef-health.js');
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('function loadEfHealthPanel');
    expect(content).toContain('window.loadEfHealthPanel');
  });

  it('EF health panel shows latency metrics (p50/p95/p99)', () => {
    const content = readFileSync(join(ROOT, 'js/admin-ef-health.js'), 'utf8');
    expect(content).toContain('p50');
    expect(content).toContain('p95');
    expect(content).toContain('p99');
    expect(content).toContain('latency_p50');
    expect(content).toContain('latency_p95');
    expect(content).toContain('latency_p99');
  });

  it('EF health panel shows invocation counts and success rates', () => {
    const content = readFileSync(join(ROOT, 'js/admin-ef-health.js'), 'utf8');
    expect(content).toContain('Invocations');
    expect(content).toContain('Success %');
    expect(content).toContain('success_rate');
  });

  it('EF health panel shows deployed functions list', () => {
    const content = readFileSync(join(ROOT, 'js/admin-ef-health.js'), 'utf8');
    expect(content).toContain('_renderFunctionsList');
    expect(content).toContain('Deployed Edge Functions');
    expect(content).toContain('efh-functions-list');
  });

  it('EF health panel shows last health check detail', () => {
    const content = readFileSync(join(ROOT, 'js/admin-ef-health.js'), 'utf8');
    expect(content).toContain('_renderLastCheck');
    expect(content).toContain('Latest Health Check');
    expect(content).toContain('efh-last-check-body');
  });

  it('EF health panel has summary cards', () => {
    const content = readFileSync(join(ROOT, 'js/admin-ef-health.js'), 'utf8');
    expect(content).toContain('efh-total-functions');
    expect(content).toContain('efh-total-checks');
    expect(content).toContain('efh-healthy-pct');
    expect(content).toContain('efh-last-status');
  });

  it('EF health panel has auto-refresh and cleanup', () => {
    const content = readFileSync(join(ROOT, 'js/admin-ef-health.js'), 'utf8');
    expect(content).toContain('_efHealthRefreshTimer');
    expect(content).toContain('setInterval');
    expect(content).toContain('_cleanupEfHealthPanel');
    expect(content).toContain('window._cleanupEfHealthPanel');
  });

  it('EF health panel color-codes success rates and latency', () => {
    const content = readFileSync(join(ROOT, 'js/admin-ef-health.js'), 'utf8');
    // Check for conditional color styling
    expect(content).toContain('#22c55e');  // green
    expect(content).toContain('#f59e0b');  // amber
    expect(content).toContain('#ef4444');  // red
  });
});

// ─── AD-FIX-15: Database Activity Panel ───

describe('CS-024: AD-FIX-15 — Database Activity Panel', () => {

  it('admin-db-activity.js exists and exports loadDbActivityPanel', () => {
    const path = join(ROOT, 'js/admin-db-activity.js');
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('function loadDbActivityPanel');
    expect(content).toContain('window.loadDbActivityPanel');
  });

  it('DB activity panel shows connections by state', () => {
    const content = readFileSync(join(ROOT, 'js/admin-db-activity.js'), 'utf8');
    expect(content).toContain('Connections by State');
    expect(content).toContain('_renderConnections');
    expect(content).toContain('dba-connections-body');
  });

  it('DB activity panel shows table sizes', () => {
    const content = readFileSync(join(ROOT, 'js/admin-db-activity.js'), 'utf8');
    expect(content).toContain('Table Sizes');
    expect(content).toContain('_renderTableSizes');
    expect(content).toContain('dba-tables-body');
    expect(content).toContain('row_estimate');
    expect(content).toContain('total_size');
    expect(content).toContain('index_size');
  });

  it('DB activity panel shows slow queries', () => {
    const content = readFileSync(join(ROOT, 'js/admin-db-activity.js'), 'utf8');
    expect(content).toContain('Slow Queries');
    expect(content).toContain('_renderSlowQueries');
    expect(content).toContain('dba-queries-body');
    expect(content).toContain('mean_time_ms');
    expect(content).toContain('max_time_ms');
  });

  it('DB activity panel has summary cards (size, connections, usage %)', () => {
    const content = readFileSync(join(ROOT, 'js/admin-db-activity.js'), 'utf8');
    expect(content).toContain('dba-db-size');
    expect(content).toContain('dba-active-conn');
    expect(content).toContain('dba-max-conn');
    expect(content).toContain('dba-conn-pct');
    expect(content).toContain('Connection Usage');
  });

  it('DB activity panel has visual connection bars', () => {
    const content = readFileSync(join(ROOT, 'js/admin-db-activity.js'), 'utf8');
    expect(content).toContain('stateColors');
    expect(content).toContain('active');
    expect(content).toContain('idle');
    expect(content).toContain('idle in transaction');
  });

  it('DB activity panel handles pg_stat_statements not enabled gracefully', () => {
    const content = readFileSync(join(ROOT, 'js/admin-db-activity.js'), 'utf8');
    expect(content).toContain('not enabled');
    expect(content).toContain('pg_stat_statements');
  });

  it('DB activity panel has auto-refresh and cleanup', () => {
    const content = readFileSync(join(ROOT, 'js/admin-db-activity.js'), 'utf8');
    expect(content).toContain('_dbActivityRefreshTimer');
    expect(content).toContain('setInterval');
    expect(content).toContain('_cleanupDbActivityPanel');
    expect(content).toContain('window._cleanupDbActivityPanel');
  });
});

// ─── Cross-cutting: Admin Infrastructure ───

describe('CS-024: Admin Infrastructure Integration', () => {

  it('admin.js registers all 3 new subpages', () => {
    const content = readFileSync(join(ROOT, 'js/admin.js'), 'utf8');
    expect(content).toContain("'error-replay'");
    expect(content).toContain("'ef-health'");
    expect(content).toContain("'db-activity'");
    expect(content).toContain('loadErrorReplayPanel');
    expect(content).toContain('loadEfHealthPanel');
    expect(content).toContain('loadDbActivityPanel');
  });

  it('admin.js includes cleanup calls for all 3 new panels', () => {
    const content = readFileSync(join(ROOT, 'js/admin.js'), 'utf8');
    expect(content).toContain('_cleanupErrorReplayPanel');
    expect(content).toContain('_cleanupEfHealthPanel');
    expect(content).toContain('_cleanupDbActivityPanel');
  });

  it('admin.html has panel containers for all 3 new pages', () => {
    const content = readFileSync(join(ROOT, 'admin.html'), 'utf8');
    expect(content).toContain('admin-panel-error-replay');
    expect(content).toContain('admin-panel-ef-health');
    expect(content).toContain('admin-panel-db-activity');
    expect(content).toContain('admin-page-error-replay');
    expect(content).toContain('admin-page-ef-health');
    expect(content).toContain('admin-page-db-activity');
  });

  it('build-admin.js includes all 3 new JS files', () => {
    const content = readFileSync(join(ROOT, 'build-admin.js'), 'utf8');
    expect(content).toContain('admin-error-replay.js');
    expect(content).toContain('admin-ef-health.js');
    expect(content).toContain('admin-db-activity.js');
  });

  it('admin-analytics Edge Function exists with all 3 action handlers', () => {
    const path = join(ROOT, 'supabase/functions/admin-analytics/index.ts');
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('posthog-errors');
    expect(content).toContain('ef-health');
    expect(content).toContain('db-activity');
    expect(content).toContain('requireAdmin');
    expect(content).toContain('POSTHOG_PERSONAL_API_KEY');
  });

  it('admin-analytics EF enforces admin auth via shared middleware (G11)', () => {
    const content = readFileSync(join(ROOT, 'supabase/functions/admin-analytics/index.ts'), 'utf8');
    expect(content).toContain('requireAdmin');
    expect(content).toContain('authErrorResponse');
    expect(content).toContain("_shared/admin-auth.ts");
  });

  it('admin-analytics EF constructs PostHog session replay URLs', () => {
    const content = readFileSync(join(ROOT, 'supabase/functions/admin-analytics/index.ts'), 'utf8');
    expect(content).toContain('replay');
    expect(content).toContain('$session_id');
    expect(content).toContain('POSTHOG_PROJECT_ID');
  });

  it('admin-analytics EF includes percentile calculation for latency', () => {
    const content = readFileSync(join(ROOT, 'supabase/functions/admin-analytics/index.ts'), 'utf8');
    expect(content).toContain('function percentile');
    expect(content).toContain('latency_p50');
    expect(content).toContain('latency_p95');
    expect(content).toContain('latency_p99');
  });

  it('CS-024 migration creates DB activity SQL functions', () => {
    const path = join(ROOT, 'supabase/migrations/20260307_cs024_admin_analytics.sql');
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('admin_db_connections');
    expect(content).toContain('admin_db_table_sizes');
    expect(content).toContain('admin_db_slow_queries');
    expect(content).toContain('admin_db_size');
    expect(content).toContain('pg_stat_activity');
    expect(content).toContain('pg_stat_user_tables');
    expect(content).toContain('pg_stat_statements');
    expect(content).toContain('SECURITY DEFINER');
  });

  it('CS-024 migration grants execute to authenticated role', () => {
    const content = readFileSync(join(ROOT, 'supabase/migrations/20260307_cs024_admin_analytics.sql'), 'utf8');
    const grants = content.match(/GRANT EXECUTE/g) || [];
    expect(grants.length).toBe(4);  // One per function
  });

  it('all admin JS files use consistent error reporting pattern', () => {
    const files = ['admin-error-replay.js', 'admin-ef-health.js', 'admin-db-activity.js'];
    files.forEach(function(file) {
      const content = readFileSync(join(ROOT, 'js', file), 'utf8');
      expect(content).toContain('reportError');
      expect(content).toContain('admin-analytics');
    });
  });
});
