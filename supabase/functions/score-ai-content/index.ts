// supabase/functions/score-ai-content/index.ts
// Edge Function: AI-Written Content Detection via Anthropic Claude Haiku
// Scores job descriptions, resumes, and cover letters for AI authorship probability
// Batch: up to 50 items per invocation
// Fallback: On failure, sets ai_label = 'unknown', never blocks job insertion
// Cost: ~$0.0003 per JD analysis (500 words avg)
// Phase: Synthetic Content Detection — Session 1.2

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const MODEL_VERSION = 'haiku-4.5-scd-v1'; // Synthetic Content Detection v1

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

const MIN_TEXT_LENGTH = 100; // Below this, return 'unknown' — too short for reliable detection
const MAX_TEXT_LENGTH = 8000; // Truncate beyond this to control cost
const MAX_BATCH_SIZE = 50;

// ─── Types ───

interface BatchItem {
  content_type: 'jd' | 'resume' | 'cover_letter';
  content_id: string;
  ats_source?: string;
  text: string;
}

interface ScoringResult {
  content_type: string;
  content_id: string;
  ats_source: string | null;
  ai_generated_score: number;
  ai_label: 'human' | 'mixed' | 'ai_generated' | 'unknown';
  perplexity_score: number | null;
  burstiness_score: number | null;
  confidence: number;
  top_signals: Array<{ signal: string; direction: 'ai' | 'human'; weight: number }>;
  summary: string;
  model_version: string;
  error?: string;
}

// ─── HTML Stripping ───

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Label from score ───

function labelFromScore(score: number): 'human' | 'mixed' | 'ai_generated' {
  if (score < 0.3) return 'human';
  if (score <= 0.6) return 'mixed';
  return 'ai_generated';
}

// ─── Anthropic API caller ───

async function callAnthropic(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 1500,
  temperature: number = 0
): Promise<{ text: string; ok: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[score-ai-content] Anthropic error: ${res.status}`, errBody);
      return { text: '', ok: false, error: `API error ${res.status}` };
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    return { text, ok: true };
  } catch (e) {
    console.error(`[score-ai-content] Anthropic exception:`, e);
    return { text: '', ok: false, error: String(e) };
  }
}

// ─── JSON parser ───

function parseJSON(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

// ─── Detection System Prompt ───

const SYSTEM_PROMPT = `You are an AI-Generated Content Detection Specialist. Analyze the provided text and determine the probability it was written by an AI language model versus a human.

ANALYSIS FRAMEWORK:

1. PERPLEXITY ANALYSIS (how predictable is the text?)
- AI text tends to have low perplexity (very predictable, smooth flow)
- Human text has higher perplexity (unexpected word choices, personal quirks)
- Score 0.0-1.0 where 0.0 = very predictable (AI-like), 1.0 = very unpredictable (human-like)

2. BURSTINESS ANALYSIS (how varied is sentence structure?)
- AI text tends to have uniform sentence lengths and structures
- Human text has "bursts" — short punchy sentences mixed with long complex ones
- Score 0.0-1.0 where 0.0 = very uniform (AI-like), 1.0 = very bursty (human-like)

3. CONTENT SIGNALS (specific indicators):
Look for these AI indicators:
- Overly balanced "on the other hand" structures
- Generic superlatives ("exceptional", "cutting-edge", "world-class") without specifics
- Perfect parallel structure in lists
- Absence of typos, colloquialisms, or informal language
- Generic benefits descriptions that could apply to any company
- Templated section headers (e.g., "What You'll Do", "Who You Are")
- Excessive use of em-dashes, semicolons, or parenthetical asides in a pattern
- Buzzword density without substantive detail

Look for these HUMAN indicators:
- Specific company culture references or inside language
- Irregular formatting or non-standard structure
- Personal voice or opinion
- Specific (not generic) project descriptions
- Typos, grammatical quirks, or informal tone
- Industry jargon used naturally (not as keyword stuffing)
- Specific salary figures, team sizes, or concrete details
- References to specific tools, internal processes, or real team names

IMPORTANT CAVEATS:
- Formal writing is NOT automatically AI-written. Legal, medical, and corporate comms are naturally formal.
- Templates are NOT proof of AI. Many companies use structured JD templates.
- Focus on the COMBINATION of signals, not any single indicator.
- Short texts (<200 words) inherently have lower confidence.

Output ONLY a JSON object with these fields:
- ai_generated_score: number 0.0-1.0 (probability of AI generation)
- perplexity_score: number 0.0-1.0 (text predictability, lower = more AI-like)
- burstiness_score: number 0.0-1.0 (structural variation, lower = more AI-like)
- confidence: number 0.0-1.0 (how confident you are in the assessment)
- top_signals: array of up to 5 objects with {signal: string, direction: "ai"|"human", weight: number 0.0-1.0}
- summary: string (1 sentence verdict explaining the assessment)

No markdown, no code fences, no preamble. JSON only.`;

// ─── Score a single item ───

async function scoreItem(item: BatchItem): Promise<ScoringResult> {
  const baseResult: ScoringResult = {
    content_type: item.content_type,
    content_id: item.content_id,
    ats_source: item.ats_source || null,
    ai_generated_score: 0,
    ai_label: 'unknown',
    perplexity_score: null,
    burstiness_score: null,
    confidence: 0,
    top_signals: [],
    summary: '',
    model_version: MODEL_VERSION,
  };

  // Strip HTML for JDs
  let text = item.content_type === 'jd' ? stripHtml(item.text) : item.text;

  // Enforce minimum length
  if (!text || text.length < MIN_TEXT_LENGTH) {
    baseResult.summary = 'Text too short for reliable AI detection analysis.';
    baseResult.confidence = 0;
    return baseResult;
  }

  // Truncate to control cost
  text = text.slice(0, MAX_TEXT_LENGTH);

  const contentLabel = item.content_type === 'jd'
    ? 'Job Description'
    : item.content_type === 'resume'
      ? 'Resume'
      : 'Cover Letter';

  const userPrompt = `<content_type>${contentLabel}</content_type>
<content_id>${item.content_id}</content_id>
<text>
${text}
</text>

Analyze this ${contentLabel.toLowerCase()} for AI-generated content. Return ONLY JSON.`;

  const result = await callAnthropic(SYSTEM_PROMPT, userPrompt, 800, 0);

  if (!result.ok) {
    baseResult.summary = 'Scoring failed — API error.';
    baseResult.error = result.error;
    return baseResult;
  }

  try {
    const parsed = parseJSON(result.text);

    baseResult.ai_generated_score = Math.max(0, Math.min(1, Number(parsed.ai_generated_score) || 0));
    baseResult.ai_label = labelFromScore(baseResult.ai_generated_score);
    baseResult.perplexity_score = parsed.perplexity_score != null ? Math.max(0, Math.min(1, Number(parsed.perplexity_score))) : null;
    baseResult.burstiness_score = parsed.burstiness_score != null ? Math.max(0, Math.min(1, Number(parsed.burstiness_score))) : null;
    baseResult.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    baseResult.top_signals = Array.isArray(parsed.top_signals) ? parsed.top_signals.slice(0, 5) : [];
    baseResult.summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500) : '';

    return baseResult;
  } catch (e) {
    console.error(`[score-ai-content] JSON parse failed for ${item.content_id}:`, result.text.slice(0, 200));
    baseResult.summary = 'Scoring failed — response parse error.';
    baseResult.error = 'json_parse_failed';
    return baseResult;
  }
}

// ─── Upsert results to DB ───

async function upsertResults(
  sb: ReturnType<typeof createClient>,
  results: ScoringResult[]
): Promise<{ inserted: number; errors: number }> {
  let inserted = 0;
  let errors = 0;

  for (const r of results) {
    if (r.ai_label === 'unknown' && r.error) {
      // Don't persist transient API errors — they'll be retried on next batch
      errors++;
      continue;
    }

    const row = {
      content_type: r.content_type,
      content_id: r.content_id,
      ats_source: r.ats_source,
      ai_generated_score: r.ai_generated_score,
      ai_label: r.ai_label,
      perplexity_score: r.perplexity_score,
      burstiness_score: r.burstiness_score,
      confidence: r.confidence,
      top_signals: r.top_signals,
      summary: r.summary,
      model_version: r.model_version,
      scored_at: new Date().toISOString(),
    };

    const { error } = await sb
      .from('content_ai_scores')
      .upsert(row, { onConflict: 'content_type,content_id,ats_source' });

    if (error) {
      console.error(`[score-ai-content] Upsert failed for ${r.content_id}:`, error.message);
      errors++;
    } else {
      inserted++;
    }
  }

  return { inserted, errors };
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

  const startTime = Date.now();

  try {
    const sb = createClient(SB_URL, SB_KEY);

    // Parse body
    const body = await req.json().catch(() => ({}));
    let { items, mode } = body;

    // ─── AUTO-FETCH MODE ───
    // When called with empty body or mode='backfill', automatically fetch unscored JDs
    // This enables pg_cron to call the EF with {} and have it self-serve
    if (!items || !Array.isArray(items) || items.length === 0) {
      console.log('[score-ai-content] No items provided — entering auto-fetch mode');

      const batchSize = body.batch_size || 25; // Conservative default for cron
      const fetchMode = mode || 'backfill'; // backfill (oldest first) or new (newest first)

      // Fetch unscored open JDs with content
      const orderDir = fetchMode === 'new' ? 'desc' : 'asc';
      const { data: unscoredJobs, error: fetchErr } = await sb
        .from('ats_jobs')
        .select('greenhouse_id, content, ats_source')
        .eq('status', 'open')
        .not('content', 'is', null)
        .not('greenhouse_id', 'in',
          sb.from('content_ai_scores')
            .select('content_id')
            .eq('content_type', 'jd')
        )
        .order('created_at', { ascending: fetchMode !== 'new' })
        .limit(batchSize);

      // Fallback: if the subquery approach fails, use a raw RPC or simpler query
      let jobsToScore = unscoredJobs;
      if (fetchErr || !unscoredJobs || unscoredJobs.length === 0) {
        console.log('[score-ai-content] Subquery fetch failed or empty, trying LEFT JOIN approach via RPC');
        // Use a simpler approach: fetch jobs not in content_ai_scores
        const { data: rpcJobs, error: rpcErr } = await sb.rpc('get_unscored_jds', { p_limit: batchSize, p_mode: fetchMode });
        if (rpcErr || !rpcJobs || rpcJobs.length === 0) {
          const elapsedMs = Date.now() - startTime;
          return new Response(
            JSON.stringify({
              mode: 'auto-fetch',
              message: rpcErr ? `Fetch error: ${rpcErr.message}` : 'No unscored JDs remaining — backfill complete',
              elapsed_ms: elapsedMs,
            }),
            { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }
        jobsToScore = rpcJobs;
      }

      // Convert fetched jobs to BatchItems
      items = jobsToScore
        .filter((j: Record<string, unknown>) => j.content && j.content.length >= MIN_TEXT_LENGTH)
        .map((j: Record<string, unknown>) => ({
          content_type: 'jd',
          content_id: j.greenhouse_id,
          ats_source: j.ats_source || null,
          text: j.content,
        }));

      if (items.length === 0) {
        const elapsedMs = Date.now() - startTime;
        return new Response(
          JSON.stringify({ mode: 'auto-fetch', message: 'All fetched JDs too short for scoring', elapsed_ms: elapsedMs }),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[score-ai-content] Auto-fetched ${items.length} unscored JDs for scoring`);
    }

    if (items.length > MAX_BATCH_SIZE) {
      return new Response(
        JSON.stringify({ error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE}` }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Validate items
    const validItems: BatchItem[] = [];
    const validationErrors: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.content_type || !item.content_id || !item.text) {
        validationErrors.push(`Item ${i}: missing content_type, content_id, or text`);
        continue;
      }
      if (!['jd', 'resume', 'cover_letter'].includes(item.content_type)) {
        validationErrors.push(`Item ${i}: invalid content_type "${item.content_type}". Use: jd, resume, cover_letter`);
        continue;
      }
      validItems.push({
        content_type: item.content_type,
        content_id: item.content_id,
        ats_source: item.ats_source || null,
        text: item.text,
      });
    }

    if (validItems.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid items in batch', validation_errors: validationErrors }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[score-ai-content] Scoring ${validItems.length} items (${validItems.map(i => i.content_type).join(',')})`);

    // Score items sequentially (to respect API rate limits)
    const results: ScoringResult[] = [];
    for (const item of validItems) {
      const result = await scoreItem(item);
      results.push(result);
    }

    // Upsert to database
    const { inserted, errors: dbErrors } = await upsertResults(sb, results);

    const elapsedMs = Date.now() - startTime;
    console.log(`[score-ai-content] Complete: ${inserted} inserted, ${dbErrors} errors, ${elapsedMs}ms`);

    // Build response
    const response = {
      scored: results.length,
      inserted,
      errors: dbErrors,
      validation_errors: validationErrors.length > 0 ? validationErrors : undefined,
      elapsed_ms: elapsedMs,
      model: HAIKU_MODEL,
      model_version: MODEL_VERSION,
      results: results.map(r => ({
        content_id: r.content_id,
        content_type: r.content_type,
        ai_generated_score: r.ai_generated_score,
        ai_label: r.ai_label,
        perplexity_score: r.perplexity_score,
        burstiness_score: r.burstiness_score,
        confidence: r.confidence,
        top_signals: r.top_signals,
        summary: r.summary,
        error: r.error || undefined,
      })),
    };

    return new Response(JSON.stringify(response), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[score-ai-content] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
