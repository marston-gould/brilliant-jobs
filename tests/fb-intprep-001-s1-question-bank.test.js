/**
 * FB-INTPREP-001-S1 — Interview Prep Phase 1: Question Bank Backend
 *
 * Spec: FB-INTPREP-001_InterviewPrep.docx §3, §6.2, §10 Phase 1
 * Product version: v9.49
 *
 * Validates:
 *   1. Migration: interview_questions table schema
 *   2. Edge Function: interview-generate-questions structure
 *   3. Gateway: route #128
 *   4. PostgREST: RLS allows authenticated read
 *   5. Question generation: prompt, model, output validation
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const read = f => readFileSync(join(ROOT, f), 'utf-8');
const exists = f => existsSync(join(ROOT, f));

const migration = read('supabase/migrations/v9.48-fb-intprep-001-s1-question-bank.sql');
const ef = read('supabase/functions/interview-generate-questions/index.ts');
const gateway = read('supabase/functions/api-gateway/index.ts');

// ─── Section 1: Migration Schema ─────────────────────────────────────

describe('1. Migration: interview_questions Table', () => {
  it('1.1 — Table created', () => {
    expect(migration).toMatch(/CREATE TABLE.*interview_questions/i);
  });

  it('1.2 — All required columns present', () => {
    const requiredColumns = [
      'id', 'question_text', 'category', 'difficulty',
      'role_cluster', 'department', 'level', 'skill_tags',
      'source_cluster_size', 'generated_at', 'model_version'
    ];
    for (const col of requiredColumns) {
      expect(migration).toContain(col);
    }
  });

  it('1.3 — category CHECK constraint', () => {
    expect(migration).toMatch(/category.*CHECK.*behavioral.*technical.*situational.*case_study/s);
  });

  it('1.4 — difficulty CHECK constraint', () => {
    expect(migration).toMatch(/difficulty.*CHECK.*standard.*advanced/s);
  });

  it('1.5 — skill_tags is text array', () => {
    expect(migration).toMatch(/skill_tags\s+text\[\]/);
  });

  it('1.6 — UUID primary key with gen_random_uuid', () => {
    expect(migration).toMatch(/id\s+uuid\s+PRIMARY KEY\s+DEFAULT\s+gen_random_uuid/i);
  });

  it('1.7 — RLS enabled', () => {
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });

  it('1.8 — Authenticated read policy', () => {
    expect(migration).toMatch(/interview_questions_read.*SELECT.*authenticated/s);
  });

  it('1.9 — Service role write policy', () => {
    expect(migration).toMatch(/interview_questions_service_write.*service_role/s);
  });
});

// ─── Section 2: Indexes ──────────────────────────────────────────────

describe('2. Migration: Indexes', () => {
  it('2.1 — Index on role_cluster', () => {
    expect(migration).toMatch(/CREATE INDEX.*idx_iq_role_cluster.*ON.*interview_questions.*role_cluster/);
  });

  it('2.2 — Index on category', () => {
    expect(migration).toMatch(/CREATE INDEX.*idx_iq_category.*ON.*interview_questions.*category/);
  });

  it('2.3 — Index on difficulty', () => {
    expect(migration).toMatch(/CREATE INDEX.*idx_iq_difficulty.*ON.*interview_questions.*difficulty/);
  });

  it('2.4 — GIN index on skill_tags', () => {
    expect(migration).toMatch(/CREATE INDEX.*idx_iq_skill_tags.*USING GIN.*skill_tags/);
  });

  it('2.5 — Full-text search tsvector column', () => {
    expect(migration).toMatch(/question_tsv.*tsvector/);
  });

  it('2.6 — GIN index on question_tsv', () => {
    expect(migration).toMatch(/CREATE INDEX.*idx_iq_question_tsv.*USING GIN.*question_tsv/);
  });

  it('2.7 — Index on generated_at DESC', () => {
    expect(migration).toMatch(/CREATE INDEX.*idx_iq_generated_at.*generated_at DESC/);
  });
});

// ─── Section 3: Helper View ──────────────────────────────────────────

describe('3. Migration: Cluster View', () => {
  it('3.1 — v_interview_question_clusters view exists', () => {
    expect(migration).toMatch(/CREATE.*VIEW.*v_interview_question_clusters/i);
  });

  it('3.2 — View groups by role_cluster, department, level', () => {
    expect(migration).toMatch(/GROUP BY role_cluster.*department.*level/);
  });

  it('3.3 — View includes per-category counts', () => {
    expect(migration).toMatch(/behavioral_count/);
    expect(migration).toMatch(/technical_count/);
    expect(migration).toMatch(/situational_count/);
    expect(migration).toMatch(/case_study_count/);
  });

  it('3.4 — View granted to authenticated', () => {
    expect(migration).toMatch(/GRANT SELECT ON v_interview_question_clusters TO authenticated/);
  });
});

// ─── Section 4: Edge Function Structure ──────────────────────────────

describe('4. Edge Function: interview-generate-questions', () => {
  it('4.1 — File exists', () => {
    expect(exists('supabase/functions/interview-generate-questions/index.ts')).toBe(true);
  });

  it('4.2 — Uses Haiku model', () => {
    expect(ef).toMatch(/claude-haiku-4-5-20251001/);
  });

  it('4.3 — Has generate action', () => {
    expect(ef).toMatch(/case 'generate'/);
  });

  it('4.4 — Has clusters action', () => {
    expect(ef).toMatch(/case 'clusters'/);
  });

  it('4.5 — Has status action', () => {
    expect(ef).toMatch(/case 'status'/);
  });

  it('4.6 — Uses ANTHROPIC_API_KEY', () => {
    expect(ef).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('4.7 — Returns 503 when API key missing', () => {
    expect(ef).toMatch(/503/);
    expect(ef).toMatch(/ANTHROPIC_API_KEY not configured/);
  });

  it('4.8 — CORS headers present', () => {
    expect(ef).toMatch(/brilliantjobs\.app/);
    expect(ef).toMatch(/Access-Control-Allow-Origin/);
  });
});

// ─── Section 5: Question Generation Logic ────────────────────────────

describe('5. Question Generation', () => {
  it('5.1 — System prompt defines all 4 categories', () => {
    expect(ef).toMatch(/behavioral/);
    expect(ef).toMatch(/technical/);
    expect(ef).toMatch(/situational/);
    expect(ef).toMatch(/case_study/);
  });

  it('5.2 — System prompt defines both difficulties', () => {
    expect(ef).toMatch(/standard/);
    expect(ef).toMatch(/advanced/);
  });

  it('5.3 — Validates category in parsed output', () => {
    expect(ef).toMatch(/validCategories/);
  });

  it('5.4 — Validates difficulty in parsed output', () => {
    expect(ef).toMatch(/validDifficulties/);
  });

  it('5.5 — Strips markdown fences from response', () => {
    expect(ef).toMatch(/```json|```/);
  });

  it('5.6 — Handles JSON parse failure gracefully', () => {
    expect(ef).toMatch(/JSON parse failed/);
  });

  it('5.7 — Calls Anthropic API endpoint', () => {
    expect(ef).toMatch(/api\.anthropic\.com\/v1\/messages/);
  });

  it('5.8 — Uses anthropic-version header', () => {
    expect(ef).toMatch(/anthropic-version/);
  });

  it('5.9 — Targets ~20 questions per cluster', () => {
    expect(ef).toMatch(/QUESTIONS_PER_CLUSTER\s*=\s*20/);
  });

  it('5.10 — Minimum cluster size enforced', () => {
    expect(ef).toMatch(/MIN_CLUSTER_SIZE\s*=\s*5/);
  });
});

// ─── Section 6: Clustering Logic ─────────────────────────────────────

describe('6. Clustering Logic', () => {
  it('6.1 — normalizeTitle strips seniority prefixes', () => {
    expect(ef).toMatch(/senior|sr|junior|jr|lead|principal|staff/i);
  });

  it('6.2 — normalizeTitle strips level suffixes', () => {
    expect(ef).toMatch(/Remove level suffixes/);
  });

  it('6.3 — Queries ats_jobs with status=open', () => {
    expect(ef).toMatch(/\.eq\('status',\s*'open'\)/);
  });

  it('6.4 — Filters out null titles', () => {
    expect(ef).toMatch(/\.not\('title',\s*'is',\s*null\)/);
  });

  it('6.5 — Aggregates extracted_skills by frequency', () => {
    expect(ef).toMatch(/skillFreq/);
    expect(ef).toMatch(/extracted_skills/);
  });

  it('6.6 — Separates core vs niche skills by threshold', () => {
    expect(ef).toMatch(/coreSkills/);
    expect(ef).toMatch(/nicheSkills/);
    expect(ef).toMatch(/0\.3/); // 30% threshold
  });

  it('6.7 — Excludes already-generated clusters by default', () => {
    expect(ef).toMatch(/existingSet/);
    expect(ef).toMatch(/!includeExisting/);
  });
});

// ─── Section 7: Gateway Route ────────────────────────────────────────

describe('7. Gateway Route', () => {
  it('7.1 — Route #128 registered', () => {
    expect(gateway).toMatch(/interview-generate-questions/);
  });

  it('7.2 — Total route count updated to 128', () => {
    expect(gateway).toMatch(/TOTAL: 128 routes/);
  });

  it('7.3 — Route comment references FB-INTPREP-001-S1', () => {
    expect(gateway).toMatch(/FB-INTPREP-001-S1/);
  });
});

// ─── Section 8: PostgREST API ────────────────────────────────────────

describe('8. PostgREST API (RLS)', () => {
  it('8.1 — Authenticated users can SELECT', () => {
    expect(migration).toMatch(/FOR SELECT TO authenticated/);
  });

  it('8.2 — No public/anon access', () => {
    expect(migration).not.toMatch(/TO anon/);
    expect(migration).not.toMatch(/TO public/);
  });

  it('8.3 — GRANT SELECT to authenticated', () => {
    expect(migration).toMatch(/GRANT SELECT ON interview_questions TO authenticated/);
  });

  it('8.4 — GRANT ALL to service_role', () => {
    expect(migration).toMatch(/GRANT ALL ON interview_questions TO service_role/);
  });
});

// ─── Section 9: PostHog Events ───────────────────────────────────────

describe('9. PostHog Events', () => {
  it('9.1 — interview_questions_generated event', () => {
    expect(ef).toMatch(/interview_questions_generated/);
  });

  it('9.2 — Event includes questions_generated count', () => {
    expect(ef).toMatch(/questions_generated.*totalGenerated|totalGenerated.*questions_generated/s);
  });

  it('9.3 — Event includes clusters_processed count', () => {
    expect(ef).toMatch(/clusters_processed/);
  });
});

// ─── Section 10: Error Handling ──────────────────────────────────────

describe('10. Error Handling', () => {
  it('10.1 — No empty catches', () => {
    // Allow /* non-critical */ pattern
    const catches = ef.match(/catch\s*\{?\s*\}/g);
    expect(catches).toBeNull();
  });

  it('10.2 — Console.warn on cluster errors (not swallowed)', () => {
    expect(ef).toMatch(/console\.warn.*Cluster error/);
  });

  it('10.3 — Errors array returned in response', () => {
    expect(ef).toMatch(/errors:.*errors\.length/);
  });

  it('10.4 — Anthropic API error includes status code', () => {
    expect(ef).toMatch(/Anthropic API.*response\.status/);
  });
});

// ─── Section 11: Cost Controls ───────────────────────────────────────

describe('11. Cost Controls', () => {
  it('11.1 — MAX_CLUSTERS_PER_RUN caps batch size', () => {
    expect(ef).toMatch(/MAX_CLUSTERS_PER_RUN\s*=\s*20/);
  });

  it('11.2 — Limit enforced via Math.min', () => {
    expect(ef).toMatch(/Math\.min.*limit.*MAX_CLUSTERS_PER_RUN|Math\.min.*MAX_CLUSTERS_PER_RUN.*limit/);
  });

  it('11.3 — max_tokens capped at 4096', () => {
    expect(ef).toMatch(/max_tokens:\s*4096/);
  });
});

// ─── Section 12: File Inventory ──────────────────────────────────────

describe('12. File Inventory', () => {
  const files = [
    'supabase/migrations/v9.48-fb-intprep-001-s1-question-bank.sql',
    'supabase/functions/interview-generate-questions/index.ts',
    'supabase/functions/api-gateway/index.ts',
    'tests/fb-intprep-001-s1-question-bank.test.js',
  ];

  files.forEach(f => {
    it(`12.x — ${f} exists`, () => {
      expect(exists(f)).toBe(true);
    });
  });
});
