// supabase/functions/recruiter-lookup/index.ts
// v5.52 — Item #19: Recruiter Email Discovery
//
// Finds recruiter/HR contacts for a given company domain using Hunter.io
// Stores results in recruiter_contacts table.
//
// POST body: { company_name, domain, company_id? }
// Auth: Bearer token (user must be authenticated)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const HUNTER_API_KEY = Deno.env.get('HUNTER_API_KEY') || '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

// Recruiting-related titles to filter for
const RECRUITER_TITLES = [
  'recruiter', 'recruiting', 'talent', 'hr ', 'human resource',
  'people operations', 'hiring', 'staffing', 'talent acquisition',
  'head of people', 'vp people', 'director of people',
  'chief people', 'people partner', 'hrbp',
];

function isRecruiterTitle(title: string): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  return RECRUITER_TITLES.some(t => lower.includes(t));
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const sb = createClient(SB_URL, SERVICE_KEY);
  const token = authHeader.replace('Bearer ', '');

  // Verify user
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json();
  const { company_name, domain, company_id } = body;

  if (!domain) {
    return new Response(JSON.stringify({ error: 'domain is required' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Rate limit: max 10 lookups per user per day
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await sb
    .from('recruiter_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('source', 'hunter')
    .gte('created_at', today + 'T00:00:00Z');

  if ((count || 0) >= 10) {
    return new Response(JSON.stringify({
      error: 'Daily lookup limit reached (10/day)',
      contacts: [],
    }), {
      status: 429,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Check for existing contacts for this domain
  const { data: existing } = await sb
    .from('recruiter_contacts')
    .select('id, recruiter_email, recruiter_name, recruiter_title, confidence_score')
    .eq('user_id', user.id)
    .ilike('recruiter_email', `%@${domain}`);

  if (existing && existing.length > 0) {
    return new Response(JSON.stringify({
      contacts: existing,
      source: 'cached',
      message: `Found ${existing.length} cached contact(s) for ${domain}`,
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Call Hunter.io Domain Search API
  if (!HUNTER_API_KEY) {
    return new Response(JSON.stringify({
      error: 'Hunter.io API key not configured',
      contacts: [],
    }), {
      status: 503,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let hunterResults: unknown[] = [];
  try {
    const hunterUrl = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${HUNTER_API_KEY}&limit=20&type=personal`;
    const hunterRes = await fetch(hunterUrl, { signal: AbortSignal.timeout(10000) });

    if (!hunterRes.ok) {
      const errText = await hunterRes.text();
      console.error('[recruiter-lookup] Hunter.io error:', hunterRes.status, errText);
      return new Response(JSON.stringify({
        error: `Hunter.io returned ${hunterRes.status}`,
        contacts: [],
      }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const hunterData = await hunterRes.json();
    hunterResults = hunterData?.data?.emails || [];
  } catch (err) {
    console.error('[recruiter-lookup] Hunter.io fetch failed:', err);
    return new Response(JSON.stringify({
      error: 'Hunter.io request failed',
      contacts: [],
    }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Filter for recruiting-related titles
  const recruiters = hunterResults.filter((e: Record<string, unknown>) =>
    isRecruiterTitle(e.position || '') || isRecruiterTitle(e.department || '')
  );

  // If no recruiters found by title, take top 3 results with highest confidence
  const toInsert = recruiters.length > 0
    ? recruiters.slice(0, 5)
    : hunterResults
        .filter((e: Record<string, unknown>) => e.confidence >= 70)
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) => b.confidence - a.confidence)
        .slice(0, 3);

  if (toInsert.length === 0) {
    return new Response(JSON.stringify({
      contacts: [],
      message: `No recruiter contacts found for ${domain}`,
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Insert into recruiter_contacts
  const rows = toInsert.map((e: Record<string, unknown>) => ({
    user_id: user.id,
    company_id: company_id || null,
    company_name: company_name || domain,
    recruiter_name: [e.first_name, e.last_name].filter(Boolean).join(' ') || null,
    recruiter_email: e.value,
    recruiter_title: e.position || null,
    linkedin_url: e.linkedin || null,
    source: 'hunter',
    confidence_score: e.confidence || 0,
  }));

  const { data: inserted, error: insertErr } = await sb
    .from('recruiter_contacts')
    .upsert(rows, { onConflict: 'user_id,recruiter_email', ignoreDuplicates: true })
    .select('id, recruiter_email, recruiter_name, recruiter_title, confidence_score, linkedin_url');

  if (insertErr) {
    console.error('[recruiter-lookup] Insert error:', insertErr);
    return new Response(JSON.stringify({
      error: 'Failed to save contacts',
      contacts: [],
    }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    contacts: inserted || [],
    source: 'hunter',
    message: `Found ${(inserted || []).length} contact(s) for ${domain}`,
  }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
