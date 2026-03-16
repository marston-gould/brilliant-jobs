/**
 * FB-ATS-001-S3: ATS-002 (.docx Export) + ATS-004 (Cover Letter Auto-Generation)
 * 
 * Session: ATS Pass Rate Improvement — Phase 3
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
// 1. ATS-002: export-resume-docx EF — Structure
// ════════════════════════════════════════════════════════════
describe('ATS-002: export-resume-docx EF', () => {
  const src = readFile('supabase/functions/export-resume-docx/index.ts');

  it('exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'supabase/functions/export-resume-docx/index.ts'))).toBe(true);
  });

  it('has auth check', () => {
    expect(src).toContain('Unauthorized');
    expect(src).toContain('auth.getUser');
  });

  it('requires resume_id', () => {
    expect(src).toContain('resume_id required');
  });

  it('fetches from resume_archive', () => {
    expect(src).toContain("from('resume_archive')");
    expect(src).toContain('extracted_text');
    expect(src).toContain('display_name');
  });

  it('checks for minimum text length', () => {
    expect(src).toContain('extracted_text.length < 50');
  });

  it('returns docx_url, filename, file_size', () => {
    expect(src).toContain('docx_url');
    expect(src).toContain('filename');
    expect(src).toContain('file_size');
  });
});

// ════════════════════════════════════════════════════════════
// 2. ATS-002: OOXML Builder
// ════════════════════════════════════════════════════════════
describe('ATS-002: OOXML Builder', () => {
  const src = readFile('supabase/functions/export-resume-docx/index.ts');

  it('uses Arial font (ATS-safe)', () => {
    expect(src).toContain('Arial');
  });

  it('uses US Letter page size (12240 x 15840)', () => {
    expect(src).toContain('w:w="12240"');
    expect(src).toContain('w:h="15840"');
  });

  it('uses 1-inch margins (1440)', () => {
    expect(src).toContain('w:top="1440"');
    expect(src).toContain('w:left="1440"');
  });

  it('builds single-column paragraphs (no tables)', () => {
    expect(src).not.toContain('w:tbl');
    expect(src).not.toContain('w:tc');
  });

  it('detects section headers (short, uppercase/titlecase)', () => {
    expect(src).toContain('isHeader');
    expect(src).toContain('toUpperCase');
  });

  it('detects bullet points', () => {
    expect(src).toContain('isBullet');
  });

  it('escapes XML entities', () => {
    expect(src).toContain('&amp;');
    expect(src).toContain('&lt;');
    expect(src).toContain('&gt;');
  });

  it('builds valid ZIP structure', () => {
    expect(src).toContain('[Content_Types].xml');
    expect(src).toContain('_rels/.rels');
    expect(src).toContain('word/document.xml');
  });

  it('uploads to Supabase Storage', () => {
    expect(src).toContain("from('resumes')");
    expect(src).toContain('.upload(');
    expect(src).toContain('docx-exports');
  });

  it('creates signed URL for download', () => {
    expect(src).toContain('createSignedUrl');
    expect(src).toContain('3600');
  });
});

// ════════════════════════════════════════════════════════════
// 3. ATS-002: Client — downloadResumeDocx
// ════════════════════════════════════════════════════════════
describe('ATS-002: Client — downloadResumeDocx', () => {
  const src = readFile('js/resumes.js');

  it('downloadResumeDocx function exported to window', () => {
    expect(src).toContain('window.downloadResumeDocx');
  });

  it('calls export-resume-docx via api-gateway', () => {
    expect(src).toContain('/functions/v1/api-gateway/export-resume-docx');
  });

  it('triggers download via anchor element', () => {
    expect(src).toContain('a.download');
    expect(src).toContain("'.docx'");
  });

  it('fires resume_download_format PostHog event', () => {
    expect(src).toContain("capturePostHog('resume_download_format'");
    expect(src).toContain("format: 'docx'");
  });

  it('uses reportError on failure (no silent fails)', () => {
    expect(src).toContain("reportError('resumes:docx-export'");
  });

  it('shows toast feedback during generation', () => {
    expect(src).toContain('Generating .docx');
  });
});

// ════════════════════════════════════════════════════════════
// 4. ATS-002: Resume Card — .docx Button
// ════════════════════════════════════════════════════════════
describe('ATS-002: Resume Card .docx Button', () => {
  const src = readFile('js/resumes.js');

  it('resume card has downloadResumeDocx button', () => {
    expect(src).toContain('downloadResumeDocx(${i})');
  });

  it('button has file-text icon', () => {
    expect(src).toContain('data-lucide="file-text"');
  });

  it('button has descriptive title', () => {
    expect(src).toContain('Download as .docx');
  });
});

// ════════════════════════════════════════════════════════════
// 5. ATS-002: Gateway Route
// ════════════════════════════════════════════════════════════
describe('ATS-002: Gateway Route', () => {
  const gw = readFile('supabase/functions/api-gateway/index.ts');

  it('has export-resume-docx route', () => {
    expect(gw).toContain('"export-resume-docx"');
  });
});

// ════════════════════════════════════════════════════════════
// 6. ATS-004: Cover Letter Auto-Generation in Apply Workflow
// ════════════════════════════════════════════════════════════
describe('ATS-004: Cover Letter Auto-Generation', () => {
  const src = readFile('js/apply-workflow.js');

  it('has ATS-004 auto-generation block', () => {
    expect(src).toContain('ATS-004: Auto-generate cover letter');
  });

  it('only triggers in auto modes when no cover letter exists', () => {
    expect(src).toContain('!coverLetterId && _isAutoMode');
  });

  it('calls generate-cover-letter EF via api-gateway', () => {
    expect(src).toContain('/functions/v1/api-gateway/generate-cover-letter');
  });

  it('passes job_title, company_name, resume_id, tone', () => {
    expect(src).toContain('job_title:');
    expect(src).toContain('company_name:');
    expect(src).toContain('resume_id:');
    expect(src).toContain("tone: 'professional'");
  });

  it('stores generated coverLetterId for pending_applications row', () => {
    expect(src).toContain('coverLetterId = clData.id');
  });

  it('fires cover_letter_auto_generated PostHog event', () => {
    expect(src).toContain("capturePostHog('cover_letter_auto_generated'");
  });

  it('includes job_id, company, mode, word_count in PostHog event', () => {
    expect(src).toContain('job_id: jobId');
    expect(src).toContain('company: companyName');
    expect(src).toContain('mode: mode');
    expect(src).toContain('word_count: clData.word_count');
  });

  it('is non-fatal — uses try/catch with reportError', () => {
    expect(src).toContain("reportError('apply:cover-letter-auto'");
  });

  it('logs to console on success', () => {
    expect(src).toContain('[apply] ATS-004: Auto-generated cover letter');
  });

  it('logs warning on failure', () => {
    expect(src).toContain('[apply] ATS-004: Cover letter auto-generation failed');
  });
});

// ════════════════════════════════════════════════════════════
// 7. ATS-004: Pre-existing Infrastructure Verification
// ════════════════════════════════════════════════════════════
describe('ATS-004: Pre-existing Cover Letter Infrastructure', () => {
  it('generate-cover-letter EF exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'supabase/functions/generate-cover-letter/index.ts'))).toBe(true);
  });

  it('cover_letters migration exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'supabase/migrations/v9.59-ais-f8-s1-cover-letters.sql'))).toBe(true);
  });

  it('worker greenhouse handler fills cover letter', () => {
    const src = readFile('worker/handlers/greenhouse.js');
    expect(src).toContain('coverLetter');
  });

  it('worker lever handler fills cover letter', () => {
    const src = readFile('worker/handlers/lever.js');
    expect(src).toContain('coverLetter');
  });

  it('worker generic handler fills cover letter', () => {
    const src = readFile('worker/handlers/generic.js');
    expect(src).toContain('coverLetter');
  });
});

// ════════════════════════════════════════════════════════════
// 8. ATS-004: Existing Fetch + Attach Still Works
// ════════════════════════════════════════════════════════════
describe('ATS-004: Existing Cover Letter Fetch Preserved', () => {
  const src = readFile('js/apply-workflow.js');

  it('still fetches existing cover letter first', () => {
    expect(src).toContain("from('cover_letters').select('id,content')");
  });

  it('still attaches cover_letter_id to pending_applications', () => {
    expect(src).toContain('cover_letter_id: coverLetterId');
  });

  it('auto-generation only runs when fetch returned nothing', () => {
    // The !coverLetterId check means auto-gen is skipped if fetch found one
    expect(src).toContain('!coverLetterId && _isAutoMode');
  });
});

// ════════════════════════════════════════════════════════════
// 9. No Silent Failures
// ════════════════════════════════════════════════════════════
describe('No Silent Failures', () => {
  it('export-resume-docx EF logs errors', () => {
    const src = readFile('supabase/functions/export-resume-docx/index.ts');
    expect(src).toContain('console.error');
  });

  it('downloadResumeDocx uses reportError', () => {
    const src = readFile('js/resumes.js');
    expect(src).toContain("reportError('resumes:docx-export'");
  });

  it('cover letter auto-gen uses reportError', () => {
    const src = readFile('js/apply-workflow.js');
    expect(src).toContain("reportError('apply:cover-letter-auto'");
  });
});

// ════════════════════════════════════════════════════════════
// 10. File Inventory
// ════════════════════════════════════════════════════════════
describe('File Inventory', () => {
  const files = [
    'supabase/functions/export-resume-docx/index.ts',
    'supabase/functions/generate-cover-letter/index.ts',
    'supabase/functions/api-gateway/index.ts',
    'js/apply-workflow.js',
    'js/resumes.js',
  ];
  files.forEach(f => {
    it(`${f} exists`, () => {
      expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
    });
  });
});
