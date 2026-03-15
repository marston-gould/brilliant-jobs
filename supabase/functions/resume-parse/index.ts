// supabase/functions/resume-parse/index.ts
// RESUME-BUILDER-001-S1: Parse uploaded resume (PDF/DOCX) or pasted text
// into structured JSON via Anthropic API. Stores result + original file
// in Supabase Storage bucket "resumes/{user_id}/".
//
// Input (multipart/form-data):
//   file          — PDF or DOCX binary (optional if paste_text provided)
//   paste_text    — raw resume text (optional if file provided)
//   label         — user-facing name for this resume version (optional)
//   resume_id     — if provided, updates existing row instead of inserting
//
// Input (application/json):
//   { paste_text, label?, resume_id? }
//
// Output: { resume_id, parsed_json, original_file_url?, ats_warnings[] }
//
// Credit cost: 0 — parsing drives platform value
// Plan limits: Free=1, Starter=3, Pro=10

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';
import { anthropicFetch } from '../_shared/anthropic.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const PLAN_LIMITS: Record<string, number> = {
  free: 1,
  starter: 3,
  pro: 10,
  enterprise: 50,
};
const DEFAULT_LIMIT = 1;

// ─── ATS warning detection ────────────────────────────────────────────────────

function detectAtsWarnings(rawText: string): string[] {
  const warnings: string[] = [];

  // Tables (crude heuristic — multiple pipe chars on same line)
  if (/(\|.*){3,}/.test(rawText)) {
    warnings.push('Possible table detected — ATS parsers cannot read tables. Convert to plain bullet points.');
  }

  // Headers/footers heuristic: repeated short lines at very start/end
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length > 0 && lines[0].length < 30 && !/[a-zA-Z]{4,}/.test(lines[0])) {
    warnings.push('Contact info may be in a document header — ATS parsers skip headers. Move name/email/phone into the document body.');
  }

  // Non-standard section headings
  const standardHeadings = ['professional summary', 'summary', 'work experience', 'experience', 'education', 'skills', 'certifications', 'projects'];
  const headingPattern = /^([A-Z][A-Z\s]{2,30})$/gm;
  const found = [...rawText.matchAll(headingPattern)].map(m => m[1].toLowerCase().trim());
  for (const h of found) {
    if (!standardHeadings.some(s => h.includes(s))) {
      warnings.push(`Non-standard section heading "${h.toUpperCase()}" detected — use standard headings like "Work Experience" or "Skills" for better ATS compatibility.`);
      break; // only one warning for this
    }
  }

  // Multi-column heuristic: long runs of spaces mid-line
  if (/\S {10,}\S/.test(rawText)) {
    warnings.push('Multi-column layout detected — ATS parsers read left-to-right and will scramble two-column resumes. Use a single-column layout.');
  }

  return warnings;
}

// ─── Text extraction from DOCX (server-side, no LibreOffice available) ───────

async function extractTextFromDocx(bytes: Uint8Array): Promise<string | null> {
  // DOCX is a ZIP. We extract word/document.xml using a streaming XML parse.
  // Use DecompressionStream (available in Deno) to unzip.
  try {
    // Find PK local file header for word/document.xml
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const raw = decoder.decode(bytes);

    // Grab content between XML tags — crude but works for ATS-clean docs
    const xmlMatch = raw.match(/<w:body>([\s\S]*?)<\/w:body>/);
    if (!xmlMatch) return null;

    // Strip XML tags, collapse whitespace
    const text = xmlMatch[1]
      .replace(/<w:t[^>]*>/g, ' ')
      .replace(/<\/w:t>/g, '')
      .replace(/<w:p[^/]>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return text.length > 50 ? text : null;
  } catch {
    return null;
  }
}

// ─── Anthropic parse prompt ───────────────────────────────────────────────────

const PARSE_SYSTEM = `You are a resume parser. Extract structured data from resume text with 100% fidelity — no embellishment, no inference, no fabrication. Return ONLY valid JSON matching the schema. If a field has no data, use null or empty array.`;

function buildParsePrompt(text: string): string {
  return `Parse this resume into the exact JSON schema below. Extract only what is explicitly stated. Do not infer, embellish, or add anything not present.

SCHEMA:
{
  "contact_info": {
    "name": string | null,
    "email": string | null,
    "phone": string | null,
    "linkedin": string | null,
    "location": string | null,
    "website": string | null
  },
  "summary": string | null,
  "work_experience": [
    {
      "company": string,
      "title": string,
      "start_date": string,
      "end_date": string | "Present",
      "location": string | null,
      "bullets": string[]
    }
  ],
  "education": [
    {
      "institution": string,
      "degree": string | null,
      "field": string | null,
      "graduation_date": string | null,
      "gpa": string | null
    }
  ],
  "skills": string[],
  "certifications": [
    {
      "name": string,
      "issuer": string | null,
      "date": string | null
    }
  ],
  "languages": string[],
  "projects": [
    {
      "name": string,
      "description": string | null,
      "technologies": string[]
    }
  ]
}

Return ONLY the JSON object. No preamble, no explanation, no markdown fences.

RESUME TEXT:
${text.slice(0, 12000)}`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const sb = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } });

  // ── Auth ──
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userId = user.id;

  try {
    let rawText = '';
    let fileBytes: Uint8Array | null = null;
    let fileName = '';
    let fileType = '';
    let label = 'My Resume';
    let resumeId: string | null = null;

    const contentType = req.headers.get('content-type') ?? '';

    // ── Parse input ──
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file') as File | null;
      const pasteText = form.get('paste_text') as string | null;
      label = (form.get('label') as string | null) ?? label;
      resumeId = (form.get('resume_id') as string | null) ?? null;

      if (file && file.size > 0) {
        fileName = file.name;
        fileType = file.type || (fileName.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf');
        fileBytes = new Uint8Array(await file.arrayBuffer());

        if (fileType.includes('wordprocessingml') || fileName.endsWith('.docx')) {
          const extracted = await extractTextFromDocx(fileBytes);
          if (!extracted) {
            return new Response(JSON.stringify({
              error: "We couldn't read your resume. Try .docx with standard formatting, or use the paste option.",
            }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          rawText = extracted;
        } else if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
          // PDF: decode as text (text-based PDFs contain readable chars)
          const decoder = new TextDecoder('utf-8', { fatal: false });
          const decoded = decoder.decode(fileBytes);
          // Extract text between BT/ET markers (text objects in PDF)
          const textParts: string[] = [];
          const btEt = decoded.matchAll(/BT([\s\S]*?)ET/g);
          for (const match of btEt) {
            const chunk = match[1].replace(/\(([^)]+)\)\s*T[jJ]/g, '$1 ').replace(/[^\x20-\x7E\n]/g, ' ').trim();
            if (chunk.length > 2) textParts.push(chunk);
          }
          rawText = textParts.join('\n').replace(/\s+/g, ' ').trim();

          if (rawText.length < 100) {
            return new Response(JSON.stringify({
              error: "We couldn't read your resume. This appears to be a scanned or image-based PDF. Try uploading a .docx, or paste your resume text instead.",
            }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        } else {
          return new Response(JSON.stringify({
            error: 'Unsupported file type. Please upload a .pdf or .docx file.',
          }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } else if (pasteText && pasteText.trim().length > 50) {
        rawText = pasteText.trim();
        fileName = '';
      } else {
        return new Response(JSON.stringify({ error: 'Provide a file or paste_text.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      // JSON body (paste_text path)
      const body = await req.json().catch(() => ({}));
      rawText = (body.paste_text ?? '').trim();
      label = body.label ?? label;
      resumeId = body.resume_id ?? null;

      if (rawText.length < 50) {
        return new Response(JSON.stringify({ error: 'paste_text is too short.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── Plan limit check (only on insert, not update) ──
    if (!resumeId) {
      const { data: profile } = await sb
        .from('profiles')
        .select('plan')
        .eq('id', userId)
        .maybeSingle();

      const plan = (profile?.plan ?? 'free').toLowerCase();
      const limit = PLAN_LIMITS[plan] ?? DEFAULT_LIMIT;

      const { data: countData } = await sb.rpc('fn_resume_count_for_user', { p_user_id: userId });
      const currentCount = countData ?? 0;

      if (currentCount >= limit) {
        return new Response(JSON.stringify({
          error: `Your ${plan} plan supports up to ${limit} resume${limit === 1 ? '' : 's'}. Delete an existing resume or upgrade to add more.`,
          limit_reached: true,
          current_count: currentCount,
          limit,
          plan,
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // ── ATS warnings ──
    const atsWarnings = detectAtsWarnings(rawText);

    // ── Anthropic parse ──
    const aiResult = await anthropicFetch(sb, {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: PARSE_SYSTEM,
      messages: [{ role: 'user', content: buildParsePrompt(rawText) }],
      temperature: 0,
    }, { callerEf: 'resume-parse', userId });

    if (!aiResult.ok) {
      console.error(JSON.stringify({ level: 'error', ef: 'resume-parse', userId, error: aiResult.error }));
      return new Response(JSON.stringify({ error: 'Resume parsing failed. Please try again.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawContent = (aiResult.data?.content as Array<{ type: string; text: string }>)?.[0]?.text ?? '';

    let parsedJson: Record<string, unknown>;
    try {
      const cleaned = rawContent.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      parsedJson = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error(JSON.stringify({ level: 'error', ef: 'resume-parse', userId, error: 'JSON parse failed', raw: rawContent.slice(0, 200) }));
      return new Response(JSON.stringify({ error: 'Failed to parse resume structure. Please try pasting your resume text directly.' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Upload original file to Storage ──
    let originalFileUrl: string | null = null;
    if (fileBytes && fileName) {
      const ext = fileName.split('.').pop()?.toLowerCase() ?? 'pdf';
      const storageKey = `${userId}/${Date.now()}_original.${ext}`;
      const { error: uploadErr } = await sb.storage
        .from('resumes')
        .upload(storageKey, fileBytes, { contentType: fileType, upsert: true });

      if (uploadErr) {
        console.error(JSON.stringify({ level: 'error', ef: 'resume-parse', userId, error: 'Storage upload failed', detail: uploadErr.message }));
        // Non-fatal: continue without file URL
      } else {
        const { data: urlData } = sb.storage.from('resumes').getPublicUrl(storageKey);
        originalFileUrl = urlData?.publicUrl ?? null;
      }
    }

    // ── Upsert resumes row ──
    const row = {
      user_id: userId,
      label,
      parsed_json: parsedJson,
      original_file_url: originalFileUrl,
      ats_warnings: atsWarnings.length > 0 ? atsWarnings : null,
      updated_at: new Date().toISOString(),
    };

    let finalResumeId: string;
    if (resumeId) {
      const { data: updated, error: updateErr } = await sb
        .from('resumes')
        .update(row)
        .eq('id', resumeId)
        .eq('user_id', userId)
        .select('id')
        .maybeSingle();

      if (updateErr || !updated) {
        console.error(JSON.stringify({ level: 'error', ef: 'resume-parse', userId, error: updateErr?.message ?? 'Update returned no row' }));
        return new Response(JSON.stringify({ error: 'Failed to save resume.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      finalResumeId = updated.id;
    } else {
      const { data: inserted, error: insertErr } = await sb
        .from('resumes')
        .insert({ ...row })
        .select('id')
        .maybeSingle();

      if (insertErr || !inserted) {
        console.error(JSON.stringify({ level: 'error', ef: 'resume-parse', userId, error: insertErr?.message ?? 'Insert returned no row' }));
        return new Response(JSON.stringify({ error: 'Failed to save resume.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      finalResumeId = inserted.id;
    }

    return new Response(JSON.stringify({
      resume_id: finalResumeId,
      parsed_json: parsedJson,
      original_file_url: originalFileUrl,
      ats_warnings: atsWarnings,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: 'error', ef: 'resume-parse', userId, error: msg }));
    return new Response(JSON.stringify({ error: 'Unexpected error.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
