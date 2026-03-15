// AIS-F3-S1 — Auto-Apply Consumer Gate Removal
// Tests: tier gate, daily limits, fill status panel, PostHog event, anti-detection

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

const tierGatingSource  = readFileSync(resolve(ROOT, 'js/tier-gating.js'), 'utf8');
const applyWorkflowSource = readFileSync(resolve(ROOT, 'js/apply-workflow.js'), 'utf8');
const dashboardHtml     = readFileSync(resolve(ROOT, 'dashboard.html'), 'utf8');
const dashboardBundle   = readFileSync(resolve(ROOT, 'dist/dashboard.min.js'), 'utf8');
const deferredBundle    = readFileSync(resolve(ROOT, 'dist/dashboard-deferred.min.js'), 'utf8');

// ─── Section 1: Tier Gate Definition ────────────────────────────────────────
describe('Section 1: auto_apply_daily tier gate definition', () => {
  it('TIER_GATES contains auto_apply_daily entry', () => {
    expect(tierGatingSource).toContain('auto_apply_daily');
  });

  it('Free tier limit is 0', () => {
    expect(tierGatingSource).toMatch(/auto_apply_daily[\s\S]*?free:\s*0/);
  });

  it('Starter tier limit is 5', () => {
    expect(tierGatingSource).toMatch(/auto_apply_daily[\s\S]*?starter:\s*5/);
  });

  it('Pro tier limit is Infinity', () => {
    expect(tierGatingSource).toMatch(/auto_apply_daily[\s\S]*?pro:\s*Infinity/);
  });

  it('AIS-F3-S1 comment present in tier-gating.js', () => {
    expect(tierGatingSource).toContain('AIS-F3-S1');
  });
});

// ─── Section 2: Daily Limit Helper Functions ─────────────────────────────────
describe('Section 2: daily limit helper functions', () => {
  it('getAutoApplyDailyLimit function defined', () => {
    expect(tierGatingSource).toContain('function getAutoApplyDailyLimit');
  });

  it('getAutoApplyDailyRemaining function defined', () => {
    expect(tierGatingSource).toContain('function getAutoApplyDailyRemaining');
  });

  it('incrementAutoApplyDailyCount function defined', () => {
    expect(tierGatingSource).toContain('function incrementAutoApplyDailyCount');
  });

  it('checkAutoApplyTierGate function defined', () => {
    expect(tierGatingSource).toContain('function checkAutoApplyTierGate');
  });

  it('checkAutoApplyTierGate returns allowed:false for limit=0', () => {
    expect(tierGatingSource).toContain("allowed: false, tier: tier, limit: 0, remaining: 0, requiresTier: 'starter'");
  });

  it('checkAutoApplyTierGate returns allowed:true when remaining > 0', () => {
    expect(tierGatingSource).toContain("allowed: true, tier: tier, limit: limit, remaining: remaining, requiresTier: null");
  });

  it('daily record uses localStorage key bj_auto_apply_daily', () => {
    expect(tierGatingSource).toContain("'bj_auto_apply_daily'");
  });

  it('daily record resets when date changes', () => {
    expect(tierGatingSource).toContain("rec.date !== today");
  });
});

// ─── Section 3: Window Exports from tier-gating.js ──────────────────────────
describe('Section 3: window exports for new functions', () => {
  it('getAutoApplyDailyLimit exported to window', () => {
    expect(tierGatingSource).toContain('window.getAutoApplyDailyLimit = getAutoApplyDailyLimit');
  });

  it('getAutoApplyDailyRemaining exported to window', () => {
    expect(tierGatingSource).toContain('window.getAutoApplyDailyRemaining = getAutoApplyDailyRemaining');
  });

  it('incrementAutoApplyDailyCount exported to window', () => {
    expect(tierGatingSource).toContain('window.incrementAutoApplyDailyCount = incrementAutoApplyDailyCount');
  });

  it('checkAutoApplyTierGate exported to window', () => {
    expect(tierGatingSource).toContain('window.checkAutoApplyTierGate = checkAutoApplyTierGate');
  });
});

// ─── Section 4: Gate Check in proceedToApply ────────────────────────────────
describe('Section 4: tier gate check wired in proceedToApply', () => {
  it('checkAutoApplyTierGate called in proceedToApply', () => {
    expect(applyWorkflowSource).toContain('checkAutoApplyTierGate()');
  });

  it('_isAutoMode flag computed before gate check', () => {
    expect(applyWorkflowSource).toContain('_isAutoMode');
  });

  it('manual and score_gated modes bypass gate', () => {
    expect(applyWorkflowSource).toContain('mode !== APPLY_MODES.MANUAL && mode !== APPLY_MODES.SCORE_GATED');
  });

  it('gate block shows toast to user', () => {
    expect(applyWorkflowSource).toContain('showToast(_gateMsg');
  });

  it('gate block returns early without submitting', () => {
    // Checks the gate block contains _applySubmitting = false; return;
    expect(applyWorkflowSource).toMatch(/checkAutoApplyTierGate[\s\S]{0,500}_applySubmitting = false;\s*return;/);
  });

  it('tier-blocked event fired to PostHog', () => {
    expect(applyWorkflowSource).toContain("'auto_apply_tier_blocked'");
  });

  it('upgrade message shown for Free users (limit=0)', () => {
    expect(applyWorkflowSource).toContain('Auto-apply requires a Starter or Pro plan.');
  });

  it('daily limit exhaustion message shown', () => {
    expect(applyWorkflowSource).toContain("You've reached your");
  });
});

// ─── Section 5: PostHog auto_apply_consumer_triggered event ─────────────────
describe('Section 5: PostHog auto_apply_consumer_triggered event', () => {
  it('event name present in apply-workflow.js', () => {
    expect(applyWorkflowSource).toContain("'auto_apply_consumer_triggered'");
  });

  it('event includes job_id property', () => {
    expect(applyWorkflowSource).toMatch(/auto_apply_consumer_triggered[\s\S]{0,200}job_id:/);
  });

  it('event includes mode property', () => {
    expect(applyWorkflowSource).toMatch(/auto_apply_consumer_triggered[\s\S]{0,200}mode:/);
  });

  it('event includes tier property', () => {
    expect(applyWorkflowSource).toMatch(/auto_apply_consumer_triggered[\s\S]{0,200}tier:/);
  });

  it('event includes platform property', () => {
    expect(applyWorkflowSource).toMatch(/auto_apply_consumer_triggered[\s\S]{0,200}platform:/);
  });

  it('event only fires for auto modes (_isAutoMode guard)', () => {
    expect(applyWorkflowSource).toMatch(/_isAutoMode[\s\S]{0,100}auto_apply_consumer_triggered/);
  });
});

// ─── Section 6: Fill Status Panel Function ──────────────────────────────────
describe('Section 6: _updateFillStatusPanel function', () => {
  it('_updateFillStatusPanel defined in apply-workflow.js', () => {
    expect(applyWorkflowSource).toContain('function _updateFillStatusPanel');
  });

  it('targets ais-fill-status-panel element', () => {
    expect(applyWorkflowSource).toContain("'ais-fill-status-panel'");
  });

  it('handles submitting status', () => {
    expect(applyWorkflowSource).toContain("submitting:");
  });

  it('handles queued status', () => {
    expect(applyWorkflowSource).toContain("queued:");
  });

  it('handles success status', () => {
    expect(applyWorkflowSource).toContain("success:");
  });

  it('handles error status', () => {
    expect(applyWorkflowSource).toContain("error:");
  });

  it('error status shows actionable guidance to user', () => {
    expect(applyWorkflowSource).toContain("opts.action");
  });

  it('error status links to View Pending', () => {
    expect(applyWorkflowSource).toContain('View Pending');
  });

  it('success links to View in Pipeline', () => {
    expect(applyWorkflowSource).toContain('View in Pipeline');
  });

  it('success auto-clears after 8 seconds', () => {
    expect(applyWorkflowSource).toContain('8000');
  });

  it('calls refreshIcons after injecting Lucide icons', () => {
    expect(applyWorkflowSource).toMatch(/refreshIcons[\s\S]{0,100}ais-fill-status-panel|ais-fill-status-panel[\s\S]{0,300}refreshIcons/);
  });

  it('wrapped in try/catch with reportError', () => {
    expect(applyWorkflowSource).toContain("reportError('apply-workflow:_updateFillStatusPanel'");
  });

  it('exported to window', () => {
    expect(applyWorkflowSource).toContain('window._updateFillStatusPanel = _updateFillStatusPanel');
  });
});

// ─── Section 7: Fill Status Panel called at all result paths ─────────────────
describe('Section 7: fill status panel wired at result paths', () => {
  it('called with status:submitting after pending app created', () => {
    expect(applyWorkflowSource).toContain("status: 'submitting'");
  });

  it('called with status:success on Recruitee success', () => {
    expect(applyWorkflowSource).toContain("status: 'success'");
  });

  it('called with status:error on rejected', () => {
    expect(applyWorkflowSource).toContain("status: 'error'");
  });

  it('called with status:queued on worker route', () => {
    expect(applyWorkflowSource).toContain("status: 'queued'");
  });

  it('incrementAutoApplyDailyCount called on Recruitee success', () => {
    expect(applyWorkflowSource).toContain("incrementAutoApplyDailyCount");
  });

  it('incrementAutoApplyDailyCount called on worker route', () => {
    // Should appear at least twice (Recruitee success + worker route)
    const matches = applyWorkflowSource.match(/incrementAutoApplyDailyCount/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Section 8: dashboard.html Fill Status Panel Container ───────────────────
describe('Section 8: dashboard.html fill status panel container', () => {
  it('ais-fill-status-panel div exists in dashboard.html', () => {
    expect(dashboardHtml).toContain('id="ais-fill-status-panel"');
  });

  it('panel is inside app-tab-pipeline', () => {
    const pipelineStart = dashboardHtml.indexOf('id="app-tab-pipeline"');
    const panelPos = dashboardHtml.indexOf('id="ais-fill-status-panel"');
    expect(pipelineStart).toBeGreaterThan(-1);
    expect(panelPos).toBeGreaterThan(pipelineStart);
  });

  it('panel is hidden by default (display:none)', () => {
    expect(dashboardHtml).toMatch(/ais-fill-status-panel[^>]*display:none/);
  });

  it('AIS-F3-S1 comment present in dashboard.html', () => {
    expect(dashboardHtml).toContain('AIS-F3-S1');
  });
});

// ─── Section 9: Anti-Detection Verification ──────────────────────────────────
describe('Section 9: anti-detection settings verified', () => {
  const humanSimSource = readFileSync(resolve(ROOT, 'worker/utils/human-sim.js'), 'utf8');
  const workerIndex    = readFileSync(resolve(ROOT, 'worker/index.js'), 'utf8');

  it('randomDelay function exists in human-sim.js', () => {
    expect(humanSimSource).toContain('function randomDelay');
  });

  it('humanType uses per-keystroke delay', () => {
    expect(humanSimSource).toContain('randomDelay');
  });

  it('worker uses DELAY_BETWEEN between submissions', () => {
    expect(workerIndex).toContain('DELAY_BETWEEN');
  });

  it('DELAY_BETWEEN defaults to at least 30s (30000ms)', () => {
    expect(workerIndex).toContain("'30000'");
  });

  it('worker respects MAX_CONCURRENT limit', () => {
    expect(workerIndex).toContain('MAX_CONCURRENT');
  });

  it('random viewport dimensions used per session', () => {
    expect(workerIndex).toContain('Math.random()');
  });

  it('user agent rotation active', () => {
    expect(workerIndex).toContain('agents[Math.floor');
  });
});

// ─── Section 10: Build Output ────────────────────────────────────────────────
describe('Section 10: build output', () => {
  it('auto_apply_daily in dashboard bundle', () => {
    expect(dashboardBundle).toContain('auto_apply_daily');
  });

  it('checkAutoApplyTierGate in deferred bundle', () => {
    // tier-gating is in shell bundle
    expect(dashboardBundle).toContain('checkAutoApplyTierGate');
  });

  it('auto_apply_consumer_triggered in deferred bundle', () => {
    expect(deferredBundle).toContain('auto_apply_consumer_triggered');
  });

  it('ais-fill-status-panel string in deferred bundle', () => {
    expect(deferredBundle).toContain('ais-fill-status-panel');
  });

  it('bj_auto_apply_daily key in dashboard bundle', () => {
    expect(dashboardBundle).toContain('bj_auto_apply_daily');
  });
});

// ─── Section 11: No Silent Fails ─────────────────────────────────────────────
describe('Section 11: no silent fails', () => {
  it('_updateFillStatusPanel catch uses reportError', () => {
    expect(applyWorkflowSource).toContain("reportError('apply-workflow:_updateFillStatusPanel'");
  });

  it('tier gate block fires PostHog event (never silent)', () => {
    expect(applyWorkflowSource).toContain("'auto_apply_tier_blocked'");
  });

  it('no empty catch blocks introduced in tier-gating.js changes', () => {
    // Check the new section for empty catches
    const newSection = tierGatingSource.slice(tierGatingSource.indexOf('AIS-F3-S1'));
    expect(newSection).not.toMatch(/catch\s*\(\w+\)\s*\{\s*\}/);
  });
});

// ─── Section 12: File Inventory ──────────────────────────────────────────────
describe('Section 12: file inventory', () => {
  it('js/tier-gating.js exists and has content', () => {
    expect(tierGatingSource.length).toBeGreaterThan(1000);
  });

  it('js/apply-workflow.js exists and has content', () => {
    expect(applyWorkflowSource.length).toBeGreaterThan(1000);
  });

  it('test file itself exists', () => {
    const testSource = readFileSync(resolve(ROOT, 'tests/ais-f3-s1-auto-apply-gate.test.js'), 'utf8');
    expect(testSource.length).toBeGreaterThan(100);
  });
});
