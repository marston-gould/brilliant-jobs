// ============================================================
// us-filter.ts — Shared US Eligibility Filter (SPA/TypeScript path)
// ============================================================
// SINGLE SOURCE OF TRUTH for US-Only filter logic on the SPA side.
// Must stay in sync with js/us-filter.js (vanilla JS / job-feed.js path).
//
// Five-category taxonomy:
//   1. In US           — loc_country = 'US', is_remote = false
//   2. Remote, US      — is_remote + US evidence (loc_country/loc_state/location text)
//   3. Remote, NOT US  — is_remote + explicit non-US signal → EXCLUDE
//   4. Remote, unknown — is_remote + no country signal at all → INCLUDE (US platform)
//   5. Not in US       — loc_country resolved to non-US → excluded by Tier 1
//
// Sync note: Any change to logic here must be mirrored in js/us-filter.js.
// ============================================================

const BJ_US_STATES = 'AL,AK,AZ,AR,CA,CO,CT,DE,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY,DC';

const BJ_NON_US_TEXT_EXCLUSIONS: string[] = [
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
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildUSOnlyQuery(query: any): any {
  // Simplified US-only filter: loc_country=US OR US state code OR bare Remote
  query = query.or([
    'loc_country.eq.US',
    `and(loc_country.is.null,loc_state.in.(${BJ_US_STATES}))`,
    'and(loc_country.is.null,location.eq.Remote)',
    'and(loc_country.is.null,location.eq.Anywhere)',
    'and(loc_country.is.null,is_remote.eq.true)',
  ].join(','));

  // Canada exclusion
  query = query.or('loc_country.neq.CA,loc_country.is.null');

  // Non-US text exclusions (individual .not() calls are fine — they become separate params)
  for (const pattern of BJ_NON_US_TEXT_EXCLUSIONS) {
    query = query.not('location', 'ilike', pattern);
  }

  return query;
}

/**
 * Remote clauses for includeRemote + usOnly combination.
 */
export function buildUSRemoteClauses(): string[] {
  return [
    'and(loc_country.eq.US,is_remote.eq.true)',
    'and(loc_country.eq.US,loc_type.eq.remote)',
    'is_remote.eq.true',
    'location.eq.Remote',
    'location.eq.Anywhere',
  ];
}

export { BJ_US_STATES, BJ_NON_US_TEXT_EXCLUSIONS };
