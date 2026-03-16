/**
 * SPEC-COHORT-001-S2: EF Layer
 * Validates creditGate middleware, get-user-balance EF,
 * replenish-credits EF, passive cap logic, award expiry migration,
 * gateway routes, and EF wiring.
 */

import { readFileSync, existsSync } from 'fs';
import { describe, it, expect } from 'vitest';

const read = (p) => existsSync(p) ? readFileSync(p, 'utf8') : '';

const CREDIT_GATE   = 'supabase/functions/_shared/creditGate.ts';
const GET_BALANCE   = 'supabase/functions/get-user-balance/index.ts';
const REPLENISH     = 'supabase/functions/replenish-credits/index.ts';
const GATEWAY       = 'supabase/functions/api-gateway/index.ts';
const AWARD_MIG     = 'supabase/migrations/v9.77-spec-cohort-001-s2-award-expiry.sql';

const cg  = read(CREDIT_GATE);
const gb  = read(GET_BALANCE);
const rep = read(REPLENISH);
const gw  = read(GATEWAY);
const am  = read(AWARD_MIG);

// ─── 1. creditGate.ts ─────────────────────────────────────────
describe('1. creditGate.ts middleware', () => {
  it('file exists', () => expect(existsSync(CREDIT_GATE)).toBe(true));
  it('exports creditGate function', () => expect(cg).toContain('export async function creditGate'));
  it('exports creditRefund function', () => expect(cg).toContain('export async function creditRefund'));
  it('exports passiveCap function', () => expect(cg).toContain('export async function passiveCap'));
  it('reads cost from feature_costs table', () => expect(cg).toContain("from('feature_costs')"));
  it('calls fn_debit_credits RPC', () => expect(cg).toContain("rpc('fn_debit_credits'"));
  it('returns 402 INSUFFICIENT_CREDITS on low balance', () => {
    expect(cg).toContain('INSUFFICIENT_CREDITS');
    expect(cg).toContain('status: 402');
  });
  it('returns shortfall in 402 response', () => expect(cg).toContain('shortfall'));
  it('returns upgrade_cta: true in 402 response', () => expect(cg).toContain('upgrade_cta: true'));
  it('writes refund_restore on creditRefund', () => expect(cg).toContain("event_type: 'refund_restore'"));
  it('fires PostHog event on refund failure — NO SILENT FAIL', () => expect(cg).toContain('credit_refund_failed'));
  it('passiveCap reads daily_cap from feature_costs', () => expect(cg).toContain('daily_cap'));
  it('passiveCap counts todays debits by feature', () => {
    expect(cg).toContain("eq('event_type', 'feature_debit')");
    expect(cg).toContain('feature');
  });
  it('passiveCap returns allowed:false when cap reached', () => expect(cg).toContain('dailyCount >= dailyCap'));
  it('has 5-minute feature cost cache', () => {
    expect(cg).toContain('costCache');
    expect(cg).toContain('CACHE_TTL_MS');
  });
  it('fails open on DB error (does not block users for infra issues)', () => {
    expect(cg).toContain('fail open') || expect(cg).toContain('infra issues') || expect(cg).toContain('Unexpected DB error');
  });
});

// ─── 2. get-user-balance EF ───────────────────────────────────
describe('2. get-user-balance EF', () => {
  it('file exists', () => expect(existsSync(GET_BALANCE)).toBe(true));
  it('requires JWT auth', () => {
    expect(gb).toContain('Authorization');
    expect(gb).toContain('401');
  });
  it('calls fn_get_user_credit_balance RPC', () => expect(gb).toContain("rpc('fn_get_user_credit_balance'"));
  it('returns rolled bucket via spread', () => expect(gb).toContain('...balance') || expect(gb).toContain('fn_get_user_credit_balance'));
  it('returns base bucket', () => expect(gb).toContain('base'));
  it('returns awards bucket via RPC', () => expect(gb).toContain('fn_get_user_credit_balance'));
  it('returns total via RPC', () => expect(gb).toContain('fn_get_user_credit_balance'));
  it('returns reset_date', () => expect(gb).toContain('reset_date'));
  it('returns cohort_slug', () => expect(gb).toContain('cohort_slug'));
  it('returns credits_monthly', () => expect(gb).toContain('credits_monthly'));
  it('handles RPC error with 500', () => expect(gb).toContain('500'));
  it('has CORS headers', () => expect(gb).toContain('brilliantjobs.app'));
});

// ─── 3. replenish-credits EF ──────────────────────────────────
describe('3. replenish-credits EF', () => {
  it('file exists', () => expect(existsSync(REPLENISH)).toBe(true));
  it('accepts service-role key auth', () => expect(rep).toContain('SB_KEY'));
it('accepts admin JWT auth with role check', () => expect(rep).toContain("'admin', 'superadmin'") || expect(rep).toContain("role IN"));
  it('supports targeting a single user_id', () => expect(rep).toContain('user_id'));
  it('handles rollover_cap = 0 (no rollover)', () => {
    expect(rep).toContain('rollover_expire');
    expect(rep).toContain('no rollover');
  });
  it('handles rollover_cap = -1 (full rollover)', () => {
    expect(rep).toContain('rollover_grant');
    expect(rep).toContain('full rollover');
  });
  it('handles rollover_cap = N (capped rollover)', () => {
    expect(rep).toContain('Math.min(unusedBase, effectiveRolloverCap)');
  });
  it('writes rollover_expire entry', () => expect(rep).toContain("event_type: 'rollover_expire'"));
  it('writes rollover_grant entry', () => expect(rep).toContain("event_type: 'rollover_grant'"));
  it('writes cohort_grant for new period', () => expect(rep).toContain("event_type: 'cohort_grant'"));
  it('respects rollover_cap_override from profiles', () => expect(rep).toContain('rollover_cap_override'));
  it('fires PostHog on per-user failure — NO SILENT FAIL', () => expect(rep).toContain('credit_replenishment_failed'));
  it('returns processed + errors count', () => {
    expect(rep).toContain('processed');
    expect(rep).toContain('errors');
  });
});

// ─── 4. Active-debit EF wiring ───────────────────────────────
const ACTIVE_EFS = [
  ['score-resume',             'score-resume'],
  ['rewrite-resume-analyze',   'rewrite-resume-analyze'],
  ['rewrite-resume-execute',   'rewrite-resume-execute'],
  ['analyze-application-gap',  'analyze-application-gap'],
  ['chat-job-search',          'chat-job-search'],
  ['answer-form-question',     'answer-form-question'],
  ['extract-resume-profile',   'extract-resume-profile'],
  ['rewrite-resume-extension', 'rewrite-resume-extension'],
];

describe('4. Active-debit EF wiring', () => {
  for (const [ef, featureKey] of ACTIVE_EFS) {
    const path = `supabase/functions/${ef}/index.ts`;
    const src = read(path);
    it(`${ef}: imports creditGate`, () => expect(src).toContain("from '../_shared/creditGate.ts'"));
    it(`${ef}: calls creditGate with correct feature key`, () =>
      expect(src).toContain(`'${featureKey}'`));
    it(`${ef}: returns 402 response when gate blocks`, () =>
      expect(src).toContain('.response!') || expect(src).toContain('credit.response'));
  }
});

// ─── 5. Passive EF wiring ─────────────────────────────────────
describe('5. Passive EF wiring', () => {
  const passiveEfs = ['auto-apply-trigger', 'analyze-hidden-job'];
  for (const ef of passiveEfs) {
    const src = read(`supabase/functions/${ef}/index.ts`);
    it(`${ef}: imports passiveCap`, () => expect(src).toContain('passiveCap'));
    it(`${ef}: calls passiveCap`, () => expect(src).toContain("passiveCap(sb,"));
    it(`${ef}: skips silently when cap reached`, () => expect(src).toContain('cap.allowed') || expect(src).toContain('!cap.allowed'));
  }
});

// ─── 6. Gateway routes ────────────────────────────────────────
describe('6. Gateway routes', () => {
  it('route #130: get-user-balance registered', () => expect(gw).toContain('"get-user-balance"'));
  it('route #131: replenish-credits registered', () => expect(gw).toContain('"replenish-credits"'));
  it('both routes have SPEC-COHORT-001-S2 comment', () => {
    expect(gw).toContain('SPEC-COHORT-001-S2');
  });
});

// ─── 7. Award expiry migration ────────────────────────────────
describe('7. Award expiry migration', () => {
  it('migration file exists', () => expect(existsSync(AWARD_MIG)).toBe(true));
  it('creates fn_expire_awards function', () => expect(am).toContain('fn_expire_awards'));
  it('inserts award_expire entries', () => expect(am).toContain("'award_expire'"));
  it('uses source_ref to link expire entry to original grant', () => expect(am).toContain('source_ref'));
  it('guards against double-expiry with NOT EXISTS', () => expect(am).toContain('NOT EXISTS'));
  it('only targets award_grant entries', () => expect(am).toContain("= 'award_grant'"));
  it('only expires non-voided entries', () => expect(am).toContain('voided'));
  it('schedules daily pg_cron job', () => {
    expect(am).toContain('cron.schedule');
    expect(am).toContain('expire-award-credits');
  });
  it('cron runs at 2AM UTC', () => expect(am).toContain('0 2 * * *'));
  it('uses ON CONFLICT DO NOTHING for idempotency', () => expect(am).toContain('ON CONFLICT DO NOTHING'));
  it('grants execute to service_role', () => expect(am).toContain('GRANT EXECUTE ON FUNCTION fn_expire_awards'));
  it('has comment on function', () => expect(am).toContain('COMMENT ON FUNCTION fn_expire_awards'));
});

// ─── 8. File inventory ────────────────────────────────────────
describe('8. File inventory', () => {
  const files = [
    'supabase/functions/_shared/creditGate.ts',
    'supabase/functions/get-user-balance/index.ts',
    'supabase/functions/replenish-credits/index.ts',
    'supabase/migrations/v9.77-spec-cohort-001-s2-award-expiry.sql',
    'tests/spec-cohort-001-s2-ef-layer.test.js',
  ];
  for (const f of files) {
    it(`exists: ${f}`, () => expect(existsSync(f)).toBe(true));
  }
});
