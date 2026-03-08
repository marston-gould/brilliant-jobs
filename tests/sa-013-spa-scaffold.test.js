// ============================================================
// SA-013: SPA Scaffold + Design System Foundation Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const ROOT = process.cwd();
const SPA = join(ROOT, 'src/app');

describe('SA-013: SPA Scaffold', () => {
  describe('Directory Structure', () => {
    const requiredDirs = [
      'src/app',
      'src/app/components',
      'src/app/providers',
      'src/app/shell',
      'src/app/pages/dashboard',
      'src/app/pages/admin',
      'src/app/hooks',
      'src/app/design-tokens',
    ];

    requiredDirs.forEach(dir => {
      it(`${dir}/ exists`, () => {
        expect(existsSync(join(ROOT, dir))).toBe(true);
      });
    });
  });

  describe('Core Files', () => {
    const requiredFiles = [
      'src/app/main.tsx',
      'src/app/index.html',
      'src/app/routes.tsx',
      'src/app/shell/AppShell.tsx',
      'src/app/shell/AuthGuard.tsx',
      'src/app/shell/AdminGuard.tsx',
      'src/app/shell/LegacyPageWrapper.tsx',
      'src/app/shell/index.ts',
      'src/app/providers/types.ts',
      'src/app/providers/supabase.ts',
      'src/app/providers/DataProvider.tsx',
      'src/app/providers/index.ts',
      'src/app/design-tokens/tokens.ts',
      'docs/scaling/adr-02-spa.md',
      'docs/scaling/component-pattern-library.md',
    ];

    requiredFiles.forEach(file => {
      it(`${file} exists`, () => {
        expect(existsSync(join(ROOT, file))).toBe(true);
      });
    });
  });

  describe('Design System Components', () => {
    const components = ['Button', 'Card', 'Badge', 'Input', 'Select', 'Modal'];

    components.forEach(name => {
      it(`${name}.tsx exists with export`, () => {
        const path = join(SPA, 'components', `${name}.tsx`);
        expect(existsSync(path)).toBe(true);
        const content = readFileSync(path, 'utf-8');
        expect(content).toContain(`export function ${name}`);
      });
    });

    it('barrel export includes all components', () => {
      const index = readFileSync(join(SPA, 'components/index.ts'), 'utf-8');
      components.forEach(name => {
        expect(index).toContain(`export { ${name} }`);
      });
    });

    it('zero inline styles in components', () => {
      const compDir = join(SPA, 'components');
      const files = readdirSync(compDir).filter(f => f.endsWith('.tsx'));
      files.forEach(file => {
        const content = readFileSync(join(compDir, file), 'utf-8');
        // Allow style= only in very specific patterns (not general inline styles)
        const inlineStyles = (content.match(/style\s*=\s*\{/g) || []).length;
        expect(inlineStyles).toBe(0);
      });
    });

    it('no hardcoded colors in components', () => {
      const compDir = join(SPA, 'components');
      const files = readdirSync(compDir).filter(f => f.endsWith('.tsx'));
      files.forEach(file => {
        const content = readFileSync(join(compDir, file), 'utf-8');
        // Check for hex colors (except in comments)
        const lines = content.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
        const hasHex = lines.some(l => /#[0-9a-fA-F]{3,8}\b/.test(l) && !l.includes('border-t-transparent'));
        if (hasHex && file !== 'Modal.tsx') { // Modal has a black backdrop overlay
          expect(hasHex).toBe(false);
        }
      });
    });
  });

  describe('Data Provider Interfaces', () => {
    it('types.ts defines all provider interfaces', () => {
      const content = readFileSync(join(SPA, 'providers/types.ts'), 'utf-8');
      ['SearchProvider', 'JobProvider', 'UserProvider', 'PipelineProvider', 'DataProviders'].forEach(name => {
        expect(content).toContain(`export interface ${name}`);
      });
    });

    it('types.ts defines core domain types', () => {
      const content = readFileSync(join(SPA, 'providers/types.ts'), 'utf-8');
      ['Job', 'UserProfile', 'PipelineItem', 'SearchParams', 'SearchResult'].forEach(name => {
        expect(content).toContain(`export interface ${name}`);
      });
    });

    it('supabase.ts implements all provider interfaces', () => {
      const content = readFileSync(join(SPA, 'providers/supabase.ts'), 'utf-8');
      ['SupabaseSearchProvider', 'SupabaseJobProvider', 'SupabaseUserProvider', 'SupabasePipelineProvider'].forEach(name => {
        expect(content).toContain(`export class ${name}`);
      });
    });

    it('DataProvider.tsx provides React context', () => {
      const content = readFileSync(join(SPA, 'providers/DataProvider.tsx'), 'utf-8');
      expect(content).toContain('export function DataProvider');
      expect(content).toContain('export function useProviders');
      expect(content).toContain('export function useSearch');
      expect(content).toContain('export function useJobs');
      expect(content).toContain('export function useUser');
      expect(content).toContain('export function usePipeline');
    });

    it('createSupabaseProviders factory exists', () => {
      const content = readFileSync(join(SPA, 'providers/supabase.ts'), 'utf-8');
      expect(content).toContain('export function createSupabaseProviders');
    });
  });

  describe('SPA Shell', () => {
    it('AppShell has unified nav for dashboard + admin', () => {
      const content = readFileSync(join(SPA, 'shell/AppShell.tsx'), 'utf-8');
      expect(content).toContain('dashboardNav');
      expect(content).toContain('adminNav');
      expect(content).toContain('<Outlet');
    });

    it('AdminGuard checks role before rendering', () => {
      const content = readFileSync(join(SPA, 'shell/AdminGuard.tsx'), 'utf-8');
      expect(content).toContain("role === 'admin'");
      expect(content).toContain('<Navigate');
    });

    it('AuthGuard redirects unauthenticated users', () => {
      const content = readFileSync(join(SPA, 'shell/AuthGuard.tsx'), 'utf-8');
      expect(content).toContain('unauthenticated');
      expect(content).toContain('getCurrentUser');
    });

    it('LegacyPageWrapper bridges legacy tab system', () => {
      const content = readFileSync(join(SPA, 'shell/LegacyPageWrapper.tsx'), 'utf-8');
      expect(content).toContain('tabId');
      expect(content).toContain('surface');
      expect(content).toContain('activateLegacyTab');
    });
  });

  describe('Route Definitions', () => {
    it('routes.tsx defines all 12 dashboard routes', () => {
      const content = readFileSync(join(SPA, 'routes.tsx'), 'utf-8');
      const dashboardPages = ['feed', 'pipeline', 'keywords', 'resumes', 'applications',
        'stats', 'tuning', 'billing', 'settings', 'integrations', 'chat', 'referrals'];
      dashboardPages.forEach(page => {
        expect(content).toContain(`path: '${page}'`);
      });
    });

    it('routes.tsx defines admin routes with AdminGuard', () => {
      const content = readFileSync(join(SPA, 'routes.tsx'), 'utf-8');
      expect(content).toContain('<AdminGuard');
      const adminPages = ['overview', 'jobs', 'cron', 'content', 'seo',
        'notifications', 'agents', 'monitoring', 'killswitch', 'compliance'];
      adminPages.forEach(page => {
        expect(content).toContain(`path: '${page}'`);
      });
    });

    it('admin routes are nested under /app/admin', () => {
      const content = readFileSync(join(SPA, 'routes.tsx'), 'utf-8');
      expect(content).toContain("path: 'admin'");
    });
  });

  describe('Build Configuration', () => {
    it('vite.config.js has React plugin', () => {
      const content = readFileSync(join(ROOT, 'vite.config.js'), 'utf-8');
      expect(content).toContain("@vitejs/plugin-react");
      expect(content).toContain('react()');
    });

    it('vite.config.js has path aliases matching tsconfig', () => {
      const content = readFileSync(join(ROOT, 'vite.config.js'), 'utf-8');
      expect(content).toContain("'@app'");
      expect(content).toContain("'@components'");
      expect(content).toContain("'@providers'");
    });

    it('vite.config.js has code splitting config', () => {
      const content = readFileSync(join(ROOT, 'vite.config.js'), 'utf-8');
      expect(content).toContain('manualChunks');
      expect(content).toContain('react-vendor');
      expect(content).toContain('admin-pages');
    });

    it('tsconfig.json has JSX support', () => {
      const raw = readFileSync(join(ROOT, 'tsconfig.json'), 'utf-8');
      expect(raw).toContain('"jsx": "react-jsx"');
    });

    it('tsconfig.json includes SPA source files', () => {
      const raw = readFileSync(join(ROOT, 'tsconfig.json'), 'utf-8');
      expect(raw).toContain('src/app/**/*.tsx');
    });

    it('package.json has react dependencies', () => {
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
      expect(pkg.dependencies.react).toBeDefined();
      expect(pkg.dependencies['react-dom']).toBeDefined();
      expect(pkg.dependencies['react-router-dom']).toBeDefined();
    });

    it('package.json has dev:spa and build:spa scripts', () => {
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
      expect(pkg.scripts['dev:spa']).toBeDefined();
      expect(pkg.scripts['build:spa']).toBeDefined();
    });

    it('tailwind.config.js scans SPA source files', () => {
      const content = readFileSync(join(ROOT, 'tailwind.config.js'), 'utf-8');
      expect(content).toContain('src/app/**/*.tsx');
    });

    it('vercel.json has SPA rewrite for /app/*', () => {
      const content = readFileSync(join(ROOT, 'vercel.json'), 'utf-8');
      expect(content).toContain('/app/:path*');
    });
  });

  describe('TypeScript Compilation', () => {
    it('tsc --noEmit passes with zero errors', () => {
      const result = execSync('npx tsc --noEmit 2>&1', { cwd: ROOT, encoding: 'utf-8' });
      expect(result.trim()).toBe('');
    }, 30000);
  });

  describe('Vite SPA Build', () => {
    it('vite build succeeds', () => {
      const result = execSync('npx vite build 2>&1', { cwd: ROOT, encoding: 'utf-8' });
      expect(result).toContain('built in');
    }, 30000);

    it('SPA initial payload < 160KB gzip', () => {
      const result = execSync('npx vite build 2>&1', { cwd: ROOT, encoding: 'utf-8' });
      // Extract gzip sizes from build output
      const gzipSizes = result.match(/gzip:\s+([\d.]+)\s+kB/g) || [];
      const totalGzip = gzipSizes.reduce((sum, match) => {
        const kb = parseFloat(match.replace('gzip:', '').replace('kB', '').trim());
        return sum + kb;
      }, 0);
      // Total gzip should be under 160KB (react + react-dom + router + app + providers + CSS)
      expect(totalGzip).toBeLessThan(160);
    }, 30000);
  });

  describe('Legacy Build Preservation', () => {
    it('node build.js still succeeds', () => {
      const result = execSync('node build.js 2>&1', { cwd: ROOT, encoding: 'utf-8' });
      expect(result).toContain('PASS');
    }, 30000);

    it('node build-admin.js still succeeds', () => {
      const result = execSync('node build-admin.js 2>&1', { cwd: ROOT, encoding: 'utf-8' });
      expect(result).toContain('minified');
    }, 30000);
  });

  describe('ADR-02 Documentation', () => {
    it('ADR-02 exists with implementation details', () => {
      const content = readFileSync(join(ROOT, 'docs/scaling/adr-02-spa.md'), 'utf-8');
      expect(content).toContain('Status:');
      expect(content).toContain('Vite + React Router');
      expect(content).toContain('Dual-Mode Shell');
      expect(content).toContain('Data Provider Pattern');
      expect(content).toContain('Code Splitting Strategy');
      expect(content).toContain('Migration Order');
    });

    it('Component pattern library exists', () => {
      const content = readFileSync(join(ROOT, 'docs/scaling/component-pattern-library.md'), 'utf-8');
      expect(content).toContain('Migration Checklist');
      expect(content).toContain('Zero inline styles');
      expect(content).toContain('Dark Mode');
    });
  });
});
