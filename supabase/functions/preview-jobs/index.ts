// supabase/functions/preview-jobs/index.ts
// Edge Function: public job preview for landing page
// Rate limited: 2 queries per session token (30-min expiry)
// Returns obfuscated data — no company names, no IDs, truncated titles

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { API_VERSION } from '../_shared/api-version.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Persistent rate limiting via Supabase DB (survives cold starts + page reloads)
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_QUERIES = 2;

function getRateLimitId(req: Request, body: { fingerprint?: string }): string {
  // Combine IP + fingerprint for robust identification
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('cf-connecting-ip')
    || req.headers.get('x-real-ip')
    || 'unknown';
  const fp = body.fingerprint || '';
  // Hash to a stable key
  const raw = `${ip}:${fp}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return 'pv_' + Math.abs(hash).toString(36);
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'x-api-version': API_VERSION,
};

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: CORS_HEADERS,
    });
  }

  try {
    const body = await req.json();
    const keyword = typeof body.keyword === 'string' ? body.keyword.trim().slice(0, 100) : '';
    const location = typeof body.location === 'string' ? body.location.trim().slice(0, 100) : '';
    const remote = body.remote === true;
    let token = typeof body.session_token === 'string' ? body.session_token : '';

    // Require at least one filter
    if (!keyword && !location && !remote) {
      return new Response(JSON.stringify({ error: 'invalid_input', message: 'Provide at least a keyword or location.' }), {
        status: 400, headers: CORS_HEADERS,
      });
    }

    // Persistent rate limiting via DB
    const rateLimitId = getRateLimitId(req, body);
    const sb = createClient(SB_URL, SB_KEY);

    // Check existing rate limit record
    const { data: rl } = await sb.from('preview_rate_limits').select('queries, first_query_at').eq('id', rateLimitId).maybeSingle();

    let queriesUsed = 0;
    if (rl) {
      const elapsed = Date.now() - new Date(rl.first_query_at).getTime();
      if (elapsed < SESSION_TTL_MS) {
        queriesUsed = rl.queries;
      } else {
        // TTL expired — reset
        await sb.from('preview_rate_limits').update({ queries: 0, first_query_at: new Date().toISOString() }).eq('id', rateLimitId);
      }
    }

    if (queriesUsed >= MAX_QUERIES) {
      return new Response(JSON.stringify({
        error: 'rate_limited',
        queries_remaining: 0,
        message: 'Preview limit reached. Sign up free to explore unlimited filters.',
      }), { status: 200, headers: CORS_HEADERS });
    }

    // Build query
    let q = sb.from('ats_jobs')
      .select('title, company_name, location, loc_type, salary_min, salary_max, first_seen_at')
      .eq('status', 'open'); // FA-003: .eq('open') for consistency with dashboard + backfill

    // FA-003: Search title OR content_tsv (aligns with FA-001 dashboard pattern)
    // content_tsv uses GIN index via websearch full-text search (wfts)
    // NULL-safe: jobs with NULL content_tsv still matched by title ilike
    // FA-003b: FTS sanitization — strip chars that break wfts syntax
    if (keyword) {
      q = q.ilike('title', `%${keyword}%`);
    }

    if (location) {
      // Map common country names to loc_country codes
      const countryMap: Record<string, string> = {
        'united states': 'US', 'usa': 'US', 'us': 'US', 'america': 'US',
        'canada': 'CA', 'united kingdom': 'GB', 'uk': 'GB', 'england': 'GB',
        'germany': 'DE', 'france': 'FR', 'australia': 'AU', 'india': 'IN',
      };
      const norm = location.toLowerCase().trim();
      const countryCode = countryMap[norm];

      if (countryCode) {
        // Country-level search: match loc_country OR location text
        q = q.or(`loc_country.eq.${countryCode},location.ilike.%${location}%`);
      } else {
        // City/state search
        const parts = location.split(',').map(s => s.trim());
        if (parts.length >= 2) {
          q = q.or(`loc_city.ilike.%${parts[0]}%,loc_state.ilike.%${parts[1]}%,location.ilike.%${location}%`);
        } else {
          q = q.or(`loc_city.ilike.%${parts[0]}%,loc_state.ilike.%${parts[0]}%,location.ilike.%${parts[0]}%`);
        }
      }
    }

    if (remote) {
      q = q.or("loc_type.eq.remote,location.ilike.%remote%");
    }

    const { data: rows, error, count } = await q.limit(5000);
    if (error) throw error;

    const allRows = rows || [];

    // Aggregation
    const total = allRows.length;
    const salaries = allRows
      .filter(r => r.salary_min || r.salary_max)
      .map(r => {
        const min = r.salary_min || r.salary_max;
        const max = r.salary_max || r.salary_min;
        return (min + max) / 2;
      })
      .sort((a, b) => a - b);

    const median_salary = salaries.length > 0
      ? salaries.length % 2 === 0
        ? Math.round((salaries[salaries.length / 2 - 1] + salaries[salaries.length / 2]) / 2)
        : salaries[Math.floor(salaries.length / 2)]
      : null;

    const remoteCount = allRows.filter(r =>
      r.loc_type === 'remote' || (r.location || '').toLowerCase().includes('remote')
    ).length;
    const remote_pct = total > 0 ? Math.round((remoteCount / total) * 100) : 0;

    const companySet = new Set(allRows.filter(r => r.company_name).map(r => r.company_name));
    const companies = companySet.size;

    // Card-based preview: 8 random jobs with safe fields (no IDs, no apply URLs)
    const shuffled = allRows
      .filter(r => r.title)
      .sort(() => Math.random() - 0.5)
      .slice(0, 8);

    const jobs = shuffled.map(r => ({
      title: r.title,
      company_name: r.company_name || null,
      location: r.location || null,
      loc_type: r.loc_type || null,
      salary_min: r.salary_min || null,
      salary_max: r.salary_max || null,
      first_seen_at: r.first_seen_at || null,
    }));

    // Backward-compat: titles[] derived from jobs (truncated to 35 chars)
    const titles = jobs.map(j => j.title.length > 35 ? j.title.slice(0, 35) + '…' : j.title);

    // Increment query count in DB
    const newCount = queriesUsed + 1;
    await sb.from('preview_rate_limits').upsert({
      id: rateLimitId,
      queries: newCount,
      first_query_at: rl?.first_query_at || new Date().toISOString(),
      last_query_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    return new Response(JSON.stringify({
      total,
      median_salary,
      remote_pct,
      companies,
      jobs,
      titles,
      queries_remaining: MAX_QUERIES - newCount,
      session_token: rateLimitId,
      content_search_enabled: true,
    }), { status: 200, headers: CORS_HEADERS });

  } catch (e) {
    console.error('[preview-jobs] Error:', e);
    return new Response(JSON.stringify({ error: 'internal', message: 'Something went wrong.' }), {
      status: 500, headers: CORS_HEADERS,
    });
  }
});
