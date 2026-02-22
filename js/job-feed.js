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
  { key: 'wrong_title', label: 'Wrong title' },
  { key: 'wrong_location', label: 'Wrong location' },
  { key: 'wrong_company', label: 'Wrong company' },
  { key: 'too_old', label: 'Too old' },
  { key: 'wrong_pay', label: 'Wrong pay' },
  { key: 'other', label: 'Other / not relevant' },
];

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

  // Radius search via RPC
  for (const pill of radiusPills) {
    try {
      const { data, error } = await sb.rpc('find_jobs_within_radius', {
        p_lat: pill.lat,
        p_lng: pill.lng,
        p_radius_mi: pill.radius_mi,
      });
      if (!error && data) {
        data.forEach(r => allIds.add(r.greenhouse_id));
      }
      console.log(`[BJ] Radius search: ${pill.values[0]} (${pill.radius_mi}mi) → ${data?.length || 0} jobs`);
    } catch (e) {
      console.warn('[BJ] Radius search failed for', pill.values[0], e);
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

  for (const pill of statePills) {
    try {
      let query = sb
        .from('ats_jobs')
        .select('greenhouse_id')
        .eq('status', 'open')
        .eq('loc_state', pill.stateCode);

      // For ambiguous codes, exclude jobs with known foreign city/country names in location
      const exclusions = ambiguousExclusions[pill.stateCode];
      if (exclusions) {
        for (const excl of exclusions) {
          query = query.not('location', 'ilike', `%${excl}%`);
        }
        // Also exclude if loc_country is set to the state code itself (means the country, not the state)
        query = query.not('loc_country', 'eq', pill.stateCode);
        query = query.not('location', 'ilike', 'Remote -%');
      }

      const { data, error } = await query;
      if (!error && data) {
        data.forEach(r => allIds.add(r.greenhouse_id));
      }
      console.log(`[BJ] State search: ${pill.stateCode} → ${data?.length || 0} jobs`);
    } catch (e) {
      console.warn('[BJ] State search failed for', pill.stateCode, e);
    }
  }

  // Remote search — either from explicit Remote pill OR includeRemote toggle
  const shouldSearchRemote = remotePills.length > 0 || (includeRemote && radiusPills.length + statePills.length > 0);
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
    } catch (e) {
      console.warn('[BJ] Remote search failed', e);
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
        } catch (e) {
          console.warn('[BJ] Text location search failed for', v, e);
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
  };
}

function buildFilterQuery(sf, baseQuery, locationIds) {
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
  const tuning = JSON.parse(localStorage.getItem('bj_tuning') || '{}');

  // WHAT — title matching via ilike + full-text search (ilike uses trigram index)
  // All What pills are OR'd together (each pill is one keyword)
  const allWhatClauses = w.flatMap(pill => {
    return pill.values.flatMap(v => {
      const safe = v.replace(/[,()]/g, '').trim();
      if (!safe) return [];
      return [
        `title.ilike.%${safe}%`,
        `search_vector.wfts(english).${safe}`,
      ];
    });
  });
  if (allWhatClauses.length > 0) query = query.or(allWhatClauses.join(','));

  // WHAT NOT — title not ilike
  for (const pill of wnot) {
    for (const v of pill.values) {
      const term = v.trim().replace(/^nor\s+/i, '');
      if (term) {
        query = query.not('title', 'ilike', `%${term}%`);
      }
    }
  }
  // Global title exclusions
  for (const pill of (tuning.titleExcludes || [])) {
    for (const v of (pill.values || [])) {
      query = query.not('title', 'ilike', `%${v}%`);
    }
  }

  // WHERE — use pre-fetched location IDs or bounding box
  if (locationIds && locationIds.includeIds !== null) {
    if (locationIds.includeIds.length === 0) {
      // No matches — force empty result
      query = query.in('greenhouse_id', ['__NO_MATCH__']);
    } else if (locationIds.includeIds.length <= 200) {
      // Small enough for URL-based .in() query
      query = query.in('greenhouse_id', locationIds.includeIds);
    } else if (locationIds.boundingBox) {
      // Too many IDs — use bounding box filter instead
      const bb = locationIds.boundingBox;
      query = query
        .gte('job_lat', bb.minLat)
        .lte('job_lat', bb.maxLat)
        .gte('job_lng', bb.minLng)
        .lte('job_lng', bb.maxLng);
    } else {
      // Fallback: chunk IDs into batches (use first 200 as approximation)
      query = query.in('greenhouse_id', locationIds.includeIds.slice(0, 200));
    }

    // Country disambiguation: if searching US locations, exclude clearly non-US jobs
    // This catches cases like Vancouver, BC being confused with Vancouver, WA
    if (locationIds.isUSSearch) {
      query = query.not('loc_country', 'eq', 'CA');
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
    // Location filtering — search both raw, normalized, and FTS
    for (const pill of wh) {
      if (pill.values.length === 1) {
        const v = pill.values[0];
        query = query.or(`location.ilike.%${v}%,loc_display.ilike.%${v}%,loc_country.ilike.%${v}%,search_vector.wfts(english).${v}`);
      } else {
        const clauses = pill.values.flatMap(v => [
          `location.ilike.%${v}%`,
          `loc_display.ilike.%${v}%`,
          `search_vector.wfts(english).${v}`,
        ]);
        query = query.or(clauses.join(','));
      }
    }
    if (tuning.usOnly) {
      query = query.or('loc_country.eq.US,loc_country.is.null');
      // Exclude jobs where location string clearly indicates non-US country
      // (needed because many jobs have loc_country=null but location like "remote, gb")
      const nonUS = ['gb','uk','de','fr','au','ca','in','ie','nl','sg','jp','br','es','it','il','se','dk','no','fi','nz','at','ch','be','pl','cz','pt','hk','kr','mx','ae'];
      for (const cc of nonUS) {
        query = query.not('location', 'ilike', `%, ${cc}`);
      }
      // Also exclude full country names (many jobs use "City, Country" or "Country - Remote")
      const nonUSNames = ['India','Germany','United Kingdom','France','Australia','Canada','Ukraine','Israel','Netherlands','Singapore','Ireland','Brazil','Spain','Italy','Japan','Korea','Sweden','Poland','Mexico','Argentina','Colombia','Philippines','Romania','Czech','Portugal','Hong Kong','Denmark','Norway','Finland','Austria','Switzerland','Belgium','Turkey','Thailand','Vietnam','Taiwan','Malaysia','New Zealand'];
      for (const name of nonUSNames) {
        query = query.not('location', 'ilike', `%${name}%`);
      }
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
  if (tuning.excludeHourly) {
    query = query.not('salary_rate', 'eq', 'hr');
  }

  // Remote job handling
  // Determine if Remote is explicitly in WHERE or NOT WHERE
  const hasExplicitRemote = wh.some(p => p.locType === 'remote' || (p.values && p.values[0]?.toLowerCase() === 'remote'));
  const hasExplicitNotRemote = whnot.some(p => p.values && p.values[0]?.toLowerCase() === 'remote');
  const hasLocationFilter = wh.length > 0 || (locationIds && locationIds.includeIds !== null);
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
  // When includeRemote is true, remote jobs are already included via getLocationMatchIds
  // or via the ilike fallback's broad matching. No additional filter needed.

  // WHO — company_name ilike
  // WHO — company_name ilike + FTS
  for (const pill of wo) {
    if (pill.values.length === 1) {
      query = query.or(`company_name.ilike.%${pill.values[0]}%,search_vector.wfts(english).${pill.values[0]}`);
    } else {
      const clauses = pill.values.flatMap(v => [
        `company_name.ilike.%${v}%`,
        `search_vector.wfts(english).${v}`,
      ]);
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

  // WHEN — updated_at gte
  for (const pill of wn) {
    for (const v of pill.values) {
      const since = parseWhenValue(v);
      if (since) query = query.gte('updated_at', since.toISOString());
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

  return query;
}

function parseWhenValue(v) {
  const lower = v.toLowerCase().trim();
  const now = new Date();
  if (lower.includes('today') || lower === '1d') {
    const d = new Date(now); d.setDate(d.getDate() - 1); return d;
  } else if (lower === 'week' || lower === '7d' || lower === '7 days' || lower === 'this week' || lower === '1 week') {
    const d = new Date(now); d.setDate(d.getDate() - 7); return d;
  } else if (lower.includes('month') && !lower.includes('3')) {
    const d = new Date(now); d.setDate(d.getDate() - 30); return d;
  } else if (lower.includes('3 month') || lower === '90d') {
    const d = new Date(now); d.setDate(d.getDate() - 90); return d;
  }
  // Generic "N days" / "Nd" / "last N days" / "N weeks"
  var m = lower.match(/(\d+)\s*d(?:ays?)?/);
  if (m) { const d = new Date(now); d.setDate(d.getDate() - parseInt(m[1])); return d; }
  m = lower.match(/(\d+)\s*w(?:eeks?)?/);
  if (m) { const d = new Date(now); d.setDate(d.getDate() - parseInt(m[1]) * 7); return d; }
  return null;
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

// Main search: OR across all checked saved filters
async function searchJobs(page = 0) {
  currentJobPage = page;
  const tbody = $('#job-table-body');
  const checked = getCheckedSavedFilters();
  const hasBuilderPills = allPills() > 0;

  // If nothing is driving the search, show prompt but with global stats
  if (checked.length === 0 && !hasBuilderPills) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--text-faint);padding:48px 12px;">
      <div style="margin-bottom:12px;color:var(--text-faint);"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.25;"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg></div>
      <div style="font-size:14px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">Select saved filters or add filters to search jobs</div>
      <div style="font-size:12px;max-width:360px;margin:0 auto;line-height:1.5;">Check one or more saved filters above, or use the filter builder.</div>
    </td></tr>`;
    await updateJobStatsFromFilters(null);
    $('#filter-count').textContent = '';
    return;
  }

  // Show loading
  tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--text-faint);padding:32px 12px;">
    <div style="font-size:13px;">Searching jobs…</div>
  </td></tr>`;

  try {
    // Build list of filters to run
    let filtersToRun = [];
    if (checked.length > 0) {
      filtersToRun = checked;
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
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--text-faint);padding:48px 12px;">
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
    const tuningForLoc = JSON.parse(localStorage.getItem('bj_tuning') || '{}');
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

    if (filtersToRun.length === 1) {
      // Single filter — straightforward query with count + pagination
      let query = sb.from('ats_jobs').select('*', { count: 'exact' });
      query = buildFilterQuery(filtersToRun[0], query, filtersToRun[0]._locationIds);
      if (hiddenIds.length > 0) {
        query = query.not('greenhouse_id', 'in', `(${hiddenIds.join(',')})`);
      }

      // Multi-sort (skip 'level' — client-side only)
      for (const s of jobSortStack) {
        if (s.field === 'level' || s.field === 'match') continue;
        query = query.order(s.field, { ascending: s.asc });
      }

      const from = page * JOBS_PER_PAGE;
      query = query.range(from, from + JOBS_PER_PAGE - 1);

      const { data: jobs, error, count } = await query;
      if (error) throw error;
      allJobs = (jobs || []).map(j => ({ ...j, _filterNums: [{ num: filtersToRun[0]._filterNum || '', color: filtersToRun[0]._filterColor || '' }] }));
      totalCount = count || 0;
    } else {
      // Multiple filters — fetch up to limit per filter, merge, dedupe
      const perFilter = Math.ceil(200 / filtersToRun.length);
      const promises = filtersToRun.map(sf => {
        let q = sb.from('ats_jobs').select('*', { count: 'exact' });
        q = buildFilterQuery(sf, q, sf._locationIds);
        if (hiddenIds.length > 0) {
          q = q.not('greenhouse_id', 'in', `(${hiddenIds.join(',')})`);
        }
        for (const s of jobSortStack) {
          if (s.field === 'level' || s.field === 'match') continue;
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

    // Update filter count display
    $('#filter-count').innerHTML = `<strong>${totalCount.toLocaleString()}</strong> job${totalCount !== 1 ? 's' : ''} found`;

    // Update top stat cards
    await updateJobStatsFromFilters(filtersToRun);

    if (currentJobs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--text-faint);padding:48px 12px;">
        <div style="font-size:14px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">No jobs match these filters</div>
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
    if (matchSort) {
      currentJobs.sort((a, b) => {
        const ra = jobMatchScores[a.greenhouse_id];
        const rb = jobMatchScores[b.greenhouse_id];
        const sa = ra ? (typeof ra === 'number' ? ra : ra.score) : -1;
        const sb2 = rb ? (typeof rb === 'number' ? rb : rb.score) : -1;
        return matchSort.asc ? sa - sb2 : sb2 - sa;
      });
    }

    renderJobRows(currentJobs, totalCount, page, filtersToRun);

  } catch (e) {
    console.error('Search error:', e);
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--red);padding:32px 12px;">
      <div style="font-size:13px;">Search failed: ${e.message}</div>
    </td></tr>`;
  }
}

// Update top stat cards based on filter results
// If filters is null/empty, show global totals with tuning applied
async function updateJobStatsFromFilters(filters) {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 86400000);
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
    const tuningForLoc = JSON.parse(localStorage.getItem('bj_tuning') || '{}');
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

    for (const sf of effectiveFilters) {
      const locIds = sf._statsLocationIds || null;

      // Total count
      let q = sb.from('ats_jobs').select('greenhouse_id', { count: 'exact', head: true });
      q = buildFilterQuery(sf, q, locIds);
      q = excludeHidden(q);
      const { count: c1 } = await q;
      total += (c1 || 0);

      // Last 24h count
      let q2 = sb.from('ats_jobs').select('greenhouse_id', { count: 'exact', head: true });
      q2 = buildFilterQuery(sf, q2, locIds);
      q2 = excludeHidden(q2);
      q2 = q2.gte('updated_at', last24h.toISOString());
      const { count: c2 } = await q2;
      todayCount += (c2 || 0);

      // New since last login
      if (lastViewDate) {
        let qLogin = sb.from('ats_jobs').select('greenhouse_id', { count: 'exact', head: true });
        qLogin = buildFilterQuery(sf, qLogin, locIds);
        qLogin = excludeHidden(qLogin);
        qLogin = qLogin.gte('first_seen_at', lastViewDate.toISOString());
        const { count: cLogin } = await qLogin;
        newSinceLoginCount += (cLogin || 0);
      }
    }

    // Company count — distinct company_slugs from matching jobs
    const firstLocIds = effectiveFilters[0]._statsLocationIds || null;
    let cq = sb.from('ats_jobs').select('company_slug');
    cq = buildFilterQuery(effectiveFilters[0], cq, firstLocIds);
    cq = excludeHidden(cq);
    cq = cq.limit(2000);
    const { data: coRows } = await cq;
    const uniqueCos = new Set();
    if (coRows) coRows.forEach(r => { if (r.company_slug) uniqueCos.add(r.company_slug); });
    companyCount = uniqueCos.size;

    updateJobStats(total, companyCount, newSinceLoginCount, todayCount);
  } catch (e) {
    console.error('Stats update error:', e);
    // Fallback: compute from loaded jobs if available
    try {
      var jobs = typeof currentJobs !== 'undefined' ? currentJobs : [];
      var cos = new Set();
      jobs.forEach(function(j) { if (j.company_slug) cos.add(j.company_slug); });
      updateJobStats(jobs.length, cos.size, 0, 0);
    } catch (e2) {}
  }
}

function updateJobStats(total, companies, newSinceLogin, newToday) {
  $('#j-total').textContent = total.toLocaleString();
  $('#j-companies').textContent = companies.toLocaleString();
  $('#j-new-login').textContent = newSinceLogin.toLocaleString();
  $('#j-new').textContent = newToday.toLocaleString();
  $('#j-saved').textContent = savedJobIds.length.toLocaleString();
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
  if (!str) return '—';
  return str.length > max ? str.slice(0, max) + '…' : str;
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
  s = s.replace(/Remote\s*[-–—]\s*/gi, 'remote, ');
  // Trailing "United States of America" or "United States"
  s = s.replace(/,?\s*United States of America/gi, '');
  s = s.replace(/,?\s*United States/gi, '');
  // Clean up
  s = s.replace(/^[,\s]+|[,\s]+$/g, '');
  // If just country code left, normalize
  if (/^us$/i.test(s)) s = 'us';
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


function renderJobRows(jobs, total, page, filtersToRun) {
  const tbody = $('#job-table-body');
  const now = new Date();

  // Collect active negative location terms for display
  const activeNegLocs = [];
  const tuning = JSON.parse(localStorage.getItem('bj_tuning') || '{}');
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

  let html = '';
  let newCount = 0;
  for (const job of jobs) {
    const daysAgo = job.updated_at ? Math.floor((now - new Date(job.updated_at)) / 86400000) : '—';
    const daysStr = typeof daysAgo === 'number' ? (daysAgo === 0 ? 'today' : daysAgo + 'd') : '—';
    const daysClass = typeof daysAgo === 'number' && daysAgo <= 3 ? 'color:var(--green);' : '';

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
      const jobUrl = job.url && job.url.startsWith('http') ? job.url : job.url ? 'https://boards.greenhouse.io' + job.url : '#';
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

    html += `<tr class="job-data-row" data-jobid="${job.greenhouse_id}" data-level-rank="${levelInfo ? levelInfo.rank : 999}">
      <td style="padding:6px 4px;"><button class="job-action-btn hide-btn" onclick="hideJob('${job.greenhouse_id}', this)" style="padding:2px 6px;font-size:9px;">✕</button></td>
      <td class="jt-title">${filterBadges}<span class="job-title-link" data-jobid="${job.greenhouse_id}" title="${(job.title||'').replace(/"/g,'&quot;')}">${truncate(job.title, 55)}</span>${newBadge}</td>
      <td class="jt-level">${levelCell}</td>
      <td class="jt-company">${truncate(cleanCompanyName(job.company_name), 30)}</td>
      <td class="jt-ghost" title="Ghost Rate — coming soon" style="cursor:help;color:var(--text-faint);font-style:italic;font-size:10px;">soon</td>
      <td class="jt-loc" title="${(job.location||'').replace(/"/g,'&quot;')}">${truncate(formatLocation(job.location, job.loc_display, activeNegLocs), 35)}</td>
      <td class="jt-salary">${formatSalaryCell(job)}</td>
      <td class="jt-days" style="${daysClass}">${daysStr}</td>
      <td class="jt-match">${matchBadge(jobMatchScores[job.greenhouse_id])}</td>
      <td><div style="white-space:nowrap;display:flex;gap:4px;align-items:center;">
        ${saveBtn}${applyBtn}
      </div></td>
    </tr>
    <tr class="job-snippet-row"><td></td><td colspan="8"><span class="job-snippet-text" data-preview-id="${job.greenhouse_id}"></span></td><td></td></tr>`;
  }

  // Pagination row
  const totalPages = Math.ceil(total / JOBS_PER_PAGE);
  if (totalPages > 1) {
    html += `<tr><td colspan="10" style="text-align:center;padding:16px;">
      <div style="display:flex;justify-content:center;align-items:center;gap:12px;">
        ${page > 0 ? `<button class="btn btn-sm btn-secondary" onclick="searchJobs(${page - 1})">← Prev</button>` : ''}
        <span style="font-size:12px;color:var(--text-faint);">Page ${page + 1} of ${totalPages.toLocaleString()} (${total.toLocaleString()} jobs)</span>
        ${page < totalPages - 1 ? `<button class="btn btn-sm btn-secondary" onclick="searchJobs(${page + 1})">Next →</button>` : ''}
      </div>
    </td></tr>`;
  }

  tbody.innerHTML = html;

  // Update last feed view timestamp (so NEW badges refresh next visit)
  localStorage.setItem('bj_last_feed_view', new Date().toISOString());

  // Show new jobs count in filter stats area if any
  if (newCount > 0) {
    const countEl = $('#filter-count');
    if (countEl) {
      const existing = countEl.textContent;
      countEl.innerHTML = `${existing} <span style="color:var(--accent);font-weight:600;margin-left:6px;">🆕 ${newCount} new since last visit</span>`;
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
      } catch (e) { /* skip failed jobs silently */ }
    }
  } finally {
    _enrichRunning = false;
    // Re-compute match scores now that content is available
    if (typeof computeVisibleJobScores === 'function') computeVisibleJobScores();
  }
}

