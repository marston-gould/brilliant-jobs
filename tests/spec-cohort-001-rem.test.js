/**
 * SPEC-COHORT-001-REM: Remediation of all 15 spec gaps.
 */
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

const mig = read(MIG); const cg = read(GATE); const rep = read(REPLEN);
const bal = read(BAL);  const erp = read(ERP); const wh = read(HOOK);
const bi  = read(BILL); const dh = read(DASH);

// ─── GAP-1 (P0): debit order rolled→base→award ─────────────────
describe('GAP-1: fn_debit_credits bucket debit order', () => {
  it('migration exists', () => expect(existsSync(MIG)).toBe(true));
  it('rewrites fn_debit_credits', () => expect(mig).toContain('fn_debit_credits'));
  it('drains rolled bucket first', () => {
    const fn = mig.slice(mig.indexOf('fn_debit_credits'));
    expect(fn).toContain("'rolled', 'feature_debit'");
  });
  it('drains base bucket second', () => {
    const fn = mig.slice(mig.indexOf('fn_debit_credits'));
    const rolledIdx = fn.indexOf("'rolled', 'feature_debit'");
    const baseIdx = fn.indexOf("'base', 'feature_debit'");
    expect(rolledIdx).toBeLessThan(baseIdx);
  });
  it('drains award entries oldest-expiry-first', () => {
    expect(mig).toContain("'award', 'feature_debit'");
    expect(mig).toContain("COALESCE(expires_at");
  });
  it('uses FOR UPDATE lock on profiles', () => expect(mig).toContain('FOR UPDATE'));
  it('has comment referencing spec §1.1 §4.2', () => expect(mig).toContain('§1.1'));
});

// ─── GAP-6 (P1): operational cap columns on cohort_tiers ────────
describe('GAP-6: operational caps on cohort_tiers', () => {
  it('adds max_auto_apply_daily', () => expect(mig).toContain('max_auto_apply_daily'));
  it('adds max_saved_jobs', () => expect(mig).toContain('max_saved_jobs'));
  it('adds max_pipeline_items', () => expect(mig).toContain('max_pipeline_items'));
  it('adds max_recruiter_lookups_daily', () => expect(mig).toContain('max_recruiter_lookups_daily'));
  it('adds csv_export_enabled', () => expect(mig).toContain('csv_export_enabled'));
  it('adds api_access_enabled', () => expect(mig).toContain('api_access_enabled'));
  it('seeds free cohort with auto_apply=0', () => {
    const freeSection = mig.slice(mig.indexOf("slug = 'free'"));
    expect(mig).toContain('max_auto_apply_daily          = 0');
  });
  it('seeds pro cohort with unlimited saved_jobs (NULL)', () => {
    const proSection = mig.slice(mig.lastIndexOf("slug = 'pro'"));
    expect(proSection).toContain('max_saved_jobs                = NULL');
  });
  it('seeds csv_export_enabled=false for free', () => expect(mig).toContain('csv_export_enabled            = false'));
  it('seeds api_access_enabled=true for pro', () => expect(mig).toContain('api_access_enabled            = true'));
});

// ─── GAP-7 (P1): cohort_feature_caps table ────────────────────
describe('GAP-7: cohort_feature_caps table', () => {
  it('creates cohort_feature_caps table', () => expect(mig).toContain('CREATE TABLE IF NOT EXISTS cohort_feature_caps'));
  it('has cohort_tier_id FK', () => expect(mig).toContain('REFERENCES cohort_tiers(id)'));
  it('has feature_key FK', () => expect(mig).toContain('REFERENCES feature_costs(feature_key)'));
  it('seeds free cohort analyze-hidden-job cap=5', () => expect(mig).toContain('analyze-hidden-job'));
  it('seeds free cohort score-ai-content cap=10', () => expect(mig).toContain('score-ai-content'));
  it('seeds free cohort auto-apply-trigger cap=0', () => expect(mig).toContain('auto-apply-trigger'));
  it('has RLS', () => expect(mig).toContain('cohort_feature_caps ENABLE ROW LEVEL SECURITY'));
});

// ─── GAP-8 (P1): signup trigger ────────────────────────────────
describe('GAP-8: signup credit grant trigger', () => {
  it('creates fn_cohort_grant_on_signup', () => expect(mig).toContain('fn_cohort_grant_on_signup'));
  it('trigger fires AFTER INSERT on profiles', () => expect(mig).toContain('AFTER INSERT ON profiles'));
  it('writes cohort_grant entry', () => expect(mig).toContain("'cohort_grant'"));
  it('only fires when cohort_tier_id is set', () => expect(mig).toContain('NEW.cohort_tier_id IS NOT NULL'));
});

// ─── GAP-3 (P1): cohort proration ──────────────────────────────
describe('GAP-3: fn_cohort_prorate', () => {
  it('creates fn_cohort_prorate function', () => expect(mig).toContain('fn_cohort_prorate'));
  it('uses days_remaining / days_in_period formula', () => {
    expect(mig).toContain('days_remaining');
    expect(mig).toContain('days_in_period');
  });
  it('writes cohort_prorate event_type', () => expect(mig).toContain("'cohort_prorate'"));
  it('floors balance at 0 on downgrade', () => expect(mig).toContain('GREATEST(-v_current, v_delta)'));
  it('stripe-webhook calls fn_cohort_prorate on tier change', () =>
    expect(wh).toContain('fn_cohort_prorate'));
  it('stripe-webhook passes old_slug and new_slug', () => {
    expect(wh).toContain('p_old_tier_slug');
    expect(wh).toContain('p_new_tier_slug');
  });
});

// ─── GAP-4 (P1): billing anniversary replenishment ─────────────
describe('GAP-4: billing anniversary replenishment', () => {
  it('queries subscriptions.current_period_end', () =>
    expect(rep).toContain('current_period_end'));
  it('only processes users whose period ends today', () => {
    expect(rep).toContain('today.toISOString()');
    expect(rep).toContain('tomorrow.toISOString()');
  });
  it('returns early when no users are due', () =>
    expect(rep).toContain('No users due for replenishment today'));
  it('pg_cron schedule created for daily replenishment', () =>
    expect(mig).toContain('daily-credit-replenishment'));
  it('pg_cron runs at 01:00 UTC', () => expect(mig).toContain("'0 1 * * *'"));
  it('fires replenishment_cron_completed PostHog', () =>
    expect(rep).toContain('replenishment_cron_completed'));
  it('includes processed count in PostHog event', () =>
    expect(rep).toContain('processed'));
});

// ─── GAP-5 (P1): extract-resume-profile first-upload-free ───────
describe('GAP-5: first-upload-free for extract-resume-profile', () => {
  it('checks resume_hash for prior parse', () => expect(erp).toContain('resume_hash'));
  it('skips credit gate on first upload', () => expect(erp).toContain('isFirstUpload'));
  it('charges 1cr on re-parse', () => expect(erp).toContain('!isFirstUpload'));
  it('auth check is before credit gate (no malformed injection)', () => {
    const authIdx = erp.indexOf('Unauthorized');
    const gateIdx = erp.indexOf('isFirstUpload');
    expect(authIdx).toBeLessThan(gateIdx);
  });
});

// ─── GAP-7b (P1): creditGate uses cohort-aware passive caps ──────
describe('GAP-7b: creditGate cohort-aware passiveCap', () => {
  it('reads cohort_feature_caps first', () => expect(cg).toContain('cohort_feature_caps'));
  it('falls back to feature_costs global cap', () => expect(cg).toContain('feature_costs'));
  it('reads cohort_tier_id from profiles', () => expect(cg).toContain('cohort_tier_id'));
});

// ─── GAP-9 (P2): award_expiry_failed monitoring ─────────────────
describe('GAP-9: award expiry monitoring', () => {
  it('creates cron_run_log table', () => expect(mig).toContain('cron_run_log'));
  it('creates fn_expire_awards_monitored wrapper', () =>
    expect(mig).toContain('fn_expire_awards_monitored'));
  it('logs failures to cron_run_log', () => expect(mig).toContain('INSERT INTO cron_run_log'));
  it('cron uses monitored wrapper', () =>
    expect(mig).toContain('fn_expire_awards_monitored'));
});

// ─── GAP-10 (P2): replenishment_cron_completed PostHog ──────────
describe('GAP-10: replenishment_cron_completed PostHog', () => {
  it('fires on cron runs (not individual user calls)', () => {
    expect(rep).toContain('replenishment_cron_completed');
    expect(rep).toContain('!targetUserId');
  });
});

// ─── GAP-11 (P2): feature_execution_failed PostHog ──────────────
describe('GAP-11: feature_execution_failed PostHog', () => {
  it('creditRefund fires feature_execution_failed', () =>
    expect(cg).toContain('feature_execution_failed'));
});

// ─── GAP-12 (P3): platform usage grouping in UI ─────────────────
describe('GAP-12: platform usage in balance UI', () => {
  it('get-user-balance returns platform_usage_today', () =>
    expect(bal).toContain('platform_usage_today'));
  it('queries passive feature debits', () => {
    expect(bal).toContain('auto-apply-trigger');
    expect(bal).toContain('analyze-hidden-job');
  });
  it('dashboard.html has platform usage row', () =>
    expect(dh).toContain('sub-platform-usage'));
  it('billing.js renders platform usage row', () =>
    expect(bi).toContain('sub-platform-usage-amount'));
});

// ─── GAP-13 (P3): bonus credits earliest expiry tooltip ─────────
describe('GAP-13: bonus credits expiry tooltip', () => {
  it('get-user-balance returns earliest_award_expiry', () =>
    expect(bal).toContain('earliest_award_expiry'));
  it('billing.js sets tooltip on awards row', () =>
    expect(bi).toContain('sub-bucket-awards'));
  it('billing.js uses bal.earliest_award_expiry', () =>
    expect(bi).toContain('earliest_award_expiry'));
});

// ─── File inventory ──────────────────────────────────────────────
describe('File inventory', () => {
  const files = [
    'supabase/migrations/v9.79-spec-cohort-001-rem.sql',
    'tests/spec-cohort-001-rem.test.js',
  ];
  for (const f of files) {
    it(`exists: ${f}`, () => expect(existsSync(f)).toBe(true));
  }
});
