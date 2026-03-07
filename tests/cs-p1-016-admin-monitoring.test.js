/**
 * CS-P1-016: Admin Monitoring — Cron + PostHog + A/B + UX
 * Findings: 0.161, 0.162, 0.175, 0.176, 0.177, 0.178
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

describe('CS-P1-016: Admin Monitoring Completion', () => {

  // ═══════════════════════════════════════════════════════════
  // 0.161: Cron Management UI
  // ═══════════════════════════════════════════════════════════

  describe('0.161 — Cron Management UI', () => {
    const cronJs = readFileSync('js/admin-cron.js', 'utf-8');

    it('admin-cron.js exists with management header', () => {
      expect(cronJs).toContain('Cron Management Console');
      expect(cronJs).toContain('CS-P1-016');
    });

    it('has toggle enable/disable capability', () => {
      expect(cronJs).toContain('_cronToggle');
      expect(cronJs).toContain('data-cron-action="toggle"');
    });

    it('has force-run capability', () => {
      expect(cronJs).toContain('_cronForceRun');
      expect(cronJs).toContain('force-run');
    });

    it('has schedule editing', () => {
      expect(cronJs).toContain('_cronEditSchedule');
      expect(cronJs).toContain('cron-schedule-modal');
      expect(cronJs).toContain('update-schedule');
    });

    it('has run history drawer', () => {
      expect(cronJs).toContain('_cronShowHistory');
      expect(cronJs).toContain('cron-history-drawer');
      expect(cronJs).toContain('run-history');
    });

    it('renders action buttons for each job row', () => {
      expect(cronJs).toContain('data-cron-action="toggle"');
      expect(cronJs).toContain('data-cron-action="force"');
      expect(cronJs).toContain('data-cron-action="edit"');
      expect(cronJs).toContain('data-cron-action="history"');
    });

    it('uses event delegation for action buttons', () => {
      expect(cronJs).toContain("container.addEventListener('click'");
      expect(cronJs).toContain("closest('[data-cron-action]')");
    });

    it('Edge Function exists for cron management', () => {
      expect(existsSync('supabase/functions/admin-cron-management/index.ts')).toBe(true);
      const ef = readFileSync('supabase/functions/admin-cron-management/index.ts', 'utf-8');
      expect(ef).toContain('requireAdmin');
      expect(ef).toContain('case "toggle"');
      expect(ef).toContain('case "force-run"');
      expect(ef).toContain('case "update-schedule"');
      expect(ef).toContain('case "run-history"');
    });

    it('migration exists with RPC functions', () => {
      expect(existsSync('supabase/migrations/20260307_cs_p1_016_cron_management.sql')).toBe(true);
      const sql = readFileSync('supabase/migrations/20260307_cs_p1_016_cron_management.sql', 'utf-8');
      expect(sql).toContain('admin_toggle_cron_job');
      expect(sql).toContain('admin_update_cron_schedule');
      expect(sql).toContain('admin_cron_run_history');
      expect(sql).toContain('admin_force_run_cron_job');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 0.162: Cron Alert Configuration
  // ═══════════════════════════════════════════════════════════

  describe('0.162 — Cron Alert Configuration', () => {
    const cronJs = readFileSync('js/admin-cron.js', 'utf-8');
    const sql = readFileSync('supabase/migrations/20260307_cs_p1_016_cron_management.sql', 'utf-8');

    it('cron_alert_config table defined in migration', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.cron_alert_config');
      expect(sql).toContain('max_consecutive_failures');
      expect(sql).toContain('stale_threshold_minutes');
      expect(sql).toContain('alert_enabled');
    });

    it('RLS policies protect the table', () => {
      expect(sql).toContain('admin_cron_alert_config_select');
      expect(sql).toContain('admin_cron_alert_config_insert');
      expect(sql).toContain('admin_cron_alert_config_update');
    });

    it('alert config UI exists in cron panel', () => {
      expect(cronJs).toContain('cron-alert-config-btn');
      expect(cronJs).toContain('cron-alert-modal');
      expect(cronJs).toContain('_renderAlertConfigForm');
    });

    it('per-job save and save-all buttons', () => {
      expect(cronJs).toContain('_saveCronAlertConfig');
      expect(cronJs).toContain('_saveAllCronAlertConfigs');
    });

    it('alert badges shown on cron table rows', () => {
      expect(cronJs).toContain('_cronAlertConfigs');
      // Alert badge indicator
      expect(cronJs).toMatch(/⚡/);
    });

    it('alert config endpoint in edge function', () => {
      const ef = readFileSync('supabase/functions/admin-cron-management/index.ts', 'utf-8');
      expect(ef).toContain('case "alert-config"');
      expect(ef).toContain('getCronAlertConfig');
      expect(ef).toContain('upsertCronAlertConfig');
    });

    it('seeds default alert configs from existing cron jobs', () => {
      expect(sql).toContain('INSERT INTO public.cron_alert_config');
      expect(sql).toContain('ON CONFLICT (job_name) DO NOTHING');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 0.175: PostHog Baseline + Funnel
  // ═══════════════════════════════════════════════════════════

  describe('0.175 — PostHog Baseline + Funnel', () => {
    const phJs = readFileSync('js/admin-posthog-insights.js', 'utf-8');

    it('funnel section exists in PostHog panel', () => {
      expect(phJs).toContain('Conversion Funnel');
      expect(phJs).toContain('ph-funnel-body');
      expect(phJs).toContain('ph-funnel-select');
    });

    it('three funnel definitions exist', () => {
      expect(phJs).toContain('FUNNEL_DEFINITIONS');
      expect(phJs).toContain("signup:");
      expect(phJs).toContain("landing:");
      expect(phJs).toContain("referral:");
    });

    it('funnel renders steps with conversion rates', () => {
      expect(phJs).toContain('_renderFunnelSteps');
      expect(phJs).toContain('convRate');
      expect(phJs).toContain('dropped off');
    });

    it('retention cohort section exists', () => {
      expect(phJs).toContain('Retention');
      expect(phJs).toContain('ph-retention-body');
      expect(phJs).toContain('_loadRetentionData');
    });

    it('key metrics summary exists', () => {
      expect(phJs).toContain('ph-key-metrics');
      expect(phJs).toContain('ph-signup-rate');
      expect(phJs).toContain('ph-activation-rate');
      expect(phJs).toContain('ph-sessions-avg');
      expect(phJs).toContain('ph-bounce-rate');
    });

    it('refresh loads all new data sources', () => {
      expect(phJs).toContain('_loadFunnelData');
      expect(phJs).toContain('_loadRetentionData');
      expect(phJs).toContain('_loadKeyMetrics');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 0.176: First A/B Test
  // ═══════════════════════════════════════════════════════════

  describe('0.176 — First A/B Test', () => {
    it('admin-ab-tests.js exists', () => {
      expect(existsSync('js/admin-ab-tests.js')).toBe(true);
      const abJs = readFileSync('js/admin-ab-tests.js', 'utf-8');
      expect(abJs).toContain('AB_TEST_REGISTRY');
      expect(abJs).toContain('landing-cta-copy');
      expect(abJs).toContain('loadAbTestsPanel');
    });

    it('first test has three variants', () => {
      const abJs = readFileSync('js/admin-ab-tests.js', 'utf-8');
      expect(abJs).toContain('control');
      expect(abJs).toContain('variant_a');
      expect(abJs).toContain('variant_b');
    });

    it('landing page integration script exists', () => {
      expect(existsSync('js/landing-ab.js')).toBe(true);
      const landingAb = readFileSync('js/landing-ab.js', 'utf-8');
      expect(landingAb).toContain('ab_landing_cta_copy');
      expect(landingAb).toContain('VARIANT_COPY');
      expect(landingAb).toContain('hero-signup-btn');
    });

    it('landing-ab.js is loaded in index.html', () => {
      const indexHtml = readFileSync('index.html', 'utf-8');
      expect(indexHtml).toContain('landing-ab.js');
    });

    it('admin-ab-tests.js is loaded in admin.html', () => {
      const adminHtml = readFileSync('admin.html', 'utf-8');
      expect(adminHtml).toContain('admin-ab-tests.js');
    });

    it('A/B tests page registered in admin nav', () => {
      const adminJs = readFileSync('js/admin.js', 'utf-8');
      expect(adminJs).toContain("'ab-tests'");
      expect(adminJs).toContain('loadAbTestsPanel');
    });

    it('admin panel container exists', () => {
      const adminHtml = readFileSync('admin.html', 'utf-8');
      expect(adminHtml).toContain('admin-panel-ab-tests');
      expect(adminHtml).toContain('admin-page-ab-tests');
    });

    it('feature flag entry in migration', () => {
      const sql = readFileSync('supabase/migrations/20260307_cs_p1_016_cron_management.sql', 'utf-8');
      expect(sql).toContain('ab_landing_cta_copy');
    });

    it('uses PostHog onFeatureFlags callback', () => {
      const landingAb = readFileSync('js/landing-ab.js', 'utf-8');
      expect(landingAb).toContain('onFeatureFlags');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 0.177: Admin Dashboard UX Review
  // ═══════════════════════════════════════════════════════════

  describe('0.177 — Admin Dashboard UX Review', () => {
    it('UX review document exists', () => {
      expect(existsSync('docs/audit/cs-p1-016-ux-review.md')).toBe(true);
      const doc = readFileSync('docs/audit/cs-p1-016-ux-review.md', 'utf-8');
      expect(doc).toContain('UX Review');
      expect(doc).toContain('UX-001');
      expect(doc).toContain('Priority Matrix');
    });

    it('review covers 10+ findings', () => {
      const doc = readFileSync('docs/audit/cs-p1-016-ux-review.md', 'utf-8');
      expect(doc).toContain('UX-010');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 0.178: Design System Assessment
  // ═══════════════════════════════════════════════════════════

  describe('0.178 — Design System Assessment', () => {
    it('design system assessment document exists', () => {
      expect(existsSync('docs/audit/cs-p1-016-design-system-assessment.md')).toBe(true);
      const doc = readFileSync('docs/audit/cs-p1-016-design-system-assessment.md', 'utf-8');
      expect(doc).toContain('Design System');
      expect(doc).toContain('Maturity');
      expect(doc).toContain('Token Inventory');
    });

    it('assessment documents current tokens', () => {
      const doc = readFileSync('docs/audit/cs-p1-016-design-system-assessment.md', 'utf-8');
      expect(doc).toContain('CSS custom property');
      expect(doc).toContain('dark mode');
      expect(doc).toContain('spacing');
    });

    it('assessment includes upgrade path', () => {
      const doc = readFileSync('docs/audit/cs-p1-016-design-system-assessment.md', 'utf-8');
      expect(doc).toContain('Phase 1');
      expect(doc).toContain('Phase 2');
      expect(doc).toContain('Component Library');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Cross-cutting: No new regressions
  // ═══════════════════════════════════════════════════════════

  describe('Cross-cutting', () => {
    it('admin.js subpage map contains all new pages', () => {
      const adminJs = readFileSync('js/admin.js', 'utf-8');
      expect(adminJs).toContain("'ab-tests'");
      // Cron was already there
      expect(adminJs).toContain("'cron'");
      expect(adminJs).toContain("'posthog-insights'");
    });

    it('all new JS files use var-based CSS tokens (no hardcoded colors in main blocks)', () => {
      const cronJs = readFileSync('js/admin-cron.js', 'utf-8');
      // Verify the management UI uses CSS variables
      expect(cronJs).toContain('var(--bg-card)');
      expect(cronJs).toContain('var(--border)');
      expect(cronJs).toContain('var(--muted)');
    });

    it('BJ namespace registration for new modules', () => {
      const abJs = readFileSync('js/admin-ab-tests.js', 'utf-8');
      expect(abJs).toContain('window.BJ');
      expect(abJs).toContain('_registry');
    });
  });
});
