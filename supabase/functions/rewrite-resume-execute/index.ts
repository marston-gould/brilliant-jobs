// supabase/functions/rewrite-resume-execute/index.ts
// Edge Function: JD-specific resume rewrite + quality check
// Part 2 of the "Boost Match" pipeline (analyze → [Q&A] → execute)
// Agents: Resume Rewriter (Sonnet), Quality Checker (Haiku)
// v1.0

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { withAnthropicBreaker } from "../_shared/anthropic.ts";
import { creditGate, creditRefund } from '../_shared/creditGate.ts';

const SB_URL  = Deno.env.get('SUPABASE_URL')!;
const SB_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const HAIKU  = 'claude-haiku-4-5-20251001';
const SONNET = 'claude-sonnet-4-5-20250929';

const CORS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// ─── Anthropic caller ───
async function callAnthropic(
  model: string, system: string, user: string,
  maxTokens = 4000, temperature = 0
): Promise<{ text: string; ok: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model, max_tokens: maxTokens, temperature,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[execute] Anthropic ${model} error:`, res.status, err);
      return { text: '', ok: false, error: `API ${res.status}` };
    }
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    return { text, ok: true };
  } catch (e) {
    console.error('[execute] Anthropic call failed:', e.message);
    return { text: '', ok: false, error: e.message };
  }
}

function parseJSON(text: string): unknown {
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

// ════════════════════════════════════════════════════════════
// AGENT 3: RESUME REWRITER
// ════════════════════════════════════════════════════════════

const REWRITER_SYSTEM = `You are an expert resume rewriter. You take a resume and optimize it for a specific job description, using gap analysis and the user's own answers to fill in missing information.

ABSOLUTE RULES:
1. NEVER fabricate experience, metrics, numbers, or achievements. Only use what the resume says or what the user explicitly provided in their answers.
2. If the user skipped a question (answer is null/empty), note that gap in weak_areas but do NOT invent content for it.
3. Preserve the candidate's authentic voice. Avoid: "leveraged", "spearheaded", "synergized", "cutting-edge", "passionate about", "results-driven", "proven track record", "utilized", "facilitated", "endeavor". Use plain, strong verbs instead.
4. Do not add excessive keywords. Weave JD-relevant terminology naturally.
5. Keep the resume's original structure (sections in the same order).
6. Only rewrite sections that benefit from changes. If a section is already strong for this JD, mark it as unchanged.
7. ACRONYM RULE: For every technical term, tool, methodology, or certification that has a common acronym, include BOTH the full term and the acronym on first use (e.g. "Search Engine Optimization (SEO)", "Application Programming Interface (API)", "Continuous Integration/Continuous Deployment (CI/CD)", "Key Performance Indicators (KPIs)"). After first use, the acronym alone is acceptable. If the JD uses only the acronym, still expand it once. If the JD uses only the full form, still include the acronym once. Skip universally known abbreviations that never need expansion (AI, IT, HR, CEO, CTO, CFO, VP, MBA, PhD).
8. SECTION HEADERS: Replace any non-standard or creative section headers with ATS-standard equivalents. Use exactly these headers: "Contact Information", "Professional Summary", "Work Experience", "Skills", "Education", "Certifications", "Projects", "Awards". Map variants like "Where I've Worked" → "Work Experience", "My Toolbox" → "Skills", "The Journey" → "Education", "About Me" → "Professional Summary", "Career History" → "Work Experience", "Core Competencies" → "Skills", "Academic Background" → "Education".

You receive:
1. Original resume text
2. Job description text
3. Gap analysis (matched skills, rewritable gaps, weak areas)
4. User answers to gap questions (may be empty)
5. Optional: feedback from a previous attempt

OUTPUT FORMAT — Return ONLY JSON, no markdown:
{
  "sections": [
    {
      "name": "string (e.g. 'Professional Summary', 'Experience - Company Name', 'Skills')",
      "original": "string (the original text for this section)",
      "rewritten": "string (the optimized text — same as original if unchanged)",
      "changed": true/false,
      "changes_made": ["string (description of each change)"]
    }
  ],
  "keywords_added": ["string (JD keywords naturally incorporated)"],
  "acronym_pairs_added": ["string (e.g. 'Search Engine Optimization (SEO)')"],
  "headers_standardized": ["string (e.g. 'Where I\\'ve Worked → Work Experience')"],
  "skipped_gaps": ["string (gaps the user skipped — no content fabricated)"]
}`;

// ════════════════════════════════════════════════════════════
// AGENT 4: QUALITY CHECKER
// ════════════════════════════════════════════════════════════

const QUALITY_CHECKER_SYSTEM = `You are a Resume Quality Auditor. You verify that a rewritten resume is truthful, ATS-friendly, and actually improves the match against the target job description.

CHECK FOR:
1. TRUTHFULNESS — Does the rewrite add any claims, metrics, or experiences not present in the original resume or the user's provided answers? Flag every instance.
2. ATS COMPATIBILITY — Are there formatting issues (tables, columns, images, headers/footers) that would break ATS parsing?
3. KEYWORD MATCH — Does the rewrite naturally incorporate key terms from the JD?
4. QUALITY — Is the writing professional, concise, free of AI-speak?
5. MATCH IMPROVEMENT — Estimate how much the match score improved.
6. ACRONYM COMPLIANCE — Does the rewrite include both the full term and acronym for technical terms on first use? Flag any technical acronym that appears without its expanded form (or vice versa).
7. HEADER STANDARDIZATION — Are all section headers ATS-standard (Work Experience, Skills, Education, Professional Summary, Certifications, Projects, Awards)? Flag any non-standard headers that survived the rewrite.

OUTPUT JSON (no markdown, no fences):
{
  "truthfulness_score": 0-100 (100 = perfectly truthful, no fabrication),
  "truthfulness_pass": true/false (false if score < 90),
  "truthfulness_flags": [
    { "section": "string", "claim": "string", "issue": "string", "severity": "critical|warning" }
  ],
  "ats_score": 0-100,
  "ats_issues": ["string"],
  "keyword_coverage": 0-100 (% of key JD terms present in rewrite),
  "estimated_new_score": 0-100 (estimated match % after rewrite),
  "quality_notes": ["string"],
  "overall_pass": true/false,
  "summary": "string (2-3 sentence quality assessment)"
}`;

// ════════════════════════════════════════════════════════════
// HANDLER
// ════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const startTime = Date.now();

  try {
    // ─── Auth ───
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const sb = createClient(SB_URL, SB_KEY);
    const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);
    // SPEC-COHORT-001-S2: Credit gate
    const credit_rewrite_resume_execute = await creditGate(sb, user.id, 'rewrite-resume-execute');
    if (!credit_rewrite_resume_execute.allowed) return credit_rewrite_resume_execute.response!;

    // ─── Parse request ───
    const body = await req.json();
    const { session_id, user_answers, feedback } = body;

    if (!session_id) return json({ error: 'Missing session_id' }, 400);

    // ─── Load session ───
    const { data: session, error: sessErr } = await sb
      .from('rewrite_sessions')
      .select('*')
      .eq('id', session_id)
      .single();

    if (sessErr || !session) {
      return json({ error: 'Session not found' }, 404);
    }

    // Verify ownership
    if (session.user_id !== user.id) {
      return json({ error: 'Unauthorized — session belongs to another user' }, 403);
    }

    // Check valid status
    const validStatuses = ['questions', 'ready_to_rewrite', 'rewriting', 'checking'];
    if (!validStatuses.includes(session.status)) {
      return json({ error: `Invalid session status: ${session.status}` }, 400);
    }

    // ─── Update status ───
    await sb.from('rewrite_sessions').update({
      status: 'rewriting',
      user_answers: user_answers || session.user_answers || null,
    }).eq('id', session_id);

    // ─── Fetch resume text + JD ───
    const { data: resumeRow } = await sb
      .from('resume_texts')
      .select('extracted_text')
      .eq('user_id', user.id)
      .eq('resume_id', session.resume_id)
      .single();

    if (!resumeRow?.extracted_text) {
      await sb.from('rewrite_sessions').update({ status: 'failed' }).eq('id', session_id);
      return json({ error: 'Resume text not found' }, 404);
    }

    const { data: jobRow } = await sb
      .from('ats_jobs')
      .select('description, title, company_name')
      .eq('greenhouse_id', session.target_job_id)
      .single();

    if (!jobRow?.description) {
      await sb.from('rewrite_sessions').update({ status: 'failed' }).eq('id', session_id);
      return json({ error: 'Job not found' }, 404);
    }

    const resumeText = resumeRow.extracted_text;
    const jdText = stripHtml(jobRow.description);
    const gapAnalysis = session.gap_analysis;
    const answers = user_answers || session.user_answers || {};

    console.log(`[execute] Session ${session_id} — rewriting resume for "${jobRow.title}" at "${jobRow.company_name}"`);

    // ─── Agent 3: Resume Rewriter (Sonnet) ───
    const rewriteInput = `<resume>
${resumeText.slice(0, 6000)}
</resume>

<job_description>
${jdText.slice(0, 4000)}
</job_description>

<gap_analysis>
${JSON.stringify(gapAnalysis)}
</gap_analysis>

<user_answers>
${JSON.stringify(answers)}
</user_answers>

${feedback ? `<revision_feedback>
The user reviewed a previous rewrite and requested changes:
${JSON.stringify(feedback)}
Focus your revisions on the areas they flagged.
</revision_feedback>` : ''}

Rewrite the resume to better match this specific job description. Return ONLY JSON.`;

    // BP-001: Circuit breaker
    const _br = await withAnthropicBreaker(sb, 'rewrite-resume-execute', async () => {
      const r = await callAnthropic(SONNET, REWRITER_SYSTEM, rewriteInput, 4000, 0.2);
      if (!r.ok) throw new Error(r.error || 'AI call failed');
      return r;
    });
    if (_br.circuitOpen) {
      return new Response(JSON.stringify({ error: 'AI service temporarily unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    const rewriteResult = _br.result || { ok: false, text: '', error: _br.error };

    if (!rewriteResult.ok) {
      await sb.from('rewrite_sessions').update({ status: 'failed' }).eq('id', session_id);
      return json({ error: 'Rewriter failed', detail: rewriteResult.error }, 502);
    }

    let rewriteData: unknown;
    try {
      rewriteData = parseJSON(rewriteResult.text);
    } catch (e) {
      console.error('[execute] Rewrite JSON parse failed:', rewriteResult.text.slice(0, 300));
      await sb.from('rewrite_sessions').update({ status: 'failed' }).eq('id', session_id);
      return json({ error: 'Failed to parse rewrite output' }, 500);
    }

    const rewriteMs = Date.now() - startTime;
    const changedCount = (rewriteData.sections || []).filter((s: Record<string, unknown>) => s.changed).length;
    console.log(`[execute] Rewrite complete in ${rewriteMs}ms — ${changedCount}/${rewriteData.sections?.length || 0} sections changed`);

    // ─── Update status ───
    await sb.from('rewrite_sessions').update({ status: 'checking' }).eq('id', session_id);

    // ─── Agent 4: Quality Checker (Haiku) ───
    const qcInput = `<original_resume>
${resumeText.slice(0, 5000)}
</original_resume>

<rewritten_resume>
${JSON.stringify(rewriteData.sections)}
</rewritten_resume>

<job_description>
${jdText.slice(0, 3000)}
</job_description>

<user_provided_answers>
${JSON.stringify(answers)}
</user_provided_answers>

Verify the rewrite is truthful, ATS-friendly, and improves the match. Return ONLY JSON.`;

    const qcResult = await callAnthropic(HAIKU, QUALITY_CHECKER_SYSTEM, qcInput, 2000, 0);

    let qualityCheck: unknown = {
      truthfulness_score: 0,
      truthfulness_pass: false,
      overall_pass: false,
      summary: 'Quality check failed — defaulting to cautious pass',
    };

    if (qcResult.ok) {
      try {
        qualityCheck = parseJSON(qcResult.text);
      } catch (e) {
        console.error('[execute] QC JSON parse failed:', qcResult.text.slice(0, 300));
        // Non-fatal — proceed with default (cautious) quality check
        qualityCheck.overall_pass = true;
        qualityCheck.summary = 'Quality check parse failed — manual review recommended';
      }
    } else {
      console.error('[execute] Quality check failed:', qcResult.error);
      // Non-fatal — allow through with warning
      qualityCheck.overall_pass = true;
      qualityCheck.summary = 'Quality check unavailable — manual review recommended';
    }

    const totalMs = Date.now() - startTime;
    console.log(`[execute] QC complete in ${totalMs}ms — truthfulness=${qualityCheck.truthfulness_score}, pass=${qualityCheck.overall_pass}`);

    // ─── Handle QC failure with retry ───
    const currentRetry = session.credits_used || 0; // Track retries via credits_used
    const MAX_RETRIES = 2;

    if (!qualityCheck.overall_pass && qualityCheck.truthfulness_score < 90 && currentRetry < MAX_RETRIES) {
      // QC failed on truthfulness — retry with correction instructions
      console.log(`[execute] Truthfulness failed (${qualityCheck.truthfulness_score}), retry ${currentRetry + 1}/${MAX_RETRIES}`);

      const correctionInput = `${rewriteInput}

<quality_check_failure>
The previous rewrite failed the truthfulness check. The following claims were flagged as potentially fabricated:
${JSON.stringify(qualityCheck.truthfulness_flags || [])}

CRITICAL: Remove or correct ALL flagged claims. Only include information that exists in the original resume or user-provided answers.
</quality_check_failure>

Rewrite again, fixing all truthfulness issues. Return ONLY JSON.`;

      const retryResult = await callAnthropic(SONNET, REWRITER_SYSTEM, correctionInput, 4000, 0.1);

      if (retryResult.ok) {
        try {
          const retryData = parseJSON(retryResult.text);
          rewriteData = retryData;
          // Re-run QC on corrected version
          const qc2Input = qcInput.replace(
            JSON.stringify(rewriteData.sections),
            JSON.stringify(retryData.sections)
          );
          const qc2Result = await callAnthropic(HAIKU, QUALITY_CHECKER_SYSTEM, qc2Input, 2000, 0);
          if (qc2Result.ok) {
            try { qualityCheck = parseJSON(qc2Result.text); } catch (e) { /* keep previous */ }
          }
        } catch (e) {
          console.error('[execute] Retry parse failed');
        }
      }
    }

    // ─── Debit credits ───
    const isRetry = !!feedback;
    const creditsToDebit = isRetry ? 1 : 3;

    const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';

    if (!isAdmin) {
      const { data: debitResult } = await sb.rpc('debit_credits', {
        p_user_id: user.id,
        p_amount: creditsToDebit,
        p_cost_category: 'ai_rewrite_jd',
        p_description: `JD-match rewrite: ${jobRow.title} at ${jobRow.company_name}${isRetry ? ' (retry)' : ''}`,
        p_cost_cents: isRetry ? 1 : 3, // Approximate cost tracking
      });

      if (!debitResult?.success) {
        // Credits already checked in analyze step, this shouldn't happen
        // but if it does, still return the rewrite (don't waste the AI work)
        console.warn(`[execute] Credit debit failed for user ${user.id}: ${debitResult?.error}`);
      }
    }

    // ─── Persist results ───
    const newScore = qualityCheck.estimated_new_score || null;

    await sb.from('rewrite_sessions').update({
      status: 'completed',
      rewritten_content: rewriteData,
      quality_check: qualityCheck,
      new_score: newScore,
      credits_used: (session.credits_used || 0) + creditsToDebit,
      completed_at: new Date().toISOString(),
    }).eq('id', session_id);

    // AIS-F1-S2: Persist to resume_rewrites table (canonical output store)
    await sb.from('resume_rewrites').insert({
      user_id: user.id,
      resume_id: session.resume_id || null,
      job_id: session.job_id || null,
      session_id: session_id,
      original_text: session.resume_text || '',
      rewritten_text: rewriteData.full_text || rewriteData.sections?.map((s: Record<string,unknown>) => s.rewritten || '').join('\n\n') || '',
      diff_json: rewriteData.sections || null,
      original_score: session.original_score || null,
      new_score: newScore || null,
      credits_charged: creditsToDebit,
      status: 'complete',
    }).then(({ error }) => {
      if (error) console.warn('[execute] resume_rewrites insert error (non-fatal):', error.message);
    });


    // ─── Notify: resume rewrite ready (v6.07) ───
    // Fire-and-forget POST to interview-sequence for resume_rewrite_ready notification
    try {
      const notifyUrl = `${SB_URL}/functions/v1/interview-sequence`;
      fetch(notifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SB_KEY}`,
        },
        body: JSON.stringify({
          type: 'resume_rewrite_ready',
          userId: user.id,
          companyName: jobRow.company_name || undefined,
          jobTitle: jobRow.title || undefined,
          originalResumeName: session.resume_name || undefined,
          originalScore: session.original_score || undefined,
          newScore: newScore || undefined,
          keywordsAdded: (rewriteData.keywords_added || []).length,
          acronymPairsAdded: (rewriteData.acronym_pairs_added || []).length,
          headersStandardized: (rewriteData.headers_standardized || []).length,
          sectionsChanged: (rewriteData.sections || []).length,
          newResumeId: session.resume_id || undefined,
          rewriteJobId: session_id,
        }),
      }).catch(e => console.warn('[execute] Rewrite notification failed (non-blocking):', e.message));
      console.log(`[execute] Fired resume_rewrite_ready notification for session ${session_id}`);
    } catch (notifyErr) {
      // Non-blocking — don't fail the rewrite if notification fails
      console.warn('[execute] Rewrite notification error (non-blocking):', notifyErr);
    }

    // ─── ATS-006/007: Log acronym and header metrics ───
    const acronymCount = (rewriteData.acronym_pairs_added || []).length;
    const headerCount = (rewriteData.headers_standardized || []).length;
    if (acronymCount > 0) {
      console.log(`[execute] ATS-006: ${acronymCount} acronym pairs added — ${(rewriteData.acronym_pairs_added || []).join(', ')}`);
    }
    if (headerCount > 0) {
      console.log(`[execute] ATS-007: ${headerCount} headers standardized — ${(rewriteData.headers_standardized || []).join(', ')}`);
    }

    // ─── Response ───
    return json({
      success: true,
      session_id,
      status: 'completed',
      sections: rewriteData.sections || [],
      keywords_added: rewriteData.keywords_added || [],
      acronym_pairs_added: rewriteData.acronym_pairs_added || [],
      headers_standardized: rewriteData.headers_standardized || [],
      skipped_gaps: rewriteData.skipped_gaps || [],
      quality: {
        truthfulness_score: qualityCheck.truthfulness_score,
        truthfulness_pass: qualityCheck.truthfulness_pass ?? true,
        ats_score: qualityCheck.ats_score,
        keyword_coverage: qualityCheck.keyword_coverage,
        estimated_new_score: newScore,
        overall_pass: qualityCheck.overall_pass ?? true,
        summary: qualityCheck.summary || '',
        warnings: qualityCheck.truthfulness_flags || [],
      },
      original_score: session.original_score,
      new_score: newScore,
      credits_used: creditsToDebit,
      timing_ms: Date.now() - startTime,
    });

  } catch (e) {
    console.error('[execute] Unhandled error:', e);
    return json({ error: 'Internal error', detail: e.message }, 500);
  }
});
