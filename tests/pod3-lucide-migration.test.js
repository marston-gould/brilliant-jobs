/**
 * POD3-LUCIDE — Lucide Icon Migration Validation Tests
 * Validates: Lucide script tag, CSS icon tokens, emoji elimination, refreshIcons() calls, credits icon removal
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

const read = (f) => readFileSync(f, 'utf-8');

describe('POD3-LUCIDE: Lucide Icon Migration', () => {

  // Section 1: Lucide script integration
  describe('1. Lucide Script Integration', () => {
    it('dashboard.html includes Lucide CDN script pinned to 0.577.0', () => {
      const html = read('dashboard.html');
      expect(html).toContain('unpkg.com/lucide@0.577.0/dist/umd/lucide.min.js');
    });

    it('app.js calls lucide.createIcons() in init', () => {
      const js = read('js/app.js');
      expect(js).toContain('lucide.createIcons()');
    });

    it('app.js exposes window.refreshIcons() global helper', () => {
      const js = read('js/app.js');
      expect(js).toContain('window.refreshIcons');
    });
  });

  // Section 2: CSS icon tokens
  describe('2. CSS Icon Size Tokens', () => {
    const css = read('styles.css');

    it('.icon-xs class exists (12px)', () => {
      expect(css).toContain('.icon-xs');
    });
    it('.icon-sm class exists (14px)', () => {
      expect(css).toContain('.icon-sm');
    });
    it('.icon-md class exists (16px)', () => {
      expect(css).toContain('.icon-md');
    });
    it('.icon-lg class exists (20px)', () => {
      expect(css).toContain('.icon-lg');
    });
    it('.icon-xl class exists (28px)', () => {
      expect(css).toContain('.icon-xl');
    });
    it('.icon-stroke class exists', () => {
      expect(css).toContain('.icon-stroke');
    });
    it('.icon-stroke-lg class exists', () => {
      expect(css).toContain('.icon-stroke-lg');
    });
  });

  // Section 3: dashboard.html emoji elimination
  describe('3. Dashboard HTML Emoji Elimination', () => {
    const html = read('dashboard.html');

    it('no 🔧 wrench emoji', () => {
      expect(html).not.toContain('🔧');
    });
    it('no 🛡️ shield emoji in trust filter', () => {
      // Check trust filter section specifically
      expect(html).not.toMatch(/🛡️\s*Trust Level/);
    });
    it('no 🤖 robot emoji in AI filter', () => {
      expect(html).not.toMatch(/🤖\s*AI Content/);
    });
    it('no 🔬 microscope emoji', () => {
      expect(html).not.toContain('🔬');
    });
    it('credits icon SVG removed', () => {
      expect(html).not.toContain('class="credit-icon"');
    });
    it('Lucide shield-check in trust filter', () => {
      expect(html).toContain('data-lucide="shield-check"');
    });
    it('Lucide scan-text in AI filter', () => {
      expect(html).toContain('data-lucide="scan-text"');
    });
  });

  // Section 4: job-feed.js emoji elimination
  describe('4. Job Feed Emoji Elimination', () => {
    const js = read('js/job-feed.js');

    it('no 🛡️ emoji in trust badge config', () => {
      expect(js).not.toMatch(/icon:\s*'🛡️'/);
    });
    it('no 🚩 emoji in trust badge config', () => {
      expect(js).not.toMatch(/icon:\s*'🚩'/);
    });
    it('no 🤖 emoji in AI badge config', () => {
      expect(js).not.toMatch(/icon:\s*'🤖'/);
    });
    it('Lucide shield-check in trust badge', () => {
      expect(js).toContain('data-lucide="shield-check"');
    });
    it('Lucide flag in suspicious badge', () => {
      expect(js).toContain('data-lucide="flag"');
    });
    it('Lucide scan-text in AI badge', () => {
      expect(js).toContain('data-lucide="scan-text"');
    });
    it('refreshIcons() called after job card render', () => {
      expect(js).toContain('window.refreshIcons');
    });
  });

  // Section 5: Other JS file emoji elimination
  describe('5. Other JS Emoji Elimination', () => {
    it('billing.js has no 🎉 emoji', () => {
      const js = read('js/billing.js');
      expect(js).not.toContain('🎉');
    });
    it('referrals.js has no 🎉 emoji', () => {
      const js = read('js/referrals.js');
      expect(js).not.toContain('🎉');
    });
    it('tab-guard.js has no ⚠️ emoji', () => {
      const js = read('js/tab-guard.js');
      expect(js).not.toContain('⚠️');
    });
    it('location.js has no 💡 emoji', () => {
      const js = read('js/location.js');
      expect(js).not.toContain('💡');
    });
    it('admin.js uses Lucide icons instead of emoji', () => {
      const js = read('js/admin.js');
      expect(js).not.toContain("icon: '📈'");
      expect(js).not.toContain("icon: '🛡'");
      expect(js).toContain('data-lucide=');
    });
    it('resumes.js uses Lucide icons for AI scores', () => {
      const js = read('js/resumes.js');
      expect(js).not.toMatch(/icon:\s*'🤖'/);
      expect(js).toContain('data-lucide=');
    });
    it('pipeline-overlay-tab.js uses Lucide shield-check', () => {
      const js = read('js/pipeline-overlay-tab.js');
      expect(js).toContain('data-lucide="shield-check"');
    });
  });

  // Section 6: Dynamic content re-initialization
  describe('6. Dynamic Content refreshIcons() Calls', () => {
    it('chat.js calls refreshIcons after message append', () => {
      const js = read('js/chat.js');
      expect(js).toContain('window.refreshIcons');
    });
    it('job-feed.js calls refreshIcons after card render', () => {
      const js = read('js/job-feed.js');
      const matches = js.match(/window\.refreshIcons/g);
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  // Section 7: globals.ts toast icon fix
  describe('7. Globals Toast Icon', () => {
    it('globals.ts no longer uses 20x20 viewBox star', () => {
      const ts = read('js/globals.ts');
      expect(ts).not.toContain('viewBox="0 0 20 20"');
    });
    it('globals.ts uses Lucide star icon', () => {
      const ts = read('js/globals.ts');
      expect(ts).toContain('data-lucide="star"');
    });
  });

  // Section 8: Version and build
  describe('8. Version & Build', () => {
    it('version is v8.21', () => {
      const v = read('js/version.js');
      expect(v).toContain('v8.21');
    });
    it('dist/dashboard.min.js exists and is rebuilt', () => {
      expect(existsSync('dist/dashboard.min.js')).toBe(true);
    });
  });
});
