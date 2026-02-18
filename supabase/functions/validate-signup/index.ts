// supabase/functions/validate-signup/index.ts
// Deploy: supabase functions deploy validate-signup --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── CONFIG ───
const MAX_SECONDS_NORMAL = 120    // Under 2 min = pass
const MAX_SECONDS_GENEROUS = 300  // Under 5 min = borderline, over = flag
const NAME_MATCH_THRESHOLD = 0.5  // At least half the name tokens must match

// Test profiles that bypass LinkedIn fetch (temporary)
const TEST_PROFILES = [
  'https://www.linkedin.com/in/testprofile1',
  'https://www.linkedin.com/in/testprofile2',
  'https://www.linkedin.com/in/testprofile3',
  'https://linkedin.com/in/testprofile1',
  'https://linkedin.com/in/testprofile2',
  'https://linkedin.com/in/testprofile3',
]

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { profile_id } = await req.json()

    if (!profile_id) {
      return new Response(
        JSON.stringify({ error: 'profile_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use service role to read/write profiles
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Read profile
    const { data: profile, error: fetchErr } = await supabase
      .from('profiles')
      .select('id, full_name, linkedin_url, signup_elapsed_seconds, approved')
      .eq('id', profile_id)
      .single()

    if (fetchErr || !profile) {
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Already approved? Skip.
    if (profile.approved === true) {
      return new Response(
        JSON.stringify({ approved: true, message: 'Already approved' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result: Record<string, any> = {
      checks: {},
      approved: false,
      reason: '',
    }

    // ─── CHECK 0: Test profile bypass ───
    const liUrl = (profile.linkedin_url || '').trim().replace(/\/$/, '')
    if (TEST_PROFILES.includes(liUrl.toLowerCase())) {
      result.approved = true
      result.reason = 'Test profile — auto-approved'
      result.checks.test_profile = true
      await updateProfile(supabase, profile_id, true, result)
      return respond(result)
    }

    // ─── CHECK 1: LinkedIn URL format ───
    const urlValid = /^https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%]+\/?$/.test(liUrl)
    result.checks.url_format = urlValid

    if (!urlValid) {
      result.reason = 'Invalid LinkedIn URL format'
      await updateProfile(supabase, profile_id, false, result)
      return respond(result)
    }

    // ─── CHECK 1b: LinkedIn URL uniqueness ───
    const { data: existing } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('linkedin_url', profile.linkedin_url)
      .neq('id', profile_id)
      .limit(1)

    if (existing && existing.length > 0) {
      result.reason = 'LinkedIn profile already registered to another account'
      result.checks.duplicate_linkedin = true
      result.checks.existing_email_hint = existing[0].email.replace(/(.{2}).*(@.*)/, '$1***$2')
      await updateProfile(supabase, profile_id, false, result)
      return respond(result)
    }

    // ─── CHECK 2: Timing ───
    const elapsed = profile.signup_elapsed_seconds || 0
    const timingOk = elapsed > 0 && elapsed <= MAX_SECONDS_NORMAL
    const timingBorderline = elapsed > MAX_SECONDS_NORMAL && elapsed <= MAX_SECONDS_GENEROUS
    const timingSuspicious = elapsed > MAX_SECONDS_GENEROUS || elapsed === 0
    result.checks.elapsed_seconds = elapsed
    result.checks.timing = timingSuspicious ? 'suspicious' : timingBorderline ? 'borderline' : 'normal'

    // ─── CHECK 3: Fetch LinkedIn and match name ───
    let linkedinName = ''
    let fetchSuccess = false

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)

      const res = await fetch(liUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
        redirect: 'follow',
      })

      clearTimeout(timeout)

      if (res.ok) {
        const html = await res.text()

        // Try <title> tag: "Jane Smith - Director at Stripe | LinkedIn"
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
        if (titleMatch) {
          const titleText = titleMatch[1]
          linkedinName = titleText
            .split(/\s+[-\u2013|]\s+/)[0]
            .replace(/\s*\(.*?\)\s*/g, '')
            .trim()
        }

        // Fallback: og:title meta tag
        if (!linkedinName) {
          const ogMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
          if (ogMatch) {
            linkedinName = ogMatch[1].split(/\s+[-\u2013|]\s+/)[0].trim()
          }
        }

        fetchSuccess = true
      }

      result.checks.linkedin_fetch = fetchSuccess
      result.checks.linkedin_name = linkedinName || null

    } catch (e) {
      result.checks.linkedin_fetch = false
      result.checks.linkedin_error = e.message
    }

    // ─── Name matching ───
    const formName = (profile.full_name || '').trim()
    let nameMatch = false

    if (linkedinName && formName) {
      nameMatch = fuzzyNameMatch(formName, linkedinName)
    }

    result.checks.name_match = nameMatch
    result.checks.form_name = formName
    result.checks.linkedin_name_parsed = linkedinName

    // ─── DECISION ───
    if (nameMatch && !timingSuspicious) {
      result.approved = true
      result.reason = 'Auto-approved: name match + normal timing'
      await updateProfile(supabase, profile_id, true, result)

    } else if (nameMatch && timingBorderline) {
      result.approved = true
      result.reason = 'Auto-approved: name match, borderline timing'
      await updateProfile(supabase, profile_id, true, result)

    } else if (!fetchSuccess) {
      result.reason = 'LinkedIn fetch failed — cannot verify name'
      await updateProfile(supabase, profile_id, false, result)

    } else if (!nameMatch && fetchSuccess) {
      result.reason = 'Name mismatch between form and LinkedIn profile'
      await updateProfile(supabase, profile_id, false, result)

    } else if (timingSuspicious) {
      result.reason = 'Suspicious timing: ' + elapsed + 's to complete form'
      await updateProfile(supabase, profile_id, false, result)

    } else {
      result.reason = 'Could not determine approval — manual review needed'
      await updateProfile(supabase, profile_id, false, result)
    }

    return respond(result)

  } catch (e) {
    console.error('validate-signup error:', e)
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})


// ─── HELPERS ───

async function updateProfile(
  supabase: any,
  profileId: string,
  approved: boolean,
  validationResult: Record<string, any>
) {
  const update: Record<string, any> = {
    validation_result: validationResult,
    approved: approved,
  }
  if (approved) {
    update.approved_at = new Date().toISOString()
  }
  await supabase
    .from('profiles')
    .update(update)
    .eq('id', profileId)
}

function respond(result: Record<string, any>) {
  return new Response(
    JSON.stringify(result),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

function fuzzyNameMatch(formName: string, linkedinName: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter(t => t.length > 1)

  const formTokens = normalize(formName)
  const liTokens = normalize(linkedinName)

  if (formTokens.length === 0 || liTokens.length === 0) return false

  let matches = 0
  for (const ft of formTokens) {
    for (const lt of liTokens) {
      if (ft === lt || lt.startsWith(ft) || ft.startsWith(lt)) {
        matches++
        break
      }
    }
  }

  const firstMatch = liTokens.some(lt =>
    lt === formTokens[0] || lt.startsWith(formTokens[0]) || formTokens[0].startsWith(lt)
  )
  const lastMatch = formTokens.length > 1 && liTokens.some(lt =>
    lt === formTokens[formTokens.length - 1] ||
    lt.startsWith(formTokens[formTokens.length - 1]) ||
    formTokens[formTokens.length - 1].startsWith(lt)
  )

  const ratioOk = matches / formTokens.length >= NAME_MATCH_THRESHOLD

  return (firstMatch && lastMatch) || (ratioOk && matches >= 2)
}
