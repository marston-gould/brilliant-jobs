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
  } catch (e) { console.warn('[BJ] Load collections failed:', e); }
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

// Browse icons
$('#browse-who-btn').addEventListener('click', () => openCompanyBrowser('include'));
$('#browse-who-not-btn').addEventListener('click', () => openCompanyBrowser('exclude'));
if ($('#browse-tuning-co-btn')) $('#browse-tuning-co-btn').addEventListener('click', () => openCompanyBrowser('exclude', 'tuning'));

// ---- Location Browser ----
let lbAllLocations = [];
let lbMode = 'all';

async function openLocationBrowser() {
  $$('.page').forEach(p => p.classList.remove('active'));
  $('#page-location-browser').classList.add('active');
  $$('.nav-item').forEach(n => n.classList.remove('active'));
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

    // Load ref_city_radius
    try {
      let offset = 0;
      while (true) {
        const { data, error } = await sb.from('ref_city_radius').select('city, state, type').range(offset, offset + 999);
        if (error) { console.warn('[BJ] ref_city_radius error:', error.message); break; }
        if (!data || data.length === 0) break;
        data.forEach(r => {
          const display = r.type === 'metro' ? r.city : `${r.city}, ${r.state}`;
          locations.push({ display, type: r.type === 'metro' ? 'metro' : 'city', sortKey: display.toLowerCase() });
        });
        if (data.length < 1000) break;
        offset += 1000;
      }
    } catch (e) { console.warn('[BJ] ref_city_radius load failed:', e); }

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

  try {
    // Load all companies from ats_companies (batched since >1800)
    let allData = [];
    let offset = 0;
    const batchSize = 1000;
    while (true) {
      const { data, error } = await sb.from('ats_companies')
        .select('slug, name, job_count, source')
        .order('name')
        .range(offset, offset + batchSize - 1);
      if (error) { console.warn('[BJ] Load companies error:', error.message); break; }
      if (!data || data.length === 0) break;
      allData = allData.concat(data);
      if (data.length < batchSize) break;
      offset += batchSize;
    }

    cbAllCompanies = allData.map(c => ({
      slug: c.slug,
      name: c.name || c.slug,
      jobs: c.job_count || 0,
      source: c.source || 'greenhouse'
    })).sort((a, b) => a.name.localeCompare(b.name));

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
          renderAlphaNav2(letter);
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

