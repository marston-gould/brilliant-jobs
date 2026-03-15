/**
 * SCA-REM-S1 — Spec Compliance Remediation Session 1
 * Tests: REM-S01 (citizenship_status), REM-S06 (ghost dropdown), SIM-REM-002 (deploy script)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

// ─── Helpers ───
const read = (f) => readFileSync(f, 'utf8');
const dashboard = read('dashboard.html');
const settingsJs = read('js/settings.js');
const workerJs = read('worker/index.js');

// ═══════════════════════════════════════════════════════════
// REM-S01: citizenship_status — 5th EEOC field
// ═══════════════════════════════════════════════════════════
describe('REM-S01: citizenship_status EEOC field', () => {

  describe('dashboard.html — form field', () => {
    it('has ap-eeo-citizenship select element', () => {
      expect(dashboard).toContain('id="ap-eeo-citizenship"');
    });

    it('has correct label text', () => {
      expect(dashboard).toContain('Citizenship Status');
    });

    it('has "— Not set —" default option', () => {
      const match = dashboard.match(/id="ap-eeo-citizenship"[\s\S]*?<\/select>/);
      expect(match).not.toBeNull();
      expect(match[0]).toContain('— Not set —');
    });

    it('has US Citizen option', () => {
      const match = dashboard.match(/id="ap-eeo-citizenship"[\s\S]*?<\/select>/);
      expect(match[0]).toContain('US Citizen');
    });

    it('has Permanent Resident option', () => {
      const match = dashboard.match(/id="ap-eeo-citizenship"[\s\S]*?<\/select>/);
      expect(match[0]).toContain('Permanent Resident');
    });

    it('has Non-citizen authorized option', () => {
      const match = dashboard.match(/id="ap-eeo-citizenship"[\s\S]*?<\/select>/);
      expect(match[0]).toContain('Non-citizen authorized to work');
    });

    it('has Require sponsorship option', () => {
      const match = dashboard.match(/id="ap-eeo-citizenship"[\s\S]*?<\/select>/);
      expect(match[0]).toContain('Require sponsorship');
    });

    it('has Prefer not to say option', () => {
      const match = dashboard.match(/id="ap-eeo-citizenship"[\s\S]*?<\/select>/);
      expect(match[0]).toContain('Prefer not to say');
    });

    it('has Decline to self-identify option', () => {
      const match = dashboard.match(/id="ap-eeo-citizenship"[\s\S]*?<\/select>/);
      expect(match[0]).toContain('Decline to self-identify');
    });

    it('has exactly 7 options (blank + 6 values)', () => {
      const match = dashboard.match(/id="ap-eeo-citizenship"[\s\S]*?<\/select>/);
      const optCount = (match[0].match(/<option/g) || []).length;
      expect(optCount).toBe(7);
    });

    it('all 5 EEOC fields present in dashboard', () => {
      expect(dashboard).toContain('id="ap-eeo-gender"');
      expect(dashboard).toContain('id="ap-eeo-ethnicity"');
      expect(dashboard).toContain('id="ap-eeo-veteran"');
      expect(dashboard).toContain('id="ap-eeo-disability"');
      expect(dashboard).toContain('id="ap-eeo-citizenship"');
    });
  });

  describe('settings.js — populate function', () => {
    it('reads citizenshipStatus from eeo_preferences', () => {
      expect(settingsJs).toContain("eeo.citizenshipStatus");
    });

    it('targets ap-eeo-citizenship element', () => {
      expect(settingsJs).toContain("'ap-eeo-citizenship'");
    });
  });

  describe('settings.js — read function', () => {
    it('includes citizenshipStatus in eeo_preferences object', () => {
      expect(settingsJs).toContain("citizenshipStatus:");
      // Verify it reads from the form element
      expect(settingsJs).toContain("ap-eeo-citizenship");
    });
  });

  describe('settings.js — PostHog event', () => {
    it('has_eeo check includes citizenshipStatus', () => {
      expect(settingsJs).toContain('citizenshipStatus))');
    });
  });

  describe('worker/index.js — already wired', () => {
    it('references citizenshipStatus from eeo_preferences', () => {
      expect(workerJs).toContain('citizenshipStatus');
    });
  });
});

// ═══════════════════════════════════════════════════════════
// REM-S06: Ghost option removed from feedback dropdown
// ═══════════════════════════════════════════════════════════
describe('REM-S06: Ghost option removed from notification log filter', () => {

  it('ghost_alert option is NOT in notification log filter', () => {
    // The notification log filter dropdown
    const filterSection = dashboard.match(/id="nc-nlog-filter-type"[\s\S]*?<\/select>/);
    expect(filterSection).not.toBeNull();
    expect(filterSection[0]).not.toContain('ghost_alert');
  });

  it('ghost notification rows preserved for existing data', () => {
    // ghost_alert and ghost_report notification matrix rows should still exist
    expect(dashboard).toContain('data-notif="ghost_alert"');
    expect(dashboard).toContain('data-notif="ghost_report"');
  });

  it('feedback form does NOT have ghost category option', () => {
    // The feedback form type toggle should not mention ghost
    const fbPage = dashboard.match(/id="fb-page"[\s\S]*?<\/select>/);
    expect(fbPage).not.toBeNull();
    expect(fbPage[0]).not.toContain('ghost');
  });
});

// ═══════════════════════════════════════════════════════════
// SIM-REM-002: Deploy script for 22 undeployed EFs
// ═══════════════════════════════════════════════════════════
describe('SIM-REM-002: Deploy script exists', () => {

  it('deploy script file exists', () => {
    expect(existsSync('scripts/deploy-missing-efs.sh')).toBe(true);
  });

  it('script contains deploy commands', () => {
    const script = read('scripts/deploy-missing-efs.sh');
    expect(script).toContain('supabase functions deploy');
  });

  it('script references project ref', () => {
    const script = read('scripts/deploy-missing-efs.sh');
    expect(script).toContain('qojhagupdnbtomfoxnsf');
  });

  it('script includes generate-cover-letter', () => {
    const script = read('scripts/deploy-missing-efs.sh');
    expect(script).toContain('generate-cover-letter');
  });

  it('script includes refresh-materialized-views', () => {
    const script = read('scripts/deploy-missing-efs.sh');
    expect(script).toContain('refresh-materialized-views');
  });

  it('script includes extract-resume-profile', () => {
    const script = read('scripts/deploy-missing-efs.sh');
    expect(script).toContain('extract-resume-profile');
  });
});

// ═══════════════════════════════════════════════════════════
// Version check
// ═══════════════════════════════════════════════════════════
describe('Version v9.18', () => {
  it('version.js has v9.18', () => {
    const versionJs = read('js/version.js');
    expect(versionJs).toContain('v9.18');
  });

  it('dashboard.html cache busted to v9.18', () => {
    expect(dashboard).toContain('v=v9.18');
  });
});
