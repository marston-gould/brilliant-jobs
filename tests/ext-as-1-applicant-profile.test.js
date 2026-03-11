/**
 * EXT-AS-1: Applicant Profile Form + Settings Sync — Validation Tests
 * 
 * Validates:
 * 1. Dashboard HTML: Applicant Profile card + Apply Settings Sync card
 * 2. settings.js: load/save/sync functions for profile + settings
 * 3. apply-workflow.js: Supabase background sync on settings change
 * 4. Extension background.ts: _syncProfileAndSettingsFromSupabase + message handler
 * 5. Data model: profiles.user_data.applicant_profile + apply_settings
 * 6. Build output + version
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

// ── Helpers ──────────────────────────────────────────────

function readFile(path) {
  return readFileSync(path, 'utf-8');
}

// ── 1. Dashboard HTML: Applicant Profile Card ───────────

describe('1. Dashboard HTML — Applicant Profile Card', () => {
  const html = readFile('dashboard.html');

  it('1.1 Has applicant-profile-card', () => {
    expect(html).toContain('id="applicant-profile-card"');
  });

  it('1.2 Has first name input', () => {
    expect(html).toContain('id="ap-first-name"');
  });

  it('1.3 Has last name input', () => {
    expect(html).toContain('id="ap-last-name"');
  });

  it('1.4 Has email input', () => {
    expect(html).toContain('id="ap-email"');
  });

  it('1.5 Has phone input', () => {
    expect(html).toContain('id="ap-phone"');
  });

  it('1.6 Has LinkedIn input', () => {
    expect(html).toContain('id="ap-linkedin"');
  });

  it('1.7 Has location input', () => {
    expect(html).toContain('id="ap-location"');
  });

  it('1.8 Has work authorization toggle', () => {
    expect(html).toContain('id="ap-work-auth"');
  });

  it('1.9 Has sponsorship toggle', () => {
    expect(html).toContain('id="ap-sponsorship"');
  });

  it('1.10 Has save button', () => {
    expect(html).toContain('id="ap-save-btn"');
  });

  it('1.11 Has save status indicator', () => {
    expect(html).toContain('id="ap-save-status"');
  });
});

// ── 2. Dashboard HTML: Apply Settings Sync Card ─────────

describe('2. Dashboard HTML — Apply Settings Sync Card', () => {
  const html = readFile('dashboard.html');

  it('2.1 Has apply-settings-sync-card', () => {
    expect(html).toContain('id="apply-settings-sync-card"');
  });

  it('2.2 Has mode display', () => {
    expect(html).toContain('id="aps-mode-display"');
  });

  it('2.3 Has threshold display', () => {
    expect(html).toContain('id="aps-threshold-display"');
  });

  it('2.4 Has daily limit display', () => {
    expect(html).toContain('id="aps-limit-display"');
  });

  it('2.5 Has sync button', () => {
    expect(html).toContain('id="aps-sync-btn"');
  });

  it('2.6 Has sync status indicator', () => {
    expect(html).toContain('id="aps-sync-status"');
  });

  it('2.7 Cards are inside #page-settings', () => {
    const settingsPage = html.substring(html.indexOf('id="page-settings"'));
    expect(settingsPage).toContain('id="applicant-profile-card"');
    expect(settingsPage).toContain('id="apply-settings-sync-card"');
  });
});

// ── 3. settings.js: Applicant Profile Functions ─────────

describe('3. settings.js — Applicant Profile Functions', () => {
  const settings = readFile('js/settings.js');

  it('3.1 Has loadApplicantProfile function', () => {
    expect(settings).toContain('async function loadApplicantProfile()');
  });

  it('3.2 Has saveApplicantProfile function', () => {
    expect(settings).toContain('async function saveApplicantProfile()');
  });

  it('3.3 Has _populateApplicantProfileForm function', () => {
    expect(settings).toContain('function _populateApplicantProfileForm(p)');
  });

  it('3.4 Has _readApplicantProfileForm function', () => {
    expect(settings).toContain('function _readApplicantProfileForm()');
  });

  it('3.5 Reads from profiles.user_data', () => {
    expect(settings).toContain("from('profiles')");
    expect(settings).toContain("select('user_data')");
  });

  it('3.6 Writes applicant_profile to user_data', () => {
    expect(settings).toContain('ud.applicant_profile = profile');
  });

  it('3.7 Validates name required', () => {
    expect(settings).toContain('First name is required');
  });

  it('3.8 Validates email required', () => {
    expect(settings).toContain('Email is required');
  });

  it('3.9 Reads work_authorization field', () => {
    expect(settings).toContain('work_authorization');
  });

  it('3.10 Reads needs_sponsorship field', () => {
    expect(settings).toContain('needs_sponsorship');
  });

  it('3.11 PostHog event on save', () => {
    expect(settings).toContain('applicant_profile_saved');
  });

  it('3.12 Window exports for SPA bridge', () => {
    expect(settings).toContain('window.saveApplicantProfile');
    expect(settings).toContain('window.loadApplicantProfile');
    expect(settings).toContain('window.syncApplySettingsToSupabase');
  });

  it('3.13 Auto-loads profile on init', () => {
    expect(settings).toContain('loadApplicantProfile()');
  });
});

// ── 4. settings.js: Apply Settings Sync ─────────────────

describe('4. settings.js — Apply Settings Sync', () => {
  const settings = readFile('js/settings.js');

  it('4.1 Has syncApplySettingsToSupabase function', () => {
    expect(settings).toContain('async function syncApplySettingsToSupabase()');
  });

  it('4.2 Has _updateApplySettingsDisplay function', () => {
    expect(settings).toContain('function _updateApplySettingsDisplay()');
  });

  it('4.3 Syncs default_apply_mode to Supabase', () => {
    expect(settings).toContain('default_apply_mode:');
  });

  it('4.4 Syncs default_score_threshold to Supabase', () => {
    expect(settings).toContain('default_score_threshold:');
  });

  it('4.5 Syncs active_resume_id to Supabase', () => {
    expect(settings).toContain('active_resume_id:');
  });

  it('4.6 Syncs daily_apply_limit to Supabase', () => {
    expect(settings).toContain('daily_apply_limit:');
  });

  it('4.7 PostHog event on sync', () => {
    expect(settings).toContain('apply_settings_synced');
  });

  it('4.8 Writes apply_settings to user_data', () => {
    expect(settings).toContain('ud.apply_settings =');
  });
});

// ── 5. apply-workflow.js: Supabase Background Sync ──────

describe('5. apply-workflow.js — Supabase Background Sync', () => {
  const aw = readFile('js/apply-workflow.js');

  it('5.1 Has _debouncedApplySettingsSync', () => {
    expect(aw).toContain('function _debouncedApplySettingsSync()');
  });

  it('5.2 saveApplySettings calls debounced sync', () => {
    expect(aw).toContain('_debouncedApplySettingsSync()');
  });

  it('5.3 Calls syncApplySettingsToSupabase', () => {
    expect(aw).toContain('syncApplySettingsToSupabase');
  });

  it('5.4 Updates display after sync', () => {
    expect(aw).toContain('_updateApplySettingsDisplay');
  });

  it('5.5 Debounce timer uses 2-second delay', () => {
    expect(aw).toContain('2000');
  });
});

// ── 6. Extension background.ts: Profile Sync ───────────

describe('6. Extension background.ts — Profile Sync', () => {
  const bg = readFile('extension/background.ts');

  it('6.1 Has _syncProfileAndSettingsFromSupabase function', () => {
    expect(bg).toContain('async function _syncProfileAndSettingsFromSupabase');
  });

  it('6.2 Reads from profiles table', () => {
    expect(bg).toContain("supabase.select('profiles'");
  });

  it('6.3 Extracts applicant_profile from user_data', () => {
    expect(bg).toContain('userData.applicant_profile');
  });

  it('6.4 Extracts apply_settings from user_data', () => {
    expect(bg).toContain('userData.apply_settings');
  });

  it('6.5 Writes applicantProfile to chrome.storage.local', () => {
    expect(bg).toContain('updates.applicantProfile = applicantProfile');
  });

  it('6.6 Writes applySettings to chrome.storage.local', () => {
    expect(bg).toContain('updates.applySettings =');
  });

  it('6.7 Maps mode to applicationMode', () => {
    expect(bg).toContain("applicationMode: applySettings.default_apply_mode || 'score-gated'");
  });

  it('6.8 Maps threshold to scoreThreshold', () => {
    expect(bg).toContain('scoreThreshold: applySettings.default_score_threshold || 75');
  });

  it('6.9 Maps resume to activeResumeId', () => {
    expect(bg).toContain('activeResumeId: applySettings.active_resume_id || null');
  });

  it('6.10 Maps limit to dailyApplyLimit', () => {
    expect(bg).toContain('dailyApplyLimit: applySettings.daily_apply_limit || 25');
  });

  it('6.11 Called after dashboardTokenSync', () => {
    expect(bg).toContain('_syncProfileAndSettingsFromSupabase(user_id, access_token)');
  });

  it('6.12 Has syncProfileSettings message handler', () => {
    expect(bg).toContain("msg.type === 'syncProfileSettings'");
  });

  it('6.13 Message handler returns true for async sendResponse', () => {
    const syncBlock = bg.substring(bg.indexOf("msg.type === 'syncProfileSettings'"));
    expect(syncBlock).toContain('return true;');
  });

  it('6.14 Error captured to PostHog', () => {
    expect(bg).toContain('ext_profile_sync_failed');
  });
});

// ── 7. Worker Compatibility ─────────────────────────────

describe('7. Worker Compatibility — Profile Shape Matches', () => {
  const worker = readFile('worker/index.js');
  const settings = readFile('js/settings.js');

  it('7.1 Worker reads applicant_profile.name', () => {
    expect(worker).toContain('applicantProfile.name');
  });

  it('7.2 Form produces name field', () => {
    expect(settings).toContain("name: (firstName + ' ' + lastName).trim()");
  });

  it('7.3 Worker reads applicant_profile.email', () => {
    expect(worker).toContain('applicantProfile.email');
  });

  it('7.4 Worker reads applicant_profile.phone', () => {
    expect(worker).toContain('applicantProfile.phone');
  });

  it('7.5 Worker reads applicant_profile.linkedin', () => {
    expect(worker).toContain('applicantProfile.linkedin');
  });

  it('7.6 Worker reads applicant_profile.location', () => {
    expect(worker).toContain('applicantProfile.location');
  });

  it('7.7 Worker reads work_authorization', () => {
    expect(worker).toContain('applicantProfile.work_authorization');
  });

  it('7.8 Worker reads needs_sponsorship', () => {
    expect(worker).toContain('applicantProfile.needs_sponsorship');
  });
});

// ── 8. Build Output + Version ───────────────────────────

describe('8. Build Output + Version', () => {
  it('8.1 Product version is v8.63', () => {
    const ver = readFile('js/version.js');
    expect(ver).toContain('v8.63');
  });

  it('8.2 dist/dashboard.min.js exists', () => {
    expect(existsSync('dist/dashboard.min.js')).toBe(true);
  });

  it('8.3 dist/dashboard-deferred.min.js exists', () => {
    expect(existsSync('dist/dashboard-deferred.min.js')).toBe(true);
  });

  it('8.4 dist/dashboard.min.js contains profile functions', () => {
    const min = readFile('dist/dashboard.min.js');
    // settings.js is in deferred, not main — check deferred
    const deferred = readFile('dist/dashboard-deferred.min.js');
    expect(deferred).toContain('applicant_profile');
  });

  it('8.5 Test file exists', () => {
    expect(existsSync('tests/ext-as-1-applicant-profile.test.js')).toBe(true);
  });
});

// ── 9. File Inventory ───────────────────────────────────

describe('9. File Inventory', () => {
  const expected = [
    'dashboard.html',
    'js/settings.js',
    'js/apply-workflow.js',
    'extension/background.ts',
    'tests/ext-as-1-applicant-profile.test.js'
  ];

  expected.forEach(f => {
    it(`9.${expected.indexOf(f) + 1} ${f} exists`, () => {
      expect(existsSync(f)).toBe(true);
    });
  });
});
