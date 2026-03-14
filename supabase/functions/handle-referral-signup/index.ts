// supabase/functions/handle-referral-signup/index.ts
// FB-TRIAL-001-S4 Part 1: Referral Signup Attribution
//
// Actions:
//   signup  — validates referral_code, blocks self-referral, sets referred_by (immutable),
//             inserts trial_referrals row (status='signed_up'), fires referral-lifecycle notification
//   status  — returns trial_referrals entry for the authenticated (referred) user
//
// The landing page captures referral_code into sessionStorage/cookie.
// processReferralAttribution in app.js calls process_referral_attribution RPC for the DB write.
// This EF wraps that flow with: validation, self-referral block, PostHog, and lifecycle notification.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const POSTHOG_KEY = Deno.env.get('POSTHOG_API_KEY') || '';
const POSTHOG_HOST = Deno.env.get('POSTHOG_HOST') || 'https://app.posthog.com';

const CORS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function capturePostHog(distinctId: string, event: string, props: Record<string, unknown>) {
  if (!POSTHOG_KEY) return;
  try {
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: POSTHOG_KEY, distinct_id: distinctId, event, properties: props }),
    });
  } catch (_) { /* fire-and-forget */ }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Auth required
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const token = authHeader.slice(7);

  const sb = createClient(SB_URL, SB_KEY);
  const sbUser = createClient(SB_URL, Deno.env.get('SUPABASE_ANON_KEY') || SB_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // Verify auth
  const { data: { user }, error: authErr } = await sbUser.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { return json({ error: 'Invalid JSON' }, 400); }

  const action = (body.action as string) || 'signup';

  // ── ACTION: status ──
  if (action === 'status') {
    const { data: referral } = await sb
      .from('trial_referrals')
      .select('id, referrer_id, status, referred_signup_at, referred_converted_at')
      .eq('referred_id', user.id)
      .single();

    return json({ referral: referral || null });
  }

  // ── ACTION: signup ──
  if (action !== 'signup') return json({ error: 'Invalid action' }, 400);

  const referralCode = body.referral_code as string;
  if (!referralCode) return json({ error: 'referral_code required' }, 400);

  // Look up referrer by referral_code
  const { data: referrer, error: referrerErr } = await sb
    .from('profiles')
    .select('id, referral_code, referral_code_generated_at')
    .eq('referral_code', referralCode)
    .single();

  if (referrerErr || !referrer) {
    return json({ error: 'Invalid referral code' }, 400);
  }

  // Block self-referral by user ID
  if (referrer.id === user.id) {
    return json({ error: 'Self-referral not allowed' }, 400);
  }

  // Email cross-check self-referral
  const { data: referrerAuth } = await sb.auth.admin.getUserById(referrer.id);
  const referrerEmail = referrerAuth?.user?.email;
  const referredEmail = user.email;
  if (referrerEmail && referredEmail && referrerEmail.toLowerCase() === referredEmail.toLowerCase()) {
    return json({ error: 'Self-referral not allowed' }, 400);
  }

  // Check code expiry (90 days)
  if (referrer.referral_code_generated_at) {
    const generated = new Date(referrer.referral_code_generated_at);
    const now = new Date();
    const daysDiff = (now.getTime() - generated.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > 90) {
      return json({ error: 'Referral code has expired' }, 400);
    }
  }

  // Check if referred_by is already set (immutable once set)
  const { data: referredProfile } = await sb
    .from('profiles')
    .select('referred_by')
    .eq('id', user.id)
    .single();

  if (referredProfile?.referred_by) {
    return json({ error: 'User has already been referred', already_attributed: true });
  }

  // Set referred_by on referred user's profile (immutable from this point)
  const { error: updateErr } = await sb
    .from('profiles')
    .update({ referred_by: referrer.id })
    .eq('id', user.id)
    .is('referred_by', null); // Guard: only set if currently null

  if (updateErr) {
    return json({ error: 'Failed to set referral attribution', detail: updateErr.message }, 500);
  }

  // Insert trial_referrals row
  const { data: trialRef, error: insertErr } = await sb
    .from('trial_referrals')
    .insert({
      referrer_id: referrer.id,
      referred_id: user.id,
      referral_code: referralCode,
      status: 'signed_up',
      referred_signup_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertErr) {
    // Non-fatal — profile already attributed, just log
    console.warn('[handle-referral-signup] Failed to insert trial_referrals row:', insertErr.message);
  }

  // Fire referral-lifecycle for status tracking (updates referrals table, handles nudge logic)
  try {
    await sb.functions.invoke('referral-lifecycle', {
      body: {
        type: 'referee_signup',
        user_id: referrer.id,
        referral_id: trialRef?.id || null,
        referee_id: user.id,
        metadata: { referral_code: referralCode },
      },
    });
  } catch (e) {
    console.warn('[handle-referral-signup] referral-lifecycle notification failed:', String(e));
  }

  // FB-TRIAL-001-S5: Fire dedicated referral_signup email via send-trial-notifications
  // referral-lifecycle fires referral_status_update (generic); this fires the dedicated
  // referral_signup_notify template with the correct copy per Section 7.4.
  try {
    await sb.functions.invoke('send-trial-notifications', {
      body: {
        action: 'referral_signup',
        referrer_id: referrer.id,
        referred_id: user.id,
      },
    });
  } catch (e) {
    // Non-fatal — status tracking already completed above
    console.warn('[handle-referral-signup] send-trial-notifications referral_signup failed:', String(e));
  }

  // PostHog events
  await capturePostHog(user.id, 'referral_signup', {
    referrer_id: referrer.id,
    referral_code: referralCode,
    referred_id: user.id,
    surface: 'handle_referral_signup',
  });
  await capturePostHog(referrer.id, 'referral_signup_received', {
    referred_id: user.id,
    referral_code: referralCode,
    surface: 'handle_referral_signup',
  });

  return json({
    success: true,
    referral_id: trialRef?.id || null,
    referrer_id: referrer.id,
    status: 'signed_up',
  });
});
