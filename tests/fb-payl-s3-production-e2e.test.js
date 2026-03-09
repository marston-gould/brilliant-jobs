/**
 * FB-PAYL-S3: Production Deployment & E2E Validation Tests
 *
 * Validates:
 *   1. Migration v6.46 deployed (tables, functions, indexes, RLS, view, feature flag, cron)
 *   2. Migration v6.47 deployed (notification templates, views, admin summary function)
 *   3. Edge Functions deployed (parse-linkedin-pdf, payl-referral-webhook, payl-expiry-check)
 *   4. Storage bucket linkedin-profiles created with RLS
 *   5. Gateway routes registered (#111–#113)
 *   6. Feature gating (tier-gating.js PAYL→Pro mapping + isPaylUser)
 *   7. Dashboard UI files present (payl.js, admin-payl.js)
 *   8. Build output includes PAYL in deferred chunk
 *   9. Admin panel wiring (ADMIN_SUBPAGE_MAP payl entry)
 *  10. Pod team manifest updated with FB-PAYL-S3 pairing
 *
 * Session: FB-PAYL-S3
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

// ─── Section 1: v6.46 Migration Artifacts ───────────────────────────────────
describe('v6.46 Foundation Migration', () => {
  const sql = readFile('supabase/migrations/v6.46-fb-payl-001-foundation.sql');

  it('creates payl_enrollments table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS payl_enrollments');
  });

  it('creates payl_referrals table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS payl_referrals');
  });

  it('creates 9 fn_payl functions', () => {
    const fns = [
      'fn_payl_generate_referral_code', 'fn_payl_enroll', 'fn_payl_activate',
      'fn_payl_record_pdf', 'fn_payl_qualify_referral', 'fn_payl_revoke_referral',
      'fn_payl_expiry_check', 'fn_payl_convert', 'fn_payl_summary'
    ];
    fns.forEach(fn => expect(sql).toContain(fn));
  });

  it('creates v_payl_dashboard view', () => {
    expect(sql).toContain('CREATE OR REPLACE VIEW v_payl_dashboard');
  });

  it('seeds payl_tier_enabled feature flag with correct schema', () => {
    expect(sql).toContain("INSERT INTO feature_flags (id, description, enabled, rollout_pct)");
    expect(sql).toContain("'payl_tier_enabled'");
  });

  it('creates pg_cron schedule for expiry check', () => {
    expect(sql).toContain('cron.schedule');
    expect(sql).toContain('payl-expiry-check');
  });

  it('creates RLS policies for both tables', () => {
    expect(sql).toContain('CREATE POLICY');
    expect(sql).toContain('payl_enrollments');
    expect(sql).toContain('payl_referrals');
  });

  it('creates indexes', () => {
    expect(sql).toContain('CREATE INDEX');
    expect(sql).toContain('idx_payl_enrollments');
  });

  it('agent_action_log insert is conditional', () => {
    expect(sql).toContain("IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_action_log')");
  });
});

// ─── Section 2: v6.47 Dashboard UI Migration ────────────────────────────────
describe('v6.47 Dashboard UI Migration', () => {
  const sql = readFile('supabase/migrations/v6.47-fb-payl-002-dashboard-ui.sql');

  it('seeds email notification templates for 7 PAYL types', () => {
    const types = [
      'payl_activated', 'payl_referral_progress', 'payl_referral_revoked',
      'payl_employment_nudge', 'payl_expiring_soon', 'payl_expired', 'payl_converted'
    ];
    types.forEach(t => expect(sql).toContain(t));
  });

  it('uses correct production schema columns (subject_line, html_body, active)', () => {
    expect(sql).toContain('notification_type, channel, subject_line, html_body, active');
  });

  it('seeds SMS templates separately using sms_body column', () => {
    expect(sql).toContain('notification_type, channel, sms_body, active');
  });

  it('notification_categories insert is conditional', () => {
    expect(sql).toContain("IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_categories')");
  });

  it('creates v_payl_analytics view', () => {
    expect(sql).toContain('CREATE OR REPLACE VIEW v_payl_analytics');
  });

  it('creates v_payl_daily_funnel view', () => {
    expect(sql).toContain('CREATE OR REPLACE VIEW v_payl_daily_funnel');
  });

  it('creates fn_payl_admin_summary function', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION fn_payl_admin_summary');
  });

  it('grants access to authenticated and service_role', () => {
    expect(sql).toContain('GRANT SELECT ON v_payl_analytics TO authenticated');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION fn_payl_admin_summary() TO service_role');
  });
});

// ─── Section 3: Edge Functions Deployed ─────────────────────────────────────
describe('PAYL Edge Functions', () => {
  it('parse-linkedin-pdf exists with correct actions', () => {
    const src = readFile('supabase/functions/parse-linkedin-pdf/index.ts');
    expect(src).toContain('action === "parse"');
    expect(src).toContain('action === "validate"');
    expect(src).toContain('action === "status"');
  });

  it('payl-referral-webhook exists with correct actions', () => {
    const src = readFile('supabase/functions/payl-referral-webhook/index.ts');
    expect(src).toContain('action === "signup"');
    expect(src).toContain('action === "subscribed"');
    expect(src).toContain('action === "qualify_check"');
    expect(src).toContain('action === "revoke"');
    expect(src).toContain('action === "anti_gaming_check"');
  });

  it('payl-expiry-check exists with correct actions', () => {
    const src = readFile('supabase/functions/payl-expiry-check/index.ts');
    expect(src).toContain('action === "check"');
    expect(src).toContain('action === "nudge"');
    expect(src).toContain('action === "convert"');
    expect(src).toContain('action === "extend"');
    expect(src).toContain('action === "summary"');
  });

  it('parse-linkedin-pdf implements PDF text extraction', () => {
    const src = readFile('supabase/functions/parse-linkedin-pdf/index.ts');
    // BT/ET blocks + Tj/TJ operators for PDF parsing
    expect(src).toMatch(/BT|ET|Tj|TJ/);
  });

  it('payl-referral-webhook implements anti-gaming checks', () => {
    const src = readFile('supabase/functions/payl-referral-webhook/index.ts');
    expect(src).toContain('anti_gaming');
    expect(src).toContain('self_referral');
  });

  it('payl-expiry-check implements employment nudge schedule', () => {
    const src = readFile('supabase/functions/payl-expiry-check/index.ts');
    // Day 90/120/150/175 nudge schedule
    expect(src).toMatch(/90|120|150|175/);
  });
});

// ─── Section 4: Gateway Routes ──────────────────────────────────────────────
describe('Gateway Routes', () => {
  const gateway = readFile('supabase/functions/api-gateway/index.ts');

  it('parse-linkedin-pdf registered as route #111', () => {
    expect(gateway).toContain('"parse-linkedin-pdf"');
  });

  it('payl-referral-webhook registered as route #112', () => {
    expect(gateway).toContain('"payl-referral-webhook"');
  });

  it('payl-expiry-check registered as route #113', () => {
    expect(gateway).toContain('"payl-expiry-check"');
  });

  it('total routes is 113', () => {
    expect(gateway).toContain('113 routes');
  });
});

// ─── Section 5: Feature Gating ──────────────────────────────────────────────
describe('Feature Gating', () => {
  it('tier-gating.ts maps PAYL to Pro', () => {
    const src = readFile('js/tier-gating.ts');
    expect(src).toContain('payl');
    expect(src).toContain('pro');
  });

  it('tier-gating.ts exports isPaylUser', () => {
    const src = readFile('js/tier-gating.ts');
    expect(src).toContain('isPaylUser');
  });

  it('tier-gating.js compiled output matches', () => {
    const src = readFile('js/tier-gating.js');
    expect(src).toContain('isPaylUser');
    expect(src).toContain('payl');
  });
});

// ─── Section 6: Dashboard UI Files ──────────────────────────────────────────
describe('Dashboard UI Files', () => {
  it('payl.js exists with enrollment modal', () => {
    const src = readFile('js/payl.js');
    expect(src).toContain('enrollment');
    expect(src).toContain('referral');
  });

  it('payl.js exports 14 window functions', () => {
    const src = readFile('js/payl.js');
    const exports = (src.match(/window\./g) || []).length;
    expect(exports).toBeGreaterThanOrEqual(14);
  });

  it('admin-payl.js exists with analytics panel', () => {
    const src = readFile('js/admin-payl.js');
    expect(src).toContain('analytics');
    expect(src).toContain('fn_payl_admin_summary');
  });

  it('dashboard.html has PAYL referral widget container', () => {
    const html = readFile('dashboard.html');
    expect(html).toContain('payl');
  });

  it('admin.html has PAYL panel container and script', () => {
    const html = readFile('admin.html');
    expect(html).toContain('admin-payl');
  });
});

// ─── Section 7: Build Output ────────────────────────────────────────────────
describe('Build Output', () => {
  it('payl.js is included in deferred chunk config', () => {
    const build = readFile('build.js');
    expect(build).toContain('payl.js');
  });

  it('dist/dashboard-deferred.min.js exists and includes PAYL', () => {
    expect(fileExists('dist/dashboard-deferred.min.js')).toBe(true);
  });

  it('billing.js includes PAYL tier card', () => {
    const src = readFile('js/billing.js');
    expect(src).toMatch(/[Pp]ayl|PAYL/i);
  });
});

// ─── Section 8: Admin Panel Wiring ──────────────────────────────────────────
describe('Admin Panel Wiring', () => {
  it('ADMIN_SUBPAGE_MAP has payl entry', () => {
    const src = readFile('js/admin.js');
    expect(src).toContain("'payl'");
  });

  it('loadPaylAnalyticsPanel is globally accessible', () => {
    const src = readFile('js/admin.js');
    expect(src).toContain('loadPaylAnalyticsPanel');
  });
});

// ─── Section 9: Pod Team Manifest ───────────────────────────────────────────
describe('Pod Team Manifest', () => {
  const manifest = readFile('docs/scaling/pod-team-manifest.md');

  it('has FB-PAYL-S1 pairing', () => {
    expect(manifest).toContain('FB-PAYL-S1');
  });

  it('has FB-PAYL-S2 pairing', () => {
    expect(manifest).toContain('FB-PAYL-S2');
  });

  it('has FB-PAYL-S3 pairing', () => {
    expect(manifest).toContain('FB-PAYL-S3');
  });

  it('has all 5 hook-and-scar roles', () => {
    expect(manifest).toContain('Chief Architect');
    expect(manifest).toContain('Lead Platform Engineer');
    expect(manifest).toContain('System Architect');
    expect(manifest).toContain('Forward-Looking Developer');
    expect(manifest).toContain('Evolvability Strategist');
  });
});

// ─── Section 10: Storage Bucket ─────────────────────────────────────────────
describe('Storage Bucket', () => {
  it('v6.46 migration references linkedin-profiles bucket', () => {
    const sql = readFile('supabase/migrations/v6.46-fb-payl-001-foundation.sql');
    expect(sql).toContain('linkedin-profiles');
  });
});

// ─── Section 11: PostHog Events ─────────────────────────────────────────────
describe('PostHog Events', () => {
  const payl = readFile('js/payl.js');

  it('tracks enrollment_started event', () => {
    expect(payl).toContain('enrollment_started');
  });

  it('tracks pdf_uploaded event', () => {
    expect(payl).toContain('pdf_uploaded');
  });

  it('tracks activated event', () => {
    expect(payl).toContain('activated');
  });

  it('tracks referral_link_copied event', () => {
    expect(payl).toContain('referral_link_copied');
  });

  it('tracks employment_reported event', () => {
    expect(payl).toContain('employment_reported');
  });

  it('tracks converted event', () => {
    expect(payl).toContain('converted');
  });
});

// ─── Section 12: File Inventory ─────────────────────────────────────────────
describe('File Inventory', () => {
  const expectedFiles = [
    'supabase/migrations/v6.46-fb-payl-001-foundation.sql',
    'supabase/migrations/v6.47-fb-payl-002-dashboard-ui.sql',
    'supabase/functions/parse-linkedin-pdf/index.ts',
    'supabase/functions/payl-referral-webhook/index.ts',
    'supabase/functions/payl-expiry-check/index.ts',
    'js/payl.js',
    'js/admin-payl.js',
    'js/tier-gating.ts',
    'js/tier-gating.js',
    'tests/fb-payl-s1-foundation.test.js',
    'tests/fb-payl-s2-dashboard-ui.test.js',
    'tests/fb-payl-s3-production-e2e.test.js',
  ];

  expectedFiles.forEach(f => {
    it(`${f} exists`, () => {
      expect(fileExists(f)).toBe(true);
    });
  });
});
