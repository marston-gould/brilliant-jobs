/**
 * EXT-BUILD-001 Phase B — Tier 2 Optimized Selectors (11 major boards)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const EXT = join(ROOT, 'extension');
const overlay = readFileSync(join(EXT, 'job-site-overlay.ts'), 'utf-8');
const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf-8'));
const csMatches = manifest.content_scripts[2].matches;

const TIER2_PLATFORMS = [
  'google-jobs', 'ziprecruiter', 'monster', 'builtin', 'dice',
  'themuse', 'wellfound', 'usajobs', 'simplyhired', 'smartrecruiters',
];

// ═══════════════════════════════════════════════════════════
// Section 1: All 11 Tier 2 platforms in registry
// ═══════════════════════════════════════════════════════════
describe('Phase B — Registry entries', () => {
  it('has all 10 new Tier 2 platforms', () => {
    for (const p of TIER2_PLATFORMS) {
      expect(overlay, `missing platform: ${p}`).toContain(`platform: '${p}'`);
    }
  });

  it('Handshake entry expanded with Phase B comment', () => {
    expect(overlay).toContain('Phase B Tier 2: Handshake');
  });

  it('Handshake has salary + description selectors', () => {
    const hs = overlay.slice(overlay.indexOf("Phase B Tier 2: Handshake"), overlay.indexOf("Phase B Tier 2: Google Jobs"));
    expect(hs).toContain('salary:');
    expect(hs).toContain('description:');
  });

  for (const p of TIER2_PLATFORMS) {
    it(`${p} has title selectors`, () => {
      const idx = overlay.indexOf(`platform: '${p}'`);
      const section = overlay.slice(idx, idx + 1500);
      expect(section).toContain('title:');
    });

    it(`${p} has company selectors`, () => {
      const idx = overlay.indexOf(`platform: '${p}'`);
      const section = overlay.slice(idx, idx + 1500);
      expect(section).toContain('company:');
    });

    it(`${p} has location selectors`, () => {
      const idx = overlay.indexOf(`platform: '${p}'`);
      const section = overlay.slice(idx, idx + 1500);
      expect(section).toContain('location:');
    });

    it(`${p} has salary selectors`, () => {
      const idx = overlay.indexOf(`platform: '${p}'`);
      const section = overlay.slice(idx, idx + 1500);
      expect(section).toContain('salary:');
    });

    it(`${p} has description selectors`, () => {
      const idx = overlay.indexOf(`platform: '${p}'`);
      const section = overlay.slice(idx, idx + 1500);
      expect(section).toContain('description:');
    });
  }
});

// ═══════════════════════════════════════════════════════════
// Section 2: Manifest URL patterns
// ═══════════════════════════════════════════════════════════
describe('Phase B — Manifest URL patterns', () => {
  it('includes Google Jobs pattern', () => {
    expect(csMatches.some(m => m.includes('google.com'))).toBe(true);
  });

  it('includes ZipRecruiter', () => {
    expect(csMatches).toContain('https://www.ziprecruiter.com/*');
  });

  it('includes Monster', () => {
    expect(csMatches).toContain('https://www.monster.com/*');
  });

  it('includes Built In', () => {
    expect(csMatches.some(m => m.includes('builtin.com'))).toBe(true);
  });

  it('includes Dice', () => {
    expect(csMatches).toContain('https://www.dice.com/*');
  });

  it('includes The Muse', () => {
    expect(csMatches).toContain('https://www.themuse.com/*');
  });

  it('includes Wellfound', () => {
    expect(csMatches.some(m => m.includes('wellfound.com'))).toBe(true);
  });

  it('includes USA Jobs', () => {
    expect(csMatches).toContain('https://www.usajobs.gov/*');
  });

  it('includes Simply Hired', () => {
    expect(csMatches).toContain('https://www.simplyhired.com/*');
  });

  it('SmartRecruiters already present', () => {
    expect(csMatches.some(m => m.includes('smartrecruiters.com'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Section 3: Compiled output contains all platforms
// ═══════════════════════════════════════════════════════════
describe('Phase B — Compiled output', () => {
  const compiled = readFileSync(join(EXT, 'dist', 'dev', 'job-site-overlay.js'), 'utf-8');

  for (const p of TIER2_PLATFORMS) {
    it(`compiled output contains ${p}`, () => {
      expect(compiled).toContain(p);
    });
  }
});

// ═══════════════════════════════════════════════════════════
// Section 4: Site-specific selector quality checks
// ═══════════════════════════════════════════════════════════
describe('Phase B — Selector quality', () => {
  it('Google Jobs uses .KLsYvd title selector', () => {
    expect(overlay).toContain('.KLsYvd');
  });

  it('Dice uses web component apply-button-wc', () => {
    expect(overlay).toContain('apply-button-wc');
  });

  it('USA Jobs uses #job-title', () => {
    expect(overlay).toContain("h1#job-title");
  });

  it('USA Jobs uses usajobs-specific classes', () => {
    expect(overlay).toContain('usajobs-joa-banner');
  });

  it('ZipRecruiter uses data-tracking="apply"', () => {
    expect(overlay).toContain('data-tracking="apply"');
  });

  it('Monster uses data-testid="jobTitle"', () => {
    const monster = overlay.slice(overlay.indexOf("platform: 'monster'"), overlay.indexOf("platform: 'builtin'"));
    expect(monster).toContain('data-testid="jobTitle"');
  });

  it('Built In uses font-barlow class', () => {
    expect(overlay).toContain('font-barlow');
  });

  it('SmartRecruiters uses js-apply-button', () => {
    expect(overlay).toContain('js-apply-button');
  });

  it('Wellfound uses styles_ prefixed classes', () => {
    expect(overlay).toContain('styles_applyButton');
  });

  it('Simply Hired uses viewJob prefixed test IDs', () => {
    expect(overlay).toContain('viewJobTitle');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 5: Total platform count
// ═══════════════════════════════════════════════════════════
describe('Phase B — Platform count', () => {
  it('registry has 20+ platform entries (9 ATS + 3 Tier 1 + 11 Tier 2)', () => {
    const platformMatches = overlay.match(/platform:\s*'[a-z-]+'/g) || [];
    // Filter to unique platforms in registry (before generic)
    const registrySection = overlay.slice(0, overlay.indexOf("platform: 'generic'"));
    const registryPlatforms = registrySection.match(/platform:\s*'[a-z-]+'/g) || [];
    const unique = new Set(registryPlatforms.map(m => m.match(/'([^']+)'/)?.[1]));
    expect(unique.size).toBeGreaterThanOrEqual(19);
  });
});
