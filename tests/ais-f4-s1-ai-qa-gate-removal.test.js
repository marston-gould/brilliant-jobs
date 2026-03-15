/**
 * AIS-F4-S1: AI Q&A Gate Removal + Answer Review
 * ===============================================
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('AIS-F4-S1: _fetchAiAnswersForReview in background.ts', () => {
  const src = read('extension/background.ts');

  it('function exists', () => {
    expect(src).toContain('_fetchAiAnswersForReview');
  });

  it('calls answer-form-question EF', () => {
    expect(src).toContain('answer-form-question');
  });

  it('sends bj:toolbar:answerReview to overlay on success', () => {
    expect(src).toContain("'bj:toolbar:answerReview'");
  });

  it('emits ai_answer_generated PostHog event', () => {
    expect(src).toContain("'ai_answer_generated'");
  });

  it('returns false on error — no silent fail', () => {
    expect(src).toContain('return false; // On error');
  });

  it('requests form questions via collectQuestions message', () => {
    expect(src).toContain("'bj:toolbar:collectQuestions'");
  });

  it('fetches resume text for context', () => {
    expect(src).toContain('resume_archive');
  });
});

describe('AIS-F4-S1: submit_anyway interception in background.ts', () => {
  const src = read('extension/background.ts');

  it('calls _fetchAiAnswersForReview for review modes', () => {
    expect(src).toMatch(/submit_anyway[\s\S]{0,600}_fetchAiAnswersForReview/);
  });

  it('checks reviewMode for score-gated and manual', () => {
    expect(src).toContain('reviewMode');
    expect(src).toContain("'score-gated'");
    expect(src).toContain("'manual'");
  });

  it('returns answer_review_pending when review shown', () => {
    expect(src).toContain('answer_review_pending');
  });

  it('falls through to fill when no review', () => {
    expect(src).toMatch(/reviewShown[\s\S]{0,400}filling/);
  });
});

describe('AIS-F4-S1: bj:toolbar:answerReviewConfirm handler', () => {
  const src = read('extension/background.ts');

  it('handler exists', () => {
    expect(src).toContain("'bj:toolbar:answerReviewConfirm'");
  });

  it('handles accepted action — triggers fill', () => {
    expect(src).toContain("action === 'accepted'");
  });

  it('handles skipped action', () => {
    expect(src).toContain("'skipped'");
  });

  it('handles regenerate action with re-fetch', () => {
    expect(src).toContain("action === 'regenerate'");
    expect(src).toMatch(/regenerate[\s\S]{0,400}_fetchAiAnswersForReview/);
  });

  it('emits ai_answer_feedback for each rated answer', () => {
    expect(src).toContain("'ai_answer_feedback'");
    expect(src).toMatch(/ai_answer_feedback[\s\S]{0,300}field_label/);
  });

  it('logs submission attempt on confirm', () => {
    expect(src).toMatch(/answerReviewConfirm[\s\S]{0,1000}_logSubmissionAttempt/);
  });

  it('catches errors — no silent fail', () => {
    expect(src).toMatch(/answerReviewConfirm[\s\S]{0,1200}extension_catch_error/);
  });
});

describe('AIS-F4-S1: PostHog events in background.ts', () => {
  const src = read('extension/background.ts');

  it('ai_answer_generated includes questions_count', () => {
    expect(src).toMatch(/ai_answer_generated[\s\S]{0,300}questions_count/);
  });

  it('ai_answer_generated includes surface: extension', () => {
    expect(src).toMatch(/ai_answer_generated[\s\S]{0,300}surface/);
  });

  it('ai_answer_feedback includes field_label and rating', () => {
    expect(src).toMatch(/ai_answer_feedback[\s\S]{0,300}field_label/);
    expect(src).toMatch(/ai_answer_feedback[\s\S]{0,300}rating/);
  });
});

describe('AIS-F4-S1: showAnswerReviewPanel in job-site-overlay.ts', () => {
  const src = read('extension/job-site-overlay.ts');

  it('showAnswerReviewPanel function exists', () => {
    expect(src).toContain('function showAnswerReviewPanel');
  });

  it('hideAnswerReviewPanel function exists', () => {
    expect(src).toContain('function hideAnswerReviewPanel');
  });

  it('renders in shadow DOM', () => {
    expect(src).toMatch(/showAnswerReviewPanel[\s\S]{0,600}getShadowRoot/);
  });

  it('renders textarea for each answer', () => {
    expect(src).toMatch(/showAnswerReviewPanel[\s\S]{0,2000}textarea/i);
  });

  it('renders thumbs up/down buttons', () => {
    expect(src).toContain('_bjAnswerReviewFeedback');
  });

  it('renders Accept, Skip, Regenerate buttons', () => {
    expect(src).toContain('_bjAnswerReviewAccept');
    expect(src).toContain('_bjAnswerReviewSkip');
    expect(src).toContain('_bjAnswerReviewRegenerate');
  });

  it('closes on backdrop click', () => {
    expect(src).toMatch(/showAnswerReviewPanel[\s\S]{0,2500}e\.target.*overlay|backdrop/);
  });
});

describe('AIS-F4-S1: window action handlers in overlay', () => {
  const src = read('extension/job-site-overlay.ts');

  it('_bjAnswerReviewAccept sends accepted + answerReviewConfirm', () => {
    expect(src).toMatch(/_bjAnswerReviewAccept[\s\S]{0,600}accepted/);
    expect(src).toMatch(/_bjAnswerReviewAccept[\s\S]{0,600}answerReviewConfirm/);
  });

  it('_bjAnswerReviewAccept collects edited textarea values', () => {
    expect(src).toMatch(/_bjAnswerReviewAccept[\s\S]{0,600}ta\.value/);
  });

  it('_bjAnswerReviewSkip sends skipped', () => {
    expect(src).toMatch(/_bjAnswerReviewSkip[\s\S]{0,400}skipped/);
  });

  it('_bjAnswerReviewRegenerate sends regenerate', () => {
    expect(src).toMatch(/_bjAnswerReviewRegenerate[\s\S]{0,400}regenerate/);
  });

  it('_bjAnswerReviewFeedback updates button visual state', () => {
    expect(src).toMatch(/_bjAnswerReviewFeedback[\s\S]{0,500}style\.background/);
  });
});

describe('AIS-F4-S1: message handler and exports in overlay', () => {
  const src = read('extension/job-site-overlay.ts');

  it('handles bj:toolbar:answerReview message', () => {
    expect(src).toContain("'bj:toolbar:answerReview'");
  });

  it('calls showAnswerReviewPanel on message', () => {
    expect(src).toMatch(/answerReview[\s\S]{0,150}showAnswerReviewPanel/);
  });

  it('showAnswerReviewPanel exported to window._bjJobSiteOverlay', () => {
    expect(src).toContain('showAnswerReviewPanel: showAnswerReviewPanel');
  });

  it('hideAnswerReviewPanel exported to window._bjJobSiteOverlay', () => {
    expect(src).toContain('hideAnswerReviewPanel: hideAnswerReviewPanel');
  });
});

describe('AIS-F4-S1: contentScript.ts handlers', () => {
  const src = read('extension/contentScript.ts');

  it('bj:toolbar:collectQuestions handler exists', () => {
    expect(src).toContain("'bj:toolbar:collectQuestions'");
  });

  it('collects form inputs including textareas', () => {
    expect(src).toMatch(/collectQuestions[\s\S]{0,600}textarea/i);
  });

  it('skips already-filled fields', () => {
    expect(src).toMatch(/collectQuestions[\s\S]{0,1000}\.value.*trim\(\)/);
  });

  it('skips standard fields via regex pattern', () => {
    expect(src).toMatch(/collectQuestions[\s\S]{0,1200}standardPat/);
  });

  it('caps questions at 10', () => {
    expect(src).toMatch(/collectQuestions[\s\S]{0,1400}slice\(0,\s*10\)/);
  });

  it('responds with questions array', () => {
    expect(src).toMatch(/collectQuestions[\s\S]{0,1600}sendResponse.*questions/);
  });

  it('catches errors returning empty array', () => {
    expect(src).toMatch(/collectQuestions[\s\S]{0,2000}catch[\s\S]{0,200}questions.*\[\]/);
  });

  it('bj:toolbar:answerReview is in the bridge list', () => {
    expect(src).toContain("'bj:toolbar:answerReview'");
  });
});

describe('AIS-F4-S1: Version and build integrity', () => {
  it('version is v9.56', () => {
    expect(read('js/version.js')).toContain('v9.56');
  });

  it('dist/dashboard.min.js at v9.56', () => {
    expect(read('dist/dashboard.min.js')).toContain('v9.56');
  });

  it('required source files present', () => {
    [
      'extension/background.ts',
      'extension/job-site-overlay.ts',
      'extension/contentScript.ts',
      'tests/ais-f4-s1-ai-qa-gate-removal.test.js',
    ].forEach(f => expect(() => read(f)).not.toThrow());
  });
});
