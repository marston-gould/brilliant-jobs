// supabase/functions/rewrite-resume/index.ts
// Edge Function: AI-powered resume rewrite pipeline
// Agents: Resume Writer (Sonnet), Cover Letter Writer (Sonnet, conditional)
// Output: Generated .docx files uploaded to Supabase Storage
// v1.0

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  TabStopType, TabStopPosition, LevelFormat, BorderStyle,
  Header, Footer, PageNumber, SectionType, Column
} from 'https://esm.sh/docx@8.5.0';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const SONNET_MODEL = 'claude-sonnet-4-5-20250929';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

// ─── Anthropic API caller ───
async function callAnthropic(
  model: string, systemPrompt: string, userPrompt: string,
  maxTokens: number = 4000, temperature: number = 0
): Promise<{ text: string; ok: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model, max_tokens: maxTokens, temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[rewrite-resume] Anthropic ${model} error:`, res.status, errBody);
      return { text: '', ok: false, error: `API error ${res.status}` };
    }
    const data = await res.json();
    return { text: data.content?.[0]?.text || '', ok: true };
  } catch (e) {
    console.error(`[rewrite-resume] Anthropic exception:`, e);
    return { text: '', ok: false, error: String(e) };
  }
}

function parseJSON(text: string): any {
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}


// ════════════════════════════════════════════════════════════
// AGENT PROMPTS
// ════════════════════════════════════════════════════════════

const AGENT_RESUME_WRITER = `You are a Professional Resume Writer. You rewrite resumes based on a curated set of accepted recommendations and user-provided data.

You receive:
1. The candidate's current resume (structured profile)
2. Accepted recommendations with user-provided achievement data
3. The target job requirements profile
4. User highlights, notes, and exclusions
5. Gap interview answers (additional experience the user provided)

ABSOLUTE RULES:
- ONLY modify sections that correspond to accepted recommendations. Everything else stays EXACTLY as-is.
- NEVER invent metrics, numbers, or achievements. ONLY use data the user explicitly provided.
- NEVER move achievements from one job to another. Each bullet MUST stay under its original role.
- NEVER use AI-typical phrasing: "leveraged", "spearheaded", "synergized", "cutting-edge", "passionate about", "results-driven professional", "dynamic", "proven track record of excellence", "endeavor", "utilize", "facilitate".
- Use natural, human language. Write like a strong candidate, not a chatbot.
- Keep bullet points concise — max 2 lines each.
- Preserve the candidate's industry jargon and authentic terminology.
- If a recommendation was REJECTED (not in accepted list), do NOT apply it.
- Honor user exclusions — if they say "don't include freelance from 2019", remove it.
- Honor user highlights — if they want something emphasized, make it prominent.
- Incorporate gap interview answers as new evidence, placed under the CORRECT job.

Output ONLY a JSON object:
{
  "sections": [
    {
      "section_type": "header" | "summary" | "experience" | "skills" | "education" | "certifications" | "other",
      "section_title": "string — the section heading",
      "items": [
        {
          "type": "text" | "job" | "skill_group" | "education_entry" | "certification",
          "content": {
            // For "text": { "text": "string" }
            // For "job": { "title": "string", "company": "string", "location": "string", "start_date": "string", "end_date": "string", "bullets": ["string"] }
            // For "skill_group": { "category": "string", "skills": ["string"] }
            // For "education_entry": { "degree": "string", "institution": "string", "year": "string", "details": "string" | null }
            // For "certification": { "name": "string", "issuer": "string", "year": "string" | null }
          },
          "modified": true | false
        }
      ]
    }
  ],
  "changes_made": [
    { "section": "string", "description": "what changed", "recommendation_id": "string" }
  ],
  "unchanged_sections": ["string"]
}

No markdown, no code fences, no preamble. JSON only.`;

const AGENT_COVER_LETTER_WRITER = `You are a Cover Letter Writer. Write a tailored cover letter based on the candidate's resume and target job requirements.

RULES:
- Open with a specific hook relevant to the company/role. NEVER start with "I am writing to apply for..." or "Dear Hiring Manager".
- Connect 2-3 of the candidate's strongest matches to specific JD requirements.
- Use natural, conversational-professional tone.
- 3-4 paragraphs, max 350 words.
- Do NOT repeat resume bullets verbatim — add context and narrative.
- NEVER fabricate experiences or achievements not in the resume.
- Use the candidate's own terminology and voice.
- No AI-speak: avoid "passionate", "leverage", "synergy", "dynamic professional", "I believe I would be a great fit".
- If a company name is known, use it. Otherwise use "your team".

Output ONLY a JSON object:
{
  "salutation": "string",
  "paragraphs": ["string", "string", "string"],
  "closing": "string",
  "word_count": int
}

No markdown, no code fences, no preamble. JSON only.`;


// ════════════════════════════════════════════════════════════
// TEMPLATE DEFINITIONS
// ════════════════════════════════════════════════════════════

interface TemplateConfig {
  id: string;
  name: string;
  fonts: { heading: string; body: string };
  colors: { primary: string; accent: string; text: string; faint: string };
  margins: { top: number; right: number; bottom: number; left: number };
  headerStyle: 'centered' | 'left' | 'sidebar';
  sectionSpacing: number;
  bulletIndent: number;
}

const TEMPLATES: Record<string, TemplateConfig> = {
  executive: {
    id: 'executive',
    name: 'Executive',
    fonts: { heading: 'Georgia', body: 'Calibri' },
    colors: { primary: '1B365D', accent: '4A90D9', text: '333333', faint: '888888' },
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    headerStyle: 'centered',
    sectionSpacing: 240,
    bulletIndent: 720,
  },
  modern: {
    id: 'modern',
    name: 'Modern',
    fonts: { heading: 'Calibri', body: 'Calibri' },
    colors: { primary: '2563EB', accent: '3B82F6', text: '1F2937', faint: '6B7280' },
    margins: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
    headerStyle: 'left',
    sectionSpacing: 200,
    bulletIndent: 600,
  },
  classic: {
    id: 'classic',
    name: 'Classic',
    fonts: { heading: 'Times New Roman', body: 'Times New Roman' },
    colors: { primary: '000000', accent: '000000', text: '000000', faint: '555555' },
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    headerStyle: 'centered',
    sectionSpacing: 200,
    bulletIndent: 720,
  }
};


// ════════════════════════════════════════════════════════════
// DOCX GENERATION
// ════════════════════════════════════════════════════════════

function buildResumeDocx(sections: any[], template: TemplateConfig, candidateName?: string): any {
  const t = template;
  const children: any[] = [];

  for (const section of sections) {
    if (section.section_type === 'header') {
      // Name header
      for (const item of section.items || []) {
        if (item.type === 'text' && item.content?.text) {
          // First text item = name, large
          children.push(new Paragraph({
            alignment: t.headerStyle === 'centered' ? AlignmentType.CENTER : AlignmentType.LEFT,
            spacing: { after: 60 },
            children: [new TextRun({
              text: item.content.text,
              font: t.fonts.heading,
              size: 36, // 18pt
              bold: true,
              color: t.colors.primary,
            })]
          }));
        }
      }
      // Thin rule after header
      children.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: t.colors.accent, space: 4 } },
        spacing: { after: t.sectionSpacing },
        children: []
      }));
      continue;
    }

    // Section heading
    if (section.section_title) {
      children.push(new Paragraph({
        spacing: { before: t.sectionSpacing, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: t.colors.accent, space: 2 } },
        children: [new TextRun({
          text: section.section_title.toUpperCase(),
          font: t.fonts.heading,
          size: 22, // 11pt
          bold: true,
          color: t.colors.primary,
        })]
      }));
    }

    for (const item of section.items || []) {
      if (item.type === 'text' && item.content?.text) {
        children.push(new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({
            text: item.content.text,
            font: t.fonts.body,
            size: 22, // 11pt
            color: t.colors.text,
          })]
        }));
      }

      if (item.type === 'job' && item.content) {
        const job = item.content;
        // Title + Company line
        children.push(new Paragraph({
          spacing: { before: 120, after: 0 },
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          children: [
            new TextRun({ text: job.title || '', font: t.fonts.body, size: 22, bold: true, color: t.colors.text }),
            new TextRun({ text: ' | ', font: t.fonts.body, size: 22, color: t.colors.faint }),
            new TextRun({ text: job.company || '', font: t.fonts.body, size: 22, color: t.colors.text }),
            new TextRun({ text: '\t' + (job.start_date || '') + ' \u2013 ' + (job.end_date || 'Present'), font: t.fonts.body, size: 20, color: t.colors.faint }),
          ]
        }));

        // Location if present
        if (job.location) {
          children.push(new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: job.location, font: t.fonts.body, size: 20, italics: true, color: t.colors.faint })]
          }));
        }

        // Bullets
        for (const bullet of job.bullets || []) {
          children.push(new Paragraph({
            spacing: { after: 40 },
            indent: { left: t.bulletIndent, hanging: 260 },
            children: [
              new TextRun({ text: '\u2022 ', font: t.fonts.body, size: 22, color: t.colors.faint }),
              new TextRun({ text: bullet, font: t.fonts.body, size: 22, color: t.colors.text }),
            ]
          }));
        }
      }

      if (item.type === 'skill_group' && item.content) {
        children.push(new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({ text: (item.content.category || 'Skills') + ': ', font: t.fonts.body, size: 22, bold: true, color: t.colors.text }),
            new TextRun({ text: (item.content.skills || []).join(', '), font: t.fonts.body, size: 22, color: t.colors.text }),
          ]
        }));
      }

      if (item.type === 'education_entry' && item.content) {
        const edu = item.content;
        children.push(new Paragraph({
          spacing: { before: 60, after: 40 },
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          children: [
            new TextRun({ text: edu.degree || '', font: t.fonts.body, size: 22, bold: true, color: t.colors.text }),
            new TextRun({ text: ' \u2014 ', font: t.fonts.body, size: 22, color: t.colors.faint }),
            new TextRun({ text: edu.institution || '', font: t.fonts.body, size: 22, color: t.colors.text }),
            new TextRun({ text: edu.year ? '\t' + edu.year : '', font: t.fonts.body, size: 20, color: t.colors.faint }),
          ]
        }));
        if (edu.details) {
          children.push(new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: edu.details, font: t.fonts.body, size: 20, color: t.colors.faint })]
          }));
        }
      }

      if (item.type === 'certification' && item.content) {
        const cert = item.content;
        children.push(new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({ text: cert.name || '', font: t.fonts.body, size: 22, color: t.colors.text }),
            new TextRun({ text: cert.issuer ? ' \u2014 ' + cert.issuer : '', font: t.fonts.body, size: 20, color: t.colors.faint }),
            new TextRun({ text: cert.year ? ' (' + cert.year + ')' : '', font: t.fonts.body, size: 20, color: t.colors.faint }),
          ]
        }));
      }
    }
  }

  return new Document({
    styles: {
      default: { document: { run: { font: t.fonts.body, size: 22 } } },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: t.margins,
        }
      },
      children
    }]
  });
}

function buildCoverLetterDocx(coverLetter: any, template: TemplateConfig): any {
  const t = template;
  const children: any[] = [];

  // Salutation
  if (coverLetter.salutation) {
    children.push(new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: coverLetter.salutation, font: t.fonts.body, size: 24, color: t.colors.text })]
    }));
  }

  // Body paragraphs
  for (const para of coverLetter.paragraphs || []) {
    children.push(new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: para, font: t.fonts.body, size: 24, color: t.colors.text })]
    }));
  }

  // Closing
  if (coverLetter.closing) {
    children.push(new Paragraph({
      spacing: { before: 200 },
      children: [new TextRun({ text: coverLetter.closing, font: t.fonts.body, size: 24, color: t.colors.text })]
    }));
  }

  return new Document({
    styles: {
      default: { document: { run: { font: t.fonts.body, size: 24 } } },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        }
      },
      children
    }]
  });
}


// ════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  try {
    const startTime = Date.now();

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const sb = createClient(SB_URL, SB_KEY);
    const { data: { user }, error: authError } = await sb.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Parse body
    const body = await req.json();
    const {
      resume_text,
      resume_profile,
      jd_profile,
      accepted_recommendations,
      achievement_inputs,
      gap_answers,
      user_highlights,
      user_notes,
      include_cover_letter,
      template_id,
      filter_name,
      coaching,           // Full coaching object from premium analysis
      previous_feedback,  // For revision rounds
    } = body;

    if (!resume_profile || !jd_profile || !accepted_recommendations) {
      return new Response(JSON.stringify({ error: 'Missing required fields: resume_profile, jd_profile, accepted_recommendations' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const template = TEMPLATES[template_id] || TEMPLATES.executive;

    // ─── Build rewrite input for Resume Writer ───
    const rewriteInput = `<current_resume_profile>
${JSON.stringify(resume_profile)}
</current_resume_profile>

<target_job_requirements>
${JSON.stringify(jd_profile)}
</target_job_requirements>

<accepted_recommendations>
${JSON.stringify(accepted_recommendations)}
</accepted_recommendations>

<achievement_inputs>
${JSON.stringify(achievement_inputs || {})}
</achievement_inputs>

<gap_interview_answers>
${JSON.stringify(gap_answers || {})}
</gap_interview_answers>

<user_highlights>
${JSON.stringify(user_highlights || [])}
</user_highlights>

<user_notes>
${user_notes || 'None'}
</user_notes>

${previous_feedback ? `<previous_feedback>
The user rated the previous version and requested revisions:
${JSON.stringify(previous_feedback)}
Focus your changes on the areas they flagged.
</previous_feedback>` : ''}

${resume_text ? `<original_resume_text>
${resume_text.slice(0, 8000)}
</original_resume_text>` : ''}

Rewrite the resume incorporating all accepted recommendations. Return ONLY JSON.`;

    // ─── REWRITE TEAM ───

    // Agent 1: Resume Writer
    console.log(`[rewrite-resume] Resume Writer starting for user=${user.id}`);
    const resumeResult = await callAnthropic(SONNET_MODEL, AGENT_RESUME_WRITER, rewriteInput, 4000, 0.3);

    if (!resumeResult.ok) {
      return new Response(JSON.stringify({ error: 'Resume Writer failed', detail: resumeResult.error }), {
        status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    let resumeData: any;
    try {
      resumeData = parseJSON(resumeResult.text);
    } catch (e) {
      console.error('[rewrite-resume] Resume Writer JSON parse failed:', resumeResult.text.slice(0, 300));
      return new Response(JSON.stringify({ error: 'Failed to parse Resume Writer output' }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const writerMs = Date.now() - startTime;
    console.log(`[rewrite-resume] Resume Writer complete in ${writerMs}ms, ${resumeData.sections?.length || 0} sections`);

    // Agent 2: Cover Letter Writer (conditional)
    let coverLetterData: any = null;
    if (include_cover_letter) {
      console.log('[rewrite-resume] Cover Letter Writer starting...');

      const coverInput = `<candidate_resume>
${JSON.stringify(resumeData.sections)}
</candidate_resume>

<target_job_requirements>
${JSON.stringify(jd_profile)}
</target_job_requirements>

<filter_name>${filter_name || 'General'}</filter_name>

Write a tailored cover letter. Return ONLY JSON.`;

      const coverResult = await callAnthropic(SONNET_MODEL, AGENT_COVER_LETTER_WRITER, coverInput, 2000, 0.4);

      if (coverResult.ok) {
        try {
          coverLetterData = parseJSON(coverResult.text);
        } catch (e) {
          console.error('[rewrite-resume] Cover Letter JSON parse failed');
        }
      } else {
        console.error('[rewrite-resume] Cover Letter Writer failed:', coverResult.error);
      }
    }

    const agentsMs = Date.now() - startTime;

    // ─── GENERATE DOCX FILES ───
    console.log(`[rewrite-resume] Generating .docx files with template: ${template.id}`);

    // Resume .docx
    const resumeDoc = buildResumeDocx(resumeData.sections || [], template);
    const resumeBuffer = await Packer.toBuffer(resumeDoc);

    // Cover letter .docx (conditional)
    let coverBuffer: Uint8Array | null = null;
    if (coverLetterData) {
      const coverDoc = buildCoverLetterDocx(coverLetterData, template);
      coverBuffer = await Packer.toBuffer(coverDoc);
    }

    const docxMs = Date.now() - startTime;

    // ─── UPLOAD TO SUPABASE STORAGE ───
    const sessionId = crypto.randomUUID();
    const resumePath = `rewrites/${user.id}/${sessionId}/resume.docx`;

    const { error: uploadErr } = await sb.storage
      .from('rewrites')
      .upload(resumePath, resumeBuffer, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    if (uploadErr) {
      console.error('[rewrite-resume] Resume upload failed:', uploadErr);
      // Still return the data even if upload fails — client can retry
    }

    let coverPath: string | null = null;
    if (coverBuffer) {
      coverPath = `rewrites/${user.id}/${sessionId}/cover-letter.docx`;
      const { error: coverUpErr } = await sb.storage
        .from('rewrites')
        .upload(coverPath, coverBuffer, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      if (coverUpErr) console.error('[rewrite-resume] Cover letter upload failed:', coverUpErr);
    }

    const totalMs = Date.now() - startTime;
    console.log(`[rewrite-resume] Complete: user=${user.id} template=${template.id} cover=${!!coverLetterData} agents=${agentsMs}ms docx=${docxMs - agentsMs}ms total=${totalMs}ms`);

    // ─── RESPONSE ───
    return new Response(JSON.stringify({
      status: 'complete',
      session_id: sessionId,
      resume_path: resumePath,
      cover_letter_path: coverPath,
      template_used: template.id,
      resume_sections: resumeData.sections,
      changes_made: resumeData.changes_made || [],
      unchanged_sections: resumeData.unchanged_sections || [],
      cover_letter: coverLetterData,
      agents_used: coverLetterData ? 2 : 1,
      timing: {
        writer_ms: writerMs,
        cover_ms: coverLetterData ? agentsMs - writerMs : 0,
        docx_ms: docxMs - agentsMs,
        total_ms: totalMs
      }
    }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[rewrite-resume] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
});
