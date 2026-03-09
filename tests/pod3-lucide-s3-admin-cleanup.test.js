import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const BASE = join(__dirname, '..');
const read = (f) => readFileSync(join(BASE, f), 'utf-8');

describe('POD3-LUCIDE-S3: Admin Cleanup + Final Audit', () => {

  // Section 1: Admin Lucide Integration
  describe('1. Admin Lucide Integration', () => {
    it('admin.html has Lucide CDN script tag', () => {
      const html = read('admin.html');
      expect(html).toContain('lucide@0.577.0/dist/umd/lucide.min.js');
    });

    it('admin-shell.js has lucide.createIcons() init', () => {
      const src = read('js/admin-shell.js');
      expect(src).toContain('lucide.createIcons()');
    });

    it('admin-shell.js has window.refreshIcons helper', () => {
      const src = read('js/admin-shell.js');
      expect(src).toContain('window.refreshIcons');
    });

    it('admin.js sidebar chevron uses data-lucide', () => {
      const src = read('js/admin.js');
      expect(src).toContain('data-lucide="chevron-right"');
      expect(src).not.toContain('admin-sidebar-chevron" viewBox');
    });

    it('admin.js calls refreshIcons after panel init', () => {
      const src = read('js/admin.js');
      expect(src).toContain('refreshIcons()');
    });

    it('admin.html MFA lock uses data-lucide', () => {
      const html = read('admin.html');
      expect(html).toContain('data-lucide="lock-keyhole"');
      expect(html).not.toMatch(/<svg[^>]*stroke="#4f46e5"/);
    });
  });

  // Section 2: tier-gating.js fix
  describe('2. tier-gating.js Lock Fix', () => {
    it('tier-gating.js uses data-lucide lock-keyhole', () => {
      const src = read('js/tier-gating.js');
      expect(src).toContain('data-lucide="lock-keyhole"');
    });

    it('tier-gating.js has no inline SVG', () => {
      const src = read('js/tier-gating.js');
      expect(src).not.toContain('<svg');
    });

    it('tier-gating.js calls refreshIcons', () => {
      const src = read('js/tier-gating.js');
      expect(src).toContain('refreshIcons');
    });
  });

  // Section 3: Zero emoji remaining
  describe('3. Zero Emoji Remaining', () => {
    const jsFiles = [
      'js/chat.js', 'js/job-feed.js', 'js/referrals.js', 'js/applications.js',
      'js/notification-center.js', 'js/resumes.js', 'js/admin.js', 'js/billing.js',
      'js/tab-guard.js', 'js/location.js', 'js/pipeline-overlay-tab.js', 'js/globals.ts',
      'js/tier-gating.js', 'js/integrations.js'
    ];

    jsFiles.forEach(f => {
      it(`${f} has no UI-visible emoji`, () => {
        const src = read(f);
        // Strip comments before checking — emoji in code comments (risk docs) is fine
        const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        // Check common UI emoji ranges (excluding comment-only occurrences)
        expect(noComments).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
      });
    });
  });

  // Section 4: Intentional SVG exclusions
  describe('4. Intentional SVG Exclusions', () => {
    it('keywords.js retains 48x48 illustration SVG (out of scope)', () => {
      const src = read('js/keywords.js');
      expect(src).toContain('<svg width="48" height="48"');
    });

    it('referrals.js retains 2 LinkedIn brand SVGs', () => {
      const src = read('js/referrals.js');
      const matches = src.match(/<svg[^>]*fill="currentColor"/g);
      expect(matches).not.toBeNull();
      expect(matches.length).toBe(2);
    });

    it('admin sparkline files use SVG for data visualization (not icons)', () => {
      const sparkFiles = [
        'js/admin-build-analytics.js', 'js/admin-capacity.js',
        'js/admin-chat-analytics.js', 'js/admin-cost-monitor.js',
        'js/admin-deploy-reports.js', 'js/admin-deploy-tracker.js'
      ];
      sparkFiles.forEach(f => {
        const src = read(f);
        // These files have SVG for polyline/rect sparkline charts — not replaceable
        expect(src).toMatch(/<svg/);
      });
    });

    it('dashboard.html nav icons are sidebar (out of scope)', () => {
      const html = read('dashboard.html');
      const navSvgs = html.match(/nav-icon"><svg/g);
      expect(navSvgs).not.toBeNull();
      expect(navSvgs.length).toBeGreaterThanOrEqual(12);
    });
  });

  // Section 5: No icon-replaceable SVGs remain in JS
  describe('5. No Icon SVGs in JS Modules', () => {
    const cleanFiles = [
      'js/chat.js', 'js/applications.js', 'js/notification-center.js',
      'js/resumes.js', 'js/tier-gating.js', 'js/integrations.js',
      'js/job-feed.js', 'js/billing.js', 'js/tab-guard.js',
      'js/location.js', 'js/globals.ts', 'js/admin.js'
    ];

    cleanFiles.forEach(f => {
      it(`${f} has zero inline SVGs`, () => {
        const src = read(f);
        expect(src).not.toContain('<svg');
      });
    });
  });

  // Section 6: refreshIcons coverage
  describe('6. refreshIcons Coverage', () => {
    it('chat.js has refreshIcons calls', () => {
      const src = read('js/chat.js');
      const matches = src.match(/refreshIcons/g);
      expect(matches.length).toBeGreaterThanOrEqual(6);
    });

    it('referrals.js has refreshIcons calls', () => {
      const src = read('js/referrals.js');
      expect(src).toContain('refreshIcons');
    });

    it('applications.js has refreshIcons calls', () => {
      const src = read('js/applications.js');
      expect(src).toContain('refreshIcons');
    });

    it('notification-center.js has refreshIcons calls', () => {
      const src = read('js/notification-center.js');
      expect(src).toContain('refreshIcons');
    });

    it('resumes.js has refreshIcons calls', () => {
      const src = read('js/resumes.js');
      expect(src).toContain('refreshIcons');
    });

    it('admin-shell.js has refreshIcons definition', () => {
      const src = read('js/admin-shell.js');
      expect(src).toContain('window.refreshIcons');
    });
  });

  // Section 7: Version & Build
  describe('7. Version & Build', () => {
    it('version is v8.22', () => {
      const v = read('js/version.js');
      expect(v).toContain('v8.22');
    });

    it('dist/dashboard.min.js exists', () => {
      expect(existsSync(join(BASE, 'dist/dashboard.min.js'))).toBe(true);
    });

    it('dist/admin.min.js exists', () => {
      expect(existsSync(join(BASE, 'dist/admin.min.js'))).toBe(true);
    });
  });
});
