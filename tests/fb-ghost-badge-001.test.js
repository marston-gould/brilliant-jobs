// tests/fb-ghost-badge-001.test.js
// FB-GHOST-BADGE-001: Ghost Intelligence Badges
// Validates: schema, 3 EFs, gateway routes, dashboard.html removal,
// apply-workflow.js badge logic, app.js redirect, pipeline.js cleanup.
// Run: npx vitest run tests/fb-ghost-badge-001.test.js

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT    = path.resolve(__dirname, '..');
const read    = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists  = (rel) => fs.existsSync(path.join(ROOT, rel));

const migration      = read('supabase/migrations/20260314000004_fb_ghost_badge_001.sql');
const submitEF       = read('supabase/functions/ghost-report-submit/index.ts');
const detectEF       = read('supabase/functions/ghost-auto-detect/index.ts');
const refreshEF      = read('supabase/functions/ghost-score-refresh/index.ts');
const gateway        = read('supabase/functions/api-gateway/index.ts');
const dashboard      = read('dashboard.html');
const applyWorkflow  = read('js/apply-workflow.js');
const appJS          = read('js/app.js');
const pipelineJS     = read('js/pipeline.js');
const dashMin        = read('dist/dashboard.min.js');
const ver            = read('js/version.js');

// ──────────────────────────────────────────────────────────────
// §1  Database Schema
// ──────────────────────────────────────────────────────────────
describe('§1 Database schema — ghost_reports + ghost_company_scores', () => {
  it('ghost_reports table created', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS ghost_reports');
  });

  it('ghost_reports has required columns', () => {
    expect(migration).toContain('user_id');
    expect(migration).toContain('company_name');
    expect(migration).toContain('application_id');
    expect(migration).toContain("source          text         NOT NULL CHECK (source IN ('self_reported', 'auto_inferred'))");
    expect(migration).toContain('confidence');
    expect(migration).toContain('reported_at');
    expect(migration).toContain('expires_at');
    expect(migration).toContain('is_active');
  });

  it('expires_at is 18-month generated column', () => {
    expect(migration).toContain("INTERVAL '18 months'");
    expect(migration).toContain('GENERATED ALWAYS AS');
  });

  it('dedup unique index per user/company/source/90-day window', () => {
    expect(migration).toContain('idx_ghost_reports_dedup');
    expect(migration).toContain('user_id, company_name, source');
  });

  it('ghost_company_scores table created with all required columns', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS ghost_company_scores');
    expect(migration).toContain('effective_count');
    expect(migration).toContain("tier                text         NOT NULL DEFAULT 'low' CHECK (tier IN ('low', 'medium', 'high'))");
    expect(migration).toContain('self_reported_count');
    expect(migration).toContain('auto_inferred_count');
    expect(migration).toContain('last_report_at');
  });

  it('RLS enabled on both tables', () => {
    expect(migration).toContain('ALTER TABLE ghost_reports         ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE ghost_company_scores  ENABLE ROW LEVEL SECURITY');
  });

  it('ghost_reports: users can insert own rows', () => {
    expect(migration).toContain('ghost_reports_user_insert');
    expect(migration).toContain('auth.uid() = user_id');
  });

  it('ghost_company_scores: authenticated read, service_role write', () => {
    expect(migration).toContain('ghost_scores_authenticated_read');
    expect(migration).toContain('ghost_scores_service_write');
    expect(migration).toContain("auth.role() IN ('authenticated', 'anon')");
  });
});

// ──────────────────────────────────────────────────────────────
// §2  fn_ghost_score_refresh — recency weighting + tiers
// ──────────────────────────────────────────────────────────────
describe('§2 fn_ghost_score_refresh recency weighting', () => {
  it('function created with SECURITY DEFINER', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION fn_ghost_score_refresh');
    expect(migration).toContain('SECURITY DEFINER');
  });

  it('recency factors: <6mo=1.0, 6-12mo=0.5, 12-18mo=0.25', () => {
    expect(migration).toContain("INTERVAL '6 months'");
    expect(migration).toContain("INTERVAL '12 months'");
    expect(migration).toContain("INTERVAL '18 months'");
    expect(migration).toContain('THEN 1.0');
    expect(migration).toContain('THEN 0.5');
    expect(migration).toContain('THEN 0.25');
  });

  it('tier thresholds: low=1-4, medium=5-15, high=16+', () => {
    expect(migration).toContain("WHEN effective_count >= 16 THEN 'high'");
    expect(migration).toContain("WHEN effective_count >= 5  THEN 'medium'");
    expect(migration).toContain("ELSE 'low'");
  });

  it('marks expired reports is_active=false', () => {
    expect(migration).toContain('SET    is_active = false');
    expect(migration).toContain("reported_at < now() - INTERVAL '18 months'");
  });

  it('removes companies with no active reports', () => {
    expect(migration).toContain('DELETE FROM ghost_company_scores');
    expect(migration).toContain('SELECT DISTINCT company_name FROM ghost_reports WHERE is_active = true');
  });

  it('pg_cron: ghost-score-refresh every 6 hours', () => {
    expect(migration).toContain('ghost-score-refresh');
    expect(migration).toContain("'0 */6 * * *'");
  });

  it('pg_cron: ghost-auto-detect daily at 2 AM UTC', () => {
    expect(migration).toContain('ghost-auto-detect');
    expect(migration).toContain("'0 2 * * *'");
  });
});

// ──────────────────────────────────────────────────────────────
// §3  ghost-report-submit EF
// ──────────────────────────────────────────────────────────────
describe('§3 ghost-report-submit Edge Function', () => {
  it('EF file exists', () => {
    expect(exists('supabase/functions/ghost-report-submit/index.ts')).toBe(true);
  });

  it('validates user JWT auth', () => {
    expect(submitEF).toContain("Bearer ");
    expect(submitEF).toContain("Unauthorized");
  });

  it('normalizes company name to lowercase', () => {
    expect(submitEF).toContain('normalizeCompanyName');
    expect(submitEF).toContain('.toLowerCase()');
  });

  it('validates application_id belongs to user before accepting', () => {
    expect(submitEF).toContain('.eq("user_id", user.id)');
    expect(submitEF).toContain('Application not found or unauthorized');
  });

  it('deduplicates within 90-day window', () => {
    expect(submitEF).toContain('90 * 86400');
    expect(submitEF).toContain('already_reported');
  });

  it('inserts with source=self_reported and confidence=1.0', () => {
    expect(submitEF).toContain('"self_reported"');
    expect(submitEF).toContain('confidence:     1.0');
  });

  it('triggers fn_ghost_score_refresh after insert', () => {
    expect(submitEF).toContain('fn_ghost_score_refresh');
  });

  it('returns updated score for immediate badge render', () => {
    expect(submitEF).toContain('ghost_company_scores');
    expect(submitEF).toContain('effective_count, tier, self_reported_count, auto_inferred_count');
  });

  it('fires ghost_self_report_confirmed PostHog event', () => {
    expect(submitEF).toContain('"ghost_self_report_confirmed"');
    expect(submitEF).toContain('days_since_applied');
  });
});

// ──────────────────────────────────────────────────────────────
// §4  ghost-auto-detect EF
// ──────────────────────────────────────────────────────────────
describe('§4 ghost-auto-detect Edge Function', () => {
  it('EF file exists', () => {
    expect(exists('supabase/functions/ghost-auto-detect/index.ts')).toBe(true);
  });

  it('service_role only', () => {
    expect(detectEF).toContain('Service role required');
    expect(detectEF).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('scans user_pipeline in WAITING_STAGES', () => {
    expect(detectEF).toContain('WAITING_STAGES');
    expect(detectEF).toContain('"applied"');
    expect(detectEF).toContain('"screening"');
    expect(detectEF).toContain('"interview"');
  });

  it('applies 30-day threshold for applied, 21-day for screening/interview', () => {
    expect(detectEF).toContain('applied:   30');
    expect(detectEF).toContain('screening: 21');
    expect(detectEF).toContain('interview: 21');
  });

  it('inserts auto_inferred reports with confidence=0.5', () => {
    expect(detectEF).toContain('"auto_inferred"');
    expect(detectEF).toContain('confidence:     0.5');
  });

  it('deduplicates with 90-day window per user/company/source', () => {
    expect(detectEF).toContain('90 * 86400_000');
    expect(detectEF).toContain('"auto_inferred"');
  });

  it('triggers fn_ghost_score_refresh after batch insert', () => {
    expect(detectEF).toContain('fn_ghost_score_refresh');
    expect(detectEF).toContain('totalFlagged > 0');
  });

  it('fires ghost_auto_detect_batch PostHog event', () => {
    expect(detectEF).toContain('"ghost_auto_detect_batch"');
    expect(detectEF).toContain('total_flagged');
    expect(detectEF).toContain('by_status');
  });
});

// ──────────────────────────────────────────────────────────────
// §5  ghost-score-refresh EF
// ──────────────────────────────────────────────────────────────
describe('§5 ghost-score-refresh Edge Function', () => {
  it('EF file exists', () => {
    expect(exists('supabase/functions/ghost-score-refresh/index.ts')).toBe(true);
  });

  it('calls fn_ghost_score_refresh RPC', () => {
    expect(refreshEF).toContain('fn_ghost_score_refresh');
    expect(refreshEF).toContain('.rpc(');
  });

  it('fires ghost_score_refresh PostHog event with tier_distribution', () => {
    expect(refreshEF).toContain('"ghost_score_refresh"');
    expect(refreshEF).toContain('tier_distribution');
    expect(refreshEF).toContain('companies_updated');
  });
});

// ──────────────────────────────────────────────────────────────
// §6  API Gateway routes #120–122
// ──────────────────────────────────────────────────────────────
describe('§6 API Gateway routes', () => {
  it('gateway has ghost-report-submit route #120', () => {
    expect(gateway).toContain('"ghost-report-submit"');
    expect(gateway).toContain('// FB-GHOST-BADGE-001');
  });

  it('gateway has ghost-auto-detect route #121', () => {
    expect(gateway).toContain('"ghost-auto-detect"');
  });

  it('gateway has ghost-score-refresh route #122', () => {
    expect(gateway).toContain('"ghost-score-refresh"');
  });

  it('total route count updated to 122', () => {
    expect(gateway).toContain('TOTAL: 122 routes');
  });
});

// ──────────────────────────────────────────────────────────────
// §7  dashboard.html Ghost Monitor removal (acceptance criteria 1–2)
// ──────────────────────────────────────────────────────────────
describe('§7 dashboard.html Ghost Monitor removal', () => {
  it('Ghost Monitor nav item removed', () => {
    expect(dashboard).not.toContain('data-page="ghost"');
  });

  it('Ghost Monitor page HTML removed (id="page-ghost")', () => {
    expect(dashboard).not.toContain('id="page-ghost"');
    expect(dashboard).not.toContain('renderGhostMonitor()');
  });

  it('ghost-table-body removed', () => {
    expect(dashboard).not.toContain('ghost-table-body');
  });

  it('Ghost Monitor option removed from feedback dropdown', () => {
    expect(dashboard).not.toContain('"ghost">Ghost Monitor');
  });

  it('ghost_alert notification row preserved (spec §5: retain)', () => {
    expect(dashboard).toContain('ghost_alert');
  });

  it('ghost_report notification row preserved (spec §5: retain)', () => {
    expect(dashboard).toContain('ghost_report');
  });
});

// ──────────────────────────────────────────────────────────────
// §8  apply-workflow.js Ghost Badge logic
// ──────────────────────────────────────────────────────────────
describe('§8 apply-workflow.js ghost badge logic', () => {
  it('loadGhostScores function exists', () => {
    expect(applyWorkflow).toContain('async function loadGhostScores');
  });

  it('buildGhostBadge function exists', () => {
    expect(applyWorkflow).toContain('function buildGhostBadge');
  });

  it('normalizes company name for consistent cache keys', () => {
    expect(applyWorkflow).toContain('.toLowerCase()');
    expect(applyWorkflow).toContain('_ghostScoreCache');
  });

  it('badge shows correct tier colors', () => {
    expect(applyWorkflow).toContain('var(--red)');
    expect(applyWorkflow).toContain("tier === 'high'");
    expect(applyWorkflow).toContain("tier === 'medium'");
  });

  it('badge text matches spec §8.1', () => {
    expect(applyWorkflow).toContain('Frequent ghosting reported');
    expect(applyWorkflow).toContain('reported no response');
  });

  it('tooltip shows self-reported vs auto-detected breakdown', () => {
    expect(applyWorkflow).toContain('self-reported');
    expect(applyWorkflow).toContain('auto-detected');
    expect(applyWorkflow).toContain('weighted score');
  });

  it('badge uses Lucide ghost icon', () => {
    expect(applyWorkflow).toContain('data-lucide="ghost"');
  });

  it('confirmGhostReport shows confirmation dialog', () => {
    expect(applyWorkflow).toContain('function confirmGhostReport');
    expect(applyWorkflow).toContain('confirm(');
    expect(applyWorkflow).toContain('helps other job seekers');
  });

  it('submitGhostReport calls ghost-report-submit via gateway', () => {
    expect(applyWorkflow).toContain('ghost-report-submit');
    expect(applyWorkflow).toContain('x-gateway-route');
  });

  it('fires ghost_self_report_initiated on initiation', () => {
    expect(applyWorkflow).toContain("'ghost_self_report_initiated'");
  });

  it('fires ghost_self_report_cancelled on cancel', () => {
    expect(applyWorkflow).toContain("'ghost_self_report_cancelled'");
  });

  it('renderPendingApplications loads ghost scores before rendering', () => {
    expect(applyWorkflow).toContain('loadGhostScores(companyNames)');
  });

  it('ghost badge injected in pa-card-left below company name', () => {
    expect(applyWorkflow).toContain('pa-card-left');
    expect(applyWorkflow).toContain('ghostBadge');
    expect(applyWorkflow).toContain('buildGhostBadge(app.company_name)');
  });

  it('"Report Ghosted" button added only for waiting-state apps', () => {
    expect(applyWorkflow).toContain('Report Ghosted');
    expect(applyWorkflow).toContain('confirmGhostReport');
    expect(applyWorkflow).toContain('isWaiting');
  });

  it('badge does NOT appear on terminal-state apps (not in WAITING_STATUSES)', () => {
    // WAITING_STATUSES only includes pending and approved — not failed/processing
    expect(applyWorkflow).toContain("var WAITING_STATUSES = ['pending', 'approved']");
  });

  it('async score refresh re-renders badges after fetch completes', () => {
    expect(applyWorkflow).toContain('.then(function()');
    expect(applyWorkflow).toContain('ghost-badge');
  });

  it('all ghost functions exported to window', () => {
    expect(applyWorkflow).toContain('window.loadGhostScores = loadGhostScores');
    expect(applyWorkflow).toContain('window.buildGhostBadge = buildGhostBadge');
    expect(applyWorkflow).toContain('window.confirmGhostReport = confirmGhostReport');
    expect(applyWorkflow).toContain('window.submitGhostReport = submitGhostReport');
  });
});

// ──────────────────────────────────────────────────────────────
// §9  app.js redirect ghost→applications
// ──────────────────────────────────────────────────────────────
describe('§9 app.js ghost→applications redirect', () => {
  it('ghost tab handler replaced with redirect', () => {
    expect(appJS).not.toContain('renderGhostMonitor');
    expect(appJS).toContain("_tab === 'ghost'");
    expect(appJS).toContain('page-applications');
  });

  it('lastTab ghost redirects to applications in localStorage', () => {
    expect(appJS).toContain("lastTab === 'ghost'");
    expect(appJS).toContain("localStorage.setItem('bj_active_tab', 'applications')");
  });

  it('ghost removed from skeleton guard tab list', () => {
    expect(appJS).not.toContain("'ghost','referrals'");
    // ghost should no longer be in the array
    const skeletonLine = appJS.split('\n').find(l => l.includes('bjSkeleton') && l.includes('stats'));
    expect(skeletonLine).toBeDefined();
    expect(skeletonLine).not.toContain('ghost');
  });

  it('ghost removed from progressive nav items', () => {
    expect(appJS).toContain('// FB-GHOST-BADGE-001: ghost nav item removed');
    const navItems = appJS.match(/const navItems = \{[\s\S]*?\};/);
    expect(navItems).toBeTruthy();
    expect(navItems[0]).not.toContain("'ghost'");
  });
});

// ──────────────────────────────────────────────────────────────
// §10  pipeline.js dead code removed
// ──────────────────────────────────────────────────────────────
describe('§10 pipeline.js dead code removal', () => {
  it('renderGhostMonitor removed', () => {
    expect(pipelineJS).not.toContain('function renderGhostMonitor');
    expect(pipelineJS).not.toContain('ghost-table-body');
  });

  it('onGhostPageShow removed', () => {
    expect(pipelineJS).not.toContain('function onGhostPageShow');
  });

  it('get_pipeline_ghost_status RPC call removed', () => {
    expect(pipelineJS).not.toContain('get_pipeline_ghost_status');
  });
});

// ──────────────────────────────────────────────────────────────
// §11  PostHog events coverage (spec §9)
// ──────────────────────────────────────────────────────────────
describe('§11 PostHog events — 8 events from spec §9', () => {
  it('ghost_self_report_initiated fires on initiation', () => {
    expect(applyWorkflow).toContain("'ghost_self_report_initiated'");
  });

  it('ghost_self_report_confirmed fires in EF after insert', () => {
    expect(submitEF).toContain('"ghost_self_report_confirmed"');
  });

  it('ghost_self_report_cancelled fires on cancel', () => {
    expect(applyWorkflow).toContain("'ghost_self_report_cancelled'");
  });

  it('ghost_auto_detect_batch fires in ghost-auto-detect EF', () => {
    expect(detectEF).toContain('"ghost_auto_detect_batch"');
  });

  it('ghost_score_refresh fires in ghost-score-refresh EF', () => {
    expect(refreshEF).toContain('"ghost_score_refresh"');
  });

  it('ghost_badge_tooltip_shown fires on badge tap', () => {
    expect(applyWorkflow).toContain("'ghost_badge_tooltip_shown'");
  });
});

// ──────────────────────────────────────────────────────────────
// §12  Build integrity
// ──────────────────────────────────────────────────────────────
describe('§12 Build integrity', () => {
  it('BJ_VERSION is v9.02', () => {
    expect(ver).toContain('"v9.02"');
  });

  it('dashboard.min.js contains ghost badge functions', () => {
    expect(dashMin).toContain('loadGhostScores');
    expect(dashMin).toContain('buildGhostBadge');
    expect(dashMin).toContain('confirmGhostReport');
  });

  it('dashboard.min.js does NOT contain renderGhostMonitor', () => {
    expect(dashMin).not.toContain('renderGhostMonitor');
  });

  it('migration file exists', () => {
    expect(exists('supabase/migrations/20260314000004_fb_ghost_badge_001.sql')).toBe(true);
  });

  it('all three EF directories exist', () => {
    expect(exists('supabase/functions/ghost-report-submit/index.ts')).toBe(true);
    expect(exists('supabase/functions/ghost-auto-detect/index.ts')).toBe(true);
    expect(exists('supabase/functions/ghost-score-refresh/index.ts')).toBe(true);
  });
});
