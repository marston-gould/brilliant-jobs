// tests/ext-as-3-job-site-overlay.test.js — EXT-AS-3: Content Script Save Button + Apply Interception
// Validates: job-site-registry.ts, job-site-overlay.ts, background.ts handlers,
// contentScript.ts injection, manifest.json updates, build-extension.js, pod-team-manifest.md

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const EXT = join(ROOT, 'extension');

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

function readExt(path) {
  return readFileSync(join(EXT, path), 'utf8');
}

// ═══════════════════════════════════════════════════════════
// 1. Job Site Registry
// ═══════════════════════════════════════════════════════════
describe('1. Job Site Registry (selectors/job-site-registry.ts)', () => {
  const src = readExt('selectors/job-site-registry.ts');

  it('1.1 File exists', () => {
    expect(existsSync(join(EXT, 'selectors/job-site-registry.ts'))).toBe(true);
  });

  it('1.2 Exports JOB_SITE_REGISTRY array', () => {
    expect(src).toContain('export const JOB_SITE_REGISTRY');
  });

  it('1.3 Exports JobSiteEntry interface', () => {
    expect(src).toContain('export interface JobSiteEntry');
  });

  it('1.4 Contains all 9 platforms', () => {
    const platforms = ['linkedin', 'indeed', 'greenhouse', 'lever', 'glassdoor', 'ashby', 'workable', 'recruitee', 'handshake'];
    for (const p of platforms) {
      expect(src).toContain(`platform: '${p}'`);
    }
  });

  it('1.5 Each entry has applyButtonSelectors array', () => {
    const matches = src.match(/applyButtonSelectors:/g);
    expect(matches.length).toBeGreaterThanOrEqual(9);
  });

  it('1.6 Each entry has saveButtonTarget with position', () => {
    const matches = src.match(/saveButtonTarget:/g);
    expect(matches.length).toBeGreaterThanOrEqual(9);
  });

  it('1.7 Each entry has jobMetaSelectors with title + company', () => {
    const titleMatches = src.match(/title:\s*\[/g);
    const companyMatches = src.match(/company:\s*\[/g);
    expect(titleMatches.length).toBeGreaterThanOrEqual(9);
    expect(companyMatches.length).toBeGreaterThanOrEqual(9);
  });

  it('1.8 Exports detectJobSite function', () => {
    expect(src).toContain('export function detectJobSite');
  });

  it('1.9 Exports queryWithFallback function', () => {
    expect(src).toContain('export function queryWithFallback');
  });

  it('1.10 LinkedIn selectors match spec Section 7', () => {
    expect(src).toContain('button.jobs-apply-button');
    expect(src).toContain('.jobs-save-button');
  });

  it('1.11 Indeed selectors match spec Section 7', () => {
    expect(src).toContain('#indeedApplyButton');
    expect(src).toContain('#jobsearch-ViewJobButtons-container');
  });

  it('1.12 Greenhouse selectors match spec Section 7', () => {
    expect(src).toContain('#submit_app');
    expect(src).toContain('#application-form');
  });

  it('1.13 Glassdoor selectors match spec Section 7', () => {
    expect(src).toContain('button[data-test="apply-button"]');
  });

  it('1.14 Handshake selectors match spec Section 7', () => {
    expect(src).toContain('button[data-hook="apply-button"]');
  });
});

// ═══════════════════════════════════════════════════════════
// 2. Job Site Overlay Content Script
// ═══════════════════════════════════════════════════════════
describe('2. Job Site Overlay (job-site-overlay.ts)', () => {
  const src = readExt('job-site-overlay.ts');

  it('2.1 File exists', () => {
    expect(existsSync(join(EXT, 'job-site-overlay.ts'))).toBe(true);
  });

  it('2.2 Is an IIFE (no module exports, self-contained)', () => {
    expect(src).toMatch(/^\(function\s*\(\)\s*\{/m);
    expect(src).toMatch(/\}\)\(\);$/m);
  });

  it('2.3 Contains all 9 platforms in inline registry', () => {
    const platforms = ['linkedin', 'indeed', 'greenhouse', 'lever', 'glassdoor', 'ashby', 'workable', 'recruitee', 'handshake'];
    for (const p of platforms) {
      expect(src).toContain(`platform: '${p}'`);
    }
  });

  it('2.4 Prevents double-injection', () => {
    expect(src).toContain('bj-overlay-shadow-host');
    expect(src).toContain('if (document.getElementById(SHADOW_HOST_ID)) return');
  });

  it('2.5 Loads application mode from chrome.storage', () => {
    expect(src).toContain('chrome.storage.sync.get');
    expect(src).toContain("'applicationMode'");
    expect(src).toContain("'scoreThreshold'");
  });

  it('2.6 Listens for chrome.storage.onChanged for live updates', () => {
    expect(src).toContain('chrome.storage.onChanged.addListener');
  });

  it('2.7 Has parseJobMeta function', () => {
    expect(src).toContain('function parseJobMeta()');
  });

  it('2.8 Has injectSaveButton function', () => {
    expect(src).toContain('function injectSaveButton()');
  });

  it('2.9 Has interceptApplyButtons function', () => {
    expect(src).toContain('function interceptApplyButtons()');
  });

  it('2.10 Save button uses Shadow DOM host', () => {
    expect(src).toContain('getShadowRoot');
    expect(src).toContain('attachShadow');
  });

  it('2.11 Save button branded "Save to BJ"', () => {
    expect(src).toContain('Save to BJ');
  });

  it('2.12 Save click sends SAVE_TO_PIPELINE message', () => {
    expect(src).toContain("sendMsg('SAVE_TO_PIPELINE'");
  });

  it('2.13 Apply interception sends APPLY_INTERCEPTED message', () => {
    expect(src).toContain("sendMsg('APPLY_INTERCEPTED'");
  });

  it('2.14 Manual mode does not intercept', () => {
    expect(src).toContain("if (_applicationMode === 'manual') return");
  });

  it('2.15 Non-manual modes call preventDefault', () => {
    expect(src).toContain('e.preventDefault()');
    expect(src).toContain('e.stopPropagation()');
    expect(src).toContain('e.stopImmediatePropagation()');
  });

  it('2.16 Uses MutationObserver for SPA navigation', () => {
    expect(src).toContain('new MutationObserver');
    expect(src).toContain('_observer.observe(document.body');
  });

  it('2.17 Intercepts pushState/replaceState for SPA URL changes', () => {
    expect(src).toContain('history.pushState');
    expect(src).toContain('history.replaceState');
    expect(src).toContain("addEventListener('popstate'");
  });

  it('2.18 Save button updates to "Saved" state on success', () => {
    expect(src).toContain("btn.innerHTML = ICON_CHECK + ' Saved'");
  });

  it('2.19 Uses capture phase for click interception', () => {
    expect(src).toContain("}, true); // Capture phase");
  });

  it('2.20 Has INTERCEPT_ATTR to prevent double-interception', () => {
    expect(src).toContain("'data-bj-intercepted'");
    expect(src).toContain('getAttribute(INTERCEPT_ATTR)');
    expect(src).toContain('setAttribute(INTERCEPT_ATTR');
  });

  it('2.21 Shows toast notifications for user feedback', () => {
    expect(src).toContain('function showToast');
    expect(src).toContain("showToast('Saved to Brilliant Jobs pipeline')");
  });

  it('2.22 Exports _bjJobSiteOverlay for testing', () => {
    expect(src).toContain('window._bjJobSiteOverlay');
  });

  it('2.23 Handles 3 save button positions (before/after/adjacent)', () => {
    expect(src).toContain("if (pos === 'before')");
    expect(src).toContain("} else if (pos === 'after')");
  });

  it('2.24 Default mode is manual', () => {
    expect(src).toContain("var _applicationMode = 'manual'");
  });

  it('2.25 Default score threshold is 75', () => {
    expect(src).toContain('var _scoreThreshold = 75');
  });

  it('2.26 APPLY_INTERCEPTED payload includes mode + threshold', () => {
    expect(src).toContain('mode: _applicationMode');
    expect(src).toContain('scoreThreshold: _scoreThreshold');
    expect(src).toContain('resumeId: _activeResumeId');
  });

  it('2.27 Retries save button injection after 2s delay for SPAs', () => {
    expect(src).toContain('setTimeout(function () {');
    expect(src).toContain('}, 2000)');
  });

  it('2.28 Fallback: lets native apply proceed on background failure', () => {
    expect(src).toContain("showToast('BJ processing unavailable — applying natively')");
    expect(src).toContain('button.click()');
  });
});

// ═══════════════════════════════════════════════════════════
// 3. Background.ts Message Handlers
// ═══════════════════════════════════════════════════════════
describe('3. Background.ts SAVE_TO_PIPELINE + APPLY_INTERCEPTED Handlers', () => {
  const src = readExt('background.ts');

  it('3.1 Has SAVE_TO_PIPELINE handler', () => {
    expect(src).toContain("msg.type === 'SAVE_TO_PIPELINE'");
  });

  it('3.2 SAVE_TO_PIPELINE calls pipeline-write EF', () => {
    const pipelineSection = src.substring(src.indexOf("msg.type === 'SAVE_TO_PIPELINE'"));
    expect(pipelineSection).toContain('pipeline-write');
  });

  it('3.3 SAVE_TO_PIPELINE sets entry_source to job_site_overlay', () => {
    expect(src).toContain("entry_source: 'job_site_overlay'");
  });

  it('3.4 SAVE_TO_PIPELINE uses auth token', () => {
    const section = src.substring(src.indexOf("msg.type === 'SAVE_TO_PIPELINE'"), src.indexOf("msg.type === 'SAVE_TO_PIPELINE'") + 1000);
    expect(section).toContain('authSession.access_token');
  });

  it('3.5 SAVE_TO_PIPELINE captures PostHog event', () => {
    expect(src).toContain("captureEvent('job_site_overlay_saved'");
  });

  it('3.6 SAVE_TO_PIPELINE has error handling with reportError', () => {
    const section = src.substring(src.indexOf("msg.type === 'SAVE_TO_PIPELINE'"), src.indexOf("msg.type === 'APPLY_INTERCEPTED'"));
    expect(section).toContain("captureEvent('extension_catch_error'");
    expect(section).toContain("context: 'SAVE_TO_PIPELINE'");
  });

  it('3.7 Has APPLY_INTERCEPTED handler', () => {
    expect(src).toContain("msg.type === 'APPLY_INTERCEPTED'");
  });

  it('3.8 APPLY_INTERCEPTED captures PostHog event', () => {
    expect(src).toContain("captureEvent('apply_intercepted'");
  });

  it('3.9 APPLY_INTERCEPTED stores activity feed item', () => {
    expect(src).toContain("chrome.storage.local.get('activityFeed'");
    expect(src).toContain('feed.unshift(activityItem)');
  });

  it('3.10 Activity feed pruned to 50 items', () => {
    expect(src).toContain('if (feed.length > 50) feed.length = 50');
  });

  it('3.11 APPLY_INTERCEPTED returns status received with mode', () => {
    expect(src).toContain("sendResponse({ status: 'received', mode: mode })");
  });

  it('3.12 Both handlers return true for async sendResponse', () => {
    const saveSect = src.substring(src.indexOf("msg.type === 'SAVE_TO_PIPELINE'"), src.indexOf("msg.type === 'APPLY_INTERCEPTED'"));
    const applySect = src.substring(src.indexOf("msg.type === 'APPLY_INTERCEPTED'"), src.indexOf("msg.type === 'startScanner'"));
    expect(saveSect).toContain('return true;');
    expect(applySect).toContain('return true;');
  });
});

// ═══════════════════════════════════════════════════════════
// 4. ContentScript.ts Injection
// ═══════════════════════════════════════════════════════════
describe('4. ContentScript.ts job-site-overlay Injection', () => {
  const src = readExt('contentScript.ts');

  it('4.1 Injects job-site-overlay.js', () => {
    expect(src).toContain("chrome.runtime.getURL('job-site-overlay.js')");
  });

  it('4.2 Has injectJobSiteOverlay IIFE', () => {
    expect(src).toContain('function injectJobSiteOverlay()');
  });

  it('4.3 Injection appears after toolbar injection', () => {
    const toolbarIdx = src.indexOf('injectToolbar');
    const overlayIdx = src.indexOf('injectJobSiteOverlay');
    expect(overlayIdx).toBeGreaterThan(toolbarIdx);
  });

  it('4.4 Has error handling on inject', () => {
    expect(src).toContain('[BJ] Job site overlay inject error');
  });
});

// ═══════════════════════════════════════════════════════════
// 5. Manifest.json Updates
// ═══════════════════════════════════════════════════════════
describe('5. Manifest.json Updates', () => {
  const manifest = JSON.parse(readExt('manifest.json'));

  it('5.1 Version bumped to 2.24.0', () => {
    expect(manifest.version).toBe('2.24.0');
  });

  it('5.2 content_scripts includes Glassdoor', () => {
    const csMatches = manifest.content_scripts[2].matches;
    expect(csMatches).toContain('https://www.glassdoor.com/*');
  });

  it('5.3 content_scripts includes Handshake', () => {
    const csMatches = manifest.content_scripts[2].matches;
    expect(csMatches.some(m => m.includes('joinhandshake.com'))).toBe(true);
  });

  it('5.4 content_scripts includes Indeed listing pages', () => {
    const csMatches = manifest.content_scripts[2].matches;
    expect(csMatches).toContain('https://www.indeed.com/*');
  });

  it('5.5 host_permissions includes Glassdoor', () => {
    expect(manifest.host_permissions).toContain('https://www.glassdoor.com/*');
  });

  it('5.6 host_permissions includes Handshake', () => {
    expect(manifest.host_permissions.some(h => h.includes('joinhandshake.com'))).toBe(true);
  });

  it('5.7 web_accessible_resources includes job-site-overlay.js', () => {
    const resources = manifest.web_accessible_resources[0].resources;
    expect(resources).toContain('job-site-overlay.js');
  });

  it('5.8 web_accessible_resources matches includes new sites', () => {
    const matches = manifest.web_accessible_resources[0].matches;
    expect(matches.some(m => m.includes('glassdoor.com'))).toBe(true);
    expect(matches.some(m => m.includes('joinhandshake.com'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// 6. Build Configuration
// ═══════════════════════════════════════════════════════════
describe('6. Build Configuration', () => {
  const buildSrc = readExt('build-extension.js');

  it('6.1 job-site-overlay.ts in JS_FILES', () => {
    expect(buildSrc).toContain("'job-site-overlay.ts'");
  });
});

// ═══════════════════════════════════════════════════════════
// 7. Pod Team Manifest
// ═══════════════════════════════════════════════════════════
describe('7. Pod Team Manifest', () => {
  const manifest = read('docs/scaling/pod-team-manifest.md');

  it('7.1 All 5 hook-and-scar roles present', () => {
    expect(manifest).toContain('Chief Architect');
    expect(manifest).toContain('Lead Platform Engineer');
    expect(manifest).toContain('System Architect — Scalability');
    expect(manifest).toContain('Forward-Looking Developer(s)');
    expect(manifest).toContain('Evolvability Strategist');
  });

  it('7.2 EXT-AS-3 pairing entry exists', () => {
    expect(manifest).toContain('EXT-AS-3');
  });

  it('7.3 EXT-AS section header exists', () => {
    expect(manifest).toContain('Extension Auto-Submit');
  });
});

// ═══════════════════════════════════════════════════════════
// 8. Message Protocol Compliance
// ═══════════════════════════════════════════════════════════
describe('8. Message Protocol (from Spec Section 6)', () => {
  const overlay = readExt('job-site-overlay.ts');
  const bg = readExt('background.ts');

  it('8.1 SAVE_TO_PIPELINE message type used in both files', () => {
    expect(overlay).toContain('SAVE_TO_PIPELINE');
    expect(bg).toContain('SAVE_TO_PIPELINE');
  });

  it('8.2 APPLY_INTERCEPTED message type used in both files', () => {
    expect(overlay).toContain('APPLY_INTERCEPTED');
    expect(bg).toContain('APPLY_INTERCEPTED');
  });

  it('8.3 SAVE_TO_PIPELINE payload includes url, title, company, platform', () => {
    // Check overlay sends these fields
    const saveSection = overlay.substring(overlay.indexOf('SAVE_TO_PIPELINE'));
    expect(saveSection).toContain('url: meta.url');
    expect(saveSection).toContain('title: meta.title');
    expect(saveSection).toContain('company: meta.company');
    expect(saveSection).toContain('platform: meta.platform');
  });

  it('8.4 APPLY_INTERCEPTED payload includes url, title, company, platform, mode, resume_id', () => {
    const applySection = overlay.substring(overlay.indexOf('APPLY_INTERCEPTED'));
    expect(applySection).toContain('url: meta.url');
    expect(applySection).toContain('title: meta.title');
    expect(applySection).toContain('mode: _applicationMode');
    expect(applySection).toContain('resumeId: _activeResumeId');
  });
});

// ═══════════════════════════════════════════════════════════
// 9. Mode-Based Interception Logic
// ═══════════════════════════════════════════════════════════
describe('9. Mode-Based Interception Logic', () => {
  const src = readExt('job-site-overlay.ts');

  it('9.1 Supports all 6 modes from spec', () => {
    const modes = ['manual', 'score-gated', 'auto-apply', 'auto-score-gate', 'auto-rewrite', 'full-autopilot'];
    for (const mode of modes) {
      expect(src).toContain(mode);
    }
  });

  it('9.2 Mode-specific toast labels exist', () => {
    expect(src).toContain("'score-gated': 'Scoring resume...'");
    expect(src).toContain("'auto-apply': 'Auto-applying...'");
    expect(src).toContain("'auto-rewrite': 'Rewriting + applying...'");
    expect(src).toContain("'full-autopilot': 'Full autopilot...'");
  });

  it('9.3 Daily apply limit tracked', () => {
    expect(src).toContain('_dailyApplyLimit');
    expect(src).toContain('dailyApplyLimit: _dailyApplyLimit');
  });
});

// ═══════════════════════════════════════════════════════════
// 10. File Inventory
// ═══════════════════════════════════════════════════════════
describe('10. File Inventory', () => {
  const files = [
    'extension/selectors/job-site-registry.ts',
    'extension/job-site-overlay.ts',
    'extension/contentScript.ts',
    'extension/background.ts',
    'extension/build-extension.js',
    'extension/manifest.json',
    'docs/scaling/pod-team-manifest.md',
  ];

  for (const f of files) {
    it(`${f} exists`, () => {
      expect(existsSync(join(ROOT, f))).toBe(true);
    });
  }
});
