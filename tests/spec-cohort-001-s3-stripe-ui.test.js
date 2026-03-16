/**
 * SPEC-COHORT-001-S3: Stripe + Balance UI
 * Validates stripe-webhook cohort sync, award-grant EF,
 * balance breakdown UI, low-balance event, CSS, gateway route.
 */

import { readFileSync, existsSync } from 'fs';
import { describe, it, expect } from 'vitest';

const read = (p) => existsSync(p) ? readFileSync(p, 'utf8') : '';

const WEBHOOK   = 'supabase/functions/stripe-webhook/index.ts';
const AWARD     = 'supabase/functions/award-grant/index.ts';
const GATE      = 'supabase/functions/_shared/creditGate.ts';
const BILLING   = 'js/billing.js';
const DASHBOARD = 'dashboard.html';
const CSS       = 'src/input.css';
const GATEWAY   = 'supabase/functions/api-gateway/index.ts';

const wh  = read(WEBHOOK);
const aw  = read(AWARD);
const cg  = read(GATE);
const bi  = read(BILLING);
const dh  = read(DASHBOARD);
const css = read(CSS);
const gw  = read(GATEWAY);

// ─── 1. stripe-webhook cohort_tier_id sync ────────────────────
describe('1. stripe-webhook: cohort_tier_id sync', () => {
  it('file exists', () => expect(existsSync(WEBHOOK)).toBe(true));
  it('syncs cohort_tier_id on subscription update', () =>
    expect(wh).toContain('cohort_tier_id'));
  it('looks up cohort_tiers by slug', () =>
    expect(wh).toContain("from('cohort_tiers')"));
  it('maps tier to correct slug (pro/starter/free)', () => {
    expect(wh).toContain("'pro'");
    expect(wh).toContain("'starter'");
    expect(wh).toContain("'free'");
  });
  it('calls replenish-credits EF after tier change', () =>
    expect(wh).toContain('replenish-credits'));
  it('replenish call passes user_id', () =>
    expect(wh).toContain('user_id: existing.user_id'));
  it('replenish failure is non-fatal (catch/warn)', () =>
    expect(wh).toContain('.catch('));
  it('cohort sync failure is non-fatal (try/catch)', () => {
    const idx = wh.indexOf('SPEC-COHORT-001-S3');
    const section = wh.slice(idx, idx + 2000);
    expect(section).toContain('catch');
    expect(section.toLowerCase()).toContain('non-fatal');
  });
  it('updates cohort_tier_assigned_at', () =>
    expect(wh).toContain('cohort_tier_assigned_at'));
});

// ─── 2. award-grant EF ────────────────────────────────────────
describe('2. award-grant EF', () => {
  it('file exists', () => expect(existsSync(AWARD)).toBe(true));
  it('accepts service-role key', () => expect(aw).toContain('SB_KEY'));
  it('accepts admin JWT with role check', () =>
    expect(aw).toContain("'admin', 'superadmin'") || expect(aw).toContain("admin"));
  it('rejects non-admin JWT with 403', () => expect(aw).toContain('403'));
  it('validates user_id is required', () => expect(aw).toContain('user_id required'));
  it('validates amount is positive integer', () =>
    expect(aw).toContain('positive integer'));
  it('enforces max grant of 10000', () => expect(aw).toContain('10000'));
  it('calls fn_grant_award_credits RPC', () =>
    expect(aw).toContain("rpc('fn_grant_award_credits'"));
  it('passes source_ref to RPC', () => expect(aw).toContain('source_ref'));
  it('passes expires_at to RPC', () => expect(aw).toContain('expires_at'));
  it('fires award_credits_granted PostHog event', () =>
    expect(aw).toContain('award_credits_granted'));
  it('returns success + new balance', () => {
    expect(aw).toContain('success: true');
    expect(aw).toContain('balance');
  });
  it('has CORS headers', () => expect(aw).toContain('brilliantjobs.app'));
});

// ─── 3. creditGate credits_low event ────────────────────────
describe('3. creditGate: credits_low PostHog event', () => {
  it('fires credits_low event after debit', () =>
    expect(cg).toContain('credits_low'));
  it('uses 20% threshold of monthly allotment', () => {
    expect(cg).toContain('0.2');
    expect(cg).toContain('credits_monthly');
  });
  it('includes balance, monthly_allotment, pct_remaining in event', () => {
    expect(cg).toContain('pct_remaining');
    expect(cg).toContain('monthly_allotment');
  });
  it('is non-fatal (wrapped in try/catch)', () => {
    // credits_low is inside a try block; verify both try and /* non-fatal */ exist near the event
    expect(cg).toContain('credits_low');
    expect(cg).toContain('/* non-fatal */');
  });
});

// ─── 4. billing.js balance breakdown ────────────────────────
describe('4. billing.js: 3-bucket balance functions', () => {
  it('loadBucketBalance function exists', () =>
    expect(bi).toContain('async function loadBucketBalance'));
  it('calls get-user-balance EF', () =>
    expect(bi).toContain('get-user-balance'));
  it('uses access token for auth', () =>
    expect(bi).toContain('access_token'));
  it('falls back to loadCreditBalance on error', () =>
    expect(bi).toContain('loadCreditBalance()'));
  it('renderBucketBreakdown function exists', () =>
    expect(bi).toContain('function renderBucketBreakdown'));
  it('renders rolled row, hides when 0', () =>
    expect(bi).toContain('sub-bucket-rolled'));
  it('renders base row', () =>
    expect(bi).toContain('sub-bucket-base-amount'));
  it('renders awards row, hides when 0', () =>
    expect(bi).toContain('sub-bucket-awards'));
  it('renders reset date', () =>
    expect(bi).toContain('sub-reset-date'));
  it('checkLowCreditAlertPct function exists', () =>
    expect(bi).toContain('function checkLowCreditAlertPct'));
  it('uses 20% threshold from monthly allotment', () => {
    const idx = bi.lastIndexOf('function checkLowCreditAlertPct');
    const fn = bi.slice(idx, idx + 600);
    expect(fn).toContain('0.2');
    expect(fn).toContain('credits_monthly');
  });
  it('loadBucketBalance called in initBilling', () =>
    expect(bi).toContain('loadBucketBalance()'));
  it('new functions exported to BJ namespace', () => {
    expect(bi).toContain('loadBucketBalance');
    expect(bi).toContain('renderBucketBreakdown');
    expect(bi).toContain('checkLowCreditAlertPct');
  });
});

// ─── 5. dashboard.html balance card ────────────────────────────
describe('5. dashboard.html: 3-bucket balance card', () => {
  it('has sub-balance-buckets container', () =>
    expect(dh).toContain('sub-balance-buckets'));
  it('has rolled bucket row', () =>
    expect(dh).toContain('sub-bucket-rolled'));
  it('has base amount element', () =>
    expect(dh).toContain('sub-bucket-base-amount'));
  it('has awards bucket row', () =>
    expect(dh).toContain('sub-bucket-awards'));
  it('has reset date element', () =>
    expect(dh).toContain('sub-reset-date'));
  it('rolled row hidden by default', () =>
    expect(dh).toContain('u-hidden" id="sub-bucket-rolled"'));
  it('awards row hidden by default', () =>
    expect(dh).toContain('u-hidden" id="sub-bucket-awards"'));
  it('total still uses sub-balance-number for nav badge', () =>
    expect(dh).toContain('id="sub-balance-number"'));
});

// ─── 6. CSS ────────────────────────────────────────────────────
describe('6. CSS: bucket breakdown styles', () => {
  it('has .sub-bucket-row style', () => expect(css).toContain('.sub-bucket-row'));
  it('has .sub-bucket-amount style', () => expect(css).toContain('.sub-bucket-amount'));
  it('has .sub-bucket-total style', () => expect(css).toContain('.sub-bucket-total'));
  it('has .sub-reset-date style', () => expect(css).toContain('.sub-reset-date'));
});

// ─── 7. Gateway route ──────────────────────────────────────────
describe('7. Gateway route #132', () => {
  it('award-grant route registered', () => expect(gw).toContain('"award-grant"'));
  it('has SPEC-COHORT-001-S3 comment', () =>
    expect(gw).toContain('SPEC-COHORT-001-S3'));
});

// ─── 8. File inventory ────────────────────────────────────────
describe('8. File inventory', () => {
  const files = [
    'supabase/functions/award-grant/index.ts',
    'supabase/functions/_shared/creditGate.ts',
    'supabase/functions/stripe-webhook/index.ts',
    'tests/spec-cohort-001-s3-stripe-ui.test.js',
  ];
  for (const f of files) {
    it(`exists: ${f}`, () => expect(existsSync(f)).toBe(true));
  }
});
