import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const readFile = (f) => fs.readFileSync(path.join(ROOT, f), 'utf-8');

describe('CS-P1-009: Dark Mode + Design System Foundation', () => {
  let dashboardHtml, inputCss, stylesCss, themeJs, tailwindConfig, buildJs;

  beforeAll(() => {
    dashboardHtml = readFile('dashboard.html');
    inputCss = readFile('src/input.css');
    stylesCss = readFile('styles.css');
    themeJs = readFile('js/theme.js');
    tailwindConfig = readFile('tailwind.config.js');
    buildJs = readFile('build.js');
  });

  describe('CSS-002: Dark Mode Implementation', () => {
    it('defines [data-theme="dark"] CSS custom properties', () => {
      expect(inputCss).toContain('[data-theme="dark"]');
      expect(inputCss).toContain('--bg-main-hsl: 225, 18%, 11%');
      expect(inputCss).toContain('--text-hsl: 220, 16%, 90%');
    });

    it('defines [data-theme="auto"] with prefers-color-scheme media query', () => {
      expect(inputCss).toContain('prefers-color-scheme: dark');
      expect(inputCss).toContain('[data-theme="auto"]');
    });

    it('includes color-scheme: dark for native UI elements', () => {
      expect(inputCss).toContain('color-scheme: dark');
    });

    it('theme.js exists and includes cycle function', () => {
      expect(themeJs).toContain('BJ_Theme');
      expect(themeJs).toContain('cycleTheme');
      expect(themeJs).toContain("STORAGE_KEY = 'bj-theme'");
    });

    it('dashboard.html has theme flash-prevention script in head', () => {
      const headSection = dashboardHtml.split('</head>')[0];
      expect(headSection).toContain("localStorage.getItem('bj-theme')");
      expect(headSection).toContain("data-theme");
    });

    it('theme toggle exists in nav footer', () => {
      expect(dashboardHtml).toContain('BJ_Theme.cycle()');
      expect(dashboardHtml).toContain('theme-toggle');
    });

    it('theme buttons exist in settings page', () => {
      expect(dashboardHtml).toContain("BJ_Theme.set('light')");
      expect(dashboardHtml).toContain("BJ_Theme.set('dark')");
      expect(dashboardHtml).toContain("BJ_Theme.set('auto')");
    });

    it('theme.js included in shell chunk for early loading', () => {
      expect(buildJs).toContain("'js/theme.js'");
      const shellSection = buildJs.split('shell:')[1].split('],')[0];
      expect(shellSection).toContain('theme.js');
    });
  });

  describe('CSS-003: Tailwind Safelist Consolidation', () => {
    it('safelist has 7 or fewer pattern entries', () => {
      const patterns = tailwindConfig.match(/\{ pattern:/g) || [];
      expect(patterns.length).toBeLessThanOrEqual(7);
    });

    it('safelist includes u- prefix for utility classes', () => {
      expect(tailwindConfig).toContain('u-');
    });

    it('safelist patterns require alpha char after pl- to avoid Tailwind collision', () => {
      expect(tailwindConfig).toContain('pl-[a-z]');
    });
  });

  describe('CSS-004: CSS Bundle Size', () => {
    it('minified CSS file exists', () => {
      const stats = fs.statSync(path.join(ROOT, 'styles.css'));
      expect(stats.size).toBeGreaterThan(0);
    });

    it('CSS gzip estimate is under 30KB', () => {
      // styles.css should be < 30KB when gzipped (25KB measured at build)
      const stats = fs.statSync(path.join(ROOT, 'styles.css'));
      // Rough estimate: gzip achieves ~6:1 on CSS
      expect(stats.size / 6).toBeLessThan(30000);
    });
  });

  describe('DS1-3: Inline Style Audit', () => {
    it('dashboard.html inline styles reduced by 50%+ from original 797', () => {
      const inlineStyles = (dashboardHtml.match(/style="/g) || []).length;
      // Original: 797 inline styles. Target: <399 (50%+ reduction)
      expect(inlineStyles).toBeLessThanOrEqual(399);
    });

    it('utility classes defined in CSS', () => {
      expect(inputCss).toContain('.u-meta');
      expect(inputCss).toContain('.u-flex-between');
      expect(inputCss).toContain('.u-hidden');
      expect(inputCss).toContain('.u-chart-box');
      expect(inputCss).toContain('.u-btn-pill');
    });

    it('u-hidden class used as display:none replacement', () => {
      expect(dashboardHtml).toContain('class="u-hidden"');
    });

    it('u-meta class used as font-size/color replacement', () => {
      expect(dashboardHtml).toContain('class="u-meta"');
    });
  });

  describe('DS1-5: Dark Mode All 14 Pages', () => {
    it('dark mode tokens cover all core surface areas', () => {
      // Verify dark mode overrides exist for all semantic token groups
      // Check the full [data-theme="dark"] block
      expect(inputCss).toContain('[data-theme="dark"]');
      const darkIdx = inputCss.indexOf('[data-theme="dark"] {');
      const darkBlock = inputCss.substring(darkIdx, darkIdx + 4000);
      expect(darkBlock).toContain('--bg-main-hsl');
      expect(darkBlock).toContain('--text-hsl');
      expect(darkBlock).toContain('--border-hsl');
      expect(darkBlock).toContain('--accent-hsl');
      expect(darkBlock).toContain('--green-hsl');
      expect(darkBlock).toContain('--red-hsl');
      expect(darkBlock).toContain('--nav-bg-hsl');
    });

    it('dark mode overrides for form inputs exist', () => {
      expect(inputCss).toContain('[data-theme="dark"] input');
      expect(inputCss).toContain('[data-theme="dark"] select');
    });

    it('dark mode overrides for cards and shadows exist', () => {
      expect(inputCss).toContain('[data-theme="dark"] .card');
      expect(inputCss).toContain('[data-theme="dark"] .stat-card');
    });

    it('dark mode overrides for scrollbars exist', () => {
      expect(inputCss).toContain('[data-theme="dark"] ::-webkit-scrollbar');
    });
  });

  describe('DS1-7: Pipeline Dark Mode', () => {
    it('pipeline CSS has dark mode overrides', () => {
      expect(inputCss).toContain('[data-theme="dark"] .pl-stage-section');
      expect(inputCss).toContain('[data-theme="dark"] .pl-table th');
      expect(inputCss).toContain('[data-theme="dark"] .pl-table td');
    });

    it('pipeline.js uses CSS variables instead of hardcoded hex', () => {
      const pipelineJs = readFile('js/pipeline.js');
      expect(pipelineJs).not.toContain("'#f59e0b'");
      expect(pipelineJs).not.toContain("'#22c55e'");
      expect(pipelineJs).not.toContain("'#ef4444'");
    });
  });

  describe('DS1-10: Single HTML Architecture', () => {
    it('ADR document exists', () => {
      expect(fs.existsSync(path.join(ROOT, 'docs/audit/adr-ds1-10-single-html.md'))).toBe(true);
    });

    it('ADR recommends deferring to SA-013', () => {
      const adr = readFile('docs/audit/adr-ds1-10-single-html.md');
      expect(adr).toContain('SA-013');
      expect(adr).toContain('Accepted');
    });
  });
});
