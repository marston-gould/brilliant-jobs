/**
 * EXT-BUILD-001 — B5 Resume Page Limit + Generic Heuristic Scraper
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const EXT = join(ROOT, 'extension');

// ═══════════════════════════════════════════════════════════
// Section 1: B5 — Extension popup page_limit UI
// ═══════════════════════════════════════════════════════════
describe('B5 — Extension popup page_limit', () => {
  const popupHtml = readFileSync(join(EXT, 'popup.html'), 'utf-8');
  const popupConsumer = readFileSync(join(EXT, 'popup-consumer.ts'), 'utf-8');

  it('popup.html has page_limit select (not checkbox)', () => {
    expect(popupHtml).toContain('cv-settings-page-limit');
    expect(popupHtml).toContain('<select');
    expect(popupHtml).toContain('1 page (default)');
    expect(popupHtml).toContain('2 pages');
  });

  it('popup.html does NOT have keep-one-page checkbox', () => {
    expect(popupHtml).not.toContain('cv-settings-keep-one-page');
    expect(popupHtml).not.toContain('Keep resume to one page');
  });

  it('popup-consumer.ts reads page_limit from storage', () => {
    expect(popupConsumer).toContain('page_limit');
    expect(popupConsumer).toContain('cv-settings-page-limit');
  });

  it('popup-consumer.ts migrates from keepOnePage boolean', () => {
    expect(popupConsumer).toContain('prefs.keepOnePage === false ? 2 : 1');
  });

  it('popup-consumer.ts saves both page_limit and keepOnePage', () => {
    expect(popupConsumer).toContain('keepOnePage: page_limit === 1');
    expect(popupConsumer).toContain('page_limit');
  });

  it('settings listeners include page-limit select', () => {
    expect(popupConsumer).toContain('cv-settings-page-limit');
    expect(popupConsumer).not.toContain("'cv-settings-keep-one-page'");
  });
});

// ═══════════════════════════════════════════════════════════
// Section 2: B5 — Dashboard rewrite.js page_limit
// ═══════════════════════════════════════════════════════════
describe('B5 — Dashboard rewrite.js page_limit', () => {
  const rewrite = readFileSync(join(ROOT, 'js', 'rewrite.js'), 'utf-8');

  it('rewrite.js has _rwGetPageLimit helper', () => {
    expect(rewrite).toContain('function _rwGetPageLimit');
  });

  it('_rwGetPageLimit reads from localStorage bj_apply_settings', () => {
    expect(rewrite).toContain('bj_apply_settings');
    expect(rewrite).toContain('page_limit');
  });

  it('_rwGetPageLimit defaults to 1', () => {
    expect(rewrite).toContain('return 1');
  });

  it('analyze request includes page_limit', () => {
    expect(rewrite).toContain('page_limit: _rwGetPageLimit()');
  });

  it('execute request includes page_limit', () => {
    // Both analyze and execute should pass page_limit
    const matches = rewrite.match(/page_limit: _rwGetPageLimit\(\)/g) || [];
    expect(matches.length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════
// Section 3: B5 — Extension background.ts page_limit
// ═══════════════════════════════════════════════════════════
describe('B5 — Extension background.ts page_limit', () => {
  const bg = readFileSync(join(EXT, 'background.ts'), 'utf-8');

  it('background.ts passes page_limit to rewrite EF', () => {
    expect(bg).toContain('page_limit:');
  });

  it('background.ts reads page_limit from preferences', () => {
    expect(bg).toContain('preferences?.page_limit');
  });

  it('background.ts falls back to keepOnePage for backward compat', () => {
    expect(bg).toContain('keepOnePage === false ? 2 : 1');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 4: B5 — rewrite-resume-extension EF
// ═══════════════════════════════════════════════════════════
describe('B5 — rewrite-resume-extension EF', () => {
  const ef = readFileSync(join(ROOT, 'supabase', 'functions', 'rewrite-resume-extension', 'index.ts'), 'utf-8');

  it('EF extracts page_limit from request body', () => {
    expect(ef).toContain('page_limit');
    expect(ef).toContain('effectivePageLimit');
  });

  it('EF defaults page_limit to 1', () => {
    expect(ef).toContain("(page_limit === 2) ? 2 : 1");
  });

  it('REWRITE_SYSTEM prompt includes page constraint rule', () => {
    expect(ef).toContain('PAGE CONSTRAINT');
    expect(ef).toContain('MUST fit within the specified page limit');
  });

  it('user prompt includes page_constraint block', () => {
    expect(ef).toContain('<page_constraint>');
    expect(ef).toContain('effectivePageLimit');
  });

  it('REWRITE_SYSTEM mentions 1 page ~500 words limit', () => {
    expect(ef).toContain('~500 words');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 5: Generic heuristic scraper fallback
// ═══════════════════════════════════════════════════════════
describe('Generic heuristic scraper fallback', () => {
  const overlay = readFileSync(join(EXT, 'job-site-overlay.ts'), 'utf-8');

  it('does NOT early-return when site is unrecognized', () => {
    expect(overlay).not.toContain("if (!currentSite) return; // Not a recognized job page");
  });

  it('creates generic fallback entry for unknown sites', () => {
    expect(overlay).toContain("platform: 'generic'");
    expect(overlay).toContain('EXT-BUILD-001: Generic heuristic fallback');
  });

  it('generic entry has heuristic apply button selectors', () => {
    expect(overlay).toContain('a[href*="apply"]');
    expect(overlay).toContain('button[class*="apply"]');
    expect(overlay).toContain('[data-testid*="apply"]');
  });

  it('generic entry has heuristic title selectors including OG meta', () => {
    expect(overlay).toContain('[property="og:title"]');
    expect(overlay).toContain('h1');
    expect(overlay).toContain('[class*="jobTitle"]');
  });

  it('generic entry has heuristic company selectors including OG + schema', () => {
    expect(overlay).toContain('[property="og:site_name"]');
    expect(overlay).toContain('[itemprop="hiringOrganization"]');
  });

  it('generic entry has heuristic location selectors', () => {
    expect(overlay).toContain('[itemprop="jobLocation"]');
    expect(overlay).toContain('[class*="location"]');
  });

  it('parseJobMeta reads content attribute from meta tags', () => {
    expect(overlay).toContain("getAttribute('content')");
  });

  it('parseJobMeta tries JSON-LD structured data for generic sites', () => {
    expect(overlay).toContain('application/ld+json');
    expect(overlay).toContain('JobPosting');
    expect(overlay).toContain('hiringOrganization');
  });

  it('JSON-LD fallback extracts title, company, and location', () => {
    expect(overlay).toContain('ld.title');
    expect(overlay).toContain('ld.hiringOrganization?.name');
    expect(overlay).toContain('ld.jobLocation?.address');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 6: File inventory
// ═══════════════════════════════════════════════════════════
describe('B5 + Generic scraper — File inventory', () => {
  it('extension/popup.html modified', () => {
    const ph = readFileSync(join(EXT, 'popup.html'), 'utf-8');
    expect(ph).toContain('cv-settings-page-limit');
  });

  it('extension/popup-consumer.ts modified', () => {
    const pc = readFileSync(join(EXT, 'popup-consumer.ts'), 'utf-8');
    expect(pc).toContain('page_limit');
  });

  it('js/rewrite.js modified', () => {
    const rw = readFileSync(join(ROOT, 'js', 'rewrite.js'), 'utf-8');
    expect(rw).toContain('_rwGetPageLimit');
  });

  it('extension/background.ts modified', () => {
    const bg = readFileSync(join(EXT, 'background.ts'), 'utf-8');
    expect(bg).toContain('page_limit:');
  });

  it('supabase/functions/rewrite-resume-extension/index.ts modified', () => {
    const ef = readFileSync(join(ROOT, 'supabase', 'functions', 'rewrite-resume-extension', 'index.ts'), 'utf-8');
    expect(ef).toContain('effectivePageLimit');
  });

  it('extension/job-site-overlay.ts modified', () => {
    const ov = readFileSync(join(EXT, 'job-site-overlay.ts'), 'utf-8');
    expect(ov).toContain("platform: 'generic'");
  });
});
