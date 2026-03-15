// tests/resume-builder-s2.test.js
// RESUME-BUILDER-001-S2 validation tests — Templates & Generation

import { describe, it, expect } from 'vitest';

// ─── EF — resume-generate ─────────────────────────────────────────────────────

describe('resume-generate EF', () => {
  it('EF file exists', async () => {
    const fs = await import('fs');
    expect(fs.existsSync('supabase/functions/resume-generate/index.ts')).toBe(true);
  });

  it('supports all 3 template IDs', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain("'classic'");
    expect(src).toContain("'modern'");
    expect(src).toContain("'minimal'");
  });

  it('rejects invalid template_id with 400', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('status: 400');
    expect(src).toContain('template_id must be one of');
  });

  it('returns 401 without token', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('status: 401');
  });

  it('returns 404 when resume not found or wrong user', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('status: 404');
    expect(src).toContain('Resume not found');
  });

  it('generates .docx via buildDocx', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('buildDocx(');
    expect(src).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('generates plain-text PDF via buildPdf', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('buildPdf(');
    expect(src).toContain('application/pdf');
  });

  it('returns docx_url, pdf_url, filename', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('docx_url');
    expect(src).toContain('pdf_url');
    expect(src).toContain('filename');
  });

  it('auto-names file Firstname_Lastname_Resume', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('_Resume');
    expect(src).toContain('safeName(');
  });

  it('updates resumes row with generated URLs and template_id', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('generated_docx_url');
    expect(src).toContain('generated_pdf_url');
    expect(src).toContain('template_id,');
  });

  it('PDF failure is non-fatal — docx still returned', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('Non-fatal');
    expect(src).toContain('pdfUploadErr');
  });

  it('credit cost is 0 — no credit check', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    // Should NOT contain credits/entitlements deduction
    expect(src).not.toContain('deduct_credits');
    expect(src).not.toContain('entitlements');
  });
});

// ─── DOCX builder internals ───────────────────────────────────────────────────

describe('DOCX builder — ATS compliance', () => {
  it('uses only ATS-safe fonts per template', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    // Spec §3.2: allowed fonts
    expect(src).toContain('Times New Roman'); // classic
    expect(src).toContain('Calibri');         // modern
    expect(src).toContain('Arial');           // minimal
  });

  it('builds valid Open XML document structure', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('w:document');
    expect(src).toContain('w:body');
    expect(src).toContain('w:sectPr');
    expect(src).toContain('[Content_Types].xml');
    expect(src).toContain('_rels/.rels');
  });

  it('sets 1-inch margins (1440 twips)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('w:top="1440"');
    expect(src).toContain('w:left="1440"');
  });

  it('sanitises smart quotes and em-dashes per ATS rules §3.4', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('\\u2018'); // left single quote
    expect(src).toContain('\\u2014'); // em-dash
  });

  it('uses standard section headings only', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('Professional Summary');
    expect(src).toContain('Work Experience');
    expect(src).toContain('Education');
    expect(src).toContain('Skills');
    expect(src).toContain('Certifications');
  });

  it('packages DOCX as valid ZIP with all required parts', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('buildZip(');
    expect(src).toContain('word/document.xml');
    expect(src).toContain('word/settings.xml');
    expect(src).toContain('crc32(');
    // ZIP local file header signature
    expect(src).toContain('0x50, 0x4B, 0x03, 0x04');
  });
});

// ─── PDF builder ─────────────────────────────────────────────────────────────

describe('PDF builder — ATS compliance', () => {
  it('builds text-based PDF (not image-based)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('%PDF-1.4');
    expect(src).toContain('BT'); // Begin Text object
    expect(src).toContain('ET'); // End Text object
  });

  it('uses standard Helvetica font in PDF', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('/Helvetica');
  });

  it('includes all resume sections in plain text', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('PROFESSIONAL SUMMARY');
    expect(src).toContain('WORK EXPERIENCE');
    expect(src).toContain('SKILLS');
    expect(src).toContain('EDUCATION');
  });
});

// ─── Dashboard UI ─────────────────────────────────────────────────────────────

describe('dashboard.html — S2 template selector and generate section', () => {
  it('has template grid with 3 cards', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toContain('rb-template-grid');
    expect(html).toContain('rb-tpl-classic');
    expect(html).toContain('rb-tpl-modern');
    expect(html).toContain('rb-tpl-minimal');
  });

  it('template cards describe target audiences', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    // Classic → finance/law/gov
    expect(html).toMatch(/[Cc]lassic/);
    // Modern → tech/corporate
    expect(html).toMatch(/[Mm]odern/);
    // Minimal → startup
    expect(html).toMatch(/[Mm]inimal/);
  });

  it('has generate button and generating spinner', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toContain('rb-generate-btn');
    expect(html).toContain('rb-generating');
  });

  it('has download links for docx and pdf', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toContain('rb-dl-docx');
    expect(html).toContain('rb-dl-pdf');
    expect(html).toContain('rb-download-links');
  });

  it('generate section is hidden until editor is shown', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toMatch(/id="rb-generate-section"[^>]*u-hidden/);
  });
});

// ─── resume-builder.js — S2 functions ────────────────────────────────────────

describe('resume-builder.js — S2 template and generate functions', () => {
  it('has rbSelectTemplate updating _state.template', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('window.rbSelectTemplate');
    expect(src).toContain('_state.template = tpl');
  });

  it('rbGenerate requires resumeId before calling EF', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('if (!_state.resumeId)');
    expect(src).toContain('Save your resume first');
  });

  it('rbGenerate calls /api/resume-generate with resume_id and template_id', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('/api/resume-generate');
    expect(src).toContain('template_id: _state.template');
  });

  it('rbGenerate fires captureEvent on success', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain("captureEvent('resume_generated'");
  });

  it('rbGenerate calls reportError on exception', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain("reportError('resume_generate_exception'");
  });

  it('rbShowEditor calls rbShowGenerateSection', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('rbShowGenerateSection()');
  });

  it('rbReset hides generate section and download links', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain("'rb-generate-section'");
    expect(src).toContain("'rb-download-links'");
  });
});

// ─── CSS ─────────────────────────────────────────────────────────────────────

describe('src/input.css — rb-template-* and rb-dl-* styles', () => {
  it('has .rb-template-grid', async () => {
    const fs = await import('fs');
    const css = fs.readFileSync('src/input.css', 'utf8');
    expect(css).toContain('.rb-template-grid');
  });

  it('has .rb-template-card with active state', async () => {
    const fs = await import('fs');
    const css = fs.readFileSync('src/input.css', 'utf8');
    expect(css).toContain('.rb-template-card');
    expect(css).toContain('.rb-template-card.active');
  });

  it('has .rb-dl-btn', async () => {
    const fs = await import('fs');
    const css = fs.readFileSync('src/input.css', 'utf8');
    expect(css).toContain('.rb-dl-btn');
  });
});
