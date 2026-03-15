// supabase/functions/filter-to-prompt/index.ts
// Edge Function: Convert structured filter JSON to natural language via Claude Haiku
// Roadmap Card: Search Intelligence / UX Innovation
// Reference: VERSION_METHODOLOGY.docx

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { withAnthropicBreaker } from "../_shared/anthropic.ts";

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

const SYSTEM_PROMPT = `You convert structured job search filters into a natural, first-person job search prompt. 

Rules:
- Write in first person as if the user is describing what they're looking for
- Be concise: 1-3 sentences max
- Include all filter dimensions that have values
- Use natural language, not technical jargon
- For salary, say "around $X" or "between $X and $Y"
- For locations, list them naturally: "in SF or NYC"
- For exclusions, say "but not in [industry/field]"
- Return ONLY the prompt text, nothing else — no quotes, no preamble`;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    // ─── Auth ───
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const anonClient = createClient(SB_URL, Deno.env.get('SUPABASE_ANON_KEY') || SB_KEY);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ─── Parse filter ───
    const body = await req.json();
    const { filters } = body;
    if (!filters || typeof filters !== 'object') {
      return new Response(JSON.stringify({ error: 'Filters object required' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Build a description of what's in the filter
    const parts: string[] = [];
    if (filters.what_pills?.length) parts.push(`Roles: ${filters.what_pills.join(', ')}`);
    if (filters.where_pills?.length) parts.push(`Locations: ${filters.where_pills.join(', ')}`);
    if (filters.who_pills?.length) parts.push(`Companies: ${filters.who_pills.join(', ')}`);
    if (filters.not_pills?.length) parts.push(`Excluding: ${filters.not_pills.join(', ')}`);
    if (filters.type_pills?.length) parts.push(`Type: ${filters.type_pills.join(', ')}`);
    if (filters.salary_min) parts.push(`Min salary: $${filters.salary_min.toLocaleString()}`);
    if (filters.salary_max) parts.push(`Max salary: $${filters.salary_max.toLocaleString()}`);

    if (parts.length === 0) {
      return new Response(JSON.stringify({ prompt: '' }), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ─── Call Claude Haiku ───
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Convert this filter to a natural language job search prompt:\n${parts.join('\n')}`,
        }],
      }),
    });

    if (!anthropicRes.ok) {
      console.error('Anthropic API error:', anthropicRes.status);
      // Fallback: generate a simple prompt without AI
      const fallback = parts.join('. ').replace(/Roles: /g, "I'm looking for ").replace(/Locations: /g, 'in ');
      return new Response(JSON.stringify({ prompt: fallback, fallback: true }), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const data = await anthropicRes.json();
    const prompt = data.content
      ?.filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('') || '';

    return new Response(JSON.stringify({ prompt: prompt.trim() }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('filter-to-prompt error:', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
