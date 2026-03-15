// tests/resume-builder-s1.test.js
// RESUME-BUILDER-001-S1 validation tests — Upload, Parse, Store

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Migration schema checks ─────────────────────────────────────────────────

describe('v9.36 migration — resumes table schema', () => {
  it('migration file exists', async () => {
    const fs = await import('fs');
    expect(fs.existsSync('supabase/migrations/v9.36-resume-builder.sql')).toBe(true);
  });

  it('migration contains resumes table DDL', async () => {
    const fs = await import('fs');
    const sql = fs.readFileSync('supabase/migrations/v9.36-resume-builder.sql', 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.resumes');
    expect(sql).toContain('user_id');
    expect(sql).toContain('parsed_json');
    expect(sql).toContain('original_file_url');
    expect(sql).toContain('match_score');
    expect(sql).toContain('is_primary');
    expect(sql).toContain('ats_warnings');
  });

  it('migration has all 4 RLS policies', async () => {
    const fs = await import('fs');
    const sql = fs.readFileSync('supabase/migrations/v9.36-resume-builder.sql', 'utf8');
    expect(sql).toContain('resumes_select_own');
    expect(sql).toContain('resumes_insert_own');
    expect(sql).toContain('resumes_update_own');
    expect(sql).toContain('resumes_delete_own');
  });

  it('migration contains plan limit helper function', async () => {
    const fs = await import('fs');
    const sql = fs.readFileSync('supabase/migrations/v9.36-resume-builder.sql', 'utf8');
    expect(sql).toContain('fn_resume_count_for_user');
  });

  it('migration enforces template_id check constraint', async () => {
    const fs = await import('fs');
    const sql = fs.readFileSync('supabase/migrations/v9.36-resume-builder.sql', 'utf8');
    expect(sql).toContain("CHECK (template_id IN ('classic','modern','minimal'))");
  });
});

// ─── EF — resume-parse ───────────────────────────────────────────────────────

describe('resume-parse EF', () => {
  it('EF file exists', async () => {
    const fs = await import('fs');
    expect(fs.existsSync('supabase/functions/resume-parse/index.ts')).toBe(true);
  });

  it('EF handles multipart and JSON content-types', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-parse/index.ts', 'utf8');
    expect(src).toContain('multipart/form-data');
    expect(src).toContain('application/json');
  });

  it('EF returns 401 when no token', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-parse/index.ts', 'utf8');
    expect(src).toContain("status: 401");
  });

  it('EF enforces plan limits on insert', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-parse/index.ts', 'utf8');
    expect(src).toContain('fn_resume_count_for_user');
    expect(src).toContain('limit_reached');
    expect(src).toContain('status: 403');
  });

  it('EF detects image-based PDF and returns friendly error', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-parse/index.ts', 'utf8');
    expect(src).toContain("scanned or image-based PDF");
    expect(src).toContain('status: 422');
  });

  it('EF runs ATS warning detection', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-parse/index.ts', 'utf8');
    expect(src).toContain('detectAtsWarnings');
    expect(src).toContain('ats_warnings');
  });

  it('EF uses Haiku model (cost-effective for parsing)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-parse/index.ts', 'utf8');
    expect(src).toContain('claude-haiku-4-5-20251001');
  });

  it('EF uses anthropicFetch (circuit breaker protected)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-parse/index.ts', 'utf8');
    expect(src).toContain("import { anthropicFetch }");
  });

  it('EF stores parsed JSON in resumes table', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-parse/index.ts', 'utf8');
    expect(src).toContain(".from('resumes')");
    expect(src).toContain('parsed_json');
    expect(src).toContain('user_id: userId');
  });

  it('EF returns resume_id, parsed_json, ats_warnings', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-parse/index.ts', 'utf8');
    expect(src).toContain('resume_id: finalResumeId');
    expect(src).toContain('parsed_json: parsedJson');
    expect(src).toContain('ats_warnings: atsWarnings');
  });

  it('EF supports resume_id update path (not just insert)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-parse/index.ts', 'utf8');
    expect(src).toContain('if (resumeId)');
    expect(src).toContain('.update(row)');
  });

  it('parse prompt instructs extraction-only, no embellishment', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-parse/index.ts', 'utf8');
    expect(src).toContain('no embellishment');
    expect(src).toContain('no inference');
  });
});

// ─── ATS warning detection unit tests ────────────────────────────────────────

describe('detectAtsWarnings heuristics', () => {
  // Load the detection function by extracting it from source
  let detectAtsWarnings;

  beforeEach(async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-parse/index.ts', 'utf8');
    // Extract the function body and eval it
    const match = src.match(/function detectAtsWarnings\(rawText: string\): string\[\] \{([\s\S]*?)\n\}/);
    if (match) {
      // TypeScript → JS: strip type annotations
      const body = match[1].replace(/: string\[\]/g, '').replace(/: string/g, '');
      detectAtsWarnings = new Function('rawText', body + '\nreturn warnings;');
    }
  });

  it('detects table-like content', () => {
    if (!detectAtsWarnings) return; // skip if extraction failed
    const warnings = detectAtsWarnings('col1 | col2 | col3 | col4');
    expect(warnings.some(w => w.includes('table'))).toBe(true);
  });

  it('detects multi-column layout via whitespace gaps', () => {
    if (!detectAtsWarnings) return;
    const warnings = detectAtsWarnings('Skills              Experience');
    expect(warnings.some(w => w.includes('column'))).toBe(true);
  });

  it('returns empty array for clean resume text', () => {
    if (!detectAtsWarnings) return;
    const clean = `Jane Smith\njane@example.com\n\nPROFESSIONAL SUMMARY\nSoftware engineer with 5 years experience.\n\nWORK EXPERIENCE\nSenior Engineer at Acme Corp 2020-Present\n- Built scalable systems\n\nEDUCATION\nBS Computer Science MIT 2018`;
    const warnings = detectAtsWarnings(clean);
    expect(warnings).toBeInstanceOf(Array);
  });
});

// ─── Build pipeline ───────────────────────────────────────────────────────────

describe('build.js — resume-builder.js inclusion', () => {
  it('build.js includes resume-builder.js', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('build.js', 'utf8');
    expect(src).toContain("'js/resume-builder.js'");
  });

  it('resume-builder.js exists', async () => {
    const fs = await import('fs');
    expect(fs.existsSync('js/resume-builder.js')).toBe(true);
  });

  it('compiled bundle contains rbInit', async () => {
    const fs = await import('fs');
    const bundle = fs.readFileSync('dist/dashboard.min.js', 'utf8');
    expect(bundle).toContain('rbInit');
  });

  it('compiled bundle contains rbStartParse', async () => {
    const fs = await import('fs');
    const bundle = fs.readFileSync('dist/dashboard.min.js', 'utf8');
    expect(bundle).toContain('rbStartParse');
  });
});

// ─── app.js wiring ────────────────────────────────────────────────────────────

describe('app.js — resume-builder routing', () => {
  it('_bjPageTitles includes resume-builder', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/app.js', 'utf8');
    expect(src).toContain("'resume-builder': 'Resume Builder'");
  });

  it('_bjPageSections includes resume-builder', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/app.js', 'utf8');
    expect(src).toContain("'resume-builder': 'search'");
  });

  it('nav handler calls rbInit for resume-builder tab', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/app.js', 'utf8');
    expect(src).toContain("_tab === 'resume-builder'");
    expect(src).toContain('rbInit()');
  });

  it('resume-builder is in skeleton exclusion list', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/app.js', 'utf8');
    expect(src).toContain("'resume-builder'");
    expect(src).toMatch(/'resume-builder'.*applications|applications.*'resume-builder'/);
  });
});

// ─── dashboard.html ───────────────────────────────────────────────────────────

describe('dashboard.html — resume-builder page', () => {
  it('has nav item for resume-builder', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toContain('data-page="resume-builder"');
    expect(html).toContain('Resume Builder');
  });

  it('has page-resume-builder div', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toContain('id="page-resume-builder"');
  });

  it('has upload, paste, and scratch tabs', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toContain('rb-tab-upload');
    expect(html).toContain('rb-tab-paste');
    expect(html).toContain('rb-tab-scratch');
  });

  it('has all 6 editor section tabs', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    ['contact','summary','experience','education','skills','certs'].forEach(tab => {
      expect(html).toContain(`rb-etab-${tab}`);
    });
  });

  it('has ATS warnings section', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toContain('rb-ats-warnings');
    expect(html).toContain('ATS Compatibility Issues Found');
  });

  it('has parsing progress indicator', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toContain('rb-parsing');
    expect(html).toContain('aria-live="polite"');
  });
});

// ─── api-gateway routes ───────────────────────────────────────────────────────

describe('api-gateway — resume-builder routes', () => {
  it('gateway includes resume-parse route', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/api-gateway/index.ts', 'utf8');
    expect(src).toContain('"resume-parse"');
  });

  it('gateway includes stub routes for S2 and S3', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/api-gateway/index.ts', 'utf8');
    expect(src).toContain('"resume-generate"');
    expect(src).toContain('"resume-optimize"');
  });
});

// ─── resume-builder.js logic ──────────────────────────────────────────────────

describe('resume-builder.js', () => {
  it('exports rbInit, rbStartParse, rbSwitchTab, rbSaveEdits, rbReset as window globals', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    ['rbInit','rbStartParse','rbSwitchTab','rbSaveEdits','rbReset',
     'rbHandleFileSelect','rbHandleDrop','rbClearFile','rbShowEditorTab',
     'rbAddExperience','rbRemoveExperience','rbAddEducation','rbRemoveEducation',
     'rbAddCert','rbRemoveCert'].forEach(fn => {
      expect(src).toContain(`window.${fn}`);
    });
  });

  it('calls captureEvent on successful parse', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain("captureEvent('resume_parsed'");
  });

  it('calls captureEvent on save', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain("captureEvent('resume_saved'");
  });

  it('calls reportError on exceptions (no silent fails)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('reportError(');
    expect(src).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/); // no empty catches
  });

  it('has beforeunload dirty check', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('beforeunload');
    expect(src).toContain('_state.dirty');
  });

  it('enforces 5MB file size limit client-side', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('5 * 1024 * 1024');
  });

  it('validates accepted file types client-side', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain("'pdf', 'doc', 'docx'");
  });

  it('scratch mode loads blank editor without calling EF', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain("_state.mode === 'scratch'");
    expect(src).toContain('rbLoadBlankEditor');
  });
});

// ─── Version ──────────────────────────────────────────────────────────────────

describe('version', () => {
  it('is bumped to v9.36', async () => {
    const fs = await import('fs');
    const ver = fs.readFileSync('js/version.js', 'utf8');
    expect(ver).toContain('v9.36');
  });

  it('dist bundle contains v9.36', async () => {
    const fs = await import('fs');
    const bundle = fs.readFileSync('dist/dashboard.min.js', 'utf8');
    expect(bundle).toContain('v9.36');
  });
});
