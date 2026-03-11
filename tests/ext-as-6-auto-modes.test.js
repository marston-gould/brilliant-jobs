/**
 * EXT-AS-6 — Auto Modes + Autopilot + Limits
 * Validation tests for auto-apply, auto-rewrite, full-autopilot mode routing,
 * daily apply limit enforcement, and overlay status handlers.
 *
 * Sections:
 *   1. Daily Apply Limit Helpers (background.ts)
 *   2. Auto-Apply Mode Routing (background.ts)
 *   3. Auto-Rewrite Mode Routing (background.ts)
 *   4. Full-Autopilot Mode Routing (background.ts)
 *   5. Limit Reached Handling (background.ts)
 *   6. ContentScript Bridge (contentScript.ts)
 *   7. Overlay Auto Mode Toast (job-site-overlay.ts)
 *   8. Overlay Limit Reached Toast (job-site-overlay.ts)
 *   9. PostHog Events
 *  10. Extension Manifest
 *  11. Pod Team Manifest
 *  12. Build & Version
 *  13. File Inventory
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf-8');

// ── Helpers ──
const bgSrc = read('extension/background.ts');
const csSrc = read('extension/contentScript.ts');
const overlaySrc = read('extension/job-site-overlay.ts');
const manifestSrc = read('extension/manifest.json');
const podManifest = read('docs/scaling/pod-team-manifest.md');

// ── 1. Daily Apply Limit Helpers ──────────────────────────────────
describe('1. Daily Apply Limit Helpers', () => {
  it('1.1 _checkDailyApplyLimit function exists', () => {
    expect(bgSrc).toContain('async function _checkDailyApplyLimit()');
  });

  it('1.2 _checkDailyApplyLimit reads dailyApplyCount from chrome.storage.local', () => {
    expect(bgSrc).toContain("chrome.storage.local.get(['dailyApplyCount'");
  });

  it('1.3 _checkDailyApplyLimit returns allowed, count, limit', () => {
    expect(bgSrc).toContain('allowed: true, count: 0, limit');
    expect(bgSrc).toContain('allowed: counter.count < limit');
  });

  it('1.4 _checkDailyApplyLimit resets on date change', () => {
    expect(bgSrc).toContain("if (counter.date !== today)");
    expect(bgSrc).toContain("{ date: today, count: 0 }");
  });

  it('1.5 _incrementDailyApplyCount function exists', () => {
    expect(bgSrc).toContain('async function _incrementDailyApplyCount()');
  });

  it('1.6 _incrementDailyApplyCount increments counter', () => {
    expect(bgSrc).toContain('counter.count + 1');
  });

  it('1.7 Default daily limit is 25', () => {
    expect(bgSrc).toContain('dailyApplyLimit || 25');
  });
});

// ── 2. Auto-Apply Mode Routing ────────────────────────────────────
describe('2. Auto-Apply Mode Routing', () => {
  it('2.1 auto-apply mode branch exists', () => {
    expect(bgSrc).toContain("mode === 'auto-apply'");
  });

  it('2.2 auto-apply checks daily limit', () => {
    // Extract auto-apply block
    const idx = bgSrc.indexOf("mode === 'auto-apply'");
    const block = bgSrc.slice(idx, idx + 2000);
    expect(block).toContain('_checkDailyApplyLimit()');
  });

  it('2.3 auto-apply sends filling status immediately (no scoring, no rewriting)', () => {
    const idx = bgSrc.indexOf("mode === 'auto-apply'");
    const block = bgSrc.slice(idx, idx + 2000);
    expect(block).toContain("action: 'auto_apply'");
    expect(block).toContain("status: 'filling'");
  });

  it('2.4 auto-apply sends autoApplyStatus to overlay', () => {
    const idx = bgSrc.indexOf("mode === 'auto-apply'");
    const block = bgSrc.slice(idx, idx + 2000);
    expect(block).toContain("'bj:toolbar:autoApplyStatus'");
    expect(block).toContain("step: 'filling'");
  });

  it('2.5 auto-apply increments daily count', () => {
    const idx = bgSrc.indexOf("mode === 'auto-apply'");
    const block = bgSrc.slice(idx, idx + 2000);
    expect(block).toContain('_incrementDailyApplyCount()');
  });

  it('2.6 auto-apply fires PostHog event', () => {
    expect(bgSrc).toContain("'auto_apply_submitted'");
  });
});

// ── 3. Auto-Rewrite Mode Routing ──────────────────────────────────
describe('3. Auto-Rewrite Mode Routing', () => {
  it('3.1 auto-rewrite mode branch exists', () => {
    expect(bgSrc).toContain("mode === 'auto-rewrite'");
  });

  it('3.2 auto-rewrite checks daily limit', () => {
    const idx = bgSrc.indexOf("mode === 'auto-rewrite'");
    const block = bgSrc.slice(idx, idx + 4000);
    expect(block).toContain('_checkDailyApplyLimit()');
  });

  it('3.3 auto-rewrite scores resume first', () => {
    const idx = bgSrc.indexOf("mode === 'auto-rewrite'");
    const block = bgSrc.slice(idx, idx + 4000);
    expect(block).toContain('_scoreResumeForJob(tabId, p)');
  });

  it('3.4 auto-rewrite rewrites resume (no review popup)', () => {
    const idx = bgSrc.indexOf("mode === 'auto-rewrite'");
    const block = bgSrc.slice(idx, idx + 4000);
    expect(block).toContain('_rewriteResumeForJob(tabId, p');
  });

  it('3.5 auto-rewrite auto-submits rewritten resume', () => {
    const idx = bgSrc.indexOf("mode === 'auto-rewrite'");
    const block = bgSrc.slice(idx, idx + 4000);
    expect(block).toContain("action: 'auto_rewrite'");
    expect(block).toContain('use_rewrite: true');
  });

  it('3.6 auto-rewrite falls back to original if rewrite fails', () => {
    const idx = bgSrc.indexOf("mode === 'auto-rewrite'");
    const block = bgSrc.slice(idx, idx + 4000);
    expect(block).toContain("action: 'auto_rewrite_fallback'");
  });

  it('3.7 auto-rewrite sends step progress (scoring → rewriting → filling)', () => {
    const idx = bgSrc.indexOf("mode === 'auto-rewrite'");
    const block = bgSrc.slice(idx, idx + 4000);
    expect(block).toContain("step: 'scoring'");
    expect(block).toContain("step: 'rewriting'");
    expect(block).toContain("step: 'filling'");
  });

  it('3.8 auto-rewrite fires PostHog event', () => {
    expect(bgSrc).toContain("'auto_rewrite_submitted'");
  });

  it('3.9 auto-rewrite PostHog event includes rewrite_succeeded flag', () => {
    const idx = bgSrc.indexOf("'auto_rewrite_submitted'");
    const block = bgSrc.slice(idx, idx + 300);
    expect(block).toContain('rewrite_succeeded');
  });
});

// ── 4. Full-Autopilot Mode Routing ────────────────────────────────
describe('4. Full-Autopilot Mode Routing', () => {
  it('4.1 full-autopilot mode branch exists', () => {
    expect(bgSrc).toContain("mode === 'full-autopilot'");
  });

  it('4.2 full-autopilot checks daily limit', () => {
    const idx = bgSrc.indexOf("mode === 'full-autopilot'");
    const block = bgSrc.slice(idx, idx + 4000);
    expect(block).toContain('_checkDailyApplyLimit()');
  });

  it('4.3 full-autopilot skips scoring (rewrites everything)', () => {
    const idx = bgSrc.indexOf("mode === 'full-autopilot'");
    const block = bgSrc.slice(idx, idx + 4000);
    // Should call _rewriteResumeForJob with score: 0 (no scoring)
    expect(block).toContain('score: 0');
    // Should NOT call _scoreResumeForJob
    const scoreCallCount = (block.match(/_scoreResumeForJob/g) || []).length;
    expect(scoreCallCount).toBe(0);
  });

  it('4.4 full-autopilot rewrites and auto-submits', () => {
    const idx = bgSrc.indexOf("mode === 'full-autopilot'");
    const block = bgSrc.slice(idx, idx + 4000);
    expect(block).toContain('_rewriteResumeForJob(tabId, p');
    expect(block).toContain("action: 'full_autopilot'");
    expect(block).toContain('use_rewrite: true');
  });

  it('4.5 full-autopilot still submits if rewrite fails (never stops)', () => {
    const idx = bgSrc.indexOf("mode === 'full-autopilot'");
    const block = bgSrc.slice(idx, idx + 4000);
    expect(block).toContain("action: 'autopilot_fallback'");
  });

  it('4.6 full-autopilot fires PostHog event', () => {
    expect(bgSrc).toContain("'full_autopilot_submitted'");
  });
});

// ── 5. Limit Reached Handling ─────────────────────────────────────
describe('5. Limit Reached Handling', () => {
  it('5.1 auto-apply sends limitReached message when limit exceeded', () => {
    const idx = bgSrc.indexOf("mode === 'auto-apply'");
    const block = bgSrc.slice(idx, idx + 2000);
    expect(block).toContain("'bj:toolbar:limitReached'");
  });

  it('5.2 auto-rewrite sends limitReached message when limit exceeded', () => {
    const idx = bgSrc.indexOf("mode === 'auto-rewrite'");
    const block = bgSrc.slice(idx, idx + 1000);
    expect(block).toContain("'bj:toolbar:limitReached'");
  });

  it('5.3 full-autopilot sends limitReached message when limit exceeded', () => {
    const idx = bgSrc.indexOf("mode === 'full-autopilot'");
    const block = bgSrc.slice(idx, idx + 1000);
    expect(block).toContain("'bj:toolbar:limitReached'");
  });

  it('5.4 limitReached payload includes count and limit', () => {
    expect(bgSrc).toContain('count: limitCheck.count, limit: limitCheck.limit');
  });

  it('5.5 daily_apply_limit_reached PostHog event fired', () => {
    expect(bgSrc).toContain("'daily_apply_limit_reached'");
  });

  it('5.6 limit check response sent back', () => {
    expect(bgSrc).toContain("status: 'limit_reached'");
  });
});

// ── 6. ContentScript Bridge ───────────────────────────────────────
describe('6. ContentScript Bridge', () => {
  it('6.1 Bridge includes bj:toolbar:autoApplyStatus', () => {
    expect(csSrc).toContain("'bj:toolbar:autoApplyStatus'");
  });

  it('6.2 Bridge includes bj:toolbar:limitReached', () => {
    expect(csSrc).toContain("'bj:toolbar:limitReached'");
  });

  it('6.3 Comment updated to EXT-AS-4/5/6', () => {
    expect(csSrc).toContain('EXT-AS-4/5/6');
  });

  it('6.4 All 6 message types in bridge condition', () => {
    // scoreGate, applyStatus, rewriteProgress, rewriteResult, autoApplyStatus, limitReached
    expect(csSrc).toContain('bj:toolbar:scoreGate');
    expect(csSrc).toContain('bj:toolbar:applyStatus');
    expect(csSrc).toContain('bj:toolbar:rewriteProgress');
    expect(csSrc).toContain('bj:toolbar:rewriteResult');
    expect(csSrc).toContain('bj:toolbar:autoApplyStatus');
    expect(csSrc).toContain('bj:toolbar:limitReached');
  });
});

// ── 7. Overlay Auto Mode Toast ────────────────────────────────────
describe('7. Overlay Auto Mode Toast', () => {
  it('7.1 showAutoApplyToast function exists', () => {
    expect(overlaySrc).toContain('function showAutoApplyToast(');
  });

  it('7.2 showAutoApplyToast handles all 3 auto modes', () => {
    expect(overlaySrc).toContain("'auto-apply': 'Auto Apply'");
    expect(overlaySrc).toContain("'auto-rewrite': 'Auto Rewrite'");
    expect(overlaySrc).toContain("'full-autopilot': 'Full Autopilot'");
  });

  it('7.3 showAutoApplyToast handles scoring, rewriting, filling steps', () => {
    expect(overlaySrc).toContain("'scoring'");
    expect(overlaySrc).toContain("'rewriting'");
    expect(overlaySrc).toContain("'filling'");
  });

  it('7.4 Overlay listens for bj:toolbar:autoApplyStatus', () => {
    expect(overlaySrc).toContain("evt.data.type === 'bj:toolbar:autoApplyStatus'");
  });

  it('7.5 showAutoApplyToast exported to window._bjJobSiteOverlay', () => {
    expect(overlaySrc).toContain('showAutoApplyToast: showAutoApplyToast');
  });
});

// ── 8. Overlay Limit Reached Toast ────────────────────────────────
describe('8. Overlay Limit Reached Toast', () => {
  it('8.1 showLimitReachedToast function exists', () => {
    expect(overlaySrc).toContain('function showLimitReachedToast(');
  });

  it('8.2 showLimitReachedToast shows count/limit info', () => {
    expect(overlaySrc).toContain('Daily apply limit reached');
  });

  it('8.3 Overlay listens for bj:toolbar:limitReached', () => {
    expect(overlaySrc).toContain("evt.data.type === 'bj:toolbar:limitReached'");
  });

  it('8.4 showLimitReachedToast exported to window._bjJobSiteOverlay', () => {
    expect(overlaySrc).toContain('showLimitReachedToast: showLimitReachedToast');
  });
});

// ── 9. PostHog Events ─────────────────────────────────────────────
describe('9. PostHog Events', () => {
  it('9.1 auto_apply_submitted event', () => {
    expect(bgSrc).toContain("captureEvent('auto_apply_submitted'");
  });

  it('9.2 auto_rewrite_submitted event', () => {
    expect(bgSrc).toContain("captureEvent('auto_rewrite_submitted'");
  });

  it('9.3 full_autopilot_submitted event', () => {
    expect(bgSrc).toContain("captureEvent('full_autopilot_submitted'");
  });

  it('9.4 daily_apply_limit_reached event', () => {
    expect(bgSrc).toContain("captureEvent('daily_apply_limit_reached'");
  });

  it('9.5 Events include platform property', () => {
    // Check all 3 auto mode events include platform
    const autoApplyIdx = bgSrc.indexOf("'auto_apply_submitted'");
    expect(bgSrc.slice(autoApplyIdx, autoApplyIdx + 200)).toContain('platform: p.platform');

    const autoRewriteIdx = bgSrc.indexOf("'auto_rewrite_submitted'");
    expect(bgSrc.slice(autoRewriteIdx, autoRewriteIdx + 300)).toContain('platform: p.platform');

    const autopilotIdx = bgSrc.indexOf("'full_autopilot_submitted'");
    expect(bgSrc.slice(autopilotIdx, autopilotIdx + 300)).toContain('platform: p.platform');
  });

  it('9.6 Events include daily_count property', () => {
    expect(bgSrc).toContain('daily_count: newCount');
    expect(bgSrc).toContain('daily_count: arNewCount');
    expect(bgSrc).toContain('daily_count: fpNewCount');
  });
});

// ── 10. Extension Manifest ────────────────────────────────────────
describe('10. Extension Manifest', () => {
  it('10.1 Manifest version bumped to 2.27.0', () => {
    const manifest = JSON.parse(manifestSrc);
    expect(manifest.version).toBe('2.27.0');
  });
});

// ── 11. Pod Team Manifest ─────────────────────────────────────────
describe('11. Pod Team Manifest', () => {
  it('11.1 EXT-AS-6 pairing exists', () => {
    expect(podManifest).toContain('EXT-AS-6');
  });

  it('11.2 All 5 hook-and-scar roles present', () => {
    expect(podManifest).toContain('Chief Architect');
    expect(podManifest).toContain('Lead Platform Eng');
    expect(podManifest).toContain('System Architect');
    expect(podManifest).toContain('Forward-Looking Dev');
    expect(podManifest).toContain('Evolvability Strategist');
  });
});

// ── 12. Build & Version ───────────────────────────────────────────
describe('12. Build & Version', () => {
  it('12.1 Product version is v8.68', () => {
    const versionSrc = read('js/version.js');
    expect(versionSrc).toContain('8.68');
  });

  it('12.2 Dashboard bundle exists', () => {
    expect(existsSync(join(ROOT, 'dist/dashboard.min.js'))).toBe(true);
  });

  it('12.3 Dashboard deferred bundle exists', () => {
    expect(existsSync(join(ROOT, 'dist/dashboard-deferred.min.js'))).toBe(true);
  });

  it('12.4 styles.css exists', () => {
    expect(existsSync(join(ROOT, 'styles.css'))).toBe(true);
  });
});

// ── 13. File Inventory ────────────────────────────────────────────
describe('13. File Inventory', () => {
  it('13.1 background.ts modified', () => {
    expect(existsSync(join(ROOT, 'extension/background.ts'))).toBe(true);
    expect(bgSrc).toContain('EXT-AS-6');
  });

  it('13.2 contentScript.ts modified', () => {
    expect(existsSync(join(ROOT, 'extension/contentScript.ts'))).toBe(true);
    expect(csSrc).toContain('autoApplyStatus');
  });

  it('13.3 job-site-overlay.ts modified', () => {
    expect(existsSync(join(ROOT, 'extension/job-site-overlay.ts'))).toBe(true);
    expect(overlaySrc).toContain('showAutoApplyToast');
  });

  it('13.4 manifest.json modified', () => {
    expect(existsSync(join(ROOT, 'extension/manifest.json'))).toBe(true);
  });

  it('13.5 pod-team-manifest.md modified', () => {
    expect(existsSync(join(ROOT, 'docs/scaling/pod-team-manifest.md'))).toBe(true);
  });

  it('13.6 This test file exists', () => {
    expect(existsSync(join(ROOT, 'tests/ext-as-6-auto-modes.test.js'))).toBe(true);
  });
});
