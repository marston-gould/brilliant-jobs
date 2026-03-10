// ============================================================
// us-filter.js — Shared US Eligibility Filter
// ============================================================
// SINGLE SOURCE OF TRUTH for US-Only filter logic.
// Applies to both the legacy (job-feed.js) and SPA (useFeedSearch.ts) paths.
//
// Five-category taxonomy:
//   1. In US           — loc_country = 'US', is_remote = false
//   2. Remote, US      — is_remote + US evidence (loc_country/loc_state/location text)
//   3. Remote, NOT US  — is_remote + explicit non-US signal → EXCLUDE
//   4. Remote, unknown — is_remote + no country signal at all → INCLUDE (US platform benefit-of-doubt)
//   5. Not in US       — loc_country resolved to non-US → naturally excluded by Tier 1
//
// DO NOT add US filter logic anywhere else. All three code paths that need it
// (job-feed.js, useFeedSearch.ts, preview-jobs EF) must call this module.
//
// Sync note: Keep js/us-filter.js and src/app/pages/dashboard/feed/hooks/us-filter.ts
// identical in logic. If you change one, change the other.
// ============================================================

var BJ_US_STATES = 'AL,AK,AZ,AR,CA,CO,CT,DE,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY,DC';

// Non-US location text patterns — explicit exclusions applied AFTER the inclusion OR clause.
// These are belt-and-suspenders: if loc_country is NULL but the location text is unambiguously
// non-US, we exclude even if the OR clause would have passed it through.
var BJ_NON_US_TEXT_EXCLUSIONS = [
  '%EMEA%',
  '% Europe%',
  '%European Union%',
  '%APAC%',
  '%LATAM%',
  '%Latin America%',
  '% India%',
  '%Bangalore%',
  '%Mumbai%',
  '%Hyderabad%',
  '%Pune%',
  '%Philippines%',
  '%Manila%',
  '%Kyiv%',
  '%Kiev%',
  '%London%',
  '%Manchester%',
  '%Bristol%',
  '%Edinburgh%',
  '%Sydney%',
  '%Melbourne%',
  '%Toronto%',
  '%Vancouver%',
  '%Montreal%',
  '%, BC%',
  '%British Columbia%',
  '%Ontario, Canada%',
  '%Alberta%',
  '%Quebec%',
  '%Hong Kong%',
  '%Budapest%',
  '%Vilnius%',
  '%Warsaw%',
  '%Krakow%',
  '%Mexico City%',
  '%São Paulo%',
  '%Sao Paulo%',
  '%Singapore%',
  '%Tel Aviv%',
  '% Japan%',
  '%Seoul%',
  '%Berlin%',
  '%Munich%',
  '%Frankfurt%',
  '%Amsterdam%',
  '%Stockholm%',
  '%Copenhagen%',
  '%Oslo%',
  '%Helsinki%',
  '%Zurich%',
  '%Dublin, Ireland%',
];

/**
 * Apply the US-Only filter to a Supabase query builder.
 * Implements tiered inclusion + explicit exclusion logic.
 *
 * @param {object} query - Supabase PostgREST query builder
 * @returns {object} query with US filter applied
 */
function buildUSOnlyQuery(query) {
  // ── Layer B: Tiered Inclusion OR clause ────────────────────────────────
  // Jobs must match at least one of these to pass through.
  query = query.or([
    // Tier 1: loc_country definitively resolved to US
    'loc_country.eq.US',

    // Tier 2: loc_country NULL but US state code is known — strong signal
    'and(loc_country.is.null,loc_state.in.(' + BJ_US_STATES + '))',

    // Tier 3: loc_country NULL but explicit US text in location string
    'and(loc_country.is.null,location.ilike.%United States%)',
    'and(loc_country.is.null,location.ilike.% USA%)',
    'and(loc_country.is.null,location.ilike.%(USA)%)',
    'and(loc_country.is.null,location.ilike.%, US)',       // "Remote, US" — end of string
    'and(loc_country.is.null,location.ilike.%, US %)',     // "Remote, US Only"
    'and(loc_country.is.null,location.ilike.%(US)%)',      // "Remote (US)"
    'and(loc_country.is.null,location.ilike.%- US)',       // "Remote - US" — end of string
    'and(loc_country.is.null,location.ilike.%- US %)',     // "Remote - US Only"

    // Tier 4: loc_country NULL, bare/generic Remote — benefit of doubt on a US platform
    // Only matches unqualified remote strings. "Remote - Europe" does NOT match these.
    'and(loc_country.is.null,location.eq.Remote)',
    'and(loc_country.is.null,location.eq.Anywhere)',
    'and(loc_country.is.null,location.ilike.Work From Home%)',
    'and(loc_country.is.null,location.ilike.Remote Work%)',
  ].join(','));

  // ── Canada exclusion (preserving NULLs) ────────────────────────────────
  // .not('loc_country','eq','CA') generates `loc_country <> 'CA'` which is FALSE
  // for NULLs, silently excluding all NULL-country jobs. Use OR to preserve NULLs.
  query = query.or('loc_country.neq.CA,loc_country.is.null');
  query = query.not('location', 'ilike', '%Canada%');
  query = query.not('location', 'ilike', '%, BC%');
  query = query.not('location', 'ilike', '%British Columbia%');

  // ── Layer A: Explicit non-US text exclusions ───────────────────────────
  // Belt-and-suspenders: exclude jobs where location text is unambiguously
  // non-US, even if loc_country is NULL (parser didn't resolve it).
  for (var i = 0; i < BJ_NON_US_TEXT_EXCLUSIONS.length; i++) {
    query = query.not('location', 'ilike', BJ_NON_US_TEXT_EXCLUSIONS[i]);
  }

  return query;
}

/**
 * Remote clauses to add to a location OR clause when includeRemote + usOnly are both active.
 * Use these instead of bare 'is_remote.eq.true' to avoid pulling in worldwide remote jobs.
 *
 * @returns {string[]} array of PostgREST OR clause strings
 */
function buildUSRemoteClauses() {
  // IMPORTANT: These clauses are embedded inside PostgREST and() expressions.
  // Rules for safe and() embedding:
  //   1. Use * as the ilike wildcard, NOT %. The Supabase JS client passes the
  //      .or() string through without re-encoding, so % in ilike values gets
  //      double-encoded to %25 (literal text) by the HTTP layer. * is safe.
  //   2. No parens ( ) inside ilike values — PostgREST uses them as logic delimiters.
  //      Pattern "Remote*(US)*" would break the parser. Omitted: 0 jobs in DB use it.
  //   3. No commas inside ilike values — commas are clause separators.
  //      Patterns like "Remote*, US" omitted: 0 jobs in DB use them (2026-03-10).
  //   4. Spaces are fine as-is inside and() — PostgREST handles them correctly.
  return [
    // Tier 1: Resolved US country code + remote flag
    'and(loc_country.eq.US,is_remote.eq.true)',
    'and(loc_country.eq.US,loc_type.eq.remote)',

    // Tier 2: NULL country + US state code + is_remote
    'and(loc_country.is.null,loc_state.in.(' + BJ_US_STATES + '),is_remote.eq.true)',

    // Tier 3: NULL country + explicit US text in location string (* wildcard)
    'and(loc_country.is.null,location.ilike.*United States*)',
    'and(loc_country.is.null,location.ilike.*USA*)',

    // Tier 4: NULL country + bare/generic remote strings (benefit of doubt)
    'and(loc_country.is.null,location.eq.Remote)',
    'and(loc_country.is.null,location.eq.Anywhere)',
    'and(loc_country.is.null,location.ilike.Work From Home*)',
    'and(loc_country.is.null,location.ilike.Remote Work*)',
  ];
}
