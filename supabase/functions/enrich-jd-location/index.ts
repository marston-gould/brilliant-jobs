// EDE-001: enrich-jd-location Edge Function
// Triggered by client when a filter with wherePills is saved.
// Deduplicates by user+location_key, counts eligible jobs, inserts enrichment_requests,
// calls fn_mark_jobs_for_enrichment(p_location) to queue them at priority=1.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// State name → 2-letter abbreviation lookup
const STATE_MAP: Record<string, string> = {
  'alabama':'al','alaska':'ak','arizona':'az','arkansas':'ar','california':'ca',
  'colorado':'co','connecticut':'ct','delaware':'de','florida':'fl','georgia':'ga',
  'hawaii':'hi','idaho':'id','illinois':'il','indiana':'in','iowa':'ia',
  'kansas':'ks','kentucky':'ky','louisiana':'la','maine':'me','maryland':'md',
  'massachusetts':'ma','michigan':'mi','minnesota':'mn','mississippi':'ms',
  'missouri':'mo','montana':'mt','nebraska':'ne','nevada':'nv',
  'new hampshire':'nh','new jersey':'nj','new mexico':'nm','new york':'ny',
  'north carolina':'nc','north dakota':'nd','ohio':'oh','oklahoma':'ok',
  'oregon':'or','pennsylvania':'pa','rhode island':'ri','south carolina':'sc',
  'south dakota':'sd','tennessee':'tn','texas':'tx','utah':'ut',
  'vermont':'vt','virginia':'va','washington':'wa','west virginia':'wv',
  'wisconsin':'wi','wyoming':'wy','district of columbia':'dc',
};

function normalizeLocationKey(raw: string): { key: string; display: string } {
  const s = raw.trim();
  const lower = s.toLowerCase().replace(/[.,]/g, '').trim();

  // Remote
  if (lower === 'remote' || lower === 'remote work' || lower === 'work from home') {
    return { key: 'remote', display: 'Remote' };
  }

  // United States / USA / US
  if (['united states','usa','us','u.s.','u.s.a.','america'].includes(lower)) {
    return { key: 'us', display: 'United States' };
  }

  // "City, ST" or "City ST" format
  const cityStateMatch = s.match(/^(.+?),?\s+([A-Z]{2})$/);
  if (cityStateMatch) {
    const city = cityStateMatch[1].trim().toLowerCase().replace(/\s+/g, '-');
    const state = cityStateMatch[2].toLowerCase();
    return {
      key: `us:${state}:${city}`,
      display: `${cityStateMatch[1].trim()}, ${cityStateMatch[2].toUpperCase()}`,
    };
  }

  // Full state name
  if (STATE_MAP[lower]) {
    return {
      key: `us:${STATE_MAP[lower]}`,
      display: s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    };
  }

  // 2-letter state code alone
  if (/^[a-z]{2}$/.test(lower) && Object.values(STATE_MAP).includes(lower)) {
    return { key: `us:${lower}`, display: lower.toUpperCase() };
  }

  // Fallback: treat as US city slug
  const slug = lower.replace(/\s+/g, '-');
  return { key: `us:${slug}`, display: s };
}

function calcEta(jobsTotal: number): string {
  const jobsPerHour = 300; // 50 jobs/run × 10min cron
  const hoursNeeded = Math.max(0.5, Math.ceil(jobsTotal / jobsPerHour));
  return new Date(Date.now() + hoursNeeded * 3_600_000).toISOString();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const sbUrl = Deno.env.get('SUPABASE_URL')!;
    const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user JWT
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(sbUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { location, filter_id, include_remote } = body as {
      location: string;
      filter_id?: string;
      include_remote?: boolean;
    };

    if (!location || typeof location !== 'string') {
      return new Response(JSON.stringify({ error: 'location is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { key: location_key, display: loc_display } = normalizeLocationKey(location);
    const sb = createClient(sbUrl, sbServiceKey);

    // Dedup: check for recent request within 24h
    const cutoff = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const { data: existing } = await sb
      .from('enrichment_requests')
      .select('*')
      .eq('user_id', user.id)
      .eq('location_key', location_key)
      .gt('requested_at', cutoff)
      .neq('status', 'no_jobs')
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({
        location_key: existing.location_key,
        loc_display: existing.loc_display,
        status: existing.status,
        jobs_total: existing.jobs_total,
        jobs_enriched: existing.jobs_enriched,
        estimated_at: existing.estimated_at,
        cached: true,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Count eligible unenriched jobs for this location
    let countQuery = sb
      .from('ats_jobs')
      .select('greenhouse_id', { count: 'exact', head: true })
      .eq('status', 'open')
      .not('content', 'is', null)
      .gt('length', 200) // approximate — will be exact in fn
      .is('jd_skills', null)
      .is('jd_extracted_at', null);

    // Apply geography filter
    if (location_key === 'remote') {
      countQuery = countQuery.or('is_remote.eq.true,loc_type.eq.remote');
    } else if (location_key === 'us') {
      countQuery = countQuery.or('loc_country.eq.US,is_remote.eq.true');
    } else if (location_key.startsWith('us:')) {
      const stateAbbr = location_key.split(':')[1];
      countQuery = countQuery.or(`loc_state.eq.${stateAbbr.toUpperCase()},loc_country.eq.US`);
    }

    const { count: rawCount } = await countQuery;
    const jobs_total = rawCount ?? 0;

    // Handle no_jobs case
    if (jobs_total === 0) {
      const { data: row } = await sb
        .from('enrichment_requests')
        .upsert({
          user_id: user.id,
          filter_id: filter_id ?? null,
          location_key,
          loc_display,
          status: 'no_jobs',
          jobs_total: 0,
          jobs_enriched: 0,
        }, { onConflict: 'user_id,location_key' })
        .select()
        .single();

      return new Response(JSON.stringify({
        location_key,
        loc_display,
        status: 'no_jobs',
        jobs_total: 0,
        jobs_enriched: 0,
        estimated_at: null,
        cached: false,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const estimated_at = calcEta(jobs_total);

    // Insert enrichment_requests row
    await sb.from('enrichment_requests').upsert({
      user_id: user.id,
      filter_id: filter_id ?? null,
      location_key,
      loc_display,
      status: 'queued',
      jobs_total,
      jobs_enriched: 0,
      estimated_at,
    }, { onConflict: 'user_id,location_key' });

    // Fire fn_mark_jobs_for_enrichment with location — marks eligible jobs priority=1
    await sb.rpc('fn_mark_jobs_for_enrichment', {
      p_batch_size: 500,
      p_location: location_key,
    });

    // Update status to processing
    await sb.from('enrichment_requests')
      .update({ status: 'processing' })
      .eq('user_id', user.id)
      .eq('location_key', location_key);

    return new Response(JSON.stringify({
      location_key,
      loc_display,
      status: 'processing',
      jobs_total,
      jobs_enriched: 0,
      estimated_at,
      cached: false,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[enrich-jd-location] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
