/**
 * EXT-BUILD-001 Phase A — Tier 1 Optimized Selectors (LinkedIn + Indeed + Glassdoor)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const EXT = join(ROOT, 'extension');
const overlay = readFileSync(join(EXT, 'job-site-overlay.ts'), 'utf-8');
const manifest = readFileSync(join(EXT, 'manifest.json'), 'utf-8');

// ═══════════════════════════════════════════════════════════
// Section 1: LinkedIn optimized selectors
// ═══════════════════════════════════════════════════════════
describe('Phase A — LinkedIn optimized selectors', () => {
  it('has Phase A comment marker', () => {
    expect(overlay).toContain('Phase A Tier 1: LinkedIn');
  });

  it('expanded URL pattern includes company jobs pages', () => {
    expect(overlay).toContain('company\\/[^/]+\\/jobs');
  });

  it('has 8+ apply button selectors', () => {
    expect(overlay).toContain("button.jobs-apply-button");
    expect(overlay).toContain('aria-label*="Easy Apply"');
    expect(overlay).toContain("jobs-apply-button--top-card");
  });

  it('has salary selectors', () => {
    const section = overlay.slice(overlay.indexOf("Phase A Tier 1: LinkedIn"), overlay.indexOf("Phase A Tier 1: Indeed"));
    expect(section).toContain('salary:');
    expect(section).toContain('salary-info');
    expect(section).toContain('compensation');
  });

  it('has description selectors', () => {
    const section = overlay.slice(overlay.indexOf("Phase A Tier 1: LinkedIn"), overlay.indexOf("Phase A Tier 1: Indeed"));
    expect(section).toContain('description:');
    expect(section).toContain('jobs-description');
    expect(section).toContain('job-details');
  });

  it('has workType selectors (remote/hybrid)', () => {
    const section = overlay.slice(overlay.indexOf("Phase A Tier 1: LinkedIn"), overlay.indexOf("Phase A Tier 1: Indeed"));
    expect(section).toContain('workType:');
    expect(section).toContain('workplace-type');
  });

  it('has comprehensive title selectors for different LinkedIn layouts', () => {
    expect(overlay).toContain("job-details-jobs-unified-top-card__job-title");
    expect(overlay).toContain("h1.t-24");
    expect(overlay).toContain("top-card-layout__title");
    expect(overlay).toContain("topcard__title");
  });

  it('has comprehensive company selectors', () => {
    expect(overlay).toContain("job-details-jobs-unified-top-card__company-name a");
    expect(overlay).toContain("topcard__org-name-link");
    expect(overlay).toContain("topcard__flavor--black-link");
  });
});

// ═══════════════════════════════════════════════════════════
// Section 2: Indeed optimized selectors
// ═══════════════════════════════════════════════════════════
describe('Phase A — Indeed optimized selectors', () => {
  it('has Phase A comment marker', () => {
    expect(overlay).toContain('Phase A Tier 1: Indeed');
  });

  it('expanded URL pattern includes /job/ and /cmp/', () => {
    expect(overlay).toContain('cmp\\/[^/]+\\/jobs');
    expect(overlay).toContain('job\\/');
  });

  it('has salary selectors', () => {
    const section = overlay.slice(overlay.indexOf("Phase A Tier 1: Indeed"), overlay.indexOf("Phase A Tier 1: Glassdoor"));
    expect(section).toContain('salary:');
    expect(section).toContain('salaryInfoAndJobType');
    expect(section).toContain('salary-snippet');
  });

  it('has description selectors', () => {
    const section = overlay.slice(overlay.indexOf("Phase A Tier 1: Indeed"), overlay.indexOf("Phase A Tier 1: Glassdoor"));
    expect(section).toContain('description:');
    expect(section).toContain('jobDescriptionText');
  });

  it('has jobType selectors', () => {
    const section = overlay.slice(overlay.indexOf("Phase A Tier 1: Indeed"), overlay.indexOf("Phase A Tier 1: Glassdoor"));
    expect(section).toContain('jobType:');
  });

  it('has comprehensive title selectors', () => {
    expect(overlay).toContain('jobsearch-JobInfoHeader-title');
    expect(overlay).toContain('h2.jobTitle');
    expect(overlay).toContain('[data-testid="jobTitle"]');
  });

  it('has comprehensive company selectors', () => {
    expect(overlay).toContain('inlineHeader-companyName');
    expect(overlay).toContain('jobsearch-InlineCompanyRating');
    expect(overlay).toContain('[data-company-name="true"]');
    expect(overlay).toContain('[data-testid="company-name"]');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 3: Glassdoor optimized selectors
// ═══════════════════════════════════════════════════════════
describe('Phase A — Glassdoor optimized selectors', () => {
  it('has Phase A comment marker', () => {
    expect(overlay).toContain('Phase A Tier 1: Glassdoor');
  });

  it('expanded URL pattern includes /Job/ and /partner/', () => {
    expect(overlay).toContain('Job|partner');
  });

  it('has salary selectors', () => {
    const section = overlay.slice(overlay.indexOf("Phase A Tier 1: Glassdoor"), overlay.indexOf("platform: 'ashby'"));
    expect(section).toContain('salary:');
    expect(section).toContain('detailSalary');
    expect(section).toContain('SalaryEstimate');
  });

  it('has description selectors', () => {
    const section = overlay.slice(overlay.indexOf("Phase A Tier 1: Glassdoor"), overlay.indexOf("platform: 'ashby'"));
    expect(section).toContain('description:');
    expect(section).toContain('jobDescriptionContent');
  });

  it('has rating selectors', () => {
    const section = overlay.slice(overlay.indexOf("Phase A Tier 1: Glassdoor"), overlay.indexOf("platform: 'ashby'"));
    expect(section).toContain('rating:');
    expect(section).toContain('detailRating');
  });

  it('has comprehensive apply button selectors', () => {
    expect(overlay).toContain('data-test="apply-button"');
    expect(overlay).toContain('data-brandviews');
    expect(overlay).toContain('ApplyButton');
  });

  it('has comprehensive title selectors', () => {
    expect(overlay).toContain('JobDetails_jobTitle');
    expect(overlay).toContain('data-test="jobTitle"');
    expect(overlay).toContain('e1tk4kwz5');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 4: parseJobMeta expanded extraction
// ═══════════════════════════════════════════════════════════
describe('Phase A — parseJobMeta expanded extraction', () => {
  it('extracts salary field', () => {
    expect(overlay).toContain("meta.salary");
    expect(overlay).toContain("ms.salary");
  });

  it('extracts description field (capped at 2000 chars)', () => {
    expect(overlay).toContain("meta.description");
    expect(overlay).toContain("ms.description");
    expect(overlay).toContain(".slice(0, 2000)");
  });

  it('extracts workType field', () => {
    expect(overlay).toContain("meta.workType");
    expect(overlay).toContain("ms.workType");
  });

  it('extracts jobType field', () => {
    expect(overlay).toContain("meta.jobType");
    expect(overlay).toContain("ms.jobType");
  });

  it('extracts rating field', () => {
    expect(overlay).toContain("meta.rating");
    expect(overlay).toContain("ms.rating");
  });

  it('has salary regex fallback for unstructured pages', () => {
    expect(overlay).toContain('salaryMatch');
    expect(overlay).toContain('\\$[\\d,]+');
  });

  it('JSON-LD fallback extracts salary from baseSalary', () => {
    expect(overlay).toContain('ld.baseSalary');
    expect(overlay).toContain('minValue');
    expect(overlay).toContain('maxValue');
  });

  it('JSON-LD fallback extracts employmentType', () => {
    expect(overlay).toContain('ld.employmentType');
  });

  it('JSON-LD fallback extracts description', () => {
    expect(overlay).toContain('ld.description');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 5: Manifest URL patterns
// ═══════════════════════════════════════════════════════════
describe('Phase A — Manifest URL patterns', () => {
  const mObj = JSON.parse(manifest);
  const csMatches = mObj.content_scripts[2].matches; // contentScript.js matches

  it('includes Indeed regional variants', () => {
    expect(csMatches).toContain('https://www.indeed.co.uk/*');
    expect(csMatches).toContain('https://www.indeed.ca/*');
    expect(csMatches).toContain('https://www.indeed.com.au/*');
    expect(csMatches).toContain('https://ca.indeed.com/*');
  });

  it('includes Glassdoor regional variants', () => {
    expect(csMatches).toContain('https://www.glassdoor.ca/*');
    expect(csMatches).toContain('https://www.glassdoor.com.au/*');
    expect(csMatches).toContain('https://www.glassdoor.de/*');
  });

  it('includes bare indeed.com', () => {
    expect(csMatches).toContain('https://indeed.com/*');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 6: Generic fallback also has salary + description
// ═══════════════════════════════════════════════════════════
describe('Phase A — Generic fallback salary + description', () => {
  const genericSection = overlay.slice(overlay.indexOf("platform: 'generic'"));

  it('generic fallback has salary selectors', () => {
    expect(genericSection).toContain('salary:');
    expect(genericSection).toContain('[class*="salary"]');
    expect(genericSection).toContain('[itemprop="baseSalary"]');
  });

  it('generic fallback has description selectors', () => {
    expect(genericSection).toContain('description:');
    expect(genericSection).toContain('.job-description');
    expect(genericSection).toContain('[itemprop="description"]');
  });
});
