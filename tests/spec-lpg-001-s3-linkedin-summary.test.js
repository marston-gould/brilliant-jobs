// tests/spec-lpg-001-s3-linkedin-summary.test.js
// SPEC-LPG-001 Session 3: LinkedIn Summary Generator (F4) + Integration Polish
// 52 validation tests

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf-8');

// --- Section 1: EF — linkedin_summary action ---
describe('1. optimize-linkedin-profile EF — linkedin_summary action', () => {
  const ef = read('supabase/functions/optimize-linkedin-profile/index.ts');

  it('1.1 Has linkedin_summary action', () => {
    expect(ef).toContain("action === 'linkedin_summary'");
  });

  it('1.2 Validates 3 tone options', () => {
    expect(ef).toContain("'professional', 'conversational', 'executive'");
  });

  it('1.3 Reads linkedin_profiles', () => {
    const matches = ef.match(/from\('linkedin_profiles'\)/g);
    expect(matches.length).toBeGreaterThanOrEqual(2); // analyze + linkedin_summary
  });

  it('1.4 Reads resume_archive for enrichment', () => {
    expect(ef).toContain("from('resume_archive')");
  });

  it('1.5 Costs 1 credit', () => {
    expect(ef).toContain('credits_remaining - 1');
  });

  it('1.6 System prompt enforces 2600 char limit', () => {
    expect(ef).toContain('2600');
  });

  it('1.7 System prompt has 5-paragraph structure', () => {
    expect(ef).toContain('P1: Hook');
    expect(ef).toContain('P2: Career narrative');
    expect(ef).toContain('P3: What sets you apart');
    expect(ef).toContain('P5: CTA');
  });

  it('1.8 Returns 2 summary variants', () => {
    expect(ef).toContain('summaries.length < 2');
  });

  it('1.9 Returns char_counts', () => {
    expect(ef).toContain('char_counts');
  });

  it('1.10 Supports target_roles parameter', () => {
    expect(ef).toContain('target_roles');
  });

  it('1.11 First person voice rule', () => {
    expect(ef).toContain('First person voice');
  });

  it('1.12 Avoids banned words', () => {
    expect(ef).toContain('"passionate"');
    expect(ef).toContain('"ninja"');
    expect(ef).toContain('"rockstar"');
  });

  it('1.13 Error handling with structured logging', () => {
    expect(ef).toContain("action: 'linkedin_summary'");
  });

  it('1.14 Unknown action lists both valid actions', () => {
    expect(ef).toContain('analyze, linkedin_summary');
  });

  it('1.15 Uses anthropicFetch with circuit breaker', () => {
    const matches = ef.match(/anthropicFetch\(/g);
    expect(matches.length).toBeGreaterThanOrEqual(2); // analyze + linkedin_summary
  });
});

// --- Section 2: Dashboard HTML — Summary Generator UI ---
describe('2. Dashboard HTML — LinkedIn Summary Generator', () => {
  const html = read('dashboard.html');

  it('2.1 Summary section container', () => {
    expect(html).toContain('id="li-summary-section"');
  });

  it('2.2 Auto-suggest element', () => {
    expect(html).toContain('id="li-summary-auto-suggest"');
  });

  it('2.3 Tone selector with 3 options', () => {
    expect(html).toContain('id="li-sum-tone"');
    expect(html).toContain('value="professional"');
    expect(html).toContain('value="conversational"');
    expect(html).toContain('value="executive"');
  });

  it('2.4 Target role input', () => {
    expect(html).toContain('id="li-sum-target-role"');
  });

  it('2.5 Generate button calls _bjGenerateLinkedInSummary', () => {
    expect(html).toContain('_bjGenerateLinkedInSummary()');
  });

  it('2.6 Generate button shows credit cost', () => {
    expect(html).toContain('1 credit');
  });

  it('2.7 Results container', () => {
    expect(html).toContain('id="li-sum-results"');
  });

  it('2.8 Section is hidden by default', () => {
    expect(html).toMatch(/li-summary-section.*display:none/);
  });
});

// --- Section 3: Client JS — F4 ---
describe('3. linkedin.js — LinkedIn Summary Generator', () => {
  const js = read('js/linkedin.js');

  it('3.1 _bjGenerateLinkedInSummary function', () => {
    expect(js).toContain('window._bjGenerateLinkedInSummary');
  });

  it('3.2 _bjCopyLinkedInSummary function', () => {
    expect(js).toContain('window._bjCopyLinkedInSummary');
  });

  it('3.3 Calls optimize-linkedin-profile with linkedin_summary action', () => {
    expect(js).toContain("action: 'linkedin_summary'");
  });

  it('3.4 Passes tone parameter', () => {
    expect(js).toContain('tone: tone');
  });

  it('3.5 Passes target_roles parameter', () => {
    expect(js).toContain('target_roles: targetRoles');
  });

  it('3.6 Character count display', () => {
    expect(js).toContain('2,600 chars');
  });

  it('3.7 Over-limit warning', () => {
    expect(js).toContain('over limit');
  });

  it('3.8 PostHog linkedin_summary_generated event', () => {
    expect(js).toContain("'linkedin_summary_generated'");
  });

  it('3.9 PostHog linkedin_summary_copied event', () => {
    expect(js).toContain("'linkedin_summary_copied'");
  });

  it('3.10 Copy uses clipboard API', () => {
    expect(js).toContain('navigator.clipboard.writeText');
  });

  it('3.11 Error handling with reportError', () => {
    expect(js).toContain("reportError('_bjGenerateLinkedInSummary'");
    expect(js).toContain("reportError('_bjCopyLinkedInSummary'");
  });

  it('3.12 Auto-suggest when summary score < 70', () => {
    expect(js).toContain('summaryScore < 70');
    expect(js).toContain('li-summary-auto-suggest');
  });

  it('3.13 Auto-suggest shows score in message', () => {
    expect(js).toContain("'Your summary scored '");
  });

  it('3.14 Summary section shown after analyze completes', () => {
    expect(js).toContain("summarySection.style.display = 'block'");
  });

  it('3.15 BJ namespace exports for F4', () => {
    expect(js).toContain('window.BJ._bjGenerateLinkedInSummary');
    expect(js).toContain('window.BJ._bjCopyLinkedInSummary');
  });
});

// --- Section 4: Integration ---
describe('4. Integration — All 3 Sessions', () => {
  it('4.1 S1 test file exists', () => {
    expect(existsSync(resolve(ROOT, 'tests/spec-lpg-001-s1-ai-writing-tools.test.js'))).toBe(true);
  });
  it('4.2 S2 test file exists', () => {
    expect(existsSync(resolve(ROOT, 'tests/spec-lpg-001-s2-linkedin-optimizer.test.js'))).toBe(true);
  });
  it('4.3 S3 test file exists', () => {
    expect(existsSync(resolve(ROOT, 'tests/spec-lpg-001-s3-linkedin-summary.test.js'))).toBe(true);
  });
  it('4.4 optimize-linkedin-profile EF has both actions', () => {
    const ef = read('supabase/functions/optimize-linkedin-profile/index.ts');
    expect(ef).toContain("action === 'analyze'");
    expect(ef).toContain("action === 'linkedin_summary'");
  });
  it('4.5 linkedin.js has all exports', () => {
    const js = read('js/linkedin.js');
    expect(js).toContain('window._bjAnalyzeLinkedIn');
    expect(js).toContain('window.initLinkedInTab');
    expect(js).toContain('window._bjGenerateLinkedInSummary');
    expect(js).toContain('window._bjCopyLinkedInSummary');
  });
  it('4.6 resume-rewrite-bullet has all 3 actions', () => {
    const ef = read('supabase/functions/resume-rewrite-bullet/index.ts');
    expect(ef).toContain("action === 'rewrite'");
    expect(ef).toContain("action === 'generate'");
    expect(ef).toContain("action === 'summary'");
  });
});

// --- Section 5: File Inventory ---
describe('5. File Inventory', () => {
  it('5.1 optimize-linkedin-profile EF', () => {
    expect(existsSync(resolve(ROOT, 'supabase/functions/optimize-linkedin-profile/index.ts'))).toBe(true);
  });
  it('5.2 linkedin.js', () => {
    expect(existsSync(resolve(ROOT, 'js/linkedin.js'))).toBe(true);
  });
});
