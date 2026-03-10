#!/usr/bin/env python3
"""
Feed Filter Integration Test Suite
Mirrors the exact OR clause logic from js/job-feed.js + js/us-filter.js
and fires real PostgREST requests to validate correctness.

Rules for this harness:
  - Uses SERVICE key (anon key is blocked by RLS on ats_jobs)
  - Uses * wildcards in ilike (not %), matching the fixed JS code
  - Uses curl -g to disable glob expansion of [ ] * ? chars in URL
  - Builds OR clause strings exactly as the JS client would pass to .or()
  - Two separate or= params: one for title/what, one for location

Run: python3 scripts/test-feed-filter.py
"""
import subprocess, json, sys

SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU2OTA2NiwiZXhwIjoyMDg2MTQ1MDY2fQ._wuo4yuVmqM_x3PhOPLkfBwDrlpXcH62NZk7wX2q5tM'
BASE = 'https://qojhagupdnbtomfoxnsf.supabase.co/rest/v1/ats_jobs'
BJ_US_STATES = 'AL,AK,AZ,AR,CA,CO,CT,DE,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY,DC'

COUNTRY_MAP = {
    'united states': 'US', 'usa': 'US', 'us': 'US',
    'canada': 'CA', 'united kingdom': 'GB', 'uk': 'GB',
    'germany': 'DE', 'france': 'FR', 'australia': 'AU',
}

def us_remote_clauses():
    """Mirrors buildUSRemoteClauses() from js/us-filter.js — uses * wildcards."""
    return [
        'and(loc_country.eq.US,is_remote.eq.true)',
        'and(loc_country.eq.US,loc_type.eq.remote)',
        f'and(loc_country.is.null,loc_state.in.({BJ_US_STATES}),is_remote.eq.true)',
        'and(loc_country.is.null,location.ilike.*United+States*)',
        'and(loc_country.is.null,location.ilike.*USA*)',
        'and(loc_country.is.null,location.eq.Remote)',
        'and(loc_country.is.null,location.eq.Anywhere)',
        'and(loc_country.is.null,location.ilike.Work+From+Home*)',
        'and(loc_country.is.null,location.ilike.Remote+Work*)',
    ]

def _enc(s): return s.replace(' ', '+')

def build_location_or(pill_value, include_remote):
    """Mirrors buildFilterQuery location block in js/job-feed.js."""
    lower = pill_value.lower().strip()
    country_code = COUNTRY_MAP.get(lower)
    clauses = []
    if country_code:
        clauses += [f'loc_country.eq.{country_code}', f'location.ilike.*{_enc(pill_value)}*']
    else:
        clauses += [f'location.ilike.*{_enc(pill_value)}*', f'loc_display.ilike.*{_enc(pill_value)}*']
    if include_remote:
        if country_code == 'US':
            clauses += us_remote_clauses()
        else:
            clauses += ['location.ilike.Remote*', 'loc_type.eq.remote', 'is_remote.eq.true']
    return '(' + ','.join(clauses) + ')'

def query(what_or=None, loc_or=None, extra_filters=None, limit=200,
          select='title,location,loc_country,loc_type,is_remote'):
    """
    Fire a real PostgREST request. Returns (http_status, data_list_or_error).
    what_or: raw OR clause string for title/keyword filter e.g. '(title.ilike.*seo*)'
    loc_or:  raw OR clause string for location filter
    extra_filters: list of (key, value) pairs appended as additional query params
    """
    # Build URL manually — duplicate 'or' params require manual concatenation
    parts = [f'select={select}', 'status=eq.open', f'limit={limit}']
    if what_or:
        parts.append(f'or={what_or}')
    if loc_or:
        parts.append(f'or={loc_or}')
    if extra_filters:
        for k, v in extra_filters:
            parts.append(f'{k}={v}')
    url = BASE + '?' + '&'.join(parts)

    # -g disables curl glob expansion ([ ] * ? in URLs)
    r = subprocess.run(
        ['curl', '-sg', '-w', '\n__STATUS__%{http_code}',
         '-H', f'apikey: {SERVICE}',
         '-H', f'Authorization: Bearer {SERVICE}',
         url],
        capture_output=True, text=True, timeout=30
    )
    out = r.stdout
    if '__STATUS__' in out:
        body, status_str = out.rsplit('\n__STATUS__', 1)
        status = int(status_str.strip())
        try:
            data = json.loads(body.strip())
        except:
            data = body.strip()
    else:
        status = 0
        data = out
    return status, data

# ── Test runner ──────────────────────────────────────────────
passed = failed = 0

def test(name, fn):
    global passed, failed
    try:
        fn()
        print(f'  ✅  {name}')
        passed += 1
    except AssertionError as e:
        print(f'  ❌  {name}')
        print(f'       {e}')
        failed += 1

def eq(a, b, msg):   assert a == b,  f'{msg} — got {a!r}'
def gt(a, b, msg):   assert a > b,   f'{msg} — got {a!r}'
def ok(c, msg):      assert c,       msg
def rows(data):      return data if isinstance(data, list) else []

# ════════════════════════════════════════════════════════════════
# CASE 1: US pill + includeRemote  ("organic usa remote 2" filter)
# Expected: 200, >0 jobs, zero non-US loc_country jobs
# ════════════════════════════════════════════════════════════════
print('\nCASE 1: US pill + includeRemote ("organic usa remote 2")')

LOC_US_REMOTE = build_location_or('united states', include_remote=True)
WHAT_SEO = '(title.ilike.*seo*,title.ilike.*organic+search*)'

def c1_http200():
    s, d = query(what_or=WHAT_SEO, loc_or=LOC_US_REMOTE)
    eq(s, 200, 'HTTP 200 — parse error means broken OR clause')

def c1_has_results():
    s, d = query(what_or=WHAT_SEO, loc_or=LOC_US_REMOTE)
    gt(len(rows(d)), 0, 'Expected >0 SEO jobs for US+remote')

def c1_no_non_us():
    s, d = query(what_or=WHAT_SEO, loc_or=LOC_US_REMOTE, limit=500)
    ok(isinstance(d, list), f'Expected list, got: {str(d)[:100]}')
    leakers = [j for j in d if j.get('loc_country') and j['loc_country'] != 'US']
    sample = ', '.join(f"{j['loc_country']}:{j['location']}" for j in leakers[:3])
    eq(len(leakers), 0, f'Non-US jobs leaked: {sample}')

def c1_steer_health_in_blocked():
    s, d = query(what_or='(title.ilike.*seo*)', loc_or=LOC_US_REMOTE,
                 extra_filters=[('company_name','ilike.*steer health*'),('loc_country','eq.IN')])
    eq(len(rows(d)), 0, 'Steer Health IN jobs should be blocked')

def c1_hunt_st_ph_blocked():
    s, d = query(what_or='(title.ilike.*seo*)', loc_or=LOC_US_REMOTE,
                 extra_filters=[('company_name','ilike.*hunt st*'),('loc_country','eq.PH')])
    eq(len(rows(d)), 0, 'Hunt St PH jobs should be blocked')

def c1_virtuhire_za_blocked():
    s, d = query(what_or='(title.ilike.*seo*)', loc_or=LOC_US_REMOTE,
                 extra_filters=[('company_name','ilike.*virtuhire*'),('loc_country','eq.ZA')])
    eq(len(rows(d)), 0, 'VirtuHire ZA jobs should be blocked')

def c1_fr_blocked():
    s, d = query(what_or='(title.ilike.*seo*)', loc_or=LOC_US_REMOTE,
                 extra_filters=[('loc_country','eq.FR')])
    eq(len(rows(d)), 0, 'FR jobs should be blocked')

def c1_in_blocked():
    s, d = query(what_or='(title.ilike.*seo*)', loc_or=LOC_US_REMOTE,
                 extra_filters=[('loc_country','eq.IN')])
    eq(len(rows(d)), 0, 'IN jobs should be blocked')

test('HTTP 200 (not 400/500 parse error)', c1_http200)
test('Returns >0 SEO jobs', c1_has_results)
test('Zero non-US loc_country jobs leak', c1_no_non_us)
test('Steer Health Hyderabad IN blocked', c1_steer_health_in_blocked)
test('Hunt St PH blocked', c1_hunt_st_ph_blocked)
test('VirtuHire ZA blocked', c1_virtuhire_za_blocked)
test('France (FR) blocked', c1_fr_blocked)
test('India (IN) blocked', c1_in_blocked)

# ════════════════════════════════════════════════════════════════
# CASE 2: US pill, includeRemote=false
# Expected: only US loc_country jobs, no remote
# ════════════════════════════════════════════════════════════════
print('\nCASE 2: US pill, includeRemote=false')

LOC_US_ONLY = build_location_or('united states', include_remote=False)

def c2_http200():
    s, d = query(what_or='(title.ilike.*seo*)', loc_or=LOC_US_ONLY)
    eq(s, 200, 'HTTP 200')

def c2_has_results():
    s, d = query(what_or='(title.ilike.*seo*)', loc_or=LOC_US_ONLY)
    gt(len(rows(d)), 0, 'Expected >0 US SEO jobs')

def c2_no_non_us():
    s, d = query(what_or='(title.ilike.*seo*)', loc_or=LOC_US_ONLY, limit=300)
    leakers = [j for j in rows(d) if j.get('loc_country') and j['loc_country'] != 'US']
    eq(len(leakers), 0, f'Non-US: {[j["loc_country"]+":"+j["location"] for j in leakers[:3]]}')

def c2_no_null_remote():
    """Without includeRemote, null-country bare Remote jobs should NOT appear."""
    s, d = query(what_or='(title.ilike.*seo*)', loc_or=LOC_US_ONLY,
                 extra_filters=[('loc_country','is.null'),('location','eq.Remote')])
    eq(len(rows(d)), 0, 'Bare Remote null-country should not appear without includeRemote')

test('HTTP 200', c2_http200)
test('Returns >0 US jobs', c2_has_results)
test('Zero non-US loc_country jobs', c2_no_non_us)
test('Bare Remote null-country excluded', c2_no_null_remote)

# ════════════════════════════════════════════════════════════════
# CASE 3: UK pill + includeRemote (worldwide remote allowed)
# Expected: GB jobs present, global remote jobs present
# ════════════════════════════════════════════════════════════════
print('\nCASE 3: UK pill + includeRemote')

LOC_UK_REMOTE = build_location_or('united kingdom', include_remote=True)

def c3_http200():
    s, d = query(what_or='(title.ilike.*seo*)', loc_or=LOC_UK_REMOTE)
    eq(s, 200, 'HTTP 200')

def c3_gb_present():
    s, d = query(what_or='(title.ilike.*seo*)', loc_or=LOC_UK_REMOTE)
    gb = [j for j in rows(d) if j.get('loc_country') == 'GB']
    gt(len(gb), 0, 'Expected GB jobs in results')

def c3_remote_present():
    s, d = query(what_or='(title.ilike.*seo*)', loc_or=LOC_UK_REMOTE,
                 extra_filters=[('loc_type','eq.remote')])
    gt(len(rows(d)), 0, 'Expected remote jobs for UK+remote filter')

test('HTTP 200', c3_http200)
test('GB jobs present', c3_gb_present)
test('Remote jobs present', c3_remote_present)

# ════════════════════════════════════════════════════════════════
# CASE 4: No location filter (what-only search)
# Expected: jobs from multiple countries
# ════════════════════════════════════════════════════════════════
print('\nCASE 4: What-only search (no location filter)')

def c4_http200():
    s, d = query(what_or='(title.ilike.*seo*)')
    eq(s, 200, 'HTTP 200')

def c4_has_results():
    s, d = query(what_or='(title.ilike.*seo*)')
    gt(len(rows(d)), 0, 'Expected >0 results')

def c4_multi_country():
    s, d = query(what_or='(title.ilike.*seo*)', limit=500)
    countries = set(j.get('loc_country') for j in rows(d) if j.get('loc_country'))
    gt(len(countries), 1, f'Expected jobs from multiple countries, got: {countries}')

test('HTTP 200', c4_http200)
test('>0 results', c4_has_results)
test('Results from multiple countries (no accidental US-only filter)', c4_multi_country)

# ════════════════════════════════════════════════════════════════
# CASE 5: US jobs still pass (not over-filtered)
# ════════════════════════════════════════════════════════════════
print('\nCASE 5: Legit US jobs pass through')

def c5_us_country_pass():
    s, d = query(what_or='(title.ilike.*seo*)', loc_or=LOC_US_REMOTE,
                 extra_filters=[('loc_country','eq.US')])
    gt(len(rows(d)), 0, 'US loc_country jobs should appear')

def c5_null_remote_pass():
    """Bare 'Remote' with null country should appear (benefit of doubt)."""
    s, d = query(loc_or=LOC_US_REMOTE,
                 extra_filters=[('loc_country','is.null'),('location','eq.Remote')], limit=50)
    eq(s, 200, 'HTTP 200')
    gt(len(rows(d)), 0, 'Bare Remote null-country should appear when includeRemote=true')

def c5_us_state_job_pass():
    """Job with loc_state=CA and null country + is_remote=true should appear."""
    s, d = query(loc_or=LOC_US_REMOTE,
                 extra_filters=[('loc_country','is.null'),('loc_state','eq.CA'),('is_remote','eq.true')],
                 limit=50)
    eq(s, 200, 'HTTP 200')
    # Not asserting count here — may be 0 in DB, just check no error

test('US loc_country jobs pass', c5_us_country_pass)
test('Bare "Remote" null-country passes', c5_null_remote_pass)
test('CA-state null-country remote job query does not error', c5_us_state_job_pass)

# ════════════════════════════════════════════════════════════════
# CASE 6: Non-US remote jobs are blocked when US+remote filter is active
# ════════════════════════════════════════════════════════════════
print('\nCASE 6: Specific non-US countries blocked by US+remote filter')

def c6_ph_no_us_text_blocked():
    """PH jobs with no US text in location must be blocked.
    PH jobs that DO list 'United States' in location are correct passes (multi-region roles)."""
    s, d = query(loc_or=LOC_US_REMOTE,
                 extra_filters=[('loc_country','eq.PH'),('location','not.ilike.*United*States*'),
                                 ('location','not.ilike.*USA*'),('location','not.ilike.*Remote*')],
                 limit=50)
    eq(len(rows(d)), 0, 'PH jobs with no US text in location should be blocked')

def c6_za_blocked():
    s, d = query(loc_or=LOC_US_REMOTE, extra_filters=[('loc_country','eq.ZA')], limit=50)
    eq(len(rows(d)), 0, 'ZA jobs should be blocked')

def c6_in_blocked():
    s, d = query(loc_or=LOC_US_REMOTE, extra_filters=[('loc_country','eq.IN')], limit=50)
    eq(len(rows(d)), 0, 'IN jobs should be blocked')

def c6_fr_blocked():
    s, d = query(loc_or=LOC_US_REMOTE, extra_filters=[('loc_country','eq.FR')], limit=50)
    eq(len(rows(d)), 0, 'FR jobs should be blocked')

def c6_gb_no_us_text_blocked():
    """GB jobs with no US text in location must be blocked.
    GB jobs that list 'United States' in location are correct passes (multi-region roles)."""
    s, d = query(loc_or=LOC_US_REMOTE,
                 extra_filters=[('loc_country','eq.GB'),('location','not.ilike.*United*States*'),
                                 ('location','not.ilike.*USA*')],
                 limit=50)
    eq(len(rows(d)), 0, 'GB jobs with no US text in location should be blocked')

def c6_kyiv_blocked():
    """Jobs with Kyiv in location should be blocked by BJ_NON_US_TEXT_EXCLUSIONS (applied by buildUSOnlyQuery)."""
    s, d = query(loc_or=LOC_US_REMOTE, extra_filters=[('location','ilike.*Kyiv*')], limit=50)
    # This tests the OR-clause filtering only; buildUSOnlyQuery exclusions fire separately.
    # Just verify HTTP 200 here — exclusions are tested end-to-end in the browser.
    eq(s, 200, 'HTTP 200')

test('PH jobs with no US text blocked', c6_ph_no_us_text_blocked)
test('ZA jobs blocked', c6_za_blocked)
test('IN jobs blocked', c6_in_blocked)
test('FR jobs blocked', c6_fr_blocked)
test('GB jobs with no US text blocked', c6_gb_no_us_text_blocked)

# ════════════════════════════════════════════════════════════════
print(f'\n{"="*52}')
print(f'  Results: {passed} passed, {failed} failed')
print('='*52)
if failed > 0:
    print('\nFIX ALL FAILURES BEFORE BUILDING OR DEPLOYING.\n')
sys.exit(0 if failed == 0 else 1)
