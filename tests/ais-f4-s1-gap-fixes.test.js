/**
 * AIS-F4-S1 (Gap Fixes): Answer History + Personal Context + Credits
 * ===================================================================
 * Tests the missing items from AIS-F4-S1 spec:
 *  1. Migration: answers table schema
 *  2. EF: DB answer cache (loadAnswerCache)
 *  3. EF: Persist answers (persistAnswers)
 *  4. EF: Credit deduction (deductCredits, 0.5/answer, cached=free)
 *  5. EF: LinkedIn profile context (fetchLinkedInProfile)
 *  6. EF: job_id in AnswerRequest interface
 *  7. EF: cache_hits + credits_charged in response
 *  8. EF: Fully-cached path bypasses Anthropic
 *  9. Version / build integrity at v9.57
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

// ─────────────────────────────────────────────────
// 1. Migration: answers table
// ─────────────────────────────────────────────────
describe('AIS-F4-S1 gaps: answers table migration', () => {
  const sql = read('supabase/migrations/v9.56-ais-f4-s1-answers-table.sql');

  it('migration file exists', () => {
    expect(sql).toBeTruthy();
  });

  it('creates answers table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS answers');
  });

  it('has user_id FK to auth.users', () => {
    expect(sql).toContain('REFERENCES auth.users');
  });

  it('has field_label column', () => {
    expect(sql).toContain('field_label');
  });

  it('has generated_answer column', () => {
    expect(sql).toContain('generated_answer');
  });

  it('has user_edited_answer column', () => {
    expect(sql).toContain('user_edited_answer');
  });

  it('has feedback column with up/down CHECK', () => {
    expect(sql).toMatch(/feedback[\s\S]{0,100}up.*down|down.*up/);
  });

  it('has credits_charged column', () => {
    expect(sql).toContain('credits_charged');
  });

  it('has cached boolean column', () => {
    expect(sql).toContain('cached');
  });

  it('has created_at column', () => {
    expect(sql).toContain('created_at');
  });

  it('enables RLS', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  });

  it('has user policy', () => {
    expect(sql).toContain('users_manage_own_answers');
  });

  it('has service_role policy', () => {
    expect(sql).toContain('service_role');
  });

  it('has index on user_id + field_label', () => {
    expect(sql).toContain('idx_answers_user_label');
  });
});

// ─────────────────────────────────────────────────
// 2. EF: DB answer cache
// ─────────────────────────────────────────────────
describe('AIS-F4-S1 gaps: DB answer cache in EF', () => {
  const src = read('supabase/functions/answer-form-question/index.ts');

  it('loadAnswerCache function exists', () => {
    expect(src).toContain('loadAnswerCache');
  });

  it('queries answers table', () => {
    expect(src).toMatch(/loadAnswerCache[\s\S]{0,500}from\("answers"\)/);
  });

  it('filters by user_id', () => {
    expect(src).toMatch(/loadAnswerCache[\s\S]{0,500}\.eq\("user_id"/);
  });

  it('filters within ANSWER_CACHE_DAYS', () => {
    expect(src).toContain('ANSWER_CACHE_DAYS');
    expect(src).toContain('gte("created_at"');
  });

  it('returns a Map of label → answer', () => {
    expect(src).toMatch(/Map<string,\s*string>/);
  });

  it('handles cache load errors gracefully — no silent fail', () => {
    expect(src).toContain('Cache load error:');
  });
});

// ─────────────────────────────────────────────────
// 3. EF: Persist answers
// ─────────────────────────────────────────────────
describe('AIS-F4-S1 gaps: persistAnswers in EF', () => {
  const src = read('supabase/functions/answer-form-question/index.ts');

  it('persistAnswers function exists', () => {
    expect(src).toContain('persistAnswers');
  });

  it('inserts into answers table', () => {
    expect(src).toContain('.from("answers").insert(rows)');
  });

  it('sets credits_charged=0 for cached answers', () => {
    expect(src).toContain('isCached ? 0 : CREDITS_PER_ANSWER');
  });

  it('sets credits_charged=CREDITS_PER_ANSWER for new answers', () => {
    expect(src).toContain('CREDITS_PER_ANSWER');
  });

  it('sets cached flag', () => {
    expect(src).toMatch(/cached:\s*isCached/);
  });

  it('handles persist errors gracefully — no silent fail', () => {
    expect(src).toContain('Persist error:');
  });
});

// ─────────────────────────────────────────────────
// 4. EF: Credit deduction
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

  it('passes feature: ai_answer to RPC', () => {
    expect(src).toContain('"ai_answer"');
  });

  it('only deducts for new (non-cached) answers', () => {
    expect(src).toMatch(/deductCredits[\s\S]{0,100}newAnswers\.length/);
  });

  it('cached answers are free (0 credits)', () => {
    expect(src).toContain('credits_charged: 0');
  });

  it('handles credit deduction errors gracefully — no silent fail', () => {
    expect(src).toMatch(/deductCredits[\s\S]{0,500}console\.warn/);
  });
});

// ─────────────────────────────────────────────────
// 5. EF: LinkedIn profile context
// ─────────────────────────────────────────────────
describe('AIS-F4-S1 gaps: LinkedIn profile context in EF', () => {
  const src = read('supabase/functions/answer-form-question/index.ts');

  it('fetchLinkedInProfile function exists', () => {
    expect(src).toContain('fetchLinkedInProfile');
  });

  it('queries linkedin_profiles table', () => {
    expect(src).toContain('linkedin_profiles');
  });

  it('fetches skills_array', () => {
    expect(src).toContain('skills_array');
  });

  it('fetches experience_json', () => {
    expect(src).toContain('experience_json');
  });

  it('passes linkedIn context to buildUserPrompt', () => {
    expect(src).toMatch(/buildUserPrompt[\s\S]{0,100}linkedIn/);
  });

  it('LinkedIn section added to prompt when available', () => {
    expect(src).toContain('## LinkedIn Profile');
  });

  it('handles missing LinkedIn profile gracefully', () => {
    expect(src).toMatch(/fetchLinkedInProfile[\s\S]{0,500}null/);
  });
});

// ─────────────────────────────────────────────────
// 6. EF: job_id in AnswerRequest interface
// ─────────────────────────────────────────────────
describe('AIS-F4-S1 gaps: job_id in AnswerRequest', () => {
  const src = read('supabase/functions/answer-form-question/index.ts');

  it('job_id is in AnswerRequest interface', () => {
    expect(src).toMatch(/AnswerRequest[\s\S]{0,200}job_id\?:/);
  });
});

// ─────────────────────────────────────────────────
// 7. EF: cache_hits + credits_charged in response
// ─────────────────────────────────────────────────
describe('AIS-F4-S1 gaps: response includes cache_hits + credits_charged', () => {
  const src = read('supabase/functions/answer-form-question/index.ts');

  it('cache_hits included in success response', () => {
    expect(src).toContain('cache_hits');
  });

  it('credits_charged included in success response', () => {
    expect(src).toContain('credits_charged');
  });
});

// ─────────────────────────────────────────────────
// 8. EF: fully-cached path bypasses Anthropic
// ─────────────────────────────────────────────────
describe('AIS-F4-S1 gaps: fully-cached path bypasses Anthropic', () => {
  const src = read('supabase/functions/answer-form-question/index.ts');

  it('early return when missedQuestions.length === 0', () => {
    expect(src).toContain('missedQuestions.length === 0');
  });

  it('early return responds with cache_hits and credits_charged: 0', () => {
    expect(src).toMatch(/missedQuestions\.length === 0[\s\S]{0,300}credits_charged:\s*0/);
  });

  it('rate limit only checked for non-cached questions', () => {
    expect(src).toMatch(/checkAndIncrementUsage[\s\S]{0,100}missedQuestions\.length/);
  });

  it('Anthropic only called for missedQuestions', () => {
    expect(src).toMatch(/buildUserPrompt[\s\S]{0,200}missedQuestions/);
  });
});

// ─────────────────────────────────────────────────
// 9. Version and build integrity
// ─────────────────────────────────────────────────
describe('AIS-F4-S1 gaps: version and build integrity', () => {
  it('version is v9.57', () => {
    expect(read('js/version.js')).toContain('v9.57');
  });

  it('dist/dashboard.min.js rebuilt at v9.57', () => {
    expect(read('dist/dashboard.min.js')).toContain('v9.57');
  });

  it('all required files present', () => {
    const files = [
      'supabase/migrations/v9.56-ais-f4-s1-answers-table.sql',
      'supabase/functions/answer-form-question/index.ts',
      'tests/ais-f4-s1-gap-fixes.test.js',
    ];
    files.forEach(f => expect(() => read(f)).not.toThrow());
  });
});
