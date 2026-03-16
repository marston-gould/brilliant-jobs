import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SB_URL = Deno.env.get('SUPABASE_URL') || '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const CORS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', ...extra },
  });
}

// ════════════════════════════════════════════════════════════
// ATS-SAFE FONT LIST
// ════════════════════════════════════════════════════════════
const ATS_SAFE_FONTS = new Set([
  'arial', 'calibri', 'times new roman', 'helvetica', 'georgia',
  'garamond', 'cambria', 'verdana', 'tahoma', 'trebuchet ms',
  'palatino', 'book antiqua', 'century gothic', 'lucida sans',
  'consolas', 'courier new', 'segoe ui', 'roboto', 'open sans',
  'lato', 'montserrat', 'source sans pro', 'noto sans',
]);

// ════════════════════════════════════════════════════════════
// STANDARD SECTION HEADERS (ATS-007 map)
// ════════════════════════════════════════════════════════════
const STANDARD_HEADERS: Record<string, string[]> = {
  'Contact Information': ['about me', 'personal details', 'get in touch', 'reach me', 'personal info'],
  'Professional Summary': ['summary', 'profile', 'about', 'executive summary', 'objective', 'career objective', 'professional profile'],
  'Work Experience': ['experience', 'employment history', 'career history', 'where i\'ve worked', 'professional background', 'roles', 'employment', 'work history', 'professional experience'],
  'Skills': ['technical skills', 'core competencies', 'my toolbox', 'expertise', 'proficiencies', 'what i do', 'key skills', 'competencies', 'areas of expertise'],
  'Education': ['academic background', 'the journey', 'schooling', 'qualifications', 'training', 'academic history'],
  'Certifications': ['licenses', 'professional development', 'credentials', 'certificates', 'accreditations'],
  'Projects': ['key projects', 'portfolio', 'selected work', 'featured projects', 'notable projects'],
  'Awards': ['honors', 'recognition', 'achievements', 'accomplishments'],
};

// Build reverse map: variant → standard
const VARIANT_TO_STANDARD: Record<string, string> = {};
for (const [standard, variants] of Object.entries(STANDARD_HEADERS)) {
  for (const v of variants) {
    VARIANT_TO_STANDARD[v.toLowerCase()] = standard;
  }
}

interface FormatIssue {
  check: string;
  severity: 'blocking' | 'warning';
  message: string;
  detail?: string;
}

// ════════════════════════════════════════════════════════════
// FORMAT ANALYSIS
// ════════════════════════════════════════════════════════════

function analyzeResumeFormat(text: string, metadata?: Record<string, unknown>): {
  format_score: number;
  issues: FormatIssue[];
  is_ats_ready: boolean;
  headers_detected: { original: string; suggestion: string | null }[];
} {
  const issues: FormatIssue[] = [];
  const headersDetected: { original: string; suggestion: string | null }[] = [];

  if (!text || text.trim().length === 0) {
    issues.push({
      check: 'empty_document',
      severity: 'blocking',
      message: 'Your resume appears to be empty or could not be read. Please upload a text-based PDF or .docx file.',
    });
    return { format_score: 0, issues, is_ats_ready: false, headers_detected: [] };
  }

  // Check 1: Scanned / image-only PDF
  // If extracted text is very short relative to what a resume should have, likely image-only
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  if (wordCount < 30) {
    issues.push({
      check: 'scanned_pdf',
      severity: 'blocking',
      message: 'Your resume appears to be a scanned image with very little extractable text. ATS cannot read image-based PDFs. Please upload a text-based PDF or .docx.',
      detail: `Only ${wordCount} words detected.`,
    });
  }

  // Check 2: Multi-column layout detection
  // Heuristic: if many lines are very short (< 40 chars) followed by content, suggests columns
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const shortLines = lines.filter(l => l.trim().length > 3 && l.trim().length < 35).length;
  const shortLineRatio = lines.length > 10 ? shortLines / lines.length : 0;
  if (shortLineRatio > 0.55 && lines.length > 20) {
    issues.push({
      check: 'multi_column',
      severity: 'blocking',
      message: 'Your resume may use a multi-column layout. Most ATS read left-to-right, top-to-bottom and will scramble multi-column content. Use a single-column layout.',
      detail: `${Math.round(shortLineRatio * 100)}% of lines are very short, suggesting columns.`,
    });
  }

  // Check 3: Tables detected (tab-separated data patterns)
  const tabLines = lines.filter(l => (l.match(/\t/g) || []).length >= 2).length;
  if (tabLines > 5) {
    issues.push({
      check: 'tables_detected',
      severity: 'warning',
      message: 'Your resume may contain tables for layout. ATS may skip or misread table content. Consider moving content to standard paragraphs.',
      detail: `${tabLines} lines with multiple tab characters detected.`,
    });
  }

  // Check 4: Non-standard fonts (from metadata if available)
  if (metadata && Array.isArray(metadata.fonts)) {
    const nonSafe = (metadata.fonts as string[]).filter(
      f => !ATS_SAFE_FONTS.has(f.toLowerCase().trim())
    );
    if (nonSafe.length > 0) {
      issues.push({
        check: 'non_standard_fonts',
        severity: 'warning',
        message: `Your resume uses ${nonSafe.join(', ')}. Some ATS may not render these correctly. Consider switching to Arial or Calibri.`,
        detail: `Non-standard fonts: ${nonSafe.join(', ')}`,
      });
    }
  }

  // Check 4b: Embedded images/icons (from metadata if available)
  if (metadata && typeof metadata.imageCount === 'number' && metadata.imageCount > 0) {
    // A resume header logo is fine (1 image), but multiple body images suggest graphic-heavy design
    if (metadata.imageCount > 2) {
      issues.push({
        check: 'embedded_images',
        severity: 'warning',
        message: `Your resume contains ${metadata.imageCount} embedded images or icons. ATS cannot read image content. Ensure all important information is in text, not graphics.`,
        detail: `${metadata.imageCount} image objects detected in PDF.`,
      });
    } else if (metadata.imageCount > 0) {
      // 1-2 images — just note it, might be a header logo
      issues.push({
        check: 'embedded_images',
        severity: 'warning',
        message: 'Your resume contains embedded images. ATS cannot read image content. If these are icons or infographics with important information, consider replacing them with text.',
        detail: `${metadata.imageCount} image object(s) detected.`,
      });
    }
  }

  // Check 5: Contact info only in header/footer region
  // If email/phone found only in first 2 lines or last 2 lines
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const phoneRegex = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  const hasEmail = emailRegex.test(text);
  const hasPhone = phoneRegex.test(text);

  if (hasEmail || hasPhone) {
    const bodyLines = lines.slice(2, -2);
    const bodyText = bodyLines.join(' ');
    const emailInBody = emailRegex.test(bodyText);
    const phoneInBody = phoneRegex.test(bodyText);
    if (!emailInBody && !phoneInBody && lines.length > 10) {
      issues.push({
        check: 'header_footer_contact',
        severity: 'warning',
        message: 'Your contact information may be only in a header/footer area. Some ATS skip headers/footers. Ensure name, email, and phone are in the main body text.',
      });
    }
  } else if (wordCount > 50) {
    issues.push({
      check: 'no_contact_info',
      severity: 'warning',
      message: 'No email or phone number detected in your resume. ATS requires contact information to create a candidate profile.',
    });
  }

  // Check 6: Special characters / encoding issues
  const specialCharCount = (text.match(/[\ufffd\u0000-\u0008\u000e-\u001f]/g) || []).length;
  if (specialCharCount > 10) {
    issues.push({
      check: 'encoding_issues',
      severity: 'warning',
      message: 'Your resume contains characters that may not display correctly in ATS. This often happens with PDFs exported from design tools. Consider re-saving as a plain .docx.',
      detail: `${specialCharCount} problematic characters detected.`,
    });
  }

  // Check 7: Section header analysis (ATS-007 integration)
  // Look for lines that appear to be section headers (short, possibly all-caps or title case)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length < 3 || line.length > 50) continue;

    // Check if it looks like a header: short line, possibly uppercase or title case, no period at end
    const isLikelyHeader = (
      line.length < 40 &&
      !line.endsWith('.') &&
      !line.endsWith(',') &&
      (line === line.toUpperCase() || /^[A-Z][a-z]+(\s+[A-Z&][a-z]*)*$/.test(line)) &&
      !/^\d/.test(line) &&
      !/[@.]/.test(line)
    );

    if (!isLikelyHeader) continue;

    const normalized = line.toLowerCase().trim();
    // Check if it's a known non-standard variant
    if (VARIANT_TO_STANDARD[normalized]) {
      headersDetected.push({
        original: line,
        suggestion: VARIANT_TO_STANDARD[normalized],
      });
    }
    // Check if it's already a standard header
    else if (Object.keys(STANDARD_HEADERS).some(h => h.toLowerCase() === normalized)) {
      headersDetected.push({ original: line, suggestion: null });
    }
  }

  const nonStandardHeaders = headersDetected.filter(h => h.suggestion !== null);
  if (nonStandardHeaders.length > 0) {
    issues.push({
      check: 'non_standard_headers',
      severity: 'warning',
      message: `Your resume uses non-standard section headers that ATS may not recognize: ${nonStandardHeaders.map(h => '"' + h.original + '"').join(', ')}. Use standard headers like ${nonStandardHeaders.map(h => '"' + h.suggestion + '"').join(', ')}.`,
      detail: nonStandardHeaders.map(h => `${h.original} → ${h.suggestion}`).join('; '),
    });
  }

  // Calculate format score
  const blockingCount = issues.filter(i => i.severity === 'blocking').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  let formatScore = 100;
  formatScore -= blockingCount * 30; // Each blocking issue costs 30 points
  formatScore -= warningCount * 10;  // Each warning costs 10 points
  formatScore = Math.max(0, Math.min(100, formatScore));

  return {
    format_score: formatScore,
    issues,
    is_ats_ready: blockingCount === 0 && warningCount <= 1,
    headers_detected: headersDetected,
  };
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
    const { resume_text, resume_id, metadata } = body;

    if (!resume_text && !resume_id) {
      return json({ error: 'resume_text or resume_id required' }, 400);
    }

    let text = resume_text || '';

    // If resume_id provided, fetch text from resume_archive
    if (!text && resume_id) {
      const { data: archive, error: archErr } = await sb
        .from('resume_archive')
        .select('extracted_text')
        .eq('resume_id', resume_id)
        .eq('user_id', user.id)
        .single();

      if (archErr || !archive?.extracted_text) {
        return json({ error: 'Resume not found or no text available' }, 404);
      }
      text = archive.extracted_text;
    }

    const result = analyzeResumeFormat(text, metadata || undefined);

    console.log(`[validate-resume-format] user=${user.id} resume=${resume_id || 'direct'} score=${result.format_score} issues=${result.issues.length} ats_ready=${result.is_ats_ready}`);

    return json(result);

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[validate-resume-format] Error:', msg);
    return json({ error: 'Internal server error' }, 500);
  }
});
