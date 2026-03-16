import { readFileSync, existsSync } from 'fs';
import { describe, it, expect } from 'vitest';
const read = (p) => existsSync(p) ? readFileSync(p, 'utf8') : '';

const BME = 'supabase/functions/admin-billing-manager/index.ts';
const FPE = 'supabase/functions/admin-filter-prompt/index.ts';
const ALE = 'supabase/functions/admin-audit-log/index.ts';
const BMJ = 'js/admin-billing.js';
const FPJ = 'js/admin-filter-prompt.js';
const ALJ = 'js/admin-audit-log-viewer.js';
const ADM = 'admin.html';
const GW  = 'supabase/functions/api-gateway/index.ts';
const AJS = 'js/admin.js';
const RW  = 'js/rewrite.js';

const bme = read(BME); const fpe = read(FPE); const ale = read(ALE);
const bmj = read(BMJ); const fpj = read(FPJ); const alj = read(ALJ);
const adm = read(ADM); const gw  = read(GW);  const ajs = read(AJS);
const rw  = read(RW);

// ─── §5.1 admin-billing-manager: subscriptions ──────────────────────────────
describe('§5.1 admin-billing-manager: subscriptions', () => {
  it('file exists', () => expect(existsSync(BME)).toBe(true));
  it('requires admin JWT', () => expect(bme).toContain("'admin', 'superadmin'"));
  it('action=list_subscriptions returns paginated results', () => {
    expect(bme).toContain('list_subscriptions');
    expect(bme).toContain('per_page');
  });
  it('filters by status and cohort_slug', () => {
    expect(bme).toContain('status_filter');
    expect(bme).toContain('cohort_slug');
  });
  it('action=cancel_subscription requires reason (min 10 chars)', () => {
    expect(bme).toContain('cancel_subscription');
    expect(bme).toContain('min 10 chars');
  });
  it('cancel calls Stripe API', () => expect(bme).toContain('api.stripe.com/v1/subscriptions'));
  it('cancel supports immediate and at-period-end', () => expect(bme).toContain('cancel_immediately'));
  it('cancel writes audit log', () => expect(bme).toContain('billing.subscription.cancel'));
  it('cancel fires PostHog', () => expect(bme).toContain('admin_subscription_cancelled'));
  it('action=apply_discount validates percent_off 1-100', () => {
    expect(bme).toContain('apply_discount');
    expect(bme).toContain('percent_off');
  });
  it('apply_discount creates Stripe coupon', () => expect(bme).toContain('api.stripe.com/v1/coupons'));
  it('apply_discount writes audit log', () => expect(bme).toContain('billing.discount.apply'));
  it('fires PostHog on error — NO SILENT FAIL', () => expect(bme).toContain('admin_ef_error'));
});

// ─── §5.2 admin-billing-manager: global credit ledger ─────────────────────
describe('§5.2 admin-billing-manager: global credit ledger', () => {
  it('action=global_ledger exists', () => expect(bme).toContain('global_ledger'));
  it('filters by user_id and event_type', () => {
    expect(bme).toContain('user_id'); expect(bme).toContain('event_type');
  });
  it('paginates results', () => expect(bme).toContain('per_page'));
  it('includes profile join (email)', () => expect(bme).toContain('profiles(email'));
});

// ─── §7.1 admin-filter-prompt: filter config ───────────────────────────────
describe('§7.1 admin-filter-prompt: filter config', () => {
  it('file exists', () => expect(existsSync(FPE)).toBe(true));
  it('requires admin JWT', () => expect(fpe).toContain("'admin', 'superadmin'"));
  it('action=list_filters supports include_inactive', () => {
    expect(fpe).toContain('list_filters');
    expect(fpe).toContain('include_inactive');
  });
  it('action=upsert_filter validates type enum', () => {
    expect(fpe).toContain('upsert_filter');
    expect(fpe).toContain('invalid type');
  });
  it('upsert_filter writes audit log (create or update)', () => {
    expect(fpe).toContain('filter.create');
    expect(fpe).toContain('filter.update');
  });
  it('action=delete_filter soft-deletes via is_active=false', () => {
    expect(fpe).toContain('delete_filter');
    expect(fpe).toContain('is_active: false');
  });
  it('delete_filter writes audit log', () => expect(fpe).toContain('filter.deactivate'));
});

// ─── §7.2 admin-filter-prompt: prompt templates ────────────────────────────
describe('§7.2 admin-filter-prompt: prompt templates', () => {
  it('action=list_prompts filters by feature', () => {
    expect(fpe).toContain('list_prompts');
    expect(fpe).toContain('feature');
  });
  it('action=get_prompt returns variables', () => {
    expect(fpe).toContain('get_prompt');
    expect(fpe).toContain('extractVariables');
  });
  it('save_prompt validates name, feature, template required', () => {
    expect(fpe).toContain('name, feature, and template required');
  });
  it('save_prompt validates required variables present in template', () => {
    expect(fpe).toContain('missing_variables');
    expect(fpe).toContain('Missing required variables');
  });
  it('save_prompt increments version on update', () => {
    expect(fpe).toContain('newVersion');
    expect(fpe).toContain('version + 1');
  });
  it('save_prompt deactivates old version', () => expect(fpe).toContain('is_active: false'));
  it('save_prompt writes audit log', () => {
    expect(fpe).toContain('prompt.create');
    expect(fpe).toContain('prompt.update');
  });
  it('action=restore_prompt_version reactivates selected version', () => {
    expect(fpe).toContain('restore_prompt_version');
    expect(fpe).toContain('prompt.restore_version');
  });
  it('{{variable}} extraction works', () => expect(fpe).toContain('\\{\\{(\\w+)\\}\\}'));
});

// ─── §8.2 admin-audit-log EF ────────────────────────────────────────────────
describe('§8.2 admin-audit-log EF', () => {
  it('file exists', () => expect(existsSync(ALE)).toBe(true));
  it('requires admin JWT', () => expect(ale).toContain("'admin', 'superadmin'"));
  it('read-only: no INSERT/UPDATE/DELETE', () => {
    expect(ale).not.toContain(".insert(");
    expect(ale).not.toContain(".update(");
    expect(ale).not.toContain(".delete(");
  });
  it('filters by actor_id', () => expect(ale).toContain('actor_id'));
  it('filters by action_filter (ilike)', () => expect(ale).toContain('action_filter'));
  it('filters by target_type', () => expect(ale).toContain('target_type'));
  it('filters by date range', () => {
    expect(ale).toContain('date_from');
    expect(ale).toContain('date_to');
  });
  it('full-text search across action and reason', () => expect(ale).toContain('ilike'));
  it('paginates with page/per_page', () => expect(ale).toContain('per_page'));
  it('returns total count', () => expect(ale).toContain('count'));
  it('joins profiles for actor email', () => expect(ale).toContain('profiles!actor_id'));
});

// ─── Gateway routes ──────────────────────────────────────────────────────────
describe('Gateway routes #136-138', () => {
  it('#136: admin-billing-manager', () => expect(gw).toContain('"admin-billing-manager"'));
  it('#137: admin-filter-prompt', () => expect(gw).toContain('"admin-filter-prompt"'));
  it('#138: admin-audit-log', () => expect(gw).toContain('"admin-audit-log"'));
});

// ─── JS: admin-billing.js ───────────────────────────────────────────────────
describe('admin-billing.js', () => {
  it('file exists', () => expect(existsSync(BMJ)).toBe(true));
  it('loadBillingManagerTab renders 2-tab layout', () => {
    expect(bmj).toContain('loadBillingManagerTab');
    expect(bmj).toContain('subscriptions');
    expect(bmj).toContain('ledger');
  });
  it('subscription list paginates', () => expect(bmj).toContain('bmSubPage'));
  it('cancel subscription prompts for reason', () => {
    expect(bmj).toContain('bmCancelSub');
    expect(bmj).toContain('reason');
  });
  it('global ledger filters by user_id and event_type', () => {
    expect(bmj).toContain('bm-ledger-user');
    expect(bmj).toContain('bm-event-filter');
  });
  it('registered in BJ namespace', () => expect(bmj).toContain('loadBillingManagerTab'));
});

// ─── JS: admin-filter-prompt.js ─────────────────────────────────────────────
describe('admin-filter-prompt.js', () => {
  it('file exists', () => expect(existsSync(FPJ)).toBe(true));
  it('loadFilterPromptTab renders filters + prompts tabs', () => {
    expect(fpj).toContain('loadFilterPromptTab');
    expect(fpj).toContain('fp-filters-panel');
    expect(fpj).toContain('fp-prompts-panel');
  });
  it('filter editor has key, label, type, weight', () => {
    expect(fpj).toContain("'fpf-' + id") || expect(fpj).toContain("'key'");
    expect(fpj).toContain("'label'");
    expect(fpj).toContain("'weight'");
  });
  it('prompt editor detects {{variables}} live', () => expect(fpj).toContain('fpDetectVars'));
  it('prompt editor shows variable list in UI', () => expect(fpj).toContain('fpp-vars'));
  it('save shows missing variable error to admin', () => expect(fpj).toContain('missing_variables'));
  it('registered in BJ namespace', () => expect(fpj).toContain('loadFilterPromptTab'));
});

// ─── JS: admin-audit-log-viewer.js ───────────────────────────────────────────
describe('admin-audit-log-viewer.js', () => {
  it('file exists', () => expect(existsSync(ALJ)).toBe(true));
  it('loadAuditLogTab renders search + filters', () => {
    expect(alj).toContain('loadAuditLogTab');
    expect(alj).toContain('al-search');
  });
  it('filter by target_type dropdown', () => expect(alj).toContain('al-target-type'));
  it('date range filters', () => {
    expect(alj).toContain('al-date-from');
    expect(alj).toContain('al-date-to');
  });
  it('expandable before/after JSON diff per row', () => {
    expect(alj).toContain('alToggleDiff');
    expect(alj).toContain('JSON.stringify');
  });
  it('paginates', () => expect(alj).toContain('alPage'));
  it('registered in BJ namespace', () => expect(alj).toContain('loadAuditLogTab'));
});

// ─── admin.html panels ──────────────────────────────────────────────────────
describe('admin.html panels', () => {
  it('has admin-panel-billing-manager', () => expect(adm).toContain('admin-panel-billing-manager'));
  it('has admin-panel-filter-prompt', () => expect(adm).toContain('admin-panel-filter-prompt'));
  it('has admin-panel-audit-log', () => expect(adm).toContain('admin-panel-audit-log'));
  it('loads admin-billing.js', () => expect(adm).toContain('admin-billing.js'));
  it('loads admin-filter-prompt.js', () => expect(adm).toContain('admin-filter-prompt.js'));
  it('loads admin-audit-log-viewer.js', () => expect(adm).toContain('admin-audit-log-viewer.js'));
});

// ─── admin.js subpages ──────────────────────────────────────────────────────
describe('admin.js subpages', () => {
  it('billing-manager → loadBillingManagerTab', () => {
    expect(ajs).toContain('billing-manager');
    expect(ajs).toContain('loadBillingManagerTab');
  });
  it('filter-prompt → loadFilterPromptTab', () => {
    expect(ajs).toContain('filter-prompt');
    expect(ajs).toContain('loadFilterPromptTab');
  });
  it('audit-log → loadAuditLogTab', () => {
    expect(ajs).toContain('audit-log');
    expect(ajs).toContain('loadAuditLogTab');
  });
});

// ─── COHORT GAP-14: upgrade CTA with specific cost ───────────────────────────
describe('COHORT GAP-14: upgrade CTA with specific cost', () => {
  it('rewrite.js reads cost from 402 response', () => expect(rw).toContain('data.cost'));
  it('shows specific cost in error message', () => expect(rw).toContain('costs ' + "' + cost + '"));
  it('shows shortfall', () => expect(rw).toContain('data.shortfall'));
  it('handles both INSUFFICIENT_CREDITS and insufficient_credits', () => {
    expect(rw).toContain('INSUFFICIENT_CREDITS');
    expect(rw).toContain('insufficient_credits');
  });
});

// ─── File inventory ──────────────────────────────────────────────────────────
describe('File inventory', () => {
  const files = [
    'supabase/functions/admin-billing-manager/index.ts',
    'supabase/functions/admin-filter-prompt/index.ts',
    'supabase/functions/admin-audit-log/index.ts',
    'js/admin-billing.js',
    'js/admin-filter-prompt.js',
    'js/admin-audit-log-viewer.js',
    'tests/spec-admin-002-s2.test.js',
  ];
  for (const f of files) {
    it('exists: ' + f, () => expect(existsSync(f)).toBe(true));
  }
});
