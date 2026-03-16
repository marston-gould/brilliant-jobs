// ---- Company Browser + Collections ----
let cbAllCompanies = [];
let cbSelections = {}; // slug -> 'include' | 'exclude'
let cbBrowseMode = 'include'; // which Who row opened the browser
let userCollections = []; // loaded from Supabase

// Load collections from Supabase
async function loadCollections() {
  try {
    const { data, error } = await sb.from('company_collections')
      .select('*').eq('user_id', currentUser.id).order('name');
    if (!error && data) userCollections = data;
  } catch(e) { reportError('browsers', e); console.warn('[BJ] Load collections failed:', e); }
}

// Save or update a collection
async function saveCollection(name, slugs) {
  const existing = userCollections.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    const { error } = await sb.from('company_collections')
      .update({ slugs, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (!error) { existing.slugs = slugs; existing.updated_at = new Date().toISOString(); }
    return !error;
  } else {
    const { data, error } = await sb.from('company_collections')
      .insert({ user_id: currentUser.id, name, slugs })
      .select().single();
    if (!error && data) userCollections.push(data);
    return !error;
  }
}

// Open company browser
let cbReturnPage = 'jobs';
function openCompanyBrowser(mode, returnPage) {
  cbBrowseMode = mode;
  cbReturnPage = returnPage || 'jobs';
  cbSelections = {};

  // If opening from Tuning, pre-populate exclusions
  if (cbReturnPage === 'tuning') {
    tuningCoExclPills.forEach(p => {
      const name = typeof p === 'string' ? p : ((p.values || [])[0] || '');
      if (name) {
        // Try to find slug match
        const match = cbAllCompanies.find(c => c.name.toLowerCase() === name.toLowerCase() || c.slug.toLowerCase() === name.toLowerCase());
        if (match) cbSelections[match.slug] = 'exclude';
      }
    });
  }

  $$('.page').forEach(p => p.classList.remove('active'));
  $('#page-company-browser').classList.add('active');
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  var mainEl = document.querySelector('.main');
  if (mainEl) mainEl.scrollTop = 0;
  $('#cb-search').value = '';
  $('#cb-back-btn').textContent = cbReturnPage === 'tuning' ? '← Back to Tuning' : '← Back to Jobs';

  // Hide collections bar and included mode when in Tuning mode
  const saveBar = $('.cb-save-bar');
  if (saveBar) saveBar.style.display = cbReturnPage === 'tuning' ? 'none' : '';
  $$('#page-company-browser .cb-mode-btn').forEach(b => {
    if (b.dataset.mode === 'included') b.style.display = cbReturnPage === 'tuning' ? 'none' : '';
    b.classList.toggle('active', b.dataset.mode === 'all');
  });
  loadCompanyBrowser();
}

// Back button
$('#cb-back-btn').addEventListener('click', () => {
  const excluded = Object.entries(cbSelections).filter(([,v]) => v === 'exclude').map(([slug]) => {
    const c = cbAllCompanies.find(x => x.slug === slug);
    return c?.name || slug;
  });

  if (cbReturnPage === 'tuning') {
    // Replace tuning company exclusions with current selections
    tuningCoExclPills = excluded.map(name => ({ values: [name], type: 'not' }));
    saveTuning(); renderTuningPills();

    $$('.page').forEach(p => p.classList.remove('active'));
    $('#page-tuning').classList.add('active');
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === 'tuning'));
  } else {
    const included = Object.entries(cbSelections).filter(([,v]) => v === 'include').map(([slug]) => {
      const c = cbAllCompanies.find(x => x.slug === slug);
      return c?.name || slug;
    });
    if (included.length > 0 && included.length <= 5) {
      included.forEach(name => {
        if (!whoPills.find(p => p.values[0]?.toLowerCase() === name.toLowerCase())) {
          whoPills.push({ values: [name], type: 'who' });
        }
      });
    }
    if (excluded.length > 0 && excluded.length <= 5) {
      excluded.forEach(name => {
        if (!whoNotPills.find(p => p.values[0]?.toLowerCase() === name.toLowerCase())) {
          whoNotPills.push({ values: [name], type: 'who' });
        }
      });
    }
    renderAllPills();

    $$('.page').forEach(p => p.classList.remove('active'));
    $('#page-jobs').classList.add('active');
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === 'jobs'));
  }
});

// Browse icons — null guards for lazy-loaded context
if ($('#browse-who-btn')) $('#browse-who-btn').addEventListener('click', () => openCompanyBrowser('include'));
if ($('#browse-who-not-btn')) $('#browse-who-not-btn').addEventListener('click', () => openCompanyBrowser('exclude'));
if ($('#browse-tuning-co-btn')) $('#browse-tuning-co-btn').addEventListener('click', () => openCompanyBrowser('exclude', 'tuning'));

// ---- Location Browser ----
let lbAllLocations = [];
let lbMode = 'all';

async function openLocationBrowser() {
  $$('.page').forEach(p => p.classList.remove('active'));
  $('#page-location-browser').classList.add('active');
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  var mainEl = document.querySelector('.main');
  if (mainEl) mainEl.scrollTop = 0;
  $('#lb-search').value = '';
  lbMode = 'all';
  $$('[data-browser="loc"]').forEach(b => b.classList.toggle('active', b.dataset.mode === 'all'));
  $('#lb-list').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-faint);">Loading locations…</div>';
  await loadLocationBrowser();
}

async function loadLocationBrowser() {
  if (lbAllLocations.length === 0) {
    const locations = [];
    // Load US states
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
    Object.entries(US_STATES).forEach(([code, name]) => {
      locations.push({ display: `${name} (${code})`, type: 'state', sortKey: name.toLowerCase() });
    });

    // Static ref_city_radius data (210 rows, cached to avoid 100K+ seq scans)
    const REF_CITIES = [{c:'Albuquerque',s:'NM',t:'city'},{c:'Alexandria',s:'VA',t:'city'},{c:'Alpharetta',s:'GA',t:'city'},{c:'Amarillo',s:'TX',t:'city'},{c:'Anaheim',s:'CA',t:'city'},{c:'Anchorage',s:'AK',t:'city'},{c:'Ann Arbor',s:'MI',t:'city'},{c:'Arlington',s:'TX',t:'city'},{c:'Asheville',s:'NC',t:'city'},{c:'Atlanta',s:'GA',t:'city'},{c:'Augusta',s:'GA',t:'city'},{c:'Aurora',s:'CO',t:'city'},{c:'Austin',s:'TX',t:'city'},{c:'Bakersfield',s:'CA',t:'city'},{c:'Baltimore',s:'MD',t:'city'},{c:'Baton Rouge',s:'LA',t:'city'},{c:'Bay Area',s:'CA',t:'metro'},{c:'Bellevue',s:'WA',t:'city'},{c:'Bethesda',s:'MD',t:'city'},{c:'Boise',s:'ID',t:'city'},{c:'Boston',s:'MA',t:'city'},{c:'Boulder',s:'CO',t:'city'},{c:'Bridgeport',s:'CT',t:'city'},{c:'Brownsville',s:'TX',t:'city'},{c:'Buffalo',s:'NY',t:'city'},{c:'Burlington',s:'VT',t:'city'},{c:'Cambridge',s:'MA',t:'city'},{c:'Cape Coral',s:'FL',t:'city'},{c:'Carlsbad',s:'CA',t:'city'},{c:'Cary',s:'NC',t:'city'},{c:'Chandler',s:'AZ',t:'city'},{c:'Charleston',s:'SC',t:'city'},{c:'Charlotte',s:'NC',t:'city'},{c:'Chattanooga',s:'TN',t:'city'},{c:'Chesapeake',s:'VA',t:'city'},{c:'Chicago',s:'IL',t:'city'},{c:'Chula Vista',s:'CA',t:'city'},{c:'Cincinnati',s:'OH',t:'city'},{c:'Clarksville',s:'TN',t:'city'},{c:'Cleveland',s:'OH',t:'city'},{c:'Colorado Springs',s:'CO',t:'city'},{c:'Columbia',s:'MD',t:'city'},{c:'Columbia',s:'SC',t:'city'},{c:'Columbus',s:'OH',t:'city'},{c:'Corona',s:'CA',t:'city'},{c:'Corpus Christi',s:'TX',t:'city'},{c:'Cupertino',s:'CA',t:'city'},{c:'Dallas',s:'TX',t:'city'},{c:'Dayton',s:'OH',t:'city'},{c:'Denver',s:'CO',t:'city'},{c:'Des Moines',s:'IA',t:'city'},{c:'DFW',s:'TX',t:'metro'},{c:'DMV',s:'DC',t:'metro'},{c:'Doral',s:'FL',t:'city'},{c:'Durham',s:'NC',t:'city'},{c:'El Paso',s:'TX',t:'city'},{c:'Elk Grove',s:'CA',t:'city'},{c:'Eugene',s:'OR',t:'city'},{c:'Evanston',s:'IL',t:'city'},{c:'Fayetteville',s:'NC',t:'city'},{c:'Fontana',s:'CA',t:'city'},{c:'Fort Collins',s:'CO',t:'city'},{c:'Fort Lauderdale',s:'FL',t:'city'},{c:'Fort Wayne',s:'IN',t:'city'},{c:'Fort Worth',s:'TX',t:'city'},{c:'Fremont',s:'CA',t:'city'},{c:'Fresno',s:'CA',t:'city'},{c:'Frisco',s:'TX',t:'city'},{c:'Garden Grove',s:'CA',t:'city'},{c:'Garland',s:'TX',t:'city'},{c:'Gilbert',s:'AZ',t:'city'},{c:'Glendale',s:'AZ',t:'city'},{c:'Glendale',s:'CA',t:'city'},{c:'Grand Prairie',s:'TX',t:'city'},{c:'Grand Rapids',s:'MI',t:'city'},{c:'Greensboro',s:'NC',t:'city'},{c:'Greenville',s:'SC',t:'city'},{c:'Hampton Roads',s:'VA',t:'metro'},{c:'Hartford',s:'CT',t:'city'},{c:'Henderson',s:'NV',t:'city'},{c:'Herndon',s:'VA',t:'city'},{c:'Hialeah',s:'FL',t:'city'},{c:'Hoboken',s:'NJ',t:'city'},{c:'Honolulu',s:'HI',t:'city'},{c:'Houston',s:'TX',t:'city'},{c:'Huntington Beach',s:'CA',t:'city'},{c:'Huntsville',s:'AL',t:'city'},{c:'Indianapolis',s:'IN',t:'city'},{c:'Inland Empire',s:'CA',t:'metro'},{c:'Irvine',s:'CA',t:'city'},{c:'Irving',s:'TX',t:'city'},{c:'Jacksonville',s:'FL',t:'city'},{c:'Jersey City',s:'NJ',t:'city'},{c:'Kansas City',s:'MO',t:'city'},{c:'Killeen',s:'TX',t:'city'},{c:'Kirkland',s:'WA',t:'city'},{c:'Knoxville',s:'TN',t:'city'},{c:'Laredo',s:'TX',t:'city'},{c:'Las Vegas',s:'NV',t:'city'},{c:'Lexington',s:'KY',t:'city'},{c:'Lexington',s:'MA',t:'city'},{c:'Lincoln',s:'NE',t:'city'},{c:'Little Rock',s:'AR',t:'city'},{c:'Long Beach',s:'CA',t:'city'},{c:'Los Angeles',s:'CA',t:'city'},{c:'Louisville',s:'KY',t:'city'},{c:'Lubbock',s:'TX',t:'city'},{c:'Madison',s:'WI',t:'city'},{c:'Manchester',s:'NH',t:'city'},{c:'McKinney',s:'TX',t:'city'},{c:'Memphis',s:'TN',t:'city'},{c:'Menlo Park',s:'CA',t:'city'},{c:'Mesa',s:'AZ',t:'city'},{c:'Miami',s:'FL',t:'city'},{c:'Milwaukee',s:'WI',t:'city'},{c:'Minneapolis',s:'MN',t:'city'},{c:'Modesto',s:'CA',t:'city'},{c:'Moreno Valley',s:'CA',t:'city'},{c:'Mountain View',s:'CA',t:'city'},{c:'Murfreesboro',s:'TN',t:'city'},{c:'Naperville',s:'IL',t:'city'},{c:'Nashville',s:'TN',t:'city'},{c:'New Orleans',s:'LA',t:'city'},{c:'New York City',s:'NY',t:'city'},{c:'Newark',s:'NJ',t:'city'},{c:'Norfolk',s:'VA',t:'city'},{c:'North Las Vegas',s:'NV',t:'city'},{c:'Oakland',s:'CA',t:'city'},{c:'Ocala',s:'FL',t:'city'},{c:'Oklahoma City',s:'OK',t:'city'},{c:'Omaha',s:'NE',t:'city'},{c:'Ontario',s:'CA',t:'city'},{c:'Orlando',s:'FL',t:'city'},{c:'Overland Park',s:'KS',t:'city'},{c:'Oxnard',s:'CA',t:'city'},{c:'Palm Bay',s:'FL',t:'city'},{c:'Palo Alto',s:'CA',t:'city'},{c:'Pasadena',s:'CA',t:'city'},{c:'Pembroke Pines',s:'FL',t:'city'},{c:'Pensacola',s:'FL',t:'city'},{c:'Peoria',s:'AZ',t:'city'},{c:'Philadelphia',s:'PA',t:'city'},{c:'Phoenix',s:'AZ',t:'city'},{c:'Pittsburgh',s:'PA',t:'city'},{c:'Plano',s:'TX',t:'city'},{c:'Playa Vista',s:'CA',t:'city'},{c:'Port St. Lucie',s:'FL',t:'city'},{c:'Portland',s:'ME',t:'city'},{c:'Portland',s:'OR',t:'city'},{c:'Providence',s:'RI',t:'city'},{c:'Provo',s:'UT',t:'city'},{c:'Raleigh',s:'NC',t:'city'},{c:'Redmond',s:'WA',t:'city'},{c:'Redwood City',s:'CA',t:'city'},{c:'Reno',s:'NV',t:'city'},{c:'Research Triangle',s:'NC',t:'metro'},{c:'Reston',s:'VA',t:'city'},{c:'Richmond',s:'VA',t:'city'},{c:'Riverside',s:'CA',t:'city'},{c:'Roanoke',s:'VA',t:'city'},{c:'Roseville',s:'CA',t:'city'},{c:'Sacramento',s:'CA',t:'city'},{c:'Saint Paul',s:'MN',t:'city'},{c:'Salem',s:'OR',t:'city'},{c:'Salt Lake City',s:'UT',t:'city'},{c:'San Antonio',s:'TX',t:'city'},{c:'San Bernardino',s:'CA',t:'city'},{c:'San Diego',s:'CA',t:'city'},{c:'San Francisco',s:'CA',t:'city'},{c:'San Jose',s:'CA',t:'city'},{c:'Sandy Springs',s:'GA',t:'city'},{c:'Santa Ana',s:'CA',t:'city'},{c:'Santa Barbara',s:'CA',t:'city'},{c:'Santa Clara',s:'CA',t:'city'},{c:'Santa Monica',s:'CA',t:'city'},{c:'Sarasota',s:'FL',t:'city'},{c:'Savannah',s:'GA',t:'city'},{c:'Scotts Valley',s:'CA',t:'city'},{c:'Scottsdale',s:'AZ',t:'city'},{c:'Seattle',s:'WA',t:'city'},{c:'Silicon Valley',s:'CA',t:'metro'},{c:'Sioux Falls',s:'SD',t:'city'},{c:'South Florida',s:'FL',t:'metro'},{c:'Spokane',s:'WA',t:'city'},{c:'Springfield',s:'MO',t:'city'},{c:'St. Louis',s:'MO',t:'city'},{c:'St. Petersburg',s:'FL',t:'city'},{c:'Stamford',s:'CT',t:'city'},{c:'Stockton',s:'CA',t:'city'},{c:'Sunnyvale',s:'CA',t:'city'},{c:'Surprise',s:'AZ',t:'city'},{c:'Tacoma',s:'WA',t:'city'},{c:'Tallahassee',s:'FL',t:'city'},{c:'Tampa',s:'FL',t:'city'},{c:'Tampa Bay',s:'FL',t:'metro'},{c:'Tempe',s:'AZ',t:'city'},{c:'Toledo',s:'OH',t:'city'},{c:'Tri-State Area',s:'NY',t:'metro'},{c:'Tucson',s:'AZ',t:'city'},{c:'Tulsa',s:'OK',t:'city'},{c:'Twin Cities',s:'MN',t:'metro'},{c:'Tysons',s:'VA',t:'city'},{c:'Vancouver',s:'WA',t:'city'},{c:'Virginia Beach',s:'VA',t:'city'},{c:'Washington',s:'DC',t:'city'},{c:'Wichita',s:'KS',t:'city'},{c:'Wilmington',s:'DE',t:'city'},{c:'Wilmington',s:'NC',t:'city'},{c:'Winston-Salem',s:'NC',t:'city'},{c:'Yonkers',s:'NY',t:'city'}];
    REF_CITIES.forEach(r => {
      const display = r.t === 'metro' ? r.c : `${r.c}, ${r.s}`;
      locations.push({ display, type: r.t === 'metro' ? 'metro' : 'city', sortKey: display.toLowerCase() });
    });

    // Add Remote
    locations.push({ display: 'Remote', type: 'remote', sortKey: 'remote' });

    locations.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    lbAllLocations = locations;
    console.log('[BJ] Location browser loaded', locations.length, 'locations');
  }
  renderLocationBrowserList();
}

function renderLocationBrowserList() {
  const query = ($('#lb-search')?.value || '').toLowerCase().trim();
  const excluded = new Set(tuningLocExclPills.map(p => {
    const v = typeof p === 'string' ? p : ((p.values || [])[0] || '');
    return v.toLowerCase();
  }));

  let filtered = lbAllLocations;
  if (query) filtered = filtered.filter(l => l.display.toLowerCase().includes(query));
  if (lbMode === 'states') filtered = filtered.filter(l => l.type === 'state');
  if (lbMode === 'metros') filtered = filtered.filter(l => l.type === 'metro');
  if (lbMode === 'excluded') filtered = filtered.filter(l => excluded.has(l.display.toLowerCase()));

  // Group by letter + track two-letter prefixes
  const groups = {};
  const twoLetterSet = new Set();
  filtered.forEach(l => {
    const letter = l.display[0].toUpperCase();
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push(l);
    if (l.display.length >= 2) {
      const prefix = l.display.slice(0, 2).toUpperCase();
      if (/^[A-Z]{2}$/.test(prefix)) twoLetterSet.add(prefix);
    }
  });

  // Two-tier alpha nav
  let lbActiveFirstLetter = null;
  function renderLbAlphaNav1() {
    const allLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    $('#lb-alpha-nav-1').innerHTML = allLetters.map(l => {
      const exists = groups[l];
      const isActive = lbActiveFirstLetter === l;
      const cls = isActive ? 'active' : !exists ? 'dim' : '';
      return `<span class="cb-alpha-link ${cls}" data-letter="${l}">${l}</span>`;
    }).join('');
    $('#lb-alpha-nav-1').querySelectorAll('.cb-alpha-link:not(.dim)').forEach(link => {
      link.addEventListener('click', () => {
        const letter = link.dataset.letter;
        if (lbActiveFirstLetter === letter) {
          lbActiveFirstLetter = null;
          renderLbAlphaNav1();
          $('#lb-alpha-nav-2').innerHTML = '';
          const el = document.getElementById('lb-letter-' + letter);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          lbActiveFirstLetter = letter;
          renderLbAlphaNav1();
          renderLbAlphaNav2(letter);
          const el = document.getElementById('lb-letter-' + letter);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }
  function renderLbAlphaNav2(firstLetter) {
    const secondLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    $('#lb-alpha-nav-2').innerHTML = secondLetters.map(s => {
      const prefix = firstLetter + s;
      const exists = twoLetterSet.has(prefix);
      const cls = !exists ? 'dim' : '';
      return `<span class="cb-alpha-link ${cls}" data-prefix="${prefix}">${s}</span>`;
    }).join('');
    $('#lb-alpha-nav-2').querySelectorAll('.cb-alpha-link:not(.dim)').forEach(link => {
      link.addEventListener('click', () => {
        const prefix = link.dataset.prefix;
        const target = filtered.find(l => l.display.toUpperCase().startsWith(prefix));
        if (target) {
          const row = document.querySelector(`[data-loc="${target.display.replace(/"/g,'&quot;')}"]`);
          if (row) { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.style.background = 'rgba(61,126,255,0.12)'; setTimeout(() => { row.style.background = ''; }, 1200); }
        }
      });
    });
  }
  renderLbAlphaNav1();
  $('#lb-alpha-nav-2').innerHTML = '';

  // Render list
  const list = $('#lb-list');
  const badgeMap = {
    state: { bg: 'rgba(139,92,246,0.1)', color: '#8b5cf6', label: 'state' },
    metro: { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b', label: 'metro' },
    city: { bg: 'rgba(99,102,241,0.1)', color: '#6366f1', label: 'city' },
    remote: { bg: 'rgba(52,211,153,0.1)', color: 'var(--green)', label: 'remote' },
  };

  if (filtered.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-faint);">No locations match your search</div>';
    return;
  }

  list.innerHTML = Object.entries(groups).sort(([a],[b]) => a.localeCompare(b)).map(([letter, locs]) => {
    return `<div class="cb-letter-group" id="lb-letter-${letter}">
      <div class="cb-letter">${letter} <span style="font-size:11px;font-weight:400;color:var(--text-faint);">(${locs.length})</span></div>
      ${locs.map(l => {
        const isExcl = excluded.has(l.display.toLowerCase());
        const toggleCls = isExcl ? 'cb-toggle excluded' : 'cb-toggle';
        const toggleIcon = isExcl ? '✗' : '';
        const b = badgeMap[l.type] || badgeMap.city;
        return `<div class="cb-company-row" data-loc="${l.display.replace(/"/g,'&quot;')}">
          <div class="${toggleCls}" data-loc="${l.display.replace(/"/g,'&quot;')}">${toggleIcon}</div>
          <div class="cb-name">${l.display}</div>
          <div class="cb-source-badge" style="background:${b.bg};color:${b.color};">${b.label}</div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');

  // Toggle click
  list.querySelectorAll('.cb-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const loc = toggle.dataset.loc.toLowerCase();
      const isExcl = excluded.has(loc);
      if (isExcl) {
        // Remove from exclusions
        tuningLocExclPills = tuningLocExclPills.filter(p => {
          const v = typeof p === 'string' ? p : ((p.values || [])[0] || '');
          return v.toLowerCase() !== loc;
        });
        excluded.delete(loc);
        toggle.classList.remove('excluded');
        toggle.textContent = '';
      } else {
        // Add to exclusions
        tuningLocExclPills.push({ values: [toggle.dataset.loc.toLowerCase()], type: 'not' });
        excluded.add(loc);
        toggle.classList.add('excluded');
        toggle.textContent = '✗';
      }
      saveTuning(); renderTuningPills();
    });
  });
}

if ($('#browse-tuning-loc-btn')) $('#browse-tuning-loc-btn').addEventListener('click', openLocationBrowser);
$('#lb-back-btn').addEventListener('click', () => {
  $$('.page').forEach(p => p.classList.remove('active'));
  $('#page-tuning').classList.add('active');
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === 'tuning'));
});
$$('[data-browser="loc"]').forEach(btn => {
  btn.addEventListener('click', () => {
    lbMode = btn.dataset.mode;
    $$('[data-browser="loc"]').forEach(b => b.classList.toggle('active', b === btn));
    renderLocationBrowserList();
  });
});
let lbSearchTimeout;
if ($('#lb-search')) $('#lb-search').addEventListener('input', () => {
  clearTimeout(lbSearchTimeout);
  lbSearchTimeout = setTimeout(renderLocationBrowserList, 150);
});

// ---- Industry Browser ----
let ibAllIndustries = [];
let ibMode = 'all';

async function openIndustryBrowser() {
  $$('.page').forEach(p => p.classList.remove('active'));
  $('#page-industry-browser').classList.add('active');
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  var mainEl = document.querySelector('.main');
  if (mainEl) mainEl.scrollTop = 0;
  $('#ib-search').value = '';
  ibMode = 'all';
  $$('[data-browser="ind"]').forEach(b => b.classList.toggle('active', b.dataset.mode === 'all'));
  $('#ib-list').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-faint);">Loading industries…</div>';
  await loadIndustryBrowser();
}

async function loadIndustryBrowser() {
  if (ibAllIndustries.length === 0) {
    const industries = await loadIndustryCache();
    ibAllIndustries = industries.sort((a, b) => a.name.localeCompare(b.name));
    console.log('[BJ] Industry browser loaded', ibAllIndustries.length, 'industries');
  }
  renderIndustryBrowserList();
}

function renderIndustryBrowserList() {
  const query = ($('#ib-search')?.value || '').toLowerCase().trim();
  const excluded = new Set(tuningIndExclPills.map(p => typeof p === 'string' ? p : (p.values ? p.values[0] : p)));

  let filtered = ibAllIndustries;
  if (query) filtered = filtered.filter(i => i.name.includes(query) || (i.category || '').toLowerCase().includes(query));
  if (ibMode === 'excluded') filtered = filtered.filter(i => excluded.has(i.name));

  const catColors = {
    'Technology': '#3b82f6', 'Healthcare': '#ef4444', 'Finance': '#f59e0b',
    'Education': '#8b5cf6', 'Marketing': '#ec4899', 'Engineering': '#06b6d4',
    'Manufacturing': '#6b7280', 'Energy': '#f97316', 'Real Estate': '#84cc16',
    'Retail & Consumer': '#14b8a6', 'Government': '#6366f1', 'Legal': '#a855f7',
    'Media & Entertainment': '#e879f9', 'Nonprofit': '#22c55e', 'Professional Services': '#64748b',
    'Logistics': '#0ea5e9', 'Other': '#9ca3af',
  };

  // Group by category
  const groups = {};
  filtered.forEach(i => {
    const cat = i.category || 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(i);
  });

  // Category nav (row 1)
  const sortedCats = Object.keys(groups).sort();
  $('#ib-alpha-nav-1').innerHTML = sortedCats.map(cat => {
    const color = catColors[cat] || '#9ca3af';
    return `<span class="cb-alpha-link" data-cat="${cat}" style="color:${color};">${cat}</span>`;
  }).join('');
  $('#ib-alpha-nav-1').querySelectorAll('.cb-alpha-link').forEach(link => {
    link.addEventListener('click', () => {
      const el = document.getElementById('ib-cat-' + link.dataset.cat.replace(/[^a-zA-Z]/g, ''));
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  $('#ib-alpha-nav-2').innerHTML = '';

  const list = $('#ib-list');
  if (filtered.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-faint);">No industries match your search</div>';
    return;
  }

  list.innerHTML = sortedCats.map(cat => {
    const industries = groups[cat];
    const color = catColors[cat] || '#9ca3af';
    const allExcluded = industries.every(ind => excluded.has(ind.name));
    const catToggleCls = allExcluded ? 'cb-toggle excluded' : 'cb-toggle';
    const catToggleIcon = allExcluded ? '✗' : '';
    return `<div class="cb-letter-group" id="ib-cat-${cat.replace(/[^a-zA-Z]/g, '')}">
      <div class="cb-letter" style="color:${color};display:flex;align-items:center;gap:8px;">
        <div class="${catToggleCls}" data-cat="${cat.replace(/"/g,'&quot;')}" style="width:20px;height:20px;font-size:11px;cursor:pointer;" title="Exclude entire category">${catToggleIcon}</div>
        ${cat} <span style="font-size:11px;font-weight:400;color:var(--text-faint);">(${industries.length})</span>
      </div>
      ${industries.map(ind => {
        const isExcl = excluded.has(ind.name);
        const toggleCls = isExcl ? 'cb-toggle excluded' : 'cb-toggle';
        const toggleIcon = isExcl ? '✗' : '';
        return `<div class="cb-company-row" data-ind="${ind.name.replace(/"/g,'&quot;')}">
          <div class="${toggleCls}" data-ind="${ind.name.replace(/"/g,'&quot;')}">${toggleIcon}</div>
          <div class="cb-name">${ind.name}</div>
          <div class="cb-source-badge" style="background:${color}22;color:${color};">${cat}</div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');

  // Category toggle — exclude/include all industries in category
  list.querySelectorAll('.cb-letter .cb-toggle[data-cat]').forEach(catToggle => {
    catToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const cat = catToggle.dataset.cat;
      const catIndustries = (groups[cat] || []).map(i => i.name);
      const allExcl = catIndustries.every(n => excluded.has(n));
      if (allExcl) {
        // Remove all in this category
        tuningIndExclPills = tuningIndExclPills.filter(p => {
          const v = typeof p === 'string' ? p : (p.values ? p.values[0] : p);
          return !catIndustries.includes(v);
        });
        catIndustries.forEach(n => excluded.delete(n));
      } else {
        // Add all in this category
        catIndustries.forEach(n => {
          if (!excluded.has(n)) {
            tuningIndExclPills.push(n);
            excluded.add(n);
          }
        });
      }
      saveTuning(); renderTuningPills();
      renderIndustryBrowserList(); // Re-render to update all toggles
    });
  });

  // Toggle click
  list.querySelectorAll('.cb-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const ind = toggle.dataset.ind;
      const isExcl = excluded.has(ind);
      if (isExcl) {
        tuningIndExclPills = tuningIndExclPills.filter(p => {
          const v = typeof p === 'string' ? p : (p.values ? p.values[0] : p);
          return v !== ind;
        });
        excluded.delete(ind);
        toggle.classList.remove('excluded');
        toggle.textContent = '';
      } else {
        tuningIndExclPills.push(ind);
        excluded.add(ind);
        toggle.classList.add('excluded');
        toggle.textContent = '✗';
      }
      saveTuning(); renderTuningPills();
    });
  });
}

if ($('#browse-tuning-ind-btn')) $('#browse-tuning-ind-btn').addEventListener('click', openIndustryBrowser);
$('#ib-back-btn').addEventListener('click', () => {
  $$('.page').forEach(p => p.classList.remove('active'));
  $('#page-tuning').classList.add('active');
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === 'tuning'));
});
$$('[data-browser="ind"]').forEach(btn => {
  btn.addEventListener('click', () => {
    ibMode = btn.dataset.mode;
    $$('[data-browser="ind"]').forEach(b => b.classList.toggle('active', b === btn));
    renderIndustryBrowserList();
  });
});
let ibSearchTimeout;
if ($('#ib-search')) $('#ib-search').addEventListener('input', () => {
  clearTimeout(ibSearchTimeout);
  ibSearchTimeout = setTimeout(renderIndustryBrowserList, 150);
});

// Mode filter buttons
$$('#page-company-browser .cb-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('#page-company-browser .cb-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderCompanyBrowserList();
  });
});

// Search
let cbSearchTimeout;
$('#cb-search').addEventListener('input', () => {
  clearTimeout(cbSearchTimeout);
  cbSearchTimeout = setTimeout(renderCompanyBrowserList, 150);
});

// Sort by column (v6.45)
let cbSortField = 'name';
let cbSortDir = 'asc';

document.querySelectorAll('#cb-sort-bar .cb-sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const field = btn.dataset.sort;
    if (cbSortField === field) {
      cbSortDir = cbSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      cbSortField = field;
      cbSortDir = field === 'name' ? 'asc' : 'desc'; // numeric fields default desc
    }
    document.querySelectorAll('#cb-sort-bar .cb-sort-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.sort === cbSortField);
      b.style.background = b.dataset.sort === cbSortField ? 'var(--bg-card-hover)' : 'none';
    });
    // PostHog tracking
    renderCompanyBrowserList();
  });
});

// Save collection button
$('#cb-save-btn').addEventListener('click', async () => {
  const name = $('#cb-collection-name').value.trim();
  if (!name) return;
  const selectedSlugs = Object.entries(cbSelections)
    .filter(([, v]) => v === 'include' || v === 'exclude')
    .map(([slug]) => slug);
  if (selectedSlugs.length === 0) return;

  const btn = $('#cb-save-btn');
  btn.disabled = true; btn.textContent = 'Saving…';

  // Save with metadata about which are included vs excluded
  const collData = Object.entries(cbSelections)
    .filter(([, v]) => v === 'include' || v === 'exclude')
    .map(([slug, mode]) => slug + ':' + mode);

  const ok = await saveCollection(name, collData);
  btn.textContent = ok ? 'Saved ✓' : 'Error';
  setTimeout(() => { btn.textContent = 'Save Collection'; btn.disabled = false; }, 1500);

  if (ok) {
    // Add as a collection pill to the appropriate Who row
    const inclSlugs = Object.entries(cbSelections).filter(([,v]) => v === 'include').map(([s]) => s);
    const exclSlugs = Object.entries(cbSelections).filter(([,v]) => v === 'exclude').map(([s]) => s);
    if (inclSlugs.length > 0) {
      const names = inclSlugs.map(s => cbAllCompanies.find(c => c.slug === s)?.name || s);
      whoPills.push({ values: names, type: 'collection', collectionName: name, collectionId: userCollections.find(c => c.name === name)?.id });
    }
    if (exclSlugs.length > 0) {
      const names = exclSlugs.map(s => cbAllCompanies.find(c => c.slug === s)?.name || s);
      whoNotPills.push({ values: names, type: 'collection', collectionName: name, collectionId: userCollections.find(c => c.name === name)?.id });
    }
    renderAllPills();
  }
});

// Enable save button when name + selections exist
$('#cb-collection-name').addEventListener('input', () => {
  const hasName = $('#cb-collection-name').value.trim().length > 0;
  const hasSelections = Object.keys(cbSelections).length > 0;
  $('#cb-save-btn').disabled = !(hasName && hasSelections);
});

async function loadCompanyBrowser() {
  const list = $('#cb-list');
  list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-faint);">Loading companies…</div>';

  // QA-FIX: Show US-Only indicator when tuning is active
  var usOnlyBanner = $('#cb-us-only-banner');
  if (!usOnlyBanner) {
    usOnlyBanner = document.createElement('div');
    usOnlyBanner.id = 'cb-us-only-banner';
    usOnlyBanner.style.cssText = 'display:none;padding:8px 14px;margin-bottom:8px;font-size:11px;color:var(--accent);background:hsla(var(--accent-hsl),0.06);border:1px solid hsla(var(--accent-hsl),0.15);border-radius:8px;';
    usOnlyBanner.textContent = '🇺🇸 US-Only filter active — only US-based jobs from these companies will appear in your feed';
    list.parentElement.insertBefore(usOnlyBanner, list);
  }
  var tuning = safeReadLS('bj_tuning', {});
  usOnlyBanner.style.display = tuning.usOnly ? '' : 'none';

  try {
    // Load companies with active jobs — paginate to get all (PostgREST caps single requests)
    // (ats_companies has 65K+ rows but only ~5-10K have open jobs)
    let cacheResult = await cachedQuery('ref:companies:active', async function() {
      // Load all companies with jobs — fetch by letter to avoid PostgREST 1000-row cap
      let allRows = [];
      const letters = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      for (const letter of letters) {
        let page = 0;
        while (true) {
          let q = sb.from('ats_companies')
            .select('slug, name, job_count, source')
            .gt('job_count', 0)
            .order('name');
          if (letter === '#') {
            q = q.or('name.ilike.0%,name.ilike.1%,name.ilike.2%,name.ilike.3%,name.ilike.4%,name.ilike.5%,name.ilike.6%,name.ilike.7%,name.ilike.8%,name.ilike.9%');
          } else {
            q = q.ilike('name', letter + '%');
          }
          q = q.range(page * 1000, (page + 1) * 1000 - 1);
          const { data, error } = await q;
          if (error) { console.warn('[CB] Letter', letter, 'page', page, 'error:', error.message); break; }
          allRows = allRows.concat(data || []);
          if (!data || data.length < 1000) break;
          page++;
        }
      }
      console.log('[CB] Loaded', allRows.length, 'companies across', letters.length, 'letter queries');
      return { data: allRows };
    }, { ttl: 600000 });
    let allData = (cacheResult && cacheResult.data) || [];

    // Load ghost stats for companies that have data
    let ghostStats = {};
    try {
      const gs = await safeQuery(() => sb.from('company_ghost_stats').select('company_slug, ghost_rate, avg_response_days, total_applications'), { label: 'browsers:company_ghost_stats', fallback: [] });
      (gs || []).forEach(g => { ghostStats[g.company_slug] = g; });
    } catch(e) { reportError('browsers:ghost stats optional', e); }

    cbAllCompanies = allData.map(c => ({
      slug: c.slug,
      name: c.name || c.slug,
      jobs: c.job_count || 0,
      source: c.source || 'greenhouse',
      ghostRate: ghostStats[c.slug]?.ghost_rate || null,
      avgResponseDays: ghostStats[c.slug]?.avg_response_days || null,
      ghostApps: ghostStats[c.slug]?.total_applications || 0
    })).sort((a, b) => a.name.localeCompare(b.name));

    console.log('[CB] Mapped', cbAllCompanies.length, 'companies. First 3:', cbAllCompanies.slice(0,3).map(c => c.name));
    renderCompanyBrowserList();
    updateCbSelectedCount();

  } catch (e) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--red);">Failed to load companies</div>';
  }
}

function renderCompanyBrowserList() {
  const list = $('#cb-list');
  const search = ($('#cb-search').value || '').trim().toLowerCase();
  const modeBtn = document.querySelector('#page-company-browser .cb-mode-btn.active');
  const filterMode = modeBtn?.dataset.mode || 'all';

  let filtered = cbAllCompanies;
  if (search) {
    filtered = filtered.filter(c => c.name.toLowerCase().includes(search) || c.slug.toLowerCase().includes(search));
  }
  if (filterMode === 'included') {
    filtered = filtered.filter(c => cbSelections[c.slug] === 'include');
  } else if (filterMode === 'excluded') {
    filtered = filtered.filter(c => cbSelections[c.slug] === 'exclude');
  }

  // Apply sort (v6.45)
  const dir = cbSortDir === 'asc' ? 1 : -1;
  if (cbSortField === 'jobs') {
    filtered = [...filtered].sort((a, b) => (a.jobs - b.jobs) * dir);
  } else {
    filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name) * dir);
  }

  // Group by first letter
  const groups = {};
  const twoLetterSet = new Set(); // track all two-letter prefixes that exist
  filtered.forEach(c => {
    const letter = (c.name[0] || '#').toUpperCase();
    const key = /[A-Z]/.test(letter) ? letter : '#';
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
    // Track two-letter prefix
    if (c.name.length >= 2) {
      const prefix = c.name.slice(0, 2).toUpperCase();
      if (/^[A-Z]{2}$/.test(prefix)) twoLetterSet.add(prefix);
    }
  });

  const letters = Object.keys(groups).sort();

  // Two-tier alpha nav
  let cbActiveFirstLetter = null;

  function renderAlphaNav1() {
    const allLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
    $('#cb-alpha-nav-1').innerHTML = allLetters.map(l => {
      const exists = groups[l];
      const isActive = cbActiveFirstLetter === l;
      const cls = isActive ? 'active' : !exists ? 'dim' : '';
      return `<span class="cb-alpha-link ${cls}" data-letter="${l}">${l}</span>`;
    }).join('');

    $('#cb-alpha-nav-1').querySelectorAll('.cb-alpha-link:not(.dim)').forEach(link => {
      link.addEventListener('click', () => {
        const letter = link.dataset.letter;
        if (cbActiveFirstLetter === letter) {
          // Deselect — clear second row and scroll to letter
          cbActiveFirstLetter = null;
          renderAlphaNav1();
          $('#cb-alpha-nav-2').innerHTML = '';
          const el = document.getElementById('cb-letter-' + letter);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          cbActiveFirstLetter = letter;
          renderAlphaNav1();
          // UX: No second-row drill-down for # (number-prefixed companies)
          if (letter === '#') {
            $('#cb-alpha-nav-2').innerHTML = '';
          } else {
            renderAlphaNav2(letter);
          }
          // Also scroll to that letter group
          const el = document.getElementById('cb-letter-' + letter);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  function renderAlphaNav2(firstLetter) {
    const secondLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    $('#cb-alpha-nav-2').innerHTML = secondLetters.map(s => {
      const prefix = firstLetter + s;
      const exists = twoLetterSet.has(prefix);
      const cls = !exists ? 'dim' : '';
      return `<span class="cb-alpha-link ${cls}" data-prefix="${prefix}">${s}</span>`;
    }).join('');

    $('#cb-alpha-nav-2').querySelectorAll('.cb-alpha-link:not(.dim)').forEach(link => {
      link.addEventListener('click', () => {
        const prefix = link.dataset.prefix;
        // Find first company with this prefix and scroll to it
        const target = filtered.find(c => c.name.toUpperCase().startsWith(prefix));
        if (target) {
          const row = list.querySelector(`[data-slug="${target.slug}"]`);
          if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Brief highlight
          if (row) {
            row.style.background = 'rgba(61,126,255,0.12)';
            setTimeout(() => { row.style.background = ''; }, 1200);
          }
        }
      });
    });
  }

  renderAlphaNav1();
  $('#cb-alpha-nav-2').innerHTML = ''; // clear second row on fresh render

  if (filtered.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-faint);">No companies match your search</div>';
    return;
  }

  list.innerHTML = letters.map(letter => {
    const companies = groups[letter];
    return `<div class="cb-letter-group" id="cb-letter-${letter}">
      <div class="cb-letter">${letter} <span style="font-size:11px;font-weight:400;color:var(--text-faint);">(${companies.length})</span></div>
      ${companies.map(c => {
        const sel = cbSelections[c.slug];
        const toggleClass = sel === 'include' ? 'included' : sel === 'exclude' ? 'excluded' : '';
        const toggleIcon = sel === 'include' ? '✓' : sel === 'exclude' ? '✗' : '';
        return `<div class="cb-company-row" data-slug="${c.slug}">
          <div class="cb-toggle ${toggleClass}" data-slug="${c.slug}">${toggleIcon}</div>
          <div class="cb-name">${c.name}</div>
          <div class="cb-jobs">${c.jobs > 0 ? c.jobs + ' jobs' : ''}</div>
          ${c.ghostRate !== null && c.ghostApps >= 5 ? `<div class="cb-ghost-rate" title="Ghost rate: ${Math.round(c.ghostRate * 100)}% (${c.ghostApps} applications tracked)" style="font-size:10px;padding:1px 6px;border-radius:4px;margin-left:4px;${c.ghostRate >= 0.5 ? 'background:rgba(245,101,101,0.15);color:#f56565;' : c.ghostRate >= 0.25 ? 'background:rgba(245,158,11,0.15);color:#f59e0b;' : 'background:rgba(72,187,120,0.15);color:#48bb78;'}">${Math.round(c.ghostRate * 100)}% ghost</div>` : ''}
          <div class="cb-source-badge" style="background:rgba(99,102,241,0.1);color:#6366f1;">${c.source}</div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');

  // Click handlers for toggle buttons
  list.querySelectorAll('.cb-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const slug = toggle.dataset.slug;
      const current = cbSelections[slug];
      if (cbReturnPage === 'tuning') {
        // Tuning mode: simple exclude toggle
        if (current === 'exclude') {
          delete cbSelections[slug];
        } else {
          cbSelections[slug] = 'exclude';
        }
      } else {
        // Jobs Feed mode: cycle include → exclude → none
        if (!current) {
          cbSelections[slug] = cbBrowseMode === 'exclude' ? 'exclude' : 'include';
        } else if (current === 'include') {
          cbSelections[slug] = 'exclude';
        } else if (current === 'exclude') {
          delete cbSelections[slug];
        }
      }
      // Update visual
      const sel = cbSelections[slug];
      toggle.className = 'cb-toggle' + (sel === 'include' ? ' included' : sel === 'exclude' ? ' excluded' : '');
      toggle.textContent = sel === 'include' ? '✓' : sel === 'exclude' ? '✗' : '';
      updateCbSelectedCount();
    });
  });

  // Click on row = toggle
  list.querySelectorAll('.cb-company-row').forEach(row => {
    row.addEventListener('click', () => {
      row.querySelector('.cb-toggle').click();
    });
  });

  // Click on company name = expand AI content breakdown (v6.45)
  list.querySelectorAll('.cb-name').forEach(nameEl => {
    nameEl.style.cursor = 'pointer';
    nameEl.style.textDecoration = 'underline';
    nameEl.style.textDecorationColor = 'var(--border)';
    nameEl.addEventListener('click', async (e) => {
      e.stopPropagation(); // prevent row toggle
      const row = nameEl.closest('.cb-company-row');
      const slug = row.dataset.slug;
      const existing = row.nextElementSibling;
      if (existing && existing.classList.contains('cb-detail-panel')) {
        existing.remove();
        return;
      }
      // Remove any other open detail panels
      list.querySelectorAll('.cb-detail-panel').forEach(p => p.remove());
      // Create detail panel
      const panel = document.createElement('div');
      panel.className = 'cb-detail-panel';
      panel.style.cssText = 'padding:12px 16px 12px 44px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;margin:4px 0 8px;font-size:12px;color:var(--text-dim);';
      panel.innerHTML = '<div style="color:var(--text-faint);">Loading AI content breakdown…</div>';
      row.after(panel);
      // PostHog: track company AI detail expansion (v6.49 — Session 5.1)
      if (typeof posthog !== 'undefined') posthog.capture('ai_company_detail_expanded', { company_slug: slug });
      try {
        const { data, error } = await sb.from('content_ai_scores')
          .select('ai_label')
          .eq('content_type', 'jd')
          .like('content_id', slug + '/%');
        if (error || !data || data.length === 0) {
          // Try alternate: get jobs for this company first
          const jobs = await safeQuery(() => sb.from('ats_jobs').select('id')
            .eq('company_slug', slug)
            .limit(500), { label: 'browsers:ats_jobs', fallback: [] });
          if (jobs && jobs.length > 0) {
            const jobIds = jobs.map(j => String(j.id));
            const scores = await safeQuery(() => sb.from('content_ai_scores').select('ai_label')
              .eq('content_type', 'jd')
              .in('content_id', jobIds), { label: 'browsers:content_ai_scores', fallback: [] });
            renderBreakdown(panel, scores || [], slug);
          } else {
            panel.innerHTML = '<div style="color:var(--text-faint);">No scored job descriptions found for this company.</div>';
          }
        } else {
          renderBreakdown(panel, data, slug);
        }
      } catch (err) {
        panel.innerHTML = '<div style="color:var(--red);">Failed to load AI breakdown.</div>';
      }
    });
  });
}

// Render AI content breakdown in company detail panel (v6.45)
function renderBreakdown(panel, scores, slug) {
  if (!scores || scores.length === 0) {
    panel.innerHTML = '<div style="color:var(--text-faint);">No scored job descriptions found for this company.</div>';
    return;
  }
  const counts = { human: 0, mixed: 0, ai_generated: 0 };
  scores.forEach(s => { if (counts[s.label] !== undefined) counts[s.label]++; });
  const total = scores.length;
  const pctH = total > 0 ? Math.round((counts.human / total) * 100) : 0;
  const pctM = total > 0 ? Math.round((counts.mixed / total) * 100) : 0;
  const pctA = total > 0 ? Math.round((counts.ai_generated / total) * 100) : 0;

  panel.innerHTML = `
    <div style="font-weight:600;margin-bottom:8px;color:var(--text);">AI Content Breakdown <span style="font-weight:400;color:var(--text-faint);">(${total} scored JDs)</span></div>
    <div style="display:flex;height:14px;border-radius:4px;overflow:hidden;margin-bottom:8px;">
      ${pctH > 0 ? `<div style="width:${pctH}%;background:#48bb78;" title="Human: ${counts.human}"></div>` : ''}
      ${pctM > 0 ? `<div style="width:${pctM}%;background:#f59e0b;" title="Mixed: ${counts.mixed}"></div>` : ''}
      ${pctA > 0 ? `<div style="width:${pctA}%;background:#f56565;" title="AI-Generated: ${counts.ai_generated}"></div>` : ''}
    </div>
    <div style="display:flex;gap:16px;">
      <span style="color:#48bb78;">● Human: ${counts.human} (${pctH}%)</span>
      <span style="color:#f59e0b;">● Mixed: ${counts.mixed} (${pctM}%)</span>
      <span style="color:#f56565;">● AI-Generated: ${counts.ai_generated} (${pctA}%)</span>
    </div>
  `;
  // PostHog: track breakdown render with label distribution (v6.49 — Session 5.1)
  if (typeof posthog !== 'undefined') {
    posthog.capture('ai_label_distribution_viewed', {
      company_slug: slug,
      total_scored: total,
      pct_human: pctH,
      pct_mixed: pctM,
      pct_ai_generated: pctA
    });
  }
}

function updateCbSelectedCount() {
  const count = Object.keys(cbSelections).length;
  const incl = Object.values(cbSelections).filter(v => v === 'include').length;
  const excl = Object.values(cbSelections).filter(v => v === 'exclude').length;
  const parts = [];
  if (incl > 0) parts.push(`${incl} included`);
  if (excl > 0) parts.push(`${excl} excluded`);
  $('#cb-selected-count').textContent = parts.length > 0 ? parts.join(', ') : '0 selected';
  // Enable save button check
  const hasName = $('#cb-collection-name').value.trim().length > 0;
  $('#cb-save-btn').disabled = !(hasName && count > 0);
}

// Collection pill click — open edit popup
function openCollectionPopup(pill, pillArray, pillIndex) {
  const collName = pill.collectionName;
  const coll = userCollections.find(c => c.name === collName);
  const companies = pill.values || [];

  const overlay = document.createElement('div');
  overlay.className = 'coll-popup-overlay';
  overlay.innerHTML = `
    <div class="coll-popup" onclick="event.stopPropagation()">
      <h3>📂 ${collName} <span style="font-size:12px;color:var(--text-faint);font-weight:400;">(${companies.length} companies)</span></h3>
      <div style="margin-bottom:12px;">
        ${companies.map((name, i) => `
          <div class="coll-item">
            <input type="checkbox" id="coll-chk-${i}" checked data-name="${name.replace(/"/g,'&quot;')}">
            <label for="coll-chk-${i}">${name}</label>
          </div>
        `).join('')}
      </div>
      <div class="coll-popup-actions">
        <button class="cb-back-btn" id="coll-popup-cancel">Cancel</button>
        <button class="cb-save-btn" id="coll-popup-save">Update</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', () => overlay.remove());

  overlay.querySelector('#coll-popup-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#coll-popup-save').addEventListener('click', async () => {
    const checked = [...overlay.querySelectorAll('.coll-item input:checked')].map(cb => cb.dataset.name);
    if (checked.length === 0) {
      pillArray.splice(pillIndex, 1);
    } else {
      pill.values = checked;
    }
    renderAllPills();
    overlay.remove();

    // Update in Supabase if we have the collection
    if (coll) {
      const newSlugs = checked.map(name => {
        const c = cbAllCompanies.find(x => x.name === name);
        return (c?.slug || name) + ':include';
      });
      await saveCollection(collName, newSlugs);
    }
  });
}

// Modify searchCompanies to also show collections in dropdown
const origSearchCompanies = searchCompanies;
searchCompanies = async function(query) {
  await origSearchCompanies(query);

  // Also add matching collections to the dropdown
  const ql = query.toLowerCase();
  const matchingColls = userCollections.filter(c => c.name.toLowerCase().includes(ql));
  if (matchingColls.length > 0 && companyDropdown.classList.contains('open')) {
    const collHtml = matchingColls.map(c => {
      const count = c.slugs?.length || 0;
      return `<div class="company-opt" tabindex="0" data-name="${c.name.replace(/"/g,'&quot;')}" data-collection-id="${c.id}" data-type="collection">
        <span style="font-weight:500;">📂 ${highlightCompanyMatch(c.name, query)}</span>
        <span style="font-size:9px;background:rgba(139,92,246,0.1);color:var(--purple);padding:1px 6px;border-radius:4px;font-weight:600;">${count} cos</span>
      </div>`;
    }).join('');
    companyDropdown.innerHTML = collHtml + companyDropdown.innerHTML;

    // Re-bind click handlers on new elements
    companyDropdown.querySelectorAll('.company-opt[data-type="collection"]').forEach(opt => {
      opt.addEventListener('mousedown', e => {
        e.preventDefault();
        const collId = opt.dataset.collectionId;
        const coll = userCollections.find(c => c.id === collId);
        if (coll) {
          const names = coll.slugs.map(s => {
            const slug = s.split(':')[0];
            const c = cbAllCompanies.find(x => x.slug === slug);
            return c?.name || slug;
          });
          whoPills.push({ values: names, type: 'collection', collectionName: coll.name, collectionId: coll.id });
          renderAllPills();
        }
        qbInputWho.value = '';
        companyDropdown.classList.remove('open');
      });
    });
  }
};

// Collections loaded in init() after auth


// ─── AI Aggregation Health Panel (v6.46 Session 4.3) ───

async function loadAiAggregationHealth() {
  const panel = document.getElementById('cb-ai-health-panel');
  if (!panel) return;

  // Only show for admin users
  const isAdmin = typeof getUserTier === 'function' && getUserTier() === 'admin';
  if (!isAdmin) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = '';

  try {
    const { data, error } = await sb.rpc('get_ai_aggregation_health');
    if (error) throw error;
    if (!data) return;

    const h = data;

    // Coverage
    const coverageEl = document.getElementById('ai-h-coverage');
    if (coverageEl) {
      const pct = h.coverage_pct || 0;
      coverageEl.textContent = pct + '%';
      coverageEl.style.color = pct > 80 ? 'var(--green)' : pct > 30 ? 'var(--amber,orange)' : 'var(--red)';
    }

    // Scored JDs
    const scoredEl = document.getElementById('ai-h-scored');
    if (scoredEl) {
      scoredEl.textContent = (h.total_scores || 0).toLocaleString();
    }

    // Companies rated
    const companiesEl = document.getElementById('ai-h-companies');
    if (companiesEl) {
      const rated = h.companies_with_rate || 0;
      const total = h.total_companies || 0;
      companiesEl.textContent = rated.toLocaleString() + ' / ' + total.toLocaleString();
    }

    // Cron status
    const cronEl = document.getElementById('ai-h-cron');
    if (cronEl) {
      cronEl.textContent = h.cron_active ? '✅ Active' : '❌ Inactive';
      cronEl.style.color = h.cron_active ? 'var(--green)' : 'var(--red)';
    }

    // Backfill status
    const backfillEl = document.getElementById('ai-h-backfill');
    if (backfillEl) {
      backfillEl.textContent = h.backfill_active ? '🔄 Running' : '⏹ Stopped';
      backfillEl.style.color = h.backfill_active ? 'var(--blue, #3b82f6)' : 'var(--text-dim)';
    }

    // Last scored
    const lastEl = document.getElementById('ai-h-last-score');
    if (lastEl) {
      if (h.latest_score_at) {
        const ago = timeAgo(new Date(h.latest_score_at));
        lastEl.textContent = ago;
      } else {
        lastEl.textContent = 'Not yet';
        lastEl.style.color = 'var(--text-dim)';
      }
    }

    // Label distribution
    const labelsEl = document.getElementById('cb-ai-health-labels');
    if (labelsEl && h.label_distribution) {
      const labels = h.label_distribution;
      const total = Object.values(labels).reduce((s, v) => s + v, 0) || 0;
      if (total > 0) {
        labelsEl.innerHTML = Object.entries(labels).map(([label, count]) => {
          const pct = ((count / total) * 100).toFixed(1);
          const color = label === 'human' ? 'var(--green)' : label === 'mixed' ? 'var(--amber,orange)' : label === 'ai_generated' ? 'var(--red)' : 'var(--text-dim)';
          const displayLabel = label.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          return `<span style="font-size:11px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:3px;"></span>${displayLabel}: ${count.toLocaleString()} (${pct}%)</span>`;
        }).join('');
      } else {
        labelsEl.innerHTML = '<span style="font-size:11px;color:var(--text-dim);">Backfill in progress — no scores yet</span>';
      }
    }

    // PostHog tracking
    if (typeof posthog !== 'undefined') {
      posthog.capture('ai_aggregation_health_viewed', {
        coverage_pct: h.coverage_pct,
        total_scores: h.total_scores,
        cron_active: h.cron_active,
        backfill_active: h.backfill_active
      });
    }

  } catch (e) {
    reportError('browsers', e);
    console.warn('[BJ] AI aggregation health check failed:', e.message);
    panel.style.display = 'none';
  }
}

// Simple time-ago helper
function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  return days + 'd ago';
}

// Toggle handler for health panel
document.addEventListener('DOMContentLoaded', function() {
  const toggleBtn = document.getElementById('cb-ai-health-toggle');
  const body = document.getElementById('cb-ai-health-body');
  const labels = document.getElementById('cb-ai-health-labels');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function() {
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? 'grid' : 'none';
      if (labels) labels.style.display = hidden ? 'flex' : 'none';
      toggleBtn.textContent = hidden ? 'Show' : 'Hide';
    });
  }
});

// ============================================================
// UX-007: Generic Filter Browser
// ============================================================
// Reusable browser for WHAT, SKILLS, DEPT, LEVEL, JD CONTAINS
// Data sourced from mv_filter_browser_data materialized view
// ============================================================

let _fbCache = {}; // { [dim]: { data: [...], ts: number, _usOnly: bool } }
let _fbCacheTTL = 10 * 60 * 1000; // 10 min
let _fbConfig = null; // current browser config
let _fbSelections = {}; // { value: true }
let _fbSearchTimeout = null;

const FB_DIMENSIONS = {
  title:      { label: 'Title Browser',      subtitle: 'Popular job titles from live listings',     mvDim: 'title',      pillTarget: 'whatPills',    pillNotTarget: 'whatNotPills' },
  skill:      { label: 'Skills Browser',      subtitle: 'Most in-demand skills across open jobs',   mvDim: 'skill',      pillTarget: 'skillsPills',  pillNotTarget: null },
  dept:       { label: 'Department Browser',  subtitle: 'Departments hiring now',                   mvDim: 'dept',       pillTarget: 'deptPills',    pillNotTarget: null },
  level:      { label: 'Level Browser',       subtitle: 'Career levels in current openings',        mvDim: 'level',      pillTarget: 'levelPills',   pillNotTarget: null },
  jd_keyword: { label: 'JD Keyword Browser',  subtitle: 'Most common terms in job descriptions',   mvDim: 'jd_keyword', pillTarget: 'jdPills',      pillNotTarget: null },
};

function openFilterBrowser(dimension, mode) {
  const dimConfig = FB_DIMENSIONS[dimension];
  if (!dimConfig) { console.warn('[BJ] Unknown filter browser dimension:', dimension); return; }

  _fbConfig = { ...dimConfig, dimension, mode: mode || 'include' };
  _fbSelections = {};

  // Invalidate cache if US-Only changed since last load
  var tuning = safeReadLS('bj_tuning', {});
  var currentUsOnly = !!tuning.usOnly;
  // Clear all dimension caches if usOnly changed
  if (Object.values(_fbCache).some(c => c._usOnly !== currentUsOnly)) {
    _fbCache = {};
  }

  // Show browser page
  $$('.page').forEach(p => p.classList.remove('active'));
  $('#page-filter-browser').classList.add('active');
  $$('.nav-item').forEach(n => n.classList.remove('active'));

  // Scroll main content area to top so the page header is visible
  var mainEl = document.querySelector('.main');
  if (mainEl) mainEl.scrollTop = 0;

  // Show US-Only banner only for geography-sensitive dimensions (title, skills)
  var usBanner = $('#fb-us-only-banner');
  var geoSensitiveDims = ['title', 'skill', 'jd_keyword'];
  if (usBanner) usBanner.classList.toggle('u-hidden', !currentUsOnly || !geoSensitiveDims.includes(dimension));

  // Update header
  $('#fb-title').textContent = dimConfig.label;
  $('#fb-subtitle').textContent = dimConfig.subtitle;
  $('#fb-search').value = '';
  $('#fb-search').placeholder = 'Search ' + dimConfig.label.replace(' Browser', '').toLowerCase() + '…';

  loadFilterBrowserData();
}

async function loadFilterBrowserData() {
  const list = $('#fb-list');
  if (!list) return;

  const dim = _fbConfig?.mvDim;
  const tuning = safeReadLS('bj_tuning', {});
  const usOnly = !!tuning.usOnly;

  // Check dimension-specific cache
  const dimCache = _fbCache[dim];
  if (dimCache && Date.now() - dimCache.ts < _fbCacheTTL) {
    renderFilterBrowserList();
    return;
  }

  list.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-faint);">Loading…</div>';

  try {
    // Use server-side function (does GROUP BY + ORDER BY on DB — accurate counts)
    const { data, error } = await sb.rpc('fn_filter_browser_top', {
      p_dimension: dim,
      p_us_only: usOnly,
      p_limit: 200
    });

    if (error) throw error;

    const items = (data || []).map(d => ({ dimension: dim, value: d.value, job_count: d.job_count }));
    _fbCache[dim] = { data: items, ts: Date.now(), _usOnly: usOnly };
    renderFilterBrowserList();
  } catch (err) {
    reportError('filter-browser', err);
    list.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-faint);">Failed to load browser data. The filter browser function may not be deployed yet.</div>';
  }
}

function renderFilterBrowserList() {
  const list = $('#fb-list');
  const nav = $('#fb-alpha-nav');
  const countEl = $('#fb-total-count');
  const dim = _fbConfig?.mvDim;
  if (!list || !_fbCache[dim] || !_fbConfig) return;

  const query = ($('#fb-search')?.value || '').toLowerCase();

  // Get data for current dimension from dimension-keyed cache
  let items = _fbCache[dim].data || [];
  if (query) {
    items = items.filter(d => d.value.toLowerCase().includes(query));
  }

  // Sort alphabetically for pill wall
  items.sort((a, b) => a.value.localeCompare(b.value));

  if (countEl) countEl.textContent = items.length + ' value' + (items.length !== 1 ? 's' : '');

  if (items.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-faint);">' +
      (query ? 'No matches for "' + escapeHtml(query) + '"' : 'No data available for this dimension') + '</div>';
    if (nav) nav.innerHTML = '';
    return;
  }

  // Build alpha nav (hide for small sets like LEVEL)
  if (nav) {
    if (items.length <= 20) {
      nav.innerHTML = '';
    } else {
      const letters = [...new Set(items.map(d => (d.value[0] || '').toUpperCase()))].sort();
      nav.innerHTML = letters.map(l =>
        `<span class="cb-alpha-letter" data-fb-letter="${l}" style="cursor:pointer;padding:2px 6px;font-size:11px;font-weight:600;color:var(--text-faint);border-radius:4px;" onmouseenter="this.style.background='var(--accent-dim)';this.style.color='var(--accent)'" onmouseleave="this.style.background='';this.style.color='var(--text-faint)'" onclick="document.getElementById('fb-letter-' + this.dataset.fbLetter)?.scrollIntoView({behavior:'smooth',block:'start'})">${l}</span>`
      ).join('');
    }
  }

  // Render as alphabetical pill wall
  // Display label overrides — raw DB values → human-readable labels
  const DISPLAY_LABELS = {
    'entry': 'Entry Level', 'mid': 'Mid Level', 'senior': 'Senior',
    'manager': 'Manager', 'director': 'Director', 'executive': 'Executive',
    'intern': 'Intern', 'junior': 'Junior', 'hr': 'HR',
  };

  let html = '';
  let lastLetter = '';
  let pillsOpen = false;
  for (const item of items) {
    const displayLabel = DISPLAY_LABELS[item.value] || item.value;
    const letter = (displayLabel[0] || '').toUpperCase();
    if (letter !== lastLetter) {
      if (pillsOpen) html += '</div>'; // close previous pill group
      html += `<div id="fb-letter-${letter}" style="font-size:11px;font-weight:700;color:var(--text-faint);padding:10px 0 4px;margin-top:4px;">${letter}</div>`;
      html += '<div style="display:flex;flex-wrap:wrap;gap:6px;padding:2px 0;">';
      pillsOpen = true;
      lastLetter = letter;
    }
    const selected = _fbSelections[item.value];
    const bg = selected ? 'var(--accent)' : 'var(--bg-input)';
    const color = selected ? '#fff' : 'var(--text)';
    const border = selected ? 'var(--accent)' : 'var(--border)';
    html += `<span class="fb-pill" data-value="${escapeHtml(item.value)}" onclick="_toggleFbItem(this)" style="display:inline-flex;align-items:center;gap:4px;padding:5px 12px;border-radius:20px;border:1px solid ${border};background:${bg};color:${color};font-size:12px;font-weight:500;cursor:pointer;transition:all 0.12s;white-space:nowrap;user-select:none;">${escapeHtml(displayLabel)}<span style="font-size:10px;opacity:0.6;font-weight:600;">${item.job_count.toLocaleString()}</span></span>`;
  }
  if (pillsOpen) html += '</div>';

  list.innerHTML = html;
}

function _toggleFbItem(el) {
  const value = el.dataset.value;
  if (_fbSelections[value]) {
    delete _fbSelections[value];
  } else {
    _fbSelections[value] = true;
  }
  // Update pill visual
  const isSelected = !!_fbSelections[value];
  el.style.background = isSelected ? 'var(--accent)' : 'var(--bg-input)';
  el.style.color = isSelected ? '#fff' : 'var(--text)';
  el.style.borderColor = isSelected ? 'var(--accent)' : 'var(--border)';

  // Update count in back button
  const count = Object.keys(_fbSelections).length;
  const backBtn = $('#fb-back-btn');
  if (backBtn) {
    backBtn.textContent = count > 0
      ? '← Apply ' + count + ' selection' + (count > 1 ? 's' : '')
      : '← Back to Jobs';
  }
}
window._toggleFbItem = _toggleFbItem;

// Back button — inject pills and return to Jobs
if ($('#fb-back-btn')) {
  $('#fb-back-btn').addEventListener('click', function() {
    const selected = Object.keys(_fbSelections);

    if (selected.length > 0 && _fbConfig) {
      const isExclude = _fbConfig.mode === 'exclude';
      const targetName = isExclude && _fbConfig.pillNotTarget
        ? _fbConfig.pillNotTarget
        : _fbConfig.pillTarget;
      const target = window[targetName];

      if (Array.isArray(target)) {
        selected.forEach(function(val) {
          // Avoid duplicates
          if (!target.find(p => (p.values || [])[0]?.toLowerCase() === val.toLowerCase())) {
            target.push({ values: [val], source: 'browser' });
          }
        });
        if (typeof renderAllPills === 'function') renderAllPills();
        if (typeof invalidateCache === 'function') invalidateCache();
        if (typeof searchJobs === 'function') searchJobs(0);
      }
    }

    // Navigate back to Jobs
    $$('.page').forEach(p => p.classList.remove('active'));
    $('#page-jobs').classList.add('active');
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === 'jobs'));
  });
}

// Search handler
if ($('#fb-search')) {
  $('#fb-search').addEventListener('input', function() {
    clearTimeout(_fbSearchTimeout);
    _fbSearchTimeout = setTimeout(renderFilterBrowserList, 150);
  });
}

// Wire Browse buttons to openFilterBrowser
if ($('#browse-what-btn'))     $('#browse-what-btn').addEventListener('click', () => openFilterBrowser('title', 'include'));
if ($('#browse-what-not-btn')) $('#browse-what-not-btn').addEventListener('click', () => openFilterBrowser('title', 'exclude'));
if ($('#browse-skills-btn'))   $('#browse-skills-btn').addEventListener('click', () => openFilterBrowser('skill', 'include'));
if ($('#browse-dept-btn'))     $('#browse-dept-btn').addEventListener('click', () => openFilterBrowser('dept', 'include'));
if ($('#browse-level-btn'))    $('#browse-level-btn').addEventListener('click', () => openFilterBrowser('level', 'include'));
if ($('#browse-jd-btn'))       $('#browse-jd-btn').addEventListener('click', () => openFilterBrowser('jd_keyword', 'include'));

// Export for SPA bridge
window.openFilterBrowser = openFilterBrowser;
