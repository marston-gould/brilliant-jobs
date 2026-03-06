/**
 * AI Guard — shared rate limiting + usage logging for all AI-calling Edge Functions
 * CS-009: AD-FIX-05
 */

interface RateLimitOpts {
  functionName: string;
  callerId: string;
  maxCalls: number;
  windowMinutes: number;
  supabase: any;
  corsHeaders: Record<string, string>;
}

interface UsageLogOpts {
  functionName: string;
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  supabase: any;
}

// Default rate limits per function (calls per hour)
export const DEFAULT_LIMITS: Record<string, number> = {
  'score-resume': 20,
  'rewrite-resume': 10,
  'rewrite-resume-analyze': 10,
  'rewrite-resume-execute': 10,
  'generate-cover-letter': 15,
  'generate-filter': 30,
  'prompt-to-filter': 30,
  'filter-to-prompt': 30,
  'chat-job-search': 40,
  'match-score-overlay': 50,
  'enrich-job-ondemand': 20,
  'analyze-hidden-job': 20,
  'answer-form-question': 30,
  'extract-resume-profile': 10,
  'score-ai-content': 20,
  'generate-editorial-content': 10,
  'seo-sync': 5,
  // CS-015: CE-001 — Non-AI EF rate limits
  'enrich-job': 60,
  'create-checkout': 10,
  'data-export': 5,
  'resend-confirmation': 10,
  'confirm-email': 20,
};

/**
 * Check rate limit for an Edge Function call.
 * Returns null if allowed, or a 429 Response if rate-limited.
 */
export async function checkRateLimit(opts: RateLimitOpts): Promise<Response | null> {
  try {
    const { data: allowed } = await opts.supabase.rpc('check_ef_rate_limit', {
      p_function_name: opts.functionName,
      p_caller_id: opts.callerId,
      p_max_calls: opts.maxCalls,
      p_window_minutes: opts.windowMinutes,
    });
    if (allowed === false) {
      return new Response(
        JSON.stringify({ error: `Rate limit exceeded. Max ${opts.maxCalls} calls per ${opts.windowMinutes} minutes.` }),
        {
          status: 429,
          headers: { ...opts.corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(opts.windowMinutes * 60) },
        }
      );
    }
  } catch (e) {
    // Rate limit check failure should not block the request — log and continue
    console.warn(`[ai-guard] Rate limit check failed for ${opts.functionName}:`, e.message);
  }
  return null;
}

/**
 * Log AI usage to ai_usage_log table for cost tracking.
 * Fire-and-forget — never blocks the response.
 */
export async function logAiUsage(opts: UsageLogOpts): Promise<void> {
  try {
    await opts.supabase.from('ai_usage_log').insert({
      function_name: opts.functionName,
      user_id: opts.userId || null,
      model: opts.model,
      input_tokens: opts.inputTokens,
      output_tokens: opts.outputTokens,
      total_tokens: opts.inputTokens + opts.outputTokens,
      duration_ms: opts.durationMs,
      estimated_cost_usd: estimateCost(opts.model, opts.inputTokens, opts.outputTokens),
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn(`[ai-guard] Usage log failed for ${opts.functionName}:`, e.message);
  }
}

/**
 * Extract caller ID from JWT bearer token (first 20 chars of payload).
 */
export function extractCallerId(authHeader: string | null): string {
  if (!authHeader) return 'anon';
  const token = authHeader.replace('Bearer ', '');
  const parts = token.split('.');
  return parts[1]?.substring(0, 20) || 'unknown';
}

/**
 * Estimate cost in USD based on model and token counts.
 * Pricing as of March 2026 — Anthropic API.
 */
function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Claude 3.5 Sonnet pricing (most commonly used)
  let inputPer1k = 0.003;
  let outputPer1k = 0.015;
  
  if (model.includes('haiku')) {
    inputPer1k = 0.00025;
    outputPer1k = 0.00125;
  } else if (model.includes('opus')) {
    inputPer1k = 0.015;
    outputPer1k = 0.075;
  }
  
  return (inputTokens / 1000 * inputPer1k) + (outputTokens / 1000 * outputPer1k);
}
