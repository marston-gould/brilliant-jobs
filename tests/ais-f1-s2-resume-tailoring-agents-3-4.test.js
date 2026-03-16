/**
 * AIS-F1-S2: Resume Tailoring — EF Agents 3-4 (Rewriter + Quality Checker)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('AIS-F1-S2: rewrite-resume-execute EF (Agents 3+4)', () => {
  const src = read('supabase/functions/rewrite-resume-execute/index.ts');
  it('Agent 3: Resume Rewriter uses Sonnet', () => expect(src).toContain('Sonnet') || expect(src).toContain('sonnet'));
  it('Agent 3: produces rewritten resume text', () => expect(src).toContain('rewritten'));
  it('Agent 4: Quality Checker exists', () => expect(src).toContain('Quality Checker'));
  it('Agent 4: checks truthfulness', () => expect(src).toContain('truthfulness'));
  it('Agent 4: checks ATS compatibility', () => expect(src).toContain('ats_score'));
  it('persists to resume_rewrites table (AIS-F1-S2)', () => expect(src).toContain("from('resume_rewrites').insert"));
  it('persistence is non-fatal', () => expect(src).toContain("resume_rewrites insert error (non-fatal)"));
  it('includes session_id in resume_rewrites row', () => expect(src).toContain('session_id: session_id'));
  it('includes diff in resume_rewrites row', () => expect(src).toContain('diff_json'));
  it('returns new_score in response', () => expect(src).toContain('new_score'));
  it('gateway route exists', () => expect(read('supabase/functions/api-gateway/index.ts')).toContain('"rewrite-resume-execute"'));
});

describe('AIS-F1-S2: version', () => {
  it('version is v9.63', () => expect(read('js/version.js')).toContain('v9.63'));
});
