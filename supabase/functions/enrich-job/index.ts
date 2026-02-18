// supabase/functions/enrich-job/index.ts
// Replaces 8 client-side writes to ats_jobs that will break after RLS fix
// Client POSTs job_id + enrichment data, function validates and writes with service_role
//
// Accepts two enrichment types:
//   1. content: HTML job description from ATS API
//   2. salary: parsed salary data (min, max, raw, currency, rate)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { job_id, content, salary } = body

    // Validate required field
    if (!job_id || typeof job_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'job_id is required and must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Must have at least one enrichment type
    if (!content && !salary) {
      return new Response(
        JSON.stringify({ error: 'Must provide content and/or salary data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build update payload
    const updateData: Record<string, any> = {}

    if (content && typeof content === 'string') {
      // Cap content at 50KB to prevent abuse
      updateData.content = content.substring(0, 50000)
    }

    if (salary && typeof salary === 'object') {
      if (salary.min && typeof salary.min === 'number') updateData.salary_min = salary.min
      if (salary.max && typeof salary.max === 'number') updateData.salary_max = salary.max
      if (salary.raw && typeof salary.raw === 'string') updateData.salary_raw = salary.raw.substring(0, 500)
      if (salary.currency && typeof salary.currency === 'string') updateData.salary_currency = salary.currency.substring(0, 5)
      if (salary.rate && typeof salary.rate === 'string') updateData.salary_rate = salary.rate.substring(0, 10)
    }

    if (Object.keys(updateData).length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid enrichment data provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use service_role to write (bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Update the job — only if it exists (no upsert, no insert)
    const { error } = await supabase
      .from('ats_jobs')
      .update(updateData)
      .eq('greenhouse_id', job_id)

    if (error) {
      console.error('Enrich-job update failed:', error)
      return new Response(
        JSON.stringify({ error: 'Update failed', details: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, job_id, fields: Object.keys(updateData) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Enrich-job error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
