/**
 * CS-P1-003: Dashboard Error Handling Completion
 * Fix Items: FE-005 (defer scripts), FE-006 (content hashing), BE-003 (unchecked errors), BE-004 (fire-and-forget RPCs)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dirname, '..');
const read = (f) => readFileSync(join(root, f), 'utf-8');

// ── FE-005: All dashboard <head> scripts must have defer ──
describe('FE-005: Synchronous script elimination', () => {
  const dashHtml = read('dashboard.html');
  const headSection = dashHtml.split('</head>')[0];
  // Extract all <script> tags in <head>
  const scriptTags = [...headSection.matchAll(/<script\b[^>]*>/gi)].map(m => m[0]);

  it('should have at least 8 script tags in head', () => {
    expect(scriptTags.length).toBeGreaterThanOrEqual(8);
  });

  it('all head scripts should have defer or async', () => {
    const syncScripts = scriptTags.filter(tag =>
      !tag.includes('defer') && !tag.includes('async') && tag.includes('src=')
    );
    expect(syncScripts).toEqual([]);
  });

  it('supabase.min.js should have defer', () => {
    const supaTag = scriptTags.find(t => t.includes('supabase.min.js'));
    expect(supaTag).toBeDefined();
    expect(supaTag).toContain('defer');
  });

  it('DOMPurify CDN should have defer', () => {
    const dpTag = scriptTags.find(t => t.includes('purify.min.js'));
    expect(dpTag).toBeDefined();
    expect(dpTag).toContain('defer');
  });

  it('posthog-dashboard.js should have defer', () => {
    const phTag = scriptTags.find(t => t.includes('posthog-dashboard.js'));
    expect(phTag).toBeDefined();
    expect(phTag).toContain('defer');
  });

  it('pipeline-migration.js should have defer', () => {
    const pmTag = scriptTags.find(t => t.includes('pipeline-migration.js'));
    expect(pmTag).toBeDefined();
    expect(pmTag).toContain('defer');
  });

  it('notification-center.js should have defer', () => {
    const ncTag = scriptTags.find(t => t.includes('notification-center.js'));
    expect(ncTag).toBeDefined();
    expect(ncTag).toContain('defer');
  });
});

// ── FE-006: Content hashing and cache headers ──
describe('FE-006: Content hashing and immutable cache', () => {
  it('build.js should import createHash', () => {
    const buildJs = read('build.js');
    expect(buildJs).toContain("import { createHash } from 'crypto'");
  });

  it('build.js should write dist/manifest.json', () => {
    const buildJs = read('build.js');
    expect(buildJs).toContain('dist/manifest.json');
    expect(buildJs).toContain('_buildHash');
  });

  it('dist/manifest.json should exist after build', () => {
    expect(existsSync(join(root, 'dist/manifest.json'))).toBe(true);
  });

  it('manifest should contain hashes for all chunks', () => {
    const manifest = JSON.parse(read('dist/manifest.json'));
    expect(manifest.shell).toBeDefined();
    expect(manifest.shell.hash).toMatch(/^[a-f0-9]{8}$/);
    expect(manifest.feed).toBeDefined();
    expect(manifest.feed.hash).toMatch(/^[a-f0-9]{8}$/);
    expect(manifest.deferred).toBeDefined();
    expect(manifest._buildHash).toMatch(/^[a-f0-9]{8}$/);
  });

  it('vercel.json /dist/ should have immutable cache', () => {
    const vercel = JSON.parse(read('vercel.json'));
    const distHeader = vercel.headers.find(h => h.source === '/dist/(.*)');
    expect(distHeader).toBeDefined();
    const cc = distHeader.headers.find(h => h.key === 'Cache-Control');
    expect(cc.value).toContain('immutable');
    expect(cc.value).toContain('max-age=31536000');
  });

  it('vercel.json /js/ should have immutable cache', () => {
    const vercel = JSON.parse(read('vercel.json'));
    const jsHeader = vercel.headers.find(h => h.source === '/js/(.*)');
    expect(jsHeader).toBeDefined();
    const cc = jsHeader.headers.find(h => h.key === 'Cache-Control');
    expect(cc.value).toContain('immutable');
  });

  it('vercel.json /styles.css should have immutable cache', () => {
    const vercel = JSON.parse(read('vercel.json'));
    const cssHeader = vercel.headers.find(h => h.source === '/styles.css');
    expect(cssHeader).toBeDefined();
    const cc = cssHeader.headers.find(h => h.key === 'Cache-Control');
    expect(cc.value).toContain('immutable');
  });
});

// ── BE-003: No unchecked {data} without error ──
describe('BE-003: Supabase error checking', () => {
  const dashboardFiles = [
    'js/applications.js',
    'js/rewrite.js',
    'js/job-feed.js',
    'js/pipeline.js',
    'js/notification-center.js',
    'js/settings.js',
    'js/keywords.js',
    'js/referrals.js',
    'js/referral-outreach.js',
    'js/stats.js',
    'js/billing.js',
    'js/app.js',
  ];

  it('no dashboard JS should have { data } without error in from() calls', () => {
    const violations = [];
    for (const file of dashboardFiles) {
      const content = read(file);
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Pattern: destructure with only data, no error, from sb.from() (not sb.auth)
        if (/\{\s*data\s*[},:]/.test(line) &&
            line.includes('await sb.from') &&
            !line.includes('error') &&
            !line.includes('// legacy') &&
            !line.includes('safeQuery')) {
          violations.push(`${file}:${i + 1}: ${line.trim().slice(0, 80)}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('applications.js should check error on notification overrides', () => {
    const content = read('js/applications.js');
    expect(content).toContain("reportError('applications:overrides'");
  });

  it('rewrite.js should check error on credit balance', () => {
    const content = read('js/rewrite.js');
    expect(content).toContain("reportError('rewrite:credit-balance'");
  });

  it('notification-center.js should check error on pref upsert', () => {
    const content = read('js/notification-center.js');
    expect(content).toContain("reportError('nc:save-prefs'");
  });

  it('pipeline.js should use reportError not console.error', () => {
    const content = read('js/pipeline.js');
    // Should not have console.error for pipeline operations
    expect(content).not.toMatch(/console\.error\('\[BJ\] Pipeline delete/);
    expect(content).not.toMatch(/console\.error\('\[BJ\] Tracking mode/);
    expect(content).toContain("reportError('pipeline:delete'");
    expect(content).toContain("reportError('pipeline:tracking-mode'");
  });

  it('billing.js debit should use reportError', () => {
    const content = read('js/billing.js');
    expect(content).toContain("reportError('billing:debit-credits'");
  });
});

// ── BE-004: No empty catches on fire-and-forget RPCs ──
describe('BE-004: Fire-and-forget RPC error handling', () => {
  it('app.js heartbeat should have error handler', () => {
    const content = read('js/app.js');
    // Heartbeat calls should have .then(r => ...) error check
    expect(content).toContain("reportError('app:heartbeat'");
    expect(content).toContain("reportError('app:heartbeat-resume'");
  });

  it('keywords.js signal RPCs should not have empty catches', () => {
    const content = read('js/keywords.js');
    // Should not have .catch(() => {}) pattern for signal RPCs
    const emptyCatches = content.match(/log_feed_signal.*\.catch\(\(\)\s*=>\s*\{\}\)/g);
    expect(emptyCatches).toBeNull();
  });

  it('keywords.js signal RPCs should report errors', () => {
    const content = read('js/keywords.js');
    expect(content).toContain("reportError('keywords:signal-click'");
    expect(content).toContain("reportError('keywords:signal-apply'");
    expect(content).toContain("reportError('keywords:signal-hide'");
    expect(content).toContain("reportError('keywords:signal-save'");
  });

  it('referrals.js parallel RPCs should report errors', () => {
    const content = read('js/referrals.js');
    expect(content).toContain("reportError('referrals:outreach-rpc'");
    expect(content).toContain("reportError('referrals:correlation-rpc'");
  });

  it('referral-outreach.js should check RPC error', () => {
    const content = read('js/referral-outreach.js');
    expect(content).toContain("reportError('referral-outreach:upsert'");
  });
});

// ── Regression: Existing patterns should be preserved ──
describe('Regression: Core patterns still intact', () => {
  it('dashboard.html still has all required script tags', () => {
    const html = read('dashboard.html');
    expect(html).toContain('supabase.min.js');
    expect(html).toContain('dashboard-shell.min.js');
    expect(html).toContain('dashboard-feed.min.js');
    expect(html).toContain('posthog-dashboard.js');
    expect(html).toContain('purify.min.js');
  });

  it('version.js still has BJ_VERSION', () => {
    const version = read('js/version.js');
    expect(version).toContain('BJ_VERSION');
  });

  it('build.js still produces code-split chunks', () => {
    expect(existsSync(join(root, 'dist/dashboard-shell.min.js'))).toBe(true);
    expect(existsSync(join(root, 'dist/dashboard-feed.min.js'))).toBe(true);
    expect(existsSync(join(root, 'dist/dashboard-deferred.min.js'))).toBe(true);
  });

  it('initial payload still under 200KB', () => {
    const shell = readFileSync(join(root, 'dist/dashboard-shell.min.js')).length;
    const feed = readFileSync(join(root, 'dist/dashboard-feed.min.js')).length;
    expect(shell + feed).toBeLessThan(200 * 1024);
  });
});
