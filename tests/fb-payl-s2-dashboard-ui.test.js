/**
 * FB-PAYL-S2 Dashboard UI — Validation Tests
 * Tests: migration, payl.js UI module, admin-payl.js, billing integration,
 *        notification templates, PostHog events, gateway, team manifest, version
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

function read(f) { return readFileSync(f, 'utf8'); }
function exists(f) { return existsSync(f); }

// ────────────────────────────────────────────────
// Section 1: Migration Structure
// ────────────────────────────────────────────────
describe('FB-PAYL-S2: Migration v6.47', () => {
  const sql = read('supabase/migrations/v6.47-fb-payl-002-dashboard-ui.sql');

  it('creates 7 PAYL notification templates', () => {
    const types = [
      'payl_activated', 'payl_referral_progress', 'payl_referral_revoked',
      'payl_employment_nudge', 'payl_expiring_soon', 'payl_expired', 'payl_converted'
    ];
    types.forEach(t => {
      expect(sql).toContain(`'${t}'`);
    });
  });

  it('includes email channel for all 7 types', () => {
    // Count email template inserts
    const emailMatches = sql.match(/'email'/g);
    expect(emailMatches.length).toBeGreaterThanOrEqual(7);
  });

  it('includes SMS channel for referral_progress, employment_nudge, expiring_soon', () => {
    const smsMatches = sql.match(/'sms'/g);
    expect(smsMatches.length).toBeGreaterThanOrEqual(3);
  });

  it('creates v_payl_analytics view', () => {
    expect(sql).toContain('CREATE OR REPLACE VIEW v_payl_analytics');
    expect(sql).toContain('pending_pdf');
    expect(sql).toContain('conversion_rate_pct');
  });

  it('creates v_payl_daily_funnel view', () => {
    expect(sql).toContain('CREATE OR REPLACE VIEW v_payl_daily_funnel');
    expect(sql).toContain('cohort_date');
    expect(sql).toContain('enrollments_started');
    expect(sql).toContain('pdf_uploaded');
  });

  it('creates fn_payl_admin_summary function', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION fn_payl_admin_summary');
    expect(sql).toContain('RETURNS jsonb');
    expect(sql).toContain('overview');
    expect(sql).toContain('daily_funnel');
    expect(sql).toContain('recent_enrollments');
    expect(sql).toContain('referral_leaderboard');
    expect(sql).toContain('anti_gaming_flags');
  });

  it('grants appropriate access', () => {
    expect(sql).toContain('GRANT SELECT ON v_payl_analytics TO authenticated');
    expect(sql).toContain('GRANT SELECT ON v_payl_daily_funnel TO authenticated');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION fn_payl_admin_summary() TO service_role');
  });

  it('uses ON CONFLICT DO NOTHING for idempotent template seeding', () => {
    expect(sql).toContain('ON CONFLICT DO NOTHING');
  });

  it('creates notification_categories entry for payl', () => {
    expect(sql).toContain("'payl', 'Pay After You Land'");
  });
});

// ────────────────────────────────────────────────
// Section 2: PAYL UI Module (payl.js)
// ────────────────────────────────────────────────
describe('FB-PAYL-S2: payl.js UI Module', () => {
  const payl = read('js/payl.js');

  it('exists and is non-empty', () => {
    expect(payl.length).toBeGreaterThan(1000);
  });

  // Enrollment flow
  it('exports openPaylEnrollment function', () => {
    expect(payl).toContain('window.openPaylEnrollment = openPaylEnrollment');
  });

  it('exports closePaylEnrollment function', () => {
    expect(payl).toContain('window.closePaylEnrollment = closePaylEnrollment');
  });

  it('has 3-step enrollment flow (pdf, card, confirmation)', () => {
    expect(payl).toContain('_renderPdfUploadStep');
    expect(payl).toContain('_renderCardAuthStep');
    expect(payl).toContain('_renderConfirmationStep');
  });

  it('renders step progress dots', () => {
    expect(payl).toContain('payl-step-dot');
    expect(payl).toContain("data-step=\"1\"");
    expect(payl).toContain("data-step=\"2\"");
    expect(payl).toContain("data-step=\"3\"");
  });

  // PDF Upload
  it('supports drag-and-drop PDF upload', () => {
    expect(payl).toContain('handlePaylPdfDrop');
    expect(payl).toContain('ondragover');
    expect(payl).toContain('ondrop');
    expect(payl).toContain('ondragleave');
  });

  it('supports file picker PDF upload', () => {
    expect(payl).toContain('handlePaylPdfSelect');
    expect(payl).toContain("accept=\"application/pdf\"");
  });

  it('validates PDF type and size', () => {
    expect(payl).toContain("file.type !== 'application/pdf'");
    expect(payl).toContain('10 * 1024 * 1024');
  });

  it('shows parsed profile preview', () => {
    expect(payl).toContain('payl-pdf-preview');
    expect(payl).toContain('payl-pdf-fields');
    expect(payl).toContain('Parsed Profile Preview');
  });

  it('calls parse-linkedin-pdf EF via gateway', () => {
    expect(payl).toContain("route: 'parse-linkedin-pdf'");
    expect(payl).toContain("action: 'parse'");
  });

  // Stripe setup_intent
  it('creates Stripe setup_intent (no upfront charge)', () => {
    expect(payl).toContain("action: 'setup_intent'");
    expect(payl).toContain('confirmCardSetup');
    expect(payl).toContain('No charge today');
  });

  it('calls authorizePaylCard function', () => {
    expect(payl).toContain('window.authorizePaylCard = authorizePaylCard');
  });

  // Referral widget
  it('renders referral progress widget', () => {
    expect(payl).toContain('_renderReferralWidget');
    expect(payl).toContain('payl-referral-widget');
    expect(payl).toContain('referrals qualified');
  });

  it('shows progress bar for referrals', () => {
    expect(payl).toContain('qualified / total');
    expect(payl).toContain("background:var(--accent)");
  });

  it('exports copyPaylReferralLink function', () => {
    expect(payl).toContain('window.copyPaylReferralLink = copyPaylReferralLink');
  });

  it('exports sharePaylReferralLink function with native share API', () => {
    expect(payl).toContain('window.sharePaylReferralLink = sharePaylReferralLink');
    expect(payl).toContain('navigator.share');
  });

  // Employment nudge
  it('checks employment nudge at day 90/120/150/175', () => {
    expect(payl).toContain('_checkEmploymentNudge');
    expect(payl).toContain('[90, 120, 150, 175]');
  });

  it('shows final warning at day 175', () => {
    expect(payl).toContain('daysSince >= 175');
    expect(payl).toContain('Final Check-In');
  });

  it('exports reportPaylEmployment function', () => {
    expect(payl).toContain('window.reportPaylEmployment = reportPaylEmployment');
  });

  it('shows employment confirmation modal with conversion CTA', () => {
    expect(payl).toContain('confirmPaylConversion');
    expect(payl).toContain('Congratulations');
    expect(payl).toContain('Confirm — Start Pro');
  });

  it('exports dismissPaylNudge with localStorage throttle', () => {
    expect(payl).toContain('window.dismissPaylNudge = dismissPaylNudge');
    expect(payl).toContain('bj_payl_nudge_dismiss');
  });

  // PAYL tier card
  it('exports renderPaylTierCard function', () => {
    expect(payl).toContain('window.renderPaylTierCard = renderPaylTierCard');
  });

  it('PAYL tier card shows $0 upfront', () => {
    expect(payl).toContain('$0');
    expect(payl).toContain('upfront');
    expect(payl).toContain('Pay After You Land');
  });

  it('PAYL tier card lists key features', () => {
    expect(payl).toContain('Full Pro features');
    expect(payl).toContain('Upload LinkedIn PDF');
    expect(payl).toContain('Refer 3 friends');
    expect(payl).toContain('180-day access window');
  });

  // Auto-init
  it('auto-initializes on load', () => {
    expect(payl).toContain('initPayl()');
  });
});

// ────────────────────────────────────────────────
// Section 3: PostHog Event Instrumentation (12 events)
// ────────────────────────────────────────────────
describe('FB-PAYL-S2: PostHog Events', () => {
  const payl = read('js/payl.js');

  // Client-side events (server-side events like payl_expired are fired from EFs)
  const events = [
    'enrollment_started',
    'pdf_uploaded',
    'pdf_parsed',
    'pdf_rejected',
    'activated',
    'referral_link_copied',
    'referral_link_shared',
    'employment_reported',
    'converted',
  ];

  events.forEach(evt => {
    it(`fires payl_${evt} event`, () => {
      expect(payl).toContain(`_paylEvent('${evt}'`);
    });
  });

  it('has _paylEvent helper using posthog.capture', () => {
    expect(payl).toContain('posthog.capture');
    expect(payl).toContain("'payl_' + eventName");
  });

  it('includes tier:payl property in events', () => {
    expect(payl).toContain("tier: 'payl'");
  });
});

// ────────────────────────────────────────────────
// Section 4: Billing Integration
// ────────────────────────────────────────────────
describe('FB-PAYL-S2: Billing Integration', () => {
  const billing = read('js/billing.js');

  it('billing.js includes PAYL tier card via renderPaylTierCard', () => {
    expect(billing).toContain('renderPaylTierCard');
  });

  it('inserts PAYL card after Free tier in renderTierComparison', () => {
    expect(billing).toContain("idx === 0 && paylCard");
  });

  it('only shows PAYL card to non-Pro users', () => {
    expect(billing).toContain("currentTier !== 'pro'");
  });
});

// ────────────────────────────────────────────────
// Section 5: Admin PAYL Panel
// ────────────────────────────────────────────────
describe('FB-PAYL-S2: Admin PAYL Panel', () => {
  const admin = read('js/admin-payl.js');

  it('exists and exports loadPaylAnalyticsPanel', () => {
    expect(admin).toContain('window.loadPaylAnalyticsPanel = loadPaylAnalyticsPanel');
  });

  it('calls fn_payl_admin_summary RPC', () => {
    expect(admin).toContain('fn_payl_admin_summary');
  });

  it('renders 6 enrollment status cards', () => {
    expect(admin).toContain('Pending PDF');
    expect(admin).toContain('Pending Referrals');
    expect(admin).toContain('Active');
    expect(admin).toContain('Converted');
    expect(admin).toContain('Expired');
    expect(admin).toContain('Total');
  });

  it('shows conversion metrics', () => {
    expect(admin).toContain('Conversion Rate');
    expect(admin).toContain('Avg Days to Activation');
    expect(admin).toContain('Avg Days to Conversion');
    expect(admin).toContain('Qualified Referrals');
  });

  it('renders daily enrollment funnel table', () => {
    expect(admin).toContain('Daily Enrollment Funnel');
    expect(admin).toContain('_renderFunnelTable');
  });

  it('renders recent enrollments table', () => {
    expect(admin).toContain('Recent Enrollments');
    expect(admin).toContain('_renderRecentTable');
  });

  it('renders referral leaderboard', () => {
    expect(admin).toContain('Referral Leaderboard');
    expect(admin).toContain('_renderLeaderboard');
  });

  it('renders anti-gaming flags when present', () => {
    expect(admin).toContain('Anti-Gaming Flags');
    expect(admin).toContain('_renderFlagsTable');
  });

  it('auto-refreshes every 2 minutes', () => {
    expect(admin).toContain('120000');
    expect(admin).toContain('_paylRefreshTimer');
  });
});

// ────────────────────────────────────────────────
// Section 6: Admin Integration
// ────────────────────────────────────────────────
describe('FB-PAYL-S2: Admin Integration', () => {
  const adminJs = read('js/admin.js');
  const adminHtml = read('admin.html');

  it('ADMIN_SUBPAGE_MAP includes payl entry in growth section', () => {
    expect(adminJs).toContain("'payl':");
    expect(adminJs).toContain("section: 'growth'");
    expect(adminJs).toContain('PAYL Analytics');
    expect(adminJs).toContain('loadPaylAnalyticsPanel');
  });

  it('admin.html has payl panel container', () => {
    expect(adminHtml).toContain('admin-panel-payl');
    expect(adminHtml).toContain('id="admin-payl"');
  });

  it('admin.html has admin-payl.js script tag', () => {
    expect(adminHtml).toContain('admin-payl.js');
  });
});

// ────────────────────────────────────────────────
// Section 7: Dashboard HTML Integration
// ────────────────────────────────────────────────
describe('FB-PAYL-S2: Dashboard HTML', () => {
  const html = read('dashboard.html');

  it('has PAYL referral widget container', () => {
    expect(html).toContain('id="payl-referral-widget"');
  });

  it('has PAYL employment nudge container', () => {
    expect(html).toContain('id="payl-employment-nudge"');
  });

  it('referral widget is hidden by default', () => {
    expect(html).toContain('payl-referral-widget" class="u-hidden');
  });

  it('employment nudge is hidden by default', () => {
    expect(html).toContain('payl-employment-nudge" class="u-hidden');
  });

  it('PAYL containers are placed before job table', () => {
    const widgetIdx = html.indexOf('payl-referral-widget');
    const tableIdx = html.indexOf('id="job-table"');
    expect(widgetIdx).toBeLessThan(tableIdx);
  });
});

// ────────────────────────────────────────────────
// Section 8: Build & Version
// ────────────────────────────────────────────────
describe('FB-PAYL-S2: Build & Version', () => {
  const version = read('js/version.ts');
  const versionJs = read('js/version.js');

  it('product version is v8.24', () => {
    expect(version).toContain("v8.24");
    expect(versionJs).toContain("v8.24");
  });

  it('payl.js is in the deferred build chunk', () => {
    const buildJs = read('build.js');
    expect(buildJs).toContain("'js/payl.js'");
  });

  it('deferred chunk includes payl.js content', () => {
    const dist = read('dist/dashboard-deferred.min.js');
    expect(dist).toContain('openPaylEnrollment');
    expect(dist).toContain('renderPaylTierCard');
  });

  it('admin bundle exists', () => {
    expect(exists('dist/admin.min.js')).toBe(true);
  });

  it('dashboard bundle exists', () => {
    expect(exists('dist/dashboard.min.js')).toBe(true);
  });
});

// ────────────────────────────────────────────────
// Section 9: Pod Team Manifest
// ────────────────────────────────────────────────
describe('FB-PAYL-S2: Team Manifest', () => {
  const manifest = read('docs/scaling/pod-team-manifest.md');

  it('has FB-PAYL-S2 pairing assignment', () => {
    expect(manifest).toContain('FB-PAYL-S2');
  });

  it('has all 5 hook-and-scar specialists', () => {
    expect(manifest).toContain('Chief Architect');
    expect(manifest).toContain('Lead Platform Engineer');
    expect(manifest).toContain('System Architect');
    expect(manifest).toContain('Forward-Looking Developer');
    expect(manifest).toContain('Evolvability Strategist');
  });
});

// ────────────────────────────────────────────────
// Section 10: File Inventory
// ────────────────────────────────────────────────
describe('FB-PAYL-S2: File Inventory', () => {
  const created = [
    'supabase/migrations/v6.47-fb-payl-002-dashboard-ui.sql',
    'js/payl.js',
    'js/admin-payl.js',
    'tests/fb-payl-s2-dashboard-ui.test.js',
  ];

  created.forEach(f => {
    it(`created: ${f}`, () => {
      expect(exists(f)).toBe(true);
    });
  });

  const modified = [
    'js/billing.js',
    'js/admin.js',
    'dashboard.html',
    'admin.html',
    'build.js',
  ];

  modified.forEach(f => {
    it(`modified: ${f} exists`, () => {
      expect(exists(f)).toBe(true);
    });
  });
});
