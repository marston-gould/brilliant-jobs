/**
 * FB-INTPREP-001-S3 — Interview Prep Phase 3: Simulation Backend
 *
 * Spec: FB-INTPREP-001_InterviewPrep.docx §4, §6.1, §10 Phase 3
 * Product version: v9.51
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const read = f => readFileSync(join(ROOT, f), 'utf-8');
const exists = f => existsSync(join(ROOT, f));

const migration = read('supabase/migrations/v9.50-fb-intprep-001-s3-interview-sessions.sql');
const ef = read('supabase/functions/interview-simulate/index.ts');
const gateway = read('supabase/functions/api-gateway/index.ts');

// ─── Section 1: Migration Schema ─────────────────────────────────────

describe('1. Migration: interview_sessions Table', () => {
  it('1.1 — Table created', () => {
    expect(migration).toMatch(/CREATE TABLE.*interview_sessions/i);
  });

  const requiredColumns = [
    'user_id', 'job_id', 'pipeline_entry_id', 'messages', 'scorecard',
    'overall_score', 'feedback_mode', 'question_count', 'status',
    'started_at', 'completed_at'
  ];
  requiredColumns.forEach(col => {
    it(`1.x — Column ${col} present`, () => {
      expect(migration).toContain(col);
    });
  });

  it('1.2 — status CHECK constraint', () => {
    expect(migration).toMatch(/status.*CHECK.*in_progress.*completed.*abandoned/s);
  });

  it('1.3 — overall_score CHECK 0-100', () => {
    expect(migration).toMatch(/overall_score.*CHECK.*>= 0.*<= 100/s);
  });

  it('1.4 — user_id FK to auth.users', () => {
    expect(migration).toMatch(/user_id.*REFERENCES auth\.users/);
  });

  it('1.5 — messages default empty array', () => {
    expect(migration).toMatch(/messages.*jsonb.*DEFAULT.*\[\]/s);
  });

  it('1.6 — RLS enabled', () => {
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });

  it('1.7 — User SELECT policy with auth.uid()', () => {
    expect(migration).toMatch(/interview_sessions_user_select.*auth\.uid\(\)/s);
  });

  it('1.8 — User INSERT policy', () => {
    expect(migration).toMatch(/interview_sessions_user_insert/);
  });

  it('1.9 — User UPDATE policy', () => {
    expect(migration).toMatch(/interview_sessions_user_update/);
  });

  it('1.10 — Service role full access policy', () => {
    expect(migration).toMatch(/interview_sessions_service.*service_role/s);
  });
});

// ─── Section 2: Indexes ──────────────────────────────────────────────

describe('2. Migration: Indexes', () => {
  it('2.1 — Index on user_id', () => {
    expect(migration).toMatch(/CREATE INDEX.*idx_is_user_id.*user_id/);
  });

  it('2.2 — Index on status (partial for in_progress)', () => {
    expect(migration).toMatch(/CREATE INDEX.*idx_is_status.*status.*WHERE.*in_progress/);
  });

  it('2.3 — Composite index on user_id + status + started_at', () => {
    expect(migration).toMatch(/CREATE INDEX.*idx_is_user_status.*user_id.*status.*started_at/);
  });
});

// ─── Section 3: Edge Function Structure ──────────────────────────────

describe('3. EF: interview-simulate', () => {
  it('3.1 — File exists', () => {
    expect(exists('supabase/functions/interview-simulate/index.ts')).toBe(true);
  });

  it('3.2 — Uses Sonnet model', () => {
    expect(ef).toMatch(/claude-sonnet-4-20250514/);
  });

  it('3.3 — Has start action', () => {
    expect(ef).toMatch(/case 'start'/);
  });

  it('3.4 — Has message action', () => {
    expect(ef).toMatch(/case 'message'/);
  });

  it('3.5 — Has abandon action', () => {
    expect(ef).toMatch(/case 'abandon'/);
  });

  it('3.6 — Has history action', () => {
    expect(ef).toMatch(/case 'history'/);
  });

  it('3.7 — Requires user JWT auth', () => {
    expect(ef).toMatch(/auth\.getUser/);
    expect(ef).toMatch(/Authorization required/);
  });

  it('3.8 — Returns 503 when API key missing', () => {
    expect(ef).toMatch(/ANTHROPIC_API_KEY not configured/);
  });
});

// ─── Section 4: System Prompt Architecture ───────────────────────────

describe('4. System Prompt', () => {
  it('4.1 — XML-tagged job_description block', () => {
    expect(ef).toMatch(/<job_description>/);
  });

  it('4.2 — XML-tagged resume_text block', () => {
    expect(ef).toMatch(/<resume_text>/);
  });

  it('4.3 — XML-tagged match_analysis block', () => {
    expect(ef).toMatch(/<match_analysis>/);
  });

  it('4.4 — XML-tagged company_context block', () => {
    expect(ef).toMatch(/<company_context>/);
  });

  it('4.5 — XML-tagged interview_config block', () => {
    expect(ef).toMatch(/<interview_config>/);
  });

  it('4.6 — Feedback mode toggle in prompt', () => {
    expect(ef).toMatch(/feedback_mode/);
    expect(ef).toMatch(/\[COACH\]/);
    expect(ef).toMatch(/Do NOT provide coaching feedback/);
  });

  it('4.7 — Question count configurable in prompt', () => {
    expect(ef).toMatch(/question_count/);
  });
});

// ─── Section 5: Prompt Caching ───────────────────────────────────────

describe('5. Prompt Caching', () => {
  it('5.1 — Uses prompt-caching beta header', () => {
    expect(ef).toMatch(/prompt-caching-2024-07-31/);
  });

  it('5.2 — System prompt has cache_control ephemeral', () => {
    expect(ef).toMatch(/cache_control.*ephemeral/s);
  });

  it('5.3 — Logs cache hit performance', () => {
    expect(ef).toMatch(/cache_read_input_tokens/);
  });
});

// ─── Section 6: Scorecard ────────────────────────────────────────────

describe('6. Scorecard Generation', () => {
  it('6.1 — Scorecard JSON structure defined in prompt', () => {
    expect(ef).toMatch(/overall_score/);
    expect(ef).toMatch(/per_question_scores/);
    expect(ef).toMatch(/strengths/);
    expect(ef).toMatch(/improvements/);
    expect(ef).toMatch(/talking_points/);
    expect(ef).toMatch(/gap_coverage/);
  });

  it('6.2 — Scorecard stored on completion', () => {
    expect(ef).toMatch(/updatePayload\.scorecard/);
    expect(ef).toMatch(/updatePayload\.overall_score/);
  });

  it('6.3 — Status set to completed with scorecard', () => {
    expect(ef).toMatch(/updatePayload\.status = 'completed'/);
    expect(ef).toMatch(/updatePayload\.completed_at/);
  });

  it('6.4 — is_complete flag triggers scorecard path', () => {
    expect(ef).toMatch(/claudeResponse\.is_complete.*claudeResponse\.scorecard/s);
  });
});

// ─── Section 7: Context Assembly ─────────────────────────────────────

describe('7. Context Assembly', () => {
  it('7.1 — Loads JD from ats_jobs', () => {
    expect(ef).toMatch(/\.from\('ats_jobs'\)/);
  });

  it('7.2 — Strips HTML from content', () => {
    expect(ef).toMatch(/replace\(.*<.*>.*g/);
  });

  it('7.3 — Caps JD at 8K chars', () => {
    expect(ef).toMatch(/\.slice\(0,\s*8000\)/);
  });

  it('7.4 — Loads active resume from resume_archive', () => {
    expect(ef).toMatch(/resume_archive/);
    expect(ef).toMatch(/extracted_text/);
  });

  it('7.5 — Gets active_resume_id from user profile', () => {
    expect(ef).toMatch(/active_resume_id/);
  });

  it('7.6 — Caps resume at 6K chars', () => {
    expect(ef).toMatch(/\.slice\(0,\s*6000\)/);
  });

  it('7.7 — Supports focus_question from Question Bank', () => {
    expect(ef).toMatch(/focus_question/);
  });
});

// ─── Section 8: Gateway Route ────────────────────────────────────────

describe('8. Gateway Route', () => {
  it('8.1 — Route #129 registered', () => {
    expect(gateway).toMatch(/interview-simulate/);
  });

  it('8.2 — Total updated to 129', () => {
    expect(gateway).toMatch(/TOTAL: 129 routes/);
  });
});

// ─── Section 9: PostHog Events ───────────────────────────────────────

describe('9. PostHog Events', () => {
  it('9.1 — simulation_started', () => {
    expect(ef).toMatch(/simulation_started/);
  });

  it('9.2 — simulation_completed with score', () => {
    expect(ef).toMatch(/simulation_completed/);
    expect(ef).toMatch(/overall_score/);
  });

  it('9.3 — simulation_message_sent with turn_number', () => {
    expect(ef).toMatch(/simulation_message_sent/);
    expect(ef).toMatch(/turn_number/);
  });

  it('9.4 — simulation_abandoned', () => {
    expect(ef).toMatch(/simulation_abandoned/);
  });
});

// ─── Section 10: Error Handling ──────────────────────────────────────

describe('10. Error Handling', () => {
  it('10.1 — JSON parse failure handled gracefully', () => {
    expect(ef).toMatch(/JSON parse failed.*treating as plain reply/);
  });

  it('10.2 — Session not found returns 404', () => {
    expect(ef).toMatch(/Session not found.*404/s);
  });

  it('10.3 — Session not in_progress returns 400', () => {
    expect(ef).toMatch(/Session is not in progress/);
  });

  it('10.4 — Anthropic error includes status', () => {
    expect(ef).toMatch(/Anthropic API.*response\.status/);
  });
});

// ─── Section 11: File Inventory ──────────────────────────────────────

describe('11. File Inventory', () => {
  const files = [
    'supabase/migrations/v9.50-fb-intprep-001-s3-interview-sessions.sql',
    'supabase/functions/interview-simulate/index.ts',
    'supabase/functions/api-gateway/index.ts',
    'tests/fb-intprep-001-s3-simulation-backend.test.js',
  ];
  files.forEach(f => {
    it(`11.x — ${f} exists`, () => {
      expect(exists(f)).toBe(true);
    });
  });
});
