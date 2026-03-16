// tests/spec-lpg-001-s1-ai-writing-tools.test.js
// SPEC-LPG-001 Session 1: AI Bullet Point Generator (F1) + AI Summary Generator (F2)
// 47 validation tests

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf-8');

// --- Section 1: Edge Function Structure ---
describe('1. resume-rewrite-bullet EF — Generate + Summary Actions', () => {
  const ef = read('supabase/functions/resume-rewrite-bullet/index.ts');

  it('1.1 EF exists and is non-trivial', () => {
    expect(ef.length).toBeGreaterThan(5000);
  });

  it('1.2 Has generate action handler', () => {
    expect(ef).toContain("action === 'generate'");
  });

  it('1.3 Has summary action handler', () => {
    expect(ef).toContain("action === 'summary'");
  });

  it('1.4 Has rewrite action handler (original preserved)', () => {
    expect(ef).toContain("action === 'rewrite'");
  });

  it('1.5 Generate validates role_title required', () => {
    expect(ef).toContain('role_title is required');
  });

  it('1.6 Summary validates tone enum', () => {
    expect(ef).toContain("'professional', 'executive', 'technical'");
  });

  it('1.7 Generate system prompt starts with action verbs', () => {
    expect(ef).toContain('Start each with a strong action verb');
  });

  it('1.8 Summary system prompt avoids cliches', () => {
    expect(ef).toContain('"passionate"');
    expect(ef).toContain('"results-driven"');
  });

  it('1.9 Generate returns 3-5 bullets', () => {
    expect(ef).toContain('parseJsonArray(rawContent, 3, 5)');
  });

  it('1.10 Summary returns 2-3 summaries', () => {
    expect(ef).toContain('parseJsonArray(rawContent, 2, 3)');
  });

  it('1.11 All actions use anthropicFetch with circuit breaker', () => {
    expect(ef).toContain("import { anthropicFetch } from '../_shared/anthropic.ts'");
    const matches = ef.match(/anthropicFetch\(/g);
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('1.12 All actions deduct 1 credit', () => {
    const deductCalls = ef.match(/deductCredit\(/g);
    expect(deductCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('1.13 Credit check rejects with 402', () => {
    expect(ef).toContain('status: 402');
  });

  it('1.14 Summary reads linkedin_profiles table', () => {
    expect(ef).toContain("from('linkedin_profiles')");
  });

  it('1.15 Summary reads resume_archive for parsed_json', () => {
    expect(ef).toContain("from('resume_archive')");
    expect(ef).toContain('parsed_json');
  });

  it('1.16 Summary reads target job from ats_jobs', () => {
    expect(ef).toContain("from('ats_jobs')");
  });

  it('1.17 Error handling uses console.error with structured JSON', () => {
    const errorLogs = ef.match(/console\.error\(JSON\.stringify/g);
    expect(errorLogs.length).toBeGreaterThanOrEqual(4);
  });

  it('1.18 Unknown action returns 400', () => {
    expect(ef).toContain('Unknown action');
  });

  it('1.19 Generate response includes has_target_keywords flag', () => {
    expect(ef).toContain('has_target_keywords');
  });

  it('1.20 Summary response includes has_linkedin flag', () => {
    expect(ef).toContain('has_linkedin');
  });
});

// --- Section 2: Dashboard HTML ---
describe('2. Dashboard HTML — AI Writing Tools Panel', () => {
  const html = read('dashboard.html');

  it('2.1 AI Writing Tools details element exists', () => {
    expect(html).toContain('id="ai-writing-tools"');
  });

  it('2.2 Bullet generator role title input', () => {
    expect(html).toContain('id="bg-role-title"');
  });

  it('2.3 Bullet generator company input', () => {
    expect(html).toContain('id="bg-company"');
  });

  it('2.4 Bullet generator context textarea', () => {
    expect(html).toContain('id="bg-context"');
  });

  it('2.5 Bullet generator target job dropdown', () => {
    expect(html).toContain('id="bg-target-job"');
  });

  it('2.6 Bullet generator button calls _bjGenerateBullets', () => {
    expect(html).toContain('_bjGenerateBullets()');
  });

  it('2.7 Bullet generator results container', () => {
    expect(html).toContain('id="bg-results"');
  });

  it('2.8 Summary generator resume dropdown', () => {
    expect(html).toContain('id="sg-resume-select"');
  });

  it('2.9 Summary generator tone dropdown with 3 options', () => {
    expect(html).toContain('id="sg-tone"');
    expect(html).toContain('value="professional"');
    expect(html).toContain('value="executive"');
    expect(html).toContain('value="technical"');
  });

  it('2.10 Summary generator target job dropdown', () => {
    expect(html).toContain('id="sg-target-job"');
  });

  it('2.11 Summary generator button calls _bjGenerateSummary', () => {
    expect(html).toContain('_bjGenerateSummary()');
  });

  it('2.12 Summary generator results container', () => {
    expect(html).toContain('id="sg-results"');
  });

  it('2.13 Panel is collapsible (details/summary)', () => {
    expect(html).toContain('<details id="ai-writing-tools"');
    expect(html).toContain('<summary');
  });

  it('2.14 Sparkles icon for panel header', () => {
    expect(html).toContain('data-lucide="sparkles"');
  });
});

// --- Section 3: Client-Side JS ---
describe('3. resumes.js — AI Writing Tools Client Code', () => {
  const js = read('js/resumes.js');

  it('3.1 _bjGenerateBullets function exists', () => {
    expect(js).toContain('window._bjGenerateBullets');
  });

  it('3.2 _bjGenerateSummary function exists', () => {
    expect(js).toContain('window._bjGenerateSummary');
  });

  it('3.3 _bjCopyBullet function exists', () => {
    expect(js).toContain('window._bjCopyBullet');
  });

  it('3.4 _bjCopySummary function exists', () => {
    expect(js).toContain('window._bjCopySummary');
  });

  it('3.5 _bjSetAsSummary function exists', () => {
    expect(js).toContain('window._bjSetAsSummary');
  });

  it('3.6 Tier gate with daily limits', () => {
    expect(js).toContain('AI_WRITING_DAILY');
    expect(js).toContain('free: 3');
    expect(js).toContain('starter: 10');
    expect(js).toContain('pro: Infinity');
  });

  it('3.7 Daily count tracked in localStorage', () => {
    expect(js).toContain('bj_ai_writing_daily');
  });

  it('3.8 PostHog bullet_generator_used event', () => {
    expect(js).toContain("'bullet_generator_used'");
  });

  it('3.9 PostHog bullet_copied event', () => {
    expect(js).toContain("'bullet_copied'");
  });

  it('3.10 PostHog summary_generator_used event', () => {
    expect(js).toContain("'summary_generator_used'");
  });

  it('3.11 PostHog summary_copied event', () => {
    expect(js).toContain("'summary_copied'");
  });

  it('3.12 PostHog summary_set event', () => {
    expect(js).toContain("'summary_set'");
  });

  it('3.13 Set as Summary writes to parsed_json.summary', () => {
    expect(js).toContain('pj.summary = summaries[idx]');
  });

  it('3.14 Error handling uses reportError', () => {
    const reports = js.match(/reportError\(['"]/g);
    expect(reports.length).toBeGreaterThanOrEqual(5);
  });

  it('3.15 BJ namespace exports', () => {
    expect(js).toContain('window.BJ._bjGenerateBullets');
    expect(js).toContain('window.BJ._bjGenerateSummary');
  });

  it('3.16 Resume dropdown populated from resumes array', () => {
    expect(js).toContain('_populateResumeDropdown');
  });

  it('3.17 Target job dropdowns populated from user_pipeline', () => {
    expect(js).toContain('_populateTargetJobDropdowns');
    expect(js).toContain("from('user_pipeline')");
  });
});

// --- Section 4: Tier Gating ---
describe('4. Tier Gating — ai_writing_daily', () => {
  const tg = read('js/tier-gating.js');

  it('4.1 ai_writing_daily tier gate exists', () => {
    expect(tg).toContain('ai_writing_daily');
  });

  it('4.2 Free tier: 3/day', () => {
    expect(tg).toMatch(/ai_writing_daily.*free:\s*3/);
  });

  it('4.3 Starter tier: 10/day', () => {
    expect(tg).toMatch(/ai_writing_daily.*starter:\s*10/);
  });

  it('4.4 Pro tier: unlimited', () => {
    expect(tg).toMatch(/ai_writing_daily.*pro:\s*Infinity/);
  });
});

// --- Section 5: File Inventory ---
describe('5. File Inventory', () => {
  it('5.1 resume-rewrite-bullet EF exists', () => {
    expect(existsSync(resolve(ROOT, 'supabase/functions/resume-rewrite-bullet/index.ts'))).toBe(true);
  });

  it('5.2 Test file exists', () => {
    expect(existsSync(resolve(ROOT, 'tests/spec-lpg-001-s1-ai-writing-tools.test.js'))).toBe(true);
  });
});
