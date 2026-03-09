// ---- Location autocomplete / disambiguation ----
const qbInputWhere = $('#qb-input-where');
const locationDropdown = $('#location-dropdown');
let locationSearchTimeout;

// ─── US-only location filter (used when tuning "United States" is checked) ───
const US_STATE_NAMES_SET = new Set([
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut',
  'delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa',
  'kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan',
  'minnesota','mississippi','missouri','montana','nebraska','nevada',
  'new hampshire','new jersey','new mexico','new york','north carolina',
  'north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island',
  'south carolina','south dakota','tennessee','texas','utah','vermont',
  'virginia','washington','west virginia','wisconsin','wyoming',
  'district of columbia',
]);
function isUSLocation(normalized) {
  // normalized is lowercase, e.g. "new york, new york" or "berlin, germany"
  // Check if the last part (after last comma) is a US state name
  const parts = normalized.split(',');
  if (parts.length < 2) return false;
  const last = parts[parts.length - 1].trim();
  if (US_STATE_NAMES_SET.has(last)) return true;
  // Also allow "united states" or "us" or "usa" as the suffix
  if (last === 'united states' || last === 'us' || last === 'usa') return true;
  return false;
}

// ─── Cached ref_city_radius (static JSON, avoids Supabase query per keystroke) ───
let _refCityCache = null;
async function getRefCityRadius() {
  if (_refCityCache) return _refCityCache;
  // Try localStorage first (24h TTL)
  var cached = localStorage.getItem('bj_ref_city_radius');
  if (cached) {
    try {
      var parsed = JSON.parse(cached);
      if (parsed.ts && Date.now() - parsed.ts < 86400000) {
        _refCityCache = parsed.data;
        return _refCityCache;
      }
    } catch(e) { reportError('location:location', e); }
  }
  // Fetch static JSON
  try {
    var res = await fetch('/data/ref_city_radius.json');
    if (res.ok) {
      _refCityCache = await res.json();
      localStorage.setItem('bj_ref_city_radius', JSON.stringify({ data: _refCityCache, ts: Date.now() }));
      return _refCityCache;
    }
  } catch(e) { reportError('location', e); console.warn('[Location] Failed to load ref_city_radius.json:', e); }
  // Fallback to Supabase
  _refCityCache = [];
  return _refCityCache;
}

function searchRefCities(query, limit) {
  if (!_refCityCache || !_refCityCache.length) return [];
  var q = query.toLowerCase();
  return _refCityCache.filter(function(r) {
    if (r.city.toLowerCase().indexOf(q) !== -1) return true;
    if (r.aliases) {
      var arr = typeof r.aliases === 'string' ? [r.aliases] : r.aliases;
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].toLowerCase().indexOf(q) !== -1) return true;
      }
    }
    return false;
  }).slice(0, limit || 15);
}

qbInputWhere.addEventListener('input', () => {
  const q = qbInputWhere.value.trim();
  if (q.length < 2) { locationDropdown.classList.remove('open'); return; }
  clearTimeout(locationSearchTimeout);
  locationSearchTimeout = setTimeout(() => searchLocations(q), 200);
});

qbInputWhere.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
    // If dropdown is open and has results, force selection from dropdown
    if (locationDropdown.classList.contains('open')) {
      const first = locationDropdown.querySelector('.company-opt');
      if (first) {
        e.preventDefault();
        selectLocationFromDropdown(first);
        return;
      }
    }
    if (e.key === ',' || e.key === 'Enter') e.preventDefault();
    // Fall through to normal pill commit only if no dropdown
    commitPill(qbInputWhere, wherePills, raw => ({ values: [raw], type: 'where' }));
    renderAllPills();
    locationDropdown.classList.remove('open');
  } else if (e.key === 'Backspace' && qbInputWhere.value === '' && wherePills.length > 0) {
    wherePills.pop(); renderAllPills();
  } else if (e.key === 'Escape') {
    locationDropdown.classList.remove('open');
  } else if (e.key === 'ArrowDown' && locationDropdown.classList.contains('open')) {
    e.preventDefault();
    const first = locationDropdown.querySelector('.company-opt');
    if (first) first.focus();
  }
});

qbInputWhere.addEventListener('blur', () => {
  setTimeout(() => { locationDropdown.classList.remove('open'); }, 200);
});

async function searchLocations(query) {
  try {
    const ql = query.toLowerCase().trim();
    const results = [];
    const seenKeys = new Set();

    // US state codes for state-pill detection
    const US_STATES = {
      'AL':'Alabama','AK':'Alaska','AZ':'Arizona','AR':'Arkansas','CA':'California',
      'CO':'Colorado','CT':'Connecticut','DE':'Delaware','FL':'Florida','GA':'Georgia',
      'HI':'Hawaii','ID':'Idaho','IL':'Illinois','IN':'Indiana','IA':'Iowa','KS':'Kansas',
      'KY':'Kentucky','LA':'Louisiana','ME':'Maine','MD':'Maryland','MA':'Massachusetts',
      'MI':'Michigan','MN':'Minnesota','MS':'Mississippi','MO':'Missouri','MT':'Montana',
      'NE':'Nebraska','NV':'Nevada','NH':'New Hampshire','NJ':'New Jersey','NM':'New Mexico',
      'NY':'New York','NC':'North Carolina','ND':'North Dakota','OH':'Ohio','OK':'Oklahoma',
      'OR':'Oregon','PA':'Pennsylvania','RI':'Rhode Island','SC':'South Carolina','SD':'South Dakota',
      'TN':'Tennessee','TX':'Texas','UT':'Utah','VT':'Vermont','VA':'Virginia','WA':'Washington',
      'WV':'West Virginia','WI':'Wisconsin','WY':'Wyoming','DC':'District of Columbia',
    };

    // Check if query matches a state name or code
    const stateMatches = Object.entries(US_STATES).filter(([code, name]) =>
      code.toLowerCase() === ql || name.toLowerCase().startsWith(ql)
    );
    for (const [code, name] of stateMatches) {
      const key = `state:${code}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        results.push({
          display: `${name} (${code})`,
          type: 'state',
          stateCode: code,
          badge: 'state',
        });
      }
    }

    // Search ref_city_radius (cached locally)
    const refCities = await getRefCityRadius();
    const refData = searchRefCities(query, 15);

    if (refData) {
      for (const r of refData) {
        const key = `${r.city.toLowerCase()},${r.state.toLowerCase()},${r.type}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          results.push({
            display: r.type === 'metro' ? r.city : `${r.city}, ${r.state}`,
            type: r.type,
            lat: r.lat,
            lng: r.lng,
            radius_mi: r.radius_mi,
            city: r.city,
            state: r.state,
            badge: r.type === 'metro' ? 'metro' : 'radius',
          });
        }
      }
    }

    // Check "United States" country option
    if ('united states'.startsWith(ql) || 'usa'.startsWith(ql) || 'us'.startsWith(ql) || ql === 'u.s.' || ql === 'u.s.a.') {
      if (!seenKeys.has('country:us')) {
        seenKeys.add('country:us');
        results.push({ display: 'United States', type: 'country', countryCode: 'US', badge: 'country' });
      }
    }

    // Also check "remote"
    if ('remote'.startsWith(ql)) {
      if (!seenKeys.has('remote')) {
        seenKeys.add('remote');
        results.push({ display: 'Remote', type: 'remote', badge: 'remote' });
      }
    }

    // Search location_cache as fallback for unlisted locations
    const { data: cacheData } = await sb
      .from('location_cache')
      .select('raw_input, normalized, lat, lng, is_remote')
      .or(`raw_input.ilike.%${query}%,normalized.ilike.%${query}%`)
      .limit(10);

    if (cacheData) {
      for (const loc of cacheData) {
        const norm = loc.normalized?.toLowerCase() || loc.raw_input?.toLowerCase();
        // Skip remote variants (already handled above)
        if (norm.startsWith('remote')) continue;
        // When US-only tuning is on, skip non-US locations from cache
        if (tuningSettings.usOnly && !isUSLocation(norm)) continue;
        // Skip if already covered by ref table (check if any ref result city name is in this cache entry)
        const coveredByRef = results.some(r =>
          (r.type === 'city' || r.type === 'metro') && r.city &&
          norm.includes(r.city.toLowerCase())
        );
        if (coveredByRef) continue;
        if (seenKeys.has(norm)) continue;
        seenKeys.add(norm);
        results.push({
          display: loc.normalized || loc.raw_input,
          type: 'cache',
          badge: loc.lat && loc.lng ? 'pin' : '',
        });
      }
    }

    // Sort: exact prefix matches first, states first, then metros, then cities
    results.sort((a, b) => {
      const aPrefix = a.display.toLowerCase().startsWith(ql) ? 0 : 1;
      const bPrefix = b.display.toLowerCase().startsWith(ql) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      const typeOrder = { country: 0, state: 1, metro: 2, city: 3, radius: 3, remote: 4, cache: 5 };
      const aType = typeOrder[a.type] ?? 5;
      const bType = typeOrder[b.type] ?? 5;
      if (aType !== bType) return aType - bType;
      return a.display.localeCompare(b.display);
    });

    renderLocationDropdown(results.slice(0, 10), query);
  } catch(e) { reportError('location', e); console.warn('[BJ] Location search failed:', e);
  }
}

function renderLocationDropdown(results, query) {
  if (results.length === 0) { locationDropdown.classList.remove('open'); return; }

  locationDropdown.innerHTML = results.map(r => {
    const badgeMap = {
      state: '<span style="font-size:9px;background:rgba(139,92,246,0.1);color:#8b5cf6;padding:1px 6px;border-radius:4px;font-weight:600;">state</span>',
      metro: '<span style="font-size:9px;background:rgba(245,158,11,0.1);color:#f59e0b;padding:1px 6px;border-radius:4px;font-weight:600;">metro</span>',
      radius: `<span style="font-size:9px;background:rgba(99,102,241,0.1);color:#6366f1;padding:1px 6px;border-radius:4px;font-weight:600;">${r.radius_mi}mi</span>`,
      country: '<span style="font-size:9px;background:rgba(59,130,246,0.1);color:var(--accent);padding:1px 6px;border-radius:4px;font-weight:600;">country</span>',
      remote: '<span style="font-size:9px;background:rgba(52,211,153,0.1);color:var(--green);padding:1px 6px;border-radius:4px;font-weight:600;">remote</span>',
      pin: '<span style="font-size:9px;background:rgba(99,102,241,0.1);color:#6366f1;padding:1px 6px;border-radius:4px;font-weight:600;">📍</span>',
    };
    const badge = badgeMap[r.badge] || '';
    const hl = highlightCompanyMatch(r.display, query);
    const data = JSON.stringify({
      type: r.type, display: r.display,
      lat: r.lat, lng: r.lng, radius_mi: r.radius_mi,
      city: r.city, state: r.state, stateCode: r.stateCode,
    }).replace(/"/g, '&quot;');
    return `<div class="company-opt" tabindex="0" data-locdata="${data}" data-name="${r.display.replace(/"/g,'&quot;')}">
      <span style="font-weight:500;">${hl}</span>${badge}</div>`;
  }).join('');

  locationDropdown.classList.add('open');

  locationDropdown.querySelectorAll('.company-opt').forEach(opt => {
    opt.addEventListener('mousedown', e => {
      e.preventDefault();
      selectLocationFromDropdown(opt);
    });
    opt.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); selectLocationFromDropdown(opt); }
      if (e.key === 'ArrowDown') { e.preventDefault(); const n = opt.nextElementSibling; if (n) n.focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); const p = opt.previousElementSibling; if (p) p.focus(); else qbInputWhere.focus(); }
      if (e.key === 'Escape') { locationDropdown.classList.remove('open'); qbInputWhere.focus(); }
    });
  });
}

function selectLocationFromDropdown(opt) {
  const locData = JSON.parse(opt.dataset.locdata);
  const pill = { values: [locData.display.toLowerCase()], type: 'where' };

  // Attach geo data for radius search
  if (locData.type === 'state') {
    pill.locType = 'state';
    pill.stateCode = locData.stateCode;
  } else if (locData.lat && locData.lng) {
    pill.locType = locData.type; // 'city' or 'metro'
    pill.lat = locData.lat;
    pill.lng = locData.lng;
    pill.radius_mi = locData.radius_mi;
  } else if (locData.type === 'remote') {
    pill.locType = 'remote';
    // Auto-check the include remote toggle
    const remoteCb = $('#save-filter-include-remote');
    if (remoteCb) remoteCb.checked = true;
  }

  wherePills.push(pill);
  renderAllPills();
  locationDropdown.classList.remove('open');
  qbInputWhere.value = '';
  debouncedSearchJobs();
}

// Input handling — What Not row
const qbInputWhatNot = $('#qb-input-what-not');
qbInputWhatNot.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    commitPill(qbInputWhatNot, whatNotPills, raw => ({ values: [raw], type: 'not' }));
  } else if (e.key === 'Backspace' && qbInputWhatNot.value === '' && whatNotPills.length > 0) {
    whatNotPills.pop(); renderAllPills();
  }
});
qbInputWhatNot.addEventListener('blur', () => {
  commitPill(qbInputWhatNot, whatNotPills, raw => ({ values: [raw], type: 'not' }));
});
$('#query-builder-what-not').addEventListener('click', e => {
  if (!e.target.closest('.qb-pill')) qbInputWhatNot.focus();
});

// Input handling — Where Not row
const qbInputWhereNot = $('#qb-input-where-not');
const locationNotDropdown = $('#location-not-dropdown');
let locationNotSearchTimeout;

qbInputWhereNot.addEventListener('input', () => {
  const q = qbInputWhereNot.value.trim();
  if (q.length < 2) { locationNotDropdown.classList.remove('open'); return; }
  clearTimeout(locationNotSearchTimeout);
  locationNotSearchTimeout = setTimeout(() => searchLocationsForNot(q), 200);
});

qbInputWhereNot.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    if (locationNotDropdown.classList.contains('open')) {
      const first = locationNotDropdown.querySelector('.company-opt');
      if (first) {
        selectLocationNotFromDropdown(first);
        return;
      }
    }
    commitPill(qbInputWhereNot, whereNotPills, raw => ({ values: [raw], type: 'not' }));
    locationNotDropdown.classList.remove('open');
  } else if (e.key === 'Backspace' && qbInputWhereNot.value === '' && whereNotPills.length > 0) {
    whereNotPills.pop(); renderAllPills();
  } else if (e.key === 'Escape') {
    locationNotDropdown.classList.remove('open');
  } else if (e.key === 'ArrowDown' && locationNotDropdown.classList.contains('open')) {
    e.preventDefault();
    const first = locationNotDropdown.querySelector('.company-opt');
    if (first) first.focus();
  }
});
qbInputWhereNot.addEventListener('blur', () => {
  setTimeout(() => { locationNotDropdown.classList.remove('open'); }, 200);
  commitPill(qbInputWhereNot, whereNotPills, raw => ({ values: [raw], type: 'not' }));
});
$('#query-builder-where-not').addEventListener('click', e => {
  if (!e.target.closest('.qb-pill')) qbInputWhereNot.focus();
});

// NOT WHERE search — same sources but simplified (no geo data needed)
async function searchLocationsForNot(query) {
  try {
    const ql = query.toLowerCase().trim();
    const results = [];
    const seenKeys = new Set();

    // US state codes
    const US_STATES = {
      'AL':'Alabama','AK':'Alaska','AZ':'Arizona','AR':'Arkansas','CA':'California',
      'CO':'Colorado','CT':'Connecticut','DE':'Delaware','FL':'Florida','GA':'Georgia',
      'HI':'Hawaii','ID':'Idaho','IL':'Illinois','IN':'Indiana','IA':'Iowa','KS':'Kansas',
      'KY':'Kentucky','LA':'Louisiana','ME':'Maine','MD':'Maryland','MA':'Massachusetts',
      'MI':'Michigan','MN':'Minnesota','MS':'Mississippi','MO':'Missouri','MT':'Montana',
      'NE':'Nebraska','NV':'Nevada','NH':'New Hampshire','NJ':'New Jersey','NM':'New Mexico',
      'NY':'New York','NC':'North Carolina','ND':'North Dakota','OH':'Ohio','OK':'Oklahoma',
      'OR':'Oregon','PA':'Pennsylvania','RI':'Rhode Island','SC':'South Carolina','SD':'South Dakota',
      'TN':'Tennessee','TX':'Texas','UT':'Utah','VT':'Vermont','VA':'Virginia','WA':'Washington',
      'WV':'West Virginia','WI':'Wisconsin','WY':'Wyoming','DC':'District of Columbia',
    };

    const stateMatches = Object.entries(US_STATES).filter(([code, name]) =>
      code.toLowerCase() === ql || name.toLowerCase().startsWith(ql)
    );
    for (const [code, name] of stateMatches) {
      const key = `state:${code}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        results.push({ display: `${name} (${code})`, badge: 'state' });
      }
    }

    // Search ref_city_radius (cached locally)
    const refData = searchRefCities(query, 10);
    if (refData) {
      for (const r of refData) {
        const display = r.type === 'metro' ? r.city : `${r.city}, ${r.state}`;
        const key = display.toLowerCase();
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          results.push({ display, badge: r.type === 'metro' ? 'metro' : 'city' });
        }
      }
    }

    // Search location_cache
    const { data: cacheData } = await sb
      .from('location_cache')
      .select('raw_input, normalized')
      .or(`raw_input.ilike.%${query}%,normalized.ilike.%${query}%`)
      .limit(8);
    if (cacheData) {
      for (const loc of cacheData) {
        const display = loc.normalized || loc.raw_input;
        const key = display.toLowerCase();
        if (!seenKeys.has(key) && !key.startsWith('remote')) {
          // When US-only tuning is on, skip non-US locations from cache
          if (tuningSettings.usOnly && !isUSLocation(key)) continue;
          seenKeys.add(key);
          results.push({ display, badge: 'pin' });
        }
      }
    }

    // Also offer "Remote" exclusion
    if ('remote'.startsWith(ql)) {
      if (!seenKeys.has('remote')) {
        seenKeys.add('remote');
        results.push({ display: 'Remote', badge: 'remote' });
      }
    }

    renderLocationNotDropdown(results.slice(0, 10), query);
  } catch(e) { reportError('location', e); console.warn('[BJ] NOT location search failed:', e);
  }
}

function renderLocationNotDropdown(results, query) {
  if (results.length === 0) { locationNotDropdown.classList.remove('open'); return; }
  const badgeMap = {
    state: '<span style="font-size:9px;background:rgba(139,92,246,0.1);color:#8b5cf6;padding:1px 6px;border-radius:4px;font-weight:600;">state</span>',
    metro: '<span style="font-size:9px;background:rgba(245,158,11,0.1);color:#f59e0b;padding:1px 6px;border-radius:4px;font-weight:600;">metro</span>',
    city: '<span style="font-size:9px;background:rgba(99,102,241,0.1);color:#6366f1;padding:1px 6px;border-radius:4px;font-weight:600;">city</span>',
    remote: '<span style="font-size:9px;background:rgba(52,211,153,0.1);color:var(--green);padding:1px 6px;border-radius:4px;font-weight:600;">remote</span>',
    pin: '<span style="font-size:9px;background:rgba(99,102,241,0.1);color:#6366f1;padding:1px 6px;border-radius:4px;font-weight:600;">📍</span>',
  };
  locationNotDropdown.innerHTML = results.map(r => {
    const badge = badgeMap[r.badge] || '';
    const hl = highlightCompanyMatch(r.display, query);
    return `<div class="company-opt" tabindex="0" data-name="${r.display.replace(/"/g,'&quot;')}">
      <span style="font-weight:500;">${hl}</span>${badge}</div>`;
  }).join('');
  locationNotDropdown.classList.add('open');

  locationNotDropdown.querySelectorAll('.company-opt').forEach(opt => {
    opt.addEventListener('mousedown', e => { e.preventDefault(); selectLocationNotFromDropdown(opt); });
    opt.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); selectLocationNotFromDropdown(opt); }
      if (e.key === 'ArrowDown') { e.preventDefault(); const n = opt.nextElementSibling; if (n) n.focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); const p = opt.previousElementSibling; if (p) p.focus(); else qbInputWhereNot.focus(); }
      if (e.key === 'Escape') { locationNotDropdown.classList.remove('open'); qbInputWhereNot.focus(); }
    });
  });
}

function selectLocationNotFromDropdown(opt) {
  const name = opt.dataset.name.toLowerCase();
  if (!whereNotPills.find(p => p.values[0]?.toLowerCase() === name)) {
    whereNotPills.push({ values: [name], type: 'not' });
  }
  // Auto-uncheck include remote when explicitly excluding Remote
  if (name.toLowerCase() === 'remote') {
    const remoteCb = $('#save-filter-include-remote');
    if (remoteCb) remoteCb.checked = false;
  }
  renderAllPills();
  locationNotDropdown.classList.remove('open');
  qbInputWhereNot.value = '';
  debouncedSearchJobs();
}

// Input handling — Who Not row (with typeahead)
const qbInputWhoNot = $('#qb-input-who-not');
const companyNotDropdown = $('#company-not-dropdown');
let companyNotSearchTimeout;

qbInputWhoNot.addEventListener('input', () => {
  const q = qbInputWhoNot.value.trim();
  if (q.length < 2) { companyNotDropdown.classList.remove('open'); return; }
  clearTimeout(companyNotSearchTimeout);
  companyNotSearchTimeout = setTimeout(() => searchCompaniesForNot(q), 200);
});

qbInputWhoNot.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    if (companyNotDropdown.classList.contains('open')) {
      const first = companyNotDropdown.querySelector('.company-opt');
      if (first) {
        selectCompanyNotFromDropdown(first);
        return;
      }
    }
    commitPill(qbInputWhoNot, whoNotPills, raw => ({ values: [raw], type: 'not' }));
    companyNotDropdown.classList.remove('open');
  } else if (e.key === 'Backspace' && qbInputWhoNot.value === '' && whoNotPills.length > 0) {
    whoNotPills.pop(); renderAllPills();
  } else if (e.key === 'Escape') {
    companyNotDropdown.classList.remove('open');
  } else if (e.key === 'ArrowDown' && companyNotDropdown.classList.contains('open')) {
    e.preventDefault();
    const first = companyNotDropdown.querySelector('.company-opt');
    if (first) first.focus();
  }
});
qbInputWhoNot.addEventListener('blur', () => {
  setTimeout(() => { companyNotDropdown.classList.remove('open'); }, 200);
  commitPill(qbInputWhoNot, whoNotPills, raw => ({ values: [raw], type: 'not' }));
});
$('#query-builder-who-not').addEventListener('click', e => {
  if (!e.target.closest('.qb-pill')) qbInputWhoNot.focus();
});

// NOT WHO search — reuse same search logic as WHO
async function searchCompaniesForNot(query) {
  const results = [];
  try {
    const { data: atsData } = await sb
      .from('ats_companies')
      .select('slug, name, source')
      .or(`slug.ilike.%${query}%,name.ilike.%${query}%`)
      .limit(6);
    if (atsData) {
      atsData.forEach(c => results.push({
        name: c.name || c.slug, slug: c.slug, source: 'ats', ats: c.source || 'greenhouse'
      }));
    }
  } catch (e) { reportError('location', e); console.warn('[BJ] ATS company search (not) failed:', e); }

  try {
    const { data: connData } = await sb
      .from('connections')
      .select('parsed_company')
      .ilike('parsed_company', `%${query}%`)
      .not('parsed_company', 'is', null)
      .limit(30);
    if (connData) {
      const counts = {};
      connData.forEach(p => {
        const n = (p.parsed_company || '').trim();
        if (n) counts[n] = (counts[n] || 0) + 1;
      });
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .forEach(([name, count]) => {
          if (!results.find(r => r.name.toLowerCase() === name.toLowerCase())) {
            results.push({ name, source: 'network', connections: count });
          }
        });
    }
  } catch (e) { reportError('location', e); console.warn('[BJ] Connection company search (not) failed:', e); }

  renderCompanyNotDropdown(results, query);
}

function renderCompanyNotDropdown(results, query) {
  if (results.length === 0) { companyNotDropdown.classList.remove('open'); return; }
  companyNotDropdown.innerHTML = results.map(r => {
    const badge = r.source === 'network'
      ? `<span style="font-size:9px;background:rgba(52,211,153,0.1);color:var(--green);padding:1px 6px;border-radius:4px;font-weight:600;">${r.connections} conn</span>`
      : `<span style="font-size:9px;background:rgba(99,102,241,0.1);color:#6366f1;padding:1px 6px;border-radius:4px;font-weight:600;">${r.ats}</span>`;
    const hl = highlightCompanyMatch(r.name, query);
    return `<div class="company-opt" tabindex="0" data-name="${r.name.replace(/"/g, '&quot;')}">
      <span style="font-weight:500;">${hl}</span>${badge}</div>`;
  }).join('');
  companyNotDropdown.classList.add('open');

  companyNotDropdown.querySelectorAll('.company-opt').forEach(opt => {
    opt.addEventListener('mousedown', e => { e.preventDefault(); selectCompanyNotFromDropdown(opt); });
    opt.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); selectCompanyNotFromDropdown(opt); }
      if (e.key === 'ArrowDown') { e.preventDefault(); const n = opt.nextElementSibling; if (n) n.focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); const p = opt.previousElementSibling; if (p) p.focus(); else qbInputWhoNot.focus(); }
      if (e.key === 'Escape') { companyNotDropdown.classList.remove('open'); qbInputWhoNot.focus(); }
    });
  });
}

function selectCompanyNotFromDropdown(opt) {
  const name = opt.dataset.name.toLowerCase();
  if (!whoNotPills.find(p => p.values[0]?.toLowerCase() === name)) {
    whoNotPills.push({ values: [name], type: 'not' });
  }
  renderAllPills();
  companyNotDropdown.classList.remove('open');
  qbInputWhoNot.value = '';
  debouncedSearchJobs();
}

// Collapse toggle
// Restore Jobs Feed collapse states from localStorage
const collapseStates = safeReadLS('bj_collapse', {});
if (collapseStates.qb) {
  $('#qb-toggle').classList.add('collapsed');
  $('#qb-collapse-body').classList.add('collapsed');
}
if (collapseStates.sf) {
  $('#sf-toggle').classList.add('collapsed');
  $('#sf-collapse-body').classList.add('collapsed');
}

function saveCollapseStates() {
  const states = safeReadLS('bj_collapse', {});
  states.qb = $('#qb-toggle').classList.contains('collapsed');
  states.sf = $('#sf-toggle').classList.contains('collapsed');
  localStorage.setItem('bj_collapse', JSON.stringify(states));
}

$('#qb-toggle').addEventListener('click', (e) => {
  if (e.target.id === 'clear-filters-btn' || e.target.closest('#clear-filters-btn')) return;
  const header = $('#qb-toggle');
  const body = $('#qb-collapse-body');
  header.classList.toggle('collapsed');
  body.classList.toggle('collapsed');
  saveCollapseStates();
});

// Saved filters collapse toggle
$('#sf-toggle').addEventListener('click', () => {
  $('#sf-toggle').classList.toggle('collapsed');
  $('#sf-collapse-body').classList.toggle('collapsed');
  saveCollapseStates();
});

// Update active filter count badge
function updateSfActiveCount() {
  const checked = $$('.sf-item-check:checked').length;
  const total = savedFilters.length;
  const badge = $('#sf-active-count');
  if (total > 0) {
    badge.textContent = `${checked} of ${total} active`;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
  updateSfStatusDot();
}

function updateSfStatusDot() {
  const dot = $('#sf-status-dot');
  if (!dot) return;
  const total = savedFilters.length;
  const checked = $$('.sf-item-check:checked').length;
  const hadPulse = dot.classList.contains('pulse');
  if (total > 0 && checked > 0) {
    dot.className = 'ext-status-dot connected';
    dot.title = checked + ' of ' + total + ' filters active';
  } else if (total > 0 && checked === 0) {
    dot.className = 'ext-status-dot warning';
    dot.title = total + ' filters saved but none active';
  } else {
    dot.className = 'ext-status-dot';
    dot.title = 'No saved filters';
  }
  if (hadPulse) dot.classList.add('pulse');
}

// Clear all
$('#clear-filters-btn').addEventListener('click', () => {
  window._editingFilterIdx = null; // POD3-GS: Prevent auto-save from wiping saved filter
  whatPills = [];
  wherePills = [];
  whenPills = [];
  whoPills = [];
  payPills = [];
  whatNotPills = [];
  whereNotPills = [];
  whoNotPills = [];
  skillsPills = [];
  levelPills = [];
  jdPills = [];
  deptPills = [];
  renderAllPills();
});

// Save filter — always-visible inline input
async function commitSaveFilter() {
  const name = $('#save-filter-name').value.trim().toLowerCase();
  if (!name || allPills() === 0) return;

  // Check if this is a new filter (not updating existing)
  const existingCheck = savedFilters.findIndex(f => f.name.toLowerCase() === name.toLowerCase());
  if (existingCheck < 0) {
    // New filter — check entitlement limit
    var ent = await checkEntitlement('filters', savedFilters.length);
    if (!ent.allowed) { showUpgradePrompt('Saved Filters', ent); return; }
  }

  // Warn if no WHERE filter set AND US-only tuning is off
  const tuningCheck = safeReadLS('bj_tuning', {});
  if (wherePills.length === 0 && !tuningCheck.usOnly) {
    alert(
      'Please add a location filter.\n\n' +
      'Without a location, this filter will match jobs worldwide.\n\n' +
      'Add a location like "Remote" or a specific city in the Where row, or enable "US Only" in Tuning, then save again.'
    );
    $('#qb-input-where').focus();
    // Open the filter builder if collapsed
    const body = $('#qb-collapse-body');
    if (body && !body.classList.contains('open')) {
      body.classList.add('open');
      $('#qb-chevron')?.classList.add('open');
    }
    return;
  }

  const filterData = {
    name,
    whatPills: JSON.parse(JSON.stringify(whatPills)),
    wherePills: JSON.parse(JSON.stringify(wherePills)),
    whenPills: JSON.parse(JSON.stringify(whenPills)),
    whoPills: JSON.parse(JSON.stringify(whoPills)),
    payPills: JSON.parse(JSON.stringify(payPills)),
    whatNotPills: JSON.parse(JSON.stringify(whatNotPills)),
    whereNotPills: JSON.parse(JSON.stringify(whereNotPills)),
    whoNotPills: JSON.parse(JSON.stringify(whoNotPills)),
    skillsPills: JSON.parse(JSON.stringify(skillsPills)),
    levelPills: JSON.parse(JSON.stringify(levelPills)),
    jdPills: JSON.parse(JSON.stringify(jdPills)),
    deptPills: JSON.parse(JSON.stringify(deptPills)),
    includeNoSalary: $('#save-filter-include-no-salary').checked,
    includeRemote: $('#save-filter-include-remote').checked,
    createdAt: Date.now(),
    lastUsed: Date.now(),
    useCount: 1
  };
  // Preserve existing per-filter level hierarchy if updating, otherwise inherit global default
  // POD3-SF: Use _editingFilterIdx as primary lookup (more reliable), fall back to name match
  var existingIdx = window._editingFilterIdx != null ? window._editingFilterIdx : -1;
  // Verify the idx points to a filter with the same name (or close match)
  if (existingIdx >= 0 && savedFilters[existingIdx] && savedFilters[existingIdx].name.toLowerCase() !== name.toLowerCase()) {
    // Name changed — user is creating a new filter from an edited one, not updating the original
    existingIdx = -1;
  }
  // Fallback: search by name if _editingFilterIdx wasn't set (e.g. user typed a name directly)
  if (existingIdx < 0) {
    existingIdx = savedFilters.findIndex(f => f.name.toLowerCase() === name.toLowerCase());
  }
  if (existingIdx >= 0 && savedFilters[existingIdx].levelHierarchy) {
    filterData.levelHierarchy = savedFilters[existingIdx].levelHierarchy;
  }
  if (existingIdx >= 0) {
    filterData.createdAt = savedFilters[existingIdx].createdAt || Date.now();
    // Preserve per-filter level hierarchy if it exists
    if (savedFilters[existingIdx].levelHierarchy) {
      filterData.levelHierarchy = savedFilters[existingIdx].levelHierarchy;
    }
    // Preserve level assignments
    if (savedFilters[existingIdx].assignedLevels) {
      filterData.assignedLevels = savedFilters[existingIdx].assignedLevels;
    }
    if (savedFilters[existingIdx].includeOtherLevels !== undefined) {
      filterData.includeOtherLevels = savedFilters[existingIdx].includeOtherLevels;
    }
    filterData.useCount = (savedFilters[existingIdx].useCount || 0) + 1;
    savedFilters[existingIdx] = filterData;
  } else {
    savedFilters.push(filterData);
  }
  saveUserData('bj_saved_filters', JSON.stringify(savedFilters));
  clearEntitlementCache('filters');
  invalidateCache(); // POD3-SF: bust query cache so re-search uses updated filter data
  // Only clear the name if it was a new filter
  if (existingIdx < 0) {
    $('#save-filter-name').value = '';
  }

  // POD3-SF: Preserve checkbox state across renderSavedFilters.
  // renderSavedFilters rebuilds the DOM, which destroys all checkbox states.
  // Without this, the feed goes blank after every save because no filters are checked.
  var checkedIdxs = [...$$('.sf-item-check:checked')].map(cb => parseInt(cb.dataset.idx));
  // If we just saved an existing filter, make sure it's in the checked set
  if (existingIdx >= 0 && !checkedIdxs.includes(existingIdx)) {
    checkedIdxs.push(existingIdx);
  }

  window._editingFilterIdx = null;
  renderSavedFilters();

  // Restore checkbox state after DOM rebuild
  checkedIdxs.forEach(function(idx) {
    var cb = document.querySelector('.sf-item-check[data-idx="' + idx + '"]');
    if (cb) {
      cb.checked = true;
      // Fire change event so any listeners (like sf-active-count) update
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  updateSfActiveCount();

  // Re-run search with updated filters (force immediate, not debounced)
  searchJobs(0);
}

$('#save-filter-go').addEventListener('click', commitSaveFilter);
$('#save-filter-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); commitSaveFilter(); }
});

// Search within saved filters
// Input handling — Pay row (min/max auto-pill)
function parseSalaryVal(val) {
  if (!val) return '';
  let clean = val.replace(/[\$\s,]/g, '').trim();
  const kMatch = clean.match(/^(\d+)k$/i);
  if (kMatch) return String(parseInt(kMatch[1]) * 1000);
  const num = parseInt(clean.replace(/[^0-9]/g, ''));
  if (isNaN(num)) return '';
  // 2-3 digit numbers interpreted as thousands (e.g. 80 → 80000, 150 → 150000)
  if (num >= 10 && num <= 999) return String(num * 1000);
  return String(num);
}
function fmtSalary(v) {
  if (!v) return '';
  const n = parseInt(v);
  if (isNaN(n)) return v;
  return n >= 1000 ? '$' + Math.round(n / 1000) + 'k' : '$' + n;
}
function applyPayFilter() {
  const minRaw = parseSalaryVal($('#qb-input-pay-min').value);
  const maxRaw = parseSalaryVal($('#qb-input-pay-max').value);
  if (!minRaw && !maxRaw) return;
  const label = minRaw && maxRaw ? `${fmtSalary(minRaw)} – ${fmtSalary(maxRaw)}`
    : minRaw ? `${fmtSalary(minRaw)}+` : `Up to ${fmtSalary(maxRaw)}`;
  payPills = [{ values: [label], type: 'pay', min: minRaw, max: maxRaw }];
  $('#qb-input-pay-min').value = '';
  $('#qb-input-pay-max').value = '';
  renderAllPills();
}
function renderPayPills() {
  const container = $('#qb-pay-pill-inline');
  container.innerHTML = '';
  if (payPills.length === 0) return;
  payPills.forEach((pill, i) => {
    const el = document.createElement('span');
    el.className = 'qb-pill pay-pill';
    el.style.margin = '0';
    el.innerHTML = `<span class="qb-pill-text">${pill.values[0]}</span><span class="qb-pill-remove" data-idx="${i}">×</span>`;
    el.querySelector('.qb-pill-remove').addEventListener('click', () => {
      payPills.splice(i, 1);
      renderAllPills();
    });
    container.appendChild(el);
  });
}
$('#qb-input-pay-min').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    // QA-004: Always apply on Enter — min-only becomes "$Xk+", no auto-tab to max
    if ($('#qb-input-pay-min').value || $('#qb-input-pay-max').value) {
      applyPayFilter();
    }
  }
});
$('#qb-input-pay-max').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); applyPayFilter(); }
});
$('#qb-input-pay-min').addEventListener('blur', () => {
  setTimeout(() => {
    // Only auto-apply on blur if both fields have values and focus left the pay area entirely
    const movingToMax = document.activeElement === $('#qb-input-pay-max');
    if (!movingToMax) {
      const minVal = $('#qb-input-pay-min').value.trim();
      const maxVal = $('#qb-input-pay-max').value.trim();
      if (minVal && maxVal) applyPayFilter(); // both set — apply
      // if only min is set, leave it — user must press Enter
    }
  }, 100);
});
$('#qb-input-pay-max').addEventListener('blur', () => {
  setTimeout(() => {
    const movingToMin = document.activeElement === $('#qb-input-pay-min');
    if (!movingToMin) {
      const minVal = $('#qb-input-pay-min').value.trim();
      const maxVal = $('#qb-input-pay-max').value.trim();
      if (minVal || maxVal) applyPayFilter(); // either set — apply
    }
  }, 100);
});

$('#sf-search').addEventListener('input', () => renderSavedFilters());

// Select all checkbox
$('#sf-select-all').addEventListener('change', e => {
  $$('.sf-item-check').forEach(cb => cb.checked = e.target.checked);
  // Persist
  const state = {};
  $$('.sf-item-check').forEach(c => {
    const n = savedFilters[parseInt(c.dataset.idx)]?.name;
    if (n) state[n] = c.checked;
  });
  localStorage.setItem('bj_sf_checked', JSON.stringify(state));
  $('#sf-delete-selected').style.display = e.target.checked && $$('.sf-item-check').length > 0 ? '' : 'none';
  updateSfActiveCount();
  debouncedSearchJobs();
});

// Delete selected filters
$('#sf-delete-selected').addEventListener('click', () => {
  const checked = [...$$('.sf-item-check:checked')].map(cb => parseInt(cb.dataset.idx));
  if (checked.length === 0) return;
  if (!confirm(`Delete ${checked.length} saved filter${checked.length > 1 ? 's' : ''}?`)) return;
  // Delete in reverse order to preserve indices
  checked.sort((a, b) => b - a).forEach(idx => savedFilters.splice(idx, 1));
  saveUserData('bj_saved_filters', JSON.stringify(savedFilters));
  invalidateCache(); // A14: clear query caches when filters change
  $('#sf-select-all').checked = false;
  $('#sf-delete-selected').style.display = 'none';
  renderSavedFilters();
  updateSfActiveCount();
  // Clear stale job results if no filters remain active
  if (savedFilters.length === 0 || $$('.sf-item-check:checked').length === 0) {
    searchJobs(0);
  }
});

function renderSavedFilters() {
  const list = $('#sf-list');
  const section = $('#saved-filters-section');
  const query = ($('#sf-search')?.value || '').toLowerCase();

  if (savedFilters.length === 0) {
    section.classList.add('u-hidden');
    return;
  }
  section.classList.remove('u-hidden');

  // Sort by last used (most recent first)
  const sorted = [...savedFilters]
    .map((sf, i) => ({ ...sf, _idx: i }))
    .filter(sf => {
      if (!query) return true;
      // POD3-GS: Search filter names AND pill values
      if (sf.name.toLowerCase().includes(query)) return true;
      // Search all pill arrays for matching values
      const allPillArrays = [
        sf.whatPills || sf.pills || [], sf.wherePills || [], sf.whenPills || [],
        sf.whoPills || [], sf.payPills || [], sf.whatNotPills || [],
        sf.whereNotPills || [], sf.whoNotPills || [], sf.skillsPills || [],
        sf.levelPills || [], sf.jdPills || [], sf.deptPills || []
      ];
      for (const pills of allPillArrays) {
        for (const p of pills) {
          if (p.values && p.values.some(v => v.toLowerCase().includes(query))) return true;
        }
      }
      return false;
    })
    .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));

  if (sorted.length === 0) {
    list.innerHTML = `<div class="sf-empty">${query ? 'No matches' : 'No saved filters yet'}</div>`;
    return;
  }

  // Column headers
  list.innerHTML = `<div style="display:flex;align-items:center;padding:4px 12px;border-bottom:1px solid var(--border);gap:6px;">
    <div style="width:20px;"></div>
    <div style="width:14px;"></div>
    <div style="width:16px;"></div>
    <div style="flex:1;font-size:10px;font-weight:700;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.5px;">Filter</div>
    <div style="display:flex;align-items:center;gap:6px;margin-left:auto;flex-shrink:0;">
      <div style="width:48px;"></div>
    </div>
  </div>` + sorted.map(sf => {
    const ago = sf.createdAt ? timeAgo(sf.createdAt) : '';
    const meta = ago ? `created ${ago}` : '';

    // Build mini pill HTML from saved filter criteria
    // QA-FIX: Group "incl. no salary" with pay pills and "incl. remote" with where pills
    let miniPills = '';

    // Build where pills + incl. remote (grouped together)
    const _wherePills = (sf.wherePills || []).map(p => ({ ...p, row: 'where' }));
    const hasLocPills = _wherePills.length > 0;
    const hasExplicitRemotePill = (sf.wherePills || []).some(p => p.locType === 'remote' || (p.values && p.values[0]?.toLowerCase() === 'remote'));
    if (hasLocPills && !hasExplicitRemotePill && sf.includeRemote === true) {
      _wherePills.push({ values: ['incl. remote'], row: 'where', _isRemoteToggle: true });
    }

    // Build pay pills + incl. no salary (grouped together)
    const _payPills = (sf.payPills || []).map(p => ({ ...p, row: 'pay' }));
    if (_payPills.length > 0 && sf.includeNoSalary !== false) {
      _payPills.push({ values: ['incl. no salary'], row: 'pay', _isNoSalary: true });
    }

    const allSfPills = [
      ...(sf.whatPills || sf.pills || []).map(p => ({ ...p, row: 'what' })),
      ..._wherePills,
      ...(sf.whenPills || []).map(p => ({ ...p, row: 'when' })),
      ..._payPills,
      ...(sf.whoPills || []).map(p => ({ ...p, row: 'who' })),
      ...(sf.whatNotPills || []).map(p => ({ ...p, row: 'not', notSource: 'what' })),
      ...(sf.whereNotPills || []).map(p => ({ ...p, row: 'not', notSource: 'where' })),
      ...(sf.whoNotPills || []).map(p => ({ ...p, row: 'not', notSource: 'who' })),
    ];
    // Legacy: convert old salaryMin/Max to pay pill
    if (!sf.payPills && (sf.salaryMin || sf.salaryMax)) {
      function fmtSalary(v) {
        if (!v) return '';
        const n = parseInt(v.toString().replace(/[^0-9]/g, ''));
        if (isNaN(n)) return v;
        return n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
      }
      const fMin = fmtSalary(sf.salaryMin);
      const fMax = fmtSalary(sf.salaryMax);
      const salaryLabel = fMin && fMax ? `$${fMin} – $${fMax}`
        : fMin ? `$${fMin}+` : `Up to $${fMax}`;
      allSfPills.push({ values: [salaryLabel], row: 'pay' });
    }
    if (allSfPills.length > 0) {
      // Detect pill color: use row if set explicitly, otherwise infer from type/value
      const locationWords = /^(remote|hybrid|onsite|on-site|in-office)$/i;
      const cityLike = /^[a-z\s]+(,\s*[a-z]{2})?$/i;
      const salaryLike = /\$|k\+?$|\d{3,}/i;

      miniPills = '<div class="sf-item-pills">' + allSfPills.map(p => {
        let cls = '';
        const val = (p.values ? p.values[0] : '').toLowerCase();
        if (p.row === 'where') cls = 'location-pill' + (p._isRemoteToggle ? ' no-salary-pill' : '');
        else if (p.row === 'when') cls = 'when-pill';
        else if (p.row === 'who') cls = 'who-pill';
        else if (p.row === 'pay') cls = 'pay-pill' + (p._isNoSalary ? ' no-salary-pill' : '');
        else if (p.row === 'not') cls = 'not-pill' + (p.notSource ? ' not-' + p.notSource : '');
        else if (p.type === 'type' || locationWords.test(val)) cls = 'location-pill';
        else if (p.type === 'salary' || salaryLike.test(val)) cls = 'pay-pill';
        // else default blue for keyword/what
        const sep = cls === 'not-pill' ? ' nor ' : ' | ';
        const label = p.values ? p.values.join(sep) : '';
        return `<span class="sf-mini-pill ${cls}">${label}</span>`;
      }).join('') + '</div>';
    }

    const filterNum = sf._idx + 1;
    const filterColor = filterColors[(filterNum - 1) % filterColors.length];

    return `<div class="sf-item" data-idx="${sf._idx}" data-filternum="${filterNum}">
      <span class="sf-del" data-delidx="${sf._idx}" title="Delete filter">✕</span>
      <input type="checkbox" class="sf-item-check" data-idx="${sf._idx}" data-filternum="${filterNum}" data-filtercolor="${filterColor}">
      <span class="sf-num" style="background:${filterColor};">${filterNum}</span>
      <div class="sf-item-info">
        <div class="sf-item-name">${escapeHtml(sf.name)}</div>
        ${meta ? `<div class="sf-item-meta">${meta}</div>` : ''}
      </div>
      ${miniPills}
      ${(() => {
        if (!sf.assignedLevels || sf.assignedLevels.length === 0) return '';
        const h = sf.levelHierarchy || levelHierarchy;
        const badges = sf.assignedLevels.map(lbl => {
          const lvl = h.find(l => l.label === lbl);
          const c = lvl ? lvl.color : '#94a3b8';
          return `<span style="font-size:9px;padding:1px 6px;border-radius:4px;background:${c}15;color:${c};border:1px solid ${c}30;white-space:nowrap;">${lbl}</span>`;
        }).join(' ');
        const otherLabel = sf.includeOtherLevels ? ' <span style="font-size:9px;padding:1px 5px;border-radius:4px;background:var(--bg-input);color:var(--text-faint);border:1px solid var(--border);">+Other</span>' : '';
        return `<div style="display:flex;gap:3px;flex-wrap:wrap;align-items:center;">${badges}${otherLabel}</div>`;
      })()}
      <div class="sf-right" style="display:flex;align-items:center;gap:6px;margin-left:auto;flex-shrink:0;">
        <span class="sf-dup" data-dupidx="${sf._idx}" title="Duplicate filter" style="font-size:11px;color:var(--text-faint);cursor:pointer;padding:2px 4px;opacity:0;transition:opacity 0.1s;">⧉</span>
        <span class="sf-health-btn" data-idx="${sf._idx}" title="Filter health & suggestions" style="font-size:10px;color:var(--text-faint);cursor:pointer;padding:2px 4px;opacity:0;transition:opacity 0.1s;">💡</span>
        <span class="sf-levels-btn" data-idx="${sf._idx}" title="${sf.assignedLevels?.length ? sf.assignedLevels.length + ' levels assigned — click to edit' : sf.levelHierarchy ? 'Custom levels — click to edit' : 'Assign levels to this filter'}" style="font-size:10px;color:${sf.assignedLevels?.length ? 'var(--green)' : sf.levelHierarchy ? 'var(--accent)' : 'var(--text-faint)'};cursor:pointer;padding:2px 4px;opacity:${sf.assignedLevels?.length || sf.levelHierarchy ? '0.8' : '0'};transition:opacity 0.1s;">⚙</span>
      </div>
    </div>`;
  }).join('');

  // QA-FIX: Render saved prompts in the same list as saved searches
  const prompts = typeof window._getSavedPrompts === 'function' ? window._getSavedPrompts() : [];
  const promptsWithFilters = prompts.filter(p => p.derived_filters && Object.keys(p.derived_filters).length > 0);
  if (promptsWithFilters.length > 0) {
    list.innerHTML += '<div class="sf-prompt-separator"><span style="font-size:10px;font-weight:700;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.5px;">💬 Chat Prompts</span></div>';
    list.innerHTML += promptsWithFilters.map((prompt, pi) => {
      const promptNum = sorted.length + pi + 1;
      const promptColor = filterColors[(promptNum - 1) % filterColors.length];
      const d = prompt.derived_filters;
      // Build mini pills from derived_filters
      let pills = '';
      const miniParts = [];
      if (d.keywords) d.keywords.forEach(kw => miniParts.push(`<span class="sf-mini-pill">${escapeHtml(kw)}</span>`));
      if (d.locations) d.locations.forEach(loc => miniParts.push(`<span class="sf-mini-pill location-pill">${escapeHtml(loc)}</span>`));
      if (d.salary_min || d.salary_max) {
        const sal = d.salary_min && d.salary_max ? '$' + Math.round(d.salary_min/1000) + 'k–$' + Math.round(d.salary_max/1000) + 'k'
          : d.salary_min ? '$' + Math.round(d.salary_min/1000) + 'k+' : 'Up to $' + Math.round(d.salary_max/1000) + 'k';
        miniParts.push(`<span class="sf-mini-pill pay-pill">${sal}</span>`);
      }
      if (d.companies) d.companies.forEach(co => miniParts.push(`<span class="sf-mini-pill who-pill">${escapeHtml(co)}</span>`));
      if (d.excludeCompanies) d.excludeCompanies.forEach(co => miniParts.push(`<span class="sf-mini-pill not-pill not-who">${escapeHtml(co)}</span>`));
      if (d.remote) miniParts.push(`<span class="sf-mini-pill location-pill no-salary-pill">incl. remote</span>`);
      pills = miniParts.length > 0 ? '<div class="sf-item-pills">' + miniParts.join('') + '</div>' : '';

      return `<div class="sf-item sf-item-prompt" data-prompt-id="${prompt.id}" data-filternum="${promptNum}">
        <span class="sf-del" data-prompt-del="${prompt.id}" title="Delete prompt">✕</span>
        <input type="checkbox" class="sf-prompt-check" data-prompt-id="${prompt.id}" data-filternum="${promptNum}" data-filtercolor="${promptColor}">
        <span class="sf-num" style="background:${promptColor};">${promptNum}</span>
        <div class="sf-item-info">
          <div class="sf-item-name">💬 ${escapeHtml(prompt.name || 'Chat Prompt')}</div>
          <div class="sf-item-meta">chat prompt</div>
        </div>
        ${pills}
      </div>`;
    }).join('');
  }

  // Bind prompt click → load in chat
  list.querySelectorAll('.sf-item-prompt').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.classList.contains('sf-del')) return;
      if (e.target.classList.contains('sf-prompt-check')) return;
      // Load prompt in chat mode
      const promptId = el.dataset.promptId;
      if (typeof window._loadPrompt === 'function') window._loadPrompt(promptId);
    });
  });
  // Bind prompt delete
  list.querySelectorAll('[data-prompt-del]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const promptId = el.dataset.promptDel;
      if (typeof window._deletePrompt === 'function') {
        if (confirm('Delete this chat prompt?')) window._deletePrompt(promptId);
      }
    });
  });
  // Bind prompt checkbox → trigger search
  list.querySelectorAll('.sf-prompt-check').forEach(cb => {
    cb.addEventListener('change', () => {
      invalidateCache();
      searchJobs(0);
    });
  });
  list.querySelectorAll('.sf-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.classList.contains('sf-del')) return;
      if (e.target.classList.contains('sf-item-check')) return;
      const idx = parseInt(el.dataset.idx);
      const sf = savedFilters[idx];
      // Populate the save name input with this filter's name
      $('#save-filter-name').value = sf.name || '';
      // Store which filter index we're editing
      window._editingFilterIdx = idx;
      // Support both old format (pills) and new format (whatPills/wherePills)
      if (sf.whatPills) {
        whatPills = JSON.parse(JSON.stringify(sf.whatPills));
        wherePills = JSON.parse(JSON.stringify(sf.wherePills || []));
      } else if (sf.pills) {
        whatPills = JSON.parse(JSON.stringify(sf.pills));
        wherePills = [];
      }
      whenPills = JSON.parse(JSON.stringify(sf.whenPills || []));
      whoPills = JSON.parse(JSON.stringify(sf.whoPills || []));
      payPills = JSON.parse(JSON.stringify(sf.payPills || []));
      whatNotPills = JSON.parse(JSON.stringify(sf.whatNotPills || []));
      whereNotPills = JSON.parse(JSON.stringify(sf.whereNotPills || []));
      whoNotPills = JSON.parse(JSON.stringify(sf.whoNotPills || []));
      skillsPills = JSON.parse(JSON.stringify(sf.skillsPills || []));
      levelPills = JSON.parse(JSON.stringify(sf.levelPills || []));
      jdPills = JSON.parse(JSON.stringify(sf.jdPills || []));
      deptPills = JSON.parse(JSON.stringify(sf.deptPills || []));
      // Restore includeNoSalary checkbox
      const noSalaryCb = $('#save-filter-include-no-salary');
      if (noSalaryCb) noSalaryCb.checked = sf.includeNoSalary !== false;
      // Restore includeRemote checkbox
      const remoteCb = $('#save-filter-include-remote');
      if (remoteCb) remoteCb.checked = sf.includeRemote === true;
      renderPayPills();
      savedFilters[idx].lastUsed = Date.now();
      savedFilters[idx].useCount = (savedFilters[idx].useCount || 0) + 1;
      saveUserData('bj_saved_filters', JSON.stringify(savedFilters));
      renderAllPills();
      // Expand the filter builder if collapsed
      const body = $('#qb-collapse-body');
      if (body) {
        body.classList.remove('collapsed');
        body.classList.add('open');
      }
      const toggle = $('#qb-toggle');
      if (toggle) toggle.classList.remove('collapsed');
    });
  });

  // Bind delete
  list.querySelectorAll('.sf-del').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      savedFilters.splice(parseInt(el.dataset.delidx), 1);
      saveUserData('bj_saved_filters', JSON.stringify(savedFilters));
      invalidateCache(); // A14: clear query caches when filters change
      renderSavedFilters();
      updateSfActiveCount();
      if (savedFilters.length === 0 || $$('.sf-item-check:checked').length === 0) {
        searchJobs(0);
      }
    });
  });

  // Bind duplicate
  list.querySelectorAll('.sf-dup').forEach(el => {
    el.addEventListener('click', async e => {
      e.stopPropagation();
      // Check entitlement before duplicating
      var ent = await checkEntitlement('filters', savedFilters.length);
      if (!ent.allowed) { showUpgradePrompt('Saved Filters', ent); return; }
      const idx = parseInt(el.dataset.dupidx);
      const original = savedFilters[idx];
      if (!original) return;
      const copy = JSON.parse(JSON.stringify(original));
      copy.name = original.name + ' (copy)';
      copy.createdAt = Date.now();
      copy.lastUsed = null;
      copy.useCount = 0;
      copy.jobsToday = null;
      copy.jobsWeek = null;
      copy.jobsMonth = null;
      savedFilters.push(copy);
      saveUserData('bj_saved_filters', JSON.stringify(savedFilters));
      clearEntitlementCache('filters');
      renderSavedFilters();
    });
  });

  // Bind levels button
  list.querySelectorAll('.sf-levels-btn').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(el.dataset.idx);
      editFilterLevelHierarchy(idx);
    });
  });

  // Restore checkbox state from localStorage
  const checkedState = safeReadLS('bj_sf_checked', {});
  list.querySelectorAll('.sf-item-check').forEach(cb => {
    const sf = savedFilters[parseInt(cb.dataset.idx)];
    const name = sf?.name;
    cb.checked = name && name in checkedState ? checkedState[name] : true;
    cb.addEventListener('change', () => {
      const state = {};
      list.querySelectorAll('.sf-item-check').forEach(c => {
        const n = savedFilters[parseInt(c.dataset.idx)]?.name;
        if (n) state[n] = c.checked;
      });
      localStorage.setItem('bj_sf_checked', JSON.stringify(state));
      const anyChecked = list.querySelectorAll('.sf-item-check:checked').length > 0;
      $('#sf-delete-selected').style.display = anyChecked ? '' : 'none';
      updateSfActiveCount();
      debouncedSearchJobs();
    });
  });
  updateSfActiveCount();

  // Show/hide resume→filter CTA
  updateResumeFilterCta();

  // Auto-run search on initial render if filters exist
  if (savedFilters.length > 0 && !window._initialSearchDone) {
    window._initialSearchDone = true;
    setTimeout(() => searchJobs(), 500);
  }
}

function timeAgo(ts) {
  const now = new Date();
  const date = new Date(ts);
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  if (date >= todayStart) return 'today';
  if (date >= yesterdayStart) return 'yesterday';
  const days = Math.floor((todayStart - date) / 86400000);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
renderSavedFilters();
renderAllPills();
updateSfStatusDot();

// Auto-collapse filter builder and saved filters if saved filters exist
if (savedFilters.length > 0) {
  $('#qb-toggle').classList.add('collapsed');
  $('#qb-collapse-body').classList.add('collapsed');
  $('#sf-toggle').classList.add('collapsed');
  $('#sf-collapse-body').classList.add('collapsed');
}

// Compute real job counts for each saved filter (async, fills in after render)
async function updateSavedFilterCounts() {
  const now = new Date();
  const last24h = new Date(now.getTime() - 86400000);
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(now); monthAgo.setDate(monthAgo.getDate() - 30);
  const twoWeeksAgo = new Date(now); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  for (let i = 0; i < savedFilters.length; i++) {
    const sf = savedFilters[i];

    // Skip filters with no real criteria
    const w = sf.whatPills || sf.pills || [];
    const wh = sf.wherePills || [];
    const wo = sf.whoPills || [];
    const wnot = sf.whatNotPills || [];
    const whnot = sf.whereNotPills || [];
    const wonot = sf.whoNotPills || [];
    if (w.length === 0 && wh.length === 0 && wo.length === 0 && wnot.length === 0 && whnot.length === 0 && wonot.length === 0) {
      console.log(`Filter ${i} "${sf.name}" has no searchable criteria, skipping counts`);
      continue;
    }

    try {
      // Pre-fetch location IDs for this filter
      const tuningLoc = safeReadLS('bj_tuning', {});
      let locIds = null;
      if (wh.length > 0 || whnot.length > 0 || tuningLoc.usOnly) {
        locIds = await getLocationMatchIds(wh, whnot, tuningLoc, sf.includeRemote === true);
      }

      // Parallel velocity counts: 24h, 7d, 30d (N+1 fix v3.82)
      let q1 = sb.from('ats_jobs').select('greenhouse_id', { count: 'exact', head: true });
      q1 = buildFilterQuery(sf, q1, locIds);
      q1 = q1.gte('updated_at', last24h.toISOString());

      let q2 = sb.from('ats_jobs').select('greenhouse_id', { count: 'exact', head: true });
      q2 = buildFilterQuery(sf, q2, locIds);
      q2 = q2.gte('updated_at', weekAgo.toISOString());

      let q3 = sb.from('ats_jobs').select('greenhouse_id', { count: 'exact', head: true });
      q3 = buildFilterQuery(sf, q3, locIds);
      q3 = q3.gte('updated_at', monthAgo.toISOString());

      // Previous week (8-14d ago) for trend badge
      let q4 = sb.from('ats_jobs').select('greenhouse_id', { count: 'exact', head: true });
      q4 = buildFilterQuery(sf, q4, locIds);
      q4 = q4.gte('updated_at', twoWeeksAgo.toISOString()).lt('updated_at', weekAgo.toISOString());

      const [r1, r2, r3, r4] = await Promise.all([q1, q2, q3, q4]);
      const c1 = r1.error ? 0 : (r1.count || 0);
      const c2 = r2.error ? 0 : (r2.count || 0);
      const c3 = r3.error ? 0 : (r3.count || 0);
      const c4 = r4.error ? 0 : (r4.count || 0);

      // Compute trend: percentage change from prev week to this week
      var trendPct = c4 > 0 ? Math.round(((c2 - c4) / c4) * 100) : (c2 > 0 ? 100 : 0);

      console.log(`Filter "${sf.name}": today=${c1}, 7d=${c2}, prev7d=${c4}, trend=${trendPct}%, 30d=${c3}`);

      // Update the DOM — find by data-idx which matches original array index
      const rows = $$('.sf-item');
      rows.forEach(row => {
        if (parseInt(row.dataset.idx) === i) {
          const counts = row.querySelectorAll('.sf-count');
          if (counts[0]) counts[0].textContent = c1.toLocaleString();
          if (counts[1]) counts[1].textContent = c2.toLocaleString();
          if (counts[2]) counts[2].textContent = c3.toLocaleString();

          // Trend badge: show if abs(change) > 5%
          var existingBadge = row.querySelector('.sf-trend-badge');
          if (existingBadge) existingBadge.remove();
          if (Math.abs(trendPct) >= 5 && c4 > 0) {
            var badge = document.createElement('span');
            badge.className = 'sf-trend-badge';
            var color = trendPct > 0 ? '#4a9a6b' : '#c06060';
            var arrow = trendPct > 0 ? '↑' : '↓';
            badge.style.cssText = 'font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;margin-left:4px;background:' + color + '15;color:' + color + ';border:1px solid ' + color + '30;';
            badge.textContent = arrow + Math.abs(trendPct) + '%';
            badge.title = 'vs previous 7 days: ' + c4.toLocaleString() + ' → ' + c2.toLocaleString();
            // Insert after the counts div
            var countsDiv = row.querySelector('.sf-item-counts');
            if (countsDiv) countsDiv.parentNode.insertBefore(badge, countsDiv.nextSibling);
          }
        }
      });

      // Persist
      savedFilters[i].jobsToday = c1;
      savedFilters[i].jobsWeek = c2;
      savedFilters[i].jobsMonth = c3;
      savedFilters[i].jobsPrevWeek = c4;
      savedFilters[i].trendPct = trendPct;
    } catch(e) { reportError('location', e); console.error(`Count error for filter ${i} "${sf.name}":`, e);
    }
  }
  saveUserData('bj_saved_filters', JSON.stringify(savedFilters));
}

// Run counts after a short delay to not block initial render
setTimeout(() => updateSavedFilterCounts(), 1000);

// Source pill helper (for table rows)
function sourcePill(source) {
  const map = {
    greenhouse: 'pill-greenhouse', lever: 'pill-lever', workday: 'pill-workday',
    linkedin: 'pill-linkedin', indeed: 'pill-indeed', ashby: 'pill-ashby', career_page: 'pill-career'
  };
  const labels = {
    greenhouse: 'GH', lever: 'Lever', workday: 'WD',
    linkedin: 'LI', indeed: 'Indeed', ashby: 'Ashby', career_page: 'Direct'
  };
  return `<span class="source-pill ${map[source] || 'pill-career'}">${labels[source] || source}</span>`;
}

// Apply button — picks best non-LI source, falls back to LI
// v6.32: intercepts click for caution/suspicious fraud-scored jobs
function applyButton(sources, urls, jobId) {
  const priority = ['greenhouse','lever','workday','ashby','career_page','indeed','linkedin'];
  let bestSource = 'linkedin';
  let bestUrl = '#';
  for (const p of priority) {
    if (urls[p]) { bestSource = p; bestUrl = urls[p]; break; }
  }
  const isLI = bestSource === 'linkedin';
  const cls = isLI ? 'apply-btn apply-btn-linkedin' : 'apply-btn apply-btn-default';
  const label = isLI ? 'Apply on LI' : 'Apply →';

  // Phase 3 fraud interstitial: intercept apply for caution/suspicious jobs
  var fraudInfo = typeof _fraudScoreCache !== 'undefined' ? _fraudScoreCache[jobId] : null;
  if (fraudInfo && (fraudInfo.label === 'caution' || fraudInfo.label === 'suspicious')) {
    return `<a href="#" class="${cls}" onclick="event.preventDefault(); event.stopPropagation(); showFraudInterstitial('${jobId}', '${bestUrl.replace(/'/g, "\\'")}')">${label}</a>`;
  }

  return `<a href="${bestUrl}" target="_blank" rel="noopener" class="${cls}" onclick="event.stopPropagation(); markApplied('${jobId}', this)">${label}</a>`;
}


// ─── Feature 3: AI Resume-to-Filter Generator ───

var _aiFilterData = null;

function updateResumeFilterCta() {
  var cta = document.getElementById('resume-filter-cta');
  if (!cta) return;
  var hasResumes = (typeof resumes !== 'undefined' ? resumes : []).some(function(r) {
    return r.extractedText && r.extractedText.length > 100 && !r.archived;
  });
  cta.style.display = hasResumes ? '' : 'none';
}

function initAiFilterButton() {
  var btn = document.getElementById('ai-suggest-filter-btn');
  if (!btn) return;
  btn.addEventListener('click', startAiFilterSuggest);
}

async function startAiFilterSuggest() {
  // Check if user has any resumes (with or without extracted text)
  var allResumes = (typeof resumes !== 'undefined' ? resumes : []).filter(function(r) {
    return !r.archived && r.name;
  });
  var resumesWithText = allResumes.filter(function(r) {
    return r.extractedText && r.extractedText.length > 100;
  });
  
  // QA-FIX: Use the modal (not alert) even when no resumes have text — show all resumes with note
  var displayResumes = resumesWithText.length > 0 ? resumesWithText : allResumes;
  
  // Show modal
  var modal = document.getElementById('ai-filter-modal');
  var body = document.getElementById('ai-filter-body');
  var footer = document.getElementById('ai-filter-footer');
  var meta = document.getElementById('ai-filter-meta');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  footer.style.display = 'none';

  if (displayResumes.length === 0) {
    // No resumes at all — show upload-only modal
    meta.textContent = 'Upload a resume to get started';
    body.innerHTML = '<div style="padding:16px;text-align:center;">' +
      '<div style="font-size:32px;margin-bottom:8px;opacity:0.3;">📄</div>' +
      '<div style="font-size:14px;font-weight:600;color:var(--text-dim);margin-bottom:4px;">No resumes yet</div>' +
      '<div style="font-size:12px;color:var(--text-faint);max-width:280px;margin:0 auto;line-height:1.5;margin-bottom:16px;">Upload your resume on the Resumes tab, then come back to generate filters.</div>' +
      '<button class="btn btn-sm btn-primary" onclick="document.getElementById(\'ai-filter-modal\').style.display=\'none\';document.body.style.overflow=\'\';$$(\'.nav-item\').forEach(n=>n.classList.toggle(\'active\',n.dataset.page===\'resumes\'));$$(\'.page\').forEach(p=>p.classList.toggle(\'active\',p.id===\'page-resumes\'));">Go to Resumes →</button>' +
      '</div>';
    return;
  }

  // Build resume picker with upload option
  var pickerHtml = '<div style="padding:16px;">';
  
  if (displayResumes.length > 0) {
    meta.textContent = 'Choose a resume to analyze';
    pickerHtml += '<div style="font-size:12px;color:var(--text-dim);margin-bottom:12px;">Select a resume for AI to analyze and generate job filters:</div>';
    displayResumes.forEach(function(r, idx) {
      var hasText = r.extractedText && r.extractedText.length > 100;
      var note = hasText ? '' : '<div style="font-size:9px;color:var(--warm);margin-top:2px;">Text extraction pending — will process on selection</div>';
      pickerHtml += '<div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;transition:all 0.1s;display:flex;align-items:center;gap:10px;" ' +
        'onmouseenter="this.style.borderColor=\'var(--accent)\';this.style.background=\'var(--accent-glow)\'" ' +
        'onmouseleave="this.style.borderColor=\'var(--border)\';this.style.background=\'none\'" ' +
        'onclick="window._aiResumeChoice=' + idx + ';_doAiFilterAnalysis();">' +
        '<div style="width:32px;height:32px;border-radius:6px;background:hsla(var(--accent-hsl),0.1);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">' + (r.name.match(/\.pdf$/i) ? 'PDF' : 'DOC') + '</div>' +
        '<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (r.name || 'Resume') + '</div>' +
        '<div style="font-size:10px;color:var(--text-faint);">' + (r.size || '') + (r.uploadedAt ? ' · ' + r.uploadedAt : '') + '</div>' + note + '</div>' +
        '<span style="font-size:18px;color:var(--accent);opacity:0.5;">→</span></div>';
    });
    pickerHtml += '<div style="margin:16px 0 8px;border-top:1px solid var(--border);padding-top:12px;font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Or upload a new resume</div>';
  } else {
    meta.textContent = 'Upload a resume to get started';
    pickerHtml += '<div style="text-align:center;margin-bottom:16px;">' +
      '<div style="font-size:32px;margin-bottom:8px;opacity:0.3;">📄</div>' +
      '<div style="font-size:14px;font-weight:600;color:var(--text-dim);margin-bottom:4px;">No resumes yet</div>' +
      '<div style="font-size:12px;color:var(--text-faint);max-width:280px;margin:0 auto;line-height:1.5;">Upload your resume and AI will analyze it to generate optimized job search filters.</div></div>';
  }
  
  // Upload zone always shown
  pickerHtml += '<div id="ai-resume-upload-zone" style="border:2px dashed var(--border);border-radius:10px;padding:24px 16px;text-align:center;cursor:pointer;transition:all 0.15s;" ' +
    'onmouseenter="this.style.borderColor=\'var(--accent)\';this.style.background=\'hsla(var(--accent-hsl),0.04)\'" ' +
    'onmouseleave="this.style.borderColor=\'var(--border)\';this.style.background=\'none\'" ' +
    'onclick="document.getElementById(\'ai-resume-file-input\').click();">' +
    '<div style="font-size:13px;font-weight:600;color:var(--accent);margin-bottom:4px;">+ Upload Resume</div>' +
    '<div style="font-size:11px;color:var(--text-faint);">PDF, DOC, DOCX · Will be saved to your Resumes library</div></div>' +
    '<input type="file" id="ai-resume-file-input" accept=".pdf,.doc,.docx" style="display:none;" onchange="handleAiResumeUpload(this.files[0]);">';
  
  pickerHtml += '</div>';
  body.innerHTML = pickerHtml;
  
  // If only one resume, skip picker
  if (displayResumes.length === 1) {
    window._aiResumeChoice = 0;
    _doAiFilterAnalysis();
    return;
  }
}

async function handleAiResumeUpload(file) {
  if (!file) return;
  var body = document.getElementById('ai-filter-body');
  var meta = document.getElementById('ai-filter-meta');
  meta.textContent = 'Uploading & extracting text…';
  body.innerHTML = '<div style="text-align:center;padding:60px 20px;">' +
    '<div class="loading-spinner" style="margin:0 auto 16px;"></div>' +
    '<div style="color:var(--text-dim);font-size:13px;">Uploading ' + file.name + '…</div>' +
    '<div style="color:var(--text-faint);font-size:11px;margin-top:4px;">Extracting text and saving to your resume library</div></div>';
  
  try {
    // Use the existing resume upload flow
    if (typeof handleResumeFiles === 'function') {
      await handleResumeFiles([file]);
      // Wait a moment for text extraction
      await new Promise(function(r) { setTimeout(r, 2000); });
    }
    
    // Find the newly uploaded resume
    var newResumes = (typeof resumes !== 'undefined' ? resumes : []).filter(function(r) {
      return r.extractedText && r.extractedText.length > 100 && !r.archived;
    });
    
    if (newResumes.length === 0) {
      // Text extraction might still be in progress
      meta.textContent = 'Extracting text…';
      body.innerHTML = '<div style="text-align:center;padding:60px 20px;">' +
        '<div class="loading-spinner" style="margin:0 auto 16px;"></div>' +
        '<div style="color:var(--text-dim);font-size:13px;">Extracting text from resume…</div>' +
        '<div style="color:var(--text-faint);font-size:11px;margin-top:4px;">This may take a moment for PDF files</div></div>';
      // Poll for text extraction
      for (var attempt = 0; attempt < 10; attempt++) {
        await new Promise(function(r) { setTimeout(r, 2000); });
        newResumes = (typeof resumes !== 'undefined' ? resumes : []).filter(function(r) {
          return r.extractedText && r.extractedText.length > 100 && !r.archived;
        });
        if (newResumes.length > 0) break;
      }
    }
    
    if (newResumes.length === 0) {
      body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--red);">Could not extract text from resume. Try a different file format (PDF or DOCX).</div>';
      return;
    }
    
    window._aiResumeChoice = newResumes.length - 1;
    _doAiFilterAnalysis();
    
  } catch (err) {
    reportError('location', err);
    console.error('[AI Filter Upload]', err);
    body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--red);">Upload failed: ' + err.message + '</div>';
  }
}

function continueAiFilterSuggest() {
  _doAiFilterAnalysis();
}

async function _doAiFilterAnalysis() {
  var allResumes = (typeof resumes !== 'undefined' ? resumes : []).filter(function(r) {
    return !r.archived && r.name;
  });
  var resumesWithText = allResumes.filter(function(r) {
    return r.extractedText && r.extractedText.length > 100;
  });
  // QA-FIX: Fall back to all resumes, not just those with text
  var displayResumes = resumesWithText.length > 0 ? resumesWithText : allResumes;
  var idx = window._aiResumeChoice || 0;
  var resume = displayResumes[idx];
  if (!resume) return;
  
  // If resume doesn't have extracted text, auto-extract it
  if (!resume.extractedText || resume.extractedText.length < 100) {
    var modal = document.getElementById('ai-filter-modal');
    var body = document.getElementById('ai-filter-body');
    var meta = document.getElementById('ai-filter-meta');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    meta.textContent = resume.name || 'Resume';
    body.innerHTML = '<div style="text-align:center;padding:60px 20px;">' +
      '<div class="loading-spinner" style="margin:0 auto 16px;"></div>' +
      '<div style="color:var(--text-dim);font-size:13px;">Extracting text from resume…</div>' +
      '<div style="color:var(--text-faint);font-size:11px;margin-top:8px;">This only happens once per file</div></div>';
    
    try {
      // Try to extract text from stored file
      if (typeof window._bjFileStore !== 'undefined' && typeof window._extractTextFromFile === 'function') {
        var fileBlob = await window._bjFileStore.get(resume.id);
        if (fileBlob) {
          var file = new File([fileBlob], resume.name || 'resume.pdf', { type: fileBlob.type || 'application/pdf' });
          var text = await window._extractTextFromFile(file);
          if (text && text.length > 50) {
            // Save extracted text to resume object + localStorage
            var realIdx = (typeof resumes !== 'undefined' ? resumes : []).findIndex(function(r) { return r.id === resume.id; });
            if (realIdx >= 0) {
              resumes[realIdx].extractedText = text;
              saveUserData('bj_resumes', JSON.stringify(resumes));
            }
            resume.extractedText = text;
            // Continue to AI analysis (fall through)
          } else {
            body.innerHTML = '<div style="text-align:center;padding:40px 20px;">' +
              '<div style="font-size:14px;font-weight:600;color:var(--red);margin-bottom:8px;">Could not extract text</div>' +
              '<div style="font-size:12px;color:var(--text-faint);max-width:320px;margin:0 auto;line-height:1.5;">' +
              'The file may be a scanned image. Try uploading a text-based PDF or DOCX.</div>' +
              '<button class="btn btn-sm btn-primary" style="margin-top:16px;" onclick="document.getElementById(\'ai-filter-modal\').style.display=\'none\';document.body.style.overflow=\'\';">OK</button></div>';
            return;
          }
        } else {
          body.innerHTML = '<div style="text-align:center;padding:40px 20px;">' +
            '<div style="font-size:14px;font-weight:600;color:var(--red);margin-bottom:8px;">Resume file not found</div>' +
            '<div style="font-size:12px;color:var(--text-faint);max-width:320px;margin:0 auto;line-height:1.5;">' +
            'The original file may have been cleared from browser storage. Try re-uploading the resume.</div>' +
            '<button class="btn btn-sm btn-primary" style="margin-top:16px;" onclick="document.getElementById(\'ai-filter-modal\').style.display=\'none\';document.body.style.overflow=\'\';">OK</button></div>';
          return;
        }
      } else {
        body.innerHTML = '<div style="text-align:center;padding:40px 20px;">' +
          '<div style="font-size:14px;font-weight:600;color:var(--text-dim);margin-bottom:8px;">Text extraction loading…</div>' +
          '<div style="font-size:12px;color:var(--text-faint);max-width:320px;margin:0 auto;line-height:1.5;">' +
          'Open the Resumes tab once to load the extraction library, then try again.</div>' +
          '<button class="btn btn-sm btn-primary" style="margin-top:16px;" onclick="document.getElementById(\'ai-filter-modal\').style.display=\'none\';document.body.style.overflow=\'\';">OK</button></div>';
        return;
      }
    } catch(e) {
      reportError('location:extract', e);
      body.innerHTML = '<div style="text-align:center;padding:40px 20px;">' +
        '<div style="font-size:14px;font-weight:600;color:var(--red);margin-bottom:8px;">Extraction failed</div>' +
        '<div style="font-size:12px;color:var(--text-faint);max-width:320px;margin:0 auto;line-height:1.5;">' + (e.message || 'Unknown error') + '</div>' +
        '<button class="btn btn-sm btn-primary" style="margin-top:16px;" onclick="document.getElementById(\'ai-filter-modal\').style.display=\'none\';document.body.style.overflow=\'\';">OK</button></div>';
      return;
    }
  }
  
  // Show modal with loading state
  var modal = document.getElementById('ai-filter-modal');
  var body = document.getElementById('ai-filter-body');
  var footer = document.getElementById('ai-filter-footer');
  var meta = document.getElementById('ai-filter-meta');
  
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  footer.style.display = 'none';
  meta.textContent = 'Analyzing: ' + (resume.name || 'Resume');
  body.innerHTML = '<div style="text-align:center;padding:60px 20px;">' +
    '<div class="loading-spinner" style="margin:0 auto 16px;"></div>' +
    '<div style="color:var(--text-dim);font-size:13px;">AI is analyzing your resume…</div>' +
    '<div style="color:var(--text-faint);font-size:11px;margin-top:8px;">This takes 5-10 seconds</div></div>';
  
  try {
    // Get auth token
    var session = null;
    try { session = (await sb.auth.getSession()).data.session; } catch(e) { reportError('location:location', e); }
    if (!session) {
      body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--red);">Please sign in to use AI features.</div>';
      return;
    }
    
    var resp = await fetch(SUPABASE_URL + '/functions/v1/generate-filter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({ resume_text: resume.extractedText.slice(0, 8000) })
    });
    
    // Debit 2 credits for AI filter generation (after successful call)
    if (resp.ok && typeof debitCreditsForAction === 'function') {
      debitCreditsForAction(2, 'claude', 'AI filter generation');
    }
    
    if (!resp.ok) {
      var err = await resp.json().catch(function() { return { error: 'Request failed' }; });
      var msg = err.error || 'AI generation failed';
      if (resp.status === 401) msg = 'Session expired — please log out and back in, then try again.';
      if (resp.status === 406) msg = 'Edge Function not available. Redeploy with: supabase functions deploy generate-filter --no-verify-jwt';
      body.innerHTML = '<div style="text-align:center;padding:40px;"><div style="color:var(--red);margin-bottom:8px;">' + msg + '</div><div style="font-size:11px;color:var(--text-faint);">Status: ' + resp.status + '</div></div>';
      return;
    }
    
    var data = await resp.json();
    _aiFilterData = data;
    renderAiFilterPreview(data);
    
  } catch (err) {
    reportError('location', err);
    console.error('[AI Filter]', err);
    body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--red);">Error: ' + err.message + '</div>';
  }
}

function renderAiFilterPreview(data) {
  var body = document.getElementById('ai-filter-body');
  var footer = document.getElementById('ai-filter-footer');
  
  var html = '';
  
  // Filter name
  html += '<div style="margin-bottom:20px;">';
  html += '<label style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.5px;">Filter Name</label>';
  html += '<input type="text" id="ai-filter-name" value="' + (data.filter_name || 'AI Suggested').replace(/"/g, '&quot;') + '" style="width:100%;padding:8px 12px;margin-top:4px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--sans);font-size:13px;">';
  html += '</div>';
  
  // Suggestion sections
  var sections = [
    { key: 'what', label: 'WHAT — Job Titles', items: data.what || [], color: '#4d8eff' },
    { key: 'where', label: 'WHERE — Locations', items: data.where || [], color: '#34d399' },
    { key: 'what_not', label: 'WHAT NOT — Exclude', items: data.what_not || [], color: '#f87171' },
    { key: 'who_not', label: 'WHO NOT — Companies to Skip', items: data.who_not || [], color: '#f59e0b' }
  ];
  
  sections.forEach(function(sec) {
    if (sec.items.length === 0) return;
    html += '<div style="margin-bottom:16px;">';
    html += '<div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">' + sec.label + '</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    sec.items.forEach(function(item, i) {
      html += '<label style="display:flex;align-items:center;gap:6px;padding:6px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;transition:all 0.15s;" class="ai-pill-toggle">';
      html += '<input type="checkbox" checked data-section="' + sec.key + '" data-index="' + i + '" style="accent-color:' + sec.color + ';">';
      html += '<span style="color:var(--text);">' + item + '</span>';
      html += '</label>';
    });
    html += '</div>';
    // Reasoning
    if (data.reasoning && data.reasoning[sec.key === 'what_not' ? 'what_not' : sec.key === 'who_not' ? 'what_not' : sec.key]) {
      var reason = data.reasoning[sec.key] || '';
      if (reason) {
        html += '<div style="font-size:10px;color:var(--text-faint);margin-top:4px;font-style:italic;">' + reason + '</div>';
      }
    }
    html += '</div>';
  });
  
  // Salary
  if (data.salary_min) {
    html += '<div style="margin-bottom:16px;">';
    html += '<div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">HOW MUCH — Minimum Salary</div>';
    html += '<label style="display:flex;align-items:center;gap:6px;padding:6px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;" class="ai-pill-toggle">';
    html += '<input type="checkbox" checked data-section="salary" style="accent-color:#a78bfa;">';
    html += '<span style="color:var(--text);">$' + Math.round(data.salary_min / 1000) + 'K+</span>';
    html += '</label>';
    if (data.reasoning && data.reasoning.salary) {
      html += '<div style="font-size:10px;color:var(--text-faint);margin-top:4px;font-style:italic;">' + data.reasoning.salary + '</div>';
    }
    html += '</div>';
  }
  
  // Remote toggle
  html += '<div style="margin-bottom:16px;">';
  html += '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-dim);cursor:pointer;">';
  html += '<input type="checkbox" id="ai-filter-remote" ' + (data.include_remote ? 'checked' : '') + '>';
  html += 'Include remote jobs</label>';
  html += '</div>';
  
  body.innerHTML = html;
  footer.style.display = 'flex';
}

function acceptAiFilter() {
  if (!_aiFilterData) return;
  
  var data = _aiFilterData;
  var name = (document.getElementById('ai-filter-name') || {}).value || data.filter_name || 'AI Suggested';
  
  // Collect checked items
  var checked = {};
  document.querySelectorAll('#ai-filter-body input[type="checkbox"][data-section]').forEach(function(cb) {
    var sec = cb.dataset.section;
    if (!checked[sec]) checked[sec] = [];
    if (cb.checked) {
      if (sec === 'salary') {
        checked[sec].push(data.salary_min);
      } else {
        var items = sec === 'what' ? data.what : sec === 'where' ? data.where : sec === 'what_not' ? data.what_not : data.who_not;
        checked[sec].push(items[parseInt(cb.dataset.index)]);
      }
    }
  });
  
  var includeRemote = (document.getElementById('ai-filter-remote') || {}).checked || false;
  
  // Build filter pills in the format saved filters expect
  var newWhatPills = (checked.what || []).map(function(v) { return { values: [v], type: 'keyword' }; });
  var newWherePills = (checked.where || []).map(function(v) { return { values: [v], type: 'location', locType: 'city' }; });
  var newWhatNotPills = (checked.what_not || []).map(function(v) { return { values: [v], type: 'keyword' }; });
  var newWhoNotPills = (checked.who_not || []).map(function(v) { return { values: [v], type: 'keyword' }; });
  var newPayPills = [];
  if (checked.salary && checked.salary.length > 0) {
    newPayPills.push({ values: [String(checked.salary[0])], type: 'salary' });
  }
  
  // Create the saved filter object
  var filterData = {
    name: name,
    whatPills: newWhatPills,
    wherePills: newWherePills,
    whenPills: [],
    whoPills: [],
    payPills: newPayPills,
    whatNotPills: newWhatNotPills,
    whereNotPills: [],
    whoNotPills: newWhoNotPills,
    includeNoSalary: newPayPills.length > 0 ? false : true,
    includeRemote: includeRemote,
    createdAt: Date.now(),
    lastUsed: Date.now(),
    useCount: 0,
    aiGenerated: true
  };
  
  // Add to saved filters
  savedFilters.push(filterData);
  saveUserData('bj_saved_filters', JSON.stringify(savedFilters));
  
  // Close modal
  closeAiFilterModal();
  
  // Refresh UI
  renderSavedFilters();
  
  // Auto-assign filter to the resume that was analyzed
  var resumeIdx = window._aiResumeChoice;
  if (typeof resumeIdx === 'number' && typeof resumes !== 'undefined' && resumes[resumeIdx]) {
    var r = resumes[resumeIdx];
    if (!r.assignedFilters) r.assignedFilters = [];
    if (r.assignedFilters.indexOf(name) === -1) {
      r.assignedFilters.push(name);
      saveUserData('bj_resumes', JSON.stringify(resumes));
      if (typeof renderResumes === 'function') renderResumes();
    }
  }
  
  // Load the new filter into the query builder
  if (typeof loadFilterIntoBuilder === 'function') {
    loadFilterIntoBuilder(savedFilters.length - 1);
  }
  
  // Trigger search
  if (typeof debouncedSearchJobs === 'function') {
    debouncedSearchJobs();
  }
}

function closeAiFilterModal(e) {
  if (e && e.target !== e.currentTarget) return;
  var modal = document.getElementById('ai-filter-modal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
  _aiFilterData = null;
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAiFilterButton);
} else {
  initAiFilterButton();
}

// CS-P1-004 FE-005: Register location exports with BJ namespace
(function() {
  ['_aiResumeChoice','_editingFilterIdx','_initialSearchDone'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'location', registered: Date.now() };
    }
  });
})();
