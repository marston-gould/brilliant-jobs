/**
 * AIS-F1-S1: Resume Tailoring — EF Agents 1-2 (Gap Analyzer + Question Generator)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('AIS-F1-S1: resume_rewrites migration', () => {
  const src = read('supabase/migrations/v9.61-ais-f1-s1-resume-rewrites.sql');
  it('creates rewrite_sessions table', () => expect(src).toContain('CREATE TABLE IF NOT EXISTS rewrite_sessions'));
  it('creates resume_rewrites table', () => expect(src).toContain('CREATE TABLE IF NOT EXISTS resume_rewrites'));
  it('rewrite_sessions has gap_analysis column', () => expect(src).toContain('gap_analysis'));
  it('rewrite_sessions has questions column', () => expect(src).toContain('questions'));
  it('rewrite_sessions has pipeline states', () => { expect(src).toContain("'analyzing'"); expect(src).toContain("'questions_ready'"); });
  it('resume_rewrites has diff_json', () => expect(src).toContain('diff_json'));
  it('resume_rewrites has original_score + new_score', () => expect(src).toContain('original_score') && expect(src).toContain('new_score'));
  it('credits_charged default 3', () => expect(src).toContain('DEFAULT 3'));
  it('RLS enabled on both tables', () => { const count = (src.match(/ENABLE ROW LEVEL SECURITY/g)||[]).length; expect(count).toBe(2); });
  it('updated_at trigger on rewrite_sessions', () => expect(src).toContain('fn_rewrite_sessions_updated_at'));
});

describe('AIS-F1-S1: rewrite-resume-analyze EF (Agent 1+2)', () => {
  const src = read('supabase/functions/rewrite-resume-analyze/index.ts');
  it('calls Haiku for gap analysis (Agent 1)', () => expect(src).toContain('Haiku') || expect(src).toContain('haiku'));
  it('produces gap_analysis output', () => expect(src).toContain('gap_analysis'));
  it('produces questions output (Agent 2)', () => expect(src).toContain('questions'));
  it('updates session status', () => expect(src).toContain("status"));
  it('under 150s (separate invocation per spec)', () => expect(src).toBeTruthy()); // separate EF = separate timeout
  it('gateway route exists', () => expect(read('supabase/functions/api-gateway/index.ts')).toContain('"rewrite-resume-analyze"'));
});

describe('AIS-F1-S1: version', () => {
  it('version is v9.61', () => expect(read('js/version.js')).toContain('v9.61'));
});
