/**
 * crewai-content-qa — Edge Function
 * SA-010: Content QA Agent (Agent 1) — Observe Mode
 * ADR-05: CrewAI Architecture
 *
 * Reviews AI-generated editorial content in content_stories (status = 'pending_review').
 * Evaluates: factual accuracy, brand voice, data completeness, length compliance, actionability.
 * Logs approve/reject decisions with confidence scores in agent_action_log.
 *
 * OBSERVE MODE: Logs decisions only. Does NOT call approve-content.
 * When graduated to 'suggest' mode, decisions appear in admin panel for Marston.
 * When graduated to 'auto_with_approval', auto-approves confidence > 0.95.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';
import { withAnthropicBreaker } from "../_shared/anthropic.ts";

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const sb = createClient(SB_URL, SB_KEY);

const AGENT_ID = 'content-qa';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── QA Review Prompt ──
const QA_SYSTEM_PROMPT = `You are a Content Quality Assurance reviewer for Brilliant Jobs, a job search intelligence platform. You review AI-generated editorial articles about the job market.

REVIEW CRITERIA (score each 0.0 to 1.0):

1. FACTUAL_ACCURACY: Do numbers and claims appear reasonable? Are there fabricated statistics? Does the headline match the body data?
2. BRAND_VOICE: Does it follow editorial rules? No exclamation points, no "breaking/exclusive", no speculation about causes, no misleading rounding?
3. DATA_COMPLETENESS: Are required fields present (headline, body, source data reference)? Are both percentage change AND absolute numbers included?
4. LENGTH_COMPLIANCE: Is the body 200-400 words? Is the headline under 80 characters?
5. ACTIONABILITY: Does it end with one actionable sentence for job seekers?

RESPOND WITH ONLY valid JSON:
{
  "decision": "approve" | "reject",
  "confidence": 0.0 to 1.0,
  "scores": {
    "factual_accuracy": 0.0 to 1.0,
    "brand_voice": 0.0 to 1.0,
    "data_completeness": 0.0 to 1.0,
    "length_compliance": 0.0 to 1.0,
    "actionability": 0.0 to 1.0
  },
  "issues": ["list of specific issues found"],
  "summary": "one sentence summary of overall quality"
}`;

interface ReviewResult {
  decision: 'approve' | 'reject';
  confidence: number;
  scores: Record<string, number>;
  issues: string[];
  summary: string;
}

async function reviewContent(story: Record<string, unknown>): Promise<ReviewResult> {
  const headline = story.headline as string || '';
  const body = story.body_html as string || story.body as string || '';
  const lede = story.lede as string || '';
  const storyType = story.story_type as string || 'unknown';

  const userPrompt = `Review this editorial content:

HEADLINE: ${headline}
LEDE: ${lede}
BODY: ${body}
STORY TYPE: ${storyType}

Provide your quality assessment as JSON.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: QA_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} — ${errText}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  // Parse JSON response (strip markdown fences if present)
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean) as ReviewResult;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const logger = createLogger('crewai-content-qa', crypto.randomUUID());
  const startTime = Date.now();

  try {
    // Check agent config and kill switch
    const { data: agentConfig, error: configErr } = await sb
      .from('agent_config')
      .select('*')
      .eq('id', AGENT_ID)
      .single();

    if (configErr || !agentConfig) {
      throw new Error(`Agent ${AGENT_ID} not found in agent_config`);
    }

    if (!agentConfig.enabled) {
      logger.warn('Content QA Agent is disabled (kill switch active)');
      return new Response(JSON.stringify({
        ok: false,
        error: 'Agent disabled via kill switch',
        agent: AGENT_ID,
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch pending_review content stories (batch of up to 10)
    const { data: stories, error: fetchErr } = await sb
      .from('content_stories')
      .select('id, headline, lede, body_html, body, story_type, source_data, validation_checks, created_at')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: true })
      .limit(10);

    if (fetchErr) throw fetchErr;

    if (!stories || stories.length === 0) {
      logger.info('No pending_review stories to review');
      return new Response(JSON.stringify({
        ok: true,
        agent: AGENT_ID,
        reviewed: 0,
        message: 'No stories pending review',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logger.info(`Reviewing ${stories.length} pending stories`);

    const results: Array<{
      story_id: string;
      decision: string;
      confidence: number;
      error?: string;
    }> = [];

    for (const story of stories) {
      const reviewStart = Date.now();
      try {
        const review = await reviewContent(story);
        const reviewDuration = Date.now() - reviewStart;

        // Log the decision to agent_action_log
        await sb.from('agent_action_log').insert({
          agent_id: AGENT_ID,
          action_type: review.decision === 'approve' ? 'approve' : 'reject',
          trust_level: agentConfig.trust_level,
          target: String(story.id),
          target_type: 'content_story',
          payload: {
            headline: story.headline,
            story_type: story.story_type,
            validation_checks: story.validation_checks,
          },
          result: {
            decision: review.decision,
            scores: review.scores,
            issues: review.issues,
            summary: review.summary,
          },
          confidence: review.confidence,
          executed: false,  // OBSERVE MODE: never actually approve/reject
          duration_ms: reviewDuration,
        });

        results.push({
          story_id: String(story.id),
          decision: review.decision,
          confidence: review.confidence,
        });

        logger.info(`Story ${story.id}: ${review.decision} (confidence: ${review.confidence})`, {
          headline: story.headline,
          issues: review.issues,
        });

        // PostHog event for monitoring
        // (PostHog server-side would go here in a real implementation)

      } catch (reviewErr) {
        const errMsg = reviewErr instanceof Error ? reviewErr.message : String(reviewErr);
        logger.error(`Failed to review story ${story.id}: ${errMsg}`);

        // Log the error
        await sb.from('agent_action_log').insert({
          agent_id: AGENT_ID,
          action_type: 'review',
          trust_level: agentConfig.trust_level,
          target: String(story.id),
          target_type: 'content_story',
          payload: { headline: story.headline },
          result: { error: errMsg },
          confidence: null,
          executed: false,
          duration_ms: Date.now() - reviewStart,
          error: errMsg,
        });

        results.push({
          story_id: String(story.id),
          decision: 'error',
          confidence: 0,
          error: errMsg,
        });
      }
    }

    // Update agent run stats
    const totalDuration = Date.now() - startTime;
    await sb
      .from('agent_config')
      .update({
        last_run_at: new Date().toISOString(),
        run_count: agentConfig.run_count + 1,
        last_error: null,
      })
      .eq('id', AGENT_ID);

    const summary = {
      ok: true,
      agent: AGENT_ID,
      trust_level: agentConfig.trust_level,
      reviewed: results.length,
      approved: results.filter(r => r.decision === 'approve').length,
      rejected: results.filter(r => r.decision === 'reject').length,
      errors: results.filter(r => r.decision === 'error').length,
      avg_confidence: results.length > 0
        ? +(results.reduce((sum, r) => sum + r.confidence, 0) / results.length).toFixed(4)
        : 0,
      duration_ms: totalDuration,
      observe_mode: agentConfig.trust_level === 'observe',
      results,
    };

    logger.info('Content QA run complete', summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Content QA Agent error: ${msg}`);

    // Update error count
    await sb.rpc('exec_sql', {
      query: `UPDATE agent_config SET error_count = error_count + 1, last_error = '${msg.replace(/'/g, "''")}' WHERE id = '${AGENT_ID}'`,
    }).catch(() => {});

    return new Response(JSON.stringify({ ok: false, agent: AGENT_ID, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
