/**
 * CS-P1-004: Backend Architecture + API Hardening Tests
 * Tests BJ namespace registry, API versioning, script defer/cache-busting
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

// ── BJ Namespace Registry ──
describe('BJ namespace registry (FE-005)', () => {
  const globalsContent = readFileSync(resolve(ROOT, 'js/globals.js'), 'utf8');

  it('globals.js initializes window.BJ namespace', () => {
    expect(globalsContent).toContain('window.BJ = window.BJ || {}');
  });

  it('globals.js defines BJ.export function', () => {
    expect(globalsContent).toContain('window.BJ.export = function(name, fn, module)');
  });

  it('globals.js creates _registry for tracking', () => {
    expect(globalsContent).toContain('window.BJ._registry = {}');
  });

  // Verify key files register with BJ namespace
  const registeredFiles = [
    'js/resumes.js',
    'js/referrals.js',
    'js/keywords.js',
    'js/app.js',
    'js/tuning.js',
    'js/pipeline.js',
    'js/applications.js',
    'js/job-feed.js',
    'js/settings.js',
    'js/billing.js',
    'js/integrations.js',
    'js/micro-surveys.js',
    'js/resume-archive.js',
    'js/tier-gating.js',
  ];

  registeredFiles.forEach(file => {
    it(`${file} registers exports with BJ namespace`, () => {
      const content = readFileSync(resolve(ROOT, file), 'utf8');
      expect(content).toContain('CS-P1-004 FE-005');
      expect(content).toContain('window.BJ._registry');
    });
  });

  // Verify admin files register
  const adminFiles = [
    'js/admin-alerts.js',
    'js/admin-biz-ops.js',
    'js/admin-cron.js',
    'js/admin-monitoring.js',
    'js/admin-seo.js',
  ];

  adminFiles.forEach(file => {
    it(`${file} registers exports with BJ namespace`, () => {
      const content = readFileSync(resolve(ROOT, file), 'utf8');
      expect(content).toContain('CS-P1-004 FE-005');
    });
  });
});

// ── API Versioning (BE-007) ──
describe('API versioning (BE-007)', () => {
  it('api-version.ts exists with version constant', () => {
    const content = readFileSync(resolve(ROOT, 'supabase/functions/_shared/api-version.ts'), 'utf8');
    expect(content).toContain("export const API_VERSION = '2026-03-07'");
    expect(content).toContain('export function withVersionHeaders');
    expect(content).toContain('export function versionedJsonResponse');
  });

  it('middleware.ts imports and applies API version', () => {
    const content = readFileSync(resolve(ROOT, 'supabase/functions/_shared/middleware.ts'), 'utf8');
    expect(content).toContain("import { API_VERSION");
    expect(content).toContain("headers.set('x-api-version', API_VERSION)");
  });

  // Critical user-facing EFs must have version header
  const versionedEFs = [
    'preview-jobs',
    'chat-job-search',
    'enrich-job',
    'health-check',
    'create-checkout',
    'manage-subscription',
    'validate-signup',
  ];

  versionedEFs.forEach(ef => {
    it(`${ef} includes x-api-version header`, () => {
      const content = readFileSync(resolve(ROOT, `supabase/functions/${ef}/index.ts`), 'utf8');
      expect(content).toContain('api-version');
      expect(content).toContain('API_VERSION');
    });
  });
});

// ── Landing Page Script Attributes (FE-007 + FE-008) ──
describe('landing page script loading (FE-007 + FE-008)', () => {
  const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

  it('version.js has defer and cache-busting', () => {
    expect(html).toMatch(/<script src="\/js\/version\.js\?v=[^"]*" defer>/);
  });

  it('cookie-consent.js has defer and cache-busting', () => {
    expect(html).toMatch(/<script src="\/js\/cookie-consent\.js\?v=[^"]*" defer>/);
  });

  it('landing-segment.js has cache-busting but NO defer (FOUC prevention)', () => {
    expect(html).toMatch(/<script src="\/js\/landing-segment\.js\?v=[^"]*">/);
    const match = html.match(/<script src="\/js\/landing-segment\.js[^"]*"[^>]*>/);
    expect(match[0]).not.toContain('defer');
  });

  it('purify.min.js has defer and cache-busting', () => {
    expect(html).toMatch(/<script src="\/js\/vendor\/purify\.min\.js\?v=[^"]*" defer>/);
  });

  it('safe-read-ls.js has defer and cache-busting', () => {
    expect(html).toMatch(/<script src="\/js\/safe-read-ls\.js\?v=[^"]*" defer>/);
  });

  it('merch-client.js has cache-busting', () => {
    expect(html).toMatch(/<script src="\/js\/merch-client\.js\?v=[^"]*" defer>/);
  });

  it('fingerprint.js has cache-busting', () => {
    expect(html).toMatch(/<script src="\/js\/fingerprint\.js\?v=[^"]*" defer>/);
  });

  it('referral-capture.js has cache-busting', () => {
    expect(html).toMatch(/<script src="\/js\/referral-capture\.js\?v=[^"]*" defer>/);
  });

  it('landing-app.js has cache-busting', () => {
    expect(html).toMatch(/<script src="\/js\/landing-app\.js\?v=[^"]*" defer>/);
  });

  it('only landing-segment.js is synchronous (all others deferred)', () => {
    // Get all local script tags (not CDN, not JSON-LD, not analytics)
    const localScripts = html.match(/<script src="\/js\/[^"]*"[^>]*>/g) || [];
    const syncScripts = localScripts.filter(s => !s.includes('defer') && !s.includes('async'));
    // Only landing-segment.js should be synchronous
    expect(syncScripts.length).toBe(1);
    expect(syncScripts[0]).toContain('landing-segment.js');
  });
});

// ── IX-BE-003: Supabase Singleton (verified already done) ──
describe('Supabase singleton (IX-BE-003)', () => {
  const landingApp = readFileSync(resolve(ROOT, 'js/landing-app.js'), 'utf8');

  it('landing-app.js uses singleton loadSupabase()', () => {
    expect(landingApp).toContain('function loadSupabase()');
    expect(landingApp).toContain('if (sb) return Promise.resolve(sb)');
  });

  it('only one createClient call exists', () => {
    const matches = landingApp.match(/createClient/g) || [];
    expect(matches.length).toBe(1);
  });
});

// ── IX-FE-005: Search Debounce (verified already done) ──
describe('search debounce (IX-FE-005)', () => {
  const jobFeed = readFileSync(resolve(ROOT, 'js/job-feed.js'), 'utf8');

  it('job-feed.js has 300ms debounce on search', () => {
    expect(jobFeed).toContain('debouncedSearchJobs');
    expect(jobFeed).toContain('setTimeout');
    expect(jobFeed).toContain('300');
  });

  it('landing preview search uses click handler (not keystroke)', () => {
    const landingApp = readFileSync(resolve(ROOT, 'js/landing-app.js'), 'utf8');
    expect(landingApp).toContain("previewGoBtn.addEventListener('click'");
    // Button disables during request (natural debounce)
    expect(landingApp).toContain('previewGoBtn.disabled = true');
  });
});
