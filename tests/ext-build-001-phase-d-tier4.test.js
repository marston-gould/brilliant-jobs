/**
 * EXT-BUILD-001 Phase D — Tier 4: ATS Browse-Page Injection
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const EXT = join(ROOT, 'extension');
const overlay = readFileSync(join(EXT, 'job-site-overlay.ts'), 'utf-8');

const ATS_WITH_BROWSE = [
  'greenhouse', 'lever', 'ashby', 'workable', 'recruitee', 'smartrecruiters',
  'icims', 'taleo', 'avature', 'bamboohr', 'workday',
];

describe('Phase D — browseSelectors on all 11 ATS entries', () => {
  for (const p of ATS_WITH_BROWSE) {
    it(`${p} has browseSelectors with jobCard + cardTitle + cardLink`, () => {
      const idx = overlay.indexOf(`platform: '${p}'`);
      expect(idx).toBeGreaterThan(-1);
      const section = overlay.slice(idx, idx + 2000);
      expect(section).toContain('browseSelectors:');
      expect(section).toContain('jobCard:');
      expect(section).toContain('cardTitle:');
      expect(section).toContain('cardLink:');
    });
  }
});

describe('Phase D — URL patterns expanded for browse pages', () => {
  it('Greenhouse matches /jobs (browse)', () => {
    expect(overlay).toMatch(/greenhouse.*job\|jobs/);
  });

  it('Lever root listing (no .+ requirement)', () => {
    const lever = overlay.slice(overlay.indexOf("platform: 'lever'"), overlay.indexOf("platform: 'lever'") + 300);
    expect(lever).toContain("jobs\\.lever\\.co\\/");
  });

  it('Recruitee matches /careers and /jobs', () => {
    const recruitee = overlay.slice(overlay.indexOf("platform: 'recruitee'"), overlay.indexOf("platform: 'recruitee'") + 300);
    expect(recruitee).toContain('careers');
    expect(recruitee).toContain('jobs');
  });
});

describe('Phase D — 5 new ATS entries', () => {
  const NEW_ATS = ['icims', 'taleo', 'avature', 'bamboohr', 'workday'];

  for (const p of NEW_ATS) {
    it(`${p} has title + company + location + description + browseSelectors`, () => {
      const idx = overlay.indexOf(`platform: '${p}'`);
      const section = overlay.slice(idx, idx + 1500);
      expect(section).toContain('title:');
      expect(section).toContain('company:');
      expect(section).toContain('location:');
      expect(section).toContain('description:');
      expect(section).toContain('browseSelectors:');
    });
  }

  it('iCIMS uses iCIMS_PrimaryButton', () => {
    expect(overlay).toContain('iCIMS_PrimaryButton');
  });

  it('Taleo uses requisitionTitle', () => {
    expect(overlay).toContain('requisitionTitle');
  });

  it('Workday uses data-automation-id', () => {
    expect(overlay).toContain('data-automation-id="applyButton"');
  });

  it('BambooHR uses fab-Button--apply', () => {
    expect(overlay).toContain('fab-Button--apply');
  });
});

describe('Phase D — Browse-page injection logic', () => {
  it('has injectBrowsePageSaveButtons function', () => {
    expect(overlay).toContain('function injectBrowsePageSaveButtons');
  });

  it('detects browse pages by card count >= 2', () => {
    expect(overlay).toContain('cards.length >= 2');
  });

  it('creates bj-browse-save-btn buttons', () => {
    expect(overlay).toContain('bj-browse-save-btn');
  });

  it('sends SAVE_JOB message on click', () => {
    expect(overlay).toContain("sendMsg('SAVE_JOB'");
  });

  it('init() calls injectBrowsePageSaveButtons', () => {
    const initSection = overlay.slice(overlay.indexOf('function init()'));
    expect(initSection).toContain('injectBrowsePageSaveButtons');
  });

  it('_browseButtonsInjected resets on SPA navigation', () => {
    expect(overlay).toContain('_browseButtonsInjected = false');
  });
});

describe('Phase D — Compiled output', () => {
  const compiled = readFileSync(join(EXT, 'dist', 'dev', 'job-site-overlay.js'), 'utf-8');

  it('contains browse injection', () => {
    expect(compiled).toContain('bj-browse-save-btn');
  });

  it('contains all new ATS platforms', () => {
    for (const p of ['icims', 'taleo', 'avature', 'bamboohr', 'workday']) {
      expect(compiled).toContain(p);
    }
  });
});

describe('Phase D — Total platform count', () => {
  it('registry has 55+ platform entries', () => {
    const registrySection = overlay.slice(0, overlay.indexOf("platform: 'generic'"));
    const matches = registrySection.match(/platform:\s*'[a-z]+'/g) || [];
    const unique = new Set(matches.map(m => m.match(/'([^']+)'/)?.[1]));
    expect(unique.size).toBeGreaterThanOrEqual(55);
  });
});
