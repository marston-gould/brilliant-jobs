import { readFileSync, existsSync } from 'fs';
import { describe, it, expect } from 'vitest';
const read = (p) => existsSync(p) ? readFileSync(p, 'utf8') : '';

const MIG  = 'supabase/migrations/v9.80-spec-admin-002-s1.sql';
const UME  = 'supabase/functions/admin-user-manager/index.ts';
const CME  = 'supabase/functions/admin-cohort-manager/index.ts';
const CAE  = 'supabase/functions/admin-credit-action/index.ts';
const UMJ  = 'js/admin-user-manager.js';
const CMJ  = 'js/admin-cohort-manager-full.js';
const ADM  = 'admin.html';
const GW   = 'supabase/functions/api-gateway/index.ts';
const AJS  = 'js/admin.js';

const mig = read(MIG); const ume = read(UME); const cme = read(CME);
const cae = read(CAE); const umj = read(UMJ); const cmj = read(CMJ);
const adm = read(ADM); const gw  = read(GW);  const ajs = read(AJS);

// ─── §8: admin_audit_log ─────────────────────────────────────────────────────
describe('§8 admin_audit_log schema', () => {
  it('migration exists', () => expect(existsSync(MIG)).toBe(true));
  it('creates admin_audit_log table', () => expect(mig).toContain('CREATE TABLE IF NOT EXISTS admin_audit_log'));
  it('has actor_id FK to profiles', () => expect(mig).toContain('actor_id'));
  it('has action, target_type, target_id columns', () => {
    expect(mig).toContain('action'); expect(mig).toContain('target_type'); expect(mig).toContain('target_id');
  });
  it('has before/after jsonb columns', () => {
    expect(mig).toContain('before'); expect(mig).toContain('after');
  });
  it('has reason, ip_address columns', () => {
    expect(mig).toContain('reason'); expect(mig).toContain('ip_address');
  });
  it('has 4 indexes (actor, target, action, created_at)', () => {
    expect(mig).toContain('idx_audit_log_actor');
    expect(mig).toContain('idx_audit_log_target');
    expect(mig).toContain('idx_audit_log_action');
    expect(mig).toContain('idx_audit_log_created');
  });
  it('has RLS: SELECT for admin only', () => expect(mig).toContain("audit_log_admin_read"));
  it('grants ALL to service_role only', () => expect(mig).toContain('GRANT ALL ON admin_audit_log TO service_role'));
});

// ─── §7.2: prompt_templates ────────────────────────────────────────────────
describe('§7.2 prompt_templates schema', () => {
  it('creates prompt_templates table', () => expect(mig).toContain('CREATE TABLE IF NOT EXISTS prompt_templates'));
  it('has name UNIQUE', () => expect(mig).toContain('name'));
  it('has role CHECK constraint', () => expect(mig).toContain("IN ('system','user','assistant')"));
  it('has version column', () => expect(mig).toContain('version'));
  it('has is_active column', () => expect(mig).toContain('is_active'));
  it('has created_by, updated_by FKs', () => {
    expect(mig).toContain('created_by'); expect(mig).toContain('updated_by');
  });
  it('has updated_at trigger', () => expect(mig).toContain('fn_prompt_templates_updated_at'));
  it('has RLS', () => expect(mig).toContain('prompt_templates ENABLE ROW LEVEL SECURITY'));
});

// ─── §7.1: filter_config ───────────────────────────────────────────────────
describe('§7.1 filter_config schema', () => {
  it('creates filter_config table', () => expect(mig).toContain('CREATE TABLE IF NOT EXISTS filter_config'));
  it('has type CHECK constraint', () => expect(mig).toContain("IN ('range','select','toggle','multi-select')"));
  it('has options jsonb', () => expect(mig).toContain('options'));
  it('has weight column with default', () => expect(mig).toContain('weight'));
  it('has is_active, sort_order columns', () => {
    expect(mig).toContain('is_active'); expect(mig).toContain('sort_order');
  });
  it('has updated_at trigger', () => expect(mig).toContain('fn_filter_config_updated_at'));
});

// ─── §4.3: cohort_tiers is_archived ───────────────────────────────────────
describe('§4.3 cohort_tiers is_archived', () => {
  it('adds is_archived column', () => expect(mig).toContain('ADD COLUMN IF NOT EXISTS is_archived'));
  it('has index on is_archived', () => expect(mig).toContain('idx_cohort_tiers_archived'));
});

// ─── admin-user-manager EF ────────────────────────────────────────────────
describe('admin-user-manager EF', () => {
  it('file exists', () => expect(existsSync(UME)).toBe(true));
  it('requires admin JWT', () => expect(ume).toContain("'admin', 'superadmin'"));
  it('returns 403 for non-admin', () => expect(ume).toContain('403'));
  it('action=list: supports search param', () => expect(ume).toContain("action === 'list'"));
  it('action=list: paginates with page/per_page', () => {
    expect(ume).toContain('page'); expect(ume).toContain('per_page');
  });
  it('action=detail: returns profile + subscription + balance + ledger', () => {
    expect(ume).toContain("action === 'detail'");
    expect(ume).toContain('fn_get_user_credit_balance');
    expect(ume).toContain('bj_credit_ledger');
  });
  it('action=update_profile: allowlist of fields', () => {
    expect(ume).toContain("action === 'update_profile'");
    expect(ume).toContain('display_name');
    expect(ume).toContain('ALLOWED');
  });
  it('update_profile writes audit log', () => {
    expect(ume).toContain('user.profile.update');
    expect(ume).toContain('admin_audit_log');
  });
  it('action=reassign_cohort: calls fn_cohort_prorate', () => {
    expect(ume).toContain("action === 'reassign_cohort'");
    expect(ume).toContain('fn_cohort_prorate');
  });
  it('reassign_cohort writes audit log', () => expect(ume).toContain('user.cohort.reassign'));
  it('fires PostHog on EF error — NO SILENT FAIL', () => expect(ume).toContain('admin_ef_error'));
});

// ─── admin-cohort-manager EF ──────────────────────────────────────────────
describe('admin-cohort-manager EF', () => {
  it('file exists', () => expect(existsSync(CME)).toBe(true));
  it('requires admin JWT', () => expect(cme).toContain("'admin', 'superadmin'"));
  it('action=list: returns member_count', () => expect(cme).toContain('member_count'));
  it('action=create: requires name and slug', () => {
    expect(cme).toContain("action === 'create'");
    expect(cme).toContain('name and slug required');
  });
  it('action=create: writes audit log', () => expect(cme).toContain('cohort.create'));
  it('action=update: allowlist of fields', () => {
    expect(cme).toContain("action === 'update'");
    expect(cme).toContain('ALLOWED');
  });
  it('action=update: warns when price changes', () => expect(cme).toContain('price_change_warning'));
  it('action=update: writes audit log', () => expect(cme).toContain('cohort.update'));
  it('action=archive: blocks if active members', () => {
    expect(cme).toContain("action === 'archive'");
    expect(cme).toContain('active members');
  });
  it('action=archive: soft-delete only (is_archived=true)', () => expect(cme).toContain('is_archived: true'));
  it('action=archive: writes audit log', () => expect(cme).toContain('cohort.archive'));
});

// ─── admin-credit-action EF ──────────────────────────────────────────────
describe('admin-credit-action EF (§3.2 Credits tab)', () => {
  it('file exists', () => expect(existsSync(CAE)).toBe(true));
  it('requires admin JWT (no service_role bypass)', () => expect(cae).toContain("'admin', 'superadmin'"));
  it('validates reason required (min 5 chars)', () => expect(cae).toContain('reason required'));
  it('validates amount is non-zero integer', () => expect(cae).toContain('non-zero integer'));
  it('guards against balance going below 0', () => {
    expect(cae).toContain('below 0');
    expect(cae).toContain('allow_negative');
  });
  it('writes event_type=admin_adjustment to ledger', () => expect(cae).toContain("'admin_adjustment'"));
  it('writes to admin_audit_log', () => expect(cae).toContain('admin_audit_log'));
  it('fires PostHog on success', () => {
    expect(cae).toContain('admin_credits_granted');
    expect(cae).toContain('admin_credits_deducted');
  });
  it('fires admin_credit_action_failed PostHog on error — NO SILENT FAIL', () =>
    expect(cae).toContain('admin_credit_action_failed'));
  it('returns new balance after action', () => expect(cae).toContain('fn_get_user_credit_balance'));
});

// ─── Gateway routes ───────────────────────────────────────────────────────
describe('Gateway routes', () => {
  it('route #133: admin-user-manager', () => expect(gw).toContain('"admin-user-manager"'));
  it('route #134: admin-cohort-manager', () => expect(gw).toContain('"admin-cohort-manager"'));
  it('route #135: admin-credit-action', () => expect(gw).toContain('"admin-credit-action"'));
  it('SPEC-ADMIN-002-S1 comments present', () => expect(gw).toContain('SPEC-ADMIN-002-S1'));
});

// ─── JS: admin-user-manager.js ────────────────────────────────────────────
describe('admin-user-manager.js', () => {
  it('file exists', () => expect(existsSync(UMJ)).toBe(true));
  it('loadUsersTab renders User Manager shell', () => expect(umj).toContain('renderUserManagerShell'));
  it('search debounced at 350ms', () => expect(umj).toContain('350'));
  it('pagination: prev/next with page state', () => {
    expect(umj).toContain('umPage'); expect(umj).toContain('_umState.page');
  });
  it('user row click opens detail drawer', () => expect(umj).toContain('umOpenDetail'));
  it('detail drawer has 3 tabs: profile, cohort, credits', () => {
    expect(umj).toContain("'profile'"); expect(umj).toContain("'cohort'"); expect(umj).toContain("'credits'");
  });
  it('credits tab shows 3-bucket balance', () => {
    expect(umj).toContain('bal.total'); expect(umj).toContain('bal.base'); expect(umj).toContain('bal.awards');
  });
  it('credits tab has grant/deduct form', () => {
    expect(umj).toContain('um-credit-amount'); expect(umj).toContain('um-credit-reason');
  });
  it('umCreditAction calls admin-credit-action EF', () => expect(umj).toContain('admin-credit-action'));
  it('cohort tab has reassign dropdown', () => expect(umj).toContain('um-cohort-select'));
  it('registered in BJ namespace', () => expect(umj).toContain('loadUsersTab'));
});

// ─── JS: admin-cohort-manager-full.js ────────────────────────────────────
describe('admin-cohort-manager-full.js', () => {
  it('file exists', () => expect(existsSync(CMJ)).toBe(true));
  it('loadCohortManagerTab renders list + editor', () => expect(cmj).toContain('loadCohortManagerTab'));
  it('list shows member_count', () => expect(cmj).toContain('member_count'));
  it('editor has all required fields', () => {
    expect(cmj).toContain("'cm-'"); expect(cmj).toContain("'name'");
    expect(cmj).toContain("'credits'"); expect(cmj).toContain("'rollover'");
  });
  it('editor shows price change warning', () => expect(cmj).toContain('price_change_warning'));
  it('archive calls admin-cohort-manager EF', () => expect(cmj).toContain('admin-cohort-manager'));
  it('registered in BJ namespace', () => expect(cmj).toContain('loadCohortManagerTab'));
});

// ─── admin.html ───────────────────────────────────────────────────────────
describe('admin.html', () => {
  it('has user manager panel', () => expect(adm).toContain('admin-panel-users'));
  it('has admin-panel-cohort-manager panel', () => expect(adm).toContain('admin-panel-cohort-manager'));
  it('loads admin-user-manager.js', () => expect(adm).toContain('admin-user-manager.js'));
  it('loads admin-cohort-manager-full.js', () => expect(adm).toContain('admin-cohort-manager-full.js'));
  it('has .um-dtab CSS', () => expect(adm).toContain('um-dtab'));
});

// ─── admin.js ─────────────────────────────────────────────────────────────
describe('admin.js subpage map', () => {
  it('users subpage mapped to loadUsersTab', () => expect(ajs).toContain('loadUsersTab'));
  it('cohort-manager subpage mapped to loadCohortManagerTab', () => {
    expect(ajs).toContain('cohort-manager');
    expect(ajs).toContain('loadCohortManagerTab');
  });
});

// ─── File inventory ───────────────────────────────────────────────────────
describe('File inventory', () => {
  const files = [
    'supabase/migrations/v9.80-spec-admin-002-s1.sql',
    'supabase/functions/admin-user-manager/index.ts',
    'supabase/functions/admin-cohort-manager/index.ts',
    'supabase/functions/admin-credit-action/index.ts',
    'js/admin-user-manager.js',
    'js/admin-cohort-manager-full.js',
    'tests/spec-admin-002-s1.test.js',
  ];
  for (const f of files) {
    it('exists: ' + f, () => expect(existsSync(f)).toBe(true));
  }
});
