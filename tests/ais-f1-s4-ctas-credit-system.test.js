/** AIS-F1-S4: Resume Tailoring — CTAs + Credit System */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');
describe('AIS-F1-S4: credit system migration', () => {
  const src = read('supabase/migrations/v9.64-ais-f1-s4-credit-system.sql');
  it('credit_balance column on profiles', () => expect(src).toContain('credit_balance'));
  it('credit_transactions table', () => expect(src).toContain('credit_transactions'));
  it('get_credit_balance RPC', () => expect(src).toContain('get_credit_balance'));
  it('deduct_credits RPC', () => expect(src).toContain('deduct_credits'));
  it('add_credits RPC', () => expect(src).toContain('add_credits'));
  it('deduct_credits raises on insufficient', () => expect(src).toContain('insufficient_credits'));
  it('floors balance at 0', () => expect(src).toContain('GREATEST(0'));
  it('RLS on credit_transactions', () => expect(src).toContain('ENABLE ROW LEVEL SECURITY'));
  it('GRANT to authenticated', () => expect(src).toContain('TO authenticated'));
});
describe('AIS-F1-S4: rewrite.js credit CTAs', () => {
  const src = read('js/rewrite.js');
  it('checks credit balance before rewrite', () => expect(src).toContain('get_credit_balance'));
  it('blocks on insufficient credits (3 required)', () => expect(src).toContain('3 credits'));
  it('deducts on success', () => expect(src).toContain('creditsUsed'));
  it('no deduction on failure', () => expect(src).toContain('No credits were deducted'));
  it('boostMatch CTA function', () => expect(src).toContain('function boostMatch'));
  it('boost pill on job cards', () => expect(src).toContain('rw-boost-pill'));
  it('top-up message shown when balance low', () => expect(src).toContain('Purchase more in Settings'));
});
describe('AIS-F1-S4: version', () => {
  it('version is v9.65', () => expect(read('js/version.js')).toContain('v9.65'));
});
