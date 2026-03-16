// supabase/functions/award-grant/index.ts
// SPEC-COHORT-001-S3: Issues an award credit grant to a user.
// Called by: referral reward system, promo code redemption, admin manual grant.
// Gateway route #132.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const sb = createClient(SB_URL, SB_KEY);
    const token = authHeader.replace('Bearer ', '');

    // Accept service-role (for internal calls) or admin JWT
    let isAuthorized = token === SB_KEY;
    let callerId: string | null = null;

    if (!isAuthorized) {
      const { data: { user }, error } = await sb.auth.getUser(token);
      if (error || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      const { data: profile } = await sb
        .from('profiles').select('role').eq('id', user.id).single();
      if (!['admin', 'superadmin'].includes(profile?.role ?? '')) {
        return new Response(JSON.stringify({ error: 'Forbidden — admin required' }),
          { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      isAuthorized = true;
      callerId = user.id;
    }

    const body = await req.json();
    const { user_id, amount, source_ref, expires_at, notes } = body;

    // Validate
    if (!user_id || typeof user_id !== 'string') {
      return new Response(JSON.stringify({ error: 'user_id required' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    if (!amount || typeof amount !== 'number' || amount <= 0 || !Number.isInteger(amount)) {
      return new Response(JSON.stringify({ error: 'amount must be a positive integer' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    if (amount > 10000) {
      return new Response(JSON.stringify({ error: 'amount exceeds maximum single grant (10000)' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Call fn_grant_award_credits RPC
    const { data: balance, error: rpcErr } = await sb.rpc('fn_grant_award_credits', {
      p_user_id: user_id,
      p_amount: amount,
      p_source_ref: source_ref ?? null,
      p_expires_at: expires_at ?? null,
      p_notes: notes ?? null,
    });

    if (rpcErr) {
      console.error('[award-grant] RPC error:', rpcErr.message);
      return new Response(JSON.stringify({ error: 'Failed to grant credits' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // PostHog
    try {
      const phKey = Deno.env.get('POSTHOG_API_KEY');
      if (phKey) {
        await fetch('https://app.posthog.com/capture/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: phKey,
            distinct_id: user_id,
            event: 'award_credits_granted',
            properties: { amount, source_ref, expires_at, granted_by: callerId ?? 'service' },
          }),
        });
      }
    } catch (_) {}

    return new Response(JSON.stringify({ success: true, balance }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[award-grant] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
