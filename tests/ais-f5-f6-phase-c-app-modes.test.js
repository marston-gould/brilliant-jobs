/**
 * AIS Phase C: Application Modes (F5-S1..S4) + Review Before Submit (F6-S1..S2)
 * All delivered via EXT-AS-1 through EXT-AS-9 sessions.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

// ── AIS-F5-S1: Extension Popup + Sync ──────────────────────────────────────
describe('AIS-F5-S1: extension popup mode selector', () => {
  const src = read('extension/popup-consumer.ts');
  it('mode cards present', () => expect(src).toContain('cv-mode-card'));
  it('persists to chrome.storage.sync', () => expect(src).toContain('chrome.storage.sync.set'));
  it('PostHog: application_mode_changed', () => expect(src).toContain('application_mode_changed'));
  it('syncs to Supabase via background message', () => expect(src).toContain('syncApplySettingsToSupabase'));
});

// ── AIS-F5-S2: Content Script Interception ─────────────────────────────────
describe('AIS-F5-S2: content script apply button interception', () => {
  const src = read('extension/contentScript.ts');
  it('intercepts apply buttons on page', () => expect(src).toMatch(/interceptApply|applyButton|Apply.*button/i));
  it('bj:toolbar:collectQuestions handler', () => expect(src).toContain("'bj:toolbar:collectQuestions'"));
  it('bj:toolbar:answerReview bridged', () => expect(src).toContain("'bj:toolbar:answerReview'"));
});

// ── AIS-F5-S3: Shadow DOM Score Gate Popup ─────────────────────────────────
describe('AIS-F5-S3: shadow DOM score gate popup', () => {
  const src = read('extension/job-site-overlay.ts');
  it('showScoreGatePopup function exists', () => expect(src).toContain('function showScoreGatePopup'));
  it('hideScoreGatePopup function exists', () => expect(src).toContain('function hideScoreGatePopup'));
  it('score ring SVG rendered', () => expect(src).toContain('buildScoreRingSVG'));
  it('threshold gate check in popup', () => expect(src).toContain('_scoreThreshold'));
});

// ── AIS-F5-S4: Dashboard Sync + Rate Limiting ──────────────────────────────
describe('AIS-F5-S4: dashboard sync + rate limiting', () => {
  const src = read('extension/background.ts');
  it('daily apply limit tracked', () => expect(src).toContain('dailyApplyLimit'));
  it('limitReached message fired', () => expect(src).toContain('bj:toolbar:limitReached'));
  it('settings synced to Supabase', () => expect(src).toContain('syncApplySettingsToSupabase'));
  it('anti-detection random delays in worker', () => expect(read('worker/utils/human-sim.js')).toContain('random'));
});

// ── AIS-F6-S1: Review Before Submit Panel ──────────────────────────────────
describe('AIS-F6-S1: answer review panel', () => {
  const src = read('extension/job-site-overlay.ts');
  it('showAnswerReviewPanel exists', () => expect(src).toContain('function showAnswerReviewPanel'));
  it('accept/skip/regenerate actions', () => {
    expect(src).toContain('_bjAnswerReviewAccept');
    expect(src).toContain('_bjAnswerReviewSkip');
    expect(src).toContain('_bjAnswerReviewRegenerate');
  });
  it('answer editing via textarea', () => expect(src).toContain('bj-ar-answer-'));
  it('thumbs up/down feedback', () => expect(src).toContain('_bjAnswerReviewFeedback'));
});

// ── AIS-F6-S2: Review Queue on Dashboard ───────────────────────────────────
describe('AIS-F6-S2: review queue', () => {
  const src = read('js/apply-workflow.js');
  it('pending_applications queue used', () => expect(src).toContain('pending_applications'));
  it('status approved/pending tracked', () => expect(src).toContain("'approved'"));
  it('idempotency key on each application', () => expect(src).toContain('idempotency_key'));
});

describe('AIS Phase C: version', () => {
  it('version is v9.66', () => expect(read('js/version.js')).toContain('v9.66'));
});
