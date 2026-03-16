/**
 * AIS Phase D: Scale + New Features
 * AIS-F9-S1..S3 (Bulk Apply), AIS-F10-S1..S2 (LinkedIn),
 * AIS-F7-S1..S2 (Resume Builder), AIS-F11-S1..S2 (Interview Practice),
 * AIS-F12-S1..S2 (A/B Testing)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

// ── F9-S1: Bulk Apply Multi-Select UI ───────────────────────────────────
describe('AIS-F9-S1: bulk apply multi-select UI', () => {
  it('checkbox column in job-feed.js rows', () => expect(read('js/job-feed.js')).toContain('bulk-job-cb'));
  it('_bulkToggleJob on checkbox change', () => expect(read('js/job-feed.js')).toContain('_bulkToggleJob'));
  it('bulk action bar exists in dashboard.html', () => expect(read('dashboard.html')).toContain('bulk-action-bar'));
  it('bulk count badge in bar', () => expect(read('dashboard.html')).toContain('bulk-count-badge'));
  it('bulk credit cost estimate in bar', () => expect(read('dashboard.html')).toContain('bulk-credit-cost'));
  it('bulk-apply.js in build.js', () => expect(read('build.js')).toContain("'js/bulk-apply.js'"));
  const src = read('js/bulk-apply.js');
  it('_bulkToggleJob exported', () => expect(src).toContain('window._bulkToggleJob'));
  it('_bulkSelectAll exported', () => expect(src).toContain('window._bulkSelectAll'));
  it('_bulkApplySelected exported', () => expect(src).toContain('window._bulkApplySelected'));
  it('_bulkClearSelection exported', () => expect(src).toContain('window._bulkClearSelection'));
  it('bulk_apply_queue called on apply', () => expect(src).toContain('_bulkApplyQueue'));
  it('calls bulk-apply-queue EF', () => expect(src).toContain('bulk-apply-queue'));
});

// ── F9-S2: Bulk Apply Queue Table + EF ──────────────────────────────────
describe('AIS-F9-S2: bulk_apply_jobs migration + EF', () => {
  it('migration file exists', () => expect(() => read('supabase/migrations/v9.66-ais-f9-s2-bulk-apply-jobs.sql')).not.toThrow());
  it('bulk_apply_jobs table in migration', () => expect(read('supabase/migrations/v9.66-ais-f9-s2-bulk-apply-jobs.sql')).toContain('bulk_apply_jobs'));
  it('status has queued/filling/submitted/failed', () => {
    const src = read('supabase/migrations/v9.66-ais-f9-s2-bulk-apply-jobs.sql');
    expect(src).toContain('queued'); expect(src).toContain('submitted');
  });
  it('bulk-apply-queue EF exists', () => expect(() => read('supabase/functions/bulk-apply-queue/index.ts')).not.toThrow());
  it('gateway route registered', () => expect(read('supabase/functions/api-gateway/index.ts')).toContain('"bulk-apply-queue"'));
});

// ── F9-S3: Progress Dashboard + Safety ──────────────────────────────────
describe('AIS-F9-S3: progress dashboard + safety', () => {
  const src = read('js/bulk-apply.js');
  it('loadBulkProgress function exported', () => expect(src).toContain('window.loadBulkProgress'));
  it('polling with setInterval', () => expect(src).toContain('setInterval'));
  it('bulk_apply_completed PostHog on done', () => expect(src).toContain("'bulk_apply_completed'"));
  it('_bulkStartUndoWindow 10-second undo', () => expect(src).toContain('BULK_UNDO_WINDOW_MS'));
  it('_bulkCancelRemaining cancels queued jobs', () => expect(src).toContain("'cancelled'"));
  it('30-minute cooldown constant', () => expect(src).toContain('BULK_COOLDOWN_MS'));
  it('progress bar in dashboard.html', () => expect(read('dashboard.html')).toContain('bulk-progress-bar'));
});

// ── F10-S1: LinkedIn Handler Hardening ──────────────────────────────────
describe('AIS-F10-S1: LinkedIn handler hardening', () => {
  const src = read('worker/handlers/linkedin.js');
  it('jitter function for randomized delays', () => expect(src).toContain('function jitter'));
  it('safeClick viewport-aware', () => expect(src).toContain('function safeClick'));
  it('detectCaptcha function', () => expect(src).toContain('function detectCaptcha'));
  it('LI_DAILY_LIMIT = 15', () => expect(src).toContain('LI_DAILY_LIMIT = 15'));
  it('checkLinkedInDailyLimit enforced', () => expect(src).toContain('checkLinkedInDailyLimit'));
  it('returns error on captcha detected', () => expect(src).toContain('captcha_detected'));
  it('human-sim typing char by char', () => expect(src).toContain('humanTypeLinkedIn'));
  it('wired in ats-router.js', () => expect(read('worker/ats-router.js')).toContain('fillLinkedIn'));
});

// ── F10-S2: LinkedIn Multi-Step + Profile Sync ──────────────────────────
describe('AIS-F10-S2: LinkedIn multi-step + profile sync', () => {
  const src = read('worker/handlers/linkedin.js');
  it('multi-step loop up to MAX_EASY_APPLY_STEPS', () => expect(src).toContain('MAX_EASY_APPLY_STEPS'));
  it('detects page transitions (Next/Submit)', () => expect(src).toContain('nextBtnSel'));
  it('pre-fills from linkedin_profiles table', () => expect(src).toContain("from('linkedin_profiles')"));
  it('detects connections at company', () => expect(src).toContain("from('extension_network_data')"));
  it('linkedin_easy_apply_triggered PostHog', () => expect(src).toContain("'linkedin_easy_apply_triggered'"));
  it('connections_at_company in PostHog event', () => expect(src).toContain('connections_at_company'));
});

// ── F7-S1: Resume Builder EF + Migration ────────────────────────────────
describe('AIS-F7-S1: resume builder EF + migration', () => {
  it('ai_generated_resumes migration exists', () => expect(() => read('supabase/migrations/v9.67-ais-f7-s1-resume-builder.sql')).not.toThrow());
  const mig = read('supabase/migrations/v9.67-ais-f7-s1-resume-builder.sql');
  it('ai_generated_resumes table created', () => expect(mig).toContain('CREATE TABLE IF NOT EXISTS ai_generated_resumes'));
  it('template column with 5 options', () => expect(mig).toMatch(/clean.*modern.*executive|template.*CHECK/));
  it('source column with manual/linkedin/hybrid', () => expect(mig).toContain('manual'));
  it('credits_charged default 5', () => expect(mig).toContain('DEFAULT 5'));
  it('RLS enabled', () => expect(mig).toContain('ENABLE ROW LEVEL SECURITY'));
  const ef = read('supabase/functions/build-resume/index.ts');
  it('build-resume EF uses Claude Sonnet', () => expect(ef).toContain('sonnet'));
  it('deducts 5 credits', () => expect(ef).toContain('CREDITS = 5'));
  it('refunds on AI failure', () => expect(ef).toContain('resume_builder_refund'));
  it('persists to ai_generated_resumes', () => expect(ef).toContain("from('ai_generated_resumes').insert"));
  it('gateway route registered', () => expect(read('supabase/functions/api-gateway/index.ts')).toContain('"build-resume"'));
});

// ── F7-S2: Resume Builder Wizard UI ─────────────────────────────────────
describe('AIS-F7-S2: resume builder wizard UI', () => {
  const src = read('js/resume-builder.js');
  it('openResumeBuilder exported', () => expect(src).toContain('window.openResumeBuilder'));
  it('4-step wizard (role/exp/skills/template)', () => expect(src).toContain('rbw-role') && expect(src).toContain('rbw-acc'));
  it('_rbWizNext step navigation', () => expect(src).toContain('window._rbWizNext'));
  it('calls build-resume EF', () => expect(src).toContain('build-resume'));
  it('resume_built_from_scratch PostHog', () => expect(src).toContain("'resume_built_from_scratch'"));
  it('download function exists', () => expect(src).toContain('_rbWizDownload'));
});

// ── F11-S1: Interview Practice EF + Session Table ───────────────────────
describe('AIS-F11-S1: interview practice EF + sessions table', () => {
  it('interview_sessions migration exists', () => expect(() => read('supabase/migrations/v9.68-ais-f11-s1-interview-sessions.sql')).not.toThrow());
  const mig = read('supabase/migrations/v9.68-ais-f11-s1-interview-sessions.sql');
  it('interview_sessions table created', () => expect(mig).toContain('CREATE TABLE IF NOT EXISTS interview_sessions'));
  it('session_type CHECK (behavioral/technical/company)', () => expect(mig).toMatch(/behavioral.*technical.*company/));
  it('aggregate_score column', () => expect(mig).toContain('aggregate_score'));
  it('RLS enabled', () => expect(mig).toContain('ENABLE ROW LEVEL SECURITY'));
  const ef = read('supabase/functions/interview-practice/index.ts');
  it('start_session action', () => expect(ef).toContain("action === 'start_session'"));
  it('submit_answer action', () => expect(ef).toContain("action === 'submit_answer'"));
  it('end_session action', () => expect(ef).toContain("action === 'end_session'"));
  it('generates follow-up questions', () => expect(ef).toContain('follow_up'));
  it('aggregate scoring with weights', () => expect(ef).toContain('weights'));
  it('deducts 3 credits per session', () => expect(ef).toContain('SESSION_CREDITS = 3'));
  it('refunds on AI failure', () => expect(ef).toContain('interview_refund'));
  it('gateway route registered', () => expect(read('supabase/functions/api-gateway/index.ts')).toContain('"interview-practice"'));
});

// ── F11-S2: Interview Practice Chat UI ──────────────────────────────────
describe('AIS-F11-S2: interview practice chat UI', () => {
  const src = read('js/interview-prep.js');
  it('openInterviewPractice exported', () => expect(src).toContain('window.openInterviewPractice'));
  it('session type selector', () => expect(src).toContain('_ipStartSession'));
  it('answer submission', () => expect(src).toContain('window._ipSubmitAnswer'));
  it('feedback rendering with strength/gap', () => expect(src).toContain('fb.strength'));
  it('follow-up question shown', () => expect(src).toContain('follow_up_question'));
  it('interview_practice_started PostHog', () => expect(src).toContain("'interview_practice_started'"));
  it('interview_practice_completed PostHog', () => expect(src).toContain("'interview_practice_completed'"));
  it('end session on panel close', () => expect(src).toContain('_ipEndSession'));
});

// ── F12-S1: Resume A/B Testing Engine + Tables ──────────────────────────
describe('AIS-F12-S1: A/B testing tables + EF', () => {
  it('resume_ab_tests migration exists', () => expect(() => read('supabase/migrations/v9.69-ais-f12-s1-resume-ab-testing.sql')).not.toThrow());
  const mig = read('supabase/migrations/v9.69-ais-f12-s1-resume-ab-testing.sql');
  it('resume_ab_tests table', () => expect(mig).toContain('CREATE TABLE IF NOT EXISTS resume_ab_tests'));
  it('resume_ab_results table', () => expect(mig).toContain('CREATE TABLE IF NOT EXISTS resume_ab_results'));
  it('winner_id column', () => expect(mig).toContain('winner_id'));
  it('variant CHECK a/b', () => expect(mig).toContain("variant IN ('a','b')"));
  it('outcome column with states', () => expect(mig).toContain('interview'));
  it('RLS on both tables', () => { const c = (mig.match(/ENABLE ROW LEVEL SECURITY/g)||[]).length; expect(c).toBe(2); });
  const ef = read('supabase/functions/resume-ab-assign/index.ts');
  it('assign action round-robin', () => expect(ef).toContain("action === 'assign'"));
  it('record_outcome action', () => expect(ef).toContain("action === 'record_outcome'"));
  it('get_results action with metrics', () => expect(ef).toContain("action === 'get_results'"));
  it('chi-squared p-value calculation', () => expect(ef).toContain('pValue'));
  it('auto-winner declaration at p<0.05', () => expect(ef).toContain('p < 0.05'));
  it('gateway route registered', () => expect(read('supabase/functions/api-gateway/index.ts')).toContain('"resume-ab-assign"'));
});

// ── F12-S2: A/B Testing Results Dashboard ───────────────────────────────
describe('AIS-F12-S2: A/B testing results dashboard', () => {
  const src = read('js/resumes.js');
  it('loadAbTestDashboard exported', () => expect(src).toContain('window.loadAbTestDashboard'));
  it('loadAbMetrics calls EF', () => expect(src).toContain('resume-ab-assign'));
  it('bar chart for variant comparison', () => expect(src).toContain('Variant A'));
  it('statistical significance shown', () => expect(src).toContain('statistically_significant'));
  it('p-value displayed', () => expect(src).toContain('p_value'));
  it('winner declaration notification', () => expect(src).toContain('Winner Declared'));
  it('resume_ab_winner_declared PostHog', () => expect(src).toContain("'resume_ab_winner_declared'"));
  it('openCreateAbTest modal', () => expect(src).toContain('window.openCreateAbTest'));
  it('resume_ab_test_created PostHog', () => expect(src).toContain("'resume_ab_test_created'"));
  it('pauseAbTest function', () => expect(src).toContain('window.pauseAbTest'));
  it('min sample size message shown', () => expect(src).toContain('min_sample_reached'));
});

// ── Version ──────────────────────────────────────────────────────────────
describe('AIS Phase D: version', () => {
  it('version is v9.68', () => expect(read('js/version.js')).toContain('v9.68'));
  it('dist bundle at v9.68', () => expect(read('dist/dashboard.min.js')).toContain('v9.68'));
});
