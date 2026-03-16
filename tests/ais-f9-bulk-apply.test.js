/**
 * AIS-F9: Bulk Apply (S1 multi-select, S2 queue EF, S3 progress dashboard)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('AIS-F9-S1: bulk apply multi-select UI', () => {
  it('checkbox column in job-feed.js rows', () => expect(read('js/job-feed.js')).toContain('bulk-job-cb'));
  it('select-all header checkbox in dashboard.html', () => expect(read('dashboard.html')).toContain('bulk-select-all'));
  it('bulk action bar in dashboard.html', () => expect(read('dashboard.html')).toContain('bulk-action-bar'));
  it('selection count badge', () => expect(read('dashboard.html')).toContain('bulk-count-badge'));
  it('estimated credit cost display', () => expect(read('dashboard.html')).toContain('bulk-credit-cost'));
  it('bulk-apply.js: _bulkToggleJob', () => expect(read('js/bulk-apply.js')).toContain('window._bulkToggleJob'));
  it('bulk-apply.js: _bulkSelectAll', () => expect(read('js/bulk-apply.js')).toContain('window._bulkSelectAll'));
  it('bulk-apply.js: _bulkClearSelection', () => expect(read('js/bulk-apply.js')).toContain('window._bulkClearSelection'));
  it('bulk-apply.js: credit cost estimation', () => expect(read('js/bulk-apply.js')).toContain('CREDITS_PER_APPLICATION'));
  it('bulk-apply.js in build.js', () => expect(read('build.js')).toContain("'js/bulk-apply.js'"));
  it('PostHog bulk_apply_initiated event', () => expect(read('js/bulk-apply.js')).toContain('bulk_apply_initiated'));
});

describe('AIS-F9-S2: bulk apply queue EF', () => {
  const ef = read('supabase/functions/bulk-apply-queue/index.ts');
  it('EF file exists', () => expect(ef).toBeTruthy());
  it('auth required', () => expect(ef).toContain('Authorization required'));
  it('MAX_BULK = 25 safety cap', () => expect(ef).toContain('MAX_BULK'));
  it('inserts to bulk_apply_jobs', () => expect(ef).toContain(".from('bulk_apply_jobs')"));
  it('triggers Fly.io worker per job', () => expect(ef).toContain('WORKER_URL'));
  it('jitter between submissions', () => expect(ef).toContain('Math.random'));
  it('gateway route registered', () => expect(read('supabase/functions/api-gateway/index.ts')).toContain('"bulk-apply-queue"'));
  it('bulk_apply_jobs migration exists', () => expect(read('supabase/migrations/v9.66-ais-f9-s2-bulk-apply-jobs.sql')).toContain('CREATE TABLE IF NOT EXISTS bulk_apply_jobs'));
  it('migration has status CHECK', () => expect(read('supabase/migrations/v9.66-ais-f9-s2-bulk-apply-jobs.sql')).toContain("'queued'"));
  it('migration has RLS', () => expect(read('supabase/migrations/v9.66-ais-f9-s2-bulk-apply-jobs.sql')).toContain('ENABLE ROW LEVEL SECURITY'));
  it('_bulkApplyQueue calls EF', () => expect(read('js/bulk-apply.js')).toContain('bulk-apply-queue'));
  it('reportError on failure — no silent fail', () => expect(read('js/bulk-apply.js')).toContain('reportError'));
});

describe('AIS-F9-S3: bulk apply progress dashboard', () => {
  it('progress panel in dashboard.html', () => expect(read('dashboard.html')).toContain('bulk-progress-panel'));
  it('progress bar element', () => expect(read('dashboard.html')).toContain('bulk-progress-bar'));
  it('per-job status list', () => expect(read('dashboard.html')).toContain('bulk-job-status-list'));
  it('_bulkPollProgress polls bulk_apply_jobs', () => expect(read('js/bulk-apply.js')).toContain('_bulkPollProgress'));
  it('polls at 5s intervals', () => expect(read('js/bulk-apply.js')).toContain('5000'));
  it('daily limit safety check', () => expect(read('js/bulk-apply.js')).toContain('_bulkCheckDailyLimit'));
  it('daily limit capped at 25', () => expect(read('js/bulk-apply.js')).toContain('<= 25'));
  it('PostHog bulk_apply_complete event', () => expect(read('js/bulk-apply.js')).toContain('bulk_apply_complete'));
});

describe('AIS-F9: version', () => {
  it('version is v9.67', () => expect(read('js/version.js')).toContain('v9.67'));
});
