// supabase/functions/validate-signup/index.ts
// Deploy: supabase functions deploy validate-signup --no-verify-jwt
// v6.76 — Added competitor employer blocklist + DataForSEO SERP profile verification

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fetchWithRetry, TIMEOUT_CONFIGS } from '../_shared/resilience.ts'
import { API_VERSION } from '../_shared/api-version.ts';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const ALLOWED_ORIGINS = [
  'https://brilliantjobs.app',
  'https://www.brilliantjobs.app',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, apikey',
  };
}

// ─── RATE LIMITING ───
// In-memory store (resets on cold start — acceptable for signup validation)
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5; // 5 signup validations per IP per hour

function cleanRateLimits() {
  const now = Date.now();
  for (const [k, v] of rateLimitMap) {
    if (now - v.windowStart > RATE_LIMIT_WINDOW) rateLimitMap.delete(k);
  }
}

function checkRateLimit(ip: string): boolean {
  cleanRateLimits();
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
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
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Rate limit by IP
  const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('cf-connecting-ip')
    || 'unknown';
  if (!checkRateLimit(clientIP)) {
    return new Response(
      JSON.stringify({ error: 'rate_limit_exceeded', retry_after: 3600 }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json',
  'x-api-version': API_VERSION, 'Retry-After': '3600' } }
    );
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

    const result: Record<string, unknown> = {
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
    let linkedinTitle = '' // Full title: "Name - Role at Company | LinkedIn"
    let fetchSuccess = false

    try {
      const res = await fetchWithRetry(liUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      }, { timeoutMs: 8000, maxRetries: 1, backoffMs: 2000 })

      if (res.ok) {
        const html = await res.text()

        // Try <title> tag: "Jane Smith - Director at Stripe | LinkedIn"
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
        if (titleMatch) {
          linkedinTitle = titleMatch[1].trim()
          linkedinName = linkedinTitle
            .split(/\s+[-\u2013|]\s+/)[0]
            .replace(/\s*\(.*?\)\s*/g, '')
            .trim()
        }

        // Fallback: og:title meta tag
        if (!linkedinName) {
          const ogMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
          if (ogMatch) {
            linkedinTitle = ogMatch[1].trim()
            linkedinName = linkedinTitle.split(/\s+[-\u2013|]\s+/)[0].trim()
          }
        }

        fetchSuccess = true
      }

      result.checks.linkedin_fetch = fetchSuccess
      result.checks.linkedin_name = linkedinName || null
      result.checks.linkedin_title_raw = linkedinTitle || null

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

    // ─── CHECK 4: DataForSEO SERP verification ───
    const dfsSerpResult = await verifyProfileViaSERP(formName, liUrl)
    result.checks.dataforseo = dfsSerpResult

    // ─── CHECK 5: Competitor employer blocklist ───
    // Extract employer from LinkedIn title and/or SERP title
    // Title format: "Name - Role at Company | LinkedIn"
    // SERP title format: "Name - Role | Company ..."
    const employerSources: string[] = []

    if (linkedinTitle) {
      const employer = extractEmployerFromTitle(linkedinTitle)
      if (employer) employerSources.push(employer)
    }

    if (dfsSerpResult.serp_title) {
      const serpEmployer = extractEmployerFromTitle(dfsSerpResult.serp_title)
      if (serpEmployer) employerSources.push(serpEmployer)
    }

    // Deduplicate employer candidates
    const uniqueEmployers = [...new Set(employerSources.map(e => e.toLowerCase()))]
      .map(lower => employerSources.find(e => e.toLowerCase() === lower)!)

    // Load blocklist from database
    const blocklistResult = await checkCompetitorBlocklist(supabase, uniqueEmployers)
    result.checks.employer_blocklist = {
      employers_detected: uniqueEmployers,
      blocked: blocklistResult.blocked,
      matched_company: blocklistResult.matched_company,
      matched_category: blocklistResult.matched_category,
    }

    // ─── Hard block on competitor employer ───
    if (blocklistResult.blocked) {
      result.approved = false
      result.reason = `Blocked: current/recent employer "${blocklistResult.matched_company}" is on competitor blocklist (${blocklistResult.matched_category})`
      await updateProfile(supabase, profile_id, false, result)
      return respond(result)
    }

    // ─── DECISION ───
    const serpConfirmed = dfsSerpResult.verified === true

    if (nameMatch && !timingSuspicious) {
      result.approved = true
      result.reason = serpConfirmed
        ? 'Auto-approved: name match + normal timing + SERP-verified'
        : 'Auto-approved: name match + normal timing'
      await updateProfile(supabase, profile_id, true, result)

    } else if (nameMatch && timingBorderline) {
      result.approved = true
      result.reason = serpConfirmed
        ? 'Auto-approved: name match + borderline timing + SERP-verified'
        : 'Auto-approved: name match, borderline timing'
      await updateProfile(supabase, profile_id, true, result)

    } else if (serpConfirmed && !timingSuspicious && !fetchSuccess) {
      result.approved = true
      result.reason = 'Auto-approved: SERP-verified profile (LinkedIn fetch failed)'
      await updateProfile(supabase, profile_id, true, result)

    } else if (!fetchSuccess && !serpConfirmed) {
      result.reason = 'LinkedIn fetch failed and SERP could not verify profile'
      await updateProfile(supabase, profile_id, false, result)

    } else if (!nameMatch && fetchSuccess) {
      const serpFailed = dfsSerpResult.verified === false && dfsSerpResult.error == null
      result.reason = serpFailed
        ? 'Name mismatch + profile not found in Google index'
        : 'Name mismatch between form and LinkedIn profile'
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


// ─── Employer Extraction ───

/**
 * Extract employer name from a LinkedIn-style title string.
 * Handles multiple formats:
 *   "Jane Smith - Director at Stripe | LinkedIn"
 *   "Jane Smith - Director | Stripe | LinkedIn"
 *   "Jane Smith - Stripe | LinkedIn"
 *   "Jane Smith - Sr. Salesforce Administrator | Zillow Group ..."
 */
function extractEmployerFromTitle(title: string): string | null {
  // Strip trailing "| LinkedIn", "- LinkedIn", "..."
  let cleaned = title
    .replace(/\s*[|\u2013-]\s*LinkedIn\s*$/i, '')
    .replace(/\s*\.{3,}\s*$/, '')
    .trim()

  // Pattern 1: "Name - Role at Company"
  const atMatch = cleaned.match(/\s+at\s+(.+)$/i)
  if (atMatch) {
    return atMatch[1].trim()
  }

  // Pattern 2: "Name - Role | Company" or "Name - Company"
  // After stripping LinkedIn, split on " - " then on " | "
  const dashParts = cleaned.split(/\s+[-\u2013]\s+/)
  if (dashParts.length >= 2) {
    // Everything after the name (first segment)
    const afterName = dashParts.slice(1).join(' - ')

    // Check for pipe separator: "Role | Company"
    const pipeParts = afterName.split(/\s*\|\s*/)
    if (pipeParts.length >= 2) {
      // Last pipe segment is usually the company
      return pipeParts[pipeParts.length - 1].trim()
    }

    // If "at" is in the segment: "Director at Stripe"
    const atInner = afterName.match(/\s+at\s+(.+)$/i)
    if (atInner) {
      return atInner[1].trim()
    }

    // Single segment after name with no role indicators — might be company name
    // Only use if it looks like a company (no common role words)
    const roleWords = /^(ceo|cto|cfo|coo|vp|director|manager|engineer|analyst|consultant|specialist|coordinator|lead|head|chief|senior|sr|jr|junior|intern|founder|co-founder|partner|associate|principal)/i
    if (!roleWords.test(afterName.trim())) {
      return afterName.trim()
    }
  }

  return null
}


// ─── Competitor Blocklist Check ───

interface BlocklistResult {
  blocked: boolean
  matched_company: string | null
  matched_category: string | null
}

async function checkCompetitorBlocklist(
  supabase: unknown,
  employers: string[]
): Promise<BlocklistResult> {
  if (employers.length === 0) {
    return { blocked: false, matched_company: null, matched_category: null }
  }

  try {
    // Fetch active blocklist entries
    const { data: blocklist, error } = await supabase
      .from('competitor_blocklist')
      .select('company_name, aliases, category')
      .eq('active', true)

    if (error || !blocklist || blocklist.length === 0) {
      return { blocked: false, matched_company: null, matched_category: null }
    }

    // Check each detected employer against the blocklist
    for (const employer of employers) {
      const employerLower = employer.toLowerCase().trim()

      for (const entry of blocklist) {
        // Match against company_name
        if (fuzzyCompanyMatch(employerLower, entry.company_name.toLowerCase())) {
          return {
            blocked: true,
            matched_company: entry.company_name,
            matched_category: entry.category,
          }
        }

        // Match against aliases
        if (entry.aliases && Array.isArray(entry.aliases)) {
          for (const alias of entry.aliases) {
            if (fuzzyCompanyMatch(employerLower, alias.toLowerCase())) {
              return {
                blocked: true,
                matched_company: entry.company_name,
                matched_category: entry.category,
              }
            }
          }
        }
      }
    }

    return { blocked: false, matched_company: null, matched_category: null }

  } catch (e) {
    console.error('Blocklist check error:', e)
    // Fail open — don't block signups if blocklist check fails
    return { blocked: false, matched_company: null, matched_category: null }
  }
}

/**
 * Fuzzy company name matching.
 * Handles variations like "Greenhouse Software" matching "Greenhouse",
 * "Career Builder" matching "CareerBuilder", etc.
 */
function fuzzyCompanyMatch(detected: string, blocked: string): boolean {
  // Exact match
  if (detected === blocked) return true

  // Normalize: strip common suffixes, punctuation, spacing
  const normalize = (s: string) => s
    .replace(/[,.'"\-]/g, '')
    .replace(/\s+(inc|llc|ltd|corp|corporation|co|company|software|technologies|group|labs|hq)\.?\s*$/i, '')
    .replace(/\s+/g, '')
    .toLowerCase()

  const normDetected = normalize(detected)
  const normBlocked = normalize(blocked)

  if (normDetected === normBlocked) return true

  // Substring containment for multi-word companies
  // e.g. "Greenhouse Software" contains "greenhouse"
  if (normDetected.includes(normBlocked) || normBlocked.includes(normDetected)) return true

  // Word-level: all words of the shorter exist in the longer
  const wordsDetected = detected.toLowerCase().split(/\s+/)
  const wordsBlocked = blocked.toLowerCase().split(/\s+/)
  const shorter = wordsDetected.length <= wordsBlocked.length ? wordsDetected : wordsBlocked
  const longer = wordsDetected.length <= wordsBlocked.length ? wordsBlocked : wordsDetected
  const allFound = shorter.every(w => longer.some(lw => lw.includes(w) || w.includes(lw)))
  if (allFound && shorter.length >= 1) return true

  return false
}


// ─── DataForSEO SERP Profile Verification ───

interface SERPVerificationResult {
  verified: boolean
  url_match: boolean | null
  serp_url: string | null
  serp_title: string | null
  organic_count: number
  cost: number | null
  error: string | null
}

async function verifyProfileViaSERP(
  fullName: string,
  linkedinUrl: string
): Promise<SERPVerificationResult> {
  const login = Deno.env.get('DATAFORSEO_LOGIN')
  const apiKey = Deno.env.get('DATAFORSEO_API_KEY')

  if (!login || !apiKey) {
    return {
      verified: false,
      url_match: null,
      serp_url: null,
      serp_title: null,
      organic_count: 0,
      cost: null,
      error: 'DATAFORSEO credentials not configured',
    }
  }

  const name = fullName.trim()
  if (!name) {
    return {
      verified: false,
      url_match: null,
      serp_url: null,
      serp_title: null,
      organic_count: 0,
      cost: null,
      error: 'No name provided for SERP verification',
    }
  }

  try {
    const authHeader = 'Basic ' + btoa(`${login}:${apiKey}`)
    const keyword = `"${name}" site:linkedin.com/in`

    const res = await fetchWithRetry(
      'https://api.dataforseo.com/v3/serp/google/organic/live/advanced',
      {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
  'x-api-version': API_VERSION,
        },
        body: JSON.stringify([{
          keyword,
          location_code: 2840,
          language_code: 'en',
          depth: 10,
        }]),
      },
      TIMEOUT_CONFIGS.dataforseo
    )

    if (!res.ok) {
      return {
        verified: false,
        url_match: null,
        serp_url: null,
        serp_title: null,
        organic_count: 0,
        cost: null,
        error: `DataForSEO HTTP ${res.status}`,
      }
    }

    const data = await res.json()
    const task = data?.tasks?.[0]
    const taskResult = task?.result?.[0]
    const items = taskResult?.items || []
    const organicItems = items.filter((i: Record<string, unknown>) => i.type === 'organic')

    const normalizedSignupUrl = normalizeLinkedInUrl(linkedinUrl)

    let urlMatch = false
    let matchedUrl: string | null = null
    let matchedTitle: string | null = null

    for (const item of organicItems) {
      const serpUrl = normalizeLinkedInUrl(item.url || '')
      if (serpUrl === normalizedSignupUrl) {
        urlMatch = true
        matchedUrl = item.url
        matchedTitle = item.title
        break
      }
    }

    // Fallback: slug match
    if (!urlMatch && organicItems.length > 0) {
      const slug = extractLinkedInSlug(linkedinUrl)
      if (slug) {
        for (const item of organicItems) {
          const itemSlug = extractLinkedInSlug(item.url || '')
          if (itemSlug && itemSlug === slug) {
            urlMatch = true
            matchedUrl = item.url
            matchedTitle = item.title
            break
          }
        }
      }
    }

    return {
      verified: urlMatch,
      url_match: urlMatch,
      serp_url: matchedUrl || (organicItems[0]?.url || null),
      serp_title: matchedTitle || (organicItems[0]?.title || null),
      organic_count: organicItems.length,
      cost: data?.cost || task?.cost || null,
      error: null,
    }

  } catch (e) {
    console.error('DataForSEO SERP verification error:', e)
    return {
      verified: false,
      url_match: null,
      serp_url: null,
      serp_title: null,
      organic_count: 0,
      cost: null,
      error: e.message || 'Unknown error',
    }
  }
}

function normalizeLinkedInUrl(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\?.*$/, '')
    .replace(/#.*$/, '')
    .replace(/\/+$/, '')
}

function extractLinkedInSlug(url: string): string | null {
  const match = url.match(/linkedin\.com\/in\/([a-zA-Z0-9\-_%]+)/i)
  return match ? match[1].toLowerCase() : null
}


// ─── HELPERS ───

async function updateProfile(
  supabase: unknown,
  profileId: string,
  approved: boolean,
  validationResult: Record<string, unknown>
) {
  const update: Record<string, unknown> = {
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

function respond(result: Record<string, unknown>) {
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
