import { readFileSync, existsSync } from 'fs';
import { describe, it, expect } from 'vitest';
const read = (p) => existsSync(p) ? readFileSync(p, 'utf8') : '';

const MIG   = 'supabase/migrations/v9.79-spec-cohort-001-rem.sql';
const GATE  = 'supabase/functions/_shared/creditGate.ts';
const REPLEN = 'supabase/functions/replenish-credits/index.ts';
const BAL   = 'supabase/functions/get-user-balance/index.ts';
const ERP   = 'supabase/functions/extract-resume-profile/index.ts';
const HOOK  = 'supabase/functions/stripe-webhook/index.ts';
const BILL  = 'js/billing.js';
const DASH  = 'dashboard.html';

const mig  = read(MIG);
const cg   = read(GATE);
const rep  = read(REPLEN);
const bal  = read(BAL);
const erp  = read(ERP);
const wh   = read(HOOK);
const bi   = read(BILL);
const dh   = read(DASH);

describe('GAP-1: fn_debit_credits bucket debit order', () => {
  it('migration exists', () => expect(existsSync(MIG)).toBe(true));
  it('rewrites fn_debit_credits', () => expect(mig).toContain('fn_debit_credits'));
  it('drains rolled bucket first', () => expect(mig).toContain("'rolled', 'feature_debit'"));
  it('drains base bucket second', () => {
    const rolledIdx = mig.indexOf("'rolled', 'feature_debit'");
    const baseIdx   = mig.indexOf("'base', 'feature_debit'");
    expect(rolledIdx).toBeGreaterThan(-1);
    expect(baseIdx).toBeGreaterThan(rolledIdx);
  });
  it('drains award oldest-expiry-first', () => {
    expect(mig).toContain("'award', 'feature_debit'");
    expect(mig).toContain('COALESCE(expires_at');
  });
  it('uses FOR UPDATE lock', () => expect(mig).toContain('FOR UPDATE'));
  it('references spec §1.1', () => expect(mig).toContain('§1.1'));
});

describe('GAP-6: operational caps on cohort_tiers', () => {
  it('adds max_auto_apply_daily',         () => expect(mig).toContain('max_auto_apply_daily'));
  it('adds max_saved_jobs',               () => expect(mig).toContain('max_saved_jobs'));
  it('adds max_pipeline_items',           () => expect(mig).toContain('max_pipeline_items'));
  it('adds max_recruiter_lookups_daily',  () => expect(mig).toContain('max_recruiter_lookups_daily'));
  it('adds csv_export_enabled',           () => expect(mig).toContain('csv_export_enabled'));
  it('adds api_access_enabled',           () => expect(mig).toContain('api_access_enabled'));
  it('seeds free cohort auto_apply=0',    () => expect(mig).toContain('max_auto_apply_daily          = 0'));
  it('seeds pro cohort with NULL saved_jobs', () => {
    const idx = mig.lastIndexOf("slug = 'pro'");
    expect(mig.slice(idx, idx + 300)).toContain('max_saved_jobs                = NULL');
  });
  it('seeds csv_export=false for free',   () => expect(mig).toContain('csv_export_enabled            = false'));
  it('seeds api_access=true for pro',     () => expect(mig).toContain('api_access_enabled            = true'));
});

describe('GAP-7: cohort_feature_caps table', () => {
  it('creates cohort_feature_caps',       () => expect(mig).toContain('CREATE TABLE IF NOT EXISTS cohort_feature_caps'));
  it('has cohort_tier_id FK',             () => expect(mig).toContain('REFERENCES cohort_tiers(id)'));
  it('has feature_key FK',               () => expect(mig).toContain('REFERENCES feature_costs(feature_key)'));
  it('seeds analyze-hidden-job cap=5',   () => expect(mig).toContain('analyze-hidden-job'));
  it('seeds score-ai-content cap=10',    () => expect(mig).toContain('score-ai-content'));
  it('seeds auto-apply-trigger cap=0',   () => expect(mig).toContain('auto-apply-trigger'));
  it('has RLS',                          () => expect(mig).toContain('cohort_feature_caps ENABLE ROW LEVEL SECURITY'));
});

describe('GAP-8: signup credit grant trigger', () => {
  it('creates fn_cohort_grant_on_signup', () => expect(mig).toContain('fn_cohort_grant_on_signup'));
  it('fires AFTER INSERT on profiles',    () => expect(mig).toContain('AFTER INSERT ON profiles'));
  it('writes cohort_grant entry',         () => expect(mig).toContain("'cohort_grant'"));
  it('only fires when cohort_tier_id set',() => expect(mig).toContain('NEW.cohort_tier_id IS NOT NULL'));
});

describe('GAP-3: fn_cohort_prorate', () => {
  it('creates fn_cohort_prorate',         () => expect(mig).toContain('fn_cohort_prorate'));
  it('uses days_remaining formula',       () => expect(mig).toContain('days_remaining'));
  it('writes cohort_prorate event',       () => expect(mig).toContain("'cohort_prorate'"));
  it('floors balance at 0 on downgrade', () => expect(mig).toContain('GREATEST(-v_current, v_delta)'));
  it('stripe-webhook calls fn_cohort_prorate', () => expect(wh).toContain('fn_cohort_prorate'));
  it('passes p_old_tier_slug',            () => expect(wh).toContain('p_old_tier_slug'));
  it('passes p_new_tier_slug',            () => expect(wh).toContain('p_new_tier_slug'));
});

describe('GAP-4: billing anniversary replenishment', () => {
  it('queries current_period_end',        () => expect(rep).toContain('current_period_end'));
  it('only processes users due today',    () => {
    expect(rep).toContain('today.toISOString()');
    expect(rep).toContain('tomorrow.toISOString()');
  });
  it('returns early with no-users message', () => expect(rep).toContain('No users due for replenishment today'));
  it('pg_cron daily schedule created',   () => expect(mig).toContain('daily-credit-replenishment'));
  it('runs at 01:00 UTC',                () => expect(mig).toContain("'0 1 * * *'"));
  it('fires replenishment_cron_completed', () => expect(rep).toContain('replenishment_cron_completed'));
});

describe('GAP-5: first-upload-free for extract-resume-profile', () => {
  it('checks resume_hash',                () => expect(erp).toContain('resume_hash'));
  it('isFirstUpload logic exists',        () => expect(erp).toContain('isFirstUpload'));
  it('gates only on re-parse',            () => expect(erp).toContain('!isFirstUpload'));
  it('auth check before credit gate',     () => {
    expect(erp.indexOf('Unauthorized')).toBeLessThan(erp.indexOf('isFirstUpload'));
  });
});

describe('GAP-7b: cohort-aware passiveCap', () => {
  it('reads cohort_feature_caps',         () => expect(cg).toContain('cohort_feature_caps'));
  it('falls back to feature_costs',       () => expect(cg).toContain('feature_costs'));
  it('reads cohort_tier_id',              () => expect(cg).toContain('cohort_tier_id'));
});

describe('GAP-9: award expiry monitoring', () => {
  it('creates cron_run_log',              () => expect(mig).toContain('cron_run_log'));
  it('creates fn_expire_awards_monitored',() => expect(mig).toContain('fn_expire_awards_monitored'));
  it('logs failures to cron_run_log',     () => expect(mig).toContain('INSERT INTO cron_run_log'));
});

describe('GAP-10: replenishment_cron_completed PostHog', () => {
  it('fires on cron runs only',           () => expect(rep).toContain('replenishment_cron_completed'));
  it('skips on individual user calls',    () => expect(rep).toContain('!targetUserId'));
});

describe('GAP-11: feature_execution_failed PostHog', () => {
  it('fires in creditRefund',             () => expect(cg).toContain('feature_execution_failed'));
});

describe('GAP-12: platform usage in balance UI', () => {
  it('get-user-balance returns platform_usage_today', () => expect(bal).toContain('platform_usage_today'));
  it('queries passive feature debits',    () => expect(bal).toContain('auto-apply-trigger'));
  it('dashboard has platform usage row',  () => expect(dh).toContain('sub-platform-usage'));
  it('billing.js renders it',            () => expect(bi).toContain('sub-platform-usage-amount'));
});

describe('GAP-13: bonus credits expiry tooltip', () => {
  it('get-user-balance returns earliest_award_expiry', () => expect(bal).toContain('earliest_award_expiry'));
  it('billing.js sets tooltip',           () => expect(bi).toContain('earliest_award_expiry'));
});

describe('File inventory', () => {
  it('migration exists', () => expect(existsSync(MIG)).toBe(true));
  it('test file exists',  () => expect(existsSync('tests/spec-cohort-001-rem.test.js')).toBe(true));
});
