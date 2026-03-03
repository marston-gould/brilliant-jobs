// supabase/functions/enrich-job-ondemand/index.ts
// On-demand JD enrichment for Tier 3 (low-priority) jobs
// Called when a user views a job detail for an un-enriched Tier 3 job
// Uses same enrichment logic as enrich-jd-ai but processes a single job
// Cron Cost Optimization Step 10

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { greenhouse_id } = await req.json()
    if (!greenhouse_id) {
      return new Response(
        JSON.stringify({ error: 'greenhouse_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
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

    clearTimeout(timeout)

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`API ${response.status}: ${errText.substring(0, 200)}`)
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || '{}'
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean)

    const skills = Array.isArray(parsed.skills) ? parsed.skills.filter((s: any) => typeof s === 'string').map((s: string) => s.toLowerCase()).slice(0, 15) : []
    const requirements = Array.isArray(parsed.requirements) ? parsed.requirements.filter((r: any) => typeof r === 'string').slice(0, 8) : []
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
