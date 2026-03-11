/**
 * AF-003: Job Feed Apply Mode Routing — Validation Tests
 * 
 * Validates that the feed Apply button routes through mode-based logic
 * instead of always opening the external ATS URL directly.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

const REPO = process.cwd();

function read(f) { return readFileSync(`${REPO}/${f}`, 'utf8'); }

describe('AF-003: Job Feed Apply Mode Routing', () => {

  // ═══════════════════════════════════════════════════════════
  // 1. handleFeedApply function exists in apply-workflow.js
  // ═══════════════════════════════════════════════════════════
  describe('1. handleFeedApply function', () => {
    const src = read('js/apply-workflow.js');

    it('handleFeedApply function defined', () => {
      expect(src).toContain('async function handleFeedApply(');
    });

    it('checks isSetupComplete gate', () => {
      const fnBody = src.substring(src.indexOf('async function handleFeedApply('));
      expect(fnBody).toContain('isSetupComplete()');
      expect(fnBody).toContain('showSetupGateModal()');
    });

    it('reads applicationMode via getApplyModeForJob', () => {
      const fnBody = src.substring(src.indexOf('async function handleFeedApply('));
      expect(fnBody).toContain('getApplyModeForJob(');
    });

    it('handles all 6 APPLY_MODES', () => {
      const fnBody = src.substring(src.indexOf('async function handleFeedApply('));
      expect(fnBody).toContain('APPLY_MODES.MANUAL');
      expect(fnBody).toContain('APPLY_MODES.SCORE_GATED');
      expect(fnBody).toContain('APPLY_MODES.AUTO');
      expect(fnBody).toContain('APPLY_MODES.SCORE_GATED_AUTO');
      expect(fnBody).toContain('APPLY_MODES.AUTO_REWRITE');
      expect(fnBody).toContain('APPLY_MODES.AUTOPILOT');
    });

    it('manual mode opens external URL', () => {
      const fnBody = src.substring(src.indexOf('async function handleFeedApply('));
      expect(fnBody).toContain("window.open(jobUrl");
    });

    it('score-gated mode calls scoreAndRecheck or shows score gate', () => {
      const fnBody = src.substring(src.indexOf('async function handleFeedApply('));
      expect(fnBody).toContain('scoreAndRecheck(');
      expect(fnBody).toContain('showScoreGateModal(');
    });

    it('auto mode calls proceedToApply directly', () => {
      const fnBody = src.substring(src.indexOf('async function handleFeedApply('));
      expect(fnBody).toContain('proceedToApply(');
    });

    it('score_gated_auto uses _scoreAndAutoRoute', () => {
      const fnBody = src.substring(src.indexOf('async function handleFeedApply('));
      expect(fnBody).toContain('_scoreAndAutoRoute(');
    });

    it('auto_rewrite triggers rewrite flow', () => {
      const fnBody = src.substring(src.indexOf('async function handleFeedApply('));
      expect(fnBody).toContain('triggerRewrite(');
    });

    it('autopilot mode calls proceedToApply', () => {
      const fnBody = src.substring(src.indexOf('async function handleFeedApply('));
      // Find the AUTOPILOT block specifically
      const autopilotIdx = fnBody.indexOf('APPLY_MODES.AUTOPILOT');
      expect(autopilotIdx).toBeGreaterThan(-1);
      const afterAutopilot = fnBody.substring(autopilotIdx, autopilotIdx + 300);
      expect(afterAutopilot).toContain('proceedToApply(');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. _scoreAndAutoRoute function
  // ═══════════════════════════════════════════════════════════
  describe('2. _scoreAndAutoRoute function', () => {
    const src = read('js/apply-workflow.js');

    it('_scoreAndAutoRoute function defined', () => {
      expect(src).toContain('async function _scoreAndAutoRoute(');
    });

    it('checks entitlement for scoring', () => {
      const fnBody = src.substring(src.indexOf('async function _scoreAndAutoRoute('));
      expect(fnBody).toContain("checkEntitlement('resume_grading'");
    });

    it('calls score-resume EF', () => {
      const fnBody = src.substring(src.indexOf('async function _scoreAndAutoRoute('));
      expect(fnBody).toContain("'/functions/v1/score-resume'");
    });

    it('auto-routes when above threshold', () => {
      const fnBody = src.substring(src.indexOf('async function _scoreAndAutoRoute('));
      expect(fnBody).toContain('score >= threshold');
      expect(fnBody).toContain('proceedToApply(');
    });

    it('shows score gate when below threshold', () => {
      const fnBody = src.substring(src.indexOf('async function _scoreAndAutoRoute('));
      expect(fnBody).toContain('showScoreGateModal(');
    });

    it('caches score result in jobMatchScores', () => {
      const fnBody = src.substring(src.indexOf('async function _scoreAndAutoRoute('));
      expect(fnBody).toContain('jobMatchScores[jobId] = data');
    });

    it('has error handling with reportError', () => {
      const fnBody = src.substring(src.indexOf('async function _scoreAndAutoRoute('));
      expect(fnBody).toContain("reportError('apply-workflow:_scoreAndAutoRoute'");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. PostHog tracking
  // ═══════════════════════════════════════════════════════════
  describe('3. PostHog events', () => {
    const src = read('js/apply-workflow.js');

    it('feed_apply_initiated event', () => {
      expect(src).toContain("'feed_apply_initiated'");
    });

    it('feed_apply_complete event', () => {
      expect(src).toContain("'feed_apply_complete'");
    });

    it('_trackFeedApplyComplete helper exists', () => {
      expect(src).toContain('function _trackFeedApplyComplete(');
    });

    it('tracks mode and outcome in events', () => {
      const fnBody = src.substring(src.indexOf('function _trackFeedApplyComplete('));
      expect(fnBody).toContain('mode: mode');
      expect(fnBody).toContain('outcome: outcome');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. applyButton routing update (location.js)
  // ═══════════════════════════════════════════════════════════
  describe('4. applyButton routing (location.js)', () => {
    const src = read('js/location.js');

    it('applyButton calls handleFeedApply', () => {
      expect(src).toContain('handleFeedApply(');
    });

    it('passes jobId and jobUrl to handleFeedApply', () => {
      // The onclick should pass jobId, url, and job data
      const applyFn = src.substring(src.indexOf('function applyButton('));
      expect(applyFn).toContain("handleFeedApply('");
    });

    it('passes _feedJobMap data for job context', () => {
      const applyFn = src.substring(src.indexOf('function applyButton('));
      expect(applyFn).toContain('_feedJobMap');
    });

    it('has typeof guard for handleFeedApply', () => {
      const applyFn = src.substring(src.indexOf('function applyButton('));
      expect(applyFn).toContain("typeof handleFeedApply==='function'");
    });

    it('falls back to window.open if handleFeedApply unavailable', () => {
      const applyFn = src.substring(src.indexOf('function applyButton('));
      expect(applyFn).toContain("window.open(");
    });

    it('no longer has direct href to job URL for non-fraud path', () => {
      // The non-fraud return should use href="#" not href="${bestUrl}"
      const applyFn = src.substring(src.indexOf('function applyButton('));
      // Find the AF-003 return line
      const af003Idx = applyFn.indexOf('AF-003');
      const afterAf003 = applyFn.substring(af003Idx);
      const returnLine = afterAf003.substring(0, afterAf003.indexOf('}'));
      expect(returnLine).toContain('href="#"');
    });

    it('fraud interstitial path unchanged', () => {
      const applyFn = src.substring(src.indexOf('function applyButton('));
      expect(applyFn).toContain('showFraudInterstitial');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. Window exports
  // ═══════════════════════════════════════════════════════════
  describe('5. Window exports', () => {
    const src = read('js/apply-workflow.js');

    it('handleFeedApply exported', () => {
      expect(src).toContain('window.handleFeedApply = handleFeedApply');
    });

    it('showScoreGateModal exported', () => {
      expect(src).toContain('window.showScoreGateModal = showScoreGateModal');
    });

    it('closeScoreGateModal exported', () => {
      expect(src).toContain('window.closeScoreGateModal = closeScoreGateModal');
    });

    it('scoreAndRecheck exported', () => {
      expect(src).toContain('window.scoreAndRecheck = scoreAndRecheck');
    });

    it('triggerRewrite exported', () => {
      expect(src).toContain('window.triggerRewrite = triggerRewrite');
    });

    it('proceedToApply exported', () => {
      expect(src).toContain('window.proceedToApply = proceedToApply');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 6. Score gate modal (existing, reused)
  // ═══════════════════════════════════════════════════════════
  describe('6. Score gate modal', () => {
    const src = read('js/apply-workflow.js');

    it('showScoreGateModal function exists', () => {
      expect(src).toContain('function showScoreGateModal(');
    });

    it('score gate modal has Apply Anyway button', () => {
      expect(src).toContain('Apply Anyway');
    });

    it('score gate modal has Rewrite button', () => {
      expect(src).toContain('AI Rewrite');
    });

    it('score gate modal has Score Now button', () => {
      expect(src).toContain('Score Now');
    });

    it('closeScoreGateModal handles threshold update', () => {
      const fn = src.substring(src.indexOf('function closeScoreGateModal('));
      expect(fn).toContain('sg-remember-check');
      expect(fn).toContain('default_score_threshold');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 7. _feedJobMap population (job-feed.js)
  // ═══════════════════════════════════════════════════════════
  describe('7. Feed job data map', () => {
    const src = read('js/job-feed.js');

    it('_feedJobMap populated in renderJobRows', () => {
      expect(src).toContain('window._feedJobMap = {}');
    });

    it('jobs stored by greenhouse_id', () => {
      expect(src).toContain('_feedJobMap[j.greenhouse_id] = j');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 8. Pod team manifest
  // ═══════════════════════════════════════════════════════════
  describe('8. Pod team manifest', () => {
    const manifest = read('docs/scaling/pod-team-manifest.md');

    it('AF-003 pairing present', () => {
      expect(manifest).toContain('AF-003');
    });

    it('Lead Platform Eng assigned to AF-003', () => {
      const af003Line = manifest.split('\n').find(l => l.includes('AF-003'));
      expect(af003Line).toContain('Lead Platform Eng');
    });

    it('Chief Architect as reviewer for AF-003', () => {
      const af003Line = manifest.split('\n').find(l => l.includes('AF-003'));
      expect(af003Line).toContain('Chief Architect');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 9. APPLY_MODES constants
  // ═══════════════════════════════════════════════════════════
  describe('9. APPLY_MODES constants', () => {
    const src = read('js/apply-workflow.js');

    it('all 6 modes defined', () => {
      expect(src).toContain("MANUAL:");
      expect(src).toContain("SCORE_GATED:");
      expect(src).toContain("AUTO:");
      expect(src).toContain("SCORE_GATED_AUTO:");
      expect(src).toContain("AUTO_REWRITE:");
      expect(src).toContain("AUTOPILOT:");
    });

    it('getApplyModeForJob reads from userApplySettings', () => {
      const fn = src.substring(src.indexOf('function getApplyModeForJob('));
      expect(fn).toContain('userApplySettings.default_apply_mode');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 10. Build & version
  // ═══════════════════════════════════════════════════════════
  describe('10. Build & file inventory', () => {
    it('apply-workflow.js exists', () => {
      expect(existsSync(`${REPO}/js/apply-workflow.js`)).toBe(true);
    });

    it('location.js exists', () => {
      expect(existsSync(`${REPO}/js/location.js`)).toBe(true);
    });

    it('pod-team-manifest.md exists', () => {
      expect(existsSync(`${REPO}/docs/scaling/pod-team-manifest.md`)).toBe(true);
    });

    it('this test file exists', () => {
      expect(existsSync(`${REPO}/tests/af-003-feed-apply-mode.test.js`)).toBe(true);
    });

    it('dist/dashboard.min.js exists', () => {
      expect(existsSync(`${REPO}/dist/dashboard.min.js`)).toBe(true);
    });
  });
});
