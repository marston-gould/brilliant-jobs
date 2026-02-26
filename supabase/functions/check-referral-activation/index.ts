// supabase/functions/check-referral-activation/index.ts
// Edge Function: Called after key user actions (filter save, search, profile complete)
// Checks activation gate → if passed and user was referred → triggers reward processing

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const sb = createClient(SB_URL, SB_KEY);
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Check activation gate via RPC
    const { data: gateResult, error: gateErr } = await sb.rpc('check_referral_activation', {
      p_user_id: user_id,
    });

    if (gateErr) {
      return new Response(JSON.stringify({ error: gateErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Already activated or not referred — return gate status
    if (gateResult?.already_activated || !gateResult?.just_activated) {
      return new Response(JSON.stringify(gateResult), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Just activated! Find the referral and trigger reward processing
    const { data: referral } = await sb
      .from('referrals')
      .select('id')
      .eq('referred_id', user_id)
      .eq('status', 'activated')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!referral) {
      return new Response(JSON.stringify({
        ...gateResult,
        reward_status: 'no_referral_found',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Call the reward processing Edge Function
    const rewardRes = await fetch(`${SB_URL}/functions/v1/process-referral-reward`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ referral_id: referral.id }),
    });

    const rewardResult = await rewardRes.json();

    return new Response(JSON.stringify({
      ...gateResult,
      reward_result: rewardResult,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
