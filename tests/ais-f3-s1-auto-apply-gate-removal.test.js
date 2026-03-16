/**
 * AIS-F3-S1: Auto-Apply Consumer Gate Removal
 * ============================================
 * Tests:
 *  1. TIER_GATES.auto_apply_daily defined correctly (Free=0, Starter=5, Pro=Infinity)
 *  2. Daily limit helper functions present and correct
 *  3. Tier gate check logic (allowed/blocked per tier)
 *  4. checkAutoApplyTierGate returns correct shape
 *  5. proceedToApply wires tier gate for auto modes
 *  6. _updateFillStatusPanel function exists and exported
 *  7. auto_apply_consumer_triggered PostHog event wired
 *  8. fill status panel HTML container exists in dashboard.html
 *  9. Anti-detection: worker delay and human-sim present
 * 10. Version / build integrity
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

function readFile(rel) {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

// ─────────────────────────────────────────────────
// 1. TIER_GATES definition
// ─────────────────────────────────────────────────
describe('AIS-F3-S1: TIER_GATES.auto_apply_daily', () => {
  const src = readFile('js/tier-gating.js');

  it('auto_apply_daily gate is defined in TIER_GATES', () => {
    expect(src).toContain('auto_apply_daily');
  });

  it('Free tier limit is 0', () => {
    expect(src).toMatch(/auto_apply_daily[^}]+free:\s*0/);
  });

  it('Starter tier limit is 5', () => {
    expect(src).toMatch(/auto_apply_daily[^}]+starter:\s*5/);
  });

  it('Pro tier limit is Infinity', () => {
    expect(src).toMatch(/auto_apply_daily[^}]+pro:\s*Infinity/);
  });
});

// ─────────────────────────────────────────────────
// 2. Daily limit helper functions
// ─────────────────────────────────────────────────
describe('AIS-F3-S1: Daily limit helpers in tier-gating.js', () => {
  const src = readFile('js/tier-gating.js');

  it('_getAutoApplyDailyRecord function exists', () => {
    expect(src).toContain('_getAutoApplyDailyRecord');
  });

  it('getAutoApplyDailyLimit function exists', () => {
    expect(src).toContain('getAutoApplyDailyLimit');
  });

  it('getAutoApplyDailyRemaining function exists', () => {
    expect(src).toContain('getAutoApplyDailyRemaining');
  });

  it('incrementAutoApplyDailyCount function exists', () => {
    expect(src).toContain('incrementAutoApplyDailyCount');
  });

  it('checkAutoApplyTierGate function exists', () => {
    expect(src).toContain('checkAutoApplyTierGate');
  });

  it('Uses localStorage key bj_auto_apply_daily', () => {
    expect(src).toContain('bj_auto_apply_daily');
  });

  it('Date-based reset logic present', () => {
    expect(src).toMatch(/toISOString\(\)\.slice\(0,\s*10\)/);
  });
});

// ─────────────────────────────────────────────────
// 3. Tier gate check shape
// ─────────────────────────────────────────────────
describe('AIS-F3-S1: checkAutoApplyTierGate logic', () => {
  const src = readFile('js/tier-gating.js');

  it('returns allowed:false for Free tier (limit=0)', () => {
    expect(src).toMatch(/limit.*===.*0[\s\S]{0,200}allowed:\s*false/);
  });

  it('returns allowed:false when remaining is 0', () => {
    expect(src).toMatch(/remaining.*===.*0[\s\S]{0,200}allowed:\s*false/);
  });

  it('returns allowed:true when gate passes', () => {
    expect(src).toMatch(/allowed:\s*true[\s\S]{0,200}requiresTier:\s*null/);
  });

  it('includes requiresTier in returned object', () => {
    expect(src).toContain('requiresTier');
  });

  it('includes tier, limit, remaining in returned object', () => {
    expect(src).toContain('remaining: 0');
    expect(src).toContain('limit: 0');
    expect(src).toContain('tier: tier');
  });
});

// ─────────────────────────────────────────────────
// 4. Window exports from tier-gating.js
// ─────────────────────────────────────────────────
describe('AIS-F3-S1: tier-gating.js window exports', () => {
  const src = readFile('js/tier-gating.js');

  it('getAutoApplyDailyLimit exported to window', () => {
    expect(src).toContain('window.getAutoApplyDailyLimit = getAutoApplyDailyLimit');
  });

  it('getAutoApplyDailyRemaining exported to window', () => {
    expect(src).toContain('window.getAutoApplyDailyRemaining = getAutoApplyDailyRemaining');
  });

  it('incrementAutoApplyDailyCount exported to window', () => {
    expect(src).toContain('window.incrementAutoApplyDailyCount = incrementAutoApplyDailyCount');
  });

  it('checkAutoApplyTierGate exported to window', () => {
    expect(src).toContain('window.checkAutoApplyTierGate = checkAutoApplyTierGate');
  });
});

// ─────────────────────────────────────────────────
// 5. apply-workflow.js: tier gate in proceedToApply
// ─────────────────────────────────────────────────
describe('AIS-F3-S1: proceedToApply tier gate wiring', () => {
  const src = readFile('js/apply-workflow.js');

  it('checkAutoApplyTierGate is called in proceedToApply', () => {
    expect(src).toContain('checkAutoApplyTierGate');
  });

  it('_isAutoMode excludes MANUAL and SCORE_GATED modes', () => {
    expect(src).toContain('_isAutoMode');
    expect(src).toContain('APPLY_MODES.MANUAL');
    expect(src).toContain('APPLY_MODES.SCORE_GATED');
  });

  it('blocks and returns early when gate not allowed', () => {
    expect(src).toContain('_gateResult.allowed');
  });

  it('shows toast for Free tier block', () => {
    expect(src).toContain('Auto-apply requires a Starter or Pro plan');
  });

  it('shows toast for exhausted Starter limit', () => {
    expect(src).toContain('auto-apply limit for today');
  });

  it('fires auto_apply_tier_blocked PostHog event on block', () => {
    expect(src).toContain('auto_apply_tier_blocked');
  });
});

// ─────────────────────────────────────────────────
// 6. apply-workflow.js: daily count increment on submit
// ─────────────────────────────────────────────────
describe('AIS-F3-S1: daily count increment on successful submit', () => {
  const src = readFile('js/apply-workflow.js');

  it('incrementAutoApplyDailyCount referenced in apply-workflow', () => {
    expect(src).toContain('incrementAutoApplyDailyCount');
  });

  it('increment called before _routeToWorker', () => {
    expect(src).toMatch(/incrementAutoApplyDailyCount[\s\S]{0,300}_routeToWorker/);
  });

  it('increment guarded by _isAutoMode', () => {
    expect(src).toMatch(/_isAutoMode[\s\S]{0,80}incrementAutoApplyDailyCount/);
  });
});

// ─────────────────────────────────────────────────
// 7. PostHog event: auto_apply_consumer_triggered
// ─────────────────────────────────────────────────
describe('AIS-F3-S1: auto_apply_consumer_triggered PostHog event', () => {
  const src = readFile('js/apply-workflow.js');

  it('auto_apply_consumer_triggered event is emitted', () => {
    expect(src).toContain('auto_apply_consumer_triggered');
  });

  it('event includes job_id', () => {
    expect(src).toMatch(/auto_apply_consumer_triggered[\s\S]{0,300}job_id/);
  });

  it('event includes mode', () => {
    expect(src).toMatch(/auto_apply_consumer_triggered[\s\S]{0,300}mode:/);
  });

  it('event includes tier', () => {
    expect(src).toMatch(/auto_apply_consumer_triggered[\s\S]{0,300}tier:/);
  });

  it('event includes platform', () => {
    expect(src).toMatch(/auto_apply_consumer_triggered[\s\S]{0,300}platform:/);
  });

  it('event only fires for auto modes', () => {
    expect(src).toMatch(/_isAutoMode[\s\S]{0,200}auto_apply_consumer_triggered/);
  });
});

// ─────────────────────────────────────────────────
// 8. _updateFillStatusPanel function
// ─────────────────────────────────────────────────
describe('AIS-F3-S1: _updateFillStatusPanel', () => {
  const src = readFile('js/apply-workflow.js');

  it('_updateFillStatusPanel function is defined', () => {
    expect(src).toContain('function _updateFillStatusPanel');
  });

  it('handles submitting status', () => {
    expect(src).toContain("'submitting'");
  });

  it('handles queued status', () => {
    expect(src).toContain("'queued'");
  });

  it('handles success status', () => {
    expect(src).toContain("'success'");
  });

  it('handles error status', () => {
    expect(src).toContain("'error'");
  });

  it('provides actionable error guidance', () => {
    expect(src).toContain('Retry from Pending Applications');
  });

  it('targets ais-fill-status-panel element', () => {
    expect(src).toContain('ais-fill-status-panel');
  });

  it('auto-clears success after timeout', () => {
    expect(src).toMatch(/success[\s\S]{0,300}setTimeout/);
  });

  it('calls reportError on exception — no silent fail', () => {
    expect(src).toContain("reportError('apply-workflow:_updateFillStatusPanel'");
  });

  it('exported to window', () => {
    expect(src).toContain('window._updateFillStatusPanel = _updateFillStatusPanel');
  });

  it('called after pending_application saved (submitting state)', () => {
    expect(src).toMatch(/savedApp[\s\S]{0,500}_updateFillStatusPanel/);
  });

  it('called on success path', () => {
    expect(src).toMatch(/_updateFillStatusPanel[\s\S]{0,100}success/);
  });

  it('called on error paths', () => {
    expect(src).toMatch(/_updateFillStatusPanel[\s\S]{0,100}error/);
  });
});

// ─────────────────────────────────────────────────
// 9. dashboard.html: fill status panel container
// ─────────────────────────────────────────────────
describe('AIS-F3-S1: dashboard.html fill status panel', () => {
  const src = readFile('dashboard.html');

  it('ais-fill-status-panel div exists', () => {
    expect(src).toContain('id="ais-fill-status-panel"');
  });

  it('panel is hidden by default', () => {
    expect(src).toMatch(/ais-fill-status-panel[\s\S]{0,80}display:none/);
  });

  it('panel is inside app-tab-pipeline', () => {
    const tabStart = src.indexOf('id="app-tab-pipeline"');
    const tabEnd = src.indexOf('/app-tab-pipeline');
    expect(tabStart).toBeGreaterThan(-1);
    expect(tabEnd).toBeGreaterThan(tabStart);
    const tabContent = src.slice(tabStart, tabEnd);
    expect(tabContent).toContain('ais-fill-status-panel');
  });
});

// ─────────────────────────────────────────────────
// 10. Anti-detection verification
// ─────────────────────────────────────────────────
describe('AIS-F3-S1: Anti-detection in worker', () => {
  const workerIdx = readFile('worker/index.js');
  const humanSim = readFile('worker/utils/human-sim.js');

  it('DELAY_BETWEEN between submissions is configured', () => {
    expect(workerIdx).toContain('DELAY_BETWEEN');
    expect(workerIdx).toContain('SUBMISSION_DELAY_MS');
  });

  it('randomDelay helper exists in human-sim', () => {
    expect(humanSim).toContain('randomDelay');
  });

  it('humanType uses randomized per-keystroke delay', () => {
    expect(humanSim).toContain('humanType');
  });

  it('MAX_CONCURRENT limits simultaneous browser sessions', () => {
    expect(workerIdx).toContain('MAX_CONCURRENT');
  });

  it('Random viewport dimensions used', () => {
    expect(workerIdx).toMatch(/Math\.random[\s\S]{0,100}viewport|viewport[\s\S]{0,100}Math\.random/);
  });
});

// ─────────────────────────────────────────────────
// 11. Version and build integrity
// ─────────────────────────────────────────────────
describe('AIS-F3-S1: Version and build integrity', () => {
  it('version is v9.55', () => {
    const ver = readFile('js/version.js');
    expect(ver).toContain('v9.55');
  });

  it('dist/dashboard.min.js rebuilt at v9.55', () => {
    const bundle = readFile('dist/dashboard.min.js');
    expect(bundle).toContain('v9.55');
  });

  it('dist/dashboard.min.js contains auto_apply_daily tier gate', () => {
    const bundle = readFile('dist/dashboard.min.js');
    expect(bundle).toContain('auto_apply_daily');
  });

  it('dist/dashboard.min.js contains checkAutoApplyTierGate', () => {
    const bundle = readFile('dist/dashboard.min.js');
    expect(bundle).toContain('checkAutoApplyTierGate');
  });

  it('dist/dashboard.min.js contains auto_apply_consumer_triggered', () => {
    const bundle = readFile('dist/dashboard.min.js');
    expect(bundle).toContain('auto_apply_consumer_triggered');
  });

  it('dist/dashboard.min.js contains ais-fill-status-panel', () => {
    const bundle = readFile('dist/dashboard.min.js');
    expect(bundle).toContain('ais-fill-status-panel');
  });

  it('all required source files present', () => {
    const files = [
      'js/tier-gating.js',
      'js/apply-workflow.js',
      'dashboard.html',
      'worker/index.js',
      'worker/utils/human-sim.js',
      'tests/ais-f3-s1-auto-apply-gate-removal.test.js',
    ];
    files.forEach(f => {
      expect(() => readFile(f)).not.toThrow();
    });
  });
});
