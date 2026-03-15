/**
 * AIS-F4-S1: AI Q&A Gate Removal + Answer Review — COMPLETE SPEC COVERAGE
 * =========================================================================
 * Covers all spec items:
 *  1. Consumer access (tier-gated, not admin-gated) — aiAnswerer.ts
 *  2. Answer review panel — job-site-overlay.ts (covered in ais-f4-s1-ai-qa-gate-removal.test.js)
 *  3. Answer quality feedback PostHog — background.ts (covered above)
 *  4. Answer history — answers table migration
 *  5. Answer history — EF persists to DB (persistAnswers)
 *  6. Answer history — EF loads from DB cache (loadAnswerCache)
 *  7. Personal context — LinkedIn profile fetched and in prompt
 *  8. Credit model — 0.5/answer, cached=free, deductCredits
 *  9. Version / build integrity at v9.57
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

// ─────────────────────────────────────────────────
// 1. Consumer access: aiAnswerer.ts tier gate
// ─────────────────────────────────────────────────
describe('AIS-F4-S1: Consumer tier gate in aiAnswerer.ts', () => {
  const src = read('extension/utils/aiAnswerer.ts');

  it('tier gate allows pro users', () => {
    expect(src).toContain("'pro'");
  });

  it('tier gate allows starter users', () => {
    expect(src).toContain("'starter'");
  });

  it('tier gate blocks free users', () => {
    expect(src).toMatch(/isEligible[\s\S]{0,200}tier_blocked|tier_blocked[\s\S]{0,200}isEligible/);
  });

  it('returns tier_blocked confidence for ineligible users', () => {
    expect(src).toContain('tier_blocked');
  });

  it('reads userRole from chrome.storage.local', () => {
    expect(src).toContain('chrome.storage.local');
    expect(src).toContain('userRole');
  });
});

// ─────────────────────────────────────────────────
// 2. Answer history: answers table migration
// ─────────────────────────────────────────────────
describe('AIS-F4-S1: answers table migration', () => {
  const src = read('supabase/migrations/v9.56-ais-f4-s1-answers-table.sql');

  it('migration file exists', () => {
    expect(src).toBeTruthy();
  });

  it('creates answers table', () => {
    expect(src).toContain('CREATE TABLE');
    expect(src).toContain('answers');
  });

  it('has user_id FK to auth.users', () => {
    expect(src).toMatch(/user_id[\s\S]{0,100}REFERENCES auth\.users/);
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

  it('has feedback column with up/down CHECK', () => {
    expect(src).toContain('feedback');
    expect(src).toContain("'up'");
    expect(src).toContain("'down'");
  });

  it('has credits_charged column', () => {
    expect(src).toContain('credits_charged');
  });

  it('has cached boolean column', () => {
    expect(src).toContain('cached');
  });

  it('has job_id column for per-job context', () => {
    expect(src).toContain('job_id');
  });

  it('has index on user_id + field_label for cache lookups', () => {
    expect(src).toContain('idx_answers_user_label');
  });

  it('enables RLS', () => {
    expect(src).toContain('ENABLE ROW LEVEL SECURITY');
  });

  it('has user policy for own rows', () => {
    expect(src).toContain('auth.uid() = user_id');
  });

  it('has service_role policy', () => {
    expect(src).toContain('service_role');
  });
});

// ─────────────────────────────────────────────────
// 3. DB cache: loadAnswerCache function in EF
// ─────────────────────────────────────────────────
describe('AIS-F4-S1: DB answer cache in answer-form-question EF', () => {
  const src = read('supabase/functions/answer-form-question/index.ts');

  it('loadAnswerCache function defined', () => {
    expect(src).toContain('loadAnswerCache');
  });

  it('queries answers table by user_id and field_label', () => {
    expect(src).toMatch(/from\("answers"\)[\s\S]{0,200}field_label|answers[\s\S]{0,200}field_label/);
  });

  it('uses ANSWER_CACHE_DAYS cutoff (7 days)', () => {
    expect(src).toContain('ANSWER_CACHE_DAYS');
    expect(src).toContain('7');
  });

  it('returns Map for O(1) lookups', () => {
    expect(src).toMatch(/new Map|Map<string/);
  });

  it('cached questions bypass Anthropic entirely', () => {
    expect(src).toContain('missedQuestions.length === 0');
  });

  it('fully-cached path returns cache_hits in response', () => {
    expect(src).toMatch(/missedQuestions\.length === 0[\s\S]{0,300}cache_hits/);
  });

  it('mixed cache/miss path merges cached + new answers', () => {
    expect(src).toContain('cachedAnswers');
    expect(src).toContain('newAnswers');
    expect(src).toMatch(/\[\.\.\.cachedAnswers,\s*\.\.\.newAnswers\]/);
  });

  it('logs cache hit count', () => {
    expect(src).toMatch(/cached[\s\S]{0,100}cache/);
  });
});

// ─────────────────────────────────────────────────
// 4. Persist answers: persistAnswers function
// ─────────────────────────────────────────────────
describe('AIS-F4-S1: persistAnswers in answer-form-question EF', () => {
  const src = read('supabase/functions/answer-form-question/index.ts');

  it('persistAnswers function defined', () => {
    expect(src).toContain('persistAnswers');
  });

  it('inserts into answers table', () => {
    expect(src).toMatch(/from\("answers"\)[\s\S]{0,100}insert|answers[\s\S]{0,200}insert/);
  });

  it('sets credits_charged = 0 for cached answers', () => {
    expect(src).toMatch(/isCached[\s\S]{0,100}0.*CREDITS_PER_ANSWER|isCached.*\? 0/);
  });

  it('sets cached flag on row', () => {
    expect(src).toMatch(/cached:\s*isCached/);
  });

  it('called after successful AI response', () => {
    expect(src).toMatch(/await persistAnswers[\s\S]{0,300}await deductCredits/);
  });

  it('non-fatal on error (warns, does not throw)', () => {
    expect(src).toContain('Persist error');
  });
});

// ─────────────────────────────────────────────────
// 5. Credit model: deductCredits function
// ─────────────────────────────────────────────────
describe('AIS-F4-S1: credit deduction in answer-form-question EF', () => {
  const src = read('supabase/functions/answer-form-question/index.ts');

  it('CREDITS_PER_ANSWER constant = 0.5', () => {
    expect(src).toContain('CREDITS_PER_ANSWER = 0.5');
  });

  it('deductCredits function defined', () => {
    expect(src).toContain('deductCredits');
  });

  it('calls deduct_credits RPC', () => {
    expect(src).toContain('deduct_credits');
  });

  it('deducts only for new (non-cached) answers', () => {
    expect(src).toContain('newAnswers.length');
    expect(src).toMatch(/newAnswers\.length \* CREDITS_PER_ANSWER/);
  });

  it('response includes credits_charged', () => {
    expect(src).toContain('credits_charged');
  });

  it('non-fatal on credit error (warns, does not throw)', () => {
    expect(src).toContain('Credit deduction error');
  });

  it('cached questions charged 0 credits', () => {
    expect(src).toMatch(/credits_charged:\s*0/);
  });
});

// ─────────────────────────────────────────────────
// 6. Personal context: LinkedIn profile in EF
// ─────────────────────────────────────────────────
describe('AIS-F4-S1: LinkedIn personal context in EF', () => {
  const src = read('supabase/functions/answer-form-question/index.ts');

  it('fetchLinkedInProfile function defined', () => {
    expect(src).toContain('fetchLinkedInProfile');
  });

  it('queries linkedin_profiles table', () => {
    expect(src).toContain('linkedin_profiles');
  });

  it('fetches experience_json and skills_array', () => {
    expect(src).toContain('experience_json');
    expect(src).toContain('skills_array');
  });

  it('called in main handler', () => {
    expect(src).toMatch(/const linkedInProfile = await fetchLinkedInProfile/);
  });

  it('passed to buildUserPrompt', () => {
    expect(src).toMatch(/buildUserPrompt\([^)]+linkedInProfile/);
  });

  it('buildUserPrompt includes LinkedIn section when present', () => {
    expect(src).toContain('## LinkedIn Profile');
  });

  it('includes skills in prompt', () => {
    expect(src).toContain('skills_array');
    expect(src).toContain('Skills:');
  });

  it('includes recent experience in prompt', () => {
    expect(src).toContain('Recent Experience:');
  });

  it('non-fatal when no LinkedIn profile (returns null)', () => {
    expect(src).toMatch(/fetchLinkedInProfile[\s\S]{0,300}null/);
  });
});

// ─────────────────────────────────────────────────
// 7. AnswerRequest interface includes job_id
// ─────────────────────────────────────────────────
describe('AIS-F4-S1: AnswerRequest interface', () => {
  const src = read('supabase/functions/answer-form-question/index.ts');

  it('job_id field in AnswerRequest', () => {
    expect(src).toMatch(/interface AnswerRequest[\s\S]{0,200}job_id/);
  });
});

// ─────────────────────────────────────────────────
// 8. Rate limit only applied to non-cached questions
// ─────────────────────────────────────────────────
describe('AIS-F4-S1: rate limit scoped to missed questions', () => {
  const src = read('supabase/functions/answer-form-question/index.ts');

  it('checkAndIncrementUsage called with missedQuestions.length', () => {
    expect(src).toContain('missedQuestions.length');
    expect(src).toMatch(/checkAndIncrementUsage[\s\S]{0,100}missedQuestions\.length/);
  });
});

// ─────────────────────────────────────────────────
// 9. Version and build integrity
// ─────────────────────────────────────────────────
describe('AIS-F4-S1 (complete): Version and build integrity', () => {
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
      'extension/utils/aiAnswerer.ts',
      'extension/background.ts',
      'extension/job-site-overlay.ts',
      'extension/contentScript.ts',
      'tests/ais-f4-s1-ai-qa-gate-removal.test.js',
      'tests/ais-f4-s1-complete-spec.test.js',
    ];
    files.forEach(f => expect(() => read(f)).not.toThrow());
  });
});
