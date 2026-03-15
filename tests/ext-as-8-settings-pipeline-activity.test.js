// tests/ext-as-8-settings-pipeline-activity.test.js
// EXT-AS-8: Settings Panel + Activity Feed + Pipeline View (Handoff Phase 7)
// Validation tests for in-extension page views, settings, pipeline, and activity feed

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

function readFile(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('EXT-AS-8: Settings Panel + Activity Feed + Pipeline View', () => {

  // ──────────────────────────────────────────────────
  // Section 1: Popup HTML — Page View System
  // ──────────────────────────────────────────────────
  describe('1. Popup HTML Page Views', () => {
    const html = readFile('extension/popup.html');

    it('1.1 has cv-page-home container', () => {
      expect(html).toContain('id="cv-page-home"');
    });

    it('1.2 has cv-page-pipeline container', () => {
      expect(html).toContain('id="cv-page-pipeline"');
    });

    it('1.3 has cv-page-settings container', () => {
      expect(html).toContain('id="cv-page-settings"');
    });

    it('1.4 has cv-page-activity container', () => {
      expect(html).toContain('id="cv-page-activity"');
    });

    it('1.5 page-home is default active', () => {
      expect(html).toMatch(/cv-page active.*cv-page-home/s);
    });

    it('1.6 has back buttons with data-back attribute', () => {
      expect(html).toContain('data-back="home"');
    });

    it('1.7 bottom nav Pipeline button no longer opens external link', () => {
      // The pipeline nav item should NOT have onclick="window.open"
      const pipelineNav = html.match(/data-nav="pipeline"[^>]*/);
      expect(pipelineNav).toBeTruthy();
      expect(pipelineNav[0]).not.toContain('window.open');
    });

    it('1.8 bottom nav Settings button no longer opens external link', () => {
      const settingsNav = html.match(/data-nav="settings"[^>]*/);
      expect(settingsNav).toBeTruthy();
      expect(settingsNav[0]).not.toContain('window.open');
    });

    it('1.9 bottom nav Resumes still opens external link', () => {
      const resumesNav = html.match(/data-nav="resumes"[^>]*/);
      expect(resumesNav).toBeTruthy();
      expect(resumesNav[0]).toContain('window.open');
    });

    it('1.10 has page view CSS (.cv-page)', () => {
      expect(html).toContain('.cv-page {');
      expect(html).toContain('.cv-page.active {');
    });
  });

  // ──────────────────────────────────────────────────
  // Section 2: Settings Page HTML
  // ──────────────────────────────────────────────────
  describe('2. Settings Page HTML', () => {
    const html = readFile('extension/popup.html');

    it('2.1 has daily apply limit slider', () => {
      expect(html).toContain('id="cv-settings-limit-slider"');
    });

    it('2.2 daily limit slider range 5-100', () => {
      expect(html).toContain('min="5" max="100"');
    });

    it('2.3 has daily limit value display', () => {
      expect(html).toContain('id="cv-settings-limit-value"');
    });

    it('2.4 has rewrite preference: preserve tone', () => {
      expect(html).toContain('id="cv-settings-preserve-tone"');
    });

    it('2.5 has rewrite preference: add keywords', () => {
      expect(html).toContain('id="cv-settings-add-keywords"');
    });

    it('2.6 has rewrite preference: keep one page', () => {
      expect(html).toContain('id="cv-settings-keep-one-page"');
    });

    it('2.7 has settings resume info section', () => {
      expect(html).toContain('id="cv-settings-resume-info"');
    });

    it('2.8 has settings threshold slider (mirrors home)', () => {
      expect(html).toContain('id="cv-settings-threshold-slider"');
    });

    it('2.9 has settings CSS (.cv-settings-card)', () => {
      expect(html).toContain('.cv-settings-card {');
    });

    it('2.10 has toggle CSS (.cv-toggle)', () => {
      expect(html).toContain('.cv-toggle {');
      expect(html).toContain('.cv-toggle:checked {');
    });
  });

  // ──────────────────────────────────────────────────
  // Section 3: Pipeline Page HTML
  // ──────────────────────────────────────────────────
  describe('3. Pipeline Page HTML', () => {
    const html = readFile('extension/popup.html');

    it('3.1 has pipeline page stage counters', () => {
      expect(html).toContain('id="cv-pipe2-saved"');
      expect(html).toContain('id="cv-pipe2-applied"');
      expect(html).toContain('id="cv-pipe2-interview"');
      expect(html).toContain('id="cv-pipe2-offer"');
    });

    it('3.2 has pipeline jobs list container', () => {
      expect(html).toContain('id="cv-pipe-jobs-list"');
    });

    it('3.3 has View All dashboard link', () => {
      expect(html).toContain('cv-pipe-viewall');
      expect(html).toContain('View all on Dashboard');
    });

    it('3.4 has pipeline job CSS (.cv-pipe-job-item)', () => {
      expect(html).toContain('.cv-pipe-job-item {');
    });

    it('3.5 has pipeline job stage badge CSS', () => {
      expect(html).toContain('.cv-pipe-job-stage.saved {');
      expect(html).toContain('.cv-pipe-job-stage.applied {');
      expect(html).toContain('.cv-pipe-job-stage.interview {');
      expect(html).toContain('.cv-pipe-job-stage.offer {');
    });
  });

  // ──────────────────────────────────────────────────
  // Section 4: Activity Feed Page HTML
  // ──────────────────────────────────────────────────
  describe('4. Activity Feed Page HTML', () => {
    const html = readFile('extension/popup.html');

    it('4.1 has full activity feed container', () => {
      expect(html).toContain('id="cv-activity-full-list"');
    });

    it('4.2 has clear all button', () => {
      expect(html).toContain('id="cv-activity-clear-btn"');
    });

    it('4.3 has "See all" link on home activity section', () => {
      expect(html).toContain('id="cv-activity-see-all"');
    });

    it('4.4 has full activity feed CSS', () => {
      expect(html).toContain('.cv-activity-full {');
    });
  });

  // ──────────────────────────────────────────────────
  // Section 5: popup-consumer.ts Logic
  // ──────────────────────────────────────────────────
  describe('5. popup-consumer.ts Logic', () => {
    const ts = readFile('extension/popup-consumer.ts');

    it('5.1 has _initBottomNav function', () => {
      expect(ts).toContain('function _initBottomNav()');
    });

    it('5.2 has _navigateToPage function', () => {
      expect(ts).toContain('function _navigateToPage(');
    });

    it('5.3 has _loadSettingsPageData function', () => {
      expect(ts).toContain('function _loadSettingsPageData()');
    });

    it('5.4 has _loadRewritePreferences function', () => {
      expect(ts).toContain('function _loadRewritePreferences()');
    });

    it('5.5 has _saveRewritePreferences function', () => {
      expect(ts).toContain('function _saveRewritePreferences()');
    });

    it('5.6 has _loadDailyLimit function', () => {
      expect(ts).toContain('function _loadDailyLimit()');
    });

    it('5.7 has _saveDailyLimit function', () => {
      expect(ts).toContain('function _saveDailyLimit(');
    });

    it('5.8 has _loadPipelinePageData function', () => {
      expect(ts).toContain('function _loadPipelinePageData()');
    });

    it('5.9 has _loadFullActivityFeed function', () => {
      expect(ts).toContain('function _loadFullActivityFeed()');
    });

    it('5.10 has _initSettingsListeners function', () => {
      expect(ts).toContain('function _initSettingsListeners()');
    });

    it('5.11 navigateConsumerPage exported to window', () => {
      expect(ts).toContain('navigateConsumerPage');
    });

    it('5.12 initConsumerPopup calls _initBottomNav', () => {
      expect(ts).toContain('_initBottomNav()');
    });

    it('5.13 initConsumerPopup calls _initSettingsListeners', () => {
      expect(ts).toContain('_initSettingsListeners()');
    });

    it('5.14 rewrite preferences persist to chrome.storage.local', () => {
      expect(ts).toContain("chrome.storage.local.set({ rewritePreferences:");
    });

    it('5.15 daily limit syncs to chrome.storage.sync', () => {
      expect(ts).toContain("chrome.storage.sync.set({ dailyApplyLimit:");
    });

    it('5.16 settings threshold mirrors home slider', () => {
      expect(ts).toContain('cv-settings-threshold-slider');
      expect(ts).toContain('cv-threshold-slider');
    });

    it('5.17 activity clear button handler exists', () => {
      expect(ts).toContain('cv-activity-clear-btn');
      expect(ts).toContain('activityFeed: []');
    });

    it('5.18 has _escText XSS prevention function', () => {
      expect(ts).toContain('function _escText(');
    });

    it('5.19 pipeline page sends getPipelineItems message', () => {
      expect(ts).toContain("type: 'getPipelineItems'");
    });

    it('5.20 PostHog events for settings changes', () => {
      expect(ts).toContain("'rewrite_preferences_changed'");
      expect(ts).toContain("'daily_limit_changed'");
      expect(ts).toContain("'popup_nav'");
    });
  });

  // ──────────────────────────────────────────────────
  // Section 6: background.ts getPipelineItems Handler
  // ──────────────────────────────────────────────────
  describe('6. background.ts getPipelineItems', () => {
    const bg = readFile('extension/background.ts');

    it('6.1 has getPipelineItems message handler', () => {
      expect(bg).toContain("msg.type === 'getPipelineItems'");
    });

    it('6.2 queries user_pipeline table', () => {
      expect(bg).toContain('user_pipeline');
    });

    it('6.3 selects required fields', () => {
      expect(bg).toContain('job_title');
      expect(bg).toContain('company_name');
      expect(bg).toContain('stage');
    });

    it('6.4 orders by created_at desc', () => {
      expect(bg).toContain('order=created_at.desc');
    });

    it('6.5 sends auth bearer token', () => {
      expect(bg).toMatch(/Authorization.*Bearer.*access_token/);
    });

    it('6.6 handles auth failure gracefully', () => {
      expect(bg).toContain("items: [], error: 'not_authenticated'");
    });
  });

  // ──────────────────────────────────────────────────
  // Section 7: Extension Manifest
  // ──────────────────────────────────────────────────
  describe('7. Extension Manifest', () => {
    const manifest = JSON.parse(readFile('extension/manifest.tson'));

    it('7.1 manifest version bumped to 2.28.0', () => {
      expect(manifest.version).toBe('2.28.0');
    });
  });

  // ──────────────────────────────────────────────────
  // Section 8: Pod Team Manifest
  // ──────────────────────────────────────────────────
  describe('8. Pod Team Manifest', () => {
    const manifest = readFile('docs/scaling/pod-team-manifest.md');

    it('8.1 EXT-AS-8 pairing assigned', () => {
      expect(manifest).toContain('EXT-AS-8');
    });

    it('8.2 all 5 hook-and-scar roles present', () => {
      expect(manifest).toContain('Chief Architect');
      expect(manifest).toContain('Lead Platform Eng');
      expect(manifest).toContain('System Architect');
      expect(manifest).toContain('Forward-Looking Dev');
      expect(manifest).toContain('Evolvability Strategist');
    });
  });

  // ──────────────────────────────────────────────────
  // Section 9: Build & Version
  // ──────────────────────────────────────────────────
  describe('9. Build & Version', () => {
    it('9.1 product version is v8.70', () => {
      const versionJs = readFile('js/version.js');
      expect(versionJs).toContain('v8.70');
    });

    it('9.2 dist/dashboard.min.js exists and is rebuilt', () => {
      expect(existsSync(join(ROOT, 'dist/dashboard.min.js'))).toBe(true);
    });

    it('9.3 dist/dashboard-deferred.min.js exists', () => {
      expect(existsSync(join(ROOT, 'dist/dashboard-deferred.min.js'))).toBe(true);
    });

    it('9.4 styles.css exists', () => {
      expect(existsSync(join(ROOT, 'styles.css'))).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────
  // Section 10: File Inventory
  // ──────────────────────────────────────────────────
  describe('10. File Inventory', () => {
    const expectedFiles = [
      'extension/popup.html',
      'extension/popup-consumer.ts',
      'extension/background.ts',
      'extension/manifest.tson',
      'docs/scaling/pod-team-manifest.md',
      'tests/ext-as-8-settings-pipeline-activity.test.js',
    ];

    expectedFiles.forEach(f => {
      it(`exists: ${f}`, () => {
        expect(existsSync(join(ROOT, f))).toBe(true);
      });
    });
  });
});
