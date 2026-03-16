// supabase/functions/enrich-job-ondemand/index.ts
// On-demand JD enrichment for Tier 3 (low-priority) jobs
// Called when a user views a job detail for an un-enriched Tier 3 job
// Uses same enrichment logic as enrich-jd-ai but processes a single job
// Cron Cost Optimization Step 10

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withAnthropicBreaker } from "../_shared/anthropic.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_CONTENT_CHARS = 6000
const MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM_PROMPT = `Extract structured data from this job description. Return ONLY a JSON object:
{
  "skills": ["lowercase","skill","names"], // max 15, specific technical/professional skills only
  "requirements": ["short qualification phrases"], // max 8
  "education": "bachelors", // one of: high_school, associates, bachelors, masters, phd, professional, or null
  "seniority": "mid", // one of: intern, entry, junior, mid, senior, lead, principal, director, vp, executive, or null
  "years_min": 3, // integer or null
  "years_max": 5, // integer or null
  "ai_content_score": 0.35, // float 0.0-1.0: probability this JD was AI-generated (0=human, 1=AI)
  "ai_label": "human" // one of: human (<0.3), mixed (0.3-0.7), ai_generated (>0.7)
}
AI detection signals: uniform sentence length, lack of specific details, generic qualifications, formulaic structure, absence of company voice/personality, overuse of buzzwords without substance.
No markdown. No explanation. JSON only.`

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim()
}

// Helper: enrich a single job and persist skills to dictionary
async function enrichSingleJob(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  job: { greenhouse_id: string; title: string; content: string | null },
): Promise<{ ok: boolean }> {
  if (!job.content) return { ok: false }
  const plainText = stripHtml(job.content).substring(0, MAX_CONTENT_CHARS)
  if (plainText.length < 50) {
    await supabase.from('ats_jobs').update({ jd_skills: [], jd_requirements: [] }).eq('greenhouse_id', job.greenhouse_id)
    return { ok: false }
  }

  const _br = await withAnthropicBreaker(supabase, 'enrich-job-ondemand', async () => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 400, temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Title: ${job.title}\n\n${plainText}` }],
      }),
    })
    if (!r.ok) { if (r.status === 402) throw new Error('402 credits exhausted'); throw new Error(`Anthropic ${r.status}`); }
    return r.json()
  }, { model: MODEL })
  if (_br.circuitOpen || !_br.result) return { ok: false }

  const parsed = (() => {
    try {
      const text = (_br.result as Record<string, unknown>).content?.[0]?.text || '{}'
      return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
    } catch { return {} }
  })()

  const skills = Array.isArray(parsed.skills) ? parsed.skills.filter((s: unknown) => typeof s === 'string').map((s: string) => s.toLowerCase()).slice(0, 15) : []
  const requirements = Array.isArray(parsed.requirements) ? parsed.requirements.filter((r: unknown) => typeof r === 'string').slice(0, 8) : []
  const validEdu = ['high_school', 'associates', 'bachelors', 'masters', 'phd', 'professional']
  const validSen = ['intern', 'entry', 'junior', 'mid', 'senior', 'lead', 'principal', 'director', 'vp', 'executive']
  const rawAiScore = typeof parsed.ai_content_score === 'number' ? parsed.ai_content_score : null
  const aiScore = rawAiScore !== null ? Math.max(0, Math.min(1, rawAiScore)) : null

  await supabase.from('ats_jobs').update({
    jd_skills: skills, jd_requirements: requirements,
    jd_education: validEdu.includes(parsed.education) ? parsed.education : null,
    jd_seniority: validSen.includes(parsed.seniority) ? parsed.seniority : null,
    jd_years_min: Number.isInteger(parsed.years_min) && parsed.years_min >= 0 ? parsed.years_min : null,
    jd_years_max: Number.isInteger(parsed.years_max) && parsed.years_max >= 0 ? parsed.years_max : null,
    ai_content_score: aiScore,
    ai_label: aiScore !== null ? (aiScore < 0.3 ? 'human' : aiScore > 0.7 ? 'ai_generated' : 'mixed') : null,
  }).eq('greenhouse_id', job.greenhouse_id)

  // Persist skills to dictionary (best-effort)
  if (skills.length > 0) {
    try {
      await supabase.from('job_skills_dictionary')
        .upsert(skills.map((s: string) => ({ skill: s, category: 'auto_extracted', aliases: [], is_ambiguous: false, min_context_words: 0 })),
          { onConflict: 'skill', ignoreDuplicates: true })
    } catch (_) { /* non-fatal */ }
  }

  return { ok: true }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { greenhouse_id, trigger, user_id, filter_id } = body

    // Validate trigger type
    const validTriggers = ['job_view', 'filter_save', 'onboarding']
    const triggerType = trigger || (greenhouse_id ? 'job_view' : null)
    if (!triggerType || !validTriggers.includes(triggerType)) {
      return new Response(
        JSON.stringify({ error: 'trigger required: job_view | filter_save | onboarding' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

    // ── T1/T2: Batch enrichment for filter_save / onboarding ─────────
    if (triggerType === 'filter_save' || triggerType === 'onboarding') {
      if (!user_id) {
        return new Response(
          JSON.stringify({ error: 'user_id required for filter_save/onboarding triggers' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Daily per-user cap: max 100 enrichments/day
      const { count: todayCount } = await supabase.from('ai_usage_log')
        .select('*', { count: 'exact', head: true })
        .eq('caller_ef', 'enrich-job-ondemand')
        .eq('user_id', user_id)
        .gte('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString())
      if ((todayCount || 0) >= 100) {
        return new Response(
          JSON.stringify({ ok: false, error: 'daily_enrichment_cap', enriched: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Get user's filter to find matching unenriched jobs
      let filterKeywords: string[] = []
      if (filter_id) {
        const { data: filter } = await supabase.from('user_filters')
          .select('filter_data').eq('id', filter_id).single()
        const fd = filter?.filter_data as Record<string, unknown> | undefined
        const pills = (fd?.whatPills || fd?.pills || []) as Array<{ values?: string[] }>
        filterKeywords = pills.flatMap(p => p.values || [])
      }
      if (filterKeywords.length === 0 && triggerType === 'onboarding') {
        // For onboarding, use first filter's keywords
        const { data: filters } = await supabase.from('user_filters')
          .select('filter_data').eq('user_id', user_id).order('sort_order').limit(1)
        if (filters?.[0]) {
          const fd = filters[0].filter_data as Record<string, unknown>
          const pills = (fd?.whatPills || fd?.pills || []) as Array<{ values?: string[] }>
          filterKeywords = pills.flatMap(p => p.values || [])
        }
      }

      if (filterKeywords.length === 0) {
        return new Response(
          JSON.stringify({ ok: true, enriched: 0, reason: 'no_keywords' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Find unenriched jobs matching keywords (max 25)
      const MAX_BATCH = 25
      const titlePattern = filterKeywords.map(k => `%${k}%`).join(',')
      let query = supabase.from('ats_jobs')
        .select('greenhouse_id, title, content')
        .eq('status', 'open')
        .is('jd_skills', null)
        .limit(MAX_BATCH)
      // Match any keyword in title
      const orClauses = filterKeywords.map(k => `title.ilike.%${k}%`).join(',')
      query = query.or(orClauses)

      const { data: jobs } = await query
      if (!jobs || jobs.length === 0) {
        return new Response(
          JSON.stringify({ ok: true, enriched: 0, reason: 'all_enriched' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Enrich each job (sequentially to avoid rate limits)
      let enriched = 0
      for (const job of jobs) {
        try {
          const result = await enrichSingleJob(supabase, apiKey, job)
          if (result.ok) enriched++
        } catch (_) { /* continue on individual failure */ }
      }

      return new Response(
        JSON.stringify({ ok: true, trigger: triggerType, enriched, total: jobs.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── T3: Single job enrichment (job_view) ─────────────────────────
    if (!greenhouse_id) {
      return new Response(
        JSON.stringify({ error: 'greenhouse_id required for job_view trigger' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: job, error: fetchError } = await supabase
      .from('ats_jobs')
      .select('greenhouse_id, title, content, jd_skills')
      .eq('greenhouse_id', greenhouse_id)
      .single()

    if (fetchError || !job) {
      return new Response(
        JSON.stringify({ error: 'Job not found', greenhouse_id }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Already enriched - return cached
    if (job.jd_skills !== null) {
      return new Response(
        JSON.stringify({ ok: true, cached: true, greenhouse_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!job.content) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'no_content', greenhouse_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const plainText = stripHtml(job.content).substring(0, MAX_CONTENT_CHARS)

    if (plainText.length < 50) {
      await supabase.from('ats_jobs').update({
        jd_skills: [], jd_requirements: [], jd_education: null,
        jd_seniority: null, jd_years_min: null, jd_years_max: null,
        ai_content_score: null, ai_label: 'unknown',
      }).eq('greenhouse_id', greenhouse_id)
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'too_short', greenhouse_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)

        // BP-001: Circuit breaker
    const _br = await withAnthropicBreaker(supabase, 'enrich-job-ondemand', async () => {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Title: ${job.title}\n\n${plainText}` }],
      }),
    })

    ;
      if (!r.ok) throw new Error(`Anthropic ${r.status}`);
      return r;
    });
    if (_br.circuitOpen) throw new Error('Circuit breaker open');
    if (!_br.result) throw new Error(_br.error || 'Anthropic call failed');
    const response = _br.result;clearTimeout(timeout)

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`API ${response.status}: ${errText.substring(0, 200)}`)
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || '{}'
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean)

    const skills = Array.isArray(parsed.skills) ? parsed.skills.filter((s: Record<string, unknown>) => typeof s === 'string').map((s: string) => s.toLowerCase()).slice(0, 15) : []
    const requirements = Array.isArray(parsed.requirements) ? parsed.requirements.filter((r: Record<string, unknown>) => typeof r === 'string').slice(0, 8) : []
    const validEdu = ['high_school', 'associates', 'bachelors', 'masters', 'phd', 'professional']
    const validSen = ['intern', 'entry', 'junior', 'mid', 'senior', 'lead', 'principal', 'director', 'vp', 'executive']
    const validAiLabel = ['human', 'mixed', 'ai_generated']

    const rawAiScore = typeof parsed.ai_content_score === 'number' ? parsed.ai_content_score : null
    const aiScore = rawAiScore !== null ? Math.max(0, Math.min(1, rawAiScore)) : null
    const aiLabel = validAiLabel.includes(parsed.ai_label) ? parsed.ai_label : (
      aiScore !== null ? (aiScore < 0.3 ? 'human' : aiScore > 0.7 ? 'ai_generated' : 'mixed') : null
    )

    const updateData = {
      jd_skills: skills,
      jd_requirements: requirements,
      jd_education: validEdu.includes(parsed.education) ? parsed.education : null,
      jd_seniority: validSen.includes(parsed.seniority) ? parsed.seniority : null,
      jd_years_min: Number.isInteger(parsed.years_min) && parsed.years_min >= 0 ? parsed.years_min : null,
      jd_years_max: Number.isInteger(parsed.years_max) && parsed.years_max >= 0 ? parsed.years_max : null,
      ai_content_score: aiScore,
      ai_label: aiLabel,
    }

    const { error: updateError } = await supabase
      .from('ats_jobs')
      .update(updateData)
      .eq('greenhouse_id', greenhouse_id)

    if (updateError) throw updateError

    // Persist skills to dictionary (best-effort)
    if (skills.length > 0) {
      try {
        await supabase.from('job_skills_dictionary')
          .upsert(skills.map((s: string) => ({ skill: s, category: 'auto_extracted', aliases: [], is_ambiguous: false, min_context_words: 0 })),
            { onConflict: 'skill', ignoreDuplicates: true })
      } catch (_) { /* non-fatal */ }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        cached: false,
        greenhouse_id,
        skills: skills.length,
        seniority: updateData.jd_seniority,
        ai_label: aiLabel,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    console.error('On-demand enrichment failed:', e)
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
