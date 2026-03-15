/**
 * EXT-BUILD-001-S2 — Dashboard Download Button + Version Check + Bugs B1/B2/B4
 * Tests: download wiring, extension-version EF, background version check,
 *        popup update banner, B1/B4 CSP fix, B2 app_config replacement
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const EXT = join(ROOT, 'extension');

// ═══════════════════════════════════════════════════════════
// Section 1: S2.1 — Dashboard download button wiring
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S2 — Download button wiring', () => {
  const appJs = readFileSync(join(ROOT, 'js', 'app.js'), 'utf-8');
  const extDl = readFileSync(join(ROOT, 'js', 'extension-download.js'), 'utf-8');
  const buildJs = readFileSync(join(ROOT, 'build.js'), 'utf-8');

  it('app.js no longer calls /api/build-extension', () => {
    expect(appJs).not.toContain("'/api/build-extension'");
    expect(appJs).not.toContain('"/api/build-extension"');
  });

  it('app.js delegates to _bjExtensionDownload.downloadBuild', () => {
    expect(appJs).toContain('_bjExtensionDownload');
    expect(appJs).toContain('downloadBuild');
  });

  it('app.js has bjLoadChunk fallback for deferred chunk', () => {
    expect(appJs).toContain("bjLoadChunk('deferred')");
  });

  it('extension-download.js supports #download-btn ID', () => {
    expect(extDl).toContain("getElementById('download-btn')");
  });

  it('extension-download.js calls Supabase build-extension EF directly', () => {
    expect(extDl).toContain('/functions/v1/build-extension');
  });

  it('extension-download.js stores channel map in localStorage', () => {
    expect(extDl).toContain('bj_channel_map');
    expect(extDl).toContain('localStorage.setItem');
  });

  it('extension-download.js is in deferred build chunk', () => {
    expect(buildJs).toContain('js/extension-download.js');
  });

  it('extension-download.js exports window._bjExtensionDownload', () => {
    expect(extDl).toContain('window._bjExtensionDownload');
    expect(extDl).toContain('downloadBuild');
    expect(extDl).toContain('resolveChannel');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 2: S2.2 — extension-version EF
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S2 — extension-version EF', () => {
  const efPath = join(ROOT, 'supabase', 'functions', 'extension-version', 'index.ts');

  it('extension-version/index.ts exists', () => {
    expect(existsSync(efPath)).toBe(true);
  });

  it('returns latest version 3.0.0', () => {
    const content = readFileSync(efPath, 'utf-8');
    expect(content).toContain('"3.0.0"');
  });

  it('returns min_supported version', () => {
    const content = readFileSync(efPath, 'utf-8');
    expect(content).toContain('MIN_SUPPORTED_VERSION');
    expect(content).toContain('"2.21.0"');
  });

  it('returns download_url', () => {
    const content = readFileSync(efPath, 'utf-8');
    expect(content).toContain('brilliantjobs.app');
    expect(content).toContain('download_url');
  });

  it('sets Cache-Control max-age=3600', () => {
    const content = readFileSync(efPath, 'utf-8');
    expect(content).toContain('max-age=3600');
  });

  it('accepts GET method only', () => {
    const content = readFileSync(efPath, 'utf-8');
    expect(content).toContain('"GET"');
    expect(content).toContain('Method not allowed');
  });

  it('gateway route #127 exists', () => {
    const gw = readFileSync(join(ROOT, 'supabase', 'functions', 'api-gateway', 'index.ts'), 'utf-8');
    expect(gw).toContain('"extension-version"');
    expect(gw).toContain('#127');
    expect(gw).toContain('127 routes');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 3: S2.3 — Background version check
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S2 — Background version check', () => {
  const bg = readFileSync(join(EXT, 'background.ts'), 'utf-8');

  it('has _checkExtensionVersion function', () => {
    expect(bg).toContain('_checkExtensionVersion');
  });

  it('creates bjVersionCheck alarm with 6hr period', () => {
    expect(bg).toContain("'bjVersionCheck'");
    expect(bg).toContain('periodInMinutes: 360');
  });

  it('checks on startup with 5s delay', () => {
    expect(bg).toContain('setTimeout(_checkExtensionVersion, 5000)');
  });

  it('calls extension-version EF', () => {
    expect(bg).toContain('extension-version');
  });

  it('compares semver and detects isBehind', () => {
    expect(bg).toContain('_compareSemver');
    expect(bg).toContain('isBehind');
  });

  it('sets badge text ! with amber color when behind', () => {
    expect(bg).toContain("setBadgeText({ text: '!' })");
    expect(bg).toContain('#f59e0b');
  });

  it('clears badge when up to date', () => {
    expect(bg).toContain("setBadgeText({ text: '' })");
  });

  it('stores version data in chrome.storage.local', () => {
    expect(bg).toContain('_bjVersionCheck');
    expect(bg).toContain('chrome.storage.local.set');
  });

  it('sends versionUpdate message to popup', () => {
    expect(bg).toContain("type: 'versionUpdate'");
  });

  it('fires PostHog ext_version_check event', () => {
    expect(bg).toContain('ext_version_check');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 4: S2.4 — Popup update banner
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S2 — Popup update banner', () => {
  const popupHtml = readFileSync(join(EXT, 'popup.html'), 'utf-8');
  const popupConsumer = readFileSync(join(EXT, 'popup-consumer.ts'), 'utf-8');

  it('popup.html has cv-update-banner container', () => {
    expect(popupHtml).toContain('cv-update-banner');
  });

  it('popup.html has download button in banner', () => {
    expect(popupHtml).toContain('cv-update-download-btn');
  });

  it('popup.html has dismiss button in banner', () => {
    expect(popupHtml).toContain('cv-update-dismiss');
  });

  it('popup.html has version labels', () => {
    expect(popupHtml).toContain('cv-update-current');
    expect(popupHtml).toContain('cv-update-latest');
  });

  it('popup-consumer.ts has _initUpdateBanner function', () => {
    expect(popupConsumer).toContain('_initUpdateBanner');
  });

  it('popup-consumer.ts reads _bjVersionCheck from storage', () => {
    expect(popupConsumer).toContain('_bjVersionCheck');
  });

  it('popup-consumer.ts listens for versionUpdate messages', () => {
    expect(popupConsumer).toContain("msg.type === 'versionUpdate'");
  });

  it('popup-consumer.ts dismisses banner and persists to storage', () => {
    expect(popupConsumer).toContain('_bjVersionDismissed');
  });

  it('popup-consumer.ts download button calls build-extension EF', () => {
    expect(popupConsumer).toContain('/functions/v1/build-extension');
  });

  it('popup-consumer.ts fires PostHog events', () => {
    expect(popupConsumer).toContain('update_banner_shown');
    expect(popupConsumer).toContain('update_banner_dismissed');
    expect(popupConsumer).toContain('update_downloaded_from_popup');
  });

  it('initConsumerPopup calls _initUpdateBanner', () => {
    expect(popupConsumer).toContain('_initUpdateBanner()');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 5: B1/B4 — Resumes nav CSP fix
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S2 — B1/B4: Resumes CSP fix', () => {
  const popupHtml = readFileSync(join(EXT, 'popup.html'), 'utf-8');
  const popupConsumer = readFileSync(join(EXT, 'popup-consumer.ts'), 'utf-8');

  it('popup.html Resumes button has NO inline onclick', () => {
    const resumesLine = popupHtml.split('\n').find(l => l.includes('data-nav="resumes"'));
    expect(resumesLine).toBeTruthy();
    expect(resumesLine).not.toContain('onclick');
    expect(resumesLine).not.toContain('window.open');
  });

  it('popup-consumer.ts handles resumes nav via chrome.tabs.create', () => {
    expect(popupConsumer).toContain("chrome.tabs.create");
    expect(popupConsumer).toContain("brilliantjobs.app");
    expect(popupConsumer).toContain("resumes");
  });

  it('no inline onclick anywhere in popup.html', () => {
    const onclickMatches = popupHtml.match(/onclick\s*=/gi) || [];
    expect(onclickMatches.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Section 6: B2 — app_config replacement
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S2 — B2: app_config → extension-version', () => {
  const popupPost = readFileSync(join(EXT, 'popup-post.ts'), 'utf-8');

  it('popup-post.ts no longer references app_config table', () => {
    expect(popupPost).not.toContain('rest/v1/app_config');
    expect(popupPost).not.toContain('extension_latest_version');
  });

  it('popup-post.ts calls extension-version EF', () => {
    expect(popupPost).toContain('extension-version');
  });

  it('popup-post.ts reads data.latest from response', () => {
    expect(popupPost).toContain('data.latest');
  });

  it('popup-post.ts still shows version-mismatch-banner', () => {
    expect(popupPost).toContain('version-mismatch-banner');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 7: File inventory
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S2 — File inventory', () => {
  it('supabase/functions/extension-version/index.ts created', () => {
    expect(existsSync(join(ROOT, 'supabase', 'functions', 'extension-version', 'index.ts'))).toBe(true);
  });

  it('js/extension-download.js exists and in build', () => {
    expect(existsSync(join(ROOT, 'js', 'extension-download.js'))).toBe(true);
    const buildJs = readFileSync(join(ROOT, 'build.js'), 'utf-8');
    expect(buildJs).toContain('extension-download.js');
  });

  it('extension/background.ts modified (version check)', () => {
    const bg = readFileSync(join(EXT, 'background.ts'), 'utf-8');
    expect(bg).toContain('EXT-BUILD-001-S2');
  });

  it('extension/popup-consumer.ts modified (update banner)', () => {
    const pc = readFileSync(join(EXT, 'popup-consumer.ts'), 'utf-8');
    expect(pc).toContain('EXT-BUILD-001');
  });

  it('extension/popup-post.ts modified (B2)', () => {
    const pp = readFileSync(join(EXT, 'popup-post.ts'), 'utf-8');
    expect(pp).toContain('EXT-BUILD-001');
  });

  it('extension/popup.html modified (B1 + banner)', () => {
    const ph = readFileSync(join(EXT, 'popup.html'), 'utf-8');
    expect(ph).toContain('cv-update-banner');
  });

  it('tests/ext-build-001-s2-download-version.test.js created', () => {
    expect(existsSync(join(ROOT, 'tests', 'ext-build-001-s2-download-version.test.js'))).toBe(true);
  });
});
