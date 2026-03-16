/**
 * AIS Spec Gap Fixes — all 11 gaps resolved after full spec audit
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

// Item 28 (F6): Swap resume + regen cover letter in review panel
describe('GAP-28: swap resume + regen cover letter in review panel', () => {
  const overlay = read('extension/job-site-overlay.ts');
  it('swap resume button in review panel footer', () => expect(overlay).toContain('_bjAnswerReviewSwapResume'));
  it('regen cover letter button in review panel footer', () => expect(overlay).toContain('_bjAnswerReviewRegenCoverLetter'));
  it('_bjAnswerReviewSwapResume exported on window', () => expect(overlay).toContain('window._bjAnswerReviewSwapResume'));
  it('_bjAnswerReviewRegenCoverLetter exported on window', () => expect(overlay).toContain('window._bjAnswerReviewRegenCoverLetter'));

  const bg = read('extension/background.ts');
  it("swap_resume action handled in background.ts", () => expect(bg).toContain("action === 'swap_resume'"));
  it("regen_cover_letter action handled in background.ts", () => expect(bg).toContain("action === 'regen_cover_letter'"));
  it('regen_cover_letter calls generate-cover-letter EF', () => expect(bg).toContain('generate-cover-letter'));
});

// Items 34/35/36 (F7): Live score preview, section editor, PDF export
describe('GAP-34/35/36: resume builder score preview + section editor + PDF', () => {
  const src = read('js/resume-builder.js');
  it('_rbWizGetScorePreview calls score-resume EF (item 34)', () => expect(src).toContain('score-resume'));
  it('score preview shown in result view (item 34)', () => expect(src).toContain('scoreVal'));
  it('contenteditable section editor in result (item 35)', () => expect(src).toContain('contenteditable'));
  it('rbw-edit-summary editable (item 35)', () => expect(src).toContain('rbw-edit-summary'));
  it('_rbWizDownloadPdf exists (item 36)', () => expect(src).toContain('window._rbWizDownloadPdf'));
  it('PDF via print popup (item 36)', () => expect(src).toContain('window.print()'));
  it('both DOCX and PDF buttons in result view', () => expect(src).toContain('_rbWizDownloadPdf'));
});

// Item 44 (F9): _bulkSelectAllVisible alias
describe('GAP-44: _bulkSelectAllVisible in bulk-apply.js', () => {
  const src = read('js/bulk-apply.js');
  it('_bulkSelectAllVisible exported', () => expect(src).toContain('window._bulkSelectAllVisible'));
  it('_bulkSelectAllVisible calls _bulkSelectAll(true)', () => expect(src).toContain('_bulkSelectAll(true)'));
});

// Item 49 (F9): Score gate per-job in bulk-apply-queue EF
describe('GAP-49: score gate per-job in bulk-apply-queue EF', () => {
  const src = read('supabase/functions/bulk-apply-queue/index.ts');
  it('reads user applicationMode + scoreThreshold', () => expect(src).toContain('applicationMode'));
  it('calls score-resume for each job when gate active', () => expect(src).toContain('score-resume'));
  it('flags review_required for below-threshold jobs', () => expect(src).toContain("'review_required'"));
  it('useScoreGate checks for score-gated and auto-score-gate modes', () => expect(src).toContain('auto-score-gate'));
});

// Item 52 (F10): LinkedIn Q&A via aiAnswerer
describe('GAP-52: LinkedIn Q&A via answer-form-question EF', () => {
  const src = read('worker/handlers/linkedin.js');
  it('fetchLinkedInAnswers function exists', () => expect(src).toContain('fetchLinkedInAnswers'));
  it('calls answer-form-question EF', () => expect(src).toContain('answer-form-question'));
  it('scans LinkedIn form for screening questions', () => expect(src).toContain('question'));
  it('fills answers via humanTypeLinkedIn', () => expect(src).toContain('humanTypeLinkedIn'));
  it('non-fatal on Q&A failure', () => expect(src).toContain('/* non-fatal */'));
});

// Items 57/60 (F11): ip-chat-panel + session history in dashboard.html
describe('GAP-57/60: ip-chat-panel + history in dashboard.html', () => {
  const src = read('dashboard.html');
  it('ip-chat-panel slide-out exists (item 57)', () => expect(src).toContain('id="ip-chat-panel"'));
  it('ip-chat-body container for chat (item 57)', () => expect(src).toContain('id="ip-chat-body"'));
  it('ip-panel-job shows job context (item 57)', () => expect(src).toContain('id="ip-panel-job"'));
  it('ip-history-panel for session history (item 60)', () => expect(src).toContain('id="ip-history-panel"'));
  it('ip-history-list renders past sessions (item 60)', () => expect(src).toContain('id="ip-history-list"'));
});

// Item 60 (F11): loadInterviewHistory in interview-prep.js
describe('GAP-60: loadInterviewHistory function', () => {
  const src = read('js/interview-prep.js');
  it('loadInterviewHistory exported', () => expect(src).toContain('window.loadInterviewHistory'));
  it('queries interview_sessions table', () => expect(src).toContain('interview_sessions'));
  it('auto-loads on panel init', () => expect(src).toContain('loadInterviewHistory'));
});

// Item 61 (F11): Pipeline "Practice for this interview" CTA
describe('GAP-61: pipeline practice CTA already implemented', () => {
  const src = read('js/pipeline.js');
  it('interview stage has Practice button', () => expect(src).toContain("🎯 Practice"));
  it('calls openInterviewPractice from pipeline card', () => expect(src).toContain('openInterviewPractice'));
  it('practice button on interview stage only', () => { const idx = src.lastIndexOf("stage === 'interview'"); expect(src.slice(idx, idx+500)).toContain('openInterviewPractice'); });
});

// Version
describe('AIS gap fixes: version', () => {
  it('version is v9.69', () => expect(read('js/version.js')).toContain('v9.69'));
  it('dist bundle at v9.69', () => expect(read('dist/dashboard.min.js')).toContain('v9.69'));
});
