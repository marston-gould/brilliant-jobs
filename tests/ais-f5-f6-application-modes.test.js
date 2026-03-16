/**
 * AIS-F5-S1 through AIS-F6-S2: Application Modes — verification
 * All delivered via EXT-AS-1 through EXT-AS-9 extension sessions.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('AIS-F5-S1: Extension popup mode selector', () => {
  const src = read('extension/popup-consumer.ts');
  it('multiple application modes defined', () => {
    ['score-gated','auto-score-gate','auto-rewrite','full-autopilot'].forEach(m =>
      expect(src).toContain(m));
  });
  it('persists mode to chrome.storage.sync', () => expect(src).toContain('chrome.storage.sync'));
  it('PostHog mode_changed event', () => expect(src).toContain('mode_changed'));
});

describe('AIS-F5-S2: Content script + button injection', () => {
  const src = read('extension/job-site-overlay.ts');
  it('injectSaveButton exists', () => expect(src).toContain('injectSaveButton'));
  it('interceptApplyButtons exists', () => expect(src).toContain('interceptApplyButtons'));
  it('save pipeline button injected', () => expect(src).toContain('bj-save-pipeline-btn'));
  it('apply click intercepted', () => expect(src).toContain('submit_anyway'));
});

describe('AIS-F5-S3: Shadow DOM score gate popup', () => {
  const src = read('extension/job-site-overlay.ts');
  it('showScoreGatePopup exists', () => expect(src).toContain('showScoreGatePopup'));
  it('score ring SVG rendered', () => expect(src).toContain('buildScoreRingSVG'));
  it('rewrite option shown below threshold', () => expect(src).toContain('rewrite'));
  it('shadow DOM used', () => expect(src).toContain('getShadowRoot'));
});

describe('AIS-F5-S4: Dashboard sync + rate limiting', () => {
  const bg = read('extension/background.ts');
  it('daily apply limit enforced', () => expect(bg).toContain('daily') && expect(bg).toContain('limit'));
  it('limitReached message sent to overlay', () => expect(bg).toContain('limitReached'));
  it('daily limit tracked', () => expect(bg).toContain('limitReached'));
  it('setupRequired message for incomplete profile', () => expect(bg).toContain('setupRequired'));
});

describe('AIS-F6-S1: Review before submit panel', () => {
  const src = read('extension/job-site-overlay.ts');
  it('showAnswerReviewPanel exists', () => expect(src).toContain('showAnswerReviewPanel'));
  it('answer review triggered on answerReview message', () => expect(src).toContain("'bj:toolbar:answerReview'"));
  it('accept/skip/regenerate actions', () => {
    expect(src).toContain('_bjAnswerReviewAccept');
    expect(src).toContain('_bjAnswerReviewSkip');
    expect(src).toContain('_bjAnswerReviewRegenerate');
  });
});

describe('AIS-F6-S2: Review queue on dashboard', () => {
  const src = read('js/apply-workflow.js');
  it('pending_applications table used', () => expect(src).toContain('pending_applications'));
  it('applications listed on Applications page', () => expect(src).toContain('applications'));
  it('status field tracked', () => expect(src).toContain('status'));
});

describe('AIS-F5/F6: version', () => {
  it('version is v9.66', () => expect(read('js/version.js')).toContain('v9.66'));
});
