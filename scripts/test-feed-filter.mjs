/**
 * Feed Filter Integration Test Suite
 * Tests the actual PostgREST URL that job-feed.js generates
 * against the live Supabase API.
 *
 * Run: node scripts/test-feed-filter.mjs
 */

const SUPABASE_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU2OTA2NiwiZXhwIjoyMDg2MTQ1MDY2fQ._wuo4yuVmqM_x3PhOPLkfBwDrlpXcH62NZk7wX2q5tM';

const BJ_US_STATES = 'AL,AK,AZ,AR,CA,CO,CT,DE,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY,DC';

// Mirrors buildUSRemoteClauses() from js/us-filter.js
function buildUSRemoteClauses() {
  return [
    'and(loc_country.eq.US,is_remote.eq.true)',
    'and(loc_country.eq.US,loc_type.eq.remote)',
    `and(loc_country.is.null,loc_state.in.(${BJ_US_STATES}),is_remote.eq.true)`,
    'and(loc_country.is.null,location.ilike.Remote%United States%)',
    'and(loc_country.is.null,location.ilike.Remote%USA%)',
    'and(loc_country.is.null,location.ilike.Remote%, US)',
    'and(loc_country.is.null,location.ilike.Remote%, US %)',
    'and(loc_country.is.null,location.ilike.Remote%(US)%)',
    'and(loc_country.is.null,location.ilike.Remote%- US)',
    'and(loc_country.is.null,location.ilike.Remote%- US %)',
    'and(loc_country.is.null,location.eq.Remote)',
    'and(loc_country.is.null,location.eq.Anywhere)',
    'and(loc_country.is.null,location.ilike.Work From Home%)',
    'and(loc_country.is.null,location.ilike.Remote Work%)',
  ];
}

// Build the OR param the same way job-feed.js does for a US pill + includeRemote
function buildLocationOrParam(locationPillValue, includeRemote) {
  const COUNTRY_MAP = {
    'united states': 'US', 'usa': 'US', 'us': 'US',
    'canada': 'CA', 'united kingdom': 'GB', 'uk': 'GB',
  };
  const lower = locationPillValue.toLowerCase().trim();
  const countryCode = COUNTRY_MAP[lower];
  const allClauses = [];

  if (countryCode) {
    allClauses.push(`loc_country.eq.${countryCode}`, `location.ilike.%${locationPillValue}%`);
  } else {
    allClauses.push(`location.ilike.%${locationPillValue}%`, `loc_display.ilike.%${locationPillValue}%`);
  }

  if (includeRemote) {
    const pillIsUS = countryCode === 'US';
    if (pillIsUS) {
      allClauses.push(...buildUSRemoteClauses());
    } else {
      allClauses.push('location.ilike.Remote%', 'loc_type.eq.remote', 'is_remote.eq.true');
    }
  }
  return allClauses.join(',');
}

// Fire a real PostgREST request and return { status, data, count }
async function postgrest(params) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/ats_jobs`);
  url.searchParams.set('select', 'title,location,loc_country,loc_type,is_remote');
  url.searchParams.set('status', 'eq.open');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.append(k, v);
  }
  url.searchParams.set('limit', '200');

  const resp = await fetch(url.toString(), {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
      'Prefer': 'count=exact',
    }
  });

  const body = await resp.json();
  const countHeader = resp.headers.get('content-range');
  const total = countHeader ? parseInt(countHeader.split('/')[1]) : null;
  return { status: resp.status, data: Array.isArray(body) ? body : [], total, error: resp.ok ? null : body };
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ─────────────────────────────────────────────────────────────
// TEST CASES
// ─────────────────────────────────────────────────────────────

console.log('\n=== Feed Filter Integration Tests ===\n');

// ── CASE 1: US pill + includeRemote → must return 200 and >0 jobs ──────────
console.log('CASE 1: US pill + includeRemote (Marston\'s "organic usa remote 2" filter)');
await test('returns HTTP 200 (not 400 parse error)', async () => {
  const orParam = buildLocationOrParam('united states', true);
  const r = await postgrest({
    'or': `(title.ilike.%seo%)`,
    'or': `(${orParam})`,
  });
  // Note: can't use same key twice in object — build manually
  const url = new URL(`${SUPABASE_URL}/rest/v1/ats_jobs`);
  url.searchParams.set('select', 'title,location,loc_country,loc_type,is_remote');
  url.searchParams.set('status', 'eq.open');
  url.searchParams.append('or', '(title.ilike.%seo%)');
  url.searchParams.append('or', `(${orParam})`);
  url.searchParams.set('limit', '200');
  const resp = await fetch(url.toString(), {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Prefer': 'count=exact' }
  });
  const body = await resp.json();
  assert(resp.status === 200, `Got HTTP ${resp.status}: ${JSON.stringify(body).slice(0, 200)}`);
});

await test('returns >0 jobs', async () => {
  const orParam = buildLocationOrParam('united states', true);
  const url = new URL(`${SUPABASE_URL}/rest/v1/ats_jobs`);
  url.searchParams.set('select', 'title,location,loc_country,loc_type,is_remote');
  url.searchParams.set('status', 'eq.open');
  url.searchParams.append('or', '(title.ilike.%seo%)');
  url.searchParams.append('or', `(${orParam})`);
  url.searchParams.set('limit', '200');
  const resp = await fetch(url.toString(), {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Prefer': 'count=exact' }
  });
  const data = await resp.json();
  assert(Array.isArray(data) && data.length > 0, `Expected >0 jobs, got ${data.length}`);
});

await test('zero known non-US loc_country jobs leak through', async () => {
  const orParam = buildLocationOrParam('united states', true);
  const url = new URL(`${SUPABASE_URL}/rest/v1/ats_jobs`);
  url.searchParams.set('select', 'title,location,loc_country,loc_type,is_remote');
  url.searchParams.set('status', 'eq.open');
  url.searchParams.append('or', '(title.ilike.%seo%)');
  url.searchParams.append('or', `(${orParam})`);
  url.searchParams.set('limit', '500');
  const resp = await fetch(url.toString(), {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
  });
  const data = await resp.json();
  assert(Array.isArray(data), 'Expected array response');
  const leakers = data.filter(j => j.loc_country && j.loc_country !== 'US');
  if (leakers.length > 0) {
    const sample = leakers.slice(0, 3).map(j => `${j.loc_country}:${j.location}`).join(', ');
    assert(false, `${leakers.length} non-US jobs leaked: ${sample}`);
  }
});

// ── CASE 2: US pill WITHOUT includeRemote ──────────────────────────────────
console.log('\nCASE 2: US pill, includeRemote=false');
await test('returns HTTP 200', async () => {
  const orParam = buildLocationOrParam('united states', false);
  const url = new URL(`${SUPABASE_URL}/rest/v1/ats_jobs`);
  url.searchParams.set('select', 'title,location,loc_country');
  url.searchParams.set('status', 'eq.open');
  url.searchParams.append('or', '(title.ilike.%seo%)');
  url.searchParams.append('or', `(${orParam})`);
  url.searchParams.set('limit', '50');
  const resp = await fetch(url.toString(), {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
  });
  assert(resp.status === 200, `Got HTTP ${resp.status}`);
});

await test('returns only US jobs', async () => {
  const orParam = buildLocationOrParam('united states', false);
  const url = new URL(`${SUPABASE_URL}/rest/v1/ats_jobs`);
  url.searchParams.set('select', 'title,location,loc_country');
  url.searchParams.set('status', 'eq.open');
  url.searchParams.append('or', '(title.ilike.%seo%)');
  url.searchParams.append('or', `(${orParam})`);
  url.searchParams.set('limit', '200');
  const resp = await fetch(url.toString(), { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` } });
  const data = await resp.json();
  const leakers = (data || []).filter(j => j.loc_country && j.loc_country !== 'US');
  assert(leakers.length === 0, `${leakers.length} non-US jobs: ${leakers.slice(0,3).map(j=>j.loc_country+':'+j.location).join(', ')}`);
});

// ── CASE 3: Non-US pill + includeRemote → worldwide remote allowed ─────────
console.log('\nCASE 3: UK pill + includeRemote (should get UK + global remote)');
await test('returns HTTP 200', async () => {
  const orParam = buildLocationOrParam('united kingdom', true);
  const url = new URL(`${SUPABASE_URL}/rest/v1/ats_jobs`);
  url.searchParams.set('select', 'title,location,loc_country');
  url.searchParams.set('status', 'eq.open');
  url.searchParams.append('or', '(title.ilike.%seo%)');
  url.searchParams.append('or', `(${orParam})`);
  url.searchParams.set('limit', '50');
  const resp = await fetch(url.toString(), { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` } });
  assert(resp.status === 200, `Got HTTP ${resp.status}`);
});

await test('UK jobs appear in results', async () => {
  const orParam = buildLocationOrParam('united kingdom', true);
  const url = new URL(`${SUPABASE_URL}/rest/v1/ats_jobs`);
  url.searchParams.set('select', 'title,location,loc_country');
  url.searchParams.set('status', 'eq.open');
  url.searchParams.append('or', '(title.ilike.%seo%)');
  url.searchParams.append('or', `(${orParam})`);
  url.searchParams.set('limit', '200');
  const resp = await fetch(url.toString(), { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` } });
  const data = await resp.json();
  const ukJobs = (data||[]).filter(j => j.loc_country === 'GB');
  assert(ukJobs.length > 0, 'Expected GB jobs but got none');
});

// ── CASE 4: No location pill (what-only search) ────────────────────────────
console.log('\nCASE 4: No location pill (what-only, should return all matching)');
await test('returns HTTP 200 and >0 jobs', async () => {
  const url = new URL(`${SUPABASE_URL}/rest/v1/ats_jobs`);
  url.searchParams.set('select', 'title,location,loc_country');
  url.searchParams.set('status', 'eq.open');
  url.searchParams.append('or', '(title.ilike.%seo%)');
  url.searchParams.set('limit', '50');
  const resp = await fetch(url.toString(), { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` } });
  const data = await resp.json();
  assert(resp.status === 200, `HTTP ${resp.status}`);
  assert(data.length > 0, 'Expected results');
});

// ── CASE 5: Specific known-leaking companies must NOT appear in US+remote ──
console.log('\nCASE 5: Known leakers blocked (PH/ZA/IN/FR companies)');
await test('Steer Health Hyderabad IN blocked', async () => {
  const orParam = buildLocationOrParam('united states', true);
  const url = new URL(`${SUPABASE_URL}/rest/v1/ats_jobs`);
  url.searchParams.set('select', 'title,location,loc_country');
  url.searchParams.set('status', 'eq.open');
  url.searchParams.append('or', '(title.ilike.%seo%)');
  url.searchParams.append('or', `(${orParam})`);
  url.searchParams.set('company_name', 'ilike.%steer health%');
  url.searchParams.set('loc_country', 'eq.IN');
  url.searchParams.set('limit', '50');
  const resp = await fetch(url.toString(), { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` } });
  const data = await resp.json();
  assert(data.length === 0, `Expected 0 Steer Health IN jobs, got ${data.length}`);
});

await test('Hunt St PH jobs blocked', async () => {
  const orParam = buildLocationOrParam('united states', true);
  const url = new URL(`${SUPABASE_URL}/rest/v1/ats_jobs`);
  url.searchParams.set('select', 'title,location,loc_country');
  url.searchParams.set('status', 'eq.open');
  url.searchParams.append('or', '(title.ilike.%seo%)');
  url.searchParams.append('or', `(${orParam})`);
  url.searchParams.set('company_name', 'ilike.%hunt st%');
  url.searchParams.set('loc_country', 'eq.PH');
  url.searchParams.set('limit', '50');
  const resp = await fetch(url.toString(), { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` } });
  const data = await resp.json();
  assert(data.length === 0, `Expected 0 Hunt St PH jobs, got ${data.length}`);
});

await test('VirtuHire ZA jobs blocked', async () => {
  const orParam = buildLocationOrParam('united states', true);
  const url = new URL(`${SUPABASE_URL}/rest/v1/ats_jobs`);
  url.searchParams.set('select', 'title,location,loc_country');
  url.searchParams.set('status', 'eq.open');
  url.searchParams.append('or', '(title.ilike.%seo%)');
  url.searchParams.append('or', `(${orParam})`);
  url.searchParams.set('company_name', 'ilike.%virtuhire%');
  url.searchParams.set('loc_country', 'eq.ZA');
  url.searchParams.set('limit', '50');
  const resp = await fetch(url.toString(), { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` } });
  const data = await resp.json();
  assert(data.length === 0, `Expected 0 VirtuHire ZA jobs, got ${data.length}`);
});

// ── CASE 6: US jobs with loc_country=US still pass ─────────────────────────
console.log('\nCASE 6: Legit US jobs still pass');
await test('Contentful NYC job passes', async () => {
  const orParam = buildLocationOrParam('united states', true);
  const url = new URL(`${SUPABASE_URL}/rest/v1/ats_jobs`);
  url.searchParams.set('select', 'title,location,loc_country');
  url.searchParams.set('status', 'eq.open');
  url.searchParams.append('or', '(title.ilike.%seo%)');
  url.searchParams.append('or', `(${orParam})`);
  url.searchParams.set('company_name', 'ilike.%contentful%');
  url.searchParams.set('loc_country', 'eq.US');
  url.searchParams.set('limit', '50');
  const resp = await fetch(url.toString(), { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` } });
  const data = await resp.json();
  assert(data.length > 0, `Expected contentful US jobs, got 0`);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
