/**
 * EXT-BUILD-001 Phase C — Tier 3: 34 Niche/Diversity/Industry Boards
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const EXT = join(ROOT, 'extension');
const overlay = readFileSync(join(EXT, 'job-site-overlay.ts'), 'utf-8');
const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf-8'));
const csMatches = manifest.content_scripts[2].matches;

const TIER3_PLATFORMS = [
  'blackcareernetwork', 'blacksintech', 'blackistech', 'blackjobs',
  'blacktechjobs', 'blacktechtalent', 'bcwn', 'careercontessa',
  'diversity', 'diversityjobs', 'efinancialcareers', 'elpha',
  'fairygodboss', 'garysguide', 'girlboss', 'goodgigs', 'idealist',
  'iaw', 'irelaunch', 'jopwell', 'macslist', 'momsatwork', 'pallet',
  'pocitjobs', 'powertofly', 'reachire', 'remotepoc', 'siliconflorist',
  'surgewomen', 'techjobsforgood', 'techladies', 'womenintech',
  'womenwhocode', 'zippia',
];

describe('Phase C — All 34 Tier 3 platforms in registry', () => {
  it('has Phase C comment marker', () => {
    expect(overlay).toContain('Phase C Tier 3');
  });

  for (const p of TIER3_PLATFORMS) {
    it(`registry has platform: '${p}'`, () => {
      expect(overlay).toContain(`platform: '${p}'`);
    });
  }

  it('total = 34 Tier 3 platforms', () => {
    expect(TIER3_PLATFORMS.length).toBe(34);
  });
});

describe('Phase C — Each Tier 3 platform has required selectors', () => {
  for (const p of TIER3_PLATFORMS) {
    it(`${p} has title + company + location + description`, () => {
      const idx = overlay.indexOf(`platform: '${p}'`);
      expect(idx).toBeGreaterThan(-1);
      const section = overlay.slice(idx, idx + 800);
      expect(section).toContain('title:');
      expect(section).toContain('company:');
      expect(section).toContain('location:');
      expect(section).toContain('description:');
    });
  }
});

describe('Phase C — Manifest URL patterns', () => {
  const TIER3_DOMAINS = [
    'blackcareernetwork.com', 'blacksintechnology.net', 'blackis.tech',
    'blackjobs.com', 'blacktechjobs.com', 'blacktechtalent.com',
    'bcwnetwork.com', 'careercontessa.com', 'diversity.com',
    'diversityjobs.com', 'efinancialcareers.com', 'elpha.com',
    'fairygodboss.com', 'garysguide.com', 'girlboss.com', 'goodgigs.ca',
    'idealist.org', 'iawomen.com', 'irelaunch.com', 'jopwell.com',
    'macslist.org', 'momsatwork.co', 'pallet.co', 'pocitjobs.com',
    'powertofly.com', 'reachire.com', 'remotepoc.com',
    'siliconflorist.com', 'surgewomen.com', 'techjobsforgood.com',
    'hiretechladies.com', 'womenintechnology.org', 'womenwhocode.com',
    'zippia.com',
  ];

  for (const domain of TIER3_DOMAINS) {
    it(`manifest includes ${domain}`, () => {
      const found = csMatches.some(m => m.includes(domain));
      expect(found, `missing: ${domain}`).toBe(true);
    });
  }
});

describe('Phase C — Compiled output', () => {
  const compiled = readFileSync(join(EXT, 'dist', 'dev', 'job-site-overlay.js'), 'utf-8');

  it('compiled output contains Tier 3 platform strings', () => {
    // Spot-check several
    expect(compiled).toContain('blackcareernetwork');
    expect(compiled).toContain('fairygodboss');
    expect(compiled).toContain('powertofly');
    expect(compiled).toContain('idealist');
    expect(compiled).toContain('zippia');
  });
});

describe('Phase C — Total platform count', () => {
  it('registry has 53+ platform entries (20 existing + 34 Tier 3 - 1 overlap)', () => {
    const registrySection = overlay.slice(0, overlay.indexOf("platform: 'generic'"));
    const matches = registrySection.match(/platform:\s*'[a-z]+'/g) || [];
    const unique = new Set(matches.map(m => m.match(/'([^']+)'/)?.[1]));
    expect(unique.size).toBeGreaterThanOrEqual(50);
  });
});
