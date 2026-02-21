// supabase/functions/enrich-job/index.ts
// Enriches ats_jobs with content, salary, and status data.
// Called by client when:
//   1. Job description fetched from ATS API (content + salary extraction)
//   2. Dead job detected (status = 'closed')

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

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
