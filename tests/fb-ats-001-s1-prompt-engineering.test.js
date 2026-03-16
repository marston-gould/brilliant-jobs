/**
 * FB-ATS-001-S1: ATS-006 (Acronym Dual Inclusion) + ATS-007 (Section Header Standardization)
 * Prompt engineering changes to rewrite-resume-execute and rewrite-resume-extension EFs.
 * 
 * Session: ATS Pass Rate Improvement — Phase 1 (Prompt Engineering)
 * Date: 2026-03-16
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

// ════════════════════════════════════════════════════════════
// 1. ATS-006: Acronym Dual Inclusion — rewrite-resume-execute
// ════════════════════════════════════════════════════════════
describe('ATS-006: Acronym Dual Inclusion — rewrite-resume-execute', () => {
  const src = readFile('supabase/functions/rewrite-resume-execute/index.ts');

  it('REWRITER_SYSTEM contains ACRONYM RULE instruction', () => {
    expect(src).toContain('ACRONYM RULE');
  });

  it('instructs to include BOTH full term and acronym on first use', () => {
    expect(src).toContain('include BOTH the full term and the acronym on first use');
  });

  it('provides concrete acronym examples (SEO, API, CI/CD, KPIs)', () => {
    expect(src).toContain('Search Engine Optimization (SEO)');
    expect(src).toContain('Application Programming Interface (API)');
    expect(src).toContain('Continuous Integration/Continuous Deployment (CI/CD)');
    expect(src).toContain('Key Performance Indicators (KPIs)');
  });

  it('instructs to expand JD-only acronyms and abbreviate JD-only full forms', () => {
    expect(src).toContain('If the JD uses only the acronym, still expand it once');
    expect(src).toContain('If the JD uses only the full form, still include the acronym once');
  });

  it('skips universally known abbreviations (AI, IT, HR, CEO, etc)', () => {
    expect(src).toContain('Skip universally known abbreviations');
    expect(src).toMatch(/AI,\s*IT,\s*HR,\s*CEO/);
  });

  it('output format includes acronym_pairs_added field', () => {
    expect(src).toContain('"acronym_pairs_added"');
  });

  it('response includes acronym_pairs_added from rewriteData', () => {
    expect(src).toContain('acronym_pairs_added: rewriteData.acronym_pairs_added || []');
  });

  it('notification payload includes acronymPairsAdded count', () => {
    expect(src).toContain('acronymPairsAdded: (rewriteData.acronym_pairs_added || []).length');
  });
});

// ════════════════════════════════════════════════════════════
// 2. ATS-006: Acronym Dual Inclusion — rewrite-resume-extension
// ════════════════════════════════════════════════════════════
describe('ATS-006: Acronym Dual Inclusion — rewrite-resume-extension', () => {
  const src = readFile('supabase/functions/rewrite-resume-extension/index.ts');

  it('REWRITE_SYSTEM contains ACRONYM RULE instruction', () => {
    expect(src).toContain('ACRONYM RULE');
  });

  it('provides concrete acronym examples', () => {
    expect(src).toContain('Search Engine Optimization (SEO)');
    expect(src).toContain('Application Programming Interface (API)');
  });

  it('output format includes acronym_pairs_added field', () => {
    expect(src).toContain('"acronym_pairs_added"');
  });

  it('response includes acronym_pairs_added from parsed output', () => {
    expect(src).toContain('acronym_pairs_added: parsed.acronym_pairs_added || []');
  });

  it('fallback parse includes empty acronym_pairs_added', () => {
    expect(src).toContain('acronym_pairs_added: []');
  });
});

// ════════════════════════════════════════════════════════════
// 3. ATS-007: Section Header Standardization — rewrite-resume-execute
// ════════════════════════════════════════════════════════════
describe('ATS-007: Section Header Standardization — rewrite-resume-execute', () => {
  const src = readFile('supabase/functions/rewrite-resume-execute/index.ts');

  it('REWRITER_SYSTEM contains SECTION HEADERS instruction', () => {
    expect(src).toContain('SECTION HEADERS');
  });

  it('lists all ATS-standard headers', () => {
    const standardHeaders = [
      'Contact Information', 'Professional Summary', 'Work Experience',
      'Skills', 'Education', 'Certifications', 'Projects', 'Awards'
    ];
    standardHeaders.forEach(h => {
      expect(src).toContain(h);
    });
  });

  it('maps non-standard variants to standard equivalents', () => {
    expect(src).toContain("Where I've Worked");
    expect(src).toContain('My Toolbox');
    expect(src).toContain('The Journey');
    expect(src).toContain('About Me');
    expect(src).toContain('Career History');
    expect(src).toContain('Core Competencies');
    expect(src).toContain('Academic Background');
  });

  it('output format includes headers_standardized field', () => {
    expect(src).toContain('"headers_standardized"');
  });

  it('response includes headers_standardized from rewriteData', () => {
    expect(src).toContain('headers_standardized: rewriteData.headers_standardized || []');
  });

  it('notification payload includes headersStandardized count', () => {
    expect(src).toContain('headersStandardized: (rewriteData.headers_standardized || []).length');
  });
});

// ════════════════════════════════════════════════════════════
// 4. ATS-007: Section Header Standardization — rewrite-resume-extension
// ════════════════════════════════════════════════════════════
describe('ATS-007: Section Header Standardization — rewrite-resume-extension', () => {
  const src = readFile('supabase/functions/rewrite-resume-extension/index.ts');

  it('REWRITE_SYSTEM contains SECTION HEADERS instruction', () => {
    expect(src).toContain('SECTION HEADERS');
  });

  it('lists ATS-standard headers', () => {
    expect(src).toContain('Work Experience');
    expect(src).toContain('Skills');
    expect(src).toContain('Education');
    expect(src).toContain('Professional Summary');
  });

  it('maps common non-standard variants', () => {
    expect(src).toContain("Where I've Worked");
    expect(src).toContain('My Toolbox');
    expect(src).toContain('Core Competencies');
  });

  it('output format includes headers_standardized field', () => {
    expect(src).toContain('"headers_standardized"');
  });

  it('response includes headers_standardized from parsed output', () => {
    expect(src).toContain('headers_standardized: parsed.headers_standardized || []');
  });

  it('fallback parse includes empty headers_standardized', () => {
    expect(src).toContain('headers_standardized: []');
  });
});

// ════════════════════════════════════════════════════════════
// 5. Quality Checker Updates
// ════════════════════════════════════════════════════════════
describe('Quality Checker — Acronym + Header Validation', () => {
  const src = readFile('supabase/functions/rewrite-resume-execute/index.ts');

  it('QUALITY_CHECKER_SYSTEM includes ACRONYM COMPLIANCE check', () => {
    expect(src).toContain('ACRONYM COMPLIANCE');
  });

  it('QUALITY_CHECKER_SYSTEM includes HEADER STANDARDIZATION check', () => {
    expect(src).toContain('HEADER STANDARDIZATION');
  });

  it('quality checker checks for acronyms without expanded form', () => {
    expect(src).toContain('technical acronym that appears without its expanded form');
  });

  it('quality checker flags non-standard headers that survived rewrite', () => {
    expect(src).toContain('non-standard headers that survived the rewrite');
  });
});

// ════════════════════════════════════════════════════════════
// 6. Client-Side PostHog Tracking (rewrite.js)
// ════════════════════════════════════════════════════════════
describe('Client PostHog — rewrite.js ATS tracking', () => {
  const src = readFile('js/rewrite.js');

  it('_rwState stores acronymPairsAdded from EF response', () => {
    expect(src).toContain('_rwState.acronymPairsAdded = data.acronym_pairs_added || []');
  });

  it('_rwState stores headersStandardized from EF response', () => {
    expect(src).toContain('_rwState.headersStandardized = data.headers_standardized || []');
  });

  it('resume_rewrite_completed event includes acronym_pairs_added count', () => {
    expect(src).toContain('acronym_pairs_added: (_rwState.acronymPairsAdded || []).length');
  });

  it('resume_rewrite_completed event includes headers_standardized count', () => {
    expect(src).toContain('headers_standardized: (_rwState.headersStandardized || []).length');
  });
});

// ════════════════════════════════════════════════════════════
// 7. Rule Numbering Consistency
// ════════════════════════════════════════════════════════════
describe('Rule Numbering — no gaps or conflicts', () => {
  it('execute EF rules numbered 1-8 sequentially', () => {
    const src = readFile('supabase/functions/rewrite-resume-execute/index.ts');
    for (let i = 1; i <= 8; i++) {
      expect(src).toContain(`${i}.`);
    }
  });

  it('extension EF rules numbered 1-10 sequentially', () => {
    const src = readFile('supabase/functions/rewrite-resume-extension/index.ts');
    for (let i = 1; i <= 10; i++) {
      expect(src).toContain(`${i}.`);
    }
  });
});

// ════════════════════════════════════════════════════════════
// 8. Both EFs — Prompt Parity
// ════════════════════════════════════════════════════════════
describe('Prompt Parity — both EFs have same ATS rules', () => {
  const execute = readFile('supabase/functions/rewrite-resume-execute/index.ts');
  const extension = readFile('supabase/functions/rewrite-resume-extension/index.ts');

  it('both contain ACRONYM RULE', () => {
    expect(execute).toContain('ACRONYM RULE');
    expect(extension).toContain('ACRONYM RULE');
  });

  it('both contain SECTION HEADERS', () => {
    expect(execute).toContain('SECTION HEADERS');
    expect(extension).toContain('SECTION HEADERS');
  });

  it('both return acronym_pairs_added in response', () => {
    expect(execute).toContain('acronym_pairs_added');
    expect(extension).toContain('acronym_pairs_added');
  });

  it('both return headers_standardized in response', () => {
    expect(execute).toContain('headers_standardized');
    expect(extension).toContain('headers_standardized');
  });
});

// ════════════════════════════════════════════════════════════
// 9. No Silent Failures (Marston's #1 principle)
// ════════════════════════════════════════════════════════════
describe('No Silent Failures', () => {
  it('execute EF — new fields default to empty arrays, never undefined', () => {
    const src = readFile('supabase/functions/rewrite-resume-execute/index.ts');
    expect(src).toContain('rewriteData.acronym_pairs_added || []');
    expect(src).toContain('rewriteData.headers_standardized || []');
  });

  it('extension EF — new fields default to empty arrays, never undefined', () => {
    const src = readFile('supabase/functions/rewrite-resume-extension/index.ts');
    expect(src).toContain('parsed.acronym_pairs_added || []');
    expect(src).toContain('parsed.headers_standardized || []');
  });

  it('rewrite.js — PostHog properties default to empty arrays, never undefined', () => {
    const src = readFile('js/rewrite.js');
    expect(src).toContain('_rwState.acronymPairsAdded || []');
    expect(src).toContain('_rwState.headersStandardized || []');
  });
});

// ════════════════════════════════════════════════════════════
// 10. Build + Version + File Inventory
// ════════════════════════════════════════════════════════════
describe('File Inventory', () => {
  const expectedFiles = [
    'supabase/functions/rewrite-resume-execute/index.ts',
    'supabase/functions/rewrite-resume-extension/index.ts',
    'js/rewrite.js',
  ];

  expectedFiles.forEach(f => {
    it(`${f} exists`, () => {
      expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
    });
  });
});
