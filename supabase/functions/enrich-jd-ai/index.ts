// supabase/functions/enrich-jd-ai/index.ts
// AI-powered JD enrichment using Claude Haiku
// v2: Cron Cost Optimization Session 2
// Changes:
//   - Filters by enrichment_priority IN (1,2) only Tier 1+2 jobs
//   - Merges AI-content detection into enrichment prompt (replaces score-ai-content crons)
//   - Adds ai_content_score + ai_label to output
//   - max_tokens 350 -> 400 for additional AI detection fields
// Called by pg_cron #49 every 10 minutes

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withAnthropicBreaker } from "../_shared/anthropic.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BATCH_SIZE = 50
const CONCURRENCY = 5
const MAX_CONTENT_CHARS = 6000
const MODEL = 'claude-haiku-4-5-20251001'
const WALL_TIME_MS = 120_000

const SYSTEM_PROMPT = `Extract structured data from this job description. Return ONLY a JSON object:
{
  "skills": ["lowercase","skill","names"],
  "requirements": ["short qualification phrases"],
  "education": "bachelors",
  "seniority": "mid",
  "years_min": 3,
  "years_max": 5,
  "salary_min": 80000,
  "salary_max": 100000,
  "salary_currency": "USD",
  "salary_rate": "yr",
  "ai_content_score": 0.35,
  "ai_label": "human"
}
Rules: skills max 15 lowercase. seniority: intern/entry/junior/mid/senior/lead/principal/director/vp/executive or null. education: high_school/associates/bachelors/masters/phd/professional or null. salary_min/max: integer annual USD or null — convert hourly*2080, weekly*52, monthly*12. salary_rate: yr/hr/mo/wk or null. salary_currency: ISO code, USD only (null if non-USD). ai_content_score: 0.0-1.0 probability AI-generated. ai_label: human/mixed/ai_generated.
No markdown. JSON only.`

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim()
}

async function enrichJob(
  job: { greenhouse_id: string; title: string; content: string; jd_enrich_retry_count: number | null },
  apiKey: string,
  supabase: unknown
): Promise<{ ok: boolean; id: string; skills?: number }> {
  const plainText = stripHtml(job.content).substring(0, MAX_CONTENT_CHARS)

  if (plainText.length < 50) {
    await supabase.from('ats_jobs').update({
      jd_skills: [], jd_requirements: [], jd_education: null,
      jd_seniority: null, jd_years_min: null, jd_years_max: null,
      ai_content_score: null, ai_label: 'unknown',
    }).eq('greenhouse_id', job.greenhouse_id)
    return { ok: true, id: job.greenhouse_id, skills: 0 }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

        // BP-001: Circuit breaker
    const _br = await withAnthropicBreaker(supabase, 'enrich-jd-ai', async () => {
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
      if (response.status === 429) {
        console.warn(`Rate limited on ${job.greenhouse_id}`)
        return { ok: false, id: job.greenhouse_id }
      }
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

    const salaryMin = (typeof parsed.salary_min === 'number' && parsed.salary_min > 1000 && parsed.salary_min < 10000000) ? Math.round(parsed.salary_min) : null
    const salaryMax = (typeof parsed.salary_max === 'number' && parsed.salary_max > 1000 && parsed.salary_max < 10000000) ? Math.round(parsed.salary_max) : null
    const validRates = ['yr', 'hr', 'mo', 'wk']
    const salaryRate = validRates.includes(parsed.salary_rate) ? parsed.salary_rate : null

    const updateData: Record<string, unknown> = {
      jd_skills: skills,
      jd_requirements: requirements,
      jd_education: validEdu.includes(parsed.education) ? parsed.education : null,
      jd_seniority: validSen.includes(parsed.seniority) ? parsed.seniority : null,
      jd_years_min: Number.isInteger(parsed.years_min) && parsed.years_min >= 0 ? parsed.years_min : null,
      jd_years_max: Number.isInteger(parsed.years_max) && parsed.years_max >= 0 ? parsed.years_max : null,
      ai_content_score: aiScore,
      ai_label: aiLabel,
    }
    if (salaryMin !== null) updateData.salary_min = salaryMin
    if (salaryMax !== null) updateData.salary_max = salaryMax
    if (salaryRate !== null) updateData.salary_rate = salaryRate
    if (salaryMin !== null || salaryMax !== null) {
      updateData.salary_currency = (typeof parsed.salary_currency === 'string' && parsed.salary_currency.length <= 5) ? parsed.salary_currency : 'USD'
    }

    const { error } = await supabase
      .from('ats_jobs')
      .update(updateData)
      .eq('greenhouse_id', job.greenhouse_id)

    if (error) throw error

    // CRON-COST-OPT: Persist discovered skills to job_skills_dictionary.
    // Skills survive even when the job expires/archives. Upsert = no duplicates.
    if (skills.length > 0) {
      try {
        const skillRows = skills.map((s: string) => ({
          skill: s.toLowerCase().trim(),
          category: 'auto_extracted',
          aliases: [],
          is_ambiguous: false,
          min_context_words: 0,
        }));
        await supabase.from('job_skills_dictionary')
          .upsert(skillRows, { onConflict: 'skill', ignoreDuplicates: true });
      } catch (_) { /* non-fatal — dictionary population is best-effort */ }
    }

    return { ok: true, id: job.greenhouse_id, skills: skills.length }

  } catch (e) {
    console.error(`Failed ${job.greenhouse_id}:`, e.message)
    if (!e.message?.includes('429')) {
      // FA-002: Increment retry count on non-rate-limit failures
      // Jobs with jd_enrich_retry_count >= 3 are skipped by enrichment pipeline
      const currentRetry = typeof job.jd_enrich_retry_count === 'number' ? job.jd_enrich_retry_count : 0;
      await (supabase as any).from('ats_jobs').update({
        jd_skills: [], jd_requirements: [],
        jd_enrich_retry_count: currentRetry + 1,
      }).eq('greenhouse_id', job.greenhouse_id)
    }
    return { ok: false, id: job.greenhouse_id }
  }
}

async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  let idx = 0

  async function worker() {
    while (idx < items.length) {
      const i = idx++
      results[i] = await fn(items[i])
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

    // v2: Only enrich Tier 1 (user-relevant) and Tier 2 (high-value) jobs
    // Tier 3 (on-demand) jobs use the enrich-job-ondemand endpoint
    // FA-002: Skip jobs with 3+ retry failures
    const { data: jobs, error: fetchError } = await supabase
      .from('ats_jobs')
      .select('greenhouse_id, title, content, jd_enrich_retry_count')
      .not('content', 'is', null)
      .is('jd_skills', null)
      .eq('status', 'open')
      .not('jd_extracted_at', 'is', null)
      .in('enrichment_priority', [1, 2])
      .lt('jd_enrich_retry_count', 3)
      .order('enrichment_priority', { ascending: true })
      .order('jd_extracted_at', { ascending: true })
      .limit(BATCH_SIZE)

    if (fetchError) throw fetchError
    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: 'No Tier 1/2 jobs in enrichment queue' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results = await processWithConcurrency(jobs, CONCURRENCY, (job) => enrichJob(job, apiKey, supabase))

    const processed = results.filter(r => r.ok).length
    const errors = results.filter(r => !r.ok).length
    const elapsed = Date.now() - startTime

    // FA-002: Query enrichment queue depth for monitoring
    const { data: queueData } = await supabase
      .from('ats_jobs')
      .select('greenhouse_id', { count: 'exact', head: true })
      .not('content', 'is', null)
      .is('jd_skills', null)
      .eq('status', 'open')
      .not('jd_extracted_at', 'is', null)
      .in('enrichment_priority', [1, 2])
      .lt('jd_enrich_retry_count', 3)

    const queueRemaining = queueData?.length ?? 0
    const failureRate = jobs.length > 0 ? Math.round(errors / jobs.length * 100) : 0

    // FA-002: Log enrichment batch to hygiene_log for monitoring
    try {
      await supabase.from('hygiene_log').insert({
        check_name: 'jd_enrichment_batch',
        status: failureRate > 10 ? 'warning' : 'ok',
        details: {
          batch_size: jobs.length,
          success_count: processed,
          error_count: errors,
          queue_remaining: queueRemaining,
          failure_rate_pct: failureRate,
          elapsed_ms: elapsed,
        }
      })
    } catch (logErr) {
      console.warn('[enrich-jd-ai] hygiene_log insert failed:', logErr.message)
    }

    // EDE-001: Update enrichment_requests progress for any active requests
    if (processed > 0) {
      try {
        await supabase.rpc('fn_update_enrichment_progress', { p_increment: processed })
      } catch (erErr) {
        console.warn('[enrich-jd-ai] enrichment_requests progress update failed:', erErr)
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        errors,
        batch_size: jobs.length,
        elapsed_ms: elapsed,
        rate: Math.round(processed / (elapsed / 1000) * 60) + '/min',
        queue_remaining: queueRemaining,
        failure_rate_pct: failureRate,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('Fatal:', e)
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
