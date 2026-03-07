/**
 * CS-023: Admin Monitoring Dashboards Part 1 Tests
 * 
 * Tests the monitoring dashboard infrastructure (AD-FIX-11)
 * and operational alerts system (AD-FIX-12).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');

// ─── AD-FIX-11: Monitoring Dashboard Infrastructure ───

describe('CS-023: AD-FIX-11 — Monitoring Dashboard', () => {

  it('admin-monitoring.js exists and exports loadMonitoringPanel', () => {
    const path = join(ROOT, 'js/admin-monitoring.js');
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('function loadMonitoringPanel');
    expect(content).toContain('window.loadMonitoringPanel');
  });

  it('monitoring panel includes health check EF integration', () => {
    const content = readFileSync(join(ROOT, 'js/admin-monitoring.js'), 'utf8');
    expect(content).toContain('_loadHealthCheckEF');
    expect(content).toContain('health-check');
    expect(content).toContain('HEALTH_CHECK_URL');
  });

  it('monitoring panel includes cron summary section', () => {
    const content = readFileSync(join(ROOT, 'js/admin-monitoring.js'), 'utf8');
    expect(content).toContain('_loadCronSummary');
    expect(content).toContain('v_cron_health');
    expect(content).toContain('mon-cron-summary');
  });

  it('monitoring panel includes feed freshness section', () => {
    const content = readFileSync(join(ROOT, 'js/admin-monitoring.js'), 'utf8');
    expect(content).toContain('_loadFeedSummary');
    expect(content).toContain('ats_jobs');
    expect(content).toContain('last_seen');
    expect(content).toContain('mon-feed-summary');
  });

  it('monitoring panel includes surface latency probes', () => {
    const content = readFileSync(join(ROOT, 'js/admin-monitoring.js'), 'utf8');
    expect(content).toContain('_loadSurfaceLatency');
    expect(content).toContain('PROD_SURFACES');
    expect(content).toContain('brilliantjobs.app');
    expect(content).toContain('mon-latency-body');
  });

  it('monitoring panel includes recent alerts section', () => {
    const content = readFileSync(join(ROOT, 'js/admin-monitoring.js'), 'utf8');
    expect(content).toContain('_loadRecentAlerts');
    expect(content).toContain('alert_history');
    expect(content).toContain('mon-recent-alerts');
  });

  it('monitoring panel has status banner with health states', () => {
    const content = readFileSync(join(ROOT, 'js/admin-monitoring.js'), 'utf8');
    expect(content).toContain('_updateStatusBanner');
    expect(content).toContain('healthy');
    expect(content).toContain('degraded');
    expect(content).toContain('unhealthy');
    expect(content).toContain('mon-status-banner');
  });

  it('monitoring panel has auto-refresh with cleanup', () => {
    const content = readFileSync(join(ROOT, 'js/admin-monitoring.js'), 'utf8');
    expect(content).toContain('_monitorRefreshTimer');
    expect(content).toContain('setInterval');
    expect(content).toContain('_cleanupMonitoringPanel');
    expect(content).toContain('clearInterval');
  });

  it('monitoring panel has summary cards', () => {
    const content = readFileSync(join(ROOT, 'js/admin-monitoring.js'), 'utf8');
    expect(content).toContain('_loadMonitoringSummary');
    expect(content).toContain('v_monitoring_summary');
    expect(content).toContain('mon-summary-cards');
  });

  it('monitoring panel uses PostHog error reporting', () => {
    const content = readFileSync(join(ROOT, 'js/admin-monitoring.js'), 'utf8');
    expect(content).toContain('reportError');
    expect(content).toContain('admin-monitoring');
  });
});

// ─── AD-FIX-12: Operational Alerts ───

describe('CS-023: AD-FIX-12 — Operational Alerts', () => {

  it('admin-alerts.js exists and exports loadAlertsPanel', () => {
    const path = join(ROOT, 'js/admin-alerts.js');
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('function loadAlertsPanel');
    expect(content).toContain('window.loadAlertsPanel');
  });

  it('alerts panel includes active alerts display', () => {
    const content = readFileSync(join(ROOT, 'js/admin-alerts.js'), 'utf8');
    expect(content).toContain('_loadActiveAlerts');
    expect(content).toContain('alerts-active-body');
    expect(content).toContain("status', 'fired'");
  });

  it('alerts panel includes alert rules CRUD', () => {
    const content = readFileSync(join(ROOT, 'js/admin-alerts.js'), 'utf8');
    expect(content).toContain('_loadAlertRules');
    expect(content).toContain('alert_rules');
    expect(content).toContain('_saveRule');
    expect(content).toContain('_deleteRule');
    expect(content).toContain('_toggleRule');
    expect(content).toContain('_editRule');
  });

  it('alerts panel includes alert history with filtering', () => {
    const content = readFileSync(join(ROOT, 'js/admin-alerts.js'), 'utf8');
    expect(content).toContain('_loadAlertHistory');
    expect(content).toContain('alert-history-table');
    expect(content).toContain('_applyAlertHistoryFilter');
    expect(content).toContain('data-alert-filter');
  });

  it('alerts panel supports acknowledge and resolve workflows', () => {
    const content = readFileSync(join(ROOT, 'js/admin-alerts.js'), 'utf8');
    expect(content).toContain('_ackAlert');
    expect(content).toContain('_resolveAlert');
    expect(content).toContain('acknowledged');
    expect(content).toContain('resolved');
    expect(content).toContain('acknowledged_at');
    expect(content).toContain('resolved_at');
  });

  it('alerts panel includes rule creation modal', () => {
    const content = readFileSync(join(ROOT, 'js/admin-alerts.js'), 'utf8');
    expect(content).toContain('_showRuleModal');
    expect(content).toContain('_hideRuleModal');
    expect(content).toContain('alert-rule-modal');
    expect(content).toContain('rule-name');
    expect(content).toContain('rule-category');
    expect(content).toContain('rule-severity');
  });

  it('alerts panel logs admin actions to audit trail', () => {
    const content = readFileSync(join(ROOT, 'js/admin-alerts.js'), 'utf8');
    expect(content).toContain('_logAdminAction');
    expect(content).toContain('alert_acknowledge');
    expect(content).toContain('alert_resolve');
    expect(content).toContain('alert_rule_toggle');
    expect(content).toContain('alert_rule_delete');
    expect(content).toContain('alert_rule_create');
    expect(content).toContain('alert_rule_update');
  });

  it('alerts panel captures PostHog events', () => {
    const content = readFileSync(join(ROOT, 'js/admin-alerts.js'), 'utf8');
    expect(content).toContain('posthog.capture');
    expect(content).toContain('admin_alert_acknowledged');
    expect(content).toContain('admin_alert_resolved');
    expect(content).toContain('admin_alert_rule_toggled');
    expect(content).toContain('admin_alert_rule_saved');
  });

  it('alerts panel has auto-refresh with cleanup', () => {
    const content = readFileSync(join(ROOT, 'js/admin-alerts.js'), 'utf8');
    expect(content).toContain('_alertsRefreshTimer');
    expect(content).toContain('setInterval');
    expect(content).toContain('_cleanupAlertsPanel');
    expect(content).toContain('clearInterval');
  });

  it('alert rule modal supports all categories', () => {
    const content = readFileSync(join(ROOT, 'js/admin-alerts.js'), 'utf8');
    const categories = ['cron', 'health', 'feed', 'error', 'latency', 'custom'];
    for (const cat of categories) {
      expect(content).toContain(`value="${cat}"`);
    }
  });

  it('alert rule modal supports all severity levels', () => {
    const content = readFileSync(join(ROOT, 'js/admin-alerts.js'), 'utf8');
    const severities = ['info', 'warning', 'critical'];
    for (const sev of severities) {
      expect(content).toContain(`value="${sev}"`);
    }
  });

  it('alert rule condition includes metric, operator, threshold, window', () => {
    const content = readFileSync(join(ROOT, 'js/admin-alerts.js'), 'utf8');
    expect(content).toContain('rule-metric');
    expect(content).toContain('rule-operator');
    expect(content).toContain('rule-threshold');
    expect(content).toContain('rule-window');
    expect(content).toContain('window_minutes');
  });
});

// ─── Admin Integration Tests ───

describe('CS-023: Admin Integration', () => {

  it('admin.js SUBPAGE_MAP includes monitoring and alerts', () => {
    const content = readFileSync(join(ROOT, 'js/admin.js'), 'utf8');
    expect(content).toContain("'monitoring'");
    expect(content).toContain('loadMonitoringPanel');
    expect(content).toContain("'alerts'");
    expect(content).toContain('loadAlertsPanel');
  });

  it('admin.js includes cleanup calls for new panels', () => {
    const content = readFileSync(join(ROOT, 'js/admin.js'), 'utf8');
    expect(content).toContain('_cleanupMonitoringPanel');
    expect(content).toContain('_cleanupAlertsPanel');
  });

  it('admin.html has monitoring and alerts panel containers', () => {
    const content = readFileSync(join(ROOT, 'admin.html'), 'utf8');
    expect(content).toContain('id="admin-panel-monitoring"');
    expect(content).toContain('id="admin-page-monitoring"');
    expect(content).toContain('id="admin-panel-alerts"');
    expect(content).toContain('id="admin-page-alerts"');
  });

  it('build-admin.js includes monitoring and alerts files', () => {
    const content = readFileSync(join(ROOT, 'build-admin.js'), 'utf8');
    expect(content).toContain('admin-monitoring.js');
    expect(content).toContain('admin-alerts.js');
  });

  it('admin bundle builds successfully with new files', () => {
    const bundlePath = join(ROOT, 'dist/admin.min.js');
    expect(existsSync(bundlePath)).toBe(true);
    const content = readFileSync(bundlePath, 'utf8');
    expect(content).toContain('loadMonitoringPanel');
    expect(content).toContain('loadAlertsPanel');
  });

  it('new panels are in the operations section', () => {
    const content = readFileSync(join(ROOT, 'js/admin.js'), 'utf8');
    // Both should be in operations section
    const monMatch = content.match(/'monitoring':\s*\{[^}]*section:\s*'(\w+)'/);
    const alertMatch = content.match(/'alerts':\s*\{[^}]*section:\s*'(\w+)'/);
    expect(monMatch?.[1]).toBe('operations');
    expect(alertMatch?.[1]).toBe('operations');
  });
});

// ─── Migration Tests ───

describe('CS-023: Database Migration', () => {

  it('migration file exists', () => {
    const path = join(ROOT, 'supabase/migrations/20260307_cs023_monitoring_alerts.sql');
    expect(existsSync(path)).toBe(true);
  });

  it('migration creates health_check_log table', () => {
    const content = readFileSync(join(ROOT, 'supabase/migrations/20260307_cs023_monitoring_alerts.sql'), 'utf8');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS public.health_check_log');
    expect(content).toContain('overall');
    expect(content).toContain('checks');
    expect(content).toContain('ENABLE ROW LEVEL SECURITY');
  });

  it('migration creates alert_rules table with all required columns', () => {
    const content = readFileSync(join(ROOT, 'supabase/migrations/20260307_cs023_monitoring_alerts.sql'), 'utf8');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS public.alert_rules');
    expect(content).toContain('category');
    expect(content).toContain('condition');
    expect(content).toContain('severity');
    expect(content).toContain('enabled');
    expect(content).toContain('notify_email');
    expect(content).toContain('notify_posthog');
    expect(content).toContain('cooldown_minutes');
    expect(content).toContain('ENABLE ROW LEVEL SECURITY');
  });

  it('migration creates alert_history table with status workflow', () => {
    const content = readFileSync(join(ROOT, 'supabase/migrations/20260307_cs023_monitoring_alerts.sql'), 'utf8');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS public.alert_history');
    expect(content).toContain("'fired'");
    expect(content).toContain("'acknowledged'");
    expect(content).toContain("'resolved'");
    expect(content).toContain('acknowledged_by');
    expect(content).toContain('ENABLE ROW LEVEL SECURITY');
  });

  it('migration creates v_monitoring_summary view', () => {
    const content = readFileSync(join(ROOT, 'supabase/migrations/20260307_cs023_monitoring_alerts.sql'), 'utf8');
    expect(content).toContain('CREATE OR REPLACE VIEW public.v_monitoring_summary');
    expect(content).toContain('checks_24h');
    expect(content).toContain('unhealthy_24h');
    expect(content).toContain('alerts_24h');
    expect(content).toContain('latest_status');
  });

  it('migration seeds default alert rules', () => {
    const content = readFileSync(join(ROOT, 'supabase/migrations/20260307_cs023_monitoring_alerts.sql'), 'utf8');
    expect(content).toContain('INSERT INTO public.alert_rules');
    expect(content).toContain('Cron job failure');
    expect(content).toContain('Health check degraded');
    expect(content).toContain('Health check unhealthy');
    expect(content).toContain('Feed stale');
    expect(content).toContain('High error rate');
    expect(content).toContain('Surface latency');
  });

  it('migration enforces RLS on all new tables', () => {
    const content = readFileSync(join(ROOT, 'supabase/migrations/20260307_cs023_monitoring_alerts.sql'), 'utf8');
    const rlsMatches = content.match(/ENABLE ROW LEVEL SECURITY/g) || [];
    expect(rlsMatches.length).toBeGreaterThanOrEqual(3); // health_check_log, alert_rules, alert_history
  });

  it('migration grants authenticated read access', () => {
    const content = readFileSync(join(ROOT, 'supabase/migrations/20260307_cs023_monitoring_alerts.sql'), 'utf8');
    expect(content).toContain('GRANT SELECT ON public.health_check_log TO authenticated');
    expect(content).toContain('GRANT SELECT ON public.alert_rules TO authenticated');
    expect(content).toContain('GRANT SELECT ON public.alert_history TO authenticated');
    expect(content).toContain('GRANT SELECT ON public.v_monitoring_summary TO authenticated');
  });
});
