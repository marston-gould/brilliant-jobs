// supabase/functions/resume-generate/index.ts
// RESUME-BUILDER-001-S2: Generate ATS-compliant .docx and plain-text .pdf
// from parsed_json + template_id. Stores in Storage, updates resumes row.
//
// Input (JSON POST):
//   { resume_id, template_id }
//   template_id: 'classic' | 'modern' | 'minimal'
//
// Output: { docx_url, pdf_url, filename }
//
// Credit cost: 0 — generation encourages usage
// Templates: Classic (Times New Roman), Modern Professional (Calibri/Arial),
//            Clean Minimal (Helvetica/Arial)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ─── Template config ─────────────────────────────────────────────────────────

const TEMPLATES: Record<string, { fontFamily: string; headingSize: number; nameSize: number; bodySize: number }> = {
  classic:  { fontFamily: 'Times New Roman', headingSize: 14, nameSize: 20, bodySize: 11 },
  modern:   { fontFamily: 'Calibri',         headingSize: 14, nameSize: 20, bodySize: 11 },
  minimal:  { fontFamily: 'Arial',           headingSize: 13, nameSize: 20, bodySize: 10 },
};

// ─── Sanitise strings ─────────────────────────────────────────────────────────

function s(v: unknown): string {
  if (!v) return '';
  // Replace smart quotes and em-dashes per ATS rules §3.4
  return String(v)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, '-')
    .replace(/\u2013/g, '-')
    .trim();
}

function safeName(first: string, last: string): string {
  return `${first}_${last}`.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
}

// ─── DOCX builder (manual XML — no library required in Deno) ─────────────────
// Generates a minimal but fully spec-compliant Open XML .docx

function pt(n: number): number { return n * 20; } // points → half-points (twips)
function ptStr(n: number): string { return String(pt(n)); }

function xmlEsc(str: string): string {
  return s(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function run(text: string, opts: { bold?: boolean; italic?: boolean; size?: number; font?: string } = {}): string {
  const { bold, italic, size, font } = opts;
  const rpr = [
    font ? `<w:rFonts w:ascii="${xmlEsc(font)}" w:hAnsi="${xmlEsc(font)}" w:cs="${xmlEsc(font)}"/>` : '',
    bold ? '<w:b/><w:bCs/>' : '',
    italic ? '<w:i/><w:iCs/>' : '',
    size ? `<w:sz w:val="${ptStr(size)}"/><w:szCs w:val="${ptStr(size)}"/>` : '',
  ].filter(Boolean).join('');
  return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r>`;
}

function para(content: string, opts: { spacing?: number; indent?: number; keepNext?: boolean } = {}): string {
  const { spacing = 0, indent = 0, keepNext = false } = opts;
  const ppr = [
    spacing ? `<w:spacing w:after="${spacing}"/>` : '',
    indent ? `<w:ind w:left="${indent}"/>` : '',
    keepNext ? '<w:keepNext/>' : '',
    '<w:jc w:val="left"/>',
  ].filter(Boolean).join('');
  return `<w:p><w:pPr>${ppr}</w:pPr>${content}</w:p>`;
}

function sectionHeading(text: string, font: string, size: number): string {
  return para(
    run(text.toUpperCase(), { bold: true, size, font }),
    { spacing: 60, keepNext: true }
  ) + `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="AAAAAA"/></w:pBdr><w:spacing w:after="80"/></w:pPr></w:p>`;
}

function bullet(text: string, font: string, size: number): string {
  return `<w:p>
    <w:pPr><w:ind w:left="360" w:hanging="180"/><w:spacing w:after="60"/></w:pPr>
    ${run('\u2022  ', { font, size })}${run(s(text), { font, size })}
  </w:p>`;
}

interface ParsedJson {
  contact_info?: { name?: string; email?: string; phone?: string; linkedin?: string; location?: string; website?: string };
  summary?: string;
  work_experience?: Array<{ company?: string; title?: string; start_date?: string; end_date?: string; location?: string; bullets?: string[] }>;
  education?: Array<{ institution?: string; degree?: string; field?: string; graduation_date?: string }>;
  skills?: string[];
  certifications?: Array<{ name?: string; issuer?: string; date?: string }>;
}

function buildDocxXml(data: ParsedJson, template: string): string {
  const cfg = TEMPLATES[template] || TEMPLATES.modern;
  const { fontFamily: f, nameSize: ns, headingSize: hs, bodySize: bs } = cfg;

  const ci = data.contact_info || {};
  const name = s(ci.name) || 'Your Name';
  const contactParts = [ci.email, ci.phone, ci.location, ci.linkedin, ci.website].filter(Boolean).map(s).join('  \u2022  ');

  const parts: string[] = [];

  // ── Name ──
  parts.push(para(run(name, { bold: true, size: ns, font: f }), { spacing: 60 }));

  // ── Contact line ──
  if (contactParts) {
    parts.push(para(run(contactParts, { size: bs, font: f }), { spacing: 120 }));
  }

  // ── Summary ──
  if (data.summary) {
    parts.push(sectionHeading('Professional Summary', f, hs));
    parts.push(para(run(s(data.summary), { font: f, size: bs }), { spacing: 120 }));
  }

  // ── Skills ──
  const skills = (data.skills || []).map(s).filter(Boolean);
  if (skills.length) {
    parts.push(sectionHeading('Skills', f, hs));
    parts.push(para(run(skills.join(', '), { font: f, size: bs }), { spacing: 120 }));
  }

  // ── Work Experience ──
  const exp = data.work_experience || [];
  if (exp.length) {
    parts.push(sectionHeading('Work Experience', f, hs));
    for (const job of exp) {
      const dates = [s(job.start_date), s(job.end_date)].filter(Boolean).join(' \u2013 ');
      const titleLine = `${s(job.title)}${job.company ? '  \u2014  ' + s(job.company) : ''}`;
      parts.push(para(
        run(titleLine, { bold: true, font: f, size: bs }) +
        (dates ? run('  ' + dates, { italic: true, font: f, size: bs }) : ''),
        { spacing: 40, keepNext: true }
      ));
      if (job.location) {
        parts.push(para(run(s(job.location), { italic: true, font: f, size: bs - 1 }), { spacing: 40 }));
      }
      for (const b of (job.bullets || [])) {
        parts.push(bullet(b, f, bs));
      }
      parts.push(para('', { spacing: 80 })); // spacer
    }
  }

  // ── Education ──
  const edu = data.education || [];
  if (edu.length) {
    parts.push(sectionHeading('Education', f, hs));
    for (const e of edu) {
      const deg = [s(e.degree), s(e.field)].filter(Boolean).join(', ');
      parts.push(para(
        run(s(e.institution), { bold: true, font: f, size: bs }) +
        (e.graduation_date ? run('  ' + s(e.graduation_date), { italic: true, font: f, size: bs }) : ''),
        { spacing: 40, keepNext: true }
      ));
      if (deg) parts.push(para(run(deg, { font: f, size: bs }), { spacing: 80 }));
    }
  }

  // ── Certifications ──
  const certs = data.certifications || [];
  if (certs.length) {
    parts.push(sectionHeading('Certifications', f, hs));
    for (const c of certs) {
      const line = [s(c.name), s(c.issuer), s(c.date)].filter(Boolean).join('  \u2022  ');
      parts.push(para(run(line, { font: f, size: bs }), { spacing: 60 }));
    }
  }

  const body = parts.join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:aink="http://schemas.microsoft.com/office/drawing/2016/ink"
  xmlns:am3d="http://schemas.microsoft.com/office/drawing/2017/model3d"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:oel="http://schemas.microsoft.com/office/2019/extlst"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"
  xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex"
  xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid"
  xmlns:w16="http://schemas.microsoft.com/office/word/2018/wordml"
  xmlns:w16sdtdh="http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash"
  xmlns:w16se="http://schemas.microsoft.com/office/word/2015/wordml/symex"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  mc:Ignorable="w14 w15 w16se w16cid w16 w16cex w16sdtdh wp14">
  <w:body>
${body}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

// ─── Minimal DOCX package builder (ZIP via streams) ──────────────────────────
// A .docx is a ZIP containing specific XML files. We build a minimal valid ZIP.

function uint32LE(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = n & 0xff; b[1] = (n >> 8) & 0xff; b[2] = (n >> 16) & 0xff; b[3] = (n >> 24) & 0xff;
  return b;
}
function uint16LE(n: number): Uint8Array {
  const b = new Uint8Array(2);
  b[0] = n & 0xff; b[1] = (n >> 8) & 0xff;
  return b;
}

function crc32(data: Uint8Array): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (const byte of data) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

interface ZipEntry { name: string; data: Uint8Array; offset: number }

function buildZip(files: Array<{ name: string; content: string }>): Uint8Array {
  const enc = new TextEncoder();
  const entries: ZipEntry[] = [];
  const localHeaders: Uint8Array[] = [];

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const data = enc.encode(file.content);
    const crc = crc32(data);
    const offset = localHeaders.reduce((s, h) => s + h.length, 0);

    // Local file header
    const local = concat(
      new Uint8Array([0x50, 0x4B, 0x03, 0x04]), // signature
      uint16LE(20),       // version needed
      uint16LE(0),        // general purpose bit flag
      uint16LE(0),        // compression method (stored)
      uint16LE(0),        // last mod time
      uint16LE(0),        // last mod date
      uint32LE(crc),
      uint32LE(data.length),
      uint32LE(data.length),
      uint16LE(nameBytes.length),
      uint16LE(0),        // extra field length
      nameBytes,
      data,
    );

    localHeaders.push(local);
    entries.push({ name: file.name, data, offset });
  }

  // Central directory
  const cdHeaders: Uint8Array[] = [];
  let cdOffset = localHeaders.reduce((s, h) => s + h.length, 0);

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const crc = crc32(entry.data);
    const cd = concat(
      new Uint8Array([0x50, 0x4B, 0x01, 0x02]),
      uint16LE(20), uint16LE(20),
      uint16LE(0), uint16LE(0),
      uint16LE(0), uint16LE(0),
      uint32LE(crc),
      uint32LE(entry.data.length),
      uint32LE(entry.data.length),
      uint16LE(nameBytes.length),
      uint16LE(0), uint16LE(0), uint16LE(0), uint16LE(0),
      uint32LE(0),
      uint32LE(entry.offset),
      nameBytes,
    );
    cdHeaders.push(cd);
  }

  const cdSize = cdHeaders.reduce((s, h) => s + h.length, 0);

  // End of central directory
  const eocd = concat(
    new Uint8Array([0x50, 0x4B, 0x05, 0x06]),
    uint16LE(0), uint16LE(0),
    uint16LE(entries.length), uint16LE(entries.length),
    uint32LE(cdSize),
    uint32LE(cdOffset),
    uint16LE(0),
  );

  return concat(...localHeaders, ...cdHeaders, eocd);
}

function buildDocx(data: ParsedJson, template: string): Uint8Array {
  const documentXml = buildDocxXml(data, template);

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:defaultTabStop w:val="720"/>
</w:settings>`;

  return buildZip([
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: rels },
    { name: 'word/document.xml', content: documentXml },
    { name: 'word/_rels/document.xml.rels', content: wordRels },
    { name: 'word/settings.xml', content: settings },
  ]);
}

// ─── Plain-text PDF builder ───────────────────────────────────────────────────
// Generates a simple text-based PDF (no graphics, ATS-safe)

function buildPdf(data: ParsedJson): Uint8Array {
  const ci = data.contact_info || {};
  const name = s(ci.name) || 'Your Name';
  const lines: string[] = [];

  lines.push(name.toUpperCase());
  const contact = [ci.email, ci.phone, ci.location, ci.linkedin].filter(Boolean).map(s).join(' | ');
  if (contact) lines.push(contact);
  lines.push('');

  if (data.summary) {
    lines.push('PROFESSIONAL SUMMARY');
    lines.push('-'.repeat(40));
    lines.push(s(data.summary));
    lines.push('');
  }

  const skills = (data.skills || []).map(s).filter(Boolean);
  if (skills.length) {
    lines.push('SKILLS');
    lines.push('-'.repeat(40));
    lines.push(skills.join(', '));
    lines.push('');
  }

  const exp = data.work_experience || [];
  if (exp.length) {
    lines.push('WORK EXPERIENCE');
    lines.push('-'.repeat(40));
    for (const job of exp) {
      const dates = [s(job.start_date), s(job.end_date)].filter(Boolean).join(' - ');
      lines.push(`${s(job.title)} | ${s(job.company)} | ${dates}`);
      if (job.location) lines.push(s(job.location));
      for (const b of (job.bullets || [])) lines.push(`  - ${s(b)}`);
      lines.push('');
    }
  }

  const edu = data.education || [];
  if (edu.length) {
    lines.push('EDUCATION');
    lines.push('-'.repeat(40));
    for (const e of edu) {
      const deg = [s(e.degree), s(e.field)].filter(Boolean).join(', ');
      lines.push(`${s(e.institution)}${deg ? ' | ' + deg : ''}${e.graduation_date ? ' | ' + s(e.graduation_date) : ''}`);
    }
    lines.push('');
  }

  const certs = data.certifications || [];
  if (certs.length) {
    lines.push('CERTIFICATIONS');
    lines.push('-'.repeat(40));
    for (const c of certs) {
      lines.push([s(c.name), s(c.issuer), s(c.date)].filter(Boolean).join(' | '));
    }
  }

  // Encode text to PDF streams
  const enc = new TextEncoder();
  const textContent = lines.join('\n');
  // Escape PDF special chars
  const pdfStr = textContent.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  const streamContent = `BT\n/F1 11 Tf\n12 TL\n50 750 Td\n${
    lines.map(l => `(${l.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')}) Tj T*`).join('\n')
  }\nET`;

  const streamBytes = enc.encode(streamContent);
  const streamLen = streamBytes.length;

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj

4 0 obj
<< /Length ${streamLen} >>
stream
${streamContent}
endstream
endobj

5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000${String(400 + streamLen).padStart(9, '0')} 00000 n 

trailer
<< /Size 6 /Root 1 0 R >>
startxref
${500 + streamLen}
%%EOF`;

  return enc.encode(pdf);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const sb = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } });

  // ── Auth ──
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { resume_id, template_id = 'modern' } = body;

    if (!resume_id) {
      return new Response(JSON.stringify({ error: 'resume_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const validTemplates = ['classic', 'modern', 'minimal'];
    if (!validTemplates.includes(template_id)) {
      return new Response(JSON.stringify({ error: `template_id must be one of: ${validTemplates.join(', ')}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Fetch resume row ──
    const { data: resume, error: fetchErr } = await sb
      .from('resumes')
      .select('id, user_id, label, parsed_json')
      .eq('id', resume_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchErr || !resume) {
      return new Response(JSON.stringify({ error: 'Resume not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsedJson = resume.parsed_json as ParsedJson;
    const ci = parsedJson?.contact_info || {};

    // ── Build filename ──
    const nameParts = (s(ci.name) || 'Resume').split(/\s+/);
    const first = nameParts[0] || 'Resume';
    const last = nameParts.slice(1).join('_') || '';
    const fileBase = last ? safeName(first, last) : first.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${fileBase}_Resume`;

    const userId = user.id;
    const ts = Date.now();

    // ── Generate .docx ──
    const docxBytes = buildDocx(parsedJson, template_id);
    const docxKey = `${userId}/${ts}_${filename}.docx`;
    const { error: docxUploadErr } = await sb.storage
      .from('resumes')
      .upload(docxKey, docxBytes, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      });

    if (docxUploadErr) {
      console.error(JSON.stringify({ level: 'error', ef: 'resume-generate', userId, error: docxUploadErr.message }));
      return new Response(JSON.stringify({ error: 'Failed to store generated document.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: docxUrlData } = sb.storage.from('resumes').getPublicUrl(docxKey);
    const docxUrl = docxUrlData?.publicUrl ?? null;

    // ── Generate plain-text PDF ──
    const pdfBytes = buildPdf(parsedJson);
    const pdfKey = `${userId}/${ts}_${filename}.pdf`;
    const { error: pdfUploadErr } = await sb.storage
      .from('resumes')
      .upload(pdfKey, pdfBytes, { contentType: 'application/pdf', upsert: true });

    if (pdfUploadErr) {
      console.error(JSON.stringify({ level: 'error', ef: 'resume-generate', userId, error: pdfUploadErr.message }));
      // Non-fatal: docx succeeded
    }
    const { data: pdfUrlData } = sb.storage.from('resumes').getPublicUrl(pdfKey);
    const pdfUrl = !pdfUploadErr ? (pdfUrlData?.publicUrl ?? null) : null;

    // ── Update resumes row ──
    const { error: updateErr } = await sb
      .from('resumes')
      .update({
        template_id,
        generated_docx_url: docxUrl,
        generated_pdf_url: pdfUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', resume_id)
      .eq('user_id', userId);

    if (updateErr) {
      console.error(JSON.stringify({ level: 'error', ef: 'resume-generate', userId, error: updateErr.message }));
      // Non-fatal — URLs already stored, return them anyway
    }

    return new Response(JSON.stringify({
      docx_url: docxUrl,
      pdf_url: pdfUrl,
      filename: `${filename}.docx`,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: 'error', ef: 'resume-generate', error: msg }));
    return new Response(JSON.stringify({ error: 'Unexpected error.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
