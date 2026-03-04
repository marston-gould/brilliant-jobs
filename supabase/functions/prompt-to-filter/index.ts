// supabase/functions/prompt-to-filter/index.ts
// Edge Function: Extract structured filter JSON from conversation history via Claude Haiku
// Roadmap Card: Search Intelligence / UX Innovation
// Reference: VERSION_METHODOLOGY.docx

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

const VALID_FILTER_KEYS = new Set([
  'what_pills', 'where_pills', 'who_pills', 'not_pills', 'type_pills',
  'salary_min', 'salary_max', 'additional_context'
]);

const SYSTEM_PROMPT = `You extract structured job search filters from a conversation. Analyze the ENTIRE conversation to build a cumulative filter.

Return ONLY a JSON object with these fields (no markdown, no backticks, no explanation):
{
  "what_pills": [],      // job titles, roles, skills mentioned
  "where_pills": [],     // locations, normalized to "City, ST" for US, or "Remote"
  "who_pills": [],       // specific company names
  "not_pills": [],       // things user wants to exclude
  "type_pills": [],      // from: "Full-time", "Part-time", "Contract", "Internship"
  "salary_min": null,    // annual integer in USD, or null
  "salary_max": null,    // annual integer in USD, or null
  "additional_context": "" // nuanced preferences that don't fit above
}

Rules:
- ONLY include values explicitly stated by the user
- NEVER invent or assume values
- Normalize US locations to "City, ST" format
- Convert salary to annual integers (e.g. "$80/hr" → 166400, "$150k" → 150000)
- If user mentions "remote", add "Remote" to where_pills
- Accumulate across all messages — later messages may refine or override earlier ones
- Return valid JSON only — no other text`;

function validateFilters(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (!VALID_FILTER_KEYS.has(key)) continue;

    if (key === 'salary_min' || key === 'salary_max') {
      if (value === null || (typeof value === 'number' && value >= 0 && value <= 10000000)) {
        cleaned[key] = value;
      }
      continue;
    }

    if (key === 'additional_context') {
      if (typeof value === 'string' && value.length <= 500) {
        cleaned[key] = value;
      }
      continue;
    }

    if (Array.isArray(value)) {
      cleaned[key] = value
        .filter((v): v is string => typeof v === 'string' && v.length <= 100)
        .slice(0, 20);
    }
  }

  return cleaned;
}

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

    // ─── Parse conversation ───
    const body = await req.json();
    const { conversation } = body;
    if (!Array.isArray(conversation) || conversation.length === 0) {
      return new Response(JSON.stringify({ filters: {} }), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Format conversation for Claude
    const convoText = conversation
      .slice(-20)
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join('\n');

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
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Extract filters from this job search conversation:\n\n${convoText}`,
        }],
      }),
    });

    if (!anthropicRes.ok) {
      console.error('Anthropic API error:', anthropicRes.status);
      return new Response(JSON.stringify({ filters: {}, error: 'ai_unavailable' }), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const data = await anthropicRes.json();
    const rawText = data.content
      ?.filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('') || '{}';

    // Parse JSON — strip any markdown fences
    const cleanJson = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleanJson);
    } catch {
      console.error('Failed to parse filter JSON:', cleanJson);
      return new Response(JSON.stringify({ filters: {}, parse_error: true }), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const filters = validateFilters(parsed);

    return new Response(JSON.stringify({ filters }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('prompt-to-filter error:', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
