// supabase/functions/resume-generate/index.ts
// RESUME-BUILDER-001-S2: Generate ATS-compliant .docx and .pdf from
// a saved resume row. Uses docx-builder logic (pure TS, no LibreOffice).
//
// Input (application/json):
//   { resume_id: string, template_id: 'classic' | 'modern' | 'minimal' }
//
// Output: { docx_url, pdf_url, filename }
//
// Credit cost: 0 — encourages usage
// Three ATS-compliant templates: Classic, Modern Professional, Clean Minimal
// All output: single-column, standard fonts, no tables/graphics, standard headings

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ─── ATS layout constants ─────────────────────────────────────────────────────

const FONTS: Record<string, { body: string; heading: string }> = {
  classic:  { body: 'Times New Roman', heading: 'Times New Roman' },
  modern:   { body: 'Calibri',         heading: 'Arial'            },
  minimal:  { body: 'Arial',           heading: 'Arial'            },
};

// ─── Plain-text resume builder (ATS-safe) ────────────────────────────────────
// We generate a .docx using the Office Open XML format directly.
// No tables, no text boxes, no graphics — pure single-column paragraphs.

interface ResumeData {
  contact_info?: { name?: string; email?: string; phone?: string; linkedin?: string; location?: string; website?: string };
  summary?: string;
  work_experience?: Array<{ title?: string; company?: string; start_date?: string; end_date?: string; location?: string; bullets?: string[] }>;
  education?: Array<{ institution?: string; degree?: string; field?: string; graduation_date?: string; gpa?: string }>;
  skills?: string[];
  certifications?: Array<{ name?: string; issuer?: string; date?: string }>;
  languages?: string[];
  projects?: Array<{ name?: string; description?: string; technologies?: string[] }>;
}

function escXml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Replace smart quotes and em-dashes per ATS rules
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '-');
}

function para(text: string, opts: {
  bold?: boolean; fontSize?: number; spaceAfter?: number; spaceBefore?: number;
  italic?: boolean; color?: string; fontName?: string;
} = {}): string {
  const { bold = false, fontSize = 22, spaceAfter = 80, spaceBefore = 0, italic = false, color, fontName } = opts;
  const rPr = [
    bold ? '<w:b/><w:bCs/>' : '',
    italic ? '<w:i/><w:iCs/>' : '',
    `<w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/>`,
    fontName ? `<w:rFonts w:ascii="${escXml(fontName)}" w:hAnsi="${escXml(fontName)}" w:cs="${escXml(fontName)}"/>` : '',
    color ? `<w:color w:val="${color}"/>` : '',
  ].filter(Boolean).join('');
  return `<w:p><w:pPr><w:spacing w:before="${spaceBefore}" w:after="${spaceAfter}"/><w:jc w:val="left"/></w:pPr><w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${escXml(text)}</w:t></w:r></w:p>`;
}

function bullet(text: string, fontName: string): string {
  return `<w:p><w:pPr><w:ind w:left="360" w:hanging="180"/><w:spacing w:before="0" w:after="40"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/><w:rFonts w:ascii="${escXml(fontName)}" w:hAnsi="${escXml(fontName)}"/></w:rPr><w:t xml:space="preserve">\u2022  ${escXml(text)}</w:t></w:r></w:p>`;
}

function sectionHeading(text: string, template: string, fontName: string): string {
  const isModern = template === 'modern';
  // Modern adds an underline rule via border-bottom on paragraph
  const pPr = isModern
    ? `<w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="auto"/></w:pBdr><w:spacing w:before="200" w:after="80"/></w:pPr>`
    : `<w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>`;
  return `<w:p>${pPr}<w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="26"/><w:szCs w:val="26"/><w:rFonts w:ascii="${escXml(fontName)}" w:hAnsi="${escXml(fontName)}"/><w:caps/></w:rPr><w:t>${escXml(text)}</w:t></w:r></w:p>`;
}

function buildDocxXml(data: ResumeData, template: string): string {
  const font = FONTS[template] || FONTS.modern;
  const paragraphs: string[] = [];

  // ── Contact block ──
  const ci = data.contact_info || {};
  const name = (ci.name || 'Your Name').trim();
  paragraphs.push(para(name, { bold: true, fontSize: 40, spaceAfter: 40, fontName: font.heading }));

  const contactParts: string[] = [];
  if (ci.email) contactParts.push(ci.email);
  if (ci.phone) contactParts.push(ci.phone);
  if (ci.location) contactParts.push(ci.location);
  if (ci.linkedin) contactParts.push(ci.linkedin);
  if (ci.website) contactParts.push(ci.website);
  if (contactParts.length) {
    paragraphs.push(para(contactParts.join(' | '), { fontSize: 18, spaceAfter: 120, fontName: font.body }));
  }

  // ── Professional Summary ──
  if (data.summary) {
    paragraphs.push(sectionHeading('Professional Summary', template, font.heading));
    paragraphs.push(para(data.summary, { fontSize: 20, spaceAfter: 80, fontName: font.body }));
  }

  // ── Skills ──
  if (data.skills?.length) {
    paragraphs.push(sectionHeading('Skills', template, font.heading));
    paragraphs.push(para(data.skills.join(', '), { fontSize: 20, spaceAfter: 80, fontName: font.body }));
  }

  // ── Work Experience ──
  if (data.work_experience?.length) {
    paragraphs.push(sectionHeading('Work Experience', template, font.heading));
    for (const job of data.work_experience) {
      const titleLine = [job.title, job.company].filter(Boolean).join(' — ');
      const dateLine = [job.start_date, job.end_date ? `${job.end_date}` : ''].filter(Boolean).join(' – ');
      const locationDate = [dateLine, job.location].filter(Boolean).join(' | ');
      paragraphs.push(para(titleLine, { bold: true, fontSize: 22, spaceAfter: 20, spaceBefore: 80, fontName: font.body }));
      if (locationDate) {
        paragraphs.push(para(locationDate, { italic: true, fontSize: 20, spaceAfter: 40, fontName: font.body }));
      }
      for (const b of (job.bullets || [])) {
        if (b.trim()) paragraphs.push(bullet(b, font.body));
      }
    }
  }

  // ── Education ──
  if (data.education?.length) {
    paragraphs.push(sectionHeading('Education', template, font.heading));
    for (const edu of data.education) {
      const degreeField = [edu.degree, edu.field].filter(Boolean).join(', ');
      paragraphs.push(para(edu.institution || '', { bold: true, fontSize: 22, spaceBefore: 80, spaceAfter: 20, fontName: font.body }));
      if (degreeField) {
        paragraphs.push(para(`${degreeField}${edu.graduation_date ? ' — ' + edu.graduation_date : ''}${edu.gpa ? ' | GPA: ' + edu.gpa : ''}`, { fontSize: 20, spaceAfter: 60, fontName: font.body }));
      }
    }
  }

  // ── Certifications ──
  if (data.certifications?.length) {
    paragraphs.push(sectionHeading('Certifications', template, font.heading));
    for (const cert of data.certifications) {
      const certLine = [cert.name, cert.issuer, cert.date].filter(Boolean).join(' — ');
      paragraphs.push(para(certLine, { fontSize: 20, spaceAfter: 60, fontName: font.body }));
    }
  }

  // ── Languages ──
  if (data.languages?.length) {
    paragraphs.push(sectionHeading('Languages', template, font.heading));
    paragraphs.push(para(data.languages.join(', '), { fontSize: 20, spaceAfter: 80, fontName: font.body }));
  }

  const body = paragraphs.join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mo="http://schemas.microsoft.com/office/mac/office/2008/main"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:mv="urn:schemas-microsoft-com:mac:vml"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  mc:Ignorable="w14 wp14">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

// ─── Minimal DOCX ZIP builder (pure Deno — no external libs) ─────────────────
// A .docx is a ZIP with specific XML files. We build it manually.

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
  let crc = 0xffffffff;
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  for (const byte of data) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

function zipEntry(filename: string, content: Uint8Array, offset: number): { local: Uint8Array; central: Uint8Array } {
  const enc = new TextEncoder();
  const nameBytes = enc.encode(filename);
  const crc = crc32(content);
  const now = new Date();
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);

  const local = concat(
    new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
    uint16LE(20), uint16LE(0), uint16LE(0),
    uint16LE(dosTime), uint16LE(dosDate),
    uint32LE(crc), uint32LE(content.length), uint32LE(content.length),
    uint16LE(nameBytes.length), uint16LE(0),
    nameBytes, content,
  );

  const central = concat(
    new Uint8Array([0x50, 0x4b, 0x01, 0x02]),
    uint16LE(20), uint16LE(20), uint16LE(0), uint16LE(0),
    uint16LE(dosTime), uint16LE(dosDate),
    uint32LE(crc), uint32LE(content.length), uint32LE(content.length),
    uint16LE(nameBytes.length), uint16LE(0), uint16LE(0), uint16LE(0), uint16LE(0),
    uint32LE(0), uint32LE(offset),
    nameBytes,
  );

  return { local, central };
}

function buildDocxBytes(documentXml: string): Uint8Array {
  const enc = new TextEncoder();

  const files: Array<{ name: string; content: Uint8Array }> = [
    { name: '[Content_Types].xml', content: enc.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`)
    },
    { name: '_rels/.rels', content: enc.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`)
    },
    { name: 'word/document.xml', content: enc.encode(documentXml) },
    { name: 'word/_rels/document.xml.rels', content: enc.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`)
    },
  ];

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const { local, central } = zipEntry(f.name, f.content, offset);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralData = concat(...centrals);
  const eocd = concat(
    new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
    uint16LE(0), uint16LE(0),
    uint16LE(files.length), uint16LE(files.length),
    uint32LE(centralData.length), uint32LE(offset),
    uint16LE(0),
  );

  return concat(...locals, centralData, eocd);
}

// ─── Plain-text PDF builder ───────────────────────────────────────────────────
// Generates a minimal text-based PDF (not image-based — ATS-readable).

function buildPdfBytes(data: ResumeData): Uint8Array {
  const enc = new TextEncoder();
  const lines: string[] = [];

  const ci = data.contact_info || {};
  lines.push(ci.name || '');
  const contact = [ci.email, ci.phone, ci.location, ci.linkedin].filter(Boolean).join(' | ');
  if (contact) lines.push(contact);
  lines.push('');

  if (data.summary) { lines.push('PROFESSIONAL SUMMARY'); lines.push(data.summary); lines.push(''); }
  if (data.skills?.length) { lines.push('SKILLS'); lines.push(data.skills.join(', ')); lines.push(''); }
  if (data.work_experience?.length) {
    lines.push('WORK EXPERIENCE');
    for (const j of data.work_experience) {
      lines.push(`${j.title || ''} — ${j.company || ''}`);
      if (j.start_date || j.end_date) lines.push(`${j.start_date || ''} – ${j.end_date || ''}`);
      for (const b of (j.bullets || [])) lines.push(`• ${b}`);
      lines.push('');
    }
  }
  if (data.education?.length) {
    lines.push('EDUCATION');
    for (const e of data.education) {
      lines.push(e.institution || '');
      lines.push([e.degree, e.field, e.graduation_date].filter(Boolean).join(', '));
      lines.push('');
    }
  }
  if (data.certifications?.length) {
    lines.push('CERTIFICATIONS');
    for (const c of data.certifications) lines.push([c.name, c.issuer, c.date].filter(Boolean).join(' — '));
    lines.push('');
  }

  // Encode text for PDF (escape parens and backslash)
  function pdfStr(s: string) { return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }

  // Build PDF objects
  const objs: string[] = [];
  objs.push(''); // obj 1 — catalog
  objs.push(''); // obj 2 — pages
  objs.push(''); // obj 3 — page
  objs.push(''); // obj 4 — stream

  const contentLines: string[] = ['BT', '/F1 11 Tf', '50 780 Td', '14 TL'];
  for (const line of lines) {
    const safe = pdfStr(line.slice(0, 200));
    contentLines.push(`(${safe}) Tj T*`);
  }
  contentLines.push('ET');
  const streamContent = contentLines.join('\n');
  const streamBytes = enc.encode(streamContent);

  const catalog = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const pages = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  const page = '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n';
  const stream = `4 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`;
  const font = '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';

  const header = '%PDF-1.4\n';
  const body = catalog + pages + page + stream + font;
  const xrefPos = header.length + body.length;

  // Compute offsets
  const offsets: number[] = [];
  let pos = header.length;
  for (const obj of [catalog, pages, page, stream, font]) {
    offsets.push(pos);
    pos += enc.encode(obj).length;
  }

  const xref = `xref\n0 6\n0000000000 65535 f \n${offsets.map(o => String(o).padStart(10, '0') + ' 00000 n ').join('\n')}\n`;
  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

  return enc.encode(header + body + xref + trailer);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const sb = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } });

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
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

  const userId = user.id;

  try {
    const body = await req.json().catch(() => ({}));
    const { resume_id, template_id = 'modern' } = body;

    if (!resume_id) {
      return new Response(JSON.stringify({ error: 'resume_id is required.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!['classic', 'modern', 'minimal'].includes(template_id)) {
      return new Response(JSON.stringify({ error: 'template_id must be classic, modern, or minimal.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Fetch resume row ──
    const { data: resume, error: fetchErr } = await sb
      .from('resumes')
      .select('id, user_id, label, parsed_json')
      .eq('id', resume_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchErr || !resume) {
      return new Response(JSON.stringify({ error: 'Resume not found.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = resume.parsed_json as ResumeData;
    const name = (data?.contact_info?.name || 'Resume').replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'Resume';
    const nameParts = name.split(' ');
    const fileBase = nameParts.length > 1
      ? `${nameParts[0]}_${nameParts[nameParts.length - 1]}_Resume`
      : `${name}_Resume`;

    // ── Build .docx ──
    const docxXml = buildDocxXml(data, template_id);
    const docxBytes = buildDocxBytes(docxXml);
    const docxKey = `${userId}/${resume_id}_${template_id}.docx`;
    const docxFile = `${fileBase}_${template_id}.docx`;

    const { error: docxUploadErr } = await sb.storage
      .from('resumes')
      .upload(docxKey, docxBytes, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      });

    if (docxUploadErr) {
      console.error(JSON.stringify({ level: 'error', ef: 'resume-generate', userId, error: 'DOCX upload failed', detail: docxUploadErr.message }));
      return new Response(JSON.stringify({ error: 'Failed to generate .docx file.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Build .pdf ──
    const pdfBytes = buildPdfBytes(data);
    const pdfKey = `${userId}/${resume_id}_${template_id}.pdf`;
    const pdfFile = `${fileBase}_${template_id}.pdf`;

    const { error: pdfUploadErr } = await sb.storage
      .from('resumes')
      .upload(pdfKey, pdfBytes, { contentType: 'application/pdf', upsert: true });

    if (pdfUploadErr) {
      console.error(JSON.stringify({ level: 'warn', ef: 'resume-generate', userId, error: 'PDF upload failed', detail: pdfUploadErr.message }));
      // Non-fatal — still return docx
    }

    // ── Get signed URLs (60 min) ──
    const { data: docxSigned } = await sb.storage.from('resumes').createSignedUrl(docxKey, 3600);
    const { data: pdfSigned } = await sb.storage.from('resumes').createSignedUrl(pdfKey, 3600);

    // ── Update resumes row ──
    await sb.from('resumes').update({
      template_id,
      generated_docx_url: docxSigned?.signedUrl ?? null,
      generated_pdf_url: pdfSigned?.signedUrl ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', resume_id).eq('user_id', userId);

    return new Response(JSON.stringify({
      docx_url: docxSigned?.signedUrl ?? null,
      pdf_url: pdfSigned?.signedUrl ?? null,
      filename: docxFile,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: 'error', ef: 'resume-generate', userId, error: msg }));
    return new Response(JSON.stringify({ error: 'Unexpected error.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
