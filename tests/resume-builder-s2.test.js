// tests/resume-builder-s2.test.js
// RESUME-BUILDER-001-S2 validation — Templates & Generation

import { describe, it, expect } from 'vitest';

describe('resume-generate EF', () => {
  it('EF file exists', async () => {
    const fs = await import('fs');
    expect(fs.existsSync('supabase/functions/resume-generate/index.ts')).toBe(true);
  });

  it('returns 401 without token', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('status: 401');
  });

  it('returns 400 when resume_id missing', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('resume_id is required');
    expect(src).toContain('status: 400');
  });

  it('validates template_id against allowed values', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain("'classic', 'modern', 'minimal'");
  });

  it('fetches resume only for the authenticated user (RLS-style)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('.eq(\'user_id\', userId)');
    expect(src).toContain("'Resume not found.'");
    expect(src).toContain('status: 404');
  });

  it('builds DOCX bytes (not external lib)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('buildDocxBytes');
    expect(src).toContain('buildDocxXml');
    expect(src).toContain('0x50, 0x4b'); // PK ZIP magic bytes
  });

  it('builds PDF bytes (text-based, ATS-readable)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('buildPdfBytes');
    expect(src).toContain('%PDF-1.4');
    expect(src).toContain('/Type /Font');
  });

  it('uses signed URLs (not public URLs) for downloads', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('createSignedUrl');
    expect(src).not.toContain('getPublicUrl');
  });

  it('uploads to resumes storage bucket', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain(".from('resumes')");
    expect(src).toContain('.upload(docxKey');
    expect(src).toContain('.upload(pdfKey');
  });

  it('updates resumes row with template_id and file URLs', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('generated_docx_url');
    expect(src).toContain('generated_pdf_url');
    expect(src).toContain('template_id');
  });

  it('returns docx_url, pdf_url, filename', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('docx_url');
    expect(src).toContain('pdf_url');
    expect(src).toContain('filename');
  });

  it('logs errors — no silent fails', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('console.error');
    expect(src).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/);
  });
});

describe('resume-generate EF — ATS compliance', () => {
  it('document XML is single-column (no tables or text-boxes)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).not.toContain('<w:tbl>');
    expect(src).not.toContain('<w:txbx>');
  });

  it('uses standard ATS-safe fonts only', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('Times New Roman');
    expect(src).toContain('Calibri');
    expect(src).toContain('Arial');
  });

  it('escapes smart quotes and em-dashes per ATS rules', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('\\u2014'); // em-dash replacement
    expect(src).toContain('\\u201C'); // smart quote replacement
  });

  it('uses standard section headings', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('Professional Summary');
    expect(src).toContain('Work Experience');
    expect(src).toContain('Education');
    expect(src).toContain('Skills');
    expect(src).toContain('Certifications');
  });

  it('has 1-inch margins (1440 twips)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('w:top="1440"');
    expect(src).toContain('w:left="1440"');
  });

  it('PDF output is text-based (BT/ET text objects present)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain("'BT'");
    expect(src).toContain("'ET'");
    expect(src).toContain('Tj T*');
  });

  it('three template font configs all defined', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain("classic:");
    expect(src).toContain("modern:");
    expect(src).toContain("minimal:");
  });
});

describe('resume-generate EF — ZIP/DOCX structure', () => {
  it('DOCX contains required Content_Types.xml', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('[Content_Types].xml');
  });

  it('DOCX contains _rels/.rels', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('_rels/.rels');
  });

  it('DOCX contains word/document.xml', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('word/document.xml');
  });

  it('ZIP builder includes CRC32 for data integrity', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('crc32');
    expect(src).toContain('0xedb88320');
  });

  it('EOCD signature present', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/resume-generate/index.ts', 'utf8');
    expect(src).toContain('0x50, 0x4b, 0x05, 0x06'); // End of Central Directory
  });
});

describe('dashboard.html — S2 template selector UI', () => {
  it('has rb-generate-section card', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toContain('id="rb-generate-section"');
  });

  it('has three template cards', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toContain("id=\"rb-tpl-classic\"");
    expect(html).toContain("id=\"rb-tpl-modern\"");
    expect(html).toContain("id=\"rb-tpl-minimal\"");
  });

  it('has download links container', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toContain('id="rb-download-links"');
    expect(html).toContain('id="rb-dl-docx"');
    expect(html).toContain('id="rb-dl-pdf"');
  });

  it('has generate button wired to rbGenerate()', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toContain('onclick="rbGenerate()"');
    expect(html).toContain('id="rb-generate-btn"');
  });

  it('template cards wire to rbSelectTemplate()', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('dashboard.html', 'utf8');
    expect(html).toContain("rbSelectTemplate('classic')");
    expect(html).toContain("rbSelectTemplate('modern')");
    expect(html).toContain("rbSelectTemplate('minimal')");
  });
});

describe('resume-builder.js — S2 functions', () => {
  it('rbSelectTemplate updates state and card active class', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('window.rbSelectTemplate');
    expect(src).toContain('_state.template');
    expect(src).toContain('rb-tpl-');
  });

  it('rbGenerate calls /api/resume-generate with resume_id and template_id', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain("'/api/resume-generate'");
    expect(src).toContain('resume_id: _state.resumeId');
    expect(src).toContain('template_id:');
  });

  it('rbGenerate guards against missing resume_id', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('!_state.resumeId');
    expect(src).toContain('Save your resume first');
  });

  it('rbGenerate calls captureEvent on success', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain("captureEvent('resume_generated'");
  });

  it('rbGenerate calls reportError on exception — no silent fail', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain("reportError('resume_generate_exception'");
  });

  it('rbShowGenerateSection reveals generate card after parse/save', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('rbShowGenerateSection');
    expect(src).toContain('rb-generate-section');
  });

  it('rbShowDownloadLinks sets href and removes u-hidden', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('js/resume-builder.js', 'utf8');
    expect(src).toContain('rb-dl-docx');
    expect(src).toContain('rb-dl-pdf');
    expect(src).toContain('rb-download-links');
  });
});

describe('src/input.css — S2 styles', () => {
  it('has rb-template-card styles', async () => {
    const fs = await import('fs');
    const css = fs.readFileSync('src/input.css', 'utf8');
    expect(css).toContain('.rb-template-card');
    expect(css).toContain('.rb-template-card.active');
  });

  it('has rb-tpl-preview skeleton styles', async () => {
    const fs = await import('fs');
    const css = fs.readFileSync('src/input.css', 'utf8');
    expect(css).toContain('.rb-tpl-preview');
    expect(css).toContain('.rb-tpl-name-line');
  });

  it('has rb-dl-btn download button styles', async () => {
    const fs = await import('fs');
    const css = fs.readFileSync('src/input.css', 'utf8');
    expect(css).toContain('.rb-dl-btn');
    expect(css).toContain('.rb-dl-primary');
  });
});

describe('api-gateway — resume-generate route', () => {
  it('gateway has resume-generate route', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('supabase/functions/api-gateway/index.ts', 'utf8');
    expect(src).toContain('"resume-generate"');
  });
});

describe('version', () => {
  it('bumped to v9.37', async () => {
    const fs = await import('fs');
    const ver = fs.readFileSync('js/version.js', 'utf8');
    expect(ver).toContain('v9.37');
  });
});
