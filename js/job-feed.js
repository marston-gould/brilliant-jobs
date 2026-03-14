// ============================================================
// JOB SEARCH — Driven by checked saved filters
// ============================================================

// Migrate old format (array of strings) to new format (array of objects)
if (hiddenJobIds.length > 0 && typeof hiddenJobIds[0] === 'string') {
  hiddenJobIds = hiddenJobIds.map(id => ({ id, reason: 'other', title: '', company: '', hiddenAt: null }));
  saveUserData('bj_hidden_jobs', JSON.stringify(hiddenJobIds));
}
function isJobHidden(ghId) { return hiddenJobIds.some(h => h.id === ghId); }

const HIDE_REASONS = [
  { key: 'wrong_title', label: 'Wrong title — exclude similar roles' },
  { key: 'wrong_location', label: 'Wrong location — exclude this area' },
  { key: 'wrong_company', label: 'Wrong company — block this employer' },
  { key: 'too_old', label: 'Too old / stale listing' },
  { key: 'wrong_pay', label: 'Pay too low for this role' },
  { key: 'other', label: 'Other — not relevant to me' },
];

// FA-001: Content search flag — evaluated once per searchJobs() call
var _contentSearchEnabled = false;
// FA-005: Server-side merge flag — when enabled, multi-filter uses RPC instead of client-side merge
var _serverMergeEnabled = false;
// FA-006: Server-side trust/AI filter flag — when enabled, trust/AI filtering happens in DB, not client
var _serverTrustFilterEnabled = false;

function debouncedSearchJobs() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => searchJobs(), 300);
}

// Build a Supabase query from a single saved filter's pills
// Pre-fetch greenhouse_ids matching location pills from job_locations table
// Location filtering now handled directly in buildFilterQuery via ilike on ats_jobs.location
// No more pre-fetching IDs from job_locations (was causing connection overload)
async function getLocationMatchIds(wherePillsArr, whereNotPillsArr, tuning, includeRemote = false) {
  if (!wherePillsArr || wherePillsArr.length === 0) return null;

  // Separate pills by type
  const radiusPills = wherePillsArr.filter(p => p.lat && p.lng && p.radius_mi);
  const statePills = wherePillsArr.filter(p => p.locType === 'state');
  const remotePills = wherePillsArr.filter(p => p.locType === 'remote');
  const textPills = wherePillsArr.filter(p => !p.lat && !p.stateCode && p.locType !== 'remote');

  // If no radius or state pills and no explicit remote, fall through to ilike
  if (radiusPills.length === 0 && statePills.length === 0 && remotePills.length === 0 && !includeRemote) return null;

  const allIds = new Set();

  // Radius search via RPC — parallelized (N+1 fix v3.82)
  if (radiusPills.length > 0) {
    const radiusResults = await Promise.allSettled(radiusPills.map(pill =>
      sb.rpc('find_jobs_within_radius', {
        p_lat: pill.lat,
        p_lng: pill.lng,
        p_radius_mi: pill.radius_mi,
      }).then(r => ({ pill, ...r }))
    ));
    for (const result of radiusResults) {
      if (result.status === 'fulfilled' && !result.value.error && result.value.data) {
        result.value.data.forEach(r => allIds.add(r.greenhouse_id));
        console.log(`[BJ] Radius search: ${result.value.pill.values[0]} (${result.value.pill.radius_mi}mi) → ${result.value.data.length} jobs`);
      }
    }
  }

  // State search — disambiguate codes that overlap with ISO country codes
  // Map of ambiguous US state codes → foreign cities/indicators to EXCLUDE
  const ambiguousExclusions = {
    'DE': ['munich','berlin','hamburg','frankfurt','cologne','düsseldorf','dusseldorf','stuttgart','germany','deutschland'],
    'GA': ['tbilisi','batumi','kutaisi'],
    'IN': ['mumbai','delhi','bangalore','bengaluru','hyderabad','chennai','pune','kolkata','india','noida','gurgaon','gurugram'],
    'CO': ['bogota','bogotá','medellin','medellín','cali','barranquilla','colombia'],
    'AL': ['tirana','tiranë','albania'],
    'PA': ['panama city, panama','panamá'],
    'MA': ['casablanca','rabat','marrakech','morocco'],
    'MD': ['chisinau','moldova'],
    'ME': ['podgorica','montenegro'],
    'ID': ['jakarta','bali','surabaya','indonesia'],
    'LA': ['vientiane','laos'],
    'NE': ['niamey','niger'],
    'MN': ['ulaanbaatar','mongolia'],
    'MT': ['valletta','malta'],
  };

  // State search — batched for non-ambiguous, parallel for ambiguous (N+1 fix v3.82)
  const simpleCodes = statePills.filter(p => !ambiguousExclusions[p.stateCode]).map(p => p.stateCode);
  const ambiguousPills = statePills.filter(p => !!ambiguousExclusions[p.stateCode]);

  // Single query for all non-ambiguous states
  if (simpleCodes.length > 0) {
    try {
      const { data, error } = await sb
        .from('ats_jobs')
        .select('greenhouse_id')
        .eq('status', 'open')
        .in('loc_state', simpleCodes);
      if (!error && data) {
        data.forEach(r => allIds.add(r.greenhouse_id));
      }
      console.log(`[BJ] Batched state search: [${simpleCodes.join(',')}] → ${data?.length || 0} jobs`);
    } catch(e) { reportError('job-feed', e); console.warn('[BJ] Batched state search failed', e);
    }
  }

  // Parallel queries for ambiguous states (need exclusion filters)
  if (ambiguousPills.length > 0) {
    const ambigResults = await Promise.allSettled(ambiguousPills.map(pill => {
      let query = sb.from('ats_jobs').select('greenhouse_id').eq('status', 'open').eq('loc_state', pill.stateCode);
      const exclusions = ambiguousExclusions[pill.stateCode];
      for (const excl of exclusions) {
        query = query.not('location', 'ilike', `%${excl}%`);
      }
      query = query.not('loc_country', 'eq', pill.stateCode);
      query = query.not('location', 'ilike', 'Remote -%');
      return query.then(r => ({ pill, ...r }));
    }));
    for (const result of ambigResults) {
      if (result.status === 'fulfilled' && !result.value.error && result.value.data) {
        result.value.data.forEach(r => allIds.add(r.greenhouse_id));
        console.log(`[BJ] Ambiguous state search: ${result.value.pill.stateCode} → ${result.value.data.length} jobs`);
      }
    }
  }

  // Remote search — either from explicit Remote pill OR includeRemote toggle
  // If Remote is the ONLY location pill type (no radius/state), skip pre-fetching IDs.
  // The ID set would be too large (30K+) and gets truncated to 200 in buildFilterQuery.
  // Instead, return null so buildFilterQuery uses inline ilike filtering.
  const hasNonRemotePills = radiusPills.length > 0 || statePills.length > 0;
  // v7.68: For text pills (e.g. "united states") + includeRemote, return null early.
  // buildFilterQuery handles includeRemote by injecting remote into the OR clause.
  // Fetching 30K+ remote IDs here would be wasteful — let SQL do it inline.
  const shouldSearchRemote = remotePills.length > 0 || (includeRemote && hasNonRemotePills);
  
  if (remotePills.length > 0 && !hasNonRemotePills && textPills.length === 0) {
    // Pure remote search — let buildFilterQuery handle it with ilike
    return { includeIds: null, excludeIds: new Set(), boundingBox: null, isUSSearch: false, isRemoteOnly: true, _stateCodes: [], _radiusPills: [], _hasRemote: true };
  }
  
  if (shouldSearchRemote) {
    try {
      const { data, error } = await sb
        .from('ats_jobs')
        .select('greenhouse_id')
        .eq('status', 'open')
        .or('loc_type.eq.remote,location.ilike.%remote%');
      if (!error && data) {
        data.forEach(r => allIds.add(r.greenhouse_id));
      }
      console.log(`[BJ] Remote search → ${data?.length || 0} jobs`);
    } catch(e) { reportError('job-feed', e); console.warn('[BJ] Remote search failed', e);
    }
  }

  // For text-only pills, return null to trigger ilike fallback
  // But if we have mixed pills, we need to also include text matches
  if (textPills.length > 0 && allIds.size > 0) {
    // Run ilike queries for text pills and merge
    for (const pill of textPills) {
      for (const v of pill.values) {
        try {
          const { data, error } = await sb
            .from('ats_jobs')
            .select('greenhouse_id')
            .eq('status', 'open')
            .or(`location.ilike.%${v}%,loc_display.ilike.%${v}%,loc_state.ilike.%${v}%`);
          if (!error && data) {
            data.forEach(r => allIds.add(r.greenhouse_id));
          }
        } catch(e) { reportError('job-feed', e); console.warn('[BJ] Text location search failed for', v, e);
        }
      }
    }
  } else if (textPills.length > 0 && allIds.size === 0) {
    // Only text pills, no radius/state — return null for ilike fallback
    return null;
  }

  // Compute bounding box from radius pills for fallback
  let boundingBox = null;
  if (radiusPills.length > 0) {
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const pill of radiusPills) {
      const latDelta = pill.radius_mi / 69.0;
      const lngDelta = pill.radius_mi / (69.0 * Math.cos(pill.lat * Math.PI / 180));
      minLat = Math.min(minLat, pill.lat - latDelta);
      maxLat = Math.max(maxLat, pill.lat + latDelta);
      minLng = Math.min(minLng, pill.lng - lngDelta);
      maxLng = Math.max(maxLng, pill.lng + lngDelta);
    }
    boundingBox = { minLat, maxLat, minLng, maxLng };
  }

  // Determine if this is a US-targeted search (for country disambiguation)
  // US lat range is roughly 24-49, lng -125 to -66
  let isUSSearch = false;
  for (const pill of radiusPills) {
    if (pill.lat >= 24 && pill.lat <= 49 && pill.lng >= -130 && pill.lng <= -66) {
      isUSSearch = true;
      break;
    }
  }
  for (const pill of statePills) {
    // State pills are always US states
    isUSSearch = true;
    break;
  }

  return {
    includeIds: [...allIds],
    excludeIds: new Set(),
    boundingBox,
    isUSSearch,
    isRemoteOnly: false,
    // Preserve original search params for SQL-native fallback when ID set is too large
    _stateCodes: simpleCodes.concat(ambiguousPills.map(p => p.stateCode)),
    _radiusPills: radiusPills,
    _hasRemote: remotePills.length > 0 || includeRemote,
  };
}

function buildFilterQuery(sf, baseQuery, locationIds) {
  // ⚠️ RISK R1 (Pill Pipeline Audit v7.69): Multiple .or() calls on a PostgREST query
  // create IMPLICIT ANDs between them. Each .or() becomes a separate `or=` query param,
  // and PostgREST ANDs all top-level params together. This is correct for our use case
  // (WHAT matches AND WHERE matches AND PAY matches) but non-obvious. Adding new .or()
  // calls to this function will silently narrow results. Always verify the generated
  // PostgREST URL when modifying filter logic. See: postgrest.org/en/stable/api/tables_views.html
  let query = baseQuery;

  // Always filter to active/open jobs only
  query = query.eq('status', 'open');

  const w = sf.whatPills || sf.pills || [];
  const wh = sf.wherePills || [];
  const wn = sf.whenPills || [];
  const wo = sf.whoPills || [];
  const wnot = sf.whatNotPills || [];
  const whnot = sf.whereNotPills || [];
  const wonot = sf.whoNotPills || [];

  // Load global tuning settings
  const tuning = safeReadLS('bj_tuning', {});

  // WHAT — title matching via ilike (trigram index) + FA-001 content_tsv (GIN index)
  // All What pills are OR'd together: title ilike OR content_tsv websearch match
  // FA-001: When content search is enabled, each keyword matches against BOTH
  // title (ilike) and content_tsv (wfts/websearch). The GIN index on content_tsv
  // prevents seq scans. Controlled by 'feed_content_search' feature flag.
  // WHAT — title matching via word-boundary regex (imatch) + FA-001 content_tsv
  // Uses PostgreSQL \y word boundaries so "seo" does NOT match "geneseo", "overseo" etc.
  const allWhatClauses = w.flatMap(pill => {
    return pill.values.flatMap(v => {
      const safe = v.replace(/[,()]/g, '').trim();
      if (!safe) return [];
      // Escape regex special chars in the keyword
      const escaped = safe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (_contentSearchEnabled) {
        return [
          `title.imatch.\\y${escaped}\\y`,
          `content_tsv.wfts(english).${safe}`,
        ];
      }
      return [
        `title.imatch.\\y${escaped}\\y`,
      ];
    });
  });
  if (allWhatClauses.length > 0) query = query.or(allWhatClauses.join(','));

  // WHAT NOT — title not ilike + FA-001 content_tsv NOT
  // FA-001: Atomic — never ship positive content search without negative.
  // Each NOT pill excludes from title AND content (when flag enabled).
  for (const pill of wnot) {
    for (const v of pill.values) {
      const term = v.trim().replace(/^nor\s+/i, '');
      if (term) {
        query = query.not('title', 'ilike', `%${term}%`);
        // FA-001: Also exclude from job description content
        // FA-002: NULL-safe — jobs with NULL content_tsv are NOT excluded
        // (only title match matters for those). Without this, NOT(NULL@@term)
        // evaluates to NULL → row excluded, losing jobs during backfill.
        if (_contentSearchEnabled) {
          query = query.or(`not.content_tsv.wfts(english).${term},content_tsv.is.null`);
        }
      }
    }
  }
  // Global title exclusions (FA-001: + content exclusions when flag enabled)
  for (const pill of (tuning.titleExcludes || [])) {
    for (const v of (pill.values || [])) {
      query = query.not('title', 'ilike', `%${v}%`);
      // FA-002: NULL-safe content exclusion (same pattern as NOT pills above)
      if (_contentSearchEnabled) {
        query = query.or(`not.content_tsv.wfts(english).${v},content_tsv.is.null`);
      }
    }
  }

  // WHERE — use pre-fetched location IDs or bounding box
  if (locationIds && locationIds.isRemoteOnly) {
    // Pure remote search — filter inline instead of using pre-fetched IDs
    console.log('[BJ] Location filter: remote-only mode');
    query = query.or('location.ilike.Remote%,location.ilike.%remote%,is_remote.eq.true');
  } else if (locationIds && locationIds.includeIds !== null) {
    console.log(`[BJ] Location filter: ${locationIds.includeIds.length} IDs, boundingBox=${!!locationIds.boundingBox}`);
    if (locationIds.includeIds.length === 0) {
      // No matches — force empty result
      query = query.in('greenhouse_id', ['__NO_MATCH__']);
    } else if (locationIds.includeIds.length <= 200) {
      // Small enough for URL-based .in() query
      query = query.in('greenhouse_id', locationIds.includeIds);
    } else if (locationIds.boundingBox) {
      // Too many IDs — use bounding box filter instead
      // ⚠️ RISK R2 (Pill Pipeline Audit v7.69): Bounding box is a rectangle, not a circle.
      // For border cities, this may include jobs in neighboring countries/states.
      // Monitor via admin error dashboard. Consider PostGIS for precision if complaints arise.
      const bb = locationIds.boundingBox;
      query = query
        .gte('job_lat', bb.minLat)
        .lte('job_lat', bb.maxLat)
        .gte('job_lng', bb.minLng)
        .lte('job_lng', bb.maxLng);
    } else {
      // Too many IDs for .in() and no bounding box — use SQL-native location filters
      // This applies state + radius + remote constraints directly as WHERE clauses
      console.log(`[BJ] Location filter: SQL-native fallback (${locationIds.includeIds.length} IDs too many for .in())`);
      const locClauses = [];

      // State-based filtering
      if (locationIds._stateCodes && locationIds._stateCodes.length > 0) {
        locClauses.push(...locationIds._stateCodes.map(sc => `loc_state.eq.${sc}`));
      }

      // Radius-based: generate bounding box per radius pill
      if (locationIds._radiusPills && locationIds._radiusPills.length > 0) {
        for (const rp of locationIds._radiusPills) {
          const latD = rp.radius_mi / 69;
          const lngD = rp.radius_mi / (69 * Math.cos(rp.lat * Math.PI / 180));
          locClauses.push(
            `and(job_lat.gte.${(rp.lat - latD).toFixed(4)},job_lat.lte.${(rp.lat + latD).toFixed(4)},job_lng.gte.${(rp.lng - lngD).toFixed(4)},job_lng.lte.${(rp.lng + lngD).toFixed(4)})`
          );
        }
      }

      // Remote jobs
      if (locationIds._hasRemote) {
        locClauses.push('loc_type.eq.remote', 'location.ilike.%remote%');
      }

      if (locClauses.length > 0) {
        query = query.or(locClauses.join(','));
      } else {
        // Absolute fallback — shouldn't reach here but prevent empty results
        query = query.in('greenhouse_id', locationIds.includeIds.slice(0, 200));
      }
    }

    // Country disambiguation: if searching US locations, exclude clearly non-US jobs
    // This catches cases like Vancouver, BC being confused with Vancouver, WA
    // v7.70: not('loc_country','eq','CA') generates SQL `loc_country <> 'CA'` which returns
    // FALSE for NULL values — silently excluding every remote job (loc_country=NULL).
    // Fix: use OR that preserves NULLs.
    if (locationIds.isUSSearch) {
      query = query.or('loc_country.neq.CA,loc_country.is.null');
      query = query.not('location', 'ilike', '%Canada%');
      query = query.not('location', 'ilike', '%, BC%');
      query = query.not('location', 'ilike', '%British Columbia%');
    }
  }
  // WHERE NOT — exclude IDs
  if (locationIds && locationIds.excludeIds.size > 0) {
    // Supabase doesn't have a "not in" for large sets easily,
    // so fall back to location ilike for NOT filters
    for (const pill of whnot) {
      for (const v of pill.values) {
        const term = v.trim().replace(/^nor\s+/i, '');
        if (term) query = query.not('location', 'ilike', `%${term}%`);
      }
    }
    for (const pill of (tuning.locationExcludes || [])) {
      for (const v of (pill.values || [])) {
        query = query.not('location', 'ilike', `%${v}%`);
      }
    }
  } else if (!locationIds || locationIds.includeIds === null) {
    // Country name → ISO code mapping for common text pill values
    const COUNTRY_MAP = {
      'united states': 'US', 'usa': 'US', 'us': 'US', 'u.s.': 'US', 'u.s.a.': 'US', 'america': 'US',
      'canada': 'CA', 'united kingdom': 'GB', 'uk': 'GB', 'england': 'GB', 'germany': 'DE',
      'france': 'FR', 'australia': 'AU', 'india': 'IN', 'ireland': 'IE', 'netherlands': 'NL',
      'singapore': 'SG', 'japan': 'JP', 'brazil': 'BR', 'spain': 'ES', 'italy': 'IT',
      'israel': 'IL', 'sweden': 'SE', 'denmark': 'DK', 'norway': 'NO', 'finland': 'FI',
      'new zealand': 'NZ', 'austria': 'AT', 'switzerland': 'CH', 'belgium': 'BE',
      'poland': 'PL', 'mexico': 'MX', 'south korea': 'KR', 'korea': 'KR',
    };

    // Location filtering — search both raw, normalized, and FTS
    // For country names, use loc_country for precise matching
    for (const pill of wh) {
      const allClauses = [];
      for (const v of pill.values) {
        const lower = v.toLowerCase().trim();
        const countryCode = COUNTRY_MAP[lower];
        if (countryCode) {
          // Country name detected — use loc_country match + location ilike for coverage
          allClauses.push(`loc_country.eq.${countryCode}`, `location.ilike.%${v}%`);
        } else {
          // Regular location text — search across all location fields
          allClauses.push(
            `location.ilike.%${v}%`,
            `loc_display.ilike.%${v}%`,
            `loc_country.ilike.%${v}%`
          ); // wfts removed v7.13
        }
      }
      // v7.68: When includeRemote is ON, add remote to the location OR clause.
      // UX-001: When US-Only is active OR the pill is a US country pill, only include
      // US-scoped remote jobs. Bare is_remote=true / loc_type=remote matches worldwide.
      if (sf.includeRemote === true) {
        const pillIsUS = pill.values.some(v => {
          const code = COUNTRY_MAP[v.toLowerCase().trim()];
          return code === 'US';
        });
        if (tuning.usOnly || pillIsUS) {
          // Only remote jobs with US evidence — use shared us-filter.js clauses
          allClauses.push.apply(allClauses, buildUSRemoteClauses());
        } else {
          allClauses.push('location.ilike.Remote%', 'loc_type.eq.remote', 'is_remote.eq.true');
        }
      }
      if (allClauses.length > 0) {
        query = query.or(allClauses.join(','));
      }
    }
    if (tuning.usOnly) {
      // Delegated to shared us-filter.js — single source of truth for US eligibility.
      // Implements 5-category taxonomy with tiered inclusion + explicit non-US exclusions.
      // Sync any logic changes with src/app/pages/dashboard/feed/hooks/us-filter.ts
      query = buildUSOnlyQuery(query);
    }
    for (const pill of whnot) {
      for (const v of pill.values) {
        const term = v.trim().replace(/^nor\s+/i, '');
        if (term) query = query.not('location', 'ilike', `%${term}%`);
      }
    }
    for (const pill of (tuning.locationExcludes || [])) {
      for (const v of (pill.values || [])) {
        query = query.not('location', 'ilike', `%${v}%`);
      }
    }
  }

  // Exclude hourly-rate jobs if tuning says so
  // Use OR to preserve NULL salary_rate rows — .not('salary_rate','eq','hr') generates
  // NOT (salary_rate = 'hr') which is NULL (excluded) for NULL rows, silently dropping
  // the majority of jobs that have no salary rate data.
  if (tuning.excludeHourly) {
    query = query.or('salary_rate.neq.hr,salary_rate.is.null');
  }

  // Exclude staffing agency jobs if tuning says so
  if (tuning.excludeStaffing) {
    query = query.neq('is_staffing_agency', true);
  }

  // Remote job handling
  // Determine if Remote is explicitly in WHERE or NOT WHERE
  const hasExplicitRemote = wh.some(p => p.locType === 'remote' || (p.values && p.values[0]?.toLowerCase() === 'remote'));
  const hasExplicitNotRemote = whnot.some(p => p.values && p.values[0]?.toLowerCase() === 'remote');
  const hasLocationFilter = wh.length > 0 || (locationIds && locationIds.includeIds !== null) || (locationIds && locationIds.isRemoteOnly);
  const includeRemote = sf.includeRemote === true;

  if (hasExplicitNotRemote) {
    // Explicitly exclude remote
    query = query.not('location', 'ilike', 'Remote%');
    query = query.not('loc_type', 'eq', 'remote');
  } else if (!hasExplicitRemote && hasLocationFilter && !includeRemote) {
    // Location filter is active, no explicit Remote pill, toggle is off → exclude remote
    // This prevents "Remote - Berlin, DE" from matching a Delaware search
    query = query.not('location', 'ilike', 'Remote%');
    query = query.not('loc_type', 'eq', 'remote');
  }
  // v7.68: When includeRemote is true, remote clauses are injected into the location
  // OR clause above. The exclusion logic here only fires when includeRemote is OFF.

  // WHO — company_name ilike
  // WHO — company_name ilike + FTS
  for (const pill of wo) {
    if (pill.values.length === 1) {
      query = query.or(`company_name.ilike.%${pill.values[0]}%`); // wfts removed v7.13
    } else {
      const clauses = pill.values.flatMap(v => [
        `company_name.ilike.%${v}%`,
      ]); // wfts removed v7.13
      query = query.or(clauses.join(','));
    }
  }

  // WHO NOT — company_name not ilike
  for (const pill of wonot) {
    for (const v of pill.values) {
      const term = v.trim().replace(/^nor\s+/i, '');
      if (term) query = query.not('company_name', 'ilike', `%${term}%`);
    }
  }
  // Global company exclusions
  for (const pill of (tuning.companyExcludes || [])) {
    for (const v of (pill.values || [])) {
      query = query.not('company_name', 'ilike', `%${v}%`);
    }
  }

  // Global industry exclusions
  const indExcludes = (tuning.industryExcludes || []).map(p => typeof p === 'string' ? p : (p.values ? p.values[0] : p)).filter(Boolean);
  if (indExcludes.length > 0) {
    for (const ind of indExcludes) {
      query = query.not('industry', 'ilike', `%${ind}%`);
    }
  }

  // WHEN — first_seen_at gte (job age based on when we first discovered it, matches DAYS column)
  for (const pill of wn) {
    for (const v of pill.values) {
      const since = parseWhenValue(v);
      if (since) query = query.gte('first_seen_at', since.toISOString());
    }
  }

  // PAY — salary range filter
  const pay = sf.payPills || [];
  if (pay.length > 0) {
    const pill = pay[0]; // only one pay pill expected
    const minVal = pill.min;
    const maxVal = pill.max;
    const includeNoSalary = sf.includeNoSalary !== false; // default true

    if (minVal && maxVal) {
      // Jobs where salary range overlaps the filter range
      if (includeNoSalary) {
        query = query.or(`and(salary_max.gte.${minVal},salary_min.lte.${maxVal}),salary_min.is.null`);
      } else {
        query = query.gte('salary_max', minVal).lte('salary_min', maxVal);
      }
    } else if (minVal) {
      if (includeNoSalary) {
        query = query.or(`salary_max.gte.${minVal},salary_min.is.null`);
      } else {
        query = query.gte('salary_max', minVal);
      }
    } else if (maxVal) {
      if (includeNoSalary) {
        query = query.or(`salary_min.lte.${maxVal},salary_min.is.null`);
      } else {
        query = query.lte('salary_min', maxVal);
      }
    }
  }

  // SKILLS — filter on extracted_skills array (contains any)
  const sk = sf.skillsPills || [];
  for (const pill of sk) {
    const terms = pill.values.map(v => v.trim().toLowerCase()).filter(Boolean);
    if (terms.length > 0) {
      // Use cs (contains) operator — job must have at least one of these skills
      query = query.or(terms.map(t => `extracted_skills.cs.{${t}}`).join(','));
    }
  }

  // LEVEL — filter on extracted_seniority
  const lv = sf.levelPills || [];
  if (lv.length > 0) {
    const levels = lv.flatMap(p => p.values.map(v => v.trim().toLowerCase())).filter(Boolean);
    if (levels.length === 1) {
      query = query.eq('extracted_seniority', levels[0]);
    } else if (levels.length > 1) {
      query = query.in('extracted_seniority', levels);
    }
  }

  // JD CONTAINS — full-text search on content_tsv
  const jd = sf.jdPills || [];
  for (const pill of jd) {
    for (const v of pill.values) {
      const safe = v.replace(/[,()]/g, '').trim();
      if (safe) {
        query = query.textSearch('content_tsv', safe, { type: 'websearch', config: 'english' });
      }
    }
  }

  // DEPARTMENT — filter on extracted_department
  const dp = sf.deptPills || [];
  if (dp.length > 0) {
    const depts = dp.flatMap(p => p.values.map(v => v.trim().toLowerCase())).filter(Boolean);
    if (depts.length === 1) {
      query = query.eq('extracted_department', depts[0]);
    } else if (depts.length > 1) {
      query = query.in('extracted_department', depts);
    }
  }

  return query;
}

// FA-005: Serialize a saved filter + location context + tuning into the JSONB
// format expected by the search_jobs_multi Postgres function.
// Maps client-side pill data structures into flat arrays for SQL WHERE building.
function serializeFilterForRPC(sf, locationIds, tuning) {
  const filter = {};

  // WHAT pills → flat string array
  const w = sf.whatPills || sf.pills || [];
  const whatVals = w.flatMap(p => p.values.map(v => v.replace(/[,()]/g, '').trim())).filter(Boolean);
  if (whatVals.length > 0) filter.what = whatVals;

  // WHAT NOT pills
  const wnot = sf.whatNotPills || [];
  const whatNotVals = wnot.flatMap(p => p.values.map(v => v.trim().replace(/^nor\s+/i, ''))).filter(Boolean);
  if (whatNotVals.length > 0) filter.what_not = whatNotVals;

  // Global title excludes
  const titleExcl = (tuning.titleExcludes || []).flatMap(p => (p.values || []).map(v => v.trim())).filter(Boolean);
  if (titleExcl.length > 0) filter.title_excludes = titleExcl;

  // WHERE — determine mode from locationIds
  if (locationIds && locationIds.isRemoteOnly) {
    filter.where_mode = 'remote_only';
  } else if (locationIds && locationIds.includeIds !== null) {
    filter.where_mode = 'ids';
    filter.where_ids = locationIds.includeIds;
    if (locationIds.boundingBox) {
      filter.where_bbox = locationIds.boundingBox;
    }
    if (locationIds._stateCodes && locationIds._stateCodes.length > 0) {
      filter.where_state_codes = locationIds._stateCodes;
    }
    if (locationIds._radiusPills && locationIds._radiusPills.length > 0) {
      filter.where_radius_bboxes = locationIds._radiusPills.map(rp => {
        const latD = rp.radius_mi / 69;
        const lngD = rp.radius_mi / (69 * Math.cos(rp.lat * Math.PI / 180));
        return {
          min_lat: (rp.lat - latD).toFixed(4),
          max_lat: (rp.lat + latD).toFixed(4),
          min_lng: (rp.lng - lngD).toFixed(4),
          max_lng: (rp.lng + lngD).toFixed(4),
        };
      });
    }
    filter.where_has_remote = locationIds._hasRemote || false;
    filter.where_is_us_search = locationIds.isUSSearch || false;
  } else {
    // Inline text-based location search
    const wh = sf.wherePills || [];
    const whereVals = wh.flatMap(p => p.values).filter(Boolean);
    if (whereVals.length > 0) {
      filter.where_mode = 'inline';
      filter.where_text = whereVals;
    }
  }

  // WHERE NOT pills + global location excludes
  const whnot = sf.whereNotPills || [];
  const whereNotVals = whnot.flatMap(p => p.values.map(v => v.trim().replace(/^nor\s+/i, ''))).filter(Boolean);
  if (whereNotVals.length > 0) filter.where_not = whereNotVals;

  const locExcl = (tuning.locationExcludes || []).flatMap(p => (p.values || []).map(v => v.trim())).filter(Boolean);
  if (locExcl.length > 0) filter.location_excludes = locExcl;

  // US-Only
  if (tuning.usOnly) filter.us_only = true;

  // Remote exclusion logic
  const hasExplicitRemote = (sf.wherePills || []).some(p => p.locType === 'remote' || (p.values && p.values[0]?.toLowerCase() === 'remote'));
  const hasExplicitNotRemote = (sf.whereNotPills || []).some(p => p.values && p.values[0]?.toLowerCase() === 'remote');
  const hasLocationFilter = (sf.wherePills || []).length > 0 || (locationIds && locationIds.includeIds !== null) || (locationIds && locationIds.isRemoteOnly);
  const includeRemote = sf.includeRemote === true;
  if (hasExplicitNotRemote || (!hasExplicitRemote && hasLocationFilter && !includeRemote)) {
    filter.exclude_remote = true;
  }
  if (includeRemote) filter.include_remote = true;

  // Exclude hourly / staffing
  if (tuning.excludeHourly) filter.exclude_hourly = true;
  if (tuning.excludeStaffing) filter.exclude_staffing = true;

  // WHO pills
  const wo = sf.whoPills || [];
  const whoVals = wo.flatMap(p => p.values).filter(Boolean);
  if (whoVals.length > 0) filter.who = whoVals;

  // WHO NOT pills + global company excludes
  const wonot = sf.whoNotPills || [];
  const whoNotVals = wonot.flatMap(p => p.values.map(v => v.trim().replace(/^nor\s+/i, ''))).filter(Boolean);
  if (whoNotVals.length > 0) filter.who_not = whoNotVals;

  const compExcl = (tuning.companyExcludes || []).flatMap(p => (p.values || []).map(v => v.trim())).filter(Boolean);
  if (compExcl.length > 0) filter.company_excludes = compExcl;

  // Global industry excludes
  const indExcl = (tuning.industryExcludes || []).map(p => typeof p === 'string' ? p : (p.values ? p.values[0] : p)).filter(Boolean);
  if (indExcl.length > 0) filter.industry_excludes = indExcl;

  // WHEN pills
  const wn = sf.whenPills || [];
  for (const pill of wn) {
    for (const v of pill.values) {
      const since = parseWhenValue(v);
      if (since) { filter.when_since = since.toISOString(); break; }
    }
    if (filter.when_since) break;
  }

  // PAY pills
  const pay = sf.payPills || [];
  if (pay.length > 0) {
    const pill = pay[0];
    if (pill.min) filter.pay_min = pill.min;
    if (pill.max) filter.pay_max = pill.max;
    filter.include_no_salary = sf.includeNoSalary !== false;
  }

  // SKILLS pills
  const sk = sf.skillsPills || [];
  const skillVals = sk.flatMap(p => p.values.map(v => v.trim().toLowerCase())).filter(Boolean);
  if (skillVals.length > 0) filter.skills = skillVals;

  // LEVEL pills
  const lv = sf.levelPills || [];
  const levelVals = lv.flatMap(p => p.values.map(v => v.trim().toLowerCase())).filter(Boolean);
  if (levelVals.length > 0) filter.levels = levelVals;

  // JD pills
  const jd = sf.jdPills || [];
  const jdVals = jd.flatMap(p => p.values.map(v => v.replace(/[,()]/g, '').trim())).filter(Boolean);
  if (jdVals.length > 0) filter.jd_terms = jdVals;

  // DEPARTMENT pills
  const dp = sf.deptPills || [];
  const deptVals = dp.flatMap(p => p.values.map(v => v.trim().toLowerCase())).filter(Boolean);
  if (deptVals.length > 0) filter.depts = deptVals;

  // Filter identity (for filter tag badges)
  filter.filter_num = sf._filterNum || '';
  filter.filter_color = sf._filterColor || '';

  return filter;
}

/**
 * Normalize free-text WHEN input to a canonical label.
 * Returns { label: string, days: number } or null if unrecognizable.
 * Canonical labels: "today", "yesterday", "last N days", "last N weeks", "last N months"
 */
function normalizeWhenValue(raw) {
  const lower = raw.toLowerCase().trim();
  if (!lower) return null;

  // Exact matches & common aliases
  if (lower === 'today' || lower === '1d' || lower === 'now') return { label: 'today', days: 1 };
  if (lower === 'yesterday' || lower === '2d') return { label: 'yesterday', days: 2 };
  if (/^(this\s+)?week$/.test(lower) || lower === '7d' || lower === '7 days' || lower === '1 week' || lower === '1w') return { label: 'last 7 days', days: 7 };
  if (/^(this\s+)?month$/.test(lower) || lower === '30d' || lower === '30 days' || lower === '1 month' || lower === '1m') return { label: 'last 30 days', days: 30 };
  if (/^3\s*months?$/.test(lower) || lower === '90d' || lower === '90 days' || lower === '3m') return { label: 'last 3 months', days: 90 };
  if (/^6\s*months?$/.test(lower) || lower === '180d' || lower === '6m') return { label: 'last 6 months', days: 180 };

  // Generic "N days" / "Nd" / "last N days"
  var m = lower.match(/(?:last\s+)?(\d+)\s*d(?:ays?)?/);
  if (m) { const n = parseInt(m[1]); return { label: `last ${n} days`, days: n }; }

  // Generic "N weeks" / "Nw" / "last N weeks"
  m = lower.match(/(?:last\s+)?(\d+)\s*w(?:eeks?)?/);
  if (m) { const n = parseInt(m[1]); return { label: `last ${n * 7} days`, days: n * 7 }; }

  // Generic "N months" / "Nm" / "last N months"
  m = lower.match(/(?:last\s+)?(\d+)\s*m(?:onths?)?/);
  if (m) { const n = parseInt(m[1]); return { label: `last ${n * 30} days`, days: n * 30 }; }

  return null;
}

function parseWhenValue(v) {
  const result = normalizeWhenValue(v);
  if (!result) return null;
  const now = new Date();
  const d = new Date(now);
  d.setDate(d.getDate() - result.days);
  return d;
}

function getCheckedSavedFilters() {
  const checks = [...$$('.sf-item-check:checked')];
  return checks.map(cb => {
    const sf = savedFilters[parseInt(cb.dataset.idx)];
    if (sf) {
      sf._filterNum = cb.dataset.filternum;
      sf._filterColor = cb.dataset.filtercolor;
    }
    return sf;
  }).filter(Boolean);
}


// --- Session 5: Convert saved prompt derived_filters to a saved-filter-compatible object ---
function promptDerivedToFilterObj(derived, promptName, promptColor) {
  // derived_filters shape: { keywords:[], locations:[], salary_min:N, salary_max:N, level:'', remote:bool, companies:[], excludeCompanies:[] }
  if (!derived || typeof derived !== 'object') return null;

  var whatPills = [];
  if (derived.keywords && derived.keywords.length > 0) {
    derived.keywords.forEach(function(kw) {
      whatPills.push({ values: [kw] });
    });
  }

  var wherePills = [];
  if (derived.locations && derived.locations.length > 0) {
    derived.locations.forEach(function(loc) {
      wherePills.push({ values: [loc] });
    });
  }

  var whoPills = [];
  if (derived.companies && derived.companies.length > 0) {
    derived.companies.forEach(function(co) {
      whoPills.push({ values: [co] });
    });
  }

  var whoNotPills = [];
  if (derived.excludeCompanies && derived.excludeCompanies.length > 0) {
    derived.excludeCompanies.forEach(function(co) {
      whoNotPills.push({ values: [co] });
    });
  }

  var payPills = [];
  if (derived.salary_min || derived.salary_max) {
    var payVal = '';
    if (derived.salary_min && derived.salary_max) {
      payVal = '$' + (derived.salary_min / 1000) + 'K - $' + (derived.salary_max / 1000) + 'K';
    } else if (derived.salary_min) {
      payVal = '>$' + (derived.salary_min / 1000) + 'K';
    } else {
      payVal = '<$' + (derived.salary_max / 1000) + 'K';
    }
    payPills.push({ values: [payVal], min: derived.salary_min || 0, max: derived.salary_max || 999999 });
  }

  return {
    name: promptName || 'Chat Prompt',
    whatPills: whatPills,
    wherePills: wherePills,
    whenPills: [],
    whoPills: whoPills,
    whatNotPills: [],
    whereNotPills: [],
    whoNotPills: whoNotPills,
    payPills: payPills,
    includeNoSalary: !derived.salary_min && !derived.salary_max,
    includeRemote: !!derived.remote,
    _isPromptDerived: true,
    _promptName: promptName || 'Chat Prompt',
    _filterNum: promptColor || '',
    _filterColor: promptColor || '',
  };
}

// Get checked saved prompts from filter selector (Session 5)
function getCheckedSavedPromptFilters() {
  var checks = document.querySelectorAll('.sf-prompt-check:checked');
  var results = [];
  if (!checks || checks.length === 0) return results;
  if (typeof _savedPrompts === 'undefined' || !_savedPrompts) return results;

  checks.forEach(function(cb) {
    var promptId = cb.dataset.promptId;
    var prompt = _savedPrompts.find(function(p) { return p.id === promptId; });
    if (prompt && prompt.derived_filters && Object.keys(prompt.derived_filters).length > 0) {
      var PROMPT_COLORS = ['#3b82f6','var(--green)','var(--warm)','var(--red)','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16'];
      var color = PROMPT_COLORS[prompt.color_index || 0] || '#3b82f6';
      var filterObj = promptDerivedToFilterObj(prompt.derived_filters, prompt.name, color);
      if (filterObj) results.push(filterObj);
    }
  });
  return results;
}

// Main search: OR across all checked saved filters
async function searchJobs(page = 0) {
  currentJobPage = page;
  // UX-006: Scroll to top of job table on page change
  if (page > 0) {
    var jobTable = $('#job-table');
    if (jobTable) jobTable.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const tbody = $('#job-table-body');
  const checked = getCheckedSavedFilters();
  const checkedPrompts = getCheckedSavedPromptFilters(); // Session 5: prompt-derived filters
  const hasBuilderPills = allPills() > 0;

  // If nothing is driving the search, show prompt but with global stats
  if (checked.length === 0 && checkedPrompts.length === 0 && !hasBuilderPills) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-faint);padding:48px 12px;">
      <div style="margin-bottom:12px;color:var(--text-faint);"><i data-lucide="briefcase" class="icon-xl icon-stroke-lg" style="opacity:0.25;"></i></div>
      <div style="font-size:14px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">Select saved searches or add filters to search jobs</div>
      <div style="font-size:12px;max-width:360px;margin:0 auto;line-height:1.5;">Check one or more saved searches above, or use the filter builder.</div>
    </td></tr>`;
    await updateJobStatsFromFilters(null);
    $('#filter-count').textContent = '';
    return;
  }

  // Show skeleton loading
  tbody.innerHTML = Array.from({length: 8}, () => `<tr class="skel-row">
    <td><div class="skel-line" style="width:24px;height:14px;"></div></td>
    <td><div class="skel-line" style="width:70%;"></div></td>
    <td><div class="skel-line" style="width:60%;"></div></td>
    <td><div class="skel-line" style="width:50%;"></div></td>
    <td><div class="skel-line" style="width:40px;"></div></td>
    <td><div class="skel-line" style="width:55%;"></div></td>
    <td><div class="skel-line" style="width:50%;"></div></td>
    <td><div class="skel-line" style="width:30px;"></div></td>
    <td><div class="skel-line" style="width:45%;"></div></td>
  </tr>`).join('');

  try {
    // FA-001: Evaluate content search flag once per search (async, before query building)
    if (typeof isFeatureEnabled === 'function') {
      try { _contentSearchEnabled = await isFeatureEnabled('feed_content_search', false); }
      catch (e) { _contentSearchEnabled = false; }
      // FA-005: Evaluate server merge flag
      try { _serverMergeEnabled = await isFeatureEnabled('feed_server_merge', false); }
      catch (e) { _serverMergeEnabled = false; }
      // FA-006: Evaluate server trust/AI filter flag
      try { _serverTrustFilterEnabled = await isFeatureEnabled('feed_server_trust_filter', false); }
      catch (e) { _serverTrustFilterEnabled = false; }
    }

    // FA-010: Capture search start time for latency measurement
    var _searchStartMs = Date.now();

    // Build list of filters to run
    let filtersToRun = [];
    if (checked.length > 0 || checkedPrompts.length > 0) {
      filtersToRun = [...checked, ...checkedPrompts]; // Session 5: merge saved filters + prompt-derived
    } else if (hasBuilderPills) {
      filtersToRun = [{
        whatPills: JSON.parse(JSON.stringify(whatPills)),
        wherePills: JSON.parse(JSON.stringify(wherePills)),
        whenPills: JSON.parse(JSON.stringify(whenPills)),
        whoPills: JSON.parse(JSON.stringify(whoPills)),
        payPills: JSON.parse(JSON.stringify(payPills)),
        whatNotPills: JSON.parse(JSON.stringify(whatNotPills)),
        whereNotPills: JSON.parse(JSON.stringify(whereNotPills)),
        whoNotPills: JSON.parse(JSON.stringify(whoNotPills)),
        includeNoSalary: $('#save-filter-include-no-salary').checked,
        includeRemote: $('#save-filter-include-remote').checked,
      }];
    }

    // Check that at least one filter has real criteria
    console.log('[searchJobs] filtersToRun:', filtersToRun.length, 'filters');
    filtersToRun.forEach((sf, i) => {
      console.log(`[searchJobs] filter[${i}]:`,
        'what=', (sf.whatPills || sf.pills || []).flatMap(p => p.values),
        'where=', (sf.wherePills || []).flatMap(p => p.values),
        'when=', (sf.whenPills || []).flatMap(p => p.values),
        'who=', (sf.whoPills || []).flatMap(p => p.values),
      );
    });
    // Session 5: _chatFilterOverride from live chat conversation -> inject as filter
    if (filtersToRun.length === 0 && window._chatFilterOverride) {
      var overrideFilter = promptDerivedToFilterObj(window._chatFilterOverride, 'Live Chat', '#3b82f6');
      if (overrideFilter) {
        filtersToRun = [overrideFilter];
        window._chatFilterOverride = null; // consume once
      }
    }

    const hasRealCriteria = filtersToRun.some(sf => {
      const w = sf.whatPills || sf.pills || [];
      const wh = sf.wherePills || [];
      const wn = sf.whenPills || [];
      const wo = sf.whoPills || [];
      const wnot = sf.whatNotPills || [];
      const whnot = sf.whereNotPills || [];
      const wonot = sf.whoNotPills || [];
      return w.length > 0 || wh.length > 0 || wn.length > 0 || wo.length > 0 || wnot.length > 0 || whnot.length > 0 || wonot.length > 0;
    });

    if (!hasRealCriteria) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-faint);padding:48px 12px;">
        <div style="font-size:14px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">No filter criteria set</div>
        <div style="font-size:12px;">Add at least one What, Where, When, or Who filter.</div>
      </td></tr>`;
      updateJobStats(0, 0, 0, 0);
      $('#filter-count').textContent = '';
      return;
    }

    // For multiple checked filters, we run each as a separate query then merge
    // Supabase doesn't support OR across separate ilike groups easily
    // So we fetch per filter and deduplicate
    allJobs = [];
    let totalCount = 0;
    const seenIds = new Set();

    // Pre-fetch location IDs for all filters that have where pills
    const tuningForLoc = safeReadLS('bj_tuning', {});
    const locationIdCache = new Map();
    for (const sf of filtersToRun) {
      const wh = sf.wherePills || [];
      const whnot = sf.whereNotPills || [];
      const cacheKey = JSON.stringify({ wh, whnot, usOnly: tuningForLoc.usOnly, locExcl: tuningForLoc.locationExcludes, includeRemote: sf.includeRemote });
      if (!locationIdCache.has(cacheKey)) {
        const locIds = await getLocationMatchIds(wh, whnot, tuningForLoc, sf.includeRemote === true);
        locationIdCache.set(cacheKey, locIds);
      }
      sf._locationIds = locationIdCache.get(cacheKey);
    }

    // Hidden job IDs to exclude from queries
    const hiddenIds = hiddenJobIds.map(h => h.id);

    // Check if relevance sort is active and JD/text search terms exist
    const relevanceSort = jobSortStack.length > 0 && jobSortStack[0].field === 'relevance';
    const jdTerms = (filtersToRun[0]?.jdPills || []).flatMap(p => p.values).filter(Boolean);
    const whatTerms = (filtersToRun[0]?.whatPills || filtersToRun[0]?.pills || []).flatMap(p => p.values).filter(Boolean);
    const searchTerms = [...jdTerms, ...whatTerms].join(' ').trim();

    // FA-006: Determine if server-side trust/AI filtering is needed
    const _trustFilterNeedsServer = _serverTrustFilterEnabled && isTrustFilterActive();
    const _aiFilterNeedsServer = _serverTrustFilterEnabled && isAiFilterActive();
    const _needsServerTrustFilter = _trustFilterNeedsServer || _aiFilterNeedsServer;
    // Build trust/AI label arrays for RPC (null = no filter = all labels pass)
    const _rpcTrustLabels = _trustFilterNeedsServer ? Array.from(getActiveTrustLabels()) : null;
    const _rpcAiLabels = _aiFilterNeedsServer ? Array.from(getActiveAiLabels()) : null;

    if (filtersToRun.length === 1 && !_needsServerTrustFilter) {
      // Single filter — FA-004: real server-side pagination via range()
      // FA-006: Only uses PostgREST path when trust/AI filters are NOT active
      // QA-010: Include sort stack in cache key so sort changes bust the cache
      const _sortKey = jobSortStack.map(s => s.field + (s.asc ? 'A' : 'D')).join(',');
      const feedCacheKey = 'feed:' + _filterCacheKey('single', filtersToRun[0]) + ':s' + _sortKey + ':p' + page;
      const feedResult = await cachedQuery(feedCacheKey, async function() {
        let query = sb.from('ats_jobs').select('*', { count: 'exact' });
        query = buildFilterQuery(filtersToRun[0], query, filtersToRun[0]._locationIds);
        if (hiddenIds.length > 0) {
          query = query.not('greenhouse_id', 'in', `(${hiddenIds.join(',')})`);
        }
        // Multi-sort (skip 'level' — client-side only)
        for (const s of jobSortStack) {
          if (s.field === 'level' || s.field === 'match' || s.field === 'relevance') continue;
          query = query.order(s.field, { ascending: s.asc });
        }
        // FA-004: no cap — each page is one lightweight DB query
        const from = page * JOBS_PER_PAGE;
        const to = from + JOBS_PER_PAGE - 1;
        query = query.range(from, to);
        return query;
      }, { ttl: 180000 }); // 3-min TTL for feed queries
      const jobs = feedResult.data || [];
      allJobs = jobs.map(j => ({ ...j, _filterNums: [{ num: filtersToRun[0]._filterNum || '', color: filtersToRun[0]._filterColor || '' }] }));
      totalCount = feedResult.count || 0;
      _feedTotalCount = totalCount;
      _feedLoadMoreOffset = (page + 1) * JOBS_PER_PAGE;
    } else if (_serverMergeEnabled || _needsServerTrustFilter) {
      // FA-005/FA-006: Server-side RPC path
      // Handles multi-filter merge AND/OR server-side trust/AI filtering
      // Single round trip — filter, dedup, sort, paginate all happen in the DB
      const tuning = safeReadLS('bj_tuning', {});
      const rpcFilters = filtersToRun.map(sf => serializeFilterForRPC(sf, sf._locationIds, tuning));

      // Determine sort column (skip client-only sorts)
      let sortCol = 'updated_at';
      let sortAsc = false;
      for (const s of jobSortStack) {
        if (s.field === 'level' || s.field === 'match' || s.field === 'relevance') continue;
        sortCol = s.field;
        sortAsc = s.asc;
        break;
      }

      console.log('[BJ] FA-005/FA-006: Server-side RPC — %d filters, page %d, sort=%s %s, trust=%s, ai=%s',
        rpcFilters.length, page, sortCol, sortAsc ? 'ASC' : 'DESC',
        _rpcTrustLabels ? _rpcTrustLabels.join(',') : 'off',
        _rpcAiLabels ? _rpcAiLabels.join(',') : 'off');

      const { data: rpcResult, error: rpcError } = await sb.rpc('search_jobs_multi', {
        p_filters: rpcFilters,
        p_sort_col: sortCol,
        p_sort_asc: sortAsc,
        p_page: page,
        p_per_page: JOBS_PER_PAGE,
        p_hidden_ids: hiddenIds,
        p_content_search: _contentSearchEnabled,
        p_trust_labels: _rpcTrustLabels,   // FA-006: server-side trust filter (null = no filter)
        p_ai_labels: _rpcAiLabels,         // FA-006: server-side AI filter (null = no filter)
      });

      if (rpcError) {
        console.error('[BJ] FA-005/FA-006 RPC error, falling back to client-side:', rpcError);
        // Fall through to client-side merge below
        _serverMergeEnabled = false;
        _serverTrustFilterEnabled = false;
        // Re-run searchJobs to use fallback path
        return searchJobs();
      }

      const resultData = rpcResult || { data: [], count: 0 };
      const serverJobs = resultData.data || [];

      // FA-006: Populate fraud/AI caches from server-returned data for badge rendering
      serverJobs.forEach(function(job) {
        if (job._fraud_label != null) {
          _fraudScoreCache[job.greenhouse_id] = {
            score: job._fraud_score,
            label: job._fraud_label,
            signals: job._fraud_signals || [],
            confidence: job._fraud_confidence,
          };
        }
        if (job._ai_label != null) {
          _aiJdScoreCache[job.greenhouse_id] = {
            label: job._ai_label,
            score: job._ai_score,
            confidence: job._ai_confidence,
            summary: job._ai_summary,
            perplexity: job._ai_perplexity,
            burstiness: job._ai_burstiness,
            topSignals: job._ai_signals || [],
          };
        }
      });

      // Re-attach _filterNums from the _filter_idxs array returned by the function
      // _filter_idxs contains the 1-based filter indices that matched each job
      allJobs = serverJobs.map(job => {
        const filterIdxs = job._filter_idxs || [];
        const filterNums = filterIdxs.map(idx => {
          const sf = filtersToRun[idx - 1]; // 1-based → 0-based
          return sf ? { num: sf._filterNum || '', color: sf._filterColor || '' } : { num: '', color: '' };
        });
        // Clean up server-internal fields
        delete job._filter_idxs;
        delete job._fraud_score; delete job._fraud_label; delete job._fraud_confidence; delete job._fraud_signals;
        delete job._ai_label; delete job._ai_score; delete job._ai_confidence;
        delete job._ai_summary; delete job._ai_perplexity; delete job._ai_burstiness; delete job._ai_signals;
        return { ...job, _filterNums: filterNums };
      });

      totalCount = resultData.count || 0;
      _feedTotalCount = totalCount;
      _feedLoadMoreOffset = (page + 1) * JOBS_PER_PAGE;

    } else {
      // Multiple filters — client-side merge (pre-FA-005 fallback)
      // FA-004: raised per-filter limit. FA-005 server-side UNION is preferred.
      const perFilter = Math.min(Math.ceil(2000 / filtersToRun.length), 500);
      const promises = filtersToRun.map(sf => {
        let q = sb.from('ats_jobs').select('*', { count: 'exact' });
        q = buildFilterQuery(sf, q, sf._locationIds);
        if (hiddenIds.length > 0) {
          q = q.not('greenhouse_id', 'in', `(${hiddenIds.join(',')})`);
        }
        for (const s of jobSortStack) {
          if (s.field === 'level' || s.field === 'match' || s.field === 'relevance') continue;
          q = q.order(s.field, { ascending: s.asc });
        }
        q = q.range(0, perFilter - 1);
        return q;
      });

      const results = await Promise.all(promises);
      let maxTotal = 0;
      const jobFilterMap = new Map(); // greenhouse_id -> [{num, color}]
      results.forEach((r, i) => {
        if (r.error) throw r.error;
        maxTotal += (r.count || 0);
        const fm = { num: filtersToRun[i]._filterNum || '', color: filtersToRun[i]._filterColor || '' };
        for (const job of (r.data || [])) {
          if (jobFilterMap.has(job.greenhouse_id)) {
            jobFilterMap.get(job.greenhouse_id).push(fm);
          } else {
            jobFilterMap.set(job.greenhouse_id, [fm]);
          }
          if (!seenIds.has(job.greenhouse_id)) {
            seenIds.add(job.greenhouse_id);
            allJobs.push(job);
          }
        }
      });
      // Attach filter tags to jobs
      allJobs.forEach(j => { j._filterNums = jobFilterMap.get(j.greenhouse_id) || []; });
      totalCount = maxTotal; // approximate (some overlap)

      // Client-side sort the merged results
      allJobs.sort((a, b) => {
        for (const s of jobSortStack) {
          const va = a[s.field] || '';
          const vb = b[s.field] || '';
          const cmp = va < vb ? -1 : va > vb ? 1 : 0;
          if (cmp !== 0) return s.asc ? cmp : -cmp;
        }
        return 0;
      });

      // Paginate client-side
      const from = page * JOBS_PER_PAGE;
      allJobs = allJobs.slice(from, from + JOBS_PER_PAGE);
    }

    // Hidden jobs already excluded at query level — no client-side filter needed
    currentJobs = allJobs;

    // Update filter count display — include WHEN notice if time-filtered
    // NOTE: This is the initial count from DB; will be reconciled after client-side filters below.
    const activeWhenPills = filtersToRun.flatMap(f => (f.whenPills || []).flatMap(p => p.values)).filter(Boolean);
    // Don't show count yet — wait for client-side filter reconciliation to avoid misleading flash
    $('#filter-count').innerHTML = `<span style="color:var(--text-faint);font-size:12px;">Searching…</span>`;

    // Update top stat cards
    await updateJobStatsFromFilters(filtersToRun);

    if (currentJobs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-faint);padding:48px 12px;">
        <div style="font-size:14px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">No jobs match — try broadening your search or adjusting your filters</div>
        <div style="font-size:12px;">Try broader terms or fewer filters.</div>
      </td></tr>`;
      return;
    }

    // Determine active level hierarchy — use first checked filter's custom hierarchy, or fall back to global
    let activeLevelHierarchy = levelHierarchy;
    if (filtersToRun.length > 0 && filtersToRun[0].levelHierarchy) {
      activeLevelHierarchy = filtersToRun[0].levelHierarchy;
    }
    // Store for renderJobRows to use
    window._activeLevelHierarchy = activeLevelHierarchy;

    // Client-side level sort if level is in the sort stack
    const levelSort = jobSortStack.find(s => s.field === 'level');
    if (levelSort) {
      currentJobs.sort((a, b) => {
        const la = getJobLevel(a.title, activeLevelHierarchy);
        const lb = getJobLevel(b.title, activeLevelHierarchy);
        const ra = la ? la.rank : 999;
        const rb = lb ? lb.rank : 999;
        return levelSort.asc ? rb - ra : ra - rb;
      });
    }

    // Client-side match sort
    const matchSort = jobSortStack.find(s => s.field === 'match');

    // Relevance sort — score jobs by how many search terms appear in title
    const relevanceSortActive = jobSortStack.find(s => s.field === 'relevance');
    if (relevanceSortActive && searchTerms) {
      const terms = searchTerms.toLowerCase().split(/\s+/).filter(t => t.length > 2);
      if (terms.length > 0) {
        allJobs.forEach(j => {
          const titleLower = (j.title || '').toLowerCase();
          const locLower = (j.location || '').toLowerCase();
          const compLower = (j.company_name || '').toLowerCase();
          let score = 0;
          for (const t of terms) {
            if (titleLower.includes(t)) score += 3;
            if (compLower.includes(t)) score += 1;
            if (locLower.includes(t)) score += 1;
          }
          // Boost if skills match
          if (j.extracted_skills && j.extracted_skills.length > 0) {
            for (const t of terms) {
              if (j.extracted_skills.some(s => s.includes(t))) score += 2;
            }
          }
          j._relevanceScore = score;
        });
        allJobs.sort((a, b) => (b._relevanceScore || 0) - (a._relevanceScore || 0));
      }
    }
    if (matchSort) {
      currentJobs.sort((a, b) => {
        const ra = jobMatchScores[a.greenhouse_id];
        const rb = jobMatchScores[b.greenhouse_id];
        const sa = ra ? (typeof ra === 'number' ? ra : ra.score) : -1;
        const sb2 = rb ? (typeof rb === 'number' ? rb : rb.score) : -1;
        return matchSort.asc ? sa - sb2 : sb2 - sa;
      });
    }

    // Fetch fraud scores for visible jobs
    // FA-006: Skip when server-side trust filter is on (caches populated from RPC results)
    if (!_serverTrustFilterEnabled) {
      await fetchFraudScores(currentJobs);
    }

    // Fetch AI JD scores for visible jobs (v6.41)
    // FA-006: Skip when server-side trust filter is on (caches populated from RPC results)
    if (!_serverTrustFilterEnabled) {
      await fetchAiJdScores(currentJobs);
    }

    // Phase 4: Apply trust level filter (client-side post-filter)
    // ⚠️ RISK R4 (Pill Pipeline Audit v7.69): Client-side filters (trust, AI content) reduce
    // results AFTER the DB query returns. Pagination is DB-side (LIMIT 50), so a page may show
    // fewer than 50 visible rows after client-side filtering. "Load More" might even load pages
    // with 0 visible rows. Long-term fix: move trust/AI filtering server-side.
    // FA-006: When _serverTrustFilterEnabled, filtering happens in the DB — skip client-side
    if (!_serverTrustFilterEnabled && isTrustFilterActive()) {
      currentJobs = applyTrustFilter(currentJobs);
      totalCount = currentJobs.length;
    }

    // Phase 72 Session 3.3: Apply AI content filter (client-side post-filter)
    // FA-006: When _serverTrustFilterEnabled, filtering happens in the DB — skip client-side
    if (!_serverTrustFilterEnabled && isAiFilterActive()) {
      currentJobs = applyAiContentFilter(currentJobs);
      totalCount = currentJobs.length;
      if (typeof posthog !== 'undefined') {
        posthog.capture('ai_filter_applied', { active_labels: Array.from(getActiveAiLabels()) });
      }
    }

    // Phase 72 Session 4.1: Apply AI scoring exclusions (dimmed badges, deprioritized)
    const beforeExclusions = currentJobs.length;
    currentJobs = applyAiScoringExclusions(currentJobs);
    const exclusionsActive = currentJobs.length !== beforeExclusions;

    // v7.18+v7.68: Sync counts after ALL client-side filters
    // _feedTotalCount = exact DB count; currentJobs.length = this page after client filters
    // For single-page results (no more pages), use currentJobs.length as truth
    // For multi-page, use DB total but note client filters may reduce each page
    var pageJobCount = currentJobs.length;
    if (_feedTotalCount > 0 && pageJobCount < JOBS_PER_PAGE && page === 0) {
      // All results fit on one page — actual total IS what we see after client filters
      totalCount = pageJobCount;
      _feedTotalCount = pageJobCount;
    } else if (page === 0 && pageJobCount >= JOBS_PER_PAGE) {
      // Full first page — DB total is the right number for display
      totalCount = _feedTotalCount;
    } else {
      totalCount = _feedTotalCount;
    }
    var $jt = $('#j-total');
    if ($jt) $jt.textContent = totalCount.toLocaleString();

    // v7.68: Reconcile filter-count with actual post-filter reality
    var activeWhenPillsReconcile = filtersToRun.flatMap(f => (f.whenPills || []).flatMap(p => p.values)).filter(Boolean);
    var reconciledHtml = `<strong>${totalCount.toLocaleString()}</strong> job${totalCount !== 1 ? 's' : ''} found`;
    if (activeWhenPillsReconcile.length > 0) {
      reconciledHtml += ` <span style="color:var(--purple);font-size:11px;font-weight:600;margin-left:6px;">⏱ ${activeWhenPillsReconcile[0]}</span>`;
    }
    $('#filter-count').innerHTML = reconciledHtml;

    // v7.18: Sync j-new to match jobs actually shown with green "new" styling (last 24h)
    // DB query uses rolling 24h but client-side filters may remove some; sync to rendered set
    var _now18 = new Date();
    var _24hAgo = new Date(_now18.getTime() - 86400000);
    var _renderedNewCount = currentJobs.filter(function(j) {
      return j.first_seen_at && new Date(j.first_seen_at) >= _24hAgo;
    }).length;
    var $jnew = $('#j-new');
    if ($jnew) $jnew.textContent = _renderedNewCount.toLocaleString();

    // v7.19: Re-sync intel insight card after all client-side filters applied
    // (updateJobStats above ran with DB totals before trust/AI/exclusion filters)
    if (typeof updateIntelInsight === 'function') {
      var jcos = $('#j-companies');
      var coCount = jcos ? parseInt(jcos.textContent.replace(/,/g,''), 10) || 0 : 0;
      updateIntelInsight(totalCount, coCount, _renderedNewCount);
    }

    renderJobRows(currentJobs, totalCount, page, filtersToRun);

    // P13-04: Track search for micro-survey trigger
    if (typeof trackSearchForSurvey === 'function') {
      var filterLabel = filtersToRun[0]?.name || 'builder';
      trackSearchForSurvey(filterLabel, totalCount);
    }

    // ═══════════════════════════════════════════════════════════════════
    // FA-010: PostHog Feed Instrumentation — Baseline Before Fixes
    // Ships BEFORE accuracy/pagination fixes to capture pre-sprint metrics.
    // Every subsequent FA session measures impact against this baseline.
    // ═══════════════════════════════════════════════════════════════════
    if (typeof posthog !== 'undefined') {
      var _faLatencyMs = Date.now() - _searchStartMs;

      // Determine search mode
      var _faSearchMode = 'builder';
      if (checked.length > 0 && checkedPrompts.length > 0) _faSearchMode = 'saved_filter+prompt';
      else if (checkedPrompts.length > 0) _faSearchMode = 'prompt';
      else if (checked.length > 0) _faSearchMode = 'saved_filter';

      // Count client-side filtered out jobs (trust + AI post-filters)
      var _faPreFilterCount = allJobs.length;
      var _faClientSideFilteredOut = _faPreFilterCount - currentJobs.length;

      // Collect pill counts from the primary filter
      var _faPrimaryFilter = filtersToRun[0] || {};
      var _faFilterNames = filtersToRun.map(function(f) { return f.name || 'builder'; });
      var _faWhatCount = (_faPrimaryFilter.whatPills || _faPrimaryFilter.pills || []).length;
      var _faWhereCount = (_faPrimaryFilter.wherePills || []).length;
      var _faWhenCount = (_faPrimaryFilter.whenPills || []).length;
      var _faWhoCount = (_faPrimaryFilter.whoPills || []).length;
      var _faPayCount = (_faPrimaryFilter.payPills || []).length;
      var _faTuning = safeReadLS('bj_tuning', {});

      // US-Only leakage: count returned jobs where loc_country IS NULL
      var _faNullLocCountry = 0;
      for (var _fi = 0; _fi < currentJobs.length; _fi++) {
        if (!currentJobs[_fi].loc_country) _faNullLocCountry++;
      }

      // Content match tracking: count jobs where title does NOT contain
      // any What pill keyword but the job was still returned (content match).
      // Pre-FA-001 this will be 0 (title-only search). After FA-001 it should spike.
      var _faContentMatchCount = 0;
      var _faWhatTerms = (_faPrimaryFilter.whatPills || _faPrimaryFilter.pills || []).flatMap(function(p) { return p.values || []; });
      if (_faWhatTerms.length > 0) {
        for (var _fj = 0; _fj < currentJobs.length; _fj++) {
          var _fjTitle = (currentJobs[_fj].title || '').toLowerCase();
          var _fjTitleMatch = false;
          for (var _fk = 0; _fk < _faWhatTerms.length; _fk++) {
            if (_fjTitle.indexOf(_faWhatTerms[_fk].toLowerCase()) !== -1) { _fjTitleMatch = true; break; }
          }
          if (!_fjTitleMatch) _faContentMatchCount++;
        }
      }

      // Core event: feed_search_completed
      posthog.capture('feed_search_completed', {
        total_count: totalCount,
        page_jobs_count: currentJobs.length,
        page_number: page,
        filters_active_count: filtersToRun.length,
        filter_names: _faFilterNames,
        us_only: !!_faTuning.usOnly,
        include_remote: !!_faPrimaryFilter.includeRemote,
        include_no_salary: !!_faPrimaryFilter.includeNoSalary,
        trust_filter_active: typeof isTrustFilterActive === 'function' && isTrustFilterActive(),
        ai_filter_active: typeof isAiFilterActive === 'function' && isAiFilterActive(),
        what_pills_count: _faWhatCount,
        where_pills_count: _faWhereCount,
        when_pills_count: _faWhenCount,
        who_pills_count: _faWhoCount,
        pay_pills_count: _faPayCount,
        client_side_filtered_out: _faClientSideFilteredOut,
        search_mode: _faSearchMode,
        latency_ms: _faLatencyMs,
        is_zero_results: totalCount === 0,
        null_loc_country_count: _faNullLocCountry,
        content_match_count: _faContentMatchCount,
        content_search_enabled: _contentSearchEnabled,  // FA-001: segment pre/post content search
        pagination_uncapped: true,  // FA-004: segment pre/post 500-row cap removal
        server_merge_enabled: _serverMergeEnabled,  // FA-005: segment pre/post server-side merge
        server_trust_filter_enabled: _serverTrustFilterEnabled  // FA-006: segment pre/post server-side trust/AI filter
      });

      // Distinct zero-results event (alert trigger)
      if (totalCount === 0) {
        posthog.capture('feed_zero_results', {
          filters_active_count: filtersToRun.length,
          filter_names: _faFilterNames,
          search_mode: _faSearchMode,
          us_only: !!_faTuning.usOnly,
          include_remote: !!_faPrimaryFilter.includeRemote,
          what_pills_count: _faWhatCount,
          where_pills_count: _faWhereCount,
          when_pills_count: _faWhenCount,
          who_pills_count: _faWhoCount,
          pay_pills_count: _faPayCount
        });
      }

      // Page turn event (page > 0 means user clicked Load More or Back to Top)
      if (page > 0) {
        posthog.capture('feed_page_turn', {
          page_number: page,
          direction: 'next',
          total_count: totalCount,
          latency_ms: _faLatencyMs
        });
      }
    }
    // ═══════════════════════════════════════════════════════════════════

  } catch (e) {
    reportError('job_feed', e);
    console.error('Search error:', e);

    // FA-010: Track search errors
    if (typeof posthog !== 'undefined') {
      posthog.capture('feed_search_error', {
        error_message: e.message || String(e),
        filters_active_count: filtersToRun ? filtersToRun.length : 0
      });
    }

    if (typeof toastError === 'function') toastError('Job search failed. Please try again.');
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--red);padding:32px 12px;">
      <div style="font-size:13px;">Search failed: ${escapeHtml(e.message)}</div>
    </td></tr>`;
  }
}

// Update top stat cards based on filter results
// If filters is null/empty, show global totals with tuning applied
async function updateJobStatsFromFilters(filters) {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 2 * 86400000); // 48h — includes "1d" jobs in NEW TODAY
    const lastFeedView = localStorage.getItem('bj_last_feed_view');
    const lastViewDate = lastFeedView ? new Date(lastFeedView) : null;

    // Get hidden job IDs to exclude from all counts
    const hiddenIds = hiddenJobIds.map(h => h.id);

    // Helper: apply hidden exclusion to a query
    function excludeHidden(query) {
      if (hiddenIds.length > 0) {
        query = query.not('greenhouse_id', 'in', `(${hiddenIds.join(',')})`);
      }
      return query;
    }

    let total = 0;
    let todayCount = 0;
    let newSinceLoginCount = 0;
    let companyCount = 0;

    // If no filters selected, create a pseudo-filter with no pills
    // so buildFilterQuery still applies global tuning (usOnly, exclusions)
    const effectiveFilters = (filters && filters.length > 0) ? filters : [{}];

    // Pre-fetch location IDs for each filter (same as searchJobs does)
    const tuningForLoc = safeReadLS('bj_tuning', {});
    const locationIdCache = new Map();
    for (const sf of effectiveFilters) {
      const wh = sf.wherePills || [];
      const whnot = sf.whereNotPills || [];
      if (wh.length > 0 || whnot.length > 0 || tuningForLoc.usOnly) {
        const cacheKey = JSON.stringify({ wh, whnot, usOnly: tuningForLoc.usOnly, locExcl: tuningForLoc.locationExcludes, includeRemote: sf.includeRemote });
        if (!locationIdCache.has(cacheKey)) {
          const locIds = await getLocationMatchIds(wh, whnot, tuningForLoc, sf.includeRemote === true);
          locationIdCache.set(cacheKey, locIds);
        }
        sf._statsLocationIds = locationIdCache.get(cacheKey);
      } else {
        sf._statsLocationIds = null;
      }
    }

    // Parallelize all stats queries across all filters (N+1 fix v3.82)
    // Before: N filters × 3 sequential queries = 3N round-trips
    // After: all queries fired in parallel = 1 round-trip (effectively)
    // A14 Session 3: wrap stats queries in cachedQuery for repeat filter toggles
    const _statsCacheKey = 'stats:feed:' + effectiveFilters.map(sf => _filterCacheKey('', sf)).join('+');
    const cachedStats = await cachedQuery(_statsCacheKey, async function() {
      const _statsPromises = effectiveFilters.flatMap(sf => {
        const locIds = sf._statsLocationIds || null;

        // TOTAL: all matching jobs WITHOUT time restriction (WHEN filter stripped)
        // This prevents TOTAL < NEW TODAY which is mathematically impossible
        // ⚠️ RISK R5 (Pill Pipeline Audit v7.69): TOTAL shows all-time count while the table
        // shows WHEN-filtered results. This is intentional (TOTAL is a "universe size" indicator)
        // but may confuse users when TOTAL >> table count. filter-count bar now shows post-filter
        // truth (v7.68). Consider adding a tooltip to the TOTAL stat card explaining the difference.
        const sfNoWhen = Object.assign({}, sf, { whenPills: [] });
        let q = sb.from('ats_jobs').select('greenhouse_id', { count: 'exact', head: true });
        q = buildFilterQuery(sfNoWhen, q, locIds);
        q = excludeHidden(q);

        // NEW TODAY: all matching jobs updated in last 24h (also without WHEN, uses its own time window)
        let q2 = sb.from('ats_jobs').select('greenhouse_id', { count: 'exact', head: true });
        q2 = buildFilterQuery(sfNoWhen, q2, locIds);
        q2 = excludeHidden(q2);
        q2 = q2.gte('first_seen_at', last24h.toISOString());

        const promises = [
          q.then(r => ({ type: 'total', count: r.count || 0 })),
          q2.then(r => ({ type: 'today', count: r.count || 0 })),
        ];

        if (lastViewDate) {
          let qLogin = sb.from('ats_jobs').select('greenhouse_id', { count: 'exact', head: true });
          qLogin = buildFilterQuery(sf, qLogin, locIds);
          qLogin = excludeHidden(qLogin);
          qLogin = qLogin.gte('first_seen_at', lastViewDate.toISOString());
          promises.push(qLogin.then(r => ({ type: 'login', count: r.count || 0 })));
        }

        return promises;
      });

      const _statsResults = await Promise.allSettled(_statsPromises);
      let _total = 0, _todayCount = 0, _newSinceLoginCount = 0;
      for (const r of _statsResults) {
        if (r.status === 'fulfilled') {
          if (r.value.type === 'total') _total += r.value.count;
          else if (r.value.type === 'today') _todayCount += r.value.count;
          else if (r.value.type === 'login') _newSinceLoginCount += r.value.count;
        }
      }

      // Company count — derived from same filters as visible results (including WHEN)
      // v7.68: Was stripping whenPills which caused mismatch between stat card and table
      let companyCountVal = 0;
      try {
        const firstLocIds = effectiveFilters[0]._statsLocationIds || null;
        let cq2 = sb.from('ats_jobs').select('company_slug');
        cq2 = buildFilterQuery(effectiveFilters[0], cq2, firstLocIds);
        cq2 = excludeHidden(cq2);
        cq2 = cq2.not('company_slug', 'is', null).limit(2000);
        const { data: coRows } = await cq2;
        const uniqueCos = new Set();
        if (coRows) coRows.forEach(r => { if (r.company_slug) uniqueCos.add(r.company_slug); });
        companyCountVal = uniqueCos.size;
      } catch(coErr) { reportError('job-feed', coErr); console.warn('[BJ] Company count error:', coErr.message);
      }

      return { data: { total: _total, todayCount: _todayCount, newSinceLoginCount: _newSinceLoginCount, companyCount: companyCountVal } };
    });

    if (cachedStats && cachedStats.data) {
      total = cachedStats.data.total;
      todayCount = cachedStats.data.todayCount;
      newSinceLoginCount = cachedStats.data.newSinceLoginCount;
      companyCount = cachedStats.data.companyCount;
    }

    // Guard: company count can never exceed total jobs
    if (total > 0 && companyCount > total) companyCount = total;
    updateJobStats(total, companyCount, newSinceLoginCount, todayCount);
  } catch (e) {
    reportError('job_feed', e);
    console.error('Stats update error:', e);
    // Fallback: compute from loaded jobs if available
    try {
      var jobs = typeof currentJobs !== 'undefined' ? currentJobs : [];
      var cos = new Set();
      jobs.forEach(function(j) { if (j.company_slug) cos.add(j.company_slug); });
      updateJobStats(jobs.length, cos.size, 0, 0);
    } catch(e2) { reportError('job-feed:job-feed', e2); }
  }
}

function updateJobStats(total, companies, newSinceLogin, newToday) {
  $('#j-total').textContent = total.toLocaleString();
  $('#j-companies').textContent = companies.toLocaleString();
  if ($('#j-new-login')) $('#j-new-login').textContent = newSinceLogin.toLocaleString();
  $('#j-new').textContent = newToday.toLocaleString();
  $('#j-saved').textContent = savedJobIds.length.toLocaleString();
  // Update intel insight card with contextual data
  updateIntelInsight(total, companies, newToday);
  // renderFeedSourceChips() removed v7.14 — per user request
}

// ─── A15 S6 v6.62: Per-source count chips in feed hero bar ───

function updateIntelInsight(total, companies, newToday) {
  var titleEl = $('#intel-insight-title');
  var subEl = $('#intel-insight-sub');
  if (!titleEl) return;

  // Build contextual insight from actual filter/job data
  var jobs = typeof currentJobs !== 'undefined' ? currentJobs : [];
  var withSalary = jobs.filter(function(j) { return j.salary_min > 0; });
  var filterName = '';
  try {
    var sf = typeof savedFilters !== 'undefined' ? savedFilters : [];
    var active = sf.find(function(f) { return f.active; });
    if (active) filterName = active.name || '';
  } catch(e) { reportError('job-feed:job-feed', e); }

  if (withSalary.length >= 3) {
    // Salary insight
    var salaries = withSalary.map(function(j) { return j.salary_max || j.salary_min; }).sort(function(a,b) { return a - b; });
    var p25 = salaries[Math.floor(salaries.length * 0.25)];
    var p75 = salaries[Math.floor(salaries.length * 0.75)];
    var fmtK = function(n) { return '$' + Math.round(n / 1000) + 'k'; };
    titleEl.textContent = 'Roles in your feed pay ' + fmtK(p25) + ' – ' + fmtK(p75);
    subEl.textContent = 'Based on ' + withSalary.length + ' of ' + total + ' jobs with salary data' + (filterName ? ' in "' + filterName + '"' : '');
  } else if (newToday > 0) {
    // New jobs insight
    titleEl.textContent = newToday + ' new ' + (newToday === 1 ? 'job' : 'jobs') + ' posted today across ' + companies + ' companies';
    subEl.textContent = 'Fresh listings sourced direct from company career pages' + (filterName ? ' matching "' + filterName + '"' : '');
  } else {
    // Fallback
    titleEl.textContent = total + ' jobs across ' + companies + ' companies in your feed';
    subEl.textContent = 'All sourced direct from company career pages — no recycled posts';
  }
}

// Format salary for display — shows currency prefix for non-USD, rate suffix for non-annual
function formatSalaryCell(job) {
  if (!job.salary_min) return '—';
  const currency = job.salary_currency || '';
  const rate = job.salary_rate || 'yr';
  // Prefix map: symbol-based currencies don't need $, code-based do
  const prefixMap = { CAD: 'CA$', GBP: '£', EUR: '€', AUD: 'AU$', NZD: 'NZ$', HKD: 'HK$' };
  const sym = prefixMap[currency] || '$';

  // Rate suffix map
  const rateSuffix = { yr: '', hr: '/hr', wk: '/wk', mo: '/mo', day: '/day', session: '/session', visit: '/visit' };
  const suffix = rateSuffix[rate] || '';

  if (rate === 'yr') {
    // Annual: show in Xk format
    const min = `${sym}${Math.round(job.salary_min/1000)}k`;
    if (job.salary_max && job.salary_max !== job.salary_min) {
      return `${min}-${sym}${Math.round(job.salary_max/1000)}k`;
    }
    return min;
  } else {
    // Non-annual: show raw dollar amount with suffix
    const min = `${sym}${job.salary_min}`;
    if (job.salary_max && job.salary_max !== job.salary_min) {
      return `${min}-${sym}${job.salary_max}${suffix}`;
    }
    return `${min}${suffix}`;
  }
}

function truncate(str, max) {
  if (!str) return '\u2014';
  var trimmed = str.length > max ? str.slice(0, max) + '\u2026' : str;
  return typeof escapeHtml === 'function' ? escapeHtml(trimmed) : trimmed;
}

// City alias map for display normalization
const CITY_ALIASES = {
  'new york city': 'new york',
  'nyc': 'new york',
  'la': 'los angeles',
  'sf': 'san francisco',
  'dc': 'washington',
  'philly': 'philadelphia',
};

function normalizeCity(name) {
  if (!name) return '';
  const lower = name.toLowerCase().trim().replace(/\s+/g, ' ');
  return CITY_ALIASES[lower] || lower;
}

const STATE_ABBREVS = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA',
  'kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD',
  'massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO',
  'montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ',
  'new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH',
  'oklahoma':'OK','oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
  'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
  'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
  'district of columbia':'DC'
};

function cleanLocationPart(part) {
  let s = part.trim();
  // "United States of America - Pasadena, CA" → "Pasadena, CA"
  s = s.replace(/United States of America\s*[-–—]\s*/gi, '');
  s = s.replace(/United States\s*[-–—]\s*/gi, '');
  // "Remote - US" → "remote, us"
  s = s.replace(/Remote\s*[-–—]\s*/gi, 'Remote, ');
  // QA-006: "country (remote)" → "Remote, Country" pattern
  s = s.replace(/^([A-Za-z][A-Za-z\s]+?)\s*\(remote\)$/i, 'Remote, $1');
  // Trailing "United States of America" or "United States"
  s = s.replace(/,?\s*United States of America/gi, '');
  s = s.replace(/,?\s*United States/gi, '');
  // Clean up
  s = s.replace(/^[,\s]+|[,\s]+$/g, '');
  // QA-006: Normalize "usa" → "US", bare "us" → "US"
  s = s.replace(/\busa\b/gi, 'US');
  if (/^us$/i.test(s)) s = 'US';
  // QA-006: Normalize "remote, us" → "Remote, US" (title-case Remote + uppercase country code)
  s = s.replace(/^remote,\s*/i, 'Remote, ');
  // QA-006: Title-case country names after "Remote, " (e.g. "Remote, mexico" → "Remote, Mexico")
  s = s.replace(/^(Remote, )([a-z])/i, function(m, prefix, first) {
    return prefix + first.toUpperCase();
  });
  // Convert full state names to abbreviations: "Pasadena, California" → "Pasadena, CA"
  const commaIdx = s.lastIndexOf(',');
  if (commaIdx > 0) {
    const beforeComma = s.substring(0, commaIdx).trim();
    const afterComma = s.substring(commaIdx + 1).trim();
    const abbrev = STATE_ABBREVS[afterComma.toLowerCase()];
    if (abbrev) s = beforeComma + ', ' + abbrev;
  }
  return s;
}

function formatLocation(raw, locDisplay, negativeLocations) {
  const hasNegs = negativeLocations && negativeLocations.length > 0;

  // If no negative filters and we have a clean display, use it
  if (!hasNegs && locDisplay) return cleanLocationPart(locDisplay);
  if (!raw && !locDisplay) return '—';

  // Try to parse multi-location — prefer raw with semicolons, fallback to loc_display with +N pattern
  let parts = [];
  const source = raw || '';
  if (source.includes(';')) {
    parts = source.split(';').map(cleanLocationPart).filter(Boolean);
  } else if (locDisplay && locDisplay.includes('+')) {
    // loc_display is like "new york city +3" — we only have the first city from raw
    // Use raw as the single known city, but we can't split further without the original data
    // So just clean what we have
    parts = [cleanLocationPart(source)].filter(Boolean);
    if (!hasNegs) return locDisplay;
  } else {
    parts = [cleanLocationPart(source)].filter(Boolean);
  }

  if (parts.length === 0) return locDisplay || '—';

  // If we have negative location filters, skip matching parts
  let displayParts = parts;
  if (hasNegs) {
    const negNormalized = negativeLocations.map(n => normalizeCity(n));

    // Also check loc_display to get the full multi-location info
    // Parse "+N" from loc_display to know total count
    let totalFromDisplay = parts.length;
    const plusMatch = locDisplay?.match(/\+(\d+)$/);
    if (plusMatch) totalFromDisplay = 1 + parseInt(plusMatch[1]);

    displayParts = parts.filter(part => {
      const partLower = part.toLowerCase();
      return !negNormalized.some(neg =>
        partLower.includes(neg) || normalizeCity(partLower).includes(neg)
      );
    });

    // If the displayed city was excluded but we know there are more from +N
    if (displayParts.length === 0 && totalFromDisplay > parts.length) {
      // We can't know the other city names, just show count
      const othersCount = totalFromDisplay - 1; // minus the excluded one
      return othersCount > 0 ? `(${othersCount} other location${othersCount > 1 ? 's' : ''})` : '—';
    }
    if (displayParts.length === 0) displayParts = parts;

    // Adjust +N count: subtract excluded cities
    const excludedCount = parts.length - displayParts.length;
    const extraFromDisplay = plusMatch ? parseInt(plusMatch[1]) : 0;
    const adjustedExtra = extraFromDisplay + (parts.length - displayParts.length > 0 ? 0 : 0);
    const totalRemaining = (displayParts.length - 1) + Math.max(0, extraFromDisplay - excludedCount);

    if (displayParts.length === 1 && totalRemaining <= 0) return displayParts[0];
    if (totalRemaining > 0) return displayParts[0] + ` +${totalRemaining}`;
    return displayParts[0];
  }

  if (parts.length === 1) return parts[0];
  const remaining = parts.length - 1;
  return parts[0] + ` +${remaining}`;
}


// ============================================================
// FRAUD DETECTION — Phase 2: Badges + Tooltips (v6.31)
// ============================================================

// Cache fraud scores by job_id to avoid re-fetching on pagination

// ============================================================
// TRUST LEVEL FILTER + PostHog FRAUD ANALYTICS (Phase 4 — v6.33)
// ============================================================

// Trust filter state
var _trustFilterLabels = new Set(['safe', 'caution', 'suspicious', 'unknown']);

function getActiveTrustLabels() {
  var labels = new Set();
  document.querySelectorAll('.trust-cb').forEach(function(cb) {
    if (cb.checked) labels.add(cb.value);
  });
  return labels.size > 0 ? labels : _trustFilterLabels; // Fallback if no checkboxes yet
}

function isTrustFilterActive() {
  var cbs = document.querySelectorAll('.trust-cb');
  if (cbs.length === 0) return false;
  var checked = 0;
  cbs.forEach(function(cb) { if (cb.checked) checked++; });
  return checked < cbs.length;
}

function applyTrustFilter(jobs) {
  if (!isTrustFilterActive()) return jobs;
  var labels = getActiveTrustLabels();
  return jobs.filter(function(j) {
    var info = _fraudScoreCache[j.greenhouse_id];
    var label = (info && info.label) ? info.label : 'unknown';
    return labels.has(label);
  });
}

function updateTrustFilterUI() {
  var btn = document.getElementById('trust-filter-btn');
  var countEl = document.getElementById('trust-filter-count');
  if (!btn) return;
  var active = isTrustFilterActive();
  if (active) {
    var n = getActiveTrustLabels().size;
    btn.style.borderColor = 'var(--accent)';
    btn.style.color = 'var(--accent)';
    if (countEl) { countEl.style.display = 'inline'; countEl.textContent = n; }
  } else {
    btn.style.borderColor = 'var(--border)';
    btn.style.color = 'var(--text-faint)';
    if (countEl) countEl.style.display = 'none';
  }
}

function setAllTrustFilters(checked) {
  document.querySelectorAll('.trust-cb').forEach(function(cb) { cb.checked = checked; });
  updateTrustFilterUI();
  if (typeof posthog !== 'undefined') {
    posthog.capture('fraud_filter_applied', {
      labels: Array.from(getActiveTrustLabels()),
      action: checked ? 'select_all' : 'select_none'
    });
  }
  searchJobs(0);
}


// ═══════════════════════════════════════════════════════════
// AI CONTENT FILTER — Session 3.3 (v6.43) helper functions
// ═══════════════════════════════════════════════════════════

var _aiFilterLabels = new Set(['human', 'mixed', 'ai_generated', 'unscored']);

function getActiveAiLabels() {
  var labels = new Set();
  document.querySelectorAll('.ai-filter-cb').forEach(function(cb) {
    if (cb.checked) labels.add(cb.value);
  });
  return labels.size > 0 ? labels : _aiFilterLabels;
}

function isAiFilterActive() {
  var cbs = document.querySelectorAll('.ai-filter-cb');
  if (cbs.length === 0) return false;
  var checked = 0;
  cbs.forEach(function(cb) { if (cb.checked) checked++; });
  return checked < cbs.length;
}

function applyAiContentFilter(jobs) {
  if (!isAiFilterActive()) return jobs;
  var labels = getActiveAiLabels();
  return jobs.filter(function(j) {
    var info = _aiJdScoreCache[j.greenhouse_id];
    var label = 'unscored';
    if (info && info.label) {
      if (info.label === 'human_written') label = 'human';
      else if (info.label === 'mixed_content') label = 'mixed';
      else if (info.label === 'ai_generated') label = 'ai_generated';
      else label = info.label;
    }
    return labels.has(label);
  });
}

function updateAiFilterUI() {
  var btn = document.getElementById('ai-filter-btn');
  var countEl = document.getElementById('ai-filter-count');
  if (!btn) return;
  var active = isAiFilterActive();
  if (active) {
    var n = getActiveAiLabels().size;
    btn.style.borderColor = 'var(--accent)';
    btn.style.color = 'var(--accent)';
    if (countEl) { countEl.style.display = 'inline'; countEl.textContent = n; }
  } else {
    btn.style.borderColor = 'var(--border)';
    btn.style.color = 'var(--text-faint)';
    if (countEl) countEl.style.display = 'none';
  }
}

function setAllAiFilters(checked) {
  document.querySelectorAll('.ai-filter-cb').forEach(function(cb) { cb.checked = checked; });
  updateAiFilterUI();
  if (typeof posthog !== 'undefined') {
    posthog.capture('ai_filter_applied', {
      labels: Array.from(getActiveAiLabels()),
      action: checked ? 'select_all' : 'select_none'
    });
  }
  searchJobs(0);
}

// ═══════════════════════════════════════════════════════════
// AI SCORING EXCLUSION — Session 4.1 (v6.44)
// ═══════════════════════════════════════════════════════════

// Cache for user AI scoring prefs (synced from settings.js)
var _userAiScoringPrefsCache = { mixed_content: false, ai_generated: false };

// Listen for pref changes from settings.js
window.addEventListener('ai-scoring-prefs-changed', function(e) {
  if (e.detail) _userAiScoringPrefsCache = e.detail;
  // Re-render if on feed page
  if (typeof searchJobs === 'function') searchJobs(0);
});

// Load prefs on startup (mirrors settings.js but for feed context)
(function loadAiScoringPrefsForFeed() {
  setTimeout(async function() {
    try {
      if (typeof sb === 'undefined' || typeof currentUser === 'undefined' || !currentUser) return;
      var resp = await sb.from('profiles').select('ai_scoring_prefs').eq('id', currentUser.id).single();
      if (resp.error && resp.error.code !== 'PGRST116') reportError('job-feed:ai-scoring-prefs', resp.error);
      if (resp.data && resp.data.ai_scoring_prefs) {
        _userAiScoringPrefsCache = resp.data.ai_scoring_prefs;
      }
    } catch(e) { reportError('job-feed:silent — prefs default to no exclusions', e); }
  }, 1000);
})();

function isAiScoringExclusionActive() {
  return _userAiScoringPrefsCache.mixed_content || _userAiScoringPrefsCache.ai_generated;
}

function applyAiScoringExclusions(jobs) {
  if (!isAiScoringExclusionActive()) return jobs;
  var excludedCount = 0;
  var result = jobs.map(function(j) {
    var info = _aiJdScoreCache[j.greenhouse_id];
    if (!info || !info.label) return j;
    var excluded = false;
    if (_userAiScoringPrefsCache.mixed_content && info.label === 'mixed_content') excluded = true;
    if (_userAiScoringPrefsCache.ai_generated && info.label === 'ai_generated') excluded = true;
    if (excluded) {
      // Mark job as scoring-excluded (used by renderer to dim badge)
      j._aiScoringExcluded = true;
      excludedCount++;
    } else {
      j._aiScoringExcluded = false;
    }
    return j;
  });
  // PostHog: track exclusion impact on feed (v6.49 — Session 5.1)
  if (excludedCount > 0 && typeof posthog !== 'undefined') {
    posthog.capture('ai_scoring_exclusion_applied', {
      excluded_count: excludedCount,
      total_jobs: jobs.length,
      prefs: Object.assign({}, _userAiScoringPrefsCache)
    });
  }
  return result;
}

// Init trust filter UI
document.addEventListener('DOMContentLoaded', function() {
  var btn = document.getElementById('trust-filter-btn');
  var dd = document.getElementById('trust-filter-dropdown');
  if (btn && dd) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', function(e) {
      if (!dd.contains(e.target) && e.target !== btn) dd.style.display = 'none';
    });
    dd.querySelectorAll('.trust-cb').forEach(function(cb) {
      cb.addEventListener('change', function() {
        updateTrustFilterUI();
        if (typeof posthog !== 'undefined') {
          posthog.capture('fraud_filter_applied', {
            labels: Array.from(getActiveTrustLabels()),
            toggled_label: cb.value,
            toggled_to: cb.checked
          });
        }
        searchJobs(0);
      });
    });
  }


  // Init AI content filter UI (v6.43 — Session 3.3)
  var aiBtn = document.getElementById('ai-filter-btn');
  var aiDd = document.getElementById('ai-filter-dropdown');
  if (aiBtn && aiDd) {
    aiBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      aiDd.style.display = aiDd.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', function(e) {
      if (!aiDd.contains(e.target) && e.target !== aiBtn) aiDd.style.display = 'none';
    });
    aiDd.querySelectorAll('.ai-filter-cb').forEach(function(cb) {
      cb.addEventListener('change', function() {
        updateAiFilterUI();
        if (typeof posthog !== 'undefined') {
          posthog.capture('ai_filter_applied', {
            labels: Array.from(getActiveAiLabels()),
            toggled_label: cb.value,
            toggled_to: cb.checked
          });
        }
        searchJobs(0);
      });
    });
  }

  // PostHog: fraud_tooltip_opened — delegated mouseenter on badge
  document.addEventListener('mouseenter', function(e) {
    if (!e.target || e.target.nodeType !== 1) return;
    var badge = e.target.closest('.fraud-badge');
    if (!badge) return;
    var jobId = badge.dataset.fraudJobid || badge.getAttribute('data-fraud-jobid');
    if (jobId && typeof posthog !== 'undefined') {
      var info = _fraudScoreCache[jobId];
      posthog.capture('fraud_tooltip_opened', {
        fraud_label: info ? info.label : 'unknown',
        fraud_score: info ? info.score : null,
        job_id: jobId
      });
    }
  }, true);
});

var _fraudScoreCache = {};

async function fetchFraudScores(jobs) {
  if (!jobs || jobs.length === 0) return;
  // Find jobs not yet in cache
  var uncached = jobs.filter(function(j) { return !_fraudScoreCache[j.greenhouse_id]; });
  if (uncached.length === 0) return;

  var ids = uncached.map(function(j) { return j.greenhouse_id; });
  try {
    var { data, error } = await sb
      .from('job_fraud_scores')
      .select('job_id,fraud_score,fraud_label,top_signals,confidence')
      .in('job_id', ids);
    if (error) { console.warn('[BJ] Fraud score fetch error:', error); return; }
    if (data) {
      data.forEach(function(row) {
        _fraudScoreCache[row.job_id] = {
          score: row.fraud_score,
          label: row.fraud_label,
          signals: row.top_signals || [],
          confidence: row.confidence,
        };
      });
    }
  } catch(e) { reportError('job-feed', e); console.warn('[BJ] Fraud score fetch failed:', e);
  }
}


// ═══════════════════════════════════════════════════════════
// AI CONTENT DETECTION — Session 3.1: Feed Card AI Badge (v6.41)
// ═══════════════════════════════════════════════════════════

var _aiJdScoreCache = {};

async function fetchAiJdScores(jobs) {
  var uncached = jobs.filter(function(j) { return !_aiJdScoreCache[j.greenhouse_id]; });
  if (uncached.length === 0) return;

  var ids = uncached.map(function(j) { return j.greenhouse_id; });
  try {
    var { data, error } = await sb
      .from('content_ai_scores')
      .select('content_id,ai_label,ai_generated_score,confidence,summary,perplexity_score,burstiness_score,top_signals')
      .eq('content_type', 'jd')
      .in('content_id', ids);
    if (error) { console.warn('[BJ] AI JD score fetch error:', error); return; }
    if (data) {
      data.forEach(function(row) {
        _aiJdScoreCache[row.content_id] = {
          label: row.ai_label,
          score: row.ai_generated_score,
          confidence: row.confidence,
          summary: row.summary,
          perplexity: row.perplexity_score,
          burstiness: row.burstiness_score,
          topSignals: row.top_signals || [],
        };
      });
      // PostHog: track AI score coverage for this batch (v6.49 — Session 5.1)
      if (typeof posthog !== 'undefined') {
        var labels = {};
        data.forEach(function(row) { labels[row.ai_label] = (labels[row.ai_label] || 0) + 1; });
        posthog.capture('ai_scores_fetched', {
          requested: ids.length,
          returned: data.length,
          coverage_pct: ids.length > 0 ? Math.round((data.length / ids.length) * 100) : 0,
          label_counts: labels
        });
      }
    }
  } catch(e) { reportError('job-feed', e); console.warn('[BJ] AI JD score fetch failed:', e);
  }
}

function aiJdBadgeHtml(jobId) {
  var info = _aiJdScoreCache[jobId];
  if (!info || !info.label) return '';

  var cfg = {
    human: { icon: '<i data-lucide="check" class="icon-xs icon-stroke" style="color:var(--green)"></i>', cls: 'ai-jd-badge--human', label: 'Human-Written', tip: 'Likely human-written job description' },
    mixed: { icon: '<i data-lucide="triangle-alert" class="icon-xs icon-stroke" style="color:var(--warm)"></i>', cls: 'ai-jd-badge--mixed', label: 'Mixed Content', tip: 'May contain AI-generated content' },
    ai_generated: { icon: '<i data-lucide="scan-text" class="icon-xs icon-stroke" style="color:var(--red)"></i>', cls: 'ai-jd-badge--ai', label: 'AI-Generated', tip: 'Likely AI-generated job description' },
  };
  var c = cfg[info.label];
  if (!c) return '';

  var pct = info.score !== null && info.score !== undefined ? (info.score * 100).toFixed(0) + '%' : '';
  var summaryHtml = info.summary ? '<div class="ai-jd-tooltip-summary">' + escapeHtml(info.summary).substring(0, 200) + '</div>' : '';

  // Signal breakdown bars (v6.42 — Session 3.2)
  var signalBarsHtml = '';
  if (info.perplexity !== null && info.perplexity !== undefined && info.burstiness !== null && info.burstiness !== undefined) {
    var perpPct = (info.perplexity * 100).toFixed(0);
    var burstPct = (info.burstiness * 100).toFixed(0);
    // Content signal = derived from overall minus sub-scores (weighted)
    var contentPct = pct ? parseInt(pct) : 0;
    signalBarsHtml = '<div class="ai-jd-tooltip-signals">'
      + '<div class="ai-jd-signal-row"><span class="ai-jd-signal-label">Predictability</span>'
      + '<div class="ai-jd-signal-bar"><div class="ai-jd-signal-fill" style="width:' + (100 - perpPct) + '%;background:' + _aiSignalColor(100 - perpPct) + '"></div></div>'
      + '<span class="ai-jd-signal-val">' + (100 - perpPct) + '%</span></div>'
      + '<div class="ai-jd-signal-row"><span class="ai-jd-signal-label">Uniformity</span>'
      + '<div class="ai-jd-signal-bar"><div class="ai-jd-signal-fill" style="width:' + (100 - burstPct) + '%;background:' + _aiSignalColor(100 - burstPct) + '"></div></div>'
      + '<span class="ai-jd-signal-val">' + (100 - burstPct) + '%</span></div>'
      + '<div class="ai-jd-signal-row"><span class="ai-jd-signal-label">Overall AI Score</span>'
      + '<div class="ai-jd-signal-bar"><div class="ai-jd-signal-fill" style="width:' + contentPct + '%;background:' + _aiSignalColor(contentPct) + '"></div></div>'
      + '<span class="ai-jd-signal-val">' + contentPct + '%</span></div>'
      + '</div>';
  }

  // Confidence indicator
  var confHtml = '';
  if (info.confidence !== null && info.confidence !== undefined) {
    var confPct = (info.confidence * 100).toFixed(0);
    var confLabel = confPct >= 80 ? 'High' : confPct >= 50 ? 'Medium' : 'Low';
    var confCls = confPct >= 80 ? 'ai-jd-conf--high' : confPct >= 50 ? 'ai-jd-conf--med' : 'ai-jd-conf--low';
    confHtml = '<div class="ai-jd-tooltip-conf ' + confCls + '">' + confLabel + ' confidence (' + confPct + '%)</div>';
  }

  return '<span class="ai-jd-badge ' + c.cls + '" data-ai-jobid="' + escapeHtml(jobId) + '" onclick="trackAiJdBadgeClick(\'' + escapeHtml(jobId) + '\')">'
    + c.icon
    + '<span class="ai-jd-tooltip">'
    + '<div class="ai-jd-tooltip-title">' + c.label + (pct ? ' — ' + pct + ' AI' : '') + '</div>'
    + confHtml
    + signalBarsHtml
    + summaryHtml
    + '</span>'
    + '</span>';
}

// Signal color helper: green (low AI) → yellow → red (high AI)
function _aiSignalColor(pct) {
  if (pct < 30) return 'var(--green, #22c55e)';
  if (pct < 60) return 'var(--warm, #f59e0b)';
  return 'var(--red, #ef4444)';
}

// PostHog tracking for AI badge clicks (v6.42 — Session 3.2)
function trackAiJdBadgeClick(jobId) {
  var info = _aiJdScoreCache[jobId];
  if (typeof posthog !== 'undefined' && info) {
    posthog.capture('ai_jd_badge_clicked', {
      job_id: jobId,
      ai_label: info.label,
      ai_score: info.score,
      confidence: info.confidence,
    });
  }
}


// ═══════════════════════════════════════════════════════════
// AI CONTENT DETECTION BANNER — Job Detail / Snippet Row
// v6.43 — Session 3.3: Full-width banner in job detail area
// ═══════════════════════════════════════════════════════════

function aiContentBannerHtml(jobId) {
  var info = _aiJdScoreCache[jobId];
  if (!info || !info.label) return '';
  // Only show banner for mixed/ai_generated (human is benign, same pattern as trustBannerHtml)
  if (info.label === 'human') return '';

  var cfg = {
    mixed: {
      cls: 'ai-banner--mixed',
      icon: '<i data-lucide="triangle-alert" class="icon-sm icon-stroke" style="color:var(--warm)"></i>',
      title: 'Mixed AI Content Detected',
      desc: 'This job description appears to contain a mix of human-written and AI-generated content.',
    },
    ai_generated: {
      cls: 'ai-banner--ai',
      icon: '<i data-lucide="scan-text" class="icon-sm icon-stroke" style="color:var(--red)"></i>',
      title: 'AI-Generated Content Detected',
      desc: 'This job description was likely generated by AI. Review role details and requirements carefully.',
    },
  };
  var c = cfg[info.label];
  if (!c) return '';

  var pct = info.score !== null && info.score !== undefined ? (info.score * 100).toFixed(0) + '% AI' : '';

  // Full sub-score bars (not truncated like tooltip)
  var subsHtml = '';
  if (info.perplexity !== null && info.perplexity !== undefined && info.burstiness !== null && info.burstiness !== undefined) {
    var perpVal = (100 - (info.perplexity * 100)).toFixed(0);
    var burstVal = (100 - (info.burstiness * 100)).toFixed(0);
    var confVal = info.confidence !== null ? (info.confidence * 100).toFixed(0) : null;
    subsHtml = '<div class="ai-banner-subs">'
      + '<div class="ai-banner-sub"><span class="ai-banner-sub-label">Predictability</span>'
      + '<div class="ai-banner-sub-bar"><div class="ai-banner-sub-fill" style="width:' + perpVal + '%;background:' + _aiSignalColor(parseInt(perpVal)) + '"></div></div>'
      + '<span class="ai-banner-sub-val">' + perpVal + '%</span></div>'
      + '<div class="ai-banner-sub"><span class="ai-banner-sub-label">Uniformity</span>'
      + '<div class="ai-banner-sub-bar"><div class="ai-banner-sub-fill" style="width:' + burstVal + '%;background:' + _aiSignalColor(parseInt(burstVal)) + '"></div></div>'
      + '<span class="ai-banner-sub-val">' + burstVal + '%</span></div>';
    if (confVal !== null) {
      subsHtml += '<div class="ai-banner-sub"><span class="ai-banner-sub-label">Confidence</span>'
        + '<div class="ai-banner-sub-bar"><div class="ai-banner-sub-fill" style="width:' + confVal + '%;background:var(--accent,#6366f1)"></div></div>'
        + '<span class="ai-banner-sub-val">' + confVal + '%</span></div>';
    }
    subsHtml += '</div>';
  }

  // Full summary (not truncated)
  var summaryHtml = info.summary ? '<div class="ai-banner-summary">' + escapeHtml(info.summary) + '</div>' : '';

  // Top signals chips
  var signalsHtml = '';
  var signals = info.topSignals;
  if (signals && signals.length > 0) {
    var chips = signals.slice(0, 6).map(function(s) {
      var label = typeof s === 'string' ? s : (s.label || s.name || '');
      return label ? '<span class="ai-banner-signal-chip">' + escapeHtml(label.substring(0, 40)) + '</span>' : '';
    }).filter(Boolean).join('');
    if (chips) signalsHtml = '<div class="ai-banner-signals">' + chips + '</div>';
  }

  // PostHog event
  if (typeof posthog !== 'undefined') {
    posthog.capture('ai_content_banner_viewed', {
      job_id: jobId,
      ai_label: info.label,
      ai_score: info.score,
    });
  }

  return '<div class="ai-banner ' + c.cls + '">'
    + '<div class="ai-banner-header">'
    + '<span class="ai-banner-icon">' + c.icon + '</span>'
    + '<span class="ai-banner-title">' + c.title + (pct ? ' — ' + pct : '') + '</span>'
    + '</div>'
    + '<div class="ai-banner-desc">' + c.desc + '</div>'
    + subsHtml
    + signalsHtml
    + summaryHtml
    + '</div>';
}

function fraudBadgeHtml(jobId) {
  var info = _fraudScoreCache[jobId];
  if (!info || info.label === 'unknown') return '';

  var cfg = {
    safe: { icon: '<i data-lucide="shield-check" class="icon-xs icon-stroke" style="color:var(--green)"></i>', cls: 'fraud-badge--safe', tip: 'Verified Posting' },
    caution: { icon: '<i data-lucide="triangle-alert" class="icon-xs icon-stroke" style="color:var(--warm)"></i>', cls: 'fraud-badge--caution', tip: 'Review Carefully' },
    suspicious: { icon: '<i data-lucide="flag" class="icon-xs icon-stroke" style="color:var(--red)"></i>', cls: 'fraud-badge--suspicious', tip: 'Potentially Fake' },
  };
  var c = cfg[info.label];
  if (!c) return '';

  // Build signal list for tooltip
  var signalHtml = '';
  if (info.signals && info.signals.length > 0) {
    signalHtml = '<div class="fraud-tooltip-signals">'
      + info.signals.slice(0, 5).map(function(s) {
        var sign = s.positive ? '✓' : '✗';
        var signCls = s.positive ? 'fraud-signal--positive' : 'fraud-signal--negative';
        return '<div class="fraud-signal ' + signCls + '">' + sign + ' ' + escapeHtml(s.human || s.feature) + '</div>';
      }).join('')
      + '</div>';
  }

  var scoreText = info.score !== null && info.score !== undefined ? ' (' + (info.score * 100).toFixed(0) + '%)' : '';

  return '<span class="fraud-badge ' + c.cls + '" data-fraud-jobid="' + escapeHtml(jobId) + '">'
    + c.icon
    + '<span class="fraud-tooltip">'
    + '<div class="fraud-tooltip-title">' + c.tip + scoreText + '</div>'
    + signalHtml
    + '</span>'
    + '</span>';
}



// ═══════════════════════════════════════════════════════════
// FRAUD DETECTION — Phase 3: Trust Banner + Apply Interstitial (v6.32)
// ═══════════════════════════════════════════════════════════

function trustBannerHtml(jobId) {
  var info = _fraudScoreCache[jobId];
  if (!info || info.label === 'unknown' || info.label === 'safe') return '';

  var cfg = {
    caution: {
      cls: 'trust-banner--caution',
      icon: '<i data-lucide="triangle-alert" class="icon-sm icon-stroke" style="color:var(--warm)"></i>',
      title: 'Review This Posting Carefully',
      desc: 'Some signals suggest this listing may need extra scrutiny. Verify the company and role details before applying.',
    },
    suspicious: {
      cls: 'trust-banner--suspicious',
      icon: '<i data-lucide="flag" class="icon-sm icon-stroke" style="color:var(--red)"></i>',
      title: 'High Fraud Risk Detected',
      desc: 'Multiple signals indicate this posting may not be legitimate. Proceed with extreme caution.',
    },
  };
  var c = cfg[info.label];
  if (!c) return '';

  var signalHtml = '';
  if (info.signals && info.signals.length > 0) {
    signalHtml = '<div class="trust-banner-signals">'
      + info.signals.slice(0, 3).map(function(s) {
        var sign = s.positive ? '✓' : '✗';
        var signCls = s.positive ? 'fraud-signal--positive' : 'fraud-signal--negative';
        return '<span class="trust-banner-signal ' + signCls + '">' + sign + ' ' + escapeHtml(s.human || s.feature) + '</span>';
      }).join('')
      + '</div>';
  }

  return '<div class="trust-banner ' + c.cls + '">'
    + '<div class="trust-banner-header">'
    + '<span class="trust-banner-icon">' + c.icon + '</span>'
    + '<span class="trust-banner-title">' + c.title + '</span>'
    + '</div>'
    + '<div class="trust-banner-desc">' + c.desc + '</div>'
    + signalHtml
    + '</div>';
}

// Fraud interstitial modal — shown before apply on caution/suspicious jobs
var _fraudInterstitialResolve = null;

function showFraudInterstitial(jobId, applyUrl) {
  var info = _fraudScoreCache[jobId];
  if (!info) { window.open(applyUrl, '_blank'); return; }

  var isSuspicious = info.label === 'suspicious';
  var modalCls = isSuspicious ? 'fraud-interstitial--suspicious' : 'fraud-interstitial--caution';
  var icon = isSuspicious ? '<i data-lucide="flag" class="icon-lg icon-stroke-lg" style="color:var(--red)"></i>' : '<i data-lucide="triangle-alert" class="icon-lg icon-stroke-lg" style="color:var(--warm)"></i>';
  var title = isSuspicious ? 'High Fraud Risk' : 'Proceed with Caution';
  var desc = isSuspicious
    ? 'Multiple signals suggest this job posting may not be legitimate. We strongly recommend verifying the company before sharing personal information.'
    : 'Some signals suggest this listing may need extra scrutiny. Review the company details and job description carefully before applying.';

  var signalHtml = '';
  if (info.signals && info.signals.length > 0) {
    signalHtml = '<div class="fraud-interstitial-signals">'
      + info.signals.slice(0, 5).map(function(s) {
        var sign = s.positive ? '✓' : '✗';
        var signCls = s.positive ? 'fraud-signal--positive' : 'fraud-signal--negative';
        return '<div class="fraud-interstitial-signal ' + signCls + '">' + sign + ' ' + escapeHtml(s.human || s.feature) + '</div>';
      }).join('')
      + '</div>';
  }

  var overlay = document.createElement('div');
  overlay.className = 'fraud-interstitial-overlay';
  overlay.id = 'fraud-interstitial-overlay';
  overlay.innerHTML = '<div class="fraud-interstitial-card ' + modalCls + '">'
    + '<div class="fraud-interstitial-header">'
    + '<span class="fraud-interstitial-icon">' + icon + '</span>'
    + '<span class="fraud-interstitial-title">' + title + '</span>'
    + '</div>'
    + '<div class="fraud-interstitial-desc">' + desc + '</div>'
    + signalHtml
    + '<div class="fraud-interstitial-actions">'
    + '<button class="btn btn-secondary fraud-interstitial-back" onclick="closeFraudInterstitial(false)">Go Back</button>'
    + '<button class="btn ' + (isSuspicious ? 'fraud-interstitial-proceed-suspicious' : 'fraud-interstitial-proceed-caution') + '" onclick="closeFraudInterstitial(true)">'
    + (isSuspicious ? 'Continue Anyway' : 'Proceed with Caution')
    + '</button>'
    + '</div>'
    + '</div>';

  document.body.appendChild(overlay);
  // POD3-LUCIDE: Re-initialize Lucide icons in interstitial modal
  if (typeof window.refreshIcons === 'function') window.refreshIcons();
  // PostHog: fraud_interstitial_shown
  if (typeof posthog !== 'undefined') {
    posthog.capture('fraud_interstitial_shown', {
      fraud_label: info ? info.label : 'unknown',
      fraud_score: info ? info.score : null,
      job_id: jobId
    });
  }
  document.body.style.overflow = 'hidden';

  // Store apply URL for callback
  overlay.dataset.applyUrl = applyUrl;
  overlay.dataset.jobId = jobId;

  // Close on overlay click (outside card)
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeFraudInterstitial(false);
  });
}

function closeFraudInterstitial(proceed) {
  // PostHog: fraud_interstitial_proceed or fraud_interstitial_goback
  if (typeof posthog !== 'undefined') {
    posthog.capture(proceed ? 'fraud_interstitial_proceed' : 'fraud_interstitial_goback', {});
  }
  var overlay = document.getElementById('fraud-interstitial-overlay');
  if (!overlay) return;

  var applyUrl = overlay.dataset.applyUrl;
  var jobId = overlay.dataset.jobId;

  overlay.remove();
  document.body.style.overflow = '';

  if (proceed && applyUrl) {
    window.open(applyUrl, '_blank');
    // Mark as applied
    if (typeof markApplied === 'function') markApplied(jobId);
  }
}

function renderJobRows(jobs, total, page, filtersToRun) {
  const tbody = $('#job-table-body');
  const now = new Date();

  // Collect active negative location terms for display
  const activeNegLocs = [];
  const tuning = safeReadLS('bj_tuning', {});
  // From whereNotPills in active filters
  if (filtersToRun) {
    for (const sf of filtersToRun) {
      for (const pill of (sf.whereNotPills || [])) {
        for (const v of (pill.values || [])) {
          const t = v.trim().replace(/^nor\s+/i, '').replace(/\s+/g, ' ');
          if (t && !activeNegLocs.includes(t)) activeNegLocs.push(t);
        }
      }
      // Also check whatNotPills for terms that look like locations
      // by testing if any current job's location contains the term
      for (const pill of (sf.whatNotPills || [])) {
        for (const v of (pill.values || [])) {
          const t = v.trim().replace(/^nor\s+/i, '').replace(/\s+/g, ' ');
          if (t && !activeNegLocs.includes(t)) {
            const looksLikeLocation = jobs.some(j =>
              j.location && j.location.toLowerCase().includes(t.toLowerCase())
            );
            if (looksLikeLocation) activeNegLocs.push(t);
          }
        }
      }
    }
  }
  // From tuning exclusions
  for (const pill of (tuning.locationExcludes || [])) {
    for (const v of (pill.values || [])) {
      if (!activeNegLocs.includes(v)) activeNegLocs.push(v);
    }
  }
  if (activeNegLocs.length > 0) console.log('[BJ] Active neg locs:', activeNegLocs);

  // Get last feed view timestamp for NEW badge
  const lastFeedView = localStorage.getItem('bj_last_feed_view');
  const lastViewDate = lastFeedView ? new Date(lastFeedView) : null;

  // Populate global job map so toggleSaveJob can look up title/company
  window._feedJobMap = {};
  for (const j of jobs) { window._feedJobMap[j.greenhouse_id] = j; }

  let html = '';
  let newCount = 0;
  for (const job of jobs) {
    const jobDate = job.first_seen_at || job.updated_at;
    const daysAgo = jobDate ? Math.floor((now - new Date(jobDate)) / 86400000) : '—';
    const daysStr = typeof daysAgo === 'number' ? (daysAgo === 0 ? 'today' : daysAgo + 'd') : '—';
    // QA-FIX: Only today (0d) and 1d are green — 3d is not "new"
    const daysClass = typeof daysAgo === 'number' && daysAgo <= 1 ? 'color:var(--green);' : '';

    const isSaved = savedJobIds.includes(job.greenhouse_id);
    const isApplied = appliedJobIds.includes(job.greenhouse_id);

    // Action buttons
    let saveBtn = '';
    let applyBtn = '';

    if (isApplied) {
      saveBtn = '';
      applyBtn = `<span class="job-action-btn applied-btn">Applied ✓</span>`;
    } else {
      saveBtn = isSaved
        ? `<button class="job-action-btn saved-btn" onclick="toggleSaveJob('${job.greenhouse_id}', this)">Pipeline ✓</button>`
        : `<button class="job-action-btn" onclick="toggleSaveJob('${job.greenhouse_id}', this)">Pipeline</button>`;
      const jobUrl = job.apply_url || (job.url && job.url.startsWith('http') ? job.url : job.url ? 'https://boards.greenhouse.io' + job.url : '#');
      applyBtn = applyButton(['greenhouse'], { greenhouse: jobUrl }, job.greenhouse_id);
    }

    // Filter number badges
    const allBadges = (job._filterNums || []).filter(f => f.num);
    const maxBadges = 3;
    let filterBadges = allBadges.slice(0, maxBadges)
      .map(f => `<span class="job-filter-badge" style="background:${f.color};">${f.num}</span>`)
      .join('');
    if (allBadges.length > maxBadges) {
      filterBadges += `<span class="job-filter-badge" style="background:var(--text-faint);font-size:9px;">+${allBadges.length - maxBadges}</span>`;
    }

      const levelInfo = getJobLevel(job.title, window._activeLevelHierarchy);
      const levelCell = levelInfo
        ? `<span class="level-badge" style="background:${levelInfo.color}20;color:${levelInfo.color};">${levelInfo.label}</span>`
        : '—';

    // NEW badge — job first seen after last feed view
    const isNew = lastViewDate && job.first_seen_at && new Date(job.first_seen_at) > lastViewDate;
    if (isNew) newCount++;
    const newBadge = isNew ? '<span class="jt-new-badge">NEW</span>' : '';

    // Fraud detection badge (v6.31)
    const fraudBadge = fraudBadgeHtml(job.greenhouse_id);
    if (fraudBadge && typeof posthog !== 'undefined' && !job._fraudBadgeTracked) {
      var _fbi = _fraudScoreCache[job.greenhouse_id];
      posthog.capture('fraud_badge_viewed', { fraud_label: _fbi ? _fbi.label : 'unknown', job_id: job.greenhouse_id });
      job._fraudBadgeTracked = true;
    }

    // AI JD detection badge (v6.41 — Session 3.1)
    const aiJdBadge = aiJdBadgeHtml(job.greenhouse_id);

    html += `<tr class="job-data-row" data-jobid="${escapeHtml(job.greenhouse_id)}" data-level-rank="${levelInfo ? levelInfo.rank : 999}">
      <td class="jt-title"><span class="sf-del" onclick="hideJob('${escapeHtml(job.greenhouse_id)}', this)" title="Hide this job">✕</span>${filterBadges}<span class="job-title-link" data-jobid="${escapeHtml(job.greenhouse_id)}" title="${escapeHtml(job.title||'')}">${truncate(job.title, 55)}</span>${newBadge}${fraudBadge}${aiJdBadge}</td>
      <td class="jt-level">${levelCell}</td>
      <td class="jt-company">${truncate(cleanCompanyName(job.company_name), 30)}</td>
      <td class="jt-loc" title="${escapeHtml(job.location||'')}">${truncate(formatLocation(job.location, job.loc_display, activeNegLocs), 35)}</td>
      <td class="jt-salary">${formatSalaryCell(job)}</td>
      <td class="jt-days" style="${daysClass}">${daysStr}</td>
      <td class="jt-match"${job._aiScoringExcluded ? ' style="opacity:0.3;" title="Match score excluded per your AI content preferences"' : ''}>${typeof matchBadgeWithBoost==='function'?matchBadgeWithBoost(jobMatchScores[job.greenhouse_id],job.greenhouse_id,job.title,job.company_name):matchBadge(jobMatchScores[job.greenhouse_id])}</td>
      <td class="jt-actions"><div style="white-space:nowrap;display:flex;gap:4px;align-items:center;">
        ${saveBtn}${applyBtn}
      </div></td>
    </tr>
    <tr class="job-snippet-row"><td colspan="8">${trustBannerHtml(job.greenhouse_id)}${aiContentBannerHtml(job.greenhouse_id)}<span class="job-snippet-text" data-preview-id="${job.greenhouse_id}"></span></td></tr>`;
  }

  // UX-006: Proper pagination controls (replaces inline Load More)
  renderPagination(jobs.length, total, page);

  tbody.innerHTML = html;
  // POD3-LUCIDE: Re-initialize Lucide icons in dynamically injected job cards
  if (typeof window.refreshIcons === 'function') window.refreshIcons();

  // Update last feed view timestamp (so NEW badges refresh next visit)
  localStorage.setItem('bj_last_feed_view', new Date().toISOString());

  // Show new jobs count in filter stats area if any
  if (newCount > 0) {
    const countEl = $('#filter-count');
    if (countEl) {
      const existing = countEl.textContent;
      countEl.innerHTML = `${existing} <span style="color:var(--accent);font-weight:600;margin-left:6px;"><i data-lucide="sparkles" class="icon-xs icon-stroke"></i> ${newCount} new since last visit</span>`;
      if (typeof window.refreshIcons === 'function') window.refreshIcons();
    }
  }

  // Background salary enrichment — fetch specs for jobs without salary
  backgroundEnrichSalary();

  // Refresh keyword panel if it's open
  refreshKeywordsIfOpen();

  // Load preview snippets if toggle is on
  if ($('#preview-toggle')?.checked) {
    loadPreviewSnippets();
  }
}

// ============================================================
// UX-006: Proper pagination controls
// ============================================================
function renderPagination(pageJobCount, total, currentPage) {
  const container = $('#feed-pagination');
  if (!container) return;

  const totalPages = Math.max(1, Math.ceil(total / JOBS_PER_PAGE));
  const from = currentPage * JOBS_PER_PAGE + 1;
  const to = Math.min(from + pageJobCount - 1, total);

  if (total === 0 || pageJobCount === 0) {
    container.innerHTML = '';
    return;
  }

  // Summary: "Showing 1–50 of 1,325 jobs"
  let html = `<div class="fp-summary">Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()} job${total !== 1 ? 's' : ''}</div>`;

  // Only show page controls if there are multiple pages
  if (totalPages > 1) {
    html += '<div class="fp-controls">';

    // Previous button
    html += `<button class="fp-btn" ${currentPage === 0 ? 'disabled' : ''} onclick="searchJobs(${currentPage - 1})" title="Previous page">‹ Prev</button>`;

    // Page number buttons with smart ellipsis
    const pages = _buildPageRange(currentPage, totalPages);
    for (const p of pages) {
      if (p === '...') {
        html += '<span class="fp-ellipsis">…</span>';
      } else {
        const isActive = p === currentPage;
        html += `<button class="fp-btn${isActive ? ' fp-active' : ''}" ${isActive ? 'disabled' : `onclick="searchJobs(${p})"`}>${p + 1}</button>`;
      }
    }

    // Next button
    const isLastPage = currentPage >= totalPages - 1;
    html += `<button class="fp-btn" ${isLastPage ? 'disabled' : ''} onclick="searchJobs(${currentPage + 1})" title="Next page">Next ›</button>`;
    html += '</div>';
  }

  container.innerHTML = html;
}

// Build smart page range: [0, 1, '...', 5, 6, 7, '...', 19, 20]
function _buildPageRange(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i);
  }
  const pages = new Set();
  // Always show first and last page
  pages.add(0);
  pages.add(total - 1);
  // Show current page and neighbors
  for (let i = Math.max(0, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.add(i);
  }
  // Sort and insert ellipsis
  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      result.push('...');
    }
    result.push(sorted[i]);
  }
  return result;
}

// UX-006: Export renderPagination for SPA bridge
window.renderPagination = renderPagination;

let _enrichRunning = false;
async function backgroundEnrichSalary() {
  if (_enrichRunning) return;
  _enrichRunning = true;
  try {
    // First: parse salary from jobs that already have content but no salary
    const hasCachedContent = allJobs.filter(j => !j.salary_min && j.content);
    for (const job of hasCachedContent) {
      const salary = parseSalaryFromContent(job.content);
      if (salary) {
        job.salary_min = salary.min;
        job.salary_max = salary.max;
        job.salary_currency = salary.currency || 'USD'; job.salary_rate = salary.rate || 'yr';
        const cell = document.querySelector(`tr[data-jobid="${job.greenhouse_id}"] .jt-salary`);
        if (cell) cell.textContent = formatSalaryCell(job);
        console.log(`[BJ] Parsed cached: ${job.title} → ${salary.currency || 'USD'} $${Math.round(salary.min/1000)}k-$${Math.round(salary.max/1000)}k`);
        enrichJob(job.greenhouse_id, { salary: { min: salary.min, max: salary.max, raw: salary.raw, currency: salary.currency || 'USD', rate: salary.rate || 'yr' } });
      }
    }

    // Then: fetch specs for jobs without content or salary (Greenhouse only — other ATS platforms don't have this API)
    // Skip jobs already marked unavailable (sentinel value from prior failed fetches)
    const needsFetch = allJobs.filter(j => !j.salary_min && !j.content && (!j.ats_source || j.ats_source === 'greenhouse')).slice(0, 20);
    if (needsFetch.length === 0) { _enrichRunning = false; return; }
    console.log(`[BJ] Background salary enrichment: ${needsFetch.length} jobs`);

    for (const job of needsFetch) {
      const jobUrl = job.url && job.url.startsWith('http') ? job.url : job.url ? 'https://boards.greenhouse.io' + job.url : null;
      if (!jobUrl) continue;

      let apiUrl = null;
      const urlMatch = jobUrl.match(/boards\.greenhouse\.io\/([^\/]+)\/jobs\/(\d+)/);
      if (urlMatch) {
        apiUrl = `https://boards-api.greenhouse.io/v1/boards/${urlMatch[1]}/jobs/${urlMatch[2]}`;
      } else if (job.company_name && job.greenhouse_id) {
        // Slug fallback for self-hosted career pages
        apiUrl = `https://boards-api.greenhouse.io/v1/boards/${job.company_name}/jobs/${job.greenhouse_id}`;
      }
      if (!apiUrl) continue;

      try {
        const resp = await fetch(apiUrl);
        if (!resp.ok) {
          // 404/410 = listing removed from ATS. Mark content so we never retry this job.
          if (resp.status === 404 || resp.status === 410) {
            job.content = '<!-- unavailable -->';
            enrichJob(job.greenhouse_id, { content: job.content });
          }
          continue;
        }
        const data = await resp.json();
        if (!data.content) continue;

        const htmlContent = decodeJobContent(data.content);
        job.content = htmlContent;
        const salary = parseSalaryFromContent(htmlContent);
        const updateData = { content: htmlContent };
        if (salary) {
          updateData.salary_min = salary.min;
          updateData.salary_max = salary.max;
          updateData.salary_raw = salary.raw;
          updateData.salary_currency = salary.currency || 'USD'; updateData.salary_rate = salary.rate || 'yr';
          job.salary_min = salary.min;
          job.salary_max = salary.max;
          job.salary_currency = salary.currency || 'USD'; job.salary_rate = salary.rate || 'yr';
          // Update feed cell live
          const cell = document.querySelector(`tr[data-jobid="${job.greenhouse_id}"] .jt-salary`);
          if (cell) cell.textContent = formatSalaryCell(job);
          console.log(`[BJ] Enriched: ${job.title} → ${salary.currency || 'USD'} $${Math.round(salary.min/1000)}k-$${Math.round(salary.max/1000)}k`);
        }
        enrichJob(job.greenhouse_id, { content: updateData.content, salary: updateData.salary_min ? { min: updateData.salary_min, max: updateData.salary_max, raw: updateData.salary_raw, currency: updateData.salary_currency, rate: updateData.salary_rate } : undefined });

        // Polite delay between API calls
        await new Promise(r => setTimeout(r, 300));
      } catch(e) { reportError('job-feed:skip failed jobs silently', e); }
    }
  } finally {
    _enrichRunning = false;
    // Re-compute match scores now that content is available
    if (typeof computeVisibleJobScores === 'function') computeVisibleJobScores();
  }
}

// CS-P1-004 FE-005: Register job-feed exports with BJ namespace
(function() {
  ['_activeLevelHierarchy','_chatFilterOverride'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'job-feed', registered: Date.now() };
    }
  });
})();
