import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SB_URL = Deno.env.get('SUPABASE_URL') || '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const CORS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ════════════════════════════════════════════════════════════
// OOXML DOCX BUILDER (single-column, ATS-optimized)
// Identical structure to resume-generate — no tables, no graphics
// ════════════════════════════════════════════════════════════

function escXml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013/g, '-').replace(/\u2014/g, '-');
}

function para(text: string, bold = false, fontSize = 22, spaceAfter = 80): string {
  const bTag = bold ? '<w:b/><w:bCs/>' : '';
  return `<w:p><w:pPr><w:spacing w:after="${spaceAfter}"/></w:pPr><w:r><w:rPr>${bTag}<w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr><w:t xml:space="preserve">${escXml(text)}</w:t></w:r></w:p>`;
}

function heading(text: string): string {
  return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="auto"/></w:pBdr><w:spacing w:before="200" w:after="80"/></w:pPr><w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="26"/><w:szCs w:val="26"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:caps/></w:rPr><w:t>${escXml(text)}</w:t></w:r></w:p>`;
}

function bulletPara(text: string): string {
  return `<w:p><w:pPr><w:ind w:left="360" w:hanging="180"/><w:spacing w:after="40"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t xml:space="preserve">\u2022  ${escXml(text)}</w:t></w:r></w:p>`;
}

function buildDocxFromText(text: string, displayName: string): Uint8Array {
  // Parse raw resume text into sections by detecting header-like lines
  const lines = text.split('\n');
  const paragraphs: string[] = [];
  
  // Name = first non-empty line
  let nameFound = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    if (!nameFound) {
      paragraphs.push(para(trimmed, true, 40, 40));
      nameFound = true;
      continue;
    }

    // Detect section headers: short lines, possibly ALL CAPS or Title Case, no period
    const isHeader = (
      trimmed.length < 45 &&
      !trimmed.endsWith('.') &&
      !trimmed.endsWith(',') &&
      (trimmed === trimmed.toUpperCase() || /^[A-Z][a-z]+(\s+[A-Z&][a-z]*)*$/.test(trimmed)) &&
      !/^\d/.test(trimmed) &&
      !/[@.]/.test(trimmed) &&
      trimmed.length > 2
    );

    // Detect bullet points
    const isBullet = /^[\u2022\u2023\u25E6\u25AA\u2043\-\*]\s/.test(trimmed);

    if (isHeader) {
      paragraphs.push(heading(trimmed));
    } else if (isBullet) {
      paragraphs.push(bulletPara(trimmed.replace(/^[\u2022\u2023\u25E6\u25AA\u2043\-\*]\s*/, '')));
    } else {
      paragraphs.push(para(trimmed, false, 22, 60));
    }
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 w15 wp14">
<w:body>
${paragraphs.join('\n')}
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
</w:body></w:document>`;

  return buildDocxBytes(documentXml);
}

function buildDocxBytes(documentXml: string): Uint8Array {
  // Minimal .docx ZIP structure
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  // Build ZIP manually (minimal implementation matching resume-generate)
  const enc = new TextEncoder();
  const files: Array<{ name: string; data: Uint8Array }> = [
    { name: '[Content_Types].xml', data: enc.encode(contentTypesXml) },
    { name: '_rels/.rels', data: enc.encode(relsXml) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(wordRelsXml) },
    { name: 'word/document.xml', data: enc.encode(documentXml) },
  ];

  // Simple ZIP creation (same as resume-generate)
  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    // Local file header
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true); // version
    lv.setUint16(8, 0, true); // method: stored
    lv.setUint32(18, file.data.length, true); // compressed
    lv.setUint32(22, file.data.length, true); // uncompressed
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    parts.push(local);
    parts.push(file.data);

    // Central directory header
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(20, file.data.length, true);
    cv.setUint32(24, file.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralDir.push(central);

    offset += local.length + file.data.length;
  }

  // End of central directory
  const centralStart = offset;
  let centralSize = 0;
  for (const cd of centralDir) { centralSize += cd.length; parts.push(cd); }

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralStart, true);
  parts.push(end);

  // Merge all parts
  const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const part of parts) { result.set(part, pos); pos += part.length; }
  return result;
}

// ════════════════════════════════════════════════════════════
// HANDLER
// ════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const sb = createClient(SB_URL, SB_KEY);
    const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const { resume_id } = body;
    if (!resume_id) return json({ error: 'resume_id required' }, 400);

    // Fetch resume text from resume_archive
    const { data: archive, error: archErr } = await sb
      .from('resume_archive')
      .select('extracted_text, display_name, metadata_snapshot')
      .eq('resume_id', resume_id)
      .eq('user_id', user.id)
      .single();

    if (archErr || !archive) return json({ error: 'Resume not found' }, 404);
    if (!archive.extracted_text || archive.extracted_text.length < 50) {
      return json({ error: 'Resume has no extractable text. Upload a text-based PDF first.' }, 422);
    }

    const displayName = archive.display_name || 'resume';
    const docxBytes = buildDocxFromText(archive.extracted_text, displayName);

    // Upload to Supabase Storage
    const storagePath = `docx-exports/${user.id}/${resume_id}_${Date.now()}.docx`;
    const { error: uploadErr } = await sb.storage
      .from('resumes')
      .upload(storagePath, docxBytes, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      });

    if (uploadErr) {
      console.error('[export-resume-docx] Upload failed:', uploadErr.message);
      return json({ error: 'Failed to generate .docx file' }, 500);
    }

    // Get signed URL (1 hour expiry)
    const { data: signedData, error: signErr } = await sb.storage
      .from('resumes')
      .createSignedUrl(storagePath, 3600);

    if (signErr || !signedData?.signedUrl) {
      console.error('[export-resume-docx] Signed URL failed:', signErr?.message);
      return json({ error: 'Failed to generate download URL' }, 500);
    }

    console.log(`[export-resume-docx] user=${user.id} resume=${resume_id} size=${docxBytes.length} bytes`);

    return json({
      docx_url: signedData.signedUrl,
      filename: `${displayName.replace(/[^a-zA-Z0-9_-]/g, '_')}.docx`,
      file_size: docxBytes.length,
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[export-resume-docx] Error:', msg);
    return json({ error: 'Internal server error' }, 500);
  }
});
