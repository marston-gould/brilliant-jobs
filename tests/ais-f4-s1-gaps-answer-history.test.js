/**
 * AIS-F4-S1: Gap Fixes — Answer History + Personal Context + Credits
 * ===================================================================
 * Tests the items that were missing from the initial AIS-F4-S1 implementation:
 *  1. answers table migration exists with correct schema
 *  2. answer-form-question EF: DB cache functions (loadAnswerCache, persistAnswers)
 *  3. answer-form-question EF: credit deduction (0.5/answer, cached=free)
 *  4. answer-form-question EF: LinkedIn profile context (fetchLinkedInProfile)
 *  5. answer-form-question EF: response includes cache_hits + credits_charged
 *  6. answer-form-question EF: job_id in AnswerRequest interface
 *  7. answer-form-question EF: fully-cached path skips Anthropic
 *  8. Version / build integrity at v9.57
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

// ─────────────────────────────────────────────────
// 1. answers table migration
// ─────────────────────────────────────────────────
describe('AIS-F4-S1 gaps: answers table migration', () => {
  const src = read('supabase/migrations/v9.56-ais-f4-s1-answers-table.sql');

  it('migration file exists', () => {
    expect(src).toBeTruthy();
  });

  it('creates answers table', () => {
    expect(src).toContain('CREATE TABLE IF NOT EXISTS answers');
  });

  it('has user_id FK to auth.users', () => {
    expect(src).toMatch(/user_id.*uuid.*REFERENCES auth\.users/);
  });

  it('has field_label column', () => {
    expect(src).toContain('field_label');
  });

  it('has generated_answer column', () => {
    expect(src).toContain('generated_answer');
  });

  it('has user_edited_answer column', () => {
    expect(src).toContain('user_edited_answer');
  });

  it('has feedback column with up/down constraint', () => {
    expect(src).toMatch(/feedback.*CHECK.*up.*down/);
  });

  it('has credits_charged column', () => {
    expect(src).toContain('credits_charged');
  });

  it('has cached boolean column', () => {
    expect(src).toContain('cached');
  });

  it('has job_id column', () => {
    expect(src).toContain('job_id');
  });

  it('has index on (user_id, field_label)', () => {
    expect(src).toContain('idx_answers_user_label');
  });

  it('enables RLS', () => {
    expect(src).toContain('ENABLE ROW LEVEL SECURITY');
  });

  it('has user policy for own data', () => {
    expect(src).toContain('users_manage_own_answers');
  });

  it('has service_role policy', () => {
    expect(src).toContain('service_role_full_answers');
  });
});

// ─────────────────────────────────────────────────
// 2. EF: DB cache functions
// ─────────────────────────────────────────────────
describe('AIS-F4-S1 gaps: DB cache in answer-form-question EF', () => {
  const src = read('supabase/functions/answer-form-question/index.ts');

  it('loadAnswerCache function exists', () => {
    expect(src).toContain('loadAnswerCache');
  });

  it('queries answers table with user_id + field_label', () => {
    expect(src).toMatch(/loadAnswerCache[\s\S]{0,500}\.from\("answers"\)/);
  });

  it('respects ANSWER_CACHE_DAYS window', () => {
    expect(src).toContain('ANSWER_CACHE_DAYS');
  });

  it('persistAnswers function exists', () => {
    expect(src).toContain('persistAnswers');
  });

  it('inserts to answers table', () => {
    expect(src).toContain('.from("answers").insert(rows)');
  });

  it('sets cached=true for cache hits, false for new', () => {
    expect(src).toMatch(/cached.*isCached/);
  });

  it('sets credits_charged=0 for cached answers', () => {
    expect(src).toMatch(/isCached.*\?.*0.*:.*CREDITS_PER_ANSWER|credits_charged.*0.*cached/);
  });

  it('fully-cached path skips Anthropic (early return)', () => {
    expect(src).toContain('All');
    expect(src).toMatch(/missedQuestions\.length === 0[\s\S]{0,200}return new Response/);
  });

  it('only calls Anthropic for missed (non-cached) questions', () => {
    expect(src).toContain('missedQuestions');
  });
});

// ─────────────────────────────────────────────────
// 3. EF: credit deduction
// ─────────────────────────────────────────────────
describe('AIS-F4-S1 gaps: credit deduction in EF', () => {
  const src = read('supabase/functions/answer-form-question/index.ts');

  it('CREDITS_PER_ANSWER constant is 0.5', () => {
    expect(src).toContain('CREDITS_PER_ANSWER = 0.5');
  });

  it('deductCredits function exists', () => {
    expect(src).toContain('deductCredits');
  });

  it('calls deduct_credits RPC', () => {
    expect(src).toContain('deduct_credits');
  });

  it('deductCredits called after persist', () => {
    expect(src).toMatch(/persistAnswers[\s\S]{0,200}deductCredits/);
  });

  it('deductCredits is non-fatal (catches errors)', () => {
    expect(src).toContain('Credit deduction error');
  });

  it('credits_charged in response body', () => {
    expect(src).toContain('credits_charged');
  });

  it('zero credits charged for fully-cached responses', () => {
    expect(src).toMatch(/credits_charged.*0[\s\S]{0,50}cache_hits|cache_hits[\s\S]{0,50}credits_charged.*0/);
  });
});

// ─────────────────────────────────────────────────
// 4. EF: LinkedIn profile context
// ─────────────────────────────────────────────────
describe('AIS-F4-S1 gaps: LinkedIn context in EF', () => {
  const src = read('supabase/functions/answer-form-question/index.ts');

  it('fetchLinkedInProfile function exists', () => {
    expect(src).toContain('fetchLinkedInProfile');
  });

  it('queries linkedin_profiles table', () => {
    expect(src).toMatch(/fetchLinkedInProfile[\s\S]{0,300}linkedin_profiles/);
  });

  it('returns null when no profile found (graceful)', () => {
    expect(src).toContain('if (error || !data) return null');
  });

  it('LinkedIn data passed to buildUserPrompt', () => {
    expect(src).toMatch(/buildUserPrompt[\s\S]{0,200}linkedInProfile|linkedInProfile[\s\S]{0,100}buildUserPrompt/);
  });

  it('buildUserPrompt accepts linkedIn parameter', () => {
    expect(src).toMatch(/buildUserPrompt\(.*linkedIn/);
  });

  it('LinkedIn skills_array included in prompt', () => {
    expect(src).toContain('skills_array');
  });

  it('LinkedIn experience_json included in prompt', () => {
    expect(src).toContain('experience_json');
  });

  it('LinkedIn headline included in prompt', () => {
    expect(src).toContain('headline');
  });
});

// ─────────────────────────────────────────────────
// 5. EF: response shape
// ─────────────────────────────────────────────────
describe('AIS-F4-S1 gaps: EF response includes cache_hits and credits_charged', () => {
  const src = read('supabase/functions/answer-form-question/index.ts');

  it('cache_hits in success response', () => {
    expect(src).toContain('cache_hits');
  });

  it('credits_charged in success response', () => {
    expect(src).toContain('credits_charged');
  });
});

// ─────────────────────────────────────────────────
// 6. EF: job_id in AnswerRequest
// ─────────────────────────────────────────────────
describe('AIS-F4-S1 gaps: job_id in AnswerRequest interface', () => {
  const src = read('supabase/functions/answer-form-question/index.ts');

  it('job_id optional field in AnswerRequest', () => {
    expect(src).toMatch(/interface AnswerRequest[\s\S]{0,200}job_id\?/);
  });
});

// ─────────────────────────────────────────────────
// 7. Version and build integrity
// ─────────────────────────────────────────────────
describe('AIS-F4-S1 gaps: version and build integrity', () => {
  it('version is v9.57', () => {
    expect(read('js/version.js')).toContain('v9.57');
  });

  it('dist/dashboard.min.js rebuilt at v9.57', () => {
    expect(read('dist/dashboard.min.js')).toContain('v9.57');
  });

  it('migration file present', () => {
    expect(() => read('supabase/migrations/v9.56-ais-f4-s1-answers-table.sql')).not.toThrow();
  });

  it('answer-form-question EF present', () => {
    expect(() => read('supabase/functions/answer-form-question/index.ts')).not.toThrow();
  });
});
