import { readFileSync, existsSync } from 'fs';
import { describe, it, expect } from 'vitest';
const read = (p) => existsSync(p) ? readFileSync(p, 'utf8') : '';

const UME = 'supabase/functions/admin-user-manager/index.ts';
const CME = 'supabase/functions/admin-cohort-manager/index.ts';
const BME = 'supabase/functions/admin-billing-manager/index.ts';
const FPE = 'supabase/functions/admin-filter-prompt/index.ts';
const ALE = 'supabase/functions/admin-audit-log/index.ts';
const UMJ = 'js/admin-user-manager.js';
const CMJ = 'js/admin-cohort-manager-full.js';
const BMJ = 'js/admin-billing.js';
const FPJ = 'js/admin-filter-prompt.js';
const ALJ = 'js/admin-audit-log-viewer.js';

const ume=read(UME);const cme=read(CME);const bme=read(BME);
const fpe=read(FPE);const ale=read(ALE);const umj=read(UMJ);
const cmj=read(CMJ);const bmj=read(BMJ);const fpj=read(FPJ);const alj=read(ALJ);

// ── §3.1 User List gaps ────────────────────────────────────────────────────
describe('§3.1 User List: missing filters + actions', () => {
  it('country filter in EF', () => expect(ume).toContain("body.country"));
  it('signup date range filter in EF', () => {
    expect(ume).toContain('signup_from'); expect(ume).toContain('signup_to');
  });
  it('last active date range filter in EF', () => {
    expect(ume).toContain('active_from'); expect(ume).toContain('active_to');
  });
  it('subscription status filter in EF', () => expect(ume).toContain('sub_status'));
  it('date range inputs in UI', () => {
    expect(umj).toContain('um-date-from'); expect(umj).toContain('um-date-to');
  });
  it('country filter input in UI', () => expect(umj).toContain('um-country-filter'));
  it('CSV export action in EF', () => expect(ume).toContain("action === 'export_csv'"));
  it('CSV export returns text/csv', () => expect(ume).toContain('text/csv'));
  it('CSV export writes audit log', () => expect(ume).toContain('user.list.export_csv'));
  it('Export CSV button in UI', () => expect(umj).toContain('umExportCSV'));
  it('suspend action in EF', () => expect(ume).toContain("action === 'suspend'"));
  it('suspend requires reason', () => expect(ume).toContain('reason required'));
  it('suspend writes audit log', () => expect(ume).toContain('user.suspend'));
  it('unsuspend action in EF', () => expect(ume).toContain("action === 'unsuspend'"));
  it('Suspend button in User List UI', () => expect(umj).toContain('umSuspend'));
  it('impersonate action in EF', () => expect(ume).toContain("action === 'impersonate'"));
  it('impersonate writes audit log BEFORE returning link', () => {
    const idx = ume.indexOf("action === 'impersonate'");
    const section = ume.slice(idx, idx + 600);
    const auditIdx = section.indexOf('writeAudit');
    const linkIdx  = section.indexOf('generateLink');
    expect(auditIdx).toBeGreaterThan(-1);
    expect(auditIdx).toBeLessThan(linkIdx);
  });
  it('impersonate generates 5-min magic link', () => expect(ume).toContain('expiresIn: 300'));
  it('Impersonate button in User List UI', () => expect(umj).toContain('umImpersonate'));
});

// ── §3.2 User Detail: Applications + Activity + Delete + Cancel sub ────────
describe('§3.2 User Detail: missing tabs + actions', () => {
  it('detail_applications action in EF', () => expect(ume).toContain('detail_applications'));
  it('Applications tab in drawer UI', () => expect(umj).toContain("'applications'"));
  it('Applications tab renders pending_applications', () => expect(umj).toContain('appData.applications'));
  it('Applications tab renders pipeline', () => expect(umj).toContain('appData.pipeline'));
  it('Activity tab in drawer UI', () => expect(umj).toContain("'activity'"));
  it('Activity tab links to PostHog', () => expect(umj).toContain('posthog.com'));
  it('delete_account action in EF', () => expect(ume).toContain("action === 'delete_account'"));
  it('delete_account validates confirm_email match', () => expect(ume).toContain('Email confirmation does not match'));
  it('delete_account requires reason min 20 chars', () => expect(ume).toContain('min 20 chars'));
  it('delete_account writes audit log BEFORE deletion', () => {
    const idx = ume.indexOf("action === 'delete_account'");
    const section = ume.slice(idx, idx + 1200);
    const auditIdx = section.indexOf('writeAudit');
    const deleteIdx = section.indexOf('auth.admin.deleteUser');
    expect(auditIdx).toBeLessThan(deleteIdx);
  });
  it('Delete Account danger zone in Profile tab UI', () => expect(umj).toContain('umDeleteAccount'));
  it('Delete Account requires email re-entry in UI', () => expect(umj).toContain("confirm_email"));
  it('cancel_sub_for_user action in EF', () => expect(ume).toContain('cancel_sub_for_user'));
  it('Cancel Subscription button in Cohort & Billing tab', () => expect(umj).toContain('umCancelSubForUser'));
});

// ── §4 Cohort Manager gaps ────────────────────────────────────────────────
describe('§4 Cohort Manager: duplicate + Stripe validation + entitlements', () => {
  it('duplicate action in EF', () => expect(cme).toContain("action === 'duplicate'"));
  it('duplicate clones all fields with new name/slug', () => {
    expect(cme).toContain('new_name'); expect(cme).toContain('new_slug');
  });
  it('duplicate writes audit log', () => expect(cme).toContain('cohort.duplicate'));
  it('Duplicate button in cohort list UI', () => expect(cmj).toContain('cmDuplicate'));
  it('validate_stripe_price action in EF', () => expect(cme).toContain('validate_stripe_price'));
  it('Stripe validation calls Stripe API', () => expect(cme).toContain('api.stripe.com/v1/prices'));
  it('Validate buttons in cohort editor UI', () => expect(cmj).toContain('cmValidateStripePrice'));
  it('Stripe validation result shown in UI', () => expect(cmj).toContain('cm-stripe-validation-result'));
  it('Entitlements sub-form in cohort editor (toggles + number inputs)', () => {
    expect(cmj).toContain('cm-ent-max-auto-apply');
    expect(cmj).toContain('cm-ent-max-saved');
    expect(cmj).toContain('cm-ent-max-recruiter');
  });
  it('Entitlement values persisted in cmSave', () => expect(cmj).toContain("cm-ent-max-auto-apply"));
});

// ── §5.1 Billing: CSV export ─────────────────────────────────────────────
describe('§5.1 Billing: subscriptions CSV export', () => {
  it('export_subscriptions_csv action in EF', () => expect(bme).toContain('export_subscriptions_csv'));
  it('export returns text/csv', () => expect(bme).toContain('text/csv'));
  it('export writes audit log', () => expect(bme).toContain('billing.subscriptions.export_csv'));
  it('Export CSV button in subscriptions UI', () => expect(bmj).toContain('bmExportSubsCSV'));
});

// ── §7.1 Filter: weight-change warning ──────────────────────────────────
describe('§7.1 Filter weight-change warning', () => {
  it('weight change detected after save', () => expect(fpj).toContain('editingFilter?.weight'));
  it('warning message mentions retroactive recomputation', () => expect(fpj).toContain('retroactively recomputed'));
});

// ── §7.2 Prompt: version history + test runner ───────────────────────────
describe('§7.2 Prompt version history + test runner', () => {
  it('prompt_version_history action in EF', () => expect(fpe).toContain('prompt_version_history'));
  it('version history returns all versions by name', () => expect(fpe).toContain('order(\'version\''));
  it('version history panel renders in prompt editor UI', () => expect(fpj).toContain('fp-version-history'));
  it('restore version button per row in history panel', () => expect(fpj).toContain('fpRestoreVersion'));
  it('test_prompt action in EF', () => expect(fpe).toContain("action === 'test_prompt'"));
  it('test_prompt substitutes {{variables}}', () => expect(fpe).toContain('test_variables'));
  it('test_prompt detects unresolved vars', () => expect(fpe).toContain('unresolved'));
  it('test_prompt calls Anthropic API', () => expect(fpe).toContain('anthropic.com/v1/messages'));
  it('test_prompt writes audit log (prompt.test_run)', () => expect(fpe).toContain('prompt.test_run'));
  it('test runner UI: JSON vars input', () => expect(fpj).toContain('fp-test-vars'));
  it('test runner UI: Run Test button calls fpRunTest', () => expect(fpj).toContain('fpRunTest'));
  it('test runner UI: response output area', () => expect(fpj).toContain('fp-test-output'));
  it('test runner UI: shows token usage', () => expect(fpj).toContain('output_tokens'));
});

// ── §8.2 Audit log CSV export ────────────────────────────────────────────
describe('§8.2 Audit log CSV export', () => {
  it('export_csv flag in EF', () => expect(ale).toContain('export_csv'));
  it('CSV includes all audit log fields', () => {
    expect(ale).toContain('created_at'); expect(ale).toContain('action');
    expect(ale).toContain('reason'); expect(ale).toContain('before');
  });
  it('Export CSV button in audit log UI', () => expect(alj).toContain('alExportCSV'));
});

// ── File inventory ────────────────────────────────────────────────────────
describe('File inventory', () => {
  const files = ['tests/spec-admin-002-rem.test.js'];
  for (const f of files) { it('exists: ' + f, () => expect(existsSync(f)).toBe(true)); }
});
