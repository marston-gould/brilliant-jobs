/**
 * SPA-CUT-2: Bridge Elimination Tests
 * Verifies Resumes, Applications, Stats, Billing, Admin Notifications hooks
 * cut from legacy window.* bridge.
 * Session: SPA-CUT-2 | Version: v10.39 → v10.40
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf-8');
const exists = (f) => existsSync(join(ROOT, f));

const RES = 'src/app/pages/dashboard/resumes/hooks/useResumes.ts';
const APP = 'src/app/pages/dashboard/applications/hooks/useApplications.ts';
const STAT = 'src/app/pages/dashboard/stats/hooks/useStats.ts';
const BILL = 'src/app/pages/dashboard/billing/hooks/useBilling.ts';
const NOTIF = 'src/app/pages/admin/notifications/hooks/useNotifications.ts';

function codeOnly(src) {
  return src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
}

// ── 1. Resumes Hook ──────────────────────────────────────────

describe('1. Resumes Hook — Bridge Cut', () => {
  const src = read(RES);
  const code = codeOnly(src);
  it('1.01 Imports @lib/supabase', () => expect(src).toContain("from '@lib/supabase'"));
  it('1.02 Zero (window as any)', () => expect(code).not.toContain('window as any'));
  it('1.03 Zero win() calls', () => expect(code).not.toMatch(/\bwin\(\)\./));
  it('1.04 No function win()', () => expect(src).not.toMatch(/function win\(\)/));
  it('1.05 Reads resumes from LS', () => expect(src).toContain("safeReadLS<Resume[]>('bj_resumes'"));
  it('1.06 Reads filters from LS', () => expect(src).toContain("safeReadLS<SavedFilter[]>('bj_saved_filters'"));
  it('1.07 Reads readiness from LS', () => expect(src).toContain("safeReadLS<"));
  it('1.08 Saves resumes to LS', () => expect(src).toContain("safeWriteLS('bj_resumes'"));
  it('1.09 toggleFilter writes LS', () => expect(src).toContain('saveResumesToLS'));
  it('1.10 archiveResume writes LS', () => {
    expect(src).toContain('archived = true');
    expect(src).toContain('saveResumesToLS');
  });
  it('1.11 deleteResume splices + writes LS', () => expect(src).toContain('splice(idx, 1)'));
  it('1.12 downloadResume uses Supabase Storage', () => expect(src).toContain("storage.from('resumes')"));
  it('1.13 rescoreAI uses callGateway', () => expect(src).toContain("callGateway<any>('score-resume'"));
  it('1.14 getLevels reads from LS tuning', () => expect(src).toContain("safeReadLS<Record<string, any>>('bj_tuning'"));
});

// ── 2. Applications Hook ─────────────────────────────────────

describe('2. Applications Hook — Bridge Cut', () => {
  const src = read(APP);
  const code = codeOnly(src);
  it('2.01 Imports @lib/supabase', () => expect(src).toContain("from '@lib/supabase'"));
  it('2.02 Zero (window as any)', () => expect(code).not.toContain('window as any'));
  it('2.03 Zero win() calls', () => expect(code).not.toMatch(/\bwin\(\)\./));
  it('2.04 Queue from LS', () => expect(src).toContain("safeReadLS<AppEntry[]>('bj_app_queue'"));
  it('2.05 History from LS', () => expect(src).toContain("safeReadLS<AppEntry[]>('bj_app_history'"));
  it('2.06 removeFromQueue writes LS', () => expect(src).toContain("safeWriteLS('bj_app_queue'"));
  it('2.07 clearHistory writes LS', () => expect(src).toContain("safeWriteLS('bj_app_history', [])"));
  it('2.08 addManual writes LS', () => expect(src).toContain("safeWriteLS('bj_app_queue', queue)"));
  it('2.09 loadNotifPrefs uses Supabase', () => expect(src).toContain("from('notification_preferences')"));
  it('2.10 loadNotifLog uses Supabase', () => expect(src).toContain("from('notification_log')"));
  it('2.11 getQueueStats reads LS', () => expect(src).toContain("safeReadLS<AppEntry[]>('bj_app_queue', [])"));
  it('2.12 No document.getElementById', () => expect(code).not.toContain('document.getElementById'));
});

// ── 3. Stats Hook ────────────────────────────────────────────

describe('3. Stats Hook — Bridge Cut', () => {
  const src = read(STAT);
  const code = codeOnly(src);
  it('3.01 Imports @lib/supabase', () => expect(src).toContain("from '@lib/supabase'"));
  it('3.02 Zero (window as any)', () => expect(code).not.toContain('window as any'));
  it('3.03 No DOM scraping', () => {
    expect(code).not.toContain('document.querySelectorAll');
    expect(code).not.toContain('textContent');
  });
  it('3.04 Queries mv_job_feed_counts', () => expect(src).toContain("from('mv_job_feed_counts')"));
  it('3.05 Queries mv_source_breakdown', () => expect(src).toContain("from('mv_source_breakdown')"));
  it('3.06 Reads saved filters from LS', () => expect(src).toContain("safeReadLS<any[]>('bj_saved_filters'"));
  it('3.07 No initStatsPage bridge', () => expect(code).not.toContain('initStatsPage'));
  it('3.08 No _statsToggleFilter bridge', () => expect(code).not.toContain('_statsToggleFilter'));
});

// ── 4. Billing Hook ──────────────────────────────────────────

describe('4. Billing Hook — Bridge Cut', () => {
  const src = read(BILL);
  const code = codeOnly(src);
  it('4.01 Imports @lib/supabase', () => expect(src).toContain("from '@lib/supabase'"));
  it('4.02 Zero (window as any)', () => expect(code).not.toContain('window as any'));
  it('4.03 Calls get-user-balance via gateway', () => expect(src).toContain("callGateway<any>('get-user-balance'"));
  it('4.04 Queries pricing_defaults', () => expect(src).toContain("from('pricing_defaults')"));
  it('4.05 Queries profiles for role', () => expect(src).toContain("from('profiles')"));
  it('4.06 Opens billing portal via gateway', () => expect(src).toContain("callGateway<{ url: string }>('create-portal-session'"));
  it('4.07 No _openBillingPortal bridge', () => expect(code).not.toContain('_openBillingPortal'));
  it('4.08 No openPricingModal bridge', () => expect(code).not.toContain('openPricingModal'));
  it('4.09 No _saveAutoRefill bridge', () => expect(code).not.toContain("(window as any)._saveAutoRefill"));
});

// ── 5. Admin Notifications Hook ──────────────────────────────

describe('5. Admin Notifications Hook — Bridge Cut', () => {
  const src = read(NOTIF);
  const code = codeOnly(src);
  it('5.01 Imports @lib/supabase', () => expect(src).toContain("from '@lib/supabase'"));
  it('5.02 Zero (window as any)', () => expect(code).not.toContain('window as any'));
  it('5.03 Queries notification_templates', () => expect(src).toContain("from('notification_templates')"));
  it('5.04 Queries survey_campaigns', () => expect(src).toContain("from('survey_campaigns')"));
  it('5.05 Queries notification_log for stats', () => expect(src).toContain("from('notification_log')"));
  it('5.06 No loadNotificationsTab bridge', () => expect(code).not.toContain('loadNotificationsTab'));
});

// ── 6. Build Output ──────────────────────────────────────────

describe('6. SPA Build', () => {
  it('6.1 dist/spa exists', () => expect(exists('dist/spa')).toBe(true));
  it('6.2 ResumesPage chunk', () => {
    const f = readdirSync(join(ROOT, 'dist/spa/assets'));
    expect(f.some(x => x.startsWith('ResumesPage'))).toBe(true);
  });
  it('6.3 ApplicationsPage chunk', () => {
    const f = readdirSync(join(ROOT, 'dist/spa/assets'));
    expect(f.some(x => x.startsWith('ApplicationsPage'))).toBe(true);
  });
  it('6.4 admin-pages chunk', () => {
    const f = readdirSync(join(ROOT, 'dist/spa/assets'));
    expect(f.some(x => x.startsWith('admin-pages'))).toBe(true);
  });
});

// ── 7. File Inventory ────────────────────────────────────────

describe('7. SPA-CUT-2 File Inventory', () => {
  [RES, APP, STAT, BILL, NOTIF].forEach(f => {
    it(f.split('/').pop() + ' exists', () => expect(exists(f)).toBe(true));
  });
});
