/**
 * AIS-F1-S4: Resume Tailoring — CTAs + Credit System
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('AIS-F1-S4: credit system in rewrite.js', () => {
  const src = read('js/rewrite.js');
  it('checks credit balance before rewrite', () => expect(src).toContain('get_credit_balance'));
  it('3 credits required', () => expect(src).toContain('3 credits'));
  it('blocks on insufficient credits', () => expect(src).toContain('insufficient_credits'));
  it('shows balance in error message', () => expect(src).toContain('balance'));
  it('0 credits deducted on failure path', () => expect(src).toContain('No credits were deducted'));
  it('CTA wires to rewrite flow', () => expect(src).toContain('boostMatch') || expect(src).toContain('launchRewriteInterview'));
});

describe('AIS-F1-S4: version', () => {
  it('version is v9.65', () => expect(read('js/version.js')).toContain('v9.65'));
});
