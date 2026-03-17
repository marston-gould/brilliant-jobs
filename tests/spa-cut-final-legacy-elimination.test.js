/**
 * SPA-CUT-FINAL: Legacy HTML Elimination
 * Verifies dashboard.html + admin.html retired, SPA standalone,
 * CSP strict, Vercel routing updated.
 * Session: SPA-CUT-FINAL | Version: v10.41 → v10.42
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf-8');
const exists = (f) => existsSync(join(ROOT, f));

// ── 1. Legacy HTML Retired ───────────────────────────────────

describe('1. Legacy HTML retired from root', () => {
  it('1.1 dashboard.html NOT at root', () => expect(exists('dashboard.html')).toBe(false));
  it('1.2 admin.html NOT at root', () => expect(exists('admin.html')).toBe(false));
  it('1.3 dashboard.html archived in legacy/', () => expect(exists('legacy/dashboard.html')).toBe(true));
  it('1.4 admin.html archived in legacy/', () => expect(exists('legacy/admin.html')).toBe(true));
});

// ── 2. SPA index.html is standalone ──────────────────────────

describe('2. SPA index.html standalone', () => {
  const html = read('src/app/index.html');

  it('2.1 SPA index.html exists', () => expect(exists('src/app/index.html')).toBe(true));
  it('2.2 No supabase.min.js vendor script', () => expect(html).not.toContain('supabase.min.js'));
  it('2.3 No globals.js legacy script', () => expect(html).not.toContain('globals.js'));
  it('2.4 No version.js legacy script', () => expect(html).not.toContain('version.js'));
  it('2.5 No theme.js legacy script', () => expect(html).not.toContain('theme.js'));
  it('2.6 No fingerprint.js legacy script', () => expect(html).not.toContain('fingerprint.js'));
  it('2.7 No tier-gating.js legacy script', () => expect(html).not.toContain('tier-gating.js'));
  it('2.8 Has Vite module entry point', () => expect(html).toContain('main.tsx'));
  it('2.9 Has theme flash prevention', () => expect(html).toContain('bj-theme'));
  it('2.10 Has SPA mount point', () => expect(html).toContain('spa-root'));
  it('2.11 Only 2 script tags (theme inline + Vite module)', () => {
    const count = (html.match(/<script/g) || []).length;
    expect(count).toBe(2);
  });
  it('2.12 SPA-CUT-FINAL comment present', () => expect(html).toContain('SPA-CUT-FINAL'));
});

// ── 3. Vercel Routing ────────────────────────────────────────

describe('3. Vercel routing updated', () => {
  const vj = read('vercel.json');

  it('3.1 /dashboard.html rewrites to SPA', () => expect(vj).toContain('"/dashboard.html"'));
  it('3.2 /dashboard rewrites to SPA', () => expect(vj).toContain('"/dashboard"'));
  it('3.3 /admin.html rewrites to SPA', () => expect(vj).toContain('"/admin.html"'));
  it('3.4 /admin rewrites to SPA', () => expect(vj).toContain('"/admin"'));
  it('3.5 All 4 rewrites point to SPA index', () => {
    const matches = vj.match(/"destination":\s*"\/src\/app\/index\.html"/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(6); // /app, /app/:path*, /dashboard, /dashboard.html, /admin, /admin.html
  });
});

// ── 4. CSP Strict ────────────────────────────────────────────

describe('4. CSP hardened', () => {
  const vj = read('vercel.json');

  it('4.1 Catch-all CSP has no unsafe-inline in script-src', () => {
    // Find the /(.*) CSP rule
    const cspMatch = vj.match(/source.*?\(\.\*\)[\s\S]*?script-src([^;]+);/);
    if (cspMatch) {
      expect(cspMatch[1]).not.toContain("'unsafe-inline'");
    }
  });

  it('4.2 SPA /app/* CSP has SHA-256 for theme script', () => {
    expect(vj).toContain('sha256-DxI1Xb7ZaftmBbfsr/G8P/o5YMStn92mvbY1xkHad5o=');
  });

  it('4.3 Catch-all CSP has SHA-256 for theme script', () => {
    // The catch-all now also uses SHA-256 instead of unsafe-inline
    const catchAll = vj.split('"/(.*)"')[1] || '';
    expect(catchAll).toContain('sha256-');
  });
});

// ── 5. Standalone Supabase Client ────────────────────────────

describe('5. @lib/supabase is sole data source', () => {
  const lib = read('src/app/lib/supabase.ts');

  it('5.1 Uses npm @supabase/supabase-js (not vendor script)', () => {
    expect(lib).toContain("from '@supabase/supabase-js'");
  });

  it('5.2 No window.supabase reference', () => {
    expect(lib).not.toContain('window.supabase');
  });
});

// ── 6. All hooks still standalone (regression) ───────────────

describe('6. Hook bridge elimination intact', () => {
  const hooks = [
    'src/app/pages/dashboard/feed/hooks/useFeedSearch.ts',
    'src/app/pages/dashboard/pipeline/hooks/usePipeline.ts',
    'src/app/pages/dashboard/keywords/hooks/useKeywords.ts',
    'src/app/pages/dashboard/resumes/hooks/useResumes.ts',
    'src/app/pages/dashboard/applications/hooks/useApplications.ts',
    'src/app/pages/dashboard/stats/hooks/useStats.ts',
    'src/app/pages/dashboard/billing/hooks/useBilling.ts',
    'src/app/pages/dashboard/settings/hooks/useSettings.ts',
    'src/app/pages/dashboard/tuning/hooks/useTuning.ts',
    'src/app/pages/dashboard/integrations/hooks/useIntegrations.ts',
    'src/app/pages/dashboard/chat/hooks/useChat.ts',
    'src/app/pages/dashboard/referrals/hooks/useReferrals.ts',
  ];

  hooks.forEach(f => {
    it(`${f.split('/').pop()} — zero window refs`, () => {
      const code = read(f).split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
      expect(code).not.toContain('window as any');
    });
  });
});

// ── 7. SPA Build Output ─────────────────────────────────────

describe('7. SPA build', () => {
  it('7.1 dist/spa exists', () => expect(exists('dist/spa')).toBe(true));
  it('7.2 dist/spa HTML exists', () => expect(exists('dist/spa/src/app/index.html')).toBe(true));
  it('7.3 No legacy script references in built HTML', () => {
    const html = read('dist/spa/src/app/index.html');
    expect(html).not.toContain('globals.js');
    expect(html).not.toContain('supabase.min.js');
  });
});

// ── 8. File inventory ────────────────────────────────────────

describe('8. File inventory', () => {
  it('8.1 SPA entry exists', () => expect(exists('src/app/index.html')).toBe(true));
  it('8.2 SPA main.tsx exists', () => expect(exists('src/app/main.tsx')).toBe(true));
  it('8.3 Standalone supabase client exists', () => expect(exists('src/app/lib/supabase.ts')).toBe(true));
  it('8.4 Legacy archive exists', () => expect(exists('legacy/dashboard.html')).toBe(true));
  it('8.5 index.html (landing) untouched', () => expect(exists('index.html')).toBe(true));
});
