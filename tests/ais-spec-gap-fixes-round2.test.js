/**
 * AIS Spec Gap Fixes — All 11 confirmed missing items
 * Items: 28, 34, 35, 36, 44, 49, 52, 57, 60, 61
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

// Item 28: swap resume + regen cover letter in review panel
describe('Item 28: swap resume + regen cover letter in review panel', () => {
  const overlay = read('extension/job-site-overlay.ts');
  const bg = read('extension/background.ts');
  it('swap resume button in review panel footer', () => expect(overlay).toContain('_bjAnswerReviewSwapResume'));
  it('regen cover letter button in review panel footer', () => expect(overlay).toContain('_bjAnswerReviewRegenCoverLetter'));
  it('_bjAnswerReviewSwapResume sends swap_resume action', () => expect(overlay).toContain("action: 'swap_resume'"));
  it('_bjAnswerReviewRegenCoverLetter sends regen_cover_letter action', () => expect(overlay).toContain("action: 'regen_cover_letter'"));
  it('swap_resume handler in background.ts', () => expect(bg).toContain("action === 'swap_resume'"));
  it('regen_cover_letter handler in background.ts', () => expect(bg).toContain("action === 'regen_cover_letter'"));
  it('regen_cover_letter calls generate-cover-letter EF', () => expect(bg).toContain('generate-cover-letter'));
});

// Items 34+35+36: Resume Builder live score preview, section editor, PDF
describe('Items 34/35/36: Resume Builder score preview + section editor + PDF', () => {
  const src = read('js/resume-builder.js');
  it('_rbWizGetScorePreview calls score-resume EF', () => expect(src).toContain('_rbWizGetScorePreview'));
  it('score preview shown with color coding', () => expect(src).toContain('scoreHtml'));
  it('section editor: summary is contenteditable', () => expect(src).toContain('rbw-edit-summary'));
  it('section editor: experience entries are contenteditable', () => expect(src).toContain('rbw-edit-exp-'));
  it('PDF download button present', () => expect(src).toContain('_rbWizDownloadPdf'));
  it('PDF via printable popup window', () => expect(src).toContain('window.print()'));
  it('PDF button in result UI', () => expect(src).toContain("'⬇ PDF'"));
  it('both DOCX and PDF buttons present', () => {
    expect(src).toContain('⬇ DOCX');
    expect(src).toContain('⬇ PDF');
  });
});

// Item 44: _bulkSelectAllVisible in bulk-apply.js
describe('Item 44: Select All Matching button', () => {
  const src = read('js/bulk-apply.js');
  it('_bulkSelectAllVisible alias exported', () => expect(src).toContain('window._bulkSelectAllVisible'));
  it('maps to _bulkSelectAll(true)', () => expect(src).toContain('_bulkSelectAll(true)'));
  it('_bulkDeselectAll alias exported', () => expect(src).toContain('window._bulkDeselectAll'));
});

// Item 49: Score gate per-job in bulk-apply-queue EF
describe('Item 49: Score gate per job in bulk queue EF', () => {
  const src = read('supabase/functions/bulk-apply-queue/index.ts');
  it('fetches user application mode + threshold', () => expect(src).toContain('applicationMode'));
  it('checks score gate modes', () => expect(src).toContain('score-gated'));
  it('bulk-scores jobs via score-resume EF', () => expect(src).toContain('score-resume'));
  it('flags below-threshold as review_required', () => expect(src).toContain("'review_required'"));
  it('score gate only runs when mode requires it', () => expect(src).toContain('useScoreGate'));
  it('scoreMap built per job', () => expect(src).toContain('scoreMap'));
});

// Item 52: LinkedIn Q&A via aiAnswerer
describe('Item 52: LinkedIn-specific Q&A via aiAnswerer', () => {
  const src = read('worker/handlers/linkedin.js');
  it('fetchLinkedInAnswers function exists', () => expect(src).toContain('fetchLinkedInAnswers'));
  it('calls answer-form-question EF', () => expect(src).toContain('answer-form-question'));
  it('detects LinkedIn screening questions from DOM', () => expect(src).toContain('question'));
  it('fills answered fields with humanTypeLinkedIn', () => expect(src).toContain('humanTypeLinkedIn'));
  it('guarded by opts.authToken', () => expect(src).toContain('opts?.authToken'));
  it('non-fatal on error', () => expect(src).toMatch(/catch \{ \/\* non-fatal \*\/ \}/));
});

// Item 57: ip-chat-panel HTML in dashboard.html
describe('Item 57: ip-chat-panel in dashboard.html', () => {
  const src = read('dashboard.html');
  it('ip-chat-panel container exists', () => expect(src).toContain('id="ip-chat-panel"'));
  it('ip-chat-body container exists', () => expect(src).toContain('id="ip-chat-body"'));
  it('ip-panel-job label exists', () => expect(src).toContain('id="ip-panel-job"'));
  it('close button calls closeInterviewPractice', () => expect(src).toContain('closeInterviewPractice'));
  it('panel is a slide-out (fixed positioning)', () => expect(src).toMatch(/ip-chat-panel[\s\S]{0,200}position:fixed/));
});

// Item 60: Session history panel
describe('Item 60: Session history panel', () => {
  const html = read('dashboard.html');
  const js = read('js/interview-prep.js');
  it('ip-history-panel container in dashboard.html', () => expect(html).toContain('id="ip-history-panel"'));
  it('ip-history-list container in dashboard.html', () => expect(html).toContain('id="ip-history-list"'));
  it('loadInterviewHistory function exported', () => expect(js).toContain('window.loadInterviewHistory'));
  it('queries interview_sessions table', () => expect(js).toContain("from('interview_sessions')"));
  it('shows aggregate_score per session', () => expect(js).toContain('aggregate_score'));
  it('shows session_type per session', () => expect(js).toContain('session_type'));
  it('_ipShowHistoryPanel exported', () => expect(js).toContain('window._ipShowHistoryPanel'));
});

// Item 61: Pipeline Practice CTA
describe('Item 61: Pipeline interview Practice CTA', () => {
  const src = read('js/pipeline.js');
  it('Practice button calls openInterviewPractice', () => expect(src).toContain('openInterviewPractice'));
  it('Practice button exists for interview stage', () => expect(src).toContain('🎯 Practice'));
  it('existing Prep → button still present', () => expect(src).toContain('Prep →'));
  it('CTA only shown for interview stage', () => {
    const interviewIdx = src.indexOf("stage === 'interview'");
    const practiceIdx = src.indexOf('openInterviewPractice');
    expect(practiceIdx).toBeGreaterThan(interviewIdx);
  });
});

// Version
describe('Gap fixes: version', () => {
  it('version is v9.69', () => expect(read('js/version.js')).toContain('v9.69'));
  it('dist bundle at v9.69', () => expect(read('dist/dashboard.min.js')).toContain('v9.69'));
});
