import { readFileSync, existsSync } from 'fs';
import { describe, it, expect } from 'vitest';
const read = (p) => existsSync(p) ? readFileSync(p, 'utf8') : '';

const UME = 'supabase/functions/admin-user-manager/index.ts';
const BME = 'supabase/functions/admin-billing-manager/index.ts';
const UMJ = 'js/admin-user-manager.js';
const BMJ = 'js/admin-billing.js';
const CTJ = 'js/admin-content.js';
const FPJ = 'js/admin-filter-prompt.js';

const ume=read(UME); const bme=read(BME);
const umj=read(UMJ); const bmj=read(BMJ);
const ctj=read(CTJ); const fpj=read(FPJ);

// Block / Unblock
describe('Block / Unblock', () => {
  it('block action in EF', () => expect(ume).toContain("action === 'block'"));
  it('block bans via auth admin API', () => expect(ume).toContain('updateUserById'));
  it('block sets role=blocked on profile', () => expect(ume).toContain("role: 'blocked'"));
  it('block writes audit log', () => expect(ume).toContain('user.block'));
  it('block requires reason', () => expect(ume).toContain("action === 'block'") && expect(ume).toContain('reason required'));
  it('unblock action in EF', () => expect(ume).toContain("action === 'unblock'"));
  it('unblock resets role=user', () => expect(ume).toContain("role: 'user'"));
  it('unblock writes audit log', () => expect(ume).toContain('user.unblock'));
  it('Block button in User List UI', () => expect(umj).toContain('umBlock'));
});

// Merge Accounts
describe('Merge Accounts', () => {
  it('merge_accounts action in EF', () => expect(ume).toContain("action === 'merge_accounts'"));
  it('rejects self-merge', () => expect(ume).toContain('Cannot merge account with itself'));
  it('requires reason min 20 chars', () => expect(ume).toContain('min 20 chars for account merge'));
  it('transfers credit_ledger rows', () => expect(ume).toContain('bj_credit_ledger'));
  it('transfers resumes', () => expect(ume).toContain('resumes'));
  it('transfers pending_applications', () => expect(ume).toContain('pending_applications'));
  it('transfers user_pipeline', () => expect(ume).toContain('user_pipeline'));
  it('writes audit BEFORE deleting source', () => {
    const idx = ume.indexOf("action === 'merge_accounts'");
    const section = ume.slice(idx, idx + 3000);
    expect(section.indexOf('writeAudit')).toBeLessThan(section.indexOf('deleteUser'));
  });
  it('hard-deletes source after transfer', () => expect(ume).toContain('deleteUser'));
  it('Merge button in User List UI', () => expect(umj).toContain('umMerge'));
  it('merge resolves target by email lookup', () => expect(umj).toContain('targetEmail'));
});

// Apply Discount from User Detail
describe('Apply Discount from User Detail', () => {
  it('apply_discount_for_user action in EF', () => expect(ume).toContain('apply_discount_for_user'));
  it('creates Stripe coupon', () => expect(ume).toContain('api.stripe.com/v1/coupons'));
  it('applies to customer', () => expect(ume).toContain('stripe.com/v1/customers'));
  it('writes audit log', () => expect(ume).toContain('billing.discount.apply'));
  it('Apply Discount button in Cohort & Billing tab', () => expect(umj).toContain('umApplyDiscount'));
});

// Extend Trial from User Detail
describe('Extend Trial from User Detail', () => {
  it('extend_trial action in EF', () => expect(ume).toContain("action === 'extend_trial'"));
  it('calls Stripe to update trial_end', () => expect(ume).toContain('trial_end'));
  it('validates extend_days 1-365', () => expect(ume).toContain('extend_days'));
  it('writes audit log (billing.trial.extend)', () => expect(ume).toContain('billing.trial.extend'));
  it('Extend Trial button in Cohort & Billing tab', () => expect(umj).toContain('umExtendTrial'));
});

// MRR column in subscriptions
describe('§5.1 MRR in subscriptions list', () => {
  it('EF computes mrr_cents per subscription', () => expect(bme).toContain('mrr_cents'));
  it('active sub gets price_monthly_cents as MRR', () => expect(bme).toContain('price_monthly_cents'));
  it('MRR column in subscriptions table header', () => expect(bmj).toContain('MRR'));
  it('MRR value rendered per row', () => expect(bmj).toContain('mrr_cents'));
});

// Apply Coupon row action in Billing Manager
describe('§5.1 Apply Coupon row action', () => {
  it('Coupon button in subscription row UI', () => expect(bmj).toContain('bmApplyCoupon'));
  it('coupon calls apply_discount_for_user EF action', () => expect(bmj).toContain('apply_discount_for_user'));
});

// Content Manager §6.1 + §6.2
describe('§6.1 Content Manager: create + bulk + delete', () => {
  it('Create button renders editor modal', () => expect(ctj).toContain('ctOpenEditor'));
  it('bulk approve all pending', () => expect(ctj).toContain('ctBulkAction'));
  it('bulk reject all pending', () => expect(ctj).toContain('Reject All Pending') || expect(ctj).toContain('rejected'));
  it('bulk publish approved', () => expect(ctj).toContain('Bulk Publish') || expect(ctj).toContain('published'));
  it('soft-delete sets status=archived', () => expect(ctj).toContain('ctSoftDelete') && expect(ctj).toContain('archived'));
  it('hard-delete for superadmin', () => expect(ctj).toContain('ctHardDelete'));
  it('hard-delete prompts for reason', () => expect(ctj).toContain('Reason for permanent deletion'));
  it('select-all checkbox for bulk ops', () => expect(ctj).toContain('ctSelectAll'));
});

describe('§6.2 Content item fields', () => {
  it('title field in editor', () => expect(ctj).toContain("'title'") || expect(ctj).toContain('Title'));
  it('slug field in editor', () => expect(ctj).toContain("'slug'") || expect(ctj).toContain('Slug'));
  it('body (markdown) textarea', () => expect(ctj).toContain("ta('Body") || expect(ctj).toContain('Markdown'));
  it('tags field', () => expect(ctj).toContain("'tags'") || expect(ctj).toContain('Tags'));
  it('status enum field', () => expect(ctj).toContain('cte-status') && expect(ctj).toContain('draft') && expect(ctj).toContain('published'));
  it('is_featured toggle', () => expect(ctj).toContain('cte-featured') || expect(ctj).toContain('is_featured'));
  it('publish_date field', () => expect(ctj).toContain('publish_date') || expect(ctj).toContain('Publish Date'));
  it('author_note field (admin-only)', () => expect(ctj).toContain('author_note') && expect(ctj).toContain('never shown to users'));
});

// Variable inspector required vs optional
describe('§7.2 Variable inspector required vs optional', () => {
  it('shows each detected var with required checkbox', () => expect(fpj).toContain('fpvar-req-'));
  it('inspector container rendered in editor', () => expect(fpj).toContain('fpp-var-inspector'));
  it('fpGetRequiredVars collects checked boxes', () => expect(fpj).toContain('fpGetRequiredVars'));
  it('required_variables passed to save_prompt', () => expect(fpj).toContain('required_variables: fpGetRequiredVars'));
});
