/**
 * AIS Spec Gap Remediation — items 28/34/35/36/44/49/52/57/60/61
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

// Item 28: swap resume + regen cover letter in review panel
describe('GAP-28: swap resume + regen cover letter in review panel', () => {
  const overlay = read('extension/job-site-overlay.ts');
  const bg = read('extension/background.ts');
  it('swap resume button in review panel footer', () => expect(overlay).toContain('_bjAnswerReviewSwapResume'));
  it('regen cover letter button in review panel footer', () => expect(overlay).toContain('_bjAnswerReviewRegenCoverLetter'));
  it('window._bjAnswerReviewSwapResume exported', () => expect(overlay).toContain("window._bjAnswerReviewSwapResume = function"));
  it('window._bjAnswerReviewRegenCoverLetter exported', () => expect(overlay).toContain("window._bjAnswerReviewRegenCoverLetter = function"));
  it('swap_resume action sends message to overlay', () => expect(overlay).toContain("action: 'swap_resume'"));
  it('regen_cover_letter action sends message to overlay', () => expect(overlay).toContain("action: 'regen_cover_letter'"));
  it('swap_resume handled in background.ts', () => expect(bg).toContain("action === 'swap_resume'"));
  it('regen_cover_letter handled in background.ts', () => expect(bg).toContain("action === 'regen_cover_letter'"));
  it('regen calls generate-cover-letter EF', () => expect(bg).toContain('generate-cover-letter'));
});

// Items 34/35/36: Resume Builder improvements
describe('GAP-34/35/36: Resume Builder score preview + section editor + PDF', () => {
  const src = read('js/resume-builder.js');
  it('item 34: score preview fetches score-resume EF', () => expect(src).toContain('score-resume'));
  it('item 34: _rbWizGetScorePreview exported', () => expect(src).toContain('window._rbWizGetScorePreview'));
  it('item 35: section editor uses contenteditable', () => expect(src).toContain('contenteditable'));
  it('item 35: summary section is editable', () => expect(src).toContain('rbw-edit-summary'));
  it('item 36: PDF export function exists', () => expect(src).toContain('window._rbWizDownloadPdf'));
  it('item 36: PDF opens printable window', () => expect(src).toContain('window.print()'));
  it('item 36: PDF button in result view', () => expect(src).toContain('_rbWizDownloadPdf()'));
});

// Item 44: Select All Matching in bulk-apply.js
describe('GAP-44: _bulkSelectAllVisible in bulk-apply.js', () => {
  const src = read('js/bulk-apply.js');
  it('_bulkSelectAllVisible exported', () => expect(src).toContain('window._bulkSelectAllVisible'));
  it('delegates to _bulkSelectAll(true)', () => expect(src).toMatch(/_bulkSelectAllVisible[\s\S]{0,50}_bulkSelectAll\(true\)/));
});

// Item 49: Score gate in bulk-apply-queue EF
describe('GAP-49: score gate per-job in bulk-apply-queue EF', () => {
  const src = read('supabase/functions/bulk-apply-queue/index.ts');
  it('fetches user application mode', () => expect(src).toContain('applicationMode'));
  it('fetches score threshold', () => expect(src).toContain('scoreThreshold'));
  it('score gate active for score-gated/auto-score-gate modes', () => expect(src).toContain('useScoreGate'));
  it('below-threshold jobs get review_required status', () => expect(src).toContain('review_required'));
  it('calls score-resume EF per job', () => expect(src).toContain('score-resume'));
  it('match_score stored in bulk_apply_jobs row', () => expect(src).toContain('match_score: score'));
});

// Item 52: LinkedIn Q&A via aiAnswerer
describe('GAP-52: LinkedIn-specific Q&A via answer-form-question EF', () => {
  const src = read('worker/handlers/linkedin.js');
  it('fetchLinkedInAnswers function defined', () => expect(src).toContain('fetchLinkedInAnswers'));
  it('calls answer-form-question EF', () => expect(src).toContain('answer-form-question'));
  it('LinkedIn questions detected on page', () => expect(src).toContain('screeningInputs'));
  it('AI answers filled into form fields', () => expect(src).toContain('humanTypeLinkedIn(page, sel, answer)'));
  it('non-fatal on failure', () => expect(src).toContain('catch { return {}; }'));
});

// Item 57: ip-chat-panel in dashboard.html
describe('GAP-57: ip-chat-panel in dashboard.html', () => {
  const src = read('dashboard.html');
  it('ip-chat-panel element exists', () => expect(src).toContain('id="ip-chat-panel"'));
  it('ip-chat-body container', () => expect(src).toContain('id="ip-chat-body"'));
  it('ip-panel-job for job context', () => expect(src).toContain('id="ip-panel-job"'));
  it('close button calls closeInterviewPractice', () => expect(src).toContain('closeInterviewPractice'));
});

// Item 60: Session history UI
describe('GAP-60: interview session history', () => {
  const src = read('js/interview-prep.js');
  it('loadInterviewHistory exported', () => expect(src).toContain('window.loadInterviewHistory'));
  it('queries interview_sessions table', () => expect(src).toContain("from('interview_sessions')"));
  it('shows aggregate_score per session', () => expect(src).toContain('aggregate_score'));
  it('session_type displayed', () => expect(src).toContain('session_type'));
  it('ip-history-panel shown on load', () => expect(src).toContain('ip-history-panel'));
});

// Item 61: Pipeline CTA
describe('GAP-61: pipeline interview practice CTA', () => {
  const src = read('js/interview-prep.js');
  it('_ipStartMock calls openInterviewPractice', () => expect(src).toContain('openInterviewPractice'));
  it('passes job context to practice panel', () => expect(src).toContain('openInterviewPractice(jobId'));
});

describe('GAP remediation: version', () => {
  it('version is v9.69', () => expect(read('js/version.js')).toContain('v9.69'));
  it('dist bundle at v9.69', () => expect(read('dist/dashboard.min.js')).toContain('v9.69'));
});
