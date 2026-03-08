// ============================================================
// SA-014: Feed Page Migration — Validation Tests
// ============================================================
// Verifies all migration requirements from the component
// pattern library: directory structure, components, design
// tokens, provider usage, dark mode, bundle size, builds.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const ROOT = join(__dirname, '..');
const FEED_DIR = join(ROOT, 'src/app/pages/dashboard/feed');
const COMPONENTS_DIR = join(FEED_DIR, 'components');
const HOOKS_DIR = join(FEED_DIR, 'hooks');

describe('SA-014: Feed Page Migration', () => {

  // ── Directory Structure ───────────────────────────────

  describe('Directory Structure', () => {
    it('feed page directory exists', () => {
      expect(existsSync(FEED_DIR)).toBe(true);
    });

    it('components subdirectory exists', () => {
      expect(existsSync(COMPONENTS_DIR)).toBe(true);
    });

    it('hooks subdirectory exists', () => {
      expect(existsSync(HOOKS_DIR)).toBe(true);
    });
  });

  // ── Required Components ───────────────────────────────

  describe('Required Components', () => {
    const REQUIRED_FILES = [
      'FeedPage.tsx',
      'components/FeedHero.tsx',
      'components/SearchModeToggle.tsx',
      'components/FilterBuilder.tsx',
      'components/FilterSidebar.tsx',
      'components/SavedSearches.tsx',
      'components/SortControls.tsx',
      'components/SearchBar.tsx',
      'components/JobTable.tsx',
      'components/JobRow.tsx',
      'components/PaginationControls.tsx',
      'components/index.ts',
      'hooks/useFeedSearch.ts',
      'index.ts',
    ];

    for (const file of REQUIRED_FILES) {
      it(`${file} exists`, () => {
        expect(existsSync(join(FEED_DIR, file))).toBe(true);
      });
    }
  });

  // ── Component Exports ─────────────────────────────────

  describe('Component Exports', () => {
    it('barrel export includes all components', () => {
      const indexContent = readFileSync(join(COMPONENTS_DIR, 'index.ts'), 'utf-8');
      const expectedExports = [
        'FeedHero', 'SearchModeToggle', 'FilterBuilder',
        'TrustFilter', 'AiContentFilter', 'SortControls',
        'SearchBar', 'JobTable', 'JobRow', 'PaginationControls',
        'SavedSearches',
      ];
      for (const exp of expectedExports) {
        expect(indexContent).toContain(exp);
      }
    });

    it('feed page barrel exports FeedPage and useFeedSearch', () => {
      const indexContent = readFileSync(join(FEED_DIR, 'index.ts'), 'utf-8');
      expect(indexContent).toContain('FeedPage');
      expect(indexContent).toContain('useFeedSearch');
    });
  });

  // ── Design Token Compliance ───────────────────────────

  describe('Design Token Compliance', () => {
    function readAllTsx() {
      const files = [];
      const feedPage = readFileSync(join(FEED_DIR, 'FeedPage.tsx'), 'utf-8');
      files.push({ file: 'FeedPage.tsx', content: feedPage });

      const componentFiles = readdirSync(COMPONENTS_DIR)
        .filter(f => f.endsWith('.tsx'));
      for (const f of componentFiles) {
        files.push({ file: f, content: readFileSync(join(COMPONENTS_DIR, f), 'utf-8') });
      }
      return files;
    }

    it('no hardcoded bg-white or bg-black in components', () => {
      const files = readAllTsx();
      for (const { file, content } of files) {
        // Allow in comments/strings, but check className usage
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith('//') || line.startsWith('*')) continue;
          // Check for bg-white or bg-black in className strings
          if (line.includes('className') && (line.includes('bg-white') || line.includes('bg-black'))) {
            throw new Error(`${file}:${i + 1} uses hardcoded bg-white/bg-black`);
          }
        }
      }
    });

    it('no text-black or text-white in components (use text-text)', () => {
      const files = readAllTsx();
      for (const { file, content } of files) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith('//') || line.startsWith('*')) continue;
          if (line.includes('className') && (line.includes("'text-black'") || line.includes("'text-white'"))) {
            throw new Error(`${file}:${i + 1} uses hardcoded text-black/text-white`);
          }
        }
      }
    });

    it('design system imports used in FeedPage', () => {
      const feedPage = readFileSync(join(FEED_DIR, 'FeedPage.tsx'), 'utf-8');
      expect(feedPage).toContain('FeedHero');
      expect(feedPage).toContain('SearchModeToggle');
      expect(feedPage).toContain('FilterBuilder');
      expect(feedPage).toContain('SortControls');
      expect(feedPage).toContain('JobTable');
    });
  });

  // ── Provider Pattern Compliance ───────────────────────

  describe('Provider Pattern', () => {
    it('useFeedSearch hook uses ProviderError', () => {
      const hook = readFileSync(join(HOOKS_DIR, 'useFeedSearch.ts'), 'utf-8');
      expect(hook).toContain('ProviderError');
    });

    it('useFeedSearch exports typed state and actions', () => {
      const hook = readFileSync(join(HOOKS_DIR, 'useFeedSearch.ts'), 'utf-8');
      expect(hook).toContain('FeedSearchState');
      expect(hook).toContain('FeedSearchActions');
      expect(hook).toContain('FeedJob');
      expect(hook).toContain('SortEntry');
    });

    it('components do not call window.BJ.supabase directly', () => {
      const componentFiles = readdirSync(COMPONENTS_DIR)
        .filter(f => f.endsWith('.tsx'));
      for (const f of componentFiles) {
        const content = readFileSync(join(COMPONENTS_DIR, f), 'utf-8');
        expect(content).not.toContain('window.BJ.supabase');
        expect(content).not.toContain("window['BJ']");
      }
    });
  });

  // ── Accessibility ─────────────────────────────────────

  describe('Accessibility', () => {
    it('JobRow uses semantic table elements', () => {
      const content = readFileSync(join(COMPONENTS_DIR, 'JobRow.tsx'), 'utf-8');
      expect(content).toContain('<tr');
      expect(content).toContain('<td');
    });

    it('buttons have type attribute', () => {
      const componentFiles = readdirSync(COMPONENTS_DIR)
        .filter(f => f.endsWith('.tsx'));
      for (const f of componentFiles) {
        const content = readFileSync(join(COMPONENTS_DIR, f), 'utf-8');
        const buttonMatches = content.match(/<button[^>]*>/g) || [];
        for (const btn of buttonMatches) {
          expect(btn).toContain('type=');
        }
      }
    });

    it('interactive elements have title or aria attributes', () => {
      const jobRow = readFileSync(join(COMPONENTS_DIR, 'JobRow.tsx'), 'utf-8');
      expect(jobRow).toContain('title=');
    });
  });

  // ── Route Registration ────────────────────────────────

  describe('Route Integration', () => {
    it('routes.tsx imports FeedPage (not LegacyFeed)', () => {
      const routes = readFileSync(join(ROOT, 'src/app/routes.tsx'), 'utf-8');
      expect(routes).toContain("import('@app/pages/dashboard/feed/FeedPage')");
      expect(routes).not.toMatch(/function LegacyFeed/);
    });

    it('feed route uses FeedPageRoute', () => {
      const routes = readFileSync(join(ROOT, 'src/app/routes.tsx'), 'utf-8');
      expect(routes).toContain("{ path: 'feed', element: <FeedPageRoute />");
    });

    it('FeedPage is lazy-loaded with Suspense', () => {
      const routes = readFileSync(join(ROOT, 'src/app/routes.tsx'), 'utf-8');
      expect(routes).toContain('lazy(');
      expect(routes).toContain('Suspense');
    });
  });

  // ── Build Validation ──────────────────────────────────

  describe('Build', () => {
    it('SPA build succeeds', () => {
      const result = execSync('npx vite build 2>&1', { cwd: ROOT, encoding: 'utf-8' });
      expect(result).toContain('built in');
    }, 30000);

    it('FeedPage chunk under 50KB gzip', () => {
      const result = execSync('npx vite build 2>&1', { cwd: ROOT, encoding: 'utf-8' });
      const feedMatch = result.match(/FeedPage.*gzip:\s+([\d.]+)\s+kB/);
      expect(feedMatch).not.toBeNull();
      const feedGzip = parseFloat(feedMatch[1]);
      expect(feedGzip).toBeLessThan(50);
    }, 30000);

    it('legacy build.js still succeeds', () => {
      const result = execSync('node build.js 2>&1', { cwd: ROOT, encoding: 'utf-8' });
      expect(result).toContain('Minified');
    }, 15000);

    it('legacy build-admin.js still succeeds', () => {
      execSync('node build-admin.js 2>&1', { cwd: ROOT, encoding: 'utf-8' });
      // Admin build doesn't print specific success message, just runs without error
    }, 15000);
  });

  // ── Loading & Error States ────────────────────────────

  describe('Loading & Error States', () => {
    it('JobTable has skeleton loading state', () => {
      const content = readFileSync(join(COMPONENTS_DIR, 'JobTable.tsx'), 'utf-8');
      expect(content).toContain('SkeletonRow');
      expect(content).toContain('animate-pulse');
    });

    it('JobTable has empty state', () => {
      const content = readFileSync(join(COMPONENTS_DIR, 'JobTable.tsx'), 'utf-8');
      expect(content).toContain('EmptyState');
    });

    it('JobTable has error state', () => {
      const content = readFileSync(join(COMPONENTS_DIR, 'JobTable.tsx'), 'utf-8');
      expect(content).toContain('ErrorState');
    });

    it('useFeedSearch has abort controller for cancellation', () => {
      const hook = readFileSync(join(HOOKS_DIR, 'useFeedSearch.ts'), 'utf-8');
      expect(hook).toContain('AbortController');
      expect(hook).toContain('abortRef');
    });
  });
});
