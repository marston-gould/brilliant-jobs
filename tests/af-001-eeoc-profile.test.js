/**
 * AF-001: EEOC/OFCCP Profile Extension — Validation Tests
 *
 * Validates that the applicant profile has been extended with EEOC/OFCCP
 * voluntary self-identification fields (gender, race/ethnicity, veteran
 * status, disability status) and that the data flows through dashboard →
 * Supabase → extension sync → worker handlers → form fill.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');

// ─────────────────────────────────────────────────────────────
// Section 1: Dashboard HTML — EEOC Form Fields
// ─────────────────────────────────────────────────────────────
describe('AF-001 Section 1: Dashboard HTML EEOC Fields', () => {
  const html = read('dashboard.html');

  it('1.1 has EEOC/OFCCP section header', () => {
    expect(html).toContain('Voluntary Self-Identification (EEOC/OFCCP)');
  });

  it('1.2 has disclosure notice about voluntary nature', () => {
    expect(html).toContain('Your responses are optional');
    expect(html).toContain('will not affect your application');
  });

  it('1.3 has gender select with id ap-eeo-gender', () => {
    expect(html).toContain('id="ap-eeo-gender"');
    expect(html).toMatch(/select.*ap-eeo-gender/);
  });

  it('1.4 gender select has correct options', () => {
    expect(html).toContain('<option value="Male">Male</option>');
    expect(html).toContain('<option value="Female">Female</option>');
    expect(html).toContain('<option value="Non-binary">Non-binary</option>');
    expect(html).toContain('<option value="Prefer not to say">Prefer not to say</option>');
    expect(html).toContain('<option value="Decline to self-identify">Decline to self-identify</option>');
  });

  it('1.5 has race/ethnicity select with id ap-eeo-ethnicity', () => {
    expect(html).toContain('id="ap-eeo-ethnicity"');
  });

  it('1.6 race/ethnicity select has standard EEOC categories', () => {
    expect(html).toContain('American Indian or Alaska Native');
    expect(html).toContain('Asian');
    expect(html).toContain('Black or African American');
    expect(html).toContain('Hispanic or Latino');
    expect(html).toContain('Native Hawaiian or Other Pacific Islander');
    expect(html).toContain('White');
    expect(html).toContain('Two or more races');
  });

  it('1.7 has veteran status select with id ap-eeo-veteran', () => {
    expect(html).toContain('id="ap-eeo-veteran"');
  });

  it('1.8 veteran select has correct options', () => {
    expect(html).toContain('I am a protected veteran');
    expect(html).toContain('I am not a protected veteran');
  });

  it('1.9 has disability status select with id ap-eeo-disability', () => {
    expect(html).toContain('id="ap-eeo-disability"');
  });

  it('1.10 disability select has correct options', () => {
    expect(html).toContain('Yes, I have a disability');
    expect(html).toContain('No, I do not have a disability');
  });

  it('1.11 all EEOC selects have "— Not set —" default option', () => {
    const notSetCount = (html.match(/— Not set —/g) || []).length;
    expect(notSetCount).toBeGreaterThanOrEqual(4);
  });

  it('1.12 EEOC section has accessibility labels', () => {
    expect(html).toContain('for="ap-eeo-gender"');
    expect(html).toContain('for="ap-eeo-ethnicity"');
    expect(html).toContain('for="ap-eeo-veteran"');
    expect(html).toContain('for="ap-eeo-disability"');
  });
});

// ─────────────────────────────────────────────────────────────
// Section 2: settings.js — Populate + Read EEOC Fields
// ─────────────────────────────────────────────────────────────
describe('AF-001 Section 2: settings.js EEOC Integration', () => {
  const settings = read('js/settings.js');

  it('2.1 _populateApplicantProfileForm reads eeo_preferences', () => {
    expect(settings).toContain("p.eeo_preferences || {}");
  });

  it('2.2 populates gender field', () => {
    expect(settings).toContain("'ap-eeo-gender'");
    expect(settings).toContain("eeo.gender || ''");
  });

  it('2.3 populates ethnicity field', () => {
    expect(settings).toContain("'ap-eeo-ethnicity'");
    expect(settings).toContain("eeo.ethnicity || ''");
  });

  it('2.4 populates veteran status field', () => {
    expect(settings).toContain("'ap-eeo-veteran'");
    expect(settings).toContain("eeo.veteranStatus || ''");
  });

  it('2.5 populates disability status field', () => {
    expect(settings).toContain("'ap-eeo-disability'");
    expect(settings).toContain("eeo.disabilityStatus || ''");
  });

  it('2.6 _readApplicantProfileForm returns eeo_preferences object', () => {
    expect(settings).toContain('eeo_preferences: {');
    expect(settings).toMatch(/gender:.*ap-eeo-gender/);
    expect(settings).toMatch(/ethnicity:.*ap-eeo-ethnicity/);
    expect(settings).toMatch(/veteranStatus:.*ap-eeo-veteran/);
    expect(settings).toMatch(/disabilityStatus:.*ap-eeo-disability/);
  });

  it('2.7 PostHog event includes has_eeo property', () => {
    expect(settings).toContain('has_eeo:');
  });
});

// ─────────────────────────────────────────────────────────────
// Section 3: Extension background.ts — EEOC Sync
// ─────────────────────────────────────────────────────────────
describe('AF-001 Section 3: Extension Background EEOC Sync', () => {
  const bg = read('extension/background.ts');

  it('3.1 syncs eeoPreferences to chrome.storage.local', () => {
    expect(bg).toContain('eeoPreferences');
    expect(bg).toContain('eeo_preferences');
  });

  it('3.2 maps from applicantProfile.eeo_preferences', () => {
    expect(bg).toContain('applicantProfile.eeo_preferences');
  });

  it('3.3 AF-001 comment present', () => {
    expect(bg).toContain('AF-001');
  });
});

// ─────────────────────────────────────────────────────────────
// Section 4: Extension Handlers — Pre-existing EEOC Support
// ─────────────────────────────────────────────────────────────
describe('AF-001 Section 4: Extension Handler EEOC Support', () => {
  const radioGroup = read('extension/fields/radioGroup.ts');
  const ghReact = read('extension/handlers/greenhouse-react.ts');
  const recruitee = read('extension/handlers/recruitee.ts');

  it('4.1 radioGroup.ts handles gender questions', () => {
    expect(radioGroup).toMatch(/gender/i);
    expect(radioGroup).toContain('preferences.gender');
  });

  it('4.2 radioGroup.ts handles race/ethnicity questions', () => {
    expect(radioGroup).toMatch(/race|ethnic/i);
    expect(radioGroup).toContain('preferences.ethnicity');
  });

  it('4.3 radioGroup.ts handles veteran questions', () => {
    expect(radioGroup).toMatch(/veteran/i);
    expect(radioGroup).toContain('preferences.veteranStatus');
  });

  it('4.4 radioGroup.ts handles disability questions', () => {
    expect(radioGroup).toMatch(/disabilit/i);
    expect(radioGroup).toContain('preferences.disabilityStatus');
  });

  it('4.5 greenhouse-react.ts maps EEO fields', () => {
    expect(ghReact).toContain('prefs?.gender');
    expect(ghReact).toContain('prefs?.ethnicity');
    expect(ghReact).toContain('prefs?.veteranStatus');
    expect(ghReact).toContain('prefs?.disabilityStatus');
  });

  it('4.6 recruitee.ts maps EEO fields', () => {
    expect(recruitee).toContain('prefs?.gender');
    expect(recruitee).toContain('prefs?.race');
    expect(recruitee).toContain('prefs?.veteranStatus');
    expect(recruitee).toContain('prefs?.disabilityStatus');
  });
});

// ─────────────────────────────────────────────────────────────
// Section 5: Worker — EEOC Profile Extraction
// ─────────────────────────────────────────────────────────────
describe('AF-001 Section 5: Worker EEOC Profile', () => {
  const worker = read('worker/index.js');

  it('5.1 extracts gender from applicant profile eeo_preferences', () => {
    expect(worker).toMatch(/gender:.*eeo_preferences.*\.gender/);
  });

  it('5.2 extracts ethnicity from applicant profile eeo_preferences', () => {
    expect(worker).toMatch(/ethnicity:.*eeo_preferences.*\.ethnicity/);
  });

  it('5.3 extracts veteranStatus from applicant profile eeo_preferences', () => {
    expect(worker).toMatch(/veteranStatus:.*eeo_preferences.*\.veteranStatus/);
  });

  it('5.4 extracts disabilityStatus from applicant profile eeo_preferences', () => {
    expect(worker).toMatch(/disabilityStatus:.*eeo_preferences.*\.disabilityStatus/);
  });

  it('5.5 defaults to null when eeo_preferences missing', () => {
    expect(worker).toContain('eeo_preferences || {}');
  });

  it('5.6 AF-001 comment in worker', () => {
    expect(worker).toContain('AF-001');
  });
});

// ─────────────────────────────────────────────────────────────
// Section 6: Worker Handlers — EEOC Question Answering
// ─────────────────────────────────────────────────────────────
describe('AF-001 Section 6: Worker Handler EEOC Answering', () => {
  const greenhouse = read('worker/handlers/greenhouse.js');
  const lever = read('worker/handlers/lever.js');
  const workable = read('worker/handlers/workable.js');
  const ashby = read('worker/handlers/ashby.js');
  const generic = read('worker/handlers/generic.js');

  it('6.1 greenhouse answers EEO gender questions', () => {
    expect(greenhouse).toContain("patterns: ['gender', 'sex']");
    expect(greenhouse).toContain('profile.gender');
  });

  it('6.2 greenhouse answers EEO ethnicity questions', () => {
    expect(greenhouse).toContain("patterns: ['race', 'ethnic']");
    expect(greenhouse).toContain('profile.ethnicity');
  });

  it('6.3 greenhouse answers EEO veteran questions', () => {
    expect(greenhouse).toContain("patterns: ['veteran', 'military']");
    expect(greenhouse).toContain('profile.veteranStatus');
  });

  it('6.4 greenhouse answers EEO disability questions', () => {
    expect(greenhouse).toContain("patterns: ['disabilit']");
    expect(greenhouse).toContain('profile.disabilityStatus');
  });

  it('6.5 greenhouse skips EEO when value is null', () => {
    expect(greenhouse).toContain('if (!eeo.value) continue');
  });

  it('6.6 lever handler has EEOC answering', () => {
    expect(lever).toContain('AF-001');
    expect(lever).toContain('profile.gender');
    expect(lever).toContain('profile.ethnicity');
  });

  it('6.7 workable handler has EEOC answering', () => {
    expect(workable).toContain('AF-001');
    expect(workable).toContain('profile.gender');
    expect(workable).toContain('profile.ethnicity');
  });

  it('6.8 ashby handler has EEOC answering', () => {
    expect(ashby).toContain('AF-001');
    expect(ashby).toContain('profile.gender');
    expect(ashby).toContain('profile.ethnicity');
  });

  it('6.9 generic handler has EEOC answering', () => {
    expect(generic).toContain('AF-001');
    expect(generic).toContain('profile.gender');
    expect(generic).toContain('profile.ethnicity');
  });

  it('6.10 AF-001 comment in all 5 worker handlers', () => {
    expect(greenhouse).toContain('AF-001');
    expect(lever).toContain('AF-001');
    expect(workable).toContain('AF-001');
    expect(ashby).toContain('AF-001');
    expect(generic).toContain('AF-001');
  });
});

// ─────────────────────────────────────────────────────────────
// Section 7: Pod Team Manifest
// ─────────────────────────────────────────────────────────────
describe('AF-001 Section 7: Pod Team Manifest', () => {
  const manifest = read('docs/scaling/pod-team-manifest.md');

  it('7.1 AF-001 pairing assignment exists', () => {
    expect(manifest).toContain('AF-001');
  });

  it('7.2 Chief Architect listed', () => {
    expect(manifest).toContain('Chief Architect');
  });

  it('7.3 Lead Platform Engineer listed', () => {
    expect(manifest).toContain('Lead Platform Engineer');
  });

  it('7.4 System Architect — Scalability listed', () => {
    expect(manifest).toContain('System Architect — Scalability');
  });

  it('7.5 Forward-Looking Developer(s) listed', () => {
    expect(manifest).toContain('Forward-Looking Developer(s)');
  });

  it('7.6 Evolvability Strategist listed', () => {
    expect(manifest).toContain('Evolvability Strategist');
  });
});

// ─────────────────────────────────────────────────────────────
// Section 8: Build & Version
// ─────────────────────────────────────────────────────────────
describe('AF-001 Section 8: Build & File Inventory', () => {
  it('8.1 dist/dashboard.min.js exists', () => {
    expect(existsSync(join(ROOT, 'dist/dashboard.min.js'))).toBe(true);
  });

  it('8.2 dist/dashboard-deferred.min.js exists', () => {
    expect(existsSync(join(ROOT, 'dist/dashboard-deferred.min.js'))).toBe(true);
  });

  it('8.3 styles.css exists', () => {
    expect(existsSync(join(ROOT, 'styles.css'))).toBe(true);
  });

  it('8.4 test file exists', () => {
    expect(existsSync(join(ROOT, 'tests/af-001-eeoc-profile.test.js'))).toBe(true);
  });

  it('8.5 worker/index.js has 4 EEO profile fields', () => {
    const worker = read('worker/index.js');
    const eeoFields = ['gender:', 'ethnicity:', 'veteranStatus:', 'disabilityStatus:'];
    for (const field of eeoFields) {
      expect(worker).toContain(field);
    }
  });
});
