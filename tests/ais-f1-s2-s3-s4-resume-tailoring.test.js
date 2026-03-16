/**
 * AIS-F1-S2: Resume Tailoring Agents 3-4 (Rewriter + QC)
 * AIS-F1-S3: Q&A Panel + Diff UI
 * AIS-F1-S4: CTAs + Credit System
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('AIS-F1-S2: rewrite-resume-execute EF (Agents 3-4)', () => {
  const src = read('supabase/functions/rewrite-resume-execute/index.ts');
  it('Agent 3: Resume Rewriter (Sonnet)', () => expect(src).toContain('Sonnet') || expect(src).toContain('sonnet'));
  it('Agent 4: Quality Checker (Haiku)', () => expect(src).toContain('Quality Checker'));
  it('persists to resume_rewrites table', () => expect(src).toContain("from('resume_rewrites')"));
  it('persists diff_json', () => expect(src).toContain('diff_json'));
  it('gateway route exists', () => expect(read('supabase/functions/api-gateway/index.ts')).toContain('"rewrite-resume-execute"'));
});

describe('AIS-F1-S3: Q&A Panel + Diff UI', () => {
  const src = read('js/rewrite.js');
  it('Q&A phase implemented', () => expect(src).toContain('Q&A'));
  it('diff view renders sections', () => expect(src).toContain('rw-diff-section'));
  it('rewrite panel in dashboard', () => expect(read('dashboard.html')).toContain('id="rewrite-panel"'));
  it('accepts/rejects section changes', () => expect(src).toContain('rw-diff-changed'));
});

describe('AIS-F1-S4: CTAs + Credit System', () => {
  const src = read('js/rewrite.js');
  it('checks credit balance before rewrite', () => expect(src).toContain('get_credit_balance'));
  it('3 credits required', () => expect(src).toContain('3 credit'));
  it('shows insufficient credits error', () => expect(src).toContain('insufficient_credits'));
  it('PostHog resume_rewrite_started', () => expect(src).toContain('resume_rewrite_started') || expect(src).toContain('rewrite_started'));
  it('boost match CTA wires to panel', () => expect(src).toContain('openRewritePanel'));
});
