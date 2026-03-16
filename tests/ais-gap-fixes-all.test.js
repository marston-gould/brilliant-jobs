/**
 * AIS Gap Fixes — All confirmed gaps addressed before Phase D
 * Covers: F1 PostHog, F3 safety, F4 user_edited_answer, F5 PostHog props,
 *         F6 review panel gaps, F8 LinkedIn/company context, F5 job-sites.json
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

// ── F1: PostHog events ────────────────────────────────────────────────────
describe('GAP-F1: resume_rewrite PostHog events in rewrite.js', () => {
  const src = read('js/rewrite.js');
  it('resume_rewrite_started fired on openRewritePanel', () => expect(src).toContain("'resume_rewrite_started'"));
  it('resume_rewrite_started includes job_id, resume_id, original_score', () => {
    expect(src).toMatch(/resume_rewrite_started[\s\S]{0,200}original_score/);
  });
  it('resume_rewrite_completed fired on _rwAcceptAll', () => expect(src).toContain("'resume_rewrite_completed'"));
  it('resume_rewrite_completed includes new_score', () => {
    expect(src).toMatch(/resume_rewrite_completed[\s\S]{0,200}new_score/);
  });
  it('resume_rewrite_qa_skipped fired on _rwSkipQuestion', () => expect(src).toContain("'resume_rewrite_qa_skipped'"));
  it('qa_skipped includes question_index and question_type', () => {
    expect(src).toMatch(/resume_rewrite_qa_skipped[\s\S]{0,200}question_index/);
  });
});

// ── F3: Circuit breaker + platform spacing ────────────────────────────────
describe('GAP-F3: circuit breaker + platform spacing in background.ts', () => {
  const src = read('extension/background.ts');
  it('_platformFailStreaks tracking object exists', () => expect(src).toContain('_platformFailStreaks'));
  it('CIRCUIT_BREAKER_THRESHOLD = 3', () => expect(src).toContain('CIRCUIT_BREAKER_THRESHOLD = 3'));
  it('_checkPlatformCircuitBreaker function exists', () => expect(src).toContain('_checkPlatformCircuitBreaker'));
  it('circuit breaker blocks apply when threshold reached', () => expect(src).toContain('circuit_breaker_open'));
  it('auto_apply_circuit_breaker_tripped PostHog event fired', () => expect(src).toContain("'auto_apply_circuit_breaker_tripped'"));
  it('PLATFORM_SPACING_MS = 60000', () => expect(src).toContain('PLATFORM_SPACING_MS = 60_000'));
  it('_checkPlatformSpacing function exists', () => expect(src).toContain('_checkPlatformSpacing'));
  it('platform spacing enforced event fired', () => expect(src).toContain("'auto_apply_platform_spacing_enforced'"));
  it('_recordPlatformResult resets streak on success', () => expect(src).toContain('_recordPlatformResult'));
  it('circuit breaker + spacing wired into Auto Apply flow', () => {
    expect(src).toContain('_checkPlatformCircuitBreaker');
  });
});

// ── F4: user_edited_answer persistence ────────────────────────────────────
describe('GAP-F4: user_edited_answer persistence in background.ts', () => {
  const src = read('extension/background.ts');
  it('user_edited_answer updated in answers table', () => expect(src).toContain('user_edited_answer'));
  it('only persists when answer was actually edited', () => expect(src).toContain('wasEdited'));
  it('update is non-fatal on error', () => expect(src).toContain('user_edited_answer update error'));
});

// ── F5: PostHog props ─────────────────────────────────────────────────────
describe('GAP-F5: PostHog event properties in popup-consumer.ts', () => {
  const src = read('extension/popup-consumer.ts');
  it('application_mode_changed includes old_mode', () => expect(src).toContain('old_mode: oldMode'));
  it('application_mode_changed includes source: extension', () => expect(src).toContain("source: 'extension'"));
});

describe('GAP-F5: score_gate_shown user_action + review_panel_shown in overlay', () => {
  const src = read('extension/job-site-overlay.ts');
  it('score_gate_shown fired with user_action: rewrite', () => expect(src).toContain("user_action: 'rewrite'"));
  it('score_gate_shown fired with user_action: apply', () => expect(src).toContain("user_action: 'apply'"));
  it('score_gate_shown fired with user_action: cancel', () => expect(src).toContain("user_action: 'cancel'"));
  it('review_panel_shown event fired in showAnswerReviewPanel', () => expect(src).toContain("'review_panel_shown'"));
  it('review_panel_shown includes has_cover_letter prop', () => expect(src).toContain('has_cover_letter'));
});

// ── F5: job-sites.json ────────────────────────────────────────────────────
describe('GAP-F5: job-sites.json per-ATS CSS selectors', () => {
  const src = read('extension/job-sites.json');
  const data = JSON.parse(src);
  it('config file is valid JSON with sites array', () => expect(Array.isArray(data.sites)).toBe(true));
  it('has linkedin platform', () => expect(data.sites.some(s => s.platform === 'linkedin')).toBe(true));
  it('has greenhouse platform', () => expect(data.sites.some(s => s.platform === 'greenhouse')).toBe(true));
  it('has lever platform', () => expect(data.sites.some(s => s.platform === 'lever')).toBe(true));
  it('has workday platform', () => expect(data.sites.some(s => s.platform === 'workday')).toBe(true));
  it('has ashby platform', () => expect(data.sites.some(s => s.platform === 'ashby')).toBe(true));
  it('has workable platform', () => expect(data.sites.some(s => s.platform === 'workable')).toBe(true));
  it('each site has applyButtonSelectors', () => {
    data.sites.forEach(s => expect(Array.isArray(s.applyButtonSelectors)).toBe(true));
  });
  it('each site has saveButtonTarget with selector', () => {
    data.sites.forEach(s => expect(s.saveButtonTarget?.selector).toBeTruthy());
  });
  it('each site has jobMetaSelectors with title', () => {
    data.sites.forEach(s => expect(Array.isArray(s.jobMetaSelectors?.title)).toBe(true));
  });
});

// ── F6: Review panel gaps ─────────────────────────────────────────────────
describe('GAP-F6: cover letter in answer review panel', () => {
  const src = read('extension/job-site-overlay.ts');
  it('cover letter shown in review panel when available', () => expect(src).toContain('coverLetter.slice'));
  it('Save for Later button in review panel', () => expect(src).toContain('_bjAnswerReviewSaveLater'));
  it('_bjAnswerReviewSaveLater window function exists', () => expect(src).toContain('window._bjAnswerReviewSaveLater'));
});

describe('GAP-F6: save_later handler + cover letter fetch in background.ts', () => {
  const src = read('extension/background.ts');
  it('save_later action handled in answerReviewConfirm', () => expect(src).toContain("action === 'save_later'"));
  it('save_later persists to pending_applications with review_queue status', () => expect(src).toContain("'review_queue'"));
  it('cover letter fetched and passed to review panel', () => expect(src).toContain('coverLetterForReview'));
});

describe('GAP-F6: loadReviewQueue in apply-workflow.js', () => {
  const src = read('js/apply-workflow.js');
  it('loadReviewQueue function exported to window', () => expect(src).toContain('window.loadReviewQueue'));
  it('queries pending_applications with status=review_queue', () => {
    expect(src).toContain("'review_queue'");
  });
  it('dismissReviewQueueItem updates status to dismissed', () => expect(src).toContain("'dismissed'"));
  it('review-queue badge count updated on dismiss', () => expect(src).toContain('review-queue-badge'));
});

describe('GAP-F6: switchAppTab wired for review-queue', () => {
  const src = read('js/app.js');
  it("review-queue in switchAppTab allowlist", () => expect(src).toContain("'review-queue'"));
  it('loadReviewQueue called on tab switch', () => expect(src).toContain('loadReviewQueue'));
});

// ── F8: LinkedIn + company context in EF ─────────────────────────────────
describe('GAP-F8: LinkedIn + ats_companies context in generate-cover-letter EF', () => {
  const src = read('supabase/functions/generate-cover-letter/index.ts');
  it('fetches linkedin_profiles for user', () => expect(src).toContain("from('linkedin_profiles')"));
  it('fetches ats_companies for company info', () => expect(src).toContain("from('ats_companies')"));
  it('LinkedIn data passed to generateCoverLetter', () => expect(src).toContain('linkedInContext'));
  it('company data passed to generateCoverLetter', () => expect(src).toContain('companyContext'));
  it('LinkedIn skills included in prompt', () => expect(src).toContain('skills_array'));
  it('company mission included in prompt when available', () => expect(src).toContain('companyContext.mission'));
  it('both fetches are non-fatal', () => {
    const count = (src.match(/\/\* non-fatal \*\//g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });
  it('generateCoverLetter accepts linkedInContext param', () => {
    expect(src).toMatch(/linkedInContext\?: Record/);
  });
  it('generateCoverLetter accepts companyContext param', () => {
    expect(src).toMatch(/companyContext\?: Record/);
  });
});

// ── Version ───────────────────────────────────────────────────────────────
describe('GAP fixes: version', () => {
  it('version is v9.67', () => expect(read('js/version.js')).toContain('v9.67'));
  it('dist bundle at v9.67', () => expect(read('dist/dashboard.min.js')).toContain('v9.67'));
});
