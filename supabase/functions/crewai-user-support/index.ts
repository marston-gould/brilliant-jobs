/**
 * crewai-user-support — Edge Function
 * SA-020: User Support Agent (Agent 5) — Observe Mode
 * ADR-05: CrewAI Architecture
 *
 * Actions:
 *   sync_and_triage — Sync from Canny + triage new items (cron action)
 *   status          — Return triage queue summary (admin panel)
 *   triage_item     — Triage a specific Canny post by ID
 *
 * OBSERVE MODE: Syncs, classifies, and drafts responses.
 * Agent NEVER sends responses directly — all drafts require Marston review.
 * Anthropic API used for classification and draft generation (high-priority only).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const CANNY_API_KEY = Deno.env.get('CANNY_API_KEY');

const sb = createClient(SB_URL, SB_KEY);
const AGENT_ID = 'user-support';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResp(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface CannyPost {
  id: string;
  title: string;
  details?: string;
  author?: { email?: string; name?: string };
  board?: { name?: string };
  status?: string;
  score?: number;
  created?: string;
}

interface TriageResult {
  category: string;
  priority: string;
  notes: string;
  suggested_response?: string;
}

// ── Fetch posts from Canny API ──
async function fetchCannyPosts(sinceDays: number): Promise<CannyPost[]> {
  if (!CANNY_API_KEY) {
    // No Canny key — return empty (agent still logs this gracefully)
    return [];
  }

  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const posts: CannyPost[] = [];

  const boards = ['general', 'bugs', 'feature-requests'];
  for (const board of boards) {
    try {
      const res = await fetch('https://canny.io/api/v1/posts/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: CANNY_API_KEY,
          boardID: board,
          sort: 'newest',
          status: 'open',
          limit: 25,
        }),
      });

      if (!res.ok) continue;
      const json = await res.json() as { posts?: CannyPost[] };
      const boardPosts = (json.posts ?? []).filter((p: CannyPost) =>
        p.created && new Date(p.created) > new Date(since)
      );
      posts.push(...boardPosts);
    } catch {
      // Individual board failure — continue
    }
  }

  return posts;
}

// ── Triage a post with Claude ──
async function triageWithAI(post: CannyPost): Promise<TriageResult> {
  const prompt = `You are triaging a user support request for Brilliant Jobs, a job search platform.

Post title: "${post.title}"
Post details: "${post.details ?? '(no details provided)'}"
Board: ${post.board?.name ?? 'general'}
Votes: ${post.score ?? 0}

Classify and triage this post. Return ONLY valid JSON with these exact fields:
{
  "category": "bug|feature_request|billing|account|general",
  "priority": "urgent|high|medium|low",
  "notes": "1-2 sentence triage reasoning",
  "suggested_response": "polite 2-3 sentence draft response from the Brilliant Jobs team"
}

Priority guide:
- urgent: platform broken, data loss, billing error, security concern
- high: significant UX issue affecting core workflow, many votes
- medium: non-blocking issue, moderate votes
- low: minor request, low votes, edge case`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    return {
      category: 'general',
      priority: 'medium',
      notes: 'AI triage unavailable — manual review needed',
    };
  }

  const data = await resp.json() as { content?: Array<{ type: string; text?: string }> };
  const text = (data.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { type: string; text?: string }) => b.text ?? '')
    .join('');

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean) as TriageResult;
  } catch {
    return {
      category: 'general',
      priority: 'medium',
      notes: 'AI response parse error — manual review needed',
    };
  }
}

// ── Upsert posts into canny_sync_log ──
async function syncPosts(posts: CannyPost[]): Promise<number> {
  if (posts.length === 0) return 0;

  const rows = posts.map(p => ({
    canny_post_id: p.id,
    title: p.title,
    body: p.details ?? null,
    author_email: p.author?.email ?? null,
    author_name: p.author?.name ?? null,
    board_name: p.board?.name ?? null,
    status: p.status ?? 'open',
    votes: p.score ?? 0,
    created_at_canny: p.created ?? null,
    synced_at: new Date().toISOString(),
  }));

  const { error } = await sb
    .from('canny_sync_log')
    .upsert(rows, { onConflict: 'canny_post_id', ignoreDuplicates: false });

  if (error) {
    console.error('[user-support] sync error:', error.message);
    return 0;
  }
  return rows.length;
}

// ── Triage unclassified items ──
async function triageQueue(maxItems: number, draftsFor: string[]): Promise<number> {
  const { data: items, error } = await sb
    .from('canny_sync_log')
    .select('id, canny_post_id, title, body, board_name, votes')
    .eq('triage_priority', 'unset')
    .order('votes', { ascending: false })
    .limit(maxItems);

  if (error || !items || items.length === 0) return 0;

  let triaged = 0;
  for (const item of items) {
    const result = await triageWithAI({
      id: item.canny_post_id,
      title: item.title,
      details: item.body,
      board: { name: item.board_name },
      score: item.votes,
    });

    const shouldDraft = draftsFor.includes(result.priority);

    await sb
      .from('canny_sync_log')
      .update({
        category: result.category,
        triage_priority: result.priority,
        triage_notes: result.notes,
        agent_suggested_response: shouldDraft ? result.suggested_response : null,
        triage_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id);

    triaged++;
  }

  return triaged;
}

// ── Main handler ──
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const bodyText = req.method === 'POST' ? await req.text().catch(() => '{}') : '{}';
    const body = JSON.parse(bodyText || '{}');
    const action = body.action ?? url.searchParams.get('action') ?? 'sync_and_triage';

    if (action === 'status') {
      const { data, error } = await sb.rpc('fn_user_support_summary');
      if (error) return jsonResp({ error: error.message }, 500);
      return jsonResp({ summary: data });
    }

    if (action === 'sync_and_triage') {
      // Check if agent is enabled
      const { data: agentConfig } = await sb
        .from('agent_config')
        .select('enabled, trust_level, config')
        .eq('id', AGENT_ID)
        .single();

      if (!agentConfig?.enabled) {
        return jsonResp({ skipped: true, reason: 'agent disabled' });
      }

      const cfg = agentConfig.config as {
        sync_since_days?: number;
        max_items_per_run?: number;
        draft_for_priority?: string[];
      };

      const sinceDays = cfg.sync_since_days ?? 7;
      const maxItems = cfg.max_items_per_run ?? 25;
      const draftsFor = cfg.draft_for_priority ?? ['urgent', 'high'];

      // 1. Sync from Canny
      const cannyPosts = await fetchCannyPosts(sinceDays);
      const synced = await syncPosts(cannyPosts);

      // 2. Triage unclassified items
      const triaged = await triageQueue(maxItems, draftsFor);

      // 3. Log to agent_action_log
      const { data: queueSummary } = await sb.rpc('fn_user_support_summary');
      const summary = queueSummary as { urgent?: number; high?: number; unreviewed_by_marston?: number } | null;

      const severity = (summary?.urgent ?? 0) > 0 ? 'critical'
        : (summary?.high ?? 0) > 0 ? 'warn'
        : 'ok';

      await sb.from('agent_action_log').insert({
        agent_id: AGENT_ID,
        action_type: 'support_triage',
        action_data: {
          synced_from_canny: synced,
          newly_triaged: triaged,
          queue_summary: queueSummary,
          canny_key_configured: !!CANNY_API_KEY,
        },
        severity,
        executed: false,  // Observe mode — no responses sent
        notes: `Synced ${synced} posts, triaged ${triaged} items. ${summary?.unreviewed_by_marston ?? 0} awaiting Marston review.`,
      });

      return jsonResp({
        agent: AGENT_ID,
        mode: agentConfig.trust_level,
        synced_from_canny: synced,
        newly_triaged: triaged,
        canny_configured: !!CANNY_API_KEY,
        queue: queueSummary,
      });
    }

    return jsonResp({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('[user-support] Unhandled error:', err);
    return jsonResp({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
