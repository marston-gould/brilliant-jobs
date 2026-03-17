// supabase/functions/upsert-linkedin-profile/index.ts
// EXT-LI-001: Upsert LinkedIn profile data from Chrome extension auto-capture.
// No Anthropic credits — pure data storage.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL  = Deno.env.get('SUPABASE_URL')!;
const SB_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    // ── Auth ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const sb = createClient(SB_URL, SB_KEY);
    const { data: { user }, error: authErr } = await sb.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Parse body ──
    const body = await req.json();
    const { profile } = body;
    if (!profile || !profile.name) {
      return new Response(JSON.stringify({ error: 'Missing profile data' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Map extracted profile to linkedin_profiles columns ──
    const row = {
      user_id:          user.id,
      display_name:     (profile.name || '').slice(0, 200),
      headline:         (profile.headline || '').slice(0, 500),
      location:         (profile.location || '').slice(0, 200),
      experience_json:  profile.experience || [],
      education_json:   profile.education || [],
      skills_array:     (profile.skills || []).slice(0, 100),
      parsed_at:        new Date().toISOString(),
      parse_confidence: 0.9,  // DOM scrape is high confidence
      updated_at:       new Date().toISOString(),
    };

    // ── Upsert (one row per user) ──
    const { data, error } = await sb
      .from('linkedin_profiles')
      .upsert(row, { onConflict: 'user_id' })
      .select('id, display_name, parsed_at')
      .single();

    if (error) {
      console.error('[upsert-linkedin-profile] DB error:', error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Also update profiles.linkedin_headline if empty ──
    if (profile.headline) {
      await sb.from('profiles')
        .update({ linkedin_headline: profile.headline })
        .eq('id', user.id)
        .is('linkedin_headline', null);
    }

    return new Response(JSON.stringify({
      ok: true,
      id: data?.id,
      display_name: data?.display_name,
      parsed_at: data?.parsed_at,
    }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('[upsert-linkedin-profile] Unexpected error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
