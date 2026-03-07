// supabase/functions/enrich-job/index.ts
// Enriches ats_jobs with content, salary, and status data.
// Called by client when:
//   1. Job description fetched from ATS API (content + salary extraction)
//   2. Dead job detected (status = 'closed')

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { API_VERSION } from '../_shared/api-version.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CS-002: CORS restricted to brilliantjobs.app (was: wildcard *)
const ALLOWED_ORIGINS = [
  'https://brilliantjobs.app',
  'https://www.brilliantjobs.app',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    // CS-002: JWT verification — require valid Authorization header (SE-001)
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const bearerToken = authHeader.replace('Bearer ', '');

    // Allow service_role JWT passthrough (cron / server-side calls)
    let isServiceRole = false;
    try {
      const payload = JSON.parse(atob(bearerToken.split('.')[1]));
      isServiceRole = payload.role === 'service_role';
    } catch { /* not a valid JWT — will fail user auth below */ }

    const supabaseAdmin = createClient(SB_URL, SB_SERVICE_KEY);

    if (!isServiceRole) {
      // Verify user JWT
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(bearerToken);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid or expired token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // CS-015: CE-001 — Rate limit: 60 calls/hour per user
    try {
      const callerId = isServiceRole ? 'service_role' : bearerToken.split('.')[1]?.substring(0, 20) || 'unknown';
      const { data: allowed } = await supabaseAdmin.rpc('check_ef_rate_limit', {
        p_function_name: 'enrich-job',
        p_caller_id: callerId,
        p_max_calls: 60,
        p_window_minutes: 60,
      });
      if (allowed === false) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Max 60 calls per hour.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json',
  'x-api-version': API_VERSION, 'Retry-After': '3600' } }
        );
      }
    } catch (e) {
      console.warn('[enrich-job] Rate limit check failed:', e.message);
    }

    const body = await req.json()
    const { job_id, content, salary, status } = body

    if (!job_id || typeof job_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'job_id is required and must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!content && !salary && !status) {
      return new Response(
        JSON.stringify({ error: 'Must provide content, salary, and/or status data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const updateData: Record<string, any> = {}

    if (content && typeof content === 'string') {
      updateData.content = content.substring(0, 50000)
    }

    if (salary && typeof salary === 'object') {
      if (salary.min && typeof salary.min === 'number') updateData.salary_min = salary.min
      if (salary.max && typeof salary.max === 'number') updateData.salary_max = salary.max
      if (salary.raw && typeof salary.raw === 'string') updateData.salary_raw = salary.raw.substring(0, 500)
      if (salary.currency && typeof salary.currency === 'string') updateData.salary_currency = salary.currency.substring(0, 5)
      if (salary.rate && typeof salary.rate === 'string') updateData.salary_rate = salary.rate.substring(0, 10)
    }

    // Status update — only allow specific transitions
    if (status && typeof status === 'string') {
      const allowedStatuses = ['open', 'closed']
      if (allowedStatuses.includes(status)) {
        updateData.status = status
        // Record when the job was detected as closed
        if (status === 'closed') {
          updateData.closed_at = new Date().toISOString()
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid enrichment data provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Reuse the admin client created during auth verification
    const supabase = supabaseAdmin;

    const { error } = await supabase
      .from('ats_jobs')
      .update(updateData)
      .eq('greenhouse_id', job_id)

    if (error) {
      console.error('Update failed:', error)
      return new Response(
        JSON.stringify({ error: 'Database update failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ ok: true, updated: Object.keys(updateData) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('Error:', e)
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
