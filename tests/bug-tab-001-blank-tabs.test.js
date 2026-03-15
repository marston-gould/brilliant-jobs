/**
 * BUG-TAB-001 — Blank Referrals, Settings, Subscription tabs
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (f) => readFileSync(f, 'utf8');
const lazyLoaderJs = read('js/lazy-loader.js');
const lazyLoaderTs = read('js/lazy-loader.ts');
const appJs = read('js/app.js');
const shellChunk = read('dist/dashboard-shell.min.js');

describe('Bug 1: TAB_CHUNKS subscription mapping', () => {
  it('lazy-loader.js maps subscription to deferred chunk', () => {
    expect(lazyLoaderJs).toContain('"subscription": ["keywords", "deferred"]');
  });

  it('lazy-loader.ts maps subscription to deferred chunk', () => {
    expect(lazyLoaderTs).toContain("'subscription': ['keywords', 'deferred']");
  });

  it('built shell chunk contains subscription mapping', () => {
    expect(shellChunk).toContain('subscription:["keywords","deferred"]');
  });
});

describe('Bug 2: _initTab handlers for subscription and settings', () => {
  it('_initTab calls initBilling for subscription tab', () => {
    expect(appJs).toContain("_tab === 'subscription' && typeof initBilling === 'function'");
  });

  it('_initTab calls loadApplicantProfile for settings tab', () => {
    expect(appJs).toContain("_tab === 'settings' && typeof loadApplicantProfile === 'function'");
  });

  it('_restoreInit calls initBilling for subscription tab on restore', () => {
    expect(appJs).toContain("lastTab === 'subscription' && typeof initBilling === 'function'");
  });

  it('_restoreInit calls loadApplicantProfile for settings tab on restore', () => {
    expect(appJs).toContain("lastTab === 'settings' && typeof loadApplicantProfile === 'function'");
  });
});

describe('Existing tab handlers still intact', () => {
  it('referrals init still present', () => {
    expect(appJs).toContain("_tab === 'referrals' && typeof initReferralHub === 'function'");
  });

  it('stats init still present', () => {
    expect(appJs).toContain("_tab === 'stats' && typeof initStatsPage === 'function'");
  });

  it('resume-builder init still present', () => {
    expect(appJs).toContain("_tab === 'resume-builder'");
  });
});

describe('Version v9.42', () => {
  it('version.js has v9.42', () => {
    expect(read('js/version.js')).toContain('v9.42');
  });
});
