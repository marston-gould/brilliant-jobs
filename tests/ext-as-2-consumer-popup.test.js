// EXT-AS-2: Consumer Popup UI + Mode Persistence - Validation Tests
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

function readFile(path) { return readFileSync(path, 'utf-8'); }

const POPUP_HTML = readFile('extension/popup.html');
const POPUP_CONSUMER = readFile('extension/popup-consumer.ts');
const POPUP_TS = readFile('extension/popup.ts');
const BACKGROUND_TS = readFile('extension/background.ts');
const BUILD_EXT = readFile('extension/build-extension.js');

// Section 1: Consumer View HTML
describe('Consumer View HTML', () => {
  it('has consumer-view container', () => { expect(POPUP_HTML).toContain('id="consumer-view"'); });
  it('has admin-legacy-view container', () => { expect(POPUP_HTML).toContain('id="admin-legacy-view"'); });
  it('has legacy toggle in header', () => { expect(POPUP_HTML).toContain('id="legacy-toggle"'); });
  it('has all 6 mode cards', () => {
    ['manual','score-gated','auto-apply','auto-score-gate','auto-rewrite','full-autopilot'].forEach(m => {
      expect(POPUP_HTML).toContain('data-mode="' + m + '"');
    });
  });
  it('has risk badges', () => {
    expect(POPUP_HTML).toContain('Low risk');
    expect(POPUP_HTML).toContain('Recommended');
    expect(POPUP_HTML).toContain('Moderate');
    expect(POPUP_HTML).toContain('Aggressive');
    expect(POPUP_HTML).toContain('Full Auto');
  });
  it('has threshold slider 30-95', () => {
    expect(POPUP_HTML).toContain('id="cv-threshold-slider"');
    expect(POPUP_HTML).toContain('min="30"');
    expect(POPUP_HTML).toContain('max="95"');
  });
  it('has threshold value display', () => { expect(POPUP_HTML).toContain('id="cv-threshold-value"'); });
  it('has threshold hints', () => {
    expect(POPUP_HTML).toContain('30');
    expect(POPUP_HTML).toContain('Lenient');
    expect(POPUP_HTML).toContain('Balanced');
    expect(POPUP_HTML).toContain('Strict');
  });
  it('has resume card', () => {
    expect(POPUP_HTML).toContain('id="cv-resume-card"');
    expect(POPUP_HTML).toContain('id="cv-resume-name"');
    expect(POPUP_HTML).toContain('id="cv-resume-meta"');
  });
  it('has pipeline 4 stage pills', () => {
    expect(POPUP_HTML).toContain('id="cv-pipe-saved"');
    expect(POPUP_HTML).toContain('id="cv-pipe-applied"');
    expect(POPUP_HTML).toContain('id="cv-pipe-interview"');
    expect(POPUP_HTML).toContain('id="cv-pipe-offer"');
  });
  it('has activity feed', () => {
    expect(POPUP_HTML).toContain('id="cv-activity-list"');
    expect(POPUP_HTML).toContain('No recent activity');
  });
  it('has bottom nav 4 items', () => {
    expect(POPUP_HTML).toContain('data-nav="home"');
    expect(POPUP_HTML).toContain('data-nav="pipeline"');
    expect(POPUP_HTML).toContain('data-nav="resumes"');
    expect(POPUP_HTML).toContain('data-nav="settings"');
  });
  it('has popup-consumer script after popup.js', () => {
    const pi = POPUP_HTML.indexOf('src="popup.js"');
    const ci = POPUP_HTML.indexOf('popup-consumer.js');
    const poi = POPUP_HTML.indexOf('popup-post.js');
    expect(pi).toBeLessThan(ci);
    expect(ci).toBeLessThan(poi);
  });
});

// Section 2: Consumer CSS
describe('Consumer View CSS', () => {
  it('has view toggle CSS', () => {
    expect(POPUP_HTML).toContain('#consumer-view.active');
    expect(POPUP_HTML).toContain('#admin-legacy-view.active');
  });
  it('has mode card CSS', () => {
    expect(POPUP_HTML).toContain('.cv-mode-card');
    expect(POPUP_HTML).toContain('.cv-mode-card.selected');
  });
  it('has slider CSS', () => { expect(POPUP_HTML).toContain('.cv-slider'); });
  it('has pipeline CSS', () => { expect(POPUP_HTML).toContain('.cv-stage-pill'); });
  it('has activity CSS', () => {
    expect(POPUP_HTML).toContain('.cv-activity-dot.green');
    expect(POPUP_HTML).toContain('.cv-activity-dot.amber');
    expect(POPUP_HTML).toContain('.cv-activity-dot.blue');
  });
  it('has bottom nav CSS', () => { expect(POPUP_HTML).toContain('.cv-bottom-nav'); });
  it('has legacy toggle CSS', () => { expect(POPUP_HTML).toContain('.legacy-toggle'); });
  it('has badge variants', () => {
    expect(POPUP_HTML).toContain('.cv-mode-badge.safe');
    expect(POPUP_HTML).toContain('.cv-mode-badge.moderate');
    expect(POPUP_HTML).toContain('.cv-mode-badge.aggressive');
  });
});

// Section 3: Consumer Logic
describe('Consumer Popup Logic', () => {
  it('exports initConsumerPopup', () => {
    expect(POPUP_CONSUMER).toContain('initConsumerPopup = initConsumerPopup');
  });
  it('exports addActivityItem', () => {
    expect(POPUP_CONSUMER).toContain('addActivityItem = addActivityItem');
  });
  it('has view switching', () => {
    expect(POPUP_CONSUMER).toContain('function _switchView');
  });
  it('reads mode from chrome.storage', () => {
    expect(POPUP_CONSUMER).toContain("chrome.storage.local.get('applySettings')");
  });
  it('persists mode to sync storage', () => {
    expect(POPUP_CONSUMER).toContain('chrome.storage.sync.set({ applicationMode:');
  });
  it('persists threshold to sync storage', () => {
    expect(POPUP_CONSUMER).toContain('chrome.storage.sync.set({ scoreThreshold:');
  });
  it('sends sync message to background', () => {
    expect(POPUP_CONSUMER).toContain("type: 'syncApplySettingsToSupabase'");
  });
  it('debounces threshold changes', () => {
    expect(POPUP_CONSUMER).toContain('_debounceTimer');
  });
  it('defines scoring modes', () => {
    expect(POPUP_CONSUMER).toContain('MODES_USING_SCORING');
  });
  it('hides threshold for non-scoring modes', () => {
    expect(POPUP_CONSUMER).toContain('_updateThresholdVisibility');
  });
  it('has admin legacy toggle', () => {
    expect(POPUP_CONSUMER).toContain('adminLegacyMode');
  });
  it('loads pipeline from Supabase', () => {
    expect(POPUP_CONSUMER).toContain('user_pipeline');
  });
  it('loads activity from storage', () => {
    expect(POPUP_CONSUMER).toContain("chrome.storage.local.get('activityFeed')");
  });
  it('limits feed to 50 items', () => {
    expect(POPUP_CONSUMER).toContain('feed.shift()');
  });
  it('shows 5 most recent', () => {
    expect(POPUP_CONSUMER).toContain('slice(-5).reverse()');
  });
  it('has relative time helper', () => {
    expect(POPUP_CONSUMER).toContain('function _relativeTime');
  });
  it('listens for storage changes', () => {
    expect(POPUP_CONSUMER).toContain('chrome.storage.onChanged.addListener');
  });
  it('uses escHtml for XSS protection', () => {
    expect(POPUP_CONSUMER).toContain('escHtml(');
  });
  it('captures PostHog events', () => {
    expect(POPUP_CONSUMER).toContain("phCapture('mode_changed'");
    expect(POPUP_CONSUMER).toContain("phCapture('threshold_changed'");
    expect(POPUP_CONSUMER).toContain("phCapture('admin_toggle'");
  });
});

// Section 4: Popup.ts Integration
describe('Popup.ts Integration', () => {
  it('calls initConsumerPopup', () => {
    expect(POPUP_TS).toContain('initConsumerPopup(role)');
  });
  it('checks function exists', () => {
    expect(POPUP_TS).toContain("typeof (window as any).initConsumerPopup");
  });
});

// Section 5: Background Sync
describe('Background Sync Handler', () => {
  it('has syncApplySettingsToSupabase handler', () => {
    expect(BACKGROUND_TS).toContain("msg.type === 'syncApplySettingsToSupabase'");
  });
  it('uses supabase helpers', () => {
    expect(BACKGROUND_TS).toContain('supabase.select');
    expect(BACKGROUND_TS).toContain('supabase.update');
  });
  it('maps to Supabase field names', () => {
    expect(BACKGROUND_TS).toContain('default_apply_mode');
    expect(BACKGROUND_TS).toContain('default_score_threshold');
  });
});

// Section 6: Build Config
describe('Build Config', () => {
  it('includes popup-consumer.ts', () => {
    expect(BUILD_EXT).toContain("'popup-consumer.ts'");
  });
  it('popup-consumer.ts exists', () => {
    expect(existsSync('extension/popup-consumer.ts')).toBe(true);
  });
});

// Section 7: Accessibility
describe('Accessibility', () => {
  it('toggle has aria-label', () => {
    expect(POPUP_HTML).toContain('aria-label="Toggle legacy admin view"');
  });
  it('bottom nav uses buttons', () => {
    expect(POPUP_HTML).toContain('<button class="cv-nav-item');
  });
});

// Section 8: File Inventory
describe('File Inventory', () => {
  const files = [
    'extension/popup.html',
    'extension/popup.ts',
    'extension/popup-consumer.ts',
    'extension/background.ts',
    'extension/build-extension.js',
  ];
  files.forEach(f => {
    it(f + ' exists', () => { expect(existsSync(f)).toBe(true); });
  });
});
